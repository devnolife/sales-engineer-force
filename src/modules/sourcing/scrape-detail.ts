import "server-only";

import { suggestSellPrice, defaultMarginPercent } from "./service";

/**
 * Ambil detail dari halaman toko/marketplace (on-demand per hasil web):
 * scrape via Firecrawl -> ekstrak harga + kontak penjual (telepon/WA/email)
 * dari konten halaman. Dipanggil saat user klik "Ambil detail" — bukan saat
 * search (hemat kuota API).
 */

export interface VendorPageDetail {
  price?: string;
  suggestedPrice?: string;
  contact?: string;
  note?: string;
}

/** Harga rupiah paling masuk akal dari halaman: modus dari beberapa kandidat pertama. */
function extractBestPrice(markdown: string): string | undefined {
  const matches = [...markdown.matchAll(/Rp\.?\s?([\d.]{5,15})(?!\d)/gi)]
    .map((m) => m[1]!.replace(/\./g, ""))
    .filter((d) => /^\d{4,12}$/.test(d))
    .map(Number)
    .filter((n) => n >= 10_000 && n <= 10_000_000_000);
  if (matches.length === 0) return undefined;
  // Ambil median — tahan terhadap harga coret/ongkir kecil.
  matches.sort((a, b) => a - b);
  return String(matches[Math.floor(matches.length / 2)]);
}

function extractContact(markdown: string): string | undefined {
  const parts: string[] = [];
  // Nomor telepon/WA Indonesia
  const phone = markdown.match(/(?:\+62|62|0)8\d{2}[\s.-]?\d{3,4}[\s.-]?\d{3,5}/);
  if (phone) parts.push(phone[0].replace(/[\s.-]/g, ""));
  const landline = markdown.match(/\(?0\d{2,3}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/);
  if (!phone && landline) parts.push(landline[0].trim());
  // Email (hindari email aset/gambar)
  const email = markdown.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(?:com|co\.id|id|net|org)\b/);
  if (email) parts.push(email[0]);
  return parts.length ? parts.join(" · ") : undefined;
}

export async function scrapeVendorPageDetail(url: string): Promise<VendorPageDetail> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY belum diset.");

  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    throw new Error(`Scrape gagal (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }

  const data = (await res.json()) as { data?: { markdown?: string } };
  const markdown = data.data?.markdown ?? "";
  if (!markdown) return { note: "Halaman tidak bisa dibaca." };

  const price = extractBestPrice(markdown);
  const contact = extractContact(markdown);

  return {
    price,
    suggestedPrice: suggestSellPrice(price, defaultMarginPercent()),
    contact,
    note: !price && !contact ? "Harga/kontak tidak ditemukan di halaman." : undefined,
  };
}
