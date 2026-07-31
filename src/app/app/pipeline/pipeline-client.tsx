"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { buatDealAction } from "@/modules/pipeline/actions";
import { DEAL_STAGES, STAGE_LABEL } from "@/modules/pipeline/service";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

// ---------- Toolbar (pencarian + filter stage) ----------

export function PipelineToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function applyParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="w-full max-w-xs"
        onSubmit={(e) => {
          e.preventDefault();
          applyParam("cari", String(new FormData(e.currentTarget).get("cari") ?? ""));
        }}
      >
        <InputGroup>
          <InputGroupInput
            name="cari"
            placeholder="Cari judul deal/pelanggan…"
            defaultValue={searchParams.get("cari") ?? ""}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
      </form>

      <Select
        value={searchParams.get("stage") ?? "semua"}
        onValueChange={(v) => applyParam("stage", v === "semua" ? "" : v)}
      >
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="semua">Semua stage</SelectItem>
            {DEAL_STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {STAGE_LABEL[s]}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

// ---------- Dialog buat deal manual ----------

export function BuatDealDialog({
  customers,
}: {
  customers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const val = (k: string) => String(fd.get(k) ?? "");
    const nilai = val("value").trim();
    startTransition(async () => {
      const result = await buatDealAction({
        title: val("title"),
        customerId,
        value: nilai === "" ? "0" : nilai,
      });
      if (result.ok && result.data) {
        toast.success("Deal dibuat.");
        setOpen(false);
        router.push(`/app/pipeline/${result.data.id}`);
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
          Buat deal
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buat deal</DialogTitle>
          <DialogDescription>
            Deal baru masuk sebagai Lead. Stage berubah otomatis saat penawaran
            terbit.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="d-customer">Pelanggan</FieldLabel>
              <Select value={customerId} onValueChange={setCustomerId} required>
                <SelectTrigger id="d-customer" className="w-full">
                  <SelectValue placeholder="Pilih pelanggan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="d-title">Judul deal</FieldLabel>
              <Input
                id="d-title"
                name="title"
                placeholder="mis. Pengadaan pompa dosing PDAM"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="d-value">Nilai perkiraan (Rp)</FieldLabel>
              <Input id="d-value" name="value" inputMode="decimal" placeholder="0" />
            </Field>
          </FieldGroup>
          <DialogFooter className="pt-6">
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Buat deal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
