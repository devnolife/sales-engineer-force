import Link from "next/link";
import { Decimal } from "decimal.js";
import { requireOrgContext } from "@/lib/org-context";
import { formatRupiah, formatTanggal } from "@/lib/format";
import { listDueReminders, STAGE_LABEL, type DealStage } from "@/modules/pipeline/service";
import { getFollowUpSignals, type FollowUpKind } from "@/modules/pipeline/follow-up";
import { displayNumber } from "@/modules/quotation/service";
import {
  displayStatus,
  STATUS_LABEL,
  type QuotationStatus,
} from "@/modules/quotation/lib/quotation-status";
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

export const metadata = { title: "Dashboard" };

function sum(values: string[]): Decimal {
  return values.reduce((acc, v) => acc.add(new Decimal(v || 0)), new Decimal(0));
}

export default async function DashboardPage() {
  const ctx = await requireOrgContext();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Scope per-role (M6): owner/admin lihat semua; sales (member) lihat miliknya.
  const salesOnly = ctx.role === "member";
  const dealScope = salesOnly ? { ownerId: ctx.userId } : {};
  const quotationScope = salesOnly ? { createdById: ctx.userId } : {};

  const [deals, quotationsThisMonth, decidedQuotations, expiringSoon, dueReminders, followUpSignals, recentQuotations] =
    await Promise.all([
      ctx.db.deal.findMany({
        where: { stage: { notIn: ["WON", "LOST"] }, ...dealScope },
        select: { stage: true, value: true },
      }),
      ctx.db.quotation.findMany({
        where: { issuedAt: { gte: startOfMonth }, ...quotationScope },
        select: { total: true },
      }),
      ctx.db.quotation.findMany({
        where: { status: { in: ["WON", "LOST"] }, ...quotationScope },
        select: { status: true },
      }),
      ctx.db.quotation.count({
        where: {
          status: "SENT",
          validUntil: { gte: now, lte: in7Days },
          ...quotationScope,
        },
      }),
      listDueReminders(ctx, 5, salesOnly ? ctx.userId : undefined),
      getFollowUpSignals(ctx, { forUserId: salesOnly ? ctx.userId : undefined }),
      ctx.db.quotation.findMany({
        where: quotationScope,
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          numberBase: true,
          revision: true,
          status: true,
          validUntil: true,
          customerName: true,
          total: true,
          quoteDate: true,
        },
      }),
    ]);

  // Pipeline aktif per stage
  const pipelineByStage = new Map<string, { count: number; value: Decimal }>();
  for (const deal of deals) {
    const entry = pipelineByStage.get(deal.stage) ?? { count: 0, value: new Decimal(0) };
    entry.count += 1;
    entry.value = entry.value.add(new Decimal(deal.value || 0));
    pipelineByStage.set(deal.stage, entry);
  }
  const totalPipeline = sum(deals.map((d) => d.value));

  const wonCount = decidedQuotations.filter((q) => q.status === "WON").length;
  const winRate =
    decidedQuotations.length > 0
      ? Math.round((wonCount / decidedQuotations.length) * 100)
      : null;

  const monthTotal = sum(quotationsThisMonth.map((q) => q.total));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          salesOnly
            ? "Ringkasan pipeline, penawaran, dan follow-up milik Anda."
            : "Ringkasan pipeline, penawaran, dan follow-up organisasi Anda."
        }
      >
        <Button asChild>
          <Link href="/app/penawaran/baru">Buat penawaran</Link>
        </Button>
      </PageHeader>

      {/* Kartu ringkasan — kartu pertama = KPI utama, dibedakan dengan latar petrol */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-0 bg-primary text-primary-foreground shadow-md">
          <CardHeader>
            <CardDescription className="text-primary-foreground/70">
              Nilai pipeline aktif
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums tracking-tight">
              {formatRupiah(totalPipeline.toFixed(0))}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-primary-foreground/70">
            {deals.length} deal berjalan (belum menang/kalah)
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Penawaran terbit bulan ini</CardDescription>
            <CardTitle className="text-3xl tabular-nums tracking-tight">
              {quotationsThisMonth.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Total nilai {formatRupiah(monthTotal.toFixed(0))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Win rate</CardDescription>
            <CardTitle className="text-3xl tabular-nums tracking-tight">
              {winRate === null ? "—" : `${winRate}%`}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {decidedQuotations.length === 0
              ? "Belum ada penawaran yang diputuskan"
              : `${wonCount} menang dari ${decidedQuotations.length} yang diputuskan`}
          </CardContent>
        </Card>
        <Card className={expiringSoon > 0 ? "border-chart-2/50" : undefined}>
          <CardHeader>
            <CardDescription>Akan kedaluwarsa ≤ 7 hari</CardDescription>
            <CardTitle className="text-3xl tabular-nums tracking-tight">
              {expiringSoon}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Penawaran terkirim yang butuh follow-up segera
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pipeline per stage */}
        <Card>
          <CardHeader>
            <CardTitle>Pipeline per tahap</CardTitle>
            <CardDescription>Deal aktif berdasarkan tahap penjualan.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {(["LEAD", "QUOTED", "NEGOTIATION"] as DealStage[]).map((stage) => {
              const entry = pipelineByStage.get(stage);
              return (
                <Link
                  key={stage}
                  href={`/app/pipeline?stage=${stage}`}
                  className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-accent"
                >
                  <span className="text-sm">{STAGE_LABEL[stage]}</span>
                  <span className="flex items-center gap-3">
                    <Badge variant="secondary">{entry?.count ?? 0} deal</Badge>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {formatRupiah((entry?.value ?? new Decimal(0)).toFixed(0))}
                    </span>
                  </span>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        {/* Follow-up jatuh tempo */}
        <Card>
          <CardHeader>
            <CardTitle>Follow-up jatuh tempo</CardTitle>
            <CardDescription>
              Reminder yang jatuh tempo hari ini atau sudah lewat.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {dueReminders.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Tidak ada follow-up tertunda. Aman.
              </p>
            ) : (
              dueReminders.map((r) => (
                <Link
                  key={r.id}
                  href={`/app/pipeline/${r.deal.id}`}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{r.deal.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.note}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-xs tabular-nums ${r.dueAt.getTime() < now.getTime()
                      ? "font-medium text-destructive"
                      : "text-muted-foreground"
                      }`}
                  >
                    {formatTanggal(r.dueAt)}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sinyal follow-up pintar — dari view tracking penawaran */}
      {followUpSignals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sinyal follow-up</CardTitle>
            <CardDescription>
              Dibaca dari aktivitas pelanggan pada tautan penawaran — prioritaskan yang panas.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {followUpSignals.map((s) => {
              const badge: Record<FollowUpKind, { label: string; variant: "default" | "secondary" | "destructive" }> = {
                HOT: { label: "🔥 Panas", variant: "default" },
                VIEWED: { label: "Dilihat", variant: "secondary" },
                STALE: { label: "Belum dibuka", variant: "destructive" },
              };
              const b = badge[s.kind];
              return (
                <Link
                  key={s.quotationId}
                  href={`/app/penawaran/${s.quotationId}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Badge variant={b.variant}>{b.label}</Badge>
                      <span className="truncate">
                        {s.nomor ? displayNumber(s.nomor, s.revision) : "(Draft)"} — {s.customerName}
                      </span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {s.hint}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {formatRupiah(s.total)}
                  </span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Penawaran terbaru */}
      <Card>
        <CardHeader>
          <CardTitle>Penawaran terbaru</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {recentQuotations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada penawaran.{" "}
              <Link href="/app/penawaran/baru" className="underline underline-offset-4">
                Buat yang pertama
              </Link>
              .
            </p>
          ) : (
            recentQuotations.map((q) => {
              const st = displayStatus(q.status as QuotationStatus, q.validUntil);
              return (
                <Link
                  key={q.id}
                  href={`/app/penawaran/${q.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {q.numberBase ? displayNumber(q.numberBase, q.revision) : "(Draft)"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {q.customerName} — {formatTanggal(q.quoteDate)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <Badge variant={st === "WON" ? "default" : "secondary"}>
                      {STATUS_LABEL[st]}
                    </Badge>
                    <span className="text-sm tabular-nums">{formatRupiah(q.total)}</span>
                  </span>
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>
    </>
  );
}
