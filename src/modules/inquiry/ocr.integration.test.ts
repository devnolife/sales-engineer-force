import { randomUUID } from "node:crypto";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireOrgContext } from "@/lib/org-context";
import type { ExtractedInquiry } from "@/modules/ai/types";
import { extractTextFromFile, type OcrDocument } from "@/modules/ai/ocr";
import {
  convertInquiryToQuotation, createInquiryFromFile, createInquiryFromText,
  extractInquiry, updateInquiryText,
} from "./service";
import { uploadPermintaanAction } from "./actions";
import { bestMatchesSemantic } from "./matching-semantic";

const { extract } = vi.hoisted(() => ({ extract: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/org-context", () => ({ requireOrgContext: vi.fn() }));
vi.mock("@/modules/ai", () => ({ getAiProvider: () => ({ name: "core-ai", extractInquiry: extract }) }));
vi.mock("@/modules/ai/ocr", () => ({
  extractTextFromFile: vi.fn(),
  isOcrSupported: (ext: string) => [".pdf", ".png", ".jpg", ".jpeg"].includes(ext),
}));
vi.mock("./matching-semantic", () => ({ bestMatchesSemantic: vi.fn().mockResolvedValue([]) }));

const text = "2 unit Pompa dosing\n4 pcs Membran RO 4040";
const observation: OcrDocument = { text, provider: "tesseract", pages: 1 };
const extraction: ExtractedInquiry = {
  items: [
    { rawText: "2 unit Pompa dosing", name: "Pompa dosing", qty: "2", unit: "unit" },
    { rawText: "4 pcs Membran RO 4040", name: "Membran RO 4040", qty: "4", unit: "pcs" },
  ],
  confidence: 0.8, provider: "local", note: "Parser lokal; periksa dokumen sumber.",
};

describe.runIf(process.env.RUN_DB_TESTS === "1")("inquiry document integration", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let orgDb: typeof import("@/lib/tenant").orgDb;
  let ctx: Awaited<ReturnType<typeof requireOrgContext>>;
  let otherOrg: string;

  beforeAll(async () => {
    if (process.env.DATABASE_URL !== "file:../.data/sourcing-test.db") {
      throw new Error("OCR tests require the disposable file:../.data/sourcing-test.db.");
    }
    ({ prisma } = await import("@/lib/db"));
    ({ orgDb } = await import("@/lib/tenant"));
  });
  beforeEach(() => {
    const orgId = `ocr-it-${randomUUID()}`;
    otherOrg = `ocr-it-${randomUUID()}`;
    ctx = {
      orgId, db: orgDb(orgId), userId: "ocr-test-user", userName: "Test",
      userEmail: "test@example.com", role: "member",
    };
    vi.mocked(requireOrgContext).mockResolvedValue(ctx);
    vi.mocked(extractTextFromFile).mockReset().mockResolvedValue(observation);
    extract.mockReset().mockResolvedValue(extraction);
    vi.mocked(bestMatchesSemantic).mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    if (!ctx) return;
    const where = { organizationId: { in: [ctx.orgId, otherOrg] } };
    await prisma.aiLog.deleteMany({ where });
    await prisma.inquiry.deleteMany({ where });
    await prisma.product.deleteMany({ where });
    await rm(path.join(process.cwd(), ".data/uploads", ctx.orgId), { recursive: true, force: true });
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  async function upload() {
    return createInquiryFromFile(ctx, ctx.userId, {
      name: "pengajuan.png", bytes: Buffer.from("synthetic-image"),
    });
  }

  async function uploadedFiles() {
    try {
      return await readdir(path.join(process.cwd(), ".data/uploads", ctx.orgId));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
      throw error;
    }
  }

  it("persists actual OCR provenance, source text and a private original file", async () => {
    const inquiry = await upload();
    expect(inquiry).toMatchObject({
      source: "UPLOAD", rawText: text, ocrProvider: "tesseract", ocrPages: 1, status: "NEW",
    });
    if (!inquiry.filePath) throw new Error("Original document not saved");
    const saved = path.join(process.cwd(), inquiry.filePath);
    expect(await readFile(saved, "utf8")).toBe("synthetic-image");
    expect((await stat(saved)).mode & 0o777).toBe(0o600);
    expect(await ctx.db.aiLog.findMany()).toMatchObject([{
      kind: "DOCUMENT_READ", provider: "tesseract",
    }]);
  });

  it("rejects OCR failure rather than creating an unread inquiry and sample products", async () => {
    vi.mocked(extractTextFromFile).mockRejectedValue(new Error("Tidak ada teks yang terbaca."));
    await expect(upload()).rejects.toThrow("Tidak ada teks yang terbaca.");
    expect(await ctx.db.inquiry.count()).toBe(0);
    expect(await ctx.db.inquiryItem.count()).toBe(0);
    expect(await uploadedFiles()).toEqual([]);
  });

  it.each([".docx", ".xlsx", ".exe"])("rejects unsupported %s before disk or database writes", async (ext) => {
    await expect(createInquiryFromFile(ctx, ctx.userId, {
      name: `pengajuan${ext}`, bytes: Buffer.from("synthetic"),
    })).rejects.toThrow("Format file belum didukung.");
    expect(extractTextFromFile).not.toHaveBeenCalled();
    expect(await uploadedFiles()).toEqual([]);
    expect(await ctx.db.inquiry.count()).toBe(0);
  });

  it.each([Buffer.alloc(0), Buffer.from([0xff, 0xfe]), Buffer.from("a".repeat(20001))])(
    "does not silently accept empty, invalid UTF-8 or truncated text",
    async (bytes) => {
      await expect(createInquiryFromFile(ctx, ctx.userId, { name: "pengajuan.txt", bytes })).rejects.toThrow();
      expect(await ctx.db.inquiry.count()).toBe(0);
      expect(await uploadedFiles()).toEqual([]);
    },
  );

  it("reads text files without OCR and records their actual provenance", async () => {
    const inquiry = await createInquiryFromFile(ctx, ctx.userId, {
      name: "pengajuan.txt", bytes: Buffer.from(text),
    });
    expect(inquiry).toMatchObject({ rawText: text, ocrProvider: "text-file", ocrPages: null });
    expect(extractTextFromFile).not.toHaveBeenCalled();
  });

  it("keeps local parsing and catalog matching offline", async () => {
    const inquiry = await createInquiryFromText(ctx, ctx.userId, { rawText: text });
    await ctx.db.product.create({
      data: { organizationId: ctx.orgId, name: "Pompa dosing", unit: "unit" },
    });
    await extractInquiry(ctx, ctx.userId, inquiry.id);
    expect(bestMatchesSemantic).not.toHaveBeenCalled();
    expect(await ctx.db.inquiry.findFirst({ where: { id: inquiry.id } })).toMatchObject({
      extractionProvider: "local", processingNote: extraction.note, status: "EXTRACTED",
    });
    expect(await ctx.db.inquiryItem.findMany({ orderBy: { lineNo: "asc" } })).toMatchObject([
      { name: "Pompa dosing", qty: "2", unit: "unit" },
      { name: "Membran RO 4040", qty: "4", unit: "pcs" },
    ]);
  });

  it("does not pass an unread legacy upload to the mock provider", async () => {
    const inquiry = await ctx.db.inquiry.create({
      data: { organizationId: ctx.orgId, source: "UPLOAD", createdById: ctx.userId },
    });
    await expect(extractInquiry(ctx, ctx.userId, inquiry.id)).rejects.toThrow("Teks permintaan belum tersedia.");
    expect(extract).not.toHaveBeenCalled();
    expect(await ctx.db.inquiryItem.count()).toBe(0);
  });

  it("rejects demo data for a real uploaded document", async () => {
    const inquiry = await upload();
    extract.mockResolvedValue({ ...extraction, provider: "mock" });
    await expect(extractInquiry(ctx, ctx.userId, inquiry.id)).rejects.toThrow("Provider demo tidak digunakan untuk dokumen unggahan.");
    expect(await ctx.db.inquiryItem.count()).toBe(0);
  });

  it("returns a reviewable saved document when item extraction is unavailable", async () => {
    extract.mockRejectedValue(new Error("synthetic-private-backend-error"));
    const formData = new FormData();
    formData.set("file", new File(["synthetic-image"], "pengajuan.png", { type: "image/png" }));
    const outcome = await uploadPermintaanAction(formData);
    expect(outcome).toMatchObject({
      ok: true, data: { id: expect.any(String), warning: expect.stringContaining("Teks tersimpan") },
    });
    expect(JSON.stringify(outcome)).not.toContain("private");
    expect(await ctx.db.inquiry.findFirst()).toMatchObject({
      status: "NEW", rawText: text, processingNote: expect.stringContaining("belum berhasil"),
    });
    expect(await ctx.db.inquiryItem.count()).toBe(0);
  });

  it("keeps an empty parse visibly unextracted", async () => {
    const inquiry = await upload();
    extract.mockResolvedValue({ ...extraction, items: [], confidence: 0, note: "Tidak ada baris item yang dikenali." });
    await extractInquiry(ctx, ctx.userId, inquiry.id);
    expect(await ctx.db.inquiry.findFirst()).toMatchObject({
      status: "NEW", extractionProvider: "local", processingNote: "Tidak ada baris item yang dikenali.",
    });
    expect(await ctx.db.inquiryItem.count()).toBe(0);
  });

  it("preserves previous items when extraction fails or returns malformed values", async () => {
    const inquiry = await createInquiryFromText(ctx, ctx.userId, { rawText: text });
    await extractInquiry(ctx, ctx.userId, inquiry.id);
    const before = await ctx.db.inquiryItem.findMany({ orderBy: { id: "asc" } });
    extract.mockResolvedValue({ ...extraction, items: [{ ...extraction.items[0], qty: "0" }] });
    await expect(extractInquiry(ctx, ctx.userId, inquiry.id)).rejects.toThrow();
    expect(await ctx.db.inquiryItem.findMany({ orderBy: { id: "asc" } })).toEqual(before);
  });

  it("does not send another tenant's document to the extraction service", async () => {
    const inquiry = await prisma.inquiry.create({
      data: { organizationId: otherOrg, source: "UPLOAD", rawText: text, createdById: ctx.userId },
    });
    await expect(extractInquiry(ctx, ctx.userId, inquiry.id)).rejects.toThrow("Permintaan tidak ditemukan.");
    expect(extract).not.toHaveBeenCalled();
  });

  it("allows correcting source text without changing the uploaded original or silently replacing items", async () => {
    const inquiry = await upload();
    await extractInquiry(ctx, ctx.userId, inquiry.id);
    const before = await ctx.db.inquiryItem.findMany({ orderBy: { id: "asc" } });
    const corrected = "3 unit Pompa dosing\n4 pcs Membran RO 4040";
    await updateInquiryText(ctx, ctx.userId, inquiry.id, corrected);
    expect(await ctx.db.inquiry.findFirst()).toMatchObject({
      rawText: corrected, ocrProvider: "tesseract", status: "NEW",
      processingNote: expect.stringContaining("Ekstrak ulang"),
    });
    expect(await ctx.db.inquiryItem.findMany({ orderBy: { id: "asc" } })).toEqual(before);
    expect(await ctx.db.aiLog.count({ where: { kind: "INQUIRY_TEXT_EDIT" } })).toBe(1);
    if (!inquiry.filePath) throw new Error("Original document not saved");
    expect(await readFile(path.join(process.cwd(), inquiry.filePath), "utf8")).toBe("synthetic-image");
    await expect(convertInquiryToQuotation(ctx, ctx.userId, inquiry.id))
      .rejects.toThrow("Jalankan ekstraksi ulang setelah mengubah teks permintaan.");
  });

  it("keeps source editing tenant-scoped and rejects invalid text", async () => {
    const inquiry = await prisma.inquiry.create({
      data: { organizationId: otherOrg, rawText: text, createdById: ctx.userId },
    });
    await expect(updateInquiryText(ctx, ctx.userId, inquiry.id, "3 unit Pompa dosing"))
      .rejects.toThrow("Permintaan tidak ditemukan.");
    const own = await upload();
    await expect(updateInquiryText(ctx, ctx.userId, own.id, ""))
      .rejects.toThrow();
    expect((await ctx.db.inquiry.findFirst())?.rawText).toBe(text);
  });

  it("does not overwrite a newer source edit with an extraction already in flight", async () => {
    const inquiry = await upload();
    let resolveExtraction: (value: ExtractedInquiry) => void = () => {
      throw new Error("Extraction has not started");
    };
    extract.mockImplementationOnce(() => new Promise<ExtractedInquiry>((resolve) => {
      resolveExtraction = resolve;
    }));
    const pending = extractInquiry(ctx, ctx.userId, inquiry.id);
    await vi.waitFor(() => expect(extract).toHaveBeenCalledOnce());
    await updateInquiryText(ctx, ctx.userId, inquiry.id, "9 unit Pompa dosing");
    resolveExtraction(extraction);
    await expect(pending).rejects.toThrow("Teks permintaan berubah selama ekstraksi.");
    expect((await ctx.db.inquiry.findFirst())?.rawText).toBe("9 unit Pompa dosing");
    expect(await ctx.db.inquiryItem.count()).toBe(0);
  });
});
