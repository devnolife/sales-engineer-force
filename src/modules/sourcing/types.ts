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
  /** Harga modal indikatif (string desimal) — bisa kosong bila tidak tersedia. */
  price?: string;
  /** Harga jual saran = modal + margin default (mis. 30%). */
  suggestedPrice?: string;
  unit?: string;
  city?: string;
  /** Kontak penjual/vendor (telepon · email) bila tersedia. */
  contact?: string;
  sourceType: "INTERNAL" | "WEB" | "WEB_MOCK";
  sourceLabel: string; // mis. "Pricelist internal", "Web (Firecrawl)", "Marketplace (mock)"
  sourceUrl?: string;
  note?: string;
}

export interface SourcingProvider {
  readonly name: string;
  searchWeb(query: string): Promise<VendorSearchResult[]>;
}
