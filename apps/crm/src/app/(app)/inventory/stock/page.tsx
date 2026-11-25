"use client";
import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Printer, Trash2 } from "lucide-react";
import { api, useApi, qty, dm, tm, inr } from "@/lib/api";
import { REASON } from "@/lib/labels";
import { useSession } from "@/lib/session";
import { ProductSearch, type Product } from "@/components/pickers";
import { PageHeader, Loading, Table, Field, Seg, cx, useToast, Upgrade } from "@/components/ui";

export default function StockPage() {
  const { can, feature } = useSession();
  const toast = useToast();
  const [days, setDays] = useState("2");
  const { data: moves, reload } = useApi<any[]>(`/stock/movements?days=${days}`);
  const { data: reorder, reload: reloadRe } = useApi<any[]>("/stock/reorder");
  const [dir, setDir] = useState<"IN" | "OUT">("IN");
  const [prod, setProd] = useState<Product | null>(null);
  const [n, setN] = useState("");
  const [reason, setReason] = useState("OPENING");
  const [note, setNote] = useState("");
  const [labels, setLabels] = useState<{ p: Product; count: number }[]>([]);
  const [size, setSize] = useState("38x25");
  useEffect(() => { setReason(dir === "IN" ? "OPENING" : "DAMAGE"); }, [dir]);
  if (!feature("inventory")) return <Upgrade what="Stock in/out & barcodes" />;

  const update = async () => {
    try {
      await api("/stock/adjust", { body: { productId: prod!.id, direction: dir, qty: Number(n), reason, note: note || undefined } });
      toast(`Stock ${dir === "IN" ? "added" : "reduced"} · ${prod!.name}`); setProd(null); setN(""); setNote(""); reload(); reloadRe();
    } catch (e: any) { toast(e.message, "bad"); }
  };
  const total = labels.reduce((s, l) => s + l.count, 0);

  return (
    <div>
      <div className="no-print"><PageHeader title="Stock In / Out & Barcodes" sub="Every movement logged — sale, purchase, return, damage, adjustment">
        {can("stock.adjust") && <><button className="btn-outline" onClick={() => setDir("OUT")}>Stock out</button><button className="btn-primary" onClick={() => setDir("IN")}>Stock in</button></>}
      </PageHeader></div>
      <div className="grid xl:grid-cols-[1fr_360px] gap-4 items-start no-print">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-line">
            <div className="font-bold">Stock movement</div>
            <Seg value={days} onChange={setDays} options={[{ value: "2", label: "Today & yesterday" }, { value: "7", label: "7 days" }, { value: "30", label: "30 days" }]} />
          </div>
          {!moves ? <Loading /> : (
            <Table>
              <thead><tr><th className="th">Date</th><th className="th">Product</th><th className="th">Reason</th><th className="th text-right">Qty</th><th className="th text-right">Balance</th></tr></thead>
              <tbody>{moves.map((m) => (
                <tr key={m.id}><td className="td text-muted whitespace-nowrap">{dm(m.createdAt)} {tm(m.createdAt)}</td><td className="td font-semibold">{m.product}</td>
                  <td className="td">{REASON[m.reason]}{m.refNo ? <span className="text-muted"> · {m.refNo}</span> : ""}{m.note && !m.refNo ? <span className="text-muted"> · {m.note}</span> : ""}</td>
                  <td className={cx("td text-right font-bold", m.qty > 0 ? "text-ok" : "text-bad")}>{m.qty > 0 ? "+" : "−"} {qty(Math.abs(m.qty))}</td><td className="td text-right">{qty(m.balanceAfter)}</td></tr>))}
              </tbody>
            </Table>
          )}
        </div>
        <div className="space-y-4">
          {can("stock.adjust") && <div className="card p-5 space-y-3">
            <div className="font-bold">Quick stock entry</div>
            <Seg value={dir} onChange={setDir} options={[{ value: "IN", label: "Stock IN" }, { value: "OUT", label: "Stock OUT" }]} />
            {prod ? <div className="input flex items-center justify-between font-semibold">{prod.name}<button className="text-xs text-brand" onClick={() => setProd(null)}>Change</button></div> : <div className="flex"><ProductSearch onPick={setProd} placeholder="Scan / search product" /></div>}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Qty"><input className="input" value={n} onChange={(e) => setN(e.target.value.replace(/[^\d.]/g, ""))} /></Field>
              <Field label="Reason"><select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>{(dir === "IN" ? ["OPENING", "RETURN", "TRANSFER", "ADJUSTMENT"] : ["DAMAGE", "TRANSFER", "ADJUSTMENT"]).map((r) => <option key={r} value={r}>{REASON[r]}</option>)}</select></Field>
            </div>
            <Field label="Note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="From Shop 2" /></Field>
            <button className="btn-primary w-full" disabled={!prod || !Number(n)} onClick={update}>Update stock</button>
          </div>}
          <div className="card p-5">
            <div className="flex justify-between"><div className="font-bold">Reorder suggestions</div><div className="text-xs text-muted">Based on last 30 days</div></div>
            <div className="mt-3 space-y-2">{reorder?.map((r) => (
              <div key={r.id} className="flex justify-between text-sm"><span className="font-medium">{r.name}</span><span className="text-brand font-bold">order {r.order} {r.unit}</span></div>))}
              {reorder && !reorder.length && <div className="text-sm text-muted">Nothing to reorder 👍</div>}
            </div>
          </div>
        </div>
      </div>

      <div id="labels" className="card p-5 mt-4 no-print">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div><div className="font-bold">Barcode label printing</div><div className="text-xs text-muted">Products without barcode get an auto-generated code</div></div>
          <div className="flex gap-2 items-center">
            <Seg value={size} onChange={setSize} options={[{ value: "38x25", label: "38×25 mm" }, { value: "50x25", label: "50×25 mm" }, { value: "a4", label: "A4 sheet" }]} />
            <button className="btn-primary" disabled={!total} onClick={() => window.print()}><Printer className="size-4" />Print {total} labels</button>
          </div>
        </div>
        <div className="flex gap-2 mb-3"><ProductSearch onPick={(p) => setLabels((l) => (l.some((x) => x.p.id === p.id) ? l : [...l, { p, count: 24 }]))} placeholder="Add product for labels" /></div>
        <div className="space-y-2">{labels.map((l, i) => (
          <div key={l.p.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
            <div className="flex-1"><div className="font-semibold text-sm">{l.p.name}</div><div className="text-xs font-mono text-muted">{l.p.barcode || "auto"}</div></div>
            <input className="input h-8 w-20" value={l.count} onChange={(e) => setLabels(labels.map((x, j) => (j === i ? { ...x, count: Number(e.target.value.replace(/\D/g, "")) } : x)))} /><span className="text-xs text-muted">labels</span>
            <button className="text-bad" onClick={() => setLabels(labels.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
          </div>))}
        </div>
        {labels.length > 0 && <div className="flex flex-wrap gap-2 mt-4">{labels.map((l) => <Label key={l.p.id} p={l.p} size={size} />)}</div>}
      </div>
      {/* print-only sheet */}
      <div className="hidden print:flex flex-wrap gap-[2mm]">
        {labels.flatMap((l) => Array.from({ length: l.count }, (_, i) => <Label key={l.p.id + i} p={l.p} size={size} />))}
      </div>
    </div>
  );
}

function Label({ p, size }: { p: Product; size: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const code = p.barcode || "2" + p.id.replace(/\D/g, "").padEnd(11, "0").slice(0, 11);
  useEffect(() => { if (ref.current) JsBarcode(ref.current, code, { format: /^\d{13}$/.test(code) ? "EAN13" : "CODE128", height: 34, width: 1.3, fontSize: 11, margin: 0, displayValue: true }); }, [code]);
  const w = size === "50x25" ? "50mm" : "38mm";
  return (
    <div className="border border-dashed border-line rounded-md p-1.5 text-center bg-white break-inside-avoid" style={{ width: w, height: "25mm" }}>
      <div className="text-[9px] font-bold truncate">{p.name}</div>
      <svg ref={ref} className="mx-auto max-w-full h-[13mm]" />
      {p.mrp ? <div className="text-[9px] font-bold">MRP {inr(p.mrp)}</div> : null}
    </div>
  );
}
