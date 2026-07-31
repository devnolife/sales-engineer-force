import { z } from "zod";
import type { OrgScope } from "@/modules/org/service";

/** Modul pipeline: deal (lead → menang/kalah), aktivitas, dan reminder follow-up. */

export const DEAL_STAGES = ["LEAD", "QUOTED", "NEGOTIATION", "WON", "LOST"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const STAGE_LABEL: Record<DealStage, string> = {
  LEAD: "Lead",
  QUOTED: "Penawaran Terkirim",
  NEGOTIATION: "Negosiasi",
  WON: "Menang",
  LOST: "Kalah",
};

export const ACTIVITY_TYPES = ["CALL", "MEETING", "CHAT", "NOTE"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  CALL: "Telepon",
  MEETING: "Meeting",
  CHAT: "Chat",
  NOTE: "Catatan",
};

export const dealSchema = z.object({
  title: z.string().trim().min(2, "Judul deal minimal 2 karakter").max(200),
  customerId: z.string().min(1, "Pelanggan wajib dipilih"),
  value: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, "Nilai harus berupa angka")
    .default("0"),
});

export type DealInput = z.input<typeof dealSchema>;

export const aktivitasSchema = z.object({
  type: z.enum(ACTIVITY_TYPES),
  content: z.string().trim().min(1, "Isi aktivitas wajib diisi").max(2000),
  happenedAt: z.string().optional(),
});

export type AktivitasInput = z.input<typeof aktivitasSchema>;

export const reminderSchema = z.object({
  dueAt: z.string().min(1, "Tanggal wajib"),
  note: z.string().trim().min(1, "Catatan wajib diisi").max(500),
});

export type ReminderInput = z.input<typeof reminderSchema>;

export async function listDeals(
  scope: OrgScope,
  opts: { stage?: DealStage; search?: string } = {},
) {
  const { stage, search } = opts;
  return scope.db.deal.findMany({
    where: {
      ...(stage ? { stage } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search } },
              { customer: { name: { contains: search } } },
            ],
          }
        : {}),
    },
    include: {
      customer: { select: { name: true } },
      _count: { select: { quotations: true, activities: true } },
      reminders: {
        where: { done: false },
        orderBy: { dueAt: "asc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
}

export async function getDeal(scope: OrgScope, id: string) {
  return scope.db.deal.findFirst({
    where: { id },
    include: {
      customer: { include: { contacts: true } },
      quotations: {
        select: {
          id: true,
          numberBase: true,
          revision: true,
          status: true,
          total: true,
          quoteDate: true,
          issuedAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      activities: { orderBy: { happenedAt: "desc" }, take: 50 },
      reminders: { orderBy: [{ done: "asc" }, { dueAt: "asc" }], take: 50 },
    },
  });
}

export async function createDeal(scope: OrgScope, userId: string, input: DealInput) {
  const parsed = dealSchema.parse(input);
  const customer = await scope.db.customer.findFirst({
    where: { id: parsed.customerId },
    select: { id: true },
  });
  if (!customer) throw new Error("Pelanggan tidak ditemukan.");
  return scope.db.deal.create({
    data: {
      organizationId: scope.orgId,
      customerId: parsed.customerId,
      title: parsed.title,
      value: parsed.value,
      stage: "LEAD",
      ownerId: userId,
    },
  });
}

export async function updateDealStage(
  scope: OrgScope,
  id: string,
  stage: DealStage,
  lostReason?: string,
) {
  if (!DEAL_STAGES.includes(stage)) throw new Error("Stage tidak valid.");
  const closed = stage === "WON" || stage === "LOST";
  return scope.db.deal.update({
    where: { id },
    data: {
      stage,
      closedAt: closed ? new Date() : null,
      lostReason: stage === "LOST" ? (lostReason ?? null) : null,
    },
  });
}

export async function addActivity(
  scope: OrgScope,
  userId: string,
  dealId: string,
  input: AktivitasInput,
) {
  const parsed = aktivitasSchema.parse(input);
  const deal = await scope.db.deal.findFirst({
    where: { id: dealId },
    select: { id: true },
  });
  if (!deal) throw new Error("Deal tidak ditemukan.");
  return scope.db.activity.create({
    data: {
      organizationId: scope.orgId,
      dealId,
      type: parsed.type,
      content: parsed.content,
      happenedAt: parsed.happenedAt ? new Date(parsed.happenedAt) : new Date(),
      createdById: userId,
    },
  });
}

export async function addReminder(scope: OrgScope, dealId: string, input: ReminderInput) {
  const parsed = reminderSchema.parse(input);
  const deal = await scope.db.deal.findFirst({
    where: { id: dealId },
    select: { id: true },
  });
  if (!deal) throw new Error("Deal tidak ditemukan.");
  return scope.db.reminder.create({
    data: {
      organizationId: scope.orgId,
      dealId,
      dueAt: new Date(parsed.dueAt),
      note: parsed.note,
    },
  });
}

export async function toggleReminder(scope: OrgScope, id: string, done: boolean) {
  return scope.db.reminder.update({
    where: { id },
    data: { done, doneAt: done ? new Date() : null },
  });
}

export async function listDueReminders(scope: OrgScope, limit = 10) {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return scope.db.reminder.findMany({
    where: { done: false, dueAt: { lte: endOfToday } },
    include: { deal: { select: { id: true, title: true } } },
    orderBy: { dueAt: "asc" },
    take: limit,
  });
}
