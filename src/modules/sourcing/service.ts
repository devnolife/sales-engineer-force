import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Decimal } from "decimal.js";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import type { OrgScope } from "@/modules/org/service";
import { normalizeTokens } from "@/modules/inquiry/matching";
import { SourcingError, toSourceError } from "./errors";
import { MockSourcingProvider } from "./mock-provider";
import { RemoteSourcingProvider, sourcingMode } from "./remote-provider";
import { detailInputSchema, positivePriceSchema, searchInputSchema, vendorResultSchema } from "./schema";
import { scrapeVendorPageDetail } from "./scrape-detail";
import type {
  DetailActionResult, SearchActionResult, SourceError, SourcingCandidate, SourcingEngine,
  SourcingProvider, VendorSearchResult,
} from "./types";

export type { VendorSearchResult } from "./types";

export function getSourcingProvider(): SourcingProvider {
  return sourcingMode() === "mock" ? new MockSourcingProvider() : new RemoteSourcingProvider();
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

// ---------- Pencarian gabungan (internal + web) ----------

const Money = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_HALF_UP });

/** Margin jual default di atas harga modal (%). Override: SOURCING_MARGIN_PERCENT. */
export function defaultMarginPercent(): number {
  const n = Number(process.env.SOURCING_MARGIN_PERCENT ?? 30);
  return Number.isFinite(n) && n >= 0 && n <= 500 ? n : 30;
}

/** Harga jual saran = modal × (1 + margin), dibulatkan ke ribuan terdekat. */
export function suggestSellPrice(costPrice: string | undefined, marginPercent: number): string | undefined {
  const price = positivePriceSchema.safeParse(costPrice);
  if (!price.success ||
    !Number.isFinite(marginPercent) || marginPercent < 0 || marginPercent > 500) return undefined;
  const sell = new Money(price.data)
    .mul(new Money(marginPercent).div(100).plus(1))
    .div(1000).round().mul(1000);
  return sell.gt(0) ? sell.toFixed(0) : undefined;
}

function toStoredResult(
  candidate: SourcingCandidate,
  marginPercent: number,
  id: string = randomUUID(),
): VendorSearchResult {
  const suggestion = candidate.priceStatus === "available" && candidate.currency === "IDR"
    ? suggestSellPrice(candidate.price, marginPercent) : undefined;
  return vendorResultSchema.parse({
    ...candidate,
    id,
    ...(suggestion ? { suggestedPrice: suggestion, marginPercent } : {}),
  });
}

async function requireInquiryOwnership(scope: OrgScope, inquiryItemId?: string | null) {
  if (inquiryItemId && !await scope.db.inquiryItem.findFirst({
    where: { id: inquiryItemId }, select: { id: true },
  })) {
    throw new SourcingError("NOT_FOUND");
  }
}

function checkLimit(orgId: string, operation: "search" | "detail") {
  const result = rateLimit(`sourcing:${operation}:${orgId}`, operation === "search" ? 10 : 20, 60_000);
  if (!result.ok) throw new SourcingError("RATE_LIMITED", { retryAfterSeconds: result.retryAfterSec });
}

export async function searchVendorSources(
  scope: OrgScope,
  userId: string,
  query: string,
  inquiryItemId?: string,
): Promise<SearchActionResult> {
  try {
    const input = searchInputSchema.parse({ query, inquiryItemId });
    await requireInquiryOwnership(scope, input.inquiryItemId);
    const marginPercent = defaultMarginPercent();
    const tokens = normalizeTokens(input.query).slice(0, 5);
    const internal = await scope.db.vendorProduct.findMany({
      where: tokens.length > 0
        ? { OR: tokens.map((token) => ({ name: { contains: token } })) }
        : { name: { contains: input.query } },
      include: { vendor: { select: { name: true, city: true, phone: true, email: true } } },
      take: 10,
      orderBy: { updatedAt: "desc" },
    });
    const internalResults = internal.map((product) => {
      const currency = product.currency.trim().toUpperCase();
      const available = positivePriceSchema.safeParse(product.price).success && /^[A-Z]{3}$/.test(currency);
      return toStoredResult({
        vendorName: product.vendor.name,
        productName: product.name,
        brand: product.brand || undefined,
        priceStatus: available ? "available" : "unavailable",
        price: available ? new Money(product.price).toFixed() : undefined,
        currency: available ? currency : undefined,
        unit: product.unit || undefined,
        city: product.vendor.city || undefined,
        contact: [product.vendor.phone, product.vendor.email].filter(Boolean).join(" · ") || undefined,
        sourceType: "INTERNAL",
        sourceLabel: "Pricelist internal",
        retrievedAt: product.updatedAt.toISOString(),
        evidence: { method: "internal-pricelist", productTitle: product.name },
        note: available ? undefined : "Harga atau mata uang pricelist belum valid. Periksa data vendor.",
      }, marginPercent);
    });

    let provider: SourcingEngine = "firecrawl";
    let webResults: VendorSearchResult[] = [];
    let webError: SourceError | undefined;
    try {
      const adapter = getSourcingProvider();
      provider = adapter.name;
      if (provider === "firecrawl") checkLimit(scope.orgId, "search");
      webResults = (await adapter.searchWeb(input.query)).map((candidate) =>
        toStoredResult(candidate, marginPercent));
    } catch (error) {
      webError = toSourceError(error);
    }
    const results = [...internalResults, ...webResults];
    const status = webError ? "partial" : "complete";
    const search = await scope.db.$transaction(async (tx) => {
      const snapshot = await tx.sourcingSearch.create({
        data: {
          organizationId: scope.orgId, query: input.query, provider,
          resultsJson: JSON.stringify(results),
          inquiryItemId: input.inquiryItemId ?? null, createdById: userId,
        },
        select: { id: true },
      });
      await tx.aiLog.create({
        data: {
          organizationId: scope.orgId, kind: "VENDOR_SEARCH", provider,
          inputSummary: input.query,
          outputSummary: `${status}; ${internalResults.length} internal + ${webResults.length} web${webError ? `; ${webError.code}` : ""}`,
          createdById: userId,
        },
      });
      return snapshot;
    });
    const data = { searchId: search.id, provider, marginPercent, results };
    return webError ? { status: "partial", data, error: webError } : { status: "complete", data };
  } catch (error) {
    return { status: "error", error: toSourceError(error, "PERSISTENCE_FAILED") };
  }
}

function storedResults(resultsJson: string): VendorSearchResult[] {
  let raw: unknown;
  try {
    raw = JSON.parse(resultsJson);
  } catch (error) {
    if (error instanceof SyntaxError) throw new SourcingError("NOT_ALLOWED");
    throw error;
  }
  const parsed = z.array(vendorResultSchema).max(15).safeParse(raw);
  if (!parsed.success || new Set(parsed.data.map((r) => r.id)).size !== parsed.data.length) {
    throw new SourcingError("NOT_ALLOWED");
  }
  return parsed.data;
}

function storedWebResult(results: VendorSearchResult[], resultId: string, provider: string) {
  const result = results.find((candidate) => candidate.id === resultId);
  if (!result) throw new SourcingError("NOT_FOUND");
  if (provider !== "firecrawl" || result.sourceType !== "WEB" || !result.sourceUrl) {
    throw new SourcingError("NOT_ALLOWED");
  }
  return { ...result, sourceUrl: result.sourceUrl };
}

export async function fetchVendorSourceDetail(
  scope: OrgScope,
  userId: string,
  input: { searchId: string; resultId: string },
): Promise<DetailActionResult> {
  try {
    const params = detailInputSchema.parse(input);
    const snapshot = await scope.db.sourcingSearch.findFirst({ where: { id: params.searchId } });
    if (!snapshot) throw new SourcingError("NOT_FOUND");
    const result = storedWebResult(storedResults(snapshot.resultsJson), params.resultId, snapshot.provider);
    await requireInquiryOwnership(scope, snapshot.inquiryItemId);
    if (sourcingMode() !== "live") throw new SourcingError("NOT_ALLOWED");
    checkLimit(scope.orgId, "detail");

    let observation: SourcingCandidate;
    try {
      observation = await scrapeVendorPageDetail({ query: snapshot.query, url: result.sourceUrl });
    } catch (error) {
      const failure = toSourceError(error);
      await scope.db.aiLog.create({
        data: {
          organizationId: scope.orgId, kind: "VENDOR_DETAIL", provider: "firecrawl",
          inputSummary: snapshot.query, outputSummary: `error; ${failure.code}`,
          createdById: userId,
        },
      });
      return { status: "error", error: failure };
    }
    const updatedResult = toStoredResult(observation, defaultMarginPercent(), params.resultId);

    // Retry only the database merge; the paid detail request has already finished.
    for (let attempt = 0; attempt < 3; attempt++) {
      const latest = attempt === 0 ? snapshot
        : await scope.db.sourcingSearch.findFirst({ where: { id: params.searchId } });
      if (!latest) throw new SourcingError("NOT_FOUND");
      const results = storedResults(latest.resultsJson);
      storedWebResult(results, params.resultId, latest.provider);
      const next = results.map((candidate) => candidate.id === params.resultId ? updatedResult : candidate);
      try {
        const written = await scope.db.$transaction(async (tx) => {
          const update = await tx.sourcingSearch.updateMany({
            where: { id: params.searchId, organizationId: scope.orgId, resultsJson: latest.resultsJson },
            data: { resultsJson: JSON.stringify(next) },
          });
          if (update.count !== 1) return false;
          await tx.aiLog.create({
            data: {
              organizationId: scope.orgId, kind: "VENDOR_DETAIL", provider: "firecrawl",
              inputSummary: latest.query,
              outputSummary: `complete; ${updatedResult.priceStatus}${updatedResult.currency ? `; ${updatedResult.currency}` : ""}`,
              createdById: userId,
            },
          });
          return true;
        });
        if (written) return { status: "complete", result: updatedResult };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") continue;
        throw error;
      }
    }
    throw new SourcingError("PERSISTENCE_FAILED");
  } catch (error) {
    return { status: "error", error: toSourceError(error, "PERSISTENCE_FAILED") };
  }
}
