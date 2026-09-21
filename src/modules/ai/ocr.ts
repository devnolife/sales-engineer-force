import "server-only";

import { z } from "zod";
import { CoreAiError, coreAiPost } from "@/lib/core-ai";

/**
 * OCR / ekstraksi teks — klien tipis ke service core-ai.
 * Implementasi OCR lokal dan pembacaan PDF ada di core-ai/src/ai/ocr.ts.
 */

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const documentSchema = z.object({
  text: z.string().trim().min(1).max(20000),
  provider: z.enum(["pdf-text", "tesseract", "ollama"]),
  pages: z.number().int().min(1).max(5),
});

export type OcrDocument = z.infer<typeof documentSchema>;

const OCR_MESSAGES = {
  INVALID_INPUT: "Dokumen tidak valid atau rusak. Gunakan PDF, PNG, atau JPG yang dapat dibuka.",
  FILE_TOO_LARGE: "Ukuran file maksimal 5 MB.",
  TOO_MANY_PAGES: "Dokumen maksimal 5 halaman.",
  TEXT_TOO_LONG: "Teks dokumen maksimal 20.000 karakter. Pisahkan dokumen menjadi beberapa bagian.",
  EMPTY_TEXT: "Tidak ada teks yang terbaca. Gunakan gambar lebih jelas atau tempel teks permintaan.",
  NOT_CONFIGURED: "Layanan OCR belum dikonfigurasi. Hubungi pengelola atau tempel teks permintaan.",
  RATE_LIMITED: "Layanan OCR sedang digunakan. Coba lagi sebentar.",
  TIMEOUT: "Pembacaan dokumen melewati batas waktu. Coba dokumen lebih kecil atau tempel teks.",
  PROVIDER_UNAVAILABLE: "Layanan OCR tidak tersedia. Coba lagi atau tempel teks permintaan.",
  BAD_RESPONSE: "Respons OCR tidak valid. Dokumen belum disimpan.",
} as const;

export function isOcrSupported(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext) || ext === ".pdf";
}

/**
 * Ekstrak teks dari file (gambar/PDF) via core-ai. `ext` lowercase termasuk titik.
 * Gagal = throw dengan pesan aman; tidak mengembalikan teks atau item contoh.
 */
export async function extractTextFromFile(ext: string, bytes: Buffer): Promise<OcrDocument> {
  if (!isOcrSupported(ext) || bytes.byteLength === 0) throw new Error(OCR_MESSAGES.INVALID_INPUT);
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Error(OCR_MESSAGES.FILE_TOO_LARGE);
  const timeoutMs = process.env.OCR_REQUEST_TIMEOUT_MS === undefined
    ? Number(process.env.OLLAMA_OCR_TIMEOUT_MS ?? 480_000) + 30_000
    : Number(process.env.OCR_REQUEST_TIMEOUT_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600_000) {
    throw new Error("Konfigurasi batas waktu OCR tidak valid.");
  }
  let response: unknown;
  try {
    response = await coreAiPost<unknown>(
      "/v1/ocr", { ext, dataBase64: bytes.toString("base64") }, { timeoutMs },
    );
  } catch (error) {
    const code = error instanceof CoreAiError ? error.code
      : error instanceof Error && error.name === "TimeoutError" ? "TIMEOUT" : undefined;
    console.error("Permintaan OCR gagal.", { code: code ?? "PROVIDER_UNAVAILABLE" });
    const message = Object.entries(OCR_MESSAGES).find(([name]) => name === code)?.[1];
    throw new Error(message ?? OCR_MESSAGES.PROVIDER_UNAVAILABLE);
  }
  const parsed = documentSchema.safeParse(response);
  if (!parsed.success) {
    console.error("Respons OCR tidak memenuhi kontrak.");
    throw new Error(OCR_MESSAGES.BAD_RESPONSE);
  }
  return parsed.data;
}
