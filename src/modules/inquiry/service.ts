import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getAiProvider } from "@/modules/ai";
import { extractTextFromFile, isOcrSupported } from "@/modules/ai/ocr";
import type { OrgScope } from "@/modules/org/service";
import { createQuotation } from "@/modules/quotation/service";
import { bestMatch, type MatchCandidate } from "./matching";

/**
 * Modul permintaan (inquiry): upload/paste permintaan pelanggan ->
 * ekstraksi item (AI provider, sekarang mock) -> review manusia ->
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
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-100);
  const dir = path.join(UPLOAD_ROOT, scope.orgId);
  await mkdir(dir, { recursive: true });
  const fileName = `${Date.now()}-${safeName}`;
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, file.bytes);

  // Sumber teks:
  // - File teks: baca langsung.
  // - Gambar/PDF: OCR lokal (vision model / text layer) — gagal OCR tidak
  //   menggagalkan upload; user masih bisa tempel teks manual.
  const ext = path.extname(safeName).toLowerCase();
  let rawText = "";
  if (TEXT_EXTENSIONS.has(ext)) {
    rawText = file.bytes.toString("utf8").slice(0, 20000);
  } else if (isOcrSupported(ext)) {
    try {
      rawText = (await extractTextFromFile(ext, file.bytes)).slice(0, 20000);
    } catch (e) {
      console.error(`OCR gagal untuk ${safeName}:`, e);
    }
  }

  return scope.db.inquiry.create({
    data: {
      organizationId: scope.orgId,
      source: "UPLOAD",
      status: "NEW",
      fileName: safeName,
      filePath: path.relative(process.cwd(), filePath),
      rawText: rawText || null,
      createdById: userId,
    },
  });
}

// ---------- Ekstraksi (AI provider — mock) ----------

export async function extractInquiry(scope: OrgScope, userId: string, inquiryId: string) {
  const inquiry = await scope.db.inquiry.findFirst({ where: { id: inquiryId } });
  if (!inquiry) throw new Error("Permintaan tidak ditemukan.");

  const provider = getAiProvider();
  const extracted = await provider.extractInquiry({
    rawText: inquiry.rawText ?? "",
    fileName: inquiry.fileName ?? undefined,
  });

  // Kandidat pencocokan: seluruh produk aktif organisasi.
  const products = await scope.db.product.findMany({
    where: { isActive: true },
    select: { id: true, name: true, brand: true, type: true, spec: true, unit: true },
  });
  const candidates: MatchCandidate[] = products;

  // Ganti item lama (ekstraksi ulang = replace).
  await scope.db.inquiryItem.deleteMany({ where: { inquiryId } });

  for (const [index, item] of extracted.items.entries()) {
    const match = bestMatch(`${item.name} ${item.spec ?? ""}`, candidates);
    await scope.db.inquiryItem.create({
      data: {
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
      },
    });
  }

  const updated = await scope.db.inquiry.update({
    where: { id: inquiryId },
    data: {
      status: "EXTRACTED",
      extractedAt: new Date(),
      customerName: inquiry.customerName ?? extracted.customerName ?? null,
    },
  });

  // Log AI — bahan evaluasi & bukti human-in-the-loop sejak hari 1.
  await scope.db.aiLog.create({
    data: {
      organizationId: scope.orgId,
      kind: "INQUIRY_EXTRACTION",
      provider: extracted.provider,
      inputSummary: `${inquiry.fileName ?? "teks"} (${(inquiry.rawText ?? "").length} karakter)`,
      outputSummary: `${extracted.items.length} item, confidence ${extracted.confidence.toFixed(2)}${extracted.note ? ` — ${extracted.note}` : ""
        }`,
      createdById: userId,
    },
  });

  return { inquiry: updated, note: extracted.note, confidence: extracted.confidence };
}

// ---------- Review ----------

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
  if (inquiry.items.length === 0) {
    throw new Error("Belum ada item. Jalankan ekstraksi dulu.");
  }
  if (inquiry.quotationId) {
    throw new Error("Permintaan ini sudah dikonversi menjadi penawaran.");
  }

  const productIds = inquiry.items
    .map((i) => i.matchedProductId)
    .filter((v): v is string => Boolean(v));
  const products = await scope.db.product.findMany({ where: { id: { in: productIds } } });
  const productById = new Map(products.map((p) => [p.id, p]));

  const quotation = await createQuotation(scope, userId, {
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

  await scope.db.inquiry.update({
    where: { id: inquiryId },
    data: { status: "QUOTED", quotationId: quotation.id },
  });

  return quotation;
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
