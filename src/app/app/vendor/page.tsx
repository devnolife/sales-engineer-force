import { requireOrgContext } from "@/lib/org-context";
import { listVendors } from "@/modules/sourcing/service";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CariVendorDialog,
  VendorDialog,
  VendorRowActions,
  VendorToolbar,
  type VendorProductItem,
} from "./vendor-client";

export const metadata = { title: "Vendor" };

export default async function VendorPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>;
}) {
  const { cari } = await searchParams;
  const ctx = await requireOrgContext();
  const [vendors, semuaProduk] = await Promise.all([
    listVendors(ctx, { search: cari }),
    ctx.db.vendorProduct.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Kelompokkan pricelist per vendor (satu query, tanpa mengubah service).
  const produkPerVendor = new Map<string, VendorProductItem[]>();
  for (const p of semuaProduk) {
    const list = produkPerVendor.get(p.vendorId) ?? [];
    list.push({
      id: p.id,
      name: p.name,
      brand: p.brand ?? "",
      spec: p.spec ?? "",
      unit: p.unit,
      price: p.price,
    });
    produkPerVendor.set(p.vendorId, list);
  }

  return (
    <>
      <PageHeader
        title="Vendor"
        description="Database vendor/supplier + pricelist — sumber harga modal saat sourcing permintaan."
      >
        <CariVendorDialog />
        <VendorDialog />
      </PageHeader>

      <VendorToolbar />

      <Card>
        <CardContent>
          {vendors.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Belum ada vendor</EmptyTitle>
                <EmptyDescription>
                  Tambahkan vendor supplier Anda atau coba pencarian vendor mock.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Kontak</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Pricelist</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="max-w-64">
                      <div className="grid gap-0.5">
                        <span className="truncate font-medium">{v.name}</span>
                        {v.city && (
                          <span className="truncate text-xs text-muted-foreground">
                            {v.city}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {[v.phone, v.email].filter(Boolean).join(" · ") || "-"}
                    </TableCell>
                    <TableCell className="max-w-48">
                      <span className="block truncate">{v.website ?? "-"}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{v._count.products} produk</Badge>
                    </TableCell>
                    <TableCell>
                      <VendorRowActions
                        vendor={{
                          id: v.id,
                          name: v.name,
                          city: v.city ?? "",
                          phone: v.phone ?? "",
                          email: v.email ?? "",
                          website: v.website ?? "",
                          notes: v.notes ?? "",
                        }}
                        products={produkPerVendor.get(v.id) ?? []}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
