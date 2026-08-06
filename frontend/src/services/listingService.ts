/**
 * listingService.ts
 *
 * Calls the RojAI backend (POST /generate-listing) and (GET /usage).
 *
 * Authentication: Sends the Cognito ID token as a Bearer token.
 * The token is obtained from the auth context — never stored in this module.
 *
 * The backend returns `description`; the frontend type uses `fullDescription`.
 * The mapping is done here so neither the backend schema nor the frontend
 * components need to change.
 */

import type { ProductFormData, GeneratedListing } from "../types/listing";

// ── Backend response shape ───────────────────────────────────────────────────

interface BackendListing {
  title: string;
  bulletPoints: string[];
  description: string;
  seoKeywords: string[];
  tags: string[];
  metadata: {
    marketplace: string;
    language: string;
    tone: string;
    source: string;
  };
}

// ── Usage response shape ─────────────────────────────────────────────────────

export interface UsageInfo {
  plan: string;
  generationCount: number;
  monthlyLimit: number;
  regenerationLimit: number;
  resetDate: string;
  month: string;
}

// ── Error response shape ─────────────────────────────────────────────────────

interface BackendError {
  error: string | string[];
  limitReached?: boolean;
  regenerationLimitReached?: boolean;
  current?: number;
  limit?: number;
  resetsAt?: string;
  retryAfter?: number;
}

export interface GenerationError {
  message: string;
  limitReached?: boolean;
  regenerationLimitReached?: boolean;
  resetsAt?: string;
  retryAfter?: number;
}

// ── API URL ──────────────────────────────────────────────────────────────────

function getApiUrl(): string {
  const url = import.meta.env.VITE_API_BASE_URL;
  if (!url) {
    throw new Error(
      "VITE_API_BASE_URL is not set. " +
        "Add VITE_API_BASE_URL=http://localhost:8000 to frontend/.env.local " +
        "and restart the dev server."
    );
  }
  return url.replace(/\/$/, "");
}

// ── Generate listing ─────────────────────────────────────────────────────────

export async function generateListing(
  form: ProductFormData,
  idToken: string,
  options?: { idempotencyKey?: string; listingKey?: string }
): Promise<GeneratedListing> {
  const apiUrl = getApiUrl();
  const endpoint = `${apiUrl}/web/generate-listing`;

  const body: Record<string, unknown> = { ...form };
  if (options?.idempotencyKey) {
    body.idempotencyKey = options.idempotencyKey;
  }
  if (options?.listingKey) {
    body.listingKey = options.listingKey;
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    throw {
      message:
        "Could not reach the backend. Please check your connection and try again.",
    } as GenerationError;
  }

  if (!response.ok) {
    const errorData = await _extractError(response);
    throw errorData;
  }

  const data: BackendListing = await response.json();

  return {
    title: data.title,
    bulletPoints: data.bulletPoints,
    fullDescription: data.description,
    seoKeywords: data.seoKeywords,
    tags: data.tags,
  };
}

// ── Get usage ────────────────────────────────────────────────────────────────

export async function fetchUsage(idToken: string): Promise<UsageInfo> {
  const apiUrl = getApiUrl();
  const endpoint = `${apiUrl}/web/usage`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
  } catch {
    throw { message: "Could not reach the server." } as GenerationError;
  }

  if (!response.ok) {
    throw { message: "Failed to load usage information." } as GenerationError;
  }

  return response.json();
}

// ── Error extraction ─────────────────────────────────────────────────────────

async function _extractError(response: Response): Promise<GenerationError> {
  try {
    const body: BackendError = await response.json();
    const message = Array.isArray(body.error)
      ? body.error.join(" ")
      : typeof body.error === "string" && body.error.trim()
        ? body.error
        : _genericErrorMessage(response.status);

    return {
      message,
      limitReached: body.limitReached,
      regenerationLimitReached: body.regenerationLimitReached,
      resetsAt: body.resetsAt,
      retryAfter: body.retryAfter,
    };
  } catch {
    return { message: _genericErrorMessage(response.status) };
  }
}

function _genericErrorMessage(status: number): string {
  if (status === 401) return "Please sign in to generate listings.";
  if (status === 403) return "AI generation is temporarily disabled. Please try again later.";
  if (status === 429) return "You've reached your usage limit. Please try again later.";
  if (status === 409) return "This request was already processed.";
  if (status === 400) return "The request was invalid. Please check your inputs and try again.";
  if (status === 502) return "The AI service is temporarily unavailable. Please try again.";
  if (status === 500) return "An unexpected server error occurred. Please try again.";
  return "Something went wrong. Please try again.";
}
