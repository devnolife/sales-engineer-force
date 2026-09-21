import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetch as httpFetch, Response } from "undici";
import type { OrgScope } from "@/modules/org/service";
import { fetchVendorSourceDetail, searchVendorSources } from "./service";
import { MockSourcingProvider } from "./mock-provider";
import type { LiveSourcingEngine, VendorSearchResult } from "./types";
import cloud from "./__fixtures__/firecrawl-contract.json";
import local from "./__fixtures__/selfhost-contract.json";

vi.mock("server-only", () => ({}));
vi.mock("undici", async (importOriginal) => ({
  ...await importOriginal<typeof import("undici")>(),
  fetch: vi.fn(),
}));

const http = vi.mocked(httpFetch);
const userId = "sourcing-provider-test-user";
type Snapshot = {
  id: string; organizationId: string; query: string; provider: string;
  resultsJson: string; inquiryItemId: string | null; createdById: string;
};
type Audit = {
  organizationId: string; kind: string; provider: string;
  inputSummary: string; outputSummary: string; createdById: string;
};

function persistenceFixture() {
  const orgId = `sourcing-provider-${randomUUID()}`;
  const snapshots = new Map<string, Snapshot>();
  const audits: Audit[] = [];
  const models = {
    vendorProduct: { findMany: vi.fn().mockResolvedValue([{
      name: "Pompa internal", price: "100000", currency: "IDR", unit: "Unit",
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      vendor: { name: "Vendor internal", city: null, phone: null, email: null },
    }]) },
    inquiryItem: { findFirst: vi.fn().mockResolvedValue(null) },
    sourcingSearch: {
      create: vi.fn(async ({ data }: { data: Omit<Snapshot, "id"> }) => {
        const id = randomUUID();
        snapshots.set(id, { ...data, id });
        return { id };
      }),
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
        const snapshot = snapshots.get(where.id);
        return snapshot?.organizationId === orgId ? { ...snapshot } : null;
      }),
      updateMany: vi.fn(async ({ where, data }: {
        where: { id: string; organizationId: string; resultsJson: string; provider?: string };
        data: { resultsJson: string };
      }) => {
        const snapshot = snapshots.get(where.id);
        if (!snapshot || snapshot.organizationId !== where.organizationId ||
          snapshot.resultsJson !== where.resultsJson ||
          (where.provider !== undefined && snapshot.provider !== where.provider)) return { count: 0 };
        snapshots.set(where.id, { ...snapshot, ...data });
        return { count: 1 };
      }),
    },
    aiLog: {
      create: vi.fn(async ({ data }: { data: Audit }) => {
        audits.push(data);
        return { id: randomUUID() };
      }),
    },
  };
  const db = {
    ...models,
    $transaction: vi.fn(async (operation: (tx: typeof models) => Promise<unknown>) => {
      const before = new Map(snapshots);
      const auditLength = audits.length;
      try {
        return await operation(models);
      } catch (error) {
        snapshots.clear();
        for (const [id, snapshot] of before) snapshots.set(id, snapshot);
        audits.splice(auditLength);
        throw error;
      }
    }),
  };
  const scope: OrgScope = { orgId, db: db as unknown as OrgScope["db"] };
  return { scope, db, snapshots, audits };
}

async function discover(fixture: ReturnType<typeof persistenceFixture>, provider: LiveSourcingEngine = "selfhost") {
  vi.stubEnv("SOURCING_LIVE_PROVIDER", provider);
  const response = provider === "selfhost" ? local.search : cloud.search;
  http.mockResolvedValue(Response.json({
    ...response, results: [...response.results, {
      ...response.results[0], productName: "Dosing pump USD",
      sourceUrl: local.detailBrowserUse.result.sourceUrl,
    }],
  }));
  const outcome = await searchVendorSources(fixture.scope, userId, "  pompa dosing  ");
  expect(outcome.status).toBe("complete");
  if (outcome.status !== "complete") throw new Error("Discovery did not complete");
  return outcome.data;
}

beforeEach(() => {
  http.mockReset();
  vi.stubEnv("SOURCING_MODE", "live");
  vi.stubEnv("SOURCING_LIVE_PROVIDER", "selfhost");
  vi.stubEnv("CORE_AI_URL", "http://core-ai.test");
  vi.stubEnv("SOURCING_MARGIN_PERCENT", "25");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("provider-aware sourcing persistence", () => {
  it.each(["firecrawl", "selfhost"] as const)("persists and audits the actual %s search engine", async (provider) => {
    const fixture = persistenceFixture();
    const data = await discover(fixture, provider);
    expect(data.provider).toBe(provider);
    expect(data.results).toHaveLength(3);
    expect(data.results[0]).toMatchObject({
      sourceType: "INTERNAL", price: "100000", currency: "IDR", suggestedPrice: "125000",
    });
    expect(data.results.slice(1).every((r) => r.sourceType === "WEB" && r.priceStatus === "pending" && !r.price)).toBe(true);
    expect(fixture.snapshots.get(data.searchId)).toMatchObject({
      organizationId: fixture.scope.orgId, provider, resultsJson: JSON.stringify(data.results),
    });
    expect(fixture.audits).toMatchObject([{
      organizationId: fixture.scope.orgId, kind: "VENDOR_SEARCH", provider, createdById: userId,
    }]);
  });

  it.each(["TIMEOUT", "NOT_CONFIGURED"])("keeps internal results and selfhost audit on %s", async (failure) => {
    const fixture = persistenceFixture();
    if (failure === "TIMEOUT") http.mockRejectedValue(new DOMException("deadline", "TimeoutError"));
    else vi.stubEnv("CORE_AI_URL", "");
    const outcome = await searchVendorSources(fixture.scope, userId, "pompa");
    expect(outcome).toMatchObject({
      status: "partial", error: { code: failure },
      data: { provider: "selfhost", results: [expect.objectContaining({ sourceType: "INTERNAL" })] },
    });
    expect(fixture.audits[0]).toMatchObject({
      provider: "selfhost", outputSummary: expect.stringContaining(failure),
    });
    expect(http).toHaveBeenCalledTimes(failure === "TIMEOUT" ? 1 : 0);
  });

  it.each([
    ["SOURCING_MODE", undefined],
    ["SOURCING_MODE", ""],
    ["SOURCING_MODE", " "],
    ["SOURCING_MODE", "invalid"],
    ["SOURCING_LIVE_PROVIDER", ""],
    ["SOURCING_LIVE_PROVIDER", " "],
    ["SOURCING_LIVE_PROVIDER", "mock"],
    ["SOURCING_LIVE_PROVIDER", "invalid"],
  ] as const)("keeps the internal pricelist with an honest unconfigured audit for %s=%j", async (name, value) => {
    const fixture = persistenceFixture();
    const mock = vi.spyOn(MockSourcingProvider.prototype, "searchWeb");
    vi.stubEnv(name, value);
    const outcome = await searchVendorSources(fixture.scope, userId, "pompa");
    expect(outcome).toMatchObject({
      status: "partial", error: { code: "NOT_CONFIGURED" },
      data: {
        provider: "unconfigured", marginPercent: 25,
        results: [{
          id: expect.any(String), vendorName: "Vendor internal", productName: "Pompa internal",
          sourceType: "INTERNAL", sourceLabel: "Pricelist internal",
          priceStatus: "available", price: "100000", currency: "IDR", unit: "Unit",
          suggestedPrice: "125000", marginPercent: 25, retrievedAt: "2026-09-01T00:00:00.000Z",
          evidence: { method: "internal-pricelist", productTitle: "Pompa internal" },
        }],
      },
    });
    if (outcome.status !== "partial") throw new Error("Expected internal-first partial results");
    expect(fixture.db.vendorProduct.findMany).toHaveBeenCalledOnce();
    expect(fixture.snapshots.get(outcome.data.searchId)).toMatchObject({
      organizationId: fixture.scope.orgId, provider: "unconfigured",
      resultsJson: JSON.stringify(outcome.data.results),
    });
    expect(fixture.audits).toMatchObject([{
      organizationId: fixture.scope.orgId, kind: "VENDOR_SEARCH", provider: "unconfigured",
      outputSummary: "partial; 1 internal + 0 web; NOT_CONFIGURED", createdById: userId,
    }]);
    expect(http).not.toHaveBeenCalled();
    expect(mock).not.toHaveBeenCalled();
  });

  it("still selects the real Firecrawl engine when only the live-provider setting is absent", async () => {
    const fixture = persistenceFixture();
    vi.stubEnv("SOURCING_LIVE_PROVIDER", undefined);
    http.mockResolvedValue(Response.json(cloud.search));
    expect(await searchVendorSources(fixture.scope, userId, "pompa")).toMatchObject({
      status: "complete", data: {
        provider: "firecrawl",
        results: [expect.objectContaining({ sourceType: "INTERNAL" }), expect.objectContaining({ sourceType: "WEB" })],
      },
    });
    expect(fixture.audits[0].provider).toBe("firecrawl");
    expect(http).toHaveBeenCalledOnce();
  });

  it("never requests detail for an unconfigured snapshot even if it contains a forged web candidate", async () => {
    const fixture = persistenceFixture();
    const { id } = await fixture.db.sourcingSearch.create({
      data: {
        organizationId: fixture.scope.orgId, query: "pompa", provider: "unconfigured",
        resultsJson: JSON.stringify([{ ...local.search.results[0], id: "forged-web" }]),
        inquiryItemId: null, createdById: userId,
      },
    });
    expect(await fetchVendorSourceDetail(fixture.scope, userId, {
      searchId: id, resultId: "forged-web",
    })).toMatchObject({ status: "error", error: { code: "NOT_ALLOWED" } });
    expect(http).not.toHaveBeenCalled();
    expect(fixture.db.sourcingSearch.updateMany).not.toHaveBeenCalled();
    expect(fixture.audits).toEqual([]);
  });

  it("shares the ten-search organization limiter across both live providers", async () => {
    const fixture = persistenceFixture();
    for (let i = 0; i < 10; i++) await discover(fixture, i < 5 ? "firecrawl" : "selfhost");
    expect(await searchVendorSources(fixture.scope, userId, "pompa")).toMatchObject({
      status: "partial", error: { code: "RATE_LIMITED" },
      data: { provider: "selfhost", results: [expect.objectContaining({ sourceType: "INTERNAL" })] },
    });
    expect(http).toHaveBeenCalledTimes(10);
  });

  it.each(["detailCrawl4ai", "detailBrowserUse"] as const)(
    "stores %s evidence, currency and the actual detail audit engine", async (key) => {
      const fixture = persistenceFixture();
      const data = await discover(fixture);
      const id = data.results[key === "detailCrawl4ai" ? 1 : 2].id;
      http.mockReset();
      http.mockResolvedValue(Response.json(local[key]));
      const outcome = await fetchVendorSourceDetail(fixture.scope, userId, { searchId: data.searchId, resultId: id });
      expect(outcome).toMatchObject({ status: "complete", result: { ...local[key].result, id } });
      if (outcome.status !== "complete") throw new Error("Detail did not complete");
      expect(outcome.result.suggestedPrice).toBe(key === "detailCrawl4ai" ? "1563000" : undefined);
      expect(fixture.db.sourcingSearch.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ organizationId: fixture.scope.orgId, provider: "selfhost" }),
      }));
      expect(fixture.audits.at(-1)).toMatchObject({ kind: "VENDOR_DETAIL", provider: "selfhost" });
      expect(JSON.parse(String(http.mock.calls[0][1]?.body))).toEqual({
        query: "pompa dosing", url: local[key].result.sourceUrl, provider: "selfhost",
      });
      expect(http).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ["firecrawl", "selfhost"],
    ["selfhost", "firecrawl"],
  ] as const)("rejects a stale %s snapshot after switching to %s before network access", async (previous, current) => {
    const fixture = persistenceFixture();
    const data = await discover(fixture, previous);
    const before = fixture.snapshots.get(data.searchId)?.resultsJson;
    vi.stubEnv("SOURCING_LIVE_PROVIDER", current);
    http.mockReset();
    http.mockResolvedValue(Response.json(current === "selfhost" ? local.detailCrawl4ai : cloud.detailIdr));
    expect(await fetchVendorSourceDetail(fixture.scope, userId, {
      searchId: data.searchId, resultId: data.results[1].id,
    })).toMatchObject({ status: "error", error: { code: "NOT_ALLOWED" } });
    expect(http).not.toHaveBeenCalled();
    expect(fixture.snapshots.get(data.searchId)?.resultsJson).toBe(before);
    expect(fixture.audits).toHaveLength(1);
  });

  it.each(["firecrawl", "selfhost"] as const)("rejects stored evidence inconsistent with %s before network access", async (provider) => {
    const fixture = persistenceFixture();
    const data = await discover(fixture, provider);
    const snapshot = fixture.snapshots.get(data.searchId)!;
    const mismatched = provider === "selfhost" ? cloud.detailIdr.result : local.detailCrawl4ai.result;
    snapshot.resultsJson = JSON.stringify([{ ...mismatched, id: data.results[1].id }]);
    http.mockClear();
    expect(await fetchVendorSourceDetail(fixture.scope, userId, {
      searchId: data.searchId, resultId: data.results[1].id,
    })).toMatchObject({ status: "error", error: { code: "NOT_ALLOWED" } });
    expect(http).not.toHaveBeenCalled();
  });

  it.each(["timeout", "mismatched response"] as const)(
    "audits selfhost detail %s without overwriting an earlier observation", async (failure) => {
      const fixture = persistenceFixture();
      const data = await discover(fixture);
      const input = { searchId: data.searchId, resultId: data.results[1].id };
      http.mockResolvedValue(Response.json(local.detailCrawl4ai));
      expect((await fetchVendorSourceDetail(fixture.scope, userId, input)).status).toBe("complete");
      const before = fixture.snapshots.get(data.searchId)?.resultsJson;
      http.mockReset();
      if (failure === "timeout") http.mockRejectedValue(new DOMException("deadline", "TimeoutError"));
      else http.mockResolvedValue(Response.json(cloud.detailIdr));
      const code = failure === "timeout" ? "TIMEOUT" : "BAD_RESPONSE";
      expect(await fetchVendorSourceDetail(fixture.scope, userId, input))
        .toMatchObject({ status: "error", error: { code } });
      expect(fixture.audits.at(-1)).toMatchObject({
        kind: "VENDOR_DETAIL", provider: "selfhost", outputSummary: `error; ${code}`,
      });
      expect(fixture.snapshots.get(data.searchId)?.resultsJson).toBe(before);
      expect(http).toHaveBeenCalledOnce();
    },
  );

  it("clears prior price, currency and margin only after a successful unavailable selfhost observation", async () => {
    const fixture = persistenceFixture();
    const data = await discover(fixture);
    const input = { searchId: data.searchId, resultId: data.results[1].id };
    http.mockResolvedValue(Response.json(local.detailCrawl4ai));
    expect((await fetchVendorSourceDetail(fixture.scope, userId, input)).status).toBe("complete");
    http.mockResolvedValue(Response.json(local.detailUnavailable));
    const outcome = await fetchVendorSourceDetail(fixture.scope, userId, input);
    expect(outcome).toEqual({ status: "complete", result: { ...local.detailUnavailable.result, id: input.resultId } });
    const results: VendorSearchResult[] = JSON.parse(fixture.snapshots.get(data.searchId)!.resultsJson);
    expect(results[0]).toEqual(data.results[0]);
    expect(results[2]).toEqual(data.results[2]);
  });

  it("shares the twenty-detail organization limiter across both live providers", async () => {
    const fixture = persistenceFixture();
    for (const provider of ["firecrawl", "selfhost"] as const) {
      const data = await discover(fixture, provider);
      http.mockImplementation(async () => Response.json(
        provider === "selfhost" ? local.detailUnavailable : cloud.detailUnavailable,
      ));
      for (let i = 0; i < 10; i++) {
        expect((await fetchVendorSourceDetail(fixture.scope, userId, {
          searchId: data.searchId, resultId: data.results[1].id,
        })).status).toBe("complete");
      }
      if (provider === "selfhost") {
        expect(await fetchVendorSourceDetail(fixture.scope, userId, {
          searchId: data.searchId, resultId: data.results[1].id,
        })).toMatchObject({ status: "error", error: { code: "RATE_LIMITED" } });
      }
    }
    expect(http).toHaveBeenCalledTimes(22);
  });

  it("checks scoped ownership and internal references before calling a selfhost service", async () => {
    const fixture = persistenceFixture();
    expect(await searchVendorSources(fixture.scope, userId, "pompa", "foreign-inquiry"))
      .toMatchObject({ status: "error", error: { code: "NOT_FOUND" } });
    expect(http).not.toHaveBeenCalled();
    const data = await discover(fixture);
    http.mockClear();
    expect(await fetchVendorSourceDetail(fixture.scope, userId, {
      searchId: "foreign-search", resultId: data.results[1].id,
    })).toMatchObject({ status: "error", error: { code: "NOT_FOUND" } });
    expect(await fetchVendorSourceDetail(fixture.scope, userId, {
      searchId: data.searchId, resultId: data.results[0].id,
    })).toMatchObject({ status: "error", error: { code: "NOT_ALLOWED" } });
    fixture.snapshots.get(data.searchId)!.inquiryItemId = "foreign-inquiry";
    expect(await fetchVendorSourceDetail(fixture.scope, userId, {
      searchId: data.searchId, resultId: data.results[1].id,
    })).toMatchObject({ status: "error", error: { code: "NOT_FOUND" } });
    expect(http).not.toHaveBeenCalled();
  });

  it("merges a concurrent selfhost observation after a CAS conflict without another provider call", async () => {
    const fixture = persistenceFixture();
    const data = await discover(fixture);
    const otherResult = { ...local.detailBrowserUse.result, id: data.results[2].id };
    fixture.db.sourcingSearch.updateMany.mockImplementationOnce(async () => {
      fixture.snapshots.get(data.searchId)!.resultsJson = JSON.stringify([
        data.results[0], data.results[1], otherResult,
      ]);
      return { count: 0 };
    });
    http.mockReset();
    http.mockResolvedValue(Response.json(local.detailCrawl4ai));
    expect((await fetchVendorSourceDetail(fixture.scope, userId, {
      searchId: data.searchId, resultId: data.results[1].id,
    })).status).toBe("complete");
    expect(JSON.parse(fixture.snapshots.get(data.searchId)!.resultsJson)[2]).toEqual(otherResult);
    expect(fixture.db.sourcingSearch.updateMany).toHaveBeenCalledTimes(2);
    expect(fixture.audits.filter((audit) => audit.kind === "VENDOR_DETAIL")).toHaveLength(1);
    expect(http).toHaveBeenCalledOnce();
  });

  it("stops after three selfhost CAS conflicts without overwriting or repeating network access", async () => {
    const fixture = persistenceFixture();
    const data = await discover(fixture);
    const before = fixture.snapshots.get(data.searchId)?.resultsJson;
    fixture.db.sourcingSearch.updateMany.mockResolvedValue({ count: 0 });
    http.mockReset();
    http.mockResolvedValue(Response.json(local.detailCrawl4ai));
    expect(await fetchVendorSourceDetail(fixture.scope, userId, {
      searchId: data.searchId, resultId: data.results[1].id,
    })).toMatchObject({ status: "error", error: { code: "PERSISTENCE_FAILED" } });
    expect(fixture.db.sourcingSearch.updateMany).toHaveBeenCalledTimes(3);
    expect(fixture.snapshots.get(data.searchId)?.resultsJson).toBe(before);
    expect(http).toHaveBeenCalledOnce();
    expect(fixture.audits).toHaveLength(1);
  });

  it("does not merge a detail into a snapshot whose provider changed during the request", async () => {
    const fixture = persistenceFixture();
    const data = await discover(fixture);
    const before = fixture.snapshots.get(data.searchId)?.resultsJson;
    http.mockReset();
    http.mockImplementation(async () => {
      fixture.snapshots.get(data.searchId)!.provider = "firecrawl";
      return Response.json(local.detailCrawl4ai);
    });
    expect(await fetchVendorSourceDetail(fixture.scope, userId, {
      searchId: data.searchId, resultId: data.results[1].id,
    })).toMatchObject({ status: "error", error: { code: "NOT_ALLOWED" } });
    expect(fixture.snapshots.get(data.searchId)?.resultsJson).toBe(before);
    expect(fixture.audits).toHaveLength(1);
    expect(http).toHaveBeenCalledOnce();
  });

  it("reports a selfhost audit failure without retaining an unaudited detail update", async () => {
    const fixture = persistenceFixture();
    const data = await discover(fixture);
    const before = fixture.snapshots.get(data.searchId)?.resultsJson;
    fixture.db.aiLog.create.mockRejectedValueOnce(new Error("synthetic audit failure"));
    http.mockReset();
    http.mockResolvedValue(Response.json(local.detailCrawl4ai));
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await fetchVendorSourceDetail(fixture.scope, userId, {
      searchId: data.searchId, resultId: data.results[1].id,
    })).toMatchObject({ status: "error", error: { code: "PERSISTENCE_FAILED" } });
    expect(fixture.snapshots.get(data.searchId)?.resultsJson).toBe(before);
    expect(http).toHaveBeenCalledOnce();
    expect(logger).toHaveBeenCalled();
  });
});
