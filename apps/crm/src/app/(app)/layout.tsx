"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  LayoutDashboard, FilePlus2, Receipt, ShoppingCart, Package, BookUser, Wallet, Landmark, ChartColumn, Settings, Search, Bell, Plus, Calendar,
  LogOut, Menu, ChevronDown, Store, Lock,
} from "lucide-react";
import { SessionProvider, useSession } from "@/lib/session";
import { api, inr, dm } from "@/lib/api";
import { Logo, Avatar, Loading, cx } from "@/components/ui";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; perm?: string; feature?: string; badge?: string };
const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Billing", items: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/billing/new", label: "New Invoice", icon: FilePlus2, perm: "invoice.create" },
    { href: "/sales", label: "Sales & Invoices", icon: Receipt },
    { href: "/purchases", label: "Purchases", icon: ShoppingCart, perm: "purchase", feature: "purchase" },
  ] },
  { group: "Business", items: [
    { href: "/inventory", label: "Inventory", icon: Package, badge: "low" },
    { href: "/parties", label: "Party Ledger", icon: BookUser, perm: "parties" },
    { href: "/payments", label: "Payments & Expenses", icon: Wallet, perm: "payments" },
  ] },
  { group: "Accounts", items: [
    { href: "/accounts", label: "Accounts & GST", icon: Landmark, perm: "accounts", feature: "accounts" },
    { href: "/reports", label: "Reports & Analytics", icon: ChartColumn },
    { href: "/settings", label: "Settings", icon: Settings },
  ] },
];

function Shell({ children }: { children: ReactNode }) {
  const { me, business, can, feature, logout, switchTo } = useSession();
  const path = usePathname();
  const [low, setLow] = useState(0);
  const [open, setOpen] = useState(false);
  const [shopMenu, setShopMenu] = useState(false);
  useEffect(() => { if (business) api("/products/summary").then((s) => setLow(s.low + s.out)).catch(() => {}); }, [business, path]);
  useEffect(() => setOpen(false), [path]);
  if (!me || !business) return <Loading label="Opening your business…" />;
  const sub = business.subscription;
  const fyStart = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;

  const sidebar = (
    <aside className="w-[240px] shrink-0 bg-white border-r border-line flex flex-col h-full">
      <div className="px-5 h-16 flex items-center"><Logo /></div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((g) => (
          <div key={g.group} className="mt-4">
            <div className="px-3 mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.18em] text-faint">{g.group}</div>
            {g.items.filter((i) => !i.perm || can(i.perm)).map((i) => {
              const active = path === i.href || (i.href !== "/dashboard" && path.startsWith(i.href) && !(i.href === "/inventory" && path === "/billing/new"));
              const locked = i.feature && !feature(i.feature);
              return (
                <Link key={i.href} href={i.href} className={cx("flex items-center gap-3 rounded-xl px-3 h-10 text-[13.5px] font-semibold mb-0.5 transition",
                  active ? "bg-brand-50 text-brand" : "text-ink/80 hover:bg-canvas")}>
                  <i.icon className="size-[18px]" strokeWidth={2} />
                  <span className="flex-1">{i.label}</span>
                  {i.badge === "low" && low > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-amber-400 text-white text-[11px] font-bold grid place-items-center">{low}</span>}
                  {locked && <Lock className="size-3.5 text-faint" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="p-3 space-y-2 border-t border-line">
        <div className="relative">
          <button onClick={() => setShopMenu(!shopMenu)} className="w-full text-left rounded-xl bg-ok-50 px-3 py-2.5 flex items-center gap-2">
            <span className="size-2 rounded-full bg-ok shrink-0" />
            <span className="flex-1 min-w-0"><span className="block text-[13px] font-bold text-ok truncate">{business.name}</span>
              <span className="block text-[10.5px] text-muted truncate">{business.gstin ? `GSTIN ${business.gstin}` : business.city || "No GSTIN"}</span></span>
            {me.businesses.length > 1 && <ChevronDown className="size-4 text-muted" />}
          </button>
          {shopMenu && me.businesses.length > 1 && (
            <div className="absolute bottom-full mb-2 left-0 right-0 card shadow-xl p-1.5 z-20">
              {me.businesses.map((b) => (
                <button key={b.id} onClick={() => switchTo(b.id)} className={cx("w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-canvas flex items-center gap-2", b.id === business.id && "text-brand font-bold")}>
                  <Store className="size-4" />{b.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2.5 px-1">
          <Avatar name={me.user.name} />
          <div className="flex-1 min-w-0"><div className="text-[13px] font-bold truncate">{me.user.name}</div>
            <div className="text-[11px] text-muted">{business.role === "OWNER" ? "Owner · Admin" : business.role[0] + business.role.slice(1).toLowerCase()}</div></div>
          <button onClick={logout} className="btn-ghost btn-sm" title="Logout"><LogOut className="size-4" /></button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden lg:flex no-print">{sidebar}</div>
      {open && <div className="fixed inset-0 z-40 flex lg:hidden no-print"><div className="h-full">{sidebar}</div><div className="flex-1 bg-ink/40" onClick={() => setOpen(false)} /></div>}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 shrink-0 bg-white border-b border-line flex items-center gap-3 px-4 lg:px-6 no-print">
          <button className="lg:hidden btn-ghost btn-sm" onClick={() => setOpen(true)}><Menu className="size-5" /></button>
          <GlobalSearch />
          <div className="flex-1" />
          <span className="hidden md:inline-flex chip"><Calendar className="size-4" />FY {fyStart}-{String(fyStart + 1).slice(2)}</span>
          <Link href="/inventory?filter=low" className="relative btn-outline w-10 px-0" title="Low stock alerts">
            <Bell className="size-4" />{low > 0 && <span className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-bad text-white text-[10px] font-bold grid place-items-center">{low}</span>}
          </Link>
          {can("invoice.create") && <Link href="/billing/new" className="btn-primary"><Plus className="size-4" /><span className="hidden sm:inline">New Invoice</span></Link>}
        </header>
        {me.impersonatedBy && <div className="bg-violet-600 text-white text-xs font-semibold text-center py-1.5 no-print">Support mode — you are logged in as {me.user.name} ({business.name})</div>}
        {sub && (!sub.usable || (sub.daysLeft != null && sub.daysLeft <= 7)) && (
          <div className={cx("text-sm font-semibold text-center py-2 no-print", sub.usable ? "bg-warn-50 text-warn" : "bg-bad-50 text-bad")}>
            {sub.usable ? `${sub.cycle === "TRIAL" ? "Free trial" : sub.plan.name} ends in ${sub.daysLeft} day${sub.daysLeft === 1 ? "" : "s"}.` : `Your ${sub.plan.name} plan has expired — billing is paused, your data is safe.`}
            {" "}<Link href="/settings?tab=plan" className="underline">Renew now</Link>
          </div>
        )}
        <main className="flex-1 overflow-y-auto"><div className="p-4 lg:p-6 max-w-[1400px] mx-auto">{children}</div></main>
      </div>
    </div>
  );
}

function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ invoices: any[]; products: any[]; parties: any[] } | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); ref.current?.focus(); } };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const t = setTimeout(async () => {
      const e = encodeURIComponent(q.trim());
      const [i, p, pt] = await Promise.all([api(`/invoices?q=${e}&limit=5`), api(`/products?q=${e}&limit=5`), api(`/parties?q=${e}`)]).catch(() => [null, null, null]);
      setRes({ invoices: i?.rows || [], products: p || [], parties: (pt?.rows || []).slice(0, 5) });
    }, 220);
    return () => clearTimeout(t);
  }, [q]);
  const go = (href: string) => { setQ(""); setRes(null); router.push(href); };
  return (
    <div className="relative w-full max-w-md">
      <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
      <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setTimeout(() => setRes(null), 200)}
        className="input pl-9 pr-12 bg-canvas border-transparent" placeholder="Search invoice, product, barcode, customer…" />
      <kbd className="hidden md:block absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-faint border border-line rounded px-1.5 py-0.5 bg-white">⌘K</kbd>
      {res && (
        <div className="absolute top-full mt-2 left-0 right-0 card shadow-2xl z-30 py-2 max-h-[70vh] overflow-y-auto">
          {!res.invoices.length && !res.products.length && !res.parties.length && <div className="px-4 py-3 text-sm text-muted">No results for “{q}”</div>}
          {res.invoices.length > 0 && <Group title="Invoices">{res.invoices.map((i) => <Row key={i.id} onClick={() => go(`/sales/${i.id}`)} a={i.number} b={`${i.customerName} · ${dm(i.date)}`} c={inr(i.total)} />)}</Group>}
          {res.parties.length > 0 && <Group title="Parties">{res.parties.map((p) => <Row key={p.id} onClick={() => go(`/parties?id=${p.id}`)} a={p.name} b={p.type === "CUSTOMER" ? "Customer" : "Supplier"} c={inr(Math.abs(p.balance))} />)}</Group>}
          {res.products.length > 0 && <Group title="Products">{res.products.map((p) => <Row key={p.id} onClick={() => go(`/inventory?id=${p.id}`)} a={p.name} b={p.barcode || ""} c={`${p.stock} ${p.unit}`} />)}</Group>}
        </div>
      )}
    </div>
  );
}
const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <div><div className="px-4 pt-2 pb-1 text-[10.5px] font-bold uppercase tracking-widest text-faint">{title}</div>{children}</div>
);
const Row = ({ a, b, c, onClick }: { a: string; b: string; c: string; onClick: () => void }) => (
  <button onMouseDown={onClick} className="w-full px-4 py-2 flex items-center gap-3 hover:bg-canvas text-left">
    <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{a}</div><div className="text-xs text-muted truncate">{b}</div></div>
    <div className="text-sm font-bold">{c}</div>
  </button>
);

export default function AppLayout({ children }: { children: ReactNode }) {
  return <SessionProvider><Shell>{children}</Shell></SessionProvider>;
}

