"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");
const TOKEN = "jx_token";
const BIZ = "jx_business";

export const auth = {
  token: () => (typeof window === "undefined" ? null : localStorage.getItem(TOKEN)),
  business: () => (typeof window === "undefined" ? null : localStorage.getItem(BIZ)),
  set(token: string, businessId?: string | null) {
    localStorage.setItem(TOKEN, token);
    if (businessId) localStorage.setItem(BIZ, businessId);
  },
  setBusiness: (id: string) => localStorage.setItem(BIZ, id),
  clear() { localStorage.removeItem(TOKEN); localStorage.removeItem(BIZ); },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; raw?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { "x-client": "web" };
  const t = auth.token();
  if (t) headers.Authorization = `Bearer ${t}`;
  const b = auth.business();
  if (b) headers["x-business-id"] = b;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_URL}/api${path}`, { method: opts.method || (opts.body ? "POST" : "GET"), headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  if (opts.raw) { if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).error || "Failed"); return res as any; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth")) { auth.clear(); location.href = "/login"; }
    if (res.status === 428 && typeof window !== "undefined") location.href = "/setup";
    throw new ApiError(res.status, data.error || "Something went wrong");
  }
  return data as T;
}

/** Downloads an Excel/PDF endpoint with auth */
export async function download(path: string, filename: string) {
  const res: Response = await api(path, { raw: true });
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function useApi<T = any>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const d = await api<T>(path);
      if (n === seq.current) { setData(d); setError(null); }
    } catch (e: any) { if (n === seq.current) setError(e.message); }
    finally { if (n === seq.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

// ── formatting ──
export const inr = (n: number | null | undefined, dec = false) =>
  n == null ? "—" : "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 });
export const inr2 = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const short = (n: number | null | undefined) => {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return inr(n);
};
export const qty = (n: number) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: 3 });
export const dt = (d: string | Date | null | undefined, o: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }) =>
  d ? new Date(d).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", ...o }) : "—";
export const dm = (d: string | Date | null | undefined) => dt(d, { day: "2-digit", month: "short" });
export const tm = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : "");
export const ym = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 7);
export const initials = (s?: string | null) => (s || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
export const isoDate = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
