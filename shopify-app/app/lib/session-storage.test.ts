/**
 * Integration tests for PostgreSQL session storage.
 *
 * These tests verify that Prisma session CRUD operations work correctly
 * against a PostgreSQL database. They require a running PostgreSQL instance
 * (from docker-compose.yml) with DATABASE_URL set.
 *
 * Run: DATABASE_URL="postgresql://rojai:rojai_dev@localhost:5432/rojai_dev" npm run test
 *
 * If PostgreSQL is not available, these tests are skipped gracefully.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";

const DATABASE_URL = process.env.DATABASE_URL;

/**
 * PostgreSQL integration tests.
 *
 * These require a running PostgreSQL instance (from docker-compose.yml).
 * They are automatically skipped if DATABASE_URL is not set.
 *
 * To run:
 *   docker compose up -d
 *   DATABASE_URL="postgresql://rojai:rojai_dev@localhost:5432/rojai_dev" npm run test
 */
describe.skipIf(!DATABASE_URL)("PostgreSQL session storage", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: DATABASE_URL! } },
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { shop: { startsWith: "test-" } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.session.deleteMany({ where: { shop: { startsWith: "test-" } } });
  });

  it("creates a session", async () => {
    const session = await prisma.session.create({
      data: {
        id: "offline_test-store.myshopify.com",
        shop: "test-store.myshopify.com",
        state: "active",
        isOnline: false,
        scope: "read_products",
        accessToken: "test-token-123",
      },
    });

    expect(session.id).toBe("offline_test-store.myshopify.com");
    expect(session.shop).toBe("test-store.myshopify.com");
    expect(session.scope).toBe("read_products");
    expect(session.accessToken).toBe("test-token-123");
  });

  it("finds a session by ID", async () => {
    await prisma.session.create({
      data: {
        id: "offline_test-find.myshopify.com",
        shop: "test-find.myshopify.com",
        state: "active",
        isOnline: false,
        accessToken: "find-token",
      },
    });

    const found = await prisma.session.findUnique({
      where: { id: "offline_test-find.myshopify.com" },
    });

    expect(found).not.toBeNull();
    expect(found!.shop).toBe("test-find.myshopify.com");
  });

  it("finds sessions by shop domain", async () => {
    await prisma.session.create({
      data: {
        id: "offline_test-shop.myshopify.com",
        shop: "test-shop.myshopify.com",
        state: "active",
        isOnline: false,
        accessToken: "shop-token",
      },
    });

    const sessions = await prisma.session.findMany({
      where: { shop: "test-shop.myshopify.com" },
    });

    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe("offline_test-shop.myshopify.com");
  });

  it("updates session scope", async () => {
    await prisma.session.create({
      data: {
        id: "offline_test-update.myshopify.com",
        shop: "test-update.myshopify.com",
        state: "active",
        isOnline: false,
        scope: "read_products",
        accessToken: "update-token",
      },
    });

    await prisma.session.update({
      where: { id: "offline_test-update.myshopify.com" },
      data: { scope: "read_products,write_products" },
    });

    const updated = await prisma.session.findUnique({
      where: { id: "offline_test-update.myshopify.com" },
    });

    expect(updated!.scope).toBe("read_products,write_products");
  });

  it("deletes all sessions for a shop (uninstall)", async () => {
    // Create multiple sessions for the same shop
    await prisma.session.createMany({
      data: [
        {
          id: "offline_test-uninstall.myshopify.com",
          shop: "test-uninstall.myshopify.com",
          state: "active",
          isOnline: false,
          accessToken: "token-1",
        },
        {
          id: "online_test-uninstall.myshopify.com_user1",
          shop: "test-uninstall.myshopify.com",
          state: "active",
          isOnline: true,
          accessToken: "token-2",
        },
      ],
    });

    // Verify both exist
    const before = await prisma.session.findMany({
      where: { shop: "test-uninstall.myshopify.com" },
    });
    expect(before.length).toBe(2);

    // Delete all sessions for this shop (simulates uninstall webhook)
    await prisma.session.deleteMany({
      where: { shop: "test-uninstall.myshopify.com" },
    });

    // Verify all deleted
    const after = await prisma.session.findMany({
      where: { shop: "test-uninstall.myshopify.com" },
    });
    expect(after.length).toBe(0);
  });

  it("handles non-existent session lookup gracefully", async () => {
    const found = await prisma.session.findUnique({
      where: { id: "does-not-exist" },
    });
    expect(found).toBeNull();
  });

  it("stores and retrieves DateTime fields", async () => {
    const expires = new Date("2026-08-01T00:00:00Z");

    await prisma.session.create({
      data: {
        id: "offline_test-dates.myshopify.com",
        shop: "test-dates.myshopify.com",
        state: "active",
        isOnline: false,
        accessToken: "date-token",
        expires,
      },
    });

    const found = await prisma.session.findUnique({
      where: { id: "offline_test-dates.myshopify.com" },
    });

    expect(found!.expires).toEqual(expires);
  });

  it("stores BigInt userId field", async () => {
    await prisma.session.create({
      data: {
        id: "offline_test-bigint.myshopify.com",
        shop: "test-bigint.myshopify.com",
        state: "active",
        isOnline: false,
        accessToken: "bigint-token",
        userId: BigInt("9007199254740993"),
      },
    });

    const found = await prisma.session.findUnique({
      where: { id: "offline_test-bigint.myshopify.com" },
    });

    expect(found!.userId).toBe(BigInt("9007199254740993"));
  });
});

/**
 * Migration verification test.
 * Verifies the Prisma schema is valid and can generate a client.
 * Does not require a running database.
 */
describe("Prisma schema validation", () => {
  it("schema provider is postgresql", async () => {
    const fs = await import("fs");
    const schema = fs.readFileSync(
      new URL("../../prisma/schema.prisma", import.meta.url),
      "utf-8",
    );
    expect(schema).toContain('provider = "postgresql"');
    expect(schema).toContain('env("DATABASE_URL")');
    expect(schema).not.toContain("sqlite");
  });

  it("migration SQL uses PostgreSQL syntax", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const migrationDir = path.resolve(
      new URL("../../prisma/migrations", import.meta.url).pathname,
    );
    const dirs = fs.readdirSync(migrationDir).filter((d: string) => d.startsWith("2025"));
    expect(dirs.length).toBeGreaterThan(0);

    const sql = fs.readFileSync(
      path.join(migrationDir, dirs[0], "migration.sql"),
      "utf-8",
    );
    expect(sql).toContain("TIMESTAMP(3)");
    expect(sql).toContain("CONSTRAINT");
    expect(sql).toContain("CREATE INDEX");
    expect(sql).not.toContain("DATETIME");
  });

  it("migration lock is postgresql", async () => {
    const fs = await import("fs");
    const lock = fs.readFileSync(
      new URL("../../prisma/migrations/migration_lock.toml", import.meta.url),
      "utf-8",
    );
    expect(lock).toContain('provider = "postgresql"');
  });
});
