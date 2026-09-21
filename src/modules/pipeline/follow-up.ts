import type { OrgScope } from "@/modules/org/service";

/**
 * Sinyal follow-up pintar (M5+): dihitung dari view tracking penawaran.
 *
 * - HOT   : penawaran SENT dilihat >= 3x — pelanggan menimbang serius,
 *           momen terbaik untuk telepon.
 * - VIEWED: sudah dilihat tapi belum ada keputusan > 2 hari sejak dilihat.
 * - STALE : SENT > 3 hari dan BELUM PERNAH dilihat — kemungkinan email/link
 *           tidak sampai; kirim ulang lewat kanal lain.
 */

export type FollowUpKind = "HOT" | "VIEWED" | "STALE";

export interface FollowUpSignal {
  kind: FollowUpKind;
  quotationId: string;
  nomor: string | null;
  revision: number;
  customerName: string;
  total: string;
  viewCount: number;
  firstViewedAt: Date | null;
  issuedAt: Date | null;
  hint: string;
}

const DAY = 86_400_000;

export async function getFollowUpSignals(
  scope: OrgScope,
  opts: { forUserId?: string; limit?: number } = {},
): Promise<FollowUpSignal[]> {
  const now = Date.now();
  const sent = await scope.db.quotation.findMany({
    where: {
      status: "SENT",
      ...(opts.forUserId ? { createdById: opts.forUserId } : {}),
      // Hanya yang masih berlaku — expired urusan kartu lain.
      OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
    },
    select: {
      id: true,
      numberBase: true,
      revision: true,
      customerName: true,
      total: true,
      viewCount: true,
      firstViewedAt: true,
      issuedAt: true,
    },
    orderBy: { issuedAt: "desc" },
    take: 100,
  });

  const signals: FollowUpSignal[] = [];
  for (const q of sent) {
    const base = {
      quotationId: q.id,
      nomor: q.numberBase,
      revision: q.revision,
      customerName: q.customerName,
      total: q.total,
      viewCount: q.viewCount,
      firstViewedAt: q.firstViewedAt,
      issuedAt: q.issuedAt,
    };

    if (q.viewCount >= 3) {
      signals.push({
        ...base,
        kind: "HOT",
        hint: `Dilihat ${q.viewCount}x — pelanggan menimbang serius. Telepon sekarang.`,
      });
    } else if (
      q.firstViewedAt &&
      now - q.firstViewedAt.getTime() > 2 * DAY
    ) {
      signals.push({
        ...base,
        kind: "VIEWED",
        hint: "Sudah dilihat tapi belum ada kabar — tanyakan tanggapan mereka.",
      });
    } else if (
      !q.firstViewedAt &&
      q.issuedAt &&
      now - q.issuedAt.getTime() > 3 * DAY
    ) {
      signals.push({
        ...base,
        kind: "STALE",
        hint: "Belum pernah dibuka — kirim ulang lewat WhatsApp/telepon.",
      });
    }
  }

  // HOT dulu, lalu VIEWED, lalu STALE.
  const order: Record<FollowUpKind, number> = { HOT: 0, VIEWED: 1, STALE: 2 };
  signals.sort((a, b) => order[a.kind] - order[b.kind]);
  return signals.slice(0, opts.limit ?? 6);
}
