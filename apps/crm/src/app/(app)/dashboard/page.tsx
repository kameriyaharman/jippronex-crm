"use client";
import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp, ShoppingCart, ArrowDownLeft, ArrowUpRight, Boxes, IndianRupee, Eye, FileText, MessageCircle, PackagePlus } from "lucide-react";
import { useApi, inr, short, dt, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Kpi, Pill, Seg, Loading, ErrorBox, Table } from "@/components/ui";

export default function Dashboard() {
  const { me, business } = useSession();
  const [range, setRange] = useState<"today" | "week" | "month">("today");
  const { data: d, error } = useApi<any>(`/dashboard?range=${range}`);
  const h = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const label = range === "today" ? "today" : range === "week" ? "this week" : "this month";
  const maxTop = Math.max(...(d?.topProducts || []).map((t: any) => t.amount), 1);
  const share = async (id: string) => {
    const inv = await api(`/invoices/${id}`);
    window.open(inv.whatsapp.link, "_blank");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight">{greet}, {me?.user.name.split(" ")[0]}👋</h1>
          <p className="text-sm text-muted">{dt(new Date(), { weekday: "long", day: "2-digit", month: "short", year: "numeric" })} · {business?.name}</p>
        </div>
        <Seg value={range} onChange={setRange} options={[{ value: "today", label: "Today" }, { value: "week", label: "This week" }, { value: "month", label: "This month" }]} />
      </div>
      <ErrorBox error={error} />
      {!d ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Kpi label={`Sales ${label}`} value={inr(d.sales.amount)} icon={<TrendingUp />} tone="ok"
              sub={d.sales.changePct != null ? `${d.sales.changePct >= 0 ? "↑" : "↓"} ${Math.abs(d.sales.changePct)}% vs ${range === "today" ? "yesterday" : "previous"}` : `${d.sales.bills} bills`}
              subTone={d.sales.changePct == null ? "muted" : d.sales.changePct >= 0 ? "ok" : "bad"} />
            <Kpi label={`Purchase ${label}`} value={inr(d.purchase.total)} icon={<ShoppingCart />} sub={`${d.purchase.bills} bills`} />
            <Kpi label="To receive" value={inr(d.toReceive.amount)} icon={<ArrowDownLeft />} tone="warn" sub={`${d.toReceive.parties} customers`} />
            <Kpi label="To pay" value={inr(d.toPay.amount)} icon={<ArrowUpRight />} tone="bad" sub={`${d.toPay.parties} suppliers`} />
            <Kpi label="Stock value" value={d.stock.value != null ? short(d.stock.value) : "—"} icon={<Boxes />} tone="violet" sub={`${d.stock.products.toLocaleString("en-IN")} products`} />
            <Kpi label="Profit (month)" value={d.profit ? inr(d.profit.month) : "—"} icon={<IndianRupee />} tone="ok" sub={d.profit ? `margin ${d.profit.marginPct}%` : "Owner only"} subTone="ok" />
          </div>

          <div className="grid xl:grid-cols-[1fr_380px] gap-4">
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="font-bold">Sales vs Purchase</div>
                <div className="text-xs text-muted flex items-center gap-3">
                  <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand" />Sales</span>
                  <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand-300" />Purchase</span>· {d.fy}
                </div>
              </div>
              <div className="h-[260px]">
                <ResponsiveContainer>
                  <BarChart data={d.chart} barGap={3}>
                    <CartesianGrid vertical={false} stroke="#eef0f5" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} stroke="#9a9db5" />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="#9a9db5" width={48} tickFormatter={(v) => (v >= 1e5 ? `₹${(v / 1e5).toFixed(0)}L` : v >= 1e3 ? `₹${(v / 1e3).toFixed(0)}k` : `₹${v}`)} />
                    <Tooltip cursor={{ fill: "#f5f7fb" }} formatter={(v: any) => inr(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e6e7f0", fontSize: 12 }} />
                    <Bar dataKey="sales" name="Sales" fill="#0b46c4" radius={[4, 4, 0, 0]} maxBarSize={18} />
                    <Bar dataKey="purchase" name="Purchase" fill="#9cc4fa" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-line">
                <div className="font-bold">Low stock alerts</div><div className="text-xs text-muted">{d.lowStockCount} items</div>
              </div>
              <div className="flex-1 divide-y divide-line">
                {d.lowStock.slice(0, 5).map((p: any) => (
                  <Link key={p.id} href={`/inventory?id=${p.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-canvas">
                    <div><div className="text-sm font-semibold">{p.name}</div><div className="text-xs text-muted">Min {p.minStock}</div></div>
                    <span className="pill bg-bad-50 text-bad"><span className="size-1.5 rounded-full bg-current" />{p.stock} {p.unit}</span>
                  </Link>
                ))}
                {!d.lowStock.length && <div className="px-5 py-8 text-sm text-muted text-center">All products are above minimum stock 👍</div>}
              </div>
              <div className="p-4"><Link href="/purchases?new=1" className="btn-primary btn-sm h-9"><PackagePlus className="size-4" />Create purchase order</Link></div>
            </div>
          </div>

          <div className="grid xl:grid-cols-[1fr_440px] gap-4">
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4"><div className="font-bold">Recent invoices</div><Link href="/sales" className="text-xs font-semibold text-brand">View all</Link></div>
              <Table>
                <thead><tr><th className="th">Invoice</th><th className="th">Customer</th><th className="th text-right">Amount</th><th className="th">Status</th><th className="th" /></tr></thead>
                <tbody>
                  {d.recent.map((i: any) => (
                    <tr key={i.id} className="hover:bg-canvas/60">
                      <td className="td font-mono text-[12.5px] font-semibold">{i.number}</td>
                      <td className="td">{i.customerName}</td>
                      <td className="td text-right font-bold">{inr(i.total)}</td>
                      <td className="td"><Pill status={i.status} /></td>
                      <td className="td"><div className="flex gap-1.5 justify-end">
                        <Link href={`/sales/${i.id}`} className="btn-outline btn-sm w-8 px-0" title="View"><Eye className="size-3.5" /></Link>
                        <Link href={`/sales/${i.id}?print=1`} className="btn-outline btn-sm w-8 px-0" title="PDF"><FileText className="size-3.5" /></Link>
                        <button onClick={() => share(i.id)} className="btn-outline btn-sm w-8 px-0 text-wa" title="WhatsApp"><MessageCircle className="size-3.5" /></button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4"><div className="font-bold">Top selling products</div><div className="text-xs text-muted">This month</div></div>
              <div className="space-y-4">
                {d.topProducts.map((t: any) => (
                  <div key={t.name}>
                    <div className="flex justify-between text-sm"><span className="font-medium">{t.name}</span><span className="font-bold">{inr(t.amount)}</span></div>
                    <div className="h-2 rounded-full bg-canvas mt-1.5"><div className="h-2 rounded-full bg-brand" style={{ width: `${(t.amount / maxTop) * 100}%` }} /></div>
                  </div>
                ))}
                {!d.topProducts.length && <div className="text-sm text-muted">No sales yet this month.</div>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
