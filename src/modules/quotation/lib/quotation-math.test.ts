import { describe, expect, it } from 'vitest'
import { computeTotals, formatRupiah, lineTotal } from './quotation-math'

describe('lineTotal', () => {
  it('mengalikan qty dengan harga satuan', () => {
    expect(lineTotal(500, 100_000).toFixed(2)).toBe('50000000.00')
    expect(lineTotal(102, 1_560_000).toFixed(2)).toBe('159120000.00')
  })

  it('menangani qty pecahan', () => {
    expect(lineTotal('0.5', 100_000).toFixed(2)).toBe('50000.00')
    expect(lineTotal('1.333', 3).toFixed(2)).toBe('4.00')
  })

  it('menolak nilai negatif', () => {
    expect(() => lineTotal(-1, 100)).toThrow(RangeError)
    expect(() => lineTotal(1, -100)).toThrow(RangeError)
  })

  it('menolak input bukan angka', () => {
    expect(() => lineTotal('abc', 100)).toThrow()
  })
})

describe('computeTotals', () => {
  // Angka diambil langsung dari sheet "Kable In NP" pada Quotation 2026.xlsx.
  it('cocok dengan sheet Kable In NP', () => {
    const result = computeTotals(
      [
        { qty: 500, unitPrice: 100_000 },
        { qty: 500, unitPrice: 150_000 },
        { qty: 500, unitPrice: 220_000 },
      ],
      '0.11'
    )

    expect(result.subtotal.toFixed(0)).toBe('235000000')
    expect(result.vatAmount.toFixed(0)).toBe('25850000')
    expect(result.total.toFixed(0)).toBe('260850000')
  })

  // Sheet "Chemical Safetindo".
  it('cocok dengan sheet Chemical Safetindo', () => {
    const result = computeTotals(
      [
        { qty: 4, unitPrice: 375_000 },
        { qty: 102, unitPrice: 1_560_000 },
        { qty: 4, unitPrice: 220_000 },
      ],
      '0.11'
    )

    expect(result.subtotal.toFixed(0)).toBe('161500000')
    expect(result.vatAmount.toFixed(0)).toBe('17765000')
    expect(result.total.toFixed(0)).toBe('179265000')
  })

  // Sheet "Kable In NP (2)".
  it('cocok dengan sheet Kable In NP (2)', () => {
    const result = computeTotals(
      [
        { qty: 500, unitPrice: 120_000 },
        { qty: 500, unitPrice: 250_000 },
        { qty: 500, unitPrice: 220_000 },
      ],
      '0.11'
    )

    expect(result.subtotal.toFixed(0)).toBe('295000000')
    expect(result.vatAmount.toFixed(0)).toBe('32450000')
    expect(result.total.toFixed(0)).toBe('327450000')
  })

  it('mengembalikan total per baris sesuai urutan', () => {
    const result = computeTotals(
      [
        { qty: 4, unitPrice: 375_000 },
        { qty: 102, unitPrice: 1_560_000 },
      ],
      '0.11'
    )

    expect(result.lineTotals.map((d) => d.toFixed(0))).toEqual(['1500000', '159120000'])
  })

  it('menangani dokumen kosong', () => {
    const result = computeTotals([], '0.11')
    expect(result.subtotal.toFixed(0)).toBe('0')
    expect(result.vatAmount.toFixed(0)).toBe('0')
    expect(result.total.toFixed(0)).toBe('0')
  })

  it('menangani PPN nol', () => {
    const result = computeTotals([{ qty: 1, unitPrice: 1_000 }], 0)
    expect(result.vatAmount.toFixed(0)).toBe('0')
    expect(result.total.toFixed(0)).toBe('1000')
  })

  it('mendukung tarif PPN selain 11 persen', () => {
    const result = computeTotals([{ qty: 1, unitPrice: 100_000_000 }], '0.12')
    expect(result.vatAmount.toFixed(0)).toBe('12000000')
    expect(result.total.toFixed(0)).toBe('112000000')
  })

  // PPN dibulatkan tepat satu kali, ke rupiah penuh.
  it('membulatkan PPN ke rupiah penuh sekali saja', () => {
    const result = computeTotals([{ qty: 1, unitPrice: 1_005 }], '0.11')
    // 1005 * 0.11 = 110.55 -> 111
    expect(result.vatAmount.toFixed(0)).toBe('111')
    expect(result.total.toFixed(0)).toBe('1116')
  })

  it('tidak menumpuk galat pembulatan antar baris', () => {
    // Sepuluh baris @ 0,555 rupiah. Membulatkan tiap baris ke rupiah penuh
    // akan memberi 10; membulatkan sekali di akhir memberi 5,55 -> 6.
    const items = Array.from({ length: 10 }, () => ({ qty: 1, unitPrice: '0.555' }))
    const result = computeTotals(items, 1)
    expect(result.subtotal.toFixed(2)).toBe('5.60')
    expect(result.vatAmount.toFixed(0)).toBe('6')
  })

  it('menolak tarif PPN negatif', () => {
    expect(() => computeTotals([], -0.1)).toThrow(RangeError)
  })
})

describe('diskon per-item', () => {
  it('mengurangi total baris sesuai persen', () => {
    expect(lineTotal(10, 100_000, 10).toFixed(2)).toBe('900000.00')
    expect(lineTotal(1, 1_000, '2.5').toFixed(2)).toBe('975.00')
  })

  it('diskon 0 identik dengan tanpa diskon', () => {
    expect(lineTotal(500, 100_000, 0).toFixed(2)).toBe(lineTotal(500, 100_000).toFixed(2))
  })

  it('menolak diskon di luar 0..100', () => {
    expect(() => lineTotal(1, 100, -1)).toThrow(RangeError)
    expect(() => lineTotal(1, 100, 101)).toThrow(RangeError)
  })
})

describe('diskon dokumen', () => {
  it('diskon nominal mengurangi dasar pengenaan PPN', () => {
    const result = computeTotals(
      [{ qty: 1, unitPrice: 10_000_000 }],
      '0.11',
      { type: 'AMOUNT', value: 1_000_000 }
    )
    expect(result.subtotal.toFixed(0)).toBe('10000000')
    expect(result.discountAmount.toFixed(0)).toBe('1000000')
    expect(result.taxBase.toFixed(0)).toBe('9000000')
    expect(result.vatAmount.toFixed(0)).toBe('990000')
    expect(result.total.toFixed(0)).toBe('9990000')
  })

  it('diskon persen dihitung dari subtotal', () => {
    const result = computeTotals(
      [{ qty: 1, unitPrice: 10_000_000 }],
      '0.11',
      { type: 'PERCENT', value: 5 }
    )
    expect(result.discountAmount.toFixed(0)).toBe('500000')
    expect(result.taxBase.toFixed(0)).toBe('9500000')
    expect(result.vatAmount.toFixed(0)).toBe('1045000')
    expect(result.total.toFixed(0)).toBe('10545000')
  })

  it('tanpa diskon hasil identik dengan perhitungan Metito', () => {
    const tanpa = computeTotals([{ qty: 500, unitPrice: 100_000 }], '0.11')
    const denganNol = computeTotals([{ qty: 500, unitPrice: 100_000 }], '0.11', {
      type: 'AMOUNT',
      value: 0,
    })
    expect(tanpa.total.toFixed(0)).toBe(denganNol.total.toFixed(0))
  })

  it('menolak diskon dokumen melebihi subtotal', () => {
    expect(() =>
      computeTotals([{ qty: 1, unitPrice: 1_000 }], '0.11', { type: 'AMOUNT', value: 2_000 })
    ).toThrow(RangeError)
  })

  it('menolak diskon persen di atas 100', () => {
    expect(() =>
      computeTotals([{ qty: 1, unitPrice: 1_000 }], '0.11', { type: 'PERCENT', value: 101 })
    ).toThrow(RangeError)
  })
})

describe('formatRupiah', () => {
  it('memformat dengan pemisah ribuan Indonesia', () => {
    expect(formatRupiah(260_850_000)).toBe('Rp 260.850.000')
    expect(formatRupiah('179265000')).toBe('Rp 179.265.000')
    expect(formatRupiah(0)).toBe('Rp 0')
  })
})
