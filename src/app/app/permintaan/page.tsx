import Link from "next/link";
import { requireOrgContext } from "@/lib/org-context";
import { formatTanggalWaktu } from "@/lib/format";
import {
  INQUIRY_STATUS_LABEL,
  listInquiries,
  type InquiryStatus,
} from "@/modules/inquiry/service";
import { withRevision } from "@/modules/quotation/lib/quotation-number";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PermintaanBaruDialog, PermintaanStatusFilter } from "./permintaan-client";

export const metadata = { title: "Permintaan" };

const STATUS_BADGE: Record<InquiryStatus, "default" | "secondary" | "outline"> = {
  NEW: "outline",
  EXTRACTED: "secondary",
  REVIEWED: "secondary",
  QUOTED: "default",
  ARCHIVED: "outline",
};

export default async function PermintaanPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const ctx = await requireOrgContext();
  const inquiries = await listInquiries(ctx, {
    status: status as InquiryStatus | undefined,
  });

  return (
    <>
      <PageHeader
        title="Permintaan Masuk"
        description="Upload atau tempel permintaan pelanggan — sistem mengekstrak daftar barang (mock AI), lalu Anda review dan jadikan penawaran."
      >
        <PermintaanBaruDialog />
      </PageHeader>

      <PermintaanStatusFilter />

      <Card>
        <CardContent>
          {inquiries.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Belum ada permintaan</EmptyTitle>
                <EmptyDescription>
                  Coba alur end-to-end: tempel teks permintaan berisi daftar barang,
                  sistem ekstrak otomatis, cocokkan ke katalog, lalu jadikan draft
                  penawaran.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sumber</TableHead>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead className="text-right">Item</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Penawaran</TableHead>
                  <TableHead>Masuk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inquiries.map((inq) => (
                  <TableRow key={inq.id}>
                    <TableCell>
                      <Link
                        href={`/app/permintaan/${inq.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {inq.fileName ?? "Teks permintaan"}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {inq.source === "UPLOAD" ? "Upload file" : "Tempel teks"}
                      </p>
                    </TableCell>
                    <TableCell>{inq.customerName ?? "-"}</TableCell>
                    <TableCell className="text-right">{inq._count.items}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[inq.status as InquiryStatus] ?? "outline"}>
                        {INQUIRY_STATUS_LABEL[inq.status as InquiryStatus] ?? inq.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {inq.quotation ? (
                        <Link
                          href={`/app/penawaran/${inq.quotation.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {inq.quotation.numberBase
                            ? withRevision(inq.quotation.numberBase, inq.quotation.revision)
                            : "(Draft)"}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>{formatTanggalWaktu(inq.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
