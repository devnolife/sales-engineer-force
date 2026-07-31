/**
 * Pencocokan item permintaan -> produk katalog.
 *
 * Kode ASLI (bukan mock): skor tumpang-tindih token + bonus frasa.
 * Saat AI asli masuk (Fase 2), embedding menggantikan/ menambah skor ini —
 * lewat interface yang sama.
 */

const STOPWORDS = new Set([
  "dan",
  "atau",
  "untuk",
  "dengan",
  "yang",
  "di",
  "ke",
  "dari",
  "the",
  "of",
  "for",
]);

export function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    // Normalisasi inch DULU — sebelum tanda kutip dibuang.
    .replace(/(\d+)\s*(?:"|inch|inci|in\b)/g, "$1inch")
    .replace(/["'()[\]{},;:!?]/g, " ")
    .split(/[\s/\\-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export interface MatchCandidate {
  id: string;
  name: string;
  brand?: string | null;
  type?: string | null;
  spec?: string | null;
}

export interface MatchResult {
  productId: string;
  score: number;
}

/** Skor 0..1: seberapa cocok teks permintaan dengan satu produk. */
export function scoreMatch(query: string, candidate: MatchCandidate): number {
  const queryTokens = normalizeTokens(query);
  if (queryTokens.length === 0) return 0;

  const nameTokens = normalizeTokens(candidate.name);
  const extraTokens = normalizeTokens(
    [candidate.brand, candidate.type, candidate.spec].filter(Boolean).join(" "),
  );

  const nameSet = new Set(nameTokens);
  const extraSet = new Set(extraTokens);

  let hit = 0;
  for (const token of queryTokens) {
    if (nameSet.has(token)) {
      hit += 1;
    } else if (extraSet.has(token)) {
      // Token cocok di merek/tipe/spek dihitung penuh — informasi tambahan
      // yang benar tidak boleh MENURUNKAN skor.
      hit += 1;
    } else if (nameTokens.some((n) => n.startsWith(token) || token.startsWith(n))) {
      hit += 0.4;
    }
  }
  let score = hit / queryTokens.length;

  // Bonus frasa: nama produk muncul utuh dalam query (atau sebaliknya).
  const q = queryTokens.join(" ");
  const n = nameTokens.join(" ");
  if (n && (q.includes(n) || n.includes(q))) score = Math.max(score, 0.9);

  return Math.min(1, score);
}

export type MatchStatus = "MATCHED" | "SUGGESTED" | "UNMATCHED";

export const MATCH_THRESHOLD = { matched: 0.75, suggested: 0.4 } as const;

export function statusFor(score: number): MatchStatus {
  if (score >= MATCH_THRESHOLD.matched) return "MATCHED";
  if (score >= MATCH_THRESHOLD.suggested) return "SUGGESTED";
  return "UNMATCHED";
}

/** Kandidat terbaik untuk satu teks permintaan. */
export function bestMatch(
  query: string,
  candidates: MatchCandidate[],
): (MatchResult & { status: MatchStatus }) | null {
  let best: MatchResult | null = null;
  for (const c of candidates) {
    const score = scoreMatch(query, c);
    if (!best || score > best.score) best = { productId: c.id, score };
  }
  if (!best || best.score < MATCH_THRESHOLD.suggested) {
    return best ? { ...best, status: "UNMATCHED" } : null;
  }
  return { ...best, status: statusFor(best.score) };
}
