import { z } from "zod";

/**
 * Skema input penawaran.
 * Uang/qty dikirim sebagai STRING desimal (presisi aman lewat JSON — pola Metito).
 * Totals TIDAK PERNAH diterima dari client; selalu dihitung ulang server-side.
 */

export const decimalString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "Harus angka desimal tidak negatif");

export const quotationItemSchema = z.object({
  productId: z.string().optional().or(z.literal("")).default(""),
  name: z.string().trim().min(1, "Nama item wajib diisi").max(300),
  brand: z.string().trim().max(80).optional().default(""),
  type: z.string().trim().max(120).optional().default(""),
  spec: z.string().trim().max(1000).optional().default(""),
  qty: decimalString,
  unit: z.string().trim().min(1).max(20).default("Unit"),
  unitPrice: decimalString,
  discountPercent: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, "Diskon harus angka")
    .refine((v) => Number(v) <= 100, "Diskon maksimal 100%")
    .default("0"),
});

export const quotationInputSchema = z.object({
  customerId: z.string().optional().or(z.literal("")).default(""),
  customerName: z.string().trim().min(1, "Nama pelanggan wajib diisi").max(200),
  attn: z.string().trim().max(120).optional().default(""),
  subject: z.string().trim().min(1, "Perihal wajib diisi").max(300),
  quoteDate: z.string().optional().default(""),
  franco: z.string().trim().max(200).optional().default(""),
  deliveryTime: z.string().trim().max(200).optional().default(""),
  termsOfPayment: z.string().trim().max(200).optional().default(""),
  priceIncludeNote: z.string().trim().max(200).optional().default(""),
  validityDays: z.coerce.number().int().min(1).max(365).default(30),
  vatPercent: z.coerce.number().min(0).max(100).default(11),
  docDiscountType: z.enum(["AMOUNT", "PERCENT"]).default("AMOUNT"),
  docDiscountValue: decimalString.default("0"),
  notes: z.string().trim().max(2000).optional().default(""),
  items: z.array(quotationItemSchema).min(1, "Minimal satu item"),
});

export type QuotationInput = z.input<typeof quotationInputSchema>;
export type QuotationItemInput = z.input<typeof quotationItemSchema>;
