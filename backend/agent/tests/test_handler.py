"""
Tests for agent/handler.py — Lambda entry point.
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

import pytest
from agent.handler import handler, set_agent_factory, ConfigurationError
from agent.orchestrator import DailyMerchandisingAgent
from agent.evaluator import evaluate_product
from agent.mock_store import get_all_products
from agent.mock_bedrock_client import MockBedrockClient
from agent.schemas import Product


# ── Fixtures / setup ─────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    """Set required env vars and reset factory for every test."""
    monkeypatch.setenv("BEDROCK_MODEL_ID", "us.amazon.nova-lite-v1:0")
    monkeypatch.setenv("AGENT_QUALITY_THRESHOLD", "80")
    set_agent_factory(None)
    yield
    set_agent_factory(None)


def _mock_agent_factory(client=None, store=None, threshold=None):
    """Create a factory that returns an agent with mock dependencies."""
    def factory():
        return DailyMerchandisingAgent(
            store=store or get_all_products,
            evaluator=evaluate_product,
            bedrock_client=client or MockBedrockClient(),
            quality_threshold=threshold or 80,
        )
    return factory


def _parse_response(result: dict) -> dict:
    return json.loads(result["body"])


# ── Successful invocation ────────────────────────────────────────────────────

def test_successful_run_returns_200():
    set_agent_factory(_mock_agent_factory())
    result = handler({}, None)
    assert result["statusCode"] == 200


def test_successful_run_body_has_required_fields():
    set_agent_factory(_mock_agent_factory())
    result = handler({}, None)
    body = _parse_response(result)

    assert "products_scanned" in body
    assert "products_recommended" in body
    assert "successful_recommendations" in body
    assert "failed_recommendations" in body
    assert "duration_seconds" in body
    assert "errors" in body
    assert "started_at" in body
    assert "completed_at" in body


def test_successful_run_scans_all_products():
    set_agent_factory(_mock_agent_factory())
    result = handler({}, None)
    body = _parse_response(result)

    assert body["products_scanned"] == 8  # mock store has 8 products


def test_successful_run_generates_recommendations():
    set_agent_factory(_mock_agent_factory())
    result = handler({}, None)
    body = _parse_response(result)

    assert body["successful_recommendations"] >= 3
    assert body["failed_recommendations"] == 0
    assert body["errors"] == []


# ── Empty store ──────────────────────────────────────────────────────────────

def test_empty_store_returns_200_with_zero_counts():
    set_agent_factory(_mock_agent_factory(store=lambda: []))
    result = handler({}, None)
    body = _parse_response(result)

    assert result["statusCode"] == 200
    assert body["products_scanned"] == 0
    assert body["products_recommended"] == 0


# ── Recommendation failures ──────────────────────────────────────────────────

def test_recommendation_failures_still_return_200():
    """Agent captures failures without crashing — handler still returns 200."""
    client = MockBedrockClient(should_fail=True, fail_with="Timeout")
    set_agent_factory(_mock_agent_factory(client=client))

    result = handler({}, None)
    body = _parse_response(result)

    assert result["statusCode"] == 200
    assert body["failed_recommendations"] > 0
    assert len(body["errors"]) > 0


# ── Threshold environment variable ──────────────────────────────────────────

def test_threshold_from_environment(monkeypatch):
    monkeypatch.setenv("AGENT_QUALITY_THRESHOLD", "95")
    set_agent_factory(_mock_agent_factory(threshold=95))

    result = handler({}, None)
    body = _parse_response(result)

    # With threshold 95, more products should need recommendations
    assert body["products_recommended"] >= 4


def test_low_threshold_means_fewer_recommendations(monkeypatch):
    monkeypatch.setenv("AGENT_QUALITY_THRESHOLD", "20")
    set_agent_factory(_mock_agent_factory(threshold=20))

    result = handler({}, None)
    body = _parse_response(result)

    assert body["products_recommended"] <= 3


# ── Invalid threshold ────────────────────────────────────────────────────────

def test_invalid_threshold_returns_500(monkeypatch):
    monkeypatch.setenv("AGENT_QUALITY_THRESHOLD", "not_a_number")
    # Don't set factory — let handler try to create real agent
    result = handler({}, None)
    body = _parse_response(result)

    assert result["statusCode"] == 500
    assert "AGENT_QUALITY_THRESHOLD" in body["error"]


def test_out_of_range_threshold_returns_500(monkeypatch):
    monkeypatch.setenv("AGENT_QUALITY_THRESHOLD", "150")
    result = handler({}, None)
    body = _parse_response(result)

    assert result["statusCode"] == 500
    assert "0-100" in body["error"]


# ── Missing Bedrock model ID ────────────────────────────────────────────────

def test_missing_model_id_returns_500(monkeypatch):
    monkeypatch.setenv("BEDROCK_MODEL_ID", "")
    result = handler({}, None)
    body = _parse_response(result)

    assert result["statusCode"] == 500
    assert "BEDROCK_MODEL_ID" in body["error"]


# ── Unexpected exception ─────────────────────────────────────────────────────

def test_unexpected_exception_returns_500():
    def broken_factory():
        raise RuntimeError("Kaboom")

    set_agent_factory(broken_factory)
    result = handler({}, None)
    body = _parse_response(result)

    assert result["statusCode"] == 500
    assert "initialise" in body["error"].lower() or "failed" in body["error"].lower()


def test_agent_run_exception_returns_500():
    """If agent.run() itself throws unexpectedly."""
    class BrokenAgent:
        def run(self):
            raise RuntimeError("Unexpected crash")

    set_agent_factory(lambda: BrokenAgent())
    result = handler({}, None)
    body = _parse_response(result)

    assert result["statusCode"] == 500
    assert "failed" in body["error"].lower()


# ── JSON serialization ───────────────────────────────────────────────────────

def test_response_body_is_valid_json():
    set_agent_factory(_mock_agent_factory())
    result = handler({}, None)

    # Should not raise
    parsed = json.loads(result["body"])
    assert isinstance(parsed, dict)


def test_content_type_header_is_json():
    set_agent_factory(_mock_agent_factory())
    result = handler({}, None)

    assert result["headers"]["Content-Type"] == "application/json"


def test_duration_is_numeric():
    set_agent_factory(_mock_agent_factory())
    result = handler({}, None)
    body = _parse_response(result)

    assert isinstance(body["duration_seconds"], (int, float))
    assert body["duration_seconds"] >= 0
