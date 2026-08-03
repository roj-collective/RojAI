/**
 * Tests for the GDPR compliance webhook handler.
 *
 * Covers:
 * - CUSTOMERS_DATA_REQUEST: acknowledges with no-op (no customer data stored)
 * - CUSTOMERS_REDACT: acknowledges with no-op (no customer data stored)
 * - SHOP_REDACT: deletes all shop sessions, idempotent on repeat delivery
 * - Authentication: invalid webhook requests are rejected by authenticate.webhook()
 * - Unknown topics return 404
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the shopify.server module (authenticate.webhook handles HMAC verification)
const mockAuthenticateWebhook = vi.fn();
vi.mock("../shopify.server", () => ({
  authenticate: {
    webhook: (...args: unknown[]) => mockAuthenticateWebhook(...args),
  },
}));

// Mock the database module
const mockDeleteMany = vi.fn();
vi.mock("../db.server", () => ({
  default: {
    session: {
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}));

// Import the action after mocks are set up
import { action } from "./webhooks.compliance";

function buildActionArgs(requestOverride?: Request) {
  const request =
    requestOverride ??
    new Request("https://rojai-shopify.onrender.com/webhooks/compliance", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-topic": "customers/data_request",
        "x-shopify-hmac-sha256": "valid-hmac-signature",
        "x-shopify-shop-domain": "test-shop.myshopify.com",
      },
      body: JSON.stringify({ shop_domain: "test-shop.myshopify.com" }),
    });

  return {
    request,
    params: {},
    context: {},
    url: new URL("https://rojai-shopify.onrender.com/webhooks/compliance"),
    pattern: "/webhooks/compliance",
  } as Parameters<typeof action>[0];
}

describe("webhooks.compliance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  describe("CUSTOMERS_DATA_REQUEST", () => {
    it("acknowledges the request with 200 (no customer data stored)", async () => {
      mockAuthenticateWebhook.mockResolvedValue({
        topic: "CUSTOMERS_DATA_REQUEST",
        shop: "test-shop.myshopify.com",
      });

      const response = await action(buildActionArgs());

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("No customer data stored");
      expect(mockDeleteMany).not.toHaveBeenCalled();
    });
  });

  describe("CUSTOMERS_REDACT", () => {
    it("acknowledges the request with 200 (no customer data stored)", async () => {
      mockAuthenticateWebhook.mockResolvedValue({
        topic: "CUSTOMERS_REDACT",
        shop: "test-shop.myshopify.com",
      });

      const response = await action(buildActionArgs());

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("No customer data stored");
      expect(mockDeleteMany).not.toHaveBeenCalled();
    });
  });

  describe("SHOP_REDACT", () => {
    it("deletes all sessions for the shop", async () => {
      mockAuthenticateWebhook.mockResolvedValue({
        topic: "SHOP_REDACT",
        shop: "test-shop.myshopify.com",
      });
      mockDeleteMany.mockResolvedValue({ count: 3 });

      const response = await action(buildActionArgs());

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("Shop data deleted");
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { shop: "test-shop.myshopify.com" },
      });
    });

    it("succeeds idempotently when no records exist (repeated delivery)", async () => {
      mockAuthenticateWebhook.mockResolvedValue({
        topic: "SHOP_REDACT",
        shop: "already-deleted-shop.myshopify.com",
      });
      mockDeleteMany.mockResolvedValue({ count: 0 });

      const response = await action(buildActionArgs());

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("Shop data deleted");
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { shop: "already-deleted-shop.myshopify.com" },
      });
    });

    it("handles repeated delivery for the same shop gracefully", async () => {
      mockAuthenticateWebhook.mockResolvedValue({
        topic: "SHOP_REDACT",
        shop: "test-shop.myshopify.com",
      });

      // First delivery deletes records
      mockDeleteMany.mockResolvedValueOnce({ count: 5 });
      const response1 = await action(buildActionArgs());
      expect(response1.status).toBe(200);

      // Second delivery finds nothing — still succeeds
      mockDeleteMany.mockResolvedValueOnce({ count: 0 });
      const response2 = await action(buildActionArgs());
      expect(response2.status).toBe(200);
    });
  });

  describe("Authentication (HMAC verification)", () => {
    it("rejects requests with invalid signatures (authenticate.webhook throws)", async () => {
      const unauthorizedResponse = new Response("Unauthorized", { status: 401 });
      mockAuthenticateWebhook.mockRejectedValue(unauthorizedResponse);

      await expect(action(buildActionArgs())).rejects.toEqual(
        unauthorizedResponse,
      );

      expect(mockDeleteMany).not.toHaveBeenCalled();
    });

    it("rejects requests with missing HMAC header", async () => {
      const unauthorizedResponse = new Response("Unauthorized", { status: 401 });
      mockAuthenticateWebhook.mockRejectedValue(unauthorizedResponse);

      const bareRequest = new Request(
        "https://rojai-shopify.onrender.com/webhooks/compliance",
        { method: "POST", body: "{}" },
      );

      await expect(action(buildActionArgs(bareRequest))).rejects.toEqual(
        unauthorizedResponse,
      );
    });
  });

  describe("Unknown topics", () => {
    it("returns 404 for unhandled compliance topics", async () => {
      mockAuthenticateWebhook.mockResolvedValue({
        topic: "UNKNOWN_TOPIC",
        shop: "test-shop.myshopify.com",
      });

      const response = await action(buildActionArgs());

      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Unhandled compliance topic");
    });
  });
});
