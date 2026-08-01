"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Copy,
  FileEdit,
  GitBranchPlus,
  MessageCircle,
  Printer,
  Send,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { toWaNumber } from "@/lib/format";
import {
  hapusPenawaranAction,
  revisiPenawaranAction,
  setStatusPenawaranAction,
  terbitkanPenawaranAction,
} from "@/modules/quotation/actions";
import type { QuotationStatus } from "@/modules/quotation/lib/quotation-status";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { EmailDialog } from "./email-dialog";

interface QuotationActionsData {
  id: string;
  status: QuotationStatus;
  editable: boolean;
  publicToken: string | null;
  customerName: string;
  nomor: string;
  total: string;
  supersededByRevision: boolean;
  pdfEnabled: boolean;
}

export function QuotationActions({ quotation }: { quotation: QuotationActionsData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);

  const publicUrl =
    quotation.publicToken && typeof window !== "undefined"
      ? `${window.location.origin}/q/${quotation.publicToken}`
      : null;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, successMsg: string) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(successMsg);
        router.refresh();
      } else {
        toast.error(result.error ?? "Gagal.");
      }
    });
  }

  async function unduhPdf() {
    if (!quotation.pdfEnabled) {
      window.print();
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/penawaran/${quotation.id}/pdf`);
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
      }
    });
  }

  async function copyLink() {
    if (!quotation.publicToken) return;
    await navigator.clipboard.writeText(
      `${window.location.origin}/q/${quotation.publicToken}`,
    );
    toast.success("Tautan publik disalin.");
  }

  function kirimWa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nomorWa = toWaNumber(String(fd.get("wa")));
    const pesan = [
      `Yth. ${quotation.customerName},`,
      "",
      `Berikut kami sampaikan ${quotation.nomor}.`,
      publicUrl ? `Dokumen dapat dilihat di: ${publicUrl}` : "",
      "",
      "Terima kasih.",
    ]
      .filter(Boolean)
      .join("\n");
    window.open(
      `https://wa.me/${nomorWa}?text=${encodeURIComponent(pesan)}`,
      "_blank",
      "noopener",
    );
    setWaOpen(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Aksi</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {quotation.editable && (
          <>
            <Button
              disabled={pending}
              onClick={() =>
                run(() => terbitkanPenawaranAction(quotation.id), "Penawaran diterbitkan.")
              }
            >
              {pending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Send data-icon="inline-start" />
              )}
              Terbitkan (ambil nomor)
            </Button>
            <Button asChild variant="outline">
              <Link href={`/app/penawaran/${quotation.id}/edit`}>
                <FileEdit data-icon="inline-start" />
                Edit draft
              </Link>
            </Button>
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 data-icon="inline-start" />
              Hapus draft
            </Button>
          </>
        )}

        {!quotation.editable && (
          <>
            <Button variant="outline" disabled={pending} onClick={unduhPdf}>
              <Printer data-icon="inline-start" />
              Unduh PDF
            </Button>
            {quotation.publicToken && (
              <>
                <EmailDialog
                  quotationId={quotation.id}
                  pdfEnabled={quotation.pdfEnabled}
                />
                <Button variant="outline" onClick={copyLink}>
                  <Copy data-icon="inline-start" />
                  Salin tautan publik
                </Button>
                <Button variant="outline" onClick={() => setWaOpen(true)}>
                  <MessageCircle data-icon="inline-start" />
                  Kirim via WhatsApp
                </Button>
              </>
            )}
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await revisiPenawaranAction(quotation.id);
                  if (result.ok && result.data) {
                    toast.success("Draft revisi dibuat. Tautan lama dimatikan.");
                    router.push(`/app/penawaran/${result.data.id}`);
                    router.refresh();
                  } else if (!result.ok) {
                    toast.error(result.error);
                  }
                })
              }
            >
              <GitBranchPlus data-icon="inline-start" />
              Buat revisi
            </Button>

            {!quotation.supersededByRevision && quotation.status === "SENT" && (
              <>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => setStatusPenawaranAction(quotation.id, "WON"),
                      "Selamat! Ditandai menang.",
                    )
                  }
                >
                  <ThumbsUp data-icon="inline-start" />
                  Tandai menang
                </Button>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => setLostOpen(true)}
                >
                  <ThumbsDown data-icon="inline-start" />
                  Tandai kalah
                </Button>
              </>
            )}

            {!quotation.supersededByRevision &&
              (quotation.status === "WON" || quotation.status === "LOST") && (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => setStatusPenawaranAction(quotation.id, "SENT"),
                      "Status dikembalikan ke Terkirim.",
                    )
                  }
                >
                  <Undo2 data-icon="inline-start" />
                  Batalkan hasil
                </Button>
              )}
          </>
        )}
      </CardContent>

      {/* Konfirmasi hapus draft */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus draft ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Draft belum bernomor, jadi tidak ada nomor yang hangus. Tindakan ini tidak
              bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                startTransition(async () => {
                  const result = await hapusPenawaranAction(quotation.id);
                  if (result.ok) {
                    toast.success("Draft dihapus.");
                    router.push("/app/penawaran");
                    router.refresh();
                  } else {
                    toast.error(result.error);
                  }
                })
              }
              disabled={pending}
            >
              {pending && <Spinner data-icon="inline-start" />}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alasan kalah */}
      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tandai kalah</DialogTitle>
            <DialogDescription>
              Catat alasan kalah — berguna untuk analisis win-rate di dashboard.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
              setLostOpen(false);
              run(
                () => setStatusPenawaranAction(quotation.id, "LOST", reason),
                "Ditandai kalah.",
              );
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="lost-reason">Alasan kalah</FieldLabel>
                <Input
                  id="lost-reason"
                  name="reason"
                  placeholder="Harga kompetitor lebih rendah"
                />
              </Field>
            </FieldGroup>
            <DialogFooter className="pt-6">
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending && <Spinner data-icon="inline-start" />}
                Tandai kalah
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Kirim via WA */}
      <Dialog open={waOpen} onOpenChange={setWaOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Kirim via WhatsApp</DialogTitle>
            <DialogDescription>
              Membuka WhatsApp dengan pesan + tautan dokumen yang sudah terisi.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={kirimWa}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="wa-number">Nomor WA tujuan</FieldLabel>
                <Input
                  id="wa-number"
                  name="wa"
                  placeholder="08123456789"
                  inputMode="tel"
                  required
                />
              </Field>
            </FieldGroup>
            <DialogFooter className="pt-6">
              <Button type="submit">
                <MessageCircle data-icon="inline-start" />
                Buka WhatsApp
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
