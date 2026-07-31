import { z } from "zod";
import type { OrgDb } from "@/lib/tenant";

/** Modul organisasi: pengaturan (kop, penomoran, PPN, rekening, T&C default). */

export interface OrgScope {
  db: OrgDb;
  orgId: string;
}

export async function getOrgSettings({ db, orgId }: OrgScope) {
  const existing = await db.orgSettings.findFirst();
  if (existing) return existing;
  // Lazy init. organizationId juga dipaksa ulang oleh orgDb (pagar runtime).
  return db.orgSettings.create({ data: { organizationId: orgId } });
}

export const pengaturanSchema = z.object({
  // Kop / identitas
  address: z.string().trim().max(500).optional().default(""),
  npwp: z.string().trim().max(50).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  email: z.string().trim().email().max(120).optional().or(z.literal("")).default(""),
  website: z.string().trim().max(120).optional().default(""),
  // Penomoran
  numberPrefix: z.string().trim().min(1).max(30),
  numberFormat: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((v) => v.includes("{seq"), {
      message: "Format nomor harus memuat token {seq} atau {seq:N}",
    }),
  revisionMode: z.enum(["SUFFIX", "NEW_NUMBER"]).default("SUFFIX"),
  // PPN dalam persen di UI (mis. 11) -> disimpan "0.11"
  vatPercent: z.coerce.number().min(0).max(100),
  // Rekening
  bankName: z.string().trim().max(80).optional().default(""),
  bankAccount: z.string().trim().max(50).optional().default(""),
  bankBranch: z.string().trim().max(80).optional().default(""),
  bankHolder: z.string().trim().max(80).optional().default(""),
  // Penandatangan
  signerName: z.string().trim().max(80).optional().default(""),
  signerTitle: z.string().trim().max(80).optional().default(""),
  // Default T&C
  defaultFranco: z.string().trim().max(200).optional().default(""),
  defaultDeliveryTime: z.string().trim().max(200).optional().default(""),
  defaultTermsOfPayment: z.string().trim().max(200).optional().default(""),
  defaultPriceIncludeNote: z.string().trim().max(200).optional().default(""),
  defaultValidityDays: z.coerce.number().int().min(1).max(365),
});

export type PengaturanInput = z.input<typeof pengaturanSchema>;

export async function updateOrgSettings(scope: OrgScope, input: PengaturanInput) {
  const parsed = pengaturanSchema.parse(input);
  const settings = await getOrgSettings(scope);
  const { vatPercent, ...rest } = parsed;

  return scope.db.orgSettings.update({
    where: { id: settings.id },
    data: {
      ...rest,
      vatRate: (vatPercent / 100).toString(),
    },
  });
}
