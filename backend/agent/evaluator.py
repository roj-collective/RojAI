"""
agent/evaluator.py — Deterministic product listing quality evaluator.

Pure domain logic — no AWS imports, no I/O.
Scores a product listing on a 0-100 scale and returns actionable findings.

Marketplace-aware: Shopify products are not penalized for Amazon-specific
fields (bullet points, standalone SEO keyword lists) that don't exist natively
on Shopify. The maximum score is always 100 regardless of marketplace.
"""
from __future__ import annotations

from .schemas import AuditResult, Finding, Product, Severity

# ── Configuration ────────────────────────────────────────────────────────────

RECOMMENDATION_THRESHOLD = 70  # Score below this triggers AI recommendations

# ── Amazon/generic rule weights (sum to 100) ─────────────────────────────────
TITLE_MAX_POINTS = 20
BULLET_COUNT_MAX_POINTS = 20
BULLET_QUALITY_MAX_POINTS = 15
DESCRIPTION_MAX_POINTS = 15
SEO_KEYWORDS_MAX_POINTS = 15
TAGS_MAX_POINTS = 15

# ── Shopify rule weights (sum to 100) ────────────────────────────────────────
# Shopify products don't have bullet points or standalone SEO keyword lists.
# Weight is redistributed to fields that Shopify actually provides.
SHOPIFY_TITLE_MAX_POINTS = 25
SHOPIFY_DESCRIPTION_MAX_POINTS = 25
SHOPIFY_TAGS_MAX_POINTS = 25
SHOPIFY_VENDOR_MAX_POINTS = 10
SHOPIFY_CATEGORY_MAX_POINTS = 15

# ── Thresholds ───────────────────────────────────────────────────────────────
TITLE_MIN_LENGTH = 50
TITLE_MAX_LENGTH = 150
REQUIRED_BULLET_COUNT = 5
BULLET_MIN_LENGTH = 40
BULLET_MAX_LENGTH = 250
DESCRIPTION_MIN_WORDS = 20
DESCRIPTION_MAX_WORDS = 500
REQUIRED_SEO_KEYWORDS = 5
REQUIRED_TAGS = 5


# ── Public API ───────────────────────────────────────────────────────────────

def evaluate_product(product: Product) -> AuditResult:
    """Score a product and return findings with severity rankings."""
    if product.marketplace == "shopify":
        return _evaluate_shopify(product)
    return _evaluate_generic(product)


def evaluate_all(products: list[Product]) -> list[AuditResult]:
    """Evaluate a list of products. Returns results sorted worst-first."""
    results = [evaluate_product(p) for p in products]
    results.sort(key=lambda r: r.quality_score)
    return results


# ── Generic/Amazon evaluation ────────────────────────────────────────────────

def _evaluate_generic(product: Product) -> AuditResult:
    """Evaluate using all rules including bullet points and SEO keywords."""
    findings: list[Finding] = []
    total_deducted = 0

    for rule_fn in _GENERIC_RULES:
        finding = rule_fn(product)
        if finding is not None:
            findings.append(finding)
            total_deducted += finding.points_deducted

    score = max(0, 100 - total_deducted)
    findings.sort(key=lambda f: list(Severity).index(f.severity))

    return AuditResult(
        product_id=product.product_id,
        product_name=product.product_name,
        quality_score=score,
        max_score=100,
        findings=findings,
        needs_recommendations=score < RECOMMENDATION_THRESHOLD,
    )


# ── Shopify-specific evaluation ──────────────────────────────────────────────

def _evaluate_shopify(product: Product) -> AuditResult:
    """
    Evaluate Shopify products using only Shopify-native fields.

    Does NOT penalize for:
      - Missing bullet points (Shopify doesn't have them)
      - Missing standalone SEO keywords (tags serve this purpose)
    """
    findings: list[Finding] = []
    total_deducted = 0

    for rule_fn in _SHOPIFY_RULES:
        finding = rule_fn(product)
        if finding is not None:
            findings.append(finding)
            total_deducted += finding.points_deducted

    score = max(0, 100 - total_deducted)
    findings.sort(key=lambda f: list(Severity).index(f.severity))

    return AuditResult(
        product_id=product.product_id,
        product_name=product.product_name,
        quality_score=score,
        max_score=100,
        findings=findings,
        needs_recommendations=score < RECOMMENDATION_THRESHOLD,
    )


# ── Shared rule implementations ──────────────────────────────────────────────

def _check_title_length(product: Product) -> Finding | None:
    title = product.current_title.strip()
    length = len(title)
    max_points = SHOPIFY_TITLE_MAX_POINTS if product.marketplace == "shopify" else TITLE_MAX_POINTS

    if length == 0:
        return Finding(
            rule_id="title_missing",
            field="current_title",
            severity=Severity.CRITICAL,
            message="Product has no title.",
            current_value="(empty)",
            points_deducted=max_points,
        )

    if length < TITLE_MIN_LENGTH:
        return Finding(
            rule_id="title_too_short",
            field="current_title",
            severity=Severity.HIGH,
            message=f"Title is too short ({length} chars). Aim for {TITLE_MIN_LENGTH}-{TITLE_MAX_LENGTH} characters.",
            current_value=f"{length} characters",
            points_deducted=max_points,
        )

    if length > TITLE_MAX_LENGTH:
        return Finding(
            rule_id="title_too_long",
            field="current_title",
            severity=Severity.MEDIUM,
            message=f"Title is too long ({length} chars). Keep under {TITLE_MAX_LENGTH} characters for best display.",
            current_value=f"{length} characters",
            points_deducted=max_points // 2,
        )

    return None


def _check_description_length(product: Product) -> Finding | None:
    desc = product.description.strip()
    word_count = len(desc.split())
    max_points = SHOPIFY_DESCRIPTION_MAX_POINTS if product.marketplace == "shopify" else DESCRIPTION_MAX_POINTS

    if word_count < 5:
        return Finding(
            rule_id="description_missing",
            field="description",
            severity=Severity.CRITICAL,
            message="Product description is essentially missing.",
            current_value=f"{word_count} words",
            points_deducted=max_points,
        )

    if word_count < DESCRIPTION_MIN_WORDS:
        return Finding(
            rule_id="description_too_short",
            field="description",
            severity=Severity.HIGH,
            message=f"Description is too short ({word_count} words). Aim for {DESCRIPTION_MIN_WORDS}-{DESCRIPTION_MAX_WORDS} words.",
            current_value=f"{word_count} words",
            points_deducted=max_points,
        )

    return None


def _check_tags(product: Product) -> Finding | None:
    count = len(product.current_tags)
    max_points = SHOPIFY_TAGS_MAX_POINTS if product.marketplace == "shopify" else TAGS_MAX_POINTS

    if count == 0:
        return Finding(
            rule_id="tags_missing",
            field="current_tags",
            severity=Severity.HIGH,
            message="No product tags defined. Add at least 5 for categorisation.",
            current_value="0 tags",
            points_deducted=max_points,
        )

    if count < REQUIRED_TAGS:
        deduction = int(max_points * (1 - count / REQUIRED_TAGS))
        return Finding(
            rule_id="tags_insufficient",
            field="current_tags",
            severity=Severity.MEDIUM,
            message=f"Only {count} tags. Aim for at least {REQUIRED_TAGS}.",
            current_value=f"{count} tags",
            points_deducted=deduction,
        )

    return None


# ── Amazon/generic-only rules ────────────────────────────────────────────────

def _check_bullet_count(product: Product) -> Finding | None:
    count = len(product.current_bullet_points)

    if count == 0:
        return Finding(
            rule_id="bullets_missing",
            field="current_bullet_points",
            severity=Severity.CRITICAL,
            message="No bullet points present. Listings need exactly 5.",
            current_value="0 bullets",
            points_deducted=BULLET_COUNT_MAX_POINTS,
        )

    if count < REQUIRED_BULLET_COUNT:
        deduction = int(BULLET_COUNT_MAX_POINTS * (1 - count / REQUIRED_BULLET_COUNT))
        return Finding(
            rule_id="bullets_insufficient",
            field="current_bullet_points",
            severity=Severity.HIGH,
            message=f"Only {count} bullet points. Listings perform best with exactly {REQUIRED_BULLET_COUNT}.",
            current_value=f"{count} bullets",
            points_deducted=deduction,
        )

    return None


def _check_bullet_quality(product: Product) -> Finding | None:
    bullets = product.current_bullet_points
    if not bullets:
        return None

    short_bullets = [b for b in bullets if len(b.strip()) < BULLET_MIN_LENGTH]

    if short_bullets:
        severity = Severity.HIGH if len(short_bullets) >= 3 else Severity.MEDIUM
        deduction = min(BULLET_QUALITY_MAX_POINTS, len(short_bullets) * 5)
        return Finding(
            rule_id="bullets_too_short",
            field="current_bullet_points",
            severity=severity,
            message=f"{len(short_bullets)} bullet(s) are under {BULLET_MIN_LENGTH} characters. Add more detail about features and benefits.",
            current_value=f"{len(short_bullets)} short bullets",
            points_deducted=deduction,
        )

    return None


def _check_seo_keywords(product: Product) -> Finding | None:
    count = len(product.current_seo_keywords)

    if count == 0:
        return Finding(
            rule_id="seo_keywords_missing",
            field="current_seo_keywords",
            severity=Severity.HIGH,
            message="No SEO keywords defined. Add at least 5 for discoverability.",
            current_value="0 keywords",
            points_deducted=SEO_KEYWORDS_MAX_POINTS,
        )

    if count < REQUIRED_SEO_KEYWORDS:
        deduction = int(SEO_KEYWORDS_MAX_POINTS * (1 - count / REQUIRED_SEO_KEYWORDS))
        return Finding(
            rule_id="seo_keywords_insufficient",
            field="current_seo_keywords",
            severity=Severity.MEDIUM,
            message=f"Only {count} SEO keywords. Aim for at least {REQUIRED_SEO_KEYWORDS}.",
            current_value=f"{count} keywords",
            points_deducted=deduction,
        )

    return None


# ── Shopify-only rules ───────────────────────────────────────────────────────

def _check_shopify_vendor(product: Product) -> Finding | None:
    if not product.brand or not product.brand.strip():
        return Finding(
            rule_id="vendor_missing",
            field="brand",
            severity=Severity.MEDIUM,
            message="No vendor/brand specified. Set a vendor for better store organisation.",
            current_value="(empty)",
            points_deducted=SHOPIFY_VENDOR_MAX_POINTS,
        )
    return None


def _check_shopify_category(product: Product) -> Finding | None:
    cat = product.category.strip() if product.category else ""
    if not cat or cat == "Uncategorized":
        return Finding(
            rule_id="category_missing",
            field="category",
            severity=Severity.MEDIUM,
            message="No product type set. Assign a product type for better organisation.",
            current_value=cat or "(empty)",
            points_deducted=SHOPIFY_CATEGORY_MAX_POINTS,
        )
    return None


# ── Rule registries ──────────────────────────────────────────────────────────

_GENERIC_RULES = [
    _check_title_length,
    _check_bullet_count,
    _check_bullet_quality,
    _check_description_length,
    _check_seo_keywords,
    _check_tags,
]

_SHOPIFY_RULES = [
    _check_title_length,
    _check_description_length,
    _check_tags,
    _check_shopify_vendor,
    _check_shopify_category,
]
