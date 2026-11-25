"use client";
import { useState } from "react";
import { FileSpreadsheet, Download, CircleCheck, Clock } from "lucide-react";
import { useApi, inr, short, ym, download, dt } from "@/lib/api";
import { useSession } from "@/lib/session";
import { PageHeader, Loading, Kpi, Upgrade, ErrorBox, cx } from "@/components/ui";

export default function Accounts() {
  const { feature, can } = useSession();
  const [month, setMonth] = useState(ym());
  const { data: a, error } = useApi<any>(feature("accounts") ? `/accounts?month=${month}` : null);
  if (!feature("accounts")) return <Upgrade what="Accounts, P&L & GST reports" />;
  const label = new Date(month + "-15").toLocaleString("en-IN", { month: "long", year: "numeric" });
  const prevLabel = new Date(new Date(month + "-15").getTime() - 31 * 864e5).toLocaleString("en-IN", { month: "long" });
  return (
    <div>
      <PageHeader title="Accounts & GST" sub="Profit & loss and GST summary — ready for your CA">
        <input type="month" className="input h-10 w-44" value={month} onChange={(e) => setMonth(e.target.value)} />
        {can("reports.export") && <>
          <button className="btn-outline" onClick={() => download(`/accounts/gstr1.xlsx?month=${month}`, `GSTR1-${month}.xlsx`)}><FileSpreadsheet className="size-4" />GSTR-1 Excel</button>
          <button className="btn-primary" onClick={() => download(`/reports/profit-loss.xlsx?month=${month}`, `PL-${month}.xlsx`)}><Download className="size-4" />Download for CA</button>
        </>}
      </PageHeader>
      <ErrorBox error={error} />
      {!a ? <Loading /> : <>
        <div className="grid xl:grid-cols-2 gap-4 mb-4">
          <div className="card p-5">
            <div className="flex justify-between mb-3"><div className="font-bold">Profit & Loss</div><div className="text-xs text-muted">{label}</div></div>
            <div className="divide-y divide-line text-sm">
              <PL k="Sales (excl. GST)" v={inr(a.pl.sales)} />
              <PL k="Less: Cost of goods sold" v={`− ${inr(a.pl.cogs)}`} muted />
              <PL k="Gross profit" v={inr(a.pl.gross)} bold />
              <PL k="Less: Expenses" v={`− ${inr(a.pl.expenses)}`} muted />
              <PL k="Other income (discount received)" v={`+ ${inr(a.pl.otherIncome)}`} muted />
            </div>
            <div className="flex justify-between items-center rounded-xl bg-ok-50 px-4 py-3 mt-3"><span className="font-bold text-ok">Net profit</span><span className="text-2xl font-extrabold text-ok">{inr(a.pl.net)}</span></div>
            <div className="text-xs text-muted mt-2">Net margin {a.pl.marginPct}% · <span className={a.pl.marginPct >= a.prevMarginPct ? "text-ok" : "text-bad"}>{a.pl.marginPct >= a.prevMarginPct ? "↑" : "↓"} {Math.abs(a.pl.marginPct - a.prevMarginPct).toFixed(1)}% vs {prevLabel}</span></div>
          </div>
          <div className="card p-5">
            <div className="flex justify-between mb-3"><div className="font-bold">GST summary</div><div className="text-xs text-muted">GSTR-3B view</div></div>
            <table className="w-full text-sm">
              <thead><tr className="text-[11px] text-muted uppercase tracking-wider"><th className="text-left py-2" /><th className="text-right">CGST</th><th className="text-right">SGST</th><th className="text-right">IGST</th><th className="text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-line">
                <G k="Output GST (on sales)" r={a.gst.output} t={a.gst.totalOutput} />
                <G k="Input GST (on purchase)" r={a.gst.input} t={a.gst.totalInput} />
                <G k="Net GST payable" r={a.gst.net} t={a.gst.totalNet} bold />
              </tbody>
            </table>
            <div className="text-sm font-bold mt-5 mb-2">GST returns</div>
            <div className="grid grid-cols-2 gap-2">
              <Ret title={`GSTR-1 · ${label.split(" ")[0]}`} sub={`B2B ${a.gstr1.b2b} · B2C ${a.gstr1.b2c} invoices`} due={a.gstr1.dueDate} />
              <Ret title={`GSTR-3B · ${label.split(" ")[0]}`} sub={`Tax ${inr(a.gst.totalNet)}`} due={a.gstr3bDue} />
              <div className="rounded-xl border border-line p-3 col-span-2 flex items-center justify-between">
                <div><div className="text-sm font-bold">HSN summary · {label.split(" ")[0]}</div><div className="text-xs text-muted">{a.hsnCodes} HSN codes</div></div>
                {can("reports.export") && <button className="btn-outline btn-sm" onClick={() => download(`/reports/hsn-summary.xlsx?month=${month}`, `HSN-${month}.xlsx`)}>Export</button>}
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Taxable sales" value={short(a.taxableSales)} sub={`B2B ${short(a.gstr1.b2bValue)} · B2C ${short(a.gstr1.b2cValue)}`} />
          <Kpi label="Non-GST sales" value={inr(a.nonGstSales.v)} sub={`${a.nonGstSales.n} bills`} />
          <Kpi label="Input tax credit" value={inr(a.itc.amount)} sub={`from ${a.itc.bills} bills`} subTone="ok" />
          <Kpi label="Stock + receivables" value={short(a.balanceSheet.stock + a.balanceSheet.receivables)} sub={`payables ${short(a.balanceSheet.payables)}`} />
        </div>
      </>}
    </div>
  );
}
const PL = ({ k, v, bold, muted }: { k: string; v: string; bold?: boolean; muted?: boolean }) => (
  <div className="flex justify-between py-2.5"><span className={cx(muted && "text-muted", bold && "font-bold")}>{k}</span><span className={cx("font-semibold", bold && "font-extrabold")}>{v}</span></div>
);
const G = ({ k, r, t, bold }: { k: string; r: any; t: number; bold?: boolean }) => (
  <tr className={cx(bold && "font-extrabold bg-brand-50/50")}><td className="py-2.5 pr-2">{k}</td><td className="text-right">{inr(r.cgst)}</td><td className="text-right">{inr(r.sgst)}</td><td className="text-right">{r.igst ? inr(r.igst) : "—"}</td><td className="text-right font-bold">{inr(t)}</td></tr>
);
const Ret = ({ title, sub, due }: { title: string; sub: string; due: string }) => {
  const past = new Date(due) < new Date();
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="text-sm font-bold">{title}</div><div className="text-xs text-muted">{sub}</div>
      <div className={cx("pill mt-2", past ? "bg-bad-50 text-bad" : "bg-brand-50 text-brand")}>{past ? <Clock className="size-3" /> : <CircleCheck className="size-3" />}Due {dt(due, { day: "2-digit", month: "short" })} · data ready</div>
    </div>
  );
};
