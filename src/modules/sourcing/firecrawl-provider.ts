import type { SourcingProvider, VendorSearchResult } from "./types";

/**
 * Provider Firecrawl: pencarian vendor nyata di web (search API).
 *
 * Aktif bila SOURCING_PROVIDER=firecrawl dan FIRECRAWL_API_KEY diset.
 * Hasil ditandai sourceType WEB — harga tetap indikatif (dari snippet),
 * wajib diverifikasi manusia sebelum dipakai sebagai harga modal.
 */

interface FirecrawlSearchItem {
  url?: string;
  title?: string;
  description?: string;
}

/** Ambil harga rupiah pertama yang terlihat pada teks (mis. "Rp 1.250.000"). */
function extractPrice(text: string): string | undefined {
  const m = text.match(/Rp\.?\s?([\d.,]{4,})/i);
  if (!m) return undefined;
  const digits = m[1].replace(/[.,]/g, "");
  if (!/^\d{4,12}$/.test(digits)) return undefined;
  return digits;
}

function hostToVendorName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host;
  } catch {
    return "Web";
  }
}

export class FirecrawlSourcingProvider implements SourcingProvider {
  readonly name = "firecrawl";

  async searchWeb(query: string): Promise<VendorSearchResult[]> {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      throw new Error("FIRECRAWL_API_KEY belum diset — provider firecrawl nonaktif.");
    }
    const q = query.trim();
    if (q.length < 3) return [];

    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `jual ${q} harga supplier indonesia`,
        limit: 6,
        lang: "id",
        country: "id",
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`Firecrawl search gagal (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }

    const data = (await res.json()) as { data?: FirecrawlSearchItem[] };
    const items = data.data ?? [];

    return items
      .filter((it) => it.url && it.title)
      .map((it) => {
        const text = `${it.title} ${it.description ?? ""}`;
        return {
          vendorName: hostToVendorName(it.url!),
          productName: it.title!.slice(0, 200),
          price: extractPrice(text),
          unit: undefined,
          city: undefined,
          sourceType: "WEB" as const,
          sourceLabel: "Web (Firecrawl)",
          sourceUrl: it.url,
          note: it.description?.slice(0, 300),
        };
      });
  }
}
