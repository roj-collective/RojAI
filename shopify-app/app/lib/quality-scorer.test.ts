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
    title:
      "Handwoven Kilim Rug — Authentic Turkish Flat-Weave for Modern Boho Decor",
    description:
      "This is a beautifully handwoven kilim rug crafted by artisans in Eastern Turkey using traditional flat-weave techniques passed down through generations of skilled weavers.",
    descriptionHtml: "<p>Description</p>",
    status: "ACTIVE",
    vendor: "RojKilim",
    productType: "Home & Kitchen",
    tags: ["kilim-rug", "turkish-decor", "handwoven", "boho-home", "artisan"],
    totalInventory: 10,
    images: {
      edges: [{ node: { id: "img1" } }, { node: { id: "img2" } }],
    },
    variants: {
      edges: [{ node: { id: "var1" } }],
    },
    seo: {
      title: "Handwoven Kilim Rug | Authentic Turkish",
      description:
        "Shop our authentic handwoven kilim rugs crafted by Eastern Turkish artisans.",
    },
    ...overrides,
  };
}

// ── Complete product scores 100 ─────────────────────────────────────────────

describe("Complete product scoring 100", () => {
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

// ── Images: zero vs one ─────────────────────────────────────────────────────

describe("Images scoring", () => {
  it("deducts 15 points for zero images", () => {
    const result = evaluateProduct(makeProduct({ images: { edges: [] } }));
    const finding = result.findings.find((f) => f.field === "images");
    expect(finding).toBeDefined();
    expect(finding!.pointsDeducted).toBe(15);
    expect(finding!.severity).toBe("high");
    expect(result.score).toBe(85);
  });

  it("passes with one image", () => {
    const result = evaluateProduct(
      makeProduct({ images: { edges: [{ node: { id: "img1" } }] } }),
    );
    expect(result.findings.find((f) => f.field === "images")).toBeUndefined();
    expect(result.score).toBe(100);
  });

  it("passes with multiple images", () => {
    const result = evaluateProduct(makeProduct());
    expect(result.findings.find((f) => f.field === "images")).toBeUndefined();
  });
});

// ── Product type / category ─────────────────────────────────────────────────

describe("Product type scoring", () => {
  it("deducts 5 points for missing productType", () => {
    const result = evaluateProduct(makeProduct({ productType: "" }));
    const finding = result.findings.find((f) => f.field === "category");
    expect(finding).toBeDefined();
    expect(finding!.pointsDeducted).toBe(5);
    expect(finding!.severity).toBe("medium");
  });

  it("deducts 5 points for Uncategorized productType", () => {
    const result = evaluateProduct(makeProduct({ productType: "Uncategorized" }));
    const finding = result.findings.find((f) => f.field === "category");
    expect(finding).toBeDefined();
    expect(finding!.pointsDeducted).toBe(5);
  });

  it("passes with a set productType", () => {
    const result = evaluateProduct(makeProduct({ productType: "Rugs" }));
    expect(result.findings.find((f) => f.field === "category")).toBeUndefined();
  });
});

// ── Vendor ──────────────────────────────────────────────────────────────────

describe("Vendor scoring", () => {
  it("deducts 5 points for missing vendor", () => {
    const result = evaluateProduct(makeProduct({ vendor: "" }));
    const finding = result.findings.find((f) => f.field === "brand");
    expect(finding).toBeDefined();
    expect(finding!.pointsDeducted).toBe(5);
    expect(finding!.severity).toBe("medium");
  });

  it("passes with a set vendor", () => {
    const result = evaluateProduct(makeProduct({ vendor: "RojKilim" }));
    expect(result.findings.find((f) => f.field === "brand")).toBeUndefined();
  });
});

// ── Tags ────────────────────────────────────────────────────────────────────

describe("Tags scoring", () => {
  it("deducts 15 points for zero tags", () => {
    const result = evaluateProduct(makeProduct({ tags: [] }));
    const finding = result.findings.find((f) => f.field === "current_tags");
    expect(finding).toBeDefined();
    expect(finding!.pointsDeducted).toBe(15);
    expect(finding!.severity).toBe("high");
  });

  it("deducts partial points for fewer than 5 tags", () => {
    const result = evaluateProduct(makeProduct({ tags: ["a", "b", "c"] }));
    const finding = result.findings.find((f) => f.field === "current_tags");
    expect(finding).toBeDefined();
    expect(finding!.pointsDeducted).toBe(6); // round(15 * (1 - 3/5)) = 6
    expect(finding!.severity).toBe("medium");
  });

  it("passes with 5 tags", () => {
    const result = evaluateProduct(
      makeProduct({ tags: ["a", "b", "c", "d", "e"] }),
    );
    expect(
      result.findings.find((f) => f.field === "current_tags"),
    ).toBeUndefined();
  });
});

// ── SEO title ───────────────────────────────────────────────────────────────

describe("SEO title scoring", () => {
  it("deducts 8 points for missing SEO title", () => {
    const result = evaluateProduct(
      makeProduct({ seo: { title: null, description: "Some desc" } }),
    );
    const finding = result.findings.find((f) => f.field === "seo_title");
    expect(finding).toBeDefined();
    expect(finding!.pointsDeducted).toBe(8);
    expect(finding!.severity).toBe("medium");
  });

  it("deducts 8 points for empty string SEO title", () => {
    const result = evaluateProduct(
      makeProduct({ seo: { title: "", description: "Desc" } }),
    );
    const finding = result.findings.find((f) => f.field === "seo_title");
    expect(finding).toBeDefined();
    expect(finding!.pointsDeducted).toBe(8);
  });

  it("passes with a set SEO title", () => {
    const result = evaluateProduct(
      makeProduct({ seo: { title: "Great Title", description: "Desc" } }),
    );
    expect(
      result.findings.find((f) => f.field === "seo_title"),
    ).toBeUndefined();
  });
});

// ── SEO description ─────────────────────────────────────────────────────────

describe("SEO description scoring", () => {
  it("deducts 7 points for missing SEO description", () => {
    const result = evaluateProduct(
      makeProduct({ seo: { title: "Title", description: null } }),
    );
    const finding = result.findings.find((f) => f.field === "seo_description");
    expect(finding).toBeDefined();
    expect(finding!.pointsDeducted).toBe(7);
    expect(finding!.severity).toBe("medium");
  });

  it("passes with a set SEO description", () => {
    const result = evaluateProduct(
      makeProduct({ seo: { title: "T", description: "A valid desc" } }),
    );
    expect(
      result.findings.find((f) => f.field === "seo_description"),
    ).toBeUndefined();
  });
});

// ── Status: DRAFT and ARCHIVED ──────────────────────────────────────────────

describe("Status scoring", () => {
  it("deducts 5 points for DRAFT with low severity", () => {
    const result = evaluateProduct(makeProduct({ status: "DRAFT" }));
    const finding = result.findings.find((f) => f.field === "status");
    expect(finding).toBeDefined();
    expect(finding!.pointsDeducted).toBe(5);
    expect(finding!.severity).toBe("low");
  });

  it("deducts 5 points for ARCHIVED with medium severity", () => {
    const result = evaluateProduct(makeProduct({ status: "ARCHIVED" }));
    const finding = result.findings.find((f) => f.field === "status");
    expect(finding).toBeDefined();
    expect(finding!.pointsDeducted).toBe(5);
    expect(finding!.severity).toBe("medium");
  });

  it("does not penalize ACTIVE status", () => {
    const result = evaluateProduct(makeProduct({ status: "ACTIVE" }));
    expect(result.findings.find((f) => f.field === "status")).toBeUndefined();
  });
});

// ── Variants do not affect score ────────────────────────────────────────────

describe("Variants not affecting score", () => {
  it("zero variants does not deduct points", () => {
    const result = evaluateProduct(
      makeProduct({ variants: { edges: [] } }),
    );
    expect(result.findings.find((f) => f.field === "variants")).toBeUndefined();
    expect(result.score).toBe(100);
  });

  it("variant count is still available on scored product", () => {
    const scored = scoreProduct(makeProduct());
    expect(scored.variantCount).toBe(1);
  });
});

// ── Representative expected scores ──────────────────────────────────────────

describe("Expected scores matching backend", () => {
  it("product missing only images scores 85", () => {
    const result = evaluateProduct(makeProduct({ images: { edges: [] } }));
    expect(result.score).toBe(85);
  });

  it("product missing images + SEO title + SEO desc scores 70", () => {
    const result = evaluateProduct(
      makeProduct({
        images: { edges: [] },
        seo: { title: null, description: null },
      }),
    );
    expect(result.score).toBe(70);
  });

  it("product missing everything scores 0", () => {
    const result = evaluateProduct(
      makeProduct({
        title: "",
        description: "",
        tags: [],
        vendor: "",
        productType: "",
        images: { edges: [] },
        status: "ARCHIVED",
        seo: { title: null, description: null },
      }),
    );
    expect(result.score).toBe(0);
  });

  it("DRAFT product with all other fields complete scores 95", () => {
    const result = evaluateProduct(makeProduct({ status: "DRAFT" }));
    expect(result.score).toBe(95);
  });
});

// ── Score bounds ────────────────────────────────────────────────────────────

describe("Score bounds", () => {
  it("never exceeds 100", () => {
    expect(evaluateProduct(makeProduct()).score).toBeLessThanOrEqual(100);
  });

  it("never goes below 0", () => {
    const result = evaluateProduct(
      makeProduct({
        title: "",
        description: "",
        tags: [],
        vendor: "",
        productType: "",
        images: { edges: [] },
        status: "ARCHIVED",
        seo: { title: null, description: null },
      }),
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

// ── Threshold ───────────────────────────────────────────────────────────────

describe("Recommendation threshold", () => {
  it("is 70", () => {
    expect(RECOMMENDATION_THRESHOLD).toBe(70);
  });

  it("product at 70 does not need recommendations", () => {
    // images(0)=15 + seo_title(0)=8 + seo_desc(0)=7 = 30 deducted → 70
    const result = evaluateProduct(
      makeProduct({
        images: { edges: [] },
        seo: { title: null, description: null },
      }),
    );
    expect(result.score).toBe(70);
    expect(result.needsRecommendations).toBe(false);
  });

  it("product at 69 needs recommendations", () => {
    // 70 - vendor(5) = 65
    const result = evaluateProduct(
      makeProduct({
        images: { edges: [] },
        seo: { title: null, description: null },
        vendor: "",
      }),
    );
    expect(result.score).toBe(65);
    expect(result.needsRecommendations).toBe(true);
  });
});

// ── scoreProduct and getScoreBadge ──────────────────────────────────────────

describe("scoreProduct", () => {
  it("includes productType in scored product", () => {
    const scored = scoreProduct(makeProduct());
    expect(scored.productType).toBe("Home & Kitchen");
  });

  it("includes variantCount without scoring it", () => {
    const scored = scoreProduct(makeProduct({ variants: { edges: [] } }));
    expect(scored.variantCount).toBe(0);
    expect(scored.quality.score).toBe(100);
  });
});

describe("getScoreBadge", () => {
  it("returns correct tones", () => {
    expect(getScoreBadge(100).tone).toBe("success");
    expect(getScoreBadge(80).tone).toBe("success");
    expect(getScoreBadge(79).tone).toBe("warning");
    expect(getScoreBadge(60).tone).toBe("warning");
    expect(getScoreBadge(59).tone).toBe("critical");
    expect(getScoreBadge(0).tone).toBe("critical");
  });
});
