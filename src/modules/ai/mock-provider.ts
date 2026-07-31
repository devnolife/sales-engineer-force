import type {
  AiProvider,
  ExtractedInquiry,
  ExtractedInquiryItem,
  ExtractInquiryInput,
} from "./types";

/**
 * Provider MOCK: heuristik lokal tanpa LLM.
 *
 * Cukup pintar untuk demo end-to-end (parsing baris "10 pcs Pipa PVC 2 inch"),
 * dan jujur menandai dirinya sebagai mock. File non-teks (PDF/gambar) tidak
 * dibaca — mengembalikan contoh item berlabel mock supaya alurnya tetap bisa
 * dicoba sampai selesai.
 */

const UNIT_WORDS = [
  "pcs",
  "pc",
  "unit",
  "set",
  "buah",
  "bh",
  "lembar",
  "lbr",
  "drum",
  "kg",
  "gram",
  "ton",
  "liter",
  "ltr",
  "l",
  "meter",
  "mtr",
  "m",
  "roll",
  "batang",
  "btg",
  "pack",
  "pak",
  "box",
  "dus",
  "galon",
  "sak",
  "lot",
  "titik",
];

const UNIT_PATTERN = UNIT_WORDS.join("|");

// Pola: "10 pcs Nama Barang", "Nama Barang 10 pcs", "Nama Barang qty 10", "2x Nama"
const LEADING_QTY = new RegExp(
  `^(\\d+(?:[.,]\\d+)?)\\s*(?:x\\s+)?(?:(${UNIT_PATTERN})\\b\\.?\\s*)?(.+)$`,
  "i",
);
const TRAILING_QTY = new RegExp(
  `^(.+?)\\s*[:=–-]?\\s*(?:qty|jumlah|sebanyak)?\\s*[:=]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_PATTERN})?\\.?$`,
  "i",
);
const BULLET = /^\s*(?:[-*•▪]|\d+[.)])\s*/;

const COMPANY_PATTERN = /\b(?:PT|CV|UD|PD|Koperasi)\.?\s+[A-Z][\w .,&-]{2,60}/;

/** Kata pembuka yang menandakan baris bukan item. */
const NOISE_PREFIXES = [
  "dengan hormat",
  "kepada",
  "yth",
  "salam",
  "terima kasih",
  "mohon",
  "berikut",
  "demikian",
  "hormat kami",
  "best regards",
  "regards",
  "dear",
  "halo",
  "selamat",
  "kami dari",
  "kebutuhan",
  "sehubungan",
];

function looksLikeNoise(line: string): boolean {
  const lower = line.toLowerCase();
  return NOISE_PREFIXES.some((p) => lower.startsWith(p));
}

function normalizeQty(raw: string): string {
  return raw.replace(",", ".");
}

/** Nama item wajib punya huruf yang cukup — menolak nomor telepon/tanggal. */
function isPlausibleItemName(name: string): boolean {
  const letters = (name.match(/\p{L}/gu) ?? []).length;
  return letters >= 3;
}

/** Qty wajar: bukan pecahan nomor telepon ("0812") dan tidak absurd. */
function isPlausibleQty(qty: string): boolean {
  if (/^0\d/.test(qty)) return false; // leading zero = kemungkinan nomor telepon
  const n = Number(qty);
  return Number.isFinite(n) && n > 0 && n <= 100000;
}

function parseLine(line: string): ExtractedInquiryItem | null {
  const cleaned = line.replace(BULLET, "").trim();
  if (cleaned.length < 3 || looksLikeNoise(cleaned)) return null;

  // "10 pcs Pipa PVC 2 inch" / "2x Pompa Dosing"
  const leading = cleaned.match(LEADING_QTY);
  if (
    leading &&
    leading[3] &&
    leading[3].trim().length >= 3 &&
    isPlausibleItemName(leading[3]) &&
    isPlausibleQty(normalizeQty(leading[1]))
  ) {
    return {
      rawText: line.trim(),
      qty: normalizeQty(leading[1]),
      unit: leading[2]?.toLowerCase(),
      name: leading[3].trim().replace(/[.,;]$/, ""),
    };
  }

  // "Pipa PVC 2 inch - 10 pcs" / "Pompa dosing qty 2"
  const trailing = cleaned.match(TRAILING_QTY);
  if (
    trailing &&
    trailing[1].trim().length >= 3 &&
    isPlausibleItemName(trailing[1]) &&
    isPlausibleQty(normalizeQty(trailing[2]))
  ) {
    return {
      rawText: line.trim(),
      qty: normalizeQty(trailing[2]),
      unit: trailing[3]?.toLowerCase(),
      name: trailing[1].trim().replace(/[.,;]$/, ""),
    };
  }

  // Baris berbentuk daftar (bullet) tanpa qty — anggap qty 1.
  if (BULLET.test(line) && isPlausibleItemName(cleaned)) {
    return { rawText: line.trim(), qty: "1", name: cleaned.replace(/[.,;]$/, "") };
  }

  return null;
}

/** Contoh item bila file tidak bisa dibaca (PDF/gambar) — jelas berlabel mock. */
const FALLBACK_ITEMS: ExtractedInquiryItem[] = [
  {
    rawText: "(contoh mock) Pompa dosing kimia 6 L/h",
    name: "Pompa dosing kimia 6 L/h",
    qty: "2",
    unit: "unit",
    spec: "Contoh hasil mock — file asli belum dibaca (butuh AI provider asli)",
  },
  {
    rawText: "(contoh mock) Membran RO 4040",
    name: "Membran RO 4040",
    qty: "4",
    unit: "pcs",
    spec: "Contoh hasil mock — file asli belum dibaca (butuh AI provider asli)",
  },
  {
    rawText: "(contoh mock) Antiscalant 25 kg",
    name: "Antiscalant",
    qty: "1",
    unit: "drum",
    spec: "Contoh hasil mock — file asli belum dibaca (butuh AI provider asli)",
  },
];

export class MockAiProvider implements AiProvider {
  readonly name = "mock";

  async extractInquiry(input: ExtractInquiryInput): Promise<ExtractedInquiry> {
    const text = input.rawText.trim();

    if (!text) {
      return {
        items: FALLBACK_ITEMS,
        confidence: 0.2,
        provider: this.name,
        note:
          "File tidak bisa dibaca provider mock (bukan teks). Item di bawah adalah CONTOH — ganti dengan isi permintaan sesungguhnya.",
      };
    }

    const customerName = text.match(COMPANY_PATTERN)?.[0]?.trim();

    const lines = text.split(/\r?\n/);
    const items: ExtractedInquiryItem[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const item = parseLine(line);
      if (item) items.push(item);
    }

    if (items.length === 0) {
      return {
        customerName,
        items: FALLBACK_ITEMS,
        confidence: 0.2,
        provider: this.name,
        note:
          "Tidak ada baris item yang dikenali pola mock. Item di bawah adalah CONTOH — sunting sebelum lanjut.",
      };
    }

    const parsedRatio = items.length / Math.max(lines.filter((l) => l.trim()).length, 1);
    return {
      customerName,
      items,
      confidence: Math.min(0.9, 0.4 + parsedRatio * 0.5),
      provider: this.name,
      note: "Hasil ekstraksi heuristik (mock, tanpa LLM). Selalu review sebelum dipakai.",
    };
  }
}
