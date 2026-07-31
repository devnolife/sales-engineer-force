import { requireOrgContext } from "@/lib/org-context";
import { listCustomers } from "@/modules/customer/service";
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
  PelangganDialog,
  PelangganRowActions,
  PelangganToolbar,
} from "./pelanggan-client";

export const metadata = { title: "Pelanggan" };

export default async function PelangganPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>;
}) {
  const { cari } = await searchParams;
  const ctx = await requireOrgContext();
  const customers = await listCustomers(ctx, { search: cari });

  return (
    <>
      <PageHeader
        title="Pelanggan"
        description="Perusahaan pelanggan dan kontak person untuk penawaran dan pipeline."
      >
        <PelangganDialog />
      </PageHeader>

      <PelangganToolbar />

      <Card>
        <CardContent>
          {customers.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Belum ada pelanggan</EmptyTitle>
                <EmptyDescription>
                  Tambahkan perusahaan pelanggan beserta kontak person sebagai dasar
                  penawaran dan pipeline.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Kontak person</TableHead>
                  <TableHead>Telepon/Email</TableHead>
                  <TableHead>NPWP</TableHead>
                  <TableHead>Deal</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => {
                  const firstContact = c.contacts[0];
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="max-w-64">
                        <div className="grid gap-0.5">
                          <span className="truncate font-medium">{c.name}</span>
                          {c.city && (
                            <span className="truncate text-xs text-muted-foreground">
                              {c.city}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-56">
                        {firstContact ? (
                          <div className="grid gap-0.5">
                            <span className="truncate">
                              {[firstContact.name, firstContact.phone]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                            {c.contacts.length > 1 && (
                              <span className="text-xs text-muted-foreground">
                                +{c.contacts.length - 1} lainnya
                              </span>
                            )}
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {[c.phone, c.email].filter(Boolean).join(" · ") || "-"}
                      </TableCell>
                      <TableCell>{c.npwp ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{c._count.deals}</Badge>
                      </TableCell>
                      <TableCell>
                        <PelangganRowActions
                          customer={{
                            id: c.id,
                            name: c.name,
                            address: c.address ?? "",
                            city: c.city ?? "",
                            phone: c.phone ?? "",
                            email: c.email ?? "",
                            npwp: c.npwp ?? "",
                            notes: c.notes ?? "",
                          }}
                          contacts={c.contacts.map((k) => ({
                            id: k.id,
                            name: k.name,
                            title: k.title ?? "",
                            phone: k.phone ?? "",
                            email: k.email ?? "",
                          }))}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
