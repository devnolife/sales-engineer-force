/**
 * Konversi nilai rupiah menjadi kata-kata bahasa Indonesia.
 *
 * Dipakai pada surat penawaran, di mana "Terbilang" harus selalu cocok dengan
 * total. Pada berkas Excel lama nilai ini disalin manual antar sheet sehingga
 * pernah tertulis "Dua Ratus Enam Puluh Juta ..." untuk total Rp 179.265.000.
 * Fungsi ini menurunkan terbilang dari angkanya, sehingga selisih itu mustahil.
 *
 * Aturan awalan "se-" hanya berlaku untuk sepuluh, sebelas, seratus, dan
 * seribu. Untuk juta ke atas dipakai bentuk penuh: "satu juta", bukan "sejuta".
 */

const SATUAN = [
  '',
  'satu',
  'dua',
  'tiga',
  'empat',
  'lima',
  'enam',
  'tujuh',
  'delapan',
  'sembilan',
] as const

const SKALA = [
  { value: BigInt(1_000_000_000_000), name: 'triliun' },
  { value: BigInt(1_000_000_000), name: 'miliar' },
  { value: BigInt(1_000_000), name: 'juta' },
  { value: BigInt(1_000), name: 'ribu' },
] as const

// Literal BigInt (0n) memerlukan target ES2020; proyek ini masih ES6.
const ZERO = BigInt(0)
const ONE = BigInt(1)
const SERIBU = BigInt(1000)

/** Mengubah bilangan 1..999 menjadi kata. Mengembalikan '' untuk 0. */
function dibawahSeribu(n: number): string {
  if (n <= 0) return ''

  const parts: string[] = []
  const ratusan = Math.floor(n / 100)
  const sisa = n % 100

  if (ratusan === 1) {
    parts.push('seratus')
  } else if (ratusan > 1) {
    parts.push(SATUAN[ratusan], 'ratus')
  }

  if (sisa > 0) {
    if (sisa < 10) {
      parts.push(SATUAN[sisa])
    } else if (sisa === 10) {
      parts.push('sepuluh')
    } else if (sisa === 11) {
      parts.push('sebelas')
    } else if (sisa < 20) {
      parts.push(SATUAN[sisa - 10], 'belas')
    } else {
      const puluhan = Math.floor(sisa / 10)
      const satuan = sisa % 10
      parts.push(SATUAN[puluhan], 'puluh')
      if (satuan > 0) parts.push(SATUAN[satuan])
    }
  }

  return parts.join(' ')
}

/**
 * Menormalkan input ke bigint rupiah bulat.
 * Menerima number, bigint, atau string agar aman dipakai dengan Prisma.Decimal
 * (lewat .toFixed(0)) tanpa melewati presisi float.
 */
function keBigInt(input: number | bigint | string): bigint {
  if (typeof input === 'bigint') return input

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new TypeError(`terbilang: nilai tidak valid: ${input}`)
    }
    return BigInt(Math.round(input))
  }

  const trimmed = input.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new TypeError(`terbilang: nilai tidak valid: ${input}`)
  }
  // Bulatkan pecahan ke rupiah terdekat sebelum dikonversi.
  return BigInt(Math.round(Number(trimmed)))
}

/** Terbilang dalam huruf kecil, tanpa kata "rupiah". */
export function terbilang(input: number | bigint | string): string {
  const n = keBigInt(input)

  if (n < ZERO) return `minus ${terbilang(-n)}`
  if (n === ZERO) return 'nol'

  const parts: string[] = []
  let sisa = n

  for (const skala of SKALA) {
    const jumlah = sisa / skala.value
    if (jumlah > ZERO) {
      if (skala.name === 'ribu' && jumlah === ONE) {
        parts.push('seribu')
      } else if (jumlah >= SERIBU) {
        // Melindungi skala di atas triliun, mis. 1.000 triliun.
        parts.push(terbilang(jumlah), skala.name)
      } else {
        parts.push(dibawahSeribu(Number(jumlah)), skala.name)
      }
      sisa %= skala.value
    }
  }

  if (sisa > ZERO) parts.push(dibawahSeribu(Number(sisa)))

  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

/** Mengubah setiap kata menjadi berawalan huruf besar. */
function keKapitalPerKata(text: string): string {
  return text.replace(/(^|\s)(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
}

/**
 * Bentuk siap cetak untuk dokumen penawaran, mengikuti gaya berkas Excel lama:
 * "Dua Ratus Enam Puluh Juta Delapan Ratus Lima Puluh Ribu Rupiah".
 */
export function terbilangRupiah(input: number | bigint | string): string {
  return `${keKapitalPerKata(terbilang(input))} Rupiah`
}
