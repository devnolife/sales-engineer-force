"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/org-context";
import {
  addVendorProduct,
  createVendor,
  deleteVendor,
  deleteVendorProduct,
  fetchVendorSourceDetail,
  searchVendorSources,
  updateVendor,
  type VendorInput,
  type VendorProductInput,
} from "./service";
import { SourcingError } from "./errors";
import { detailInputSchema, searchInputSchema } from "./schema";
import type { DetailActionResult, SearchActionResult } from "./types";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function errMessage(e: unknown, fallback: string): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? fallback;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

/** Ambil harga & kontak dari halaman toko (on-demand — hemat kuota scrape). */
export async function ambilDetailTokoAction(
  input: { searchId: string; resultId: string },
): Promise<DetailActionResult> {
  const ctx = await requireOrgContext();
  const parsed = detailInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", error: new SourcingError("INVALID_INPUT").toSourceError() };
  }
  return fetchVendorSourceDetail(ctx, ctx.userId, parsed.data);
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
): Promise<SearchActionResult> {
  const ctx = await requireOrgContext();
  const parsed = searchInputSchema.safeParse({ query, inquiryItemId });
  if (!parsed.success) {
    return { status: "error", error: new SourcingError("INVALID_INPUT").toSourceError() };
  }
  return searchVendorSources(ctx, ctx.userId, parsed.data.query, parsed.data.inquiryItemId);
}
