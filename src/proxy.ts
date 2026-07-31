import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

/**
 * Next 16: `middleware.ts` deprecated -> `proxy.ts` (runtime nodejs).
 * Pemeriksaan ringan: hanya cek keberadaan cookie session (optimistic).
 * Pemeriksaan session sesungguhnya tetap di requireSession()/requireOrgContext().
 */
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  const isProtected =
    pathname.startsWith("/app") || pathname.startsWith("/onboarding");
  const isAuthPage = pathname === "/masuk" || pathname === "/daftar";

  if (isProtected && !sessionCookie) {
    const url = new URL("/masuk", request.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && sessionCookie) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/onboarding", "/masuk", "/daftar"],
};
