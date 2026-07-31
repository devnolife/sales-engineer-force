import { requireOrgContext } from "@/lib/org-context";
import { listCategories, listProducts } from "@/modules/catalog/service";
import { formatRupiah } from "@/lib/format";
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
import { KatalogToolbar, ProdukDialog, ProdukRowActions, ImportCsvDialog } from "./katalog-client";

export const metadata = { title: "Katalog Produk" };

export default async function KatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; kategori?: string }>;
}) {
  const { cari, kategori } = await searchParams;
  const ctx = await requireOrgContext();
  const [products, categories] = await Promise.all([
    listProducts(ctx, { search: cari, categoryId: kategori, includeInactive: true }),
    listCategories(ctx),
  ]);

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <>
      <PageHeader
        title="Katalog Produk"
        description="Produk dan jasa yang ditawarkan organisasi Anda."
      >
        <ImportCsvDialog />
        <ProdukDialog categories={categoryOptions} />
      </PageHeader>

      <KatalogToolbar categories={categoryOptions} />

      <Card>
        <CardContent>
          {products.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Belum ada produk</EmptyTitle>
                <EmptyDescription>
                  Tambahkan produk satu per satu atau import dari CSV untuk migrasi cepat
                  dari Excel.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Merek/Tipe</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Harga default</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-64">
                      <div className="grid gap-0.5">
                        <span className="truncate font-medium">{p.name}</span>
                        {p.spec && (
                          <span className="truncate text-xs text-muted-foreground">
                            {p.spec}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {[p.brand, p.type].filter(Boolean).join(" / ") || "-"}
                    </TableCell>
                    <TableCell>{p.category?.name ?? "-"}</TableCell>
                    <TableCell>{p.unit}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.defaultPrice ? formatRupiah(p.defaultPrice) : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.isActive ? "secondary" : "outline"}>
                        {p.isActive ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ProdukRowActions
                        product={{
                          id: p.id,
                          name: p.name,
                          brand: p.brand ?? "",
                          type: p.type ?? "",
                          spec: p.spec ?? "",
                          unit: p.unit,
                          defaultPrice: p.defaultPrice ?? "",
                          categoryId: p.categoryId ?? "",
                          isActive: p.isActive,
                        }}
                        categories={categoryOptions}
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
