"""
Tests for API key authentication in app.py.

Covers:
- Fail-closed behavior (missing config = reject)
- Production bypass prevention
- Correct/incorrect/missing client credentials
- Server config errors return 503 (not 401)
- Structured logs never contain secrets
"""
from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import json
import logging
import pytest
from unittest.mock import patch

from app import handler, _check_api_key_auth as _check_auth


def _make_event(method="POST", body="", headers=None):
    return {
        "requestContext": {"http": {"method": method}, "requestId": "test-req-1"},
        "headers": headers or {},
        "body": body,
    }


def _valid_body():
    return json.dumps({
        "productName": "Test Product",
        "description": "A good product description here",
        "category": "Home",
        "marketplace": "shopify",
        "language": "en",
        "tone": "professional",
    })


# ── Fail-closed behavior ────────────────────────────────────────────────────

class TestFailClosed:
    """Authentication must reject requests when no API key is configured."""

    def test_rejects_when_no_key_and_auth_not_disabled(self):
        """Missing ROJAI_API_KEY without bypass flags = 503 server error."""
        env = {"USE_MOCK_BEDROCK": "false", "ROJAI_AUTH_DISABLED": ""}
        with patch.dict(os.environ, env, clear=False):
            os.environ.pop("ROJAI_API_KEY", None)
            os.environ.pop("ROJAI_API_KEY_SECRET_NAME", None)
            os.environ.pop("ROJAI_AUTH_DISABLED", None)
            reason, status = _check_auth(_make_event(
                headers={"authorization": "Bearer somekey"}
            ))
            assert reason == "server_api_key_not_configured"
            assert status == 503

    def test_handler_returns_503_when_key_not_configured(self):
        """Handler returns 503 (not 401) for server config errors."""
        env = {"USE_MOCK_BEDROCK": "true", "ROJAI_AUTH_DISABLED": ""}
        with patch.dict(os.environ, env, clear=False):
            os.environ.pop("ROJAI_API_KEY", None)
            os.environ.pop("ROJAI_API_KEY_SECRET_NAME", None)
            os.environ.pop("ROJAI_AUTH_DISABLED", None)
            result = handler(_make_event(
                method="POST",
                body=_valid_body(),
                headers={"content-type": "application/json",
                         "authorization": "Bearer anykey"},
            ), None)
            assert result["statusCode"] == 503
            body = json.loads(result["body"])
            assert "unavailable" in body["error"].lower()


# ── Production bypass prevention ─────────────────────────────────────────────

class TestBypassPrevention:
    """ROJAI_AUTH_DISABLED alone must NOT bypass auth in production."""

    def test_auth_disabled_alone_does_not_bypass(self):
        """Setting ROJAI_AUTH_DISABLED=true without USE_MOCK_BEDROCK=true still requires auth."""
        env = {
            "ROJAI_AUTH_DISABLED": "true",
            "USE_MOCK_BEDROCK": "false",  # Production mode
            "ROJAI_API_KEY": "real-key",
        }
        with patch.dict(os.environ, env, clear=False):
            # Without correct auth header, request should be rejected
            reason, status = _check_auth(_make_event(headers={}))
            assert reason == "missing_authorization_header"
            assert status == 401

    def test_bypass_requires_both_flags(self):
        """Auth bypass requires BOTH ROJAI_AUTH_DISABLED=true AND USE_MOCK_BEDROCK=true."""
        env = {
            "ROJAI_AUTH_DISABLED": "true",
            "USE_MOCK_BEDROCK": "true",  # Local dev mode
        }
        with patch.dict(os.environ, env, clear=False):
            reason, status = _check_auth(_make_event(headers={}))
            assert reason is None
            assert status == 0

    def test_production_env_always_requires_auth(self):
        """Even with ROJAI_AUTH_DISABLED=true, production (USE_MOCK_BEDROCK=false) requires auth."""
        env = {
            "ROJAI_AUTH_DISABLED": "true",
            "USE_MOCK_BEDROCK": "false",
            "ROJAI_API_KEY": "prod-key",
        }
        with patch.dict(os.environ, env, clear=False):
            # Must provide correct key even though disabled flag is set
            reason, _ = _check_auth(_make_event(
                headers={"authorization": "Bearer wrong"}
            ))
            assert reason == "invalid_api_key"

            # Correct key works
            reason, _ = _check_auth(_make_event(
                headers={"authorization": "Bearer prod-key"}
            ))
            assert reason is None


# ── Client credential validation ─────────────────────────────────────────────

class TestClientAuth:
    """Tests for client-provided Authorization header validation."""

    def test_rejects_missing_header(self):
        with patch.dict(os.environ, {"ROJAI_API_KEY": "key1", "USE_MOCK_BEDROCK": "false"}):
            reason, status = _check_auth(_make_event(headers={}))
            assert reason == "missing_authorization_header"
            assert status == 401

    def test_rejects_non_bearer_scheme(self):
        with patch.dict(os.environ, {"ROJAI_API_KEY": "key1", "USE_MOCK_BEDROCK": "false"}):
            reason, status = _check_auth(_make_event(
                headers={"authorization": "Basic abc123"}
            ))
            assert reason == "invalid_authorization_format"
            assert status == 401

    def test_rejects_incorrect_key(self):
        with patch.dict(os.environ, {"ROJAI_API_KEY": "correct-key", "USE_MOCK_BEDROCK": "false"}):
            reason, status = _check_auth(_make_event(
                headers={"authorization": "Bearer wrong-key"}
            ))
            assert reason == "invalid_api_key"
            assert status == 401

    def test_accepts_correct_key(self):
        with patch.dict(os.environ, {"ROJAI_API_KEY": "my-secret", "USE_MOCK_BEDROCK": "false"}):
            reason, status = _check_auth(_make_event(
                headers={"authorization": "Bearer my-secret"}
            ))
            assert reason is None
            assert status == 0

    def test_bearer_prefix_is_case_insensitive(self):
        with patch.dict(os.environ, {"ROJAI_API_KEY": "key1", "USE_MOCK_BEDROCK": "false"}):
            reason, status = _check_auth(_make_event(
                headers={"authorization": "bearer key1"}
            ))
            assert reason is None


# ── Handler integration ──────────────────────────────────────────────────────

class TestHandlerIntegration:
    """Full handler tests for auth → response flow."""

    def test_returns_401_without_auth_header(self):
        env = {"ROJAI_API_KEY": "secret", "USE_MOCK_BEDROCK": "true", "ROJAI_AUTH_DISABLED": ""}
        with patch.dict(os.environ, env, clear=False):
            result = handler(_make_event(
                method="POST",
                body=_valid_body(),
                headers={"content-type": "application/json"},
            ), None)
            assert result["statusCode"] == 401

    def test_returns_200_with_valid_auth(self):
        env = {"ROJAI_API_KEY": "valid-key", "USE_MOCK_BEDROCK": "true"}
        with patch.dict(os.environ, env, clear=False):
            result = handler(_make_event(
                method="POST",
                body=_valid_body(),
                headers={
                    "content-type": "application/json",
                    "authorization": "Bearer valid-key",
                },
            ), None)
            assert result["statusCode"] == 200


# ── Structured logging safety ────────────────────────────────────────────────

class TestLoggingSafety:
    """Verify logs never contain sensitive values."""

    def test_denial_log_does_not_contain_keys(self, caplog):
        env = {"ROJAI_API_KEY": "super-secret-key", "USE_MOCK_BEDROCK": "false"}
        with patch.dict(os.environ, env, clear=False):
            with caplog.at_level(logging.WARNING):
                handler(_make_event(
                    method="POST",
                    body="{}",
                    headers={"authorization": "Bearer attacker-guess"},
                ), None)
            assert "super-secret-key" not in caplog.text
            assert "attacker-guess" not in caplog.text
            assert "AUTH_DENIED" in caplog.text

    def test_config_error_log_does_not_expose_secret_name(self, caplog):
        env = {"USE_MOCK_BEDROCK": "false"}
        with patch.dict(os.environ, env, clear=False):
            os.environ.pop("ROJAI_API_KEY", None)
            os.environ.pop("ROJAI_API_KEY_SECRET_NAME", None)
            with caplog.at_level(logging.ERROR):
                handler(_make_event(method="POST", body="{}", headers={}), None)
            assert "AUTH_CONFIG_ERROR" in caplog.text
            # Must not contain actual secret values
            assert "super-secret" not in caplog.text


# ── 503 contributes to 5xx metric ───────────────────────────────────────────

class TestMetricFilter:
    """Verify that structured log format matches CloudWatch metric filter."""

    def test_503_log_matches_filter_pattern(self, caplog):
        """The REQUEST log for config errors contains 'status=503' which matches the metric filter."""
        env = {"USE_MOCK_BEDROCK": "false"}
        with patch.dict(os.environ, env, clear=False):
            os.environ.pop("ROJAI_API_KEY", None)
            os.environ.pop("ROJAI_API_KEY_SECRET_NAME", None)
            with caplog.at_level(logging.INFO):
                handler(_make_event(
                    method="POST", body=_valid_body(),
                    headers={"content-type": "application/json",
                             "authorization": "Bearer x"},
                ), None)
            assert "status=503" in caplog.text

    def test_401_log_does_not_match_5xx_filter(self, caplog):
        """401 responses should NOT match the 5xx metric filter."""
        env = {"ROJAI_API_KEY": "key", "USE_MOCK_BEDROCK": "false"}
        with patch.dict(os.environ, env, clear=False):
            with caplog.at_level(logging.INFO):
                handler(_make_event(
                    method="POST", body=_valid_body(),
                    headers={"content-type": "application/json"},
                ), None)
            # Should have status=401, not 500/502/503
            assert "status=401" in caplog.text
            assert "status=500" not in caplog.text
            assert "status=502" not in caplog.text
            assert "status=503" not in caplog.text
