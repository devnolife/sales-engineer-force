"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileUp, Inbox, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  buatPermintaanTeksAction,
  uploadPermintaanAction,
} from "@/modules/inquiry/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const CONTOH_TEKS = `Kepada Yth. Tim Sales,

Kami dari PT Tirta Mandiri membutuhkan penawaran untuk:
- 2 unit Pompa dosing kimia 6 L/h
- 4 pcs Membran RO 4040
- 1 drum Antiscalant 25 kg
- 10 batang Pipa PVC 2 inch

Mohon dikirim segera. Terima kasih.`;

export function PermintaanBaruDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [rawText, setRawText] = useState("");

  function submitTeks() {
    startTransition(async () => {
      const result = await buatPermintaanTeksAction({ rawText });
      if (result.ok && result.data) {
        toast.success("Permintaan dibuat & diekstrak (mock). Silakan review.");
        setOpen(false);
        setRawText("");
        router.push(`/app/permintaan/${result.data.id}`);
        router.refresh();
      } else if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  function submitFile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await uploadPermintaanAction(formData);
      if (result.ok && result.data) {
        toast.success("File diunggah & diekstrak (mock). Silakan review.");
        setOpen(false);
        router.push(`/app/permintaan/${result.data.id}`);
        router.refresh();
      } else if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus data-icon="inline-start" />
          Permintaan baru
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Permintaan baru</DialogTitle>
          <DialogDescription>
            Tempel teks permintaan (email/WA) atau upload file. Ekstraksi memakai
            provider mock — hasilnya selalu untuk direview dulu.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="teks">
          <TabsList className="w-full">
            <TabsTrigger value="teks" className="flex-1">
              <Inbox data-icon="inline-start" />
              Tempel teks
            </TabsTrigger>
            <TabsTrigger value="file" className="flex-1">
              <FileUp data-icon="inline-start" />
              Upload file
            </TabsTrigger>
          </TabsList>

          <TabsContent value="teks" className="pt-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="inq-text">Teks permintaan</FieldLabel>
                <Textarea
                  id="inq-text"
                  rows={9}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={CONTOH_TEKS}
                  className="font-mono text-xs"
                />
                <FieldDescription>
                  <button
                    type="button"
                    className="underline underline-offset-4"
                    onClick={() => setRawText(CONTOH_TEKS)}
                  >
                    Isi dengan contoh
                  </button>{" "}
                  untuk mencoba alur end-to-end.
                </FieldDescription>
              </Field>
            </FieldGroup>
            <DialogFooter className="pt-4">
              <Button onClick={submitTeks} disabled={pending || rawText.trim().length < 10}>
                {pending && <Spinner data-icon="inline-start" />}
                Buat & ekstrak
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="file" className="pt-4">
            <form onSubmit={submitFile}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="inq-file">File permintaan</FieldLabel>
                  <Input
                    id="inq-file"
                    name="file"
                    type="file"
                    accept=".txt,.csv,.md,.pdf,.png,.jpg,.jpeg,.xlsx,.docx"
                    required
                  />
                  <FieldDescription>
                    File teks (.txt/.csv) dibaca isinya. PDF/gambar belum dibaca provider
                    mock — item contoh akan dibuat agar alur tetap bisa dicoba.
                  </FieldDescription>
                </Field>
              </FieldGroup>
              <DialogFooter className="pt-4">
                <Button type="submit" disabled={pending}>
                  {pending && <Spinner data-icon="inline-start" />}
                  Upload & ekstrak
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_OPTIONS = [
  { value: "semua", label: "Semua status" },
  { value: "NEW", label: "Baru" },
  { value: "EXTRACTED", label: "Terekstrak" },
  { value: "REVIEWED", label: "Direview" },
  { value: "QUOTED", label: "Jadi Penawaran" },
  { value: "ARCHIVED", label: "Diarsipkan" },
];

export function PermintaanStatusFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="flex items-center gap-2">
      <Select
        value={searchParams.get("status") ?? "semua"}
        onValueChange={(v) => {
          const params = new URLSearchParams(searchParams.toString());
          if (v === "semua") params.delete("status");
          else params.set("status", v);
          router.replace(`${pathname}?${params.toString()}`);
        }}
      >
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
