import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fetch as httpFetch, Response } from "undici";
import { coreAiPost } from "./core-ai";

vi.mock("server-only", () => ({}));
vi.mock("undici", async (original) => ({
  ...await original<typeof import("undici")>(), fetch: vi.fn(),
}));

beforeEach(() => {
  vi.stubEnv("CORE_AI_URL", "http://core-ai.test");
  vi.mocked(httpFetch).mockReset();
});
afterEach(() => vi.unstubAllEnvs());

it("preserves a structured provider error code for safe client-facing messages", async () => {
  vi.mocked(httpFetch).mockResolvedValue(Response.json({
    error: { code: "TOO_MANY_PAGES", message: "Dokumen maksimal 5 halaman." },
  }, { status: 400 }));
  await expect(coreAiPost("/v1/ocr", {})).rejects.toMatchObject({ code: "TOO_MANY_PAGES" });
});

it("keeps legacy successful JSON calls compatible", async () => {
  vi.mocked(httpFetch).mockResolvedValue(Response.json({ text: "synthetic" }));
  await expect(coreAiPost("/v1/ocr", {})).resolves.toEqual({ text: "synthetic" });
});
