"use client";
import { useState } from "react";
import { UserPlus, HandCoins, Pencil } from "lucide-react";
import { api, useApi, inr, dt } from "@/lib/api";
import { PageHeader, Loading, Table, Modal, Field, ErrorBox, Pill, Toggle, useToast } from "@/components/ui";

export default function Team() {
  const toast = useToast();
  const { data, reload } = useApi<any>("/sellers");
  const { data: rep } = useApi<any>("/reports");
  const [add, setAdd] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [payout, setPayout] = useState<any>(null);
  if (!data) return <Loading />;
  const payable = (id: string) => rep?.bySeller.find((s: any) => s.id === id)?.payable ?? 0;
  return (
    <div className="space-y-4">
      <PageHeader title="Team & Partners" sub="Sales staff and reseller partners — commission and logins">
        <button className="btn-primary" onClick={() => setAdd(true)}><UserPlus className="size-4" />Add seller</button>
      </PageHeader>
      <div className="card overflow-hidden">
        <Table>
          <thead><tr>{["Name", "Type", "City", "Commission", "Login", "Commission payable", "Status", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>{data.sellers.map((s: any) => (
            <tr key={s.id}><td className="td font-semibold">{s.name}<div className="text-xs text-muted">{s.phone}</div></td><td className="td">{s.type === "PARTNER" ? "Partner" : s.type === "STAFF" ? "Sales staff" : "Direct"}</td>
              <td className="td">{s.city || "—"}</td><td className="td font-bold">{s.commissionPct}%</td><td className="td text-sm">{s.login?.email || <span className="text-faint">no login</span>}</td>
              <td className="td font-bold text-bad">{payable(s.id) > 0 ? inr(payable(s.id)) : "—"}</td>
              <td className="td"><Pill status={s.active ? "ACTIVE" : "DISABLED"} /></td>
              <td className="td"><div className="flex gap-1.5">
                {payable(s.id) > 0 && <button className="btn-outline btn-sm" onClick={() => setPayout({ ...s, amount: payable(s.id) })}><HandCoins className="size-3.5" />Pay</button>}
                <button className="btn-ghost btn-sm" onClick={() => setEdit(s)}><Pencil className="size-3.5" /></button></div></td></tr>))}
          </tbody>
        </Table>
      </div>
      <div className="card overflow-hidden">
        <div className="font-bold p-4 border-b border-line">Commission payouts</div>
        <Table>
          <thead><tr><th className="th">Date</th><th className="th">Seller</th><th className="th">Note</th><th className="th text-right">Amount</th></tr></thead>
          <tbody>{data.payouts.map((p: any) => <tr key={p.id}><td className="td">{dt(p.paidAt)}</td><td className="td font-semibold">{data.sellers.find((s: any) => s.id === p.sellerId)?.name}</td><td className="td text-sm">{p.note}</td><td className="td text-right font-bold">{inr(p.amount)}</td></tr>)}</tbody>
        </Table>
      </div>
      {add && <SellerForm onClose={() => setAdd(false)} onSaved={() => { setAdd(false); reload(); toast("Seller added"); }} />}
      {edit && <EditSeller s={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {payout && <PayoutForm s={payout} onClose={() => setPayout(null)} onSaved={() => { setPayout(null); reload(); toast("Payout recorded"); }} />}
    </div>
  );
}

function SellerForm({ onClose, onSaved }: any) {
  const [f, setF] = useState({ name: "", type: "STAFF", city: "", phone: "", commissionPct: "10", email: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const save = async () => { try { await api("/sellers", { body: { ...f, commissionPct: Number(f.commissionPct), email: f.email || undefined, password: f.password || undefined } }); onSaved(); } catch (e: any) { setErr(e.message); } };
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title="Add seller" footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><input className="input" value={f.name} onChange={set("name")} /></Field>
        <Field label="Type"><select className="input" value={f.type} onChange={set("type")}><option value="STAFF">Sales staff</option><option value="PARTNER">Partner / reseller</option></select></Field>
        <Field label="City"><input className="input" value={f.city} onChange={set("city")} /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Commission %"><input className="input" value={f.commissionPct} onChange={set("commissionPct")} /></Field>
        <div />
        <Field label="Login email (optional)"><input className="input" value={f.email} onChange={set("email")} /></Field>
        <Field label="Password"><input type="password" className="input" value={f.password} onChange={set("password")} /></Field>
      </div>
      <p className="text-xs text-muted mt-2">With a login, they can sell and see only their own customers.</p>
      <ErrorBox error={err} />
    </Modal>
  );
}
function EditSeller({ s, onClose, onSaved }: any) {
  const [f, setF] = useState({ name: s.name, city: s.city || "", phone: s.phone || "", commissionPct: String(s.commissionPct), active: s.active });
  return (
    <Modal open onClose={onClose} title={`Edit ${s.name}`} footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={async () => { await api(`/sellers/${s.id}`, { method: "PUT", body: { ...f, commissionPct: Number(f.commissionPct) } }); onSaved(); }}>Save</button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Commission %"><input className="input" value={f.commissionPct} onChange={(e) => setF({ ...f, commissionPct: e.target.value })} /></Field>
        <Field label="City"><input className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      </div>
      <Toggle label="Active" on={f.active} onChange={(v) => setF({ ...f, active: v })} />
    </Modal>
  );
}
function PayoutForm({ s, onClose, onSaved }: any) {
  const [amount, setAmount] = useState(String(s.amount));
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title={`Pay commission · ${s.name}`} footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={async () => { try { await api(`/sellers/${s.id}/payout`, { body: { amount: Number(amount), note } }); onSaved(); } catch (e: any) { setErr(e.message); } }}>Record payout</button></>}>
      <div className="space-y-3"><Field label="Amount"><input className="input font-bold" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><Field label="Note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nov payout · UTR …" /></Field><ErrorBox error={err} /></div>
    </Modal>
  );
}
