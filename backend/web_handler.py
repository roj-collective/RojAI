"""
web_handler.py — AWS Lambda handler for the standalone RojAI website.

Completely isolated from the Shopify Agent's generator Lambda (app.py).
This handler serves the Amplify-hosted website with:
  - Cognito JWT authentication (user identity from API Gateway authorizer)
  - Per-user usage tracking and enforcement (DynamoDB)
  - Rate limiting
  - Idempotency protection
  - Emergency generation switch

Routes:
  POST /web/generate-listing  — Generate a listing (authenticated, usage-tracked)
  GET  /web/usage             — Return user's current usage info

Environment variables:
  USE_MOCK_BEDROCK            "true" | "false"
  BEDROCK_MODEL_ID            string — Model for website users
  BEDROCK_MAX_OUTPUT_TOKENS   string — Max tokens
  ALLOWED_ORIGIN              string — CORS origins (comma-separated)
  USAGE_TABLE_NAME            string — DynamoDB usage table
  REQUESTS_TABLE_NAME         string — DynamoDB requests table
  RATE_LIMITS_TABLE_NAME      string — DynamoDB rate limits table
  FREE_MONTHLY_LIMIT          string — Monthly limit for free users
  FREE_REGENERATION_LIMIT     string — Regen limit per listing
  RATE_LIMIT_PER_MINUTE       string — Max requests per user per minute
  GENERATION_ENABLED          "true"|"false" — Emergency switch
"""
from __future__ import annotations

import dataclasses
import json
import logging
import os
import time
import uuid
from typing import Any

from bedrock_service import BedrockError, generate_bedrock_listing
from mock_service import generate_mock_listing
from rate_limiter import RateLimitExceeded, check_rate_limit
from usage_service import (
    ActiveReservation,
    DuplicateRequest,
    RegenerationLimitExceeded,
    UsageLimitExceeded,
    check_idempotency,
    complete_generation,
    get_usage,
    release_generation,
    reserve_generation,
)
from validator import build_request, validate_request

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """AWS Lambda entry point for the website backend."""
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

    # Route: GET /web/usage
    if method == "GET" and path.rstrip("/") == "/web/usage":
        return _handle_usage(event, origin)

    # Route: POST /web/generate-listing
    if method == "POST" and path.rstrip("/") == "/web/generate-listing":
        return _handle_generate(event, context, origin)

    # Method not allowed on known routes
    if path.rstrip("/") in ("/web/generate-listing", "/web/usage"):
        return _json_response(405, {"error": f"Method '{method}' not allowed."}, origin)

    return _json_response(404, {"error": "Not found."}, origin)


# ── GET /web/usage ───────────────────────────────────────────────────────────

def _handle_usage(event: dict[str, Any], origin: str) -> dict[str, Any]:
    """Return current usage info for the authenticated user."""
    user_id = _extract_user_id(event)
    if not user_id:
        return _json_response(401, {"error": "Authentication required."}, origin)

    try:
        usage = get_usage(user_id)
    except Exception:
        logger.error("USAGE_ERROR | failed to retrieve usage")
        return _json_response(500, {"error": "Failed to retrieve usage information."}, origin)

    return _json_response(200, usage, origin)


# ── POST /web/generate-listing ───────────────────────────────────────────────

def _handle_generate(event: dict[str, Any], context: Any, origin: str) -> dict[str, Any]:
    """Generate a product listing with usage enforcement."""
    start_time = time.monotonic()
    request_id = (
        event.get("requestContext", {}).get("requestId", "")
        or (context.aws_request_id if context else "local")
    )

    # ── Emergency switch ─────────────────────────────────────────────────
    if not _is_generation_enabled():
        return _json_response(
            403,
            {"error": "AI generation is temporarily disabled. Please try again later."},
            origin,
        )

    # ── Authentication (Cognito JWT via API Gateway authorizer) ───────────
    user_id = _extract_user_id(event)
    if not user_id:
        return _json_response(401, {"error": "Authentication required."}, origin)

    # ── Parse body ───────────────────────────────────────────────────────
    raw_body = event.get("body") or ""
    if isinstance(raw_body, bytes):
        raw_body = raw_body.decode("utf-8")

    try:
        body: dict[str, Any] = json.loads(raw_body) if raw_body.strip() else {}
    except json.JSONDecodeError:
        return _json_response(400, {"error": "Request body is not valid JSON."}, origin)

    # ── Validate ─────────────────────────────────────────────────────────
    errors = validate_request(body)
    if errors:
        return _json_response(400, {"error": errors[0] if len(errors) == 1 else errors}, origin)

    req = build_request(body)

    # ── Rate limiting ────────────────────────────────────────────────────
    try:
        check_rate_limit(user_id)
    except RateLimitExceeded as exc:
        return _json_response(
            429,
            {"error": str(exc), "retryAfter": exc.retry_after_seconds},
            origin,
        )

    # ── Usage reservation ────────────────────────────────────────────────
    idempotency_key = body.get("idempotencyKey") or str(uuid.uuid4())
    listing_key = body.get("listingKey")

    try:
        reserve_generation(user_id, idempotency_key, listing_key)
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
        # Return cached response if available
        status, item = check_idempotency(user_id, idempotency_key)
        if status == "completed" and item and item.get("cachedResponse"):
            return _json_response(200, item["cachedResponse"], origin)
        return _json_response(409, {"error": "This request has already been processed."}, origin)
    except ActiveReservation:
        return _json_response(
            409,
            {"error": "This request is currently being processed. Please retry shortly.", "retryable": True},
            origin,
        )

    # ── Dispatch to Bedrock ──────────────────────────────────────────────
    use_mock = _resolve_mock_mode()

    try:
        if use_mock:
            listing = generate_mock_listing(req)
        else:
            listing = generate_bedrock_listing(req)
    except BedrockError as exc:
        release_generation(user_id, idempotency_key)
        logger.error("BEDROCK_ERROR | request_id=%s", request_id)
        duration = time.monotonic() - start_time
        logger.info("WEB_REQUEST | request_id=%s | status=502 | duration=%.3fs", request_id, duration)
        return _json_response(502, {"error": "AI generation failed. Please try again."}, origin)
    except Exception:
        release_generation(user_id, idempotency_key)
        logger.exception("UNEXPECTED_ERROR | request_id=%s", request_id)
        duration = time.monotonic() - start_time
        logger.info("WEB_REQUEST | request_id=%s | status=500 | duration=%.3fs", request_id, duration)
        return _json_response(500, {"error": "An unexpected error occurred."}, origin)

    # ── Success ──────────────────────────────────────────────────────────
    serialized = _serialise(listing)
    complete_generation(user_id, idempotency_key, cached_response=serialized)

    duration = time.monotonic() - start_time
    logger.info("WEB_REQUEST | request_id=%s | status=200 | duration=%.3fs | marketplace=%s",
                request_id, duration, req.marketplace)
    return _json_response(200, serialized, origin)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _extract_user_id(event: dict[str, Any]) -> str | None:
    """Extract user ID from API Gateway JWT authorizer claims (sub)."""
    try:
        claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
        user_id = claims.get("sub", "").strip()
        return user_id if user_id else None
    except (KeyError, TypeError, AttributeError):
        return None


def _is_generation_enabled() -> bool:
    raw = os.environ.get("GENERATION_ENABLED", "true").strip().lower()
    return raw != "false"


def _resolve_mock_mode() -> bool:
    raw = os.environ.get("USE_MOCK_BEDROCK", "").strip().lower()
    if raw == "true":
        return True
    if raw == "false":
        return False
    return True


def _get_allowed_origins() -> list[str]:
    raw = os.environ.get("ALLOWED_ORIGIN", "http://localhost:5173")
    return [o.strip() for o in raw.split(",") if o.strip()]


def _get_request_origin(event: dict[str, Any]) -> str:
    headers = event.get("headers") or {}
    return headers.get("origin", headers.get("Origin", ""))


def _resolve_allowed_origin(request_origin: str) -> str:
    allowed = _get_allowed_origins()
    if request_origin and request_origin in allowed:
        return request_origin
    return allowed[0] if allowed else "http://localhost:5173"


def _serialise(obj: Any) -> Any:
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
