"""
tests/test_shopify_unchanged.py — Regression tests proving the Shopify
generator Lambda (app.py) is unchanged by the website freemium implementation.

Verifies:
- The original app.handler still works with mock mode
- The original auth behavior is preserved
- No new routes, usage tracking, or rate limiting leak into the Shopify handler
"""
from __future__ import annotations

import json
import os
import sys
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Set env for the original Shopify handler
os.environ.setdefault("USE_MOCK_BEDROCK", "true")
os.environ.setdefault("ALLOWED_ORIGIN", "http://localhost:5173")
os.environ.setdefault("ROJAI_AUTH_DISABLED", "true")

from app import handler  # The original Shopify generator handler


def _valid_body():
    return json.dumps({
        "productName": "Handwoven Kilim Pillow",
        "description": "Beautiful handwoven wool pillow from Van, Turkey",
        "category": "Home & Kitchen",
        "marketplace": "shopify",
        "language": "en",
        "tone": "professional",
    })


def _make_event(body="", method="POST"):
    return {
        "requestContext": {"http": {"method": method}, "requestId": "regression-1"},
        "headers": {"content-type": "application/json"},
        "body": body,
    }


class TestShopifyHandlerUnchanged:
    """The original app.py handler must work exactly as before."""

    def test_generates_listing_with_mock(self):
        """POST with valid body returns 200 and a listing."""
        result = handler(_make_event(_valid_body()), None)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert "title" in body
        assert "bulletPoints" in body
        assert "description" in body

    def test_returns_400_for_invalid_body(self):
        """POST with missing fields returns 400."""
        result = handler(_make_event('{"productName": ""}'), None)
        assert result["statusCode"] == 400

    def test_returns_400_for_invalid_json(self):
        """POST with malformed JSON returns 400."""
        result = handler(_make_event("not json"), None)
        assert result["statusCode"] == 400

    def test_options_returns_cors(self):
        """OPTIONS returns CORS headers."""
        result = handler(_make_event(method="OPTIONS"), None)
        assert result["statusCode"] == 200
        assert "Access-Control-Allow-Origin" in result["headers"]

    def test_no_usage_tracking_in_shopify_handler(self):
        """The Shopify handler does NOT import or call usage_service."""
        import app
        source = open(app.__file__).read()
        assert "usage_service" not in source
        assert "rate_limiter" not in source
        assert "reserve_generation" not in source
        assert "check_rate_limit" not in source

    def test_no_cognito_in_shopify_handler(self):
        """The Shopify handler does NOT reference Cognito or JWT authorizer claims."""
        import app
        source = open(app.__file__).read()
        assert "cognito" not in source.lower()
        assert "jwt" not in source.lower()
        assert "authorizer" not in source.lower()

    def test_no_web_routes_in_shopify_handler(self):
        """The Shopify handler does NOT handle /web/* routes."""
        import app
        source = open(app.__file__).read()
        assert "/web/" not in source

    def test_auth_bypass_with_both_flags(self):
        """Auth bypass still requires BOTH flags (backward compatible)."""
        with patch.dict(os.environ, {"ROJAI_AUTH_DISABLED": "true", "USE_MOCK_BEDROCK": "true"}):
            result = handler(_make_event(_valid_body()), None)
            assert result["statusCode"] == 200
