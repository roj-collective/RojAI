"""
agent/orchestrator.py — Agent orchestration layer.

Ties the evaluator and recommender into a complete audit-and-recommend cycle.
Pure domain logic — no AWS infrastructure knowledge (no Lambda, EventBridge,
DynamoDB, SES, or Shopify).

Dependencies are injected via protocols/callables so the orchestrator can be
tested in isolation and wired to real or mock implementations at the edges.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Callable, Protocol

from .schemas import (
    AgentRunResult,
    AuditResult,
    Product,
    Recommendation,
    RecommendationResult,
)
from .recommender import BedrockClient, RecommenderError, generate_recommendation

logger = logging.getLogger(__name__)

# Default quality threshold — products scoring below this get AI recommendations
DEFAULT_QUALITY_THRESHOLD = 80


# ── Store Protocol ───────────────────────────────────────────────────────────

class StoreProvider(Protocol):
    """Interface for loading products. Any callable returning a product list works."""

    def __call__(self) -> list[Product]:
        ...


# ── Evaluator Protocol ───────────────────────────────────────────────────────

class EvaluatorFn(Protocol):
    """Interface for the product evaluator function."""

    def __call__(self, product: Product) -> AuditResult:
        ...


# ── Orchestrator ─────────────────────────────────────────────────────────────

class DailyMerchandisingAgent:
    """
    Orchestrates a full audit-and-recommend cycle.

    1. Load all products from the store.
    2. Evaluate each product deterministically.
    3. For products below the quality threshold, generate AI recommendations.
    4. Continue processing if individual recommendations fail.
    5. Return a complete AgentRunResult with statistics and errors.
    """

    def __init__(
        self,
        store: StoreProvider,
        evaluator: EvaluatorFn,
        bedrock_client: BedrockClient,
        quality_threshold: int = DEFAULT_QUALITY_THRESHOLD,
    ):
        self._store = store
        self._evaluator = evaluator
        self._bedrock_client = bedrock_client
        self._quality_threshold = quality_threshold

    def run(self) -> AgentRunResult:
        """Execute one complete agent run. Never raises — failures are captured."""
        started_at = datetime.now(timezone.utc)
        start_time = time.monotonic()

        # 1. Load products
        products = self._store()
        if not products:
            return self._build_result(
                started_at=started_at,
                start_time=start_time,
                products_scanned=0,
                recommendations=[],
                errors=[],
            )

        # 2. Evaluate all products
        audit_results: list[tuple[Product, AuditResult]] = []
        for product in products:
            audit = self._evaluator(product)
            audit_results.append((product, audit))

        # 3. Sort by quality score (worst first) for prioritised processing
        audit_results.sort(key=lambda pair: pair[1].quality_score)

        # 4. Generate recommendations for products below threshold
        recommendations: list[RecommendationResult] = []
        errors: list[str] = []

        for product, audit in audit_results:
            if audit.quality_score >= self._quality_threshold:
                continue  # Product is fine — no recommendation needed

            try:
                rec = generate_recommendation(product, audit, self._bedrock_client)
                recommendations.append(
                    RecommendationResult(
                        product_id=product.product_id,
                        score=audit.quality_score,
                        recommendation=rec,
                    )
                )
            except RecommenderError as exc:
                error_msg = f"Failed to generate recommendation for {product.product_id}: {exc}"
                logger.warning(error_msg)
                errors.append(error_msg)
                recommendations.append(
                    RecommendationResult(
                        product_id=product.product_id,
                        score=audit.quality_score,
                        error=str(exc),
                    )
                )

        return self._build_result(
            started_at=started_at,
            start_time=start_time,
            products_scanned=len(products),
            recommendations=recommendations,
            errors=errors,
        )

    def _build_result(
        self,
        started_at: datetime,
        start_time: float,
        products_scanned: int,
        recommendations: list[RecommendationResult],
        errors: list[str],
    ) -> AgentRunResult:
        completed_at = datetime.now(timezone.utc)
        duration = time.monotonic() - start_time

        successful = sum(1 for r in recommendations if r.succeeded)
        failed = sum(1 for r in recommendations if not r.succeeded)

        return AgentRunResult(
            started_at=started_at.isoformat(),
            completed_at=completed_at.isoformat(),
            duration_seconds=round(duration, 3),
            products_scanned=products_scanned,
            products_recommended=len(recommendations),
            successful_recommendations=successful,
            failed_recommendations=failed,
            recommendations=recommendations,
            errors=errors,
        )
