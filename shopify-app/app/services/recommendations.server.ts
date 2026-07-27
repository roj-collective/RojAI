/**
 * recommendations.server.ts — Server-side client for the RojAI listing API.
 *
 * Calls the AWS API Gateway/Lambda endpoint to generate AI-powered
 * product listing recommendations via Amazon Bedrock.
 *
 * This module runs ONLY on the server (React Router action/loader).
 * ROJAI_API_URL is never exposed to the browser.
 *
 * SECURITY NOTE:
 * The backend API currently has NO authentication beyond CORS.
 * This is acceptable only for development-store testing.
 * TODO: Add API key or IAM-based authentication before any production
 * or beta merchant deployment.
 */

// ── Request types ───────────────────────────────────────────────────────────

export interface RecommendationRequest {
  productName: string;
  description: string;
  category: string;
  marketplace: "shopify";
  language: "en";
  tone: "professional" | "luxury" | "friendly";
  brand?: string;
}

// ── Response types ──────────────────────────────────────────────────────────

export interface RecommendationMetadata {
  marketplace: string;
  language: string;
  tone: string;
  source: "bedrock" | "mock";
}

export interface RecommendationResponse {
  title: string;
  bulletPoints: string[];
  description: string;
  seoKeywords: string[];
  tags: string[];
  metadata: RecommendationMetadata;
}

// ── Error types ─────────────────────────────────────────────────────────────

export class RecommendationApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly isRetryable: boolean,
  ) {
    super(message);
    this.name = "RecommendationApiError";
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

// ── Product mapping ─────────────────────────────────────────────────────────

export interface ProductInput {
  title: string;
  description: string;
  productType: string;
  vendor: string;
}

export function mapProductToRequest(product: ProductInput): RecommendationRequest {
  return {
    productName: product.title,
    description: product.description || "(no description provided)",
    category: product.productType || "General",
    marketplace: "shopify",
    language: "en",
    tone: "professional",
    brand: product.vendor || undefined,
  };
}

// ── Constants ───────────────────────────────────────────────────────────────

/** Server-side request timeout in milliseconds (50 seconds). */
const REQUEST_TIMEOUT_MS = 50_000;

// ── HTML stripping ──────────────────────────────────────────────────────────

/**
 * Strips HTML tags and collapses whitespace to produce readable plain text.
 * Used when the product description may contain HTML from Shopify.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Response validation ─────────────────────────────────────────────────────

/**
 * Runtime-validates the API response shape before rendering.
 * Throws RecommendationApiError if the response is malformed.
 */
function validateResponse(data: unknown): RecommendationResponse {
  if (!data || typeof data !== "object") {
    throw new RecommendationApiError(
      "Invalid response from AI service: expected an object.",
      200,
      true,
    );
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.title !== "string" || !obj.title) {
    throw new RecommendationApiError(
      "Invalid response: missing or empty title.",
      200,
      true,
    );
  }

  if (!Array.isArray(obj.bulletPoints) || obj.bulletPoints.length === 0) {
    throw new RecommendationApiError(
      "Invalid response: bulletPoints must be a non-empty array.",
      200,
      true,
    );
  }

  if (typeof obj.description !== "string" || !obj.description) {
    throw new RecommendationApiError(
      "Invalid response: missing or empty description.",
      200,
      true,
    );
  }

  if (!Array.isArray(obj.seoKeywords)) {
    throw new RecommendationApiError(
      "Invalid response: seoKeywords must be an array.",
      200,
      true,
    );
  }

  if (!Array.isArray(obj.tags)) {
    throw new RecommendationApiError(
      "Invalid response: tags must be an array.",
      200,
      true,
    );
  }

  return {
    title: obj.title,
    bulletPoints: obj.bulletPoints.filter((b): b is string => typeof b === "string"),
    description: obj.description,
    seoKeywords: obj.seoKeywords.filter((k): k is string => typeof k === "string"),
    tags: obj.tags.filter((t): t is string => typeof t === "string"),
    metadata: {
      marketplace: String((obj.metadata as Record<string, unknown>)?.marketplace ?? "shopify"),
      language: String((obj.metadata as Record<string, unknown>)?.language ?? "en"),
      tone: String((obj.metadata as Record<string, unknown>)?.tone ?? "professional"),
      source: ((obj.metadata as Record<string, unknown>)?.source === "mock" ? "mock" : "bedrock"),
    },
  };
}

// ── API client ──────────────────────────────────────────────────────────────

function getApiUrl(): string {
  const url = process.env.ROJAI_API_URL;
  if (!url) {
    throw new ConfigurationError(
      "ROJAI_API_URL environment variable is not set. " +
        "Set it to the API Gateway base URL (e.g. https://xxx.execute-api.us-east-1.amazonaws.com).",
    );
  }
  return url.replace(/\/$/, "");
}

export async function generateRecommendation(
  product: ProductInput,
): Promise<RecommendationResponse> {
  const apiUrl = getApiUrl();
  const endpoint = `${apiUrl}/generate-listing`;

  // Strip any HTML from the description before sending
  const cleanProduct: ProductInput = {
    ...product,
    description: stripHtml(product.description),
  };
  const body = mapProductToRequest(cleanProduct);

  // Set up timeout (Bedrock can take up to 45s on cold starts)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // API key for authentication.
  // In production (NODE_ENV=production), missing key is a configuration error.
  // In development, requests proceed without auth (backend has ROJAI_AUTH_DISABLED).
  const apiKey = process.env.ROJAI_API_KEY || "";
  if (!apiKey && process.env.NODE_ENV === "production") {
    throw new ConfigurationError(
      "ROJAI_API_KEY environment variable is not set. " +
        "Required for production API authentication.",
    );
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new RecommendationApiError(
        "The AI recommendation request timed out (50s). The service may be experiencing high load. Please try again.",
        0,
        true,
      );
    }
    throw new RecommendationApiError(
      "Unable to reach the AI recommendation service. Please check your network connection.",
      0,
      true,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.ok) {
    const rawData = await response.json();
    return validateResponse(rawData);
  }

  // Handle error responses
  let errorMessage: string;
  try {
    const errorBody = await response.json();
    errorMessage =
      typeof errorBody.error === "string"
        ? errorBody.error
        : Array.isArray(errorBody.error)
          ? errorBody.error.join(" ")
          : `API returned status ${response.status}`;
  } catch {
    errorMessage = `API returned status ${response.status}`;
  }

  const isRetryable = response.status >= 500 || response.status === 502;

  throw new RecommendationApiError(errorMessage, response.status, isRetryable);
}
