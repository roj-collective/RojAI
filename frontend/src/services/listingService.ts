/**
 * listingService.ts
 *
 * Mock listing-generation service.
 * Simulates a 1.8 s network round-trip and returns realistic copy
 * derived from the form inputs.  No AWS calls are made here —
 * replace `generateListing` body with a real fetch to API Gateway
 * when the backend is ready.
 */

import type { ProductFormData, GeneratedListing } from "../types/listing";

const MOCK_DELAY_MS = 1800;

// ─── Tone copy helpers ────────────────────────────────────────────────────────

function toneOpener(tone: string): string {
  switch (tone) {
    case "luxury":
      return "Indulge in the pinnacle of craftsmanship with the";
    case "friendly":
      return "Say hello to your new favourite —";
    default:
      return "Introducing the";
  }
}

function toneDescription(tone: string, name: string, desc: string): string {
  switch (tone) {
    case "luxury":
      return `Crafted for the discerning individual, the ${name} elevates every moment. ${desc} Expect nothing less than exceptional.`;
    case "friendly":
      return `We know you're going to love the ${name}! ${desc} It's the kind of product that makes your day a little bit better.`;
    default:
      return `The ${name} is engineered to deliver consistent, reliable performance. ${desc} Designed with professionals in mind.`;
  }
}

// ─── Marketplace keyword shaping ─────────────────────────────────────────────

function marketplaceTitle(
  base: string,
  marketplace: string,
  brand: string
): string {
  switch (marketplace) {
    case "amazon":
      return `${brand ? brand + " " : ""}${base} | Premium Quality | Fast Shipping`;
    case "etsy":
      return `${base} – Handcrafted ${brand ? "by " + brand : "Gift"} | Ready to Ship`;
    default:
      return `${brand ? brand + " – " : ""}${base}`;
  }
}

// ─── Main service function ────────────────────────────────────────────────────

export async function generateListing(
  form: ProductFormData
): Promise<GeneratedListing> {
  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));

  const { productName, description, category, brand, marketplace, tone } = form;

  const title = marketplaceTitle(
    `${productName} — ${category}`,
    marketplace,
    brand
  );

  const bulletPoints = [
    `${toneOpener(tone)} ${productName} — built for performance and reliability`,
    `Perfect for ${category} enthusiasts seeking a premium experience`,
    description
      ? `${description.slice(0, 80)}${description.length > 80 ? "…" : ""}`
      : `Versatile design fits seamlessly into any workflow or lifestyle`,
    `${brand ? brand + " quality " : ""}backed by exceptional craftsmanship and attention to detail`,
    `Available exclusively for ${
      marketplace.charAt(0).toUpperCase() + marketplace.slice(1)
    } — order yours today`,
  ];

  const fullDescription = toneDescription(tone, productName, description);

  const seoKeywords = [
    productName.toLowerCase(),
    category.toLowerCase(),
    brand ? brand.toLowerCase() : "premium",
    marketplace,
    tone,
    `buy ${productName.toLowerCase()}`,
    `best ${category.toLowerCase()} ${new Date().getFullYear()}`,
    `${marketplace} ${category.toLowerCase()}`,
  ].filter(Boolean);

  const tags = [
    productName.split(" ")[0].toLowerCase(),
    category.toLowerCase().replace(/\s+/g, "-"),
    brand ? brand.toLowerCase() : "unbranded",
    marketplace,
    tone === "luxury" ? "premium" : tone === "friendly" ? "everyday" : "professional",
    "new-arrival",
    "top-rated",
  ];

  return { title, bulletPoints, fullDescription, seoKeywords, tags };
}
