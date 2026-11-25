"use client";
import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, Cell, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { IndianRupee, Building2, CirclePlus, RefreshCw, TriangleAlert, Gift, MessageCircle } from "lucide-react";
import { api, useApi, inr, short } from "@/lib/api";
import { Kpi, Seg, Loading, Table, Modal, cx, useToast } from "@/components/ui";
import { PlanBadge } from "@/components/admin";

const PIE = ["#0b46c4", "#4f86f7", "#7c5cd6"];
function when(d: string) {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  return m < 60 ? `${Math.max(m, 1)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

export default function Dashboard() {
  const toast = useToast();
  const [range, setRange] = useState("month");
  const { data: d } = useApi<any>(`/dashboard?range=${range}`);
  const [links, setLinks] = useState<any>(null);
  const month = new Date().toLocaleString("en-IN", { month: "short" });
  const remindAll = async () => { try { setLinks(await api("/renewals/remind-all", { body: {} })); } catch (e: any) { toast(e.message, "bad"); } };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[26px] font-extrabold tracking-tight">Master Dashboard</h1><p className="text-sm text-muted">All JipproBill billing software sales & subscriptions — live</p></div>
        <Seg value={range} onChange={setRange} options={[{ value: "month", label: "This month" }, { value: "last", label: "Last month" }, { value: "year", label: "This year" }]} />
      </div>
      {!d ? <Loading /> : <>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi label={`Revenue (${range === "year" ? "FY" : range === "last" ? "last month" : month})`} value={short(d.revenue)} icon={<IndianRupee />} tone="ok"
            sub={d.revenueChangePct != null ? `${d.revenueChangePct >= 0 ? "↑" : "↓"} ${Math.abs(d.revenueChangePct)}% vs previous` : "—"} subTone={(d.revenueChangePct ?? 0) >= 0 ? "ok" : "bad"} />
          <Kpi label="Active customers" value={d.activeCustomers} icon={<Building2 />} sub={`+${d.newCustomers} this period`} subTone="ok" />
          <Kpi label="New sales" value={d.newSales.n} icon={<CirclePlus />} sub={short(d.newSales.base)} />
          <Kpi label="Renewals due" value={d.renewalsDue.count} icon={<RefreshCw />} tone="warn" sub="next 30 days" />
          <Kpi label="Failed payments" value={d.failed.n} icon={<TriangleAlert />} tone="bad" sub={`${inr(d.failed.amt)} retry`} subTone="bad" />
          <Kpi label="Trial users" value={d.trials} icon={<Gift />} tone="violet" sub="7-day free trial" />
        </div>
        <div className="grid xl:grid-cols-[1fr_400px] gap-4">
          <div className="card p-5">
            <div className="flex justify-between mb-3"><div className="font-bold">Monthly revenue</div><div className="text-xs text-muted">Last 12 months</div></div>
            <div className="h-[250px]"><ResponsiveContainer><BarChart data={d.chart}>
              <CartesianGrid vertical={false} stroke="#eef0f5" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} stroke="#9a9db5" />
              <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="#9a9db5" width={48} tickFormatter={(v) => (v >= 1e5 ? `₹${(v / 1e5).toFixed(0)}L` : `₹${(v / 1e3).toFixed(0)}k`)} />
              <Tooltip cursor={{ fill: "#f5f7fb" }} formatter={(v: any) => inr(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="revenue" radius={[5, 5, 0, 0]} maxBarSize={30}>{d.chart.map((_: any, i: number) => <Cell key={i} fill={i === d.chart.length - 1 ? "#0b46c4" : "#9cc4fa"} />)}</Bar>
            </BarChart></ResponsiveContainer></div>
          </div>
          <div className="card p-5">
            <div className="flex justify-between"><div className="font-bold">Customers by plan</div><div className="text-xs text-muted">{d.activeCustomers} active</div></div>
            <div className="flex items-center gap-4 mt-4">
              <div className="size-40 shrink-0"><ResponsiveContainer><PieChart><Pie data={d.byPlan} dataKey="count" innerRadius={46} outerRadius={72} stroke="none">{d.byPlan.map((_: any, i: number) => <Cell key={i} fill={PIE[i % 3]} />)}</Pie></PieChart></ResponsiveContainer></div>
              <div className="space-y-2 text-sm">
                {d.byPlan.map((p: any, i: number) => <div key={p.code} className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: PIE[i % 3] }} />{p.name}<b className="ml-2">{p.count}</b></div>)}
                <div className="text-xs text-muted pt-1">Yearly {d.cycleSplit.yearlyPct}% · Monthly {d.cycleSplit.monthlyPct}%</div>
              </div>
            </div>
          </div>
        </div>
        <div className="grid xl:grid-cols-[1fr_400px] gap-4">
          <div className="card overflow-hidden">
            <div className="flex justify-between items-center p-4"><div className="font-bold">Latest sales</div><Link href="/payments" className="btn-outline btn-sm">View all</Link></div>
            <Table>
              <thead><tr><th className="th">Customer</th><th className="th">Plan</th><th className="th text-right">List price</th><th className="th text-right">Sold at</th><th className="th">Paid via</th><th className="th">When</th></tr></thead>
              <tbody>{d.latestSales.map((s: any) => (
                <tr key={s.id} className="hover:bg-canvas/60">
                  <td className="td"><Link href={`/customers/${s.businessId}`} className="font-semibold hover:text-brand">{s.customer}</Link><div className="text-xs text-muted">{s.city}</div></td>
                  <td className="td"><PlanBadge name={s.plan} /></td><td className="td text-right text-muted">{inr(s.listPrice)}</td>
                  <td className="td text-right"><div className="font-bold">{inr(s.price)}</div>{s.custom && <div className="text-[11px] text-warn font-semibold">custom price</div>}</td>
                  <td className="td text-sm">{s.via}</td><td className="td text-muted text-sm whitespace-nowrap">{when(s.at)}</td>
                </tr>))}
              </tbody>
            </Table>
          </div>
          <div className="card flex flex-col">
            <div className="flex justify-between p-4 border-b border-line"><div className="font-bold">Expiring soon</div><div className="text-xs text-muted">{d.renewalsDue.count} in 30 days</div></div>
            <div className="flex-1 divide-y divide-line">{d.renewalsDue.list.map((c: any) => (
              <Link key={c.id} href={`/customers/${c.id}`} className="flex justify-between items-center px-4 py-3 hover:bg-canvas">
                <div><div className="text-sm font-semibold">{c.name}</div><div className="text-xs text-muted">{c.plan?.name} · {inr(c.price || c.listPrice)}</div></div>
                <span className={cx("pill", c.daysLeft <= 3 ? "bg-bad-50 text-bad" : "bg-warn-50 text-warn")}>{c.daysLeft} days</span>
              </Link>))}</div>
            <div className="p-4"><button className="btn-wa btn-sm h-9" onClick={remindAll}><MessageCircle className="size-4" />Send renewal link to all</button></div>
          </div>
        </div>
      </>}
      <Modal open={!!links} onClose={() => setLinks(null)} title={`Renewal links · ${links?.count || 0}`}>
        <div className="space-y-2">{links?.list.map((l: any) => (
          <a key={l.paymentId} href={l.whatsapp} target="_blank" rel="noreferrer" className="flex justify-between items-center rounded-xl border border-line px-3 py-2.5 hover:bg-canvas">
            <span className="font-semibold text-sm">{l.name}</span><span className="text-sm font-bold text-wa">{inr(l.amount)} · WhatsApp</span></a>))}
          {links && !links.list.length && <div className="text-sm text-muted">Everyone due is on autopay 👍</div>}
        </div>
      </Modal>
    </div>
  );
}
