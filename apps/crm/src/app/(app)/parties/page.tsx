"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, MessageCircle, Plus, HandCoins, Pencil, Search, Phone } from "lucide-react";
import { useApi, inr, dm, ym, download } from "@/lib/api";
import { useSession } from "@/lib/session";
import { PageHeader, Loading, Empty, Table, Avatar, cx } from "@/components/ui";
import { PartyForm } from "@/components/pickers";
import { ReceivePayment } from "@/components/ReceivePayment";

function Parties() {
  const sp = useSearchParams();
  const router = useRouter();
  const { business } = useSession();
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState<"CUSTOMER" | "SUPPLIER" | null>(null);
  const { data, reload } = useApi<any>(`/parties?type=${type}&q=${encodeURIComponent(q)}`);
  const sel = sp.get("id") || data?.rows.find((p: any) => p.name !== "Walk-in customers")?.id;
  return (
    <div>
      <PageHeader title="Customers & Suppliers" sub="Party-wise ledger — every bill and payment in one place">
        <button className="btn-primary" onClick={() => setAdding(type === "SUPPLIER" ? "SUPPLIER" : "CUSTOMER")}><Plus className="size-4" />Add party</button>
      </PageHeader>
      <div className="grid lg:grid-cols-[340px_1fr] gap-4 items-start">
        <div className="card overflow-hidden lg:sticky lg:top-0">
          {data && <div className="grid grid-cols-2 border-b border-line">
            <div className="p-4"><div className="kpi-label">To receive</div><div className="text-lg font-extrabold text-bad">{inr(data.totals.receivable)}</div></div>
            <div className="p-4 border-l border-line"><div className="kpi-label">To pay</div><div className="text-lg font-extrabold text-warn">{inr(data.totals.payable)}</div></div>
          </div>}
          <div className="p-3 space-y-2 border-b border-line">
            <div className="relative"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input className="input h-9 pl-9" placeholder="Search party" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="flex gap-1.5">{[["", "All"], ["CUSTOMER", "Customers"], ["SUPPLIER", "Suppliers"]].map(([k, l]) => <button key={k} className="chip" data-on={type === k} onClick={() => setType(k)}>{l}</button>)}</div>
          </div>
          <div className="max-h-[calc(100vh-330px)] overflow-y-auto divide-y divide-line">
            {!data ? <Loading /> : data.rows.map((p: any) => (
              <button key={p.id} onClick={() => router.replace(`/parties?id=${p.id}`)} className={cx("w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-canvas", sel === p.id && "bg-brand-50")}>
                <Avatar name={p.name} className={cx("size-9", p.type === "CUSTOMER" ? "bg-brand-50 text-brand" : "bg-warn-50 text-warn")} />
                <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{p.name}</div><div className="text-xs text-muted">{p.name === "Walk-in customers" ? "Cash sale" : p.type === "CUSTOMER" ? "Customer" : "Supplier"}</div></div>
                <div className={cx("text-sm font-bold", p.balance > 0 ? "text-bad" : p.balance < 0 ? "text-warn" : "text-muted")}>{inr(Math.abs(p.balance))} {p.balance > 0 ? "Dr" : p.balance < 0 ? "Cr" : ""}</div>
              </button>
            ))}
          </div>
        </div>
        {sel ? <Ledger id={sel} business={business} onChanged={reload} /> : <div className="card"><Empty title="Select a party" /></div>}
      </div>
      {adding && <PartyForm open type={adding} onClose={() => setAdding(null)} onSaved={(p) => { setAdding(null); reload(); router.replace(`/parties?id=${p.id}`); }} />}
    </div>
  );
}

function Ledger({ id, onChanged }: { id: string; business: any; onChanged: () => void }) {
  const [month, setMonth] = useState(ym());
  const [all, setAll] = useState(false);
  const { data: l, reload } = useApi<any>(`/parties/${id}${all ? "" : `?month=${month}`}`);
  const [receive, setReceive] = useState(false);
  const [edit, setEdit] = useState(false);
  const { can } = useSession();
  useEffect(() => setAll(false), [id]);
  if (!l) return <div className="card"><Loading /></div>;
  const p = l.party;
  const isCust = p.type === "CUSTOMER";
  const monthName = new Date(month + "-15").toLocaleString("en-IN", { month: "long", year: "numeric" });
  return (
    <div className="space-y-4 min-w-0">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xl font-extrabold">{p.name}</div>
            <div className="text-sm text-muted">{[p.address, p.city].filter(Boolean).join(", ")}{p.phone && <> · +91 {p.phone}</>}</div>
            <div className="text-sm text-muted">{p.gstin && <>GSTIN {p.gstin}</>}{p.creditLimit ? <> · Credit limit {inr(p.creditLimit)}</> : null}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {p.phone && <a href={`tel:+91${p.phone}`} className="btn-outline btn-sm"><Phone className="size-3.5" /></a>}
            <button className="btn-outline btn-sm" onClick={() => setEdit(true)}><Pencil className="size-3.5" />Edit</button>
            {can("reports.export") && <button className="btn-outline btn-sm" onClick={() => download(`/reports/party-ledger.xlsx?partyId=${p.id}&from=2000-01-01&to=2100-01-01`, `ledger-${p.name}.xlsx`)}><FileText className="size-3.5" />Statement</button>}
            {isCust && p.balance > 0 && <a className="btn-wa btn-sm" href={l.reminder.link} target="_blank" rel="noreferrer"><MessageCircle className="size-3.5" />Send reminder</a>}
            {can("payments") && <button className="btn-primary btn-sm" onClick={() => setReceive(true)}><HandCoins className="size-3.5" />{isCust ? "Receive payment" : "Pay supplier"}</button>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="rounded-xl bg-canvas p-3"><div className="kpi-label">{isCust ? "Total sales" : "Total purchase"}</div><div className="text-xl font-extrabold">{inr(isCust ? l.totals.billed : l.totals.purchased)}</div></div>
          <div className="rounded-xl bg-canvas p-3"><div className="kpi-label">{isCust ? "Received" : "Paid"}</div><div className="text-xl font-extrabold text-ok">{inr(isCust ? l.totals.received : l.totals.paid)}</div></div>
          <div className="rounded-xl bg-canvas p-3"><div className="kpi-label">{isCust ? "Balance due" : "To pay"}</div><div className="text-xl font-extrabold text-bad">{inr(Math.abs(p.balance))}</div></div>
        </div>
      </div>
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b border-line">
          <div className="font-bold">Ledger — {all ? "all time" : monthName}</div>
          <div className="flex gap-2 items-center">
            <button className="chip" data-on={all} onClick={() => setAll(!all)}>All time</button>
            {!all && <input type="month" className="input h-9 w-40" value={month} onChange={(e) => setMonth(e.target.value)} />}
          </div>
        </div>
        <Table>
          <thead><tr><th className="th">Date</th><th className="th">Particulars</th><th className="th text-right">Debit {isCust ? "(bill)" : "(paid)"}</th><th className="th text-right">Credit {isCust ? "(paid)" : "(bill)"}</th><th className="th text-right">Balance</th></tr></thead>
          <tbody>
            <tr className="bg-canvas/60"><td className="td text-muted">{all ? "" : dm(month + "-01")}</td><td className="td font-semibold">Opening balance</td><td className="td" /><td className="td" /><td className="td text-right font-bold">{inr(Math.abs(l.opening))}</td></tr>
            {l.rows.map((r: any) => (
              <tr key={r.type + r.refId}>
                <td className="td text-muted whitespace-nowrap">{dm(r.date)}</td>
                <td className="td">{r.type === "invoice" || r.type === "credit_note" ? <Link className="font-mono font-semibold text-brand text-[12.5px]" href={`/sales/${r.refId}`}>{r.particulars}</Link> : <span className="font-medium">{r.particulars}</span>}</td>
                <td className="td text-right">{r.debit ? inr(r.debit) : ""}</td>
                <td className="td text-right text-ok">{r.credit ? inr(r.credit) : ""}</td>
                <td className="td text-right font-bold">{inr(Math.abs(r.balance))}</td>
              </tr>
            ))}
            {!l.rows.length && <tr><td colSpan={5} className="text-center text-muted text-sm py-8">No entries in this period</td></tr>}
          </tbody>
        </Table>
      </div>
      {receive && <ReceivePayment partyId={p.id} onClose={() => setReceive(false)} onSaved={() => { setReceive(false); reload(); onChanged(); }} />}
      <PartyForm open={edit} type={p.type} party={p} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); onChanged(); }} />
    </div>
  );
}
export default function Page() { return <Suspense fallback={<Loading />}><Parties /></Suspense>; }
