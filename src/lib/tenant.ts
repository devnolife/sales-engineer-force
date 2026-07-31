import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Isolasi tenant (PRD §8.2).
 *
 * `orgDb(organizationId)` mengembalikan Prisma Client yang MENYUNTIKKAN filter
 * `organizationId` secara otomatis pada semua model data organisasi:
 * - findMany/findFirst/count/aggregate/groupBy/updateMany/deleteMany:
 *   `where` digabung dengan `{ organizationId }`.
 * - create/createMany: `data.organizationId` dipaksa ke org aktif.
 * - findUnique/update/upsert/delete: dicek kepemilikannya — record milik org
 *   lain diperlakukan seperti tidak ada (P2025 / null).
 *
 * Model auth (User, Session, dsb.) TIDAK di-scope — dikelola Better Auth.
 */

// Nama model (PascalCase, sesuai schema.prisma) yang wajib ber-organizationId.
export const ORG_SCOPED_MODELS = new Set<string>([
  "OrgSettings",
  "Category",
  "Product",
  "Customer",
  "ContactPerson",
  "Deal",
  "Activity",
  "Reminder",
  "QuotationCounter",
  "Quotation",
  "QuotationItem",
  "Inquiry",
  "InquiryItem",
  "Vendor",
  "VendorProduct",
  "SourcingSearch",
  "AiLog",
]);

export class TenantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantError";
  }
}

type AnyArgs = Record<string, unknown>;

function mergeWhere(args: AnyArgs, organizationId: string): AnyArgs {
  const where = (args.where as AnyArgs | undefined) ?? {};
  return { ...args, where: { AND: [{ organizationId }, where] } };
}

function injectData(args: AnyArgs, organizationId: string): AnyArgs {
  if (Array.isArray(args.data)) {
    return {
      ...args,
      data: args.data.map((d: AnyArgs) => ({ ...d, organizationId })),
    };
  }
  return { ...args, data: { ...(args.data as AnyArgs), organizationId } };
}

/** Delegasi model dengan huruf kecil di awal, mis. "Quotation" -> prisma.quotation */
function delegate(model: string) {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  return (prisma as unknown as Record<string, { findFirst: (args: AnyArgs) => Promise<unknown> }>)[key];
}

/** Pastikan record unik (by where unik) milik org aktif; lempar TenantError bila bukan. */
async function assertOwnership(model: string, args: AnyArgs, organizationId: string) {
  const found = await delegate(model).findFirst({
    where: { AND: [{ organizationId }, (args.where as AnyArgs) ?? {}] },
    select: { id: true },
  });
  if (!found) {
    throw new TenantError(
      `Data ${model} tidak ditemukan di organisasi aktif (kemungkinan lintas-tenant).`,
    );
  }
}

export function orgDb(organizationId: string) {
  if (!organizationId) {
    throw new TenantError("organizationId kosong — akses data tanpa konteks organisasi ditolak.");
  }

  return prisma.$extends({
    name: `org-scoped:${organizationId}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!ORG_SCOPED_MODELS.has(model)) {
            return query(args);
          }
          const a = (args ?? {}) as AnyArgs;

          switch (operation) {
            case "findMany":
            case "findFirst":
            case "findFirstOrThrow":
            case "count":
            case "aggregate":
            case "groupBy":
            case "updateMany":
            case "deleteMany":
              return query(mergeWhere(a, organizationId) as typeof args);

            case "create":
            case "createMany":
            case "createManyAndReturn":
              return query(injectData(a, organizationId) as typeof args);

            case "findUnique":
            case "findUniqueOrThrow": {
              const result = (await query(args)) as { organizationId?: string } | null;
              if (result && result.organizationId !== organizationId) {
                if (operation === "findUniqueOrThrow") {
                  throw new TenantError(`Data ${model} bukan milik organisasi aktif.`);
                }
                return null;
              }
              return result;
            }

            case "update":
            case "delete": {
              await assertOwnership(model, a, organizationId);
              return query(args);
            }

            case "upsert": {
              const existing = await delegate(model).findFirst({
                where: (a.where as AnyArgs) ?? {},
                select: { id: true, organizationId: true } as never,
              });
              if (existing && (existing as { organizationId?: string }).organizationId !== organizationId) {
                throw new TenantError(`Data ${model} bukan milik organisasi aktif.`);
              }
              const withCreate = {
                ...a,
                create: { ...(a.create as AnyArgs), organizationId },
              };
              return query(withCreate as typeof args);
            }

            default:
              // Operasi lain (mis. queryRaw tidak lewat sini) — tolak demi keamanan.
              return query(mergeWhere(a, organizationId) as typeof args);
          }
        },
      },
    },
  });
}

export type OrgDb = ReturnType<typeof orgDb>;

/** Tipe transaksi interaktif dari client ter-scope. */
export type OrgTx = Parameters<Parameters<OrgDb["$transaction"]>[0]>[0];

// Prisma namespace dipakai supaya import type tersedia bagi pemanggil.
export type { Prisma };
