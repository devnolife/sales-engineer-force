import Link from "next/link";
import { Eye, Plus } from "lucide-react";
import { requireOrgContext } from "@/lib/org-context";
import { formatRupiah, formatTanggal } from "@/lib/format";
import { listQuotations } from "@/modules/quotation/service";
import { displayNumber } from "@/modules/quotation/service";
import {
  displayStatus,
  STATUS_LABEL,
  type QuotationStatus,
} from "@/modules/quotation/lib/quotation-status";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { PenawaranToolbar } from "./penawaran-client";

export const metadata = { title: "Penawaran" };

const BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  SENT: "secondary",
  WON: "default",
  LOST: "destructive",
  EXPIRED: "outline",
};

export default async function PenawaranPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; status?: string; tahun?: string }>;
}) {
  const { cari, status, tahun } = await searchParams;
  const ctx = await requireOrgContext();

  const quotations = await listQuotations(ctx, {
    search: cari,
    status: status as "DRAFT" | "SENT" | "WON" | "LOST" | "EXPIRED" | undefined,
    year: tahun ? Number(tahun) : undefined,
  });

  return (
    <>
      <PageHeader
        title="Penawaran"
        description="Surat penawaran dengan penomoran otomatis, revisi, dan tautan publik."
      >
        <Button asChild>
          <Link href="/app/penawaran/baru">
            <Plus data-icon="inline-start" />
            Buat penawaran
          </Link>
        </Button>
      </PageHeader>

      <PenawaranToolbar />

      <Card>
        <CardContent>
          {quotations.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Belum ada penawaran</EmptyTitle>
                <EmptyDescription>
                  Buat penawaran pertama Anda — nomor surat terbit otomatis saat
                  diterbitkan, bukan saat draft.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead>Perihal</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Dilihat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotations.map((q) => {
                  const st = displayStatus(q.status as QuotationStatus, q.validUntil);
                  return (
                    <TableRow key={q.id}>
                      <TableCell>
                        <Link
                          href={`/app/penawaran/${q.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {q.numberBase
                            ? displayNumber(q.numberBase, q.revision)
                            : "(Draft)"}
                        </Link>
                      </TableCell>
                      <TableCell>{formatTanggal(q.issuedAt ?? q.quoteDate)}</TableCell>
                      <TableCell className="max-w-48 truncate">{q.customerName}</TableCell>
                      <TableCell className="max-w-64 truncate">{q.subject}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRupiah(q.total)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={BADGE_VARIANT[st] ?? "outline"}>
                          {STATUS_LABEL[st]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {q.viewCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Eye className="size-3.5" />
                            {q.viewCount}x
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
