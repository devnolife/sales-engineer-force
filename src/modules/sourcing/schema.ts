import { BlockList, isIP } from "node:net";
import { z } from "zod";
import {
  SOURCE_ERROR_CODES, type LiveSourcingEngine, type PriceEvidence, type VendorSearchResult,
  type WebResultPayload,
} from "./types";

export const querySchema = z.string().trim().min(3).max(500);
const idSchema = z.string().trim().min(1).max(200);
export const searchInputSchema = z.object({
  query: querySchema,
  inquiryItemId: idSchema.optional(),
}).strict();
export const detailInputSchema = z.object({
  searchId: idSchema,
  resultId: idSchema,
}).strict();

const privateAddresses = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) privateAddresses.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 96], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
  ["64:ff9b::", 96], ["64:ff9b:1::", 48],
  ["100::", 64], ["2001:db8::", 32], ["2001::", 32], ["2002::", 16],
] as const) privateAddresses.addSubnet(address, prefix, "ipv6");

export const publicUrlSchema = z.string().max(2048).url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  const ipVersion = isIP(host);
  if (ipVersion) return !privateAddresses.check(host, ipVersion === 4 ? "ipv4" : "ipv6");
  return host.includes(".") && !/(^|\.)(localhost|local|localdomain|internal|lan|home|home\.arpa|onion|invalid|test)$/.test(host);
}, "URL harus mengarah ke halaman HTTP/HTTPS publik tanpa kredensial.");

export const positivePriceSchema = z.string().max(64)
  .regex(/^\d+(\.\d+)?$/)
  .refine((value) => /[1-9]/.test(value), "Harga harus positif.");

const evidenceSchema = z.object({
  method: z.enum(["firecrawl-product", "crawl4ai-product", "browser-use-product", "internal-pricelist", "mock"]),
  productUrl: publicUrlSchema.optional(),
  productTitle: z.string().min(1).max(500).optional(),
  variantId: z.string().min(1).max(300).optional(),
  variantTitle: z.string().min(1).max(500).optional(),
  rawPriceText: z.string().max(500).optional(),
});

const candidateFields = {
  vendorName: z.string().min(1).max(300),
  productName: z.string().min(1).max(500),
  brand: z.string().max(200).optional(),
  priceStatus: z.enum(["pending", "available", "unavailable", "ambiguous"]),
  price: positivePriceSchema.optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  unit: z.string().min(1).max(80).optional(),
  city: z.string().max(200).optional(),
  contact: z.string().max(500).optional(),
  sourceType: z.enum(["INTERNAL", "WEB", "WEB_MOCK"]),
  sourceLabel: z.string().min(1).max(200),
  sourceUrl: publicUrlSchema.optional(),
  retrievedAt: z.iso.datetime({ offset: true }).optional(),
  evidence: evidenceSchema.optional(),
  note: z.string().max(2000).optional(),
};

const liveEvidenceMethods: Record<LiveSourcingEngine, PriceEvidence["method"][]> = {
  firecrawl: ["firecrawl-product"],
  selfhost: ["crawl4ai-product", "browser-use-product"],
};

function validatePrice(result: Omit<VendorSearchResult, "id">, ctx: z.RefinementCtx) {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (result.sourceType === "WEB" && !result.sourceUrl) fail("Hasil web memerlukan URL sumber.");
  if (result.priceStatus === "available") {
    if (!result.price || !result.currency || !result.retrievedAt || !result.evidence) {
      fail("Harga tersedia memerlukan nominal, mata uang, waktu, dan bukti.");
    }
    if (result.sourceType === "WEB" &&
      (!result.evidence?.productUrl || !result.evidence.productTitle)) {
      fail("Harga web memerlukan identitas produk pada sumber.");
    }
  } else if (result.price !== undefined || result.suggestedPrice !== undefined) {
    fail("Harga yang belum terverifikasi tidak boleh berisi nominal atau saran jual.");
  }
  if (result.suggestedPrice !== undefined && result.currency !== "IDR") {
    fail("Saran jual hanya berlaku untuk harga IDR.");
  }
  const methods: Record<VendorSearchResult["sourceType"], PriceEvidence["method"][]> = {
    INTERNAL: ["internal-pricelist"],
    WEB: [...liveEvidenceMethods.firecrawl, ...liveEvidenceMethods.selfhost],
    WEB_MOCK: ["mock"],
  };
  if (result.evidence && !methods[result.sourceType].includes(result.evidence.method)) fail("Bukti tidak sesuai jenis sumber.");
}

export const vendorResultSchema = z.object({
  ...candidateFields,
  id: idSchema,
  suggestedPrice: positivePriceSchema.optional(),
  marginPercent: z.number().min(0).max(500).optional(),
}).superRefine(validatePrice);

export const webResultSchema = z.object({
  ...candidateFields,
  sourceType: z.literal("WEB"),
  sourceUrl: publicUrlSchema,
}).superRefine(validatePrice);

function validateProviderEvidence(
  result: WebResultPayload, provider: LiveSourcingEngine, ctx: z.RefinementCtx,
) {
  if (result.evidence && !liveEvidenceMethods[provider].includes(result.evidence.method)) {
    ctx.addIssue({ code: "custom", message: "Bukti tidak sesuai provider sourcing." });
  }
}

export const coreAiSearchSchema = z.object({
  provider: z.enum(["firecrawl", "selfhost"]),
  results: z.array(webResultSchema.refine((result) => result.priceStatus === "pending",
    "Pencarian hanya boleh mengembalikan kandidat tanpa observasi harga.")).max(5),
}).superRefine(({ provider, results }, ctx) => {
  for (const result of results) validateProviderEvidence(result, provider, ctx);
});

export const coreAiDetailSchema = z.object({
  provider: z.enum(["firecrawl", "selfhost"]),
  result: webResultSchema.refine((result) => result.priceStatus !== "pending" && !!result.retrievedAt,
    "Detail harus memuat observasi baru beserta waktu pengambilan."),
}).superRefine(({ provider, result }, ctx) => {
  validateProviderEvidence(result, provider, ctx);
});

export const sourceErrorSchema = z.object({
  code: z.enum(SOURCE_ERROR_CODES),
  message: z.string().min(1).max(1000),
  retryAfterSeconds: z.number().int().positive().optional(),
});
export const coreAiErrorSchema = z.object({ error: sourceErrorSchema });
