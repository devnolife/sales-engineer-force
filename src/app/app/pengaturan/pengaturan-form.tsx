"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  simpanNamaOrganisasiAction,
  simpanPengaturanAction,
} from "@/modules/org/actions";
import { formatQuotationNumber } from "@/modules/quotation/lib/quotation-number";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

interface SettingsValue {
  address: string;
  npwp: string;
  phone: string;
  email: string;
  website: string;
  numberPrefix: string;
  numberFormat: string;
  revisionMode: "SUFFIX" | "NEW_NUMBER";
  vatPercent: number;
  bankName: string;
  bankAccount: string;
  bankBranch: string;
  bankHolder: string;
  signerName: string;
  signerTitle: string;
  defaultFranco: string;
  defaultDeliveryTime: string;
  defaultTermsOfPayment: string;
  defaultPriceIncludeNote: string;
  defaultValidityDays: number;
}

export function PengaturanForm({
  orgName,
  settings,
}: {
  orgName: string;
  settings: SettingsValue;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(orgName);
  const [prefix, setPrefix] = useState(settings.numberPrefix);
  const [format, setFormat] = useState(settings.numberFormat);
  const [revisionMode, setRevisionMode] = useState(settings.revisionMode);

  let contohNomor = "";
  try {
    contohNomor = formatQuotationNumber({
      seq: 7,
      issuedAt: new Date(),
      prefix,
      template: format,
    });
  } catch {
    contohNomor = "(format tidak valid)";
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const val = (k: string) => String(fd.get(k) ?? "");

    startTransition(async () => {
      if (name.trim() !== orgName) {
        const r = await simpanNamaOrganisasiAction(name);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
      }
      const result = await simpanPengaturanAction({
        address: val("address"),
        npwp: val("npwp"),
        phone: val("phone"),
        email: val("email"),
        website: val("website"),
        numberPrefix: prefix,
        numberFormat: format,
        revisionMode,
        vatPercent: Number(val("vatPercent")),
        bankName: val("bankName"),
        bankAccount: val("bankAccount"),
        bankBranch: val("bankBranch"),
        bankHolder: val("bankHolder"),
        signerName: val("signerName"),
        signerTitle: val("signerTitle"),
        defaultFranco: val("defaultFranco"),
        defaultDeliveryTime: val("defaultDeliveryTime"),
        defaultTermsOfPayment: val("defaultTermsOfPayment"),
        defaultPriceIncludeNote: val("defaultPriceIncludeNote"),
        defaultValidityDays: Number(val("defaultValidityDays")),
      });
      if (result.ok) toast.success("Pengaturan tersimpan.");
      else toast.error(result.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Profil & Kop Surat</CardTitle>
          <CardDescription>
            Identitas ini dicetak pada kop dokumen penawaran (di-snapshot saat terbit).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="orgName">Nama perusahaan</FieldLabel>
              <Input
                id="orgName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="address">Alamat</FieldLabel>
              <Textarea
                id="address"
                name="address"
                defaultValue={settings.address}
                rows={2}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="npwp">NPWP</FieldLabel>
                <Input id="npwp" name="npwp" defaultValue={settings.npwp} />
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">Telepon</FieldLabel>
                <Input id="phone" name="phone" defaultValue={settings.phone} />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" name="email" type="email" defaultValue={settings.email} />
              </Field>
              <Field>
                <FieldLabel htmlFor="website">Website</FieldLabel>
                <Input id="website" name="website" defaultValue={settings.website} />
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Penomoran & PPN</CardTitle>
          <CardDescription>
            Nomor terbit saat penawaran di-issue (bukan saat draft), atomik per tahun.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="numberPrefix">Prefix nomor</FieldLabel>
                <Input
                  id="numberPrefix"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  required
                />
                <FieldDescription>Contoh: SPH atau SPH-ABC.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="numberFormat">Format nomor</FieldLabel>
                <Input
                  id="numberFormat"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  required
                />
                <FieldDescription>
                  Token: {"{seq:3} {prefix} {romanMonth} {month:2} {year} {yearShort}"}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="vatPercent">Tarif PPN (%)</FieldLabel>
                <Input
                  id="vatPercent"
                  name="vatPercent"
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  defaultValue={settings.vatPercent}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="revisionMode">Mode nomor revisi</FieldLabel>
                <Select
                  value={revisionMode}
                  onValueChange={(v) => setRevisionMode(v as "SUFFIX" | "NEW_NUMBER")}
                >
                  <SelectTrigger id="revisionMode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="SUFFIX">
                        Sufiks Rev.N (nomor induk dipertahankan)
                      </SelectItem>
                      <SelectItem value="NEW_NUMBER">Nomor baru tiap revisi</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <p className="text-sm text-muted-foreground">
              Contoh nomor: <span className="font-mono text-foreground">{contohNomor}</span>
            </p>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rekening & Penandatangan</CardTitle>
          <CardDescription>Dicetak di bagian bawah dokumen penawaran.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="bankName">Nama bank</FieldLabel>
              <Input id="bankName" name="bankName" defaultValue={settings.bankName} />
            </Field>
            <Field>
              <FieldLabel htmlFor="bankAccount">Nomor rekening</FieldLabel>
              <Input id="bankAccount" name="bankAccount" defaultValue={settings.bankAccount} />
            </Field>
            <Field>
              <FieldLabel htmlFor="bankBranch">Cabang</FieldLabel>
              <Input id="bankBranch" name="bankBranch" defaultValue={settings.bankBranch} />
            </Field>
            <Field>
              <FieldLabel htmlFor="bankHolder">Atas nama</FieldLabel>
              <Input id="bankHolder" name="bankHolder" defaultValue={settings.bankHolder} />
            </Field>
            <Field>
              <FieldLabel htmlFor="signerName">Nama penandatangan</FieldLabel>
              <Input id="signerName" name="signerName" defaultValue={settings.signerName} />
            </Field>
            <Field>
              <FieldLabel htmlFor="signerTitle">Jabatan penandatangan</FieldLabel>
              <Input id="signerTitle" name="signerTitle" defaultValue={settings.signerTitle} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Default Syarat & Ketentuan</CardTitle>
          <CardDescription>
            Nilai awal saat membuat penawaran baru; tetap bisa diubah per dokumen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="defaultFranco">Franco</FieldLabel>
              <Input id="defaultFranco" name="defaultFranco" defaultValue={settings.defaultFranco} />
            </Field>
            <Field>
              <FieldLabel htmlFor="defaultDeliveryTime">Waktu pengiriman</FieldLabel>
              <Input
                id="defaultDeliveryTime"
                name="defaultDeliveryTime"
                defaultValue={settings.defaultDeliveryTime}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="defaultTermsOfPayment">Termin pembayaran</FieldLabel>
              <Input
                id="defaultTermsOfPayment"
                name="defaultTermsOfPayment"
                defaultValue={settings.defaultTermsOfPayment}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="defaultPriceIncludeNote">Catatan harga</FieldLabel>
              <Input
                id="defaultPriceIncludeNote"
                name="defaultPriceIncludeNote"
                defaultValue={settings.defaultPriceIncludeNote}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="defaultValidityDays">Masa berlaku (hari)</FieldLabel>
              <Input
                id="defaultValidityDays"
                name="defaultValidityDays"
                type="number"
                min={1}
                max={365}
                defaultValue={settings.defaultValidityDays}
                required
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner data-icon="inline-start" />}
          Simpan pengaturan
        </Button>
      </div>
    </form>
  );
}
