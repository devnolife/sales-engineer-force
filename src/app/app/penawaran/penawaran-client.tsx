"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
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

const STATUS_OPTIONS = [
  { value: "semua", label: "Semua status" },
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Terkirim" },
  { value: "EXPIRED", label: "Kedaluwarsa" },
  { value: "WON", label: "Menang" },
  { value: "LOST", label: "Kalah" },
];

export function PenawaranToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function applyParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

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
            placeholder="Cari nomor/pelanggan/perihal…"
            defaultValue={searchParams.get("cari") ?? ""}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
      </form>

      <Select
        value={searchParams.get("status") ?? "semua"}
        onValueChange={(v) => applyParam("status", v === "semua" ? "" : v)}
      >
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("tahun") ?? "semua"}
        onValueChange={(v) => applyParam("tahun", v === "semua" ? "" : v)}
      >
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="semua">Semua tahun</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
