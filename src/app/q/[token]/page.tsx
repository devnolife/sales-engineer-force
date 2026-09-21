import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PrintButton } from "@/components/quotations/print-button";
import { QuotationDocument } from "@/components/quotations/quotation-document";
import { RecordView } from "@/components/quotations/record-view";
import { isPdfEnabled } from "@/modules/pdf/service";
import { toDocumentProps } from "@/modules/quotation/document-data";
import { displayStatus } from "@/modules/quotation/lib/quotation-status";
import { getPublicQuotation } from "@/modules/quotation/service";
import type { QuotationStatus } from "@/modules/quotation/lib/quotation-status";

/** Halaman publik penawaran — diakses pelanggan lewat tautan ber-token. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Surat Penawaran",
  robots: { index: false, follow: false },
};

export default async function PublicQuotationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const quotation = await getPublicQuotation(token);
  if (!quotation) notFound();

  const status = displayStatus(
    quotation.status as QuotationStatus,
    quotation.validUntil,
  );

  const props = toDocumentProps(quotation, {
    name: quotation.orgName ?? "",
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
  });

  return (
    <main className="min-h-screen bg-muted/60 py-8">
      <RecordView token={token} />
      <div className="mx-auto flex w-full max-w-[210mm] flex-col gap-4 px-4">
        {status === "EXPIRED" && (
          <Alert className="no-print">
            <AlertTitle>Penawaran kedaluwarsa</AlertTitle>
            <AlertDescription>
              Masa berlaku penawaran ini sudah lewat. Hubungi kami untuk penawaran
              terbaru.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end no-print">
          <PrintButton pdfHref={isPdfEnabled() ? `/api/q/${token}/pdf` : undefined} />
        </div>
        <QuotationDocument {...props} />
      </div>
    </main>
  );
}
