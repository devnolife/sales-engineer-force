import { z } from "zod";
import type { OrgScope } from "@/modules/org/service";

/** Modul katalog: produk & kategori per-organisasi + import CSV. */

export const produkSchema = z.object({
  name: z.string().trim().min(2, "Nama produk minimal 2 karakter").max(200),
  brand: z.string().trim().max(80).optional().default(""),
  type: z.string().trim().max(80).optional().default(""),
  spec: z.string().trim().max(1000).optional().default(""),
  unit: z.string().trim().min(1).max(20).default("Unit"),
  defaultPrice: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, "Harga harus angka")
    .optional()
    .or(z.literal(""))
    .default(""),
  categoryId: z.string().optional().or(z.literal("")).default(""),
  isActive: z.boolean().default(true),
});

export type ProdukInput = z.input<typeof produkSchema>;

export async function listCategories({ db }: OrgScope) {
  return db.category.findMany({ orderBy: { name: "asc" } });
}

export async function upsertCategory(scope: OrgScope, name: string) {
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new Error("Nama kategori terlalu pendek.");
  const existing = await scope.db.category.findFirst({ where: { name: trimmed } });
  if (existing) return existing;
  return scope.db.category.create({
    data: { organizationId: scope.orgId, name: trimmed },
  });
}

export async function listProducts(
  scope: OrgScope,
  opts: { search?: string; categoryId?: string; includeInactive?: boolean } = {},
) {
  const { search, categoryId, includeInactive } = opts;
  return scope.db.product.findMany({
    where: {
      ...(includeInactive ? {} : { isActive: true }),
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { brand: { contains: search } },
              { type: { contains: search } },
            ],
          }
        : {}),
    },
    include: { category: { select: { name: true } } },
    orderBy: { name: "asc" },
    take: 500,
  });
}

function normalizeProdukData(scope: OrgScope, input: ProdukInput) {
  const parsed = produkSchema.parse(input);
  return {
    organizationId: scope.orgId,
    name: parsed.name,
    brand: parsed.brand || null,
    type: parsed.type || null,
    spec: parsed.spec || null,
    unit: parsed.unit,
    defaultPrice: parsed.defaultPrice || null,
    categoryId: parsed.categoryId || null,
    isActive: parsed.isActive,
  };
}

export async function createProduct(scope: OrgScope, input: ProdukInput) {
  return scope.db.product.create({ data: normalizeProdukData(scope, input) });
}

export async function updateProduct(scope: OrgScope, id: string, input: ProdukInput) {
  return scope.db.product.update({
    where: { id },
    data: normalizeProdukData(scope, input),
  });
}

export async function deleteProduct(scope: OrgScope, id: string) {
  return scope.db.product.delete({ where: { id } });
}

// ---------- Import CSV ----------

export interface CsvImportRow {
  name: string;
  brand?: string;
  type?: string;
  spec?: string;
  unit?: string;
  defaultPrice?: string;
  category?: string;
}

export interface CsvImportResult {
  created: number;
  skipped: { line: number; reason: string }[];
}

/**
 * Import produk dari baris CSV yang sudah diparse client-side.
 * Baris duplikat (nama sama persis, case-insensitive) dilewati.
 */
export async function importProducts(
  scope: OrgScope,
  rows: CsvImportRow[],
): Promise<CsvImportResult> {
  const result: CsvImportResult = { created: 0, skipped: [] };
  const existing = await scope.db.product.findMany({ select: { name: true } });
  const seen = new Set(existing.map((p) => p.name.toLowerCase()));

  for (const [index, row] of rows.entries()) {
    const line = index + 2; // +2: header + 1-indexed
    const name = row.name?.trim();
    if (!name || name.length < 2) {
      result.skipped.push({ line, reason: "Nama kosong/terlalu pendek" });
      continue;
    }
    if (seen.has(name.toLowerCase())) {
      result.skipped.push({ line, reason: `Duplikat: ${name}` });
      continue;
    }
    const price = row.defaultPrice?.trim().replace(/[^\d.]/g, "") || "";
    if (row.defaultPrice && price && !/^\d+(\.\d+)?$/.test(price)) {
      result.skipped.push({ line, reason: `Harga tidak valid: ${row.defaultPrice}` });
      continue;
    }

    let categoryId: string | null = null;
    if (row.category?.trim()) {
      const cat = await upsertCategory(scope, row.category);
      categoryId = cat.id;
    }

    await scope.db.product.create({
      data: {
        organizationId: scope.orgId,
        name,
        brand: row.brand?.trim() || null,
        type: row.type?.trim() || null,
        spec: row.spec?.trim() || null,
        unit: row.unit?.trim() || "Unit",
        defaultPrice: price || null,
        categoryId,
      },
    });
    seen.add(name.toLowerCase());
    result.created += 1;
  }

  return result;
}
