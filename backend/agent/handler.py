"""
agent/handler.py — Lambda entry point for the RojAI Merchandising Agent.

Instantiates all dependencies and runs DailyMerchandisingAgent.
Configuration is read from environment variables.

This handler is designed for invocation by EventBridge Scheduler or
a manual POST /agent/trigger endpoint.

No DynamoDB, SES, EventBridge, or Shopify logic lives here — those belong
in later phases.
"""
from __future__ import annotations

import dataclasses
import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """AWS Lambda entry point."""
    logger.info("RojAI Agent: run started")

    try:
        agent = _create_agent()
    except ConfigurationError as exc:
        logger.error("Agent configuration error: %s", exc)
        return _error_response(500, f"Configuration error: {exc}")
    except Exception as exc:
        logger.exception("Unexpected error creating agent.")
        return _error_response(500, "Failed to initialise agent.")

    try:
        result = agent.run()
    except Exception as exc:
        logger.exception("Unexpected error during agent run.")
        return _error_response(500, "Agent run failed unexpectedly.")

    logger.info(
        "RojAI Agent: run completed — scanned=%d recommended=%d succeeded=%d failed=%d duration=%.2fs",
        result.products_scanned,
        result.products_recommended,
        result.successful_recommendations,
        result.failed_recommendations,
        result.duration_seconds,
    )

    # ── Log individual recommendations to CloudWatch ─────────────────────────
    _log_recommendations(result)

    # ── Persist recommendations to DynamoDB ──────────────────────────────────
    saved_count = _save_to_dynamodb(result)

    # ── Build response with full recommendation details ──────────────────────
    recommendations_detail = _serialize_recommendations(result)

    body = {
        "products_scanned": result.products_scanned,
        "products_recommended": result.products_recommended,
        "successful_recommendations": result.successful_recommendations,
        "failed_recommendations": result.failed_recommendations,
        "duration_seconds": result.duration_seconds,
        "errors": result.errors,
        "started_at": result.started_at,
        "completed_at": result.completed_at,
        "recommendations_saved_to_dynamodb": saved_count,
        "recommendations": recommendations_detail,
    }

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


# ── Configuration ────────────────────────────────────────────────────────────

class ConfigurationError(Exception):
    """Raised when required environment configuration is invalid."""


def _get_threshold() -> int:
    """Read quality threshold from env; default 80."""
    raw = os.environ.get("AGENT_QUALITY_THRESHOLD", "80").strip()
    try:
        value = int(raw)
    except ValueError:
        raise ConfigurationError(
            f"AGENT_QUALITY_THRESHOLD must be an integer, got '{raw}'."
        )
    if not 0 <= value <= 100:
        raise ConfigurationError(
            f"AGENT_QUALITY_THRESHOLD must be 0-100, got {value}."
        )
    return value


def _get_model_id() -> str:
    """Read Bedrock model ID from env; require it to be set."""
    model_id = os.environ.get("BEDROCK_MODEL_ID", "").strip()
    if not model_id:
        raise ConfigurationError(
            "BEDROCK_MODEL_ID environment variable is required."
        )
    return model_id


def _get_store_provider():
    """
    Select the store provider based on STORE_PROVIDER env var.

    Values:
      - "shopify" (default): Fetch products from the Shopify Admin API.
      - "mock": Use the built-in mock product catalog.
    """
    provider = os.environ.get("STORE_PROVIDER", "mock").strip().lower()

    if provider == "shopify":
        from .shopify_store import get_all_products as shopify_get_all_products
        return shopify_get_all_products
    elif provider == "mock":
        from .mock_store import get_all_products as mock_get_all_products
        return mock_get_all_products
    else:
        raise ConfigurationError(
            f"Unknown STORE_PROVIDER '{provider}'. Use 'shopify' or 'mock'."
        )


# ── Factory ──────────────────────────────────────────────────────────────────

# This factory function is the DI seam — tests override it to avoid AWS calls.
_agent_factory = None


def _create_agent():
    """
    Create the DailyMerchandisingAgent with real dependencies.

    Uses _agent_factory if set (for testing); otherwise builds with real deps.
    """
    if _agent_factory is not None:
        return _agent_factory()

    # Import here to avoid circular imports and keep handler module lightweight
    from .orchestrator import DailyMerchandisingAgent
    from .evaluator import evaluate_product
    from .bedrock_client import NovaBedrockClient

    threshold = _get_threshold()
    model_id = _get_model_id()
    store_fn = _get_store_provider()

    client = NovaBedrockClient(model_id=model_id)

    return DailyMerchandisingAgent(
        store=store_fn,
        evaluator=evaluate_product,
        bedrock_client=client,
        quality_threshold=threshold,
    )


def set_agent_factory(factory) -> None:
    """Override the agent factory for testing. Pass None to reset."""
    global _agent_factory
    _agent_factory = factory


# ── Helpers ──────────────────────────────────────────────────────────────────

def _error_response(status: int, message: str) -> dict[str, Any]:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"error": message}),
    }


def _serialize_recommendations(result) -> list[dict[str, Any]]:
    """Serialize recommendation results into response-friendly dicts."""
    details = []
    for rec_result in result.recommendations:
        item: dict[str, Any] = {
            "product_id": rec_result.product_id,
            "score": rec_result.score,
        }

        if rec_result.succeeded and rec_result.recommendation:
            rec = rec_result.recommendation
            item["product_title"] = rec.product_name
            item["reason"] = _score_reason(rec_result.score)
            item["suggested_action"] = rec.summary
            item["suggested_title"] = rec.suggested_title
            item["suggested_bullet_points"] = rec.suggested_bullet_points
            item["suggested_seo_keywords"] = rec.suggested_seo_keywords
            item["suggested_tags"] = rec.suggested_tags
        else:
            item["product_title"] = rec_result.product_id
            item["reason"] = f"Score {rec_result.score}/100 — below threshold"
            item["suggested_action"] = None
            item["error"] = rec_result.error

        details.append(item)
    return details


def _log_recommendations(result) -> None:
    """Log each recommendation to CloudWatch (no credentials logged)."""
    for rec_result in result.recommendations:
        if rec_result.succeeded and rec_result.recommendation:
            rec = rec_result.recommendation
            logger.info(
                "RECOMMENDATION | product_id=%s | title=%s | score=%d | action=%s",
                rec.product_id,
                rec.product_name,
                rec_result.score,
                rec.summary,
            )
        else:
            logger.info(
                "RECOMMENDATION_FAILED | product_id=%s | score=%d | error=%s",
                rec_result.product_id,
                rec_result.score,
                rec_result.error or "unknown",
            )


def _save_to_dynamodb(result) -> int:
    """Persist recommendations to DynamoDB. Returns count saved."""
    try:
        from .recommendation_store import save_recommendations
        return save_recommendations(result)
    except Exception as exc:
        logger.error("Failed to persist recommendations to DynamoDB: %s", exc)
        return 0


def _score_reason(score: int) -> str:
    """Generate a human-readable reason based on quality score."""
    if score <= 20:
        return f"Critical quality issues (score: {score}/100)"
    elif score <= 40:
        return f"Major quality gaps (score: {score}/100)"
    elif score <= 60:
        return f"Below threshold (score: {score}/100)"
    else:
        return f"Borderline quality (score: {score}/100)"
