import type {
  QuotationDocumentData,
  QuotationDocumentItem,
  QuotationDocumentOrg,
} from "@/components/quotations/quotation-document";

/**
 * Pemetaan record Quotation (+items) -> props QuotationDocument.
 *
 * Dokumen TERBIT memakai snapshot identitas organisasi yang dibekukan saat
 * issue (orgName dst.). DRAFT belum punya snapshot -> pakai fallback dari
 * pengaturan live (preview).
 */

interface QuotationRecordLike {
  numberBase: string | null;
  revision: number;
  quoteDate: Date;
  issuedAt: Date | null;
  validUntil: Date | null;
  customerName: string;
  attn: string | null;
  subject: string;
  franco: string | null;
  deliveryTime: string | null;
  termsOfPayment: string | null;
  priceIncludeNote: string | null;
  validityDays: number;
  vatRate: string;
  discountAmount: string;
  subtotal: string;
  vatAmount: string;
  total: string;
  amountInWords: string;
  orgName: string | null;
  orgAddress: string | null;
  orgNpwp: string | null;
  orgPhone: string | null;
  orgEmail: string | null;
  orgLogo: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankBranch: string | null;
  bankHolder: string | null;
  signerName: string | null;
  signerTitle: string | null;
  items: {
    id: string;
    lineNo: number;
    name: string;
    brand: string | null;
    type: string | null;
    spec: string | null;
    qty: string;
    unit: string;
    unitPrice: string;
    discountPercent: string;
    lineTotal: string;
  }[];
}

export type LiveOrgFallback = QuotationDocumentOrg;

export function toDocumentProps(
  quotation: QuotationRecordLike,
  liveOrg: LiveOrgFallback,
): { quotation: QuotationDocumentData; org: QuotationDocumentOrg } {
  const usesSnapshot = quotation.orgName !== null;

  const org: QuotationDocumentOrg = usesSnapshot
    ? {
        name: quotation.orgName ?? liveOrg.name,
        address: quotation.orgAddress,
        npwp: quotation.orgNpwp,
        phone: quotation.orgPhone,
        email: quotation.orgEmail,
        logo: quotation.orgLogo,
        bankName: quotation.bankName,
        bankAccount: quotation.bankAccount,
        bankBranch: quotation.bankBranch,
        bankHolder: quotation.bankHolder,
        signerName: quotation.signerName,
        signerTitle: quotation.signerTitle,
      }
    : liveOrg;

  const items: QuotationDocumentItem[] = quotation.items.map((i) => ({
    id: i.id,
    lineNo: i.lineNo,
    name: i.name,
    brand: i.brand,
    type: i.type,
    spec: i.spec,
    qty: i.qty,
    unit: i.unit,
    unitPrice: i.unitPrice,
    discountPercent: i.discountPercent,
    lineTotal: i.lineTotal,
  }));

  return {
    org,
    quotation: {
      numberBase: quotation.numberBase,
      revision: quotation.revision,
      quoteDate: quotation.quoteDate,
      issuedAt: quotation.issuedAt,
      validUntil: quotation.validUntil,
      customerName: quotation.customerName,
      attn: quotation.attn,
      subject: quotation.subject,
      franco: quotation.franco,
      deliveryTime: quotation.deliveryTime,
      termsOfPayment: quotation.termsOfPayment,
      priceIncludeNote: quotation.priceIncludeNote,
      validityDays: quotation.validityDays,
      vatRate: quotation.vatRate,
      discountAmount: quotation.discountAmount,
      subtotal: quotation.subtotal,
      vatAmount: quotation.vatAmount,
      total: quotation.total,
      amountInWords: quotation.amountInWords,
      items,
    },
  };
}
