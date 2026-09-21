/**
 * Import data Metito (M7): file JSON export -> org tujuan.
 *
 * Pemakaian:
 *   pnpm tsx scripts/import-metito.ts --org <slug-org> --file <export.json> [--dry-run]
 *
 * Format file JSON (hasil export dari DB metito-new):
 * {
 *   "settings": { ...sebagian field OrgSettings (opsional) },
 *   "quotations": [{
 *     "seq": 12, "numberBase": "012/SPH/VII/2025", "revision": 0,
 *     "status": "SENT", "issuedAt": "...", "quoteDate": "...", "validUntil": "...",
 *     "customerName": "...", "attn": "...", "subject": "...",
 *     "franco": "...", "deliveryTime": "...", "termsOfPayment": "...",
 *     "priceIncludeNote": "...", "validityDays": 30,
 *     "vatRate": "0.11", "subtotal": "...", "discountAmount": "0",
 *     "vatAmount": "...", "total": "...", "amountInWords": "...",
 *     "notes": "...",
 *     "items": [{ "lineNo": 1, "name": "...", "brand": "...", "type": "...",
 *                 "spec": "...", "qty": "1", "unit": "unit",
 *                 "unitPrice": "...", "discountPercent": "0", "lineTotal": "..." }]
 *   }]
 * }
 *
 * Jaminan:
 * - Idempotent per (numberBase, revision): yang sudah ada dilewati.
 * - Counter per (org, tahun) dinaikkan ke max(seq) agar nomor baru lanjut
 *   tanpa bentrok (verifikasi nomor terakhir — requirement M7).
 * - Semua row diberi organizationId org tujuan; snapshot org diisi dari settings.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface ImportItem {
  lineNo: number;
  name: string;
  brand?: string | null;
  type?: string | null;
  spec?: string | null;
  qty: string;
  unit: string;
  unitPrice: string;
  discountPercent?: string;
  lineTotal: string;
}

interface ImportQuotation {
  seq: number;
  numberBase: string;
  revision?: number;
  status: string;
  issuedAt?: string | null;
  quoteDate: string;
  validUntil?: string | null;
  customerName: string;
  attn?: string | null;
  subject: string;
  franco?: string | null;
  deliveryTime?: string | null;
  termsOfPayment?: string | null;
  priceIncludeNote?: string | null;
  validityDays?: number;
  vatRate?: string;
  subtotal: string;
  discountAmount?: string;
  vatAmount: string;
  total: string;
  amountInWords?: string;
  notes?: string | null;
  items: ImportItem[];
}

interface ImportFile {
  settings?: Record<string, unknown>;
  quotations: ImportQuotation[];
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const orgSlug = arg("org");
  const file = arg("file");
  const dryRun = process.argv.includes("--dry-run");
  if (!orgSlug || !file) {
    console.error(
      "Pemakaian: pnpm tsx scripts/import-metito.ts --org <slug> --file <export.json> [--dry-run]",
    );
    process.exit(1);
  }

  const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) throw new Error(`Organisasi dengan slug '${orgSlug}' tidak ditemukan.`);

  const owner = await prisma.member.findFirst({
    where: { organizationId: org.id, role: "owner" },
  });
  if (!owner) throw new Error("Org belum punya owner — jalankan onboarding dulu.");

  const data: ImportFile = JSON.parse(readFileSync(file, "utf8"));
  const statuses = new Set(["DRAFT", "SENT", "WON", "LOST"]);

  // 1) Settings (opsional, hanya field yang dikirim)
  if (data.settings && !dryRun) {
    await prisma.orgSettings.update({
      where: { organizationId: org.id },
      data: data.settings,
    });
    console.log("Settings organisasi diperbarui.");
  }

  const settings = await prisma.orgSettings.findUnique({
    where: { organizationId: org.id },
  });

  // 2) Quotations + items (idempotent per numberBase+revision)
  let imported = 0;
  let skipped = 0;
  const maxSeqByYear = new Map<number, number>();

  for (const q of data.quotations) {
    if (!statuses.has(q.status)) {
      throw new Error(`Status tidak dikenal '${q.status}' pada ${q.numberBase}`);
    }
    const revision = q.revision ?? 0;
    const year = new Date(q.quoteDate).getFullYear();
    maxSeqByYear.set(year, Math.max(maxSeqByYear.get(year) ?? 0, q.seq));

    const existing = await prisma.quotation.findFirst({
      where: { organizationId: org.id, numberBase: q.numberBase, revision },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    if (!dryRun) {
      await prisma.quotation.create({
        data: {
          organizationId: org.id,
          status: q.status,
          seq: q.seq,
          numberBase: q.numberBase,
          revision,
          issuedAt: q.issuedAt ? new Date(q.issuedAt) : new Date(q.quoteDate),
          quoteDate: new Date(q.quoteDate),
          validUntil: q.validUntil ? new Date(q.validUntil) : null,
          customerName: q.customerName,
          attn: q.attn ?? null,
          subject: q.subject,
          franco: q.franco ?? null,
          deliveryTime: q.deliveryTime ?? null,
          termsOfPayment: q.termsOfPayment ?? null,
          priceIncludeNote: q.priceIncludeNote ?? null,
          validityDays: q.validityDays ?? 30,
          // Snapshot identitas org: dokumen lama dibekukan dengan identitas saat ini
          orgName: org.name,
          orgAddress: settings?.address ?? null,
          orgNpwp: settings?.npwp ?? null,
          orgPhone: settings?.phone ?? null,
          orgEmail: settings?.email ?? null,
          orgLogo: org.logo,
          bankName: settings?.bankName ?? null,
          bankAccount: settings?.bankAccount ?? null,
          bankBranch: settings?.bankBranch ?? null,
          bankHolder: settings?.bankHolder ?? null,
          signerName: settings?.signerName ?? null,
          signerTitle: settings?.signerTitle ?? null,
          vatRate: q.vatRate ?? "0.11",
          subtotal: q.subtotal,
          discountAmount: q.discountAmount ?? "0",
          vatAmount: q.vatAmount,
          total: q.total,
          amountInWords: q.amountInWords ?? "",
          notes: q.notes ?? null,
          createdById: owner.userId,
          items: {
            create: q.items.map((it) => ({
              organizationId: org.id,
              lineNo: it.lineNo,
              name: it.name,
              brand: it.brand ?? null,
              type: it.type ?? null,
              spec: it.spec ?? null,
              qty: it.qty,
              unit: it.unit,
              unitPrice: it.unitPrice,
              discountPercent: it.discountPercent ?? "0",
              lineTotal: it.lineTotal,
            })),
          },
        },
      });
    }
    imported += 1;
  }

  // 3) Counter: pastikan lanjut dari nomor terakhir (tidak pernah diturunkan)
  for (const [year, maxSeq] of maxSeqByYear) {
    if (dryRun) {
      console.log(`[dry-run] Counter ${year} -> minimal ${maxSeq}`);
      continue;
    }
    const counter = await prisma.quotationCounter.findUnique({
      where: { organizationId_year: { organizationId: org.id, year } },
    });
    if (!counter) {
      await prisma.quotationCounter.create({
        data: { organizationId: org.id, year, lastSeq: maxSeq },
      });
    } else if (counter.lastSeq < maxSeq) {
      await prisma.quotationCounter.update({
        where: { organizationId_year: { organizationId: org.id, year } },
        data: { lastSeq: maxSeq },
      });
    }
    console.log(`Counter ${year}: lastSeq >= ${maxSeq} ✓`);
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}Selesai: ${imported} diimpor, ${skipped} dilewati (sudah ada).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
