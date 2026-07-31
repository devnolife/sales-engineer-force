import { Decimal } from "decimal.js";

/**
 * Perhitungan uang untuk surat penawaran. (Port dari Metito, digeneralisasi.)
 *
 * Semua operasi memakai decimal.js — nilai disimpan di DB sebagai string
 * desimal (SQLite tidak punya tipe Decimal; di PostgreSQL nanti menjadi kolom
 * Decimal). Angka di layar, di database, dan di dokumen cetak selalu identik.
 *
 * Kebijakan pembulatan (invariant Metito dipertahankan):
 * - Total per baris dibulatkan ke 2 desimal.
 * - Pembulatan ke rupiah penuh dilakukan TEPAT SATU KALI, saat menghitung PPN,
 *   agar tidak terjadi penumpukan galat pembulatan.
 *
 * Perluasan (PRD §7.3): diskon per-item (persen) dan diskon per-dokumen
 * (nominal atau persen). PPN dihitung dari dasar pengenaan (subtotal - diskon
 * dokumen). Tanpa diskon, hasil identik dengan versi Metito.
 */

export type DecimalInput = Decimal | string | number;

const ROUND = Decimal.ROUND_HALF_UP;
const HUNDRED = new Decimal(100);

export type DocDiscountType = "AMOUNT" | "PERCENT";

export interface QuotationLineInput {
  qty: DecimalInput;
  unitPrice: DecimalInput;
  /** Diskon per-item dalam persen (0..100). Opsional; default 0. */
  discountPercent?: DecimalInput;
}

export interface DocDiscountInput {
  type: DocDiscountType;
  value: DecimalInput;
}

export interface QuotationTotals {
  /** Total tiap baris (setelah diskon item), 2 desimal, urut sesuai input. */
  lineTotals: Decimal[];
  /** Jumlah seluruh baris sebelum diskon dokumen dan PPN. */
  subtotal: Decimal;
  /** Diskon dokumen dalam nominal (0 bila tidak ada). */
  discountAmount: Decimal;
  /** Dasar pengenaan PPN = subtotal - diskon dokumen. */
  taxBase: Decimal;
  /** Nilai PPN, dibulatkan ke rupiah penuh (satu-satunya titik pembulatan). */
  vatAmount: Decimal;
  /** taxBase + PPN. */
  total: Decimal;
}

function toDecimal(value: DecimalInput, label: string): Decimal {
  const d = value instanceof Decimal ? value : new Decimal(value as string | number);
  if (!d.isFinite()) {
    throw new TypeError(`quotation-math: ${label} bukan angka valid: ${String(value)}`);
  }
  return d;
}

/**
 * Total satu baris: qty x harga satuan x (1 - diskon%), dibulatkan ke 2 desimal.
 */
export function lineTotal(
  qty: DecimalInput,
  unitPrice: DecimalInput,
  discountPercent: DecimalInput = 0,
): Decimal {
  const q = toDecimal(qty, "qty");
  const p = toDecimal(unitPrice, "unitPrice");
  const disc = toDecimal(discountPercent, "discountPercent");

  if (q.isNegative()) throw new RangeError("quotation-math: qty tidak boleh negatif");
  if (p.isNegative()) throw new RangeError("quotation-math: harga satuan tidak boleh negatif");
  if (disc.isNegative() || disc.greaterThan(HUNDRED)) {
    throw new RangeError("quotation-math: diskon item harus 0..100 persen");
  }

  const gross = q.mul(p);
  const net = disc.isZero() ? gross : gross.mul(HUNDRED.sub(disc)).div(HUNDRED);
  return net.toDecimalPlaces(2, ROUND);
}

/**
 * Menghitung seluruh nilai dokumen.
 *
 * PPN ditambahkan di atas dasar pengenaan (bukan termasuk di dalamnya).
 * Urutan: baris (diskon item) -> subtotal -> diskon dokumen -> PPN -> total.
 */
export function computeTotals(
  items: readonly QuotationLineInput[],
  vatRate: DecimalInput,
  docDiscount?: DocDiscountInput,
): QuotationTotals {
  const rate = toDecimal(vatRate, "vatRate");
  if (rate.isNegative()) throw new RangeError("quotation-math: tarif PPN tidak boleh negatif");

  const lineTotals = items.map((item) =>
    lineTotal(item.qty, item.unitPrice, item.discountPercent ?? 0),
  );

  const subtotal = lineTotals.reduce((sum, value) => sum.add(value), new Decimal(0));

  let discountAmount = new Decimal(0);
  if (docDiscount) {
    const v = toDecimal(docDiscount.value, "docDiscount.value");
    if (v.isNegative()) throw new RangeError("quotation-math: diskon dokumen tidak boleh negatif");
    if (docDiscount.type === "PERCENT") {
      if (v.greaterThan(HUNDRED)) {
        throw new RangeError("quotation-math: diskon dokumen (persen) harus 0..100");
      }
      discountAmount = subtotal.mul(v).div(HUNDRED).toDecimalPlaces(2, ROUND);
    } else {
      if (v.greaterThan(subtotal)) {
        throw new RangeError("quotation-math: diskon dokumen melebihi subtotal");
      }
      discountAmount = v.toDecimalPlaces(2, ROUND);
    }
  }

  const taxBase = subtotal.sub(discountAmount);

  // Satu-satunya titik pembulatan ke rupiah penuh.
  const vatAmount = taxBase.mul(rate).toDecimalPlaces(0, ROUND);

  return {
    lineTotals,
    subtotal,
    discountAmount,
    taxBase,
    vatAmount,
    total: taxBase.add(vatAmount),
  };
}

/** Format rupiah untuk tampilan, mis. "Rp 260.850.000". */
export function formatRupiah(value: DecimalInput): string {
  const d = toDecimal(value, "value");
  return `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(d.toFixed(0)))}`;
}
