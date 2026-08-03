import "server-only";

import { coreAiPost } from "@/lib/core-ai";

/**
 * AI Deal Coach — klien tipis ke service core-ai.
 * Prompt & logika LLM ada di core-ai/src/ai/deal-coach.ts.
 */

export interface DealCoachInput {
  title: string;
  stage: string;
  value: string;
  customerName: string;
  contactName?: string | null;
  quotations: { nomor: string; status: string; total: string; viewCount: number }[];
  activities: { type: string; content: string; happenedAt: string }[];
  daysSinceLastActivity: number | null;
}

export interface DealCoachResult {
  meddicScore: number;
  qualification: { dimension: string; score: number; note: string }[];
  risks: string[];
  negotiationTips?: string[];
  nextActions: string[];
  summary: string;
  provider: string;
}

export async function coachDeal(input: DealCoachInput): Promise<DealCoachResult> {
  return coreAiPost<DealCoachResult>("/v1/deal-coach", input, {
    timeoutMs: Number(process.env.OLLAMA_OCR_TIMEOUT_MS ?? 480_000) + 30_000,
  });
}
