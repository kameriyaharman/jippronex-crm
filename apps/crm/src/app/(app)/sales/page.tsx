"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, FileSpreadsheet, Eye, FileText, MessageCircle, Search } from "lucide-react";
import { useApi, inr, dm, ym, download, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { PageHeader, Pill, Loading, Empty, Table, Kpi, cx } from "@/components/ui";

const KINDS = [["INVOICE", "Invoices"], ["QUOTATION", "Quotations"], ["CREDIT_NOTE", "Credit notes"], ["DELIVERY_CHALLAN", "Challans"], ["PROFORMA", "Proforma"]];

function Sales() {
  const sp = useSearchParams();
  const router = useRouter();
  const { can } = useSession();
  const kind = sp.get("kind") || "INVOICE";
  const [tab, setTab] = useState("all");
  const [month, setMonth] = useState(ym());
  const [q, setQ] = useState("");
  const { data, loading } = useApi<any>(`/invoices?kind=${kind}&tab=${tab}&month=${month}&q=${encodeURIComponent(q)}`);
  const c = data?.counts;
  const wa = async (id: string) => { const inv = await api(`/invoices/${id}`); window.open(inv.whatsapp.link, "_blank"); };
  const tabs = kind === "INVOICE" ? [["all", "All", c?.all], ["gst", "GST", c?.gst], ["nongst", "Non-GST", c?.nongst], ["unpaid", "Unpaid", c?.unpaid], ["partial", "Partial", c?.partial]] : [["all", "All", c?.all]];
  return (
    <div>
      <PageHeader title="Sales & Invoices" sub="All GST & non-GST invoices — search, print, share, collect">
        {can("reports.export") && <button className="btn-outline" onClick={() => download(`/reports/sales-register.xlsx?month=${month}`, `sales-${month}.xlsx`)}><FileSpreadsheet className="size-4" />Excel</button>}
        {can("invoice.create") && <Link href={`/billing/new${kind !== "INVOICE" ? `?kind=${kind}` : ""}`} className="btn-primary"><Plus className="size-4" />New {kind === "INVOICE" ? "Invoice" : KINDS.find((k) => k[0] === kind)?.[1].replace(/s$/, "")}</Link>}
      </PageHeader>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {KINDS.map(([k, l]) => <button key={k} className={cx("btn-sm btn", kind === k ? "bg-ink text-white" : "text-muted hover:bg-white")} onClick={() => { setTab("all"); router.replace(`/sales?kind=${k}`); }}>{l}</button>)}
      </div>
      <div className="grid xl:grid-cols-[1fr_280px] gap-4 items-start">
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
            {tabs.map(([k, l, n]) => <button key={k as string} data-on={tab === k} className="chip" onClick={() => setTab(k as string)}>{l}{n != null && <span className="opacity-70">{n}</span>}</button>)}
            <div className="flex-1" />
            <div className="relative"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input className="input h-9 pl-9 w-56" placeholder="Bill no / customer" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <input type="month" className="input h-9 w-40" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          {loading && !data ? <Loading /> : !data?.rows.length ? <Empty title="No bills found" sub="Try another month or filter" /> : (
            <Table>
              <thead><tr><th className="th">Invoice</th><th className="th">Customer</th><th className="th text-right">Amount</th><th className="th text-right">Balance</th><th className="th">Status</th><th className="th text-right">View · PDF · WA</th></tr></thead>
              <tbody>{data.rows.map((i: any) => (
                <tr key={i.id} className="hover:bg-canvas/60 cursor-pointer" onClick={() => router.push(`/sales/${i.id}`)}>
                  <td className="td"><div className="font-mono font-semibold text-[12.5px]">{i.number}</div><div className="text-xs text-muted">{dm(i.date)} · {i.billType === "GST" ? "GST" : "Non-GST"}</div></td>
                  <td className="td font-medium">{i.customerName}</td>
                  <td className="td text-right font-bold">{inr(i.total)}</td>
                  <td className="td text-right">{i.balance > 0 ? <span className="text-bad font-semibold">{inr(i.balance)}</span> : <span className="text-faint">—</span>}</td>
                  <td className="td">{kind === "INVOICE" ? <Pill status={i.status} /> : i.convertedToId ? <Pill status="ACTIVE">Converted</Pill> : <Pill status="TRIAL">Open</Pill>}</td>
                  <td className="td" onClick={(e) => e.stopPropagation()}><div className="flex gap-1.5 justify-end">
                    <Link href={`/sales/${i.id}`} className="btn-outline btn-sm w-8 px-0"><Eye className="size-3.5" /></Link>
                    <Link href={`/sales/${i.id}?print=1`} className="btn-outline btn-sm w-8 px-0"><FileText className="size-3.5" /></Link>
                    <button onClick={() => wa(i.id)} className="btn-outline btn-sm w-8 px-0 text-wa"><MessageCircle className="size-3.5" /></button>
                  </div></td>
                </tr>))}
              </tbody>
            </Table>
          )}
        </div>
        {kind === "INVOICE" && c && <div className="grid grid-cols-2 xl:grid-cols-1 gap-3">
          <Kpi label="Total sales" value={inr(c.total)} sub={`${c.all} bills`} />
          <Kpi label="GST collected" value={inr(c.gstCollected)} />
          <Kpi label="Received" value={inr(c.received)} subTone="ok" sub="collected" />
          <Kpi label="Pending" value={inr(c.pending)} sub={`${c.unpaid + c.partial} bills`} subTone="bad" />
        </div>}
      </div>
    </div>
  );
}
export default function Page() { return <Suspense fallback={<Loading />}><Sales /></Suspense>; }
