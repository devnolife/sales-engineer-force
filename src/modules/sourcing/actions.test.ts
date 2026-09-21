import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireOrgContext } from "@/lib/org-context";
import { orgDb } from "@/lib/tenant";
import { ambilDetailTokoAction, cariVendorAction } from "./actions";
import { fetchVendorSourceDetail, searchVendorSources } from "./service";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/org-context", () => ({ requireOrgContext: vi.fn() }));
vi.mock("./service", async (importOriginal) => ({
  ...await importOriginal<typeof import("./service")>(),
  searchVendorSources: vi.fn(),
  fetchVendorSourceDetail: vi.fn(),
}));

const ctx = {
  db: orgDb("sourcing-action-org"), orgId: "sourcing-action-org",
  userId: "sourcing-action-user", userName: "Test", userEmail: "test@example.com", role: "member",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOrgContext).mockResolvedValue(ctx);
});

describe("sourcing server actions", () => {
  it("does not swallow authentication redirects", async () => {
    const redirect = new Error("authentication navigation");
    vi.mocked(requireOrgContext).mockRejectedValue(redirect);
    await expect(cariVendorAction("pompa")).rejects.toBe(redirect);
    await expect(ambilDetailTokoAction({ searchId: "search-1", resultId: "result-1" }))
      .rejects.toBe(redirect);
    expect(searchVendorSources).not.toHaveBeenCalled();
    expect(fetchVendorSourceDetail).not.toHaveBeenCalled();
  });

  it("validates queries at the action boundary", async () => {
    expect(await cariVendorAction("ab")).toMatchObject({
      status: "error", error: { code: "INVALID_INPUT" },
    });
    expect(searchVendorSources).not.toHaveBeenCalled();
  });

  it("passes only authenticated organization/user context to search", async () => {
    const outcome = {
      status: "complete" as const,
      data: { searchId: "search-1", provider: "firecrawl" as const, marginPercent: 25, results: [] },
    };
    vi.mocked(searchVendorSources).mockResolvedValue(outcome);
    expect(await cariVendorAction("  pompa  ", "item-1")).toEqual(outcome);
    expect(searchVendorSources).toHaveBeenCalledWith(ctx, ctx.userId, "pompa", "item-1");
  });

  it("passes stored result references, never a caller supplied target URL", async () => {
    const outcome = {
      status: "error" as const, error: { code: "NOT_FOUND" as const, message: "Tidak ditemukan." },
    };
    vi.mocked(fetchVendorSourceDetail).mockResolvedValue(outcome);
    expect(await ambilDetailTokoAction({ searchId: "search-1", resultId: "result-1" })).toEqual(outcome);
    expect(fetchVendorSourceDetail).toHaveBeenCalledWith(ctx, ctx.userId, {
      searchId: "search-1", resultId: "result-1",
    });
  });
});
