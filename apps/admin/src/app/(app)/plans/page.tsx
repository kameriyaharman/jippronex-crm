"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Minus, Plus, Pencil, Ticket } from "lucide-react";
import { api, useApi, inr } from "@/lib/api";
import { useMe } from "@/lib/me";
import { PageHeader, Loading, Table, Modal, Field, ErrorBox, Toggle, Pill, cx, useToast } from "@/components/ui";

const FEATURES: [string, string][] = [["billing", "GST & non-GST billing"], ["whatsapp", "Invoice on WhatsApp / PDF"], ["ledger", "Customers & ledger"], ["inventory", "Inventory & barcode"], ["purchase", "Purchase & suppliers"], ["accounts", "Accounts, P&L, GST reports"], ["android", "Android app"]];

export default function Plans() {
  const me = useMe();
  const toast = useToast();
  const { data, reload } = useApi<any>("/plans");
  const [plan, setPlan] = useState<any>(null);
  const [coupon, setCoupon] = useState<any>(null);
  if (!data) return <Loading />;
  const isSuper = me.admin.role === "SUPER_ADMIN";
  const toggleCoupon = async (c: any) => { await api(`/coupons/${c.id}`, { method: "PUT", body: { active: !c.active } }); reload(); toast(c.active ? "Coupon paused" : "Coupon active"); };
  return (
    <div className="space-y-4">
      <PageHeader title="Plans & Pricing" sub="Set list prices, features, coupons and customer-specific prices">
        {isSuper && <><button className="btn-outline" onClick={() => setCoupon({})}><Ticket className="size-4" />New coupon</button><button className="btn-primary" onClick={() => setPlan({ features: {} })}><Plus className="size-4" />New plan</button></>}
      </PageHeader>
      <div className="grid md:grid-cols-3 gap-4">{data.plans.map((p: any) => (
        <div key={p.id} className={cx("card p-5", !p.active && "opacity-60")}>
          <div className="flex justify-between"><div className="font-extrabold text-lg">{p.name}</div>{isSuper && <button className="btn-ghost btn-sm" onClick={() => setPlan(p)}><Pencil className="size-3.5" /></button>}</div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="rounded-xl bg-canvas p-3"><div className="kpi-label">Monthly</div><div className="text-xl font-extrabold">{inr(p.monthlyPrice)}</div></div>
            <div className="rounded-xl bg-brand-50 p-3"><div className="kpi-label">Yearly</div><div className="text-xl font-extrabold text-brand">{inr(p.yearlyPrice)}</div></div>
          </div>
          <div className="text-sm text-muted mt-3">{p.activeCustomers} active customers · trial {p.trialDays} days</div>
        </div>))}
      </div>
      <div className="card overflow-hidden">
        <div className="font-bold p-4 border-b border-line">Features by plan</div>
        <Table>
          <thead><tr><th className="th">Feature</th>{data.plans.map((p: any) => <th key={p.id} className="th text-center">{p.name}</th>)}</tr></thead>
          <tbody>
            {FEATURES.map(([k, l]) => <tr key={k}><td className="td">{l}</td>{data.plans.map((p: any) => <td key={p.id} className="td text-center">{p.features[k] ? <Check className="size-4 text-ok mx-auto" /> : <Minus className="size-4 text-faint mx-auto" />}</td>)}</tr>)}
            <tr><td className="td">Users included</td>{data.plans.map((p: any) => <td key={p.id} className="td text-center font-bold">{p.usersIncluded}</td>)}</tr>
          </tbody>
        </Table>
      </div>
      <div className="grid xl:grid-cols-2 gap-4 items-start">
        <div className="card overflow-hidden">
          <div className="flex justify-between p-4 border-b border-line"><div className="font-bold">Customer-specific prices</div><div className="text-xs text-muted">{data.customPrices.length} customers</div></div>
          <Table>
            <thead><tr><th className="th">Customer</th><th className="th">Plan</th><th className="th text-right">List</th><th className="th text-right">Their price</th></tr></thead>
            <tbody>{data.customPrices.map((c: any) => (
              <tr key={c.businessId}><td className="td"><Link href={`/customers/${c.businessId}`} className="font-semibold hover:text-brand">{c.name}</Link><div className="text-xs text-muted">by {c.soldBy}</div></td>
                <td className="td text-sm">{c.plan}</td><td className="td text-right text-muted line-through">{inr(c.listPrice)}</td><td className="td text-right font-bold text-brand">{inr(c.price)}</td></tr>))}
            </tbody>
          </Table>
        </div>
        <div className="card overflow-hidden">
          <div className="font-bold p-4 border-b border-line">Coupons</div>
          <Table>
            <thead><tr><th className="th">Code</th><th className="th">Offer</th><th className="th">Used</th><th className="th">Status</th></tr></thead>
            <tbody>{data.coupons.map((c: any) => (
              <tr key={c.id}><td className="td font-mono font-bold">{c.code}</td>
                <td className="td"><div className="text-sm font-semibold">{c.description || (c.type === "PERCENT" ? `${c.value}% off` : `${inr(c.value)} off`)}</div><div className="text-xs text-muted">{c.planCodes.length ? c.planCodes.join(", ") : "All plans"}{c.partnersOnly ? " · partners only" : ""}</div></td>
                <td className="td text-sm">{c.used} / {c.maxUses ?? "∞"}</td>
                <td className="td">{isSuper ? <button onClick={() => toggleCoupon(c)}><Pill status={c.active ? "ACTIVE" : "DISABLED"}>{c.active ? "Active" : "Paused"}</Pill></button> : <Pill status={c.active ? "ACTIVE" : "DISABLED"} />}</td></tr>))}
            </tbody>
          </Table>
        </div>
      </div>
      {plan && <PlanForm plan={plan} onClose={() => setPlan(null)} onSaved={() => { setPlan(null); reload(); toast("Plan saved"); }} />}
      {coupon && <CouponForm plans={data.plans} onClose={() => setCoupon(null)} onSaved={() => { setCoupon(null); reload(); toast("Coupon created"); }} />}
    </div>
  );
}

function PlanForm({ plan, onClose, onSaved }: any) {
  const [f, setF] = useState<any>({ code: "", name: "", tagline: "", monthlyPrice: "", yearlyPrice: "", usersIncluded: 1, maxProducts: 5000, storageGb: 5, trialDays: 7, sortOrder: 9, active: true, ...plan });
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    const body = { ...f, monthlyPrice: Number(f.monthlyPrice), yearlyPrice: Number(f.yearlyPrice), usersIncluded: Number(f.usersIncluded), maxProducts: Number(f.maxProducts), storageGb: Number(f.storageGb), trialDays: Number(f.trialDays), sortOrder: Number(f.sortOrder),
      twoYearPrice: f.twoYearPrice ? Number(f.twoYearPrice) : null, lifetimePrice: f.lifetimePrice ? Number(f.lifetimePrice) : null };
    for (const k of ["id", "createdAt", "activeCustomers"]) delete body[k];
    try { if (plan.id) await api(`/plans/${plan.id}`, { method: "PUT", body }); else await api("/plans", { body }); onSaved(); } catch (e: any) { setErr(e.message); }
  };
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title={plan.id ? `Edit ${plan.name}` : "New plan"} wide footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Save plan</button></>}>
      <div className="grid md:grid-cols-4 gap-3">
        <Field label="Code"><input className="input uppercase" disabled={!!plan.id} value={f.code} onChange={set("code")} /></Field>
        <Field label="Name" className="md:col-span-3"><input className="input" value={f.name} onChange={set("name")} /></Field>
        <Field label="Tagline" className="md:col-span-4"><input className="input" value={f.tagline || ""} onChange={set("tagline")} /></Field>
        <Field label="Monthly ₹"><input className="input" value={f.monthlyPrice} onChange={set("monthlyPrice")} /></Field>
        <Field label="Yearly ₹"><input className="input" value={f.yearlyPrice} onChange={set("yearlyPrice")} /></Field>
        <Field label="2 years ₹"><input className="input" value={f.twoYearPrice ?? ""} onChange={set("twoYearPrice")} placeholder="2× yearly" /></Field>
        <Field label="Lifetime ₹"><input className="input" value={f.lifetimePrice ?? ""} onChange={set("lifetimePrice")} placeholder="4× yearly" /></Field>
        <Field label="Users"><input className="input" value={f.usersIncluded} onChange={set("usersIncluded")} /></Field>
        <Field label="Max products"><input className="input" value={f.maxProducts} onChange={set("maxProducts")} /></Field>
        <Field label="Storage GB"><input className="input" value={f.storageGb} onChange={set("storageGb")} /></Field>
        <Field label="Trial days"><input className="input" value={f.trialDays} onChange={set("trialDays")} /></Field>
      </div>
      <div className="grid md:grid-cols-2 gap-x-6 mt-3 divide-y divide-line">{FEATURES.map(([k, l]) => <Toggle key={k} label={l} on={!!f.features[k]} onChange={(v) => setF({ ...f, features: { ...f.features, [k]: v } })} />)}
        <Toggle label="Plan active (shown to customers)" on={f.active} onChange={(v) => setF({ ...f, active: v })} /></div>
      <div className="mt-3"><ErrorBox error={err} /></div>
    </Modal>
  );
}
function CouponForm({ plans, onClose, onSaved }: any) {
  const [f, setF] = useState<any>({ code: "", description: "", type: "PERCENT", value: "", maxUses: "", partnersOnly: false, planCodes: [], validTill: "" });
  const [err, setErr] = useState<string | null>(null);
  const save = async () => { try { await api("/coupons", { body: { ...f, value: Number(f.value), maxUses: f.maxUses ? Number(f.maxUses) : null, validTill: f.validTill || null } }); onSaved(); } catch (e: any) { setErr(e.message); } };
  return (
    <Modal open onClose={onClose} title="New coupon" footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Create</button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code"><input className="input uppercase font-mono" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
        <Field label="Type"><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="PERCENT">% off</option><option value="FLAT">₹ off</option></select></Field>
        <Field label="Value"><input className="input" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
        <Field label="Max uses"><input className="input" value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: e.target.value })} placeholder="Unlimited" /></Field>
        <Field label="Description" className="col-span-2"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="20% off first year" /></Field>
        <Field label="Valid till"><input type="date" className="input" value={f.validTill} onChange={(e) => setF({ ...f, validTill: e.target.value })} /></Field>
        <Field label="Plans"><div className="flex flex-wrap gap-1">{plans.map((p: any) => <button key={p.code} type="button" className="chip h-7 text-xs" data-on={f.planCodes.includes(p.code)} onClick={() => setF({ ...f, planCodes: f.planCodes.includes(p.code) ? f.planCodes.filter((x: string) => x !== p.code) : [...f.planCodes, p.code] })}>{p.name.split(" ")[0]}</button>)}</div></Field>
      </div>
      <Toggle label="Partners only" on={f.partnersOnly} onChange={(v) => setF({ ...f, partnersOnly: v })} />
      <ErrorBox error={err} />
    </Modal>
  );
}
