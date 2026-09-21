"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/org-context";
import { coachDeal, type DealCoachResult } from "@/modules/ai/deal-coach";
import { withRevision } from "@/modules/quotation/lib/quotation-number";
import {
  addActivity,
  addReminder,
  createDeal,
  getDeal,
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

/**
 * AI Deal Coach: analisis kualifikasi (MEDDIC) + saran negosiasi
 * (Give-and-Get) memakai LLM lokal. Human-in-the-loop — hasil hanya saran.
 */
export async function coachDealAction(
  dealId: string,
): Promise<ActionResult<DealCoachResult>> {
  try {
    const ctx = await requireOrgContext();
    const deal = await getDeal(ctx, dealId);
    if (!deal) return { ok: false, error: "Deal tidak ditemukan." };

    const lastActivity = deal.activities[0]?.happenedAt ?? null;
    const result = await coachDeal({
      title: deal.title,
      stage: deal.stage,
      value: deal.value,
      customerName: deal.customer.name,
      contactName: deal.customer.contacts[0]?.name ?? null,
      quotations: deal.quotations.map((q) => ({
        nomor: q.numberBase ? withRevision(q.numberBase, q.revision) : "(draft)",
        status: q.status,
        total: q.total,
        viewCount: 0,
      })),
      activities: deal.activities.slice(0, 10).map((a) => ({
        type: a.type,
        content: a.content,
        happenedAt: a.happenedAt.toISOString().slice(0, 10),
      })),
      daysSinceLastActivity: lastActivity
        ? Math.floor((Date.now() - lastActivity.getTime()) / 86_400_000)
        : null,
    });

    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: errMessage(e, "AI coach tidak tersedia saat ini.") };
  }
}
