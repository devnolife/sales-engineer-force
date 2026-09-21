"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ScanSearch, Search } from "lucide-react";
import { ambilDetailTokoAction, cariVendorAction } from "@/modules/sourcing/actions";
import type { SearchActionResult, SearchData, SourceError } from "@/modules/sourcing/types";
import { formatCurrency, formatTanggalWaktu } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ResultsProps {
  data: SearchData;
  detailPendingId: string | null;
  disabled: boolean;
  detailErrors: Record<string, SourceError>;
  onDetail: (resultId: string) => void;
}

function errorText(error: SourceError): string {
  return `${error.message}${error.retryAfterSeconds ? ` Coba lagi dalam ${error.retryAfterSeconds} detik.` : ""}`;
}

function connectionError(error: unknown): SourceError {
  console.error("Aksi sourcing tidak selesai.", { errorName: error instanceof Error ? error.name : "unknown" });
  return {
    code: "PROVIDER_UNAVAILABLE",
    message: "Hasil belum dapat dikonfirmasi. Periksa koneksi atau muat ulang halaman, lalu coba lagi.",
  };
}

export function VendorSearchResults({
  data, detailPendingId, disabled, detailErrors, onDetail,
}: ResultsProps) {
  const labels = {
    pending: "Belum diambil", available: "Harga tidak valid",
    unavailable: "Harga belum tersedia", ambiguous: "Perlu review",
  };
  return (
    <div className="max-h-[55vh] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sumber / produk</TableHead>
            <TableHead className="text-right">Harga indikatif</TableHead>
            <TableHead className="text-right">Saran jual IDR</TableHead>
            <TableHead>Detail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.results.map((result) => (
            <TableRow key={result.id}>
              <TableCell className="min-w-56 max-w-80 whitespace-normal align-top">
                <div className="grid gap-1">
                  <Badge variant={result.sourceType === "INTERNAL" ? "secondary" : "outline"}>
                    {result.sourceType === "INTERNAL" ? "Internal" : result.sourceType === "WEB" ? "Web" : "Contoh (mock)"}
                  </Badge>
                  <span className="font-medium">{result.productName}</span>
                  {result.sourceUrl ? (
                    <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer"
                      className="break-all text-sm underline underline-offset-4">
                      {result.vendorName}
                    </a>
                  ) : <span>{result.vendorName}</span>}
                  <span className="text-xs text-muted-foreground">{result.sourceLabel}</span>
                  {result.brand && <span className="text-xs">{result.brand}</span>}
                  {(result.city || result.contact) && (
                    <span className="break-words text-xs text-muted-foreground">
                      {[result.city, result.contact].filter(Boolean).join(" | ")}
                    </span>
                  )}
                  {result.retrievedAt && (
                    <time dateTime={result.retrievedAt} className="text-xs text-muted-foreground">
                      Diamati {formatTanggalWaktu(result.retrievedAt)}
                    </time>
                  )}
                  {result.evidence && (
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer">Bukti harga</summary>
                      <p>{result.evidence.productTitle ?? result.productName}</p>
                      {result.evidence.variantTitle && <p>Varian: {result.evidence.variantTitle}</p>}
                      {result.evidence.variantId && <p>ID varian: {result.evidence.variantId}</p>}
                      {result.evidence.rawPriceText && <p>Teks sumber: {result.evidence.rawPriceText}</p>}
                    </details>
                  )}
                </div>
              </TableCell>
              <TableCell className="min-w-44 whitespace-normal text-right align-top tabular-nums">
                {result.priceStatus === "available" && result.price && result.currency
                  ? formatCurrency(result.price, result.currency)
                  : <span className="text-muted-foreground">{labels[result.priceStatus]}</span>}
                <div className="mt-1 text-xs text-muted-foreground">
                  {result.unit ? `per ${result.unit}` : "Satuan belum diketahui"}
                </div>
              </TableCell>
              <TableCell className="min-w-36 text-right align-top tabular-nums">
                {result.suggestedPrice && result.currency === "IDR" ? (
                  <>
                    <div className="font-medium">{formatCurrency(result.suggestedPrice, "IDR")}</div>
                    <div className="text-xs text-muted-foreground">
                      Margin +{result.marginPercent ?? data.marginPercent}%
                    </div>
                  </>
                ) : <span className="text-xs text-muted-foreground">
                  {result.currency && result.currency !== "IDR" ? "Tanpa FX / margin" : "-"}
                </span>}
              </TableCell>
              <TableCell className="min-w-44 max-w-64 whitespace-normal align-top">
                {result.sourceType === "WEB" && (
                  <Button type="button" variant="outline" size="sm" disabled={disabled}
                    onClick={() => onDetail(result.id)}>
                    {detailPendingId === result.id
                      ? <Spinner data-icon="inline-start" />
                      : <ScanSearch data-icon="inline-start" />}
                    {result.priceStatus === "pending" ? "Ambil detail" : "Perbarui detail"}
                  </Button>
                )}
                {result.note && <p className="mt-2 text-xs text-muted-foreground">{result.note}</p>}
                {detailErrors[result.id] && (
                  <p role="alert" className="mt-2 text-xs text-destructive">
                    Pembaruan gagal. {errorText(detailErrors[result.id])}
                    {result.priceStatus === "available" && " Harga lama belum diperbarui."}
                  </p>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function VendorSearchPanel({
  defaultQuery = "",
  inquiryItemId,
}: {
  defaultQuery?: string;
  inquiryItemId?: string;
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [outcome, setOutcome] = useState<SearchActionResult | null>(null);
  const [detailErrors, setDetailErrors] = useState<Record<string, SourceError>>({});
  const [detailPendingId, setDetailPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);

  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const current = ++generation.current;
    const term = query.trim();
    setSubmittedQuery(term);
    setOutcome(null);
    setDetailErrors({});
    if (term.length < 3 || term.length > 500) {
      setOutcome({
        status: "error",
        error: { code: "INVALID_INPUT", message: "Kata kunci harus berisi 3-500 karakter." },
      });
      return;
    }
    busy.current = true;
    startTransition(async () => {
      try {
        const result = await cariVendorAction(term, inquiryItemId);
        if (generation.current === current) setOutcome(result);
      } catch (error) {
        if (generation.current === current) setOutcome({ status: "error", error: connectionError(error) });
      } finally {
        busy.current = false;
      }
    });
  }

  function detail(resultId: string) {
    if (busy.current || !outcome || outcome.status === "error") return;
    const searchId = outcome.data.searchId;
    const current = ++generation.current;
    busy.current = true;
    setDetailPendingId(resultId);
    setDetailErrors((previous) => {
      const next = { ...previous };
      delete next[resultId];
      return next;
    });
    startTransition(async () => {
      try {
        const result = await ambilDetailTokoAction({ searchId, resultId });
        if (generation.current !== current) return;
        if (result.status === "error") {
          setDetailErrors((previous) => ({ ...previous, [resultId]: result.error }));
          return;
        }
        setOutcome((previous) => {
          if (!previous || previous.status === "error" || previous.data.searchId !== searchId) return previous;
          return {
            ...previous,
            data: {
              ...previous.data,
              results: previous.data.results.map((item) => item.id === resultId ? result.result : item),
            },
          };
        });
      } catch (error) {
        if (generation.current === current) {
          setDetailErrors((previous) => ({ ...previous, [resultId]: connectionError(error) }));
        }
      } finally {
        busy.current = false;
        if (generation.current === current) setDetailPendingId(null);
      }
    });
  }

  const data = outcome && outcome.status !== "error" ? outcome.data : undefined;
  const hasMock = data?.provider === "mock" || data?.results.some((result) => result.sourceType === "WEB_MOCK");
  return (
    <div className="grid gap-3">
      <form onSubmit={search} className="flex items-center gap-2">
        <Input name="q" value={query} onChange={(event) => setQuery(event.target.value)}
          disabled={pending} minLength={3} maxLength={500} required
          placeholder="mis. pompa dosing 5 LPH" aria-label="Kata kunci pencarian vendor" />
        <Button type="submit" disabled={pending || query.trim().length < 3}>
          {pending && !detailPendingId ? <Spinner data-icon="inline-start" /> : <Search data-icon="inline-start" />}
          Cari
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Maksimal 5 kandidat web. Harga hanya dibaca setelah Anda memilih &quot;Ambil detail&quot;.
      </p>
      <div aria-live="polite" className="grid gap-3">
        {submittedQuery && <p className="text-sm">Hasil untuk: <strong>{submittedQuery}</strong></p>}
        {outcome && outcome.status !== "complete" && (
          <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
            {outcome.status === "partial" && "Pencarian web belum berhasil; hasil internal tetap ditampilkan. "}
            {errorText(outcome.error)}
          </p>
        )}
        {hasMock && (
          <p role="note" className="rounded-md border p-3 text-sm">
            Mode demo: hasil web berlabel Contoh (mock) adalah data sintetis, bukan harga nyata.
          </p>
        )}
        {data && (data.results.length > 0
          ? <VendorSearchResults data={data} detailPendingId={detailPendingId}
            disabled={pending} detailErrors={detailErrors} onDetail={detail} />
          : <p className="text-sm text-muted-foreground">
            {outcome?.status === "partial" ? "Belum ada hasil yang dapat ditampilkan." : "Tidak ada hasil untuk kata kunci ini."}
          </p>)}
      </div>
      <p className="text-xs text-muted-foreground">
        Harga bersifat indikatif. Cocokkan varian, satuan, stok, pajak dan ongkir dengan sumber.
        Nama situs bukan verifikasi identitas pemasok. Tidak ada harga yang diterapkan otomatis ke penawaran.
      </p>
    </div>
  );
}
