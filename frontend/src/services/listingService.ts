/**
 * listingService.ts
 *
 * Calls the RojAI backend (POST /generate-listing).
 *
 * Local development:
 *   Set VITE_API_URL=http://localhost:8000 in frontend/.env.local
 *   and run `USE_MOCK_BEDROCK=true python local_server.py` in the backend.
 *
 * Production:
 *   Set VITE_API_URL to the API Gateway invoke URL deployed by CDK.
 *
 * The backend returns `description`; the frontend type uses `fullDescription`.
 * The mapping is done here, in the service layer, so neither the backend
 * schema nor the frontend components need to change.
 */

import type { ProductFormData, GeneratedListing } from "../types/listing";

// ── Backend response shape (matches backend/schemas.py ListingResponse) ──────

interface BackendListing {
  title: string;
  bulletPoints: string[];
  description: string; // mapped → fullDescription below
  seoKeywords: string[];
  tags: string[];
  metadata: {
    marketplace: string;
    language: string;
    tone: string;
    source: string;
  };
}

interface BackendError {
  error: string | string[];
}

// ── API URL ───────────────────────────────────────────────────────────────────

function getApiUrl(): string {
  const url = import.meta.env.VITE_API_URL;
  if (!url) {
    throw new Error(
      "VITE_API_URL is not set. " +
        "Add VITE_API_URL=http://localhost:8000 to frontend/.env.local " +
        "and restart the dev server."
    );
  }
  return url.replace(/\/$/, ""); // strip trailing slash
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateListing(
  form: ProductFormData
): Promise<GeneratedListing> {
  const apiUrl = getApiUrl();
  const endpoint = `${apiUrl}/generate-listing`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
  } catch (networkErr) {
    throw new Error(
      "Could not reach the backend. " +
        "Make sure the local server is running on " +
        (import.meta.env.VITE_API_URL ?? "http://localhost:8000") +
        "."
    );
  }

  if (!response.ok) {
    const errorMessage = await _extractErrorMessage(response);
    throw new Error(errorMessage);
  }

  const data: BackendListing = await response.json();

  // Map backend field name to frontend type
  return {
    title: data.title,
    bulletPoints: data.bulletPoints,
    fullDescription: data.description, // ← the only name difference
    seoKeywords: data.seoKeywords,
    tags: data.tags,
  };
}

// ── Error extraction ──────────────────────────────────────────────────────────

async function _extractErrorMessage(response: Response): Promise<string> {
  try {
    const body: BackendError = await response.json();
    if (Array.isArray(body.error)) {
      return body.error.join(" ");
    }
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    // JSON parse failed — fall through to generic message
  }
  return _genericErrorMessage(response.status);
}

function _genericErrorMessage(status: number): string {
  if (status === 400) return "The request was invalid. Please check your inputs and try again.";
  if (status === 502) return "The AI service is temporarily unavailable. Please try again.";
  if (status === 500) return "An unexpected server error occurred. Please try again.";
  return "Something went wrong. Please try again.";
}
