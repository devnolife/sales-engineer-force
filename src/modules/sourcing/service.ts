import { z } from "zod";
import type { OrgScope } from "@/modules/org/service";
import { normalizeTokens } from "@/modules/inquiry/matching";
import { coreAiPost, isCoreAiEnabled } from "@/lib/core-ai";
import { MockSourcingProvider } from "./mock-provider";
import type { SourcingProvider, VendorSearchResult } from "./types";

export type { VendorSearchResult } from "./types";

/**
 * Modul sourcing: database vendor internal (+ pricelist) dan pencarian
 * gabungan: internal DULU (paling akurat), lalu web.
 *
 * Pencarian web kini dilakukan oleh service core-ai (provider mock/firecrawl
 * dipilih via env di core-ai). Tanpa CORE_AI_URL: fallback mock lokal.
 */

class RemoteSourcingProvider implements SourcingProvider {
  readonly name = "core-ai";
  private fallback = new MockSourcingProvider();

  async searchWeb(query: string): Promise<VendorSearchResult[]> {
    try {
      const { results } = await coreAiPost<{ provider: string; results: VendorSearchResult[] }>(
        "/v1/sourcing/search",
        { query },
        { timeoutMs: 45_000 },
      );
      return results;
    } catch (e) {
      console.error("core-ai sourcing search gagal — fallback ke mock lokal:", e);
      return this.fallback.searchWeb(query);
    }
  }
}

export function getSourcingProvider(): SourcingProvider {
  if (isCoreAiEnabled()) return new RemoteSourcingProvider();
  return new MockSourcingProvider();
}

// ---------- Vendor CRUD ----------

export const vendorSchema = z.object({
  name: z.string().trim().min(2, "Nama vendor minimal 2 karakter").max(200),
  city: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  email: z.string().trim().email().max(120).optional().or(z.literal("")).default(""),
  website: z.string().trim().max(200).optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""),
});

export type VendorInput = z.input<typeof vendorSchema>;

export const vendorProductSchema = z.object({
  name: z.string().trim().min(2).max(300),
  brand: z.string().trim().max(80).optional().default(""),
  spec: z.string().trim().max(500).optional().default(""),
  unit: z.string().trim().min(1).max(20).default("Unit"),
  price: z.string().trim().regex(/^\d+(\.\d+)?$/, "Harga harus angka"),
});

export type VendorProductInput = z.input<typeof vendorProductSchema>;

export async function listVendors(scope: OrgScope, opts: { search?: string } = {}) {
  return scope.db.vendor.findMany({
    where: opts.search
      ? {
        OR: [
          { name: { contains: opts.search } },
          { city: { contains: opts.search } },
          { products: { some: { name: { contains: opts.search } } } },
        ],
      }
      : {},
    include: { _count: { select: { products: true } } },
    orderBy: { name: "asc" },
    take: 300,
  });
}

export async function getVendor(scope: OrgScope, id: string) {
  return scope.db.vendor.findFirst({
    where: { id },
    include: { products: { orderBy: { name: "asc" } } },
  });
}

function normalizeVendorData(scope: OrgScope, input: VendorInput) {
  const parsed = vendorSchema.parse(input);
  return {
    organizationId: scope.orgId,
    name: parsed.name,
    city: parsed.city || null,
    phone: parsed.phone || null,
    email: parsed.email || null,
    website: parsed.website || null,
    notes: parsed.notes || null,
  };
}

export async function createVendor(scope: OrgScope, input: VendorInput) {
  return scope.db.vendor.create({ data: normalizeVendorData(scope, input) });
}

export async function updateVendor(scope: OrgScope, id: string, input: VendorInput) {
  return scope.db.vendor.update({ where: { id }, data: normalizeVendorData(scope, input) });
}

export async function deleteVendor(scope: OrgScope, id: string) {
  return scope.db.vendor.delete({ where: { id } });
}

export async function addVendorProduct(
  scope: OrgScope,
  vendorId: string,
  input: VendorProductInput,
) {
  const vendor = await scope.db.vendor.findFirst({ where: { id: vendorId } });
  if (!vendor) throw new Error("Vendor tidak ditemukan.");
  const parsed = vendorProductSchema.parse(input);
  return scope.db.vendorProduct.create({
    data: {
      organizationId: scope.orgId,
      vendorId,
      name: parsed.name,
      brand: parsed.brand || null,
      spec: parsed.spec || null,
      unit: parsed.unit,
      price: parsed.price,
      sourceType: "MANUAL",
    },
  });
}

export async function deleteVendorProduct(scope: OrgScope, id: string) {
  return scope.db.vendorProduct.delete({ where: { id } });
}

// ---------- Pencarian gabungan (internal + web mock) ----------

/** Margin jual default di atas harga modal (%). Override: SOURCING_MARGIN_PERCENT. */
export function defaultMarginPercent(): number {
  const n = Number(process.env.SOURCING_MARGIN_PERCENT ?? 30);
  return Number.isFinite(n) && n >= 0 && n <= 500 ? n : 30;
}

/** Harga jual saran = modal × (1 + margin), dibulatkan ke ribuan terdekat. */
export function suggestSellPrice(costPrice: string | undefined, marginPercent: number): string | undefined {
  if (!costPrice) return undefined;
  const cost = Number(costPrice);
  if (!Number.isFinite(cost) || cost <= 0) return undefined;
  const sell = cost * (1 + marginPercent / 100);
  return String(Math.round(sell / 1000) * 1000);
}

export async function searchVendorSources(
  scope: OrgScope,
  userId: string,
  query: string,
  inquiryItemId?: string,
): Promise<VendorSearchResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const margin = defaultMarginPercent();

  // 1) Internal: pricelist vendor — cari per token supaya fleksibel.
  const tokens = normalizeTokens(q).slice(0, 5);
  const internal = await scope.db.vendorProduct.findMany({
    where:
      tokens.length > 0
        ? { OR: tokens.map((t) => ({ name: { contains: t } })) }
        : { name: { contains: q } },
    include: { vendor: { select: { name: true, city: true, phone: true, email: true } } },
    take: 10,
    orderBy: { updatedAt: "desc" },
  });

  const internalResults: VendorSearchResult[] = internal.map((vp) => ({
    vendorName: vp.vendor.name,
    productName: vp.name,
    price: vp.price,
    suggestedPrice: suggestSellPrice(vp.price, margin),
    unit: vp.unit,
    city: vp.vendor.city ?? undefined,
    contact: [vp.vendor.phone, vp.vendor.email].filter(Boolean).join(" · ") || undefined,
    sourceType: "INTERNAL",
    sourceLabel: "Pricelist internal",
  }));

  // 2) Web (provider mock).
  const provider = getSourcingProvider();
  const webResults = (await provider.searchWeb(q)).map((r) => ({
    ...r,
    suggestedPrice: r.suggestedPrice ?? suggestSellPrice(r.price, margin),
  }));

  const results = [...internalResults, ...webResults];

  // Log pencarian + AI log (jejak pemakaian, kuota nanti).
  await scope.db.sourcingSearch.create({
    data: {
      organizationId: scope.orgId,
      query: q,
      provider: provider.name,
      resultsJson: JSON.stringify(results),
      inquiryItemId: inquiryItemId ?? null,
      createdById: userId,
    },
  });
  await scope.db.aiLog.create({
    data: {
      organizationId: scope.orgId,
      kind: "VENDOR_SEARCH",
      provider: provider.name,
      inputSummary: q,
      outputSummary: `${internalResults.length} internal + ${webResults.length} web (mock)`,
      createdById: userId,
    },
  });

  return results;
}
