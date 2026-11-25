"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { LogIn, Ban, Pencil, MessageCircle, Phone, ArrowLeft, CalendarPlus, ArrowUpCircle, Tag, FileText } from "lucide-react";
import { api, useApi, inr, dt, tm } from "@/lib/api";
import { useMe } from "@/lib/me";
import { Loading, Modal, Field, ErrorBox, Pill, Table, Seg, Toggle, cx, useToast } from "@/components/ui";
import { CustStatus, LinkResult } from "@/components/admin";

const CYCLE: Record<string, string> = { YEARLY: "Yearly", MONTHLY: "Monthly", TWO_YEAR: "2 years", LIFETIME: "Lifetime", TRIAL: "Trial" };

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const toast = useToast();
  const { data: c, reload } = useApi<any>(`/customers/${id}`);
  const { data: plansData } = useApi<any>("/plans");
  const [modal, setModal] = useState<null | "edit" | "extend" | "order" | "price">(null);
  const [link, setLink] = useState<any>(null);
  if (!c) return <Loading />;
  const sub = c.subscription;
  const isSuper = me.admin.role === "SUPER_ADMIN";
  const loginAs = async () => { const r = await api(`/customers/${id}/login-as`, { body: {} }); window.open(r.url, "_blank"); };
  const suspend = async () => { await api(`/customers/${id}/suspend`, { body: { suspend: c.status !== "SUSPENDED" } }); toast(c.status === "SUSPENDED" ? "Account re-activated" : "Account suspended"); reload(); };
  const autoRenew = async (on: boolean) => { await api(`/customers/${id}/autorenew`, { body: { on } }); reload(); };
  return (
    <div className="space-y-4">
      <Link href="/customers" className="btn-ghost btn-sm -ml-2"><ArrowLeft className="size-4" />Customers</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[26px] font-extrabold tracking-tight flex items-center gap-3">{c.name}<CustStatus status={c.status} daysLeft={c.daysLeft} /></h1>
          <p className="text-sm text-muted">Customer ID {c.code} · joined {dt(c.createdAt)}</p></div>
        <div className="flex gap-2">
          {isSuper && <button className="btn-outline" onClick={loginAs}><LogIn className="size-4" />Login as customer</button>}
          {isSuper && <button className={cx("btn-outline", c.status !== "SUSPENDED" && "text-bad")} onClick={suspend}><Ban className="size-4" />{c.status === "SUSPENDED" ? "Re-activate" : "Suspend"}</button>}
          <button className="btn-primary" onClick={() => setModal("edit")}><Pencil className="size-4" />Edit</button>
        </div>
      </div>
      <div className="grid xl:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="kpi-label mb-2">Business</div>
          <div className="font-bold text-lg">{c.business.name}</div>
          <div className="text-sm">{c.owner?.name} · +91 {c.owner?.phone}</div>
          {c.business.email && <div className="text-sm text-muted">{c.business.email}</div>}
          <div className="text-sm text-muted">{[c.business.address, c.business.city, c.business.state].filter(Boolean).join(", ")}</div>
          {c.business.gstin && <div className="text-sm font-semibold mt-1">GSTIN {c.business.gstin}</div>}
          <div className="flex gap-2 mt-4">
            {c.whatsapp && <a className="btn-wa btn-sm" href={c.whatsapp} target="_blank" rel="noreferrer"><MessageCircle className="size-3.5" />WhatsApp</a>}
            <a className="btn-outline btn-sm" href={`tel:+91${c.owner?.phone}`}><Phone className="size-3.5" />Call</a>
          </div>
        </div>
        <div className="card p-5">
          <div className="kpi-label mb-2">Current subscription</div>
          {sub ? <>
            <div className="flex items-center gap-2"><span className="font-bold text-lg">{c.plan?.name}</span><CustStatus status={c.status} daysLeft={c.daysLeft} /></div>
            <div className="text-sm text-muted">{CYCLE[sub.cycle]}{sub.cycle !== "TRIAL" && <> · auto-renew {sub.autoRenew ? "ON" : "OFF"}</>}</div>
            <div className="grid grid-cols-2 gap-y-1 text-sm mt-3">
              <span className="text-muted">Valid from</span><span className="font-semibold text-right">{dt(sub.startsAt)}</span>
              <span className="text-muted">Valid till</span><span className="font-semibold text-right">{sub.endsAt ? dt(sub.endsAt) : "Lifetime"}</span>
              <span className="text-muted">Users allowed</span><span className="font-semibold text-right">{sub.usersAllowed} (using {c.usage.users})</span>
              <span className="text-muted">Shops</span><span className="font-semibold text-right">{sub.shops}</span>
              <span className="text-muted">Sold by</span><span className="font-semibold text-right">{c.soldBy}</span>
            </div>
            {sub.cycle !== "TRIAL" && <div className="-mx-1"><Toggle label="Auto-renew (UPI Autopay / mandate)" on={sub.autoRenew} onChange={autoRenew} /></div>}
          </> : <div className="text-sm text-muted">No plan yet</div>}
          <div className="flex gap-2 mt-3">
            {isSuper && <button className="btn-outline btn-sm" onClick={() => setModal("extend")}><CalendarPlus className="size-3.5" />Extend</button>}
            <button className="btn-primary btn-sm" onClick={() => setModal("order")}><ArrowUpCircle className="size-3.5" />Renew / Upgrade</button>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex justify-between"><div className="kpi-label mb-2">Special price for this customer</div>{isSuper && <button className="text-brand text-xs font-bold" onClick={() => setModal("price")}>{c.customPrice ? "Edit" : "Set"}</button>}</div>
          {c.customPrice ? <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted">List price</span><span className="line-through text-muted">{inr(c.listPrice)} / {c.customPrice.cycle === "MONTHLY" ? "month" : "year"}</span></div>
            <div className="flex justify-between items-center"><span className="text-muted">Custom renewal price</span><span className="text-xl font-extrabold text-brand">{inr(c.customPrice.price)}</span></div>
            {c.customPrice.extraUserPrice && <div className="flex justify-between"><span className="text-muted">Extra user</span><span className="font-semibold">{inr(c.customPrice.extraUserPrice)} / user</span></div>}
            <div className="flex justify-between"><span className="text-muted">Valid till</span><span className="font-semibold">{c.customPrice.validTill ? dt(c.customPrice.validTill) : "Lifetime"}</span></div>
            {c.customPrice.reason && <div className="rounded-lg bg-canvas px-3 py-2 text-xs mt-2">Reason: {c.customPrice.reason}</div>}
          </div> : <div className="text-sm text-muted">Pays list price. Set a special price to auto-apply on renewals.</div>}
        </div>
      </div>
      <div className="grid xl:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="card overflow-hidden">
          <div className="flex justify-between p-4 border-b border-line"><div className="font-bold">Payment history</div><div className="text-xs text-muted">GST invoices</div></div>
          <Table>
            <thead><tr><th className="th">Date</th><th className="th">Description</th><th className="th">Payment ID</th><th className="th">Method</th><th className="th text-right">Amount</th><th className="th">Status</th><th className="th" /></tr></thead>
            <tbody>{c.payments.map((p: any) => (
              <tr key={p.id}><td className="td whitespace-nowrap">{dt(p.paidAt || p.createdAt)}</td><td className="td">{p.description}</td><td className="td font-mono text-xs">{p.gatewayPaymentId || "—"}</td>
                <td className="td text-sm">{p.gateway === "razorpay" ? `Razorpay · ${p.method || "—"}` : p.method || "—"}</td><td className="td text-right font-bold">{inr(p.amount)}</td>
                <td className="td">{p.amount === 0 ? <Pill status="TRIAL">Trial</Pill> : <Pill status={p.status}>{p.status === "CAPTURED" ? "Paid" : undefined}</Pill>}</td>
                <td className="td">{p.invoiceNo && <Link href={`/payments?invoice=${p.id}`} className="text-brand" title={p.invoiceNo}><FileText className="size-4" /></Link>}
                  {p.status === "CREATED" && p.linkUrl && <button className="text-brand text-xs font-bold" onClick={() => { navigator.clipboard.writeText(p.linkUrl); toast("Link copied"); }}>Copy link</button>}</td></tr>))}
            </tbody>
          </Table>
        </div>
        <div className="card p-5 space-y-3 text-sm">
          <div className="font-bold">Usage</div>
          <U k="Invoices this month" v={c.usage.invoicesThisMonth.toLocaleString("en-IN")} />
          <U k="Products" v={`${c.usage.products.toLocaleString("en-IN")} / ${c.usage.maxProducts.toLocaleString("en-IN")}`} pct={c.usage.products / (c.usage.maxProducts || 1)} />
          <U k="Users" v={`${c.usage.users} / ${c.usage.usersAllowed}`} pct={c.usage.users / (c.usage.usersAllowed || 1)} />
          <U k="Storage plan" v={`${c.usage.storageGb} GB`} />
          <div className="text-xs text-muted pt-1">Last login: {c.usage.lastLoginAt ? `${dt(c.usage.lastLoginAt, { day: "2-digit", month: "short" })} ${tm(c.usage.lastLoginAt)}` : "never"}{c.usage.lastLoginVia ? ` · ${c.usage.lastLoginVia === "android" ? "Android app" : "Web"}` : ""}</div>
        </div>
      </div>
      {modal === "edit" && <EditBiz c={c} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal === "extend" && <Extend id={id} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); toast("Validity extended"); }} />}
      {modal === "price" && plansData && <CustomPrice c={c} plans={plansData.plans} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); toast("Special price saved"); }} />}
      {modal === "order" && plansData && <Order c={c} plans={plansData.plans} onClose={() => setModal(null)} onDone={(l) => { setModal(null); setLink(l); reload(); }} />}
      <LinkResult data={link} onClose={() => setLink(null)} />
    </div>
  );
}
const U = ({ k, v, pct }: { k: string; v: string; pct?: number }) => (
  <div><div className="flex justify-between"><span className="text-muted">{k}</span><span className="font-semibold">{v}</span></div>
    {pct != null && <div className="h-1.5 bg-canvas rounded-full mt-1"><div className={cx("h-1.5 rounded-full", pct > 0.9 ? "bg-bad" : "bg-brand")} style={{ width: `${Math.min(100, pct * 100)}%` }} /></div>}</div>
);

function EditBiz({ c, onClose, onSaved }: any) {
  const [f, setF] = useState({ name: c.business.name, ownerName: c.business.ownerName || "", email: c.business.email || "", gstin: c.business.gstin || "", address: c.business.address || "", city: c.business.city || "" });
  const [err, setErr] = useState<string | null>(null);
  const save = async () => { try { await api(`/customers/${c.id}`, { method: "PUT", body: f }); onSaved(); } catch (e: any) { setErr(e.message); } };
  return (
    <Modal open onClose={onClose} title="Edit customer" footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
      <div className="grid grid-cols-2 gap-3">
        {(Object.keys(f) as (keyof typeof f)[]).map((k) => <Field key={k} label={k === "ownerName" ? "Owner name" : k[0].toUpperCase() + k.slice(1)} className={k === "address" ? "col-span-2" : ""}>
          <input className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
      </div>
      <div className="mt-3"><ErrorBox error={err} /></div>
    </Modal>
  );
}
function Extend({ id, onClose, onSaved }: any) {
  const [days, setDays] = useState("30");
  return (
    <Modal open onClose={onClose} title="Extend validity" footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={async () => { await api(`/customers/${id}/extend`, { body: { days: Number(days) } }); onSaved(); }}>Extend</button></>}>
      <div className="flex gap-2 mb-3">{["7", "15", "30", "90", "365"].map((d) => <button key={d} className="chip" data-on={days === d} onClick={() => setDays(d)}>{d} days</button>)}</div>
      <Field label="Days"><input className="input" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} /></Field>
      <p className="text-xs text-muted mt-2">Free extension (no payment). Use for goodwill, support delays or partner deals.</p>
    </Modal>
  );
}
function CustomPrice({ c, plans, onClose, onSaved }: any) {
  const [f, setF] = useState({ planId: c.customPrice?.planId || c.plan?.id || plans[0].id, cycle: c.customPrice?.cycle || "YEARLY", price: String(c.customPrice?.price ?? c.price ?? ""), extraUserPrice: String(c.customPrice?.extraUserPrice ?? ""), validTill: c.customPrice?.validTill?.slice(0, 10) || "", reason: c.customPrice?.reason || "" });
  const [err, setErr] = useState<string | null>(null);
  const plan = plans.find((p: any) => p.id === f.planId);
  const list = f.cycle === "MONTHLY" ? plan?.monthlyPrice : plan?.yearlyPrice;
  const save = async () => { try { await api(`/customers/${c.id}/custom-price`, { method: "PUT", body: { ...f, price: Number(f.price), extraUserPrice: f.extraUserPrice ? Number(f.extraUserPrice) : null, validTill: f.validTill || null } }); onSaved(); } catch (e: any) { setErr(e.message); } };
  const remove = async () => { await api(`/customers/${c.id}/custom-price`, { method: "DELETE" }); onSaved(); };
  return (
    <Modal open onClose={onClose} title="Special price for this customer" footer={<>{c.customPrice && <button className="btn-ghost text-bad mr-auto" onClick={remove}>Remove</button>}<button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}><Tag className="size-4" />Save price</button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Plan"><select className="input" value={f.planId} onChange={(e) => setF({ ...f, planId: e.target.value })}>{plans.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Cycle"><select className="input" value={f.cycle} onChange={(e) => setF({ ...f, cycle: e.target.value })}><option value="YEARLY">Yearly</option><option value="MONTHLY">Monthly</option></select></Field>
        <Field label={`Price (list ${inr(list)})`}><input className="input font-bold" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
        <Field label="Extra user price"><input className="input" value={f.extraUserPrice} onChange={(e) => setF({ ...f, extraUserPrice: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
        <Field label="Valid till" hint="Empty = lifetime"><input type="date" className="input" value={f.validTill} onChange={(e) => setF({ ...f, validTill: e.target.value })} /></Field>
        <Field label="Reason"><input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Early customer" /></Field>
      </div>
      <div className="mt-3"><ErrorBox error={err} /></div>
    </Modal>
  );
}
function Order({ c, plans, onClose, onDone }: any) {
  const [planId, setPlanId] = useState(c.plan?.id || plans[1]?.id);
  const [cycle, setCycle] = useState(c.cycle && c.cycle !== "TRIAL" ? c.cycle : "YEARLY");
  const [method, setMethod] = useState("LINK");
  const plan = plans.find((p: any) => p.id === planId);
  const custom = c.customPrice && c.customPrice.planId === planId && c.customPrice.cycle === cycle ? c.customPrice.price : null;
  const list = cycle === "MONTHLY" ? plan?.monthlyPrice : plan?.yearlyPrice;
  const [price, setPrice] = useState<string>("");
  const eff = price ? Number(price) : custom ?? list;
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    try { onDone(await api(`/customers/${c.id}/order`, { body: { planId, cycle, price: price ? Number(price) : undefined, purpose: planId === c.plan?.id ? "RENEWAL" : "UPGRADE", method } })); }
    catch (e: any) { setErr(e.message); }
  };
  return (
    <Modal open onClose={onClose} title="Renew / upgrade" footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={go}>{method === "LINK" || method === "UPI_QR" ? "Create payment link" : "Record payment"}</button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">{plans.map((p: any) => (
          <button key={p.id} onClick={() => setPlanId(p.id)} className={cx("rounded-xl border-2 p-3 text-left", planId === p.id ? "border-brand bg-brand-50/50" : "border-line")}>
            <div className="text-xs font-bold">{p.name}</div><div className="text-brand font-extrabold">{inr(cycle === "MONTHLY" ? p.monthlyPrice : p.yearlyPrice)}</div></button>))}</div>
        <Seg value={cycle} onChange={setCycle} options={[{ value: "MONTHLY", label: "Monthly" }, { value: "YEARLY", label: "Yearly" }, { value: "TWO_YEAR", label: "2 years" }, { value: "LIFETIME", label: "Lifetime" }]} />
        <Field label={`Price excl. GST${custom != null ? " · special price applied" : ""}`}><input className="input font-bold" placeholder={String(eff)} value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} /></Field>
        <div className="rounded-xl bg-canvas p-3 text-sm flex justify-between"><span>Customer pays (incl. 18% GST)</span><b>{inr(Math.round(eff * 1.18))}</b></div>
        <Field label="Collect via"><div className="grid grid-cols-4 gap-1.5">{[["LINK", "Payment link"], ["UPI_QR", "UPI QR"], ["CASH", "Cash"], ["BANK", "Bank"]].map(([k, l]) => <button key={k} className={cx("h-9 rounded-full text-xs font-semibold border", method === k ? "bg-brand text-white border-brand" : "border-line text-muted")} onClick={() => setMethod(k)}>{l}</button>)}</div></Field>
        <ErrorBox error={err} />
      </div>
    </Modal>
  );
}
