"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, auth } from "./api";

export type Business = {
  id: string; name: string; gstin: string | null; city: string | null; role: "OWNER" | "BILLING" | "ACCOUNTANT" | "STORE";
  subscription: null | { status: string; daysLeft: number | null; endsAt: string | null; cycle: string; usable: boolean; plan: { name: string; code: string; features: Record<string, boolean> } };
};
type Me = { user: { id: string; name: string; phone: string; email?: string }; businesses: Business[]; impersonatedBy?: string };

const PERMS: Record<string, string[]> = {
  OWNER: ["invoice.create", "invoice.edit", "cost.view", "stock.adjust", "accounts", "reports.export", "purchase", "parties", "settings", "payments"],
  BILLING: ["invoice.create", "parties", "payments"],
  ACCOUNTANT: ["cost.view", "accounts", "reports.export", "parties", "payments"],
  STORE: ["stock.adjust", "purchase"],
};

type Ctx = { me: Me | null; business: Business | null; can: (p: string) => boolean; feature: (f: string) => boolean; switchTo: (id: string) => void; logout: () => void; refresh: () => Promise<void> };
const SessionCtx = createContext<Ctx>(null as any);

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const refresh = useCallback(async () => {
    if (!auth.token()) { router.replace("/login"); return; }
    try {
      const m = await api<Me & { needsSetup: boolean }>("/auth/me");
      if (m.needsSetup) { router.replace("/setup"); return; }
      if (!m.businesses.find((b) => b.id === auth.business())) auth.setBusiness(m.businesses[0].id);
      setMe(m);
    } catch { /* api() redirects on 401 */ }
  }, [router]);
  useEffect(() => { refresh(); }, [refresh]);
  const business = me?.businesses.find((b) => b.id === auth.business()) || me?.businesses[0] || null;
  const value: Ctx = {
    me, business, refresh,
    can: (p) => !!business && PERMS[business.role]?.includes(p),
    feature: (f) => !!business?.subscription?.plan.features?.[f],
    switchTo: (id) => { auth.setBusiness(id); location.href = "/dashboard"; },
    logout: () => { auth.clear(); location.href = "/login"; },
  };
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
export const useSession = () => useContext(SessionCtx);
