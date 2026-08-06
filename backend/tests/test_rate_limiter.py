"""
tests/test_rate_limiter.py — Unit tests for rate_limiter.py.

Covers:
- Requests within limit pass
- Requests exceeding limit raise RateLimitExceeded
- retry_after_seconds is reasonable
- DynamoDB read errors fail open (allow the request)
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("RATE_LIMITS_TABLE_NAME", "rojai-rate-limits-test")
os.environ.setdefault("RATE_LIMIT_PER_MINUTE", "5")

from botocore.exceptions import ClientError

from rate_limiter import RateLimitExceeded, check_rate_limit


def _make_client_error(code: str) -> ClientError:
    return ClientError(
        {"Error": {"Code": code, "Message": "test"}},
        "Query",
    )


class TestCheckRateLimit:
    @patch("rate_limiter._get_table")
    def test_allows_request_within_limit(self, mock_table_fn):
        mock_table = MagicMock()
        mock_table.query.return_value = {"Count": 2}
        mock_table.put_item.return_value = {}
        mock_table_fn.return_value = mock_table

        # Should not raise
        check_rate_limit("user-123")

        mock_table.put_item.assert_called_once()

    @patch("rate_limiter._get_table")
    def test_raises_when_limit_exceeded(self, mock_table_fn):
        mock_table = MagicMock()
        # First query: count in window = 5 (at limit)
        mock_table.query.side_effect = [
            {"Count": 5},
            {"Items": [{"sk": "TS#0000000000001#abc"}]},  # oldest item
        ]
        mock_table_fn.return_value = mock_table

        with pytest.raises(RateLimitExceeded) as exc_info:
            check_rate_limit("user-456")

        assert exc_info.value.limit == 5
        assert exc_info.value.retry_after_seconds >= 1

    @patch("rate_limiter._get_table")
    def test_fails_open_on_dynamo_read_error(self, mock_table_fn):
        mock_table = MagicMock()
        mock_table.query.side_effect = _make_client_error("InternalServerError")
        mock_table_fn.return_value = mock_table

        # Should NOT raise — fails open
        check_rate_limit("user-789")

    @patch("rate_limiter._get_table")
    def test_records_request_after_passing_check(self, mock_table_fn):
        mock_table = MagicMock()
        mock_table.query.return_value = {"Count": 0}
        mock_table.put_item.return_value = {}
        mock_table_fn.return_value = mock_table

        check_rate_limit("user-new")

        call_args = mock_table.put_item.call_args[1]
        item = call_args["Item"]
        assert item["pk"] == "USER#user-new"
        assert item["sk"].startswith("TS#")
        assert "ttl" in item

    @patch("rate_limiter._get_table")
    def test_allows_exactly_at_limit_minus_one(self, mock_table_fn):
        mock_table = MagicMock()
        mock_table.query.return_value = {"Count": 4}  # limit is 5, so 4 is OK
        mock_table.put_item.return_value = {}
        mock_table_fn.return_value = mock_table

        # Should not raise
        check_rate_limit("user-edge")
