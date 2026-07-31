import { describe, expect, it } from 'vitest'
import {
  counterYear,
  formatQuotationNumber,
  padSeq,
  toRomanMonth,
  withRevision,
} from './quotation-number'

describe('toRomanMonth', () => {
  it('memetakan seluruh bulan', () => {
    const expected = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
    expected.forEach((roman, index) => {
      expect(toRomanMonth(index + 1)).toBe(roman)
    })
  })

  it('menolak bulan di luar rentang', () => {
    expect(() => toRomanMonth(0)).toThrow(RangeError)
    expect(() => toRomanMonth(13)).toThrow(RangeError)
    expect(() => toRomanMonth(1.5)).toThrow(RangeError)
  })
})

describe('padSeq', () => {
  it('memberi nol di depan hingga tiga digit', () => {
    expect(padSeq(1)).toBe('001')
    expect(padSeq(12)).toBe('012')
    expect(padSeq(999)).toBe('999')
  })

  // Nomor tidak boleh terpotong saat melewati 999.
  it('melebar melewati 999', () => {
    expect(padSeq(1000)).toBe('1000')
    expect(padSeq(12345)).toBe('12345')
  })

  it('menolak nomor tidak valid', () => {
    expect(() => padSeq(0)).toThrow(RangeError)
    expect(() => padSeq(-1)).toThrow(RangeError)
    expect(() => padSeq(1.5)).toThrow(RangeError)
  })
})

describe('formatQuotationNumber', () => {
  it('memakai template default', () => {
    expect(formatQuotationNumber({ seq: 1, issuedAt: new Date(2026, 6, 23) })).toBe(
      '001/SPH/VII/2026'
    )
  })

  it('mengambil bulan dan tahun dari tanggal terbit', () => {
    expect(formatQuotationNumber({ seq: 3, issuedAt: new Date(2026, 0, 15) })).toBe(
      '003/SPH/I/2026'
    )
    expect(formatQuotationNumber({ seq: 47, issuedAt: new Date(2027, 11, 31) })).toBe(
      '047/SPH/XII/2027'
    )
  })

  it('mereproduksi format Metito lewat prefix', () => {
    expect(
      formatQuotationNumber({
        seq: 1,
        issuedAt: new Date(2026, 6, 23),
        prefix: 'SPH-Metito',
      })
    ).toBe('001/SPH-Metito/VII/2026')
  })

  it('mendukung template kustom per organisasi', () => {
    expect(
      formatQuotationNumber({
        seq: 5,
        issuedAt: new Date(2026, 6, 1),
        prefix: 'QUO-ABC',
        template: '{prefix}/{seq:4}/{month:2}/{yearShort}',
      })
    ).toBe('QUO-ABC/0005/07/26')
  })

  it('seq tanpa lebar tidak diberi nol di depan', () => {
    expect(
      formatQuotationNumber({
        seq: 7,
        issuedAt: new Date(2026, 6, 1),
        template: '{seq}/{prefix}/{year}',
      })
    ).toBe('7/SPH/2026')
  })

  it('membiarkan token tak dikenal terlihat', () => {
    expect(
      formatQuotationNumber({
        seq: 1,
        issuedAt: new Date(2026, 6, 1),
        template: '{seq:3}/{tokenAneh}',
      })
    ).toBe('001/{tokenAneh}')
  })
})

describe('withRevision', () => {
  const base = '001/SPH-Metito/VII/2026'

  it('tidak mengubah dokumen asli', () => {
    expect(withRevision(base, 0)).toBe(base)
  })

  it('menambahkan penanda revisi', () => {
    expect(withRevision(base, 1)).toBe('001/SPH-Metito/VII/2026 Rev.1')
    expect(withRevision(base, 2)).toBe('001/SPH-Metito/VII/2026 Rev.2')
  })

  it('menolak revisi tidak valid', () => {
    expect(() => withRevision(base, -1)).toThrow(RangeError)
    expect(() => withRevision(base, 1.5)).toThrow(RangeError)
  })
})

describe('counterYear', () => {
  // Counter di-reset tiap Januari, jadi kuncinya (organisasi, tahun).
  it('memakai tahun dari tanggal terbit', () => {
    expect(counterYear(new Date(2026, 0, 1))).toBe(2026)
    expect(counterYear(new Date(2026, 11, 31))).toBe(2026)
    expect(counterYear(new Date(2027, 0, 1))).toBe(2027)
  })

  it('nomor urut berlanjut lintas bulan dalam tahun yang sama', () => {
    const januari = formatQuotationNumber({ seq: 1, issuedAt: new Date(2026, 0, 15) })
    const juli = formatQuotationNumber({ seq: 2, issuedAt: new Date(2026, 6, 23) })

    expect(januari).toBe('001/SPH/I/2026')
    expect(juli).toBe('002/SPH/VII/2026')
    // Bulan berbeda tidak me-reset nomor urut.
    expect(juli.startsWith('001')).toBe(false)
  })
})
