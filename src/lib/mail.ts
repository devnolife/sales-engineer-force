import "server-only";

/**
 * Mailer mock-first (pola sama dengan AI/sourcing provider):
 * - MAIL_PROVIDER=mock (default): log ke console, tidak kirim apa pun.
 * - MAIL_PROVIDER=resend: kirim via Resend HTTP API (RESEND_API_KEY, MAIL_FROM).
 * Swap provider cukup lewat env — pemanggil tidak berubah.
 */

export interface MailAttachment {
  filename: string;
  /** Isi file (di-encode base64 saat dikirim). */
  content: Buffer;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  attachments?: MailAttachment[];
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
      body: JSON.stringify({
        from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        ...(msg.attachments?.length
          ? {
            attachments: msg.attachments.map((a) => ({
              filename: a.filename,
              content: a.content.toString("base64"),
            })),
          }
          : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Resend gagal (${res.status}): ${detail.slice(0, 200)}`);
    }
    return;
  }

  const lampiran = msg.attachments?.length
    ? ` [lampiran: ${msg.attachments.map((a) => `${a.filename} (${Math.round(a.content.byteLength / 1024)} KB)`).join(", ")}]`
    : "";
  console.log(`[MOCK EMAIL] Ke: ${msg.to} | ${msg.subject}${lampiran}\n${msg.text}`);
}
