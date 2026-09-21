import "server-only";

import { Agent, fetch as undiciFetch } from "undici";
import type { MatchCandidate, MatchResult, MatchStatus } from "./matching";
import { bestMatch, MATCH_THRESHOLD, statusFor } from "./matching";

/**
 * Matching semantik item inquiry -> katalog via embedding (bge-m3 di Ollama).
 *
 * Menggabungkan dua sinyal:
 * - Skor token (matching.ts) — presisi untuk angka/ukuran ("2 inch", "1054").
 * - Cosine similarity embedding — memahami sinonim ("pompa celup" ~ "pompa
 *   submersible") lintas bahasa.
 *
 * Skor akhir = max(token, embedding_dikalibrasi). Jika Ollama tidak tersedia,
 * fallback mulus ke skor token — alur inquiry tidak pernah macet.
 */

const dispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

function embeddingModel(): string {
  return process.env.OLLAMA_EMBED_MODEL ?? "bge-m3:latest";
}

async function embed(texts: string[]): Promise<number[][]> {
  const baseUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";
  const res = await undiciFetch(`${baseUrl}/api/embed`, {
    dispatcher,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: embeddingModel(), input: texts, keep_alive: "30m" }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Ollama embed gagal (${res.status})`);
  const data = (await res.json()) as { embeddings?: number[][] };
  if (!data.embeddings || data.embeddings.length !== texts.length) {
    throw new Error("Jumlah embedding tidak sesuai input.");
  }
  return data.embeddings;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/**
 * Kalibrasi cosine bge-m3 -> skala skor 0..1 kami.
 * Pasangan tak-berhubungan ~0.4-0.55; sangat mirip ~0.75+.
 */
function calibrate(cos: number): number {
  return Math.min(1, Math.max(0, (cos - 0.5) / 0.35));
}

function candidateText(c: MatchCandidate): string {
  return [c.name, c.brand, c.type, c.spec].filter(Boolean).join(" ");
}

/**
 * Cocokkan BANYAK query ke katalog sekaligus (batch — 1x embed katalog).
 * Return per query: kandidat terbaik + status, atau null.
 */
export async function bestMatchesSemantic(
  queries: string[],
  candidates: MatchCandidate[],
): Promise<((MatchResult & { status: MatchStatus }) | null)[]> {
  // Skor token selalu dihitung (murah, presisi angka).
  const tokenResults = queries.map((q) => bestMatch(q, candidates));
  if (candidates.length === 0 || queries.length === 0) return tokenResults;

  try {
    const [queryVecs, candVecs] = await Promise.all([
      embed(queries),
      embed(candidates.map(candidateText)),
    ]);

    return queries.map((_, qi) => {
      // Kandidat embedding terbaik untuk query ini
      let bestIdx = -1;
      let bestCos = -1;
      for (let ci = 0; ci < candidates.length; ci++) {
        const cos = cosine(queryVecs[qi]!, candVecs[ci]!);
        if (cos > bestCos) {
          bestCos = cos;
          bestIdx = ci;
        }
      }
      const semScore = calibrate(bestCos);
      const token = tokenResults[qi];

      // Ambil skor tertinggi; jika produk berbeda, menangkan yang lebih tinggi.
      if (token && token.score >= semScore) return token;
      if (bestIdx >= 0 && semScore >= MATCH_THRESHOLD.suggested) {
        return {
          productId: candidates[bestIdx]!.id,
          score: Number(semScore.toFixed(3)),
          status: statusFor(semScore),
        };
      }
      return token;
    });
  } catch (e) {
    console.error("Embedding matching gagal — pakai skor token:", e);
    return tokenResults;
  }
}
