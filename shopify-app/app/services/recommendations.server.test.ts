/**
 * Tests for the recommendations server-side service.
 *
 * Covers:
 * - Request mapping from Shopify product fields to API contract
 * - Missing ROJAI_API_URL configuration error
 * - Successful backend response handling
 * - Backend validation error handling
 * - Backend failure / network error handling
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mapProductToRequest,
  generateRecommendation,
  RecommendationApiError,
  ConfigurationError,
  stripHtml,
  type ProductInput,
  type RecommendationResponse,
} from "./recommendations.server";

// ── Request mapping ─────────────────────────────────────────────────────────

describe("mapProductToRequest", () => {
  it("maps all Shopify product fields to the API contract", () => {
    const product: ProductInput = {
      title: "Handwoven Kilim Rug — Turkish",
      description: "A beautiful handwoven rug crafted by artisans.",
      productType: "Home & Kitchen",
      vendor: "RojKilim",
    };

    const result = mapProductToRequest(product);

    expect(result).toEqual({
      productName: "Handwoven Kilim Rug — Turkish",
      description: "A beautiful handwoven rug crafted by artisans.",
      category: "Home & Kitchen",
      marketplace: "shopify",
      language: "en",
      tone: "professional",
      brand: "RojKilim",
    });
  });

  it("uses 'General' as category fallback when productType is empty", () => {
    const result = mapProductToRequest({
      title: "Product",
      description: "Desc",
      productType: "",
      vendor: "Brand",
    });

    expect(result.category).toBe("General");
  });

  it("uses fallback description when empty", () => {
    const result = mapProductToRequest({
      title: "Product",
      description: "",
      productType: "Type",
      vendor: "",
    });

    expect(result.description).toBe("(no description provided)");
  });

  it("omits brand when vendor is empty", () => {
    const result = mapProductToRequest({
      title: "Product",
      description: "Desc",
      productType: "Type",
      vendor: "",
    });

    expect(result.brand).toBeUndefined();
  });

  it("always sets marketplace to shopify", () => {
    const result = mapProductToRequest({
      title: "X",
      description: "Y",
      productType: "Z",
      vendor: "V",
    });

    expect(result.marketplace).toBe("shopify");
  });

  it("always sets language to en", () => {
    const result = mapProductToRequest({
      title: "X",
      description: "Y",
      productType: "Z",
      vendor: "V",
    });

    expect(result.language).toBe("en");
  });

  it("always sets tone to professional", () => {
    const result = mapProductToRequest({
      title: "X",
      description: "Y",
      productType: "Z",
      vendor: "V",
    });

    expect(result.tone).toBe("professional");
  });
});

// ── Missing environment variable ────────────────────────────────────────────

describe("generateRecommendation — missing ROJAI_API_URL", () => {
  const originalEnv = process.env.ROJAI_API_URL;

  beforeEach(() => {
    delete process.env.ROJAI_API_URL;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ROJAI_API_URL = originalEnv;
    } else {
      delete process.env.ROJAI_API_URL;
    }
  });

  it("throws ConfigurationError when ROJAI_API_URL is not set", async () => {
    await expect(
      generateRecommendation({
        title: "Test",
        description: "Test desc",
        productType: "Type",
        vendor: "Brand",
      }),
    ).rejects.toThrow(ConfigurationError);
  });

  it("includes a helpful message about the missing variable", async () => {
    await expect(
      generateRecommendation({
        title: "Test",
        description: "Test",
        productType: "Type",
        vendor: "",
      }),
    ).rejects.toThrow("ROJAI_API_URL");
  });
});

// ── Successful backend response ─────────────────────────────────────────────

describe("generateRecommendation — success", () => {
  const mockResponse: RecommendationResponse = {
    title: "Premium Handcrafted Kilim Rug — Authentic Turkish Artisan Design",
    bulletPoints: [
      "Handcrafted with traditional techniques",
      "Premium natural materials",
      "Unique artisan design",
      "Versatile styling",
      "Satisfaction guaranteed",
    ],
    description: "A stunning handcrafted kilim rug...",
    seoKeywords: ["kilim rug", "turkish rug", "handwoven", "artisan", "boho"],
    tags: ["kilim-rug", "turkish", "handwoven", "artisan", "home-decor"],
    metadata: {
      marketplace: "shopify",
      language: "en",
      tone: "professional",
      source: "bedrock",
    },
  };

  beforeEach(() => {
    process.env.ROJAI_API_URL = "https://test-api.example.com";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }),
    );
  });

  afterEach(() => {
    delete process.env.ROJAI_API_URL;
    vi.unstubAllGlobals();
  });

  it("returns the recommendation response on success", async () => {
    const result = await generateRecommendation({
      title: "Kilim Rug",
      description: "A handwoven rug",
      productType: "Home & Kitchen",
      vendor: "RojKilim",
    });

    expect(result.title).toBe(mockResponse.title);
    expect(result.bulletPoints).toHaveLength(5);
    expect(result.seoKeywords).toHaveLength(5);
    expect(result.tags).toHaveLength(5);
    expect(result.metadata.source).toBe("bedrock");
  });

  it("calls the correct endpoint", async () => {
    await generateRecommendation({
      title: "Test",
      description: "Desc",
      productType: "Type",
      vendor: "",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://test-api.example.com/generate-listing",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("sends the mapped product data in the request body", async () => {
    await generateRecommendation({
      title: "My Product",
      description: "Product description",
      productType: "Electronics",
      vendor: "BrandX",
    });

    const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body.productName).toBe("My Product");
    expect(body.description).toBe("Product description");
    expect(body.category).toBe("Electronics");
    expect(body.marketplace).toBe("shopify");
    expect(body.brand).toBe("BrandX");
  });
});

// ── Backend validation error (400) ──────────────────────────────────────────

describe("generateRecommendation — validation error", () => {
  beforeEach(() => {
    process.env.ROJAI_API_URL = "https://test-api.example.com";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "'productName' is required and must not be empty.",
          }),
      }),
    );
  });

  afterEach(() => {
    delete process.env.ROJAI_API_URL;
    vi.unstubAllGlobals();
  });

  it("throws RecommendationApiError with the validation message", async () => {
    await expect(
      generateRecommendation({
        title: "",
        description: "Desc",
        productType: "Type",
        vendor: "",
      }),
    ).rejects.toThrow(RecommendationApiError);
  });

  it("includes the server error message", async () => {
    try {
      await generateRecommendation({
        title: "",
        description: "Desc",
        productType: "Type",
        vendor: "",
      });
    } catch (err) {
      expect((err as RecommendationApiError).message).toContain(
        "productName",
      );
      expect((err as RecommendationApiError).statusCode).toBe(400);
      expect((err as RecommendationApiError).isRetryable).toBe(false);
    }
  });
});

// ── Backend failure (502) ───────────────────────────────────────────────────

describe("generateRecommendation — backend failure", () => {
  beforeEach(() => {
    process.env.ROJAI_API_URL = "https://test-api.example.com";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: () =>
          Promise.resolve({
            error: "AI generation failed. Please try again.",
          }),
      }),
    );
  });

  afterEach(() => {
    delete process.env.ROJAI_API_URL;
    vi.unstubAllGlobals();
  });

  it("throws a retryable error on 502", async () => {
    try {
      await generateRecommendation({
        title: "Product",
        description: "Desc",
        productType: "Type",
        vendor: "",
      });
    } catch (err) {
      expect((err as RecommendationApiError).statusCode).toBe(502);
      expect((err as RecommendationApiError).isRetryable).toBe(true);
    }
  });
});

// ── Network error ───────────────────────────────────────────────────────────

describe("generateRecommendation — network error", () => {
  beforeEach(() => {
    process.env.ROJAI_API_URL = "https://test-api.example.com";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );
  });

  afterEach(() => {
    delete process.env.ROJAI_API_URL;
    vi.unstubAllGlobals();
  });

  it("throws a retryable error on network failure", async () => {
    try {
      await generateRecommendation({
        title: "Product",
        description: "Desc",
        productType: "Type",
        vendor: "",
      });
    } catch (err) {
      expect(err).toBeInstanceOf(RecommendationApiError);
      expect((err as RecommendationApiError).isRetryable).toBe(true);
      expect((err as RecommendationApiError).statusCode).toBe(0);
    }
  });

  it("includes a user-friendly network error message", async () => {
    try {
      await generateRecommendation({
        title: "Product",
        description: "Desc",
        productType: "Type",
        vendor: "",
      });
    } catch (err) {
      expect((err as RecommendationApiError).message).toContain(
        "Unable to reach",
      );
    }
  });
});

// ── UI state logic ──────────────────────────────────────────────────────────

describe("Action response shape", () => {
  it("success response has ok:true and recommendation", () => {
    const success = {
      ok: true as const,
      recommendation: {
        title: "T",
        bulletPoints: ["1", "2", "3", "4", "5"],
        description: "D",
        seoKeywords: ["k"],
        tags: ["t"],
        metadata: {
          marketplace: "shopify",
          language: "en",
          tone: "professional",
          source: "bedrock" as const,
        },
      },
    };
    expect(success.ok).toBe(true);
    expect(success.recommendation.title).toBe("T");
  });

  it("error response has ok:false, error message, and isRetryable", () => {
    const error = {
      ok: false as const,
      error: "Something went wrong",
      isRetryable: true,
    };
    expect(error.ok).toBe(false);
    expect(error.error).toBe("Something went wrong");
    expect(error.isRetryable).toBe(true);
  });

  it("non-retryable error for configuration issues", () => {
    const error = {
      ok: false as const,
      error: "ROJAI_API_URL not set",
      isRetryable: false,
    };
    expect(error.isRetryable).toBe(false);
  });
});


// ── HTML stripping ──────────────────────────────────────────────────────────

describe("stripHtml", () => {
  it("removes HTML tags", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("decodes common HTML entities", () => {
    expect(stripHtml("Fish &amp; Chips &lt;3")).toBe("Fish & Chips <3");
  });

  it("collapses whitespace", () => {
    expect(stripHtml("<p>  spaced   out  </p>")).toBe("spaced out");
  });

  it("handles empty string", () => {
    expect(stripHtml("")).toBe("");
  });

  it("passes through plain text unchanged", () => {
    expect(stripHtml("No HTML here")).toBe("No HTML here");
  });
});

// ── Response validation ─────────────────────────────────────────────────────

describe("generateRecommendation — response validation", () => {
  beforeEach(() => {
    process.env.ROJAI_API_URL = "https://test-api.example.com";
  });

  afterEach(() => {
    delete process.env.ROJAI_API_URL;
    vi.unstubAllGlobals();
  });

  it("rejects response with missing title", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ bulletPoints: [], description: "D", seoKeywords: [], tags: [], metadata: {} }),
      }),
    );

    await expect(
      generateRecommendation({ title: "T", description: "D", productType: "P", vendor: "" }),
    ).rejects.toThrow("missing or empty title");
  });

  it("rejects response with empty bulletPoints array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ title: "T", bulletPoints: [], description: "D", seoKeywords: [], tags: [], metadata: {} }),
      }),
    );

    await expect(
      generateRecommendation({ title: "T", description: "D", productType: "P", vendor: "" }),
    ).rejects.toThrow("bulletPoints must be a non-empty array");
  });

  it("accepts a valid complete response", async () => {
    const validResponse = {
      title: "Good Title",
      bulletPoints: ["One", "Two", "Three"],
      description: "Good description",
      seoKeywords: ["kw1"],
      tags: ["tag1"],
      metadata: { marketplace: "shopify", language: "en", tone: "professional", source: "bedrock" },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(validResponse),
      }),
    );

    const result = await generateRecommendation({ title: "T", description: "D", productType: "P", vendor: "V" });
    expect(result.title).toBe("Good Title");
    expect(result.bulletPoints).toEqual(["One", "Two", "Three"]);
  });
});

// ── Timeout handling ────────────────────────────────────────────────────────

describe("generateRecommendation — timeout", () => {
  beforeEach(() => {
    process.env.ROJAI_API_URL = "https://test-api.example.com";
  });

  afterEach(() => {
    delete process.env.ROJAI_API_URL;
    vi.unstubAllGlobals();
  });

  it("throws a retryable timeout error when request is aborted", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    try {
      await generateRecommendation({ title: "T", description: "D", productType: "P", vendor: "" });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RecommendationApiError);
      expect((err as RecommendationApiError).message).toContain("timed out");
      expect((err as RecommendationApiError).isRetryable).toBe(true);
    }
  });
});
