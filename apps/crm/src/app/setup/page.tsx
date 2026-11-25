"use client";
import { useEffect, useState } from "react";
import { api, auth, inr, API_URL } from "@/lib/api";
import { Logo, ErrorBox, Field, Seg, Spinner, cx } from "@/components/ui";
import { Check } from "lucide-react";

const TYPES = ["Retail / Wholesale — Grocery", "Retail — Medical / Pharmacy", "Electronics & Mobile", "Hardware & Electricals", "Garments & Footwear", "Auto parts", "Distributor / Agency", "Other"];

export default function Setup() {
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ name: "", ownerName: "", gstin: "", businessType: TYPES[0], address: "", city: "" });
  const [plans, setPlans] = useState<any[]>([]);
  const [plan, setPlan] = useState("BILLING_INV");
  const [cycle, setCycle] = useState<"YEARLY" | "MONTHLY">("YEARLY");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!auth.token()) location.href = "/login"; fetch(`${API_URL}/public/plans`).then((r) => r.json()).then(setPlans).catch(() => {}); }, []);
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });

  const create = async (pay: boolean) => {
    setErr(null); setBusy(true);
    try {
      const r = await api("/auth/business", { body: { ...f, gstin: f.gstin || undefined, planCode: plan } });
      auth.setBusiness(r.business.id);
      if (pay) {
        const p = await api("/settings/subscribe", { body: { planCode: plan, cycle } });
        window.open(p.url, "_blank");
      }
      location.href = "/dashboard";
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  const sel = plans.find((p) => p.code === plan);

  return (
    <div className="min-h-screen flex items-start justify-center p-6 md:p-12">
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-between mb-8"><Logo /><span className="text-sm font-semibold text-muted">Step {step}/2</span></div>
        {step === 1 ? (
          <form className="card p-6 space-y-4" onSubmit={(e) => { e.preventDefault(); setStep(2); }}>
            <div><h1 className="text-2xl font-extrabold">Business setup</h1><p className="text-muted text-sm">This shows on every invoice. You can change it later.</p></div>
            <Field label="Business name"><input required className="input" value={f.name} onChange={set("name")} placeholder="Sharma Traders" /></Field>
            <Field label="Owner name"><input className="input" value={f.ownerName} onChange={set("ownerName")} placeholder="Rakesh Sharma" /></Field>
            <Field label="GSTIN (optional)" hint="State is picked automatically from GSTIN">
              <input className="input uppercase" maxLength={15} value={f.gstin} onChange={set("gstin")} placeholder="19ABCPS1234K1Z5" />
            </Field>
            <Field label="Business type"><select className="input" value={f.businessType} onChange={set("businessType")}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Address" className="col-span-2"><input className="input" value={f.address} onChange={set("address")} placeholder="12, Bazar Road" /></Field>
              <Field label="City"><input className="input" value={f.city} onChange={set("city")} placeholder="Asansol" /></Field>
            </div>
            <button className="btn-primary w-full h-11">Continue</button>
          </form>
        ) : (
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-extrabold">Choose your plan</h1>
              <Seg value={cycle} onChange={setCycle} options={[{ value: "MONTHLY", label: "Monthly" }, { value: "YEARLY", label: "Yearly · save 17%" }]} />
            </div>
            <div className="space-y-3">
              {plans.map((p) => (
                <button key={p.code} type="button" onClick={() => setPlan(p.code)}
                  className={cx("w-full text-left rounded-2xl border-2 p-4 flex items-center justify-between gap-3 transition", plan === p.code ? "border-brand bg-brand-50/50" : "border-line hover:border-brand-300")}>
                  <div>
                    <div className="font-bold flex items-center gap-2">{p.name}{p.code === "BILLING_INV" && <span className="pill bg-brand text-white">Most popular</span>}</div>
                    <div className="text-sm text-muted">{p.tagline}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-extrabold text-lg">{inr(cycle === "YEARLY" ? p.yearlyPrice : p.monthlyPrice)}<span className="text-xs text-muted font-semibold">/{cycle === "YEARLY" ? "year" : "month"}</span></div>
                    {plan === p.code && <Check className="size-5 text-brand ml-auto" />}
                  </div>
                </button>
              ))}
            </div>
            <div className="rounded-xl bg-ok-50 text-ok text-sm font-semibold px-4 py-3">7-day free trial included — no payment needed to start.</div>
            <ErrorBox error={err} />
            <div className="grid sm:grid-cols-2 gap-3">
              <button className="btn-outline h-11" disabled={busy} onClick={() => create(false)}>{busy ? <Spinner className="size-4" /> : "Start free trial"}</button>
              <button className="btn-primary h-11" disabled={busy || !sel} onClick={() => create(true)}>
                Pay {sel ? inr((cycle === "YEARLY" ? sel.yearly : sel.monthly).total) : ""} (incl. GST)
              </button>
            </div>
            <p className="text-xs text-center text-muted">Pay securely · UPI / Card / Netbanking</p>
            <button className="btn-ghost w-full" onClick={() => setStep(1)}>Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
