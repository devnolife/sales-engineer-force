import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coreAiPost } from "@/lib/core-ai";
import { getAiProvider } from "./index";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/core-ai", () => ({
  isCoreAiEnabled: () => true,
  coreAiPost: vi.fn(),
}));

const post = vi.mocked(coreAiPost);
const input = { rawText: "2 unit Pompa dosing" };
const extracted = {
  items: [{ rawText: input.rawText, name: "Pompa dosing", qty: "2", unit: "unit" }],
  confidence: 0.8, provider: "local", note: "Periksa kembali dokumen sumber.",
};

beforeEach(() => {
  post.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("remote inquiry extraction", () => {
  it("returns a validated local observation", async () => {
    post.mockResolvedValue(extracted);
    await expect(getAiProvider().extractInquiry(input)).resolves.toEqual(extracted);
  });

  it.each([114, 200])("accepts a backend-valid Ollama model name of %i characters", async (length) => {
    const observation = { ...extracted, provider: `ollama:${"a".repeat(length)}` };
    post.mockResolvedValue(observation);
    await expect(getAiProvider().extractInquiry(input)).resolves.toEqual(observation);
  });

  it("accepts the shared twenty-character unit boundary", async () => {
    const observation = { ...extracted, items: [{ ...extracted.items[0], unit: "a".repeat(20) }] };
    post.mockResolvedValue(observation);
    await expect(getAiProvider().extractInquiry(input)).resolves.toEqual(observation);
  });

  it("never invents mock items when the configured backend is unavailable", async () => {
    post.mockRejectedValue(new Error("private-upstream-detail"));
    await expect(getAiProvider().extractInquiry(input)).rejects.toThrow(
      "Ekstraksi item tidak tersedia. Teks permintaan tetap dapat direview.",
    );
    expect(console.error).not.toHaveBeenCalledWith(expect.anything(), expect.any(Error));
  });

  it.each([
    { items: [{ ...extracted.items[0], qty: "0" }] },
    { items: [{ ...extracted.items[0], qty: "NaN" }] },
    { items: [{ ...extracted.items[0], name: "" }] },
    { items: [{ ...extracted.items[0], rawText: "" }] },
    { items: "not-an-array" },
    { confidence: 2 },
    { provider: "" },
    { provider: "unknown-provider" },
    { provider: "ollama:_invalid-model" },
    { provider: `ollama:${"a".repeat(201)}` },
    { items: [{ ...extracted.items[0], unit: "a".repeat(21) }] },
  ])("rejects malformed extracted data %j", async (patch) => {
    post.mockResolvedValue({ ...extracted, ...patch });
    await expect(getAiProvider().extractInquiry(input)).rejects.toThrow(
      "Hasil ekstraksi item tidak valid. Periksa teks permintaan.",
    );
  });

  it("preserves a truthful empty result without sample products", async () => {
    post.mockResolvedValue({ ...extracted, items: [], confidence: 0 });
    await expect(getAiProvider().extractInquiry({ rawText: "Mohon hubungi kami." }))
      .resolves.toMatchObject({ items: [], provider: "local" });
  });
});
