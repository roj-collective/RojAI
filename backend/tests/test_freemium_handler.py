"""
tests/test_freemium_handler.py — Integration tests for the freemium handler logic.

Tests the updated app.py with:
- Cognito JWT user extraction
- Emergency switch (GENERATION_ENABLED=false)
- Usage limit enforcement via handler
- Rate limit enforcement via handler
- Idempotency handling
- Legacy API key auth still works
- GET /usage route
"""
from __future__ import annotations

import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Set env before importing handler
os.environ["USE_MOCK_BEDROCK"] = "true"
os.environ["ALLOWED_ORIGIN"] = "http://localhost:5173"
os.environ["ROJAI_AUTH_DISABLED"] = "true"
os.environ["GENERATION_ENABLED"] = "true"
os.environ["FREE_MONTHLY_LIMIT"] = "5"
os.environ["FREE_REGENERATION_LIMIT"] = "1"
os.environ["RATE_LIMIT_PER_MINUTE"] = "5"

from app import handler  # noqa: E402


def _valid_body():
    return json.dumps({
        "productName": "Test Product",
        "description": "A good product description here",
        "category": "Home & Kitchen",
        "marketplace": "shopify",
        "language": "en",
        "tone": "professional",
        "idempotencyKey": "test-idem-001",
    })


def _make_cognito_event(method="POST", body="", path="/generate-listing"):
    """Build an event with Cognito JWT claims (simulating API Gateway authorizer)."""
    return {
        "requestContext": {
            "http": {"method": method, "path": path},
            "requestId": "test-req-1",
            "authorizer": {
                "jwt": {
                    "claims": {
                        "sub": "cognito-user-abc-123",
                        "email": "test@example.com",
                    }
                }
            },
        },
        "headers": {"content-type": "application/json"},
        "rawPath": path,
        "body": body,
    }


def _make_api_key_event(method="POST", body="", api_key="test-key"):
    """Build an event with legacy API key auth (no Cognito claims)."""
    return {
        "requestContext": {
            "http": {"method": method, "path": "/generate-listing"},
            "requestId": "test-req-2",
        },
        "headers": {
            "content-type": "application/json",
            "authorization": f"Bearer {api_key}",
        },
        "rawPath": "/generate-listing",
        "body": body,
    }


# ── Emergency switch ─────────────────────────────────────────────────────────


class TestEmergencySwitch:
    def test_returns_403_when_generation_disabled(self):
        with patch.dict(os.environ, {"GENERATION_ENABLED": "false"}):
            result = handler(
                _make_cognito_event(body=_valid_body()), None
            )
            assert result["statusCode"] == 403
            body = json.loads(result["body"])
            assert "disabled" in body["error"].lower()

    def test_allows_when_generation_enabled(self):
        with patch.dict(os.environ, {"GENERATION_ENABLED": "true"}):
            with patch("app.check_rate_limit"):
                with patch("app.reserve_generation", return_value={"generationCount": 1, "plan": "free", "monthlyLimit": 5, "resetDate": "2026-08-01"}):
                    with patch("app.complete_generation"):
                        result = handler(
                            _make_cognito_event(body=_valid_body()), None
                        )
                        assert result["statusCode"] == 200


# ── Cognito JWT authentication ───────────────────────────────────────────────


class TestCognitoAuth:
    def test_extracts_user_id_from_jwt_claims(self):
        with patch("app.check_rate_limit"):
            with patch("app.reserve_generation", return_value={"generationCount": 1, "plan": "free", "monthlyLimit": 5, "resetDate": "2026-08-01"}) as mock_reserve:
                with patch("app.complete_generation"):
                    result = handler(
                        _make_cognito_event(body=_valid_body()), None
                    )
                    assert result["statusCode"] == 200
                    # Verify reserve was called with the cognito sub
                    mock_reserve.assert_called_once()
                    assert mock_reserve.call_args[0][0] == "cognito-user-abc-123"

    def test_returns_401_without_auth(self):
        # No cognito claims AND no API key → 401
        event = {
            "requestContext": {
                "http": {"method": "POST", "path": "/generate-listing"},
                "requestId": "test-no-auth",
            },
            "headers": {"content-type": "application/json"},
            "rawPath": "/generate-listing",
            "body": _valid_body(),
        }
        with patch.dict(os.environ, {"ROJAI_AUTH_DISABLED": "", "ROJAI_API_KEY": "secret"}):
            result = handler(event, None)
            assert result["statusCode"] == 401


# ── Rate limiting ────────────────────────────────────────────────────────────


class TestRateLimitHandler:
    def test_returns_429_when_rate_limited(self):
        from rate_limiter import RateLimitExceeded

        with patch("app.check_rate_limit", side_effect=RateLimitExceeded(5, 30)):
            result = handler(
                _make_cognito_event(body=_valid_body()), None
            )
            assert result["statusCode"] == 429
            body = json.loads(result["body"])
            assert "retryAfter" in body


# ── Usage limit enforcement ──────────────────────────────────────────────────


class TestUsageLimitHandler:
    def test_returns_429_when_monthly_limit_reached(self):
        with patch("app.check_rate_limit"):
            with patch(
                "app.reserve_generation",
                side_effect=UsageLimitExceeded(5, 5, "2026-08-01"),
            ):
                result = handler(
                    _make_cognito_event(body=_valid_body()), None
                )
                assert result["statusCode"] == 429
                body = json.loads(result["body"])
                assert body["limitReached"] is True
                assert body["resetsAt"] == "2026-08-01"

    def test_returns_429_on_regeneration_limit(self):
        from usage_service import RegenerationLimitExceeded

        body_with_listing = json.dumps({
            "productName": "Test",
            "description": "Description",
            "category": "Home & Kitchen",
            "marketplace": "shopify",
            "language": "en",
            "tone": "professional",
            "idempotencyKey": "regen-test",
            "listingKey": "listing-xyz",
        })

        with patch("app.check_rate_limit"):
            with patch(
                "app.reserve_generation",
                side_effect=RegenerationLimitExceeded("listing-xyz", 1, 1),
            ):
                result = handler(
                    _make_cognito_event(body=body_with_listing), None
                )
                assert result["statusCode"] == 429
                body = json.loads(result["body"])
                assert body["regenerationLimitReached"] is True


# ── Idempotency ──────────────────────────────────────────────────────────────


class TestIdempotencyHandler:
    def test_returns_409_on_duplicate_request_without_cache(self):
        from usage_service import DuplicateRequest

        with patch("app.check_rate_limit"):
            with patch(
                "app.reserve_generation",
                side_effect=DuplicateRequest("dup-key"),
            ):
                with patch("app.check_idempotency", return_value=("completed", {"status": "completed"})):
                    result = handler(
                        _make_cognito_event(body=_valid_body()), None
                    )
                    assert result["statusCode"] == 409


# ── Release on Bedrock failure ───────────────────────────────────────────────


class TestReleaseOnFailure:
    def test_releases_reservation_on_bedrock_error(self):
        from bedrock_service import BedrockError

        with patch("app.check_rate_limit"):
            with patch("app.reserve_generation", return_value={"generationCount": 1, "plan": "free", "monthlyLimit": 5, "resetDate": "2026-08-01"}):
                with patch("app.generate_mock_listing", side_effect=BedrockError("fail")):
                    with patch("app.release_generation") as mock_release:
                        result = handler(
                            _make_cognito_event(body=_valid_body()), None
                        )
                        assert result["statusCode"] == 502
                        mock_release.assert_called_once_with(
                            "cognito-user-abc-123", "test-idem-001"
                        )


# ── Legacy API key auth ──────────────────────────────────────────────────────


class TestLegacyApiKey:
    def test_api_key_auth_bypasses_usage_limits(self):
        with patch.dict(os.environ, {"ROJAI_AUTH_DISABLED": "", "ROJAI_API_KEY": "my-key"}):
            with patch("app.check_rate_limit") as mock_rate:
                with patch("app.reserve_generation") as mock_reserve:
                    result = handler(
                        _make_api_key_event(body=_valid_body(), api_key="my-key"),
                        None,
                    )
                    assert result["statusCode"] == 200
                    # Rate limit and usage should NOT be called for API key users
                    mock_rate.assert_not_called()
                    mock_reserve.assert_not_called()


# ── GET /usage route ─────────────────────────────────────────────────────────


class TestUsageRoute:
    def test_returns_usage_for_authenticated_user(self):
        with patch("app.get_usage", return_value={
            "plan": "free",
            "generationCount": 3,
            "monthlyLimit": 5,
            "regenerationLimit": 1,
            "resetDate": "2026-08-01",
            "month": "2026-07",
        }) as mock_get:
            event = _make_cognito_event(method="GET", path="/usage")
            result = handler(event, None)
            assert result["statusCode"] == 200
            body = json.loads(result["body"])
            assert body["plan"] == "free"
            assert body["generationCount"] == 3
            mock_get.assert_called_once_with("cognito-user-abc-123")

    def test_returns_401_without_auth(self):
        event = {
            "requestContext": {
                "http": {"method": "GET", "path": "/usage"},
                "requestId": "test-no-auth",
            },
            "headers": {},
            "rawPath": "/usage",
            "body": "",
        }
        result = handler(event, None)
        assert result["statusCode"] == 401


# ── Import needed for side_effect usage ──────────────────────────────────────
from usage_service import UsageLimitExceeded  # noqa: E402


# ── Idempotent replay of completed request ───────────────────────────────────


class TestIdempotentReplay:
    def test_returns_cached_response_for_completed_duplicate(self):
        """A completed request replayed with the same idempotency key returns the cached response (200, not 409)."""
        with patch("app.check_rate_limit"):
            with patch(
                "app.reserve_generation",
                side_effect=DuplicateRequest("replay-key"),
            ):
                with patch("app.check_idempotency", return_value=(
                    "completed",
                    {"status": "completed", "cachedResponse": {"title": "Cached Title", "bulletPoints": [], "description": "cached", "seoKeywords": [], "tags": []}},
                )) as mock_idem:
                    result = handler(
                        _make_cognito_event(body=_valid_body()), None
                    )
                    assert result["statusCode"] == 200
                    body = json.loads(result["body"])
                    assert body["title"] == "Cached Title"

    def test_returns_409_when_no_cached_response(self):
        """A completed request without a cached response returns 409."""
        with patch("app.check_rate_limit"):
            with patch(
                "app.reserve_generation",
                side_effect=DuplicateRequest("no-cache-key"),
            ):
                with patch("app.check_idempotency", return_value=(
                    "completed",
                    {"status": "completed"},
                )):
                    result = handler(
                        _make_cognito_event(body=_valid_body()), None
                    )
                    assert result["statusCode"] == 409


# ── Stale reservation reuse (no double-charge) ──────────────────────────────


class TestStaleReservationReuse:
    def test_stale_reservation_does_not_double_increment(self):
        """reserve_generation with an expired lease reuses without incrementing."""
        with patch("app.check_rate_limit"):
            with patch("app.reserve_generation", return_value={
                "generationCount": 2, "plan": "free", "monthlyLimit": 5,
                "resetDate": "2026-08-01", "reused_reservation": True,
            }) as mock_reserve:
                with patch("app.complete_generation"):
                    result = handler(
                        _make_cognito_event(body=_valid_body()), None
                    )
                    assert result["statusCode"] == 200
                    mock_reserve.assert_called_once()

    def test_active_reservation_returns_409_retryable(self):
        """An active lease (not expired) returns 409 with retryable hint."""
        from usage_service import ActiveReservation

        with patch("app.check_rate_limit"):
            with patch("app.reserve_generation", side_effect=ActiveReservation("key")):
                result = handler(
                    _make_cognito_event(body=_valid_body()), None
                )
                assert result["statusCode"] == 409
                body = json.loads(result["body"])
                assert body["retryable"] is True


# ── /internal/generate-listing API key enforcement ───────────────────────────


class TestInternalRoute:
    def test_internal_route_rejects_missing_api_key(self):
        """POST /internal/generate-listing without API key returns 401."""
        event = {
            "requestContext": {
                "http": {"method": "POST", "path": "/internal/generate-listing"},
                "requestId": "test-internal-1",
            },
            "headers": {"content-type": "application/json"},
            "rawPath": "/internal/generate-listing",
            "body": _valid_body(),
        }
        with patch.dict(os.environ, {"ROJAI_AUTH_DISABLED": "", "ROJAI_API_KEY": "real-secret"}):
            result = handler(event, None)
            assert result["statusCode"] == 401

    def test_internal_route_rejects_invalid_api_key(self):
        """POST /internal/generate-listing with wrong key returns 401."""
        event = {
            "requestContext": {
                "http": {"method": "POST", "path": "/internal/generate-listing"},
                "requestId": "test-internal-2",
            },
            "headers": {
                "content-type": "application/json",
                "authorization": "Bearer wrong-key",
            },
            "rawPath": "/internal/generate-listing",
            "body": _valid_body(),
        }
        with patch.dict(os.environ, {"ROJAI_AUTH_DISABLED": "", "ROJAI_API_KEY": "correct-key"}):
            result = handler(event, None)
            assert result["statusCode"] == 401

    def test_internal_route_accepts_valid_api_key(self):
        """POST /internal/generate-listing with correct key returns 200."""
        event = {
            "requestContext": {
                "http": {"method": "POST", "path": "/internal/generate-listing"},
                "requestId": "test-internal-3",
            },
            "headers": {
                "content-type": "application/json",
                "authorization": "Bearer valid-internal-key",
            },
            "rawPath": "/internal/generate-listing",
            "body": _valid_body(),
        }
        with patch.dict(os.environ, {"ROJAI_AUTH_DISABLED": "", "ROJAI_API_KEY": "valid-internal-key", "USE_MOCK_BEDROCK": "true"}):
            result = handler(event, None)
            assert result["statusCode"] == 200


# ── Import needed ────────────────────────────────────────────────────────────
from usage_service import DuplicateRequest  # noqa: E402
