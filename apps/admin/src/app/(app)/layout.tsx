"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { MeCtx, type Me } from "@/lib/me";
import { LayoutDashboard, Building2, CirclePlus, RefreshCw, Layers, Wallet, Plug, ChartColumn, Users, Settings, Search, Bell, Calendar, LogOut, Menu } from "lucide-react";
import { api, auth, dm } from "@/lib/api";
import { Logo, Avatar, Loading, cx } from "@/components/ui";


type Item = { href: string; label: string; icon: typeof LayoutDashboard; badge?: "customers" | "renewals"; superOnly?: boolean };
const NAV: { group: string; items: Item[] }[] = [
  { group: "Overview", items: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }, { href: "/customers", label: "Customers", icon: Building2, badge: "customers" },
    { href: "/sales/new", label: "New Sale", icon: CirclePlus }, { href: "/renewals", label: "Renewals", icon: RefreshCw, badge: "renewals" },
  ] },
  { group: "Billing & Money", items: [
    { href: "/plans", label: "Plans & Pricing", icon: Layers }, { href: "/payments", label: "Payments", icon: Wallet },
    { href: "/gateway", label: "Payment Gateway", icon: Plug, superOnly: true },
  ] },
  { group: "Business", items: [
    { href: "/reports", label: "Sales Reports", icon: ChartColumn }, { href: "/team", label: "Team & Partners", icon: Users, superOnly: true },
    { href: "/settings", label: "Settings", icon: Settings },
  ] },
];

function ago(d: string | null) {
  if (!d) return "no payments yet";
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : dm(d);
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [counts, setCounts] = useState<{ customers: number; renewals: number }>({ customers: 0, renewals: 0 });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => { if (!auth.token()) { location.href = "/login"; return; } api("/me").then(setMe).catch(() => {}); }, []);
  useEffect(() => { api("/customers").then((c) => setCounts((x) => ({ ...x, customers: c.counts.active }))).catch(() => {}); api("/renewals").then((r) => setCounts((x) => ({ ...x, renewals: r.stats.dueCount }))).catch(() => {}); }, [path]);
  useEffect(() => setOpen(false), [path]);
  if (!me) return <Loading label="Loading admin…" />;
  const roleLabel = me.admin.role === "SUPER_ADMIN" ? "Super Admin" : me.admin.role === "PARTNER" ? "Partner" : "Sales";
  const sidebar = (
    <aside className="w-[236px] shrink-0 bg-white border-r border-line flex flex-col h-full">
      <div className="px-5 h-16 flex items-center"><Logo /></div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((g) => (
          <div key={g.group} className="mt-4">
            <div className="px-3 mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.18em] text-faint">{g.group}</div>
            {g.items.filter((i) => !i.superOnly || me.admin.role === "SUPER_ADMIN").map((i) => {
              const active = path === i.href || (i.href !== "/dashboard" && path.startsWith(i.href));
              const n = i.badge ? counts[i.badge] : 0;
              return (
                <Link key={i.href} href={i.href} className={cx("flex items-center gap-3 rounded-xl px-3 h-10 text-[13.5px] font-semibold mb-0.5", active ? "bg-brand-50 text-brand" : "text-ink/80 hover:bg-canvas")}>
                  <i.icon className="size-[18px]" /><span className="flex-1">{i.label}</span>
                  {n > 0 && <span className="min-w-6 h-5 px-1.5 rounded-full bg-amber-400 text-white text-[11px] font-bold grid place-items-center">{n}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="p-3 space-y-2 border-t border-line">
        <div className={cx("rounded-xl px-3 py-2.5", me.gateway.razorpay ? "bg-ok-50" : "bg-warn-50")}>
          <div className={cx("text-[13px] font-bold flex items-center gap-2", me.gateway.razorpay ? "text-ok" : "text-warn")}><span className="size-2 rounded-full bg-current" />Razorpay {me.gateway.razorpay ? (me.gateway.live ? "live" : "test mode") : "not connected"}</div>
          <div className="text-[11px] text-muted">Last payment {ago(me.gateway.lastPaymentAt)}</div>
        </div>
        <div className="flex items-center gap-2.5 px-1">
          <Avatar name="J X" />
          <div className="flex-1 min-w-0"><div className="text-[13px] font-bold truncate">{me.admin.role === "SUPER_ADMIN" ? "Super Admin" : me.admin.name}</div><div className="text-[11px] text-muted truncate">{me.admin.role === "SUPER_ADMIN" ? "Jippronex Technologies" : roleLabel}</div></div>
          <button className="btn-ghost btn-sm" title="Logout" onClick={() => { auth.clear(); location.href = "/login"; }}><LogOut className="size-4" /></button>
        </div>
      </div>
    </aside>
  );
  return (
    <MeCtx.Provider value={me}>
      <div className="flex h-screen overflow-hidden">
        <div className="hidden lg:flex">{sidebar}</div>
        {open && <div className="fixed inset-0 z-40 flex lg:hidden"><div className="h-full">{sidebar}</div><div className="flex-1 bg-ink/40" onClick={() => setOpen(false)} /></div>}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 shrink-0 bg-white border-b border-line flex items-center gap-3 px-4 lg:px-6">
            <button className="lg:hidden btn-ghost btn-sm" onClick={() => setOpen(true)}><Menu className="size-5" /></button>
            <form className="relative w-full max-w-md" onSubmit={(e) => { e.preventDefault(); router.push(`/customers?q=${encodeURIComponent(q)}`); }}>
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input className="input pl-9 bg-canvas border-transparent" placeholder="Search customer, mobile, GSTIN, payment ID…" value={q} onChange={(e) => setQ(e.target.value)} />
            </form>
            <div className="flex-1" />
            <span className="hidden md:inline-flex chip"><Calendar className="size-4" />{new Date().toLocaleString("en-IN", { month: "short", year: "numeric" })}</span>
            <Link href="/renewals" className="relative btn-outline w-10 px-0"><Bell className="size-4" />{counts.renewals > 0 && <span className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-bad text-white text-[10px] font-bold grid place-items-center">{counts.renewals}</span>}</Link>
            <Link href="/sales/new" className="btn-primary"><CirclePlus className="size-4" /><span className="hidden sm:inline">New Sale</span></Link>
          </header>
          <main className="flex-1 overflow-y-auto"><div className="p-4 lg:p-6 max-w-[1400px] mx-auto">{children}</div></main>
        </div>
      </div>
    </MeCtx.Provider>
  );
}
