import { redirect } from "next/navigation";
import { requireSession } from "@/lib/org-context";
import { prisma } from "@/lib/db";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Buat Organisasi" };

export default async function OnboardingPage() {
  const session = await requireSession();

  // Sudah punya organisasi? Langsung ke aplikasi.
  const existing = await prisma.member.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (existing) redirect("/app");

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 p-6">
      <OnboardingForm userName={session.user.name} />
    </main>
  );
}
