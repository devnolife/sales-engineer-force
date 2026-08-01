import "server-only";

/**
 * Mailer mock-first (pola sama dengan AI/sourcing provider):
 * - MAIL_PROVIDER=mock (default): log ke console, tidak kirim apa pun.
 * - MAIL_PROVIDER=resend: kirim via Resend HTTP API (RESEND_API_KEY, MAIL_FROM).
 * Swap provider cukup lewat env — pemanggil tidak berubah.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(msg: MailMessage): Promise<void> {
  const provider = process.env.MAIL_PROVIDER ?? "mock";

  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.MAIL_FROM;
    if (!apiKey || !from) {
      throw new Error("MAIL_PROVIDER=resend butuh RESEND_API_KEY dan MAIL_FROM.");
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: msg.to, subject: msg.subject, text: msg.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Resend gagal (${res.status}): ${detail.slice(0, 200)}`);
    }
    return;
  }

  console.log(`[MOCK EMAIL] Ke: ${msg.to} | ${msg.subject}\n${msg.text}`);
}
