import { describe, expect, it } from 'vitest'
import { terbilang, terbilangRupiah } from './terbilang'

describe('terbilang', () => {
  it('menangani nol', () => {
    expect(terbilang(0)).toBe('nol')
  })

  it('menangani satuan', () => {
    expect(terbilang(1)).toBe('satu')
    expect(terbilang(7)).toBe('tujuh')
    expect(terbilang(9)).toBe('sembilan')
  })

  // Awalan "se-" hanya untuk sepuluh, sebelas, seratus, seribu.
  it('memakai bentuk "se-" pada tempat yang benar', () => {
    expect(terbilang(10)).toBe('sepuluh')
    expect(terbilang(11)).toBe('sebelas')
    expect(terbilang(100)).toBe('seratus')
    expect(terbilang(1_000)).toBe('seribu')
  })

  it('tidak memakai "se-" untuk juta ke atas', () => {
    expect(terbilang(1_000_000)).toBe('satu juta')
    expect(terbilang(1_000_000_000)).toBe('satu miliar')
    expect(terbilang(1_000_000_000_000)).toBe('satu triliun')
  })

  it('menangani belasan', () => {
    expect(terbilang(12)).toBe('dua belas')
    expect(terbilang(15)).toBe('lima belas')
    expect(terbilang(19)).toBe('sembilan belas')
  })

  it('menangani puluhan dan ratusan', () => {
    expect(terbilang(20)).toBe('dua puluh')
    expect(terbilang(21)).toBe('dua puluh satu')
    expect(terbilang(90)).toBe('sembilan puluh')
    expect(terbilang(101)).toBe('seratus satu')
    expect(terbilang(110)).toBe('seratus sepuluh')
    expect(terbilang(999)).toBe('sembilan ratus sembilan puluh sembilan')
  })

  it('membedakan seribu dan sekian ribu', () => {
    expect(terbilang(1_000)).toBe('seribu')
    expect(terbilang(1_500)).toBe('seribu lima ratus')
    expect(terbilang(2_000)).toBe('dua ribu')
    expect(terbilang(21_000)).toBe('dua puluh satu ribu')
    // "seribu" tetap dipakai walau ada skala di atasnya.
    expect(terbilang(1_001_000)).toBe('satu juta seribu')
  })

  // Nol di tengah tidak boleh memunculkan kata skala yang kosong.
  it('menangani nol di tengah bilangan', () => {
    expect(terbilang(2_000_007)).toBe('dua juta tujuh')
    expect(terbilang(1_000_000_001)).toBe('satu miliar satu')
    expect(terbilang(105)).toBe('seratus lima')
    expect(terbilang(1_000_500)).toBe('satu juta lima ratus')
  })

  // Nilai nyata yang diambil dari Quotation 2026.xlsx.
  it('cocok dengan nilai penawaran yang sudah ada', () => {
    expect(terbilang(1_500_000)).toBe('satu juta lima ratus ribu')
    expect(terbilang(161_500_000)).toBe('seratus enam puluh satu juta lima ratus ribu')
    expect(terbilang(179_265_000)).toBe(
      'seratus tujuh puluh sembilan juta dua ratus enam puluh lima ribu'
    )
    expect(terbilang(250_000_000)).toBe('dua ratus lima puluh juta')
    expect(terbilang(260_850_000)).toBe('dua ratus enam puluh juta delapan ratus lima puluh ribu')
    expect(terbilang(327_450_000)).toBe(
      'tiga ratus dua puluh tujuh juta empat ratus lima puluh ribu'
    )
  })

  it('menerima bigint dan string', () => {
    expect(terbilang(BigInt(260_850_000))).toBe(
      'dua ratus enam puluh juta delapan ratus lima puluh ribu'
    )
    expect(terbilang('179265000')).toBe(
      'seratus tujuh puluh sembilan juta dua ratus enam puluh lima ribu'
    )
    // Prisma.Decimal.toString() dapat menyertakan pecahan.
    expect(terbilang('1500000.00')).toBe('satu juta lima ratus ribu')
  })

  it('membulatkan pecahan ke rupiah terdekat', () => {
    expect(terbilang(1_000.4)).toBe('seribu')
    expect(terbilang(999.5)).toBe('seribu')
  })

  it('menangani nilai negatif', () => {
    expect(terbilang(-1_500_000)).toBe('minus satu juta lima ratus ribu')
  })

  it('menolak input yang tidak valid', () => {
    expect(() => terbilang(Number.NaN)).toThrow(TypeError)
    expect(() => terbilang(Number.POSITIVE_INFINITY)).toThrow(TypeError)
    expect(() => terbilang('abc')).toThrow(TypeError)
  })
})

describe('terbilangRupiah', () => {
  // Gaya penulisan mengikuti berkas Excel lama.
  it('mengembalikan bentuk siap cetak', () => {
    expect(terbilangRupiah(260_850_000)).toBe(
      'Dua Ratus Enam Puluh Juta Delapan Ratus Lima Puluh Ribu Rupiah'
    )
    expect(terbilangRupiah(327_450_000)).toBe(
      'Tiga Ratus Dua Puluh Tujuh Juta Empat Ratus Lima Puluh Ribu Rupiah'
    )
  })

  // Regresi untuk cacat asli: sheet Chemical Safetindo bertotal 179.265.000
  // tetapi terbilangnya tersalin dari sheet lain (260.850.000).
  it('tidak pernah tertukar antar nilai', () => {
    expect(terbilangRupiah(179_265_000)).not.toBe(terbilangRupiah(260_850_000))
    expect(terbilangRupiah(179_265_000)).toBe(
      'Seratus Tujuh Puluh Sembilan Juta Dua Ratus Enam Puluh Lima Ribu Rupiah'
    )
  })

  it('menangani nol', () => {
    expect(terbilangRupiah(0)).toBe('Nol Rupiah')
  })
})
