"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/org-context";
import {
  addContact,
  createCustomer,
  deleteContact,
  deleteCustomer,
  updateCustomer,
  type KontakInput,
  type PelangganInput,
} from "./service";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function errMessage(e: unknown, fallback: string): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? fallback;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export async function simpanPelangganAction(
  input: PelangganInput,
  id?: string,
): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    if (id) await updateCustomer(ctx, id, input);
    else await createCustomer(ctx, input);
    revalidatePath("/app/pelanggan");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menyimpan pelanggan.") };
  }
}

export async function hapusPelangganAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await deleteCustomer(ctx, id);
    revalidatePath("/app/pelanggan");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menghapus pelanggan.") };
  }
}

export async function tambahKontakAction(
  customerId: string,
  input: KontakInput,
): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await addContact(ctx, customerId, input);
    revalidatePath("/app/pelanggan");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menambah kontak.") };
  }
}

export async function hapusKontakAction(contactId: string): Promise<ActionResult> {
  try {
    const ctx = await requireOrgContext();
    await deleteContact(ctx, contactId);
    revalidatePath("/app/pelanggan");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Gagal menghapus kontak.") };
  }
}
