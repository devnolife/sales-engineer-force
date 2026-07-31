import { requireOrgContext } from "@/lib/org-context";
import { getOrgSettings } from "@/modules/org/service";
import { PageHeader } from "@/components/page-header";
import { QuotationForm } from "@/components/quotations/quotation-form";

export const metadata = { title: "Buat Penawaran" };

export default async function PenawaranBaruPage() {
  const ctx = await requireOrgContext();
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
        title="Buat Penawaran"
        description="Isi draft, lalu terbitkan untuk mendapat nomor surat otomatis."
      />
      <QuotationForm
        customers={customers}
        defaults={{
          franco: settings.defaultFranco ?? "",
          deliveryTime: settings.defaultDeliveryTime ?? "",
          termsOfPayment: settings.defaultTermsOfPayment ?? "",
          priceIncludeNote: settings.defaultPriceIncludeNote ?? "",
          validityDays: settings.defaultValidityDays,
          vatPercent: Number(settings.vatRate) * 100,
        }}
      />
    </>
  );
}
