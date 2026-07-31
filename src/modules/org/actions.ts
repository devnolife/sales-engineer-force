"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminContext } from "@/lib/org-context";
import { updateOrgSettings, type PengaturanInput } from "./service";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function simpanPengaturanAction(
  input: PengaturanInput,
): Promise<ActionResult> {
  try {
    const ctx = await requireAdminContext();
    await updateOrgSettings(ctx, input);
    revalidatePath("/app/pengaturan");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Input tidak valid." };
    }
    return { ok: false, error: "Gagal menyimpan pengaturan." };
  }
}

export async function simpanNamaOrganisasiAction(name: string): Promise<ActionResult> {
  const trimmed = name.trim();
  if (trimmed.length < 2) return { ok: false, error: "Nama organisasi terlalu pendek." };
  try {
    const ctx = await requireAdminContext();
    await prisma.organization.update({
      where: { id: ctx.orgId },
      data: { name: trimmed },
    });
    revalidatePath("/app", "layout");
    return { ok: true };
  } catch {
    return { ok: false, error: "Gagal menyimpan nama organisasi." };
  }
}
