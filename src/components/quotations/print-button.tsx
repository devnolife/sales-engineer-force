"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Cetak / unduh PDF lewat print browser (kerangka; Gotenberg menyusul). */
export function PrintButton() {
  return (
    <Button variant="outline" onClick={() => window.print()} className="no-print">
      <Printer data-icon="inline-start" />
      Unduh PDF
    </Button>
  );
}
