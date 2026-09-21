import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { OrgScope } from "@/modules/org/service";
import { getOrgSettings } from "@/modules/org/service";
import { computeTotals } from "./lib/quotation-math";
import {
  counterYear,
  formatQuotationNumber,
  withRevision,
} from "./lib/quotation-number";
import { terbilangRupiah } from "./lib/terbilang";
import { quotationInputSchema, type QuotationInput } from "./schema";

/**
 * Service penawaran (port dari Metito, digeneralisasi multi-tenant).
 *
 * Invariant yang dipertahankan:
 * - Validasi SEBELUM alokasi nomor (issue gagal tidak membakar nomor).
 * - Totals selalu dihitung ulang server-side dari item.
 * - Counter atomik per (organisasi, tahun): upsert-increment satu statement,
 *   retry saat tabrakan create pertama (P2002).
 * - Dokumen terbit immutable — perubahan hanya lewat revisi.
 * - Revisi mematikan share token dokumen sumber.
 * - Snapshot DIPERLUAS (menutup celah Metito): kop, rekening, penandatangan
 *   ikut dibekukan saat issue.
 */

export class QuotationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "QuotationError";
    this.statusCode = statusCode;
  }
}

const MAX_ALLOCATION_ATTEMPTS = 5;

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Alokasi nomor urut atomik per (organisasi, tahun).
 * Dipanggil di dalam transaksi; upsert-increment dalam satu statement.
 */
export async function allocateSeq(tx: Tx, organizationId: string, year: number): Promise<number> {
  const counter = await tx.quotationCounter.upsert({
    where: { organizationId_year: { organizationId, year } },
    create: { organizationId, year, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
    select: { lastSeq: true },
  });
  return counter.lastSeq;
}

/** Token share publik yang tidak bisa ditebak. */
export function generatePublicToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Nomor tampilan: revisi SUFFIX memakai "Rev.N"; dokumen asli apa adanya. */
export function displayNumber(numberBase: string | null, revision: number): string {
  if (!numberBase) return "(Draft — belum bernomor)";
  return withRevision(numberBase, revision);
}

// ---------- Helper internal ----------

function computeStoredTotals(input: {
  items: { qty: string; unitPrice: string; discountPercent: string }[];
  vatRate: string;
  docDiscountType: "AMOUNT" | "PERCENT";
  docDiscountValue: string;
}) {
  const totals = computeTotals(
    input.items.map((i) => ({
      qty: i.qty,
      unitPrice: i.unitPrice,
      discountPercent: i.discountPercent,
    })),
    input.vatRate,
    { type: input.docDiscountType, value: input.docDiscountValue },
  );
  return {
    lineTotals: totals.lineTotals.map((d) => d.toFixed(2)),
    subtotal: totals.subtotal.toFixed(2),
    discountAmount: totals.discountAmount.toFixed(2),
    vatAmount: totals.vatAmount.toFixed(0),
    total: totals.total.toFixed(2),
    amountInWords: terbilangRupiah(totals.total.toFixed(0)),
  };
}

function normalizeItems(parsed: ReturnType<typeof quotationInputSchema.parse>) {
  return parsed.items.map((item, index) => ({
    lineNo: index + 1,
    productId: item.productId || null,
    name: item.name,
    brand: item.brand || null,
    type: item.type || null,
    spec: item.spec || null,
    qty: item.qty,
    unit: item.unit,
    unitPrice: item.unitPrice,
    discountPercent: item.discountPercent,
  }));
}

// ---------- CRUD draft ----------

export async function createQuotation(scope: OrgScope, userId: string, input: QuotationInput) {
  const parsed = quotationInputSchema.parse(input);
  const vatRate = (parsed.vatPercent / 100).toString();
  const items = normalizeItems(parsed);
  const totals = computeStoredTotals({
    items,
    vatRate,
    docDiscountType: parsed.docDiscountType,
    docDiscountValue: parsed.docDiscountValue,
  });

  if (parsed.customerId) {
    const customer = await scope.db.customer.findFirst({ where: { id: parsed.customerId } });
    if (!customer) throw new QuotationError("Pelanggan tidak ditemukan.", 404);
  }

  return scope.db.quotation.create({
    data: {
      organizationId: scope.orgId,
      status: "DRAFT",
      customerId: parsed.customerId || null,
      customerName: parsed.customerName,
      attn: parsed.attn || null,
      subject: parsed.subject,
      quoteDate: parsed.quoteDate ? new Date(parsed.quoteDate) : new Date(),
      franco: parsed.franco || null,
      deliveryTime: parsed.deliveryTime || null,
      termsOfPayment: parsed.termsOfPayment || null,
      priceIncludeNote: parsed.priceIncludeNote || null,
      validityDays: parsed.validityDays,
      vatRate,
      docDiscountType: parsed.docDiscountType,
      docDiscountValue: parsed.docDiscountValue,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      vatAmount: totals.vatAmount,
      total: totals.total,
      amountInWords: totals.amountInWords,
      notes: parsed.notes || null,
      createdById: userId,
      items: {
        create: items.map((item, i) => ({
          ...item,
          organizationId: scope.orgId,
          lineTotal: totals.lineTotals[i],
        })),
      },
    },
    include: { items: true },
  });
}

export async function updateQuotation(scope: OrgScope, id: string, input: QuotationInput) {
  const existing = await scope.db.quotation.findFirst({ where: { id } });
  if (!existing) throw new QuotationError("Penawaran tidak ditemukan.", 404);
  if (existing.status !== "DRAFT") {
    throw new QuotationError("Dokumen terbit tidak bisa diubah. Buat revisi.", 409);
  }

  const parsed = quotationInputSchema.parse(input);
  const vatRate = (parsed.vatPercent / 100).toString();
  const items = normalizeItems(parsed);
  const totals = computeStoredTotals({
    items,
    vatRate,
    docDiscountType: parsed.docDiscountType,
    docDiscountValue: parsed.docDiscountValue,
  });

  // Item diganti seluruhnya agar lineNo tetap rapat (pola Metito).
  await scope.db.quotationItem.deleteMany({ where: { quotationId: id } });

  return scope.db.quotation.update({
    where: { id },
    data: {
      customerId: parsed.customerId || null,
      customerName: parsed.customerName,
      attn: parsed.attn || null,
      subject: parsed.subject,
      quoteDate: parsed.quoteDate ? new Date(parsed.quoteDate) : existing.quoteDate,
      franco: parsed.franco || null,
      deliveryTime: parsed.deliveryTime || null,
      termsOfPayment: parsed.termsOfPayment || null,
      priceIncludeNote: parsed.priceIncludeNote || null,
      validityDays: parsed.validityDays,
      vatRate,
      docDiscountType: parsed.docDiscountType,
      docDiscountValue: parsed.docDiscountValue,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      vatAmount: totals.vatAmount,
      total: totals.total,
      amountInWords: totals.amountInWords,
      notes: parsed.notes || null,
      items: {
        create: items.map((item, i) => ({
          ...item,
          organizationId: scope.orgId,
          lineTotal: totals.lineTotals[i],
        })),
      },
    },
    include: { items: true },
  });
}

export async function deleteQuotation(scope: OrgScope, id: string) {
  const existing = await scope.db.quotation.findFirst({ where: { id } });
  if (!existing) throw new QuotationError("Penawaran tidak ditemukan.", 404);
  if (existing.status !== "DRAFT") {
    throw new QuotationError("Dokumen terbit adalah arsip dan tidak bisa dihapus.", 409);
  }
  return scope.db.quotation.delete({ where: { id } });
}

// ---------- Issue (terbitkan) ----------

export async function issueQuotation(scope: OrgScope, userId: string, id: string) {
  const quotation = await scope.db.quotation.findFirst({
    where: { id },
    include: { items: { orderBy: { lineNo: "asc" } } },
  });
  if (!quotation) throw new QuotationError("Penawaran tidak ditemukan.", 404);
  if (quotation.status !== "DRAFT") {
    throw new QuotationError("Hanya draft yang bisa diterbitkan.", 409);
  }

  // ---- Validasi SEBELUM alokasi nomor ----
  if (quotation.items.length === 0) {
    throw new QuotationError("Penawaran harus punya minimal satu item.");
  }
  if (!quotation.customerName.trim()) throw new QuotationError("Nama pelanggan wajib diisi.");
  if (!quotation.subject.trim()) throw new QuotationError("Perihal wajib diisi.");
  for (const item of quotation.items) {
    if (!item.name.trim()) throw new QuotationError(`Item baris ${item.lineNo}: nama kosong.`);
    if (Number(item.qty) <= 0) {
      throw new QuotationError(`Item baris ${item.lineNo}: qty harus lebih dari 0.`);
    }
  }

  // ---- Hitung ulang totals server-side (tidak percaya nilai tersimpan) ----
  const totals = computeStoredTotals({
    items: quotation.items.map((i) => ({
      qty: i.qty,
      unitPrice: i.unitPrice,
      discountPercent: i.discountPercent,
    })),
    vatRate: quotation.vatRate,
    docDiscountType: quotation.docDiscountType as "AMOUNT" | "PERCENT",
    docDiscountValue: quotation.docDiscountValue,
  });

  // ---- Snapshot identitas organisasi (kop, rekening, penandatangan) ----
  const [settings, organization] = await Promise.all([
    getOrgSettings(scope),
    prisma.organization.findUniqueOrThrow({
      where: { id: scope.orgId },
      select: { name: true, logo: true },
    }),
  ]);

  const issuedAt = new Date();
  const validUntil = new Date(issuedAt.getTime() + quotation.validityDays * 24 * 60 * 60 * 1000);

  const snapshot = {
    orgName: organization.name,
    orgAddress: settings.address,
    orgNpwp: settings.npwp,
    orgPhone: settings.phone,
    orgEmail: settings.email,
    orgLogo: organization.logo,
    bankName: settings.bankName,
    bankAccount: settings.bankAccount,
    bankBranch: settings.bankBranch,
    bankHolder: settings.bankHolder,
    signerName: settings.signerName,
    signerTitle: settings.signerTitle,
  };

  const baseUpdate = {
    status: "SENT" as const,
    issuedAt,
    validUntil,
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    vatAmount: totals.vatAmount,
    total: totals.total,
    amountInWords: totals.amountInWords,
    publicToken: quotation.publicToken ?? generatePublicToken(),
    ...snapshot,
  };

  const itemIds = quotation.items.map((i) => i.id);

  let issued;

  // Revisi SUFFIX mewarisi nomor induk — counter TIDAK bertambah.
  if (quotation.revision > 0 && quotation.parentId) {
    const parent = await scope.db.quotation.findFirst({
      where: { id: quotation.parentId },
      select: { seq: true, numberBase: true },
    });
    if (!parent?.numberBase || parent.seq == null) {
      throw new QuotationError("Dokumen induk revisi tidak valid.", 500);
    }
    issued = await prisma.$transaction(async (tx) => {
      const updated = await tx.quotation.update({
        where: { id: quotation.id },
        data: { ...baseUpdate, seq: parent.seq, numberBase: parent.numberBase },
      });
      for (const [i, itemId] of itemIds.entries()) {
        await tx.quotationItem.update({
          where: { id: itemId },
          data: { lineTotal: totals.lineTotals[i] },
        });
      }
      return updated;
    });
  } else {
    // Alokasi nomor baru dengan retry (tabrakan create counter pertama = P2002).
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt++) {
      try {
        issued = await prisma.$transaction(async (tx) => {
          const seq = await allocateSeq(tx, scope.orgId, counterYear(issuedAt));
          const numberBase = formatQuotationNumber({
            seq,
            issuedAt,
            prefix: settings.numberPrefix,
            template: settings.numberFormat,
          });
          const updated = await tx.quotation.update({
            where: { id: quotation.id },
            data: { ...baseUpdate, seq, numberBase },
          });
          for (const [i, itemId] of itemIds.entries()) {
            await tx.quotationItem.update({
              where: { id: itemId },
              data: { lineTotal: totals.lineTotals[i] },
            });
          }
          return updated;
        });
        lastError = undefined;
        break;
      } catch (e) {
        lastError = e;
        const code = (e as { code?: string }).code;
        if (code !== "P2002") throw e;
      }
    }
    if (!issued) {
      throw new QuotationError(
        `Gagal mengalokasikan nomor setelah ${MAX_ALLOCATION_ATTEMPTS} percobaan. Coba lagi. (${String(
          (lastError as Error | undefined)?.message ?? "",
        )})`,
        503,
      );
    }
  }

  // ---- Sinkronisasi pipeline: penawaran terbit -> Deal QUOTED ----
  await syncDealOnIssue(scope, userId, issued.id);

  return scope.db.quotation.findFirst({ where: { id: issued.id }, include: { items: true } });
}

async function syncDealOnIssue(scope: OrgScope, userId: string, quotationId: string) {
  const q = await scope.db.quotation.findFirst({
    where: { id: quotationId },
    select: {
      id: true,
      dealId: true,
      customerId: true,
      customerName: true,
      subject: true,
      total: true,
    },
  });
  if (!q) return;

  if (q.dealId) {
    const deal = await scope.db.deal.findFirst({ where: { id: q.dealId } });
    if (deal && (deal.stage === "LEAD" || deal.stage === "QUOTED")) {
      await scope.db.deal.update({
        where: { id: deal.id },
        data: { stage: "QUOTED", value: q.total },
      });
    }
    return;
  }

  // Buat Deal otomatis bila penawaran terhubung ke pelanggan terdaftar.
  if (q.customerId) {
    const deal = await scope.db.deal.create({
      data: {
        organizationId: scope.orgId,
        customerId: q.customerId,
        title: q.subject,
        stage: "QUOTED",
        value: q.total,
        ownerId: userId,
      },
    });
    await scope.db.quotation.update({ where: { id: q.id }, data: { dealId: deal.id } });
  }
}

// ---------- Revisi ----------

export async function reviseQuotation(scope: OrgScope, userId: string, id: string) {
  const source = await scope.db.quotation.findFirst({
    where: { id },
    include: { items: { orderBy: { lineNo: "asc" } } },
  });
  if (!source) throw new QuotationError("Penawaran tidak ditemukan.", 404);
  if (source.status === "DRAFT") {
    throw new QuotationError("Draft bisa langsung diubah tanpa revisi.", 409);
  }

  const settings = await getOrgSettings(scope);
  const rootId = source.parentId ?? source.id;

  // Revisi berikutnya = max(revision) keluarga + 1 (mode SUFFIX);
  // mode NEW_NUMBER: revision 0 (nomor baru), silsilah tetap lewat parentId.
  const family = await scope.db.quotation.findMany({
    where: { OR: [{ id: rootId }, { parentId: rootId }] },
    select: { revision: true },
  });
  const maxRevision = Math.max(...family.map((f) => f.revision), 0);
  const nextRevision = settings.revisionMode === "NEW_NUMBER" ? 0 : maxRevision + 1;

  const [, clone] = await prisma.$transaction([
    // Matikan tautan publik dokumen lama — pelanggan tidak boleh lihat versi basi.
    prisma.quotation.update({
      where: { id: source.id },
      data: { publicToken: null },
    }),
    prisma.quotation.create({
      data: {
        organizationId: scope.orgId,
        status: "DRAFT",
        dealId: source.dealId,
        customerId: source.customerId,
        revision: nextRevision,
        parentId: rootId,
        quoteDate: new Date(),
        customerName: source.customerName,
        attn: source.attn,
        subject: source.subject,
        franco: source.franco,
        deliveryTime: source.deliveryTime,
        termsOfPayment: source.termsOfPayment,
        priceIncludeNote: source.priceIncludeNote,
        validityDays: source.validityDays,
        vatRate: source.vatRate,
        docDiscountType: source.docDiscountType,
        docDiscountValue: source.docDiscountValue,
        subtotal: source.subtotal,
        discountAmount: source.discountAmount,
        vatAmount: source.vatAmount,
        total: source.total,
        amountInWords: source.amountInWords,
        notes: source.notes,
        createdById: userId,
        items: {
          create: source.items.map((item) => ({
            organizationId: scope.orgId,
            lineNo: item.lineNo,
            productId: item.productId,
            name: item.name,
            brand: item.brand,
            type: item.type,
            spec: item.spec,
            qty: item.qty,
            unit: item.unit,
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent,
            lineTotal: item.lineTotal,
          })),
        },
      },
    }),
  ]);

  return clone;
}

/**
 * Duplikasi penawaran -> draft BARU yang berdiri sendiri (bukan revisi):
 * tanpa parentId, tanpa nomor, tanpa deal — untuk penawaran serupa ke
 * pelanggan sama/berbeda. Use case paling sering di lapangan.
 */
export async function duplicateQuotation(scope: OrgScope, userId: string, id: string) {
  const source = await scope.db.quotation.findFirst({
    where: { id },
    include: { items: { orderBy: { lineNo: "asc" } } },
  });
  if (!source) throw new QuotationError("Penawaran tidak ditemukan.", 404);

  return scope.db.quotation.create({
    data: {
      organizationId: scope.orgId,
      status: "DRAFT",
      customerId: source.customerId,
      revision: 0,
      quoteDate: new Date(),
      customerName: source.customerName,
      attn: source.attn,
      subject: `${source.subject} (salinan)`,
      franco: source.franco,
      deliveryTime: source.deliveryTime,
      termsOfPayment: source.termsOfPayment,
      priceIncludeNote: source.priceIncludeNote,
      validityDays: source.validityDays,
      vatRate: source.vatRate,
      docDiscountType: source.docDiscountType,
      docDiscountValue: source.docDiscountValue,
      subtotal: source.subtotal,
      discountAmount: source.discountAmount,
      vatAmount: source.vatAmount,
      total: source.total,
      amountInWords: source.amountInWords,
      notes: source.notes,
      createdById: userId,
      items: {
        create: source.items.map((item) => ({
          organizationId: scope.orgId,
          lineNo: item.lineNo,
          productId: item.productId,
          name: item.name,
          brand: item.brand,
          type: item.type,
          spec: item.spec,
          qty: item.qty,
          unit: item.unit,
          unitPrice: item.unitPrice,
          discountPercent: item.discountPercent,
          lineTotal: item.lineTotal,
        })),
      },
    },
  });
}

// ---------- Status (WON / LOST / kembali SENT) ----------

export async function setQuotationStatus(
  scope: OrgScope,
  id: string,
  status: "WON" | "LOST" | "SENT",
  lostReason?: string,
) {
  const quotation = await scope.db.quotation.findFirst({
    where: { id },
    include: { revisions: { select: { id: true, status: true } } },
  });
  if (!quotation) throw new QuotationError("Penawaran tidak ditemukan.", 404);
  if (quotation.status === "DRAFT") {
    throw new QuotationError("Draft belum bisa diberi status hasil.", 409);
  }

  // Hanya revisi terakhir yang boleh menerima hasil (pola Metito).
  const rootId = quotation.parentId ?? quotation.id;
  const latest = await scope.db.quotation.findFirst({
    where: { OR: [{ id: rootId }, { parentId: rootId }], status: { not: "DRAFT" } },
    orderBy: [{ revision: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });
  if (latest && latest.id !== quotation.id) {
    throw new QuotationError(
      "Dokumen ini sudah digantikan revisi. Tandai hasil pada revisi terbaru.",
      409,
    );
  }

  const updated = await scope.db.quotation.update({ where: { id }, data: { status } });

  // Sinkronisasi deal.
  if (quotation.dealId) {
    const dealData: Prisma.DealUpdateInput =
      status === "WON"
        ? { stage: "WON", closedAt: new Date(), value: quotation.total, lostReason: null }
        : status === "LOST"
          ? { stage: "LOST", closedAt: new Date(), lostReason: lostReason ?? null }
          : { stage: "QUOTED", closedAt: null, lostReason: null };
    await scope.db.deal.update({ where: { id: quotation.dealId }, data: dealData });
  }

  return updated;
}

// ---------- Query ----------

export interface QuotationListFilter {
  search?: string;
  status?: "DRAFT" | "SENT" | "WON" | "LOST" | "EXPIRED";
  year?: number;
  take?: number;
}

export async function listQuotations(scope: OrgScope, filter: QuotationListFilter = {}) {
  const { search, status, year, take = 200 } = filter;
  const now = new Date();

  const where: Prisma.QuotationWhereInput = {
    ...(search
      ? {
        OR: [
          { numberBase: { contains: search } },
          { customerName: { contains: search } },
          { subject: { contains: search } },
        ],
      }
      : {}),
    ...(year
      ? { quoteDate: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } }
      : {}),
    ...(status === "EXPIRED"
      ? { status: "SENT", validUntil: { lt: now } }
      : status === "SENT"
        ? { status: "SENT", OR: [{ validUntil: null }, { validUntil: { gte: now } }] }
        : status
          ? { status }
          : {}),
  };

  return scope.db.quotation.findMany({
    where,
    orderBy: [{ quoteDate: "desc" }, { createdAt: "desc" }],
    take,
    select: {
      id: true,
      status: true,
      numberBase: true,
      revision: true,
      quoteDate: true,
      issuedAt: true,
      validUntil: true,
      customerName: true,
      subject: true,
      total: true,
      viewCount: true,
      firstViewedAt: true,
      publicToken: true,
      parentId: true,
    },
  });
}

export async function getQuotation(scope: OrgScope, id: string) {
  return scope.db.quotation.findFirst({
    where: { id },
    include: {
      items: { orderBy: { lineNo: "asc" } },
      parent: { select: { id: true, numberBase: true, revision: true, status: true } },
      revisions: {
        select: { id: true, numberBase: true, revision: true, status: true, createdAt: true },
        orderBy: { revision: "asc" },
      },
      customer: { select: { id: true, name: true } },
      deal: { select: { id: true, title: true, stage: true } },
    },
  });
}

/** Saran item: gabungan katalog aktif + histori item penawaran. */
export async function getItemSuggestions(scope: OrgScope, query: string) {
  const q = query.trim();
  if (q.length < 2) return [];

  const [products, historyItems] = await Promise.all([
    scope.db.product.findMany({
      where: {
        isActive: true,
        OR: [{ name: { contains: q } }, { brand: { contains: q } }, { type: { contains: q } }],
      },
      take: 10,
      orderBy: { name: "asc" },
    }),
    scope.db.quotationItem.findMany({
      where: { OR: [{ name: { contains: q } }, { brand: { contains: q } }] },
      orderBy: { id: "desc" },
      take: 30,
    }),
  ]);

  type Suggestion = {
    source: "katalog" | "histori";
    productId: string | null;
    name: string;
    brand: string;
    type: string;
    spec: string;
    unit: string;
    unitPrice: string;
  };

  const seen = new Set<string>();
  const suggestions: Suggestion[] = [];

  for (const p of products) {
    const key = `${p.name}|${p.brand ?? ""}|${p.type ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({
      source: "katalog",
      productId: p.id,
      name: p.name,
      brand: p.brand ?? "",
      type: p.type ?? "",
      spec: p.spec ?? "",
      unit: p.unit,
      unitPrice: p.defaultPrice ?? "0",
    });
  }

  for (const item of historyItems) {
    const key = `${item.name}|${item.brand ?? ""}|${item.type ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({
      source: "histori",
      productId: item.productId,
      name: item.name,
      brand: item.brand ?? "",
      type: item.type ?? "",
      spec: item.spec ?? "",
      unit: item.unit,
      unitPrice: item.unitPrice,
    });
  }

  return suggestions.slice(0, 20);
}

// ---------- Halaman publik (tanpa konteks org — akses via token) ----------

export async function getPublicQuotation(token: string) {
  if (!token) return null;
  const quotation = await prisma.quotation.findUnique({
    where: { publicToken: token },
    include: { items: { orderBy: { lineNo: "asc" } } },
  });
  // Draft tidak pernah tampil publik meski token valid.
  if (!quotation || quotation.status === "DRAFT") return null;
  return quotation;
}

/** Catat kunjungan halaman publik. Tidak pernah melempar — tracking gagal bukan alasan memblokir pelanggan. */
export async function recordPublicView(token: string): Promise<void> {
  try {
    const quotation = await prisma.quotation.findUnique({
      where: { publicToken: token },
      select: { id: true, status: true, firstViewedAt: true },
    });
    if (!quotation || quotation.status === "DRAFT") return;
    await prisma.quotation.update({
      where: { id: quotation.id },
      data: {
        viewCount: { increment: 1 },
        ...(quotation.firstViewedAt ? {} : { firstViewedAt: new Date() }),
      },
    });
  } catch (e) {
    console.error("recordPublicView gagal:", e);
  }
}
