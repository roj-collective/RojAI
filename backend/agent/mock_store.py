"""
agent/mock_store.py — Sample product catalog for MVP.

Provides 8 realistic ecommerce products with intentionally varied quality
levels so the evaluator has a mix of passing and failing listings to audit.

No AWS dependencies. Replace with a real store adapter (DynamoDB, Shopify API)
in future phases.
"""
from __future__ import annotations

from .schemas import Product


SAMPLE_PRODUCTS: list[Product] = [
    # ── High quality (should pass) ───────────────────────────────────────────
    Product(
        product_id="prod-001",
        product_name="Handwoven Kilim Pillow Cover — Authentic Turkish Wool Cushion",
        description="Authentic handwoven wool pillow cover crafted by artisans in Van, Turkey. Made from natural-dyed wool using centuries-old flat-weave techniques. Features geometric motifs in earthy reds, greens, and golds.",
        category="Home & Kitchen",
        marketplace="shopify",
        brand="RojKilim",
        current_title="RojKilim Handwoven Kilim Pillow Cover — Authentic Turkish Wool Cushion for Boho Living Room Décor",
        current_bullet_points=[
            "Authentic handwoven construction using traditional flat-weave kilim techniques from Van, Turkey",
            "Premium natural wool with vegetable dyes for rich, long-lasting earthy colours",
            "Geometric motifs make each piece one-of-a-kind — no two pillows are identical",
            "Durable enough for daily use on sofas, beds, or reading nooks",
            "Standard 18×18 inch size with hidden zipper closure for easy insert changes",
        ],
        current_seo_keywords=["kilim pillow", "turkish pillow cover", "boho cushion", "handwoven wool", "ethnic decor", "kilim cushion cover"],
        current_tags=["kilim-pillow", "turkish-decor", "handwoven", "boho-home", "wool-cushion", "artisan-made"],
    ),

    # ── Medium quality (borderline) ──────────────────────────────────────────
    Product(
        product_id="prod-002",
        product_name="Vintage Runner Rug",
        description="A beautiful vintage-style runner rug for hallways.",
        category="Home & Kitchen",
        marketplace="etsy",
        brand="RojKilim",
        current_title="Vintage Runner Rug — Hallway Carpet",
        current_bullet_points=[
            "Hand-knotted wool construction",
            "Fits standard hallway widths",
            "Vibrant vegetable-dyed colours",
        ],
        current_seo_keywords=["runner rug", "vintage rug", "hallway carpet"],
        current_tags=["rug", "runner", "vintage"],
    ),

    # ── Low quality (should fail) ────────────────────────────────────────────
    Product(
        product_id="prod-003",
        product_name="Wool Throw Blanket",
        description="Soft wool blanket.",
        category="Home & Kitchen",
        marketplace="amazon",
        brand=None,
        current_title="Blanket",
        current_bullet_points=["Warm", "Soft"],
        current_seo_keywords=[],
        current_tags=["blanket"],
    ),

    Product(
        product_id="prod-004",
        product_name="Ceramic Serving Bowl Set",
        description="Set of 3 handmade ceramic bowls ideal for salads, pasta, and entertaining. Lead-free glaze, dishwasher safe. Available in ocean blue and matte white.",
        category="Home & Kitchen",
        marketplace="shopify",
        brand="ArtisanCraft",
        current_title="Ceramic Serving Bowl Set of 3 — Handmade Pottery for Modern Kitchen",
        current_bullet_points=[
            "Set of 3 nesting bowls in graduated sizes (8, 10, 12 inch diameter)",
            "Food-safe lead-free glaze in ocean blue or matte white finishes",
            "Handmade by skilled potters — slight variations reflect artisan quality",
            "Dishwasher and microwave safe for everyday convenience",
            "Stackable design saves cabinet space while looking beautiful on display",
        ],
        current_seo_keywords=["ceramic bowl set", "serving bowls", "handmade pottery", "kitchen decor", "nesting bowls"],
        current_tags=["ceramic", "serving-bowl", "handmade", "kitchen", "pottery", "gift-idea"],
    ),

    # ── Very low quality ─────────────────────────────────────────────────────
    Product(
        product_id="prod-005",
        product_name="Scented Candle",
        description="Candle.",
        category="Home & Kitchen",
        marketplace="etsy",
        brand=None,
        current_title="Candle",
        current_bullet_points=[],
        current_seo_keywords=[],
        current_tags=[],
    ),

    Product(
        product_id="prod-006",
        product_name="Organic Cotton Tote Bag",
        description="A reusable cotton tote bag for everyday shopping. Printed with botanical illustrations.",
        category="Clothing & Accessories",
        marketplace="shopify",
        brand="EcoThread",
        current_title="EcoThread Organic Cotton Tote — Reusable Shopping Bag with Botanical Print",
        current_bullet_points=[
            "100% GOTS-certified organic cotton canvas (12oz heavy-duty weight)",
            "Original botanical illustration printed with water-based eco inks",
            "Reinforced handles support up to 15kg for heavy grocery loads",
            "Machine washable at 30°C — gets softer with every wash",
        ],
        current_seo_keywords=["organic tote bag", "reusable shopping bag", "eco bag", "cotton tote"],
        current_tags=["tote-bag", "organic", "eco-friendly", "reusable", "botanical"],
    ),

    # ── Missing description and weak everything ──────────────────────────────
    Product(
        product_id="prod-007",
        product_name="Phone Stand",
        description="Stand for phone.",
        category="Electronics",
        marketplace="amazon",
        brand=None,
        current_title="Stand",
        current_bullet_points=["Holds phone"],
        current_seo_keywords=[],
        current_tags=[],
    ),

    Product(
        product_id="prod-008",
        product_name="Hand-Poured Soy Wax Candle — Lavender Fields",
        description="Natural soy wax candle with pure lavender essential oil. Hand-poured in small batches. Burns for 45+ hours. Cotton wick, reusable glass jar.",
        category="Home & Kitchen",
        marketplace="etsy",
        brand="Lumière",
        current_title="Lumière Hand-Poured Soy Candle — Lavender Fields | Natural Essential Oil | 45hr Burn Time",
        current_bullet_points=[
            "100% natural soy wax — clean burn with no petroleum byproducts",
            "Pure lavender essential oil for authentic aromatherapy benefits",
            "Hand-poured in small batches ensuring consistent quality every time",
            "45+ hour burn time from a generous 8oz pour in a reusable glass jar",
            "Lead-free cotton wick produces minimal soot and even melting",
        ],
        current_seo_keywords=["soy candle", "lavender candle", "natural candle", "essential oil candle", "handmade candle", "aromatherapy"],
        current_tags=["soy-candle", "lavender", "handmade", "aromatherapy", "natural", "gift"],
    ),
]


def get_all_products() -> list[Product]:
    """Return all products in the mock catalog."""
    return list(SAMPLE_PRODUCTS)


def get_product_by_id(product_id: str) -> Product | None:
    """Return a specific product or None if not found."""
    for p in SAMPLE_PRODUCTS:
        if p.product_id == product_id:
            return p
    return None
