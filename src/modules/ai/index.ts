import { coreAiPost, isCoreAiEnabled } from "@/lib/core-ai";
import { MockAiProvider } from "./mock-provider";
import type { AiProvider, ExtractedInquiry, ExtractInquiryInput } from "./types";

export type { AiProvider, ExtractedInquiry, ExtractedInquiryItem } from "./types";

/**
 * Modul AI sisi aplikasi — kini menjadi KLIEN service core-ai.
 *
 * Semua logika LLM (Ollama, OCR, dst.) pindah ke service `core-ai/`
 * (dipanggil via HTTP, env CORE_AI_URL). Yang tersisa di sini:
 * - RemoteAiProvider : proxy ke core-ai.
 * - MockAiProvider   : heuristik lokal — fallback saat core-ai mati/belum diset.
 */

class RemoteAiProvider implements AiProvider {
  readonly name = "core-ai";
  private fallback = new MockAiProvider();

  async extractInquiry(input: ExtractInquiryInput): Promise<ExtractedInquiry> {
    try {
      return await coreAiPost<ExtractedInquiry>("/v1/extract-inquiry", input);
    } catch (e) {
      console.error("core-ai extractInquiry gagal — fallback ke mock lokal:", e);
      const result = await this.fallback.extractInquiry(input);
      return {
        ...result,
        note: `core-ai tidak tersedia, hasil dari parser mock lokal. ${result.note ?? ""}`.trim(),
      };
    }
  }
}

export function getAiProvider(): AiProvider {
  if (isCoreAiEnabled()) return new RemoteAiProvider();
  return new MockAiProvider();
}
