"""
prompt_builder.py — Builds the Bedrock prompt from a ListingRequest.

Pure function — no I/O, no side-effects.
"""
from __future__ import annotations

from schemas import ListingRequest

# Marketplace-specific copy guidance injected into the prompt
_MARKETPLACE_GUIDANCE: dict[str, str] = {
    "shopify": (
        "Write persuasive e-commerce copy optimised for a Shopify store. "
        "Focus on benefits, lifestyle appeal, and motivating the reader to buy."
    ),
    "etsy": (
        "Write warm, story-driven copy that emphasises craftsmanship, "
        "handmade quality, and the human story behind the product. "
        "Etsy buyers value authenticity and uniqueness."
    ),
    "amazon": (
        "Write clear, benefit-focused copy optimised for Amazon search. "
        "Use concise, scannable language. Front-load keywords. "
        "Bullet points should be easy to skim."
    ),
}

_TONE_GUIDANCE: dict[str, str] = {
    "professional": "Use a clear, authoritative, and informative tone.",
    "luxury": "Use an aspirational, premium tone that conveys exclusivity and quality.",
    "friendly": "Use a warm, conversational, approachable tone.",
}

_LANGUAGE_NAMES: dict[str, str] = {
    "en": "English",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
    "it": "Italian",
}


def build_prompt(req: ListingRequest) -> str:
    """Return the full prompt string to send to Bedrock."""
    brand_line = f"Brand: {req.brand}" if req.brand else "Brand: Not specified"
    marketplace_guidance = _MARKETPLACE_GUIDANCE[req.marketplace]
    tone_guidance = _TONE_GUIDANCE[req.tone]
    language_name = _LANGUAGE_NAMES.get(req.language, req.language)

    return f"""You are an expert product copywriter for online marketplaces.

Generate a complete, marketplace-ready product listing for the product below.
{marketplace_guidance}
{tone_guidance}
Write the entire response in {language_name}.

Product details:
- Product Name: {req.productName}
- {brand_line}
- Category: {req.category}
- Description: {req.description}

Return your response as a single JSON object with EXACTLY these keys and no others:
{{
  "title": "A compelling product title (max 200 characters)",
  "bulletPoints": [
    "Benefit-focused bullet point 1",
    "Benefit-focused bullet point 2",
    "Benefit-focused bullet point 3",
    "Benefit-focused bullet point 4",
    "Benefit-focused bullet point 5"
  ],
  "description": "A full product description paragraph (150-300 words)",
  "seoKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}}

Rules:
- bulletPoints must be an array of exactly 5 strings.
- seoKeywords must be an array of 5-8 strings, all lowercase.
- tags must be an array of 5-8 strings, all lowercase, no spaces (use hyphens).
- Return ONLY the JSON object. No markdown fences, no commentary, no extra text."""
