import { describe, expect, it } from "vitest";
import fixtures from "./__fixtures__/firecrawl-contract.json";
import local from "./__fixtures__/selfhost-contract.json";
import {
  coreAiDetailSchema,
  coreAiErrorSchema,
  coreAiSearchSchema,
  detailInputSchema,
  publicUrlSchema,
  searchInputSchema,
  vendorResultSchema,
} from "./schema";

describe("sourcing input", () => {
  it("trims the query and retains the optional inquiry reference", () => {
    expect(searchInputSchema.parse({ query: "  pompa dosing  ", inquiryItemId: "item-1" }))
      .toEqual({ query: "pompa dosing", inquiryItemId: "item-1" });
  });

  it.each(["", "ab", " ".repeat(10), "a".repeat(501)])("rejects invalid query %j", (query) => {
    expect(searchInputSchema.safeParse({ query }).success).toBe(false);
  });

  it("accepts the maximum 500-character query", () => {
    expect(searchInputSchema.safeParse({ query: "a".repeat(500) }).success).toBe(true);
  });

  it("requires stored search/result references instead of a client supplied URL", () => {
    expect(detailInputSchema.parse({ searchId: "search-1", resultId: "result-1" }))
      .toEqual({ searchId: "search-1", resultId: "result-1" });
    expect(detailInputSchema.safeParse({ url: "https://supplier.example" }).success).toBe(false);
    expect(detailInputSchema.safeParse({
      searchId: "search-1", resultId: "result-1", url: "https://elsewhere.example",
    }).success).toBe(false);
  });

  it.each([
    "ftp://supplier.example/product",
    "https://user:password@supplier.example/product",
    "http://localhost/product",
    "http://store.local/product",
    "http://store.localdomain/product",
    "http://store.home.arpa/product",
    "http://store.onion/product",
    "http://127.0.0.1/product",
    "http://2130706433/product",
    "http://10.0.0.1/product",
    "http://172.16.0.1/product",
    "http://192.168.0.1/product",
    "http://169.254.169.254/product",
    "http://[::1]/product",
    "http://[fd00::1]/product",
    "http://[fec0::1]/product",
    "http://[::127.0.0.1]/product",
    "http://[::ffff:127.0.0.1]/product",
    "http://[64:ff9b::a00:1]/product",
    "http://[64:ff9b:1::a00:1]/product",
  ])("rejects non-public or credentialed URL %s", (url) => {
    expect(publicUrlSchema.safeParse(url).success).toBe(false);
  });

  it.each([
    "https://supplier.example/products/pump?variant=5",
    "https://8.8.8.8/product",
    "https://[2606:4700:4700::1111]/product",
  ])("retains public URLs supported by the backend %s", (url) => {
    expect(publicUrlSchema.safeParse(url).success).toBe(true);
  });
});

describe("core-ai sourcing contracts", () => {
  it("accepts pending discovery without inventing prices", () => {
    const parsed = coreAiSearchSchema.parse(fixtures.search);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].priceStatus).toBe("pending");
    expect(parsed.results[0].price).toBeUndefined();
  });

  describe("self-host sourcing contracts", () => {
    it("accepts bounded pending discovery and preserves backend source labels", () => {
      expect(coreAiSearchSchema.parse(local.search)).toEqual(local.search);
      expect(coreAiSearchSchema.parse({ provider: "selfhost", results: [] }).results).toEqual([]);
    });

    it.each(["detailCrawl4ai", "detailBrowserUse", "detailUnavailable", "detailAmbiguous"] as const)(
      "accepts %s with the actual local evidence method", (key) => {
        expect(coreAiDetailSchema.parse(local[key])).toEqual(local[key]);
        expect(vendorResultSchema.safeParse({ ...local[key].result, id: "local-result" }).success).toBe(true);
      },
    );

    it.each(["crawl4ai-product", "browser-use-product"])(
      "allows %s only on WEB results", (method) => {
        for (const sourceType of ["INTERNAL", "WEB_MOCK"]) {
          expect(vendorResultSchema.safeParse({
            ...local.detailCrawl4ai.result, id: "invalid", sourceType,
            evidence: { ...local.detailCrawl4ai.result.evidence, method },
          }).success).toBe(false);
        }
      },
    );

    it.each([
      ["firecrawl", "crawl4ai-product"],
      ["firecrawl", "browser-use-product"],
      ["selfhost", "firecrawl-product"],
      ["selfhost", "internal-pricelist"],
      ["selfhost", "mock"],
    ])("rejects evidence from another provider: %s / %s", (provider, method) => {
      const evidence = { ...local.detailCrawl4ai.result.evidence, method };
      expect(coreAiDetailSchema.safeParse({
        provider, result: { ...local.detailCrawl4ai.result, evidence },
      }).success).toBe(false);
      expect(coreAiDetailSchema.safeParse({
        provider, result: { ...local.detailUnavailable.result, evidence },
      }).success).toBe(false);
      expect(coreAiSearchSchema.safeParse({
        provider, results: [{ ...local.search.results[0], evidence }],
      }).success).toBe(false);
    });

    it("rejects mock remote envelopes, oversized discovery, and priced search results", () => {
      expect(coreAiDetailSchema.safeParse({ ...local.detailCrawl4ai, provider: "mock" }).success).toBe(false);
      expect(coreAiSearchSchema.safeParse({
        provider: "selfhost", results: Array.from({ length: 6 }, () => local.search.results[0]),
      }).success).toBe(false);
      expect(coreAiSearchSchema.safeParse({
        provider: "selfhost", results: [local.detailCrawl4ai.result],
      }).success).toBe(false);
    });

    it.each(["currency", "retrievedAt", "evidence"] as const)(
      "still requires %s for an available selfhost price", (field) => {
        expect(coreAiDetailSchema.safeParse({
          provider: "selfhost", result: { ...local.detailCrawl4ai.result, [field]: undefined },
        }).success).toBe(false);
      },
    );

    it.each(["0", "-10", "NaN", "Infinity", "1e9", "Rp 1.000"])(
      "still rejects invalid selfhost price %s", (price) => {
        expect(coreAiDetailSchema.safeParse({
          provider: "selfhost", result: { ...local.detailCrawl4ai.result, price },
        }).success).toBe(false);
      },
    );

    it("requires a completed, dated observation and preserves foreign currency rules", () => {
      expect(coreAiDetailSchema.safeParse({
        provider: "selfhost", result: local.search.results[0],
      }).success).toBe(false);
      expect(coreAiDetailSchema.safeParse({
        provider: "selfhost", result: { ...local.detailUnavailable.result, price: "1000" },
      }).success).toBe(false);
      expect(vendorResultSchema.safeParse({
        ...local.detailBrowserUse.result, id: "usd", suggestedPrice: "130000",
      }).success).toBe(false);
    });
  });

  it("distinguishes an empty result list from a malformed response", () => {
    expect(coreAiSearchSchema.parse({ provider: "firecrawl", results: [] }).results).toEqual([]);
    expect(coreAiSearchSchema.safeParse({ provider: "firecrawl" }).success).toBe(false);
  });

  it("does not allow the app-only unconfigured marker in remote envelopes", () => {
    expect(coreAiSearchSchema.safeParse({ ...local.search, provider: "unconfigured" }).success).toBe(false);
    expect(coreAiDetailSchema.safeParse({ ...local.detailCrawl4ai, provider: "unconfigured" }).success).toBe(false);
  });

  it("rejects more than five web candidates", () => {
    expect(coreAiSearchSchema.safeParse({
      provider: "firecrawl", results: Array.from({ length: 6 }, () => fixtures.search.results[0]),
    }).success).toBe(false);
  });

  it("rejects mock, internal and priced discovery payloads from the live service", () => {
    expect(coreAiSearchSchema.safeParse({ ...fixtures.search, provider: "mock" }).success).toBe(false);
    expect(coreAiSearchSchema.safeParse({
      provider: "firecrawl", results: [{ ...fixtures.search.results[0], sourceType: "INTERNAL" }],
    }).success).toBe(false);
    expect(coreAiSearchSchema.safeParse({
      provider: "firecrawl", results: [fixtures.detailIdr.result],
    }).success).toBe(false);
  });

  it.each(["detailIdr", "detailUsd", "detailUnavailable", "detailAmbiguous"] as const)(
    "accepts the shared %s fixture", (key) => {
      expect(coreAiDetailSchema.safeParse(fixtures[key]).success).toBe(true);
    },
  );

  it.each(["currency", "retrievedAt", "evidence"] as const)(
    "rejects an available price without %s", (field) => {
      const result = { ...fixtures.detailIdr.result, [field]: undefined };
      expect(coreAiDetailSchema.safeParse({ provider: "firecrawl", result }).success).toBe(false);
    },
  );

  it.each(["0", "-10", "NaN", "Infinity", "1e9", "Rp 1.000"])("rejects invalid price %s", (price) => {
    expect(coreAiDetailSchema.safeParse({
      provider: "firecrawl", result: { ...fixtures.detailIdr.result, price },
    }).success).toBe(false);
  });

  it("rejects a leftover price on an unavailable observation", () => {
    expect(coreAiDetailSchema.safeParse({
      provider: "firecrawl",
      result: { ...fixtures.detailUnavailable.result, price: "1250000", currency: "IDR" },
    }).success).toBe(false);
  });

  it("requires product evidence, not mock evidence, for live prices", () => {
    expect(coreAiDetailSchema.safeParse({
      provider: "firecrawl",
      result: { ...fixtures.detailIdr.result, evidence: { method: "mock" } },
    }).success).toBe(false);
  });

  it("rejects a suggested IDR margin on a foreign-currency result", () => {
    expect(vendorResultSchema.safeParse({
      ...fixtures.detailUsd.result, id: "result-1", suggestedPrice: "130",
    }).success).toBe(false);
  });

  it("accepts a complete stored result with its generated reference", () => {
    expect(vendorResultSchema.safeParse({
      ...fixtures.detailIdr.result, id: "result-1", suggestedPrice: "1625000",
    }).success).toBe(true);
  });

  it("accepts typed provider errors and rejects unknown codes", () => {
    expect(coreAiErrorSchema.parse(fixtures.rateLimited).error.retryAfterSeconds).toBe(60);
    expect(coreAiErrorSchema.safeParse({ error: { code: "SURPRISE", message: "unknown" } }).success)
      .toBe(false);
  });
});
