import "server-only";

import { Agent, fetch as undiciFetch } from "undici";

/**
 * AI Deal Coach — agent LLM lokal yang menganalisis deal memakai framework
 * sales dari skill terpasang:
 * - MEDDIC (enterprise-sales-motion): kualifikasi deal.
 * - Give-and-Get + Good-Better-Best (b2b-value-negotiation): saran negosiasi.
 *
 * Framework didistilasi ke prompt (bukan dibaca dari file saat runtime) agar
 * deterministik dan tanpa dependensi path.
 */

const dispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

const COACH_SYSTEM_PROMPT = `Kamu adalah coach penjualan B2B teknik Indonesia untuk sales engineer.
Analisis deal berdasarkan data yang diberikan, memakai dua framework berikut.

## Framework 1 — Kualifikasi MEDDIC (skor tiap dimensi 0-2; 0=tidak diketahui, 1=sebagian, 2=jelas)
- Metrics: apakah nilai/dampak ekonomi bagi pelanggan terukur?
- Economic buyer: apakah pemegang anggaran teridentifikasi (attn/kontak)?
- Decision criteria: apakah kriteria keputusan pelanggan diketahui (spek, harga, delivery)?
- Decision process: apakah proses & timeline keputusan diketahui?
- Identify pain: apakah masalah/pemicu kebutuhan pelanggan jelas?
- Champion: apakah ada orang dalam yang mendorong deal ini?

## Framework 2 — Negosiasi (untuk stage NEGOTIATION/penawaran terkirim)
- Give-and-Get: jangan beri diskon tanpa imbalan (volume komitmen, DP lebih besar, term pembayaran lebih cepat, referensi/testimoni, multi-year).
- Good-Better-Best: tawarkan 3 opsi paket alih-alih menurunkan harga satu opsi.
- Taper concessions: konsesi makin kecil tiap ronde, jangan membesar.
- Anchor pakai ROI pelanggan, bukan harga pokok.

## Aturan output
- Bahasa Indonesia, ringkas, langsung bisa dieksekusi sales.
- JSON sesuai schema. "meddicScore" total 0-12. "nextActions" maksimal 3, konkret
  (mis. "Telepon Bpk X untuk konfirmasi budget Q3"), bukan generik.
- Jujur: jika data minim, katakan dimensi mana yang belum diketahui.`;

const COACH_SCHEMA = {
  type: "object",
  properties: {
    meddicScore: { type: "number" },
    qualification: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dimension: { type: "string" },
          score: { type: "number" },
          note: { type: "string" },
        },
        required: ["dimension", "score", "note"],
      },
    },
    risks: { type: "array", items: { type: "string" } },
    negotiationTips: { type: "array", items: { type: "string" } },
    nextActions: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
  required: ["meddicScore", "qualification", "risks", "nextActions", "summary"],
} as const;

export interface DealCoachInput {
  title: string;
  stage: string;
  value: string;
  customerName: string;
  contactName?: string | null;
  quotations: { nomor: string; status: string; total: string; viewCount: number }[];
  activities: { type: string; content: string; happenedAt: string }[];
  daysSinceLastActivity: number | null;
}

export interface DealCoachResult {
  meddicScore: number;
  qualification: { dimension: string; score: number; note: string }[];
  risks: string[];
  negotiationTips?: string[];
  nextActions: string[];
  summary: string;
  provider: string;
}

export async function coachDeal(input: DealCoachInput): Promise<DealCoachResult> {
  const baseUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL ?? "llama3.2:latest";

  const res = await undiciFetch(`${baseUrl}/api/chat`, {
    dispatcher,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: COACH_SCHEMA,
      keep_alive: "30m",
      options: { temperature: 0.2 },
      messages: [
        { role: "system", content: COACH_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(input, null, 2) },
      ],
    }),
    signal: AbortSignal.timeout(Number(process.env.OLLAMA_OCR_TIMEOUT_MS ?? 480_000)),
  });
  if (!res.ok) {
    throw new Error(`Deal coach gagal (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  const parsed = JSON.parse(data.message?.content ?? "{}") as Omit<
    DealCoachResult,
    "provider"
  >;

  return {
    meddicScore: Math.min(Math.max(Number(parsed.meddicScore) || 0, 0), 12),
    qualification: Array.isArray(parsed.qualification) ? parsed.qualification : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    negotiationTips: Array.isArray(parsed.negotiationTips)
      ? parsed.negotiationTips
      : undefined,
    nextActions: (Array.isArray(parsed.nextActions) ? parsed.nextActions : []).slice(0, 3),
    summary: String(parsed.summary ?? ""),
    provider: `ollama:${model}`,
  };
}
