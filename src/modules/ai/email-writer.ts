import "server-only";

import { coreAiPost, isCoreAiEnabled } from "@/lib/core-ai";

/**
 * AI Email Writer — klien tipis ke service core-ai.
 * Logika LLM ada di core-ai/src/ai/email-writer.ts.
 * Fallback template statis tetap di sini agar fitur tidak pernah gagal
 * walau core-ai mati/belum diset.
 */

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
  if (!isCoreAiEnabled()) return fallbackDraft(input);
  try {
    return await coreAiPost<EmailDraft>("/v1/email-draft", input, { timeoutMs: 150_000 });
  } catch (e) {
    console.error("core-ai email draft gagal — pakai template:", e);
    return fallbackDraft(input);
  }
}
