# Implementation Plan — Fase 1: Fondasi Multi-Tenant

- **Status**: Draft untuk review
- **Tanggal**: 2026-07-30
- **Referensi**: [PRD §6 Fase 1](PRD.md) | Analisis codebase `metito-new` (sumber aset port)
- **Target durasi**: ±2 bulan (8–9 minggu), solo dev
- **Level detail**: per milestone (breakdown task dilakukan saat milestone dimulai)

---

## 1. Tujuan Fase 1

Menggantikan Excel sebagai alat kerja penawaran di perusahaan B2B teknik, multi-tenant sejak hari pertama.

**Exit criteria (dari PRD)**: Metito membuat 100% penawaran barunya via platform selama 2 minggu berturut-turut tanpa kembali ke Excel.

## 2. Prinsip Eksekusi

1. **Port dulu yang teruji** — engine quotation Metito (math, terbilang, numbering, lifecycle) sudah punya ±76 unit test dan uji konkurensi; port beserta test-nya, jangan tulis ulang.
2. **Tenant isolation bukan fitur, tapi fondasi** — Prisma extension + test isolasi masuk CI sebelum modul data pertama dibuat.
3. **Setiap milestone menghasilkan sesuatu yang bisa didemokan** — feedback Metito bisa masuk sejak M3, bukan menunggu akhir fase.
4. **Kualitas uang tidak bisa ditawar** — semua kalkulasi server-side, Decimal, satu titik pembulatan; totals tidak pernah diterima dari client (invariant Metito dipertahankan).

## 3. Ringkasan Milestone

| # | Milestone | Deliverable utama | Durasi indikatif | Dependensi |
|---|---|---|---|---|
| M0 | Scaffold & fondasi teknis | Repo berjalan: Next.js 15 + Prisma + Docker Compose + CI | 3–4 hari | — |
| M1 | Multi-tenant & auth | Signup → buat org → invite member → org settings; isolasi tenant teruji | 1,5 minggu | M0 |
| M2 | Katalog & pelanggan | CRUD produk/kategori + import CSV; CRUD customer + kontak | 1 minggu | M1 |
| M3 | Quotation engine (port Metito) | Draft → issue → revisi multi-tenant; share link publik; form + autocomplete | 2 minggu | M1 (M2 untuk item dari katalog) |
| M4 | PDF server-side | PDF nyata via Gotenberg dengan kop per-organisasi | 0,5–1 minggu | M3 |
| M5 | Pipeline & reminder | Deal + stage + aktivitas + reminder (in-app & email) | 1 minggu | M3 |
| M6 | Dashboard owner | Pipeline per stage, win rate, follow-up jatuh tempo | 0,5 minggu | M5 |
| M7 | Migrasi Metito & hardening | Data Metito masuk, deploy produksi, backup, exit criteria berjalan | 1 minggu + 2 minggu observasi | M4, M6 |

Jalur kritis: M0 → M1 → M3 → M4 → M7. (M2, M5, M6 relatif fleksibel digeser di antaranya.)

---

## 4. Detail Milestone

### M0 — Scaffold & Fondasi Teknis

**Scope**
- Next.js 15+ App Router + TypeScript, Tailwind + shadcn/ui.
- PostgreSQL + Prisma; struktur modul sesuai PRD §8.3 (`src/modules/{org,catalog,customer,quotation,pipeline}`, `src/lib`, `src/app` tipis).
- Docker Compose dev: app, Postgres, Gotenberg (disiapkan sejak awal agar M4 tidak mengubah infrastruktur).
- CI: typecheck + Vitest; konvensi test mengikuti pola Metito (`*.test.ts` co-located).
- Port awal lib murni yang tanpa dependensi: `terbilang.ts` + test (bisa dilakukan di sini karena zero-dependency).

**Definition of done**: `docker compose up` menjalankan app + DB; CI hijau dengan test terbilang lolos; struktur modul terbentuk.

### M1 — Multi-Tenant & Auth

**Scope**
- Better Auth + plugin organization: signup/login (email+password), buat organisasi, undang anggota via email (Resend), role `OWNER | ADMIN | SALES`, session dengan organisasi aktif.
- **Org settings**: nama, logo (upload → Cloudflare R2), alamat, NPWP, telepon; **format nomor penawaran** (template + prefix), **tarif PPN default**, rekening bank, nama/jabatan penandatangan, default T&C (franco, delivery, ToP, validity days).
- **Tenant isolation**: Prisma Client Extension menyuntikkan filter `organizationId` dari request context (AsyncLocalStorage); operasi tanpa org context harus gagal secara eksplisit.
- Test isolasi tenant di CI: query lintas-org gagal, create tanpa org gagal.

**Definition of done**: dua organisasi dummy tidak bisa saling melihat data pada seluruh model yang ada; anggota bisa diundang dan login dengan role benar; settings tersimpan per-org.

**Catatan**: ini milestone paling menentukan arsitektur — jangan lanjut ke M2/M3 sebelum pola isolasi terbukti di test.

### M2 — Katalog & Pelanggan

**Scope**
- `catalog/`: CRUD kategori & produk (nama, spek/deskripsi, unit, harga default, aktif/nonaktif); import CSV (template + validasi + preview error) untuk migrasi cepat dari Excel.
- `customer/`: CRUD perusahaan pelanggan + kontak person (nama, jabatan, WA, email); pencarian.

**Definition of done**: katalog Metito (dari file Excel mereka) berhasil diimport via CSV; customer bisa dibuat dan dicari.

### M3 — Quotation Engine (Port Metito, Digeneralisasi)

Milestone terbesar. Sumber: `metito-new` (`lib/quotation-*.ts`, `lib/terbilang.ts`, service, komponen dokumen, halaman publik).

**Scope — port apa adanya (+ test)**
- `quotation-math.ts`: lineTotal, computeTotals, pembulatan rupiah tepat 1x di PPN, `formatRupiah`.
- `quotation-status.ts`: EXPIRED derived (tidak pernah disimpan), `isEditable`/`isShareable`.
- Pola share token (`randomBytes(24)` base64url), halaman publik `noindex` + `force-dynamic`, view tracking yang tidak pernah memblokir customer, draft selalu 404 di publik.
- Pola service: validasi **sebelum** alokasi nomor; totals selalu dihitung ulang server-side; retry P2002 pada counter.

**Scope — generalisasi (perubahan dari Metito)**
- **Nomor configurable**: template per-org `{seq:3}/{prefix}/{romanMonth}/{year}` menggantikan hardcode `SPH-Metito`; counter atomik per **(organizationId, tahun)** (di Metito PK-nya `year` saja).
- **Scoping tenant**: `@@unique([numberBase, revision])` dan `publicToken` di-scope per-org; semua tabel ber-`organizationId`.
- **Snapshot penuh saat issue**: sertakan kop, rekening bank, dan penandatangan ke dalam snapshot — *menutup gap Metito* yang masih merender bank/signer dari settings live (melanggar immutability PRD §7.2).
- **Item dari katalog ATAU ketik bebas** + autocomplete gabungan (histori item + katalog); di Metito hanya histori.
- **Diskon per-item dan per-dokumen** (PRD §7.3; belum ada di Metito) — masuk ke `quotation-math` dengan test baru.
- Relasi ke `Deal` disiapkan di skema (diisi fungsional di M5).
- Keputusan default (PRD pertanyaan terbuka #3): revisi memakai **sufiks `Rev.N` dengan nomor induk** (pola Metito terbukti); mode "nomor baru" menyusul sebagai opsi konfigurasi.

**Scope — UI**
- List + filter (status termasuk EXPIRED derived, tahun, pencarian), form draft (autocomplete, terbilang live preview, simpan draft / simpan & terbitkan), halaman detail (preview dokumen + aksi issue/revisi/WON/LOST/copy link/kirim WA via `wa.me`), halaman publik `/q/[token]`.

**Definition of done**: seluruh test port + test baru (diskon, template nomor, counter per-org) hijau; uji konkurensi 25 transaksi paralel per-org tanpa nomor duplikat/bolong; dokumen issued terbukti tidak berubah saat settings org diubah; demo ke Metito.

### M4 — PDF Server-Side

**Scope**
- Gotenberg (sudah ada di compose sejak M0): render `QuotationDocument` (route HTML internal khusus print) → PDF A4.
- Kop organisasi (logo dari R2), print CSS diadaptasi dari Metito (`@page` A4, page-break aman untuk tabel panjang).
- Tombol "Unduh PDF" di detail & halaman publik; PDF disimpan/di-cache di R2 per (quotation, revisi) karena dokumen issued immutable.

**Definition of done**: PDF < 5 detik (target NFR PRD §9); hasil identik dengan preview; dokumen multi-halaman tidak memotong baris tabel.

### M5 — Pipeline & Reminder

**Scope**
- `pipeline/`: model `Deal` (customer, stage `LEAD → QUOTED → NEGOTIATION → WON | LOST`, nilai, owner sales, lostReason); setiap quotation ter-attach ke deal (issue quotation otomatis menggerakkan stage ke QUOTED; WON/LOST quotation sinkron dengan deal).
- `Activity`: log manual (call/meeting/chat/note, tanggal, isi) per deal.
- `Reminder`: dueAt + catatan; notifikasi in-app (badge/list) + email harian via Resend untuk reminder jatuh tempo.
- List deal per stage (board/list sederhana — bukan drag-drop canggih dulu).

**Definition of done**: alur "buat penawaran → issue → deal QUOTED → set reminder → email reminder terkirim → tandai WON" berjalan end-to-end.

### M6 — Dashboard Owner

**Scope**
- Nilai pipeline per stage, jumlah & nilai penawaran bulan berjalan, follow-up jatuh tempo/terlambat, win rate (hanya dari deal yang sudah diputuskan — pola stats Metito), penawaran akan expired ≤ 7 hari.
- Scope per-role: owner/admin lihat semua; sales lihat miliknya.

**Definition of done**: angka dashboard cocok dengan query manual di DB pada data uji.

### M7 — Migrasi Metito & Hardening Produksi

**Scope**
- **Migrasi data**: script import dari DB `metito-new` (quotation + item + counter + settings → org Metito baru), katalog & customer via CSV M2; verifikasi nomor terakhir agar counter lanjut tanpa bentrok.
- **Deploy produksi**: VPS + Docker Compose (app, Postgres, Gotenberg), HTTPS, env tanpa fallback hardcoded (pelajaran Metito), rate limiting login & API publik.
- **Backup harian otomatis** + dokumentasi prosedur restore (uji restore pertama dilakukan di milestone ini).
- Onboarding Metito: buat org, undang user, walkthrough; mulai **periode observasi 2 minggu** (exit criteria).

**Definition of done**: Metito membuat penawaran riil di produksi; monitoring error dasar aktif; backup terverifikasi restore.

---

## 5. Track Paralel (Non-Teknis, Selama Fase 1)

Dari PRD §11 — berjalan bersamaan tanpa memblokir milestone:

- **Wawancara validasi 5–10 perusahaan** B2B teknik: proses penawaran mereka, alat sekarang, willingness-to-pay. Target ≥ 5 konfirmasi pain + rentang harga. Temuan bisa menggeser prioritas M5/M6.
- **Kesepakatan formal dengan Metito** (pilot): harga khusus, testimonial, izin tertulis penggunaan data untuk test set AI Fase 2 (PRD pertanyaan terbuka #5).
- Keputusan nama produk & domain (PRD pertanyaan terbuka #1) — dibutuhkan paling lambat sebelum M7 (deploy).

## 6. Keputusan Teknis yang Sudah Diambil

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Auth | Better Auth + organization plugin | Ganti total JWT custom Metito; invite/role/session per-org out-of-the-box |
| Isolasi tenant | Shared schema + Prisma Client Extension | PRD §8.2; dipagari test CI |
| PDF | Gotenberg server-side | PRD butuh file nyata untuk lampiran email (Fase 3); browser-print Metito tetap ada sebagai fallback |
| Nomor revisi (default) | Sufiks `Rev.N`, warisi nomor induk | Pola Metito terbukti; configurable menyusul |
| EXPIRED | Derived saat baca, tidak disimpan | Tanpa cron; pola Metito |
| Alokasi nomor | Saat issue, bukan draft; validasi dulu baru alokasi | Tidak ada nomor bolong dari draft gagal/dibuang |
| Uang | `Prisma.Decimal`, string di JSON boundary, totals server-only | Invariant Metito yang sudah teruji vs Excel riil |

## 7. Risiko Spesifik Fase 1

| Risiko | Mitigasi |
|---|---|
| M3 membengkak (milestone terbesar) | Port test dulu sebagai kontrak; generalisasi bertahap (nomor → snapshot → diskon); UI memakai pola form Metito yang ada |
| Pola isolasi tenant salah desain sejak M1 | Spike kecil di awal M1: buktikan extension + AsyncLocalStorage pada 1 model dummy sebelum diterapkan ke semua |
| Import data Metito tidak bersih | Jadwalkan dry-run migrasi saat M3 selesai (tidak menunggu M7); data asli jadi test fixture |
| Solo dev terdistraksi scope UI | Dashboard & pipeline dibuat minimal-berguna dulu (list > board canggih); polish setelah exit criteria |
| Biaya/kompleksitas R2 & Resend di awal | Keduanya punya free tier cukup untuk pilot; abstraksi storage/email tipis agar bisa diganti |

## 8. Di Luar Scope Fase 1 (Penegasan)

- Semua fitur AI (ekstraksi inquiry, draft follow-up, assistant) — Fase 2.
- Integrasi inbox email & WhatsApp Business API — Fase 3 (Fase 1 cukup `wa.me` + share link, pola Metito).
- Billing otomatis/self-service — Fase 4 (pembayaran manual + aktivasi admin).
- i18n selain Bahasa Indonesia; API publik; audit log lanjutan.

---

*Setelah plan ini disetujui: mulai M0, dan breakdown task dilakukan per milestone saat milestone tersebut dimulai.*
