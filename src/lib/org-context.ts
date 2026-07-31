import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { orgDb, type OrgDb } from "@/lib/tenant";

/**
 * Konteks request: session + organisasi aktif + Prisma client ter-scope tenant.
 * Semua server component / server action modul data memakai ini.
 */

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/** Wajib login; kalau tidak, lempar ke halaman masuk. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/masuk");
  return session;
}

export interface OrgContext {
  db: OrgDb;
  orgId: string;
  userId: string;
  userName: string;
  userEmail: string;
  /** owner | admin | member (member = Sales) */
  role: string;
}

const getMemberRole = cache(async (orgId: string, userId: string) => {
  const member = await prisma.member.findFirst({
    where: { organizationId: orgId, userId },
    select: { role: true },
  });
  return member?.role ?? null;
});

/**
 * Wajib login DAN punya organisasi aktif; kalau belum punya organisasi,
 * diarahkan ke onboarding pembuatan organisasi.
 */
export async function requireOrgContext(): Promise<OrgContext> {
  const session = await requireSession();
  const orgId = session.session.activeOrganizationId;
  if (!orgId) redirect("/onboarding");

  const role = await getMemberRole(orgId, session.user.id);
  if (!role) redirect("/onboarding");

  return {
    db: orgDb(orgId),
    orgId,
    userId: session.user.id,
    userName: session.user.name,
    userEmail: session.user.email,
    role,
  };
}

/** Hanya owner/admin yang boleh (mis. pengaturan organisasi). */
export async function requireAdminContext(): Promise<OrgContext> {
  const ctx = await requireOrgContext();
  if (ctx.role !== "owner" && ctx.role !== "admin") redirect("/app");
  return ctx;
}

export const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Sales",
};
