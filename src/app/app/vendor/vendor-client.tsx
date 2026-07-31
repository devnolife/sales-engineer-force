"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  cariVendorAction,
  hapusProdukVendorAction,
  hapusVendorAction,
  simpanVendorAction,
  tambahProdukVendorAction,
} from "@/modules/sourcing/actions";
import type { VendorSearchResult } from "@/modules/sourcing/types";
import { formatRupiah } from "@/lib/format";
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
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

interface VendorValue {
  id?: string;
  name: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  notes: string;
}

export interface VendorProductItem {
  id: string;
  name: string;
  brand: string;
  spec: string;
  unit: string;
  price: string;
}

const EMPTY_VENDOR: VendorValue = {
  name: "",
  city: "",
  phone: "",
  email: "",
  website: "",
  notes: "",
};

// ---------- Toolbar (pencarian) ----------

export function VendorToolbar() {
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
            placeholder="Cari nama/kota/produk…"
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

// ---------- Dialog tambah/edit vendor ----------

export function VendorDialog({
  vendor,
  open: controlledOpen,
  onOpenChange,
}: {
  vendor?: VendorValue;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(vendor?.id);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const val = (k: string) => String(fd.get(k) ?? "");
    startTransition(async () => {
      const result = await simpanVendorAction(
        {
          name: val("name"),
          city: val("city"),
          phone: val("phone"),
          email: val("email"),
          website: val("website"),
          notes: val("notes"),
        },
        vendor?.id,
      );
      if (result.ok) {
        toast.success(isEdit ? "Vendor diperbarui." : "Vendor ditambahkan.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const initial = vendor ?? EMPTY_VENDOR;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isEdit && (
        <DialogTrigger asChild>
          <Button>
            <Plus data-icon="inline-start" />
            Tambah vendor
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit vendor" : "Tambah vendor"}</DialogTitle>
          <DialogDescription>
            Vendor/supplier beserta pricelist dipakai sebagai sumber harga modal saat
            sourcing permintaan.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="v-name">Nama vendor</FieldLabel>
              <Input id="v-name" name="name" defaultValue={initial.name} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="v-city">Kota</FieldLabel>
                <Input id="v-city" name="city" defaultValue={initial.city} />
              </Field>
              <Field>
                <FieldLabel htmlFor="v-phone">Telepon</FieldLabel>
                <Input id="v-phone" name="phone" defaultValue={initial.phone} />
              </Field>
              <Field>
                <FieldLabel htmlFor="v-email">Email</FieldLabel>
                <Input
                  id="v-email"
                  name="email"
                  type="email"
                  defaultValue={initial.email}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="v-website">Website</FieldLabel>
                <Input
                  id="v-website"
                  name="website"
                  placeholder="https://…"
                  defaultValue={initial.website}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="v-notes">Catatan</FieldLabel>
              <Textarea id="v-notes" name="notes" rows={2} defaultValue={initial.notes} />
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

// ---------- Aksi baris (edit/pricelist/hapus) ----------

export function VendorRowActions({
  vendor,
  products,
}: {
  vendor: VendorValue & { id: string };
  products: VendorProductItem[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [pricelistOpen, setPricelistOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function hapus() {
    startTransition(async () => {
      const result = await hapusVendorAction(vendor.id);
      if (result.ok) {
        toast.success("Vendor dihapus.");
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
          <Button variant="ghost" size="icon-sm" aria-label="Aksi vendor">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPricelistOpen(true)}>
              <Package />
              Pricelist
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 />
              Hapus
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {editOpen && (
        <VendorDialog vendor={vendor} open={editOpen} onOpenChange={setEditOpen} />
      )}

      {pricelistOpen && (
        <ProdukVendorDialog
          vendorId={vendor.id}
          vendorName={vendor.name}
          products={products}
          open={pricelistOpen}
          onOpenChange={setPricelistOpen}
        />
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {vendor.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Pricelist vendor ikut terhapus.
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

// ---------- Dialog pricelist vendor ----------

export function ProdukVendorDialog({
  vendorId,
  vendorName,
  products,
  open,
  onOpenChange,
}: {
  vendorId: string;
  vendorName: string;
  products: VendorProductItem[];
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
      const result = await tambahProdukVendorAction(vendorId, {
        name: val("name"),
        brand: val("brand"),
        spec: val("spec"),
        unit: val("unit") || "Unit",
        price: val("price"),
      });
      if (result.ok) {
        toast.success("Produk vendor ditambahkan.");
        form.reset();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function hapusProduk(productId: string) {
    setDeletingId(productId);
    startTransition(async () => {
      const result = await hapusProdukVendorAction(productId);
      if (result.ok) {
        toast.success("Produk vendor dihapus.");
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
          <DialogTitle>Pricelist vendor</DialogTitle>
          <DialogDescription>
            Kelola pricelist {vendorName} sebagai sumber harga modal saat sourcing.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada produk di pricelist.</p>
          ) : (
            products.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
              >
                <div className="grid gap-0.5 text-sm">
                  <span className="font-medium">{p.name}</span>
                  {(p.brand || p.spec) && (
                    <span className="text-xs text-muted-foreground">
                      {[p.brand, p.spec].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap text-sm tabular-nums">
                    {formatRupiah(p.price)}/{p.unit}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Hapus produk ${p.name}`}
                    disabled={pending}
                    onClick={() => hapusProduk(p.id)}
                  >
                    {pending && deletingId === p.id ? <Spinner /> : <Trash2 />}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={tambah} className="flex flex-col gap-4 border-t pt-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="vp-name">Nama produk</FieldLabel>
              <Input id="vp-name" name="name" required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="vp-brand">Merek</FieldLabel>
                <Input id="vp-brand" name="brand" />
              </Field>
              <Field>
                <FieldLabel htmlFor="vp-unit">Unit</FieldLabel>
                <Input id="vp-unit" name="unit" defaultValue="Unit" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="vp-price">Harga modal (Rp)</FieldLabel>
                <Input
                  id="vp-price"
                  name="price"
                  inputMode="decimal"
                  placeholder="0"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="vp-spec">Spesifikasi</FieldLabel>
                <Input id="vp-spec" name="spec" />
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
              Tambah produk
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Dialog pencarian vendor (internal + web mock) ----------

export function CariVendorDialog() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [results, setResults] = useState<VendorSearchResult[] | null>(null);

  function onCari(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const query = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    if (!query) return;
    startTransition(async () => {
      const result = await cariVendorAction(query);
      if (result.ok && result.data) {
        setResults(result.data.results);
      } else if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  const hasMock = (results ?? []).some((r) => r.sourceType === "WEB_MOCK");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Search data-icon="inline-start" />
          Cari vendor (mock)
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cari vendor</DialogTitle>
          <DialogDescription>
            Cari sumber harga modal: pricelist internal dicek lebih dulu, lalu hasil web
            (mock). Minimal 3 karakter.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onCari} className="flex items-center gap-2">
          <Input
            name="q"
            placeholder="mis. pompa dosing 5 LPH"
            aria-label="Kata kunci pencarian vendor"
          />
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Search data-icon="inline-start" />
            )}
            Cari
          </Button>
        </form>

        {results !== null &&
          (results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Tidak ada hasil untuk kata kunci itu.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sumber</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Produk</TableHead>
                    <TableHead className="text-right">Harga</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={`${r.sourceType}-${i}`}>
                      <TableCell>
                        <Badge
                          variant={r.sourceType === "INTERNAL" ? "secondary" : "outline"}
                        >
                          {r.sourceType === "INTERNAL" ? "Internal" : "Web (mock)"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-48">
                        <div className="grid gap-0.5">
                          <span className="truncate">{r.vendorName}</span>
                          {r.city && (
                            <span className="truncate text-xs text-muted-foreground">
                              {r.city}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-64">
                        <span className="block truncate">{r.productName}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.price
                          ? `${formatRupiah(r.price)}/${r.unit ?? "Unit"}`
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {hasMock && (
                <p className="text-xs text-muted-foreground">
                  Hasil web berlabel (mock) adalah data contoh — provider Firecrawl asli
                  menyusul; harga bukan data nyata.
                </p>
              )}
            </div>
          ))}
      </DialogContent>
    </Dialog>
  );
}
