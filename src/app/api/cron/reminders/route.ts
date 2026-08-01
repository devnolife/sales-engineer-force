import { NextResponse } from "next/server";
import { sendDueReminderDigests } from "@/modules/pipeline/reminder-email";

/**
 * Cron harian: kirim email digest reminder jatuh tempo.
 * Panggil sekali sehari (mis. system cron / scheduler VPS):
 *   curl -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/reminders
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendDueReminderDigests();
  return NextResponse.json({ ok: true, ...result });
}
