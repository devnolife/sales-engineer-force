import { MockAiProvider } from "./mock-provider";
import { OllamaAiProvider } from "./ollama-provider";
import type { AiProvider } from "./types";

export type { AiProvider, ExtractedInquiry, ExtractedInquiryItem } from "./types";

/**
 * Pemilihan provider AI lewat env `AI_PROVIDER`.
 * - "mock"   : heuristik lokal tanpa LLM (default kerangka).
 * - "ollama" : LLM lokal via Ollama (OLLAMA_URL, OLLAMA_MODEL); fallback mock.
 * Provider cloud (gemini/openai) ditambahkan DI SINI tanpa mengubah modul lain.
 */
export function getAiProvider(): AiProvider {
  const name = process.env.AI_PROVIDER ?? "mock";
  switch (name) {
    case "mock":
      return new MockAiProvider();
    case "ollama":
      return new OllamaAiProvider();
    default:
      console.warn(`AI_PROVIDER "${name}" belum tersedia — memakai mock.`);
      return new MockAiProvider();
  }
}
