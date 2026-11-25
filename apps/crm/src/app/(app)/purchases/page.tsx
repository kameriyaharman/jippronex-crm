"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Trash2, PackagePlus, Search } from "lucide-react";
import { api, useApi, inr, dm, ym, isoDate } from "@/lib/api";
import { calcDoc } from "@/lib/gst";
import { PartyPicker, ProductSearch, type Party, type Product } from "@/components/pickers";
import { PageHeader, Pill, Loading, Empty, Table, Kpi, Field, ErrorBox, cx, useToast, Upgrade } from "@/components/ui";
import { useSession } from "@/lib/session";

function Purchases() {
  const sp = useSearchParams();
  const { feature } = useSession();
  const [month, setMonth] = useState(ym());
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(!!sp.get("new"));
  const { data, reload, error } = useApi<any>(`/purchases?month=${month}&q=${encodeURIComponent(q)}`);
  if (!feature("purchase")) return <Upgrade what="Purchases & suppliers" />;
  const s = data?.summary;
  return (
    <div>
      <PageHeader title="Purchases" sub="Supplier bills — stock goes up automatically, payable tracked">
        <button className="btn-primary" onClick={() => setShowNew(true)}><Plus className="size-4" />New Purchase</button>
      </PageHeader>
      {error && <ErrorBox error={error} />}
      {s && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi label="Purchase (month)" value={inr(s.total)} sub={`${s.bills} bills`} />
        <Kpi label="Input GST (ITC)" value={inr(s.itc)} sub="claimable this month" subTone="ok" />
        <Kpi label="To pay suppliers" value={inr(s.payable.amount)} sub={`${s.payable.suppliers} suppliers`} subTone="bad" />
        <Kpi label="Due this week" value={inr(s.dueThisWeek.amount)} sub={`${s.dueThisWeek.bills} bills`} />
      </div>}
      <div className={cx("grid gap-4 items-start", showNew && "xl:grid-cols-[1fr_420px]")}>
        <div className="card overflow-hidden min-w-0">
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
            <div className="font-bold px-1">Purchase bills</div><div className="flex-1" />
            <div className="relative"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input className="input h-9 pl-9 w-52" placeholder="Supplier / bill no" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <input type="month" className="input h-9 w-40" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          {!data ? <Loading /> : !data.rows.length ? <Empty title="No purchase bills this month" /> : (
            <Table>
              <thead><tr>{["No.", "Date", "Supplier", "Supplier bill", "Amount", "GST", "Status", "Due"].map((h) => <th key={h} className={cx("th", (h === "Amount" || h === "GST") && "text-right")}>{h}</th>)}</tr></thead>
              <tbody>{data.rows.map((p: any) => (
                <tr key={p.id} className="hover:bg-canvas/60">
                  <td className="td font-mono font-semibold text-[12.5px]">{p.number}</td><td className="td">{dm(p.date)}</td><td className="td font-medium">{p.supplier}</td>
                  <td className="td font-mono text-xs">{p.supplierBillNo || "—"}</td><td className="td text-right font-bold">{inr(p.total)}</td><td className="td text-right">{inr(p.gst)}</td>
                  <td className="td"><Pill status={p.status} /></td><td className="td text-muted">{p.balance > 0 ? dm(p.dueDate) : "—"}</td>
                </tr>))}
              </tbody>
            </Table>
          )}
        </div>
        {showNew && <NewPurchase onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); reload(); }} />}
      </div>
    </div>
  );
}

type L = { productId: string; name: string; unit: string; qty: number; rate: number; gstRate: number };
function NewPurchase({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { data: reorder } = useApi<any[]>("/stock/reorder");
  const [sup, setSup] = useState<Party | null>(null);
  const [billNo, setBillNo] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));
  const [lines, setLines] = useState<L[]>([]);
  const [paidNow, setPaidNow] = useState(false);
  const [credit, setCredit] = useState(15);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const calc = useMemo(() => calcDoc(lines, false, true), [lines]);
  const add = (p: Product) => setLines((ls) => (ls.some((l) => l.productId === p.id) ? ls : [...ls, { productId: p.id, name: p.name, unit: p.unit, qty: 1, rate: p.purchaseRate ?? 0, gstRate: p.gstRate }]));
  const upd = (i: number, patch: Partial<L>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  useEffect(() => { setErr(null); }, [lines, sup]);
  const addReorder = async () => {
    for (const r of reorder || []) { const p = await api(`/products/${r.id}`); setLines((ls) => (ls.some((l) => l.productId === p.id) ? ls : [...ls, { productId: p.id, name: p.name, unit: p.unit, qty: r.order || p.minStock, rate: p.purchaseRate ?? 0, gstRate: p.gstRate }])); }
  };
  const save = async () => {
    if (!sup) return setErr("Select a supplier");
    if (!lines.length) return setErr("Add items");
    setBusy(true);
    try {
      const r = await api("/purchases", { body: { supplierId: sup.id, supplierBillNo: billNo || null, date: new Date(date + "T12:00:00"), creditDays: credit,
        items: lines.map((l) => ({ productId: l.productId, qty: l.qty, rate: l.rate, gstRate: l.gstRate })), payment: paidNow ? { mode: "BANK", amount: calc.total } : null } });
      toast(`${r.number} saved · stock updated`); onSaved();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  return (
    <div className="card p-5 space-y-3 xl:sticky xl:top-0">
      <div className="flex items-center justify-between"><div className="font-bold">New purchase</div><button className="btn-ghost btn-sm" onClick={onClose}>Close</button></div>
      <Field label="Supplier"><PartyPicker type="SUPPLIER" value={sup} onChange={setSup} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Supplier bill no."><input className="input" value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="INV/ITC/8834" /></Field>
        <Field label="Bill date"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <div className="flex gap-2"><ProductSearch onPick={add} placeholder="Scan / search product" /></div>
      {!!reorder?.length && !lines.length && <button className="btn-outline btn-sm w-full" onClick={addReorder}><PackagePlus className="size-3.5" />Add {reorder.length} low-stock items (reorder suggestion)</button>}
      <div className="space-y-2 max-h-[360px] overflow-y-auto">
        {lines.map((l, i) => (
          <div key={l.productId} className="rounded-xl border border-line p-3">
            <div className="flex justify-between gap-2"><div className="font-semibold text-sm">{l.name}</div><button className="text-bad" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button></div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <label className="text-[11px] text-muted">Qty ({l.unit})<input className="input h-8" inputMode="decimal" value={l.qty} onChange={(e) => upd(i, { qty: Number(e.target.value.replace(/[^\d.]/g, "")) })} /></label>
              <label className="text-[11px] text-muted">Rate<input className="input h-8" inputMode="decimal" value={l.rate} onChange={(e) => upd(i, { rate: Number(e.target.value.replace(/[^\d.]/g, "")) })} /></label>
              <label className="text-[11px] text-muted">GST %<select className="input h-8 px-2" value={l.gstRate} onChange={(e) => upd(i, { gstRate: Number(e.target.value) })}>{[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
            </div>
            <div className="flex justify-between text-xs mt-2"><span className="text-ok font-semibold">stock +{l.qty}</span><span className="font-bold">{inr(calc.lines[i]?.amount)}</span></div>
          </div>
        ))}
      </div>
      <div className="flex justify-between font-bold text-lg border-t border-line pt-3"><span>Total</span><span>{inr(calc.total)}</span></div>
      <div className="grid grid-cols-2 gap-1.5">
        <button className={cx("h-9 rounded-full text-sm font-semibold border", paidNow ? "bg-brand text-white border-brand" : "border-line text-muted")} onClick={() => setPaidNow(true)}>Paid now</button>
        <button className={cx("h-9 rounded-full text-sm font-semibold border", !paidNow ? "bg-brand text-white border-brand" : "border-line text-muted")} onClick={() => setPaidNow(false)}>Credit · {credit} days</button>
      </div>
      {!paidNow && <input type="range" min={0} max={60} step={5} value={credit} onChange={(e) => setCredit(+e.target.value)} className="w-full accent-brand" />}
      <ErrorBox error={err} />
      <button className="btn-primary w-full" disabled={busy} onClick={save}>Save purchase & update stock</button>
    </div>
  );
}

export default function Page() { return <Suspense fallback={<Loading />}><Purchases /></Suspense>; }
