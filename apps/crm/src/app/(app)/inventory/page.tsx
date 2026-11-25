"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Upload, Barcode, Plus, Search, ArrowLeftRight, Pencil, FileSpreadsheet } from "lucide-react";
import { readSheet } from "read-excel-file/browser";
import { api, useApi, inr, short, qty, dt, tm, download } from "@/lib/api";
import { useSession } from "@/lib/session";
import { REASON } from "@/lib/labels";
import { PageHeader, Kpi, Loading, Empty, Table, Modal, Field, ErrorBox, Pill, cx, useToast } from "@/components/ui";


function Inventory() {
  const sp = useSearchParams();
  const router = useRouter();
  const { can } = useSession();
  const [cat, setCat] = useState("");
  const [filter, setFilter] = useState(sp.get("filter") || "");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const detailId = sp.get("id");
  const { data: sum, reload: reloadSum } = useApi<any>("/products/summary");
  const { data: cats } = useApi<any[]>("/categories");
  const { data: rows, reload } = useApi<any[]>(`/products?q=${encodeURIComponent(q)}&category=${cat}&filter=${filter}`);
  const refresh = () => { reload(); reloadSum(); };
  return (
    <div>
      <PageHeader title="Inventory" sub="Real-time stock — every sale & purchase updates it instantly">
        {can("stock.adjust") && <button className="btn-outline" onClick={() => setImporting(true)}><Upload className="size-4" />Import Excel</button>}
        <button className="btn-outline" onClick={() => download("/products.xlsx", "products.xlsx")}><FileSpreadsheet className="size-4" />Export</button>
        <Link href="/inventory/stock#labels" className="btn-outline"><Barcode className="size-4" />Print barcodes</Link>
        <Link href="/inventory/stock" className="btn-outline"><ArrowLeftRight className="size-4" />Stock in / out</Link>
        {can("stock.adjust") && <button className="btn-primary" onClick={() => setEdit({})}><Plus className="size-4" />Add product</button>}
      </PageHeader>
      {sum && <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-4">
        <Kpi label="Total products" value={sum.total.toLocaleString("en-IN")} sub={`${sum.categories} categories`} />
        <Kpi label="Stock value" value={sum.value != null ? short(sum.value) : "—"} sub="at purchase rate" />
        <Kpi label="Low stock" value={<span className="text-warn">{sum.low}</span>} sub="below minimum" />
        <Kpi label="Out of stock" value={<span className="text-bad">{sum.out}</span>} sub="reorder now" />
        <Kpi label="Dead stock" value={sum.dead} sub="no sale in 90 days" />
      </div>}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
          <div className="relative"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input className="input h-9 pl-9 w-60" placeholder="Scan / search product" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <button className="chip" data-on={!cat && !filter} onClick={() => { setCat(""); setFilter(""); }}>All</button>
          {cats?.filter((c) => c.count).map((c) => <button key={c.id} className="chip" data-on={cat === c.id} onClick={() => { setCat(cat === c.id ? "" : c.id); setFilter(""); }}>{c.name}</button>)}
          <button className="chip" data-on={filter === "low"} onClick={() => { setFilter(filter === "low" ? "" : "low"); setCat(""); }}>Low stock {sum ? <span className="opacity-70">{sum.low}</span> : null}</button>
          <button className="chip" data-on={filter === "out"} onClick={() => { setFilter(filter === "out" ? "" : "out"); setCat(""); }}>Out {sum ? <span className="opacity-70">{sum.out}</span> : null}</button>
        </div>
        {!rows ? <Loading /> : !rows.length ? <Empty title="No products" sub="Add products or import from Excel" /> : (
          <Table>
            <thead><tr>{["Product", "Barcode", "Category", "Unit", ...(can("cost.view") ? ["Purchase"] : []), "Sale", ...(can("cost.view") ? ["Margin"] : []), "Stock", ""].map((h) => <th key={h} className={cx("th", ["Purchase", "Sale", "Margin", "Stock"].includes(h) && "text-right")}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id} className="hover:bg-canvas/60 cursor-pointer" onClick={() => router.push(`/inventory?id=${p.id}`)}>
                <td className="td font-semibold">{p.name}</td><td className="td font-mono text-xs text-muted">{p.barcode || "—"}</td><td className="td">{p.category || "—"}</td><td className="td">{p.unit}</td>
                {can("cost.view") && <td className="td text-right">{inr(p.purchaseRate)}</td>}<td className="td text-right font-semibold">{inr(p.saleRate)}</td>
                {can("cost.view") && <td className="td text-right text-ok font-semibold">{p.margin}%</td>}
                <td className="td text-right">{p.state === "OUT" ? <Pill status="OUT">Out of stock</Pill> : p.state === "LOW" ? <Pill status="LOW">Low · {qty(p.stock)}</Pill> : <span className="font-bold">{qty(p.stock)}</span>}</td>
                <td className="td" onClick={(e) => e.stopPropagation()}>{can("stock.adjust") && <button className="btn-ghost btn-sm" onClick={() => setEdit(p)}><Pencil className="size-3.5" /></button>}</td>
              </tr>))}
            </tbody>
          </Table>
        )}
      </div>
      <ProductForm product={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} cats={cats || []} />
      {detailId && <ProductDetail id={detailId} onClose={() => router.replace("/inventory")} onChanged={refresh} />}
      <ImportModal open={importing} onClose={() => setImporting(false)} onDone={refresh} />
    </div>
  );
}

function ProductForm({ product, onClose, onSaved, cats }: { product: any; onClose: () => void; onSaved: () => void; cats: any[] }) {
  const toast = useToast();
  const [f, setF] = useState<any>({});
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (product) setF({ unit: "pcs", gstRate: 0, ...product, category: product.category || "" }); setErr(null); }, [product]);
  if (!product) return null;
  const isNew = !product.id;
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      const body = { name: f.name, barcode: f.barcode || null, hsn: f.hsn || null, category: f.category || undefined, unit: f.unit, purchaseRate: Number(f.purchaseRate || 0),
        saleRate: Number(f.saleRate || 0), mrp: f.mrp ? Number(f.mrp) : null, gstRate: Number(f.gstRate), minStock: Number(f.minStock || 0), ...(isNew ? { openingStock: Number(f.openingStock || 0) } : {}) };
      if (isNew) await api("/products", { body }); else await api(`/products/${product.id}`, { method: "PUT", body });
      toast(isNew ? "Product added" : "Product updated"); onSaved();
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <Modal open onClose={onClose} title={isNew ? "Add product" : "Edit product"} wide
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={!f.name}>Save product</button></>}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Product name" className="col-span-2"><input autoFocus className="input" value={f.name || ""} onChange={set("name")} placeholder="Maggi Noodles 280g" /></Field>
        <Field label="Barcode" hint="Scan with a scanner into this box"><input className="input font-mono" value={f.barcode || ""} onChange={set("barcode")} /></Field>
        <Field label="HSN"><input className="input" value={f.hsn || ""} onChange={set("hsn")} /></Field>
        <Field label="Category"><input className="input" list="cats" value={f.category} onChange={set("category")} /><datalist id="cats">{cats.map((c) => <option key={c.id} value={c.name} />)}</datalist></Field>
        <Field label="Unit"><select className="input" value={f.unit} onChange={set("unit")}>{["pcs", "bag", "kg", "g", "ltr", "ml", "box", "dozen", "pack", "mtr", "set", "pair"].map((u) => <option key={u}>{u}</option>)}</select></Field>
        <Field label="Purchase rate"><input className="input" inputMode="decimal" value={f.purchaseRate ?? ""} onChange={set("purchaseRate")} /></Field>
        <Field label="Sale rate"><input className="input" inputMode="decimal" value={f.saleRate ?? ""} onChange={set("saleRate")} /></Field>
        <Field label="MRP"><input className="input" inputMode="decimal" value={f.mrp ?? ""} onChange={set("mrp")} /></Field>
        <Field label="GST %"><select className="input" value={f.gstRate} onChange={set("gstRate")}>{[0, 0.25, 3, 5, 12, 18, 28, 40].map((g) => <option key={g} value={g}>{g}%</option>)}</select></Field>
        {isNew && <Field label="Opening stock"><input className="input" inputMode="decimal" value={f.openingStock ?? ""} onChange={set("openingStock")} /></Field>}
        <Field label="Min stock alert"><input className="input" inputMode="decimal" value={f.minStock ?? ""} onChange={set("minStock")} /></Field>
      </div>
      <div className="mt-3"><ErrorBox error={err} /></div>
    </Modal>
  );
}

function ProductDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data: p, reload } = useApi<any>(`/products/${id}`);
  const { can } = useSession();
  const toast = useToast();
  const [dir, setDir] = useState<"IN" | "OUT" | null>(null);
  const [n, setN] = useState("");
  const [reason, setReason] = useState("ADJUSTMENT");
  const adjust = async () => {
    try { await api("/stock/adjust", { body: { productId: id, direction: dir, qty: Number(n), reason } }); toast("Stock updated"); setDir(null); setN(""); reload(); onChanged(); }
    catch (e: any) { toast(e.message, "bad"); }
  };
  return (
    <Modal open onClose={onClose} title={p?.name || "Product"} wide>
      {!p ? <Loading /> : <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-canvas p-3"><div className="kpi-label">In stock</div><div className={cx("text-2xl font-extrabold", p.state !== "OK" && "text-bad")}>{qty(p.stock)} <span className="text-sm text-muted">{p.unit}</span></div></div>
          <div className="rounded-xl bg-canvas p-3"><div className="kpi-label">Min stock</div><div className="text-2xl font-extrabold">{qty(p.minStock)}</div></div>
          <div className="rounded-xl bg-canvas p-3"><div className="kpi-label">Margin</div><div className="text-2xl font-extrabold text-ok">{can("cost.view") ? `${p.margin}%` : "—"}</div></div>
        </div>
        {p.reorderQty > 0 && <div className="rounded-xl bg-bad-50 text-bad font-semibold text-sm px-4 py-2.5">Low stock — reorder {p.reorderQty} {p.unit}</div>}
        <div className="text-sm text-muted">Sale {inr(p.saleRate)}{p.purchaseRate != null && ` · Buy ${inr(p.purchaseRate)}`} · GST {p.gstRate}% · HSN {p.hsn || "—"} · <span className="font-mono">{p.barcode}</span></div>
        {can("stock.adjust") && (dir ? (
          <div className="rounded-xl border border-line p-3 grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <Field label={`Stock ${dir === "IN" ? "in" : "out"} qty`}><input autoFocus className="input" value={n} onChange={(e) => setN(e.target.value.replace(/[^\d.]/g, ""))} /></Field>
            <Field label="Reason"><select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>{(dir === "IN" ? ["OPENING", "RETURN", "TRANSFER", "ADJUSTMENT"] : ["DAMAGE", "TRANSFER", "ADJUSTMENT"]).map((r) => <option key={r} value={r}>{REASON[r]}</option>)}</select></Field>
            <button className="btn-primary" disabled={!Number(n)} onClick={adjust}>Update</button>
          </div>
        ) : <div className="flex gap-2"><button className="btn-outline" onClick={() => { setDir("OUT"); setReason("DAMAGE"); }}>Stock out</button><button className="btn-primary" onClick={() => { setDir("IN"); setReason("OPENING"); }}>Stock in</button></div>)}
        <div>
          <div className="font-bold mb-2">Stock history</div>
          <div className="divide-y divide-line border border-line rounded-xl">
            {p.history.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div><div className="font-semibold">{REASON[m.reason]}{m.refNo ? ` · ${m.refNo}` : ""}</div><div className="text-xs text-muted">{dt(m.createdAt, { day: "2-digit", month: "short" })}, {tm(m.createdAt)}{m.note ? ` · ${m.note}` : ""}</div></div>
                <div className="text-right"><div className={cx("font-bold", m.qty > 0 ? "text-ok" : "text-bad")}>{m.qty > 0 ? "+" : "−"} {qty(Math.abs(m.qty))}</div><div className="text-xs text-muted">bal {qty(m.balanceAfter)}</div></div>
              </div>
            ))}
            {!p.history.length && <div className="px-4 py-6 text-sm text-muted text-center">No movement yet</div>}
          </div>
        </div>
      </div>}
    </Modal>
  );
}

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const read = async (file: File) => {
    setErr(null); setRes(null);
    try {
      let data: any[][];
      if (file.name.endsWith(".csv")) data = (await file.text()).split(/\r?\n/).filter(Boolean).map((l) => l.split(",").map((c) => c.replace(/^"|"$/g, "").trim()));
      else data = (await readSheet(file)) as unknown as any[][];
      const [head, ...body] = data;
      setRows(body.map((r) => Object.fromEntries(head.map((h: any, i: number) => [String(h), r[i]]))));
    } catch { setErr("Could not read file. Use .xlsx or .csv"); }
  };
  const go = async () => { setBusy(true); try { const r = await api("/products/import", { body: { rows } }); setRes(r); onDone(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={() => { setRows(null); setRes(null); onClose(); }} title="Import products from Excel"
      footer={!res && <button className="btn-primary" disabled={!rows?.length || busy} onClick={go}>Import {rows?.length || ""} products</button>}>
      <div className="space-y-3 text-sm">
        <p className="text-muted">Columns: <b>Name, Barcode, HSN, Category, Unit, Purchase, Sale, MRP, GST, Stock, Min</b>. Existing barcodes are updated.</p>
        <input type="file" accept=".xlsx,.csv" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} className="block w-full text-sm file:btn-outline file:mr-3" />
        {rows && !res && <div className="rounded-xl bg-canvas p-3">{rows.length} rows found. First: <b>{String(Object.values(rows[0] || {})[0] ?? "")}</b></div>}
        {res && <div className="rounded-xl bg-ok-50 text-ok p-3 font-semibold">Created {res.created}, updated {res.updated}.{res.errors.length > 0 && <div className="text-bad mt-2 font-normal">{res.errors.slice(0, 5).map((e: string) => <div key={e}>{e}</div>)}</div>}</div>}
        <ErrorBox error={err} />
      </div>
    </Modal>
  );
}
export default function Page() { return <Suspense fallback={<Loading />}><Inventory /></Suspense>; }
