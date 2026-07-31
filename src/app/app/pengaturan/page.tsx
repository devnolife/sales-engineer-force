import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminContext } from "@/lib/org-context";
import { getOrgSettings } from "@/modules/org/service";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PengaturanForm } from "./pengaturan-form";

export const metadata = { title: "Pengaturan" };

export default async function PengaturanPage() {
  const ctx = await requireAdminContext();
  const [settings, org] = await Promise.all([
    getOrgSettings(ctx),
    prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { name: true, slug: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Pengaturan Organisasi"
        description="Kop surat, penomoran penawaran, PPN, rekening, dan default dokumen."
      >
        <Button asChild variant="outline">
          <Link href="/app/pengaturan/anggota">Kelola anggota</Link>
        </Button>
      </PageHeader>
      <PengaturanForm
        orgName={org?.name ?? ""}
        settings={{
          address: settings.address ?? "",
          npwp: settings.npwp ?? "",
          phone: settings.phone ?? "",
          email: settings.email ?? "",
          website: settings.website ?? "",
          numberPrefix: settings.numberPrefix,
          numberFormat: settings.numberFormat,
          revisionMode: settings.revisionMode as "SUFFIX" | "NEW_NUMBER",
          vatPercent: Number(settings.vatRate) * 100,
          bankName: settings.bankName ?? "",
          bankAccount: settings.bankAccount ?? "",
          bankBranch: settings.bankBranch ?? "",
          bankHolder: settings.bankHolder ?? "",
          signerName: settings.signerName ?? "",
          signerTitle: settings.signerTitle ?? "",
          defaultFranco: settings.defaultFranco ?? "",
          defaultDeliveryTime: settings.defaultDeliveryTime ?? "",
          defaultTermsOfPayment: settings.defaultTermsOfPayment ?? "",
          defaultPriceIncludeNote: settings.defaultPriceIncludeNote ?? "",
          defaultValidityDays: settings.defaultValidityDays,
        }}
      />
    </>
  );
}
