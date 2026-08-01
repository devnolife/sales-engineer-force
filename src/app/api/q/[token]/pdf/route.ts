import { NextResponse } from "next/server";
import { generateQuotationPdf, isPdfEnabled } from "@/modules/pdf/service";
import { withRevision } from "@/modules/quotation/lib/quotation-number";
import { getPublicQuotation } from "@/modules/quotation/service";

/** Unduh PDF penawaran dari halaman publik (akses via token, tanpa auth). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isPdfEnabled()) {
    return NextResponse.json(
      { error: "PDF server nonaktif. Gunakan print browser." },
      { status: 503 },
    );
  }

  const { token } = await params;
  const quotation = await getPublicQuotation(token);
  if (!quotation) {
    return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });
  }

  try {
    // Halaman publik hanya menampilkan dokumen terbit -> selalu cacheable.
    const pdf = await generateQuotationPdf({
      quotationId: quotation.id,
      revision: quotation.revision,
      issued: true,
    });

    const nomor = quotation.numberBase
      ? withRevision(quotation.numberBase, quotation.revision)
      : "penawaran";
    const filename = `Penawaran-${nomor.replace(/[^a-zA-Z0-9.-]+/g, "_")}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("Gagal membuat PDF publik:", e);
    return NextResponse.json(
      { error: "Gagal membuat PDF. Coba lagi atau gunakan print browser." },
      { status: 502 },
    );
  }
}
