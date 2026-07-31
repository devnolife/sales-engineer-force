import { describe, expect, it } from "vitest";
import { MockAiProvider } from "./mock-provider";

const provider = new MockAiProvider();

const CONTOH = `Kepada Yth. Tim Sales,

Kami dari PT Tirta Mandiri Sejahtera membutuhkan penawaran untuk:

- 2 unit Pompa dosing kimia 6 L/h
- 4 pcs Membran RO 4040
- 1 drum Antiscalant 25 kg
- Panel kontrol pompa - 1 unit

Terima kasih,
Budi Santoso
0812-3456-7890`;

describe("MockAiProvider.extractInquiry", () => {
  it("mengekstrak item dengan qty & unit dari format umum", async () => {
    const result = await provider.extractInquiry({ rawText: CONTOH });
    const names = result.items.map((i) => i.name);

    expect(names).toContain("Pompa dosing kimia 6 L/h");
    expect(names).toContain("Membran RO 4040");
    expect(names).toContain("Panel kontrol pompa");

    const pompa = result.items.find((i) => i.name.startsWith("Pompa dosing"));
    expect(pompa?.qty).toBe("2");
    expect(pompa?.unit).toBe("unit");
  });

  it("tidak menganggap nomor telepon sebagai item", async () => {
    const result = await provider.extractInquiry({ rawText: CONTOH });
    for (const item of result.items) {
      expect(item.name).not.toMatch(/^-?\d[\d-]*$/);
      expect(Number(item.qty)).toBeLessThanOrEqual(100000);
      expect(item.qty).not.toMatch(/^0\d/);
    }
  });

  it("mendeteksi nama perusahaan peminta", async () => {
    const result = await provider.extractInquiry({ rawText: CONTOH });
    expect(result.customerName).toContain("PT Tirta Mandiri");
  });

  it("mengabaikan baris salam/penutup", async () => {
    const result = await provider.extractInquiry({ rawText: CONTOH });
    const names = result.items.map((i) => i.name.toLowerCase());
    expect(names.some((n) => n.includes("terima kasih"))).toBe(false);
    expect(names.some((n) => n.includes("kepada"))).toBe(false);
  });

  it("teks kosong -> item contoh berlabel mock dengan confidence rendah", async () => {
    const result = await provider.extractInquiry({ rawText: "" });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(0.3);
    expect(result.note).toBeTruthy();
  });

  it("selalu mengidentifikasi diri sebagai provider mock", async () => {
    const result = await provider.extractInquiry({ rawText: CONTOH });
    expect(result.provider).toBe("mock");
  });
});
