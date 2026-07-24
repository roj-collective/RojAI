/**
 * quality-scorer.ts — Client-side product quality evaluator.
 *
 * Scores product listings on a 0-100 scale using deterministic rules.
 * No external services, no write operations.
 */

// ── Configuration ───────────────────────────────────────────────────────────

const TITLE_MAX_POINTS = 15;
const DESCRIPTION_MAX_POINTS = 15;
const TAGS_MAX_POINTS = 12;
const IMAGES_MAX_POINTS = 12;
const VENDOR_MAX_POINTS = 8;
const VARIANTS_MAX_POINTS = 8;
const STATUS_MAX_POINTS = 10;
const SEO_TITLE_MAX_POINTS = 10;
const SEO_DESCRIPTION_MAX_POINTS = 10;

const TITLE_MIN_LENGTH = 50;
const TITLE_MAX_LENGTH = 150;
const DESCRIPTION_MIN_WORDS = 20;
const REQUIRED_TAGS = 5;
const REQUIRED_IMAGES = 2;
const SEO_TITLE_MIN_LENGTH = 30;
const SEO_TITLE_MAX_LENGTH = 70;
const SEO_DESCRIPTION_MIN_LENGTH = 50;
const SEO_DESCRIPTION_MAX_LENGTH = 160;

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
    checkVariants,
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

// ── Rule implementations ────────────────────────────────────────────────────

function checkTitle(product: ShopifyProduct): Finding | null {
  const length = product.title.trim().length;

  if (length === 0) {
    return {
      field: "title",
      severity: "critical",
      message: "Product has no title.",
      pointsDeducted: TITLE_MAX_POINTS,
    };
  }

  if (length < TITLE_MIN_LENGTH) {
    return {
      field: "title",
      severity: "high",
      message: `Title is too short (${length} chars). Aim for ${TITLE_MIN_LENGTH}–${TITLE_MAX_LENGTH} characters.`,
      pointsDeducted: TITLE_MAX_POINTS,
    };
  }

  if (length > TITLE_MAX_LENGTH) {
    return {
      field: "title",
      severity: "medium",
      message: `Title is too long (${length} chars). Keep under ${TITLE_MAX_LENGTH} characters.`,
      pointsDeducted: Math.round(TITLE_MAX_POINTS / 2),
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
      message: `Description is too short (${wordCount} words). Aim for ${DESCRIPTION_MIN_WORDS}+ words.`,
      pointsDeducted: DESCRIPTION_MAX_POINTS,
    };
  }

  return null;
}

function checkTags(product: ShopifyProduct): Finding | null {
  const count = product.tags.length;

  if (count === 0) {
    return {
      field: "tags",
      severity: "high",
      message: "No product tags defined. Add at least 5 for discoverability.",
      pointsDeducted: TAGS_MAX_POINTS,
    };
  }

  if (count < REQUIRED_TAGS) {
    const deduction = Math.round(
      TAGS_MAX_POINTS * (1 - count / REQUIRED_TAGS),
    );
    return {
      field: "tags",
      severity: "medium",
      message: `Only ${count} tag${count !== 1 ? "s" : ""}. Aim for at least ${REQUIRED_TAGS}.`,
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
      message: "No product images. Add at least 2 images.",
      pointsDeducted: IMAGES_MAX_POINTS,
    };
  }

  if (count < REQUIRED_IMAGES) {
    return {
      field: "images",
      severity: "medium",
      message: `Only ${count} image. Add at least ${REQUIRED_IMAGES} images.`,
      pointsDeducted: Math.round(IMAGES_MAX_POINTS / 2),
    };
  }

  return null;
}

function checkVendor(product: ShopifyProduct): Finding | null {
  if (!product.vendor || product.vendor.trim().length === 0) {
    return {
      field: "vendor",
      severity: "medium",
      message: "No vendor/brand specified.",
      pointsDeducted: VENDOR_MAX_POINTS,
    };
  }
  return null;
}

function checkVariants(product: ShopifyProduct): Finding | null {
  const count = product.variants.edges.length;
  if (count === 0) {
    return {
      field: "variants",
      severity: "high",
      message: "Product has no variants (no pricing info).",
      pointsDeducted: VARIANTS_MAX_POINTS,
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
      pointsDeducted: 5,
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
  const length = seoTitle.trim().length;

  if (length === 0) {
    return {
      field: "seo_title",
      severity: "medium",
      message:
        "No SEO title set. Search engines will use the product title instead.",
      pointsDeducted: SEO_TITLE_MAX_POINTS,
    };
  }

  if (length < SEO_TITLE_MIN_LENGTH) {
    return {
      field: "seo_title",
      severity: "low",
      message: `SEO title is short (${length} chars). Aim for ${SEO_TITLE_MIN_LENGTH}–${SEO_TITLE_MAX_LENGTH} characters.`,
      pointsDeducted: Math.round(SEO_TITLE_MAX_POINTS / 2),
    };
  }

  if (length > SEO_TITLE_MAX_LENGTH) {
    return {
      field: "seo_title",
      severity: "low",
      message: `SEO title is too long (${length} chars). Keep under ${SEO_TITLE_MAX_LENGTH} characters to avoid truncation.`,
      pointsDeducted: Math.round(SEO_TITLE_MAX_POINTS / 3),
    };
  }

  return null;
}

function checkSeoDescription(product: ShopifyProduct): Finding | null {
  const seoDesc = product.seo?.description || "";
  const length = seoDesc.trim().length;

  if (length === 0) {
    return {
      field: "seo_description",
      severity: "medium",
      message:
        "No SEO description (meta description) set. This hurts search visibility.",
      pointsDeducted: SEO_DESCRIPTION_MAX_POINTS,
    };
  }

  if (length < SEO_DESCRIPTION_MIN_LENGTH) {
    return {
      field: "seo_description",
      severity: "low",
      message: `SEO description is short (${length} chars). Aim for ${SEO_DESCRIPTION_MIN_LENGTH}–${SEO_DESCRIPTION_MAX_LENGTH} characters.`,
      pointsDeducted: Math.round(SEO_DESCRIPTION_MAX_POINTS / 2),
    };
  }

  if (length > SEO_DESCRIPTION_MAX_LENGTH) {
    return {
      field: "seo_description",
      severity: "low",
      message: `SEO description is too long (${length} chars). Keep under ${SEO_DESCRIPTION_MAX_LENGTH} characters.`,
      pointsDeducted: Math.round(SEO_DESCRIPTION_MAX_POINTS / 3),
    };
  }

  return null;
}
