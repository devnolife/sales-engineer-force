import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { coreAiPostBinary, isCoreAiEnabled } from "@/lib/core-ai";

/**
 * Modul PDF server-side (M4).
 *
 * Render dokumen penawaran menjadi PDF A4 lewat Gotenberg (route Chromium
 * convert/url) yang mem-fetch halaman print internal aplikasi.
 *
 * - Dokumen TERBIT immutable per (quotation, revision) -> hasil PDF di-cache
 *   di disk (PDF_CACHE_DIR; nanti bisa dipindah ke R2 tanpa mengubah pemanggil).
 * - DRAFT tidak pernah di-cache (isinya masih bisa berubah).
 * - Jika GOTENBERG_URL tidak diset, fitur dianggap nonaktif (fallback:
 *   print browser).
 */

const DEFAULT_CACHE_DIR = ".data/pdf";

export function isPdfEnabled(): boolean {
  // Render bisa lewat core-ai (disarankan) atau Gotenberg langsung (legacy).
  return isCoreAiEnabled() || Boolean(process.env.GOTENBERG_URL);
}

/** URL yang dipakai Gotenberg untuk menjangkau aplikasi (dalam docker: nama service). */
function internalAppUrl(): string {
  return (
    process.env.INTERNAL_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  );
}

/** Secret untuk mengamankan route print internal (bukan untuk publik). */
export function printRouteKey(): string {
  const secret =
    process.env.PDF_INTERNAL_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    // Tanpa fallback hardcoded (pelajaran Metito): fail eksplisit, bukan key kosong.
    throw new PdfError(
      "PDF_INTERNAL_SECRET atau BETTER_AUTH_SECRET wajib diset untuk fitur PDF.",
    );
  }
  // Turunkan key dari secret agar secret asli tidak pernah muncul di URL/log.
  return createHash("sha256").update(`pdf-print:${secret}`).digest("hex").slice(0, 32);
}

export function isValidPrintKey(key: string | null): boolean {
  if (!key) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(printRouteKey());
  } catch {
    return false; // secret tidak diset -> route print internal mati total
  }
  const actual = Buffer.from(key);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

interface GeneratePdfInput {
  quotationId: string;
  revision: number;
  /** Hanya dokumen terbit (bernomor) yang boleh di-cache. */
  issued: boolean;
}

class PdfError extends Error { }

async function cachePath(input: GeneratePdfInput): Promise<string> {
  const dir = process.env.PDF_CACHE_DIR ?? DEFAULT_CACHE_DIR;
  await mkdir(dir, { recursive: true });
  return path.join(dir, `${input.quotationId}-rev${input.revision}.pdf`);
}

async function renderPdf(printUrl: string): Promise<Buffer> {
  // Jalur utama: service core-ai (yang memegang koneksi Gotenberg).
  if (isCoreAiEnabled()) {
    return coreAiPostBinary("/v1/pdf/render", { url: printUrl }, { timeoutMs: 30_000 });
  }

  // Legacy: Gotenberg langsung dari aplikasi.
  const gotenbergUrl = process.env.GOTENBERG_URL;
  if (!gotenbergUrl) {
    throw new PdfError("CORE_AI_URL/GOTENBERG_URL belum diset — fitur PDF server nonaktif.");
  }

  const form = new FormData();
  form.set("url", printUrl);
  // A4; hormati @page CSS dari dokumen.
  form.set("preferCssPageSize", "true");
  form.set("printBackground", "true");
  form.set("marginTop", "0");
  form.set("marginBottom", "0");
  form.set("marginLeft", "0");
  form.set("marginRight", "0");

  const res = await fetch(`${gotenbergUrl}/forms/chromium/convert/url`, {
    method: "POST",
    body: form,
    // Target NFR: PDF < 5 detik; beri ruang sedikit untuk cold start.
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new PdfError(`Gotenberg gagal (${res.status}): ${detail.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Hasilkan PDF penawaran. Cache-first untuk dokumen terbit.
 * Pemanggil bertanggung jawab atas otorisasi (org context / public token).
 */
export async function generateQuotationPdf(input: GeneratePdfInput): Promise<Buffer> {
  if (input.issued) {
    const file = await cachePath(input);
    const cached = await readFile(file).catch(() => null);
    if (cached) return cached;
  }

  const printUrl = `${internalAppUrl()}/internal/print/penawaran/${input.quotationId}?key=${printRouteKey()}`;
  const pdf = await renderPdf(printUrl);

  if (input.issued) {
    const file = await cachePath(input);
    await writeFile(file, pdf).catch((e) =>
      console.error("Gagal menulis cache PDF:", e),
    );
  }

  return pdf;
}
