# sales-engineer-force

SaaS penjualan end-to-end untuk perusahaan B2B teknik/industri Indonesia — dari inquiry masuk sampai deal menang, dengan AI sebagai copilot sales engineer.

> Working name produk: **SalesKit** (nama final TBD). Repo: `sales-engineer-force`.

## Menjalankan (kerangka mock-first)

```bash
pnpm install
pnpm db:push      # buat SQLite dev.db dari schema
pnpm db:seed      # isi data demo (atau pnpm db:reset untuk mulai bersih)
pnpm dev          # http://localhost:3000
```

Login demo: `demo@saleskit.id` / `demo1234` (owner) · `sales@saleskit.id` / `demo1234` (sales).
Contoh alur inquiry: menu **Permintaan** → "Permintaan baru" → "Isi dengan contoh" (atau upload `public/contoh-permintaan.txt`).

```bash
pnpm test                                  # unit test (math, terbilang, nomor, matching, mock AI)
$env:RUN_DB_TESTS="1"; pnpm test           # + test isolasi tenant (butuh dev.db)
pnpm build                                 # build produksi
```

## Strategi Kerangka: Mock-First

Kerangka end-to-end dibangun **tanpa LLM/API eksternal** — semua titik AI dibungkus interface stabil dengan implementasi mock, sehingga seluruh alur bisa dipakai lokal dan provider asli tinggal ditukar:

| Titik | Sekarang (mock) | Nanti (asli) | Ditukar di |
|---|---|---|---|
| Ekstraksi permintaan → item | Parser heuristik lokal | LLM multimodal (Vercel AI SDK) | `src/modules/ai/` (env `AI_PROVIDER`) |
| Pencocokan item → katalog | Skor token (kode asli, tetap dipakai) | + embedding | `src/modules/inquiry/matching.ts` |
| Pencarian vendor web | Hasil deterministik berlabel "(mock)" | Firecrawl search/extract | `src/modules/sourcing/` (env `SOURCING_PROVIDER`) |
| Database | SQLite (uang sebagai string desimal + decimal.js) | PostgreSQL (kolom Decimal) | `prisma/schema.prisma` |
| PDF | Print browser (CSS A4) | Gotenberg server-side | — |
| Email undangan/reminder | Log console + salin tautan | Resend | `src/lib/auth.ts` |

Yang **bukan** mock sejak awal: Better Auth + organization (multi-tenant asli), isolasi tenant via Prisma extension (`src/lib/tenant.ts`, teruji), engine penawaran port dari Metito (penomoran atomik per org+tahun, kalkulasi Decimal + diskon, terbilang, lifecycle draft→issue→revisi dengan snapshot penuh, share link ber-token + view tracking).

## Dokumen

- [PRD — Product Requirements Document](docs/PRD.md)
- [Implementation Plan — Fase 1](docs/implementation-plan-fase-1.md)

## Status

- [x] Riset & validasi ide (brainstorming terstruktur)
- [x] PRD v1
- [ ] Wawancara validasi 5–10 perusahaan target
- [x] Implementation plan Fase 1
- [x] **Kerangka end-to-end mock-first** — semua modul Fase 1 + alur inquiry→sourcing (AI mock)
- [ ] Fase 1 — Fondasi multi-tenant produksi (PostgreSQL, PDF Gotenberg, email Resend, deploy)
- [ ] Fase 2 — AI Copilot (tukar mock → LLM: ekstraksi inquiry, follow-up pintar, assistant)
- [ ] Fase 3 — Komunikasi terhubung (email, WhatsApp Business API, Firecrawl sourcing)
- [ ] Fase 4 — Skala & otomasi (billing, auto-reply terbatas)

## Konteks

Produk ini adalah generalisasi dari modul quotation yang dibangun untuk PT. Metito (pilot customer) — penomoran surat penawaran atomik, kalkulasi PPN dengan Decimal, terbilang otomatis, lifecycle draft→issue→revisi, dan share link publik ber-token.
