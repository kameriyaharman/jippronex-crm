"use client";
import { Download } from "lucide-react";
import { useApi, inr, short, download } from "@/lib/api";
import { PageHeader, Kpi, Loading, Table } from "@/components/ui";

export default function Reports() {
  const { data: r } = useApi<any>("/reports");
  if (!r) return <Loading />;
  const maxCity = Math.max(...r.cities.map((c: any) => c.count), 1);
  const total = r.licences || 1;
  return (
    <div className="space-y-4">
      <PageHeader title="Sales Reports" sub="How many sold, at what price, by whom — and where">
        <span className="chip">{r.fy}</span>
        <button className="btn-primary" onClick={() => download("/reports/customers.xlsx", "jippronex-customers.xlsx")}><Download className="size-4" />Download</button>
      </PageHeader>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Kpi label="Licences sold (YTD)" value={r.licences} sub={`${r.active} active`} />
        <Kpi label="Revenue (YTD)" value={short(r.revenue)} sub="excl. GST" />
        <Kpi label="Avg selling price" value={inr(r.avgPrice)} sub={`list avg ${inr(r.avgList)}`} />
        <Kpi label="Discount given" value={short(r.discount)} sub={`${r.customCount} custom prices`} />
        <Kpi label="Partner commission" value={short(r.commission.total)} sub={`${inr(r.commission.unpaid)} unpaid`} subTone="bad" />
      </div>
      <div className="grid xl:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="card overflow-hidden">
          <div className="flex justify-between p-4 border-b border-line"><div className="font-bold">Sales by seller</div><div className="text-xs text-muted">Staff & partners</div></div>
          <Table>
            <thead><tr><th className="th">Seller</th><th className="th">Type</th><th className="th text-right">Sold</th><th className="th text-right">Revenue</th><th className="th text-right">Commission</th><th className="th text-right">Payable</th></tr></thead>
            <tbody>{r.bySeller.map((s: any) => (
              <tr key={s.id}><td className="td font-semibold">{s.name}{s.type === "STAFF" ? " (sales)" : ""}</td>
                <td className="td text-sm">{s.type === "PARTNER" ? `Partner${s.city ? " · " + s.city : ""}` : s.type === "STAFF" ? "Staff" : "Direct"}</td>
                <td className="td text-right">{s.sold}</td><td className="td text-right font-bold">{short(s.revenue)}</td>
                <td className="td text-right text-sm">{s.commissionPct ? `${s.commissionPct}%` : "—"}</td>
                <td className="td text-right font-bold text-bad">{s.payable > 0 ? inr(s.payable) : "—"}</td></tr>))}
            </tbody>
          </Table>
        </div>
        <div className="card p-5">
          <div className="font-bold mb-3">Top cities</div>
          <div className="space-y-3">{r.cities.map((c: any) => (
            <div key={c.key}><div className="flex justify-between text-sm"><span className="font-medium">{c.key}</span><span className="text-muted">{c.count} customers</span></div>
              <div className="h-2 bg-canvas rounded-full mt-1"><div className="h-2 rounded-full bg-brand" style={{ width: `${(c.count / maxCity) * 100}%` }} /></div></div>))}</div>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-5"><div className="font-bold mb-3">By plan</div><div className="space-y-2">{r.byPlan.map((p: any) => <div key={p.name} className="flex justify-between text-sm"><span>{p.name}</span><span className="font-bold">{p.count} · {short(p.revenue)}</span></div>)}</div></div>
        <div className="card p-5"><div className="font-bold mb-3">By billing cycle</div><div className="space-y-2">{r.byCycle.map((c: any) => <div key={c.cycle} className="flex justify-between text-sm"><span>{c.cycle === "TWO_YEAR" ? "2 years" : c.cycle[0] + c.cycle.slice(1).toLowerCase()}</span><span className="font-bold">{c.count} · {Math.round((c.count / total) * 100)}%</span></div>)}</div></div>
        <div className="card p-5"><div className="font-bold mb-3">Sold at</div><div className="space-y-2 text-sm">
          <div className="flex justify-between"><span>List price</span><b>{r.soldAt.list} customers</b></div>
          <div className="flex justify-between"><span>Custom price</span><b>{r.soldAt.custom} customers</b></div>
          <div className="flex justify-between"><span>Coupon</span><b>{r.soldAt.coupon} customers</b></div></div></div>
      </div>
    </div>
  );
}
