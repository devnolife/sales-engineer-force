export type PriceStatus = "pending" | "available" | "unavailable" | "ambiguous";
export type SourcingEngine = "firecrawl" | "mock";

export interface PriceEvidence {
  method: "firecrawl-product" | "internal-pricelist" | "mock";
  productUrl?: string;
  productTitle?: string;
  variantId?: string;
  variantTitle?: string;
  rawPriceText?: string;
}

export interface VendorSearchResult {
  id: string;
  vendorName: string;
  productName: string;
  brand?: string;
  priceStatus: PriceStatus;
  price?: string;
  currency?: string;
  suggestedPrice?: string;
  marginPercent?: number;
  unit?: string;
  city?: string;
  contact?: string;
  sourceType: "INTERNAL" | "WEB" | "WEB_MOCK";
  sourceLabel: string;
  sourceUrl?: string;
  retrievedAt?: string;
  evidence?: PriceEvidence;
  note?: string;
}

export type SourcingCandidate = Omit<VendorSearchResult, "id" | "suggestedPrice" | "marginPercent">;
export type WebResultPayload = Omit<SourcingCandidate, "sourceType"> & { sourceType: "WEB" };

export interface SourcingProvider {
  readonly name: SourcingEngine;
  searchWeb(query: string): Promise<SourcingCandidate[]>;
}

export const SOURCE_ERROR_CODES = [
  "INVALID_INPUT", "NOT_FOUND", "NOT_ALLOWED", "NOT_CONFIGURED",
  "RATE_LIMITED", "TIMEOUT", "PROVIDER_UNAVAILABLE", "BAD_RESPONSE", "PERSISTENCE_FAILED",
] as const;

export interface SourceError {
  code: typeof SOURCE_ERROR_CODES[number];
  message: string;
  retryAfterSeconds?: number;
}

export interface SearchData {
  searchId: string;
  provider: SourcingEngine;
  marginPercent: number;
  results: VendorSearchResult[];
}

export type SearchActionResult =
  | { status: "complete"; data: SearchData }
  | { status: "partial"; data: SearchData; error: SourceError }
  | { status: "error"; error: SourceError };

export type DetailActionResult =
  | { status: "complete"; result: VendorSearchResult }
  | { status: "error"; error: SourceError };
