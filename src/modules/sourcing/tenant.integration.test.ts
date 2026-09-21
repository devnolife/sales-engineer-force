import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fetch as httpFetch, Response } from "undici";
import { z } from "zod";
import { requireOrgContext } from "@/lib/org-context";
import { ambilDetailTokoAction, cariVendorAction } from "./actions";
import { vendorResultSchema } from "./schema";
import fixtures from "./__fixtures__/firecrawl-contract.json";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/org-context", () => ({ requireOrgContext: vi.fn() }));
vi.mock("undici", async (importOriginal) => ({
  ...await importOriginal<typeof import("undici")>(),
  fetch: vi.fn(),
}));

const http = vi.mocked(httpFetch);
const searchResponse = {
  ...fixtures.search,
  results: [...fixtures.search.results, {
    ...fixtures.search.results[0],
    productName: "Dosing pump USD",
    sourceUrl: fixtures.detailUsd.result.sourceUrl,
  }],
};

describe.runIf(process.env.RUN_DB_TESTS === "1")("scoped sourcing persistence", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let orgDb: typeof import("@/lib/tenant").orgDb;
  let ctx: Awaited<ReturnType<typeof requireOrgContext>>;
  let otherOrg: string;

  beforeAll(async () => {
    if (process.env.DATABASE_URL !== "file:../.data/sourcing-test.db") {
      throw new Error("Use the disposable DATABASE_URL=file:../.data/sourcing-test.db for sourcing tests.");
    }
    ({ prisma } = await import("@/lib/db"));
    ({ orgDb } = await import("@/lib/tenant"));
  });

  beforeEach(async () => {
    const orgId = `sourcing-it-${randomUUID()}`;
    otherOrg = `sourcing-it-${randomUUID()}`;
    ctx = {
      orgId, db: orgDb(orgId), userId: "sourcing-test-user", userName: "Test",
      userEmail: "test@example.com", role: "member",
    };
    vi.mocked(requireOrgContext).mockResolvedValue(ctx);
    vi.stubEnv("SOURCING_MODE", "live");
    vi.stubEnv("CORE_AI_URL", "http://core-ai.test");
    vi.stubEnv("SOURCING_MARGIN_PERCENT", "25");
    http.mockReset();
    http.mockImplementation(async () => Response.json(searchResponse));
    await prisma.vendor.create({
      data: {
        organizationId: orgId, name: "Vendor internal A",
        products: { create: [
          { organizationId: orgId, name: "Pompa internal IDR", price: "100000", currency: "IDR" },
          { organizationId: orgId, name: "Pompa internal USD", price: "25000.50", currency: "USD" },
        ] },
      },
    });
    await prisma.vendor.create({
      data: {
        organizationId: otherOrg, name: "Vendor organisasi lain",
        products: { create: {
          organizationId: otherOrg, name: "Pompa organisasi lain", price: "900000",
        } },
      },
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    if (!ctx) return;
    const where = { organizationId: { in: [ctx.orgId, otherOrg] } };
    await prisma.aiLog.deleteMany({ where });
    await prisma.sourcingSearch.deleteMany({ where });
    await prisma.vendor.deleteMany({ where });
    await prisma.inquiry.deleteMany({ where });
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  async function search() {
    const outcome = await cariVendorAction("  pompa dosing  ");
    expect(outcome.status).toBe("complete");
    if (outcome.status === "error") throw new Error(outcome.error.message);
    return outcome.data;
  }

  async function stored(searchId: string) {
    const snapshot = await ctx.db.sourcingSearch.findFirstOrThrow({ where: { id: searchId } });
    return { snapshot, results: z.array(vendorResultSchema).parse(JSON.parse(snapshot.resultsJson)) };
  }

  it("keeps internal results first, preserves currency, and stores actual provider and generated IDs", async () => {
    const data = await search();
    expect(data.provider).toBe("firecrawl");
    expect(data.marginPercent).toBe(25);
    expect(data.results).toHaveLength(4);
    expect(data.results.slice(0, 2).every((r) => r.sourceType === "INTERNAL")).toBe(true);
    expect(data.results.slice(2).every((r) => r.priceStatus === "pending" && !r.price)).toBe(true);
    expect(new Set(data.results.map((r) => r.id)).size).toBe(4);
    expect(data.results.find((r) => r.productName === "Pompa internal IDR"))
      .toMatchObject({ currency: "IDR", suggestedPrice: "125000", marginPercent: 25 });
    expect(data.results.find((r) => r.productName === "Pompa internal USD")?.suggestedPrice).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain("organisasi lain");
    const { snapshot, results } = await stored(data.searchId);
    expect(snapshot.provider).toBe("firecrawl");
    expect(results).toEqual(data.results);
    expect(await ctx.db.aiLog.findMany()).toMatchObject([{
      kind: "VENDOR_SEARCH", provider: "firecrawl", outputSummary: expect.stringContaining("complete"),
    }]);
    expect(http).toHaveBeenCalledOnce();
  });

  it("retains internal results and an explicit partial warning after a web failure", async () => {
    http.mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    const outcome = await cariVendorAction("pompa");
    expect(outcome).toMatchObject({
      status: "partial", error: { code: "TIMEOUT" },
      data: { provider: "firecrawl", results: [expect.any(Object), expect.any(Object)] },
    });
    expect((await ctx.db.aiLog.findFirstOrThrow()).outputSummary).toContain("TIMEOUT");
    expect((await ctx.db.aiLog.findFirstOrThrow()).outputSummary).not.toContain("mock");
  });

  it("distinguishes valid empty web results from provider failure", async () => {
    http.mockImplementation(async () => Response.json({ provider: "firecrawl", results: [] }));
    const outcome = await cariVendorAction("barang-tidak-ada");
    expect(outcome).toMatchObject({ status: "complete", data: { results: [] } });
  });

  it("checks invalid query and foreign inquiry ownership before external access", async () => {
    expect(await cariVendorAction("ab")).toMatchObject({ status: "error", error: { code: "INVALID_INPUT" } });
    const inquiry = await prisma.inquiry.create({
      data: {
        organizationId: otherOrg, createdById: "sourcing-test-user",
        items: { create: { organizationId: otherOrg, lineNo: 1, rawText: "pompa", name: "Pompa" } },
      },
      include: { items: true },
    });
    expect(await cariVendorAction("pompa", inquiry.items[0].id))
      .toMatchObject({ status: "error", error: { code: "NOT_FOUND" } });
    expect(http).not.toHaveBeenCalled();
    expect(await ctx.db.sourcingSearch.count()).toBe(0);
  });

  it("limits live search to ten calls per organization without blocking internal data", async () => {
    for (let i = 0; i < 10; i++) await search();
    expect(await cariVendorAction("pompa")).toMatchObject({
      status: "partial", error: { code: "RATE_LIMITED", retryAfterSeconds: expect.any(Number) },
      data: { results: [expect.any(Object), expect.any(Object)] },
    });
    expect(http).toHaveBeenCalledTimes(10);
  });

  it("fetches one stored public result and audits an authoritative observation", async () => {
    const data = await search();
    const web = data.results[2];
    http.mockReset();
    http.mockResolvedValue(Response.json(fixtures.detailIdr));
    expect(await ambilDetailTokoAction({ searchId: data.searchId, resultId: web.id })).toMatchObject({
      status: "complete",
      result: { id: web.id, currency: "IDR", price: "1250000", suggestedPrice: "1563000", marginPercent: 25 },
    });
    expect(http).toHaveBeenCalledOnce();
    expect(http).toHaveBeenCalledWith("http://core-ai.test/v1/sourcing/scrape-detail", expect.objectContaining({
      body: JSON.stringify({ query: "pompa dosing", url: web.sourceUrl }),
    }));
    expect((await stored(data.searchId)).results[2].priceStatus).toBe("available");
    expect(await ctx.db.aiLog.count({ where: { kind: "VENDOR_DETAIL" } })).toBe(1);
  });

  it("returns the actual per-result margin even when configuration changed after search", async () => {
    const data = await search();
    vi.stubEnv("SOURCING_MARGIN_PERCENT", "10");
    http.mockResolvedValue(Response.json(fixtures.detailIdr));
    const outcome = await ambilDetailTokoAction({ searchId: data.searchId, resultId: data.results[2].id });
    expect(outcome).toMatchObject({
      status: "complete", result: { suggestedPrice: "1375000", marginPercent: 10 },
    });
    expect((await stored(data.searchId)).results.find((r) => r.sourceType === "INTERNAL" && r.currency === "IDR"))
      .toMatchObject({ suggestedPrice: "125000", marginPercent: 25 });
  });

  it("rejects cross-organization, internal and legacy result references before network access", async () => {
    const data = await search();
    http.mockClear();
    vi.mocked(requireOrgContext).mockResolvedValue({ ...ctx, orgId: otherOrg, db: orgDb(otherOrg) });
    expect(await ambilDetailTokoAction({ searchId: data.searchId, resultId: data.results[2].id }))
      .toMatchObject({ status: "error", error: { code: "NOT_FOUND" } });
    vi.mocked(requireOrgContext).mockResolvedValue(ctx);
    expect(await ambilDetailTokoAction({ searchId: data.searchId, resultId: data.results[0].id }))
      .toMatchObject({ status: "error", error: { code: "NOT_ALLOWED" } });
    const legacy = await ctx.db.sourcingSearch.create({
      data: {
        organizationId: ctx.orgId, query: "pompa", provider: "firecrawl",
        resultsJson: JSON.stringify(fixtures.search.results), createdById: ctx.userId,
      },
    });
    expect(await ambilDetailTokoAction({ searchId: legacy.id, resultId: "0" }))
      .toMatchObject({ status: "error", error: { code: "NOT_ALLOWED" } });
    expect(http).not.toHaveBeenCalled();
  });

  it("clears an earlier price, currency, suggestion and margin after a successful unavailable observation", async () => {
    const data = await search();
    const input = { searchId: data.searchId, resultId: data.results[2].id };
    http.mockResolvedValueOnce(Response.json(fixtures.detailIdr));
    await ambilDetailTokoAction(input);
    http.mockResolvedValueOnce(Response.json(fixtures.detailUnavailable));
    const outcome = await ambilDetailTokoAction(input);
    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete") throw new Error("Expected stored observation");
    expect(outcome.result.priceStatus).toBe("unavailable");
    expect(outcome.result.price).toBeUndefined();
    expect(outcome.result.currency).toBeUndefined();
    expect(outcome.result.suggestedPrice).toBeUndefined();
    expect(outcome.result.marginPercent).toBeUndefined();
    expect((await stored(data.searchId)).results[2]).toEqual(outcome.result);
  });

  it("leaves the prior observation and timestamp unchanged when refresh fails", async () => {
    const data = await search();
    const input = { searchId: data.searchId, resultId: data.results[2].id };
    http.mockResolvedValueOnce(Response.json(fixtures.detailIdr));
    await ambilDetailTokoAction(input);
    const before = (await stored(data.searchId)).snapshot.resultsJson;
    http.mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    expect(await ambilDetailTokoAction(input)).toMatchObject({ status: "error", error: { code: "TIMEOUT" } });
    expect((await stored(data.searchId)).snapshot.resultsJson).toBe(before);
  });

  it("limits detail to twenty provider calls per organization", async () => {
    const data = await search();
    http.mockReset();
    http.mockImplementation(async () => Response.json(fixtures.detailUnavailable));
    const input = { searchId: data.searchId, resultId: data.results[2].id };
    for (let i = 0; i < 20; i++) expect((await ambilDetailTokoAction(input)).status).toBe("complete");
    expect(await ambilDetailTokoAction(input)).toMatchObject({
      status: "error", error: { code: "RATE_LIMITED", retryAfterSeconds: expect.any(Number) },
    });
    expect(http).toHaveBeenCalledTimes(20);
  });

  it("merges parallel detail updates to different results without repeating either paid request", async () => {
    const data = await search();
    const barrier: Array<() => void> = [];
    http.mockReset();
    http.mockImplementation(async (_url, options) => {
      const body = z.object({ url: z.string() }).parse(JSON.parse(String(options?.body)));
      await new Promise<void>((resolve) => {
        barrier.push(resolve);
        if (barrier.length === 2) barrier.forEach((release) => release());
      });
      return Response.json(body.url === fixtures.detailUsd.result.sourceUrl ? fixtures.detailUsd : fixtures.detailIdr);
    });
    const outcomes = await Promise.all(data.results.slice(2).map((r) =>
      ambilDetailTokoAction({ searchId: data.searchId, resultId: r.id })));
    expect(outcomes.every((o) => o.status === "complete")).toBe(true);
    const updated = (await stored(data.searchId)).results.slice(2);
    expect(updated.map((r) => r.priceStatus)).toEqual(["available", "available"]);
    expect(updated[1]).toMatchObject({ currency: "USD", price: "99.90" });
    expect(updated[1].suggestedPrice).toBeUndefined();
    expect(http).toHaveBeenCalledTimes(2);
  });

  it("rolls back a search snapshot when its audit insertion fails", async () => {
    await prisma.$executeRawUnsafe("CREATE TRIGGER sourcing_test_audit_failure BEFORE INSERT ON ai_logs WHEN NEW.kind = 'VENDOR_SEARCH' BEGIN SELECT RAISE(ABORT, 'test audit failure'); END");
    try {
      expect(await cariVendorAction("pompa"))
        .toMatchObject({ status: "error", error: { code: "PERSISTENCE_FAILED" } });
      expect(await ctx.db.sourcingSearch.count()).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe("DROP TRIGGER sourcing_test_audit_failure");
    }
  });

  it("rolls back a detail update when its audit insertion fails", async () => {
    const data = await search();
    const before = (await stored(data.searchId)).snapshot.resultsJson;
    http.mockReset();
    http.mockResolvedValue(Response.json(fixtures.detailIdr));
    await prisma.$executeRawUnsafe("CREATE TRIGGER sourcing_test_audit_failure BEFORE INSERT ON ai_logs WHEN NEW.kind = 'VENDOR_DETAIL' BEGIN SELECT RAISE(ABORT, 'test audit failure'); END");
    try {
      expect(await ambilDetailTokoAction({ searchId: data.searchId, resultId: data.results[2].id }))
        .toMatchObject({ status: "error", error: { code: "PERSISTENCE_FAILED" } });
      expect((await stored(data.searchId)).snapshot.resultsJson).toBe(before);
      expect(http).toHaveBeenCalledOnce();
    } finally {
      await prisma.$executeRawUnsafe("DROP TRIGGER sourcing_test_audit_failure");
    }
  });

  it("stops after three compare-and-swap conflicts without repeating the provider call", async () => {
    const data = await search();
    const before = (await stored(data.searchId)).snapshot.resultsJson;
    http.mockReset();
    http.mockResolvedValue(Response.json(fixtures.detailIdr));
    await prisma.$executeRawUnsafe("CREATE TABLE sourcing_test_cas_attempts (attempts INTEGER NOT NULL)");
    await prisma.$executeRawUnsafe("INSERT INTO sourcing_test_cas_attempts VALUES (0)");
    await prisma.$executeRawUnsafe("CREATE TRIGGER sourcing_test_cas_conflict BEFORE UPDATE ON sourcing_searches BEGIN UPDATE sourcing_test_cas_attempts SET attempts = attempts + 1; SELECT RAISE(IGNORE); END");
    try {
      expect(await ambilDetailTokoAction({ searchId: data.searchId, resultId: data.results[2].id }))
        .toMatchObject({ status: "error", error: { code: "PERSISTENCE_FAILED" } });
      const attempts = await prisma.$queryRaw<Array<{ attempts: number }>>`SELECT attempts FROM sourcing_test_cas_attempts`;
      expect(Number(attempts[0].attempts)).toBe(3);
      expect((await stored(data.searchId)).snapshot.resultsJson).toBe(before);
      expect(http).toHaveBeenCalledOnce();
    } finally {
      await prisma.$executeRawUnsafe("DROP TRIGGER sourcing_test_cas_conflict");
      await prisma.$executeRawUnsafe("DROP TABLE sourcing_test_cas_attempts");
    }
  });

  it("never changes business records as a side effect of sourcing", async () => {
    const before = await ctx.db.vendorProduct.findMany({ orderBy: { id: "asc" } });
    const data = await search();
    http.mockResolvedValue(Response.json(fixtures.detailIdr));
    await ambilDetailTokoAction({ searchId: data.searchId, resultId: data.results[2].id });
    expect(await ctx.db.vendorProduct.findMany({ orderBy: { id: "asc" } })).toEqual(before);
    expect(await ctx.db.quotation.count()).toBe(0);
    expect(await ctx.db.product.count()).toBe(0);
    expect(await ctx.db.inquiryItem.count()).toBe(0);
  });
});
