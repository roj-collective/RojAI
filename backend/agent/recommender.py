"""
agent/recommender.py — AI-powered recommendation generator.

Uses Amazon Bedrock (Nova) to generate structured improvement suggestions
for product listings that failed the quality audit.

Architecture:
- BedrockClient protocol enables dependency injection (real vs mock).
- Prompt is built from the product + its highest-priority findings.
- Response is validated against the Recommendation schema.
- Errors are handled explicitly — no silent fallback.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Protocol

from .schemas import AuditResult, Finding, Product, Recommendation

logger = logging.getLogger(__name__)


# ── Bedrock Client Protocol (DI interface) ───────────────────────────────────

class BedrockClient(Protocol):
    """Interface for invoking a Bedrock model. Implementations handle the HTTP call."""

    def invoke(self, prompt: str) -> str:
        """Send a prompt and return the raw model text output. Raises on failure."""
        ...


# ── Errors ───────────────────────────────────────────────────────────────────

class RecommenderError(Exception):
    """Raised when recommendation generation fails."""


# ── Public API ───────────────────────────────────────────────────────────────

def generate_recommendation(
    product: Product,
    audit_result: AuditResult,
    client: BedrockClient,
) -> Recommendation:
    """
    Generate an AI recommendation for a product that failed audit.

    Args:
        product: The product to improve.
        audit_result: The audit result containing findings.
        client: A BedrockClient implementation (real or mock).

    Returns:
        A validated Recommendation dataclass.

    Raises:
        RecommenderError: On any failure (timeout, bad JSON, missing fields, throttle).
    """
    if not audit_result.findings:
        raise RecommenderError(
            f"No findings for product {product.product_id}. Cannot generate recommendations."
        )

    prompt = _build_prompt(product, audit_result)

    try:
        raw_output = client.invoke(prompt)
    except Exception as exc:
        raise RecommenderError(
            f"Bedrock invocation failed for product {product.product_id}: {type(exc).__name__}"
        ) from exc

    data = _parse_response(raw_output)
    _validate_recommendation(data)

    return Recommendation(
        product_id=product.product_id,
        product_name=product.product_name,
        suggested_title=data["suggestedTitle"],
        suggested_bullet_points=data["suggestedBulletPoints"],
        suggested_seo_keywords=data["suggestedSeoKeywords"],
        suggested_tags=data["suggestedTags"],
        summary=data["summary"],
        source="bedrock",
    )


# ── Prompt Builder ───────────────────────────────────────────────────────────

def _build_prompt(product: Product, audit_result: AuditResult) -> str:
    """Build the recommendation prompt from product data and top findings."""
    # Take the top 5 most severe findings
    top_findings = audit_result.findings[:5]
    findings_text = "\n".join(
        f"  - [{f.severity.value.upper()}] {f.field}: {f.message}"
        for f in top_findings
    )

    brand_line = f"Brand: {product.brand}" if product.brand else "Brand: (not specified)"

    return f"""You are an expert ecommerce merchandising consultant.

A product listing has been audited and scored {audit_result.quality_score}/100.
Your job is to generate improved listing content that addresses the identified issues.

PRODUCT INFORMATION:
- Name: {product.product_name}
- {brand_line}
- Category: {product.category}
- Marketplace: {product.marketplace}
- Description: {product.description}
- Current Title: {product.current_title or "(empty)"}
- Current Bullet Points: {json.dumps(product.current_bullet_points) if product.current_bullet_points else "(none)"}

AUDIT FINDINGS (highest priority first):
{findings_text}

MARKETPLACE CONTEXT:
- For Shopify: Write persuasive, benefit-focused ecommerce copy.
- For Etsy: Emphasise craftsmanship, story, and handmade quality.
- For Amazon: Prioritise clarity, search keywords, and scannable benefits.

Generate improved listing content as a JSON object with EXACTLY these keys:
{{
  "suggestedTitle": "An optimised product title (50-150 characters)",
  "suggestedBulletPoints": [
    "Benefit-focused bullet 1 (40-250 chars)",
    "Benefit-focused bullet 2 (40-250 chars)",
    "Benefit-focused bullet 3 (40-250 chars)",
    "Benefit-focused bullet 4 (40-250 chars)",
    "Benefit-focused bullet 5 (40-250 chars)"
  ],
  "suggestedSeoKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "suggestedTags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "summary": "One sentence explaining the key improvements made"
}}

Rules:
- suggestedBulletPoints must be exactly 5 strings.
- suggestedSeoKeywords must be 5-8 lowercase strings.
- suggestedTags must be 5-8 lowercase hyphenated strings.
- Return ONLY the JSON object. No markdown, no commentary."""


# ── Response Parsing ─────────────────────────────────────────────────────────

_REQUIRED_KEYS = {"suggestedTitle", "suggestedBulletPoints", "suggestedSeoKeywords", "suggestedTags", "summary"}


def _parse_response(raw_output: str) -> dict:
    """Parse model output into a dict. Tries direct parse, then regex extraction."""
    if not raw_output or not raw_output.strip():
        raise RecommenderError("Bedrock returned empty output.")

    # Attempt 1: direct JSON parse
    data = _try_parse_json(raw_output.strip())

    # Attempt 2: extract JSON block from surrounding text
    if data is None:
        logger.warning("Direct JSON parse failed; attempting extraction.")
        data = _try_extract_json(raw_output)

    if data is None:
        raise RecommenderError("Model output could not be parsed as valid JSON.")

    return data


def _try_parse_json(text: str) -> dict | None:
    try:
        result = json.loads(text)
        if isinstance(result, dict):
            return result
    except (json.JSONDecodeError, ValueError):
        pass
    return None


def _try_extract_json(text: str) -> dict | None:
    """Find the first {...} block and try to parse it."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        return _try_parse_json(match.group())
    return None


def _validate_recommendation(data: dict) -> None:
    """Validate the parsed response has all required fields with correct types."""
    missing = _REQUIRED_KEYS - data.keys()
    if missing:
        raise RecommenderError(f"Model output missing required keys: {sorted(missing)}")

    if not isinstance(data["suggestedTitle"], str) or not data["suggestedTitle"].strip():
        raise RecommenderError("'suggestedTitle' must be a non-empty string.")

    if not isinstance(data["suggestedBulletPoints"], list) or len(data["suggestedBulletPoints"]) == 0:
        raise RecommenderError("'suggestedBulletPoints' must be a non-empty list.")

    if not isinstance(data["suggestedSeoKeywords"], list) or len(data["suggestedSeoKeywords"]) == 0:
        raise RecommenderError("'suggestedSeoKeywords' must be a non-empty list.")

    if not isinstance(data["suggestedTags"], list) or len(data["suggestedTags"]) == 0:
        raise RecommenderError("'suggestedTags' must be a non-empty list.")

    if not isinstance(data["summary"], str) or not data["summary"].strip():
        raise RecommenderError("'summary' must be a non-empty string.")
