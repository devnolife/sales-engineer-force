import { randomUUID } from "node:crypto";
import { mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getAiProvider } from "@/modules/ai";
import { extractTextFromFile, isOcrSupported } from "@/modules/ai/ocr";
import { extractedInquirySchema } from "@/modules/ai/schema";
import type { OrgScope } from "@/modules/org/service";
import { createQuotation } from "@/modules/quotation/service";
import { bestMatch, type MatchCandidate } from "./matching";
import { bestMatchesSemantic } from "./matching-semantic";

/**
 * Modul permintaan (inquiry): upload/paste permintaan pelanggan ->
 * OCR / ekstraksi item -> review manusia ->
 * konversi jadi draft penawaran.
 *
 * Kebijakan human-in-the-loop (PRD §7.5): hasil ekstraksi SELALU berupa draft
 * untuk direview; tidak ada yang otomatis terkirim ke pelanggan.
 */

export const INQUIRY_STATUSES = ["NEW", "EXTRACTED", "REVIEWED", "QUOTED", "ARCHIVED"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const INQUIRY_STATUS_LABEL: Record<InquiryStatus, string> = {
  NEW: "Baru",
  EXTRACTED: "Terekstrak",
  REVIEWED: "Direview",
  QUOTED: "Jadi Penawaran",
  ARCHIVED: "Diarsipkan",
};

const UPLOAD_ROOT = path.join(process.cwd(), ".data", "uploads");
const TEXT_EXTENSIONS = new Set([".txt", ".csv", ".md", ".text"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export const permintaanTeksSchema = z.object({
  rawText: z.string().trim().min(10, "Teks permintaan terlalu pendek").max(20000),
  customerId: z.string().optional().or(z.literal("")).default(""),
});

export const inquiryItemPatchSchema = z.object({
  name: z.string().trim().min(1).max(300),
  qty: z.string().trim().regex(/^\d+(\.\d+)?$/, "Qty harus angka"),
  unit: z.string().trim().max(20).optional().default(""),
  spec: z.string().trim().max(1000).optional().default(""),
});

// ---------- Pembuatan ----------

export async function createInquiryFromText(
  scope: OrgScope,
  userId: string,
  input: z.input<typeof permintaanTeksSchema>,
) {
  const parsed = permintaanTeksSchema.parse(input);
  return scope.db.inquiry.create({
    data: {
      organizationId: scope.orgId,
      source: "PASTE",
      status: "NEW",
      rawText: parsed.rawText,
      customerId: parsed.customerId || null,
      createdById: userId,
    },
  });
}

export async function createInquiryFromFile(
  scope: OrgScope,
  userId: string,
  file: { name: string; bytes: Buffer },
) {
  if (file.bytes.byteLength > MAX_FILE_BYTES) {
    throw new Error("Ukuran file maksimal 5 MB.");
  }
  if (!file.bytes.byteLength) throw new Error("File permintaan kosong.");
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-100);
  const ext = path.extname(safeName).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext) && !isOcrSupported(ext)) {
    throw new Error("Format file belum didukung. Gunakan PDF, PNG, JPG, TXT, CSV, atau MD.");
  }

  let rawText: string;
  let ocrProvider: string;
  let ocrPages: number | null = null;
  if (TEXT_EXTENSIONS.has(ext)) {
    try {
      rawText = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes).trim();
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      throw new Error("File teks harus memakai encoding UTF-8.");
    }
    ocrProvider = "text-file";
  } else {
    const document = await extractTextFromFile(ext, file.bytes);
    rawText = document.text;
    ocrProvider = document.provider;
    ocrPages = document.pages;
  }
  if (!rawText.trim()) throw new Error("Tidak ada teks yang terbaca. Tempel teks permintaan atau gunakan dokumen lebih jelas.");
  if (rawText.length > 20000) throw new Error("Teks dokumen maksimal 20.000 karakter.");

  const dir = path.join(UPLOAD_ROOT, scope.orgId);
  const fileName = `${randomUUID()}-${safeName}`;
  const filePath = path.join(dir, fileName);
  let ownsFile = false;
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const handle = await open(filePath, "wx", 0o600);
    ownsFile = true;
    try {
      await handle.writeFile(file.bytes);
    } finally {
      await handle.close();
    }
    return await scope.db.$transaction(async (tx) => {
      const inquiry = await tx.inquiry.create({
        data: {
          organizationId: scope.orgId, source: "UPLOAD", status: "NEW",
          fileName: safeName, filePath: path.relative(process.cwd(), filePath),
          rawText, ocrProvider, ocrPages, createdById: userId,
        },
      });
      await tx.aiLog.create({
        data: {
          organizationId: scope.orgId, kind: "DOCUMENT_READ", provider: ocrProvider,
          inputSummary: `Permintaan ${inquiry.id} (${file.bytes.byteLength} byte)`,
          outputSummary: `${rawText.length} karakter${ocrPages ? `, ${ocrPages} halaman` : ""}`,
          createdById: userId,
        },
      });
      return inquiry;
    });
  } catch (error) {
    console.error("Penyimpanan dokumen permintaan gagal.", {
      kind: error instanceof Error ? error.name : "unknown",
    });
    if (ownsFile) {
      try {
        await unlink(filePath);
      } catch (cleanupError) {
        console.error("Pembersihan dokumen yang gagal disimpan tidak berhasil.", {
          kind: cleanupError instanceof Error ? cleanupError.name : "unknown",
        });
        throw new Error("Dokumen gagal disimpan dan dibersihkan. Hubungi pengelola.");
      }
    }
    throw new Error("Dokumen gagal disimpan. Coba lagi.");
  }
}

// ---------- Ekstraksi ----------

export async function extractInquiry(scope: OrgScope, userId: string, inquiryId: string) {
  const inquiry = await scope.db.inquiry.findFirst({ where: { id: inquiryId } });
  if (!inquiry) throw new Error("Permintaan tidak ditemukan.");
  if (!inquiry.rawText?.trim()) throw new Error("Teks permintaan belum tersedia. Tempel teks atau unggah ulang dokumen.");

  const provider = getAiProvider();
  const observation = await provider.extractInquiry({
    rawText: inquiry.rawText,
    fileName: inquiry.fileName ?? undefined,
  });
  const parsed = extractedInquirySchema.safeParse(observation);
  if (!parsed.success) throw new Error("Hasil ekstraksi item tidak valid. Periksa teks permintaan.");
  const extracted = parsed.data;
  if (inquiry.source === "UPLOAD" && /^mock(?::|$)/.test(extracted.provider)) {
    throw new Error("Provider demo tidak digunakan untuk dokumen unggahan. Konfigurasikan ekstraksi lokal.");
  }

  // Kandidat pencocokan: seluruh produk aktif organisasi.
  const products = await scope.db.product.findMany({
    where: { isActive: true },
    select: { id: true, name: true, brand: true, type: true, spec: true, unit: true },
  });
  const candidates: MatchCandidate[] = products;

  const queries = extracted.items.map((item) => `${item.name} ${item.spec ?? ""}`);
  const matches = extracted.provider === "local"
    ? queries.map((query) => bestMatch(query, candidates))
    : await bestMatchesSemantic(queries, candidates);
  const note = extracted.note || (extracted.items.length === 0
    ? "Tidak ada baris barang yang dikenali. Periksa dan perbaiki teks sumber." : undefined);

  const updated = await scope.db.$transaction(async (tx) => {
    const current = await tx.inquiry.findFirst({ where: { id: inquiryId } });
    if (!current) throw new Error("Permintaan tidak ditemukan.");
    if (current.rawText !== inquiry.rawText) {
      throw new Error("Teks permintaan berubah selama ekstraksi. Jalankan Ekstrak ulang.");
    }
    await tx.inquiryItem.deleteMany({ where: { inquiryId, organizationId: scope.orgId } });
    for (const [index, item] of extracted.items.entries()) {
      const match = matches[index] ?? null;
      await tx.inquiryItem.create({ data: {
        organizationId: scope.orgId,
        inquiryId,
        lineNo: index + 1,
        rawText: item.rawText,
        name: item.name,
        qty: item.qty,
        unit: item.unit || null,
        spec: item.spec || null,
        matchedProductId: match && match.status !== "UNMATCHED" ? match.productId : null,
        matchStatus: match?.status ?? "UNMATCHED",
        matchScore: match?.score ?? null,
      } });
    }
    const committed = await tx.inquiry.updateMany({
      where: {
        id: inquiryId, organizationId: scope.orgId, rawText: inquiry.rawText,
        updatedAt: current.updatedAt, quotationId: current.quotationId, status: current.status,
      },
      data: {
        status: current.quotationId ? "QUOTED" : extracted.items.length ? "EXTRACTED" : "NEW",
        extractedAt: extracted.items.length ? new Date() : null,
        extractionProvider: extracted.provider, processingNote: note ?? null,
        customerName: current.customerName ?? extracted.customerName ?? null,
      },
    });
    if (committed.count !== 1) {
      throw new Error("Permintaan berubah selama ekstraksi. Jalankan Ekstrak ulang.");
    }
    await tx.aiLog.create({
      data: {
        organizationId: scope.orgId, kind: "INQUIRY_EXTRACTION", provider: extracted.provider,
        inputSummary: `Permintaan ${inquiry.id} (${inquiry.rawText?.length ?? 0} karakter)`,
        outputSummary: `${extracted.items.length} item, confidence ${extracted.confidence.toFixed(2)}${note ? ` — ${note}` : ""}`,
        createdById: userId,
      },
    });
    return tx.inquiry.findFirstOrThrow({ where: { id: inquiryId } });
  });

  return { inquiry: updated, note, confidence: extracted.confidence,
    provider: extracted.provider, itemCount: extracted.items.length };
}

// ---------- Review ----------

export async function updateInquiryText(
  scope: OrgScope, userId: string, inquiryId: string, rawText: string,
) {
  const inquiry = await scope.db.inquiry.findFirst({ where: { id: inquiryId } });
  if (!inquiry) throw new Error("Permintaan tidak ditemukan.");
  if (inquiry.quotationId) throw new Error("Teks permintaan yang sudah menjadi penawaran tidak dapat diubah.");
  const text = permintaanTeksSchema.shape.rawText.parse(rawText);
  if (text === inquiry.rawText) return inquiry;
  return scope.db.$transaction(async (tx) => {
    const committed = await tx.inquiry.updateMany({
      where: {
        id: inquiryId, organizationId: scope.orgId, rawText: inquiry.rawText, quotationId: null,
      },
      data: {
        rawText: text, status: "NEW",
        processingNote: "Teks sumber diubah. Jalankan Ekstrak ulang; item sebelumnya belum diperbarui.",
      },
    });
    if (committed.count !== 1) {
      throw new Error("Permintaan berubah atau sudah menjadi penawaran. Muat ulang sebelum menyunting.");
    }
    await tx.aiLog.create({ data: {
      organizationId: scope.orgId, kind: "INQUIRY_TEXT_EDIT", provider: "manual",
      inputSummary: `Permintaan ${inquiryId}`,
      outputSummary: `${text.length} karakter; ekstraksi ulang diperlukan`,
      createdById: userId,
    } });
    return tx.inquiry.findFirstOrThrow({ where: { id: inquiryId } });
  });
}

export async function updateInquiryItem(
  scope: OrgScope,
  itemId: string,
  input: z.input<typeof inquiryItemPatchSchema>,
) {
  const parsed = inquiryItemPatchSchema.parse(input);
  return scope.db.inquiryItem.update({
    where: { id: itemId },
    data: {
      name: parsed.name,
      qty: parsed.qty,
      unit: parsed.unit || null,
      spec: parsed.spec || null,
    },
  });
}

export async function setInquiryItemMatch(
  scope: OrgScope,
  itemId: string,
  productId: string | null,
) {
  if (productId) {
    const product = await scope.db.product.findFirst({ where: { id: productId } });
    if (!product) throw new Error("Produk tidak ditemukan.");
  }
  return scope.db.inquiryItem.update({
    where: { id: itemId },
    data: {
      matchedProductId: productId,
      matchStatus: productId ? "MATCHED" : "UNMATCHED",
      matchScore: productId ? 1 : null,
    },
  });
}

export async function deleteInquiryItem(scope: OrgScope, itemId: string) {
  return scope.db.inquiryItem.delete({ where: { id: itemId } });
}

export async function setInquiryCustomer(
  scope: OrgScope,
  inquiryId: string,
  data: { customerId?: string; customerName?: string },
) {
  if (data.customerId) {
    const customer = await scope.db.customer.findFirst({ where: { id: data.customerId } });
    if (!customer) throw new Error("Pelanggan tidak ditemukan.");
    return scope.db.inquiry.update({
      where: { id: inquiryId },
      data: { customerId: data.customerId, customerName: customer.name },
    });
  }
  return scope.db.inquiry.update({
    where: { id: inquiryId },
    data: { customerName: data.customerName ?? null },
  });
}

// ---------- Konversi -> draft penawaran ----------

export async function convertInquiryToQuotation(
  scope: OrgScope,
  userId: string,
  inquiryId: string,
) {
  const inquiry = await scope.db.inquiry.findFirst({
    where: { id: inquiryId },
    include: { items: { orderBy: { lineNo: "asc" } } },
  });
  if (!inquiry) throw new Error("Permintaan tidak ditemukan.");
  if (inquiry.status === "NEW" && inquiry.items.length > 0) {
    throw new Error("Jalankan ekstraksi ulang setelah mengubah teks permintaan.");
  }
  if (inquiry.items.length === 0) {
    throw new Error("Belum ada item. Jalankan ekstraksi dulu.");
  }
  if (inquiry.quotationId) {
    throw new Error("Permintaan ini sudah dikonversi menjadi penawaran.");
  }

  return scope.db.$transaction(async (tx) => {
    const productIds = inquiry.items
      .map((i) => i.matchedProductId)
      .filter((v): v is string => Boolean(v));
    const products = await tx.product.findMany({ where: { id: { in: productIds } } });
    const productById = new Map(products.map((p) => [p.id, p]));

    const quotation = await createQuotation({ orgId: scope.orgId, db: tx }, userId, {
      customerId: inquiry.customerId ?? "",
      customerName: inquiry.customerName ?? "(isi nama pelanggan)",
      attn: "",
      subject: `Penawaran atas permintaan ${inquiry.customerName ?? inquiry.fileName ?? "pelanggan"
        }`,
      quoteDate: "",
      franco: "",
      deliveryTime: "",
      termsOfPayment: "",
      priceIncludeNote: "",
      validityDays: 30,
      vatPercent: 11,
      docDiscountType: "AMOUNT",
      docDiscountValue: "0",
      notes: `Dibuat dari permintaan ${inquiry.fileName ?? inquiry.id} (ekstraksi ${inquiry.extractedAt?.toISOString() ?? "-"
        })`,
      items: inquiry.items.map((item) => {
        const product = item.matchedProductId
          ? productById.get(item.matchedProductId)
          : undefined;
        return {
          productId: product?.id ?? "",
          name: product?.name ?? item.name,
          brand: product?.brand ?? "",
          type: product?.type ?? "",
          spec: product?.spec ?? item.spec ?? "",
          qty: item.qty,
          unit: item.unit || product?.unit || "Unit",
          unitPrice: product?.defaultPrice ?? "0",
          discountPercent: "0",
        };
      }),
    });
    const committed = await tx.inquiry.updateMany({
      where: {
        id: inquiryId, organizationId: scope.orgId, rawText: inquiry.rawText,
        updatedAt: inquiry.updatedAt, status: inquiry.status, quotationId: null,
      },
      data: { status: "QUOTED", quotationId: quotation.id },
    });
    if (committed.count !== 1) {
      throw new Error("Permintaan berubah selama konversi. Review teks dan item sebelum mencoba lagi.");
    }
    return quotation;
  });
}

// ---------- Query ----------

export async function listInquiries(scope: OrgScope, filter: { status?: InquiryStatus } = {}) {
  return scope.db.inquiry.findMany({
    where: filter.status ? { status: filter.status } : {},
    include: {
      _count: { select: { items: true } },
      quotation: { select: { id: true, numberBase: true, revision: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function getInquiry(scope: OrgScope, id: string) {
  return scope.db.inquiry.findFirst({
    where: { id },
    include: {
      items: { orderBy: { lineNo: "asc" } },
      quotation: { select: { id: true, numberBase: true, revision: true, status: true } },
    },
  });
}

export async function deleteInquiry(scope: OrgScope, id: string) {
  return scope.db.inquiry.delete({ where: { id } });
}
