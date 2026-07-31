"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48);
}

export function OnboardingForm({ userName }: { userName: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name")).trim();
    const finalSlug = slugify(String(form.get("slug")) || name);

    setLoading(true);
    const { data, error } = await authClient.organization.create({
      name,
      slug: finalSlug,
    });
    if (error || !data) {
      setLoading(false);
      toast.error(error?.message ?? "Gagal membuat organisasi. Slug mungkin sudah dipakai.");
      return;
    }
    await authClient.organization.setActive({ organizationId: data.id });
    setLoading(false);
    toast.success(`Organisasi ${name} berhasil dibuat.`);
    router.push("/app");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Selamat datang, {userName}</CardTitle>
        <CardDescription>
          Buat organisasi untuk perusahaan Anda. Semua data (katalog, pelanggan,
          penawaran) tersimpan per-organisasi.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Nama perusahaan</FieldLabel>
              <Input
                id="name"
                name="name"
                placeholder="PT Tirta Teknik Nusantara"
                required
                onChange={(e) => {
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="slug">Slug (alamat unik)</FieldLabel>
              <Input
                id="slug"
                name="slug"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                placeholder="tirta-teknik"
                required
              />
              <FieldDescription>
                Dipakai sebagai penanda unik organisasi. Huruf kecil dan tanda hubung.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="pt-6">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Spinner data-icon="inline-start" />}
            Buat organisasi
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
