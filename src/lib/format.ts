import { Decimal } from "decimal.js";

/** Format helper tampilan (id-ID). Uang dihitung di server dengan decimal.js. */

export function formatRupiah(value: string | number | Decimal): string {
  const d = value instanceof Decimal ? value : new Decimal(value || 0);
  return `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(
    Number(d.toFixed(0)),
  )}`;
}

export function formatAngka(value: string | number): string {
  const d = new Decimal(value || 0);
  const n = Number(d.toString());
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(n);
}

export function formatTanggal(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(d);
}

export function formatTanggalPanjang(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(d);
}

export function formatTanggalWaktu(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/** Normalisasi nomor WA Indonesia ke format wa.me: 08xx -> 628xx. */
export function toWaNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("62")) return digits;
  return `62${digits}`;
}
