import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InquirySourceCard } from "./inquiry-source-card";
import { inquiryProviderLabel } from "@/modules/inquiry/presentation";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/modules/inquiry/actions", () => ({ perbaruiTeksPermintaanAction: vi.fn() }));

describe("document source review", () => {
  it("shows actual OCR provenance, page count, limits and editable text", () => {
    const html = renderToStaticMarkup(createElement(InquirySourceCard, {
      inquiryId: "synthetic-inquiry", rawText: "2 unit Pompa dosing",
      ocrProvider: "tesseract", ocrPages: 2, readOnly: false,
    }));
    expect(html).toContain("Tesseract lokal");
    expect(html).toContain("2 halaman");
    expect(html).toContain("2 unit Pompa dosing");
    expect(html).toContain("Simpan teks");
    expect(html).toContain('maxLength="20000"');
    expect(html).toContain("dokumen asli tidak berubah");
    expect(html).not.toContain("mock");
  });

  it("provides a recovery editor for an old unread document without claiming OCR success", () => {
    const html = renderToStaticMarkup(createElement(InquirySourceCard, {
      inquiryId: "synthetic-inquiry", rawText: null,
      ocrProvider: null, ocrPages: null, readOnly: false,
    }));
    expect(html).toContain("Teks belum tersedia");
    expect(html).toContain("Tempel");
    expect(html).not.toContain("Tesseract");
  });

  it("does not claim historical or local parser results are mock", () => {
    expect(inquiryProviderLabel(null)).toBe("Provider belum tercatat");
    expect(inquiryProviderLabel("local")).toBe("Parser lokal (tanpa LLM)");
    expect(inquiryProviderLabel("mock")).toBe("Demo (mock)");
    expect(inquiryProviderLabel("ollama:qwen")).toBe("Ollama lokal");
  });

  it("explains the locked source after quotation conversion without suggesting unavailable edits", () => {
    const html = renderToStaticMarkup(createElement(InquirySourceCard, {
      inquiryId: "synthetic-inquiry", rawText: "2 unit Pompa dosing",
      ocrProvider: "pdf-text", ocrPages: 1, readOnly: true,
    }));
    expect(html).toContain("Teks terkunci karena permintaan sudah menjadi penawaran.");
    expect(html).not.toContain("Simpan koreksi");
    expect(html).not.toContain("Simpan teks");
  });
});
