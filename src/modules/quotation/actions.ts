"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sendMail } from "@/lib/mail";
import { formatRupiah, formatTanggal } from "@/lib/format";
import { requireOrgContext } from "@/lib/org-context";
import { draftQuotationEmail } from "@/modules/ai/email-writer";
import { generateQuotationPdf, isPdfEnabled } from "@/modules/pdf/service";
import { withRevision } from "./lib/quotation-number";
import {
  createQuotation,
  deleteQuotation,
  getQuotation,
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

// ---------- Kirim email (AI draft + PDF otomatis) ----------

/** Ringkas data penawaran untuk prompt/draft email. */
async function quotationEmailContext(ctx: Awaited<ReturnType<typeof requireOrgContext>>, id: string) {
  const quotation = await getQuotation(ctx, id);
  if (!quotation) throw new QuotationError("Penawaran tidak ditemukan.");
  if (quotation.status === "DRAFT" || !quotation.numberBase) {
    throw new QuotationError("Terbitkan penawaran dulu sebelum kirim email.");
  }
  const nomor = withRevision(quotation.numberBase, quotation.revision);
  const publicUrl = quotation.publicToken
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/q/${quotation.publicToken}`
    : null;
  return { quotation, nomor, publicUrl };
}

export async function draftEmailPenawaranAction(
  id: string,
): Promise<ActionResult<{ subject: string; body: string; provider: string; suggestedTo: string }>> {
  try {
    const ctx = await requireOrgContext();
    const { quotation, nomor, publicUrl } = await quotationEmailContext(ctx, id);

    const itemNames = quotation.items.slice(0, 5).map((i) => i.name).join(", ");
    const draft = await draftQuotationEmail({
      nomor,
      subject: quotation.subject,
      customerName: quotation.customerName,
      attn: quotation.attn,
      total: formatRupiah(quotation.total),
      itemsSummary: `${quotation.items.length} item: ${itemNames}`,
      validUntil: quotation.validUntil ? formatTanggal(quotation.validUntil) : null,
      publicUrl,
      hasPdfAttachment: isPdfEnabled(),
      senderName: ctx.userName,
      orgName: quotation.orgName ?? "",
    });

    // Saran email tujuan: kontak pertama customer terkait (jika ada).
    let suggestedTo = "";
    if (quotation.customer) {
      const contact = await ctx.db.contactPerson.findFirst({
        where: { customerId: quotation.customer.id, email: { not: null } },
        select: { email: true },
      });
      suggestedTo = contact?.email ?? "";
    }

    return { ok: true, data: { ...draft, suggestedTo } };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal membuat draft email.") };
  }
}

export async function kirimEmailPenawaranAction(
  id: string,
  input: { to: string; subject: string; body: string },
): Promise<ActionResult<{ withPdf: boolean }>> {
  try {
    const parsed = z
      .object({
        to: z.string().trim().email("Alamat email tidak valid."),
        subject: z.string().trim().min(3).max(200),
        body: z.string().trim().min(10).max(10000),
      })
      .parse(input);

    const ctx = await requireOrgContext();
    const { quotation, nomor } = await quotationEmailContext(ctx, id);

    // Lampirkan PDF bila server PDF aktif; jika gagal, kirim tanpa lampiran.
    let attachments: { filename: string; content: Buffer }[] | undefined;
    if (isPdfEnabled()) {
      try {
        const pdf = await generateQuotationPdf({
          quotationId: quotation.id,
          revision: quotation.revision,
          issued: true,
        });
        attachments = [
          { filename: `Penawaran-${nomor.replace(/[^a-zA-Z0-9.-]+/g, "_")}.pdf`, content: pdf },
        ];
      } catch (e) {
        console.error("PDF untuk email gagal — kirim tanpa lampiran:", e);
      }
    }

    await sendMail({
      to: parsed.to,
      subject: parsed.subject,
      text: parsed.body,
      attachments,
    });

    // Email terkirim = penawaran resmi tersampaikan -> status SENT (jika belum WON/LOST).
    if (quotation.status === "SENT") {
      // sudah SENT — tidak ada perubahan status
    }

    revalidatePath(`/app/penawaran/${id}`);
    return { ok: true, data: { withPdf: Boolean(attachments?.length) } };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal mengirim email.") };
  }
}
