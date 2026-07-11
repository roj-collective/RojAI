"""
validator.py — Input validation for listing generation requests.

Returns a list of human-readable error strings; an empty list means valid.
Never raises; callers decide how to respond.
"""
from __future__ import annotations

from typing import Any

from schemas import (
    REQUIRED_FIELDS,
    VALID_LANGUAGES,
    VALID_MARKETPLACES,
    VALID_TONES,
    ListingRequest,
)


def validate_request(body: dict[str, Any]) -> list[str]:
    """Validate the parsed request body. Returns error messages (empty = OK)."""
    errors: list[str] = []

    # Required fields present and non-empty
    for field in REQUIRED_FIELDS:
        value = body.get(field)
        if not value or not str(value).strip():
            errors.append(f"'{field}' is required and must not be empty.")

    if errors:
        # Skip enum checks if required fields are missing — avoid confusing messages
        return errors

    # Enum validation
    marketplace = str(body["marketplace"]).strip()
    if marketplace not in VALID_MARKETPLACES:
        errors.append(
            f"Unsupported marketplace '{marketplace}'. "
            f"Allowed: {', '.join(sorted(VALID_MARKETPLACES))}."
        )

    language = str(body["language"]).strip()
    if language not in VALID_LANGUAGES:
        errors.append(
            f"Unsupported language '{language}'. "
            f"Allowed: {', '.join(sorted(VALID_LANGUAGES))}."
        )

    tone = str(body["tone"]).strip()
    if tone not in VALID_TONES:
        errors.append(
            f"Unsupported tone '{tone}'. "
            f"Allowed: {', '.join(sorted(VALID_TONES))}."
        )

    return errors


def build_request(body: dict[str, Any]) -> ListingRequest:
    """Build a validated ListingRequest from a clean body dict."""
    return ListingRequest(
        productName=str(body["productName"]).strip(),
        description=str(body["description"]).strip(),
        category=str(body["category"]).strip(),
        marketplace=str(body["marketplace"]).strip(),
        language=str(body["language"]).strip(),
        tone=str(body["tone"]).strip(),
        brand=str(body["brand"]).strip() if body.get("brand") else None,
    )
