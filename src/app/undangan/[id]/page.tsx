import Link from "next/link";
import { getSession } from "@/lib/org-context";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AcceptInvitationButton } from "./accept-button";

export const metadata = { title: "Undangan Organisasi" };

export default async function UndanganPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();

  const invitation = await prisma.invitation.findUnique({
    where: { id },
    include: { organization: { select: { name: true } } },
  });

  const invalid =
    !invitation ||
    invitation.status !== "pending" ||
    invitation.expiresAt.getTime() < Date.now();

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        {invalid ? (
          <>
            <CardHeader>
              <CardTitle>Undangan tidak berlaku</CardTitle>
              <CardDescription>
                Tautan undangan ini sudah dipakai, kedaluwarsa, atau tidak ditemukan.
                Minta pengundang mengirim ulang undangan.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button asChild variant="outline">
                <Link href="/masuk">Ke halaman masuk</Link>
              </Button>
            </CardFooter>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Undangan bergabung</CardTitle>
              <CardDescription>
                Anda diundang bergabung ke organisasi{" "}
                <span className="font-medium text-foreground">
                  {invitation.organization.name}
                </span>{" "}
                sebagai {invitation.role === "admin" ? "Admin" : "Sales"} (
                {invitation.email}).
              </CardDescription>
            </CardHeader>
            {session ? (
              <CardContent>
                <AcceptInvitationButton
                  invitationId={invitation.id}
                  organizationId={invitation.organizationId}
                />
              </CardContent>
            ) : (
              <CardFooter className="flex-col gap-3">
                <Button asChild className="w-full">
                  <Link href={`/masuk?redirect=/undangan/${invitation.id}`}>
                    Masuk untuk menerima
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/daftar">Belum punya akun? Daftar</Link>
                </Button>
              </CardFooter>
            )}
          </>
        )}
      </Card>
    </main>
  );
}
