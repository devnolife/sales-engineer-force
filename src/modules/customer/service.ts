import { z } from "zod";
import type { OrgScope } from "@/modules/org/service";

/** Modul pelanggan: perusahaan pelanggan & kontak person per-organisasi. */

export const pelangganSchema = z.object({
  name: z.string().trim().min(2, "Nama pelanggan minimal 2 karakter").max(200),
  address: z.string().trim().max(500).optional().default(""),
  city: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  email: z.string().trim().email().max(120).optional().or(z.literal("")).default(""),
  npwp: z.string().trim().max(50).optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""),
});

export type PelangganInput = z.input<typeof pelangganSchema>;

export const kontakSchema = z.object({
  name: z.string().trim().min(2, "Nama kontak minimal 2 karakter").max(120),
  title: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  email: z.string().trim().email().max(120).optional().or(z.literal("")).default(""),
});

export type KontakInput = z.input<typeof kontakSchema>;

export async function listCustomers(scope: OrgScope, opts: { search?: string } = {}) {
  const { search } = opts;
  return scope.db.customer.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { city: { contains: search } },
              { phone: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : {}),
    },
    include: {
      contacts: { orderBy: { name: "asc" } },
      _count: { select: { deals: true, quotations: true } },
    },
    orderBy: { name: "asc" },
    take: 500,
  });
}

function normalizePelangganData(scope: OrgScope, input: PelangganInput) {
  const parsed = pelangganSchema.parse(input);
  return {
    organizationId: scope.orgId,
    name: parsed.name,
    address: parsed.address || null,
    city: parsed.city || null,
    phone: parsed.phone || null,
    email: parsed.email || null,
    npwp: parsed.npwp || null,
    notes: parsed.notes || null,
  };
}

export async function createCustomer(scope: OrgScope, input: PelangganInput) {
  return scope.db.customer.create({ data: normalizePelangganData(scope, input) });
}

export async function updateCustomer(scope: OrgScope, id: string, input: PelangganInput) {
  return scope.db.customer.update({
    where: { id },
    data: normalizePelangganData(scope, input),
  });
}

export async function deleteCustomer(scope: OrgScope, id: string) {
  return scope.db.customer.delete({ where: { id } });
}

export async function addContact(scope: OrgScope, customerId: string, input: KontakInput) {
  const parsed = kontakSchema.parse(input);
  const customer = await scope.db.customer.findFirst({
    where: { id: customerId },
    select: { id: true },
  });
  if (!customer) throw new Error("Pelanggan tidak ditemukan.");
  return scope.db.contactPerson.create({
    data: {
      organizationId: scope.orgId,
      customerId,
      name: parsed.name,
      title: parsed.title || null,
      phone: parsed.phone || null,
      email: parsed.email || null,
    },
  });
}

export async function deleteContact(scope: OrgScope, contactId: string) {
  return scope.db.contactPerson.delete({ where: { id: contactId } });
}
