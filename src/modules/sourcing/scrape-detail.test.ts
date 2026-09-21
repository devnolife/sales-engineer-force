import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetch as httpFetch, Response } from "undici";
import { scrapeVendorPageDetail } from "./scrape-detail";
import fixtures from "./__fixtures__/firecrawl-contract.json";

vi.mock("server-only", () => ({}));
vi.mock("undici", async (importOriginal) => ({
  ...await importOriginal<typeof import("undici")>(),
  fetch: vi.fn(),
}));

const http = vi.mocked(httpFetch);
const input = { query: "pompa dosing", url: "https://supplier.example/products/pump" };

beforeEach(() => {
  http.mockReset();
  vi.stubEnv("SOURCING_MODE", "live");
  vi.stubEnv("CORE_AI_URL", "http://core-ai.test");
  vi.stubEnv("FIRECRAWL_API_KEY", "");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Direct web calls are forbidden in SalesKit"); }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("on-demand detail boundary", () => {
  it("uses the canonical core-ai endpoint without needing a Firecrawl key in the app", async () => {
    http.mockResolvedValue(Response.json(fixtures.detailIdr));
    expect(await scrapeVendorPageDetail(input)).toEqual(fixtures.detailIdr.result);
    expect(http).toHaveBeenCalledOnce();
    expect(http).toHaveBeenCalledWith("http://core-ai.test/v1/sourcing/scrape-detail",
      expect.objectContaining({ body: JSON.stringify(input) }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves currency and never calculates a foreign-currency margin", async () => {
    http.mockResolvedValue(Response.json(fixtures.detailUsd));
    const result = await scrapeVendorPageDetail({
      ...input, url: fixtures.detailUsd.result.sourceUrl,
    });
    expect(result.currency).toBe("USD");
    expect(result.price).toBe("99.90");
    expect(result).not.toHaveProperty("suggestedPrice");
  });

  it.each(["detailUnavailable", "detailAmbiguous"] as const)(
    "returns authoritative %s without a leftover numeric price", async (key) => {
      http.mockResolvedValue(Response.json(fixtures[key]));
      const result = await scrapeVendorPageDetail(input);
      expect(result.priceStatus).not.toBe("available");
      expect(result.price).toBeUndefined();
    },
  );

  it("rejects a pending result or missing evidence as an invalid detail response", async () => {
    http.mockResolvedValue(Response.json({ provider: "firecrawl", result: fixtures.search.results[0] }));
    await expect(scrapeVendorPageDetail(input)).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });

  it("reports failure without fabricating an empty successful observation", async () => {
    http.mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    await expect(scrapeVendorPageDetail(input)).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("does not contact core-ai for a private target URL", async () => {
    await expect(scrapeVendorPageDetail({ ...input, url: "http://127.0.0.1/admin" }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(http).not.toHaveBeenCalled();
  });

  it("does not enable paid details in demo mode", async () => {
    vi.stubEnv("SOURCING_MODE", "mock");
    await expect(scrapeVendorPageDetail(input)).rejects.toMatchObject({ code: "NOT_ALLOWED" });
    expect(http).not.toHaveBeenCalled();
  });
});
