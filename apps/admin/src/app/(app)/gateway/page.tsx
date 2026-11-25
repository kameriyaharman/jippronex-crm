"use client";
import { useEffect, useState } from "react";
import { Save, Copy, CreditCard } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { PageHeader, Loading, Field, Toggle, ErrorBox, cx, useToast } from "@/components/ui";

const META: Record<string, [string, string]> = { razorpay: ["Razorpay", "UPI, cards, netbanking, autopay"], cashfree: ["Cashfree", "Backup gateway"], phonepe: ["PhonePe PG", "UPI only"] };

export default function Gateway() {
  const toast = useToast();
  const { data, reload } = useApi<any>("/gateway");
  const [sel, setSel] = useState("razorpay");
  const [keys, setKeys] = useState<any>({});
  const [rules, setRules] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (data) { setRules(data.rules); const g = data.gateways.find((x: any) => x.provider === sel); setKeys({ keyId: g?.keyId || "", keySecret: "", webhookSecret: "", settlement: g?.settlement || "", mode: g?.mode || "test" }); } }, [data, sel]);
  if (!data || !rules) return <Loading />;
  const g = data.gateways.find((x: any) => x.provider === sel);
  const save = async () => {
    setErr(null);
    try {
      await api(`/gateway/${sel}`, { method: "PUT", body: { ...keys, isPrimary: sel === "razorpay" ? true : undefined } });
      await api("/settings/collection", { method: "PUT", body: rules });
      toast("Gateway settings saved"); reload();
    } catch (e: any) { setErr(e.message); }
  };
  const days = [15, 7, 3, 0];
  const preview = (rules.reminderTemplate || "").replace("{name}", "Rakesh").replace("{plan}", "Billing + Inventory").replace("{date}", "23 Nov 2027").replace("{link}", "pay.jippronex.com/r/JX-C-00214");
  return (
    <div>
      <PageHeader title="Payment Gateway" sub="Connect gateway once — subscriptions, renewals and links collect automatically">
        <button className="btn-primary" onClick={save}><Save className="size-4" />Save</button>
      </PageHeader>
      <ErrorBox error={err} />
      <div className="grid md:grid-cols-3 gap-3 mb-4 mt-2">{data.gateways.map((x: any) => (
        <button key={x.provider} onClick={() => setSel(x.provider)} className={cx("card p-4 text-left flex items-center gap-3 border-2", sel === x.provider ? "border-brand" : "border-transparent")}>
          <div className="size-10 rounded-xl bg-brand-50 text-brand grid place-items-center"><CreditCard className="size-5" /></div>
          <div className="flex-1"><div className="font-bold">{META[x.provider][0]}</div><div className="text-xs text-muted">{META[x.provider][1]}</div></div>
          <span className={cx("pill", x.connected ? (x.mode === "live" ? "bg-ok-50 text-ok" : "bg-warn-50 text-warn") : "bg-canvas text-muted")}>{x.connected ? `${x.mode === "live" ? "Live" : "Test mode"}${x.isPrimary ? " · Primary" : ""}` : "Not connected"}</span>
        </button>))}</div>
      <div className="grid xl:grid-cols-2 gap-4 items-start">
        <div className="card p-5 space-y-3">
          <div className="flex justify-between"><div className="font-bold">{META[sel][0]} settings</div>{g.connected && <span className="pill bg-ok-50 text-ok">Connected</span>}</div>
          {sel !== "razorpay" && <div className="rounded-xl bg-warn-50 text-warn text-sm px-3 py-2">Payment links currently go through Razorpay. {META[sel][0]} keys are stored for switching later.</div>}
          <div className="flex gap-2">{["test", "live"].map((m) => <button key={m} className="chip" data-on={keys.mode === m} onClick={() => setKeys({ ...keys, mode: m })}>{m === "live" ? "Live" : "Test"} mode</button>)}</div>
          <Field label="Key ID"><input className="input font-mono" value={keys.keyId} onChange={(e) => setKeys({ ...keys, keyId: e.target.value })} placeholder="rzp_live_xxxxxxxx" /></Field>
          <Field label="Key secret" hint={g.hasSecret ? "Saved — leave empty to keep" : undefined}><input type="password" className="input font-mono" value={keys.keySecret} onChange={(e) => setKeys({ ...keys, keySecret: e.target.value })} placeholder={g.hasSecret ? "••••••••••••" : ""} /></Field>
          <Field label="Webhook URL" hint="Add in Razorpay Dashboard → Webhooks · events: payment_link.paid, payment.captured, payment.failed">
            <div className="input flex items-center font-mono text-xs"><span className="flex-1 truncate">{data.webhookUrl}</span><button onClick={() => { navigator.clipboard.writeText(data.webhookUrl); toast("Copied"); }}><Copy className="size-4 text-brand" /></button></div></Field>
          <Field label="Webhook secret" hint={g.hasWebhookSecret ? "Saved — leave empty to keep" : undefined}><input type="password" className="input font-mono" value={keys.webhookSecret} onChange={(e) => setKeys({ ...keys, webhookSecret: e.target.value })} placeholder={g.hasWebhookSecret ? "••••••••" : ""} /></Field>
          <Field label="Settlement account (label)"><input className="input" value={keys.settlement} onChange={(e) => setKeys({ ...keys, settlement: e.target.value })} placeholder="HDFC ••••8812" /></Field>
        </div>
        <div className="space-y-4">
          <div className="card p-5">
            <div className="font-bold mb-1">Collection rules</div>
            <div className="divide-y divide-line">
              {([["autoActivate", "Auto-activate account after payment"], ["autopay", "UPI Autopay / card mandate for renewals"], ["autoInvoice", "Auto GST invoice to customer (email + WhatsApp)"], ["retryFailed", "Retry failed payment after 1, 3, 5 days"], ["passCharges", "Pass gateway charges to customer"]] as const).map(([k, l]) =>
                <Toggle key={k} label={l} on={!!rules[k]} onChange={(v) => setRules({ ...rules, [k]: v })} />)}
              <div className="flex items-center justify-between py-2.5 text-sm"><span className="font-medium">Suspend account after expiry (days)</span><input className="input h-8 w-16" value={rules.suspendAfterDays} onChange={(e) => setRules({ ...rules, suspendAfterDays: Number(e.target.value.replace(/\D/g, "")) })} /></div>
            </div>
          </div>
          <div className="card p-5 space-y-3">
            <div className="font-bold">Renewal reminders</div>
            <div className="flex flex-wrap gap-1.5">{days.map((d) => <button key={d} className="chip" data-on={rules.reminderDays.includes(d)} onClick={() => setRules({ ...rules, reminderDays: rules.reminderDays.includes(d) ? rules.reminderDays.filter((x: number) => x !== d) : [...rules.reminderDays, d] })}>{d === 0 ? "On expiry day" : `${d} days before`}</button>)}</div>
            <Field label="Message" hint="Use {name} {plan} {date} {link}"><textarea rows={3} className="input h-auto py-2" value={rules.reminderTemplate} onChange={(e) => setRules({ ...rules, reminderTemplate: e.target.value })} /></Field>
            <div className="rounded-xl bg-[#e7f6ec] p-3"><div className="bg-white rounded-lg p-3 text-sm whitespace-pre-line shadow-sm">{preview}</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
