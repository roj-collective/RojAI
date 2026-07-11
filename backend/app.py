"""
app.py — AWS Lambda handler for POST /generate-listing.

Environment variables:
  USE_MOCK_BEDROCK  "true" | "false"  — Controls backend mode (required).
  ALLOWED_ORIGIN    string            — CORS allowed origin (default: http://localhost:5173).
  BEDROCK_MODEL_ID  string            — Bedrock model ID (real mode only).
  AWS_REGION        string            — AWS region for Bedrock (real mode only).

HTTP behaviour:
  200  Success
  400  Validation error (malformed JSON or invalid fields)
  405  Method not allowed
  500  Unexpected server error
  502  Bedrock failure or unusable model output
"""
from __future__ import annotations

import dataclasses
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
    method = (event.get("requestContext", {}).get("http", {}).get("method")
              or event.get("httpMethod", "")
              or "").upper()

    origin = _get_allowed_origin()

    # OPTIONS preflight
    if method == "OPTIONS":
        return _cors_response(200, "", origin)

    # Method guard
    if method != "POST":
        return _json_response(405, {"error": f"Method '{method}' not allowed. Use POST."}, origin)

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
        logger.error("Bedrock error: %s", exc)
        return _json_response(502, {"error": "AI generation failed. Please try again."}, origin)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error during listing generation.")
        return _json_response(500, {"error": "An unexpected error occurred."}, origin)

    return _json_response(200, _serialise(listing), origin)


# ── Helpers ──────────────────────────────────────────────────────────────────

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


def _get_allowed_origin() -> str:
    return os.environ.get("ALLOWED_ORIGIN", "http://localhost:5173")


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
