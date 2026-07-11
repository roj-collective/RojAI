"""
schemas.py — Request/response types and validation constants.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

# ── Allowed enum values ──────────────────────────────────────────────────────

VALID_MARKETPLACES = {"shopify", "etsy", "amazon"}
VALID_LANGUAGES = {"en", "fr", "de", "es", "it"}
VALID_TONES = {"professional", "luxury", "friendly"}

REQUIRED_FIELDS = ("productName", "description", "category", "marketplace", "language", "tone")


# ── Request dataclass ────────────────────────────────────────────────────────

@dataclass
class ListingRequest:
    productName: str
    description: str
    category: str
    marketplace: str
    language: str
    tone: str
    brand: Optional[str] = None


# ── Response metadata ────────────────────────────────────────────────────────

@dataclass
class ResponseMetadata:
    marketplace: str
    language: str
    tone: str
    source: str  # "mock" | "bedrock"


# ── Full response ────────────────────────────────────────────────────────────

@dataclass
class ListingResponse:
    title: str
    bulletPoints: list[str]
    description: str
    seoKeywords: list[str]
    tags: list[str]
    metadata: ResponseMetadata
