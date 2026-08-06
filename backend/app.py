"""
app.py — AWS Lambda handler for the RojAI listing generation API.

Routes:
  POST /generate-listing  — Generate a product listing (authenticated via Cognito JWT or API key)
  GET  /usage             — Return current usage info for the authenticated user

Environment variables:
  USE_MOCK_BEDROCK         "true" | "false"  — Controls backend mode.
  ALLOWED_ORIGIN           string            — CORS allowed origins (comma-separated).
  BEDROCK_MODEL_ID         string            — Bedrock model ID for paid users.
  BEDROCK_FREE_MODEL_ID    string            — Lower-cost model for free users.
  BEDROCK_MAX_OUTPUT_TOKENS string           — Max tokens for Bedrock response.
  ROJAI_API_KEY            string            — API key for server-to-server auth (Shopify app).
  ROJAI_API_KEY_SECRET_NAME string           — Secrets Manager secret name for API key.
  ROJAI_AUTH_DISABLED       "true"           — ONLY for local testing. Disables all auth.
  USAGE_TABLE_NAME         string            — DynamoDB usage table.
  REQUESTS_TABLE_NAME      string            — DynamoDB requests table.
  RATE_LIMITS_TABLE_NAME   string            — DynamoDB rate limits table.
  FREE_MONTHLY_LIMIT       string            — Monthly generation limit for free users.
  FREE_REGENERATION_LIMIT  string            — Regeneration limit per listing for free users.
  RATE_LIMIT_PER_MINUTE    string            — Max requests per user per minute.
  GENERATION_ENABLED       "true"|"false"    — Emergency switch to disable all AI generations.

HTTP behaviour:
  200  Success
  400  Validation error
  401  Unauthorized
  403  Forbidden (generation disabled)
  405  Method not allowed
  429  Rate limit exceeded
  500  Unexpected server error
  502  Bedrock failure
  503  Service unavailable (config error)
"""
from __future__ import annotations

import dataclasses
import hmac
import json
import logging
import os
import time
from typing import Any

from bedrock_service import BedrockError, generate_bedrock_listing
from mock_service import generate_mock_listing
from rate_limiter import RateLimitExceeded, check_rate_limit
from usage_service import (
    DuplicateRequest,
    RegenerationLimitExceeded,
    UsageLimitExceeded,
    complete_generation,
    get_usage,
    release_generation,
    reserve_generation,
)
from validator import build_request, validate_request

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """AWS Lambda entry point — routes to generate-listing or usage."""
    method = (
        event.get("requestContext", {}).get("http", {}).get("method")
        or event.get("httpMethod", "")
        or ""
    ).upper()
    path = (
        event.get("requestContext", {}).get("http", {}).get("path")
        or event.get("rawPath", "")
        or ""
    )

    request_origin = _get_request_origin(event)
    origin = _resolve_allowed_origin(request_origin)

    # OPTIONS preflight
    if method == "OPTIONS":
        return _cors_response(200, "", origin)

    # Route: GET /usage
    if method == "GET" and path.rstrip("/") == "/usage":
        return _handle_usage(event, context, origin)

    # Route: POST /generate-listing
    if method == "POST" and path.rstrip("/") in ("/generate-listing", "/internal/generate-listing"):
        return _handle_generate(event, context, origin)

    # Legacy: POST without path (direct Lambda invoke or old API Gateway config)
    if method == "POST" and not path:
        return _handle_generate(event, context, origin)

    # Method not allowed on a known route
    if path.rstrip("/") in ("/generate-listing", "/internal/generate-listing", "/usage"):
        return _json_response(405, {"error": f"Method '{method}' not allowed."}, origin)

    return _json_response(404, {"error": "Not found."}, origin)


# ── Route: GET /usage ────────────────────────────────────────────────────────

def _handle_usage(event: dict[str, Any], context: Any, origin: str) -> dict[str, Any]:
    """Return current usage info for the authenticated user."""
    user_id = _extract_user_id(event)
    if not user_id:
        return _json_response(401, {"error": "Authentication required."}, origin)

    try:
        usage = get_usage(user_id)
    except Exception as exc:
        logger.error("USAGE_ERROR | error_type=%s", type(exc).__name__)
        return _json_response(500, {"error": "Failed to retrieve usage information."}, origin)

    return _json_response(200, usage, origin)


# ── Route: POST /generate-listing ────────────────────────────────────────────

def _handle_generate(event: dict[str, Any], context: Any, origin: str) -> dict[str, Any]:
    """Generate a product listing with usage enforcement."""
    start_time = time.monotonic()
    request_id = (
        event.get("requestContext", {}).get("requestId", "")
        or (context.aws_request_id if context else "local")
    )

    # ── Emergency switch ─────────────────────────────────────────────────────
    if not _is_generation_enabled():
        return _json_response(
            403,
            {"error": "AI generation is temporarily disabled. Please try again later."},
            origin,
        )

    # ── Authentication ───────────────────────────────────────────────────────
    # Try Cognito JWT first (from API Gateway authorizer), fall back to API key
    user_id = _extract_user_id(event)
    auth_mode = "cognito" if user_id else None

    if not user_id:
        # Fall back to legacy API key auth (used by Shopify RojAI Agent)
        auth_error, auth_status = _check_api_key_auth(event)
        if auth_error:
            logger.warning("AUTH_DENIED | request_id=%s | reason=%s", request_id, auth_error)
            duration = time.monotonic() - start_time
            logger.info("REQUEST | request_id=%s | status=%d | duration=%.3fs", request_id, auth_status, duration)
            if auth_status == 503:
                return _json_response(503, {"error": "Service temporarily unavailable."}, origin)
            return _json_response(401, {"error": "Authentication required."}, origin)
        auth_mode = "api_key"
        # API key users (Shopify app) bypass usage limits — they have their own enforcement
        user_id = "__api_key_user__"

    # ── Parse body ───────────────────────────────────────────────────────────
    raw_body = event.get("body") or ""
    if isinstance(raw_body, bytes):
        raw_body = raw_body.decode("utf-8")

    try:
        body: dict[str, Any] = json.loads(raw_body) if raw_body.strip() else {}
    except json.JSONDecodeError:
        return _json_response(400, {"error": "Request body is not valid JSON."}, origin)

    # ── Validate ─────────────────────────────────────────────────────────────
    errors = validate_request(body)
    if errors:
        return _json_response(400, {"error": errors[0] if len(errors) == 1 else errors}, origin)

    req = build_request(body)

    # ── Usage enforcement (Cognito users only — API key users bypass) ────────
    idempotency_key = body.get("idempotencyKey", "")
    listing_key = body.get("listingKey")  # Optional: for regeneration tracking
    usage_reserved = False

    if auth_mode == "cognito":
        # Rate limiting
        try:
            check_rate_limit(user_id)
        except RateLimitExceeded as exc:
            return _json_response(
                429,
                {
                    "error": str(exc),
                    "retryAfter": exc.retry_after_seconds,
                },
                origin,
            )

        # Usage reservation (atomic check + increment)
        if not idempotency_key:
            # Generate one if client didn't provide — but they should
            import uuid
            idempotency_key = str(uuid.uuid4())

        try:
            reserve_generation(user_id, idempotency_key, listing_key)
            usage_reserved = True
        except UsageLimitExceeded as exc:
            return _json_response(
                429,
                {
                    "error": str(exc),
                    "limitReached": True,
                    "current": exc.current,
                    "limit": exc.limit,
                    "resetsAt": exc.resets_at,
                },
                origin,
            )
        except RegenerationLimitExceeded as exc:
            return _json_response(
                429,
                {
                    "error": str(exc),
                    "regenerationLimitReached": True,
                    "listingKey": exc.listing_key,
                },
                origin,
            )
        except DuplicateRequest:
            return _json_response(
                409,
                {"error": "This request has already been processed."},
                origin,
            )

    # ── Dispatch to Bedrock ──────────────────────────────────────────────────
    use_mock = _resolve_mock_mode()

    try:
        if use_mock:
            listing = generate_mock_listing(req)
        else:
            listing = generate_bedrock_listing(req)
    except BedrockError as exc:
        # Release the reserved generation — don't charge the user for failures
        if usage_reserved:
            release_generation(user_id, idempotency_key)
        logger.error("BEDROCK_ERROR | request_id=%s | error=%s", request_id, exc)
        duration = time.monotonic() - start_time
        logger.info("REQUEST | request_id=%s | status=502 | duration=%.3fs", request_id, duration)
        return _json_response(502, {"error": "AI generation failed. Please try again."}, origin)
    except Exception as exc:  # noqa: BLE001
        # Release the reserved generation on unexpected errors
        if usage_reserved:
            release_generation(user_id, idempotency_key)
        logger.exception("UNEXPECTED_ERROR | request_id=%s", request_id)
        duration = time.monotonic() - start_time
        logger.info("REQUEST | request_id=%s | status=500 | duration=%.3fs", request_id, duration)
        return _json_response(500, {"error": "An unexpected error occurred."}, origin)

    # ── Mark generation as completed ─────────────────────────────────────────
    if usage_reserved:
        complete_generation(user_id, idempotency_key)

    duration = time.monotonic() - start_time
    logger.info(
        "REQUEST | request_id=%s | status=200 | duration=%.3fs | marketplace=%s | auth=%s",
        request_id, duration, req.marketplace, auth_mode,
    )
    return _json_response(200, _serialise(listing), origin)


# ── Authentication helpers ───────────────────────────────────────────────────

def _extract_user_id(event: dict[str, Any]) -> str | None:
    """
    Extract the authenticated user ID from the API Gateway JWT authorizer claims.

    When API Gateway validates a JWT, it injects the claims into
    event.requestContext.authorizer.jwt.claims. The 'sub' claim is the
    Cognito user's unique identifier.

    Returns None if no JWT claims are present (unauthenticated or API key path).
    """
    try:
        claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
        user_id = claims.get("sub", "").strip()
        return user_id if user_id else None
    except (KeyError, TypeError, AttributeError):
        return None


def _check_api_key_auth(event: dict[str, Any]) -> tuple[str | None, int]:
    """
    Validate legacy API key authentication (used by the Shopify RojAI Agent).
    Fails CLOSED.

    Returns (None, 0) if authorized, or (error_reason, http_status) if not.
    """
    # Explicit opt-out: requires BOTH flags to prevent accidental production bypass
    auth_disabled = os.environ.get("ROJAI_AUTH_DISABLED", "").strip().lower() == "true"
    is_mock_mode = os.environ.get("USE_MOCK_BEDROCK", "").strip().lower() == "true"
    if auth_disabled and is_mock_mode:
        return None, 0

    # Load the expected key
    expected_key = os.environ.get("ROJAI_API_KEY", "").strip()
    if not expected_key:
        expected_key = _get_api_key_from_secrets_manager()

    if not expected_key:
        logger.error("AUTH_CONFIG_ERROR | API key not configured (env or Secrets Manager)")
        return "server_api_key_not_configured", 503

    # Validate client credentials
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


# ── Emergency switch ─────────────────────────────────────────────────────────

def _is_generation_enabled() -> bool:
    """Check the GENERATION_ENABLED switch. Defaults to True if not set."""
    raw = os.environ.get("GENERATION_ENABLED", "true").strip().lower()
    return raw != "false"


# ── Cached secrets ───────────────────────────────────────────────────────────

_cached_api_key: str | None = None


def _get_api_key_from_secrets_manager() -> str:
    """Retrieve the API key from Secrets Manager. Cached per Lambda instance."""
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


# ── Utility helpers ──────────────────────────────────────────────────────────

def _resolve_mock_mode() -> bool:
    """Read USE_MOCK_BEDROCK from environment."""
    raw = os.environ.get("USE_MOCK_BEDROCK", "").strip().lower()
    if raw == "true":
        return True
    if raw == "false":
        return False
    logger.warning("USE_MOCK_BEDROCK not set or unrecognised value '%s'. Defaulting to mock mode.", raw)
    return True


def _get_allowed_origins() -> list[str]:
    """Parse ALLOWED_ORIGIN env var as a comma-separated list."""
    raw = os.environ.get("ALLOWED_ORIGIN", "http://localhost:5173")
    return [o.strip() for o in raw.split(",") if o.strip()]


def _get_request_origin(event: dict[str, Any]) -> str:
    """Extract the Origin header from the incoming request."""
    headers = event.get("headers") or {}
    return headers.get("origin", headers.get("Origin", ""))


def _resolve_allowed_origin(request_origin: str) -> str:
    """Return the origin for Access-Control-Allow-Origin header."""
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
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
