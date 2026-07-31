"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/org-context";
import {
  addVendorProduct,
  createVendor,
  deleteVendor,
  deleteVendorProduct,
  searchVendorSources,
  updateVendor,
  type VendorInput,
  type VendorProductInput,
  type VendorSearchResult,
} from "./service";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function errMessage(e: unknown, fallback: string): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? fallback;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export async function simpanVendorAction(
  input: VendorInput,
  id?: string,
): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    if (id) await updateVendor(ctx, id, input);
    else await createVendor(ctx, input);
    revalidatePath("/app/vendor");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menyimpan vendor.") };
  }
}

export async function hapusVendorAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await deleteVendor(ctx, id);
    revalidatePath("/app/vendor");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menghapus vendor.") };
  }
}

export async function tambahProdukVendorAction(
  vendorId: string,
  input: VendorProductInput,
): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await addVendorProduct(ctx, vendorId, input);
    revalidatePath("/app/vendor");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menambah produk vendor.") };
  }
}

export async function hapusProdukVendorAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await deleteVendorProduct(ctx, id);
    revalidatePath("/app/vendor");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menghapus produk vendor.") };
  }
}

export async function cariVendorAction(
  query: string,
  inquiryItemId?: string,
): Promise<ActionResult<{ results: VendorSearchResult[] }>> {
  try {
    const ctx = await requireOrgContext();
    const results = await searchVendorSources(ctx, ctx.userId, query, inquiryItemId);
    return { ok: true, data: { results } };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Pencarian vendor gagal.") };
  }
}
