"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

export function InviteMemberDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<"member" | "admin">("member");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { data, error } = await authClient.organization.inviteMember({
      email: String(fd.get("email")),
      role,
    });
    setLoading(false);
    if (error || !data) {
      toast.error(error?.message ?? "Gagal membuat undangan.");
      return;
    }
    const link = `${window.location.origin}/undangan/${data.id}`;
    await navigator.clipboard.writeText(link).catch(() => {});
    toast.success("Undangan dibuat — tautan disalin ke clipboard.");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus data-icon="inline-start" />
          Undang anggota
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Undang anggota baru</DialogTitle>
          <DialogDescription>
            Mode kerangka: email tidak dikirim — tautan undangan disalin untuk dibagikan
            manual (mis. via WA).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="invite-email">Email</FieldLabel>
              <Input
                id="invite-email"
                name="email"
                type="email"
                placeholder="sales@perusahaan.co.id"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-role">Peran</FieldLabel>
              <Select value={role} onValueChange={(v) => setRole(v as "member" | "admin")}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="member">Sales</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter className="pt-6">
            <Button type="submit" disabled={loading}>
              {loading && <Spinner data-icon="inline-start" />}
              Buat undangan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InvitationRowActions({ invitationId }: { invitationId: string }) {
  const router = useRouter();

  async function copyLink() {
    const link = `${window.location.origin}/undangan/${invitationId}`;
    await navigator.clipboard.writeText(link);
    toast.success("Tautan undangan disalin.");
  }

  async function cancel() {
    const { error } = await authClient.organization.cancelInvitation({ invitationId });
    if (error) {
      toast.error(error.message ?? "Gagal membatalkan undangan.");
      return;
    }
    toast.success("Undangan dibatalkan.");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" onClick={copyLink}>
        <Copy data-icon="inline-start" />
        Salin tautan
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={cancel} aria-label="Batalkan undangan">
        <X />
      </Button>
    </div>
  );
}

export function RemoveMemberButton({ memberId, name }: { memberId: string; name: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function remove() {
    setLoading(true);
    const { error } = await authClient.organization.removeMember({
      memberIdOrEmail: memberId,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Gagal mengeluarkan anggota.");
      return;
    }
    toast.success(`${name} dikeluarkan dari organisasi.`);
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Keluarkan ${name}`}>
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Keluarkan {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Anggota ini tidak lagi bisa mengakses data organisasi. Data yang pernah ia buat
            tetap tersimpan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={remove} disabled={loading}>
            {loading && <Spinner data-icon="inline-start" />}
            Keluarkan
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
