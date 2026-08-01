"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Unduh PDF: pakai PDF server (Gotenberg) jika tersedia (pdfHref),
 * fallback ke print browser jika nonaktif/gagal.
 */
export function PrintButton({ pdfHref }: { pdfHref?: string }) {
  const [busy, setBusy] = useState(false);

  async function unduh() {
    if (!pdfHref) {
      window.print();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(pdfHref);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = match?.[1] ?? "penawaran.pdf";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.info("PDF server tidak tersedia — membuka print browser.");
      window.print();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" onClick={unduh} disabled={busy} className="no-print">
      {busy ? <Spinner data-icon="inline-start" /> : <Printer data-icon="inline-start" />}
      Unduh PDF
    </Button>
  );
}
