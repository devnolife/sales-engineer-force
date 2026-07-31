import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Seed data mockup — kerangka mock-first.
 *
 * Jalankan: pnpm db:seed  (atau pnpm db:reset untuk mulai bersih)
 * Login demo: demo@saleskit.id / demo1234
 */

// ---- Muat .env manual (tsx tidak otomatis membaca .env) ----
function loadEnv() {
  try {
    const content = readFileSync(path.join(process.cwd(), ".env"), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // .env tidak ada — biarkan env dari shell.
  }
}
loadEnv();

async function main() {
  // Import dinamis SETELAH env dimuat (Prisma & Better Auth membaca env saat init).
  const { prisma } = await import("../src/lib/db");
  const { auth } = await import("../src/lib/auth");
  const { orgDb } = await import("../src/lib/tenant");
  const { createQuotation, issueQuotation, setQuotationStatus } = await import(
    "../src/modules/quotation/service"
  );
  const { createInquiryFromText, extractInquiry } = await import(
    "../src/modules/inquiry/service"
  );

  const DEMO_EMAIL = "demo@saleskit.id";
  const DEMO_PASSWORD = "demo1234";
  const ORG_SLUG = "tirta-teknik-demo";

  const existing = await prisma.organization.findUnique({ where: { slug: ORG_SLUG } });
  if (existing) {
    console.log("Seed dilewati: organisasi demo sudah ada. Pakai `pnpm db:reset` untuk mulai bersih.");
    return;
  }

  // ---------- 1. User demo ----------
  console.log("1/8 Membuat user demo…");
  await auth.api.signUpEmail({
    body: { name: "Demo Owner", email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL } });

  await auth.api.signUpEmail({
    body: { name: "Sari Sales", email: "sales@saleskit.id", password: DEMO_PASSWORD },
  });
  const salesUser = await prisma.user.findUniqueOrThrow({
    where: { email: "sales@saleskit.id" },
  });

  // ---------- 2. Organisasi + member + settings ----------
  console.log("2/8 Membuat organisasi demo…");
  const org = await prisma.organization.create({
    data: { name: "PT Tirta Teknik Nusantara (Demo)", slug: ORG_SLUG },
  });
  await prisma.member.createMany({
    data: [
      { organizationId: org.id, userId: user.id, role: "owner" },
      { organizationId: org.id, userId: salesUser.id, role: "member" },
    ],
  });
  await prisma.orgSettings.create({
    data: {
      organizationId: org.id,
      address: "Jl. Industri Raya No. 88, Kawasan Industri Jababeka, Cikarang",
      npwp: "01.234.567.8-901.000",
      phone: "021-8934-5678",
      email: "sales@tirtateknik.co.id",
      numberPrefix: "SPH-TTN",
      numberFormat: "{seq:3}/{prefix}/{romanMonth}/{year}",
      vatRate: "0.11",
      bankName: "Bank Mandiri",
      bankAccount: "123-00-4567890-1",
      bankBranch: "KCP Cikarang Jababeka",
      bankHolder: "PT Tirta Teknik Nusantara",
      signerName: "Demo Owner",
      signerTitle: "Direktur",
      defaultFranco: "Gudang kami, Cikarang",
      defaultDeliveryTime: "2-3 minggu setelah PO",
      defaultTermsOfPayment: "DP 50%, pelunasan sebelum kirim",
      defaultPriceIncludeNote: "Belum termasuk PPN 11%",
      defaultValidityDays: 30,
    },
  });

  const scope = { db: orgDb(org.id), orgId: org.id };

  // ---------- 3. Katalog ----------
  console.log("3/8 Mengisi katalog produk…");
  const catPompa = await prisma.category.create({
    data: { organizationId: org.id, name: "Pompa" },
  });
  const catFiltrasi = await prisma.category.create({
    data: { organizationId: org.id, name: "Filtrasi & Membran" },
  });
  const catKimia = await prisma.category.create({
    data: { organizationId: org.id, name: "Chemical" },
  });
  const catPipa = await prisma.category.create({
    data: { organizationId: org.id, name: "Pipa & Fitting" },
  });

  const productsData = [
    { name: "Pompa Dosing Kimia 6 L/h", brand: "Grundfos", type: "DDA 7.5-16", unit: "Unit", defaultPrice: "12500000", categoryId: catPompa.id, spec: "Digital dosing, 6 L/h @ 10 bar, PVDF head" },
    { name: "Pompa Transfer Centrifugal 3 m3/h", brand: "CNP", type: "CHL4-30", unit: "Unit", defaultPrice: "6750000", categoryId: catPompa.id, spec: "SS304, 0.75 kW, 220V" },
    { name: "Membran RO 4040", brand: "Filmtec", type: "BW30-4040", unit: "Pcs", defaultPrice: "4850000", categoryId: catFiltrasi.id, spec: "Brackish water, 2400 GPD" },
    { name: "Sand Filter FRP 1054", brand: "Aqualine", type: "FRP-1054", unit: "Set", defaultPrice: "3900000", categoryId: catFiltrasi.id, spec: "Tangki FRP 10x54 inch + multiport valve manual" },
    { name: "Carbon Filter FRP 1054", brand: "Aqualine", type: "FRP-1054C", unit: "Set", defaultPrice: "4200000", categoryId: catFiltrasi.id, spec: "Media karbon aktif granular" },
    { name: "Antiscalant", brand: "Genesys", type: "LF", unit: "Drum", defaultPrice: "5250000", categoryId: catKimia.id, spec: "Drum 25 kg, food grade" },
    { name: "Chlorine 90% Tablet", brand: "Niclon", type: "T-90", unit: "Drum", defaultPrice: "2850000", categoryId: catKimia.id, spec: "Drum 50 kg" },
    { name: "Pipa PVC 2 inch", brand: "Rucika", type: "AW", unit: "Batang", defaultPrice: "185000", categoryId: catPipa.id, spec: "AW class, panjang 4 m" },
    { name: "Pipa PVC 3 inch", brand: "Rucika", type: "AW", unit: "Batang", defaultPrice: "310000", categoryId: catPipa.id, spec: "AW class, panjang 4 m" },
    { name: "Ball Valve PVC 2 inch", brand: "Spears", type: "BV-2", unit: "Pcs", defaultPrice: "425000", categoryId: catPipa.id, spec: "True union, socket" },
  ];
  for (const p of productsData) {
    await prisma.product.create({ data: { organizationId: org.id, ...p } });
  }

  // ---------- 4. Pelanggan ----------
  console.log("4/8 Mengisi pelanggan…");
  const cust1 = await prisma.customer.create({
    data: {
      organizationId: org.id,
      name: "PT Tirta Mandiri Sejahtera",
      address: "Jl. Raya Bekasi KM 21, Bekasi",
      city: "Bekasi",
      phone: "021-8845-1122",
      email: "purchasing@tirtamandiri.co.id",
      contacts: {
        create: [
          { organizationId: org.id, name: "Budi Santoso", title: "Purchasing", phone: "081234567890", email: "budi@tirtamandiri.co.id" },
          { organizationId: org.id, name: "Rina Wati", title: "Engineering", phone: "081298765432" },
        ],
      },
    },
  });
  const cust2 = await prisma.customer.create({
    data: {
      organizationId: org.id,
      name: "PT Indofood Sukses Makmur - Divisi Beverage",
      address: "Kawasan Industri MM2100, Cibitung",
      city: "Cibitung",
      phone: "021-8998-0001",
      contacts: {
        create: [
          { organizationId: org.id, name: "Andi Prasetyo", title: "Maintenance Manager", phone: "081311223344" },
        ],
      },
    },
  });
  const cust3 = await prisma.customer.create({
    data: {
      organizationId: org.id,
      name: "Hotel Grand Cikarang",
      city: "Cikarang",
      phone: "021-8990-7788",
      contacts: {
        create: [
          { organizationId: org.id, name: "Dewi Lestari", title: "Chief Engineer", phone: "081355667788" },
        ],
      },
    },
  });

  // ---------- 5. Vendor ----------
  console.log("5/8 Mengisi vendor…");
  const vendor1 = await prisma.vendor.create({
    data: {
      organizationId: org.id,
      name: "PT Aneka Pompa Industri",
      city: "Jakarta",
      phone: "021-6600-1234",
      email: "sales@anekapompa.co.id",
      notes: "Distributor resmi Grundfos & CNP. Pembayaran net 30.",
    },
  });
  const vendor2 = await prisma.vendor.create({
    data: {
      organizationId: org.id,
      name: "CV Filter Jaya Abadi",
      city: "Surabaya",
      phone: "031-591-8899",
      notes: "Spesialis membran & media filter. Respons cepat via WA.",
    },
  });
  await prisma.vendorProduct.createMany({
    data: [
      { organizationId: org.id, vendorId: vendor1.id, name: "Pompa Dosing Kimia 6 L/h", brand: "Grundfos", unit: "Unit", price: "10800000", sourceType: "MANUAL" },
      { organizationId: org.id, vendorId: vendor1.id, name: "Pompa Transfer Centrifugal 3 m3/h", brand: "CNP", unit: "Unit", price: "5600000", sourceType: "MANUAL" },
      { organizationId: org.id, vendorId: vendor2.id, name: "Membran RO 4040", brand: "Filmtec", unit: "Pcs", price: "4100000", sourceType: "MANUAL" },
      { organizationId: org.id, vendorId: vendor2.id, name: "Antiscalant Genesys LF 25kg", brand: "Genesys", unit: "Drum", price: "4550000", sourceType: "MANUAL" },
    ],
  });

  // ---------- 6. Penawaran (lewat service — nomor & lifecycle asli) ----------
  console.log("6/8 Membuat penawaran…");
  const products = await prisma.product.findMany({ where: { organizationId: org.id } });
  const byName = (n: string) => products.find((p) => p.name.includes(n));

  // 6a. Terbit + WON (deal otomatis dibuat saat issue)
  const q1 = await createQuotation(scope, user.id, {
    customerId: cust2.id,
    customerName: cust2.name,
    attn: "Bpk. Andi Prasetyo",
    subject: "Penawaran Penggantian Membran RO Line 2",
    quoteDate: "",
    franco: "Site Cibitung",
    deliveryTime: "1-2 minggu setelah PO",
    termsOfPayment: "Net 30 setelah barang diterima",
    priceIncludeNote: "",
    validityDays: 30,
    vatPercent: 11,
    docDiscountType: "AMOUNT",
    docDiscountValue: "0",
    notes: "",
    items: [
      { productId: byName("Membran RO")?.id ?? "", name: "Membran RO 4040", brand: "Filmtec", type: "BW30-4040", spec: "Brackish water, 2400 GPD", qty: "8", unit: "Pcs", unitPrice: "4850000", discountPercent: "0" },
      { productId: byName("Antiscalant")?.id ?? "", name: "Antiscalant", brand: "Genesys", type: "LF", spec: "Drum 25 kg", qty: "2", unit: "Drum", unitPrice: "5250000", discountPercent: "5" },
    ],
  });
  await issueQuotation(scope, user.id, q1.id);
  await setQuotationStatus(scope, q1.id, "WON");

  // 6b. Terbit, masih berjalan (SENT) + diskon dokumen
  const q2 = await createQuotation(scope, salesUser.id, {
    customerId: cust1.id,
    customerName: cust1.name,
    attn: "Bpk. Budi Santoso",
    subject: "Penawaran Instalasi Pre-Treatment Water System",
    quoteDate: "",
    franco: "Site Bekasi",
    deliveryTime: "3-4 minggu setelah PO",
    termsOfPayment: "DP 50%, pelunasan sebelum kirim",
    priceIncludeNote: "",
    validityDays: 21,
    vatPercent: 11,
    docDiscountType: "PERCENT",
    docDiscountValue: "2.5",
    notes: "Follow-up ketat — kompetitor ikut menawarkan.",
    items: [
      { productId: byName("Sand Filter")?.id ?? "", name: "Sand Filter FRP 1054", brand: "Aqualine", type: "FRP-1054", spec: "Tangki FRP + multiport valve", qty: "2", unit: "Set", unitPrice: "3900000", discountPercent: "0" },
      { productId: byName("Carbon Filter")?.id ?? "", name: "Carbon Filter FRP 1054", brand: "Aqualine", type: "FRP-1054C", spec: "Media karbon aktif", qty: "2", unit: "Set", unitPrice: "4200000", discountPercent: "0" },
      { productId: byName("Pompa Transfer")?.id ?? "", name: "Pompa Transfer Centrifugal 3 m3/h", brand: "CNP", type: "CHL4-30", spec: "SS304, 0.75 kW", qty: "1", unit: "Unit", unitPrice: "6750000", discountPercent: "0" },
      { productId: byName("Pipa PVC 2")?.id ?? "", name: "Pipa PVC 2 inch", brand: "Rucika", type: "AW", spec: "Panjang 4 m", qty: "20", unit: "Batang", unitPrice: "185000", discountPercent: "0" },
    ],
  });
  await issueQuotation(scope, salesUser.id, q2.id);

  // 6c. Draft belum terbit
  await createQuotation(scope, user.id, {
    customerId: cust3.id,
    customerName: cust3.name,
    attn: "Ibu Dewi Lestari",
    subject: "Penawaran Chemical Dosing Kolam Renang",
    quoteDate: "",
    franco: "",
    deliveryTime: "",
    termsOfPayment: "",
    priceIncludeNote: "",
    validityDays: 30,
    vatPercent: 11,
    docDiscountType: "AMOUNT",
    docDiscountValue: "0",
    notes: "Menunggu konfirmasi spesifikasi dosing pump.",
    items: [
      { productId: byName("Pompa Dosing")?.id ?? "", name: "Pompa Dosing Kimia 6 L/h", brand: "Grundfos", type: "DDA 7.5-16", spec: "", qty: "2", unit: "Unit", unitPrice: "12500000", discountPercent: "0" },
      { productId: byName("Chlorine")?.id ?? "", name: "Chlorine 90% Tablet", brand: "Niclon", type: "T-90", spec: "Drum 50 kg", qty: "1", unit: "Drum", unitPrice: "2850000", discountPercent: "0" },
    ],
  });

  // ---------- 7. Pipeline: aktivitas & reminder ----------
  console.log("7/8 Mengisi aktivitas & reminder…");
  const dealQ2 = await prisma.quotation.findUniqueOrThrow({
    where: { id: q2.id },
    select: { dealId: true },
  });
  if (dealQ2.dealId) {
    await prisma.deal.update({
      where: { id: dealQ2.dealId },
      data: { stage: "NEGOTIATION" },
    });
    await prisma.activity.createMany({
      data: [
        { organizationId: org.id, dealId: dealQ2.dealId, type: "CALL", content: "Telepon Pak Budi — minta diskon tambahan 5%, akan didiskusikan internal.", createdById: salesUser.id, happenedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
        { organizationId: org.id, dealId: dealQ2.dealId, type: "MEETING", content: "Site survey ke Bekasi bersama tim engineering pelanggan.", createdById: salesUser.id, happenedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) },
      ],
    });
    await prisma.reminder.createMany({
      data: [
        { organizationId: org.id, dealId: dealQ2.dealId, dueAt: new Date(Date.now() - 24 * 60 * 60 * 1000), note: "Follow-up keputusan diskon ke Pak Budi (TERLAMBAT — demo reminder)", assigneeId: salesUser.id },
        { organizationId: org.id, dealId: dealQ2.dealId, dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), note: "Kirim revisi penawaran bila diskon disetujui", assigneeId: salesUser.id },
      ],
    });
  }

  // Deal lead manual tanpa penawaran
  await prisma.deal.create({
    data: {
      organizationId: org.id,
      customerId: cust3.id,
      title: "Upgrade sistem filtrasi kolam renang hotel",
      stage: "LEAD",
      value: "45000000",
      ownerId: user.id,
    },
  });

  // ---------- 8. Permintaan (inquiry) terekstrak ----------
  console.log("8/8 Membuat contoh permintaan + ekstraksi mock…");
  const contohTeks = readFileSync(
    path.join(process.cwd(), "public", "contoh-permintaan.txt"),
    "utf8",
  );
  const inquiry = await createInquiryFromText(scope, user.id, {
    rawText: contohTeks,
    customerId: cust1.id,
  });
  await extractInquiry(scope, user.id, inquiry.id);

  console.log("");
  console.log("Seed selesai!");
  console.log("  Login   : demo@saleskit.id / demo1234  (owner)");
  console.log("  Login 2 : sales@saleskit.id / demo1234 (sales)");
  console.log("  Contoh file upload: public/contoh-permintaan.txt");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/db");
    await prisma.$disconnect();
  });
