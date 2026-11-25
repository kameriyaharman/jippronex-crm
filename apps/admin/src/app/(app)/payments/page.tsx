"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Undo2, RotateCw, Banknote, FileText, Printer, Copy } from "lucide-react";
import { api, useApi, inr, inr2, dt, tm, ym } from "@/lib/api";
import { useMe } from "@/lib/me";
import { PageHeader, Kpi, Loading, Table, Modal, Field, ErrorBox, Pill, Toggle, Empty, cx, useToast } from "@/components/ui";
import { LinkResult } from "@/components/admin";

const TABS: [string, string][] = [["all", "All"], ["captured", "Captured"], ["failed", "Failed"], ["refunded", "Refunded"], ["cash", "Cash"], ["autopay", "Autopay"], ["pending", "Links pending"]];
const LABEL: Record<string, string> = { CAPTURED: "Captured", FAILED: "Failed", REFUNDED: "Refunded", TO_DEPOSIT: "To deposit", CREATED: "Link sent" };

function Payments() {
  const me = useMe();
  const toast = useToast();
  const sp = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [month, setMonth] = useState(ym());
  const { data, reload } = useApi<any>(`/payments?tab=${tab}&q=${encodeURIComponent(q)}&month=${month}`);
  const [refund, setRefund] = useState<any>(null);
  const [link, setLink] = useState<any>(null);
  const invoiceId = sp.get("invoice");
  const isSuper = me.admin.role === "SUPER_ADMIN";
  const s = data?.summary;
  const retry = async (id: string) => { try { setLink(await api(`/payments/${id}/retry`, { body: {} })); reload(); } catch (e: any) { toast(e.message, "bad"); } };
  const deposit = async (id: string) => { await api(`/payments/${id}/deposit`, { body: {} }); toast("Marked as deposited"); reload(); };
  const offline = async (id: string) => { await api(`/payments/${id}/offline`, { body: { method: "Bank" } }); toast("Marked paid · account activated"); reload(); };
  return (
    <div>
      <PageHeader title="Payments" sub="Every rupee from customers — gateway, cash, bank — with GST invoice">
        <input type="month" className="input h-10 w-40" value={month} onChange={(e) => setMonth(e.target.value)} />
      </PageHeader>
      {s && <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-4">
        <Kpi label="Collected" value={inr(s.collected.amt)} sub="incl. GST" />
        <Kpi label="Gateway" value={inr(s.gateway.amt)} sub={`Razorpay · ${s.gateway.n} payments`} />
        <Kpi label="Cash / bank" value={inr(s.offline.amt)} sub={`to deposit ${inr(s.toDeposit.amt)}`} subTone={s.toDeposit.amt ? "bad" : "muted"} />
        <Kpi label="Settled to bank" value={inr(s.settled)} sub="via Razorpay settlements" />
        <Kpi label="Failed / refunds" value={inr(s.failed.amt + Math.abs(s.refunds.amt))} sub={`${s.failed.n} failed · ${s.refunds.n} refund`} subTone="bad" />
      </div>}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
          {TABS.map(([k, l]) => <button key={k} className="chip" data-on={tab === k} onClick={() => setTab(k)}>{l}</button>)}
          <div className="flex-1" />
          <div className="relative"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input className="input h-9 pl-9 w-56" placeholder="Customer / payment ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        {!data ? <Loading /> : !data.rows.length ? <Empty title="No payments" /> : <Table>
          <thead><tr>{["Date", "Customer", "For", "Payment ID", "Method", "Amount", "Status", "Invoice"].map((h) => <th key={h} className={cx("th", h === "Amount" && "text-right")}>{h}</th>)}</tr></thead>
          <tbody>{data.rows.map((p: any) => (
            <tr key={p.id}>
              <td className="td text-sm whitespace-nowrap">{dt(p.paidAt || p.createdAt, { day: "2-digit", month: "short" })}, {tm(p.paidAt || p.createdAt)}</td>
              <td className="td font-semibold">{p.customer}</td><td className="td text-sm">{p.description?.replace(/^New sale — /, "New sale · ").replace(/^Renewal — /, "Renewal · ")}</td>
              <td className="td font-mono text-xs">{p.gatewayPaymentId || "—"}</td>
              <td className="td text-sm">{p.method}{p.collectedBy ? ` · ${p.collectedBy}` : ""}</td>
              <td className={cx("td text-right font-bold", p.amount < 0 && "text-bad")}>{p.amount < 0 ? "− " : ""}{inr(Math.abs(p.amount))}</td>
              <td className="td"><Pill status={p.status}>{LABEL[p.status]}</Pill></td>
              <td className="td"><div className="flex gap-1.5 items-center">
                {p.invoiceNo && p.amount > 0 && <button className="pill bg-brand-50 text-brand" onClick={() => router.replace(`/payments?invoice=${p.id}`)}><FileText className="size-3" />GST</button>}
                {p.status === "FAILED" && <button className="btn-outline btn-sm" onClick={() => retry(p.id)}><RotateCw className="size-3" />Retry link</button>}
                {p.status === "TO_DEPOSIT" && isSuper && <button className="btn-outline btn-sm" onClick={() => deposit(p.id)}><Banknote className="size-3" />Deposited</button>}
                {p.status === "CREATED" && <><button className="btn-outline btn-sm" onClick={() => { navigator.clipboard.writeText(p.linkUrl); toast("Link copied"); }}><Copy className="size-3" /></button>{isSuper && <button className="btn-outline btn-sm" onClick={() => offline(p.id)}>Mark paid</button>}</>}
                {(p.status === "CAPTURED" || p.status === "TO_DEPOSIT") && p.amount > 0 && isSuper && <button className="btn-ghost btn-sm text-bad" title="Refund" onClick={() => setRefund(p)}><Undo2 className="size-3.5" /></button>}
              </div></td>
            </tr>))}
          </tbody>
        </Table>}
      </div>
      {refund && <RefundModal p={refund} onClose={() => setRefund(null)} onDone={() => { setRefund(null); reload(); toast("Refund processed"); }} />}
      <LinkResult data={link} onClose={() => setLink(null)} />
      {invoiceId && <SaasInvoice id={invoiceId} onClose={() => router.replace("/payments")} />}
    </div>
  );
}

function RefundModal({ p, onClose, onDone }: any) {
  const [amount, setAmount] = useState(String(p.amount));
  const [reason, setReason] = useState("");
  const [cancel, setCancel] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => { try { await api(`/payments/${p.id}/refund`, { body: { amount: Number(amount), reason, cancelSubscription: cancel } }); onDone(); } catch (e: any) { setErr(e.message); } };
  return (
    <Modal open onClose={onClose} title={`Refund ${p.customer}`} footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn bg-bad text-white" onClick={go}>Refund {inr(Number(amount))}</button></>}>
      <div className="space-y-3">
        <Field label="Amount (incl. GST)"><input className="input font-bold" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} /></Field>
        <Field label="Reason"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Duplicate payment" /></Field>
        <Toggle label="Also cancel this subscription" on={cancel} onChange={setCancel} />
        <p className="text-xs text-muted">{p.gateway === "razorpay" ? "Refund goes back to the customer via Razorpay (5–7 days)." : "Offline payment — return the money manually; this records the refund."}</p>
        <ErrorBox error={err} />
      </div>
    </Modal>
  );
}

/** Jippronex → customer GST invoice for the subscription */
function SaasInvoice({ id, onClose }: { id: string; onClose: () => void }) {
  const [p, setP] = useState<any>(null);
  useEffect(() => { api(`/payments/${id}`).then(setP); }, [id]);
  const co = p?.company || { name: "Jippronex Technologies" };
  const interState = p && p.business.stateCode !== (co.gstin || "19").slice(0, 2);
  return (
    <Modal open onClose={onClose} title={p?.invoiceNo || "Invoice"} wide footer={<button className="btn-primary" onClick={() => window.print()}><Printer className="size-4" />Print / PDF</button>}>
      {!p ? <Loading /> : <div className="print-area text-sm">
        <div className="flex justify-between"><div><div className="text-xl font-extrabold text-brand">{co.name}</div><div className="text-muted">{co.address}</div>{co.gstin && <div className="font-semibold">GSTIN {co.gstin}</div>}</div>
          <div className="text-right"><div className="text-lg font-extrabold">TAX INVOICE</div><div>{p.invoiceNo}</div><div>{dt(p.paidAt)}</div></div></div>
        <div className="mt-5 rounded-xl bg-canvas p-3"><div className="text-[10px] font-bold text-muted tracking-widest">BILL TO</div><div className="font-bold">{p.business.name}</div>
          <div>{[p.business.address, p.business.city, p.business.state].filter(Boolean).join(", ")}</div>{p.business.gstin && <div>GSTIN {p.business.gstin}</div>}</div>
        <table className="w-full mt-4"><thead><tr className="bg-brand text-white text-xs"><th className="text-left p-2">Description</th><th className="p-2">SAC</th><th className="text-right p-2">Amount</th></tr></thead>
          <tbody><tr className="border-b border-line"><td className="p-2">{p.description}</td><td className="p-2 text-center">998314</td><td className="p-2 text-right">₹{inr2(p.baseAmount)}</td></tr></tbody></table>
        <div className="ml-auto w-64 mt-3 space-y-1">
          {interState ? <div className="flex justify-between"><span className="text-muted">IGST 18%</span><span>₹{inr2(p.gstAmount)}</span></div> : <>
            <div className="flex justify-between"><span className="text-muted">CGST 9%</span><span>₹{inr2(p.gstAmount / 2)}</span></div><div className="flex justify-between"><span className="text-muted">SGST 9%</span><span>₹{inr2(p.gstAmount / 2)}</span></div></>}
          <div className="flex justify-between font-extrabold text-base border-t border-line pt-1"><span>Total</span><span>{inr(p.amount)}</span></div>
          <div className="text-xs text-muted">Paid via {p.method} · {p.gatewayPaymentId}</div>
        </div>
      </div>}
    </Modal>
  );
}
export default function Page() { return <Suspense fallback={<Loading />}><Payments /></Suspense>; }
