"""
Tests for agent/recommender.py — AI recommendation generation.
"""
from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

import pytest
from agent.schemas import AuditResult, Finding, Product, Recommendation, Severity
from agent.recommender import generate_recommendation, RecommenderError
from agent.mock_bedrock_client import MockBedrockClient


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_product(**overrides) -> Product:
    defaults = {
        "product_id": "prod-test",
        "product_name": "Handwoven Kilim Pillow",
        "description": "Handwoven wool pillow from Van, Turkey",
        "category": "Home & Kitchen",
        "marketplace": "shopify",
        "brand": "RojKilim",
        "current_title": "Pillow",
        "current_bullet_points": ["Soft"],
        "current_seo_keywords": [],
        "current_tags": ["pillow"],
    }
    defaults.update(overrides)
    return Product(**defaults)


def _make_audit_result(product: Product, findings: list[Finding] | None = None) -> AuditResult:
    if findings is None:
        findings = [
            Finding(
                rule_id="title_too_short",
                field="current_title",
                severity=Severity.HIGH,
                message="Title is too short (6 chars). Aim for 50-150 characters.",
                current_value="6 characters",
                points_deducted=20,
            ),
            Finding(
                rule_id="seo_keywords_missing",
                field="current_seo_keywords",
                severity=Severity.HIGH,
                message="No SEO keywords defined.",
                current_value="0 keywords",
                points_deducted=15,
            ),
        ]
    return AuditResult(
        product_id=product.product_id,
        product_name=product.product_name,
        quality_score=45,
        max_score=100,
        findings=findings,
        needs_recommendations=True,
    )


# ── Successful recommendation ────────────────────────────────────────────────

def test_successful_recommendation_returns_dataclass():
    product = _make_product()
    audit = _make_audit_result(product)
    client = MockBedrockClient()

    result = generate_recommendation(product, audit, client)

    assert isinstance(result, Recommendation)
    assert result.product_id == "prod-test"
    assert result.product_name == "Handwoven Kilim Pillow"
    assert result.source == "bedrock"


def test_recommendation_has_all_fields():
    product = _make_product()
    audit = _make_audit_result(product)
    client = MockBedrockClient()

    result = generate_recommendation(product, audit, client)

    assert result.suggested_title and len(result.suggested_title) > 0
    assert len(result.suggested_bullet_points) == 5
    assert len(result.suggested_seo_keywords) >= 5
    assert len(result.suggested_tags) >= 5
    assert result.summary and len(result.summary) > 0


def test_client_receives_prompt_with_product_info():
    product = _make_product()
    audit = _make_audit_result(product)
    client = MockBedrockClient()

    generate_recommendation(product, audit, client)

    assert client.call_count == 1
    assert "Handwoven Kilim Pillow" in client.last_prompt
    assert "RojKilim" in client.last_prompt
    assert "shopify" in client.last_prompt
    assert "Home & Kitchen" in client.last_prompt


def test_prompt_includes_findings():
    product = _make_product()
    audit = _make_audit_result(product)
    client = MockBedrockClient()

    generate_recommendation(product, audit, client)

    assert "title_too_short" not in client.last_prompt  # rule_id not exposed
    assert "Title is too short" in client.last_prompt
    assert "HIGH" in client.last_prompt


def test_prompt_includes_quality_score():
    product = _make_product()
    audit = _make_audit_result(product)
    client = MockBedrockClient()

    generate_recommendation(product, audit, client)

    assert "45/100" in client.last_prompt


# ── Error handling: Bedrock failure ──────────────────────────────────────────

def test_bedrock_failure_raises_recommender_error():
    product = _make_product()
    audit = _make_audit_result(product)
    client = MockBedrockClient(should_fail=True, fail_with="Connection timeout")

    with pytest.raises(RecommenderError) as exc_info:
        generate_recommendation(product, audit, client)

    assert "prod-test" in str(exc_info.value)


def test_bedrock_throttling_raises_recommender_error():
    product = _make_product()
    audit = _make_audit_result(product)
    client = MockBedrockClient(should_fail=True, fail_with="Bedrock throttled the request.")

    with pytest.raises(RecommenderError) as exc_info:
        generate_recommendation(product, audit, client)

    assert "throttled" in str(exc_info.value).lower() or "prod-test" in str(exc_info.value)


# ── Error handling: invalid JSON ─────────────────────────────────────────────

def test_invalid_json_raises_recommender_error():
    product = _make_product()
    audit = _make_audit_result(product)
    client = MockBedrockClient(return_invalid_json=True)

    with pytest.raises(RecommenderError) as exc_info:
        generate_recommendation(product, audit, client)

    assert "JSON" in str(exc_info.value)


# ── Error handling: missing fields ───────────────────────────────────────────

def test_missing_fields_raises_recommender_error():
    product = _make_product()
    audit = _make_audit_result(product)
    client = MockBedrockClient(return_missing_keys=True)

    with pytest.raises(RecommenderError) as exc_info:
        generate_recommendation(product, audit, client)

    assert "missing" in str(exc_info.value).lower()


# ── Error handling: empty response ───────────────────────────────────────────

def test_empty_response_raises_recommender_error():
    product = _make_product()
    audit = _make_audit_result(product)
    client = MockBedrockClient(return_empty=True)

    with pytest.raises(RecommenderError) as exc_info:
        generate_recommendation(product, audit, client)

    assert "empty" in str(exc_info.value).lower()


# ── Error handling: no findings ──────────────────────────────────────────────

def test_no_findings_raises_recommender_error():
    product = _make_product()
    audit = _make_audit_result(product, findings=[])
    client = MockBedrockClient()

    with pytest.raises(RecommenderError) as exc_info:
        generate_recommendation(product, audit, client)

    assert "No findings" in str(exc_info.value)


# ── Deterministic vs AI separation ───────────────────────────────────────────

def test_findings_come_from_evaluator_not_recommender():
    """Ensure the recommender does NOT modify the audit findings."""
    product = _make_product()
    original_findings = [
        Finding(
            rule_id="test_rule",
            field="test_field",
            severity=Severity.MEDIUM,
            message="Test finding",
            current_value="test",
            points_deducted=10,
        ),
    ]
    audit = _make_audit_result(product, findings=original_findings)
    client = MockBedrockClient()

    result = generate_recommendation(product, audit, client)

    # Audit findings are untouched — recommendation is separate
    assert audit.findings == original_findings
    assert isinstance(result, Recommendation)
    # Recommendation has no findings attribute — it's purely generative
    assert not hasattr(result, "findings")
