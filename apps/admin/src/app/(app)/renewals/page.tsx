"use client";
import { useState } from "react";
import Link from "next/link";
import { MessageCircle, Link2, Gift } from "lucide-react";
import { api, useApi, inr, dt } from "@/lib/api";
import { PageHeader, Kpi, Loading, Table, Modal, cx, useToast } from "@/components/ui";
import { LinkResult } from "@/components/admin";

export default function Renewals() {
  const toast = useToast();
  const { data, reload } = useApi<any>("/renewals");
  const [link, setLink] = useState<any>(null);
  const [bulk, setBulk] = useState<any>(null);
  const remind = async (id: string, winBackPct = 0) => {
    try { const r = await api(`/renewals/${id}/remind`, { body: { winBackPct } }); setLink({ ...r, whatsapp: r.whatsapp, email: `mailto:?body=${encodeURIComponent(r.text)}`, sms: `sms:?body=${encodeURIComponent(r.text)}` }); reload(); }
    catch (e: any) { toast(e.message, "bad"); }
  };
  if (!data) return <Loading />;
  const s = data.stats;
  return (
    <div>
      <PageHeader title="Renewals & Expiry" sub="Who is due, who expired, who failed — chase renewals in one click">
        <button className="btn-wa" onClick={async () => { setBulk(await api("/renewals/remind-all", { body: {} })); reload(); }}><MessageCircle className="size-4" />Remind all due</button>
      </PageHeader>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi label="Due in 30 days" value={s.dueCount} sub={`${inr(s.expected)} expected`} />
        <Kpi label="On autopay" value={`${s.autopay} of ${s.dueCount}`} sub="auto-collect" subTone="ok" />
        <Kpi label="Renewal rate" value={`${s.renewalRate}%`} sub="last 90 days" />
        <Kpi label="Expired (not renewed)" value={s.expired} sub="win-back offer" subTone="bad" />
      </div>
      <div className="card overflow-hidden mb-4">
        <div className="font-bold p-4 border-b border-line">Due for renewal</div>
        <Table>
          <thead><tr>{["Customer", "Plan", "Renew price", "Expires", "Left", "Autopay", "Reminders", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>{data.due.map((c: any) => (
            <tr key={c.id}>
              <td className="td"><Link href={`/customers/${c.id}`} className="font-semibold hover:text-brand">{c.name}</Link><div className="text-xs text-muted">{c.owner?.phone}</div></td>
              <td className="td text-sm">{c.plan?.name}</td>
              <td className="td font-bold">{inr(c.renewPrice)}{c.cycle === "MONTHLY" && <span className="text-xs text-muted font-medium"> /mo</span>}</td>
              <td className="td text-sm">{dt(c.subscription.endsAt, { day: "2-digit", month: "short", year: "2-digit" })}</td>
              <td className="td"><span className={cx("pill", c.daysLeft <= 3 ? "bg-bad-50 text-bad" : c.daysLeft <= 7 ? "bg-warn-50 text-warn" : "bg-canvas text-muted")}>{c.daysLeft} days</span></td>
              <td className="td"><span className={cx("pill", c.autoRenew ? "bg-ok-50 text-ok" : "bg-canvas text-muted")}>Autopay {c.autoRenew ? "on" : "off"}</span></td>
              <td className="td text-sm text-muted">{c.subscription.remindersSent ? `Sent ${c.subscription.remindersSent}` : "—"}</td>
              <td className="td"><button className="btn-outline btn-sm" onClick={() => remind(c.id)}><Link2 className="size-3.5" />Link</button></td>
            </tr>))}
            {!data.due.length && <tr><td colSpan={8} className="text-center py-8 text-sm text-muted">Nobody due in the next 30 days</td></tr>}
          </tbody>
        </Table>
      </div>
      <div className="card overflow-hidden">
        <div className="font-bold p-4 border-b border-line">Expired — win back</div>
        <Table>
          <thead><tr>{["Customer", "Plan", "Last price", "Expired on", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>{data.expired.map((c: any) => (
            <tr key={c.id}><td className="td"><Link href={`/customers/${c.id}`} className="font-semibold hover:text-brand">{c.name}</Link></td><td className="td text-sm">{c.plan?.name}</td>
              <td className="td">{inr(c.lastPrice)}{c.cycle === "MONTHLY" && <span className="text-xs text-muted"> /mo</span>}</td>
              <td className="td text-sm">{dt(c.subscription.endsAt, { day: "2-digit", month: "short", year: "2-digit" })} <span className="text-muted">· {c.daysAgo} days ago</span></td>
              <td className="td"><button className="btn-primary btn-sm" onClick={() => remind(c.id, 15)}><Gift className="size-3.5" />Send win-back offer (15% off)</button></td></tr>))}
          </tbody>
        </Table>
        <div className="text-xs text-muted p-4">Data kept safe for 90 days after expiry · customer can renew and continue</div>
      </div>
      <LinkResult data={link} onClose={() => setLink(null)} />
      <Modal open={!!bulk} onClose={() => setBulk(null)} title={`Renewal links · ${bulk?.count || 0}`}>
        <div className="space-y-2">{bulk?.list.map((l: any) => (
          <a key={l.paymentId} href={l.whatsapp} target="_blank" rel="noreferrer" className="flex justify-between items-center rounded-xl border border-line px-3 py-2.5 hover:bg-canvas">
            <span className="font-semibold text-sm">{l.name}</span><span className="text-sm font-bold text-wa">{inr(l.amount)} · WhatsApp</span></a>))}
          {bulk && !bulk.list.length && <div className="text-sm text-muted">Everyone due is on autopay 👍</div>}
        </div>
      </Modal>
    </div>
  );
}
