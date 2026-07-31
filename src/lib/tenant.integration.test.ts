import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Test isolasi tenant (PRD §8.2) — berjalan terhadap database dev lokal.
 *
 * Opt-in karena butuh DB:
 *   PowerShell: $env:RUN_DB_TESTS="1"; pnpm test
 *   bash:       RUN_DB_TESTS=1 pnpm test
 *
 * Membuat 2 organisasi sandbox, menguji bahwa client ter-scope org A tidak
 * pernah bisa membaca/mengubah data org B, lalu membersihkan diri.
 */

const enabled = process.env.RUN_DB_TESTS === "1";

describe.runIf(enabled)("isolasi tenant (orgDb)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let orgDb: typeof import("@/lib/tenant").orgDb;
  let TenantError: typeof import("@/lib/tenant").TenantError;

  const orgA = "test-org-a-isolation";
  const orgB = "test-org-b-isolation";
  let productA: string;
  let productB: string;

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ orgDb, TenantError } = await import("@/lib/tenant"));

    await prisma.product.deleteMany({
      where: { organizationId: { in: [orgA, orgB] } },
    });

    const a = await prisma.product.create({
      data: { organizationId: orgA, name: "Produk Rahasia A", unit: "Unit" },
    });
    const b = await prisma.product.create({
      data: { organizationId: orgB, name: "Produk Rahasia B", unit: "Unit" },
    });
    productA = a.id;
    productB = b.id;
  });

  afterAll(async () => {
    await prisma.product.deleteMany({
      where: { organizationId: { in: [orgA, orgB] } },
    });
    await prisma.$disconnect();
  });

  it("findMany hanya melihat data organisasi sendiri", async () => {
    const dbA = orgDb(orgA);
    const products = await dbA.product.findMany();
    expect(products.some((p) => p.id === productA)).toBe(true);
    expect(products.some((p) => p.id === productB)).toBe(false);
  });

  it("findMany dengan filter tetap tidak bocor lintas org", async () => {
    const dbA = orgDb(orgA);
    const products = await dbA.product.findMany({
      where: { name: { contains: "Rahasia" } },
    });
    expect(products).toHaveLength(1);
    expect(products[0].id).toBe(productA);
  });

  it("findUnique milik org lain mengembalikan null", async () => {
    const dbA = orgDb(orgA);
    const product = await dbA.product.findUnique({ where: { id: productB } });
    expect(product).toBeNull();
  });

  it("update milik org lain ditolak", async () => {
    const dbA = orgDb(orgA);
    await expect(
      dbA.product.update({ where: { id: productB }, data: { name: "Dibajak" } }),
    ).rejects.toThrow(TenantError);
    const untouched = await prisma.product.findUnique({ where: { id: productB } });
    expect(untouched?.name).toBe("Produk Rahasia B");
  });

  it("delete milik org lain ditolak", async () => {
    const dbA = orgDb(orgA);
    await expect(dbA.product.delete({ where: { id: productB } })).rejects.toThrow(
      TenantError,
    );
  });

  it("create memaksa organizationId org aktif (tidak bisa menyamar)", async () => {
    const dbA = orgDb(orgA);
    const created = await dbA.product.create({
      // Sengaja mencoba menulis ke org B — harus dipaksa jadi org A.
      data: { organizationId: orgB, name: "Percobaan Menyamar", unit: "Unit" },
    });
    expect(created.organizationId).toBe(orgA);
  });

  it("count/aggregate ikut ter-scope", async () => {
    const dbA = orgDb(orgA);
    const count = await dbA.product.count({ where: { name: { contains: "Rahasia" } } });
    expect(count).toBe(1);
  });

  it("orgDb tanpa organizationId ditolak", async () => {
    expect(() => orgDb("")).toThrow(TenantError);
  });
});

describe.runIf(!enabled)("isolasi tenant (dilewati)", () => {
  it("di-skip — set RUN_DB_TESTS=1 untuk menjalankan", () => {
    expect(true).toBe(true);
  });
});
