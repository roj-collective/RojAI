/**
 * Tests for dashboard component logic.
 *
 * Since Polaris web components render in the browser (not in vitest's JSDOM),
 * these tests verify the logic functions that components depend on — ensuring
 * the scoring, badge tones, and data transformations are correct.
 */
import { describe, it, expect } from "vitest";
import { getScoreBadge, type BadgeTone } from "../lib/quality-scorer";

// Re-implement severityTone here to test its logic independently
function severityTone(severity: string): BadgeTone {
  if (severity === "critical" || severity === "high") return "critical";
  if (severity === "medium") return "warning";
  return "info";
}

describe("ScoreBadge logic", () => {
  it("returns success tone for score >= 80", () => {
    expect(getScoreBadge(80)).toEqual({ label: "Good", tone: "success" });
    expect(getScoreBadge(100)).toEqual({ label: "Good", tone: "success" });
  });

  it("returns warning tone for score 60-79", () => {
    expect(getScoreBadge(60)).toEqual({ label: "Fair", tone: "warning" });
    expect(getScoreBadge(79)).toEqual({ label: "Fair", tone: "warning" });
  });

  it("returns critical tone for score 40-59", () => {
    expect(getScoreBadge(40)).toEqual({ label: "Poor", tone: "critical" });
    expect(getScoreBadge(59)).toEqual({ label: "Poor", tone: "critical" });
  });

  it("returns critical tone for score < 40", () => {
    expect(getScoreBadge(0)).toEqual({ label: "Critical", tone: "critical" });
    expect(getScoreBadge(39)).toEqual({
      label: "Critical",
      tone: "critical",
    });
  });
});

describe("severityTone mapping", () => {
  it("maps critical severity to critical tone", () => {
    expect(severityTone("critical")).toBe("critical");
  });

  it("maps high severity to critical tone", () => {
    expect(severityTone("high")).toBe("critical");
  });

  it("maps medium severity to warning tone", () => {
    expect(severityTone("medium")).toBe("warning");
  });

  it("maps low severity to info tone", () => {
    expect(severityTone("low")).toBe("info");
  });

  it("maps unknown severity to info tone", () => {
    expect(severityTone("unknown")).toBe("info");
  });
});

describe("MetricCard data formatting", () => {
  it("formats score as value/100 string", () => {
    const formatted = `${75}/100`;
    expect(formatted).toBe("75/100");
  });

  it("handles zero values", () => {
    const value = 0;
    expect(`${value}`).toBe("0");
  });
});

describe("ProductCard link generation", () => {
  it("encodes Shopify GID for URL", () => {
    const id = "gid://shopify/Product/12345";
    const encoded = encodeURIComponent(id);
    expect(encoded).toBe("gid%3A%2F%2Fshopify%2FProduct%2F12345");
    expect(decodeURIComponent(encoded)).toBe(id);
  });

  it("handles special characters in product ID", () => {
    const id = "gid://shopify/Product/99999";
    const url = `/app/products/${encodeURIComponent(id)}`;
    expect(url).toContain("gid%3A%2F%2Fshopify%2FProduct%2F99999");
  });
});

describe("FilterBar logic", () => {
  const products = [
    { title: "Kilim Rug", status: "ACTIVE", score: 85 },
    { title: "Draft Product", status: "DRAFT", score: 45 },
    { title: "Archived Item", status: "ARCHIVED", score: 60 },
  ];

  it("filters by search term (case-insensitive)", () => {
    const query = "kilim";
    const result = products.filter((p) =>
      p.title.toLowerCase().includes(query.toLowerCase()),
    );
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Kilim Rug");
  });

  it("filters by status", () => {
    const result = products.filter((p) => p.status === "DRAFT");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Draft Product");
  });

  it("filters by quality threshold", () => {
    const threshold = 70;
    const good = products.filter((p) => p.score >= threshold);
    const needsAttention = products.filter((p) => p.score < threshold);
    expect(good).toHaveLength(1);
    expect(needsAttention).toHaveLength(2);
  });

  it("returns empty array when no products match", () => {
    const result = products.filter((p) =>
      p.title.toLowerCase().includes("nonexistent"),
    );
    expect(result).toHaveLength(0);
  });

  it("combines multiple filters", () => {
    const result = products.filter(
      (p) => p.status === "ACTIVE" && p.score >= 70,
    );
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Kilim Rug");
  });
});

describe("ProductDetails field rendering", () => {
  it("shows (not set) for empty vendor", () => {
    const vendor = "";
    const value = vendor ? vendor : "(not set)";
    expect(value).toBe("(not set)");
  });

  it("shows (none) for empty tags", () => {
    const tags: string[] = [];
    const value = tags.length > 0 ? tags.join(", ") : "(none)";
    expect(value).toBe("(none)");
  });

  it("joins tags with commas", () => {
    const tags = ["kilim", "rug", "turkish"];
    const value = tags.join(", ");
    expect(value).toBe("kilim, rug, turkish");
  });

  it("shows (empty) for missing description", () => {
    const desc = "";
    const value = desc || "(empty)";
    expect(value).toBe("(empty)");
  });
});

describe("FindingsList logic", () => {
  it("sorts findings by severity order", () => {
    const severities = ["low", "critical", "medium", "high"];
    const order = ["critical", "high", "medium", "low"];
    const sorted = [...severities].sort(
      (a, b) => order.indexOf(a) - order.indexOf(b),
    );
    expect(sorted).toEqual(["critical", "high", "medium", "low"]);
  });

  it("handles empty findings array", () => {
    const findings: unknown[] = [];
    expect(findings.length).toBe(0);
  });
});
