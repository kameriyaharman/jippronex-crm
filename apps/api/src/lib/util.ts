import type { Request, Response, NextFunction } from "express";
import { z, ZodError, type ZodTypeAny } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}
export const bad = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const notFound = (what = "Not found") => new HttpError(404, what);
export const forbidden = (msg = "You don't have permission for this") => new HttpError(403, msg);

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw bad(r.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "), r.error.issues);
  return r.data;
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err instanceof ZodError) return res.status(400).json({ error: "Invalid input", details: err.issues });
  // Postgres unique violation
  if (err?.code === "23505" || err?.cause?.code === "23505") {
    const detail = err.detail || err.cause?.detail || "";
    return res.status(409).json({ error: `Already exists ${detail}`.trim() });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
}

// ── money ──
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
export const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v));

// ── phone ──
export function normPhone(p: string) {
  const d = String(p).replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

// ── dates (IST) ──
const IST = 5.5 * 3600 * 1000;
/** Start of today in IST, as a UTC Date */
export function istStartOfDay(d = new Date()) {
  const t = new Date(d.getTime() + IST);
  t.setUTCHours(0, 0, 0, 0);
  return new Date(t.getTime() - IST);
}
export function istParts(d = new Date()) {
  const t = new Date(d.getTime() + IST);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), dow: t.getUTCDay() };
}
export function istMonthStart(y: number, m: number) {
  return new Date(Date.UTC(y, m, 1) - IST);
}
/** Indian FY (Apr–Mar) containing date */
export function fyRange(d = new Date()) {
  const { y, m } = istParts(d);
  const startY = m >= 3 ? y : y - 1;
  return { from: istMonthStart(startY, 3), to: istMonthStart(startY + 1, 3), label: `FY ${startY}-${String(startY + 1).slice(2)}`, startY };
}
export function rangeFor(range: string | undefined, d = new Date()) {
  const today = istStartOfDay(d);
  const { y, m, dow } = istParts(d);
  switch (range) {
    case "week": {
      const back = (dow + 6) % 7; // Monday start
      return { from: new Date(today.getTime() - back * 86400000), to: new Date(today.getTime() + 86400000) };
    }
    case "month":
      return { from: istMonthStart(y, m), to: istMonthStart(y, m + 1) };
    case "fy": {
      const f = fyRange(d);
      return { from: f.from, to: f.to };
    }
    default:
      return { from: today, to: new Date(today.getTime() + 86400000) };
  }
}
/** "2026-11" → month range */
export function monthRange(ym?: string) {
  if (!ym) {
    const { y, m } = istParts();
    return { from: istMonthStart(y, m), to: istMonthStart(y, m + 1), y, m };
  }
  const [y, mm] = ym.split("-").map(Number);
  return { from: istMonthStart(y, mm - 1), to: istMonthStart(y, mm), y, m: mm - 1 };
}
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
export function addMonths(d: Date, n: number) {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + n);
  return x;
}

// ── amount in words (Indian system) ──
const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function two(n: number): string {
  if (n < 20) return ones[n];
  return tens[Math.floor(n / 10)] + (n % 10 ? "-" + ones[n % 10] : "");
}
function three(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  return [h ? ones[h] + " Hundred" : "", r ? two(r) : ""].filter(Boolean).join(" ");
}
export function amountInWords(amount: number) {
  let n = Math.round(Math.abs(amount));
  if (n === 0) return "Zero Rupees Only";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(three(crore) + " Crore");
  if (lakh) parts.push(two(lakh) + " Lakh");
  if (thousand) parts.push(two(thousand) + " Thousand");
  if (n) parts.push(three(n));
  return parts.join(" ") + " Rupees Only";
}
