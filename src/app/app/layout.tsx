import { prisma } from "@/lib/db";
import { requireOrgContext, ROLE_LABEL } from "@/lib/org-context";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireOrgContext();
  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: { name: true },
  });

  return (
    <SidebarProvider>
      <AppSidebar
        orgName={org?.name ?? "Organisasi"}
        userName={ctx.userName}
        userEmail={ctx.userEmail}
        roleLabel={ROLE_LABEL[ctx.role] ?? ctx.role}
        isAdmin={ctx.role === "owner" || ctx.role === "admin"}
      />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 no-print">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm text-muted-foreground">{org?.name}</span>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
