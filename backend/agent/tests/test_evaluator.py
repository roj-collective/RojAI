"""
Tests for agent/evaluator.py — deterministic audit rules.
"""
from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

import pytest
from agent.schemas import Product, Severity, Finding
from agent.evaluator import (
    evaluate_product,
    evaluate_all,
    RECOMMENDATION_THRESHOLD,
)
from agent.mock_store import get_all_products


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_product(**overrides) -> Product:
    """Create a product with sensible defaults, overriding specific fields."""
    defaults = {
        "product_id": "test-001",
        "product_name": "Test Product Name That Is Long Enough",
        "description": "This is a reasonably detailed product description with enough words to pass the minimum threshold for quality scoring purposes in the evaluator test suite.",
        "category": "Home & Kitchen",
        "marketplace": "shopify",
        "brand": "TestBrand",
        "current_title": "TestBrand Premium Test Product — High Quality Widget for Home & Kitchen Use",
        "current_bullet_points": [
            "First benefit-focused bullet point with adequate detail about the feature",
            "Second bullet highlighting another key product advantage for buyers",
            "Third bullet explaining materials or construction quality clearly",
            "Fourth bullet describing ease of use or convenience factor here",
            "Fifth bullet covering warranty, shipping, or satisfaction guarantee",
        ],
        "current_seo_keywords": ["test product", "home widget", "premium quality", "kitchen tool", "best widget"],
        "current_tags": ["test-product", "home-kitchen", "premium", "widget", "gift-idea"],
    }
    defaults.update(overrides)
    return Product(**defaults)


# ── Perfect product scores 100 ───────────────────────────────────────────────

def test_perfect_product_scores_100():
    product = _make_product()
    result = evaluate_product(product)
    assert result.quality_score == 100
    assert result.findings == []
    assert result.needs_recommendations is False
    assert result.passed is True


# ── Title rules ──────────────────────────────────────────────────────────────

def test_missing_title_is_critical():
    result = evaluate_product(_make_product(current_title=""))
    findings = [f for f in result.findings if f.field == "current_title"]
    assert len(findings) == 1
    assert findings[0].severity == Severity.CRITICAL
    assert findings[0].rule_id == "title_missing"
    assert result.quality_score <= 80


def test_short_title_is_high():
    result = evaluate_product(_make_product(current_title="Short title"))
    findings = [f for f in result.findings if f.field == "current_title"]
    assert len(findings) == 1
    assert findings[0].severity == Severity.HIGH
    assert findings[0].rule_id == "title_too_short"


def test_long_title_is_medium():
    long_title = "A" * 160
    result = evaluate_product(_make_product(current_title=long_title))
    findings = [f for f in result.findings if f.field == "current_title"]
    assert len(findings) == 1
    assert findings[0].severity == Severity.MEDIUM
    assert findings[0].rule_id == "title_too_long"


def test_title_at_min_boundary_passes():
    title = "A" * 50
    result = evaluate_product(_make_product(current_title=title))
    title_findings = [f for f in result.findings if f.field == "current_title"]
    assert title_findings == []


def test_title_at_max_boundary_passes():
    title = "B" * 150
    result = evaluate_product(_make_product(current_title=title))
    title_findings = [f for f in result.findings if f.field == "current_title"]
    assert title_findings == []


# ── Bullet point count rules ─────────────────────────────────────────────────

def test_no_bullets_is_critical():
    result = evaluate_product(_make_product(current_bullet_points=[]))
    findings = [f for f in result.findings if f.rule_id == "bullets_missing"]
    assert len(findings) == 1
    assert findings[0].severity == Severity.CRITICAL


def test_insufficient_bullets_is_high():
    result = evaluate_product(_make_product(current_bullet_points=["Point one", "Point two"]))
    findings = [f for f in result.findings if f.rule_id == "bullets_insufficient"]
    assert len(findings) == 1
    assert findings[0].severity == Severity.HIGH


def test_five_bullets_passes_count():
    bullets = [f"Bullet {i} with enough characters to be considered adequate" for i in range(5)]
    result = evaluate_product(_make_product(current_bullet_points=bullets))
    count_findings = [f for f in result.findings if f.rule_id in ("bullets_missing", "bullets_insufficient")]
    assert count_findings == []


# ── Bullet point quality rules ───────────────────────────────────────────────

def test_short_bullets_detected():
    bullets = ["Short", "Also short", "Tiny", "Small", "Brief"]
    result = evaluate_product(_make_product(current_bullet_points=bullets))
    findings = [f for f in result.findings if f.rule_id == "bullets_too_short"]
    assert len(findings) == 1
    assert findings[0].severity == Severity.HIGH  # >=3 short bullets


def test_two_short_bullets_is_medium():
    bullets = [
        "Short",
        "Also short",
        "Third bullet with enough detail to pass the minimum length threshold",
        "Fourth bullet with enough detail to pass the minimum length threshold",
        "Fifth bullet with enough detail to pass the minimum length threshold",
    ]
    result = evaluate_product(_make_product(current_bullet_points=bullets))
    findings = [f for f in result.findings if f.rule_id == "bullets_too_short"]
    assert len(findings) == 1
    assert findings[0].severity == Severity.MEDIUM  # <3 short bullets


# ── Description rules ────────────────────────────────────────────────────────

def test_missing_description_is_critical():
    result = evaluate_product(_make_product(description="Hi"))
    findings = [f for f in result.findings if f.field == "description"]
    assert len(findings) == 1
    assert findings[0].severity == Severity.CRITICAL


def test_short_description_is_high():
    result = evaluate_product(_make_product(description="This has only a few words here."))
    findings = [f for f in result.findings if f.field == "description"]
    assert len(findings) == 1
    assert findings[0].severity == Severity.HIGH
    assert findings[0].rule_id == "description_too_short"


def test_adequate_description_passes():
    desc = " ".join(["word"] * 25)
    result = evaluate_product(_make_product(description=desc))
    desc_findings = [f for f in result.findings if f.field == "description"]
    assert desc_findings == []


# ── SEO keywords rules ───────────────────────────────────────────────────────

def test_no_seo_keywords_is_high():
    result = evaluate_product(_make_product(current_seo_keywords=[]))
    findings = [f for f in result.findings if f.rule_id == "seo_keywords_missing"]
    assert len(findings) == 1
    assert findings[0].severity == Severity.HIGH


def test_insufficient_keywords_is_medium():
    result = evaluate_product(_make_product(current_seo_keywords=["one", "two"]))
    findings = [f for f in result.findings if f.rule_id == "seo_keywords_insufficient"]
    assert len(findings) == 1
    assert findings[0].severity == Severity.MEDIUM


def test_five_keywords_passes():
    result = evaluate_product(_make_product(current_seo_keywords=["a", "b", "c", "d", "e"]))
    kw_findings = [f for f in result.findings if "seo_keywords" in f.rule_id]
    assert kw_findings == []


# ── Tags rules ───────────────────────────────────────────────────────────────

def test_no_tags_is_high():
    result = evaluate_product(_make_product(current_tags=[]))
    findings = [f for f in result.findings if f.rule_id == "tags_missing"]
    assert len(findings) == 1
    assert findings[0].severity == Severity.HIGH


def test_insufficient_tags_is_medium():
    result = evaluate_product(_make_product(current_tags=["one", "two"]))
    findings = [f for f in result.findings if f.rule_id == "tags_insufficient"]
    assert len(findings) == 1
    assert findings[0].severity == Severity.MEDIUM


def test_five_tags_passes():
    result = evaluate_product(_make_product(current_tags=["a", "b", "c", "d", "e"]))
    tag_findings = [f for f in result.findings if "tags" in f.rule_id]
    assert tag_findings == []


# ── Severity ranking ─────────────────────────────────────────────────────────

def test_findings_sorted_by_severity():
    """Critical findings should appear before high, medium, low."""
    product = _make_product(
        current_title="",          # critical
        current_bullet_points=[],  # critical
        current_seo_keywords=["one", "two"],  # medium
    )
    result = evaluate_product(product)
    severities = [f.severity for f in result.findings]
    expected_order = sorted(severities, key=lambda s: list(Severity).index(s))
    assert severities == expected_order


# ── Threshold logic ──────────────────────────────────────────────────────────

def test_low_score_triggers_recommendations():
    product = _make_product(
        current_title="Short",
        current_bullet_points=[],
        current_seo_keywords=[],
        current_tags=[],
        description="Brief.",
    )
    result = evaluate_product(product)
    assert result.quality_score < RECOMMENDATION_THRESHOLD
    assert result.needs_recommendations is True


def test_high_score_does_not_trigger_recommendations():
    product = _make_product()  # perfect product
    result = evaluate_product(product)
    assert result.quality_score >= RECOMMENDATION_THRESHOLD
    assert result.needs_recommendations is False


# ── evaluate_all sorts worst-first ───────────────────────────────────────────

def test_evaluate_all_sorts_by_score_ascending():
    products = [
        _make_product(product_id="good"),
        _make_product(product_id="bad", current_title="", current_bullet_points=[]),
    ]
    results = evaluate_all(products)
    assert results[0].product_id == "bad"
    assert results[-1].product_id == "good"
    assert results[0].quality_score <= results[-1].quality_score


# ── Mock store integration ───────────────────────────────────────────────────

def test_mock_store_products_produce_varied_scores():
    """Ensure the sample catalog has both passing and failing products."""
    products = get_all_products()
    results = evaluate_all(products)

    passing = [r for r in results if r.passed]
    failing = [r for r in results if not r.passed]

    assert len(passing) >= 2, "Need at least 2 passing products for realistic demo"
    assert len(failing) >= 3, "Need at least 3 failing products to demonstrate recommendations"


def test_score_always_between_0_and_100():
    """Score should never exceed bounds regardless of how bad a product is."""
    worst = _make_product(
        current_title="",
        current_bullet_points=[],
        current_seo_keywords=[],
        current_tags=[],
        description="X",
    )
    result = evaluate_product(worst)
    assert 0 <= result.quality_score <= 100
