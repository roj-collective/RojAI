/**
 * authService.test.ts — Tests for registration name attribute,
 * display name extraction, and fallback behavior.
 */
import { describe, it, expect } from "vitest";

// We test getUserDisplayName directly since it's a pure function
// that doesn't require a real Cognito session — just a decoded payload.

// Mock a minimal CognitoUserSession-like object for getUserDisplayName
function mockSession(payload: Record<string, unknown>) {
  return {
    getIdToken: () => ({
      getJwtToken: () => "mock-token",
      decodePayload: () => payload,
    }),
    isValid: () => true,
  } as any;
}

// Import the function under test
// Note: We import dynamically to avoid triggering the CognitoUserPool constructor
describe("getUserDisplayName", () => {
  it("returns the name claim when present", async () => {
    const { getUserDisplayName } = await import("./authService");
    const session = mockSession({ name: "Azad Arslan", email: "azad@example.com" });
    expect(getUserDisplayName(session)).toBe("Azad Arslan");
  });

  it("trims whitespace from the name claim", async () => {
    const { getUserDisplayName } = await import("./authService");
    const session = mockSession({ name: "  Azad  ", email: "azad@example.com" });
    expect(getUserDisplayName(session)).toBe("Azad");
  });

  it("falls back to email prefix when name is empty string", async () => {
    const { getUserDisplayName } = await import("./authService");
    const session = mockSession({ name: "", email: "seller@rojkilim.com" });
    expect(getUserDisplayName(session)).toBe("seller");
  });

  it("falls back to email prefix when name is whitespace only", async () => {
    const { getUserDisplayName } = await import("./authService");
    const session = mockSession({ name: "   ", email: "hello@world.com" });
    expect(getUserDisplayName(session)).toBe("hello");
  });

  it("falls back to email prefix when name claim is missing", async () => {
    const { getUserDisplayName } = await import("./authService");
    const session = mockSession({ email: "test@example.org" });
    expect(getUserDisplayName(session)).toBe("test");
  });

  it("returns null when session is null", async () => {
    const { getUserDisplayName } = await import("./authService");
    expect(getUserDisplayName(null)).toBeNull();
  });

  it("returns null when both name and email are missing", async () => {
    const { getUserDisplayName } = await import("./authService");
    const session = mockSession({});
    expect(getUserDisplayName(session)).toBeNull();
  });
});

describe("signUp sends name attribute", () => {
  it("signUp function signature accepts name as third parameter", async () => {
    // This is a compile-time check — if signUp doesn't accept 3 args, TS would fail.
    // We verify the function exists with the correct arity.
    const mod = await import("./authService");
    expect(mod.signUp).toBeDefined();
    expect(mod.signUp.length).toBeGreaterThanOrEqual(3);
  });
});
