"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/org-context";
import type { OrgScope } from "@/modules/org/service";
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
  updateInquiryText,
} from "./service";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export interface CreatedInquiryData {
  id: string;
  provider?: string;
  note?: string;
  warning?: string;
}

async function processCreatedInquiry(scope: OrgScope, userId: string, id: string): Promise<CreatedInquiryData> {
  try {
    const result = await extractInquiry(scope, userId, id);
    return {
      id, provider: result.provider, note: result.note,
      warning: result.itemCount === 0 ? result.note : undefined,
    };
  } catch {
    const warning = "Teks tersimpan, tetapi item belum berhasil diekstrak. Periksa teks dan coba Ekstrak ulang.";
    console.error("Ekstraksi permintaan baru gagal; teks dipertahankan untuk review.");
    await scope.db.inquiry.update({ where: { id }, data: { processingNote: warning } });
    return { id, warning };
  }
}

function errMessage(e: unknown, fallback: string): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? fallback;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export async function buatPermintaanTeksAction(input: {
  rawText: string;
  customerId?: string;
}): Promise<ActionResult<CreatedInquiryData>> {
  try {
    const ctx = await requireOrgContext();
    const inquiry = await createInquiryFromText(ctx, ctx.userId, {
      rawText: input.rawText,
      customerId: input.customerId ?? "",
    });
    const data = await processCreatedInquiry(ctx, ctx.userId, inquiry.id);
    revalidatePath("/app/permintaan");
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal membuat permintaan.") };
  }
}

export async function uploadPermintaanAction(
  formData: FormData,
): Promise<ActionResult<CreatedInquiryData>> {
  try {
    const ctx = await requireOrgContext();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Pilih file permintaan dulu." };
    }
    if (file.size > 5 * 1024 * 1024) return { ok: false, error: "Ukuran file maksimal 5 MB." };
    const bytes = Buffer.from(await file.arrayBuffer());
    const inquiry = await createInquiryFromFile(ctx, ctx.userId, {
      name: file.name,
      bytes,
    });
    const data = await processCreatedInquiry(ctx, ctx.userId, inquiry.id);
    revalidatePath("/app/permintaan");
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal mengunggah permintaan.") };
  }
}

export async function ekstrakUlangAction(id: string): Promise<ActionResult<{
  provider: string; itemCount: number; note?: string;
}>> {
  try {
    const ctx = await requireOrgContext();
    const result = await extractInquiry(ctx, ctx.userId, id);
    revalidatePath(`/app/permintaan/${id}`);
    return { ok: true, data: { provider: result.provider, itemCount: result.itemCount, note: result.note } };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menjalankan ekstraksi.") };
  }
}

export async function perbaruiTeksPermintaanAction(id: string, rawText: string): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await updateInquiryText(ctx, ctx.userId, id, rawText);
    revalidatePath(`/app/permintaan/${id}`);
    revalidatePath("/app/permintaan");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errMessage(error, "Gagal menyimpan teks permintaan.") };
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
