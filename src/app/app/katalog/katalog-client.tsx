"use client";

import { useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileUp, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { csvToObjects } from "@/lib/csv";
import {
  hapusProdukAction,
  importProdukAction,
  simpanProdukAction,
} from "@/modules/catalog/actions";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { Textarea } from "@/components/ui/textarea";

interface CategoryOption {
  id: string;
  name: string;
}

interface ProductValue {
  id?: string;
  name: string;
  brand: string;
  type: string;
  spec: string;
  unit: string;
  defaultPrice: string;
  categoryId: string;
  isActive: boolean;
}

const EMPTY_PRODUCT: ProductValue = {
  name: "",
  brand: "",
  type: "",
  spec: "",
  unit: "Unit",
  defaultPrice: "",
  categoryId: "",
  isActive: true,
};

// ---------- Toolbar (pencarian + filter kategori) ----------

export function KatalogToolbar({ categories }: { categories: CategoryOption[] }) {
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
            placeholder="Cari nama/merek/tipe…"
            defaultValue={searchParams.get("cari") ?? ""}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
      </form>
      <Select
        value={searchParams.get("kategori") ?? "semua"}
        onValueChange={(v) => applyParam("kategori", v === "semua" ? "" : v)}
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Semua kategori" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="semua">Semua kategori</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

// ---------- Dialog tambah/edit produk ----------

export function ProdukDialog({
  categories,
  product,
  open: controlledOpen,
  onOpenChange,
}: {
  categories: CategoryOption[];
  product?: ProductValue;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [pending, startTransition] = useTransition();
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const isEdit = Boolean(product?.id);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const val = (k: string) => String(fd.get(k) ?? "");
    startTransition(async () => {
      const result = await simpanProdukAction(
        {
          name: val("name"),
          brand: val("brand"),
          type: val("type"),
          spec: val("spec"),
          unit: val("unit") || "Unit",
          defaultPrice: val("defaultPrice"),
          categoryId,
          isActive,
        },
        product?.id,
      );
      if (result.ok) {
        toast.success(isEdit ? "Produk diperbarui." : "Produk ditambahkan.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const initial = product ?? EMPTY_PRODUCT;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isEdit && (
        <DialogTrigger asChild>
          <Button>
            <Plus data-icon="inline-start" />
            Tambah produk
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit produk" : "Tambah produk"}</DialogTitle>
          <DialogDescription>
            Produk dipakai sebagai sumber item penawaran dan pencocokan permintaan.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="p-name">Nama produk</FieldLabel>
              <Input id="p-name" name="name" defaultValue={initial.name} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="p-brand">Merek</FieldLabel>
                <Input id="p-brand" name="brand" defaultValue={initial.brand} />
              </Field>
              <Field>
                <FieldLabel htmlFor="p-type">Tipe</FieldLabel>
                <Input id="p-type" name="type" defaultValue={initial.type} />
              </Field>
              <Field>
                <FieldLabel htmlFor="p-unit">Unit</FieldLabel>
                <Input id="p-unit" name="unit" defaultValue={initial.unit} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="p-price">Harga default (Rp)</FieldLabel>
                <Input
                  id="p-price"
                  name="defaultPrice"
                  inputMode="numeric"
                  placeholder="0"
                  defaultValue={initial.defaultPrice}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="p-category">Kategori</FieldLabel>
              <Select
                value={categoryId || "tanpa"}
                onValueChange={(v) => setCategoryId(v === "tanpa" ? "" : v)}
              >
                <SelectTrigger id="p-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="tanpa">Tanpa kategori</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="p-spec">Spesifikasi</FieldLabel>
              <Textarea id="p-spec" name="spec" rows={3} defaultValue={initial.spec} />
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="p-active"
                checked={isActive}
                onCheckedChange={(v) => setIsActive(v === true)}
              />
              <FieldLabel htmlFor="p-active" className="font-normal">
                Aktif (muncul di autocomplete penawaran)
              </FieldLabel>
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

// ---------- Aksi baris (edit/hapus) ----------

export function ProdukRowActions({
  product,
  categories,
}: {
  product: ProductValue & { id: string };
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function hapus() {
    startTransition(async () => {
      const result = await hapusProdukAction(product.id);
      if (result.ok) {
        toast.success("Produk dihapus.");
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
          <Button variant="ghost" size="icon-sm" aria-label="Aksi produk">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 />
              Hapus
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {editOpen && (
        <ProdukDialog
          categories={categories}
          product={product}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {product.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Produk dihapus dari katalog. Penawaran lama tidak berubah karena item
              penawaran adalah snapshot.
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

// ---------- Import CSV ----------

export function ImportCsvDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [csvText, setCsvText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvText(await file.text());
  }

  function doImport() {
    const objects = csvToObjects(csvText);
    if (objects.length === 0) {
      toast.error("CSV kosong atau header tidak terbaca.");
      return;
    }
    const rows = objects.map((o) => ({
      name: o.nama ?? o.name ?? "",
      brand: o.merek ?? o.brand,
      type: o.tipe ?? o.type,
      spec: o.spesifikasi ?? o.spec,
      unit: o.unit ?? o.satuan,
      defaultPrice: o.harga ?? o.defaultprice ?? o.price,
      category: o.kategori ?? o.category,
    }));
    startTransition(async () => {
      const result = await importProdukAction(rows);
      if (result.ok && result.data) {
        toast.success(
          `${result.data.created} produk diimport, ${result.data.skipped.length} dilewati.`,
        );
        if (result.data.skipped.length > 0) {
          console.table(result.data.skipped);
        }
        setOpen(false);
        setCsvText("");
        router.refresh();
      } else if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileUp data-icon="inline-start" />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import produk dari CSV</DialogTitle>
          <DialogDescription>
            Header yang dikenali: nama, merek, tipe, spesifikasi, unit, harga, kategori.
            Pemisah koma atau semikolon.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="csv-file">File CSV</FieldLabel>
            <Input
              id="csv-file"
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onFileChange}
            />
            <FieldDescription>Atau tempel isinya di bawah.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="csv-text">Isi CSV</FieldLabel>
            <Textarea
              id="csv-text"
              rows={8}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={"nama;unit;harga;kategori\nPompa Dosing X;Unit;12500000;Pompa"}
              className="font-mono text-xs"
            />
          </Field>
        </FieldGroup>
        <DialogFooter className="pt-2">
          <Button onClick={doImport} disabled={pending || !csvText.trim()}>
            {pending && <Spinner data-icon="inline-start" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
