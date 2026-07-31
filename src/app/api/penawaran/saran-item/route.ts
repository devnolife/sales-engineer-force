import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { orgDb } from "@/lib/tenant";
import { getItemSuggestions } from "@/modules/quotation/service";

/** Autocomplete item penawaran: gabungan katalog + histori (per organisasi). */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.session.activeOrganizationId) {
    return NextResponse.json({ suggestions: [] }, { status: 401 });
  }
  const orgId = session.session.activeOrganizationId;

  const member = await prisma.member.findFirst({
    where: { organizationId: orgId, userId: session.user.id },
    select: { id: true },
  });
  if (!member) {
    return NextResponse.json({ suggestions: [] }, { status: 403 });
  }

  const q = new URL(request.url).searchParams.get("q") ?? "";
  const suggestions = await getItemSuggestions({ db: orgDb(orgId), orgId }, q);
  return NextResponse.json({ suggestions });
}
