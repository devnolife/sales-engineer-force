import { prisma } from "@/lib/db";
import { requireAdminContext, ROLE_LABEL } from "@/lib/org-context";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTanggal } from "@/lib/format";
import { InviteMemberDialog, InvitationRowActions, RemoveMemberButton } from "./anggota-client";

export const metadata = { title: "Anggota" };

export default async function AnggotaPage() {
  const ctx = await requireAdminContext();

  const [members, invitations] = await Promise.all([
    prisma.member.findMany({
      where: { organizationId: ctx.orgId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({
      where: { organizationId: ctx.orgId, status: "pending" },
      orderBy: { expiresAt: "desc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Anggota Tim"
        description="Undang sales dan admin ke organisasi. Undangan mock: salin tautannya, tidak ada email terkirim."
      >
        <InviteMemberDialog />
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Anggota aktif</CardTitle>
          <CardDescription>{members.length} anggota</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Peran</TableHead>
                <TableHead>Bergabung</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.user.name}</TableCell>
                  <TableCell>{m.user.email}</TableCell>
                  <TableCell>
                    <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                      {ROLE_LABEL[m.role] ?? m.role}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatTanggal(m.createdAt)}</TableCell>
                  <TableCell>
                    {m.role !== "owner" && m.userId !== ctx.userId && (
                      <RemoveMemberButton memberId={m.id} name={m.user.name} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Undangan tertunda</CardTitle>
          <CardDescription>
            Bagikan tautan undangan secara manual (mode kerangka tanpa email).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada undangan tertunda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Peran</TableHead>
                  <TableHead>Kedaluwarsa</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {ROLE_LABEL[inv.role ?? "member"] ?? inv.role}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatTanggal(inv.expiresAt)}</TableCell>
                    <TableCell>
                      <InvitationRowActions invitationId={inv.id} />
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
