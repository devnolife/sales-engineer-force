"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  tambahAktivitasAction,
  tambahReminderAction,
  toggleReminderAction,
  ubahStageDealAction,
} from "@/modules/pipeline/actions";
import {
  ACTIVITY_LABEL,
  ACTIVITY_TYPES,
  DEAL_STAGES,
  STAGE_LABEL,
  type ActivityType,
  type DealStage,
} from "@/modules/pipeline/service";
import { formatTanggalWaktu } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
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
import { Textarea } from "@/components/ui/textarea";

// ---------- Ubah stage (dengan dialog alasan kalah) ----------

export function StageSelect({ dealId, stage }: { dealId: string; stage: DealStage }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lostOpen, setLostOpen] = useState(false);

  function applyStage(next: DealStage, lostReason?: string) {
    startTransition(async () => {
      const result = await ubahStageDealAction(dealId, next, lostReason);
      if (result.ok) {
        toast.success(`Stage diubah ke ${STAGE_LABEL[next]}.`);
        setLostOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {pending && <Spinner />}
        <Select
          value={stage}
          disabled={pending}
          onValueChange={(v) => {
            const next = v as DealStage;
            if (next === stage) return;
            if (next === "LOST") setLostOpen(true);
            else applyStage(next);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {DEAL_STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STAGE_LABEL[s]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Tandai deal kalah</DialogTitle>
            <DialogDescription>
              Catat alasan kalah untuk bahan evaluasi pipeline.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const alasan = String(
                new FormData(e.currentTarget).get("lostReason") ?? "",
              ).trim();
              applyStage("LOST", alasan || undefined);
            }}
          >
            <Field>
              <FieldLabel htmlFor="lost-reason">Alasan kalah</FieldLabel>
              <Input
                id="lost-reason"
                name="lostReason"
                placeholder="mis. harga kompetitor lebih murah"
              />
            </Field>
            <DialogFooter className="pt-6">
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending && <Spinner data-icon="inline-start" />}
                Tandai kalah
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------- Form catat aktivitas ----------

export function TambahAktivitasForm({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<ActivityType>("CALL");
  const [content, setContent] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await tambahAktivitasAction(dealId, { type, content });
      if (result.ok) {
        toast.success("Aktivitas dicatat.");
        setContent("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-2">
      <div className="flex items-start gap-2">
        <Select value={type} onValueChange={(v) => setType(v as ActivityType)}>
          <SelectTrigger className="w-32 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {ACTIVITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {ACTIVITY_LABEL[t]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          placeholder="Catat hasil telepon/meeting/chat…"
          aria-label="Isi aktivitas"
          required
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Plus data-icon="inline-start" />
          )}
          Catat
        </Button>
      </div>
    </form>
  );
}

// ---------- Daftar & tambah reminder follow-up ----------

interface ReminderItem {
  id: string;
  note: string;
  dueAt: string;
  done: boolean;
}

export function ReminderList({
  dealId,
  reminders,
}: {
  dealId: string;
  reminders: ReminderItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const now = Date.now();

  function toggle(id: string, done: boolean) {
    startTransition(async () => {
      const result = await toggleReminderAction(id, done);
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function tambah(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const result = await tambahReminderAction(dealId, {
        dueAt: String(fd.get("dueAt") ?? ""),
        note: String(fd.get("note") ?? ""),
      });
      if (result.ok) {
        toast.success("Reminder ditambahkan.");
        form.reset();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="grid gap-4">
      {reminders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada reminder.</p>
      ) : (
        <div className="grid gap-2">
          {reminders.map((r) => {
            const overdue = !r.done && new Date(r.dueAt).getTime() < now;
            return (
              <div
                key={r.id}
                className="flex items-start gap-2 rounded-lg border px-3 py-2"
              >
                <Checkbox
                  checked={r.done}
                  disabled={pending}
                  onCheckedChange={(checked) => toggle(r.id, checked === true)}
                  aria-label={`Tandai selesai: ${r.note}`}
                  className="mt-0.5"
                />
                <div className="grid gap-0.5 text-sm">
                  <span className={cn(r.done && "text-muted-foreground line-through")}>
                    {r.note}
                  </span>
                  <span
                    className={cn(
                      "text-xs",
                      overdue ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {formatTanggalWaktu(r.dueAt)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <form onSubmit={tambah} className="grid gap-3 border-t pt-4">
        <Field>
          <FieldLabel htmlFor="r-dueAt">Waktu follow-up</FieldLabel>
          <Input id="r-dueAt" name="dueAt" type="datetime-local" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="r-note">Catatan</FieldLabel>
          <Input
            id="r-note"
            name="note"
            placeholder="mis. Telepon konfirmasi PO"
            required
          />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Plus data-icon="inline-start" />
            )}
            Tambah
          </Button>
        </div>
      </form>
    </div>
  );
}
