"""
tests/test_app.py — Unit tests for the Lambda handler (app.py).

All tests run with USE_MOCK_BEDROCK=true by default unless explicitly testing
Bedrock behaviour, which is handled via unittest.mock.
"""
from __future__ import annotations

import json
import sys
import os

# Ensure backend root is on the path so imports resolve
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import patch, MagicMock

# Set default env before importing handler
os.environ.setdefault("USE_MOCK_BEDROCK", "true")
os.environ.setdefault("ALLOWED_ORIGIN", "http://localhost:5173")
os.environ.setdefault("ROJAI_AUTH_DISABLED", "true")

from app import handler  # noqa: E402  (must import after env is set)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_event(body: dict | str | None = None, method: str = "POST") -> dict:
    if isinstance(body, dict):
        raw = json.dumps(body)
    elif body is None:
        raw = ""
    else:
        raw = body
    return {
        "requestContext": {"http": {"method": method}},
        "headers": {"Content-Type": "application/json", "authorization": "Bearer test-key"},
        "body": raw,
    }


_VALID_BODY = {
    "productName": "Handwoven kilim pillow",
    "brand": "RojKilim",
    "description": "Handwoven wool pillow made in Van, Turkey",
    "category": "Home & Kitchen",
    "marketplace": "shopify",
    "language": "en",
    "tone": "professional",
}


def _response_body(result: dict) -> dict:
    return json.loads(result["body"])


# ── Successful mock request ───────────────────────────────────────────────────

def test_success_mock_returns_200():
    result = handler(_make_event(_VALID_BODY), None)
    assert result["statusCode"] == 200


def test_success_mock_response_shape():
    result = handler(_make_event(_VALID_BODY), None)
    body = _response_body(result)
    assert isinstance(body["title"], str) and body["title"]
    assert isinstance(body["bulletPoints"], list) and len(body["bulletPoints"]) == 5
    assert isinstance(body["description"], str) and body["description"]
    assert isinstance(body["seoKeywords"], list) and len(body["seoKeywords"]) > 0
    assert isinstance(body["tags"], list) and len(body["tags"]) > 0


def test_success_mock_metadata_source():
    result = handler(_make_event(_VALID_BODY), None)
    body = _response_body(result)
    assert body["metadata"]["source"] == "mock"
    assert body["metadata"]["marketplace"] == "shopify"
    assert body["metadata"]["language"] == "en"
    assert body["metadata"]["tone"] == "professional"


def test_success_without_optional_brand():
    body = {k: v for k, v in _VALID_BODY.items() if k != "brand"}
    result = handler(_make_event(body), None)
    assert result["statusCode"] == 200


# ── Validation errors (400) ───────────────────────────────────────────────────

def test_missing_product_name_returns_400():
    body = {**_VALID_BODY, "productName": ""}
    result = handler(_make_event(body), None)
    assert result["statusCode"] == 400
    assert "productName" in _response_body(result)["error"]


def test_missing_required_field_description():
    body = {k: v for k, v in _VALID_BODY.items() if k != "description"}
    result = handler(_make_event(body), None)
    assert result["statusCode"] == 400


def test_invalid_marketplace_returns_400():
    body = {**_VALID_BODY, "marketplace": "tiktok"}
    result = handler(_make_event(body), None)
    assert result["statusCode"] == 400
    assert "marketplace" in _response_body(result)["error"].lower()


def test_invalid_language_returns_400():
    body = {**_VALID_BODY, "language": "jp"}
    result = handler(_make_event(body), None)
    assert result["statusCode"] == 400
    assert "language" in _response_body(result)["error"].lower()


def test_invalid_tone_returns_400():
    body = {**_VALID_BODY, "tone": "aggressive"}
    result = handler(_make_event(body), None)
    assert result["statusCode"] == 400
    assert "tone" in _response_body(result)["error"].lower()


def test_malformed_json_returns_400():
    result = handler(_make_event("{not valid json}", method="POST"), None)
    assert result["statusCode"] == 400
    assert "JSON" in _response_body(result)["error"]


def test_empty_body_returns_400():
    result = handler(_make_event(None, method="POST"), None)
    assert result["statusCode"] == 400


# ── HTTP method handling ───────────────────────────────────────────────────────

def test_options_preflight_returns_200():
    result = handler(_make_event(method="OPTIONS"), None)
    assert result["statusCode"] == 200
    assert "Access-Control-Allow-Origin" in result["headers"]
    assert "Access-Control-Allow-Methods" in result["headers"]


def test_get_method_returns_405_on_generate_listing():
    """GET on /generate-listing should return 405 (method not allowed)."""
    event = _make_event(_VALID_BODY, method="GET")
    event["requestContext"]["http"]["path"] = "/generate-listing"
    event["rawPath"] = "/generate-listing"
    result = handler(event, None)
    assert result["statusCode"] == 405


def test_delete_method_returns_405_on_generate_listing():
    """DELETE on /generate-listing should return 405 (method not allowed)."""
    event = _make_event(method="DELETE")
    event["requestContext"]["http"]["path"] = "/generate-listing"
    event["rawPath"] = "/generate-listing"
    result = handler(event, None)
    assert result["statusCode"] == 405


# ── CORS headers ──────────────────────────────────────────────────────────────

def test_cors_header_present_on_success():
    result = handler(_make_event(_VALID_BODY), None)
    assert result["headers"]["Access-Control-Allow-Origin"] == "http://localhost:5173"


# ── Bedrock failure (USE_MOCK_BEDROCK=false) ──────────────────────────────────

def test_bedrock_client_error_returns_502():
    from botocore.exceptions import ClientError
    error_response = {"Error": {"Code": "AccessDeniedException", "Message": "Access denied"}}
    exc = ClientError(error_response, "InvokeModel")

    with patch.dict(os.environ, {"USE_MOCK_BEDROCK": "false", "ROJAI_API_KEY": "test-key"}):
        with patch("bedrock_service.boto3.client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.invoke_model.side_effect = exc
            mock_client_cls.return_value = mock_client

            result = handler(_make_event(_VALID_BODY), None)

    assert result["statusCode"] == 502
    body = _response_body(result)
    assert "error" in body
    # Must not expose AWS internals
    assert "AccessDeniedException" not in body["error"]
    assert "Access denied" not in body["error"]


def test_malformed_bedrock_response_returns_502():
    """Bedrock returns valid HTTP 200 but model outputs non-JSON text."""
    fake_body = MagicMock()
    fake_body.read.return_value = json.dumps({
        "content": [{"text": "Sorry, I cannot generate that right now."}]
    }).encode()

    with patch.dict(os.environ, {"USE_MOCK_BEDROCK": "false", "ROJAI_API_KEY": "test-key"}):
        with patch("bedrock_service.boto3.client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.invoke_model.return_value = {"body": fake_body}
            mock_client_cls.return_value = mock_client

            result = handler(_make_event(_VALID_BODY), None)

    assert result["statusCode"] == 502


def test_bedrock_missing_keys_returns_502():
    """Bedrock returns JSON but missing required keys."""
    fake_body = MagicMock()
    fake_body.read.return_value = json.dumps({
        "content": [{"text": json.dumps({"title": "Test"})}]  # missing bulletPoints etc.
    }).encode()

    with patch.dict(os.environ, {"USE_MOCK_BEDROCK": "false", "ROJAI_API_KEY": "test-key"}):
        with patch("bedrock_service.boto3.client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.invoke_model.return_value = {"body": fake_body}
            mock_client_cls.return_value = mock_client

            result = handler(_make_event(_VALID_BODY), None)

    assert result["statusCode"] == 502
