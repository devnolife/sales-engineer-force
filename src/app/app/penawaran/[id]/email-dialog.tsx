"use client";

import { useState, useTransition } from "react";
import { Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  draftEmailPenawaranAction,
  kirimEmailPenawaranAction,
} from "@/modules/quotation/actions";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";

/**
 * Kirim penawaran via email: draft ditulis otomatis oleh AI (LLM lokal),
 * PDF terlampir otomatis (bila server PDF aktif). Human-in-the-loop —
 * draft selalu bisa diedit sebelum kirim.
 */
export function EmailDialog({
  quotationId,
  pdfEnabled,
}: {
  quotationId: string;
  pdfEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [pending, startTransition] = useTransition();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [provider, setProvider] = useState<string | null>(null);

  async function buka() {
    setOpen(true);
    if (subject) return; // draft sudah ada — jangan timpa editan user
    setDrafting(true);
    const result = await draftEmailPenawaranAction(quotationId);
    setDrafting(false);
    if (result.ok && result.data) {
      setSubject(result.data.subject);
      setBody(result.data.body);
      setProvider(result.data.provider);
      if (result.data.suggestedTo) setTo(result.data.suggestedTo);
    } else if (!result.ok) {
      toast.error(result.error);
    }
  }

  function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await kirimEmailPenawaranAction(quotationId, { to, subject, body });
      if (result.ok) {
        toast.success(
          result.data?.withPdf
            ? "Email terkirim dengan lampiran PDF."
            : "Email terkirim (tanpa lampiran PDF — link dokumen disertakan).",
        );
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <Button variant="outline" onClick={buka}>
        <Mail data-icon="inline-start" />
        Kirim via Email
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Kirim penawaran via email</DialogTitle>
            <DialogDescription>
              Draft ditulis otomatis oleh AI{pdfEnabled ? "; PDF dilampirkan otomatis" : ""}.
              Periksa dan sunting sebelum kirim.
            </DialogDescription>
          </DialogHeader>

          {drafting ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Spinner />
              AI sedang menulis draft email…
            </div>
          ) : (
            <form onSubmit={kirim}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email-to">Kepada</FieldLabel>
                  <Input
                    id="email-to"
                    type="email"
                    required
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="purchasing@pelanggan.co.id"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="email-subject">Subjek</FieldLabel>
                  <Input
                    id="email-subject"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="email-body">Isi email</FieldLabel>
                  <Textarea
                    id="email-body"
                    required
                    rows={10}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                  {provider && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Sparkles className="size-3" />
                      Draft oleh {provider} — sunting sesuai kebutuhan.
                    </p>
                  )}
                </Field>
              </FieldGroup>
              <DialogFooter className="mt-4">
                <Button type="submit" disabled={pending}>
                  {pending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Mail data-icon="inline-start" />
                  )}
                  Kirim email
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
