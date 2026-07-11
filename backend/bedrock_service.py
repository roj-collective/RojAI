"""
bedrock_service.py — Calls Amazon Bedrock Runtime to generate a listing.

Active when USE_MOCK_BEDROCK=false.
Never silently falls back to mock — raises BedrockError on any failure.
"""
from __future__ import annotations

import json
import logging
import os
import re

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from prompt_builder import build_prompt
from schemas import ListingRequest, ListingResponse, ResponseMetadata

logger = logging.getLogger(__name__)

# Required keys in a valid Bedrock response
_REQUIRED_KEYS = {"title", "bulletPoints", "description", "seoKeywords", "tags"}


class BedrockError(Exception):
    """Raised when Bedrock call fails or returns unusable output."""


def generate_bedrock_listing(req: ListingRequest) -> ListingResponse:
    """
    Call Bedrock, validate the response, and return a ListingResponse.
    Makes exactly one attempt. Raises BedrockError on any failure.
    """
    model_id = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-sonnet-20240229-v1:0")
    region = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))

    prompt = build_prompt(req)

    try:
        client = boto3.client("bedrock-runtime", region_name=region)
        response = client.invoke_model(
            modelId=model_id,
            contentType="application/json",
            accept="application/json",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1500,
                "messages": [{"role": "user", "content": prompt}],
            }),
        )
    except (BotoCoreError, ClientError) as exc:
        # Log without credentials or full request body
        logger.error("Bedrock invoke_model failed: %s", type(exc).__name__)
        raise BedrockError(f"Bedrock call failed: {type(exc).__name__}") from exc

    raw_body = response["body"].read().decode("utf-8")
    parsed_data = _extract_listing_json(raw_body)

    metadata = ResponseMetadata(
        marketplace=req.marketplace,
        language=req.language,
        tone=req.tone,
        source="bedrock",
    )

    return ListingResponse(
        title=parsed_data["title"],
        bulletPoints=parsed_data["bulletPoints"],
        description=parsed_data["description"],
        seoKeywords=parsed_data["seoKeywords"],
        tags=parsed_data["tags"],
        metadata=metadata,
    )


def _extract_listing_json(raw_body: str) -> dict:
    """
    Extract and validate the listing JSON from a Bedrock response body.

    Strategy:
    1. Parse the Bedrock response envelope to get the model's text output.
    2. Try to parse that text directly as JSON.
    3. If that fails, attempt to extract a JSON object via regex (one safe attempt).
    4. Validate required keys are present with correct types.
    5. Raise BedrockError if anything is wrong — never fall back silently.
    """
    # Parse Bedrock response envelope
    try:
        envelope = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise BedrockError("Bedrock response body is not valid JSON.") from exc

    # Claude response shape: content[0].text
    try:
        model_text: str = envelope["content"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise BedrockError("Unexpected Bedrock response structure.") from exc

    # Attempt 1: direct parse
    data = _try_parse_json(model_text)

    # Attempt 2: extract JSON block from surrounding text
    if data is None:
        logger.warning("Direct JSON parse failed; attempting JSON extraction from model text.")
        data = _try_extract_json_block(model_text)

    if data is None:
        raise BedrockError("Model output could not be parsed as JSON after two attempts.")

    _validate_listing_data(data)
    return data


def _try_parse_json(text: str) -> dict | None:
    try:
        result = json.loads(text.strip())
        if isinstance(result, dict):
            return result
    except json.JSONDecodeError:
        pass
    return None


def _try_extract_json_block(text: str) -> dict | None:
    """Find the first {...} block in the text and try to parse it."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        return _try_parse_json(match.group())
    return None


def _validate_listing_data(data: dict) -> None:
    """Raise BedrockError if required keys are missing or have wrong types."""
    missing = _REQUIRED_KEYS - data.keys()
    if missing:
        raise BedrockError(f"Model output missing required keys: {sorted(missing)}")

    if not isinstance(data["title"], str) or not data["title"].strip():
        raise BedrockError("Model output 'title' must be a non-empty string.")

    for list_key in ("bulletPoints", "seoKeywords", "tags"):
        if not isinstance(data[list_key], list) or len(data[list_key]) == 0:
            raise BedrockError(f"Model output '{list_key}' must be a non-empty list.")

    if not isinstance(data["description"], str) or not data["description"].strip():
        raise BedrockError("Model output 'description' must be a non-empty string.")
