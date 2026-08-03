import "server-only";

import { coreAiPost } from "@/lib/core-ai";

/**
 * OCR / ekstraksi teks — klien tipis ke service core-ai.
 * Implementasi asli (Ollama vision + unpdf + pdftoppm) ada di core-ai/src/ai/ocr.ts.
 */

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export function isOcrSupported(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext) || ext === ".pdf";
}

/**
 * Ekstrak teks dari file (gambar/PDF) via core-ai. `ext` lowercase termasuk titik.
 * Gagal = throw; pemanggil memutuskan fallback (mis. minta user tempel teks).
 */
export async function extractTextFromFile(ext: string, bytes: Buffer): Promise<string> {
  const { text } = await coreAiPost<{ text: string }>(
    "/v1/ocr",
    { ext, dataBase64: bytes.toString("base64") },
    { timeoutMs: Number(process.env.OLLAMA_OCR_TIMEOUT_MS ?? 480_000) + 30_000 },
  );
  return text;
}
