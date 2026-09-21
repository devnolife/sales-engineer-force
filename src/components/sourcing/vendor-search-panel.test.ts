import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { vendorResultSchema } from "@/modules/sourcing/schema";
import type { SearchData } from "@/modules/sourcing/types";
import fixtures from "@/modules/sourcing/__fixtures__/firecrawl-contract.json";
import local from "@/modules/sourcing/__fixtures__/selfhost-contract.json";
import { VendorSearchResults } from "./vendor-search-panel";

vi.mock("@/modules/sourcing/actions", () => ({
  cariVendorAction: vi.fn(), ambilDetailTokoAction: vi.fn(),
}));

const idr = vendorResultSchema.parse({
  ...fixtures.detailIdr.result, id: "idr", suggestedPrice: "1563000", marginPercent: 25,
});
const usd = vendorResultSchema.parse({ ...fixtures.detailUsd.result, id: "usd" });
const pending = vendorResultSchema.parse({ ...fixtures.search.results[0], id: "pending" });
const unavailable = vendorResultSchema.parse({ ...fixtures.detailUnavailable.result, id: "unavailable" });
const ambiguous = vendorResultSchema.parse({ ...fixtures.detailAmbiguous.result, id: "ambiguous" });

function render(results = [idr, usd, pending, unavailable, ambiguous], provider: SearchData["provider"] = "firecrawl") {
  const onDetail = vi.fn();
  const html = renderToStaticMarkup(createElement(VendorSearchResults, {
    data: { searchId: "search-1", provider, marginPercent: 30, results },
    detailPendingId: null,
    disabled: false,
    detailErrors: {},
    onDetail,
  }));
  return { html, onDetail };
}

describe("shared sourcing results", () => {
  it("shows explicit price states and does not invent a unit", () => {
    const { html } = render();
    expect(html).toContain("Belum diambil");
    expect(html).toContain("Harga belum tersedia");
    expect(html).toContain("Perlu review");
    expect(html).toContain("Satuan belum diketahui");
    expect(html).not.toContain("/Unit");
  });

  it("displays currency, actual per-result margin, source and observation timestamp", () => {
    const { html } = render();
    expect(html).toContain("USD");
    expect(html).toContain("99,90");
    expect(html).toContain("+25%");
    expect(html).not.toContain("+30%");
    expect(html).toContain('href="https://supplier.example/products/pump"');
    expect(html).toContain('dateTime="2026-09-01T00:00:00.000Z"');
    expect(html).toContain("Bukti harga");
  });

  it("does not take details on render and only offers detail for web results", () => {
    const { html, onDetail } = render([pending]);
    expect(html).toContain("Ambil detail");
    expect(onDetail).not.toHaveBeenCalled();
    const internal = vendorResultSchema.parse({
      ...idr, id: "internal", sourceType: "INTERNAL", evidence: { method: "internal-pricelist" },
    });
    expect(render([internal]).html).not.toContain("Ambil detail");
  });

  it("keeps the prior observation visible with an explicit refresh-failure warning", () => {
    const html = renderToStaticMarkup(createElement(VendorSearchResults, {
      data: { searchId: "search-1", provider: "firecrawl", marginPercent: 25, results: [idr] },
      detailPendingId: null,
      disabled: false,
      detailErrors: { idr: { code: "TIMEOUT", message: "Layanan melewati batas waktu." } },
      onDetail: vi.fn(),
    }));
    expect(html).toContain("Pembaruan gagal");
    expect(html).toContain("1.250.000");
    expect(html).toContain("Layanan melewati batas waktu");
  });

  it("clearly identifies mock results", () => {
    const mock = vendorResultSchema.parse({
      ...idr, id: "mock", sourceType: "WEB_MOCK", evidence: { method: "mock" },
    });
    expect(render([mock]).html).toContain("Contoh");
  });

  it("renders selfhost evidence and labels without changing detail controls or promising free resources", () => {
    const results = [
      local.search.results[0], local.detailCrawl4ai.result, local.detailBrowserUse.result,
      local.detailUnavailable.result, local.detailAmbiguous.result,
    ].map((result, index) => vendorResultSchema.parse({ ...result, id: `selfhost-${index}` }));
    const onDetail = vi.fn();
    const html = renderToStaticMarkup(createElement(VendorSearchResults, {
      data: { searchId: "selfhost-search", provider: "selfhost", marginPercent: 30, results },
      detailPendingId: null, disabled: false, detailErrors: {}, onDetail,
    }));
    expect(html).toContain("SearXNG · supplier.example");
    expect(html).toContain("Sebagian mesin pencari tidak merespons; hasil mungkin tidak lengkap.");
    expect(html).toContain("Crawl4AI · supplier.example");
    expect(html).toContain("Browser Use · supplier.example");
    expect(html).toContain("tanpa Firecrawl");
    expect(html).toContain("resource server");
    expect(html).toContain("Ambil detail");
    expect(html).toContain("Perbarui detail");
    expect(html).toContain("Belum diambil");
    expect(html).toContain("Harga belum tersedia");
    expect(html).toContain("Perlu review");
    expect(html).toContain("USD");
    expect(html).toContain("99,90");
    expect(html).toContain("Bukti harga");
    expect(html).toContain('dateTime="2026-09-01T00:00:00.000Z"');
    expect(html).not.toMatch(/Contoh|gratis|bebas biaya/i);
    expect(onDetail).not.toHaveBeenCalled();
  });

  it("does not show a selfhost banner for Firecrawl results", () => {
    expect(render().html).not.toContain("tanpa Firecrawl");
  });

  it("renders the genuine internal pricelist without claiming a web engine when sourcing is unconfigured", () => {
    const internal = vendorResultSchema.parse({
      id: "internal", vendorName: "Vendor internal", productName: "Pompa internal",
      priceStatus: "available", price: "100000", currency: "IDR", unit: "Unit",
      suggestedPrice: "125000", marginPercent: 25,
      sourceType: "INTERNAL", sourceLabel: "Pricelist internal",
      retrievedAt: "2026-09-01T00:00:00.000Z",
      evidence: { method: "internal-pricelist", productTitle: "Pompa internal" },
    });
    const { html, onDetail } = render([internal], "unconfigured");
    expect(html).toContain("Pompa internal");
    expect(html).toContain("Pricelist internal");
    expect(html).toContain("100.000");
    expect(html).toContain("125.000");
    expect(html).toContain("+25%");
    expect(html).not.toMatch(/Ambil detail|Contoh|Sourcing lokal|Firecrawl|SearXNG/);
    expect(onDetail).not.toHaveBeenCalled();
  });
});
