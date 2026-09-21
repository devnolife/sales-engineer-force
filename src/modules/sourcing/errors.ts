import { z } from "zod";
import type { SourceError } from "./types";

const messages: Record<SourceError["code"], string> = {
  INVALID_INPUT: "Input sourcing tidak valid. Kata kunci harus berisi 3-500 karakter.",
  NOT_FOUND: "Hasil pencarian tidak ditemukan di organisasi aktif.",
  NOT_ALLOWED: "Hasil ini tidak dapat diambil detailnya. Jalankan pencarian ulang.",
  NOT_CONFIGURED: "Pencarian web belum dikonfigurasi. Hubungi administrator.",
  RATE_LIMITED: "Batas permintaan web tercapai. Coba lagi nanti.",
  TIMEOUT: "Layanan pencarian web melewati batas waktu. Coba lagi nanti.",
  PROVIDER_UNAVAILABLE: "Layanan pencarian web sedang tidak tersedia.",
  BAD_RESPONSE: "Respons layanan pencarian web tidak valid. Coba lagi nanti.",
  PERSISTENCE_FAILED: "Hasil sourcing belum berhasil disimpan. Coba lagi nanti.",
};

export class SourcingError extends Error {
  readonly retryAfterSeconds?: number;

  constructor(
    readonly code: SourceError["code"],
    options: { message?: string; retryAfterSeconds?: number } = {},
  ) {
    super(options.message ?? messages[code]);
    this.name = "SourcingError";
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  toSourceError(): SourceError {
    return {
      code: this.code,
      message: this.message,
      ...(this.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: this.retryAfterSeconds }),
    };
  }
}

export function toSourceError(
  error: unknown,
  fallback: SourceError["code"] = "PROVIDER_UNAVAILABLE",
): SourceError {
  if (error instanceof SourcingError) return error.toSourceError();
  if (error instanceof z.ZodError) return new SourcingError("INVALID_INPUT").toSourceError();
  console.error("Operasi sourcing gagal.", {
    code: fallback,
    errorName: error instanceof Error ? error.name : "unknown",
  });
  return new SourcingError(fallback).toSourceError();
}
