import type {
  AiProvider,
  ExtractedInquiry,
  ExtractInquiryInput,
} from "./types";
import { MockAiProvider } from "./mock-provider";

/**
 * Provider LLM lokal via Ollama (structured output / JSON schema).
 *
 * Env:
 * - OLLAMA_URL   (default http://localhost:11434)
 * - OLLAMA_MODEL (default qwen2.5:7b-instruct)
 *
 * Jika Ollama tidak tersedia / timeout / output tidak valid, fallback ke
 * mock provider agar alur inquiry tidak pernah macet (human-in-the-loop
 * tetap mereview hasilnya).
 */

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    customerName: { type: ["string", "null"] },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rawText: { type: "string" },
          name: { type: "string" },
          qty: { type: "string" },
          unit: { type: ["string", "null"] },
          spec: { type: ["string", "null"] },
        },
        required: ["rawText", "name", "qty"],
      },
    },
    confidence: { type: "number" },
  },
  required: ["items", "confidence"],
} as const;

const SYSTEM_PROMPT = `Kamu adalah asisten sales engineer B2B teknik Indonesia.
Tugas: ekstrak daftar item permintaan (inquiry) dari teks email/chat pelanggan.

Aturan:
- "items": setiap barang/jasa yang diminta. "qty" berupa string angka desimal (default "1" jika tidak disebut). "unit" satuan (pcs, unit, set, meter, kg, ...) atau null. "spec" spesifikasi teknis (ukuran, material, merek, tekanan, dll.) atau null. "rawText" = potongan teks asli sumber item.
- "customerName": nama perusahaan peminta (PT/CV/UD ...) jika ada, selain itu null.
- "confidence": 0..1 seberapa yakin ekstraksi.
- Abaikan salam, basa-basi, tanda tangan, nomor telepon.
- Jangan mengarang item yang tidak diminta.
Balas HANYA JSON sesuai schema.`;

interface OllamaExtraction {
  customerName?: string | null;
  items: {
    rawText: string;
    name: string;
    qty: string;
    unit?: string | null;
    spec?: string | null;
  }[];
  confidence: number;
}

export class OllamaAiProvider implements AiProvider {
  readonly name = "ollama";
  private fallback = new MockAiProvider();

  private get baseUrl() {
    return process.env.OLLAMA_URL ?? "http://localhost:11434";
  }

  private get model() {
    // Benchmark internal (L40S): llama3.2 ~13s, qwen2.5:7b ~18s, gemma4 ~21s —
    // semua recall 6/6 pada contoh inquiry; pilih yang tercepat.
    return process.env.OLLAMA_MODEL ?? "llama3.2:latest";
  }

  async extractInquiry(input: ExtractInquiryInput): Promise<ExtractedInquiry> {
    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: RESPONSE_SCHEMA,
          // Tahan model di GPU 30 menit — hindari cold start antar-ekstraksi.
          keep_alive: "30m",
          options: { temperature: 0 },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `${input.fileName ? `File: ${input.fileName}\n\n` : ""}${input.rawText}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);

      const data = (await res.json()) as { message?: { content?: string } };
      const parsed = JSON.parse(data.message?.content ?? "") as OllamaExtraction;
      if (!Array.isArray(parsed.items)) throw new Error("items bukan array");

      const items = parsed.items
        .filter((i) => i?.name && String(i.name).trim().length > 0)
        .map((i) => ({
          rawText: String(i.rawText ?? i.name),
          name: String(i.name).trim(),
          qty: /^\d+(\.\d+)?$/.test(String(i.qty).replace(",", "."))
            ? String(i.qty).replace(",", ".")
            : "1",
          unit: i.unit ? String(i.unit).trim() : undefined,
          spec: i.spec ? String(i.spec).trim() : undefined,
        }));

      const confidence = Math.min(Math.max(Number(parsed.confidence) || 0.5, 0), 1);

      return {
        customerName: parsed.customerName?.trim() || undefined,
        items,
        confidence,
        provider: `${this.name}:${this.model}`,
        note:
          items.length === 0
            ? "LLM tidak menemukan item — periksa teks sumber."
            : undefined,
      };
    } catch (e) {
      console.error("OllamaAiProvider gagal — fallback ke mock:", e);
      const result = await this.fallback.extractInquiry(input);
      return {
        ...result,
        note: `LLM tidak tersedia, hasil dari parser mock. ${result.note ?? ""}`.trim(),
      };
    }
  }
}
