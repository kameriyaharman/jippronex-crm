import { Router } from "express";
import { and, asc, desc, eq, gte, ilike, lt, ne, or, sql, gt } from "drizzle-orm";
import { z } from "zod";
import { db, schema as S } from "../../db/index.js";
import { parse, notFound, bad, monthRange, rangeFor, r2, addDays, amountInWords, istStartOfDay } from "../../lib/util.js";
import { need } from "../../lib/auth.js";
import { partyLedger, recordPayment } from "../../services/core.js";
import { stateFromGstin } from "../../lib/gst.js";
import { waLink } from "../../lib/notify.js";

export const moneyRouter = Router();
const payMode = z.enum(["CASH", "UPI", "CARD", "BANK", "CHEQUE"]);

// ─────────── Parties ───────────
moneyRouter.get("/parties", async (req, res) => {
  const { type, q } = req.query as Record<string, string>;
  const b = req.businessId!;
  const where = [eq(S.parties.businessId, b)];
  if (type === "CUSTOMER" || type === "SUPPLIER") where.push(eq(S.parties.type, type));
  if (q) where.push(or(ilike(S.parties.name, `%${q}%`), ilike(S.parties.phone, `%${q}%`), ilike(S.parties.gstin, `%${q}%`))!);
  const rows = await db.select().from(S.parties).where(and(...where)).orderBy(desc(sql`abs(${S.parties.balance})`), asc(S.parties.name)).limit(500);
  const [t] = await db.select({
    receivable: sql<number>`coalesce(sum(${S.parties.balance}) filter (where ${S.parties.balance} > 0),0)::float`,
    receivableCount: sql<number>`count(*) filter (where ${S.parties.balance} > 0)::int`,
    payable: sql<number>`coalesce(-sum(${S.parties.balance}) filter (where ${S.parties.balance} < 0),0)::float`,
    payableCount: sql<number>`count(*) filter (where ${S.parties.balance} < 0)::int`,
  }).from(S.parties).where(eq(S.parties.businessId, b));
  res.json({ rows, totals: t });
});

const partySchema = z.object({
  type: z.enum(["CUSTOMER", "SUPPLIER"]), name: z.string().min(1), phone: z.string().nullish(), email: z.string().nullish(),
  gstin: z.string().trim().toUpperCase().nullish(), address: z.string().nullish(), city: z.string().nullish(), stateCode: z.string().nullish(),
  shipToAddress: z.string().nullish(), creditLimit: z.coerce.number().nullish(), openingBalance: z.coerce.number().optional(),
  openingType: z.enum(["RECEIVE", "PAY"]).optional(),
});

moneyRouter.post("/parties", need("parties"), async (req, res) => {
  const d = parse(partySchema, req.body);
  const ob = r2((d.openingBalance || 0) * (d.openingType === "PAY" ? -1 : 1));
  const { openingType: _o, ...rest } = d;
  const [p] = await db.insert(S.parties).values({ ...rest, businessId: req.businessId!, stateCode: d.stateCode || stateFromGstin(d.gstin),
    phone: d.phone?.replace(/\D/g, "").slice(-10) || null, openingBalance: ob, balance: ob }).returning();
  res.status(201).json(p);
});

moneyRouter.put("/parties/:id", need("parties"), async (req, res) => {
  const d = parse(partySchema.partial().omit({ openingBalance: true, openingType: true }), req.body);
  const [p] = await db.update(S.parties).set({ ...d, ...(d.gstin ? { stateCode: d.stateCode || stateFromGstin(d.gstin) } : {}) })
    .where(and(eq(S.parties.businessId, req.businessId!), eq(S.parties.id, String(req.params.id)))).returning();
  if (!p) throw notFound("Party not found");
  res.json(p);
});

moneyRouter.get("/parties/:id", async (req, res) => {
  const { month } = req.query as Record<string, string>;
  const r = month ? monthRange(month) : null;
  const l = await partyLedger(req.businessId!, String(req.params.id), r?.from, r?.to);
  const biz = await db.query.businesses.findFirst({ where: eq(S.businesses.id, req.businessId!) });
  const openBills = await db.select({ id: S.invoices.id, number: S.invoices.number, date: S.invoices.date, total: S.invoices.total, balance: S.invoices.balance })
    .from(S.invoices).where(and(eq(S.invoices.partyId, l.party.id), eq(S.invoices.kind, "INVOICE"), eq(S.invoices.cancelled, false), gt(S.invoices.balance, 0)))
    .orderBy(asc(S.invoices.date));
  const openPurchases = await db.select({ id: S.purchases.id, number: S.purchases.number, date: S.purchases.date, total: S.purchases.total, balance: S.purchases.balance })
    .from(S.purchases).where(and(eq(S.purchases.supplierId, l.party.id), gt(S.purchases.balance, 0))).orderBy(asc(S.purchases.date));
  const lastPayment = await db.query.payments.findFirst({ where: eq(S.payments.partyId, l.party.id), orderBy: desc(S.payments.date) });
  const due = l.party.balance;
  const reminder = `Dear ${l.party.name}, a balance of ₹${Math.abs(due).toLocaleString("en-IN")} is pending with ${biz?.name}.` +
    (biz?.upiId ? ` Pay by UPI: ${biz.upiId}.` : "") + ` Please clear at the earliest. Thank you!`;
  res.json({ ...l, openBills, openPurchases, lastPayment, reminder: { text: reminder, link: waLink(l.party.phone, reminder) } });
});

// ─────────── Payments ───────────
moneyRouter.get("/payments", async (req, res) => {
  const { month, direction, partyId, limit = "100" } = req.query as Record<string, string>;
  const r = monthRange(month);
  const where = [eq(S.payments.businessId, req.businessId!), gte(S.payments.date, r.from), lt(S.payments.date, r.to)];
  if (direction === "IN" || direction === "OUT") where.push(eq(S.payments.direction, direction));
  if (partyId) where.push(eq(S.payments.partyId, partyId));
  const rows = await db.select({ p: S.payments, party: S.parties.name }).from(S.payments).leftJoin(S.parties, eq(S.parties.id, S.payments.partyId))
    .where(and(...where)).orderBy(desc(S.payments.date)).limit(Math.min(+limit, 500));
  res.json(rows.map((x) => ({ ...x.p, party: x.party || "Walk-in customer" })));
});

moneyRouter.post("/payments", need("payments"), async (req, res) => {
  const d = parse(z.object({
    direction: z.enum(["IN", "OUT"]), partyId: z.string(), amount: z.coerce.number().positive(), mode: payMode,
    reference: z.string().optional(), account: z.string().optional(), note: z.string().optional(), date: z.coerce.date().optional(),
    allocations: z.array(z.object({ invoiceId: z.string().optional(), purchaseId: z.string().optional(), amount: z.coerce.number().positive() })).optional(),
  }), req.body);
  const sum = r2((d.allocations || []).reduce((s, a) => s + a.amount, 0));
  if (sum > d.amount + 0.01) throw bad("Adjusted amount is more than payment");
  const pay = await db.transaction((tx) => recordPayment(tx, req.businessId!, { ...d, allocations: d.allocations?.length ? d.allocations : "auto" }));
  res.status(201).json(await receiptDetail(req.businessId!, pay.id));
});

moneyRouter.get("/payments/:id", async (req, res) => res.json(await receiptDetail(req.businessId!, String(req.params.id))));

async function receiptDetail(businessId: string, id: string) {
  const p = await db.query.payments.findFirst({ where: and(eq(S.payments.businessId, businessId), eq(S.payments.id, id)) });
  if (!p) throw notFound("Payment not found");
  const party = p.partyId ? await db.query.parties.findFirst({ where: eq(S.parties.id, p.partyId) }) : null;
  const business = await db.query.businesses.findFirst({ where: eq(S.businesses.id, businessId) });
  const allocs = await db.select({ a: S.paymentAllocations, inv: S.invoices.number, pur: S.purchases.number }).from(S.paymentAllocations)
    .leftJoin(S.invoices, eq(S.invoices.id, S.paymentAllocations.invoiceId)).leftJoin(S.purchases, eq(S.purchases.id, S.paymentAllocations.purchaseId))
    .where(eq(S.paymentAllocations.paymentId, p.id));
  const against = allocs.map((a) => a.inv || a.pur).filter(Boolean) as string[];
  const text = `Received with thanks ₹${p.amount.toLocaleString("en-IN")} via ${p.mode}${against.length ? " against " + against.join(", ") : ""}. Balance now ₹${(party?.balance ?? 0).toLocaleString("en-IN")}. – ${business?.name}`;
  return { ...p, party, business: business && { name: business.name, gstin: business.gstin, address: business.address, phone: business.phone },
    against, allocations: allocs.map((a) => ({ ...a.a, number: a.inv || a.pur })), amountInWords: amountInWords(p.amount),
    whatsapp: { text, link: waLink(party?.phone, text) } };
}

// ─────────── Expenses ───────────
export const EXPENSE_CATEGORIES = ["Rent", "Electricity", "Salary", "Transport", "Office", "Utilities", "Other"];
moneyRouter.get("/expenses", async (req, res) => {
  const r = monthRange(req.query.month as string);
  const where = and(eq(S.expenses.businessId, req.businessId!), gte(S.expenses.date, r.from), lt(S.expenses.date, r.to));
  const rows = await db.select().from(S.expenses).where(where).orderBy(desc(S.expenses.date));
  const byCategory = await db.select({ category: S.expenses.category, amount: sql<number>`sum(${S.expenses.amount})::float` })
    .from(S.expenses).where(where).groupBy(S.expenses.category).orderBy(desc(sql`sum(${S.expenses.amount})`));
  res.json({ rows, byCategory, total: r2(rows.reduce((s, e) => s + e.amount, 0)), categories: EXPENSE_CATEGORIES });
});
moneyRouter.post("/expenses", need("payments"), async (req, res) => {
  const d = parse(z.object({
    description: z.string().min(1), category: z.string().min(1), amount: z.coerce.number().positive(), mode: payMode.default("CASH"),
    account: z.string().optional(), date: z.coerce.date().optional(), attachmentUrl: z.string().max(3_000_000).optional(),
  }), req.body);
  const [e] = await db.insert(S.expenses).values({ ...d, businessId: req.businessId!, account: d.account || (d.mode === "CASH" ? "Cash" : null) }).returning();
  res.status(201).json(e);
});
moneyRouter.delete("/expenses/:id", need("accounts"), async (req, res) => {
  await db.delete(S.expenses).where(and(eq(S.expenses.businessId, req.businessId!), eq(S.expenses.id, String(req.params.id))));
  res.json({ ok: true });
});

// ─────────── Cash & bank book ───────────
async function balances(businessId: string, until?: Date) {
  const pw = [eq(S.payments.businessId, businessId)];
  const ew = [eq(S.expenses.businessId, businessId)];
  if (until) { pw.push(lt(S.payments.date, until)); ew.push(lt(S.expenses.date, until)); }
  const pays = await db.select({ mode: S.payments.mode, account: S.payments.account,
    net: sql<number>`sum(case when ${S.payments.direction}='IN' then ${S.payments.amount} else -${S.payments.amount} end)::float` })
    .from(S.payments).where(and(...pw)).groupBy(S.payments.mode, S.payments.account);
  const exps = await db.select({ mode: S.expenses.mode, account: S.expenses.account, amt: sql<number>`sum(${S.expenses.amount})::float` })
    .from(S.expenses).where(and(...ew)).groupBy(S.expenses.mode, S.expenses.account);
  const book: Record<string, number> = {};
  const key = (mode: string, account: string | null) => (mode === "CASH" ? "Cash" : account || "Bank");
  pays.forEach((p) => (book[key(p.mode, p.account)] = r2((book[key(p.mode, p.account)] || 0) + p.net)));
  exps.forEach((e) => (book[key(e.mode, e.account)] = r2((book[key(e.mode, e.account)] || 0) - e.amt)));
  const biz = await db.query.businesses.findFirst({ where: eq(S.businesses.id, businessId) });
  const opening = ((biz?.preferences as any)?.openingBalances || {}) as Record<string, number>;
  for (const [k, v] of Object.entries(opening)) book[k] = r2((book[k] || 0) + Number(v));
  const cash = book.Cash || 0;
  const bank = r2(Object.entries(book).filter(([k]) => k !== "Cash").reduce((s, [, v]) => s + v, 0));
  return { cash, bank, accounts: book };
}

moneyRouter.get("/cashbook", async (req, res) => {
  const { range = "today", account } = req.query as Record<string, string>;
  const b = req.businessId!;
  const r = rangeFor(range);
  const pays = await db.select({ p: S.payments, party: S.parties.name }).from(S.payments).leftJoin(S.parties, eq(S.parties.id, S.payments.partyId))
    .where(and(eq(S.payments.businessId, b), gte(S.payments.date, r.from), lt(S.payments.date, r.to))).orderBy(desc(S.payments.date));
  const exps = await db.select().from(S.expenses).where(and(eq(S.expenses.businessId, b), gte(S.expenses.date, r.from), lt(S.expenses.date, r.to)));
  let entries = [
    ...pays.filter((x) => x.p.partyId).map((x) => ({ id: x.p.id, date: x.p.date, title: x.party!, sub: `Payment ${x.p.direction === "IN" ? "in" : "out"} · ${x.p.mode}`,
      amount: x.p.direction === "IN" ? x.p.amount : -x.p.amount, account: x.p.mode === "CASH" ? "Cash" : x.p.account || "Bank" })),
    ...exps.map((e) => ({ id: e.id, date: e.date, title: e.description, sub: `Expense · ${e.mode}`, amount: -e.amount, account: e.mode === "CASH" ? "Cash" : e.account || "Bank" })),
  ];
  // Walk-in cash sales grouped into one line, like the design
  const walk = pays.filter((x) => !x.p.partyId && x.p.direction === "IN");
  const byAcc = new Map<string, { amount: number; count: number; last: Date }>();
  walk.forEach((w) => {
    const a = w.p.mode === "CASH" ? "Cash" : w.p.account || "Bank";
    const e = byAcc.get(a) || { amount: 0, count: 0, last: w.p.date };
    e.amount = r2(e.amount + w.p.amount); e.count++; if (w.p.date > e.last) e.last = w.p.date;
    byAcc.set(a, e);
  });
  byAcc.forEach((v, a) => entries.push({ id: `walkin-${a}`, date: v.last, title: "Walk-in sales", sub: `${a === "Cash" ? "Cash" : "UPI/Bank"} sales · ${v.count} bills`, amount: v.amount, account: a }));
  if (account) entries = entries.filter((e) => (account === "Cash" ? e.account === "Cash" : e.account !== "Cash" && (account === "Bank" || e.account === account)));
  entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  const now = await balances(b);
  res.json({ ...now, entries, accountsList: Object.keys(now.accounts) });
});

// ─────────── Payments & expenses overview (CRM screen) ───────────
moneyRouter.get("/money/overview", async (req, res) => {
  const b = req.businessId!;
  const r = monthRange(req.query.month as string);
  const bal = await balances(b);
  const [rec] = await db.select({ amt: sql<number>`coalesce(sum(${S.payments.amount}),0)::float` }).from(S.payments)
    .where(and(eq(S.payments.businessId, b), eq(S.payments.direction, "IN"), gte(S.payments.date, r.from), lt(S.payments.date, r.to)));
  const [exp] = await db.select({ amt: sql<number>`coalesce(sum(${S.expenses.amount}),0)::float`, n: sql<number>`count(*)::int` }).from(S.expenses)
    .where(and(eq(S.expenses.businessId, b), gte(S.expenses.date, r.from), lt(S.expenses.date, r.to)));
  // Receivable ageing by invoice due date
  const today = istStartOfDay();
  const open = await db.select({ date: S.invoices.date, balance: S.invoices.balance, partyId: S.invoices.partyId }).from(S.invoices)
    .where(and(eq(S.invoices.businessId, b), eq(S.invoices.kind, "INVOICE"), eq(S.invoices.cancelled, false), gt(S.invoices.balance, 0)));
  const buckets = [{ label: "0 – 15 days", max: 15, amount: 0 }, { label: "16 – 30 days", max: 30, amount: 0 }, { label: "31 – 60 days", max: 60, amount: 0 }, { label: "60+ days", max: 1e9, amount: 0 }];
  open.forEach((o) => { const age = (today.getTime() - o.date.getTime()) / 86400000; buckets.find((x) => age <= x.max)!.amount += o.balance; });
  const [recv] = await db.select({ amt: sql<number>`coalesce(sum(${S.parties.balance}) filter (where ${S.parties.balance} > 0),0)::float`,
    n: sql<number>`count(*) filter (where ${S.parties.balance} > 0)::int` }).from(S.parties).where(and(eq(S.parties.businessId, b), eq(S.parties.type, "CUSTOMER")));
  const recent = await db.select({ p: S.payments, party: S.parties.name }).from(S.payments).innerJoin(S.parties, eq(S.parties.id, S.payments.partyId))
    .where(eq(S.payments.businessId, b)).orderBy(desc(S.payments.date)).limit(8);
  res.json({ ...bal, receivedMonth: rec.amt, expensesMonth: exp.amt, expenseCount: exp.n,
    ageing: { total: recv.amt, parties: recv.n, buckets: buckets.map((x) => ({ label: x.label, amount: r2(x.amount) })) },
    recent: recent.map((x) => ({ ...x.p, party: x.party })) });
});

moneyRouter.post("/money/remind-all", need("payments"), async (req, res) => {
  const biz = await db.query.businesses.findFirst({ where: eq(S.businesses.id, req.businessId!) });
  const rows = await db.select().from(S.parties).where(and(eq(S.parties.businessId, req.businessId!), eq(S.parties.type, "CUSTOMER"), gt(S.parties.balance, 0)));
  const list = rows.map((p) => {
    const text = `Dear ${p.name}, a balance of ₹${p.balance.toLocaleString("en-IN")} is pending with ${biz?.name}.${biz?.upiId ? " Pay by UPI: " + biz.upiId + "." : ""} Thank you!`;
    return { partyId: p.id, name: p.name, phone: p.phone, amount: p.balance, link: waLink(p.phone, text) };
  });
  res.json({ count: list.length, list });
});

export const _z = [ne, addDays];
