// ─── Product Input ──────────────────────────────────────────────────────────

export type Marketplace = "shopify" | "etsy" | "amazon";

export type Tone = "professional" | "luxury" | "friendly";

export type Language = "en" | "fr" | "de" | "es" | "it";

export interface ProductFormData {
  productName: string;
  description: string;
  category: string;
  brand: string;
  marketplace: Marketplace;
  language: Language;
  tone: Tone;
}

// ─── Generated Listing Output ────────────────────────────────────────────────

export interface GeneratedListing {
  title: string;
  bulletPoints: string[];
  fullDescription: string;
  seoKeywords: string[];
  tags: string[];
}

// ─── Service Response ────────────────────────────────────────────────────────

export type GenerationStatus = "idle" | "loading" | "success" | "error";

export interface GenerationState {
  status: GenerationStatus;
  listing: GeneratedListing | null;
  error: string | null;
}
