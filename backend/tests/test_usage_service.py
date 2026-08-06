"""
tests/test_usage_service.py — Unit tests for usage_service.py.

Covers:
- get_usage: default free tier, existing record
- reserve_generation: atomic increment, limit enforcement
- release_generation: decrement on failure
- complete_generation: marks request as completed
- check_idempotency: detects duplicate requests
- regeneration limit enforcement
- concurrent request safety (ConditionalCheckFailedException)
"""
from __future__ import annotations

import os
import sys
import time
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("USAGE_TABLE_NAME", "rojai-usage-test")
os.environ.setdefault("REQUESTS_TABLE_NAME", "rojai-requests-test")
os.environ.setdefault("FREE_MONTHLY_LIMIT", "5")
os.environ.setdefault("FREE_REGENERATION_LIMIT", "1")

from botocore.exceptions import ClientError

from usage_service import (
    DuplicateRequest,
    RegenerationLimitExceeded,
    UsageLimitExceeded,
    check_idempotency,
    complete_generation,
    get_current_month,
    get_month_reset_date,
    get_usage,
    release_generation,
    reserve_generation,
)


def _make_client_error(code: str) -> ClientError:
    return ClientError(
        {"Error": {"Code": code, "Message": "test"}},
        "UpdateItem",
    )


# ── get_usage ────────────────────────────────────────────────────────────────


class TestGetUsage:
    @patch("usage_service._get_usage_table")
    def test_returns_default_free_tier_when_no_record(self, mock_table_fn):
        mock_table = MagicMock()
        mock_table.get_item.return_value = {}
        mock_table_fn.return_value = mock_table

        result = get_usage("user-123")

        assert result["plan"] == "free"
        assert result["generationCount"] == 0
        assert result["monthlyLimit"] == 5
        assert result["regenerationLimit"] == 1
        assert "resetDate" in result
        assert result["month"] == get_current_month()

    @patch("usage_service._get_usage_table")
    def test_returns_existing_usage_record(self, mock_table_fn):
        mock_table = MagicMock()
        mock_table.get_item.return_value = {
            "Item": {
                "pk": "USER#user-456",
                "sk": f"MONTH#{get_current_month()}",
                "plan": "free",
                "generationCount": 3,
            }
        }
        mock_table_fn.return_value = mock_table

        result = get_usage("user-456")

        assert result["plan"] == "free"
        assert result["generationCount"] == 3
        assert result["monthlyLimit"] == 5


# ── reserve_generation ───────────────────────────────────────────────────────


class TestReserveGeneration:
    @patch("usage_service._get_requests_table")
    @patch("usage_service._get_usage_table")
    def test_successful_reservation(self, mock_usage_fn, mock_requests_fn):
        mock_usage = MagicMock()
        mock_usage.get_item.return_value = {
            "Item": {"plan": "free", "generationCount": 2}
        }
        mock_usage.update_item.return_value = {}
        mock_usage_fn.return_value = mock_usage

        mock_requests = MagicMock()
        mock_requests.get_item.return_value = {}
        mock_requests.put_item.return_value = {}
        mock_requests_fn.return_value = mock_requests

        result = reserve_generation("user-1", "idem-key-1")

        assert result["generationCount"] == 3
        assert result["plan"] == "free"
        mock_usage.update_item.assert_called_once()
        mock_requests.put_item.assert_called_once()

    @patch("usage_service._get_requests_table")
    @patch("usage_service._get_usage_table")
    def test_raises_when_monthly_limit_reached(self, mock_usage_fn, mock_requests_fn):
        mock_usage = MagicMock()
        mock_usage.get_item.return_value = {
            "Item": {"plan": "free", "generationCount": 5}
        }
        # Simulate ConditionalCheckFailedException on atomic increment
        mock_usage.update_item.side_effect = _make_client_error(
            "ConditionalCheckFailedException"
        )
        mock_usage_fn.return_value = mock_usage

        mock_requests = MagicMock()
        mock_requests.get_item.return_value = {}
        mock_requests_fn.return_value = mock_requests

        with pytest.raises(UsageLimitExceeded) as exc_info:
            reserve_generation("user-1", "idem-key-2")

        assert exc_info.value.current == 5
        assert exc_info.value.limit == 5

    @patch("usage_service._get_requests_table")
    @patch("usage_service._get_usage_table")
    def test_raises_on_duplicate_idempotency_key(self, mock_usage_fn, mock_requests_fn):
        mock_usage = MagicMock()
        mock_usage_fn.return_value = mock_usage

        mock_requests = MagicMock()
        mock_requests.get_item.return_value = {
            "Item": {"status": "completed", "pk": "USER#u1", "sk": "REQ#dup-key"}
        }
        mock_requests_fn.return_value = mock_requests

        with pytest.raises(DuplicateRequest):
            reserve_generation("u1", "dup-key")

    @patch("usage_service._get_regeneration_count")
    @patch("usage_service._get_requests_table")
    @patch("usage_service._get_usage_table")
    def test_raises_on_regeneration_limit(
        self, mock_usage_fn, mock_requests_fn, mock_regen_count
    ):
        mock_usage = MagicMock()
        mock_usage.get_item.return_value = {
            "Item": {"plan": "free", "generationCount": 1}
        }
        mock_usage_fn.return_value = mock_usage

        mock_requests = MagicMock()
        mock_requests.get_item.return_value = {}
        mock_requests_fn.return_value = mock_requests

        # Already regenerated once (limit is 1 for free)
        mock_regen_count.return_value = 1

        with pytest.raises(RegenerationLimitExceeded):
            reserve_generation("user-1", "idem-3", listing_key="listing-abc")


# ── release_generation ───────────────────────────────────────────────────────


class TestReleaseGeneration:
    @patch("usage_service._get_requests_table")
    @patch("usage_service._get_usage_table")
    def test_decrements_counter_and_removes_request(self, mock_usage_fn, mock_requests_fn):
        mock_usage = MagicMock()
        mock_usage.update_item.return_value = {}
        mock_usage_fn.return_value = mock_usage

        mock_requests = MagicMock()
        mock_requests.delete_item.return_value = {}
        mock_requests_fn.return_value = mock_requests

        release_generation("user-1", "idem-key-fail")

        mock_requests.delete_item.assert_called_once()
        mock_usage.update_item.assert_called_once()

    @patch("usage_service._get_requests_table")
    @patch("usage_service._get_usage_table")
    def test_decrement_at_zero_is_noop(self, mock_usage_fn, mock_requests_fn):
        mock_usage = MagicMock()
        # Counter is already 0 — ConditionExpression fails
        mock_usage.update_item.side_effect = _make_client_error(
            "ConditionalCheckFailedException"
        )
        mock_usage_fn.return_value = mock_usage

        mock_requests = MagicMock()
        mock_requests.delete_item.return_value = {}
        mock_requests_fn.return_value = mock_requests

        # Should not raise
        release_generation("user-1", "idem-key-already-zero")


# ── complete_generation ──────────────────────────────────────────────────────


class TestCompleteGeneration:
    @patch("usage_service._get_requests_table")
    def test_marks_request_as_completed(self, mock_requests_fn):
        mock_requests = MagicMock()
        mock_requests.update_item.return_value = {}
        mock_requests_fn.return_value = mock_requests

        complete_generation("user-1", "idem-done")

        mock_requests.update_item.assert_called_once()
        call_kwargs = mock_requests.update_item.call_args[1]
        assert ":completed" in str(call_kwargs["ExpressionAttributeValues"])


# ── check_idempotency ────────────────────────────────────────────────────────


class TestCheckIdempotency:
    @patch("usage_service._get_requests_table")
    def test_returns_none_for_new_request(self, mock_requests_fn):
        mock_requests = MagicMock()
        mock_requests.get_item.return_value = {}
        mock_requests_fn.return_value = mock_requests

        result = check_idempotency("user-1", "new-key")
        assert result is None

    @patch("usage_service._get_requests_table")
    def test_returns_item_for_completed_request(self, mock_requests_fn):
        mock_requests = MagicMock()
        mock_requests.get_item.return_value = {
            "Item": {"status": "completed", "pk": "USER#u1", "sk": "REQ#old-key"}
        }
        mock_requests_fn.return_value = mock_requests

        result = check_idempotency("u1", "old-key")
        assert result is not None
        assert result["status"] == "completed"

    def test_returns_none_for_empty_key(self):
        result = check_idempotency("user-1", "")
        assert result is None


# ── Helper functions ─────────────────────────────────────────────────────────


class TestHelpers:
    def test_get_current_month_format(self):
        month = get_current_month()
        assert len(month) == 7  # "yyyy-MM"
        assert "-" in month

    def test_get_month_reset_date_format(self):
        reset = get_month_reset_date()
        assert len(reset) == 10  # "yyyy-MM-dd"
        parts = reset.split("-")
        assert len(parts) == 3


# ── Generation vs Regeneration distinction ───────────────────────────────────


class TestGenerationVsRegeneration:
    """
    Distinguish: new listing, retry (same idempotencyKey), intentional regen (same listingKey, new idempotencyKey).

    - idempotencyKey: identifies the same HTTP request (network retries). Same key = same request, never double-charged.
    - listingKey: identifies the product/listing being regenerated. Same listingKey + different idempotencyKey = intentional regen.
    - No listingKey: brand new listing (not a regen).
    """

    @patch("usage_service._get_regeneration_count")
    @patch("usage_service._get_requests_table")
    @patch("usage_service._get_usage_table")
    def test_new_listing_has_no_listing_key(self, mock_usage_fn, mock_requests_fn, mock_regen):
        """A new listing passes listing_key=None — no regeneration check occurs."""
        mock_usage = MagicMock()
        mock_usage.get_item.return_value = {"Item": {"plan": "free", "generationCount": 0}}
        mock_usage.update_item.return_value = {}
        mock_usage_fn.return_value = mock_usage

        mock_requests = MagicMock()
        mock_requests.get_item.return_value = {}
        mock_requests.put_item.return_value = {}
        mock_requests_fn.return_value = mock_requests

        reserve_generation("user-A", "new-idem-1", listing_key=None)

        # Regeneration count should NOT be checked for new listings
        mock_regen.assert_not_called()

    @patch("usage_service._get_regeneration_count")
    @patch("usage_service._get_requests_table")
    @patch("usage_service._get_usage_table")
    def test_retry_same_idempotency_key_raises_duplicate(self, mock_usage_fn, mock_requests_fn, mock_regen):
        """A network retry with the same idempotencyKey is detected as duplicate, not charged."""
        mock_usage = MagicMock()
        mock_usage_fn.return_value = mock_usage

        mock_requests = MagicMock()
        mock_requests.get_item.return_value = {
            "Item": {"status": "completed", "pk": "USER#u", "sk": "REQ#retry-key"}
        }
        mock_requests_fn.return_value = mock_requests

        with pytest.raises(DuplicateRequest):
            reserve_generation("u", "retry-key", listing_key=None)

        # Never charged
        mock_usage.update_item.assert_not_called()

    @patch("usage_service._get_regeneration_count")
    @patch("usage_service._get_requests_table")
    @patch("usage_service._get_usage_table")
    def test_intentional_regen_uses_listing_key(self, mock_usage_fn, mock_requests_fn, mock_regen):
        """An intentional regeneration has a different idempotencyKey but same listingKey."""
        mock_usage = MagicMock()
        mock_usage.get_item.return_value = {"Item": {"plan": "free", "generationCount": 1}}
        mock_usage.update_item.return_value = {}
        mock_usage_fn.return_value = mock_usage

        mock_requests = MagicMock()
        mock_requests.get_item.return_value = {}
        mock_requests.put_item.return_value = {}
        mock_requests_fn.return_value = mock_requests

        # First regen allowed (count=0 < limit=1)
        mock_regen.return_value = 0
        reserve_generation("user-B", "regen-idem-1", listing_key="product-123")
        mock_regen.assert_called_once()

    @patch("usage_service._get_regeneration_count")
    @patch("usage_service._get_requests_table")
    @patch("usage_service._get_usage_table")
    def test_free_user_gets_5_new_and_1_regen_per_listing(self, mock_usage_fn, mock_requests_fn, mock_regen):
        """Free user: 5 new generations allowed, then limit hit. 1 regen per listing."""
        mock_usage = MagicMock()
        mock_requests = MagicMock()
        mock_requests.get_item.return_value = {}
        mock_requests.put_item.return_value = {}
        mock_requests_fn.return_value = mock_requests
        mock_usage_fn.return_value = mock_usage
        mock_regen.return_value = 0

        # Simulate 5 successful new generations
        for i in range(5):
            mock_usage.get_item.return_value = {"Item": {"plan": "free", "generationCount": i}}
            mock_usage.update_item.return_value = {}
            reserve_generation(f"user-free", f"idem-{i}", listing_key=None)

        # 6th should fail
        mock_usage.get_item.return_value = {"Item": {"plan": "free", "generationCount": 5}}
        mock_usage.update_item.side_effect = _make_client_error("ConditionalCheckFailedException")
        with pytest.raises(UsageLimitExceeded):
            reserve_generation("user-free", "idem-6", listing_key=None)

        # Regen: first attempt on a listing succeeds
        mock_usage.update_item.side_effect = None
        mock_usage.get_item.return_value = {"Item": {"plan": "free", "generationCount": 3}}
        mock_regen.return_value = 0
        reserve_generation("user-free", "regen-a", listing_key="listing-X")

        # Regen: second attempt on same listing fails
        mock_regen.return_value = 1
        with pytest.raises(RegenerationLimitExceeded):
            reserve_generation("user-free", "regen-b", listing_key="listing-X")


# ── Reservation recovery (stale PENDING) ─────────────────────────────────────


class TestReservationRecovery:
    """
    If Lambda times out after reserve but before complete/release, the request
    record stays in status='reserved'. The monthly counter is incremented.

    Recovery: TTL on the requests table ensures stale records expire (45 days).
    The user's monthly counter is NOT automatically decremented — this is a
    known tradeoff. At most 1 generation can be 'lost' per timeout event.

    For the free tier (5/month), this is acceptable. The alternative (a background
    sweeper) adds complexity disproportionate to the risk.
    """

    @patch("usage_service._get_requests_table")
    @patch("usage_service._get_usage_table")
    def test_stale_reserved_request_does_not_block_new_requests(self, mock_usage_fn, mock_requests_fn):
        """A stale 'reserved' request with a different idempotencyKey does not block new requests."""
        mock_usage = MagicMock()
        mock_usage.get_item.return_value = {"Item": {"plan": "free", "generationCount": 1}}
        mock_usage.update_item.return_value = {}
        mock_usage_fn.return_value = mock_usage

        mock_requests = MagicMock()
        # New idempotency key — not a duplicate
        mock_requests.get_item.return_value = {}
        mock_requests.put_item.return_value = {}
        mock_requests_fn.return_value = mock_requests

        # This succeeds — the stale reserved request from a previous timeout
        # doesn't prevent new requests (different idempotencyKey).
        result = reserve_generation("user-timeout", "new-key-after-timeout")
        assert result["generationCount"] == 2

    @patch("usage_service._get_requests_table")
    @patch("usage_service._get_usage_table")
    def test_stale_reserved_same_key_treated_as_new(self, mock_usage_fn, mock_requests_fn):
        """
        A request with a 'reserved' (not 'completed') status and the same idempotencyKey
        is treated as retryable — it won't raise DuplicateRequest because status != 'completed'.
        """
        mock_usage = MagicMock()
        mock_usage.get_item.return_value = {"Item": {"plan": "free", "generationCount": 1}}
        mock_usage.update_item.return_value = {}
        mock_usage_fn.return_value = mock_usage

        mock_requests = MagicMock()
        # Existing record with status='reserved' (stale from a timeout)
        mock_requests.get_item.return_value = {
            "Item": {"status": "reserved", "pk": "USER#u", "sk": "REQ#stale-key"}
        }
        mock_requests.put_item.return_value = {}
        mock_requests_fn.return_value = mock_requests

        # check_idempotency returns None for non-completed records
        # So this request proceeds normally
        result = reserve_generation("u", "stale-key")
        assert result is not None
