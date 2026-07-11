"""
mock_service.py — Returns a realistic mock listing without any AWS calls.

Active when USE_MOCK_BEDROCK=true.
Uses the actual product details from the request so responses feel meaningful
during local development.
"""
from __future__ import annotations

from schemas import ListingRequest, ListingResponse, ResponseMetadata

_TONE_OPENER: dict[str, str] = {
    "professional": "Introducing the",
    "luxury": "Indulge in the pinnacle of craftsmanship with the",
    "friendly": "Say hello to your new favourite —",
}

_MARKETPLACE_SUFFIX: dict[str, str] = {
    "shopify": "Order yours today and elevate your space.",
    "etsy": "Handcrafted with love — ready to ship.",
    "amazon": "Premium quality. Fast shipping. Built to last.",
}


def generate_mock_listing(req: ListingRequest) -> ListingResponse:
    """Generate a structurally correct mock response using the request data."""
    opener = _TONE_OPENER.get(req.tone, "Presenting the")
    suffix = _MARKETPLACE_SUFFIX.get(req.marketplace, "Shop now.")
    brand_prefix = f"{req.brand} — " if req.brand else ""
    brand_credit = f" by {req.brand}" if req.brand else ""

    title = _build_title(req, brand_prefix)

    bullet_points = [
        f"{opener} {req.productName} — crafted for quality and lasting performance.",
        f"Made for {req.category} enthusiasts who demand the best.",
        f"{req.description[:90]}{'…' if len(req.description) > 90 else ''}",
        f"Beautifully designed{brand_credit} with attention to every detail.",
        suffix,
    ]

    description = (
        f"{brand_prefix}{req.productName} is a standout choice in the "
        f"{req.category} category. {req.description} "
        f"Whether you're searching for a meaningful gift or a quality addition "
        f"to your home, this product delivers on every front. "
        f"{suffix}"
    )

    name_words = req.productName.lower().split()
    seo_keywords = [
        req.productName.lower(),
        req.category.lower(),
        f"best {req.category.lower()}",
        f"buy {req.productName.lower()}",
        req.marketplace,
        req.tone,
        *(([req.brand.lower()] if req.brand else [])),
        f"{req.category.lower()} gift",
    ][:8]

    tags = [
        name_words[0] if name_words else "product",
        req.category.lower().replace(" ", "-").replace("&", "and"),
        req.marketplace,
        req.tone,
        "handmade" if req.marketplace == "etsy" else "premium",
        "new-arrival",
        "top-rated",
    ][:7]

    metadata = ResponseMetadata(
        marketplace=req.marketplace,
        language=req.language,
        tone=req.tone,
        source="mock",
    )

    return ListingResponse(
        title=title,
        bulletPoints=bullet_points,
        description=description,
        seoKeywords=seo_keywords,
        tags=tags,
        metadata=metadata,
    )


def _build_title(req: ListingRequest, brand_prefix: str) -> str:
    base = f"{brand_prefix}{req.productName} — {req.category}"
    if req.marketplace == "amazon":
        return f"{base} | Premium Quality | {req.tone.capitalize()} Grade"
    if req.marketplace == "etsy":
        return f"{req.productName} — Handcrafted {req.category} | Ready to Ship"
    return base[:200]
