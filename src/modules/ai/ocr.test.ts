import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreAiError, coreAiPost } from "@/lib/core-ai";
import { extractTextFromFile } from "./ocr";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/core-ai", () => ({
  CoreAiError: class extends Error {},
  coreAiPost: vi.fn(),
}));

const post = vi.mocked(coreAiPost);
const bytes = Buffer.from("synthetic-document");
const document = { text: "2 unit Pompa dosing", provider: "tesseract", pages: 1 };

beforeEach(() => {
  post.mockReset();
  vi.stubEnv("OCR_REQUEST_TIMEOUT_MS", "150000");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("document OCR client", () => {
  it("preserves real OCR provenance and page count", async () => {
    post.mockResolvedValue(document);
    await expect(extractTextFromFile(".png", bytes)).resolves.toEqual(document);
    expect(post).toHaveBeenCalledWith("/v1/ocr", {
      ext: ".png", dataBase64: bytes.toString("base64"),
    }, { timeoutMs: 150000 });
  });

  it.each(["pdf-text", "tesseract", "ollama"])("accepts actual %s observations", async (provider) => {
    post.mockResolvedValue({ ...document, provider });
    await expect(extractTextFromFile(".pdf", bytes)).resolves.toMatchObject({ provider });
  });

  it.each([
    { text: "" }, { text: "   " }, { text: "a".repeat(20001) },
    { provider: "mock" }, { provider: undefined }, { pages: 0 },
    { pages: 6 }, { pages: 1.5 }, { text: 42 },
  ])("rejects malformed or truncated-shape response case %#", async (patch) => {
    post.mockResolvedValue({ ...document, ...patch });
    await expect(extractTextFromFile(".pdf", bytes)).rejects.toThrow(
      "Respons OCR tidak valid. Dokumen belum disimpan.",
    );
  });

  it("does not send an empty or oversized document", async () => {
    await expect(extractTextFromFile(".png", Buffer.alloc(0))).rejects.toThrow();
    await expect(extractTextFromFile(".png", Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });

  it("rejects formats without a document reader", async () => {
    await expect(extractTextFromFile(".docx", bytes)).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });

  it("surfaces known page-limit errors without exposing the upstream message", async () => {
    post.mockRejectedValue(Object.assign(new CoreAiError("private-document-fragment"), {
      code: "TOO_MANY_PAGES",
    }));
    await expect(extractTextFromFile(".pdf", bytes)).rejects.toThrow("Dokumen maksimal 5 halaman.");
  });

  it("does not expose raw network or provider errors", async () => {
    post.mockRejectedValue(new Error("private-document-fragment"));
    await expect(extractTextFromFile(".png", bytes)).rejects.toThrow(
      "Layanan OCR tidak tersedia. Coba lagi atau tempel teks permintaan.",
    );
  });

  it("rejects an invalid configured timeout before transport", async () => {
    vi.stubEnv("OCR_REQUEST_TIMEOUT_MS", "0");
    await expect(extractTextFromFile(".png", bytes)).rejects.toThrow("Konfigurasi batas waktu OCR tidak valid.");
    expect(post).not.toHaveBeenCalled();
  });
});
