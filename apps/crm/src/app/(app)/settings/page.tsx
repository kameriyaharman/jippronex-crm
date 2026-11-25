"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Minus, UserPlus, Save, Crown, ExternalLink } from "lucide-react";
import { api, useApi, inr, dt } from "@/lib/api";
import { useSession } from "@/lib/session";
import { PageHeader, Loading, Field, Toggle, Modal, ErrorBox, Pill, Table, Seg, cx, useToast } from "@/components/ui";

const ROLE_LABEL: Record<string, string> = { OWNER: "Owner", BILLING: "Billing staff", ACCOUNTANT: "Accountant", STORE: "Store keeper" };
const ROLE_ACCESS: Record<string, string> = { OWNER: "Full access", BILLING: "Billing, customers", ACCOUNTANT: "Accounts, GST, reports", STORE: "Inventory, purchase" };
const MATRIX: [string, string][] = [["invoice.create", "Create invoice"], ["invoice.edit", "Edit / cancel invoice"], ["cost.view", "See purchase rate & profit"], ["stock.adjust", "Stock adjustment"], ["accounts", "Accounts & GST"], ["reports.export", "Export reports"]];
const PREFS: [string, string][] = [["allowZeroStockBilling", "Allow billing when stock is zero"], ["lowStockWhatsapp", "Low stock alert on WhatsApp"], ["sendInvoiceWhatsapp", "Send invoice to customer on WhatsApp"], ["dailySummary", "Daily sales summary to owner at 9 PM"], ["autoBackup", "Auto backup to cloud (daily)"], ["showMrp", "Show MRP on invoice"]];

function Settings() {
  const sp = useSearchParams();
  const [tab, setTab] = useState(sp.get("tab") || "profile");
  const { can } = useSession();
  return (
    <div>
      <PageHeader title="Settings, Users & Roles" sub="Business profile, invoice design, staff access and subscription">
        <Seg value={tab} onChange={setTab} options={[{ value: "profile", label: "Business" }, { value: "users", label: "Users & roles" }, { value: "plan", label: "Plan & billing" }]} />
      </PageHeader>
      {tab === "profile" && <Profile editable={can("settings")} />}
      {tab === "users" && <Users editable={can("settings")} />}
      {tab === "plan" && <Plan editable={can("settings")} />}
    </div>
  );
}

function Profile({ editable }: { editable: boolean }) {
  const toast = useToast();
  const { refresh } = useSession();
  const { data } = useApi<any>("/settings/business");
  const [f, setF] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (data) setF({ ...data, preferences: data.preferences || {} }); }, [data]);
  if (!f) return <Loading />;
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const img = (k: string) => (e: any) => { const fl = e.target.files?.[0]; if (!fl) return; if (fl.size > 800_000) return setErr("Image must be under 800 KB"); const r = new FileReader(); r.onload = () => setF({ ...f, [k]: r.result }); r.readAsDataURL(fl); };
  const save = async () => {
    setErr(null);
    try {
      const keys = ["name", "ownerName", "phone", "email", "gstin", "businessType", "address", "city", "stateCode", "pincode", "invoicePrefix", "bankName", "bankAccount", "bankIfsc", "upiId", "terms", "invoiceTemplate", "logoUrl", "signatureUrl", "preferences"];
      await api("/settings/business", { method: "PUT", body: Object.fromEntries(keys.map((k) => [k, f[k] === "" ? null : f[k]]).filter(([k, v]) => !(k === "name" && !v))) });
      toast("Settings saved"); refresh();
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <div className="grid xl:grid-cols-[1fr_380px] gap-4 items-start">
      <div className="card p-5 space-y-4">
        <div className="flex justify-between items-center"><div className="font-bold">Business profile</div>{editable && <button className="btn-primary" onClick={save}><Save className="size-4" />Save</button>}</div>
        <fieldset disabled={!editable} className="grid md:grid-cols-2 gap-3">
          <Field label="Business name"><input className="input" value={f.name || ""} onChange={set("name")} /></Field>
          <Field label="GSTIN" hint="State is set from GSTIN"><input className="input uppercase" value={f.gstin || ""} onChange={set("gstin")} /></Field>
          <Field label="Address" className="md:col-span-2"><input className="input" value={f.address || ""} onChange={set("address")} /></Field>
          <Field label="City"><input className="input" value={f.city || ""} onChange={set("city")} /></Field>
          <Field label="State"><select className="input" value={f.stateCode} onChange={set("stateCode")}>{Object.entries(f.states as Record<string, string>).map(([c, n]) => <option key={c} value={c}>{n} ({c})</option>)}</select></Field>
          <Field label="Phone"><input className="input" value={f.phone || ""} onChange={set("phone")} /></Field>
          <Field label="Email"><input className="input" value={f.email || ""} onChange={set("email")} /></Field>
          <Field label="Invoice prefix" hint={`Next bills look like ${f.invoicePrefix || "INV-"}${new Date().getFullYear().toString().slice(2)}${String(new Date().getMonth() + 1).padStart(2, "0")}-0001`}><input className="input" value={f.invoicePrefix || ""} onChange={set("invoicePrefix")} /></Field>
          <Field label="Invoice template"><select className="input" value={f.invoiceTemplate} onChange={set("invoiceTemplate")}><option value="MODERN">Modern</option><option value="CLASSIC">Classic</option></select></Field>
          <div className="md:col-span-2 font-bold pt-2">Bank & UPI (printed on invoice)</div>
          <Field label="Bank name & branch"><input className="input" value={f.bankName || ""} onChange={set("bankName")} /></Field>
          <Field label="Account number"><input className="input" value={f.bankAccount || ""} onChange={set("bankAccount")} /></Field>
          <Field label="IFSC"><input className="input uppercase" value={f.bankIfsc || ""} onChange={set("bankIfsc")} /></Field>
          <Field label="UPI ID" hint="Used for the Scan-to-pay QR on bills"><input className="input" value={f.upiId || ""} onChange={set("upiId")} /></Field>
          <Field label="Terms & conditions" className="md:col-span-2"><textarea rows={3} className="input h-auto py-2" value={f.terms || ""} onChange={set("terms")} /></Field>
        </fieldset>
        <ErrorBox error={err} />
      </div>
      <div className="space-y-4">
        <div className="card p-5">
          <div className="font-bold mb-3">Logo & signature</div>
          <div className="grid grid-cols-2 gap-3">
            {[["logoUrl", "Logo"], ["signatureUrl", "Signature"]].map(([k, l]) => (
              <label key={k} className={cx("rounded-xl border-2 border-dashed border-line h-28 grid place-items-center text-center text-xs text-muted", editable && "cursor-pointer hover:border-brand")}>
                {f[k] ? <img src={f[k]} alt="" className="max-h-24 max-w-full object-contain" /> : <span>Upload {l.toLowerCase()}</span>}
                <input type="file" accept="image/*" hidden disabled={!editable} onChange={img(k)} />
              </label>))}
          </div>
          <div className="text-xs text-muted mt-2">{f.shops} shop{f.shops > 1 ? "s" : ""} · switch from the sidebar</div>
        </div>
        <div className="card p-5">
          <div className="font-bold mb-1">Preferences</div>
          <div className="divide-y divide-line">{PREFS.map(([k, l]) => <Toggle key={k} label={l} on={!!f.preferences[k]} onChange={(v) => editable && setF({ ...f, preferences: { ...f.preferences, [k]: v } })} />)}</div>
        </div>
      </div>
    </div>
  );
}

function Users({ editable }: { editable: boolean }) {
  const toast = useToast();
  const { data, reload } = useApi<any>("/settings/users");
  const [add, setAdd] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", role: "BILLING" });
  const [err, setErr] = useState<string | null>(null);
  if (!data) return <Loading />;
  const save = async () => { try { await api("/settings/users", { body: f }); toast("User invited — they can login with OTP"); setAdd(false); reload(); } catch (e: any) { setErr(e.message); } };
  const update = async (id: string, body: any) => { try { await api(`/settings/users/${id}`, { method: "PUT", body }); reload(); } catch (e: any) { toast(e.message, "bad"); } };
  return (
    <div className="grid xl:grid-cols-2 gap-4 items-start">
      <div className="card overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-line"><div className="font-bold">Users & roles <span className="text-muted font-medium text-sm">· {data.users.length}/{data.allowed} used</span></div>
          {editable && <button className="btn-primary btn-sm" onClick={() => { setErr(null); setAdd(true); }}><UserPlus className="size-3.5" />Add user</button>}</div>
        <Table>
          <thead><tr><th className="th">User</th><th className="th">Role</th><th className="th">Access</th><th className="th">Status</th></tr></thead>
          <tbody>{data.users.map((u: any) => (
            <tr key={u.id}>
              <td className="td"><div className="font-semibold">{u.name}</div><div className="text-xs text-muted">{u.phone}</div></td>
              <td className="td">{editable && u.role !== "OWNER" ? <select className="input h-8 w-36" value={u.role} onChange={(e) => update(u.id, { role: e.target.value })}>{Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select> : ROLE_LABEL[u.role]}</td>
              <td className="td text-muted text-xs">{ROLE_ACCESS[u.role]}</td>
              <td className="td">{editable && u.role !== "OWNER" ? <button onClick={() => update(u.id, { status: u.status === "DISABLED" ? "ACTIVE" : "DISABLED" })}><Pill status={u.status} /></button> : <Pill status={u.status} />}</td>
            </tr>))}
          </tbody>
        </Table>
      </div>
      <div className="card overflow-hidden">
        <div className="font-bold p-4 border-b border-line">Role permissions</div>
        <Table>
          <thead><tr><th className="th">Permission</th>{["OWNER", "BILLING", "ACCOUNTANT", "STORE"].map((r) => <th key={r} className="th text-center">{ROLE_LABEL[r].split(" ")[0]}</th>)}</tr></thead>
          <tbody>{MATRIX.map(([k, l]) => (
            <tr key={k}><td className="td">{l}</td>{["OWNER", "BILLING", "ACCOUNTANT", "STORE"].map((r) => (
              <td key={r} className="td text-center">{data.matrix[r].includes(k) ? <Check className="size-4 text-ok mx-auto" /> : <Minus className="size-4 text-faint mx-auto" />}</td>))}</tr>))}
          </tbody>
        </Table>
      </div>
      <Modal open={add} onClose={() => setAdd(false)} title="Add user" footer={<><button className="btn-outline" onClick={() => setAdd(false)}>Cancel</button><button className="btn-primary" onClick={save}>Invite</button></>}>
        <div className="space-y-3">
          <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Mobile (login ID)"><input className="input" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Role"><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(ROLE_LABEL).filter(([k]) => k !== "OWNER").map(([k, l]) => <option key={k} value={k}>{l} — {ROLE_ACCESS[k]}</option>)}</select></Field>
          <ErrorBox error={err} />
        </div>
      </Modal>
    </div>
  );
}

function Plan({ editable }: { editable: boolean }) {
  const toast = useToast();
  const { refresh } = useSession();
  const { data: s, reload } = useApi<any>("/settings/subscription");
  const { data: plans } = useApi<any[]>("/settings/plans");
  const [cycle, setCycle] = useState<"YEARLY" | "MONTHLY">("YEARLY");
  const [coupon, setCoupon] = useState("");
  const [pending, setPending] = useState<any>(null);
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(async () => {
      const r = await api(`/settings/subscribe/${pending.paymentId}`);
      if (r.status === "CAPTURED") { clearInterval(t); setPending(null); toast("Payment received — plan active ✓"); reload(); refresh(); }
    }, 4000);
    return () => clearInterval(t);
  }, [pending]); // eslint-disable-line
  if (!s || !plans) return <Loading />;
  const sub = s.subscription;
  const buy = async (code: string) => {
    try { const r = await api("/settings/subscribe", { body: { planCode: code, cycle, coupon: coupon || undefined } }); setPending(r); window.open(r.url, "_blank"); }
    catch (e: any) { toast(e.message, "bad"); }
  };
  return (
    <div className="space-y-4">
      {sub && <div className="card p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-2xl bg-brand-50 text-brand grid place-items-center"><Crown className="size-6" /></div>
          <div><div className="text-lg font-extrabold flex items-center gap-2">{sub.plan.name}<Pill status={sub.status} /></div>
            <div className="text-sm text-muted">{sub.cycle === "TRIAL" ? "Free trial" : sub.cycle.toLowerCase()} · {sub.endsAt ? <>valid till {dt(sub.endsAt)} · {sub.daysLeft} days left</> : "Lifetime"} · {sub.usersAllowed} users</div></div>
        </div>
        {pending && <a href={pending.url} target="_blank" rel="noreferrer" className="btn-outline"><ExternalLink className="size-4" />Waiting for payment of {inr(pending.amount.total)}…</a>}
      </div>}
      <div className="flex flex-wrap items-center gap-3">
        <Seg value={cycle} onChange={setCycle} options={[{ value: "MONTHLY", label: "Monthly" }, { value: "YEARLY", label: "Yearly · save 17%" }]} />
        <input className="input h-10 w-44 uppercase" placeholder="Coupon code" value={coupon} onChange={(e) => setCoupon(e.target.value)} />
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {plans.map((p) => {
          const pr = cycle === "YEARLY" ? p.yearly : p.monthly;
          const current = sub?.plan.code === p.code && sub.cycle !== "TRIAL";
          return (
            <div key={p.code} className={cx("card p-5 flex flex-col", p.code === "BILLING_INV" && "border-brand border-2")}>
              <div className="font-extrabold text-lg">{p.name}</div><div className="text-sm text-muted">{p.tagline}</div>
              <div className="mt-4"><span className="text-3xl font-extrabold">{inr(pr.price)}</span><span className="text-muted text-sm">/{cycle === "YEARLY" ? "year" : "month"}</span>
                {pr.custom && <div className="text-xs text-ok font-semibold">Special price for you (list {inr(pr.list)})</div>}
                <div className="text-xs text-muted">+ GST = {inr(pr.total)}</div></div>
              <ul className="mt-4 space-y-1.5 text-sm flex-1">
                {[["billing", "GST & non-GST billing"], ["whatsapp", "Invoice on WhatsApp / PDF"], ["ledger", "Customers & ledger"], ["inventory", "Inventory & barcode"], ["purchase", "Purchase & suppliers"], ["accounts", "Accounts, P&L, GST reports"], ["android", "Android app"]].map(([k, l]) => (
                  <li key={k} className={cx("flex items-center gap-2", !p.features[k] && "text-faint line-through")}>{p.features[k] ? <Check className="size-4 text-ok" /> : <Minus className="size-4" />}{l}</li>))}
                <li className="flex items-center gap-2"><Check className="size-4 text-ok" />{p.usersIncluded} user{p.usersIncluded > 1 ? "s" : ""} included</li>
              </ul>
              {editable && <button className={cx("mt-5", current ? "btn-outline" : "btn-primary")} onClick={() => buy(p.code)}>{current ? "Renew" : sub && sub.cycle !== "TRIAL" ? "Switch to this plan" : "Buy now"}</button>}
            </div>);
        })}
      </div>
      <div className="card overflow-hidden">
        <div className="font-bold p-4 border-b border-line">Payment history</div>
        <Table>
          <thead><tr><th className="th">Date</th><th className="th">Description</th><th className="th">Invoice</th><th className="th text-right">Amount</th><th className="th">Status</th></tr></thead>
          <tbody>{s.payments.filter((p: any) => p.status !== "CREATED").map((p: any) => (
            <tr key={p.id}><td className="td">{dt(p.paidAt || p.createdAt)}</td><td className="td">{p.description}</td><td className="td font-mono text-xs">{p.invoiceNo || "—"}</td><td className="td text-right font-bold">{inr(p.amount)}</td><td className="td"><Pill status={p.status} /></td></tr>))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
export default function Page() { return <Suspense fallback={<Loading />}><Settings /></Suspense>; }
