"""
usage_service.py — Server-side usage tracking and enforcement.

Manages monthly generation limits, regeneration tracking, and idempotency
using three DynamoDB tables:
  - rojai-usage:       Monthly counters per user (pk=USER#{userId}, sk=MONTH#{yyyy-MM})
  - rojai-requests:    Individual request records for idempotency and regen tracking
                       (pk=USER#{userId}, sk=REQ#{idempotencyKey}), TTL-enabled
  - rojai-rate-limits: Not used here — see rate_limiter.py

All write operations use conditional expressions or atomic updates to prevent
concurrent requests from bypassing limits.

Security:
  - userId comes from the verified Cognito JWT sub claim (never from the client).
  - Plan and limit information is read from the server-side record, never trusted from the client.
  - No sensitive data (tokens, emails, product content) is logged.
"""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

# ── Configuration ────────────────────────────────────────────────────────────

_PLAN_LIMITS = {
    "free": {
        "monthly_generations": int(os.environ.get("FREE_MONTHLY_LIMIT", "5")),
        "regenerations_per_listing": int(os.environ.get("FREE_REGENERATION_LIMIT", "1")),
    },
    "seller": {
        "monthly_generations": 100,
        "regenerations_per_listing": 3,
    },
}

# TTL for request records: 45 days (well past monthly reset)
_REQUEST_TTL_SECONDS = 45 * 24 * 60 * 60

# Reservation lease duration: 60 seconds.
# A reservation older than this is considered stale and can be reclaimed.
_RESERVATION_LEASE_SECONDS = 60


# ── Table references (resolved once per Lambda cold start) ───────────────────

def _get_usage_table():
    table_name = os.environ.get("USAGE_TABLE_NAME", "rojai-usage")
    return boto3.resource("dynamodb").Table(table_name)


def _get_requests_table():
    table_name = os.environ.get("REQUESTS_TABLE_NAME", "rojai-requests")
    return boto3.resource("dynamodb").Table(table_name)


# ── Public API ───────────────────────────────────────────────────────────────

class UsageLimitExceeded(Exception):
    """Raised when the user has exhausted their monthly allowance."""

    def __init__(self, current: int, limit: int, resets_at: str):
        self.current = current
        self.limit = limit
        self.resets_at = resets_at
        super().__init__(
            f"Monthly limit reached ({current}/{limit}). Resets {resets_at}."
        )


class RegenerationLimitExceeded(Exception):
    """Raised when the user has exhausted regenerations for a specific listing."""

    def __init__(self, listing_key: str, current: int, limit: int):
        self.listing_key = listing_key
        self.current = current
        self.limit = limit
        super().__init__(
            f"Regeneration limit reached for this listing ({current}/{limit})."
        )


class DuplicateRequest(Exception):
    """Raised when an idempotency key has already been processed."""

    def __init__(self, idempotency_key: str):
        self.idempotency_key = idempotency_key
        super().__init__(f"Request already processed: {idempotency_key}")


class ActiveReservation(Exception):
    """Raised when an idempotency key has an active (non-expired) reservation.
    The caller should retry after a short delay — do NOT call Bedrock."""

    def __init__(self, idempotency_key: str):
        self.idempotency_key = idempotency_key
        super().__init__(f"Request is being processed: {idempotency_key}")


def get_current_month() -> str:
    """Return current month as yyyy-MM string."""
    return datetime.now(timezone.utc).strftime("%Y-%m")


def get_month_reset_date() -> str:
    """Return the first day of the next month as ISO date string."""
    now = datetime.now(timezone.utc)
    if now.month == 12:
        reset = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        reset = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
    return reset.strftime("%Y-%m-%d")


def get_usage(user_id: str) -> dict:
    """
    Get the current usage record for a user.
    Returns a dict with: plan, generationCount, monthlyLimit, regenerationLimit, resetDate, month.
    Creates a default free-tier record if none exists.
    """
    month = get_current_month()
    table = _get_usage_table()

    try:
        response = table.get_item(
            Key={"pk": f"USER#{user_id}", "sk": f"MONTH#{month}"},
            ConsistentRead=True,
        )
    except ClientError as exc:
        logger.error("USAGE_READ_ERROR | error_type=%s", type(exc).__name__)
        raise

    item = response.get("Item")
    if item:
        plan = item.get("plan", "free")
        limits = _PLAN_LIMITS.get(plan, _PLAN_LIMITS["free"])
        return {
            "plan": plan,
            "generationCount": int(item.get("generationCount", 0)),
            "monthlyLimit": limits["monthly_generations"],
            "regenerationLimit": limits["regenerations_per_listing"],
            "resetDate": get_month_reset_date(),
            "month": month,
        }

    # No record for this month — user is on free tier with 0 usage
    limits = _PLAN_LIMITS["free"]
    return {
        "plan": "free",
        "generationCount": 0,
        "monthlyLimit": limits["monthly_generations"],
        "regenerationLimit": limits["regenerations_per_listing"],
        "resetDate": get_month_reset_date(),
        "month": month,
    }


def check_idempotency(user_id: str, idempotency_key: str) -> tuple[str | None, dict | None]:
    """
    Check if a request with this idempotency key was already processed.

    Returns:
      ("completed", item) — if the request completed successfully (return cached response)
      ("reserved", item)  — if a reservation exists but never completed (stale/abandoned)
      (None, None)        — if no record exists (new request)
    """
    if not idempotency_key:
        return None, None

    table = _get_requests_table()
    try:
        response = table.get_item(
            Key={"pk": f"USER#{user_id}", "sk": f"REQ#{idempotency_key}"},
        )
    except ClientError as exc:
        logger.error("IDEMPOTENCY_CHECK_ERROR | error_type=%s", type(exc).__name__)
        raise

    item = response.get("Item")
    if not item:
        return None, None

    status = item.get("status", "")
    if status == "completed":
        return "completed", item
    if status == "reserved":
        return "reserved", item
    return None, None


def reserve_generation(
    user_id: str,
    idempotency_key: str,
    listing_key: Optional[str] = None,
) -> dict:
    """
    Atomically reserve a generation slot.

    1. Check idempotency — if already processed, raise DuplicateRequest.
    2. Check monthly limit — if exceeded, raise UsageLimitExceeded.
    3. If listing_key provided, check regeneration limit.
    4. Atomically increment the monthly counter with a condition to prevent exceeding limit.
    5. Record the request in the requests table with status='reserved'.

    Returns the updated usage info.
    Raises: UsageLimitExceeded, RegenerationLimitExceeded, DuplicateRequest, ClientError.
    """
    month = get_current_month()
    usage_table = _get_usage_table()
    requests_table = _get_requests_table()

    # Step 1: Get current usage to determine plan and limits (needed for all paths)
    usage = get_usage(user_id)
    plan = usage["plan"]
    limits = _PLAN_LIMITS.get(plan, _PLAN_LIMITS["free"])
    monthly_limit = limits["monthly_generations"]
    regen_limit = limits["regenerations_per_listing"]

    # Step 2: Check idempotency
    status, existing = check_idempotency(user_id, idempotency_key)
    if status == "completed":
        raise DuplicateRequest(idempotency_key)
    # If status == "reserved", check whether the lease has expired.
    # Active reservation (lease not expired): return 409 — caller should retry later.
    # Stale reservation (lease expired): atomically reclaim without double-incrementing.
    if status == "reserved":
        reserved_at = existing.get("reservedAt", "")
        try:
            reserved_ts = datetime.fromisoformat(reserved_at).timestamp()
        except (ValueError, TypeError):
            reserved_ts = 0

        now_ts = time.time()
        lease_expired = (now_ts - reserved_ts) > _RESERVATION_LEASE_SECONDS

        if not lease_expired:
            # Active reservation — another invocation is currently processing this.
            # Caller should retry with backoff. Do NOT call Bedrock or increment usage.
            raise ActiveReservation(idempotency_key)

        # Lease expired — atomically reclaim the stale reservation.
        # Use a conditional update to prevent race with another reclaimer.
        try:
            requests_table.update_item(
                Key={"pk": f"USER#{user_id}", "sk": f"REQ#{idempotency_key}"},
                UpdateExpression="SET reservedAt = :now",
                ConditionExpression="reservedAt = :old_ts",
                ExpressionAttributeValues={
                    ":now": datetime.now(timezone.utc).isoformat(),
                    ":old_ts": reserved_at,
                },
            )
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
                # Another process reclaimed it first — treat as active
                raise ActiveReservation(idempotency_key)
            raise

        # Successfully reclaimed — counter was already incremented previously.
        return {
            "plan": plan,
            "generationCount": usage["generationCount"],
            "monthlyLimit": monthly_limit,
            "resetDate": get_month_reset_date(),
            "reused_reservation": True,
        }

    # Step 3: Check regeneration limit if this is a regeneration
    if listing_key:
        regen_count = _get_regeneration_count(user_id, listing_key, month)
        if regen_count >= regen_limit:
            raise RegenerationLimitExceeded(listing_key, regen_count, regen_limit)

    # Step 4: Atomic increment with condition
    try:
        usage_table.update_item(
            Key={"pk": f"USER#{user_id}", "sk": f"MONTH#{month}"},
            UpdateExpression=(
                "SET generationCount = if_not_exists(generationCount, :zero) + :one, "
                "plan = if_not_exists(plan, :default_plan), "
                "updatedAt = :now"
            ),
            ConditionExpression=(
                "attribute_not_exists(generationCount) OR generationCount < :limit"
            ),
            ExpressionAttributeValues={
                ":zero": 0,
                ":one": 1,
                ":limit": monthly_limit,
                ":default_plan": "free",
                ":now": datetime.now(timezone.utc).isoformat(),
            },
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise UsageLimitExceeded(
                current=monthly_limit,
                limit=monthly_limit,
                resets_at=get_month_reset_date(),
            )
        raise

    # Step 5: Record the request as reserved (with lease timestamp)
    ttl = int(time.time()) + _REQUEST_TTL_SECONDS
    now_iso = datetime.now(timezone.utc).isoformat()
    request_item = {
        "pk": f"USER#{user_id}",
        "sk": f"REQ#{idempotency_key}",
        "status": "reserved",
        "reservedAt": now_iso,
        "month": month,
        "listingKey": listing_key or "",
        "createdAt": now_iso,
        "ttl": ttl,
    }
    try:
        requests_table.put_item(
            Item=request_item,
            ConditionExpression="attribute_not_exists(pk)",
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            # Race condition: another request got there first — release the counter
            _decrement_usage(user_id, month)
            raise DuplicateRequest(idempotency_key)
        # Other error — release the counter
        _decrement_usage(user_id, month)
        raise

    return {
        "plan": plan,
        "generationCount": usage["generationCount"] + 1,
        "monthlyLimit": monthly_limit,
        "resetDate": get_month_reset_date(),
    }


def complete_generation(user_id: str, idempotency_key: str, cached_response: dict | None = None) -> None:
    """Mark a reserved generation as completed (Bedrock succeeded). Optionally store the response for idempotent replay."""
    requests_table = _get_requests_table()
    update_expr = "SET #s = :completed, completedAt = :now"
    attr_values: dict = {
        ":completed": "completed",
        ":now": datetime.now(timezone.utc).isoformat(),
    }
    if cached_response:
        update_expr += ", cachedResponse = :resp"
        attr_values[":resp"] = cached_response

    try:
        requests_table.update_item(
            Key={"pk": f"USER#{user_id}", "sk": f"REQ#{idempotency_key}"},
            UpdateExpression=update_expr,
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues=attr_values,
        )
    except ClientError as exc:
        # Non-fatal: the generation already happened. Log and continue.
        logger.error("COMPLETE_GENERATION_ERROR | error_type=%s", type(exc).__name__)


def release_generation(user_id: str, idempotency_key: str) -> None:
    """
    Release a reserved generation slot because Bedrock failed.
    Decrements the monthly counter and removes the request record.
    """
    month = get_current_month()
    requests_table = _get_requests_table()

    # Remove the request record
    try:
        requests_table.delete_item(
            Key={"pk": f"USER#{user_id}", "sk": f"REQ#{idempotency_key}"},
        )
    except ClientError as exc:
        logger.error("RELEASE_DELETE_ERROR | error_type=%s", type(exc).__name__)

    # Decrement the usage counter
    _decrement_usage(user_id, month)


# ── Internal helpers ─────────────────────────────────────────────────────────

def _decrement_usage(user_id: str, month: str) -> None:
    """Decrement the monthly generation counter. Never goes below 0."""
    table = _get_usage_table()
    try:
        table.update_item(
            Key={"pk": f"USER#{user_id}", "sk": f"MONTH#{month}"},
            UpdateExpression="SET generationCount = generationCount - :one, updatedAt = :now",
            ConditionExpression="generationCount > :zero",
            ExpressionAttributeValues={
                ":one": 1,
                ":zero": 0,
                ":now": datetime.now(timezone.utc).isoformat(),
            },
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            # Counter is already 0 — no-op
            return
        logger.error("DECREMENT_ERROR | error_type=%s", type(exc).__name__)


def _get_regeneration_count(user_id: str, listing_key: str, month: str) -> int:
    """
    Count how many times a listing has been regenerated this month.
    Queries the requests table for completed requests with this listing_key.
    """
    requests_table = _get_requests_table()
    try:
        response = requests_table.query(
            KeyConditionExpression="pk = :pk",
            FilterExpression="listingKey = :lk AND #m = :month AND #s = :completed",
            ExpressionAttributeNames={"#m": "month", "#s": "status"},
            ExpressionAttributeValues={
                ":pk": f"USER#{user_id}",
                ":lk": listing_key,
                ":month": month,
                ":completed": "completed",
            },
            Select="COUNT",
        )
        return response.get("Count", 0)
    except ClientError as exc:
        logger.error("REGEN_COUNT_ERROR | error_type=%s", type(exc).__name__)
        # Fail open on read errors — allow the request but log the issue
        return 0
