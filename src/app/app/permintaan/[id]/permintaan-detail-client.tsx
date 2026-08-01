"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  FileOutput,
  RefreshCw,
  Save,
  Search,
  Store,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import {
  ekstrakUlangAction,
  hapusItemPermintaanAction,
  hapusPermintaanAction,
  konversiKePenawaranAction,
  setMatchItemAction,
  setPelangganPermintaanAction,
  simpanItemPermintaanAction,
} from "@/modules/inquiry/actions";
import { cariVendorAction } from "@/modules/sourcing/actions";
import type { VendorSearchResult } from "@/modules/sourcing/service";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ---------- Aksi header (ekstrak ulang, konversi, hapus) ----------

export function InquiryHeaderActions({
  inquiryId,
  hasItems,
  quotationId,
}: {
  inquiryId: string;
  hasItems: boolean;
  quotationId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await ekstrakUlangAction(inquiryId);
            if (result.ok) {
              toast.success("Ekstraksi ulang selesai (mock).");
              router.refresh();
            } else {
              toast.error(result.error);
            }
          })
        }
      >
        <RefreshCw data-icon="inline-start" />
        Ekstrak ulang
      </Button>

      {!quotationId && (
        <Button
          disabled={pending || !hasItems}
          onClick={() =>
            startTransition(async () => {
              const result = await konversiKePenawaranAction(inquiryId);
              if (result.ok && result.data) {
                toast.success("Draft penawaran dibuat dari permintaan.");
                router.push(`/app/penawaran/${result.data.quotationId}/edit`);
                router.refresh();
              } else if (!result.ok) {
                toast.error(result.error);
              }
            })
          }
        >
          {pending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <FileOutput data-icon="inline-start" />
          )}
          Buat draft penawaran
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon"
        aria-label="Hapus permintaan"
        onClick={() => setConfirmDelete(true)}
      >
        <Trash2 />
      </Button>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus permintaan ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Item hasil ekstraksi ikut terhapus. Penawaran yang sudah dibuat dari
              permintaan ini tidak terpengaruh.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                startTransition(async () => {
                  const result = await hapusPermintaanAction(inquiryId);
                  if (result.ok) {
                    toast.success("Permintaan dihapus.");
                    router.push("/app/permintaan");
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
    </div>
  );
}

// ---------- Kartu pilih pelanggan ----------

export function PilihPelangganCard({
  inquiryId,
  customers,
  currentCustomerId,
  currentCustomerName,
}: {
  inquiryId: string;
  customers: { id: string; name: string }[];
  currentCustomerId: string | null;
  currentCustomerName: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(currentCustomerName ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Pelanggan</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="inq-customer">Pelanggan terdaftar</FieldLabel>
            <Select
              value={currentCustomerId ?? "manual"}
              onValueChange={(v) =>
                startTransition(async () => {
                  const result = await setPelangganPermintaanAction(inquiryId, {
                    customerId: v === "manual" ? undefined : v,
                    customerName: v === "manual" ? name : undefined,
                  });
                  if (result.ok) {
                    toast.success("Pelanggan disimpan.");
                    router.refresh();
                  } else {
                    toast.error(result.error);
                  }
                })
              }
            >
              <SelectTrigger id="inq-customer" disabled={pending}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="manual">Nama manual (di bawah)</SelectItem>
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
            <FieldLabel htmlFor="inq-customer-name">Nama pelanggan (hasil ekstraksi)</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="inq-customer-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="PT Calon Pelanggan"
              />
              <Button
                variant="outline"
                size="icon"
                aria-label="Simpan nama pelanggan"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await setPelangganPermintaanAction(inquiryId, {
                      customerName: name,
                    });
                    if (result.ok) {
                      toast.success("Nama pelanggan disimpan.");
                      router.refresh();
                    } else {
                      toast.error(result.error);
                    }
                  })
                }
              >
                <Check />
              </Button>
            </div>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

// ---------- Baris item ----------

interface ItemData {
  id: string;
  lineNo: number;
  rawText: string;
  name: string;
  qty: string;
  unit: string;
  spec: string;
  matchedProductId: string | null;
  matchStatus: "MATCHED" | "SUGGESTED" | "UNMATCHED";
  matchScore: number | null;
}

interface ProductOption {
  id: string;
  name: string;
  brand: string;
  defaultPrice: string;
  unit: string;
}

const MATCH_BADGE: Record<
  ItemData["matchStatus"],
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  MATCHED: { label: "Cocok", variant: "default" },
  SUGGESTED: { label: "Kandidat", variant: "secondary" },
  UNMATCHED: { label: "Tak dikenal", variant: "outline" },
};

export function InquiryItemRow({
  inquiryId,
  item,
  products,
}: {
  inquiryId: string;
  item: ItemData;
  products: ProductOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(item.qty);
  const [unit, setUnit] = useState(item.unit);
  const dirty = name !== item.name || qty !== item.qty || unit !== item.unit;
  const badge = MATCH_BADGE[item.matchStatus];
  const matchedProduct = products.find((p) => p.id === item.matchedProductId);

  function simpan() {
    startTransition(async () => {
      const result = await simpanItemPermintaanAction(
        item.id,
        { name, qty, unit, spec: item.spec },
        inquiryId,
      );
      if (result.ok) {
        toast.success(`Baris ${item.lineNo} disimpan.`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium">Baris {item.lineNo}</span> — {item.rawText}
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-[1fr_80px_90px_minmax(180px,240px)_auto]">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nama barang"
          className="col-span-2 md:col-span-1"
        />
        <Input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          inputMode="decimal"
          className="text-right"
          aria-label="Qty"
        />
        <Input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="unit"
          aria-label="Unit"
        />
        <Select
          value={item.matchedProductId ?? "tidak"}
          onValueChange={(v) =>
            startTransition(async () => {
              const result = await setMatchItemAction(
                item.id,
                v === "tidak" ? null : v,
                inquiryId,
              );
              if (result.ok) {
                toast.success("Pencocokan diperbarui.");
                router.refresh();
              } else {
                toast.error(result.error);
              }
            })
          }
        >
          <SelectTrigger aria-label="Cocokkan ke produk katalog" disabled={pending}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="tidak">— Tidak ada di katalog —</SelectItem>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.brand ? ` (${p.brand})` : ""}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <div className="col-span-2 flex items-center gap-1 md:col-span-1">
          <Badge variant={badge.variant}>
            {badge.label}
            {item.matchScore != null && item.matchStatus !== "UNMATCHED"
              ? ` ${(item.matchScore * 100).toFixed(0)}%`
              : ""}
          </Badge>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Simpan baris"
            onClick={simpan}
            disabled={pending || !dirty}
          >
            {pending ? <Spinner /> : <Save />}
          </Button>
          <ItemVendorSearch itemId={item.id} defaultQuery={name} />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Hapus baris"
            onClick={() =>
              startTransition(async () => {
                const result = await hapusItemPermintaanAction(item.id, inquiryId);
                if (result.ok) {
                  toast.success("Baris dihapus.");
                  router.refresh();
                } else {
                  toast.error(result.error);
                }
              })
            }
            disabled={pending}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      {matchedProduct && (
        <p className="text-xs text-muted-foreground">
          Katalog: {matchedProduct.name}
          {matchedProduct.defaultPrice
            ? ` — harga default ${formatRupiah(matchedProduct.defaultPrice)}/${matchedProduct.unit}`
            : ""}
        </p>
      )}
      <Separator />
    </div>
  );
}

// ---------- Pencarian vendor per item ----------

function ItemVendorSearch({
  itemId,
  defaultQuery,
}: {
  itemId: string;
  defaultQuery: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(defaultQuery);
  const [results, setResults] = useState<VendorSearchResult[] | null>(null);

  function cari() {
    startTransition(async () => {
      const result = await cariVendorAction(query, itemId);
      if (result.ok && result.data) {
        setResults(result.data.results);
      } else if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  const adaWebMock = results?.some((r) => r.sourceType === "WEB_MOCK") ?? false;

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Cari vendor untuk barang ini"
        onClick={() => {
          setQuery(defaultQuery);
          setResults(null);
          setOpen(true);
        }}
      >
        <Store />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cari vendor: {defaultQuery}</DialogTitle>
            <DialogDescription>
              Urutan sumber: pricelist internal dulu (paling akurat), lalu web.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Kata kunci barang…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  cari();
                }
              }}
            />
            <Button onClick={cari} disabled={pending || query.trim().length < 3}>
              {pending ? <Spinner data-icon="inline-start" /> : <Search data-icon="inline-start" />}
              Cari
            </Button>
          </div>

          {results !== null && (
            <div className="flex flex-col gap-2">
              {results.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Tidak ada hasil. Tambahkan vendor + pricelist di menu Vendor.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sumber</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Produk</TableHead>
                      <TableHead className="text-right">Harga indikatif</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Badge
                            variant={r.sourceType === "INTERNAL" ? "secondary" : "outline"}
                          >
                            {r.sourceType === "INTERNAL"
                              ? "Internal"
                              : r.sourceType === "WEB"
                                ? "Web"
                                : "Web (mock)"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="grid gap-0.5">
                            {r.sourceUrl ? (
                              <a
                                href={r.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline-offset-4 hover:underline"
                              >
                                {r.vendorName}
                              </a>
                            ) : (
                              <span>{r.vendorName}</span>
                            )}
                            {r.city && (
                              <span className="text-xs text-muted-foreground">{r.city}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-48 truncate">{r.productName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.price ? `${formatRupiah(r.price)}/${r.unit ?? "Unit"}` : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {adaWebMock && (
                <p className="text-xs text-muted-foreground">
                  Hasil berlabel (mock) adalah data contoh — bukan harga nyata. Aktifkan
                  pencarian nyata: SOURCING_PROVIDER=firecrawl + FIRECRAWL_API_KEY di .env.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
