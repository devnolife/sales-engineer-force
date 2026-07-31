import { formatRupiah } from "@/lib/format";
import { withRevision } from "@/modules/quotation/lib/quotation-number";

/**
 * Tampilan dokumen surat penawaran. (Adaptasi dari Metito.)
 *
 * Kertas putih & teks gelap apa pun temanya — komponen ini juga yang dicetak
 * jadi PDF lewat print browser (Gotenberg menyusul di fase berikutnya).
 *
 * Identitas organisasi (kop, rekening, penandatangan) diterima sebagai props
 * yang SUDAH diresolve pemanggil: dokumen terbit memakai SNAPSHOT dari DB,
 * draft memakai pengaturan live (preview).
 */

export interface QuotationDocumentOrg {
  name: string;
  address: string | null;
  npwp: string | null;
  phone: string | null;
  email: string | null;
  logo: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankBranch: string | null;
  bankHolder: string | null;
  signerName: string | null;
  signerTitle: string | null;
}

export interface QuotationDocumentItem {
  id: string;
  lineNo: number;
  name: string;
  brand: string | null;
  type: string | null;
  spec: string | null;
  qty: string;
  unit: string;
  unitPrice: string;
  discountPercent: string;
  lineTotal: string;
}

export interface QuotationDocumentData {
  numberBase: string | null;
  revision: number;
  quoteDate: string | Date;
  issuedAt: string | Date | null;
  validUntil: string | Date | null;
  customerName: string;
  attn: string | null;
  subject: string;
  franco: string | null;
  deliveryTime: string | null;
  termsOfPayment: string | null;
  priceIncludeNote: string | null;
  validityDays: number;
  vatRate: string;
  discountAmount: string;
  subtotal: string;
  vatAmount: string;
  total: string;
  amountInWords: string;
  items: QuotationDocumentItem[];
}

function formatDate(value: string | Date | null): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatQty(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(n);
}

function vatPercentLabel(vatRate: string): string {
  const n = Number(vatRate);
  if (!Number.isFinite(n)) return "PPN";
  return `PPN ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n * 100)}%`;
}

export function QuotationDocument({
  quotation,
  org,
}: {
  quotation: QuotationDocumentData;
  org: QuotationDocumentOrg;
}) {
  const nomor = quotation.numberBase
    ? withRevision(quotation.numberBase, quotation.revision)
    : "DRAFT — belum bernomor";
  const adaDiskon = Number(quotation.discountAmount) > 0;

  return (
    <article className="quotation-paper mx-auto w-full max-w-[210mm] bg-white px-10 py-10 text-[13px] leading-relaxed text-slate-900 shadow-lg print:max-w-none print:px-0 print:py-0 print:shadow-none">
      {/* Kop surat */}
      <header className="flex items-start justify-between gap-6 border-b-2 border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          {org.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logo} alt={org.name} className="size-14 object-contain" />
          )}
          <div>
            <div className="text-xl font-bold tracking-wide text-slate-900">{org.name}</div>
            {org.npwp && <div className="text-[11px] text-slate-600">NPWP: {org.npwp}</div>}
          </div>
        </div>
        <div className="text-right text-[11px] text-slate-600">
          {org.address && <div>{org.address}</div>}
          {org.phone && <div>{org.phone}</div>}
          {org.email && <div>{org.email}</div>}
        </div>
      </header>

      <h1 className="mt-6 text-center text-lg font-bold uppercase tracking-[0.2em] text-slate-900">
        Surat Penawaran
      </h1>

      {/* Identitas dokumen */}
      <section className="mt-6 grid grid-cols-2 gap-x-10 gap-y-1">
        <dl className="grid gap-1">
          <Row label="Tanggal" value={formatDate(quotation.issuedAt ?? quotation.quoteDate)} />
          <Row label="Nomor" value={nomor} strong />
        </dl>
        <dl className="grid gap-1">
          <Row label="Kepada Yth" value={quotation.customerName} />
          <Row label="Attn" value={quotation.attn || "-"} />
          <Row label="Perihal" value={quotation.subject} />
        </dl>
      </section>

      {/* Tabel item */}
      <table className="mt-6 w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-slate-100">
            <Th className="w-10 text-center">No</Th>
            <Th>Deskripsi</Th>
            <Th className="w-16 text-right">Qty</Th>
            <Th className="w-14">Unit</Th>
            <Th className="w-28 text-right">Harga Satuan</Th>
            <Th className="w-14 text-right">Disc</Th>
            <Th className="w-32 text-right">Total</Th>
          </tr>
        </thead>
        <tbody>
          {quotation.items.map((item) => (
            <tr key={item.id} className="align-top">
              <Td className="text-center">{item.lineNo}</Td>
              <Td>
                <div className="font-medium">{item.name}</div>
                {item.brand && (
                  <div className="text-slate-600">
                    <span className="inline-block w-12 text-slate-500">Merek</span>: {item.brand}
                  </div>
                )}
                {item.type && (
                  <div className="text-slate-600">
                    <span className="inline-block w-12 text-slate-500">Tipe</span>: {item.type}
                  </div>
                )}
                {item.spec && <div className="text-slate-600">{item.spec}</div>}
              </Td>
              <Td className="text-right">{formatQty(item.qty)}</Td>
              <Td>{item.unit}</Td>
              <Td className="text-right">{formatRupiah(item.unitPrice)}</Td>
              <Td className="text-right">
                {Number(item.discountPercent) > 0 ? `${formatQty(item.discountPercent)}%` : "-"}
              </Td>
              <Td className="text-right">{formatRupiah(item.lineTotal)}</Td>
            </tr>
          ))}

          {quotation.items.length === 0 && (
            <tr>
              <Td className="text-center text-slate-400" colSpan={7}>
                Belum ada item.
              </Td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <Td className="text-right font-semibold" colSpan={6}>
              Jumlah
            </Td>
            <Td className="text-right font-semibold">{formatRupiah(quotation.subtotal)}</Td>
          </tr>
          {adaDiskon && (
            <tr>
              <Td className="text-right font-semibold" colSpan={6}>
                Diskon
              </Td>
              <Td className="text-right font-semibold">
                - {formatRupiah(quotation.discountAmount)}
              </Td>
            </tr>
          )}
          <tr>
            <Td className="text-right font-semibold" colSpan={6}>
              {vatPercentLabel(quotation.vatRate)}
            </Td>
            <Td className="text-right font-semibold">{formatRupiah(quotation.vatAmount)}</Td>
          </tr>
          <tr className="bg-slate-100">
            <Td className="text-right text-[13px] font-bold" colSpan={6}>
              Total
            </Td>
            <Td className="text-right text-[13px] font-bold">{formatRupiah(quotation.total)}</Td>
          </tr>
        </tfoot>
      </table>

      {/* Terbilang selalu diturunkan dari total, tidak pernah diketik manual. */}
      <p className="mt-3 text-[12px]">
        <span className="font-semibold">Terbilang</span> : <em>{quotation.amountInWords}</em>
      </p>

      {/* Syarat dan ketentuan */}
      <section className="mt-6">
        <h2 className="text-[12px] font-bold text-slate-900">Syarat dan Ketentuan</h2>
        <ol className="mt-2 grid gap-1 text-[12px]">
          <TermRow
            index={1}
            label="Harga"
            value={
              quotation.priceIncludeNote ||
              `Belum termasuk ${vatPercentLabel(quotation.vatRate)} (ditambahkan pada total)`
            }
          />
          <TermRow index={2} label="Franco" value={quotation.franco || "-"} />
          <TermRow index={3} label="Waktu Pengiriman" value={quotation.deliveryTime || "-"} />
          <TermRow index={4} label="Pembayaran" value={quotation.termsOfPayment || "-"} />
          <TermRow
            index={5}
            label="Masa Berlaku"
            value={`${quotation.validityDays} hari${
              quotation.validUntil ? ` (s.d. ${formatDate(quotation.validUntil)})` : ""
            }`}
          />
        </ol>
      </section>

      {/* Rekening pembayaran (dari snapshot untuk dokumen terbit) */}
      {(org.bankName || org.bankAccount) && (
        <section className="mt-6 text-[12px]">
          <h2 className="font-bold text-slate-900">Rekening Pembayaran</h2>
          <dl className="mt-2 grid gap-1">
            {org.bankName && <Row label="Bank" value={org.bankName} />}
            {org.bankAccount && <Row label="No. Rekening" value={org.bankAccount} />}
            {org.bankBranch && <Row label="Cabang" value={org.bankBranch} />}
            {org.bankHolder && <Row label="Atas Nama" value={org.bankHolder} />}
          </dl>
        </section>
      )}

      <p className="mt-6 text-justify text-[12px] text-slate-700">
        Terima kasih atas kepercayaan Anda. Kami berharap penawaran di atas sesuai dengan
        kebutuhan Anda. Apabila memerlukan klarifikasi lebih lanjut, jangan ragu untuk
        menghubungi kami.
      </p>

      <section className="mt-10 text-[12px]">
        <div>Hormat kami,</div>
        <div className="mt-14 font-semibold">{org.signerName || "(________________)"}</div>
        {org.signerTitle && <div className="text-slate-600">{org.signerTitle}</div>}
      </section>
    </article>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-slate-600">{label}</dt>
      <dd className={strong ? "font-semibold" : undefined}>: {value}</dd>
    </div>
  );
}

function TermRow({ index, label, value }: { index: number; label: string; value: string }) {
  return (
    <li className="flex gap-2">
      <span className="w-5 shrink-0">{index}.</span>
      <span className="w-40 shrink-0">{label}</span>
      <span>: {value}</span>
    </li>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`border border-slate-300 px-2 py-1.5 text-left font-semibold ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`border border-slate-300 px-2 py-1.5 ${className}`}>
      {children}
    </td>
  );
}
