"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, FileText, MessageCircle, Printer, Plus, Trash2, Info, Truck, Calendar } from "lucide-react";
import { api, inr, inr2, isoDate, useApi } from "@/lib/api";
import { calcDoc } from "@/lib/gst";
import { PartyPicker, ProductSearch, type Party, type Product, type ProductSearchHandle } from "@/components/pickers";
import { Seg, Field, ErrorBox, cx, useToast, Loading } from "@/components/ui";

type Line = { key: string; productId?: string | null; name: string; barcode?: string | null; hsn?: string | null; unit: string; qty: number; rate: number; discountPct: number; gstRate: number; stock?: number };
const KINDS: Record<string, { title: string; sub: string }> = {
  INVOICE: { title: "New Invoice", sub: "Scan barcode or search product — GST calculated automatically" },
  QUOTATION: { title: "New Quotation / Estimate", sub: "Share a price quote — convert to bill in one click" },
  CREDIT_NOTE: { title: "Credit Note (Sales return)", sub: "Goods come back into stock, customer balance reduces" },
  DELIVERY_CHALLAN: { title: "Delivery Challan", sub: "Send goods without a tax invoice" },
  PROFORMA: { title: "Proforma Invoice", sub: "Advance bill before supply" },
};
const words = (n: number) => {
  const o = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const t = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const two = (x: number) => (x < 20 ? o[x] : t[Math.floor(x / 10)] + (x % 10 ? "-" + o[x % 10] : ""));
  const three = (x: number) => [Math.floor(x / 100) ? o[Math.floor(x / 100)] + " hundred" : "", x % 100 ? two(x % 100) : ""].filter(Boolean).join(" ");
  if (!n) return "Zero";
  const p: string[] = []; let x = Math.round(n);
  const c = Math.floor(x / 1e7); x %= 1e7; const l = Math.floor(x / 1e5); x %= 1e5; const th = Math.floor(x / 1e3); x %= 1e3;
  if (c) p.push(three(c) + " crore"); if (l) p.push(two(l) + " lakh"); if (th) p.push(two(th) + " thousand"); if (x) p.push(three(x));
  const s = p.join(" ");
  return s[0].toUpperCase() + s.slice(1) + " only";
};

function NewInvoice() {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const kind = (sp.get("kind") || "INVOICE").toUpperCase();
  const isSale = kind === "INVOICE";
  const { data: biz } = useApi<any>("/settings/business");
  const [billType, setBillType] = useState<"GST" | "NON_GST">("GST");
  const [party, setParty] = useState<Party | null>(null);
  const [date, setDate] = useState(isoDate(new Date()));
  const [pos, setPos] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([]);
  const [mode, setMode] = useState<"CASH" | "UPI" | "CARD" | "CREDIT">("CASH");
  const [received, setReceived] = useState<string>("");
  const [touchedReceived, setTouchedReceived] = useState(false);
  const [due, setDue] = useState(isoDate(new Date(Date.now() + 7 * 864e5)));
  const [format, setFormat] = useState<"A4" | "A5" | "THERMAL">("A4");
  const [transport, setTransport] = useState("");
  const [eway, setEway] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const search = useRef<ProductSearchHandle>(null);

  useEffect(() => { if (biz && !pos) setPos(biz.stateCode); }, [biz, pos]);
  useEffect(() => { if (party?.stateCode) setPos(party.stateCode); else if (biz) setPos(biz.stateCode); if (!party && mode === "CREDIT") setMode("CASH"); }, [party]); // eslint-disable-line
  useEffect(() => { search.current?.focus(); }, []);

  const interState = billType === "GST" && !!biz && pos !== biz.stateCode;
  const calc = useMemo(() => calcDoc(lines.map((l) => ({ qty: l.qty || 0, rate: l.rate || 0, discountPct: l.discountPct, gstRate: l.gstRate })), interState, billType === "GST"), [lines, interState, billType]);
  useEffect(() => { if (!touchedReceived) setReceived(mode === "CREDIT" ? "0" : String(calc.total)); }, [calc.total, mode, touchedReceived]);
  const recv = Math.min(Number(received || 0), calc.total);
  const balance = Math.max(0, calc.total - recv);

  const add = (p: Product) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.productId === p.id);
      if (i >= 0) { const c = [...ls]; c[i] = { ...c[i], qty: c[i].qty + 1 }; return c; }
      return [...ls, { key: crypto.randomUUID(), productId: p.id, name: p.name, barcode: p.barcode, hsn: p.hsn, unit: p.unit, qty: 1, rate: p.saleRate, discountPct: 0, gstRate: p.gstRate, stock: p.stock }];
    });
  };
  const addCustom = () => setLines((ls) => [...ls, { key: crypto.randomUUID(), name: "", unit: "pcs", qty: 1, rate: 0, discountPct: 0, gstRate: 0 }]);
  const upd = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = async (then: "view" | "pdf" | "wa" | "print") => {
    setErr(null);
    if (!lines.length) return setErr("Add at least one item");
    if (lines.some((l) => !l.name || !(l.qty > 0))) return setErr("Every item needs a name and quantity");
    if (isSale && !party && balance > 0.5) return setErr("Walk-in sale must be fully paid. Select a customer to give credit.");
    setBusy(true);
    try {
      const inv = await api("/invoices", { body: {
        kind, billType, partyId: party?.id ?? null, customerName: party ? undefined : "Walk-in customer",
        date: new Date(date + "T" + new Date().toTimeString().slice(0, 8)), placeOfSupply: pos,
        items: lines.map((l) => ({ productId: l.productId, name: l.name, hsn: l.hsn, unit: l.unit, qty: l.qty, rate: l.rate, discountPct: l.discountPct, gstRate: l.gstRate })),
        payment: isSale ? { mode, amount: mode === "CREDIT" ? 0 : recv } : null,
        dueDate: isSale && balance > 0 ? due : null, transport: transport || null, ewayBill: eway || null, notes: notes || null, printFormat: format,
      } });
      toast(`${inv.number} saved`);
      if (then === "wa") window.open(inv.whatsapp.link, "_blank");
      router.push(`/sales/${inv.id}${then === "pdf" || then === "print" ? "?print=1" : ""}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  if (!biz) return <Loading />;
  const qtySum = lines.reduce((s, l) => s + (l.qty || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[26px] font-extrabold tracking-tight">{KINDS[kind]?.title}</h1><p className="text-sm text-muted">{KINDS[kind]?.sub}</p></div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" disabled={busy} onClick={() => save("view")}><Eye className="size-4" />Save & View</button>
          <button className="btn-outline" disabled={busy} onClick={() => save("pdf")}><FileText className="size-4" />Save & PDF</button>
          <button className="btn-wa" disabled={busy} onClick={() => save("wa")}><MessageCircle className="size-4" />Save & Send on WhatsApp</button>
          <button className="btn-primary" disabled={busy} onClick={() => save("print")}><Printer className="size-4" />Print</button>
        </div>
      </div>
      <ErrorBox error={err} />
      <div className="grid xl:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <div className="card p-4 grid grid-cols-2 lg:grid-cols-[auto_1.3fr_1fr_1fr] gap-3 items-end">
            <Field label="Bill type"><Seg value={billType} onChange={setBillType} options={[{ value: "GST", label: "GST" }, { value: "NON_GST", label: "Non-GST" }]} /></Field>
            <Field label="Customer"><PartyPicker type="CUSTOMER" value={party} onChange={setParty} allowWalkIn /></Field>
            <Field label="Invoice no. · Date">
              <div className="input flex items-center gap-2"><span className="font-mono text-xs text-muted">Auto</span><span className="text-faint">·</span>
                <input type="date" className="flex-1 outline-none bg-transparent text-sm" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            </Field>
            <Field label="Place of supply">
              <select className="input" value={pos} onChange={(e) => setPos(e.target.value)} disabled={billType === "NON_GST"}>
                {Object.entries(biz.states as Record<string, string>).map(([c, n]) => <option key={c} value={c}>{n} ({c})</option>)}
              </select>
            </Field>
            {party && <div className="col-span-full text-xs text-muted -mt-1">Balance <b className={party.balance > 0 ? "text-bad" : "text-ink"}>{inr(party.balance)}</b>{party.creditLimit ? <> · Credit limit {inr(party.creditLimit)}</> : null}{party.gstin && <> · GSTIN {party.gstin}</>}</div>}
          </div>

          <div className="card">
            <div className="p-4 flex gap-2"><ProductSearch ref={search} onPick={add} /><button className="btn-outline" onClick={addCustom}><Plus className="size-4" />Add item</button></div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr>
                  <th className="th w-8">#</th><th className="th">Product</th><th className="th">HSN</th><th className="th">Qty</th><th className="th">Rate</th>
                  <th className="th">Disc %</th>{billType === "GST" && <th className="th">GST %</th>}<th className="th text-right">Amount</th><th className="th w-8" />
                </tr></thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.key} className="align-top">
                      <td className="td text-muted pt-5">{i + 1}</td>
                      <td className="td min-w-[200px]">
                        {l.productId ? <><div className="font-semibold">{l.name}</div><div className="text-[11px] text-muted font-mono">{l.barcode}{l.stock != null && <span className={cx("ml-2", l.stock < l.qty && "text-bad font-bold")}>stock {l.stock}</span>}</div></>
                          : <input className="input h-9" placeholder="Item name" value={l.name} onChange={(e) => upd(l.key, { name: e.target.value })} />}
                      </td>
                      <td className="td"><input className="input h-9 w-20" value={l.hsn || ""} onChange={(e) => upd(l.key, { hsn: e.target.value })} /></td>
                      <td className="td"><div className="flex items-center input h-9 w-28 px-2"><input className="w-12 outline-none font-semibold" inputMode="decimal" value={l.qty} onChange={(e) => upd(l.key, { qty: Number(e.target.value.replace(/[^\d.]/g, "")) })} /><span className="text-xs text-muted">{l.unit}</span></div></td>
                      <td className="td"><input className="input h-9 w-24" inputMode="decimal" value={l.rate} onChange={(e) => upd(l.key, { rate: Number(e.target.value.replace(/[^\d.]/g, "")) })} /></td>
                      <td className="td"><input className="input h-9 w-16" inputMode="decimal" value={l.discountPct || ""} placeholder="—" onChange={(e) => upd(l.key, { discountPct: Math.min(100, Number(e.target.value.replace(/[^\d.]/g, ""))) })} /></td>
                      {billType === "GST" && <td className="td"><select className="input h-9 w-20 px-2" value={l.gstRate} onChange={(e) => upd(l.key, { gstRate: Number(e.target.value) })}>{[0, 3, 5, 12, 18, 28, 40].map((g) => <option key={g} value={g}>{g}%</option>)}</select></td>}
                      <td className="td text-right font-bold pt-5">{inr(calc.lines[i]?.amount)}</td>
                      <td className="td pt-4"><button className="btn-ghost btn-sm w-8 px-0 text-bad" onClick={() => setLines(lines.filter((x) => x.key !== l.key))}><Trash2 className="size-4" /></button></td>
                    </tr>
                  ))}
                  {!lines.length && <tr><td colSpan={9} className="text-center py-12 text-muted text-sm">Scan a barcode or search a product to start the bill</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-between gap-2 px-4 py-3 text-xs text-muted">
              <span className="flex items-center gap-1.5"><Info className="size-3.5" />Same state → <b className="text-ink">CGST + SGST</b> · Other state → <b className="text-ink">IGST</b> auto</span>
              {(isSale || kind === "CREDIT_NOTE") && <span>Stock auto-{isSale ? "reduced" : "added"} on save</span>}
            </div>
          </div>

          <div className="card p-4 grid md:grid-cols-3 gap-3">
            <Field label="Transport / vehicle no."><div className="relative"><Truck className="size-4 absolute left-3 top-3 text-muted" /><input className="input pl-9" value={transport} onChange={(e) => setTransport(e.target.value.toUpperCase())} placeholder="WB 39 C 4410" /></div></Field>
            <Field label="E-way bill no."><input className="input" value={eway} onChange={(e) => setEway(e.target.value)} placeholder="Optional" /></Field>
            <Field label="Notes on invoice"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Goods once sold…" /></Field>
          </div>
        </div>

        <div className="space-y-4 xl:sticky xl:top-0">
          <div className="card p-5 space-y-2 text-sm">
            <Row a="Items" b={`${lines.length} · ${qtySum} qty`} />
            <Row a="Taxable value" b={inr(calc.taxable, true)} />
            <Row a="Discount" b={calc.discount ? `− ${inr(calc.discount, true)}` : "—"} />
            {interState ? <Row a="IGST" b={inr(calc.igst, true)} /> : <><Row a="CGST" b={inr(calc.cgst, true)} /><Row a="SGST" b={inr(calc.sgst, true)} /></>}
            <Row a="Round off" b={`${calc.roundOff >= 0 ? "+" : "−"} ₹${inr2(Math.abs(calc.roundOff))}`} />
            <div className="border-t border-line pt-3 mt-3 flex items-end justify-between">
              <div className="font-bold text-base">Grand total</div><div className="text-3xl font-extrabold text-brand">{inr(calc.total)}</div>
            </div>
            <div className="text-xs text-muted">{words(calc.total)}</div>
          </div>
          {isSale && (
            <div className="card p-5 space-y-3">
              <div className="label mb-0">Payment</div>
              <div className="grid grid-cols-4 gap-1.5">
                {(["CASH", "UPI", "CARD", "CREDIT"] as const).map((m) => (
                  <button key={m} disabled={m === "CREDIT" && !party} onClick={() => { setMode(m); setTouchedReceived(false); }}
                    className={cx("h-9 rounded-full text-sm font-semibold border disabled:opacity-40", mode === m ? "bg-brand text-white border-brand" : "border-line text-muted hover:text-ink")}>
                    {m === "UPI" ? "UPI" : m[0] + m.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              {mode !== "CREDIT" && <Field label="Amount received"><input className="input font-bold" inputMode="decimal" value={received} onChange={(e) => { setTouchedReceived(true); setReceived(e.target.value.replace(/[^\d.]/g, "")); }} /></Field>}
              {balance > 0 && <div className="flex justify-between text-sm font-semibold text-bad"><span>Balance (to customer ledger)</span><span>{inr(balance)}</span></div>}
              {balance > 0 && <Field label="Due date"><div className="relative"><Calendar className="size-4 absolute left-3 top-3 text-muted" /><input type="date" className="input pl-9" value={due} onChange={(e) => setDue(e.target.value)} /></div></Field>}
            </div>
          )}
          <div className="card p-5">
            <div className="label">Print format</div>
            <div className="flex gap-1.5">{(["A4", "A5", "THERMAL"] as const).map((f) => (
              <button key={f} onClick={() => setFormat(f)} className={cx("h-8 px-3 rounded-full text-sm font-semibold border", format === f ? "bg-brand text-white border-brand" : "border-line text-muted")}>{f === "THERMAL" ? 'Thermal 3"' : f}</button>
            ))}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
const Row = ({ a, b }: { a: string; b: string }) => <div className="flex justify-between"><span className="text-muted">{a}</span><span className="font-semibold">{b}</span></div>;

export default function Page() { return <Suspense fallback={<Loading />}><NewInvoice /></Suspense>; }
