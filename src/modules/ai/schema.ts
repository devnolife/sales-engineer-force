import { z } from "zod";

export const extractedInquirySchema = z.object({
  customerName: z.string().trim().min(1).max(300).optional(),
  items: z.array(z.object({
    rawText: z.string().trim().min(1).max(2000),
    name: z.string().trim().min(1).max(300),
    qty: z.string().max(32).regex(/^\d+(?:\.\d+)?$/).refine((value) => Number(value) > 0),
    unit: z.string().trim().max(20).optional(),
    spec: z.string().trim().max(1000).optional(),
  })).max(100),
  confidence: z.number().min(0).max(1),
  provider: z.string().trim().max(210).refine(
    (value) => ["local", "mock", "ollama"].includes(value) || /^ollama:[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(value),
  ),
  note: z.string().max(2000).optional(),
});
