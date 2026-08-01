import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isValidPrintKey } from "@/modules/pdf/service";
import { toDocumentProps } from "@/modules/quotation/document-data";
import { QuotationDocument } from "@/components/quotations/quotation-document";

/**
 * Route print internal — HANYA untuk Gotenberg (render PDF server-side).
 * Diamankan dengan ?key= yang diturunkan dari secret server; bukan untuk publik.
 * Merender dokumen polos tanpa chrome UI apa pun.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function InternalPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const [{ id }, { key }] = await Promise.all([params, searchParams]);
  if (!isValidPrintKey(key ?? null)) notFound();

  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: { items: { orderBy: { lineNo: "asc" } } },
  });
  if (!quotation) notFound();

  const [settings, organization] = await Promise.all([
    prisma.orgSettings.findUnique({
      where: { organizationId: quotation.organizationId },
    }),
    prisma.organization.findUniqueOrThrow({
      where: { id: quotation.organizationId },
      select: { name: true, logo: true },
    }),
  ]);

  const props = toDocumentProps(quotation, {
    name: organization.name,
    address: settings?.address ?? null,
    npwp: settings?.npwp ?? null,
    phone: settings?.phone ?? null,
    email: settings?.email ?? null,
    logo: organization.logo,
    bankName: settings?.bankName ?? null,
    bankAccount: settings?.bankAccount ?? null,
    bankBranch: settings?.bankBranch ?? null,
    bankHolder: settings?.bankHolder ?? null,
    signerName: settings?.signerName ?? null,
    signerTitle: settings?.signerTitle ?? null,
  });

  return (
    <main className="bg-white">
      <QuotationDocument {...props} />
    </main>
  );
}
