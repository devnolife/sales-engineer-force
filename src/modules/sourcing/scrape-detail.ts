import "server-only";

import { z } from "zod";
import { SourcingError } from "./errors";
import { sourcingLiveProvider, sourcingMode, sourcingPost } from "./remote-provider";
import { coreAiDetailSchema, publicUrlSchema, querySchema } from "./schema";
import type { WebResultPayload } from "./types";

const requestSchema = z.object({ query: querySchema, url: publicUrlSchema }).strict();

export async function scrapeVendorPageDetail(
  input: { query: string; url: string },
): Promise<WebResultPayload> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw new SourcingError("INVALID_INPUT");
  if (sourcingMode() !== "live") throw new SourcingError("NOT_ALLOWED");
  const provider = sourcingLiveProvider();
  const response = await sourcingPost("/v1/sourcing/scrape-detail", { ...parsed.data, provider }, coreAiDetailSchema);
  if (response.provider !== provider) throw new SourcingError("BAD_RESPONSE");
  return response.result;
}
