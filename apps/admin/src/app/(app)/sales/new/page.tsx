"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import { api, useApi, inr, inr2 } from "@/lib/api";
import { useMe } from "@/lib/me";
import { PageHeader, Field, ErrorBox, Loading, cx, useToast } from "@/components/ui";
import { LinkResult } from "@/components/admin";

const CYCLES: [string, string][] = [["MONTHLY", "Monthly"], ["YEARLY", "Yearly"], ["TWO_YEAR", "2 years"], ["LIFETIME", "Lifetime"]];
const priceFor = (p: any, c: string) => (c === "MONTHLY" ? p.monthlyPrice : c === "YEARLY" ? p.yearlyPrice : c === "TWO_YEAR" ? p.twoYearPrice ?? p.yearlyPrice * 2 : p.lifetimePrice ?? p.yearlyPrice * 4);

export default function NewSale() {
  const router = useRouter();
  const toast = useToast();
  const me = useMe();
  const { data: pd } = useApi<any>("/plans");
  const { data: team } = useApi<any>(me.admin.role === "SUPER_ADMIN" ? "/sellers" : null);
  const [c, setC] = useState({ businessName: "", ownerName: "", phone: "", email: "", gstin: "", city: "" });
  const [planId, setPlanId] = useState("");
  const [cycle, setCycle] = useState("YEARLY");
  const [mode, setMode] = useState<"LIST" | "COUPON" | "CUSTOM" | "PERCENT">("CUSTOM");
  const [custom, setCustom] = useState("");
  const [percent, setPercent] = useState("");
  const [coupon, setCoupon] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [method, setMethod] = useState("LINK");
  const [q, setQ] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  useEffect(() => { if (pd && !planId) setPlanId(pd.plans[pd.plans.length - 1].id); }, [pd, planId]);
  useEffect(() => { if (me.admin.sellerId) setSellerId(me.admin.sellerId); }, [me]);
  const body = { ...c, planId, cycle, priceMode: mode, customPrice: custom ? Number(custom) : undefined, percent: percent ? Number(percent) : undefined, coupon: coupon || undefined, sellerId: sellerId || null, method };
  useEffect(() => {
    if (!planId) return;
    const t = setTimeout(() => api("/sales/quote", { body }).then((r) => { setQ(r); setErr(null); }).catch((e) => setErr(e.message)), 250);
    return () => clearTimeout(t);
  }, [planId, cycle, mode, custom, percent, coupon, sellerId]); // eslint-disable-line
  const submit = async (trial: boolean) => {
    setErr(null); setBusy(true);
    try {
      const r = await api("/sales", { body: { ...body, trial } });
      if (trial) { toast(`${r.business.name} — 7-day trial started`); router.push(`/customers/${r.business.id}`); return; }
      setResult({ ...r, businessId: r.business.id });
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  if (!pd) return <Loading />;
  const set = (k: keyof typeof c) => (e: any) => setC({ ...c, [k]: e.target.value });
  const valid = c.businessName && c.ownerName && c.phone.replace(/\D/g, "").length >= 10;
  return (
    <div>
      <PageHeader title="New Sale" sub="Sell a subscription — set any price for this customer, collect via payment link">
        <button className="btn-outline" disabled={!valid || busy} onClick={() => submit(true)}>Save as trial</button>
        <button className="btn-primary" disabled={!valid || busy} onClick={() => submit(false)}><Link2 className="size-4" />{method === "CASH" || method === "BANK" ? "Record sale" : "Create & send payment link"}</button>
      </PageHeader>
      <ErrorBox error={err} />
      <div className="grid xl:grid-cols-[1fr_440px] gap-4 items-start mt-3">
        <div className="space-y-4">
          <div className="card p-5">
            <div className="font-bold mb-4">1 · Customer</div>
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Business name"><input className="input" value={c.businessName} onChange={set("businessName")} placeholder="Bansal Electricals" /></Field>
              <Field label="Owner name"><input className="input" value={c.ownerName} onChange={set("ownerName")} placeholder="Vikas Bansal" /></Field>
              <Field label="Mobile (login ID)"><input className="input" inputMode="numeric" value={c.phone} onChange={set("phone")} placeholder="+91 94340 22118" /></Field>
              <Field label="Email"><input className="input" value={c.email} onChange={set("email")} /></Field>
              <Field label="GSTIN"><input className="input uppercase" maxLength={15} value={c.gstin} onChange={set("gstin")} /></Field>
              <Field label="City"><input className="input" value={c.city} onChange={set("city")} placeholder="Durgapur" /></Field>
            </div>
          </div>
          <div className="card p-5">
            <div className="font-bold mb-4">2 · Plan</div>
            <div className="grid md:grid-cols-3 gap-3">{pd.plans.map((p: any) => (
              <button key={p.id} onClick={() => setPlanId(p.id)} className={cx("rounded-2xl border-2 p-4 text-left transition", planId === p.id ? "border-brand bg-brand-50/50" : "border-line hover:border-brand-300")}>
                <div className="font-bold text-sm">{p.name}</div>
                <div className="text-xl font-extrabold text-brand mt-1">{inr(priceFor(p, cycle))}<span className="text-xs text-muted font-semibold">/{cycle === "MONTHLY" ? "mo" : cycle === "YEARLY" ? "yr" : cycle === "TWO_YEAR" ? "2 yr" : "life"}</span></div>
                <div className="text-xs text-muted">{p.usersIncluded} user{p.usersIncluded > 1 ? "s" : ""} · {p.features.accounts ? "accounts" : p.features.inventory ? "stock" : "billing"}</div>
              </button>))}</div>
            <div className="flex gap-1.5 mt-4">{CYCLES.map(([k, l]) => <button key={k} className="chip" data-on={cycle === k} onClick={() => setCycle(k)}>{l}</button>)}</div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-5 space-y-3">
            <div className="font-bold">3 · Price for this customer</div>
            <div className="flex justify-between text-sm"><span className="text-muted">List price</span><span className="font-bold">{inr(q?.list)}</span></div>
            {mode === "CUSTOM" && <Field label="Selling price"><input className="input h-12 text-xl font-extrabold border-brand ring-4 ring-brand/10" value={custom} placeholder={String(q?.list ?? "")} onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))} /></Field>}
            {mode === "PERCENT" && <Field label="Discount %"><input className="input h-12 text-xl font-extrabold" value={percent} onChange={(e) => setPercent(e.target.value.replace(/[^\d.]/g, ""))} /></Field>}
            {mode === "COUPON" && <Field label="Coupon code"><input className="input h-12 text-xl font-extrabold uppercase" value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="WELCOME20" /></Field>}
            <div className="flex gap-1.5">{([["LIST", "List price"], ["COUPON", "Coupon"], ["CUSTOM", "Custom price"], ["PERCENT", "% discount"]] as const).map(([k, l]) => <button key={k} className="chip" data-on={mode === k} onClick={() => setMode(k)}>{l}</button>)}</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sold by">{me.admin.role === "SUPER_ADMIN" ? <select className="input" value={sellerId} onChange={(e) => setSellerId(e.target.value)}><option value="">Direct · Website</option>{team?.sellers.filter((s: any) => s.active).map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.type === "PARTNER" ? "partner" : "sales"})</option>)}</select>
                : <div className="input flex items-center">{me.admin.name}</div>}</Field>
              <Field label="Commission"><div className="input flex items-center text-muted">{q ? `${q.commissionPct}% · ${inr(q.commission)}` : "—"}</div></Field>
            </div>
            {q && <div className="rounded-xl bg-canvas p-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted">Price</span><span className="font-semibold">₹{inr2(q.price)}</span></div>
              {q.discount > 0 && <div className="flex justify-between"><span className="text-muted">Discount (−{q.discountPct}%)</span><span className="font-semibold">− {inr(q.discount)}</span></div>}
              <div className="flex justify-between"><span className="text-muted">GST 18%</span><span className="font-semibold">₹{inr2(q.gst)}</span></div>
              <div className="flex justify-between border-t border-line pt-2 mt-1"><span className="font-bold">Customer pays</span><span className="text-xl font-extrabold text-brand">{inr(q.total)}</span></div>
            </div>}
          </div>
          <div className="card p-5 space-y-3">
            <div className="font-bold">4 · Collect payment</div>
            <div className="grid grid-cols-2 gap-2">{[["LINK", "Payment link"], ["UPI_QR", "UPI QR"], ["CASH", "Cash / cheque"], ["BANK", "Bank transfer"]].map(([k, l]) => (
              <button key={k} onClick={() => setMethod(k)} className={cx("h-9 rounded-full text-sm font-semibold border", method === k ? "bg-brand text-white border-brand" : "border-line text-muted")}>{l}</button>))}</div>
            <p className="text-xs text-muted">{method === "CASH" || method === "BANK" ? "Account activates now; payment shows as “To deposit” until marked received." : "Account activates automatically when payment is received."}</p>
          </div>
        </div>
      </div>
      <LinkResult data={result} onClose={() => { const id = result?.businessId; setResult(null); if (id) router.push(`/customers/${id}`); }} />
    </div>
  );
}
