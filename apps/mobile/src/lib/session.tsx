import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, auth } from "./api";

export type Business = {
  id: string; name: string; gstin: string | null; city: string | null; role: "OWNER" | "BILLING" | "ACCOUNTANT" | "STORE";
  subscription: null | { status: string; daysLeft: number | null; endsAt: string | null; cycle: string; usable: boolean; plan: { name: string; code: string; features: Record<string, boolean> } };
};
export type Me = { user: { id: string; name: string; phone: string }; businesses: Business[]; needsSetup: boolean };

const PERMS: Record<string, string[]> = {
  OWNER: ["invoice.create", "invoice.edit", "cost.view", "stock.adjust", "accounts", "reports.export", "purchase", "parties", "settings", "payments"],
  BILLING: ["invoice.create", "parties", "payments"],
  ACCOUNTANT: ["cost.view", "accounts", "reports.export", "parties", "payments"],
  STORE: ["stock.adjust", "purchase"],
};

type Ctx = { me: Me | null; business: Business | null; refresh: () => Promise<Me | null>; can: (p: string) => boolean; feature: (f: string) => boolean; logout: () => Promise<void>; setMe: (m: Me | null) => void };
const C = createContext<Ctx>(null as any);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const refresh = useCallback(async () => {
    try {
      const m = await api<Me>("/auth/me");
      if (m.businesses.length && !m.businesses.find((b) => b.id === auth.business)) await auth.setBusiness(m.businesses[0].id);
      setMe(m);
      return m;
    } catch { return null; }
  }, []);
  // Deep links / reloads skip the splash: load the session on mount if logged in
  useEffect(() => { auth.load().then((t) => { if (t) refresh(); }); }, [refresh]);
  const business = me?.businesses.find((b) => b.id === auth.business) || me?.businesses[0] || null;
  const value: Ctx = {
    me, business, refresh, setMe,
    can: (p) => !!business && !!PERMS[business.role]?.includes(p),
    feature: (f) => !!business?.subscription?.plan.features?.[f],
    logout: async () => { await auth.clear(); setMe(null); },
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
export const useSession = () => useContext(C);
