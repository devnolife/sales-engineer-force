"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/org-context";
import {
  createProduct,
  deleteProduct,
  importProducts,
  updateProduct,
  upsertCategory,
  type CsvImportResult,
  type CsvImportRow,
  type ProdukInput,
} from "./service";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function errMessage(e: unknown, fallback: string): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? fallback;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export async function simpanProdukAction(
  input: ProdukInput,
  id?: string,
): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    if (id) await updateProduct(ctx, id, input);
    else await createProduct(ctx, input);
    revalidatePath("/app/katalog");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menyimpan produk.") };
  }
}

export async function hapusProdukAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await deleteProduct(ctx, id);
    revalidatePath("/app/katalog");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menghapus produk.") };
  }
}

export async function tambahKategoriAction(name: string): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await upsertCategory(ctx, name);
    revalidatePath("/app/katalog");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menambah kategori.") };
  }
}

export async function importProdukAction(
  rows: CsvImportRow[],
): Promise<ActionResult<CsvImportResult>> {
  try {
    if (rows.length === 0) return { ok: false, error: "Tidak ada baris untuk diimport." };
    if (rows.length > 1000) return { ok: false, error: "Maksimal 1000 baris per import." };
    const ctx = await requireOrgContext();
    const data = await importProducts(ctx, rows);
    revalidatePath("/app/katalog");
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Import gagal.") };
  }
}
