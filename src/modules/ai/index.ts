import { coreAiPost, isCoreAiEnabled } from "@/lib/core-ai";
import { MockAiProvider } from "./mock-provider";
import { extractedInquirySchema } from "./schema";
import type { AiProvider, ExtractedInquiry, ExtractInquiryInput } from "./types";

export type { AiProvider, ExtractedInquiry, ExtractedInquiryItem } from "./types";

/**
 * Modul AI sisi aplikasi — kini menjadi KLIEN service core-ai.
 *
 * Semua logika LLM (Ollama, OCR, dst.) pindah ke service `core-ai/`
 * (dipanggil via HTTP, env CORE_AI_URL). Yang tersisa di sini:
 * - RemoteAiProvider : proxy ke core-ai.
 * - MockAiProvider   : demo lokal hanya saat core-ai belum dikonfigurasi.
 */

class RemoteAiProvider implements AiProvider {
  readonly name = "core-ai";
  async extractInquiry(input: ExtractInquiryInput): Promise<ExtractedInquiry> {
    let response: unknown;
    try {
      response = await coreAiPost<unknown>("/v1/extract-inquiry", input);
    } catch {
      console.error("core-ai extractInquiry tidak tersedia; tidak memakai data mock.");
      throw new Error("Ekstraksi item tidak tersedia. Teks permintaan tetap dapat direview.");
    }
    const parsed = extractedInquirySchema.safeParse(response);
    if (!parsed.success) {
      console.error("core-ai extractInquiry mengembalikan data yang tidak valid.");
      throw new Error("Hasil ekstraksi item tidak valid. Periksa teks permintaan.");
    }
    return parsed.data;
  }
}

export function getAiProvider(): AiProvider {
  if (isCoreAiEnabled()) return new RemoteAiProvider();
  return new MockAiProvider();
}
