import { describe, expect, it } from "vitest";
import { bestMatch, normalizeTokens, scoreMatch, statusFor } from "./matching";

const PRODUCTS = [
  { id: "p1", name: "Pompa Dosing Kimia 6 L/h", brand: "Grundfos", type: "DDA 7.5-16" },
  { id: "p2", name: "Membran RO 4040", brand: "Filmtec", type: "BW30-4040" },
  { id: "p3", name: "Antiscalant", brand: "Genesys", spec: "Drum 25 kg" },
  { id: "p4", name: "Pipa PVC 2 inch", brand: "Rucika", spec: "AW, panjang 4 m" },
  { id: "p5", name: "Sand Filter FRP 1054", spec: "Tangki FRP + multiport valve" },
];

describe("normalizeTokens", () => {
  it("membuang stopword dan tanda baca", () => {
    expect(normalizeTokens("Pompa dan Valve, untuk RO")).toEqual([
      "pompa",
      "valve",
      "ro",
    ]);
  });

  it("menyeragamkan inch", () => {
    expect(normalizeTokens('Pipa 2" AW')).toContain("2inch");
    expect(normalizeTokens("Pipa 2 inch AW")).toContain("2inch");
  });
});

describe("scoreMatch", () => {
  it("memberi skor tinggi untuk nama yang hampir sama", () => {
    expect(scoreMatch("pompa dosing kimia", PRODUCTS[0])).toBeGreaterThanOrEqual(0.75);
  });

  it("mengenali merek/tipe sebagai sinyal tambahan", () => {
    const dengan = scoreMatch("membran filmtec 4040", PRODUCTS[1]);
    const tanpa = scoreMatch("membran 4040", PRODUCTS[1]);
    expect(dengan).toBeGreaterThan(0);
    expect(dengan).toBeGreaterThanOrEqual(tanpa);
  });

  it("memberi skor rendah untuk barang yang berbeda", () => {
    expect(scoreMatch("kabel listrik NYY 3x2.5", PRODUCTS[0])).toBeLessThan(0.4);
  });
});

describe("bestMatch", () => {
  it("memilih produk paling relevan", () => {
    const result = bestMatch("butuh pipa pvc 2 inch merk rucika", PRODUCTS);
    expect(result?.productId).toBe("p4");
    expect(result?.status).not.toBe("UNMATCHED");
  });

  it("mengembalikan UNMATCHED untuk barang tak dikenal", () => {
    const result = bestMatch("genset silent 100 kVA", PRODUCTS);
    expect(result === null || result.status === "UNMATCHED").toBe(true);
  });
});

describe("statusFor", () => {
  it("ambang MATCHED/SUGGESTED/UNMATCHED", () => {
    expect(statusFor(0.8)).toBe("MATCHED");
    expect(statusFor(0.5)).toBe("SUGGESTED");
    expect(statusFor(0.2)).toBe("UNMATCHED");
  });
});
