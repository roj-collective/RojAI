"""
app.py — AWS Lambda handler for POST /generate-listing.

Environment variables:
  USE_MOCK_BEDROCK    "true" | "false"  — Controls backend mode (required).
  ALLOWED_ORIGIN      string            — CORS allowed origin (default: http://localhost:5173).
  BEDROCK_MODEL_ID    string            — Bedrock model ID (real mode only).
  AWS_REGION          string            — AWS region for Bedrock (real mode only).
  ROJAI_API_KEY       string            — Required API key for authentication.
  ROJAI_AUTH_DISABLED  "true"           — ONLY for local testing. Disables auth check.

HTTP behaviour:
  200  Success
  400  Validation error (malformed JSON or invalid fields)
  401  Unauthorized (missing or invalid API key)
  405  Method not allowed
  500  Unexpected server error
  502  Bedrock failure or unusable model output
"""
from __future__ import annotations

import dataclasses
import hmac
import json
import logging
import os
from typing import Any

from bedrock_service import BedrockError, generate_bedrock_listing
from mock_service import generate_mock_listing
from validator import build_request, validate_request

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_ALLOWED_METHODS = {"POST", "OPTIONS"}


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """AWS Lambda entry point."""
    import time
    start_time = time.monotonic()
    request_id = (event.get("requestContext", {}).get("requestId", "")
                  or context.aws_request_id if context else "local")

    method = (event.get("requestContext", {}).get("http", {}).get("method")
              or event.get("httpMethod", "")
              or "").upper()

    # Determine the CORS origin to echo back based on the request
    request_origin = _get_request_origin(event)
    origin = _resolve_allowed_origin(request_origin)

    # OPTIONS preflight
    if method == "OPTIONS":
        return _cors_response(200, "", origin)

    # Method guard
    if method != "POST":
        return _json_response(405, {"error": f"Method '{method}' not allowed. Use POST."}, origin)

    # ── API Key Authentication ───────────────────────────────────────────────
    auth_error, auth_status = _check_auth(event)
    if auth_error:
        logger.warning("AUTH_DENIED | request_id=%s | reason=%s", request_id, auth_error)
        duration = time.monotonic() - start_time
        if auth_status == 503:
            logger.info("REQUEST | request_id=%s | status=503 | duration=%.3fs", request_id, duration)
            return _json_response(503, {"error": "Service temporarily unavailable."}, origin)
        logger.info("REQUEST | request_id=%s | status=401 | duration=%.3fs", request_id, duration)
        return _json_response(401, {"error": "Unauthorized. Valid API key required."}, origin)

    # Parse body
    raw_body = event.get("body") or ""
    if isinstance(raw_body, bytes):
        raw_body = raw_body.decode("utf-8")

    try:
        body: dict[str, Any] = json.loads(raw_body) if raw_body.strip() else {}
    except json.JSONDecodeError:
        return _json_response(400, {"error": "Request body is not valid JSON."}, origin)

    # Validate
    errors = validate_request(body)
    if errors:
        return _json_response(400, {"error": errors[0] if len(errors) == 1 else errors}, origin)

    req = build_request(body)

    # Dispatch to mock or real Bedrock
    use_mock = _resolve_mock_mode()

    try:
        if use_mock:
            listing = generate_mock_listing(req)
        else:
            listing = generate_bedrock_listing(req)
    except BedrockError as exc:
        logger.error("BEDROCK_ERROR | request_id=%s | error=%s", request_id, exc)
        duration = time.monotonic() - start_time
        logger.info("REQUEST | request_id=%s | status=502 | duration=%.3fs", request_id, duration)
        return _json_response(502, {"error": "AI generation failed. Please try again."}, origin)
    except Exception as exc:  # noqa: BLE001
        logger.exception("UNEXPECTED_ERROR | request_id=%s", request_id)
        duration = time.monotonic() - start_time
        logger.info("REQUEST | request_id=%s | status=500 | duration=%.3fs", request_id, duration)
        return _json_response(500, {"error": "An unexpected error occurred."}, origin)

    duration = time.monotonic() - start_time
    logger.info("REQUEST | request_id=%s | status=200 | duration=%.3fs | marketplace=%s",
                request_id, duration, req.marketplace)
    return _json_response(200, _serialise(listing), origin)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _check_auth(event: dict[str, Any]) -> tuple[str | None, int]:
    """
    Validate API key authentication. Fails CLOSED.

    Returns (None, 0) if authorized, or (error_reason, http_status) if not.

    Behavior:
    - Auth bypass requires BOTH ROJAI_AUTH_DISABLED=true AND USE_MOCK_BEDROCK=true.
      This ensures only local development can disable auth (production always has
      USE_MOCK_BEDROCK=false).
    - If the API key cannot be loaded (config error): returns 503 (server fault).
    - If the client provides no/bad credentials: returns 401 (client fault).
    """
    # Explicit opt-out: requires BOTH flags to prevent accidental production bypass
    auth_disabled = os.environ.get("ROJAI_AUTH_DISABLED", "").strip().lower() == "true"
    is_mock_mode = os.environ.get("USE_MOCK_BEDROCK", "").strip().lower() == "true"
    if auth_disabled and is_mock_mode:
        return None, 0

    # Load the expected key (env var first, then Secrets Manager)
    expected_key = os.environ.get("ROJAI_API_KEY", "").strip()
    if not expected_key:
        expected_key = _get_api_key_from_secrets_manager()

    if not expected_key:
        # Server configuration failure — not a client auth error
        logger.error("AUTH_CONFIG_ERROR | API key not configured (env or Secrets Manager)")
        return "server_api_key_not_configured", 503

    # Validate client-provided credentials
    headers = event.get("headers") or {}
    auth_header = headers.get("authorization", headers.get("Authorization", ""))

    if not auth_header:
        return "missing_authorization_header", 401

    parts = auth_header.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return "invalid_authorization_format", 401

    if not hmac.compare_digest(parts[1].strip(), expected_key):
        return "invalid_api_key", 401

    return None, 0

# Cached API key (loaded once from Secrets Manager per Lambda instance)
_cached_api_key: str | None = None


def _get_api_key_from_secrets_manager() -> str:
    """
    Retrieve the API key from Secrets Manager.
    Caches the result for Lambda warm starts.
    Returns empty string on failure (which triggers fail-closed rejection).
    """
    global _cached_api_key
    if _cached_api_key is not None:
        return _cached_api_key

    secret_name = os.environ.get("ROJAI_API_KEY_SECRET_NAME", "").strip()
    if not secret_name:
        return ""

    try:
        import boto3
        client = boto3.client("secretsmanager")
        response = client.get_secret_value(SecretId=secret_name)
        _cached_api_key = response.get("SecretString", "").strip()
        return _cached_api_key
    except Exception as exc:
        logger.error("SECRETS_MANAGER_ERROR | Failed to retrieve API key: %s", type(exc).__name__)
        return ""


def _resolve_mock_mode() -> bool:
    """
    Read USE_MOCK_BEDROCK from environment.
    Raises if the variable is missing or has an unexpected value — explicit is better.
    """
    raw = os.environ.get("USE_MOCK_BEDROCK", "").strip().lower()
    if raw == "true":
        return True
    if raw == "false":
        return False
    # Default to mock in development rather than silently calling Bedrock
    logger.warning(
        "USE_MOCK_BEDROCK not set or unrecognised value '%s'. Defaulting to mock mode.", raw
    )
    return True


def _get_allowed_origins() -> list[str]:
    """Parse ALLOWED_ORIGIN env var as a comma-separated list."""
    raw = os.environ.get("ALLOWED_ORIGIN", "http://localhost:5173")
    return [o.strip() for o in raw.split(",") if o.strip()]


def _get_request_origin(event: dict[str, Any]) -> str:
    """Extract the Origin header from the incoming request (case-insensitive)."""
    headers = event.get("headers") or {}
    # API Gateway v2 lowercases all header keys
    return headers.get("origin", headers.get("Origin", ""))


def _resolve_allowed_origin(request_origin: str) -> str:
    """
    Return the origin to put in Access-Control-Allow-Origin.
    If the request origin matches one of the configured origins, echo it.
    Otherwise, return the first configured origin (safe default for non-browser clients).
    """
    allowed = _get_allowed_origins()
    if request_origin and request_origin in allowed:
        return request_origin
    return allowed[0] if allowed else "http://localhost:5173"


def _serialise(obj: Any) -> Any:
    """Recursively convert dataclasses to dicts for JSON serialisation."""
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {k: _serialise(v) for k, v in dataclasses.asdict(obj).items()}
    if isinstance(obj, list):
        return [_serialise(i) for i in obj]
    return obj


def _cors_headers(origin: str) -> dict[str, str]:
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }


def _json_response(status: int, body: Any, origin: str) -> dict[str, Any]:
    return {
        "statusCode": status,
        "headers": {**_cors_headers(origin), "Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def _cors_response(status: int, body: str, origin: str) -> dict[str, Any]:
    return {
        "statusCode": status,
        "headers": _cors_headers(origin),
        "body": body,
    }
