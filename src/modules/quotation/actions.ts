"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/org-context";
import {
  createQuotation,
  deleteQuotation,
  issueQuotation,
  QuotationError,
  reviseQuotation,
  setQuotationStatus,
  updateQuotation,
} from "./service";
import type { QuotationInput } from "./schema";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function errMessage(e: unknown, fallback: string): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? fallback;
  if (e instanceof QuotationError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export async function buatPenawaranAction(
  input: QuotationInput,
  terbitkan: boolean,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireOrgContext();
    const draft = await createQuotation(ctx, ctx.userId, input);
    if (terbitkan) {
      await issueQuotation(ctx, ctx.userId, draft.id);
    }
    revalidatePath("/app/penawaran");
    return { ok: true, data: { id: draft.id } };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menyimpan penawaran.") };
  }
}

export async function perbaruiPenawaranAction(
  id: string,
  input: QuotationInput,
  terbitkan: boolean,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireOrgContext();
    await updateQuotation(ctx, id, input);
    if (terbitkan) {
      await issueQuotation(ctx, ctx.userId, id);
    }
    revalidatePath("/app/penawaran");
    revalidatePath(`/app/penawaran/${id}`);
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal memperbarui penawaran.") };
  }
}

export async function terbitkanPenawaranAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await issueQuotation(ctx, ctx.userId, id);
    revalidatePath("/app/penawaran");
    revalidatePath(`/app/penawaran/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menerbitkan penawaran.") };
  }
}

export async function revisiPenawaranAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireOrgContext();
    const clone = await reviseQuotation(ctx, ctx.userId, id);
    revalidatePath("/app/penawaran");
    return { ok: true, data: { id: clone.id } };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal membuat revisi.") };
  }
}

export async function setStatusPenawaranAction(
  id: string,
  status: "WON" | "LOST" | "SENT",
  lostReason?: string,
): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await setQuotationStatus(ctx, id, status, lostReason);
    revalidatePath("/app/penawaran");
    revalidatePath(`/app/penawaran/${id}`);
    revalidatePath("/app/pipeline");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal mengubah status.") };
  }
}

export async function hapusPenawaranAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await deleteQuotation(ctx, id);
    revalidatePath("/app/penawaran");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menghapus penawaran.") };
  }
}
