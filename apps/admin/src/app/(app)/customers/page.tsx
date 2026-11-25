"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CirclePlus, FileSpreadsheet, Search } from "lucide-react";
import { useApi, inr, dt, download } from "@/lib/api";
import { PageHeader, Loading, Empty, Table } from "@/components/ui";
import { PlanBadge, CustStatus } from "@/components/admin";

const TABS: [string, string][] = [["all", "All"], ["active", "Active"], ["trial", "Trial"], ["expiring", "Expiring"], ["expired", "Expired"], ["custom", "Custom price"], ["failed", "Failed"]];
const CYCLE: Record<string, string> = { YEARLY: "Yearly", MONTHLY: "Monthly", TWO_YEAR: "2 years", LIFETIME: "Lifetime", TRIAL: "Trial" };

function Customers() {
  const sp = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState(sp.get("q") || "");
  const [city, setCity] = useState("");
  const [seller, setSeller] = useState("");
  const { data } = useApi<any>(`/customers?tab=${tab}&q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}&seller=${seller}`);
  const { data: team } = useApi<any>("/sellers");
  return (
    <div>
      <PageHeader title="Customers" sub="Every business that bought JipproBill — plan, price, who sold it, validity">
        <button className="btn-outline" onClick={() => download("/reports/customers.xlsx", "jippronex-customers.xlsx")}><FileSpreadsheet className="size-4" />Export</button>
        <Link href="/sales/new" className="btn-primary"><CirclePlus className="size-4" />New Sale</Link>
      </PageHeader>
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
          {TABS.map(([k, l]) => <button key={k} className="chip" data-on={tab === k} onClick={() => setTab(k)}>{l}{data && <span className="opacity-70">{data.counts[k]}</span>}</button>)}
          <div className="flex-1" />
          <div className="relative"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input className="input h-9 pl-9 w-52" placeholder="Name / mobile / GSTIN" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="input h-9 w-36" value={city} onChange={(e) => setCity(e.target.value)}><option value="">All cities</option>{data?.cities.map((c: string) => <option key={c}>{c}</option>)}</select>
          <select className="input h-9 w-36" value={seller} onChange={(e) => setSeller(e.target.value)}><option value="">All sellers</option><option value="direct">Direct</option>{team?.sellers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </div>
        {!data ? <Loading /> : !data.rows.length ? <Empty title="No customers" /> : (
          <Table>
            <thead><tr>{["Business / Owner", "City", "Plan", "Cycle", "List", "Sold at", "Sold by", "Validity", "Status"].map((h) => <th key={h} className={`th ${h === "List" || h === "Sold at" ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>{data.rows.map((c: any) => (
              <tr key={c.id} className="hover:bg-canvas/60 cursor-pointer" onClick={() => router.push(`/customers/${c.id}`)}>
                <td className="td"><div className="font-semibold">{c.name}</div><div className="text-xs text-muted">{c.owner?.name} · {c.owner?.phone}</div></td>
                <td className="td text-sm">{c.city}{c.state ? `, ${c.state.split(" ").map((w: string) => w[0]).join("")}` : ""}</td>
                <td className="td"><PlanBadge code={c.plan?.code} name={c.plan?.name} /></td>
                <td className="td text-sm">{CYCLE[c.cycle] || "—"}</td>
                <td className="td text-right text-muted">{c.cycle === "TRIAL" ? "₹0" : inr(c.listPrice)}{c.cycle === "MONTHLY" ? "" : ""}</td>
                <td className="td text-right">{c.cycle === "TRIAL" ? "—" : <><div className="font-bold">{inr(c.price)}</div>{c.discountPct > 0 && <div className="text-[11px] text-warn font-semibold">−{c.discountPct}% {c.couponId ? "coupon" : "custom"}</div>}</>}</td>
                <td className="td text-sm whitespace-nowrap">{c.soldBy}</td>
                <td className="td text-xs whitespace-nowrap">{c.subscription ? <>{dt(c.subscription.startsAt, { day: "2-digit", month: "short", year: "2-digit" })}<div className="text-muted">to {c.subscription.endsAt ? dt(c.subscription.endsAt, { day: "2-digit", month: "short", year: "2-digit" }) : "lifetime"}</div></> : "—"}</td>
                <td className="td"><CustStatus status={c.status} daysLeft={c.daysLeft} /></td>
              </tr>))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
export default function Page() { return <Suspense fallback={<Loading />}><Customers /></Suspense>; }
