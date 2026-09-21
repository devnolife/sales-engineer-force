import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetch as httpFetch, Response } from "undici";
import { CoreAiError, coreAiPostBinary } from "@/lib/core-ai";
import { MockSourcingProvider } from "./mock-provider";
import { getSourcingProvider } from "./service";
import fixtures from "./__fixtures__/firecrawl-contract.json";
import local from "./__fixtures__/selfhost-contract.json";

vi.mock("server-only", () => ({}));
vi.mock("undici", async (importOriginal) => ({
  ...await importOriginal<typeof import("undici")>(),
  fetch: vi.fn(),
}));

const http = vi.mocked(httpFetch);

beforeEach(() => {
  http.mockReset();
  vi.stubEnv("SOURCING_MODE", "live");
  vi.stubEnv("SOURCING_LIVE_PROVIDER", undefined);
  vi.stubEnv("CORE_AI_URL", "http://core-ai.test");
  vi.stubEnv("CORE_AI_API_KEY", "test-service-key");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("live sourcing transport", () => {
  it("sends only a bounded Indonesian discovery request and keeps the actual engine", async () => {
    http.mockResolvedValue(Response.json(fixtures.search));
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const provider = getSourcingProvider();
    const results = await provider.searchWeb("  pompa dosing  ");
    expect(provider.name).toBe("firecrawl");
    expect(results).toEqual(fixtures.search.results);
    expect(http).toHaveBeenCalledOnce();
    expect(http).toHaveBeenCalledWith("http://core-ai.test/v1/sourcing/search", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ query: "pompa dosing", limit: 5, country: "ID", provider: "firecrawl" }),
    }));
    expect(timeout).toHaveBeenCalledWith(45_000);
  });

  it("does not replace timeout failures with mock prices", async () => {
    const mock = vi.spyOn(MockSourcingProvider.prototype, "searchWeb");
    http.mockRejectedValue(new DOMException("deadline exceeded", "TimeoutError"));
    await expect(getSourcingProvider().searchWeb("pompa dosing"))
      .rejects.toMatchObject({ code: "TIMEOUT" });
    expect(mock).not.toHaveBeenCalled();
    expect(http).toHaveBeenCalledOnce();
  });

  it.each([
    { provider: "firecrawl" },
    { ...fixtures.search, provider: "mock" },
    { provider: "firecrawl", results: [fixtures.detailIdr.result] },
  ])("rejects malformed or incompatible remote data", async (body) => {
    http.mockResolvedValue(Response.json(body));
    await expect(getSourcingProvider().searchWeb("pompa dosing"))
      .rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });

  it("reports invalid JSON as a bad response rather than demo data", async () => {
    http.mockResolvedValue(new Response("{broken"));
    await expect(getSourcingProvider().searchWeb("pompa dosing"))
      .rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });

  it.each([
    [401, "NOT_ALLOWED"], [403, "NOT_ALLOWED"], [429, "RATE_LIMITED"],
    [503, "PROVIDER_UNAVAILABLE"], [504, "TIMEOUT"],
  ])("maps HTTP %s without leaking remote diagnostics", async (status, code) => {
    http.mockResolvedValue(new Response("private upstream diagnostic", { status: Number(status) }));
    await expect(getSourcingProvider().searchWeb("pompa dosing"))
      .rejects.toMatchObject({ code, message: expect.not.stringContaining("private upstream") });
  });

  it("retains structured NOT_CONFIGURED errors across core-ai", async () => {
    http.mockResolvedValue(Response.json({
      error: { code: "NOT_CONFIGURED", message: "upstream configuration detail" },
    }, { status: 503 }));
    await expect(getSourcingProvider().searchWeb("pompa dosing"))
      .rejects.toMatchObject({
        code: "NOT_CONFIGURED", message: expect.not.stringContaining("upstream configuration"),
      });
  });

  it("retains rate-limit retry information", async () => {
    http.mockResolvedValue(Response.json(fixtures.rateLimited, {
      status: 429, headers: { "retry-after": "60" },
    }));
    await expect(getSourcingProvider().searchWeb("pompa dosing"))
      .rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 60 });
  });

  it("rejects live requests without core-ai configuration before network access", async () => {
    vi.stubEnv("CORE_AI_URL", "");
    await expect(getSourcingProvider().searchWeb("pompa dosing"))
      .rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    expect(http).not.toHaveBeenCalled();
  });

  it("validates query before network access", async () => {
    await expect(getSourcingProvider().searchWeb("ab"))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(http).not.toHaveBeenCalled();
  });

  it("requires explicit mode selection", () => {
    vi.stubEnv("SOURCING_MODE", "");
    expect(getSourcingProvider).toThrowError(expect.objectContaining({ code: "NOT_CONFIGURED" }));
    vi.stubEnv("SOURCING_MODE", "typo");
    expect(getSourcingProvider).toThrowError(expect.objectContaining({ code: "NOT_CONFIGURED" }));
  });

  it("uses local labelled mock data only in explicit demo mode", async () => {
    vi.stubEnv("SOURCING_MODE", "mock");
    const provider = getSourcingProvider();
    const results = await provider.searchWeb("pompa dosing");
    expect(provider.name).toBe("mock");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.sourceType === "WEB_MOCK" &&
      result.currency === "IDR" && result.evidence?.method === "mock")).toBe(true);
    expect(http).not.toHaveBeenCalled();
  });

  it("selects selfhost explicitly and sends that provider without changing discovery UX", async () => {
    vi.stubEnv("SOURCING_LIVE_PROVIDER", "selfhost");
    http.mockResolvedValue(Response.json(local.search));
    const provider = getSourcingProvider();
    expect(provider.name).toBe("selfhost");
    expect(await provider.searchWeb("  pompa dosing  ")).toEqual(local.search.results);
    expect(http).toHaveBeenCalledWith("http://core-ai.test/v1/sourcing/search", expect.objectContaining({
      body: JSON.stringify({ query: "pompa dosing", limit: 5, country: "ID", provider: "selfhost" }),
    }));
  });

  it.each(["", " ", "mock", "typo", "SelfHost"])(
    "rejects explicit invalid live provider %j before network access", (provider) => {
      vi.stubEnv("SOURCING_LIVE_PROVIDER", provider);
      expect(getSourcingProvider).toThrowError(expect.objectContaining({ code: "NOT_CONFIGURED" }));
      expect(http).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["firecrawl", local.search],
    ["selfhost", fixtures.search],
  ])("never switches configured %s to the response provider", async (provider, response) => {
    vi.stubEnv("SOURCING_LIVE_PROVIDER", provider);
    http.mockResolvedValue(Response.json(response));
    const adapter = getSourcingProvider();
    expect(adapter.name).toBe(provider);
    await expect(adapter.searchWeb("pompa dosing")).rejects.toMatchObject({ code: "BAD_RESPONSE" });
    expect(adapter.name).toBe(provider);
  });

  it("pins the adapter provider at selection rather than reading it from the response", async () => {
    vi.stubEnv("SOURCING_LIVE_PROVIDER", "selfhost");
    const adapter = getSourcingProvider();
    vi.stubEnv("SOURCING_LIVE_PROVIDER", "firecrawl");
    http.mockResolvedValue(Response.json(local.search));
    expect(await adapter.searchWeb("pompa dosing")).toEqual(local.search.results);
    expect(adapter.name).toBe("selfhost");
    expect(JSON.parse(String(http.mock.calls[0][1]?.body)).provider).toBe("selfhost");
  });

  it("does not fall back to Cloud or mock when selfhost is unavailable", async () => {
    vi.stubEnv("SOURCING_LIVE_PROVIDER", "selfhost");
    http.mockRejectedValue(new DOMException("deadline exceeded", "TimeoutError"));
    const mock = vi.spyOn(MockSourcingProvider.prototype, "searchWeb");
    await expect(getSourcingProvider().searchWeb("pompa dosing")).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(http).toHaveBeenCalledOnce();
    expect(mock).not.toHaveBeenCalled();
  });
});

describe("shared core-ai client compatibility", () => {
  it("preserves binary response handling", async () => {
    http.mockResolvedValue(new Response("%PDF-fixture", { headers: { "content-type": "application/pdf" } }));
    expect((await coreAiPostBinary("/v1/pdf/render", { html: "example" })).toString()).toBe("%PDF-fixture");
  });

  it("keeps CoreAiError compatible with existing message-only construction", () => {
    expect(new CoreAiError("existing error").message).toBe("existing error");
  });
});
