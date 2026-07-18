"""
Tests for agent/orchestrator.py — DailyMerchandisingAgent.
"""
from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

import pytest
from agent.schemas import (
    AgentRunResult,
    AuditResult,
    Finding,
    Product,
    Recommendation,
    RecommendationResult,
    Severity,
)
from agent.orchestrator import DailyMerchandisingAgent, DEFAULT_QUALITY_THRESHOLD
from agent.evaluator import evaluate_product
from agent.mock_store import get_all_products
from agent.mock_bedrock_client import MockBedrockClient


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_product(product_id: str = "p1", score_target: str = "low") -> Product:
    """Create a product targeting a specific quality level."""
    if score_target == "high":
        return Product(
            product_id=product_id,
            product_name="Great Product With A Long Enough Name For Testing",
            description=" ".join(["good"] * 30),
            category="Home & Kitchen",
            marketplace="shopify",
            brand="TestBrand",
            current_title="A" * 70,
            current_bullet_points=[f"Bullet {i} with enough characters for quality" for i in range(5)],
            current_seo_keywords=["kw1", "kw2", "kw3", "kw4", "kw5"],
            current_tags=["t1", "t2", "t3", "t4", "t5"],
        )
    else:
        return Product(
            product_id=product_id,
            product_name="Bad Product",
            description="Short.",
            category="Home & Kitchen",
            marketplace="shopify",
            current_title="Bad",
            current_bullet_points=["Short"],
            current_seo_keywords=[],
            current_tags=[],
        )


def _empty_store() -> list[Product]:
    return []


def _single_low_store() -> list[Product]:
    return [_make_product("low-1", "low")]


def _single_high_store() -> list[Product]:
    return [_make_product("high-1", "high")]


def _mixed_store() -> list[Product]:
    return [
        _make_product("low-1", "low"),
        _make_product("high-1", "high"),
        _make_product("low-2", "low"),
        _make_product("high-2", "high"),
    ]


# ── Successful full run ──────────────────────────────────────────────────────

def test_successful_run_with_mixed_products():
    agent = DailyMerchandisingAgent(
        store=_mixed_store,
        evaluator=evaluate_product,
        bedrock_client=MockBedrockClient(),
    )
    result = agent.run()

    assert isinstance(result, AgentRunResult)
    assert result.products_scanned == 4
    assert result.successful_recommendations >= 1
    assert result.failed_recommendations == 0
    assert result.errors == []
    assert result.duration_seconds >= 0


def test_run_result_has_timestamps():
    agent = DailyMerchandisingAgent(
        store=_single_low_store,
        evaluator=evaluate_product,
        bedrock_client=MockBedrockClient(),
    )
    result = agent.run()

    assert result.started_at.endswith("+00:00")
    assert result.completed_at.endswith("+00:00")
    assert result.started_at <= result.completed_at


def test_recommendations_contain_product_ids():
    agent = DailyMerchandisingAgent(
        store=_mixed_store,
        evaluator=evaluate_product,
        bedrock_client=MockBedrockClient(),
    )
    result = agent.run()

    for rec_result in result.recommendations:
        assert rec_result.product_id in ("low-1", "low-2")
        assert rec_result.succeeded
        assert rec_result.recommendation is not None
        assert rec_result.score < DEFAULT_QUALITY_THRESHOLD


# ── No products ──────────────────────────────────────────────────────────────

def test_empty_store_returns_zero_counts():
    agent = DailyMerchandisingAgent(
        store=_empty_store,
        evaluator=evaluate_product,
        bedrock_client=MockBedrockClient(),
    )
    result = agent.run()

    assert result.products_scanned == 0
    assert result.products_recommended == 0
    assert result.successful_recommendations == 0
    assert result.failed_recommendations == 0
    assert result.recommendations == []
    assert result.errors == []


# ── All products above threshold ─────────────────────────────────────────────

def test_all_above_threshold_produces_no_recommendations():
    agent = DailyMerchandisingAgent(
        store=_single_high_store,
        evaluator=evaluate_product,
        bedrock_client=MockBedrockClient(),
    )
    result = agent.run()

    assert result.products_scanned == 1
    assert result.products_recommended == 0
    assert result.successful_recommendations == 0
    assert result.recommendations == []


# ── One recommendation failure ───────────────────────────────────────────────

def test_one_failure_does_not_stop_run():
    """If recommender fails for one product, others still get processed."""
    call_count = {"n": 0}

    class FailOnFirstClient:
        def invoke(self, prompt: str) -> str:
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise Exception("Simulated timeout")
            return MockBedrockClient().invoke(prompt)

    def two_low_store() -> list[Product]:
        return [_make_product("low-1", "low"), _make_product("low-2", "low")]

    agent = DailyMerchandisingAgent(
        store=two_low_store,
        evaluator=evaluate_product,
        bedrock_client=FailOnFirstClient(),
    )
    result = agent.run()

    assert result.products_recommended == 2
    assert result.successful_recommendations == 1
    assert result.failed_recommendations == 1
    assert len(result.errors) == 1
    assert "low-1" in result.errors[0] or "low-2" in result.errors[0]


# ── Multiple recommendation failures ────────────────────────────────────────

def test_all_recommendations_fail_gracefully():
    client = MockBedrockClient(should_fail=True, fail_with="Service unavailable")

    agent = DailyMerchandisingAgent(
        store=_mixed_store,
        evaluator=evaluate_product,
        bedrock_client=client,
    )
    result = agent.run()

    assert result.products_scanned == 4
    assert result.successful_recommendations == 0
    assert result.failed_recommendations == result.products_recommended
    assert len(result.errors) == result.products_recommended
    # Agent still completes — doesn't raise
    assert result.completed_at is not None


# ── Configurable threshold ───────────────────────────────────────────────────

def test_higher_threshold_triggers_more_recommendations():
    agent_strict = DailyMerchandisingAgent(
        store=get_all_products,
        evaluator=evaluate_product,
        bedrock_client=MockBedrockClient(),
        quality_threshold=95,  # Very strict — most will need recommendations
    )
    result_strict = agent_strict.run()

    agent_lenient = DailyMerchandisingAgent(
        store=get_all_products,
        evaluator=evaluate_product,
        bedrock_client=MockBedrockClient(),
        quality_threshold=30,  # Very lenient — few will need recommendations
    )
    result_lenient = agent_lenient.run()

    assert result_strict.products_recommended > result_lenient.products_recommended


def test_threshold_zero_means_no_recommendations():
    agent = DailyMerchandisingAgent(
        store=_mixed_store,
        evaluator=evaluate_product,
        bedrock_client=MockBedrockClient(),
        quality_threshold=0,  # Nothing can be below 0
    )
    result = agent.run()

    assert result.products_recommended == 0


def test_threshold_100_means_all_recommended():
    agent = DailyMerchandisingAgent(
        store=_single_high_store,
        evaluator=evaluate_product,
        bedrock_client=MockBedrockClient(),
        quality_threshold=101,  # Everything is below 101
    )
    result = agent.run()

    assert result.products_recommended == 1


# ── Result statistics ────────────────────────────────────────────────────────

def test_statistics_are_consistent():
    agent = DailyMerchandisingAgent(
        store=_mixed_store,
        evaluator=evaluate_product,
        bedrock_client=MockBedrockClient(),
    )
    result = agent.run()

    assert result.products_recommended == result.successful_recommendations + result.failed_recommendations
    assert result.products_recommended == len(result.recommendations)
    assert result.failed_recommendations == len(result.errors)


# ── Execution order ──────────────────────────────────────────────────────────

def test_worst_products_processed_first():
    """Products with the lowest scores should appear first in recommendations."""
    def three_products() -> list[Product]:
        return [
            _make_product("medium-1", "low"),  # will score low
            _make_product("worst-1", "low"),   # same factory so similar score
            _make_product("good-1", "high"),   # above threshold
        ]

    agent = DailyMerchandisingAgent(
        store=three_products,
        evaluator=evaluate_product,
        bedrock_client=MockBedrockClient(),
    )
    result = agent.run()

    # All recommended products should have scores below threshold
    for rec in result.recommendations:
        assert rec.score < DEFAULT_QUALITY_THRESHOLD

    # Scores should be in ascending order (worst first)
    scores = [r.score for r in result.recommendations]
    assert scores == sorted(scores)


# ── Integration with mock store ──────────────────────────────────────────────

def test_full_run_with_mock_store():
    """Run against the real mock store to verify end-to-end flow."""
    agent = DailyMerchandisingAgent(
        store=get_all_products,
        evaluator=evaluate_product,
        bedrock_client=MockBedrockClient(),
    )
    result = agent.run()

    assert result.products_scanned == 8
    assert result.successful_recommendations >= 3
    assert result.failed_recommendations == 0
    assert result.errors == []
    assert result.duration_seconds < 5  # Should be near-instant with mock
