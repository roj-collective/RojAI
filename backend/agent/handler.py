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

    body = {
        "products_scanned": result.products_scanned,
        "products_recommended": result.products_recommended,
        "successful_recommendations": result.successful_recommendations,
        "failed_recommendations": result.failed_recommendations,
        "duration_seconds": result.duration_seconds,
        "errors": result.errors,
        "started_at": result.started_at,
        "completed_at": result.completed_at,
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
    from .mock_store import get_all_products
    from .bedrock_client import NovaBedrockClient

    threshold = _get_threshold()
    model_id = _get_model_id()

    client = NovaBedrockClient(model_id=model_id)

    return DailyMerchandisingAgent(
        store=get_all_products,
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
