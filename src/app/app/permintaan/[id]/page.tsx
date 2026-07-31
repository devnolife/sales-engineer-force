import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/lib/org-context";
import { formatTanggalWaktu } from "@/lib/format";
import {
  getInquiry,
  INQUIRY_STATUS_LABEL,
  type InquiryStatus,
} from "@/modules/inquiry/service";
import { withRevision } from "@/modules/quotation/lib/quotation-number";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InquiryHeaderActions,
  InquiryItemRow,
  PilihPelangganCard,
} from "./permintaan-detail-client";

export const metadata = { title: "Review Permintaan" };

export default async function PermintaanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  const inquiry = await getInquiry(ctx, id);
  if (!inquiry) notFound();

  const [customers, products] = await Promise.all([
    ctx.db.customer.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
    ctx.db.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true, brand: true, defaultPrice: true, unit: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
  ]);

  const status = inquiry.status as InquiryStatus;

  return (
    <>
      <PageHeader
        title={inquiry.fileName ?? "Permintaan teks"}
        description={`Masuk ${formatTanggalWaktu(inquiry.createdAt)}${
          inquiry.extractedAt
            ? ` — diekstrak ${formatTanggalWaktu(inquiry.extractedAt)} (provider mock)`
            : ""
        }`}
      >
        <Badge variant={status === "QUOTED" ? "default" : "secondary"}>
          {INQUIRY_STATUS_LABEL[status]}
        </Badge>
        <InquiryHeaderActions
          inquiryId={inquiry.id}
          hasItems={inquiry.items.length > 0}
          quotationId={inquiry.quotation?.id ?? null}
        />
      </PageHeader>

      {inquiry.quotation && (
        <Card>
          <CardContent className="flex items-center justify-between gap-4">
            <p className="text-sm">
              Permintaan ini sudah dikonversi menjadi penawaran{" "}
              <span className="font-medium">
                {inquiry.quotation.numberBase
                  ? withRevision(inquiry.quotation.numberBase, inquiry.quotation.revision)
                  : "(draft)"}
              </span>
              .
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/penawaran/${inquiry.quotation.id}`}>Buka penawaran</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Item hasil ekstraksi</CardTitle>
              <CardDescription>
                Review tiap baris: perbaiki nama/qty, cocokkan ke katalog, atau cari
                vendor untuk barang yang tidak Anda stok. Semua hasil AI (mock) wajib
                direview manusia sebelum jadi penawaran.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {inquiry.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada item. Jalankan ekstraksi lewat tombol di kanan atas.
                </p>
              ) : (
                inquiry.items.map((item) => (
                  <InquiryItemRow
                    key={item.id}
                    inquiryId={inquiry.id}
                    item={{
                      id: item.id,
                      lineNo: item.lineNo,
                      rawText: item.rawText,
                      name: item.name,
                      qty: item.qty,
                      unit: item.unit ?? "",
                      spec: item.spec ?? "",
                      matchedProductId: item.matchedProductId,
                      matchStatus: item.matchStatus as
                        | "MATCHED"
                        | "SUGGESTED"
                        | "UNMATCHED",
                      matchScore: item.matchScore,
                    }}
                    products={products.map((p) => ({
                      id: p.id,
                      name: p.name,
                      brand: p.brand ?? "",
                      defaultPrice: p.defaultPrice ?? "",
                      unit: p.unit,
                    }))}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <PilihPelangganCard
            inquiryId={inquiry.id}
            customers={customers}
            currentCustomerId={inquiry.customerId}
            currentCustomerName={inquiry.customerName}
          />

          {inquiry.rawText && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Teks asli permintaan</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                  {inquiry.rawText}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
