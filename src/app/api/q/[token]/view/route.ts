import { NextResponse } from "next/server";
import { recordPublicView } from "@/modules/quotation/service";

/**
 * Tracking kunjungan halaman publik — TANPA auth (dipanggil halaman pelanggan).
 * Selalu balas sukses: kegagalan tracking tidak boleh memblokir pelanggan.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  await recordPublicView(token);
  return NextResponse.json({ success: true });
}
