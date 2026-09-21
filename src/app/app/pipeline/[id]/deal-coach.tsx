"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { coachDealAction } from "@/modules/pipeline/actions";
import type { DealCoachResult } from "@/modules/ai/deal-coach";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

/**
 * Panel AI Deal Coach: kualifikasi MEDDIC + saran negosiasi dari LLM lokal.
 * Human-in-the-loop — murni saran, tidak mengubah data apa pun.
 */
export function DealCoach({ dealId }: { dealId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<DealCoachResult | null>(null);

  function analyze() {
    startTransition(async () => {
      const r = await coachDealAction(dealId);
      if (r.ok && r.data) {
        setResult(r.data);
      } else if (!r.ok) {
        toast.error(r.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4" />
          AI Deal Coach
        </CardTitle>
        <CardDescription>
          Kualifikasi MEDDIC & saran langkah berikut — dianalisis LLM lokal.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!result && (
          <Button variant="outline" size="sm" disabled={pending} onClick={analyze}>
            {pending ? (
              <>
                <Spinner data-icon="inline-start" />
                Menganalisis…
              </>
            ) : (
              "Analisis deal ini"
            )}
          </Button>
        )}

        {result && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Skor MEDDIC</span>
              <Badge
                variant={
                  result.meddicScore >= 8
                    ? "default"
                    : result.meddicScore >= 4
                      ? "secondary"
                      : "destructive"
                }
              >
                {result.meddicScore}/12
              </Badge>
            </div>

            <p className="text-sm">{result.summary}</p>

            {result.qualification.length > 0 && (
              <div className="flex flex-col gap-1">
                {result.qualification.map((q) => (
                  <div key={q.dimension} className="flex items-start gap-2 text-xs">
                    <Badge variant={q.score >= 2 ? "default" : q.score === 1 ? "secondary" : "outline"}>
                      {q.score}
                    </Badge>
                    <span>
                      <span className="font-medium">{q.dimension}</span>
                      {" — "}
                      <span className="text-muted-foreground">{q.note}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {result.risks.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-destructive">Risiko</p>
                <ul className="list-disc pl-4 text-xs text-muted-foreground">
                  {result.risks.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.negotiationTips && result.negotiationTips.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium">Saran negosiasi</p>
                <ul className="list-disc pl-4 text-xs text-muted-foreground">
                  {result.negotiationTips.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.nextActions.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium">Langkah berikut</p>
                <ol className="list-decimal pl-4 text-xs">
                  {result.nextActions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ol>
              </div>
            )}

            <Button variant="ghost" size="sm" disabled={pending} onClick={analyze}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Analisis ulang
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
