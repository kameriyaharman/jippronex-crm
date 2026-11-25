import * as SecureStoreNative from "expo-secure-store";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

/** API base: EXPO_PUBLIC_API_URL (set in eas.json / .env) → app.json extra.apiUrl */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || (Constants.expoConfig?.extra as any)?.apiUrl || "http://10.0.2.2:4000").replace(/\/$/, "");

// SecureStore on device; localStorage only for the web preview
const SecureStore = Platform.OS === "web"
  ? { getItemAsync: async (k: string) => globalThis.localStorage?.getItem(k) ?? null, setItemAsync: async (k: string, v: string) => globalThis.localStorage?.setItem(k, v), deleteItemAsync: async (k: string) => globalThis.localStorage?.removeItem(k) }
  : SecureStoreNative;

let token: string | null = null;
let businessId: string | null = null;
let onUnauthorized: (() => void) | null = null;
let loading: Promise<string | null> | null = null;

export const auth = {
  load() {
    if (!loading) loading = (async () => {
      token = await SecureStore.getItemAsync("jx_token");
      businessId = await SecureStore.getItemAsync("jx_business");
      return token;
    })();
    return loading;
  },
  async set(t: string, b?: string | null) {
    token = t; await SecureStore.setItemAsync("jx_token", t);
    if (b) { businessId = b; await SecureStore.setItemAsync("jx_business", b); }
  },
  async setBusiness(b: string) { businessId = b; await SecureStore.setItemAsync("jx_business", b); },
  async clear() { token = null; businessId = null; await SecureStore.deleteItemAsync("jx_token"); await SecureStore.deleteItemAsync("jx_business"); },
  get token() { return token; },
  get business() { return businessId; },
  onUnauthorized(fn: () => void) { onUnauthorized = fn; },
};

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  await auth.load();
  const headers: Record<string, string> = { "x-client": "android" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (businessId) headers["x-business-id"] = businessId;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, { method: opts.method || (opts.body !== undefined ? "POST" : "GET"), headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  } catch {
    throw new ApiError(0, "No internet connection. Please check and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth")) onUnauthorized?.();
    throw new ApiError(res.status, (data as any).error || "Something went wrong");
  }
  return data as T;
}

/** Fetches on mount and every time the screen comes back into focus. */
export function useApi<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setLoading(true);
    try { const d = await api<T>(path); if (n === seq.current) { setData(d); setError(null); } }
    catch (e: any) { if (n === seq.current) setError(e.message); }
    finally { if (n === seq.current) setLoading(false); }
  }, [path]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load };
}

export const inr = (n: number | null | undefined, dec = false) =>
  n == null ? "—" : "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 });
export const inr2 = (n: number) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const short = (n: number | null | undefined) => {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  return inr(n);
};
export const qty = (n: number) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const IST = 5.5 * 3600e3;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dm = (d?: string | Date | null) => { if (!d) return "—"; const x = new Date(new Date(d).getTime() + IST); return `${String(x.getUTCDate()).padStart(2, "0")} ${MON[x.getUTCMonth()]}`; };
export const dt = (d?: string | Date | null) => { if (!d) return "—"; const x = new Date(new Date(d).getTime() + IST); return `${dm(d)} ${x.getUTCFullYear()}`; };
export const tm = (d?: string | Date | null) => { if (!d) return ""; const x = new Date(new Date(d).getTime() + IST); const h = x.getUTCHours(); return `${((h + 11) % 12) + 1}:${String(x.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
export const isoDate = (d = new Date()) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
export const ym = (d = new Date()) => isoDate(d).slice(0, 7);
export const initials = (s?: string | null) => (s || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
