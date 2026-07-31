"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/org-context";
import {
  addActivity,
  addReminder,
  createDeal,
  toggleReminder,
  updateDealStage,
  type AktivitasInput,
  type DealInput,
  type DealStage,
  type ReminderInput,
} from "./service";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function errMessage(e: unknown, fallback: string): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? fallback;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export async function buatDealAction(
  input: DealInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireOrgContext();
    const deal = await createDeal(ctx, ctx.userId, input);
    revalidatePath("/app/pipeline");
    return { ok: true, data: { id: deal.id } };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal membuat deal.") };
  }
}

export async function ubahStageDealAction(
  id: string,
  stage: DealStage,
  lostReason?: string,
): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await updateDealStage(ctx, id, stage, lostReason);
    revalidatePath("/app/pipeline");
    revalidatePath(`/app/pipeline/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal mengubah stage deal.") };
  }
}

export async function tambahAktivitasAction(
  dealId: string,
  input: AktivitasInput,
): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await addActivity(ctx, ctx.userId, dealId, input);
    revalidatePath("/app/pipeline");
    revalidatePath(`/app/pipeline/${dealId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal mencatat aktivitas.") };
  }
}

export async function tambahReminderAction(
  dealId: string,
  input: ReminderInput,
): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await addReminder(ctx, dealId, input);
    revalidatePath("/app/pipeline");
    revalidatePath(`/app/pipeline/${dealId}`);
    revalidatePath("/app");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menambah reminder.") };
  }
}

export async function toggleReminderAction(
  id: string,
  done: boolean,
): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await toggleReminder(ctx, id, done);
    revalidatePath("/app/pipeline");
    revalidatePath("/app");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal memperbarui reminder.") };
  }
}
