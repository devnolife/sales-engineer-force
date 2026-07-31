import { notFound, redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/org-context";
import { getOrgSettings } from "@/modules/org/service";
import { isEditable, type QuotationStatus } from "@/modules/quotation/lib/quotation-status";
import { getQuotation } from "@/modules/quotation/service";
import { PageHeader } from "@/components/page-header";
import { QuotationForm } from "@/components/quotations/quotation-form";

export const metadata = { title: "Edit Penawaran" };

export default async function PenawaranEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  const quotation = await getQuotation(ctx, id);
  if (!quotation) notFound();
  if (!isEditable(quotation.status as QuotationStatus)) {
    redirect(`/app/penawaran/${id}`);
  }

  const [settings, customers] = await Promise.all([
    getOrgSettings(ctx),
    ctx.db.customer.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Edit Draft Penawaran"
        description={
          quotation.revision > 0
            ? `Draft revisi Rev.${quotation.revision}`
            : "Draft belum bernomor — nomor terbit saat diterbitkan."
        }
      />
      <QuotationForm
        quotationId={quotation.id}
        customers={customers}
        defaults={{
          franco: settings.defaultFranco ?? "",
          deliveryTime: settings.defaultDeliveryTime ?? "",
          termsOfPayment: settings.defaultTermsOfPayment ?? "",
          priceIncludeNote: settings.defaultPriceIncludeNote ?? "",
          validityDays: settings.defaultValidityDays,
          vatPercent: Number(settings.vatRate) * 100,
        }}
        initial={{
          customerId: quotation.customerId ?? "",
          customerName: quotation.customerName,
          attn: quotation.attn ?? "",
          subject: quotation.subject,
          quoteDate: quotation.quoteDate.toISOString().slice(0, 10),
          franco: quotation.franco ?? "",
          deliveryTime: quotation.deliveryTime ?? "",
          termsOfPayment: quotation.termsOfPayment ?? "",
          priceIncludeNote: quotation.priceIncludeNote ?? "",
          validityDays: quotation.validityDays,
          vatPercent: Number(quotation.vatRate) * 100,
          docDiscountType: quotation.docDiscountType as "AMOUNT" | "PERCENT",
          docDiscountValue: quotation.docDiscountValue,
          notes: quotation.notes ?? "",
          items: quotation.items.map((i) => ({
            productId: i.productId ?? "",
            name: i.name,
            brand: i.brand ?? "",
            type: i.type ?? "",
            spec: i.spec ?? "",
            qty: i.qty,
            unit: i.unit,
            unitPrice: i.unitPrice,
            discountPercent: i.discountPercent,
          })),
        }}
      />
    </>
  );
}
