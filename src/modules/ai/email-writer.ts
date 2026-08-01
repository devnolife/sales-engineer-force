import "server-only";

import { Agent, fetch as undiciFetch } from "undici";

/**
 * AI Email Writer — draft email penawaran otomatis via LLM lokal (Ollama).
 * Human-in-the-loop: hasil selalu bisa diedit sebelum dikirim.
 * Jika LLM tidak tersedia, fallback ke template statis (tidak pernah gagal).
 */

const dispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

const SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
  },
  required: ["subject", "body"],
} as const;

const SYSTEM_PROMPT = `Kamu penulis email bisnis B2B teknik Indonesia untuk sales engineer.
Tulis email pengantar surat penawaran ke pelanggan.

Aturan:
- Bahasa Indonesia formal-hangat, ringkas (maks 150 kata), tanpa basa-basi berlebihan.
- Struktur: salam ("Yth. ..."), pengantar 1 kalimat merujuk permintaan mereka,
  sebutkan nomor penawaran & ringkasan singkat item/nilai, sebutkan lampiran PDF
  dan/atau tautan dokumen, masa berlaku, ajakan diskusi, salam penutup dengan nama pengirim.
- "subject" ringkas: "Penawaran {nomor} — {perihal singkat}".
- Jangan mengarang data apa pun di luar yang diberikan: TANPA nomor telepon,
  alamat email, jabatan, atau harga yang tidak ada di input.
- Body berupa plain text (tanpa markdown/HTML).`;

export interface EmailDraftInput {
  nomor: string;
  subject: string;
  customerName: string;
  attn?: string | null;
  total: string; // sudah diformat rupiah
  itemsSummary: string; // mis. "6 item: Pompa dosing, Membran RO, ..."
  validUntil?: string | null; // tanggal terformat
  publicUrl?: string | null;
  hasPdfAttachment: boolean;
  senderName: string;
  orgName: string;
}

export interface EmailDraft {
  subject: string;
  body: string;
  provider: string;
}

function fallbackDraft(input: EmailDraftInput): EmailDraft {
  const lines = [
    `Yth. ${input.attn ?? input.customerName},`,
    "",
    `Bersama ini kami sampaikan Surat Penawaran ${input.nomor} untuk ${input.subject} dengan total ${input.total}.`,
    input.hasPdfAttachment ? "Dokumen penawaran terlampir dalam format PDF." : "",
    input.publicUrl ? `Dokumen juga dapat dilihat di: ${input.publicUrl}` : "",
    input.validUntil ? `Penawaran berlaku hingga ${input.validUntil}.` : "",
    "",
    "Kami terbuka untuk diskusi lebih lanjut mengenai spesifikasi maupun komersial.",
    "",
    "Hormat kami,",
    input.senderName,
    input.orgName,
  ].filter((l) => l !== "");
  return {
    subject: `Penawaran ${input.nomor} — ${input.subject}`.slice(0, 150),
    body: lines.join("\n"),
    provider: "template",
  };
}

export async function draftQuotationEmail(input: EmailDraftInput): Promise<EmailDraft> {
  const baseUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL ?? "llama3.2:latest";

  try {
    const res = await undiciFetch(`${baseUrl}/api/chat`, {
      dispatcher,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: SCHEMA,
        keep_alive: "30m",
        options: { temperature: 0.3 },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(input, null, 2) },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);

    const data = (await res.json()) as { message?: { content?: string } };
    const parsed = JSON.parse(data.message?.content ?? "{}") as {
      subject?: string;
      body?: string;
    };
    if (!parsed.subject || !parsed.body) throw new Error("Draft kosong");

    return {
      subject: String(parsed.subject).slice(0, 150),
      body: String(parsed.body),
      provider: `ollama:${model}`,
    };
  } catch (e) {
    console.error("AI email draft gagal — pakai template:", e);
    return fallbackDraft(input);
  }
}
