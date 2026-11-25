"use client";
import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Plus, HandCoins, MessageCircle, Paperclip, ExternalLink } from "lucide-react";
import { api, useApi, inr, dm, tm, ym, isoDate } from "@/lib/api";
import { MODE } from "@/lib/labels";
import { PageHeader, Kpi, Loading, Table, Modal, Field, ErrorBox, Seg, cx, useToast } from "@/components/ui";
import { ReceivePayment } from "@/components/ReceivePayment";

const COLORS = ["#0b46c4", "#4f86f7", "#9cc4fa", "#f59e0b", "#16a34a", "#a855f7", "#94a3b8"];

export default function Payments() {
  const toast = useToast();
  const [view, setView] = useState<"overview" | "book">("overview");
  const [month, setMonth] = useState(ym());
  const { data: o, reload } = useApi<any>(`/money/overview?month=${month}`);
  const { data: ex, reload: reloadEx } = useApi<any>(`/expenses?month=${month}`);
  const [receive, setReceive] = useState<"IN" | "OUT" | null>(null);
  const [addExp, setAddExp] = useState(false);
  const [remind, setRemind] = useState<any>(null);
  const refresh = () => { reload(); reloadEx(); };
  const totalExp = ex?.total || 0;
  return (
    <div>
      <PageHeader title="Payments & Expenses" sub="Track who owes you, whom you owe, and where money goes">
        <Seg value={view} onChange={setView} options={[{ value: "overview", label: "Overview" }, { value: "book", label: "Cash & bank book" }]} />
        <input type="month" className="input h-10 w-40" value={month} onChange={(e) => setMonth(e.target.value)} />
        <button className="btn-outline" onClick={() => setAddExp(true)}><Plus className="size-4" />Add expense</button>
        <button className="btn-outline" onClick={() => setReceive("OUT")}>Pay supplier</button>
        <button className="btn-primary" onClick={() => setReceive("IN")}><HandCoins className="size-4" />Record payment</button>
      </PageHeader>
      {!o ? <Loading /> : <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Kpi label="Cash in hand" value={inr(o.cash)} sub="today closing" />
          <Kpi label="Bank + UPI" value={inr(o.bank)} sub={Object.keys(o.accounts).filter((k) => k !== "Cash").join(" · ") || "—"} />
          <Kpi label="Received (month)" value={inr(o.receivedMonth)} sub="from customers" subTone="ok" />
          <Kpi label="Expenses (month)" value={inr(o.expensesMonth)} sub={`${o.expenseCount} entries`} subTone="bad" />
        </div>
        {view === "book" ? <CashBook /> : <>
          <div className="grid xl:grid-cols-3 gap-4 mb-4">
            <div className="card p-5">
              <div className="flex justify-between mb-4"><div className="font-bold">Receivable ageing</div><div className="text-sm font-bold text-bad">{inr(o.ageing.total)} due</div></div>
              <div className="space-y-3">{o.ageing.buckets.map((b: any, i: number) => (
                <div key={b.label}><div className="flex justify-between text-sm"><span className="text-muted">{b.label}</span><span className="font-bold">{inr(b.amount)}</span></div>
                  <div className="h-2 bg-canvas rounded-full mt-1"><div className={cx("h-2 rounded-full", ["bg-ok", "bg-amber-400", "bg-orange-500", "bg-bad"][i])} style={{ width: `${o.ageing.total ? (b.amount / o.ageing.total) * 100 : 0}%` }} /></div></div>))}
              </div>
              <button className="btn-wa w-full mt-5" onClick={async () => setRemind(await api("/money/remind-all", { body: {} }))}><MessageCircle className="size-4" />WhatsApp reminder to {o.ageing.parties} parties</button>
            </div>
            <div className="card overflow-hidden">
              <div className="font-bold p-5 pb-3">Recent payments</div>
              <div className="divide-y divide-line">{o.recent.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-2.5">
                  <div><div className="text-sm font-semibold">{p.party}</div><div className="text-xs text-muted">{dm(p.date)} · {MODE[p.mode]}</div></div>
                  <div className={cx("text-sm font-bold", p.direction === "IN" ? "text-ok" : "text-bad")}>{p.direction === "IN" ? "Received" : "Paid"} {inr(p.amount)}</div>
                </div>))}
              </div>
            </div>
            <div className="card p-5">
              <div className="flex justify-between"><div className="font-bold">Expenses by category</div><div className="text-xs text-muted">{new Date(month + "-15").toLocaleString("en-IN", { month: "long" })}</div></div>
              {ex && ex.byCategory.length ? <div className="flex items-center gap-4 mt-3">
                <div className="size-36 shrink-0"><ResponsiveContainer><PieChart><Pie data={ex.byCategory} dataKey="amount" nameKey="category" innerRadius={42} outerRadius={66} paddingAngle={2} stroke="none">
                  {ex.byCategory.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie></PieChart></ResponsiveContainer></div>
                <div className="space-y-1.5 text-sm">{ex.byCategory.map((c: any, i: number) => (
                  <div key={c.category} className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{c.category}<b className="ml-auto pl-3">{Math.round((c.amount / totalExp) * 100)}%</b></div>))}</div>
              </div> : <div className="text-sm text-muted mt-4">No expenses this month</div>}
            </div>
          </div>
          <div className="card overflow-hidden">
            <div className="flex justify-between p-4 border-b border-line"><div className="font-bold">Expense register</div><div className="text-xs text-muted">Bill photo can be attached</div></div>
            {!ex ? <Loading /> : <Table>
              <thead><tr><th className="th">Date</th><th className="th">Description</th><th className="th">Category</th><th className="th text-right">Amount</th><th className="th">Paid by</th><th className="th" /></tr></thead>
              <tbody>{ex.rows.map((e: any) => (
                <tr key={e.id}><td className="td text-muted">{dm(e.date)}</td><td className="td font-medium">{e.description}</td><td className="td">{e.category}</td>
                  <td className="td text-right font-bold">{inr(e.amount)}</td><td className="td">{MODE[e.mode]}{e.account && e.mode !== "CASH" ? ` · ${e.account}` : ""}</td>
                  <td className="td">{e.attachmentUrl && <a href={e.attachmentUrl} target="_blank" rel="noreferrer" className="text-brand"><Paperclip className="size-4" /></a>}</td></tr>))}
                {!ex.rows.length && <tr><td colSpan={6} className="text-center py-8 text-sm text-muted">No expenses</td></tr>}
              </tbody>
            </Table>}
          </div>
        </>}
      </>}
      {receive && <ReceivePayment direction={receive} onClose={() => setReceive(null)} onSaved={() => { setReceive(null); refresh(); }} />}
      {addExp && <ExpenseForm categories={ex?.categories || []} onClose={() => setAddExp(false)} onSaved={() => { setAddExp(false); refresh(); toast("Expense saved"); }} />}
      <Modal open={!!remind} onClose={() => setRemind(null)} title={`Send reminders · ${remind?.count || 0} parties`}>
        <p className="text-sm text-muted mb-3">Tap each to open WhatsApp with the reminder ready.</p>
        <div className="space-y-2">{remind?.list.map((r: any) => (
          <a key={r.partyId} href={r.link} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 hover:bg-canvas">
            <div><div className="font-semibold text-sm">{r.name}</div><div className="text-xs text-muted">{r.phone || "no phone"}</div></div>
            <div className="flex items-center gap-2 text-sm font-bold text-bad">{inr(r.amount)}<ExternalLink className="size-3.5 text-wa" /></div>
          </a>))}</div>
      </Modal>
    </div>
  );
}

function CashBook() {
  const [range, setRange] = useState("today");
  const [account, setAccount] = useState("");
  const { data } = useApi<any>(`/cashbook?range=${range}&account=${account}`);
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap gap-2 items-center p-4 border-b border-line">
        <Seg value={range} onChange={setRange} options={[{ value: "today", label: "Today" }, { value: "week", label: "This week" }, { value: "month", label: "This month" }]} />
        <div className="flex-1" />
        <button className="chip" data-on={!account} onClick={() => setAccount("")}>All</button>
        {data?.accountsList.map((a: string) => <button key={a} className="chip" data-on={account === a} onClick={() => setAccount(a)}>{a}</button>)}
      </div>
      {!data ? <Loading /> : <div className="divide-y divide-line">
        {data.entries.map((e: any) => (
          <div key={e.id} className="flex items-center justify-between px-5 py-3">
            <div><div className="text-sm font-semibold">{e.title}</div><div className="text-xs text-muted">{e.sub} · {e.account}</div></div>
            <div className="text-right"><div className={cx("font-bold", e.amount >= 0 ? "text-ok" : "text-bad")}>{e.amount >= 0 ? "+" : "−"} {inr(Math.abs(e.amount))}</div><div className="text-xs text-muted">{range === "today" ? tm(e.date) : dm(e.date)}</div></div>
          </div>))}
        {!data.entries.length && <div className="text-center py-10 text-sm text-muted">No entries</div>}
      </div>}
    </div>
  );
}

function ExpenseForm({ categories, onClose, onSaved }: { categories: string[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ amount: "", category: categories[0] || "Rent", description: "", mode: "CASH", account: "", date: isoDate(new Date()) });
  const [file, setFile] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    try { await api("/expenses", { body: { ...f, amount: Number(f.amount), date: new Date(f.date + "T12:00:00"), account: f.account || undefined, attachmentUrl: file || undefined } }); onSaved(); }
    catch (e: any) { setErr(e.message); }
  };
  const pick = (fl: File) => {
    if (fl.size > 2_000_000) return setErr("Photo must be under 2 MB");
    const r = new FileReader(); r.onload = () => setFile(String(r.result)); r.readAsDataURL(fl);
  };
  return (
    <Modal open onClose={onClose} title="Add expense" footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!Number(f.amount) || !f.description} onClick={save}>Save expense</button></>}>
      <div className="space-y-3">
        <Field label="Amount"><input autoFocus className="input text-lg font-extrabold" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
        <Field label="Category"><div className="flex flex-wrap gap-1.5">{categories.map((c) => <button key={c} type="button" className="chip" data-on={f.category === c} onClick={() => setF({ ...f, category: c })}>{c}</button>)}</div></Field>
        <Field label="Note"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="November electricity bill" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid by"><select className="input" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>{["CASH", "UPI", "BANK", "CARD", "CHEQUE"].map((m) => <option key={m} value={m}>{MODE[m]}</option>)}</select></Field>
          <Field label="Date"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        </div>
        {f.mode !== "CASH" && <Field label="Bank account"><input className="input" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })} placeholder="SBI" /></Field>}
        <label className="btn-outline w-full cursor-pointer"><Paperclip className="size-4" />{file ? "Bill photo attached ✓" : "Attach bill photo"}<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} /></label>
        <ErrorBox error={err} />
      </div>
    </Modal>
  );
}
