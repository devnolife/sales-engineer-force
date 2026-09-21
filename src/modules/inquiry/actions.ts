"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/org-context";
import {
  convertInquiryToQuotation,
  createInquiryFromFile,
  createInquiryFromText,
  deleteInquiry,
  deleteInquiryItem,
  extractInquiry,
  setInquiryCustomer,
  setInquiryItemMatch,
  updateInquiryItem,
} from "./service";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function errMessage(e: unknown, fallback: string): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? fallback;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export async function buatPermintaanTeksAction(input: {
  rawText: string;
  customerId?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireOrgContext();
    const inquiry = await createInquiryFromText(ctx, ctx.userId, {
      rawText: input.rawText,
      customerId: input.customerId ?? "",
    });
    // Langsung jalankan ekstraksi supaya alurnya satu langkah.
    await extractInquiry(ctx, ctx.userId, inquiry.id);
    revalidatePath("/app/permintaan");
    return { ok: true, data: { id: inquiry.id } };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal membuat permintaan.") };
  }
}

export async function uploadPermintaanAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireOrgContext();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Pilih file permintaan dulu." };
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const inquiry = await createInquiryFromFile(ctx, ctx.userId, {
      name: file.name,
      bytes,
    });
    await extractInquiry(ctx, ctx.userId, inquiry.id);
    revalidatePath("/app/permintaan");
    return { ok: true, data: { id: inquiry.id } };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal mengunggah permintaan.") };
  }
}

export async function ekstrakUlangAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await extractInquiry(ctx, ctx.userId, id);
    revalidatePath(`/app/permintaan/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menjalankan ekstraksi.") };
  }
}

export async function simpanItemPermintaanAction(
  itemId: string,
  input: { name: string; qty: string; unit?: string; spec?: string },
  inquiryId: string,
): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await updateInquiryItem(ctx, itemId, {
      name: input.name,
      qty: input.qty,
      unit: input.unit ?? "",
      spec: input.spec ?? "",
    });
    revalidatePath(`/app/permintaan/${inquiryId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menyimpan item.") };
  }
}

export async function setMatchItemAction(
  itemId: string,
  productId: string | null,
  inquiryId: string,
): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await setInquiryItemMatch(ctx, itemId, productId);
    revalidatePath(`/app/permintaan/${inquiryId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal mengubah pencocokan.") };
  }
}

export async function hapusItemPermintaanAction(
  itemId: string,
  inquiryId: string,
): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await deleteInquiryItem(ctx, itemId);
    revalidatePath(`/app/permintaan/${inquiryId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menghapus item.") };
  }
}

export async function setPelangganPermintaanAction(
  inquiryId: string,
  data: { customerId?: string; customerName?: string },
): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await setInquiryCustomer(ctx, inquiryId, data);
    revalidatePath(`/app/permintaan/${inquiryId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menyimpan pelanggan.") };
  }
}

export async function konversiKePenawaranAction(
  inquiryId: string,
): Promise<ActionResult<{ quotationId: string }>> {
  try {
    const ctx = await requireOrgContext();
    const quotation = await convertInquiryToQuotation(ctx, ctx.userId, inquiryId);
    revalidatePath("/app/permintaan");
    revalidatePath("/app/penawaran");
    return { ok: true, data: { quotationId: quotation.id } };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal konversi ke penawaran.") };
  }
}

export async function hapusPermintaanAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await deleteInquiry(ctx, id);
    revalidatePath("/app/permintaan");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menghapus permintaan.") };
  }
}
