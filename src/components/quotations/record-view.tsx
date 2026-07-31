"use client";

import { useEffect, useRef } from "react";

/**
 * Mencatat kunjungan halaman publik lewat POST setelah render (sekali per
 * pemuatan). Menghindari mutasi saat render dan view palsu dari prefetch.
 */
export function RecordView({ token }: { token: string }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    fetch(`/api/q/${token}/view`, { method: "POST" }).catch(() => {
      // Tracking gagal tidak boleh mengganggu pelanggan.
    });
  }, [token]);

  return null;
}
