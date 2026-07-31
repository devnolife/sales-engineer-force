import Link from "next/link";
import { Decimal } from "decimal.js";
import { requireOrgContext } from "@/lib/org-context";
import { formatRupiah, formatTanggal } from "@/lib/format";
import {
  DEAL_STAGES,
  listDeals,
  STAGE_LABEL,
  type DealStage,
} from "@/modules/pipeline/service";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { BuatDealDialog, PipelineToolbar } from "./pipeline-client";

export const metadata = { title: "Pipeline" };

function stageBadgeVariant(stage: DealStage): "default" | "secondary" | "destructive" {
  if (stage === "WON") return "default";
  if (stage === "LOST") return "destructive";
  return "secondary";
}

function stageHref(stage: DealStage, cari?: string): string {
  const params = new URLSearchParams();
  params.set("stage", stage);
  if (cari) params.set("cari", cari);
  return `/app/pipeline?${params.toString()}`;
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; cari?: string }>;
}) {
  const { stage, cari } = await searchParams;
  const ctx = await requireOrgContext();
  const activeStage = DEAL_STAGES.find((s) => s === stage);

  const [deals, semuaDeal, customers] = await Promise.all([
    listDeals(ctx, { stage: activeStage, search: cari }),
    ctx.db.deal.findMany({ select: { stage: true, value: true } }),
    ctx.db.customer.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
  ]);

  const now = new Date();
  const summary = DEAL_STAGES.map((s) => {
    const rows = semuaDeal.filter((d) => d.stage === s);
    return {
      stage: s,
      count: rows.length,
      total: rows.reduce((acc, d) => acc.plus(d.value || "0"), new Decimal(0)),
    };
  });

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Deal dari lead sampai menang — nilai, aktivitas, dan reminder follow-up."
      >
        <BuatDealDialog customers={customers} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {summary.map((s) => (
          <Link key={s.stage} href={stageHref(s.stage, cari)} className="min-w-0">
            <Card
              size="sm"
              className={cn(
                "h-full transition-colors hover:bg-muted/50",
                activeStage === s.stage && "border-primary ring-primary",
              )}
            >
              <CardHeader>
                <CardDescription>{STAGE_LABEL[s.stage]}</CardDescription>
                <CardTitle>{s.count}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {formatRupiah(s.total)}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <PipelineToolbar />

      <Card>
        <CardContent>
          {deals.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Belum ada deal</EmptyTitle>
                <EmptyDescription>
                  Deal dibuat otomatis saat penawaran terbit, atau buat manual.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deal</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Nilai</TableHead>
                  <TableHead className="text-right">Penawaran</TableHead>
                  <TableHead>Follow-up berikutnya</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.map((d) => {
                  const next = d.reminders[0];
                  const overdue = next ? next.dueAt.getTime() < now.getTime() : false;
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="max-w-72">
                        <div className="grid gap-0.5">
                          <Link
                            href={`/app/pipeline/${d.id}`}
                            className="truncate font-medium underline-offset-4 hover:underline"
                          >
                            {d.title}
                          </Link>
                          <span className="truncate text-xs text-muted-foreground">
                            {d.customer.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={stageBadgeVariant(d.stage as DealStage)}>
                          {STAGE_LABEL[d.stage as DealStage]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRupiah(d.value)}
                      </TableCell>
                      <TableCell className="text-right">
                        {d._count.quotations}
                      </TableCell>
                      <TableCell>
                        {next ? (
                          <span className={overdue ? "text-destructive" : undefined}>
                            {formatTanggal(next.dueAt)}
                          </span>
                        ) : (
                          "-"
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
