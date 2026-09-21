import { describe, expect, it } from "vitest";
import * as formatting from "./format";

describe("explicit sourcing currency formatting", () => {
  it("retains the existing rupiah display", () => {
    expect(formatting.formatCurrency("1250000", "IDR")).toBe(formatting.formatRupiah("1250000"));
    expect(formatting.formatRupiah("1250000")).toBe("Rp 1.250.000");
  });

  it("shows the source currency without FX or rupiah formatting", () => {
    expect(formatting.formatCurrency("99.90", "USD")).toContain("USD");
    expect(formatting.formatCurrency("99.90", "USD")).toContain("99,90");
    expect(formatting.formatCurrency("99.90", "USD")).not.toContain("Rp");
  });

  it("preserves large monetary strings without floating-point conversion", () => {
    expect(formatting.formatCurrency("9007199254740993", "IDR")).toBe("Rp 9.007.199.254.740.993");
    expect(formatting.formatCurrency("9007199254740993.25", "USD")).toContain("9.007.199.254.740.993,25");
  });

  it("uses the currency's minor units", () => {
    expect(formatting.formatCurrency("99.5", "JPY")).toContain("100");
    expect(formatting.formatCurrency("1.2345", "BHD")).toContain("1,235");
  });

  it.each(["", "NaN", "Infinity"])("rejects invalid amount %s", (amount) => {
    expect(() => formatting.formatCurrency(amount, "USD")).toThrow();
  });

  it("requires an explicit valid currency code", () => {
    expect(() => formatting.formatCurrency("100", "")).toThrow();
    expect(() => formatting.formatCurrency("100", "usd")).toThrow();
  });
});
