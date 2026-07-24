import { describe, it, expect } from "vitest";
import {
  evaluateProduct,
  scoreProduct,
  getScoreBadge,
  RECOMMENDATION_THRESHOLD,
  type ShopifyProduct,
} from "./quality-scorer";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<ShopifyProduct> = {}): ShopifyProduct {
  return {
    id: "gid://shopify/Product/1",
    title: "A Well-Crafted Product Title That Is Long Enough To Pass Validation Rules",
    description:
      "This is a complete product description with enough words to pass the minimum threshold of twenty words required by the quality evaluator scoring rules.",
    descriptionHtml: "<p>Description</p>",
    status: "ACTIVE",
    vendor: "TestVendor",
    tags: ["tag1", "tag2", "tag3", "tag4", "tag5"],
    totalInventory: 10,
    images: {
      edges: [{ node: { id: "img1" } }, { node: { id: "img2" } }],
    },
    variants: {
      edges: [{ node: { id: "var1" } }],
    },
    seo: {
      title: "A Good SEO Title That Is Adequately Long",
      description:
        "A properly written meta description that provides search engines with useful context about the product for potential buyers.",
    },
    ...overrides,
  };
}

// ── Complete high-quality product ───────────────────────────────────────────

describe("Complete high-quality product", () => {
  it("scores 100 with no findings", () => {
    const result = evaluateProduct(makeProduct());
    expect(result.score).toBe(100);
    expect(result.findings).toHaveLength(0);
    expect(result.needsRecommendations).toBe(false);
  });

  it("maxScore is always 100", () => {
    const result = evaluateProduct(makeProduct());
    expect(result.maxScore).toBe(100);
  });
});

// ── Product with missing fields ─────────────────────────────────────────────

describe("Product with missing fields", () => {
  it("penalizes missing title", () => {
    const result = evaluateProduct(makeProduct({ title: "" }));
    expect(result.score).toBeLessThan(100);
    expect(result.findings.some((f) => f.field === "title")).toBe(true);
  });

  it("penalizes missing description", () => {
    const result = evaluateProduct(makeProduct({ description: "" }));
    expect(result.score).toBeLessThan(100);
    expect(result.findings.some((f) => f.field === "description")).toBe(true);
  });

  it("penalizes empty tags", () => {
    const result = evaluateProduct(makeProduct({ tags: [] }));
    expect(result.score).toBeLessThan(100);
    expect(result.findings.some((f) => f.field === "tags")).toBe(true);
  });

  it("penalizes missing vendor", () => {
    const result = evaluateProduct(makeProduct({ vendor: "" }));
    expect(result.score).toBeLessThan(100);
    expect(result.findings.some((f) => f.field === "vendor")).toBe(true);
  });

  it("penalizes no images", () => {
    const result = evaluateProduct(
      makeProduct({ images: { edges: [] } }),
    );
    expect(result.score).toBeLessThan(100);
    expect(result.findings.some((f) => f.field === "images")).toBe(true);
  });

  it("penalizes no variants", () => {
    const result = evaluateProduct(
      makeProduct({ variants: { edges: [] } }),
    );
    expect(result.score).toBeLessThan(100);
    expect(result.findings.some((f) => f.field === "variants")).toBe(true);
  });

  it("penalizes missing SEO title", () => {
    const result = evaluateProduct(
      makeProduct({ seo: { title: null, description: "Some desc" } }),
    );
    expect(result.findings.some((f) => f.field === "seo_title")).toBe(true);
  });

  it("penalizes missing SEO description", () => {
    const result = evaluateProduct(
      makeProduct({ seo: { title: "Title", description: null } }),
    );
    expect(result.findings.some((f) => f.field === "seo_description")).toBe(
      true,
    );
  });

  it("accumulates all penalties for a product missing everything", () => {
    const result = evaluateProduct(
      makeProduct({
        title: "",
        description: "",
        tags: [],
        vendor: "",
        images: { edges: [] },
        variants: { edges: [] },
        status: "ARCHIVED",
        seo: { title: null, description: null },
      }),
    );
    expect(result.findings.length).toBeGreaterThanOrEqual(7);
    expect(result.needsRecommendations).toBe(true);
  });
});

// ── Draft and archived products ─────────────────────────────────────────────

describe("Status-based scoring", () => {
  it("penalizes DRAFT status (low severity)", () => {
    const result = evaluateProduct(makeProduct({ status: "DRAFT" }));
    expect(result.score).toBeLessThan(100);
    const finding = result.findings.find((f) => f.field === "status");
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("low");
    expect(finding!.pointsDeducted).toBe(5);
  });

  it("penalizes ARCHIVED status (medium severity)", () => {
    const result = evaluateProduct(makeProduct({ status: "ARCHIVED" }));
    expect(result.score).toBeLessThan(100);
    const finding = result.findings.find((f) => f.field === "status");
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("medium");
  });

  it("does not penalize ACTIVE status", () => {
    const result = evaluateProduct(makeProduct({ status: "ACTIVE" }));
    expect(result.findings.some((f) => f.field === "status")).toBe(false);
  });
});

// ── Boundary values for title ───────────────────────────────────────────────

describe("Title boundaries", () => {
  it("passes at exactly 50 characters", () => {
    const title = "A".repeat(50);
    const result = evaluateProduct(makeProduct({ title }));
    expect(result.findings.some((f) => f.field === "title")).toBe(false);
  });

  it("fails at 49 characters (too short)", () => {
    const title = "A".repeat(49);
    const result = evaluateProduct(makeProduct({ title }));
    expect(result.findings.some((f) => f.field === "title")).toBe(true);
  });

  it("passes at exactly 150 characters", () => {
    const title = "B".repeat(150);
    const result = evaluateProduct(makeProduct({ title }));
    expect(result.findings.some((f) => f.field === "title")).toBe(false);
  });

  it("penalizes at 151 characters (too long)", () => {
    const title = "B".repeat(151);
    const result = evaluateProduct(makeProduct({ title }));
    const finding = result.findings.find((f) => f.field === "title");
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("medium");
  });
});

// ── Boundary values for description ─────────────────────────────────────────

describe("Description boundaries", () => {
  it("passes at exactly 20 words", () => {
    const description = Array(20).fill("word").join(" ");
    const result = evaluateProduct(makeProduct({ description }));
    expect(result.findings.some((f) => f.field === "description")).toBe(false);
  });

  it("fails at 19 words", () => {
    const description = Array(19).fill("word").join(" ");
    const result = evaluateProduct(makeProduct({ description }));
    expect(result.findings.some((f) => f.field === "description")).toBe(true);
  });

  it("critical at fewer than 5 words", () => {
    const result = evaluateProduct(makeProduct({ description: "short" }));
    const finding = result.findings.find((f) => f.field === "description");
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("critical");
  });
});

// ── Boundary values for tags ────────────────────────────────────────────────

describe("Tags boundaries", () => {
  it("passes at exactly 5 tags", () => {
    const result = evaluateProduct(
      makeProduct({ tags: ["a", "b", "c", "d", "e"] }),
    );
    expect(result.findings.some((f) => f.field === "tags")).toBe(false);
  });

  it("penalizes at 4 tags", () => {
    const result = evaluateProduct(
      makeProduct({ tags: ["a", "b", "c", "d"] }),
    );
    expect(result.findings.some((f) => f.field === "tags")).toBe(true);
  });

  it("penalizes at 0 tags with high severity", () => {
    const result = evaluateProduct(makeProduct({ tags: [] }));
    const finding = result.findings.find((f) => f.field === "tags");
    expect(finding!.severity).toBe("high");
  });
});

// ── Score never below 0 or above 100 ───────────────────────────────────────

describe("Score bounds", () => {
  it("never exceeds 100", () => {
    const result = evaluateProduct(makeProduct());
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("never goes below 0 even with all fields missing", () => {
    const result = evaluateProduct(
      makeProduct({
        title: "",
        description: "",
        tags: [],
        vendor: "",
        images: { edges: [] },
        variants: { edges: [] },
        status: "ARCHIVED",
        seo: { title: null, description: null },
      }),
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("score equals 100 minus total deductions", () => {
    const result = evaluateProduct(makeProduct({ title: "" })); // -15 points
    const totalDeducted = result.findings.reduce(
      (sum, f) => sum + f.pointsDeducted,
      0,
    );
    expect(result.score).toBe(Math.max(0, 100 - totalDeducted));
  });
});

// ── Images boundary ─────────────────────────────────────────────────────────

describe("Images boundaries", () => {
  it("passes at 2+ images", () => {
    const result = evaluateProduct(
      makeProduct({
        images: { edges: [{ node: { id: "1" } }, { node: { id: "2" } }] },
      }),
    );
    expect(result.findings.some((f) => f.field === "images")).toBe(false);
  });

  it("penalizes at 1 image", () => {
    const result = evaluateProduct(
      makeProduct({ images: { edges: [{ node: { id: "1" } }] } }),
    );
    const finding = result.findings.find((f) => f.field === "images");
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("medium");
  });

  it("penalizes at 0 images with high severity", () => {
    const result = evaluateProduct(makeProduct({ images: { edges: [] } }));
    const finding = result.findings.find((f) => f.field === "images");
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("high");
  });
});

// ── getScoreBadge ───────────────────────────────────────────────────────────

describe("getScoreBadge", () => {
  it("returns success for scores >= 80", () => {
    expect(getScoreBadge(80).tone).toBe("success");
    expect(getScoreBadge(100).tone).toBe("success");
  });

  it("returns warning for scores 60-79", () => {
    expect(getScoreBadge(60).tone).toBe("warning");
    expect(getScoreBadge(79).tone).toBe("warning");
  });

  it("returns critical for scores below 60", () => {
    expect(getScoreBadge(59).tone).toBe("critical");
    expect(getScoreBadge(0).tone).toBe("critical");
  });
});

// ── scoreProduct ────────────────────────────────────────────────────────────

describe("scoreProduct", () => {
  it("returns ScoredProduct with all expected fields", () => {
    const product = makeProduct();
    const scored = scoreProduct(product);
    expect(scored.id).toBe(product.id);
    expect(scored.title).toBe(product.title);
    expect(scored.imageCount).toBe(2);
    expect(scored.variantCount).toBe(1);
    expect(scored.quality.score).toBe(100);
  });

  it("handles undefined seo gracefully", () => {
    const product = makeProduct({ seo: undefined });
    const scored = scoreProduct(product);
    expect(scored.seoTitle).toBe("");
    expect(scored.seoDescription).toBe("");
    // Should have SEO findings
    expect(scored.quality.findings.some((f) => f.field === "seo_title")).toBe(
      true,
    );
  });
});

// ── RECOMMENDATION_THRESHOLD ────────────────────────────────────────────────

describe("Recommendation threshold", () => {
  it("is 70", () => {
    expect(RECOMMENDATION_THRESHOLD).toBe(70);
  });

  it("needsRecommendations true when score < threshold", () => {
    // Force a low score by removing many fields
    const result = evaluateProduct(
      makeProduct({
        title: "Short",
        description: "Too short",
        tags: [],
        images: { edges: [] },
        seo: { title: null, description: null },
      }),
    );
    expect(result.score).toBeLessThan(RECOMMENDATION_THRESHOLD);
    expect(result.needsRecommendations).toBe(true);
  });

  it("needsRecommendations false when score >= threshold", () => {
    const result = evaluateProduct(makeProduct());
    expect(result.score).toBeGreaterThanOrEqual(RECOMMENDATION_THRESHOLD);
    expect(result.needsRecommendations).toBe(false);
  });
});
