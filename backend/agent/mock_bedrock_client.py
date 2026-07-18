"""
agent/mock_bedrock_client.py — Mock Bedrock client for testing.

Implements the BedrockClient protocol without calling AWS.
Returns realistic structured JSON matching the recommendation schema.
"""
from __future__ import annotations

import json

from .recommender import BedrockClient, RecommenderError


class MockBedrockClient:
    """
    Returns a valid recommendation JSON based on the prompt content.
    Configurable to simulate failures for error-handling tests.
    """

    def __init__(
        self,
        *,
        should_fail: bool = False,
        fail_with: str = "Simulated Bedrock failure",
        return_invalid_json: bool = False,
        return_missing_keys: bool = False,
        return_empty: bool = False,
    ):
        self._should_fail = should_fail
        self._fail_with = fail_with
        self._return_invalid_json = return_invalid_json
        self._return_missing_keys = return_missing_keys
        self._return_empty = return_empty
        self.call_count = 0
        self.last_prompt: str | None = None

    def invoke(self, prompt: str) -> str:
        self.call_count += 1
        self.last_prompt = prompt

        if self._should_fail:
            raise RecommenderError(self._fail_with)

        if self._return_empty:
            return ""

        if self._return_invalid_json:
            return "This is not JSON at all. {broken"

        if self._return_missing_keys:
            return json.dumps({"suggestedTitle": "Only a title, nothing else"})

        # Return a valid recommendation response
        return json.dumps({
            "suggestedTitle": "Premium Handcrafted Product — Quality Home Essential | Fast Shipping",
            "suggestedBulletPoints": [
                "Expertly handcrafted using traditional techniques passed down through generations",
                "Premium natural materials ensure durability and long-lasting beauty in your home",
                "Unique artisan design makes each piece one-of-a-kind for distinctive décor",
                "Versatile styling complements both modern minimalist and bohemian interiors",
                "Satisfaction guaranteed with responsive customer support and easy returns",
            ],
            "suggestedSeoKeywords": [
                "handcrafted home decor",
                "artisan quality",
                "premium home essential",
                "unique gift idea",
                "natural materials",
            ],
            "suggestedTags": [
                "handcrafted",
                "artisan-made",
                "home-decor",
                "premium-quality",
                "unique-gift",
            ],
            "summary": "Improved title with keyword density, added 5 benefit-focused bullets, and populated SEO keywords and tags for marketplace discoverability.",
        })
