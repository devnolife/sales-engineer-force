"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import {
  buatPenawaranAction,
  perbaruiPenawaranAction,
} from "@/modules/quotation/actions";
import { computeTotals } from "@/modules/quotation/lib/quotation-math";
import { terbilangRupiah } from "@/modules/quotation/lib/terbilang";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

/**
 * Form draft penawaran (buat & edit).
 *
 * Kalkulasi di form ini memakai MODUL YANG SAMA dengan server
 * (quotation-math + terbilang, keduanya pure TS) sehingga preview identik
 * dengan nilai tersimpan. Nilai mengikat tetap dihitung ulang server-side.
 */

export interface FormItem {
  key: string;
  productId: string;
  name: string;
  brand: string;
  type: string;
  spec: string;
  qty: string;
  unit: string;
  unitPrice: string;
  discountPercent: string;
}

export interface QuotationFormDefaults {
  franco: string;
  deliveryTime: string;
  termsOfPayment: string;
  priceIncludeNote: string;
  validityDays: number;
  vatPercent: number;
}

export interface QuotationFormInitial {
  customerId: string;
  customerName: string;
  attn: string;
  subject: string;
  quoteDate: string; // yyyy-mm-dd
  franco: string;
  deliveryTime: string;
  termsOfPayment: string;
  priceIncludeNote: string;
  validityDays: number;
  vatPercent: number;
  docDiscountType: "AMOUNT" | "PERCENT";
  docDiscountValue: string;
  notes: string;
  items: Omit<FormItem, "key">[];
}

interface Suggestion {
  source: "katalog" | "histori";
  productId: string | null;
  name: string;
  brand: string;
  type: string;
  spec: string;
  unit: string;
  unitPrice: string;
}

let keyCounter = 0;
function nextKey() {
  keyCounter += 1;
  return `row-${keyCounter}`;
}

function emptyItem(): FormItem {
  return {
    key: nextKey(),
    productId: "",
    name: "",
    brand: "",
    type: "",
    spec: "",
    qty: "1",
    unit: "Unit",
    unitPrice: "0",
    discountPercent: "0",
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function QuotationForm({
  customers,
  defaults,
  initial,
  quotationId,
}: {
  customers: { id: string; name: string }[];
  defaults: QuotationFormDefaults;
  initial?: QuotationFormInitial;
  quotationId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [customerName, setCustomerName] = useState(initial?.customerName ?? "");
  const [docDiscountType, setDocDiscountType] = useState<"AMOUNT" | "PERCENT">(
    initial?.docDiscountType ?? "AMOUNT",
  );
  const [docDiscountValue, setDocDiscountValue] = useState(initial?.docDiscountValue ?? "0");
  const [vatPercent, setVatPercent] = useState(initial?.vatPercent ?? defaults.vatPercent);
  const [items, setItems] = useState<FormItem[]>(
    initial?.items.map((i) => ({ ...i, key: nextKey() })) ?? [emptyItem()],
  );

  // ---------- Autocomplete ----------
  const [activeSuggestRow, setActiveSuggestRow] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onNameChange(key: string, value: string) {
    patchItem(key, { name: value, productId: "" });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setActiveSuggestRow(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/penawaran/saran-item?q=${encodeURIComponent(value.trim())}`,
        );
        const data = (await res.json()) as { suggestions: Suggestion[] };
        setSuggestions(data.suggestions ?? []);
        setActiveSuggestRow(key);
      } catch {
        setSuggestions([]);
      }
    }, 200);
  }

  function applySuggestion(key: string, s: Suggestion) {
    patchItem(key, {
      productId: s.productId ?? "",
      name: s.name,
      brand: s.brand,
      type: s.type,
      spec: s.spec,
      unit: s.unit,
      unitPrice: s.unitPrice || "0",
    });
    setActiveSuggestRow(null);
    setSuggestions([]);
  }

  // ---------- Item helpers ----------
  function patchItem(key: string, patch: Partial<FormItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  }

  // ---------- Preview totals (modul sama dengan server) ----------
  const preview = useMemo(() => {
    try {
      const totals = computeTotals(
        items
          .filter((i) => i.name.trim())
          .map((i) => ({
            qty: i.qty || "0",
            unitPrice: i.unitPrice || "0",
            discountPercent: i.discountPercent || "0",
          })),
        (vatPercent / 100).toString(),
        { type: docDiscountType, value: docDiscountValue || "0" },
      );
      return {
        ok: true as const,
        subtotal: totals.subtotal.toFixed(2),
        discountAmount: totals.discountAmount.toFixed(2),
        vatAmount: totals.vatAmount.toFixed(0),
        total: totals.total.toFixed(2),
        terbilang: terbilangRupiah(totals.total.toFixed(0)),
      };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [items, vatPercent, docDiscountType, docDiscountValue]);

  // ---------- Submit ----------
  function submit(e: React.FormEvent<HTMLFormElement>, terbitkan: boolean) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const val = (k: string) => String(fd.get(k) ?? "");

    const input = {
      customerId,
      customerName,
      attn: val("attn"),
      subject: val("subject"),
      quoteDate: val("quoteDate"),
      franco: val("franco"),
      deliveryTime: val("deliveryTime"),
      termsOfPayment: val("termsOfPayment"),
      priceIncludeNote: val("priceIncludeNote"),
      validityDays: Number(val("validityDays")),
      vatPercent,
      docDiscountType,
      docDiscountValue: docDiscountValue || "0",
      notes: val("notes"),
      items: items
        .filter((i) => i.name.trim())
        .map((i) => ({
          productId: i.productId,
          name: i.name,
          brand: i.brand,
          type: i.type,
          spec: i.spec,
          qty: i.qty || "0",
          unit: i.unit || "Unit",
          unitPrice: i.unitPrice || "0",
          discountPercent: i.discountPercent || "0",
        })),
    };

    startTransition(async () => {
      const result = quotationId
        ? await perbaruiPenawaranAction(quotationId, input, terbitkan)
        : await buatPenawaranAction(input, terbitkan);
      if (result.ok && result.data) {
        toast.success(terbitkan ? "Penawaran diterbitkan." : "Draft tersimpan.");
        router.push(`/app/penawaran/${result.data.id}`);
        router.refresh();
      } else if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  const submitMode = useRef<boolean>(false);

  return (
    <form onSubmit={(e) => submit(e, submitMode.current)} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Informasi Dokumen</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="qf-customer">Pelanggan terdaftar</FieldLabel>
                <Select
                  value={customerId || "manual"}
                  onValueChange={(v) => {
                    if (v === "manual") {
                      setCustomerId("");
                      return;
                    }
                    setCustomerId(v);
                    const c = customers.find((x) => x.id === v);
                    if (c) setCustomerName(c.name);
                  }}
                >
                  <SelectTrigger id="qf-customer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="manual">Ketik manual (tanpa link)</SelectItem>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Pelanggan terdaftar otomatis membuat Deal di pipeline saat terbit.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="qf-customerName">Nama pelanggan (dicetak)</FieldLabel>
                <Input
                  id="qf-customerName"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="PT Pelanggan Anda"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="qf-attn">Attn (u.p.)</FieldLabel>
                <Input id="qf-attn" name="attn" defaultValue={initial?.attn ?? ""} />
              </Field>
              <Field>
                <FieldLabel htmlFor="qf-date">Tanggal</FieldLabel>
                <Input
                  id="qf-date"
                  name="quoteDate"
                  type="date"
                  defaultValue={initial?.quoteDate ?? today()}
                  required
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="qf-subject">Perihal</FieldLabel>
              <Input
                id="qf-subject"
                name="subject"
                defaultValue={initial?.subject ?? ""}
                placeholder="Penawaran Pompa Dosing & Chemical"
                required
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Item Penawaran</CardTitle>
          <CardDescription>
            Ketik nama item untuk autocomplete dari katalog & histori, atau isi bebas.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="hidden grid-cols-[1fr_90px_80px_130px_70px_130px_32px] gap-2 text-xs font-medium text-muted-foreground md:grid">
            <span>Deskripsi item</span>
            <span className="text-right">Qty</span>
            <span>Unit</span>
            <span className="text-right">Harga satuan</span>
            <span className="text-right">Disc %</span>
            <span className="text-right">Total baris</span>
            <span />
          </div>

          {items.map((item) => {
            const line = (() => {
              try {
                const t = computeTotals(
                  [
                    {
                      qty: item.qty || "0",
                      unitPrice: item.unitPrice || "0",
                      discountPercent: item.discountPercent || "0",
                    },
                  ],
                  "0",
                );
                return formatRupiah(t.subtotal.toFixed(2));
              } catch {
                return "—";
              }
            })();

            return (
              <div key={item.key} className="flex flex-col gap-2">
                <div className="grid grid-cols-2 items-start gap-2 md:grid-cols-[1fr_90px_80px_130px_70px_130px_32px]">
                  <div className="relative col-span-2 md:col-span-1">
                    <Input
                      value={item.name}
                      onChange={(e) => onNameChange(item.key, e.target.value)}
                      onBlur={() => {
                        // Beri waktu klik saran sebelum daftar ditutup.
                        setTimeout(() => {
                          setActiveSuggestRow((cur) => (cur === item.key ? null : cur));
                        }, 150);
                      }}
                      placeholder="Nama item / material"
                      aria-label="Nama item"
                    />
                    {activeSuggestRow === item.key && suggestions.length > 0 && (
                      <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md">
                        {suggestions.map((s, i) => (
                          <li key={`${s.name}-${i}`}>
                            <button
                              type="button"
                              className="flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left hover:bg-accent"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                applySuggestion(item.key, s);
                              }}
                            >
                              <span className="font-medium">{s.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {[s.brand, s.type].filter(Boolean).join(" / ")}
                                {s.unitPrice !== "0" && ` — ${formatRupiah(s.unitPrice)}`}
                                {" · "}
                                {s.source === "katalog" ? "Katalog" : "Histori"}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Input
                    value={item.qty}
                    onChange={(e) => patchItem(item.key, { qty: e.target.value })}
                    inputMode="decimal"
                    className="text-right"
                    aria-label="Qty"
                  />
                  <Input
                    value={item.unit}
                    onChange={(e) => patchItem(item.key, { unit: e.target.value })}
                    aria-label="Unit"
                  />
                  <Input
                    value={item.unitPrice}
                    onChange={(e) => patchItem(item.key, { unitPrice: e.target.value })}
                    inputMode="decimal"
                    className="text-right"
                    aria-label="Harga satuan"
                  />
                  <Input
                    value={item.discountPercent}
                    onChange={(e) =>
                      patchItem(item.key, { discountPercent: e.target.value })
                    }
                    inputMode="decimal"
                    className="text-right"
                    aria-label="Diskon persen"
                  />
                  <div className="flex h-8 items-center justify-end text-sm tabular-nums text-muted-foreground">
                    {line}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeItem(item.key)}
                    aria-label="Hapus baris"
                    disabled={items.length === 1}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  <Input
                    value={item.brand}
                    onChange={(e) => patchItem(item.key, { brand: e.target.value })}
                    placeholder="Merek (opsional)"
                    aria-label="Merek"
                  />
                  <Input
                    value={item.type}
                    onChange={(e) => patchItem(item.key, { type: e.target.value })}
                    placeholder="Tipe (opsional)"
                    aria-label="Tipe"
                  />
                  <Input
                    value={item.spec}
                    onChange={(e) => patchItem(item.key, { spec: e.target.value })}
                    placeholder="Spesifikasi singkat (opsional)"
                    aria-label="Spesifikasi"
                    className="col-span-2 md:col-span-1"
                  />
                </div>
                <Separator />
              </div>
            );
          })}

          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setItems((prev) => [...prev, emptyItem()])}
            >
              <Plus data-icon="inline-start" />
              Tambah baris
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Syarat & Ketentuan</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="qf-franco">Franco</FieldLabel>
                  <Input
                    id="qf-franco"
                    name="franco"
                    defaultValue={initial?.franco ?? defaults.franco}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="qf-delivery">Waktu pengiriman</FieldLabel>
                  <Input
                    id="qf-delivery"
                    name="deliveryTime"
                    defaultValue={initial?.deliveryTime ?? defaults.deliveryTime}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="qf-top">Termin pembayaran</FieldLabel>
                  <Input
                    id="qf-top"
                    name="termsOfPayment"
                    defaultValue={initial?.termsOfPayment ?? defaults.termsOfPayment}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="qf-pin">Catatan harga</FieldLabel>
                  <Input
                    id="qf-pin"
                    name="priceIncludeNote"
                    defaultValue={initial?.priceIncludeNote ?? defaults.priceIncludeNote}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="qf-validity">Masa berlaku (hari)</FieldLabel>
                  <Input
                    id="qf-validity"
                    name="validityDays"
                    type="number"
                    min={1}
                    max={365}
                    defaultValue={initial?.validityDays ?? defaults.validityDays}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="qf-vat">PPN (%)</FieldLabel>
                  <Input
                    id="qf-vat"
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    value={vatPercent}
                    onChange={(e) => setVatPercent(Number(e.target.value))}
                    required
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="qf-notes">Catatan internal</FieldLabel>
                <Textarea
                  id="qf-notes"
                  name="notes"
                  rows={2}
                  defaultValue={initial?.notes ?? ""}
                />
                <FieldDescription>Tidak ikut tercetak di dokumen.</FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ringkasan</CardTitle>
            <CardDescription>
              Preview memakai mesin hitung yang sama dengan server.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-[110px_1fr_120px] items-center gap-2">
              <span className="text-sm text-muted-foreground">Diskon dokumen</span>
              <Select
                value={docDiscountType}
                onValueChange={(v) => setDocDiscountType(v as "AMOUNT" | "PERCENT")}
              >
                <SelectTrigger aria-label="Jenis diskon dokumen">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="AMOUNT">Nominal (Rp)</SelectItem>
                    <SelectItem value="PERCENT">Persen (%)</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Input
                value={docDiscountValue}
                onChange={(e) => setDocDiscountValue(e.target.value)}
                inputMode="decimal"
                className="text-right"
                aria-label="Nilai diskon dokumen"
              />
            </div>

            <Separator />

            {preview.ok ? (
              <dl className="grid gap-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular-nums">{formatRupiah(preview.subtotal)}</dd>
                </div>
                {Number(preview.discountAmount) > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Diskon</dt>
                    <dd className="tabular-nums">- {formatRupiah(preview.discountAmount)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">PPN {vatPercent}%</dt>
                  <dd className="tabular-nums">{formatRupiah(preview.vatAmount)}</dd>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatRupiah(preview.total)}</dd>
                </div>
                <p className="pt-1 text-xs italic text-muted-foreground">
                  Terbilang: {preview.terbilang}
                </p>
              </dl>
            ) : (
              <p className="text-sm text-destructive">{preview.error}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant="outline"
          disabled={pending}
          onClick={() => {
            submitMode.current = false;
          }}
        >
          {pending && <Spinner data-icon="inline-start" />}
          Simpan draft
        </Button>
        <Button
          type="submit"
          disabled={pending}
          onClick={() => {
            submitMode.current = true;
          }}
        >
          {pending ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}
          Simpan & terbitkan
        </Button>
        <p className="text-xs text-muted-foreground">
          Nomor surat terbit saat &quot;terbitkan&quot; — draft tidak membakar nomor.
        </p>
      </div>
    </form>
  );
}
