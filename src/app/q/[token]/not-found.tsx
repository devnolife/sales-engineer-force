export default function PublicQuotationNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/60 p-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Tautan tidak berlaku</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Penawaran yang Anda cari tidak ditemukan atau tautannya sudah tidak aktif
          (misalnya karena ada revisi baru). Silakan hubungi pengirim untuk tautan
          terbaru.
        </p>
      </div>
    </main>
  );
}
