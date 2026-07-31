/**
 * Kontrak provider AI — INTERFACE STABIL (PRD §8.3).
 *
 * Kerangka mock-first: implementasi saat ini `mock` (heuristik lokal, tanpa
 * LLM). Saat pindah ke LLM asli (Vercel AI SDK + Gemini/GPT), HANYA folder
 * `modules/ai` yang berubah — pemanggil tidak tersentuh.
 */

export interface ExtractedInquiryItem {
  /** Baris asli dari teks permintaan. */
  rawText: string;
  name: string;
  qty: string;
  unit?: string;
  spec?: string;
}

export interface ExtractedInquiry {
  /** Nama perusahaan peminta, bila terdeteksi. */
  customerName?: string;
  items: ExtractedInquiryItem[];
  /** 0..1 — keyakinan ekstraksi (mock: kasar berdasarkan pola yang dikenali). */
  confidence: number;
  provider: string;
  /** Catatan untuk direview manusia (human-in-the-loop). */
  note?: string;
}

export interface ExtractInquiryInput {
  rawText: string;
  fileName?: string;
}

export interface AiProvider {
  readonly name: string;
  extractInquiry(input: ExtractInquiryInput): Promise<ExtractedInquiry>;
}
