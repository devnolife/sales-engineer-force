import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgScope } from "@/modules/org/service";
import { convertInquiryToQuotation, extractInquiry, updateInquiryText } from "./service";

vi.mock("server-only", () => ({}));
vi.mock("@/modules/ai", () => ({
  getAiProvider: () => ({
    name: "local",
    extractInquiry: async () => ({
      provider: "local", confidence: 0.8,
      items: [{ rawText: "2 unit Pompa dosing", name: "Pompa dosing", qty: "2", unit: "unit" }],
    }),
  }),
}));

const TEST_DATABASE = "postgresql://ocr_review:synthetic-ocr-review-only@127.0.0.1:18932/ocr_review?schema=public&connection_limit=4";

function gate() {
  let arrive: () => void = () => {};
  let release: () => void = () => {};
  const reached = new Promise<void>((resolve) => { arrive = resolve; });
  const resume = new Promise<void>((resolve) => { release = resolve; });
  let used = false;
  return {
    reached, release,
    async pause() {
      if (used) return;
      used = true;
      arrive();
      await resume;
    },
  };
}

function outcome<T>(operation: Promise<T>) {
  return operation.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}

describe.runIf(process.env.RUN_PG_RACE_TESTS === "1")("OCR source concurrency on PostgreSQL", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let orgDb: typeof import("@/lib/tenant").orgDb;
  let scope: OrgScope;
  let inquiryId: string;
  const userId = "ocr-race-test-user";

  beforeAll(async () => {
    if (process.env.DATABASE_URL !== TEST_DATABASE) {
      throw new Error("Use only the disposable PostgreSQL OCR review database on loopback18932.");
    }
    ({ prisma } = await import("@/lib/db"));
    ({ orgDb } = await import("@/lib/tenant"));
    const isolation = await prisma.$queryRaw<{ default_transaction_isolation: string }[]>`
      SHOW default_transaction_isolation`;
    expect(isolation[0]?.default_transaction_isolation).toBe("read committed");
  });
  beforeEach(async () => {
    const orgId = `ocr-pg-race-${randomUUID()}`;
    scope = { orgId, db: orgDb(orgId) };
    const inquiry = await scope.db.inquiry.create({ data: {
      organizationId: orgId, rawText: "2 unit Pompa dosing", source: "UPLOAD",
      status: "EXTRACTED", extractionProvider: "local", extractedAt: new Date(),
      createdById: userId,
      items: { create: {
        organizationId: orgId, rawText: "2 unit Pompa dosing", name: "Pompa dosing",
        qty: "2", unit: "unit", lineNo: 1,
      } },
    } });
    inquiryId = inquiry.id;
  });
  afterEach(async () => {
    if (!scope) return;
    const where = { organizationId: scope.orgId };
    await prisma.inquiry.deleteMany({ where });
    await prisma.quotation.deleteMany({ where });
    await prisma.aiLog.deleteMany({ where });
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  it("rolls back extraction when an edit commits after its source comparison", async () => {
    const pause = gate();
    const db = scope.db.$extends({ query: { inquiryItem: {
      async deleteMany({ args, query }) {
        await pause.pause();
        return query(args);
      },
    } } });
    const before = await scope.db.inquiryItem.findMany();
    const pending = outcome(extractInquiry({ ...scope, db }, userId, inquiryId));
    await pause.reached;
    try {
      await updateInquiryText({ ...scope, db: orgDb(scope.orgId) }, userId, inquiryId, "9 unit Pompa dosing");
    } finally {
      pause.release();
    }
    expect((await pending).ok).toBe(false);
    expect(await scope.db.inquiry.findFirst()).toMatchObject({ rawText: "9 unit Pompa dosing", status: "NEW" });
    expect(await scope.db.inquiryItem.findMany()).toEqual(before);
    expect(await scope.db.aiLog.count({ where: { kind: "INQUIRY_EXTRACTION" } })).toBe(0);
    await expect(convertInquiryToQuotation(scope, userId, inquiryId)).rejects.toThrow();
  });

  it("rolls back quotation creation when an edit commits during conversion's product lookup", async () => {
    const pause = gate();
    const db = scope.db.$extends({ query: { product: {
      async findMany({ args, query }) {
        await pause.pause();
        return query(args);
      },
    } } });
    const pending = outcome(convertInquiryToQuotation({ ...scope, db }, userId, inquiryId));
    await pause.reached;
    try {
      await updateInquiryText({ ...scope, db: orgDb(scope.orgId) }, userId, inquiryId, "9 unit Pompa dosing");
    } finally {
      pause.release();
    }
    expect((await pending).ok).toBe(false);
    expect(await scope.db.quotation.count()).toBe(0);
    expect(await scope.db.quotationItem.count()).toBe(0);
    expect(await scope.db.inquiry.findFirst()).toMatchObject({
      rawText: "9 unit Pompa dosing", status: "NEW", quotationId: null,
    });
  });

  it("does not apply a pending source edit after another request has linked a quotation", async () => {
    const pause = gate();
    const db = scope.db.$extends({ query: { $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (model === "Inquiry" && ["update", "updateMany"].includes(operation)) await pause.pause();
        return query(args);
      },
    } } });
    const pending = outcome(updateInquiryText({ ...scope, db }, userId, inquiryId, "9 unit Pompa dosing"));
    await pause.reached;
    let quotationId: string;
    try {
      const quotation = await convertInquiryToQuotation({ ...scope, db: orgDb(scope.orgId) }, userId, inquiryId);
      quotationId = quotation.id;
    } finally {
      pause.release();
    }
    expect((await pending).ok).toBe(false);
    expect(await scope.db.inquiry.findFirst()).toMatchObject({
      rawText: "2 unit Pompa dosing", status: "QUOTED", quotationId,
    });
    expect(await scope.db.aiLog.count({ where: { kind: "INQUIRY_TEXT_EDIT" } })).toBe(0);
  });
});
