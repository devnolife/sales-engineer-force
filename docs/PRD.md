# PRD: SalesKit — SaaS Penjualan untuk Perusahaan B2B Teknik

- **Status**: Draft untuk review
- **Tanggal**: 2026-07-30
- **Penulis**: devnolife (dibantu analisis codebase Metito)
- **Working name**: "SalesKit" (nama final ditentukan kemudian)
- **Repo**: `devnolife/sales-engineer-force`

---

## 1. Latar Belakang

Perusahaan B2B teknik/industri Indonesia (water treatment, industrial supply, kontraktor ME, distributor alat teknik) menjalankan proses penjualan dengan alat yang terfragmentasi:

- **Surat penawaran** dibuat di Excel/Word — rawan nomor duplikat, salah hitung PPN, format tidak konsisten. Audit file Excel Metito menemukan **8 defect nyata** (lihat `docs/superpowers/specs/2026-07-28-quotation-module-design.md` di repo internal Metito).
- **Follow-up** mengandalkan ingatan sales dan chat WhatsApp pribadi — penawaran terkirim lalu dilupakan, tidak ada visibilitas status deal.
- **Pengetahuan produk & harga** tersebar di kepala sales senior, file berserakan, dan chat lama.
- **Saat sales resign**, seluruh relasi dan histori deal ikut hilang.

Modul quotation yang dibangun untuk PT. Metito membuktikan bahwa masalah ini bisa diselesaikan dengan software — dan bahwa pembuatnya (developer Metito) memahami domain ini secara langsung. PRD ini mendefinisikan generalisasi solusi tersebut menjadi produk SaaS multi-tenant.

## 2. Tujuan Produk

### 2.1 Visi

> Platform penjualan end-to-end untuk perusahaan B2B teknik — dari inquiry masuk sampai deal menang — dengan AI sebagai copilot sales engineer.

### 2.2 Tujuan (Goals)

| # | Tujuan | Ukuran keberhasilan |
|---|--------|---------------------|
| G1 | Menghilangkan error administratif penawaran (nomor duplikat, salah PPN, format) | 0 defect penomoran/kalkulasi pada penawaran yang dibuat via platform |
| G2 | Mempercepat pembuatan penawaran | Dari ±1 jam (Excel) menjadi ≤ 5 menit per penawaran |
| G3 | Tidak ada deal yang hilang karena lupa follow-up | 100% penawaran terkirim punya status & jadwal follow-up; reminder otomatis |
| G4 | Visibilitas penuh untuk owner | Dashboard pipeline real-time: nilai deal per stage, win rate, aktivitas sales |
| G5 | AI mengurangi kerja manual sales | ≥ 50% penawaran dimulai dari draft AI (setelah Fase 2 berjalan 3 bulan di pilot) |
| G6 | Menjadi bisnis SaaS yang berkelanjutan | Metito migrasi penuh (Fase 1); 3 perusahaan berbayar ≤ 6 bulan setelah launch publik; 10 perusahaan ≤ 12 bulan |

### 2.3 Non-Goals (secara eksplisit TIDAK dikerjakan)

- **Bukan** website builder / company profile (blog, gallery, CMS Metito tidak ikut).
- **Bukan** e-commerce dengan checkout & pembayaran online oleh end-customer.
- **Bukan** sistem akuntansi/ERP — berhenti di deal menang + data untuk invoice; tidak mengelola pembukuan, stok gudang, atau payroll.
- **Bukan** auto-reply AI penuh tanpa manusia pada fase awal (lihat §7.5 — kebijakan human-in-the-loop).
- **Tidak** menargetkan enterprise besar (>100 sales) pada 12 bulan pertama.

## 3. Target Pasar & Persona

### 3.1 Segmen

Perusahaan B2B teknik/industri Indonesia, skala kecil-menengah:

- 5–50 karyawan, 1–10 orang tim sales
- Menjual produk/jasa teknik bernilai jutaan–miliaran rupiah per deal
- Siklus penjualan: inquiry → (survey) → penawaran → negosiasi/revisi → PO
- Hari ini memakai Excel + WhatsApp pribadi + email
- Contoh vertikal: water treatment, industrial supply, kontraktor mekanikal-elektrikal, distributor pompa/valve/instrumentasi, jasa fabrikasi

### 3.2 Persona

| Persona | Peran | Pain utama | Nilai yang dijual |
|---|---|---|---|
| **Sales engineer** (pengguna harian) | Cari lead, buat penawaran, follow-up, nego | Penawaran lama dibuat, lupa follow-up, cari data produk susah | Penawaran 5 menit, reminder otomatis, AI bantu draft |
| **Admin sales** (pengguna harian) | Rapikan dokumen, arsip, nomor surat | Nomor surat bentrok, arsip berantakan | Penomoran otomatis, arsip terpusat & searchable |
| **Owner/direktur** (pembeli, decision maker) | Kontrol bisnis | Tidak tahu status deal, data hilang saat sales resign | Dashboard pipeline, semua data milik perusahaan |

### 3.3 Pilot Customer

**PT. Metito (Multi Enviro Tirta Teknologi)** — migrasi penuh dari sistem internal saat Fase 1 selesai. Berfungsi sebagai: (a) validator fitur, (b) sumber feedback mingguan, (c) studi kasus untuk marketing.

## 4. Positioning & Kompetisi

| Kompetitor | Kekuatan | Kelemahan yang kita eksploitasi |
|---|---|---|
| Excel + WA (status quo) | Gratis, familiar | Semua pain di §1; ini kompetitor sesungguhnya |
| HubSpot / Pipedrive | CRM matang | Mahal (USD), tidak paham dokumen penawaran Indonesia (nomor SPH, PPN, terbilang, kop, materai), tidak ada AI konteks teknik |
| Mekari Qontak | Omnichannel WA kuat, lokal | Lemah di dokumen penawaran teknik; fokus omnichannel CS, bukan alur sales engineer |
| Odoo / ERP lokal | Lengkap | Berat, mahal implementasi, overkill untuk 5–50 karyawan |

**Pembeda inti**: (1) Surat penawaran Indonesia sebagai warga kelas satu — format nomor configurable `001/SPH-{ORG}/VII/2026`, PPN, terbilang, kop per-organisasi, PDF siap kirim. (2) AI copilot yang paham konteks penjualan teknik. (3) Harga rupiah yang masuk akal untuk UKM.

## 5. Model Bisnis

- **Langganan bulanan per organisasi** (bukan per user di tier bawah — mengurangi friksi adopsi).
- Fitur AI di tier berbayar lebih tinggi dengan **kuota bulanan** (setiap panggilan AI ada biaya API — kuota melindungi margin).
- Pembayaran: **manual dulu** (transfer bank + aktivasi admin) sampai ±10 customer; otomasi via Midtrans/Xendit di Fase 4.

| Tier | Harga indikatif* | Isi |
|---|---|---|
| **Starter** | Rp 300–500rb/bln | 3 user; quotation + katalog + customer + pipeline + PDF + share link |
| **Pro** | Rp 1–1,5jt/bln | 10 user; semua Starter + fitur AI (kuota N draft/bulan) + laporan |
| **Business** | Rp 3jt+/bln | Unlimited user; semua Pro + integrasi email/WA + kuota AI besar + support prioritas |

*Harga divalidasi lewat wawancara calon customer di Fase 1–2; angka di atas hipotesis awal.

## 6. Ruang Lingkup & Roadmap (4 Fase)

> Prinsip: setiap fase menghasilkan produk yang bisa dipakai dan bisa dijual. Metito memakai produk sejak akhir Fase 1.

### Fase 1 — Fondasi Multi-Tenant (target ±2 bulan)

Inti operasional yang menggantikan Excel:

1. **Organisasi & anggota**: signup, buat organisasi, undang anggota (owner/admin/sales), pengaturan organisasi (logo, kop, alamat, NPWP, format nomor penawaran, tarif PPN default, rekening bank).
2. **Katalog produk**: CRUD produk & kategori per-organisasi; harga default; unit; deskripsi/spek; import CSV untuk migrasi cepat.
3. **Pelanggan**: CRUD data perusahaan pelanggan + kontak person (nama, jabatan, WA, email).
4. **Penawaran (port dari Metito, di-generalisasi)**:
   - Penomoran atomik per-organisasi per-tahun, format configurable
   - Lifecycle: draft → issued → revisi (snapshot beku per versi, rantai revisi)
   - Item dari katalog atau ketik bebas; autocomplete dari histori
   - Kalkulasi Decimal: subtotal, diskon, PPN configurable, pembulatan; terbilang otomatis
   - **PDF server-side** dengan kop organisasi; share link publik ber-token (view tracking)
5. **Pipeline sederhana**: setiap penawaran ter-attach ke **Deal** dengan stage (Lead → Penawaran Terkirim → Negosiasi → Menang/Kalah), nilai deal, alasan kalah; log aktivitas manual (telepon/meeting/chat); **reminder follow-up** (tanggal + notifikasi in-app & email).
6. **Dashboard owner**: nilai pipeline per stage, penawaran bulan ini, follow-up jatuh tempo, win rate.

**Exit criteria Fase 1**: Metito membuat 100% penawaran barunya via platform selama 2 minggu berturut-turut tanpa kembali ke Excel.

### Fase 2 — AI Copilot (target ±2 bulan)

Semua AI = **draft untuk manusia**, bukan aksi otomatis (lihat §7.5):

1. **Inquiry → draft penawaran**: paste teks email/chat WA inquiry → AI ekstrak kebutuhan (item, qty, spek) → cocokkan dengan katalog (exact/fuzzy match + embedding) → hasilkan draft penawaran; item tak dikenal ditandai untuk direview.
2. **Draft follow-up pintar**: berdasarkan umur penawaran & stage deal, AI sarankan kapan follow-up dan draft pesan WA/email; sales edit lalu kirim sendiri (copy ke WA / kirim via email).
3. **AI assistant data internal**: tanya jawab natural language atas data organisasi sendiri ("penawaran bulan ini yang belum di-follow-up?", "produk apa yang paling sering ditawar tapi kalah?").
4. **Infrastruktur AI**: kuota per-organisasi, pencatatan pemakaian & biaya per panggilan, evaluasi kualitas ekstraksi (test set dari data Metito).

**Exit criteria Fase 2**: ≥ 50% penawaran baru di Metito dimulai dari draft AI; akurasi ekstraksi item ≥ 80% pada test set.

### Fase 3 — Komunikasi Terhubung (target ±2–3 bulan)

1. **Email terintegrasi**: hubungkan inbox (Gmail API/IMAP) → email pelanggan otomatis ter-link ke Deal; kirim penawaran langsung dari platform; inquiry email bisa langsung diproses AI (Fase 2 #1) tanpa copy-paste.
2. **WhatsApp Business API (jalur resmi Meta)**: kirim penawaran & follow-up dari nomor bisnis organisasi; percakapan ter-log ke Deal. *Catatan risiko di §10.*
3. **Auto-update status dari percakapan**: AI membaca balasan pelanggan → **menyarankan** perubahan stage deal ("pelanggan minta revisi harga → pindah ke Negosiasi?") → sales konfirmasi 1 klik.

**Exit criteria Fase 3**: ≥ 70% komunikasi deal di pilot tercatat otomatis di platform (bukan input manual).

### Fase 4 — Skala & Otomasi Penuh (setelah validasi)

1. Billing otomatis (Midtrans/Xendit), self-service upgrade/downgrade.
2. **Auto-reply AI** untuk pertanyaan repetitif ber-risiko-rendah (jam kerja, status penawaran, minta katalog) — hanya setelah data percakapan Fase 3 membuktikan akurasi; jawaban teknis/harga tetap eskalasi ke manusia.
3. Laporan lanjutan, export, API publik, audit log, fitur enterprise ringan.

## 7. Kebutuhan Fungsional Kunci (Detail)

### 7.1 Penomoran Penawaran

- Counter atomik per (organisasi, tahun) — transaksi DB serializable/upsert, tanpa race condition (pola teruji dari `lib/quotation-number.ts` Metito).
- Format template configurable per organisasi, mis. `{seq:3}/{prefix}/{romanMonth}/{year}` → `007/SPH-ABC/VII/2026`.
- Nomor terbit saat **issue** (bukan saat draft) agar tidak ada nomor bolong dari draft yang dibuang.

### 7.2 Revisi Penawaran

- Revisi membuat dokumen baru ber-relasi ke induk (rantai revisi), nomor sama + sufiks revisi (mis. `R1`) atau nomor baru — configurable per organisasi.
- Dokumen issued bersifat **immutable** (snapshot beku: harga, kop, identitas — perubahan katalog/organisasi setelahnya tidak mengubah dokumen lama).

### 7.3 Kalkulasi Uang

- Semua uang `Decimal` (bukan float). Pembulatan half-up ke rupiah pada tahap yang terdefinisi. PPN configurable (default 11%). Diskon per-item dan per-dokumen. Terbilang bahasa Indonesia otomatis.

### 7.4 Share Link Publik

- Token kriptografik unguessable per dokumen; halaman publik `noindex`; view tracking (kapan & berapa kali dibuka — sinyal follow-up untuk sales); bisa dinonaktifkan.

### 7.5 Kebijakan AI: Human-in-the-Loop (berlaku Fase 2–3)

> **Tidak ada teks yang dihasilkan AI terkirim ke pelanggan tanpa persetujuan manusia.** AI menghasilkan draft; manusia mengedit/menyetujui/mengirim. Alasan: di B2B teknik, satu jawaban salah spek/harga menghancurkan kredibilitas perusahaan pengguna. Pelonggaran bertahap hanya di Fase 4, terbatas pada intent ber-risiko-rendah, dengan eskalasi default ke manusia.

Tambahan: log semua interaksi AI (input, output, diterima/ditolak user) — menjadi data evaluasi & bahan fine-tune prompt.

## 8. Arsitektur Teknis

### 8.1 Stack

| Layer | Pilihan | Catatan |
|---|---|---|
| Framework | Next.js 15+ App Router, TypeScript | Sama dengan keahlian eksisting |
| DB | PostgreSQL + Prisma | Skema baru multi-tenant |
| Auth | Better Auth + plugin organization | Session, invite, role per-org out-of-the-box; open source, tanpa biaya per-user |
| UI | Tailwind + shadcn/ui | |
| PDF | Gotenberg / Playwright server-side | File PDF nyata untuk lampiran email |
| Storage | Cloudflare R2 (S3-compatible) | Logo, lampiran; tanpa egress fee |
| AI | Vercel AI SDK; model kelas Gemini Flash / GPT-4o-mini | Abstraksi provider; embedding untuk product matching |
| Email keluar | Resend/SMTP (Fase 1: notifikasi & reminder) | Integrasi inbox penuh di Fase 3 |
| Hosting | VPS + Docker Compose (app, Postgres, Gotenberg) | Migrasi ke arsitektur lebih besar bila perlu |
| Testing | Vitest (unit: math, numbering, terbilang, AI extraction) + Playwright (alur kritis) | Pola test Metito dilanjutkan |

### 8.2 Multi-Tenancy

- **Shared database, shared schema**: kolom `organizationId` di semua tabel data.
- **Prisma Client Extension** menyuntikkan filter `organizationId` otomatis dari konteks request — mencegah kebocoran data antar tenant karena lupa `where`.
- Uji isolasi tenant menjadi bagian test suite (query lintas-org harus gagal).
- Rate limit & kuota (AI, storage) per organisasi.

### 8.3 Struktur Modul

```
src/
├── modules/
│   ├── org/        # organisasi, member, settings (kop, format nomor, PPN, rekening)
│   ├── catalog/    # produk & kategori
│   ├── customer/   # pelanggan & kontak person
│   ├── quotation/  # engine penawaran (port Metito: math, number, terbilang, snapshot)
│   ├── pipeline/   # deal, stage, aktivitas, reminder
│   ├── inbox/      # Fase 3: email/WA thread & message
│   └── ai/         # Fase 2: ekstraksi, matching, draft, assistant (interface stabil)
├── lib/            # db, auth, pdf, storage, email
└── app/            # routes (tipis; logika di modules/)
```

Aturan: antar-modul berkomunikasi lewat fungsi service yang diekspor (bukan import internal); `ai/` bisa diganti provider/model tanpa menyentuh modul lain.

### 8.4 Aset yang Di-port dari Metito

| Aset | Perubahan |
|---|---|
| `lib/quotation-math.ts` + test | PPN & aturan pembulatan jadi parameter per-org |
| `lib/terbilang.ts` + test | Apa adanya |
| `lib/quotation-number.ts` + test | Format template configurable; counter per (org, tahun) |
| Skema Quotation/Item/Counter | + `organizationId`, + relasi Deal |
| Pola share-token & view tracking | Apa adanya |
| Pola `withAdminAuth` | Diganti Better Auth middleware + org context |

### 8.5 Data Model Inti (ringkas)

```
Organization (settings: kop, format nomor, PPN, rekening, kuota AI)
├── Member (userId, role: OWNER|ADMIN|SALES)
├── Category ── Product (nama, spek, unit, hargaDefault, aktif)
├── Customer ── ContactPerson (nama, jabatan, WA, email)
├── Deal (customer, stage, nilai, owner=sales, lostReason?)
│   ├── Quotation (nomor, status, snapshot, parentId? utk revisi, shareToken)
│   │   └── QuotationItem (deskripsi, qty, hargaSatuan Decimal, diskon)
│   ├── Activity (jenis: call|meeting|chat|note, tanggal, isi)
│   └── Reminder (dueAt, done, catatan)
├── QuotationCounter (tahun, lastSeq) [unik per org+tahun]
└── AiUsage (Fase 2: jenis, token, biaya, diterima/ditolak)
```

## 9. Kebutuhan Non-Fungsional

- **Keamanan**: isolasi tenant teruji otomatis; password hashing (scrypt/bcrypt via Better Auth); session httpOnly; rate limiting login & API publik; secret via env (tanpa fallback hardcoded — pelajaran dari Metito); backup DB harian otomatis + uji restore bulanan.
- **Privasi**: data organisasi milik organisasi; export data kapan pun; hapus organisasi = hard delete terjadwal. Dokumen PII tidak pernah masuk repo (pelajaran dari `DOKUMEN METITO/`).
- **Kinerja**: halaman utama < 2s di koneksi Indonesia; PDF < 5s; AI draft < 20s dengan progress indicator.
- **Keandalan**: penomoran tidak pernah duplikat meski request bersamaan (uji konkurensi); dokumen issued tidak pernah berubah.
- **Bahasa**: UI Bahasa Indonesia; arsitektur string siap i18n (en menyusul bila perlu).

## 10. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Solo dev — scope 4 fase terlalu besar | Burnout, mangkrak | Fase pendek dengan exit criteria; launch tiap fase; boleh berhenti sementara di fase mana pun dengan produk tetap berguna |
| WhatsApp: API resmi mahal (per-percakapan, verifikasi Meta); API tidak resmi = risiko banned nomor user | Fitur WA tertunda/mahal | WA ditunda ke Fase 3; Fase 1–2 pakai pola "copy pesan ke WA" + share link (sudah terbukti di Metito); evaluasi biaya API resmi saat ada revenue |
| AI salah ekstrak/salah jawab | Kredibilitas user rusak | Human-in-the-loop wajib (§7.5); tampilkan confidence; test set dari data riil Metito |
| Biaya API AI menggerus margin | Unit economics negatif | Kuota per tier; model murah default; cache; log biaya per panggilan sejak hari 1 |
| Pain Metito ternyata tidak universal | Produk niche 1 perusahaan | Sebelum/selama Fase 1: wawancara ≥ 5 perusahaan sejenis (target: konfirmasi mereka pakai Excel & mau bayar); sesuaikan prioritas dari temuan |
| Kompetitor lokal masuk segmen sama | Tekanan harga | Kecepatan eksekusi + kedalaman domain teknik + studi kasus Metito |
| Data tenant bocor antar organisasi | Fatal untuk kepercayaan | Prisma extension enforced + test isolasi otomatis di CI |

## 11. Rencana Validasi

| Kapan | Aktivitas | Target |
|---|---|---|
| Selama Fase 1 | Wawancara 5–10 perusahaan B2B teknik (jaringan Metito/pribadi): proses penawaran mereka, alat sekarang, willingness-to-pay | ≥ 5 dari 10 konfirmasi pain + rentang harga diterima |
| Akhir Fase 1 | Metito migrasi penuh | Exit criteria Fase 1 terpenuhi |
| Fase 2 | 2–3 perusahaan early adopter (bisa gratis/diskon) | Feedback terstruktur mingguan |
| Setelah Fase 2 | Launch publik terbatas | 3 organisasi berbayar ≤ 6 bulan |
| 12 bulan | Evaluasi bisnis | 10 organisasi berbayar; churn < 10%/bln; keputusan lanjut/pivot |

## 12. Pertanyaan Terbuka

1. Nama produk & domain.
2. Harga final per tier (menunggu hasil wawancara §11).
3. Format nomor revisi: sufiks `R1` vs nomor baru — default mana? (configurable, tapi butuh default.)
4. Model AI spesifik & benchmark biaya per draft penawaran (uji saat Fase 2 dimulai).
5. Kesepakatan formal dengan Metito sebagai pilot (harga khusus? testimonial? batas penggunaan data untuk test set AI — perlu izin tertulis).
6. Badan usaha & legal SaaS (PT/CV, syarat pemrosesan data, kontrak langganan).

---

*Dokumen ini adalah hasil sesi brainstorming terstruktur. Langkah berikutnya setelah PRD disetujui: implementation plan Fase 1 (breakdown teknis per minggu).*
