import { SourcingError } from "./errors";
import { querySchema } from "./schema";
import type { SourcingCandidate, SourcingProvider } from "./types";

/**
 * Provider MOCK pencarian vendor di web.
 *
 * Deterministik terhadap query (hash string) supaya demo konsisten, dan semua
 * hasil diberi label "(mock)" — tidak ada yang berpura-pura jadi data nyata.
 * Harga indikatif diturunkan dari hash, bukan harga sungguhan.
 */

const FAKE_VENDORS = [
  { name: "Toko Teknik Makmur (mock)", city: "Jakarta" },
  { name: "CV Sumber Industri (mock)", city: "Surabaya" },
  { name: "PT Prima Supply (mock)", city: "Bekasi" },
  { name: "Mega Valve & Fitting (mock)", city: "Tangerang" },
  { name: "Indo Water Store (mock)", city: "Bandung" },
];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export class MockSourcingProvider implements SourcingProvider {
  readonly name = "mock";

  async searchWeb(query: string): Promise<SourcingCandidate[]> {
    const parsed = querySchema.safeParse(query);
    if (!parsed.success) throw new SourcingError("INVALID_INPUT");
    const q = parsed.data;

    const seed = hashString(q.toLowerCase());
    const count = 2 + (seed % 3); // 2..4 hasil
    const basePrice = 250_000 + (seed % 20) * 375_000; // 250rb..7,5jt

    const results: SourcingCandidate[] = [];
    for (let i = 0; i < count; i++) {
      const vendor = FAKE_VENDORS[(seed + i * 7) % FAKE_VENDORS.length];
      const price = Math.round((basePrice * (0.9 + ((seed >> (i + 2)) % 25) / 100)) / 1000) * 1000;
      results.push({
        vendorName: vendor.name,
        productName: q,
        priceStatus: "available",
        price: String(price),
        currency: "IDR",
        retrievedAt: new Date().toISOString(),
        evidence: { method: "mock" },
        unit: "Unit",
        city: vendor.city,
        sourceType: "WEB_MOCK",
        sourceLabel: "Web/marketplace (MOCK)",
        note: "Data contoh MOCK, bukan hasil pencarian internet atau harga transaksi.",
      });
    }
    return results;
  }
}
