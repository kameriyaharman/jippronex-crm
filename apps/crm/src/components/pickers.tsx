"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ScanBarcode, User, Plus, Check } from "lucide-react";
import { api, inr } from "@/lib/api";
import { Modal, Field, ErrorBox, cx, useToast } from "./ui";

export type Party = { id: string; name: string; type: "CUSTOMER" | "SUPPLIER"; phone?: string; gstin?: string | null; stateCode?: string | null; balance: number; creditLimit?: number | null };
export type Product = { id: string; name: string; barcode?: string | null; hsn?: string | null; unit: string; saleRate: number; purchaseRate?: number; gstRate: number; stock: number; mrp?: number | null };

export function PartyPicker({ type, value, onChange, allowWalkIn }: { type: "CUSTOMER" | "SUPPLIER"; value: Party | null; onChange: (p: Party | null) => void; allowWalkIn?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Party[]>([]);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => api(`/parties?type=${type}&q=${encodeURIComponent(q)}`).then((r) => setList(r.rows.filter((p: Party) => p.name !== "Walk-in customers"))), 150);
    return () => clearTimeout(t);
  }, [q, open, type]);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="input flex items-center gap-2 text-left">
        <User className="size-4 text-muted shrink-0" />
        <span className={cx("flex-1 truncate font-semibold", !value && !allowWalkIn && "text-faint font-normal")}>{value ? value.name : allowWalkIn ? "Walk-in customer" : `Select ${type === "CUSTOMER" ? "customer" : "supplier"}`}</span>
        {value?.gstin && <span className="text-[10px] font-bold text-ok">GST ✓</span>}
      </button>
      {open && (
        <div className="absolute z-30 top-full mt-1 left-0 w-[340px] card shadow-2xl p-2">
          <input autoFocus className="input mb-2" placeholder="Search name / phone / GSTIN" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-72 overflow-y-auto">
            {allowWalkIn && <button type="button" className="w-full text-left px-3 py-2 rounded-lg hover:bg-canvas text-sm font-semibold" onClick={() => { onChange(null); setOpen(false); }}>Walk-in customer (cash)</button>}
            {list.map((p) => (
              <button type="button" key={p.id} className="w-full text-left px-3 py-2 rounded-lg hover:bg-canvas flex items-center gap-2" onClick={() => { onChange(p); setOpen(false); }}>
                <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{p.name}</div><div className="text-xs text-muted">{p.phone || ""} {p.gstin ? "· " + p.gstin : ""}</div></div>
                <div className={cx("text-xs font-bold", p.balance > 0 ? "text-bad" : p.balance < 0 ? "text-warn" : "text-muted")}>{inr(Math.abs(p.balance))}</div>
                {value?.id === p.id && <Check className="size-4 text-brand" />}
              </button>
            ))}
          </div>
          <button type="button" className="btn-ghost w-full mt-1 text-brand" onClick={() => { setAdding(true); setOpen(false); }}><Plus className="size-4" />Add new {type === "CUSTOMER" ? "customer" : "supplier"}</button>
        </div>
      )}
      <PartyForm open={adding} type={type} initialName={q} onClose={() => setAdding(false)} onSaved={(p) => { onChange(p); setAdding(false); }} />
    </div>
  );
}

export function PartyForm({ open, type, onClose, onSaved, initialName = "", party }: { open: boolean; type: "CUSTOMER" | "SUPPLIER"; onClose: () => void; onSaved: (p: Party) => void; initialName?: string; party?: any }) {
  const toast = useToast();
  const blank = { name: initialName, phone: "", gstin: "", address: "", city: "", creditLimit: "", openingBalance: "", openingType: type === "CUSTOMER" ? "RECEIVE" : "PAY", shipToAddress: "" };
  const [f, setF] = useState<any>(blank);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) setF(party ? { ...blank, ...party, creditLimit: party.creditLimit ?? "" } : { ...blank, name: initialName }); setErr(null); }, [open]); // eslint-disable-line
  const save = async () => {
    try {
      const body = { type, name: f.name, phone: f.phone || null, gstin: f.gstin || null, address: f.address || null, city: f.city || null, shipToAddress: f.shipToAddress || null,
        creditLimit: f.creditLimit ? Number(f.creditLimit) : null, ...(party ? {} : { openingBalance: Number(f.openingBalance || 0), openingType: f.openingType }) };
      const p = party ? await api(`/parties/${party.id}`, { method: "PUT", body }) : await api("/parties", { body });
      toast(party ? "Party updated" : "Party added");
      onSaved(p);
    } catch (e: any) { setErr(e.message); }
  };
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open={open} onClose={onClose} title={party ? "Edit party" : `Add ${type === "CUSTOMER" ? "customer" : "supplier"}`}
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={!f.name}>Save</button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" className="col-span-2"><input autoFocus className="input" value={f.name} onChange={set("name")} /></Field>
        <Field label="Mobile"><input className="input" inputMode="numeric" value={f.phone || ""} onChange={set("phone")} /></Field>
        <Field label="GSTIN"><input className="input uppercase" maxLength={15} value={f.gstin || ""} onChange={set("gstin")} /></Field>
        <Field label="Address" className="col-span-2"><input className="input" value={f.address || ""} onChange={set("address")} /></Field>
        <Field label="City"><input className="input" value={f.city || ""} onChange={set("city")} /></Field>
        {type === "CUSTOMER" && <Field label="Credit limit (₹)"><input className="input" inputMode="decimal" value={f.creditLimit} onChange={set("creditLimit")} /></Field>}
        {type === "CUSTOMER" && <Field label="Ship-to address" className="col-span-2"><input className="input" value={f.shipToAddress || ""} onChange={set("shipToAddress")} /></Field>}
        {!party && <>
          <Field label="Opening balance (₹)"><input className="input" inputMode="decimal" value={f.openingBalance} onChange={set("openingBalance")} /></Field>
          <Field label="Type"><select className="input" value={f.openingType} onChange={set("openingType")}><option value="RECEIVE">To receive (Dr)</option><option value="PAY">To pay (Cr)</option></select></Field>
        </>}
      </div>
      <div className="mt-3"><ErrorBox error={err} /></div>
    </Modal>
  );
}

export type ProductSearchHandle = { focus: () => void };
/** Scan barcode (Enter) or type to search. */
export const ProductSearch = forwardRef<ProductSearchHandle, { onPick: (p: Product) => void; placeholder?: string }>(function ProductSearch({ onPick, placeholder }, ref) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [list, setList] = useState<Product[]>([]);
  const [idx, setIdx] = useState(0);
  const inp = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => inp.current?.focus() }));
  useEffect(() => {
    if (!q.trim() || /^\d{8,14}$/.test(q.trim())) { setList([]); return; }
    const t = setTimeout(() => api(`/products?q=${encodeURIComponent(q.trim())}&limit=8`).then((r) => { setList(r); setIdx(0); }), 120);
    return () => clearTimeout(t);
  }, [q]);
  const pick = (p: Product) => { onPick(p); setQ(""); setList([]); inp.current?.focus(); };
  const enter = async () => {
    const s = q.trim();
    if (!s) return;
    if (list[idx]) return pick(list[idx]);
    try { pick(await api(`/products/barcode/${encodeURIComponent(s)}`)); }
    catch { toast(`No product found for “${s}”`, "bad"); setQ(""); }
  };
  return (
    <div className="relative flex-1">
      <ScanBarcode className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand" />
      <input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder || "Scan barcode or type product name…"}
        className="input pl-9 border-brand/60 ring-4 ring-brand/5"
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); enter(); }
          if (e.key === "ArrowDown") { e.preventDefault(); setIdx(Math.min(idx + 1, list.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setIdx(Math.max(idx - 1, 0)); }
          if (e.key === "Escape") setList([]);
        }} />
      {list.length > 0 && (
        <div className="absolute z-30 top-full mt-1 left-0 right-0 card shadow-2xl py-1.5">
          {list.map((p, i) => (
            <button type="button" key={p.id} onMouseDown={(e) => { e.preventDefault(); pick(p); }} onMouseEnter={() => setIdx(i)}
              className={cx("w-full text-left px-4 py-2 flex items-center gap-3", i === idx && "bg-brand-50")}>
              <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{p.name}</div><div className="text-xs text-muted font-mono">{p.barcode} · HSN {p.hsn || "-"} · GST {p.gstRate}%</div></div>
              <div className="text-right"><div className="text-sm font-bold">{inr(p.saleRate)}</div><div className={cx("text-xs", p.stock <= 0 ? "text-bad" : "text-muted")}>Stock {p.stock}</div></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
