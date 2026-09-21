import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultMarginPercent, suggestSellPrice } from "./service";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllEnvs());

describe("indicative IDR selling prices", () => {
  it("uses the configured margin, including zero", () => {
    vi.stubEnv("SOURCING_MARGIN_PERCENT", "25");
    expect(defaultMarginPercent()).toBe(25);
    expect(suggestSellPrice("1250000", defaultMarginPercent())).toBe("1563000");
    expect(suggestSellPrice("1250000", 0)).toBe("1250000");
  });

  it("rounds half up to thousands using decimal arithmetic", () => {
    expect(suggestSellPrice("9007199254741000", 30)).toBe("11709359031163000");
    expect(suggestSellPrice("9007199254741199.999", 25)).toBe("11258999068426000");
    expect(suggestSellPrice("100400", 25)).toBe("126000");
  });

  it.each([undefined, "", "0", "-1", "NaN", "Infinity", "invalid"])(
    "does not suggest a selling price for invalid cost %s", (price) => {
      expect(suggestSellPrice(price, 30)).toBeUndefined();
    },
  );

  it("does not display zero when rounding a small positive cost", () => {
    expect(suggestSellPrice("100", 30)).toBeUndefined();
  });

  it.each([-1, 501, Infinity, NaN])("rejects invalid margin %s", (margin) => {
    expect(suggestSellPrice("100000", margin)).toBeUndefined();
  });
});
