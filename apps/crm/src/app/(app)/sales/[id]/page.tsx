"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Printer, MessageCircle, Eye, Ban, Repeat, HandCoins, Copy, Link2 } from "lucide-react";
import { api, useApi, inr, dt } from "@/lib/api";
import { useSession } from "@/lib/session";
import { InvoiceDoc, defaultOptions, type DocOptions } from "@/components/InvoiceDoc";
import { Loading, ErrorBox, Toggle, Pill, cx, useToast, Modal } from "@/components/ui";
import { ReceivePayment } from "@/components/ReceivePayment";

function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { can } = useSession();
  const { data: inv, error, reload } = useApi<any>(`/invoices/${id}`);
  const [format, setFormat] = useState<string | null>(null);
  const [template, setTemplate] = useState("MODERN");
  const [opts, setOpts] = useState<DocOptions>(defaultOptions);
  const [receive, setReceive] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => { if (inv) { setTemplate(inv.business.invoiceTemplate || "MODERN"); if (!format) setFormat(inv.printFormat); } }, [inv]); // eslint-disable-line
  useEffect(() => { if (inv && sp.get("print")) setTimeout(() => window.print(), 600); }, [inv, sp]);

  if (error) return <ErrorBox error={error} />;
  if (!inv) return <Loading />;
  const cancel = async () => { try { await api(`/invoices/${id}/cancel`, { body: {} }); toast("Bill cancelled · stock restored"); setConfirmCancel(false); reload(); } catch (e: any) { toast(e.message, "bad"); } };
  const convert = async () => { try { const n = await api(`/invoices/${id}/convert`, { body: {} }); toast(`Converted to ${n.number}`); router.push(`/sales/${n.id}`); } catch (e: any) { toast(e.message, "bad"); } };

  return (
    <div className="grid xl:grid-cols-[1fr_320px] gap-6 items-start">
      <div className="min-w-0">
        <div className="flex items-center gap-3 mb-4 no-print">
          <Link href="/sales" className="btn-ghost btn-sm"><ArrowLeft className="size-4" />Sales</Link>
          <div className="font-mono font-bold">{inv.number}</div>
          {inv.kind === "INVOICE" && <Pill status={inv.cancelled ? "FAILED" : inv.status}>{inv.cancelled ? "Cancelled" : undefined}</Pill>}
        </div>
        <div className="overflow-x-auto pb-6"><InvoiceDoc inv={inv} format={format || undefined} template={template} options={opts} /></div>
      </div>
      <div className="space-y-4 no-print xl:sticky xl:top-0">
        <div className="card p-5">
          <div className="text-[10.5px] font-bold tracking-[0.18em] text-brand">INVOICE FORMAT</div>
          <div className="text-xl font-extrabold mt-1">{inv.billType === "NON_GST" ? "Non-GST Bill / Cash Memo" : "GST Tax Invoice"} — {format === "THERMAL" ? 'Thermal 3"' : format}</div>
          <p className="text-sm text-muted mt-1">Prints / shares as PDF with one click. {inv.interState ? "IGST" : "CGST + SGST"} chosen from place of supply.</p>
          <div className="flex gap-1.5 mt-4">{["A4", "A5", "THERMAL"].map((f) => (
            <button key={f} onClick={() => setFormat(f)} className={cx("h-8 px-3 rounded-full text-sm font-semibold border", format === f ? "bg-brand text-white border-brand" : "border-line text-muted")}>{f === "THERMAL" ? 'Thermal 3"' : f}</button>
          ))}</div>
          {format === "A4" && inv.billType === "GST" && <>
            <div className="label mt-4">Choose template</div>
            <div className="grid grid-cols-2 gap-2">{[["MODERN", "Modern"], ["CLASSIC", "Classic"]].map(([k, l]) => (
              <button key={k} onClick={() => setTemplate(k)} className={cx("rounded-xl border-2 p-2 text-xs font-semibold", template === k ? "border-brand text-brand" : "border-line text-muted")}>
                <div className={cx("h-2 rounded mb-1", k === "MODERN" ? "bg-brand" : "bg-ink")} /><div className="h-1 bg-line rounded mb-1" /><div className="h-1 bg-line rounded w-2/3 mb-2" />{l}
              </button>))}</div>
            <div className="mt-3 divide-y divide-line">
              {([["logo", "Business logo"], ["hsn", "HSN code & tax table"], ["bank", "Bank details"], ["qr", "UPI QR for payment"], ["signature", "Signature"]] as const).map(([k, l]) =>
                <Toggle key={k} label={l} on={opts[k]} onChange={(v) => setOpts({ ...opts, [k]: v })} />)}
            </div>
          </>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button className="btn-primary" onClick={() => window.print()}><Printer className="size-4" />Print</button>
          <button className="btn-outline" onClick={() => window.print()}><Eye className="size-4" />PDF</button>
          <a className="btn-wa" href={inv.whatsapp.link} target="_blank" rel="noreferrer"><MessageCircle className="size-4" />WhatsApp</a>
        </div>
        <div className="card p-4 bg-[#e7f6ec] border-[#cdebd6]">
          <div className="bg-white rounded-xl p-3 text-[13px] shadow-sm whitespace-pre-line">{inv.whatsapp.text}</div>
          <div className="flex gap-2 mt-2">
            <button className="btn-outline btn-sm" onClick={() => { navigator.clipboard.writeText(inv.whatsapp.text); toast("Message copied"); }}><Copy className="size-3.5" />Copy message</button>
            <button className="btn-outline btn-sm" onClick={() => { navigator.clipboard.writeText(inv.shareUrl); toast("Bill link copied"); }}><Link2 className="size-3.5" />Copy link</button>
          </div>
        </div>
        <div className="card p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted">Customer</span>{inv.partyId ? <Link className="font-semibold text-brand" href={`/parties?id=${inv.partyId}`}>{inv.customerName}</Link> : <span className="font-semibold">{inv.customerName}</span>}</div>
          <div className="flex justify-between"><span className="text-muted">Date</span><span className="font-semibold">{dt(inv.date)}</span></div>
          {inv.kind === "INVOICE" && <>
            <div className="flex justify-between"><span className="text-muted">Received</span><span className="font-semibold text-ok">{inr(inv.received)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Balance</span><span className="font-semibold text-bad">{inr(inv.balance)}</span></div>
            {inv.payments.map((p: any) => <div key={p.id} className="text-xs text-muted flex justify-between"><span>{p.number} · {p.mode}</span><span>{inr(p.allocated)}</span></div>)}
          </>}
          <div className="flex flex-wrap gap-2 pt-2">
            {inv.kind === "INVOICE" && inv.balance > 0 && inv.partyId && !inv.cancelled && <button className="btn-primary btn-sm" onClick={() => setReceive(true)}><HandCoins className="size-3.5" />Receive payment</button>}
            {inv.kind !== "INVOICE" && inv.kind !== "CREDIT_NOTE" && !inv.convertedToId && can("invoice.create") && <button className="btn-primary btn-sm" onClick={convert}><Repeat className="size-3.5" />Convert to bill</button>}
            {inv.convertedToId && <Link className="btn-outline btn-sm" href={`/sales/${inv.convertedToId}`}>View bill</Link>}
            {!inv.cancelled && can("invoice.edit") && (inv.kind === "INVOICE" || inv.kind === "CREDIT_NOTE") && <button className="btn-outline btn-sm text-bad" onClick={() => setConfirmCancel(true)}><Ban className="size-3.5" />Cancel bill</button>}
          </div>
        </div>
      </div>
      {receive && <ReceivePayment partyId={inv.partyId} invoiceId={inv.id} onClose={() => setReceive(false)} onSaved={() => { setReceive(false); reload(); }} />}
      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title={`Cancel ${inv.number}?`}
        footer={<><button className="btn-outline" onClick={() => setConfirmCancel(false)}>Keep bill</button><button className="btn bg-bad text-white" onClick={cancel}>Cancel bill</button></>}>
        <p className="text-sm text-muted">Stock will be added back and {inr(inv.total)} removed from {inv.customerName}&apos;s ledger. Payments already received stay as advance. This can&apos;t be undone.</p>
      </Modal>
    </div>
  );
}
export default function Page() { return <Suspense fallback={<Loading />}><InvoicePage /></Suspense>; }
