import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { formatTanggal } from "@/lib/format";

/**
 * Email reminder harian (M5): kirim digest follow-up jatuh tempo/terlambat
 * ke tiap user penerima (assignee reminder, fallback owner deal).
 *
 * Lintas-organisasi (dipanggil dari cron, bukan request user) — memakai
 * prisma langsung, bukan orgDb.
 */
export async function sendDueReminderDigests(): Promise<{
  reminders: number;
  emailsSent: number;
}> {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const due = await prisma.reminder.findMany({
    where: { done: false, dueAt: { lte: endOfToday } },
    include: {
      deal: { select: { id: true, title: true, ownerId: true, organizationId: true } },
    },
    orderBy: { dueAt: "asc" },
  });

  if (due.length === 0) return { reminders: 0, emailsSent: 0 };

  // Kelompokkan per penerima
  const byUser = new Map<string, typeof due>();
  for (const r of due) {
    const userId = r.assigneeId ?? r.deal.ownerId;
    const list = byUser.get(userId) ?? [];
    list.push(r);
    byUser.set(userId, list);
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [...byUser.keys()] } },
    select: { id: true, email: true, name: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let emailsSent = 0;

  for (const [userId, reminders] of byUser) {
    const user = userById.get(userId);
    if (!user?.email) continue;

    const lines = reminders.map(
      (r) =>
        `- [${formatTanggal(r.dueAt)}] ${r.deal.title}: ${r.note}\n  ${appUrl}/app/pipeline/${r.deal.id}`,
    );
    const text = [
      `Halo ${user.name},`,
      "",
      `Anda punya ${reminders.length} follow-up jatuh tempo:`,
      "",
      ...lines,
      "",
      "Tandai selesai setelah di-follow-up agar tidak muncul lagi besok.",
    ].join("\n");

    try {
      await sendMail({
        to: user.email,
        subject: `[SalesKit] ${reminders.length} follow-up jatuh tempo hari ini`,
        text,
      });
      emailsSent += 1;
    } catch (e) {
      console.error(`Gagal kirim digest reminder ke ${user.email}:`, e);
    }
  }

  return { reminders: due.length, emailsSent };
}
