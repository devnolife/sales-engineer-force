import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Next 16: `middleware.ts` deprecated -> `proxy.ts` (runtime nodejs).
 * Pemeriksaan ringan: hanya cek keberadaan cookie session (optimistic).
 * Pemeriksaan session sesungguhnya tetap di requireSession()/requireOrgContext().
 *
 * Rate limiting (M7): endpoint auth & halaman/API publik dibatasi per-IP.
 */

function tooMany(retryAfterSec: number) {
  return new NextResponse("Terlalu banyak permintaan. Coba lagi nanti.", {
    status: 429,
    headers: { "Retry-After": String(Math.max(retryAfterSec, 1)) },
  });
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = clientIp(request);

  // Auth endpoints (login/signup/reset): 10 request per menit per IP.
  if (pathname.startsWith("/api/auth") && request.method === "POST") {
    const r = rateLimit(`auth:${ip}`, 10, 60_000);
    if (!r.ok) return tooMany(r.retryAfterSec);
  }

  // Halaman & API publik penawaran: 60 request per menit per IP
  // (melindungi dari enumerasi token & scraping).
  if (pathname.startsWith("/q/") || pathname.startsWith("/api/q/")) {
    const r = rateLimit(`public:${ip}`, 60, 60_000);
    if (!r.ok) return tooMany(r.retryAfterSec);
  }

  const sessionCookie = getSessionCookie(request);

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
  matcher: [
    "/app/:path*",
    "/onboarding",
    "/masuk",
    "/daftar",
    "/api/auth/:path*",
    "/q/:path*",
    "/api/q/:path*",
  ],
};
