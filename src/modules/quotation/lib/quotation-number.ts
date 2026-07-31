/**
 * Pembentukan nomor surat penawaran. (Port dari Metito, digeneralisasi.)
 *
 * Di Metito polanya hardcoded `001/SPH-Metito/VII/2026`. Di SaaS multi-tenant,
 * format menjadi TEMPLATE per-organisasi (disimpan di OrgSettings.numberFormat)
 * dengan token:
 *
 *   {seq}        nomor urut apa adanya
 *   {seq:N}      nomor urut di-pad nol hingga N digit (melebar bila lebih)
 *   {prefix}     prefix organisasi (OrgSettings.numberPrefix, mis. "SPH-ABC")
 *   {romanMonth} bulan Romawi (I..XII)
 *   {month}      bulan angka (1..12)
 *   {month:2}    bulan angka 2 digit (01..12)
 *   {year}       tahun 4 digit
 *   {yearShort}  tahun 2 digit
 *
 * Default: "{seq:3}/{prefix}/{romanMonth}/{year}" -> "007/SPH/VII/2026".
 */

export const DEFAULT_NUMBER_FORMAT = "{seq:3}/{prefix}/{romanMonth}/{year}";
export const DEFAULT_NUMBER_PREFIX = "SPH";

/** Lebar minimum nomor urut untuk padSeq klasik; melebar sendiri bila melewati batas. */
export const SEQ_MIN_WIDTH = 3;

const ROMAN_MONTHS = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
] as const;

export interface QuotationNumberParts {
  /** Nomor urut dari counter tahunan per-organisasi, dimulai dari 1. */
  seq: number;
  /** Tanggal terbit; menentukan bulan dan tahun. */
  issuedAt: Date;
  /** Prefix organisasi (OrgSettings.numberPrefix). */
  prefix?: string;
  /** Template format (OrgSettings.numberFormat). */
  template?: string;
}

/** Mengubah bulan 1..12 menjadi angka Romawi. */
export function toRomanMonth(month: number): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`quotation-number: bulan harus 1..12, diterima ${month}`);
  }
  return ROMAN_MONTHS[month - 1];
}

/** Memberi nol di depan hingga lebar minimum, tanpa memotong angka besar. */
export function padSeq(seq: number, width: number = SEQ_MIN_WIDTH): string {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new RangeError(`quotation-number: nomor urut harus bilangan bulat >= 1, diterima ${seq}`);
  }
  return String(seq).padStart(width, "0");
}

/** Membentuk nomor dasar dari template, belum termasuk penanda revisi. */
export function formatQuotationNumber({
  seq,
  issuedAt,
  prefix = DEFAULT_NUMBER_PREFIX,
  template = DEFAULT_NUMBER_FORMAT,
}: QuotationNumberParts): string {
  const month = issuedAt.getMonth() + 1;
  const year = issuedAt.getFullYear();

  return template.replace(/\{(\w+)(?::(\d+))?\}/g, (raw, token: string, widthRaw?: string) => {
    switch (token) {
      case "seq":
        return widthRaw ? padSeq(seq, Number(widthRaw)) : padSeq(seq, 1);
      case "prefix":
        return prefix;
      case "romanMonth":
        return toRomanMonth(month);
      case "month":
        return widthRaw ? String(month).padStart(Number(widthRaw), "0") : String(month);
      case "year":
        return String(year);
      case "yearShort":
        return String(year).slice(-2);
      default:
        // Token tak dikenal dibiarkan apa adanya agar mudah terlihat salahnya.
        return raw;
    }
  });
}

/**
 * Menambahkan penanda revisi. Revisi 0 adalah dokumen asli dan tidak diberi
 * penanda, sehingga nomor yang sudah beredar tidak berubah bentuk.
 */
export function withRevision(numberBase: string, revision: number): string {
  if (!Number.isInteger(revision) || revision < 0) {
    throw new RangeError(`quotation-number: revisi harus bilangan bulat >= 0, diterima ${revision}`);
  }
  return revision === 0 ? numberBase : `${numberBase} Rev.${revision}`;
}

/** Tahun yang dipakai sebagai kunci counter (per organisasi). Reset tiap Januari. */
export function counterYear(issuedAt: Date): number {
  return issuedAt.getFullYear();
}
