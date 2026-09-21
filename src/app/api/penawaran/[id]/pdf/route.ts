import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org-context";
import { generateQuotationPdf, isPdfEnabled } from "@/modules/pdf/service";
import { withRevision } from "@/modules/quotation/lib/quotation-number";
import { getQuotation } from "@/modules/quotation/service";

/** Unduh PDF penawaran (internal, butuh org context). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isPdfEnabled()) {
    return NextResponse.json(
      { error: "PDF server nonaktif. Gunakan print browser." },
      { status: 503 },
    );
  }

  const { id } = await params;
  const ctx = await requireOrgContext();
  const quotation = await getQuotation(ctx, id);
  if (!quotation) {
    return NextResponse.json({ error: "Penawaran tidak ditemukan." }, { status: 404 });
  }

  try {
    const issued = quotation.status !== "DRAFT" && quotation.numberBase !== null;
    const pdf = await generateQuotationPdf({
      quotationId: quotation.id,
      revision: quotation.revision,
      issued,
    });

    const nomor = quotation.numberBase
      ? withRevision(quotation.numberBase, quotation.revision)
      : "draft";
    const filename = `Penawaran-${nomor.replace(/[^a-zA-Z0-9.-]+/g, "_")}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("Gagal membuat PDF:", e);
    return NextResponse.json(
      { error: "Gagal membuat PDF. Coba lagi atau gunakan print browser." },
      { status: 502 },
    );
  }
}
