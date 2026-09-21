import "server-only";

import { z } from "zod";
import { CoreAiError, coreAiPost, isCoreAiEnabled } from "@/lib/core-ai";
import { SourcingError } from "./errors";
import { coreAiErrorSchema, coreAiSearchSchema, querySchema } from "./schema";
import type { SourceError, SourcingProvider, WebResultPayload } from "./types";

export function sourcingMode(): "mock" | "live" {
  const mode = process.env.SOURCING_MODE?.trim();
  if (mode !== "mock" && mode !== "live") throw new SourcingError("NOT_CONFIGURED");
  return mode;
}

function transportError(error: unknown): SourcingError {
  if (error instanceof SourcingError) return error;
  if (error instanceof CoreAiError) {
    const codes: Record<number, SourceError["code"]> = {
      401: "NOT_ALLOWED", 403: "NOT_ALLOWED", 408: "TIMEOUT", 429: "RATE_LIMITED", 504: "TIMEOUT",
    };
    const header = error.retryAfter;
    const delay = header && /^\d+$/.test(header)
      ? Number(header)
      : header ? Math.ceil((Date.parse(header) - Date.now()) / 1000) : NaN;
    const retryAfterSeconds = Number.isFinite(delay) && delay > 0 ? delay : undefined;
    const failure = new SourcingError(codes[error.status ?? 0] ?? "PROVIDER_UNAVAILABLE", {
      retryAfterSeconds,
    });
    if (!error.responseBody) return failure;
    try {
      const parsed = coreAiErrorSchema.safeParse(JSON.parse(error.responseBody));
      return parsed.success
        ? new SourcingError(parsed.data.error.code, {
          retryAfterSeconds: parsed.data.error.retryAfterSeconds ?? retryAfterSeconds,
        })
        : failure;
    } catch (parseError) {
      if (parseError instanceof SyntaxError) return failure;
      throw parseError;
    }
  }
  if (error instanceof SyntaxError) return new SourcingError("BAD_RESPONSE");
  if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) {
    return new SourcingError("TIMEOUT");
  }
  console.error("Transport sourcing gagal.", {
    errorName: error instanceof Error ? error.name : "unknown",
  });
  return new SourcingError("PROVIDER_UNAVAILABLE");
}

export async function sourcingPost<T>(
  path: "/v1/sourcing/search" | "/v1/sourcing/scrape-detail",
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  if (!isCoreAiEnabled()) throw new SourcingError("NOT_CONFIGURED");
  try {
    const response = await coreAiPost<unknown>(path, body, { timeoutMs: 45_000 });
    const parsed = schema.safeParse(response);
    if (!parsed.success) throw new SourcingError("BAD_RESPONSE");
    return parsed.data;
  } catch (error) {
    throw transportError(error);
  }
}

export class RemoteSourcingProvider implements SourcingProvider {
  readonly name = "firecrawl";

  async searchWeb(query: string): Promise<WebResultPayload[]> {
    const parsed = querySchema.safeParse(query);
    if (!parsed.success) throw new SourcingError("INVALID_INPUT");
    const response = await sourcingPost(
      "/v1/sourcing/search",
      { query: parsed.data, limit: 5, country: "ID" },
      coreAiSearchSchema,
    );
    return response.results;
  }
}
