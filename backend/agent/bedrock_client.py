"""
agent/bedrock_client.py — Real Amazon Bedrock client implementation.

Uses Amazon Nova via the Bedrock Runtime invoke_model API.
Handles timeouts, throttling, and response envelope parsing.
"""
from __future__ import annotations

import json
import logging
import os

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from .recommender import BedrockClient, RecommenderError

logger = logging.getLogger(__name__)

# Timeout configuration: 25s connect, 60s read (Nova can be slow on first call)
_BOTO_CONFIG = Config(
    connect_timeout=25,
    read_timeout=60,
    retries={"max_attempts": 1},
)


class NovaBedrockClient:
    """
    Calls Amazon Nova through Bedrock Runtime.

    Implements the BedrockClient protocol used by the recommender.
    """

    def __init__(
        self,
        model_id: str | None = None,
        region: str | None = None,
    ):
        self._model_id = model_id or os.environ.get(
            "BEDROCK_MODEL_ID", "us.amazon.nova-lite-v1:0"
        )
        self._region = region or os.environ.get(
            "AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
        )
        self._client = boto3.client(
            "bedrock-runtime",
            region_name=self._region,
            config=_BOTO_CONFIG,
        )

    def invoke(self, prompt: str) -> str:
        """
        Send a prompt to Amazon Nova and return the model text output.

        Raises RecommenderError on any failure.
        """
        request_body = json.dumps({
            "messages": [{"role": "user", "content": [{"text": prompt}]}],
            "inferenceConfig": {
                "maxTokens": 2000,
                "temperature": 0.3,
            },
        })

        try:
            response = self._client.invoke_model(
                modelId=self._model_id,
                contentType="application/json",
                accept="application/json",
                body=request_body,
            )
        except ClientError as exc:
            error_code = exc.response.get("Error", {}).get("Code", "Unknown")
            if error_code == "ThrottlingException":
                raise RecommenderError("Bedrock throttled the request. Try again later.") from exc
            if error_code in ("ModelTimeoutException", "ServiceUnavailableException"):
                raise RecommenderError("Bedrock timed out or is unavailable.") from exc
            logger.error("Bedrock ClientError: %s", error_code)
            raise RecommenderError(f"Bedrock call failed: {error_code}") from exc
        except BotoCoreError as exc:
            logger.error("Bedrock BotoCoreError: %s", type(exc).__name__)
            raise RecommenderError(f"Bedrock connection error: {type(exc).__name__}") from exc

        # Parse response envelope (Nova format)
        raw_body = response["body"].read().decode("utf-8")
        return self._extract_text(raw_body)

    def _extract_text(self, raw_body: str) -> str:
        """Extract model text from Nova response envelope."""
        try:
            envelope = json.loads(raw_body)
        except json.JSONDecodeError as exc:
            raise RecommenderError("Bedrock response is not valid JSON.") from exc

        # Nova response shape: output.message.content[0].text
        try:
            content = envelope["output"]["message"]["content"]
            return content[0]["text"]
        except (KeyError, IndexError, TypeError):
            pass

        # Fallback: Anthropic-style response (content[0].text)
        try:
            return envelope["content"][0]["text"]
        except (KeyError, IndexError, TypeError) as exc:
            raise RecommenderError("Unexpected Bedrock response structure.") from exc
