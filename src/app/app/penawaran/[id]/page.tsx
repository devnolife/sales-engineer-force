import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireOrgContext } from "@/lib/org-context";
import { formatTanggalWaktu } from "@/lib/format";
import { getOrgSettings } from "@/modules/org/service";
import { toDocumentProps } from "@/modules/quotation/document-data";
import {
  displayStatus,
  isEditable,
  STATUS_LABEL,
  type QuotationStatus,
} from "@/modules/quotation/lib/quotation-status";
import { withRevision } from "@/modules/quotation/lib/quotation-number";
import { getQuotation } from "@/modules/quotation/service";
import { PageHeader } from "@/components/page-header";
import { QuotationDocument } from "@/components/quotations/quotation-document";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { QuotationActions } from "./quotation-actions";

export const metadata = { title: "Detail Penawaran" };

const BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  SENT: "secondary",
  WON: "default",
  LOST: "destructive",
  EXPIRED: "outline",
};

export default async function PenawaranDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  const quotation = await getQuotation(ctx, id);
  if (!quotation) notFound();

  const [settings, organization] = await Promise.all([
    getOrgSettings(ctx),
    prisma.organization.findUniqueOrThrow({
      where: { id: ctx.orgId },
      select: { name: true, logo: true },
    }),
  ]);

  const docProps = toDocumentProps(quotation, {
    name: organization.name,
    address: settings.address,
    npwp: settings.npwp,
    phone: settings.phone,
    email: settings.email,
    logo: organization.logo,
    bankName: settings.bankName,
    bankAccount: settings.bankAccount,
    bankBranch: settings.bankBranch,
    bankHolder: settings.bankHolder,
    signerName: settings.signerName,
    signerTitle: settings.signerTitle,
  });

  const st = displayStatus(quotation.status as QuotationStatus, quotation.validUntil);
  const nomor = quotation.numberBase
    ? withRevision(quotation.numberBase, quotation.revision)
    : "Draft — belum bernomor";

  const supersededByRevision = quotation.revisions.some((r) => r.status !== "DRAFT");

  return (
    <>
      <div className="no-print">
        <PageHeader title={nomor} description={quotation.subject}>
          <Badge variant={BADGE_VARIANT[st] ?? "outline"}>{STATUS_LABEL[st]}</Badge>
        </PageHeader>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <QuotationDocument {...docProps} />
        </div>

        <div className="flex flex-col gap-4 no-print">
          <QuotationActions
            quotation={{
              id: quotation.id,
              status: quotation.status as QuotationStatus,
              editable: isEditable(quotation.status as QuotationStatus),
              publicToken: quotation.publicToken,
              customerName: quotation.customerName,
              nomor,
              total: quotation.total,
              supersededByRevision,
            }}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Info</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {quotation.deal && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Deal</span>
                  <Link
                    href={`/app/pipeline/${quotation.deal.id}`}
                    className="truncate underline-offset-4 hover:underline"
                  >
                    {quotation.deal.title}
                  </Link>
                </div>
              )}
              {quotation.customer && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Pelanggan</span>
                  <span className="truncate">{quotation.customer.name}</span>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Dibuka pelanggan</span>
                <span>
                  {quotation.viewCount > 0
                    ? `${quotation.viewCount}x (pertama ${formatTanggalWaktu(quotation.firstViewedAt)})`
                    : "Belum"}
                </span>
              </div>
            </CardContent>
          </Card>

          {(quotation.parent || quotation.revisions.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Rantai Revisi</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                {quotation.parent && (
                  <Link
                    href={`/app/penawaran/${quotation.parent.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    Induk:{" "}
                    {quotation.parent.numberBase
                      ? withRevision(quotation.parent.numberBase, quotation.parent.revision)
                      : "(draft)"}
                  </Link>
                )}
                {quotation.revisions.map((r) => (
                  <Link
                    key={r.id}
                    href={`/app/penawaran/${r.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {r.numberBase
                      ? withRevision(r.numberBase, r.revision)
                      : `Draft revisi ${r.revision > 0 ? `Rev.${r.revision}` : "(nomor baru)"}`}
                    {" — "}
                    {STATUS_LABEL[r.status as QuotationStatus]}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
