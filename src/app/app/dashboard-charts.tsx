"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatRupiah } from "@/lib/format";

/** Grafik dashboard (client) — data dihitung server-side, hanya render di sini. */

export interface MonthlyPoint {
  label: string; // "Mar", "Apr", ...
  total: number; // nilai penawaran terbit (juta tidak — angka penuh)
  count: number;
}

export function MonthlyTrendChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(v: number) =>
            v >= 1_000_000_000
              ? `${(v / 1_000_000_000).toFixed(1)}M`
              : v >= 1_000_000
                ? `${Math.round(v / 1_000_000)}jt`
                : String(v)
          }
        />
        <Tooltip
          cursor={{ fill: "var(--accent)" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0]!.payload as MonthlyPoint;
            return (
              <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                <p className="font-medium">{label}</p>
                <p className="tabular-nums">{formatRupiah(String(p.total))}</p>
                <p className="text-muted-foreground">{p.count} penawaran terbit</p>
              </div>
            );
          }}
        />
        <Bar dataKey="total" radius={[6, 6, 0, 0]} fill="var(--chart-1)" maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface FunnelPoint {
  label: string;
  count: number;
  value: number;
}

const FUNNEL_COLORS = ["var(--chart-3)", "var(--chart-1)", "var(--chart-2)"];

export function PipelineFunnelChart({ data }: { data: FunnelPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
      >
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={130}
          tick={{ fontSize: 12, fill: "var(--foreground)" }}
        />
        <Tooltip
          cursor={{ fill: "var(--accent)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0]!.payload as FunnelPoint;
            return (
              <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                <p className="font-medium">{p.label}</p>
                <p>{p.count} deal</p>
                <p className="tabular-nums text-muted-foreground">
                  {formatRupiah(String(p.value))}
                </p>
              </div>
            );
          }}
        />
        <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={28}>
          {data.map((_, i) => (
            <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
