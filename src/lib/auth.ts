import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { prisma } from "@/lib/db";

/**
 * Better Auth + plugin organization (multi-tenant).
 *
 * Role default plugin: owner | admin | member.
 * Konvensi produk: "member" = Sales (label di UI Bahasa Indonesia).
 *
 * Email undangan: pada kerangka mock-first TIDAK mengirim email sungguhan —
 * link undangan ditampilkan di UI anggota (copy manual) dan dicatat ke console.
 */
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  emailAndPassword: {
    enabled: true,
    // Kerangka lokal: tanpa verifikasi email.
    requireEmailVerification: false,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // cache session di cookie 5 menit — hemat query
    },
  },
  databaseHooks: {
    session: {
      create: {
        // Saat login, set organisasi aktif = organisasi pertama user.
        before: async (session) => {
          const member = await prisma.member.findFirst({
            where: { userId: session.userId },
            orderBy: { createdAt: "asc" },
          });
          return {
            data: { ...session, activeOrganizationId: member?.organizationId ?? null },
          };
        },
      },
    },
  },
  plugins: [
    organization({
      // Kerangka mock: tampilkan link undangan lewat console (UI menyediakan copy link).
      sendInvitationEmail: async (data) => {
        const url = `${process.env.NEXT_PUBLIC_APP_URL}/undangan/${data.id}`;
        console.log(
          `[MOCK EMAIL] Undangan ke ${data.email} untuk gabung ${data.organization.name}: ${url}`,
        );
      },
    }),
    // nextCookies harus jadi plugin terakhir (menangani set-cookie di server action).
    nextCookies(),
  ],
});

export type Auth = typeof auth;
