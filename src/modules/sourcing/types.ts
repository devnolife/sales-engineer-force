/**
 * Kontrak provider sourcing vendor — INTERFACE STABIL.
 *
 * Kerangka mock-first: hasil "web" dihasilkan lokal dan diberi label mock.
 * Nanti: provider "firecrawl" (search + extract) di slot yang sama tanpa
 * mengubah pemanggil.
 */

export interface VendorSearchResult {
  vendorName: string;
  productName: string;
  /** Harga indikatif (string desimal) — bisa kosong bila tidak tersedia. */
  price?: string;
  unit?: string;
  city?: string;
  sourceType: "INTERNAL" | "WEB_MOCK";
  sourceLabel: string; // mis. "Pricelist internal", "Marketplace (mock)"
  sourceUrl?: string;
  note?: string;
}

export interface SourcingProvider {
  readonly name: string;
  searchWeb(query: string): Promise<VendorSearchResult[]>;
}
