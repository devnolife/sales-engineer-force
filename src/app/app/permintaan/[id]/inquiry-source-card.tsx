"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { perbaruiTeksPermintaanAction } from "@/modules/inquiry/actions";
import { documentProviderLabel } from "@/modules/inquiry/presentation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

export function InquirySourceCard({
  inquiryId, rawText, ocrProvider, ocrPages, readOnly,
}: {
  inquiryId: string;
  rawText: string | null;
  ocrProvider: string | null;
  ocrPages: number | null;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(rawText ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Teks sumber permintaan</CardTitle>
        <CardDescription>
          {ocrProvider ? documentProviderLabel(ocrProvider) : "Teks permintaan"}
          {ocrPages ? ` · ${ocrPages} halaman` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Field>
          <FieldLabel htmlFor="inquiry-source-text">Teks untuk ekstraksi item</FieldLabel>
          {!rawText && (
            <p className="text-sm text-muted-foreground">
              Teks belum tersedia. Tempel isi dokumen di bawah untuk melanjutkan.
            </p>
          )}
          <Textarea
            id="inquiry-source-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={20000}
            rows={12}
            readOnly={readOnly}
            disabled={pending}
            className="font-mono text-xs"
          />
          <FieldDescription>
            {readOnly
              ? "Teks terkunci karena permintaan sudah menjadi penawaran."
              : "Periksa nama barang, qty, satuan, dan spesifikasi. Maksimal 20.000 karakter; dokumen asli tidak berubah. Simpan koreksi, lalu pilih Ekstrak ulang."}
          </FieldDescription>
          {!readOnly && (
            <Button
              variant="outline"
              disabled={pending || text.trim().length < 10 || text === (rawText ?? "")}
              onClick={() => startTransition(async () => {
                const result = await perbaruiTeksPermintaanAction(inquiryId, text);
                if (result.ok) {
                  toast.success("Teks disimpan. Jalankan Ekstrak ulang untuk memperbarui item.");
                  router.refresh();
                } else {
                  toast.error(result.error);
                }
              })}
            >
              {pending && <Spinner data-icon="inline-start" />}
              Simpan teks
            </Button>
          )}
        </Field>
      </CardContent>
    </Card>
  );
}
