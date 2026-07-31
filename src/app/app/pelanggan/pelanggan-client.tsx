"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MoreHorizontal, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  hapusKontakAction,
  hapusPelangganAction,
  simpanPelangganAction,
  tambahKontakAction,
} from "@/modules/customer/actions";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

interface CustomerValue {
  id?: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  npwp: string;
  notes: string;
}

interface ContactValue {
  id: string;
  name: string;
  title: string;
  phone: string;
  email: string;
}

const EMPTY_CUSTOMER: CustomerValue = {
  name: "",
  address: "",
  city: "",
  phone: "",
  email: "",
  npwp: "",
  notes: "",
};

// ---------- Toolbar (pencarian) ----------

export function PelangganToolbar() {
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
            placeholder="Cari nama/kota/telepon/email…"
            defaultValue={searchParams.get("cari") ?? ""}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}

// ---------- Dialog tambah/edit pelanggan ----------

export function PelangganDialog({
  customer,
  open: controlledOpen,
  onOpenChange,
}: {
  customer?: CustomerValue;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(customer?.id);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const val = (k: string) => String(fd.get(k) ?? "");
    startTransition(async () => {
      const result = await simpanPelangganAction(
        {
          name: val("name"),
          address: val("address"),
          city: val("city"),
          phone: val("phone"),
          email: val("email"),
          npwp: val("npwp"),
          notes: val("notes"),
        },
        customer?.id,
      );
      if (result.ok) {
        toast.success(isEdit ? "Pelanggan diperbarui." : "Pelanggan ditambahkan.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const initial = customer ?? EMPTY_CUSTOMER;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isEdit && (
        <DialogTrigger asChild>
          <Button>
            <Plus data-icon="inline-start" />
            Tambah pelanggan
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit pelanggan" : "Tambah pelanggan"}</DialogTitle>
          <DialogDescription>
            Data pelanggan dipakai sebagai tujuan penawaran dan induk deal di pipeline.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="c-name">Nama perusahaan</FieldLabel>
              <Input id="c-name" name="name" defaultValue={initial.name} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="c-address">Alamat</FieldLabel>
              <Textarea
                id="c-address"
                name="address"
                rows={2}
                defaultValue={initial.address}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="c-city">Kota</FieldLabel>
                <Input id="c-city" name="city" defaultValue={initial.city} />
              </Field>
              <Field>
                <FieldLabel htmlFor="c-phone">Telepon</FieldLabel>
                <Input id="c-phone" name="phone" defaultValue={initial.phone} />
              </Field>
              <Field>
                <FieldLabel htmlFor="c-email">Email</FieldLabel>
                <Input
                  id="c-email"
                  name="email"
                  type="email"
                  defaultValue={initial.email}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="c-npwp">NPWP</FieldLabel>
                <Input id="c-npwp" name="npwp" defaultValue={initial.npwp} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="c-notes">Catatan</FieldLabel>
              <Textarea
                id="c-notes"
                name="notes"
                rows={2}
                defaultValue={initial.notes}
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="pt-6">
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {isEdit ? "Simpan perubahan" : "Tambah"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Aksi baris (edit/kontak/hapus) ----------

export function PelangganRowActions({
  customer,
  contacts,
}: {
  customer: CustomerValue & { id: string };
  contacts: ContactValue[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [kontakOpen, setKontakOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function hapus() {
    startTransition(async () => {
      const result = await hapusPelangganAction(customer.id);
      if (result.ok) {
        toast.success("Pelanggan dihapus.");
        setConfirmOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Aksi pelanggan">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setKontakOpen(true)}>
              <Users />
              Kontak person
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 />
              Hapus
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {editOpen && (
        <PelangganDialog
          customer={customer}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

      {kontakOpen && (
        <KontakDialog
          customerId={customer.id}
          customerName={customer.name}
          contacts={contacts}
          open={kontakOpen}
          onOpenChange={setKontakOpen}
        />
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {customer.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Pelanggan dan kontak personnya dihapus dari daftar. Menghapus pelanggan
              tidak mengubah penawaran lama (snapshot).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={hapus} disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------- Dialog kontak person ----------

export function KontakDialog({
  customerId,
  customerName,
  contacts,
  open,
  onOpenChange,
}: {
  customerId: string;
  customerName: string;
  contacts: ContactValue[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function tambah(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const val = (k: string) => String(fd.get(k) ?? "");
    setDeletingId(null);
    startTransition(async () => {
      const result = await tambahKontakAction(customerId, {
        name: val("name"),
        title: val("title"),
        phone: val("phone"),
        email: val("email"),
      });
      if (result.ok) {
        toast.success("Kontak ditambahkan.");
        form.reset();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function hapusKontak(contactId: string) {
    setDeletingId(contactId);
    startTransition(async () => {
      const result = await hapusKontakAction(contactId);
      if (result.ok) {
        toast.success("Kontak dihapus.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
      setDeletingId(null);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Kontak person</DialogTitle>
          <DialogDescription>
            Kelola kontak person {customerName} untuk Attn. penawaran dan follow-up.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada kontak person.</p>
          ) : (
            contacts.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
              >
                <div className="grid gap-0.5 text-sm">
                  <span className="font-medium">
                    {k.name}
                    {k.title && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {k.title}
                      </span>
                    )}
                  </span>
                  {(k.phone || k.email) && (
                    <span className="text-xs text-muted-foreground">
                      {[k.phone, k.email].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Hapus kontak ${k.name}`}
                  disabled={pending}
                  onClick={() => hapusKontak(k.id)}
                >
                  {pending && deletingId === k.id ? <Spinner /> : <Trash2 />}
                </Button>
              </div>
            ))
          )}
        </div>

        <form onSubmit={tambah} className="flex flex-col gap-4 border-t pt-4">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="k-name">Nama</FieldLabel>
                <Input id="k-name" name="name" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="k-title">Jabatan</FieldLabel>
                <Input id="k-title" name="title" />
              </Field>
              <Field>
                <FieldLabel htmlFor="k-phone">Telepon/WA</FieldLabel>
                <Input id="k-phone" name="phone" />
              </Field>
              <Field>
                <FieldLabel htmlFor="k-email">Email</FieldLabel>
                <Input id="k-email" name="email" type="email" />
              </Field>
            </div>
          </FieldGroup>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending && deletingId === null ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Plus data-icon="inline-start" />
              )}
              Tambah kontak
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
