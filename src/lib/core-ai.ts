import "server-only";

import { Agent, fetch as undiciFetch } from "undici";

/**
 * Klien HTTP ke service core-ai (proses terpisah).
 *
 * Env:
 * - CORE_AI_URL     : base URL service (mis. http://localhost:8787).
 *                     Kosong = fitur remote nonaktif (fallback lokal/mock).
 * - CORE_AI_API_KEY : opsional, dikirim sebagai Bearer token.
 */

// Timeout panjang untuk OCR/LLM — headersTimeout default undici (5 mnt) terlalu pendek.
const dispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

export function coreAiUrl(): string | null {
  const url = process.env.CORE_AI_URL?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

export function isCoreAiEnabled(): boolean {
  return coreAiUrl() !== null;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const key = process.env.CORE_AI_API_KEY;
  if (key) h.Authorization = `Bearer ${key}`;
  return h;
}

export class CoreAiError extends Error { }

/** POST JSON -> JSON. Throw CoreAiError bila core-ai tidak diset / gagal. */
export async function coreAiPost<T>(
  path: string,
  body: unknown,
  opts: { timeoutMs?: number } = {},
): Promise<T> {
  const base = coreAiUrl();
  if (!base) throw new CoreAiError("CORE_AI_URL belum diset.");

  const res = await undiciFetch(`${base}${path}`, {
    dispatcher,
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new CoreAiError(`core-ai ${path} gagal (${res.status}): ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** POST JSON -> bytes (mis. PDF). */
export async function coreAiPostBinary(
  path: string,
  body: unknown,
  opts: { timeoutMs?: number } = {},
): Promise<Buffer> {
  const base = coreAiUrl();
  if (!base) throw new CoreAiError("CORE_AI_URL belum diset.");

  const res = await undiciFetch(`${base}${path}`, {
    dispatcher,
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new CoreAiError(`core-ai ${path} gagal (${res.status}): ${detail.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
