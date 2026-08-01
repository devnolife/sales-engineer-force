/**
 * Benchmark model Ollama untuk ekstraksi inquiry.
 * Pemakaian: pnpm tsx scripts/benchmark-ai.ts [model1 model2 ...]
 */
import { readFileSync } from "node:fs";
import { OllamaAiProvider } from "../src/modules/ai/ollama-provider";

const MODELS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["llama3.2:latest", "qwen2.5:7b-instruct", "gemma4:latest", "gpt-oss:latest"];

// Item yang diharapkan dari public/contoh-permintaan.txt
const EXPECTED = [
  "pompa dosing",
  "membran ro",
  "antiscalant",
  "pipa pvc",
  "sand filter",
  "panel kontrol",
];

async function main() {
  const text = readFileSync("public/contoh-permintaan.txt", "utf8");

  console.log("Model                          | Waktu    | Item | Recall | Customer");
  console.log("-------------------------------|----------|------|--------|---------");

  for (const model of MODELS) {
    process.env.OLLAMA_MODEL = model;
    const provider = new OllamaAiProvider();
    const t0 = Date.now();
    try {
      const r = await provider.extractInquiry({ rawText: text });
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      const names = r.items.map((i) => i.name.toLowerCase());
      const hit = EXPECTED.filter((e) => names.some((n) => n.includes(e))).length;
      const fellBack = r.provider.startsWith("mock") || r.note?.includes("mock");
      console.log(
        `${model.padEnd(30)} | ${`${sec}s`.padEnd(8)} | ${String(r.items.length).padEnd(4)} | ${hit}/${EXPECTED.length}    | ${r.customerName ?? "-"}${fellBack ? "  (FALLBACK MOCK!)" : ""}`,
      );
    } catch (e) {
      console.log(`${model.padEnd(30)} | GAGAL: ${e}`);
    }
  }
}

main();
