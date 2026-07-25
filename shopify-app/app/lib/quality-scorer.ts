/**
 * quality-scorer.ts — Client-side product quality evaluator.
 *
 * Aligned with backend/agent/evaluator.py Shopify scoring rules.
 * Scores product listings on a 0-100 scale using deterministic rules.
 * No external services, no write operations.
 */

// ── Shopify scoring weights (sum to 100, matches backend evaluator) ─────────

const TITLE_MAX_POINTS = 20;
const DESCRIPTION_MAX_POINTS = 20;
const TAGS_MAX_POINTS = 15;
const IMAGES_MAX_POINTS = 15;
const VENDOR_MAX_POINTS = 5;
const CATEGORY_MAX_POINTS = 5;
const STATUS_MAX_POINTS = 5;
const SEO_TITLE_MAX_POINTS = 8;
const SEO_DESCRIPTION_MAX_POINTS = 7;

// ── Thresholds (matches backend evaluator) ──────────────────────────────────

const TITLE_MIN_LENGTH = 50;
const TITLE_MAX_LENGTH = 150;
const DESCRIPTION_MIN_WORDS = 20;
const REQUIRED_TAGS = 5;

export const RECOMMENDATION_THRESHOLD = 70;

// ── Types ───────────────────────────────────────────────────────────────────

export type Severity = "critical" | "high" | "medium" | "low";
export type BadgeTone = "success" | "warning" | "critical" | "info";

export interface Finding {
  field: string;
  severity: Severity;
  message: string;
  pointsDeducted: number;
}

export interface QualityResult {
  score: number;
  maxScore: number;
  findings: Finding[];
  needsRecommendations: boolean;
}

export interface ScoredProduct {
  id: string;
  title: string;
  description: string;
  descriptionHtml: string;
  status: string;
  vendor: string;
  productType: string;
  tags: string[];
  totalInventory: number;
  imageCount: number;
  variantCount: number;
  seoTitle: string;
  seoDescription: string;
  quality: QualityResult;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  description: string;
  descriptionHtml: string;
  status: string;
  vendor: string;
  productType: string;
  tags: string[];
  totalInventory: number;
  images: { edges: { node: { id: string } }[] };
  variants: { edges: { node: { id: string } }[] };
  seo?: { title: string | null; description: string | null };
}

// ── Scoring ─────────────────────────────────────────────────────────────────

export function evaluateProduct(product: ShopifyProduct): QualityResult {
  const findings: Finding[] = [];
  let totalDeducted = 0;

  const rules = [
    checkTitle,
    checkDescription,
    checkTags,
    checkImages,
    checkVendor,
    checkCategory,
    checkStatus,
    checkSeoTitle,
    checkSeoDescription,
  ];

  for (const rule of rules) {
    const finding = rule(product);
    if (finding) {
      findings.push(finding);
      totalDeducted += finding.pointsDeducted;
    }
  }

  const score = Math.max(0, Math.min(100, 100 - totalDeducted));

  const severityOrder: Severity[] = ["critical", "high", "medium", "low"];
  findings.sort(
    (a, b) =>
      severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity),
  );

  return {
    score,
    maxScore: 100,
    findings,
    needsRecommendations: score < RECOMMENDATION_THRESHOLD,
  };
}

export function scoreProduct(product: ShopifyProduct): ScoredProduct {
  const quality = evaluateProduct(product);
  return {
    id: product.id,
    title: product.title,
    description: product.description,
    descriptionHtml: product.descriptionHtml,
    status: product.status,
    vendor: product.vendor,
    productType: product.productType,
    tags: product.tags,
    totalInventory: product.totalInventory,
    imageCount: product.images.edges.length,
    variantCount: product.variants.edges.length,
    seoTitle: product.seo?.title || "",
    seoDescription: product.seo?.description || "",
    quality,
  };
}

export function getScoreBadge(score: number): {
  label: string;
  tone: BadgeTone;
} {
  if (score >= 80) return { label: "Good", tone: "success" };
  if (score >= 60) return { label: "Fair", tone: "warning" };
  if (score >= 40) return { label: "Poor", tone: "critical" };
  return { label: "Critical", tone: "critical" };
}

// ── Rule implementations (matches backend evaluator.py) ─────────────────────

function checkTitle(product: ShopifyProduct): Finding | null {
  const length = product.title.trim().length;

  if (length === 0) {
    return {
      field: "current_title",
      severity: "critical",
      message: "Product has no title.",
      pointsDeducted: TITLE_MAX_POINTS,
    };
  }

  if (length < TITLE_MIN_LENGTH) {
    return {
      field: "current_title",
      severity: "high",
      message: `Title is too short (${length} chars). Aim for ${TITLE_MIN_LENGTH}-${TITLE_MAX_LENGTH} characters.`,
      pointsDeducted: TITLE_MAX_POINTS,
    };
  }

  if (length > TITLE_MAX_LENGTH) {
    return {
      field: "current_title",
      severity: "medium",
      message: `Title is too long (${length} chars). Keep under ${TITLE_MAX_LENGTH} characters for best display.`,
      pointsDeducted: Math.floor(TITLE_MAX_POINTS / 2),
    };
  }

  return null;
}

function checkDescription(product: ShopifyProduct): Finding | null {
  const text = product.description.trim();
  const wordCount = text ? text.split(/\s+/).length : 0;

  if (wordCount < 5) {
    return {
      field: "description",
      severity: "critical",
      message: "Product description is essentially missing.",
      pointsDeducted: DESCRIPTION_MAX_POINTS,
    };
  }

  if (wordCount < DESCRIPTION_MIN_WORDS) {
    return {
      field: "description",
      severity: "high",
      message: `Description is too short (${wordCount} words). Aim for ${DESCRIPTION_MIN_WORDS}-500 words.`,
      pointsDeducted: DESCRIPTION_MAX_POINTS,
    };
  }

  return null;
}

function checkTags(product: ShopifyProduct): Finding | null {
  const count = product.tags.length;

  if (count === 0) {
    return {
      field: "current_tags",
      severity: "high",
      message: "No product tags defined. Add at least 5 for categorisation.",
      pointsDeducted: TAGS_MAX_POINTS,
    };
  }

  if (count < REQUIRED_TAGS) {
    const deduction = Math.round(TAGS_MAX_POINTS * (1 - count / REQUIRED_TAGS));
    return {
      field: "current_tags",
      severity: "medium",
      message: `Only ${count} tags. Aim for at least ${REQUIRED_TAGS}.`,
      pointsDeducted: deduction,
    };
  }

  return null;
}

function checkImages(product: ShopifyProduct): Finding | null {
  const count = product.images.edges.length;

  if (count === 0) {
    return {
      field: "images",
      severity: "high",
      message: "No product images. Add at least one image to improve conversions.",
      pointsDeducted: IMAGES_MAX_POINTS,
    };
  }

  return null;
}

function checkVendor(product: ShopifyProduct): Finding | null {
  if (!product.vendor || product.vendor.trim().length === 0) {
    return {
      field: "brand",
      severity: "medium",
      message: "No vendor/brand specified. Set a vendor for better store organisation.",
      pointsDeducted: VENDOR_MAX_POINTS,
    };
  }
  return null;
}

function checkCategory(product: ShopifyProduct): Finding | null {
  const cat = (product.productType || "").trim();
  if (!cat || cat === "Uncategorized") {
    return {
      field: "category",
      severity: "medium",
      message: "No product type set. Assign a product type for better organisation.",
      pointsDeducted: CATEGORY_MAX_POINTS,
    };
  }
  return null;
}

function checkStatus(product: ShopifyProduct): Finding | null {
  if (product.status === "DRAFT") {
    return {
      field: "status",
      severity: "low",
      message: "Product is in DRAFT status and not visible to customers.",
      pointsDeducted: STATUS_MAX_POINTS,
    };
  }
  if (product.status === "ARCHIVED") {
    return {
      field: "status",
      severity: "medium",
      message: "Product is ARCHIVED and not available for purchase.",
      pointsDeducted: STATUS_MAX_POINTS,
    };
  }
  return null;
}

function checkSeoTitle(product: ShopifyProduct): Finding | null {
  const seoTitle = product.seo?.title || "";
  if (seoTitle.trim().length === 0) {
    return {
      field: "seo_title",
      severity: "medium",
      message: "No SEO title set. Search engines will use the product title instead.",
      pointsDeducted: SEO_TITLE_MAX_POINTS,
    };
  }
  return null;
}

function checkSeoDescription(product: ShopifyProduct): Finding | null {
  const seoDesc = product.seo?.description || "";
  if (seoDesc.trim().length === 0) {
    return {
      field: "seo_description",
      severity: "medium",
      message: "No SEO description set. This reduces search result click-through rate.",
      pointsDeducted: SEO_DESCRIPTION_MAX_POINTS,
    };
  }
  return null;
}
