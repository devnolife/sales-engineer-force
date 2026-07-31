"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function AcceptInvitationButton({
  invitationId,
  organizationId,
}: {
  invitationId: string;
  organizationId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function accept() {
    setLoading(true);
    const { error } = await authClient.organization.acceptInvitation({
      invitationId,
    });
    if (error) {
      setLoading(false);
      toast.error(error.message ?? "Gagal menerima undangan.");
      return;
    }
    await authClient.organization.setActive({ organizationId });
    setLoading(false);
    toast.success("Selamat bergabung!");
    router.push("/app");
    router.refresh();
  }

  return (
    <Button className="w-full" onClick={accept} disabled={loading}>
      {loading && <Spinner data-icon="inline-start" />}
      Terima undangan
    </Button>
  );
}
