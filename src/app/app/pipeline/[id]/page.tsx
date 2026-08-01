import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { requireOrgContext } from "@/lib/org-context";
import { formatRupiah, formatTanggal, formatTanggalWaktu } from "@/lib/format";
import {
  ACTIVITY_LABEL,
  getDeal,
  STAGE_LABEL,
  type ActivityType,
  type DealStage,
} from "@/modules/pipeline/service";
import { withRevision } from "@/modules/quotation/lib/quotation-number";
import {
  STATUS_LABEL,
  type QuotationStatus,
} from "@/modules/quotation/lib/quotation-status";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ReminderList, StageSelect, TambahAktivitasForm } from "./deal-client";
import { DealCoach } from "./deal-coach";

export const metadata = { title: "Detail Deal" };

const QUOTATION_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  SENT: "secondary",
  WON: "default",
  LOST: "destructive",
};

function stageBadgeVariant(stage: DealStage): "default" | "secondary" | "destructive" {
  if (stage === "WON") return "default";
  if (stage === "LOST") return "destructive";
  return "secondary";
}

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  const deal = await getDeal(ctx, id);
  if (!deal) notFound();

  const stage = deal.stage as DealStage;
  const firstContact = deal.customer.contacts[0];
  const description =
    deal.customer.name +
    (deal.lostReason ? ` — Alasan kalah: ${deal.lostReason}` : "");

  return (
    <>
      <PageHeader title={deal.title} description={description}>
        <StageSelect dealId={deal.id} stage={stage} />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Penawaran</CardTitle>
              <CardAction>
                <Button asChild size="sm" variant="outline">
                  <Link href="/app/penawaran/baru">
                    <Plus data-icon="inline-start" />
                    Buat penawaran
                  </Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-2">
              {deal.quotations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada penawaran untuk deal ini.
                </p>
              ) : (
                deal.quotations.map((q) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                  >
                    <div className="grid gap-0.5">
                      <Link
                        href={`/app/penawaran/${q.id}`}
                        className="truncate font-medium underline-offset-4 hover:underline"
                      >
                        {q.numberBase
                          ? withRevision(q.numberBase, q.revision)
                          : "(Draft)"}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {formatTanggal(q.issuedAt ?? q.quoteDate)}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={QUOTATION_BADGE[q.status] ?? "outline"}>
                        {STATUS_LABEL[q.status as QuotationStatus]}
                      </Badge>
                      <span className="text-sm tabular-nums">
                        {formatRupiah(q.total)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Aktivitas</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <TambahAktivitasForm dealId={deal.id} />
              {deal.activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada aktivitas tercatat.
                </p>
              ) : (
                <div className="grid gap-2">
                  {deal.activities.map((a) => (
                    <div key={a.id} className="grid gap-1 rounded-lg border px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="secondary">
                          {ACTIVITY_LABEL[a.type as ActivityType]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatTanggalWaktu(a.happenedAt)}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{a.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Info</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Nilai</span>
                <span className="font-medium tabular-nums">
                  {formatRupiah(deal.value)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Stage</span>
                <Badge variant={stageBadgeVariant(stage)}>{STAGE_LABEL[stage]}</Badge>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Pelanggan</span>
                <span className="grid gap-0.5 text-right">
                  <span className="truncate">{deal.customer.name}</span>
                  {firstContact?.phone && (
                    <span className="text-xs text-muted-foreground">
                      {firstContact.name} · {firstContact.phone}
                    </span>
                  )}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Dibuat</span>
                <span>{formatTanggal(deal.createdAt)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Reminder Follow-up</CardTitle>
            </CardHeader>
            <CardContent>
              <ReminderList
                dealId={deal.id}
                reminders={deal.reminders.map((r) => ({
                  id: r.id,
                  note: r.note,
                  dueAt: r.dueAt.toISOString(),
                  done: r.done,
                }))}
              />
            </CardContent>
          </Card>

          <DealCoach dealId={deal.id} />
        </div>
      </div>
    </>
  );
}
