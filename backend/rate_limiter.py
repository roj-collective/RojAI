"""
rate_limiter.py — Per-user sliding-window rate limiting backed by DynamoDB.

Uses the rojai-rate-limits table to track request timestamps per user.
Each request is stored as a separate item with TTL for automatic cleanup.

Design:
  - Partition key: USER#{userId}
  - Sort key: TS#{timestamp_ms}#{random_suffix}  (allows multiple within same ms)
  - TTL: 120 seconds (double the window to ensure cleanup happens after expiry)

The sliding window is 60 seconds. If more than RATE_LIMIT_PER_MINUTE items exist
for the user within the past 60 seconds, the request is rejected.

Security:
  - userId comes from the verified Cognito JWT sub claim.
  - No sensitive data is logged.
"""
from __future__ import annotations

import logging
import os
import time
import uuid

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

# ── Configuration ────────────────────────────────────────────────────────────

_WINDOW_SECONDS = 60
_TTL_SECONDS = 120  # Cleanup buffer beyond the window
_DEFAULT_LIMIT = 5


def _get_rate_limit() -> int:
    return int(os.environ.get("RATE_LIMIT_PER_MINUTE", str(_DEFAULT_LIMIT)))


def _get_table():
    table_name = os.environ.get("RATE_LIMITS_TABLE_NAME", "rojai-rate-limits")
    return boto3.resource("dynamodb").Table(table_name)


# ── Public API ───────────────────────────────────────────────────────────────

class RateLimitExceeded(Exception):
    """Raised when the user exceeds per-minute request limit."""

    def __init__(self, limit: int, retry_after_seconds: int):
        self.limit = limit
        self.retry_after_seconds = retry_after_seconds
        super().__init__(
            f"Rate limit exceeded ({limit} requests per minute). "
            f"Try again in {retry_after_seconds} seconds."
        )


def check_rate_limit(user_id: str) -> None:
    """
    Check whether the user is within their per-minute rate limit.
    If within limit, records this request. If exceeded, raises RateLimitExceeded.

    Strategy:
    1. Query items for this user with sort key > TS#{window_start_ms}
    2. If count >= limit, calculate retry-after and raise
    3. Otherwise, record this request with TTL
    """
    limit = _get_rate_limit()
    table = _get_table()
    now_ms = int(time.time() * 1000)
    window_start_ms = now_ms - (_WINDOW_SECONDS * 1000)

    # Count requests in the current window
    try:
        response = table.query(
            KeyConditionExpression="pk = :pk AND sk > :window_start",
            ExpressionAttributeValues={
                ":pk": f"USER#{user_id}",
                ":window_start": f"TS#{window_start_ms:013d}",
            },
            Select="COUNT",
            ConsistentRead=False,  # Eventually consistent is fine for rate limiting
        )
    except ClientError as exc:
        # Fail open on DynamoDB read errors — allow the request but log
        logger.error("RATE_LIMIT_READ_ERROR | error_type=%s", type(exc).__name__)
        return

    count = response.get("Count", 0)

    if count >= limit:
        # Calculate approximate retry-after based on oldest item in window
        retry_after = _WINDOW_SECONDS  # Worst case: wait full window
        try:
            # Get the oldest item in the window to calculate actual wait time
            oldest_response = table.query(
                KeyConditionExpression="pk = :pk AND sk > :window_start",
                ExpressionAttributeValues={
                    ":pk": f"USER#{user_id}",
                    ":window_start": f"TS#{window_start_ms:013d}",
                },
                Limit=1,
                ScanIndexForward=True,  # Oldest first
            )
            items = oldest_response.get("Items", [])
            if items:
                oldest_sk = items[0]["sk"]  # TS#{timestamp_ms}#{suffix}
                oldest_ms = int(oldest_sk.split("#")[1])
                expires_ms = oldest_ms + (_WINDOW_SECONDS * 1000)
                retry_after = max(1, int((expires_ms - now_ms) / 1000))
        except (ClientError, ValueError, IndexError):
            pass  # Use default retry_after

        raise RateLimitExceeded(limit=limit, retry_after_seconds=retry_after)

    # Record this request
    suffix = uuid.uuid4().hex[:8]
    ttl = int(time.time()) + _TTL_SECONDS
    try:
        table.put_item(
            Item={
                "pk": f"USER#{user_id}",
                "sk": f"TS#{now_ms:013d}#{suffix}",
                "ttl": ttl,
            }
        )
    except ClientError as exc:
        # Fail open — the request was already counted in our check
        logger.error("RATE_LIMIT_WRITE_ERROR | error_type=%s", type(exc).__name__)
