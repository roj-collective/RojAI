"""
agent/recommendation_store.py — DynamoDB persistence for recommendations.

Stores each recommendation as an item in the rojai-agent-recommendations table.
Schema:
  - product_id (PK): The product identifier
  - run_timestamp (SK): ISO timestamp of the agent run
  - score: Quality score at time of recommendation
  - product_title: Product name/title
  - reason: Summary of why the recommendation was generated
  - suggested_action: The AI-generated improvement summary
  - suggested_title: Recommended new title
  - suggested_bullet_points: Recommended bullet points
  - suggested_seo_keywords: Recommended SEO keywords
  - suggested_tags: Recommended tags
  - ttl: Expiration timestamp (90 days from creation)

No credentials or secrets are ever stored or logged.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

import boto3
from botocore.exceptions import ClientError

from .schemas import AgentRunResult, Recommendation, RecommendationResult

logger = logging.getLogger(__name__)

# TTL: 90 days in seconds
TTL_DAYS = 90
TTL_SECONDS = TTL_DAYS * 24 * 60 * 60


class RecommendationStoreError(Exception):
    """Raised when DynamoDB operations fail."""


def save_recommendations(run_result: AgentRunResult) -> int:
    """
    Persist all successful recommendations from a run to DynamoDB.

    Returns the number of items successfully written.
    Logs errors but does not raise — persistence failures should not
    break the agent workflow.
    """
    table_name = os.environ.get("RECOMMENDATIONS_TABLE_NAME", "")
    if not table_name:
        logger.warning("RECOMMENDATIONS_TABLE_NAME not set; skipping DynamoDB persistence.")
        return 0

    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(table_name)

    saved_count = 0
    run_timestamp = run_result.started_at

    for rec_result in run_result.recommendations:
        if not rec_result.succeeded or rec_result.recommendation is None:
            continue

        item = _build_item(rec_result, run_timestamp)

        try:
            table.put_item(Item=item)
            saved_count += 1
        except ClientError as exc:
            logger.error(
                "Failed to save recommendation for product %s: %s",
                rec_result.product_id,
                exc.response["Error"]["Message"],
            )
        except Exception as exc:
            logger.error(
                "Unexpected error saving recommendation for product %s: %s",
                rec_result.product_id,
                exc,
            )

    logger.info("Saved %d/%d recommendations to DynamoDB", saved_count, len(run_result.recommendations))
    return saved_count


def _build_item(rec_result: RecommendationResult, run_timestamp: str) -> dict[str, Any]:
    """Build a DynamoDB item from a RecommendationResult."""
    rec = rec_result.recommendation
    assert rec is not None

    ttl = int(time.time()) + TTL_SECONDS

    return {
        "product_id": rec_result.product_id,
        "run_timestamp": run_timestamp,
        "score": rec_result.score,
        "product_title": rec.product_name,
        "reason": _build_reason(rec_result.score),
        "suggested_action": rec.summary,
        "suggested_title": rec.suggested_title,
        "suggested_bullet_points": rec.suggested_bullet_points,
        "suggested_seo_keywords": rec.suggested_seo_keywords,
        "suggested_tags": rec.suggested_tags,
        "source": rec.source,
        "ttl": ttl,
    }


def _build_reason(score: int) -> str:
    """Generate a human-readable reason based on the quality score."""
    if score <= 20:
        return f"Critical quality issues (score: {score}/100) — listing is severely deficient"
    elif score <= 40:
        return f"Major quality gaps (score: {score}/100) — significant improvements needed"
    elif score <= 60:
        return f"Below threshold (score: {score}/100) — noticeable improvement opportunities"
    else:
        return f"Borderline quality (score: {score}/100) — minor improvements recommended"
