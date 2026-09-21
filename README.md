# sales-engineer-force

SaaS penjualan end-to-end untuk perusahaan B2B teknik/industri Indonesia — dari inquiry masuk sampai deal menang, dengan AI sebagai copilot sales engineer.

> Working name produk: **SalesKit** (nama final TBD). Repo: `sales-engineer-force`.

## Menjalankan (demo lokal)

```bash
corepack enable  # gunakan versi pnpm yang dipin di package.json
cp .env.example .env
# Ganti BETTER_AUTH_SECRET dengan secret lokal yang kuat.
pnpm install
pnpm db:push      # buat SQLite dev.db dari schema
pnpm db:seed      # isi data demo (atau pnpm db:reset untuk mulai bersih)
pnpm dev          # http://localhost:3000
```

Login demo: `demo@saleskit.id` / `demo1234` (owner) · `sales@saleskit.id` / `demo1234` (sales).
Contoh alur inquiry: menu **Permintaan** → "Permintaan baru" → "Isi dengan contoh" (atau upload `public/contoh-permintaan.txt`).

```bash
pnpm test                                  # unit test; test DB opt-in
pnpm build                                 # build produksi
```

## Strategi Kerangka: Mock-First

Mode demo dapat dipakai **tanpa LLM/API eksternal**. Sourcing juga mempunyai
integrasi Firecrawl Cloud melalui core-ai; mock bukan fallback ketika layanan
live gagal. Pilih `SOURCING_MODE=mock` secara eksplisit untuk data contoh.

| Titik | Demo/lokal | Integrasi asli / lanjutan | Ditukar di |
|---|---|---|---|
| Ekstraksi permintaan → item | Parser heuristik lokal | LLM multimodal (Vercel AI SDK) | `src/modules/ai/` (env `AI_PROVIDER`) |
| Pencocokan item → katalog | Skor token (kode asli, tetap dipakai) | + embedding | `src/modules/inquiry/matching.ts` |
| Pencarian vendor web | Contoh deterministik berlabel "(mock)" | Firecrawl Cloud v2, detail on-demand melalui core-ai | App: `SOURCING_MODE`; core-ai: `SOURCING_PROVIDER` + `FIRECRAWL_API_KEY` |
| Database | SQLite (uang sebagai string desimal + decimal.js) | PostgreSQL (kolom Decimal) | `prisma/schema.prisma` |
| PDF | Print browser (CSS A4) | Gotenberg server-side | — |
| Email undangan/reminder | Log console + salin tautan | Resend | `src/lib/auth.ts` |

Yang **bukan** mock sejak awal: Better Auth + organization (multi-tenant asli), isolasi tenant via Prisma extension (`src/lib/tenant.ts`, teruji), engine penawaran port dari Metito (penomoran atomik per org+tahun, kalkulasi Decimal + diskon, terbilang, lifecycle draft→issue→revisi dengan snapshot penuh, share link ber-token + view tracking).

## Sourcing barang dan harga dengan Firecrawl

Dialog **Cari vendor** pada menu Vendor dan pada setiap item Permintaan memakai
panel yang sama. Pricelist internal tetap didahulukan (maksimal 10), lalu
discovery menampilkan maksimal **5 kandidat web tanpa mengambil harga**.
Klik **Ambil detail** pada satu kandidat untuk membaca satu halaman produk.
Tidak ada scrape massal, login marketplace, checkout, atau pembelian.

Harga web berasal dari format produk terstruktur Firecrawl, bukan angka pada
snippet, median angka halaman, ongkir, atau harga coret. Hasil dapat berstatus
**Belum diambil**, **Harga belum tersedia**, **Perlu review**, atau tersedia
dengan mata uang, sumber, bukti varian, dan waktu observasi. Mata uang hilang
tidak dianggap IDR; banyak varian yang belum pasti tidak dipilihkan otomatis.
Produk terstruktur yang tidak cocok dengan URL halaman/alias canonical juga
ditandai **Perlu review**, tanpa memakai harga produk rekomendasi yang berbeda.
Nama situs belum berarti identitas pemasok terverifikasi.

Harga bersifat **indikatif, bukan harga transaksi atau jaminan harga terkini**.
Periksa spesifikasi, varian, stok, satuan, pajak, pengiriman, serta syarat pada
sumber. Waktu observasi bukan waktu perubahan harga toko. USD tetap USD:
tidak ada konversi FX atau saran margin untuk mata uang selain IDR. Saran jual
IDR memakai `SOURCING_MARGIN_PERCENT` (default 30, rentang 0-500), aritmetika
Decimal, dan pembulatan ke ribuan; hasil pembulatan nol tidak ditampilkan.
Persen margin disimpan per hasil agar label tetap cocok jika konfigurasi berubah.
Tidak ada perubahan otomatis pada katalog, pricelist, item inquiry, atau penawaran.

### Konfigurasi dua layanan

Checkout backend berdampingan dengan aplikasi:

```bash
git clone git@github.com:devnolife/sales-engineer-ai.git ../core-ai
cp ../core-ai/.env.example ../core-ai/.env
pnpm --dir ../core-ai install
```

Repository backend memerlukan akses yang sesuai. Atur nilai berikut pada
environment proses pemiliknya; jangan menaruh kunci Firecrawl di proses Next.js
atau variabel `NEXT_PUBLIC_*`.

| Proses | Konfigurasi |
| --- | --- |
| SalesKit | `SOURCING_MODE=live`, `CORE_AI_URL=http://localhost:8787`, `CORE_AI_API_KEY` yang sama dengan backend, `SOURCING_MARGIN_PERCENT=30` |
| core-ai | `SOURCING_PROVIDER=firecrawl`, `FIRECRAWL_API_KEY`, `CORE_AI_API_KEY` untuk autentikasi antar-layanan |
| Demo SalesKit | `SOURCING_MODE=mock`; sourcing memakai contoh lokal berlabel, tidak membutuhkan Firecrawl |

Untuk setup lokal dua checkout di atas, jalankan dari folder SalesKit:

```bash
pnpm setup:firecrawl
```

Tempel API key Firecrawl pada prompt terminal; karakter tidak ditampilkan dan
key tidak dimasukkan ke argumen/history perintah. Jangan kirim key melalui chat.
Skrip menggunakan Node bawaan (Node 22+), tanpa memasang paket atau menghubungi
Cloud. Ini hanya menyiapkan konfigurasi, bukan installer, deployment, aktivasi
langganan, atau validasi key terhadap API.

Skrip membuat `.env` dari example bila belum ada, menyimpan key Firecrawl hanya
di `../core-ai/.env`, mengaktifkan sourcing live di `.env` SalesKit, dan memakai
URL loopback sesuai `PORT` backend. `CORE_AI_API_KEY` yang sudah ada dipakai
bersama; jika keduanya kosong, dibuat key acak. Auth/cron secret acak juga dibuat
untuk `.env` aplikasi yang baru. Nilai lain, termasuk database, model AI, dan
margin yang sudah ada, dipertahankan. Tidak ada perubahan atau seed database.

Kedua `.env` ditulis dengan izin `0600`, memakai blok bertanda
`BEGIN/END SalesKit Firecrawl setup`; blok paling akhir menggantikan nilai
terdahulu pada file yang sama. Jalankan ulang perintah untuk mengganti key,
bukan menambahkan key di luar blok tersebut. Penulisan file memakai rename
atomic; bila salah satu penulisan gagal, perubahan sebelumnya dipulihkan atau
kegagalan pemulihan dilaporkan secara eksplisit.

Untuk mencegah konfigurasi yang seolah berhasil tetapi tidak digunakan, skrip
berhenti tanpa menyimpan jika mendeteksi key antar-layanan berbeda, backend
remote, symlink `.env`, atau override sourcing pada environment terminal/
`.env.local`/file khusus development atau production. Selesaikan konflik yang
disebutkan dahulu. Key Firecrawl tidak boleh dipakai ulang sebagai key
antar-layanan, dan kedua key tidak boleh diekspos lewat `NEXT_PUBLIC_*`.
Konfigurasi remote/produksi tetap dilakukan di environment
proses masing-masing, bukan dengan skrip lokal ini.

Setelah setup, **restart kedua layanan** dengan perintah di bawah. Jika ini
checkout baru, siapkan dependency/database menggunakan quickstart demo lokal
terlebih dahulu. Panggilan Cloud baru terjadi saat pengguna memilih pencarian
atau detail pada aplikasi, dan memakai kredit akun Firecrawl.

Jalankan `pnpm dev:ai` di terminal lain, lalu `pnpm dev`. Alternatifnya,
`docker compose up -d core-ai gotenberg` membaca `../core-ai/.env`, bukan
mengambil provider/key dari `.env` aplikasi. Untuk Ollama di host saat memakai
Compose, set `OLLAMA_URL=http://host.docker.internal:11434` pada environment
backend. Compose hanya mengganti `GOTENBERG_URL` untuk jaringan container lokal.
File `../core-ai/.env` harus tersedia sebelum menjalankan Compose dev.

Produksi memakai `SOURCING_MODE=live` secara eksplisit pada Compose aplikasi.
Gunakan `docker compose --env-file .env.production -f docker-compose.prod.yml ...`
agar file konfigurasi produksi benar-benar dimuat. Kunci bersama wajib sama
di kedua server; lindungi endpoint core-ai dengan autentikasi dan jaringan.

### Error, batas trafik, dan audit

Web gagal atau belum dikonfigurasi tidak berubah menjadi data mock. Hasil
internal tetap terlihat dengan peringatan parsial dan kode kegagalan. Kegagalan
memperbarui detail mempertahankan observasi lama dengan peringatan; pembacaan
baru yang berhasil tetapi tidak menemukan harga menghapus harga/saran sebelumnya.

SalesKit membatasi **10 pencarian web dan 20 detail per menit per organisasi**.
Ini limiter in-memory satu instance, bukan kuota kredit bulanan dan bukan batas
global lintas replica/restart. Firecrawl Cloud dan server tetap dapat berbiaya;
atur budget serta pantau pemakaian akun Cloud. Tidak ada retry provider otomatis.
Timeout panggilan core-ai 45 detik, dengan budget operasi provider 35 detik;
angka tersebut bukan SLA waktu seluruh halaman.

Detail menggunakan referensi `searchId` + `resultId`, bukan URL bebas dari
browser, dan snapshot selalu dibaca dalam organisasi aktif. Query serta kaitan
item inquiry divalidasi sebelum akses eksternal. Core-ai menolak target
privat/localhost dan URL berkredensial, serta memeriksa URL hasil/redirect yang
dilaporkan provider; DNS/redirect di dalam Cloud sendiri tetap bergantung pada
perlindungan Firecrawl.

Snapshot array `SourcingSearch.resultsJson` dan `AiLog` ditulis transaksional,
dengan engine aktual (`firecrawl`/`mock`). Detail memakai compare-and-swap
maksimal tiga percobaan merge database tanpa mengulang request berbayar.
Kegagalan penyimpanan dilaporkan, bukan diklaim sukses. Snapshot lama tanpa ID
hasil tidak bisa diambil detailnya; jalankan pencarian baru. Tidak ada migrasi
model Prisma untuk fitur ini.

### Verifikasi lokal dan rollout

Pengujian otomatis tidak memakai kredit Firecrawl:

```bash
pnpm exec vitest run src/modules/sourcing src/components/sourcing src/lib/format.test.ts src/lib/rate-limit.test.ts
mkdir -p .data
DATABASE_URL="file:../.data/sourcing-test.db" pnpm exec prisma db push --skip-generate
RUN_DB_TESTS=1 DATABASE_URL="file:../.data/sourcing-test.db" pnpm exec vitest run src/modules/sourcing/tenant.integration.test.ts src/lib/tenant.integration.test.ts
pnpm --dir ../core-ai test
pnpm --dir ../core-ai typecheck
```

Pakai database disposable tersebut, bukan database pengguna/produksi.
Fixture kontrak sintetis ada di `src/modules/sourcing/__fixtures__/firecrawl-contract.json`
dan salinannya di repo core-ai. Untuk mencoba dua layanan secara lokal tanpa
Cloud, jalankan `pnpm --dir ../core-ai fixture:sourcing`, lalu arahkan aplikasi
uji ke `CORE_AI_URL=http://127.0.0.1:8788` dengan `SOURCING_MODE=live`.
**Server fixture hanya untuk pengujian; harga yang ditampilkan sintetis, bukan
hasil internet nyata.** `/health` fixture mengidentifikasi dirinya.

Rollout: backend kompatibel lebih dahulu, aplikasi baru berikutnya, lalu aktifkan
live dan lakukan smoke test Cloud terbatas yang disetujui operator. API canonical
tetap `/v1/sourcing/search` dan `/v1/sourcing/scrape-detail`; backend menerima
request legacy dan menyediakan field harga flat legacy hanya untuk IDR.

Untuk menghentikan panggilan berbayar, hapus/kosongkan `FIRECRAWL_API_KEY` pada
core-ai sambil mempertahankan `SOURCING_PROVIDER=firecrawl`, lalu terapkan
konfigurasi. Aplikasi akan menampilkan internal + `NOT_CONFIGURED`. Jangan
mengubahnya diam-diam ke mock atau menghapus `CORE_AI_URL` bersama, yang juga
digunakan AI/OCR/PDF. Tes fixture tidak membuktikan akses, kuota, atau hasil
Firecrawl Cloud nyata. SearXNG + Crawl4AI dan Browser Use belum diimplementasikan.

## Dokumen

- [PRD — Product Requirements Document](docs/PRD.md)
- [Implementation Plan — Fase 1](docs/implementation-plan-fase-1.md)

## Status

- [x] Riset & validasi ide (brainstorming terstruktur)
- [x] PRD v1
- [ ] Wawancara validasi 5–10 perusahaan target
- [x] Implementation plan Fase 1
- [x] **Kerangka end-to-end mock-first** — semua modul Fase 1 + alur inquiry→sourcing (AI mock)
- [x] Integrasi Firecrawl-first sourcing: discovery + detail on-demand melalui core-ai; aktivasi Cloud memerlukan konfigurasi operator
- [ ] Fase 1 — Fondasi multi-tenant produksi (PostgreSQL, PDF Gotenberg, email Resend, deploy)
- [ ] Fase 2 — AI Copilot (tukar mock → LLM: ekstraksi inquiry, follow-up pintar, assistant)
- [ ] Fase 3 — Komunikasi terhubung (email, WhatsApp Business API)
- [ ] Fase 4 — Skala & otomasi (billing, auto-reply terbatas)

## Konteks

Produk ini adalah generalisasi dari modul quotation yang dibangun untuk PT. Metito (pilot customer) — penomoran surat penawaran atomik, kalkulasi PPN dengan Decimal, terbilang otomatis, lifecycle draft→issue→revisi, dan share link publik ber-token.
