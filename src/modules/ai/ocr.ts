import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Agent, fetch as undiciFetch } from "undici";

const execFileAsync = promisify(execFile);

// Fetch default Node (undici) punya headersTimeout hard 5 menit — terlalu
// pendek saat model vision antre/cold-load di GPU bersama. Pakai Agent sendiri.
const ocrDispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

/**
 * OCR / ekstraksi teks dari file inquiry (gambar & PDF) — lokal, tanpa cloud.
 *
 * - Gambar (jpg/png/webp): model vision Ollama (default qwen2.5vl).
 * - PDF dengan text layer: unpdf (cepat, tanpa OCR).
 * - PDF hasil scan (tanpa text layer): render halaman -> PNG via pdftoppm
 *   (poppler), lalu OCR tiap halaman dengan model vision.
 *
 * Gagal = throw; pemanggil memutuskan fallback (mis. minta user tempel teks).
 */

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const MAX_PDF_OCR_PAGES = 5;

const OCR_PROMPT = `Salin SEMUA teks yang terlihat pada gambar dokumen ini apa adanya (transkripsi verbatim).
Ini dokumen permintaan penawaran (inquiry) B2B — perhatikan nama barang, jumlah, satuan, dan spesifikasi.
Pertahankan struktur baris/daftar/tabel (tabel jadi baris "kolom1 | kolom2 | ...").
Jangan menerjemahkan, jangan merangkum, jangan menambah komentar. Balas hanya teksnya.`;

function ollamaUrl(): string {
  return process.env.OLLAMA_URL ?? "http://localhost:11434";
}

function visionModel(): string {
  return process.env.OLLAMA_VISION_MODEL ?? "qwen2.5vl:latest";
}

export function isOcrSupported(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext) || ext === ".pdf";
}

/** Timeout per percobaan OCR (GPU bersama: cold-load model bisa >5 menit). */
function ocrTimeoutMs(): number {
  return Number(process.env.OLLAMA_OCR_TIMEOUT_MS ?? 480_000);
}

/**
 * Context window OCR. PENTING: qwen2.5vl dengan ctx default 32k butuh ~51GB
 * (tidak muat 1 GPU 46GB -> jatuh ke CPU, sangat lambat). 8k cukup untuk
 * transkripsi satu halaman dan muat penuh di GPU.
 */
function ocrNumCtx(): number {
  return Number(process.env.OLLAMA_OCR_NUM_CTX ?? 8192);
}

/** OCR satu gambar via model vision Ollama. */
async function ocrImage(imageBytes: Buffer): Promise<string> {
  const res = await undiciFetch(`${ollamaUrl()}/api/chat`, {
    dispatcher: ocrDispatcher,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: visionModel(),
      stream: false,
      keep_alive: "30m",
      options: { temperature: 0, num_ctx: ocrNumCtx() },
      messages: [
        {
          role: "user",
          content: OCR_PROMPT,
          images: [imageBytes.toString("base64")],
        },
      ],
    }),
    signal: AbortSignal.timeout(ocrTimeoutMs()),
  });
  if (!res.ok) {
    throw new Error(`OCR vision gagal (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  return (data.message?.content ?? "").trim();
}

/** Ekstrak text layer PDF; string kosong jika PDF hasil scan. */
async function pdfTextLayer(bytes: Buffer): Promise<string> {
  const { extractText } = await import("unpdf");
  const { text } = await extractText(new Uint8Array(bytes), { mergePages: true });
  return text.trim();
}

/** Render PDF -> PNG per halaman via poppler, lalu OCR tiap halaman. */
async function ocrScannedPdf(bytes: Buffer): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "saleskit-ocr-"));
  try {
    const pdfPath = path.join(dir, "in.pdf");
    await writeFile(pdfPath, bytes);
    await execFileAsync("pdftoppm", [
      "-png",
      "-r",
      "200",
      "-l",
      String(MAX_PDF_OCR_PAGES),
      pdfPath,
      path.join(dir, "page"),
    ]);
    const pages = (await readdir(dir)).filter((f) => f.endsWith(".png")).sort();
    if (pages.length === 0) throw new Error("PDF tidak menghasilkan halaman gambar.");

    const texts: string[] = [];
    for (const page of pages) {
      texts.push(await ocrImage(await readFile(path.join(dir, page))));
    }
    return texts.join("\n\n").trim();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Ekstrak teks dari file (gambar/PDF). `ext` harus lowercase termasuk titik.
 */
export async function extractTextFromFile(ext: string, bytes: Buffer): Promise<string> {
  if (IMAGE_EXTENSIONS.has(ext)) return ocrImage(bytes);

  if (ext === ".pdf") {
    const textLayer = await pdfTextLayer(bytes).catch(() => "");
    // Text layer sangat pendek = kemungkinan PDF scan -> OCR.
    if (textLayer.length >= 50) return textLayer;
    return ocrScannedPdf(bytes);
  }

  throw new Error(`Format file ${ext} tidak didukung untuk OCR.`);
}
