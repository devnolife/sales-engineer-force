import { MockAiProvider } from "./mock-provider";
import type { AiProvider } from "./types";

export type { AiProvider, ExtractedInquiry, ExtractedInquiryItem } from "./types";

/**
 * Pemilihan provider AI lewat env `AI_PROVIDER`.
 * Kerangka mock-first: hanya "mock". Nanti: "gemini" | "openai" via Vercel AI SDK
 * — ditambahkan DI SINI tanpa mengubah modul lain.
 */
export function getAiProvider(): AiProvider {
  const name = process.env.AI_PROVIDER ?? "mock";
  switch (name) {
    case "mock":
      return new MockAiProvider();
    default:
      console.warn(`AI_PROVIDER "${name}" belum tersedia — memakai mock.`);
      return new MockAiProvider();
  }
}
