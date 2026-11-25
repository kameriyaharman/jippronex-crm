"use client";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, ComposedChart } from "recharts";
import { Download, FileSpreadsheet } from "lucide-react";
import { useApi, inr, short, ym, download } from "@/lib/api";
import { useSession } from "@/lib/session";
import { PageHeader, Loading, Kpi, useToast } from "@/components/ui";

const REPORTS: [string, string, string?][] = [
  ["sales-register", "Sales register"], ["purchase-register", "Purchase register"], ["day-book", "Day book"], ["stock-summary", "Stock summary"],
  ["stock-movement", "Stock movement"], ["low-stock", "Low stock report"], ["outstanding", "Outstanding report"], ["expense-report", "Expense report"],
  ["profit-loss", "Profit & Loss", "accounts"], ["hsn-summary", "HSN summary"], ["item-profit", "Item-wise profit", "cost.view"], ["salesman", "Salesman report"],
  ["cash-book", "Cash book"], ["bank-book", "Bank book"],
];

export default function Reports() {
  const { can } = useSession();
  const toast = useToast();
  const [month, setMonth] = useState(ym());
  const { data: r } = useApi<any>("/reports/overview");
  const maxTop = Math.max(...(r?.topCustomers || []).map((t: any) => t.amount), 1);
  const dl = async (key: string) => {
    try { await download(`/reports/${key}.xlsx?month=${month}`, `${key}-${month}.xlsx`); } catch (e: any) { toast(e.message, "bad"); }
  };
  return (
    <div>
      <PageHeader title="Reports & Analytics" sub="Business performance at a glance — download any report in Excel">
        <span className="chip">{r?.fy || "FY"}</span>
      </PageHeader>
      {!r ? <Loading /> : <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Kpi label="Revenue (YTD)" value={short(r.revenue)} sub={r.revenueChangePct != null ? `${r.revenueChangePct >= 0 ? "↑" : "↓"} ${Math.abs(r.revenueChangePct)}% vs last year` : "first year"} subTone={(r.revenueChangePct ?? 0) >= 0 ? "ok" : "bad"} />
          <Kpi label="Gross profit (YTD)" value={r.grossProfit != null ? short(r.grossProfit) : "—"} sub={r.grossMarginPct != null ? `${r.grossMarginPct}% margin` : "Owner only"} />
          <Kpi label="Avg bill value" value={inr(r.avgBill)} sub={`${r.bills.toLocaleString("en-IN")} invoices`} />
          <Kpi label="Repeat customers" value={`${r.repeatPct}%`} sub="of total sales" />
        </div>
        <div className="grid xl:grid-cols-[1fr_380px] gap-4 mb-4">
          <div className="card p-5">
            <div className="flex justify-between mb-3"><div className="font-bold">Revenue & profit trend</div><div className="text-xs text-muted">━ Revenue ┅ Profit</div></div>
            <div className="h-[260px]"><ResponsiveContainer>
              <ComposedChart data={r.trend}>
                <defs><linearGradient id="rv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0b46c4" stopOpacity={0.18} /><stop offset="1" stopColor="#0b46c4" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="#eef0f5" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} stroke="#9a9db5" />
                <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="#9a9db5" width={48} tickFormatter={(v) => (v >= 1e5 ? `₹${(v / 1e5).toFixed(0)}L` : `₹${(v / 1e3).toFixed(0)}k`)} />
                <Tooltip formatter={(v: any) => inr(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e6e7f0", fontSize: 12 }} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#0b46c4" strokeWidth={2.5} fill="url(#rv)" />
                <Line type="monotone" dataKey="profit" name="Profit" stroke="#16a34a" strokeWidth={2} strokeDasharray="5 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer></div>
          </div>
          <div className="card p-5">
            <div className="flex justify-between mb-4"><div className="font-bold">Top customers</div><div className="text-xs text-muted">FY</div></div>
            <div className="space-y-3.5">{r.topCustomers.map((t: any) => (
              <div key={t.partyId}><div className="flex justify-between text-sm"><span className="font-medium">{t.name}</span><span className="font-bold">{inr(t.amount)}</span></div>
                <div className="h-2 rounded-full bg-canvas mt-1.5"><div className="h-2 rounded-full bg-brand" style={{ width: `${(t.amount / maxTop) * 100}%` }} /></div></div>))}</div>
          </div>
        </div>
      </>}
      <div className="card p-5">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <div><div className="font-bold">All reports</div><div className="text-xs text-muted">Excel · open in Excel / Google Sheets · print</div></div>
          <input type="month" className="input h-9 w-44" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        {!can("reports.export") ? <div className="text-sm text-muted">Report downloads are available to Owner and Accountant.</div> :
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
            {REPORTS.filter(([, , p]) => !p || can(p)).map(([k, l]) => (
              <button key={k} onClick={() => dl(k)} className="rounded-xl border border-line p-3 text-left hover:border-brand hover:bg-brand-50/40 transition group">
                <FileSpreadsheet className="size-5 text-ok mb-2" /><div className="text-sm font-semibold leading-tight">{l}</div>
                <div className="text-[11px] text-muted mt-1 flex items-center gap-1 group-hover:text-brand"><Download className="size-3" />Excel</div>
              </button>))}
          </div>}
      </div>
    </div>
  );
}
