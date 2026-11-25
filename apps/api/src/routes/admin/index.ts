import { Router } from "express";
import bcrypt from "bcryptjs";
import { and, asc, desc, eq, gte, lt, sql, inArray, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema as S } from "../../db/index.js";
import { parse, bad, notFound, r2, addDays, istParts, istMonthStart, fyRange, normPhone, monthRange } from "../../lib/util.js";
import { requireAdmin, signAdmin, signUser, superOnly } from "../../lib/auth.js";
import { customerRows, sellerLabel, revenueBetween } from "./data.js";
import {
  createSubscriptionOrder, activatePayment, listPriceFor, withGst, validCoupon, priceWithCoupon, startTrial, endFor, currentSubscription,
} from "../../services/subscription.js";
import { refundPayment, razorpayConfig } from "../../lib/razorpay.js";
import { waLink } from "../../lib/notify.js";
import { stateFromGstin, GST_STATES } from "../../lib/gst.js";
import { sendXlsx } from "../crm/sales.js";

export const adminRouter = Router();

// ─────────── Auth ───────────
adminRouter.post("/auth/login", async (req, res) => {
  const { email, password } = parse(z.object({ email: z.string().email(), password: z.string() }), req.body);
  const a = await db.query.adminUsers.findFirst({ where: eq(S.adminUsers.email, email.toLowerCase()) });
  if (!a || !a.active || !(await bcrypt.compare(password, a.passwordHash))) throw bad("Wrong email or password");
  res.json({ token: signAdmin(a.id, a.role), admin: { id: a.id, name: a.name, email: a.email, role: a.role } });
});

adminRouter.use(requireAdmin);
adminRouter.get("/me", async (req, res) => {
  const last = await db.query.subscriptionPayments.findFirst({ where: eq(S.subscriptionPayments.status, "CAPTURED"), orderBy: desc(S.subscriptionPayments.paidAt) });
  const rz = await razorpayConfig();
  const { passwordHash: _p, ...a } = req.admin!;
  res.json({ admin: a, gateway: { razorpay: rz.enabled, live: rz.live, lastPaymentAt: last?.paidAt ?? null } });
});

/** Partners & sales staff only see their own customers */
const scope = <T extends { seller: { id: string } | null }>(req: any, rows: T[]) =>
  req.admin.role === "SUPER_ADMIN" ? rows : rows.filter((r) => r.seller?.id === req.admin.sellerId);

// ─────────── Dashboard ───────────
adminRouter.get("/dashboard", async (req, res) => {
  const range = (req.query.range as string) || "month";
  const { y, m } = istParts();
  const r = range === "last" ? { from: istMonthStart(y, m - 1), to: istMonthStart(y, m) } : range === "year" ? { from: fyRange().from, to: fyRange().to } : { from: istMonthStart(y, m), to: istMonthStart(y, m + 1) };
  const prev = range === "year" ? { from: istMonthStart(fyRange().startY - 1, 3), to: fyRange().from } : { from: new Date(r.from.getTime() - (r.to.getTime() - r.from.getTime())), to: r.from };
  const rows = scope(req, await customerRows());
  const [rev, prevRev] = await Promise.all([revenueBetween(r.from, r.to), revenueBetween(prev.from, prev.to)]);
  const active = rows.filter((c) => c.status === "ACTIVE" || c.status === "EXPIRING");
  const newSales = await db.select({ n: sql<number>`count(*)::int`, base: sql<number>`coalesce(sum(${S.subscriptionPayments.baseAmount}),0)::float` }).from(S.subscriptionPayments)
    .where(and(eq(S.subscriptionPayments.purpose, "NEW_SALE"), inArray(S.subscriptionPayments.status, ["CAPTURED", "TO_DEPOSIT"]), gte(S.subscriptionPayments.paidAt, r.from), lt(S.subscriptionPayments.paidAt, r.to)));
  const failed = await db.select({ n: sql<number>`count(*)::int`, amt: sql<number>`coalesce(sum(${S.subscriptionPayments.amount}),0)::float` }).from(S.subscriptionPayments)
    .where(and(eq(S.subscriptionPayments.status, "FAILED"), gte(S.subscriptionPayments.createdAt, r.from)));
  const now = Date.now();
  const due = rows.filter((c) => c.subscription?.endsAt && c.status !== "EXPIRED" && c.status !== "TRIAL" && c.subscription.endsAt.getTime() - now < 30 * 86400000 && c.subscription.endsAt.getTime() > now)
    .sort((a, b) => a.subscription!.endsAt!.getTime() - b.subscription!.endsAt!.getTime());
  // 12-month revenue chart
  const chartFrom = istMonthStart(y, m - 11);
  const byMonth = await db.select({ k: sql<string>`to_char(${S.subscriptionPayments.paidAt} at time zone 'Asia/Kolkata','YYYY-MM')`, v: sql<number>`sum(${S.subscriptionPayments.amount})::float` })
    .from(S.subscriptionPayments).where(and(inArray(S.subscriptionPayments.status, ["CAPTURED", "TO_DEPOSIT", "REFUNDED"]), gte(S.subscriptionPayments.paidAt, chartFrom))).groupBy(sql`1`);
  const chart = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 11 + i, 15));
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return { month: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }), revenue: byMonth.find((x) => x.k === k)?.v || 0 };
  });
  const plans = await db.select().from(S.plans).orderBy(asc(S.plans.sortOrder));
  const byPlan = plans.map((p) => ({ code: p.code, name: p.name, count: active.filter((c) => c.plan?.id === p.id).length }));
  const yearly = active.filter((c) => c.cycle !== "MONTHLY").length;
  const latest = await db.select({ p: S.subscriptionPayments, b: S.businesses, s: S.subscriptions, plan: S.plans.name, seller: S.sellers })
    .from(S.subscriptionPayments).innerJoin(S.businesses, eq(S.businesses.id, S.subscriptionPayments.businessId))
    .leftJoin(S.subscriptions, eq(S.subscriptions.id, S.subscriptionPayments.subscriptionId)).leftJoin(S.plans, eq(S.plans.id, S.subscriptions.planId))
    .leftJoin(S.sellers, eq(S.sellers.id, S.subscriptions.sellerId))
    .where(and(eq(S.subscriptionPayments.purpose, "NEW_SALE"), inArray(S.subscriptionPayments.status, ["CAPTURED", "TO_DEPOSIT"])))
    .orderBy(desc(S.subscriptionPayments.paidAt)).limit(6);
  const newThisMonth = rows.filter((c) => c.createdAt >= r.from && c.createdAt < r.to && c.status !== "TRIAL").length;
  res.json({
    revenue: rev.gross, revenueChangePct: prevRev.gross ? Math.round(((rev.gross - prevRev.gross) / prevRev.gross) * 100) : null,
    activeCustomers: active.length, newCustomers: newThisMonth,
    newSales: newSales[0], renewalsDue: { count: due.length, list: due.slice(0, 5) },
    failed: failed[0], trials: rows.filter((c) => c.status === "TRIAL").length,
    chart, byPlan, cycleSplit: { yearlyPct: active.length ? Math.round((yearly / active.length) * 100) : 0, monthlyPct: active.length ? 100 - Math.round((yearly / active.length) * 100) : 0 },
    latestSales: latest.map((x) => ({ id: x.p.id, businessId: x.b.id, customer: x.b.name, city: x.b.city, plan: x.plan, listPrice: x.s?.listPrice, price: x.s?.price,
      custom: !!x.s && x.s.price < x.s.listPrice, method: x.p.method, via: x.p.gateway === "razorpay" ? "Razorpay" : x.p.collectedBy ? `${x.p.method} · ${x.p.collectedBy}` : x.p.method,
      seller: sellerLabel(x.seller), at: x.p.paidAt })),
  });
});

// ─────────── Customers ───────────
adminRouter.get("/customers", async (req, res) => {
  const { tab = "all", q, city, seller } = req.query as Record<string, string>;
  const all = scope(req, await customerRows());
  const counts = {
    all: all.length, active: all.filter((c) => c.status === "ACTIVE" || c.status === "EXPIRING").length, trial: all.filter((c) => c.status === "TRIAL").length,
    expiring: all.filter((c) => c.status === "EXPIRING").length, expired: all.filter((c) => c.status === "EXPIRED").length,
    custom: all.filter((c) => c.hasCustomPrice).length, failed: all.filter((c) => c.status === "FAILED").length,
    suspended: all.filter((c) => c.status === "SUSPENDED").length,
  };
  let rows = all;
  if (tab === "active") rows = rows.filter((c) => c.status === "ACTIVE" || c.status === "EXPIRING");
  else if (tab === "custom") rows = rows.filter((c) => c.hasCustomPrice);
  else if (tab !== "all") rows = rows.filter((c) => c.status.toLowerCase() === tab);
  if (city) rows = rows.filter((c) => c.city === city);
  if (seller) rows = rows.filter((c) => (seller === "direct" ? !c.seller || c.seller.type === "DIRECT" : c.seller?.id === seller));
  if (q) {
    const s = q.toLowerCase();
    const byPay = await db.select({ b: S.subscriptionPayments.businessId }).from(S.subscriptionPayments).where(ilike(S.subscriptionPayments.gatewayPaymentId, `%${q}%`));
    const ids = new Set(byPay.map((x) => x.b));
    rows = rows.filter((c) => ids.has(c.id) || [c.name, c.owner?.name, c.owner?.phone, c.gstin, c.code, c.city].some((v) => v?.toLowerCase().includes(s)));
  }
  rows.sort((a, b) => (b.subscription?.startsAt?.getTime() || b.createdAt.getTime()) - (a.subscription?.startsAt?.getTime() || a.createdAt.getTime()));
  const cities = [...new Set(all.map((c) => c.city).filter(Boolean))].sort();
  res.json({ rows: rows.map((r) => ({ ...r, soldBy: sellerLabel(r.seller) })), counts, cities });
});

adminRouter.get("/customers/:id", async (req, res) => {
  const row = scope(req, await customerRows()).find((c) => c.id === String(req.params.id));
  if (!row) throw notFound("Customer not found");
  const biz = await db.query.businesses.findFirst({ where: eq(S.businesses.id, row.id) });
  const owner = await db.select({ u: S.users }).from(S.memberships).innerJoin(S.users, eq(S.users.id, S.memberships.userId))
    .where(and(eq(S.memberships.businessId, row.id), eq(S.memberships.role, "OWNER"))).limit(1);
  const payments = await db.select().from(S.subscriptionPayments).where(eq(S.subscriptionPayments.businessId, row.id)).orderBy(desc(S.subscriptionPayments.createdAt));
  const subs = await db.select({ s: S.subscriptions, plan: S.plans.name }).from(S.subscriptions).innerJoin(S.plans, eq(S.plans.id, S.subscriptions.planId))
    .where(eq(S.subscriptions.businessId, row.id)).orderBy(desc(S.subscriptions.createdAt));
  const m = monthRange();
  const [inv] = await db.select({ c: sql<number>`count(*)::int` }).from(S.invoices).where(and(eq(S.invoices.businessId, row.id), gte(S.invoices.date, m.from)));
  const [prod] = await db.select({ c: sql<number>`count(*)::int` }).from(S.products).where(and(eq(S.products.businessId, row.id), eq(S.products.isActive, true)));
  const [users] = await db.select({ c: sql<number>`count(*)::int` }).from(S.memberships).where(and(eq(S.memberships.businessId, row.id), eq(S.memberships.status, "ACTIVE")));
  const plan = row.plan ? await db.query.plans.findFirst({ where: eq(S.plans.id, row.plan.id) }) : null;
  const custom = row.customPrice ? { ...row.customPrice, planName: (await db.query.plans.findFirst({ where: eq(S.plans.id, row.customPrice.planId) }))?.name } : null;
  res.json({
    ...row, soldBy: sellerLabel(row.seller), business: biz, ownerUser: owner[0] ? { ...owner[0].u, passwordHash: undefined, hasPassword: !!owner[0].u.passwordHash } : null, payments, history: subs.map((x) => ({ ...x.s, plan: x.plan })),
    customPrice: custom,
    usage: { invoicesThisMonth: inv.c, products: prod.c, maxProducts: plan?.maxProducts ?? 0, users: users.c, usersAllowed: row.subscription?.usersAllowed ?? 1,
      storageGb: plan?.storageGb ?? 0, lastLoginAt: row.owner?.lastLoginAt, lastLoginVia: row.owner?.via },
    whatsapp: row.owner?.phone ? waLink(row.owner.phone, `Hi ${row.owner.name}, this is JipproBill support.`) : null,
  });
});

adminRouter.put("/customers/:id", async (req, res) => {
  const d = parse(z.object({ name: z.string(), ownerName: z.string(), email: z.string().nullish(), gstin: z.string().nullish(), address: z.string().nullish(), city: z.string().nullish(), stateCode: z.string().nullish() }).partial(), req.body);
  const stateCode = stateFromGstin(d.gstin) || d.stateCode;
  const [b] = await db.update(S.businesses).set({ ...d, stateCode: undefined, ...(stateCode ? { stateCode, state: GST_STATES[stateCode] } : {}) }).where(eq(S.businesses.id, String(req.params.id))).returning();
  res.json(b);
});

adminRouter.post("/customers/:id/suspend", superOnly, async (req, res) => {
  const { suspend } = parse(z.object({ suspend: z.boolean() }), req.body);
  await db.update(S.businesses).set({ status: suspend ? "SUSPENDED" : "ACTIVE" }).where(eq(S.businesses.id, String(req.params.id)));
  res.json({ ok: true });
});

adminRouter.post("/customers/:id/extend", superOnly, async (req, res) => {
  const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(3650) }), req.body);
  const sub = await currentSubscription(String(req.params.id));
  if (!sub) throw bad("No subscription to extend");
  const base = sub.endsAt && sub.endsAt > new Date() ? sub.endsAt : new Date();
  await db.update(S.subscriptions).set({ endsAt: addDays(base, days), status: sub.cycle === "TRIAL" ? "TRIAL" : "ACTIVE" }).where(eq(S.subscriptions.id, sub.id));
  res.json({ ok: true, endsAt: addDays(base, days) });
});

adminRouter.post("/customers/:id/autorenew", async (req, res) => {
  const { on } = parse(z.object({ on: z.boolean() }), req.body);
  const sub = await currentSubscription(String(req.params.id));
  if (sub) await db.update(S.subscriptions).set({ autoRenew: on }).where(eq(S.subscriptions.id, sub.id));
  res.json({ ok: true });
});

/** Support: set the owner's login password (customers created from New Sale have none while SMS OTP is off). */
adminRouter.post("/customers/:id/password", async (req, res) => {
  const { password } = parse(z.object({ password: z.string().min(6, "Password must be at least 6 characters") }), req.body);
  const owner = await db.select({ u: S.users }).from(S.memberships).innerJoin(S.users, eq(S.users.id, S.memberships.userId))
    .where(and(eq(S.memberships.businessId, String(req.params.id)), eq(S.memberships.role, "OWNER"))).limit(1);
  if (!owner[0]) throw notFound("Owner not found");
  await db.update(S.users).set({ passwordHash: await bcrypt.hash(password, 10) }).where(eq(S.users.id, owner[0].u.id));
  res.json({ ok: true, phone: owner[0].u.phone });
});

/** Opens the customer's CRM as them (support). Token valid 2 hours. */
adminRouter.post("/customers/:id/login-as", superOnly, async (req, res) => {
  const owner = await db.select({ u: S.users }).from(S.memberships).innerJoin(S.users, eq(S.users.id, S.memberships.userId))
    .where(and(eq(S.memberships.businessId, String(req.params.id)), eq(S.memberships.role, "OWNER"))).limit(1);
  if (!owner[0]) throw notFound("Owner not found");
  const token = signUser(owner[0].u.id, req.admin!.id);
  res.json({ token, url: `${process.env.CRM_URL || ""}/impersonate?token=${token}&business=${String(req.params.id)}` });
});

adminRouter.put("/customers/:id/custom-price", superOnly, async (req, res) => {
  const d = parse(z.object({ planId: z.string(), price: z.coerce.number().min(0), cycle: z.enum(["MONTHLY", "YEARLY", "TWO_YEAR", "LIFETIME"]).default("YEARLY"),
    extraUserPrice: z.coerce.number().nullish(), validTill: z.coerce.date().nullish(), reason: z.string().nullish() }), req.body);
  const [c] = await db.insert(S.customPrices).values({ ...d, businessId: String(req.params.id) })
    .onConflictDoUpdate({ target: [S.customPrices.businessId, S.customPrices.planId], set: { price: d.price, cycle: d.cycle, extraUserPrice: d.extraUserPrice, validTill: d.validTill ?? null, reason: d.reason } }).returning();
  res.json(c);
});
adminRouter.delete("/customers/:id/custom-price", superOnly, async (req, res) => {
  await db.delete(S.customPrices).where(eq(S.customPrices.businessId, String(req.params.id)));
  res.json({ ok: true });
});

/** Upgrade / renew a customer: creates order + payment link (or offline payment). */
adminRouter.post("/customers/:id/order", async (req, res) => {
  const d = parse(z.object({ planId: z.string(), cycle: z.enum(["MONTHLY", "YEARLY", "TWO_YEAR", "LIFETIME"]), price: z.coerce.number().min(0).optional(),
    purpose: z.enum(["RENEWAL", "UPGRADE"]).default("RENEWAL"), method: z.enum(["LINK", "UPI_QR", "CASH", "BANK"]).default("LINK") }), req.body);
  const plan = await db.query.plans.findFirst({ where: eq(S.plans.id, d.planId) });
  if (!plan) throw notFound("Plan not found");
  const cur = await currentSubscription(String(req.params.id));
  const custom = await db.query.customPrices.findFirst({ where: and(eq(S.customPrices.businessId, String(req.params.id)), eq(S.customPrices.planId, plan.id)) });
  const list = listPriceFor(plan, d.cycle);
  const price = d.price ?? (custom && custom.cycle === d.cycle && (!custom.validTill || custom.validTill > new Date()) ? custom.price : list);
  const out = await db.transaction((tx) => createSubscriptionOrder(tx, {
    businessId: String(req.params.id), planId: plan.id, cycle: d.cycle, price, listPrice: list, purpose: d.purpose, method: d.method,
    sellerId: cur?.sellerId, commissionPct: cur?.commissionPct, collectedBy: d.method === "CASH" ? req.admin!.name : null, autoRenew: cur?.autoRenew,
  }));
  res.status(201).json(await linkMessage(String(req.params.id), out.payment, out.amount.total));
});

async function linkMessage(businessId: string, pay: { id: string; linkUrl: string | null; description: string | null; status: string }, total: number) {
  const biz = await db.query.businesses.findFirst({ where: eq(S.businesses.id, businessId) });
  const text = `Hi ${biz?.ownerName || biz?.name}, please complete your JipproBill payment of ₹${total.toLocaleString("en-IN")} (${pay.description}).\nPay securely: ${pay.linkUrl}\nYour account activates automatically after payment.`;
  return { paymentId: pay.id, url: pay.linkUrl, status: pay.status, amount: total, whatsapp: waLink(biz?.phone, text), text,
    sms: `sms:+91${biz?.phone}?body=${encodeURIComponent(text)}`, email: `mailto:${biz?.email || ""}?subject=${encodeURIComponent("JipproBill payment link")}&body=${encodeURIComponent(text)}` };
}

// ─────────── New sale ───────────
const saleSchema = z.object({
  businessName: z.string().min(2), ownerName: z.string().min(2), phone: z.string(), email: z.string().email().optional().or(z.literal("")),
  gstin: z.string().trim().toUpperCase().optional().or(z.literal("")), city: z.string().optional(), stateCode: z.string().optional(),
  planId: z.string(), cycle: z.enum(["MONTHLY", "YEARLY", "TWO_YEAR", "LIFETIME"]),
  priceMode: z.enum(["LIST", "COUPON", "CUSTOM", "PERCENT"]).default("LIST"), coupon: z.string().optional(), customPrice: z.coerce.number().min(0).optional(),
  percent: z.coerce.number().min(0).max(100).optional(), saveCustomPrice: z.boolean().default(true),
  sellerId: z.string().nullish(), method: z.enum(["LINK", "UPI_QR", "CASH", "BANK"]).default("LINK"), trial: z.boolean().default(false),
  password: z.string().min(6, "Password must be at least 6 characters").optional().or(z.literal("")),
});

async function quote(d: z.infer<typeof saleSchema>, isPartner: boolean) {
  const plan = await db.query.plans.findFirst({ where: eq(S.plans.id, d.planId) });
  if (!plan) throw notFound("Plan not found");
  const list = listPriceFor(plan, d.cycle);
  let price = list, coupon = null as Awaited<ReturnType<typeof validCoupon>>;
  if (d.priceMode === "COUPON") { coupon = await validCoupon(d.coupon, plan.code, isPartner); price = priceWithCoupon(list, coupon); }
  if (d.priceMode === "CUSTOM") price = r2(d.customPrice ?? list);
  if (d.priceMode === "PERCENT") price = r2(list * (1 - (d.percent || 0) / 100));
  const seller = d.sellerId ? await db.query.sellers.findFirst({ where: eq(S.sellers.id, d.sellerId) }) : null;
  const amt = withGst(price);
  return { plan, list, price, coupon, seller, discount: r2(list - price), discountPct: list ? Math.round(((list - price) / list) * 100) : 0,
    gst: amt.gst, total: amt.total, commissionPct: seller?.commissionPct ?? 0, commission: r2(price * (seller?.commissionPct ?? 0) / 100) };
}

adminRouter.post("/sales/quote", async (req, res) => {
  const d = parse(saleSchema.omit({ businessName: true, ownerName: true, phone: true, email: true, gstin: true, password: true }), req.body) as z.infer<typeof saleSchema>;
  const q = await quote(d, req.admin!.role === "PARTNER");
  res.json({ ...q, plan: { id: q.plan.id, name: q.plan.name } });
});

adminRouter.post("/sales", async (req, res) => {
  const d = parse(saleSchema, req.body);
  if (req.admin!.role !== "SUPER_ADMIN") d.sellerId = req.admin!.sellerId; // staff/partner always sell as themselves
  const phone = normPhone(d.phone);
  if (!/^[6-9]\d{9}$/.test(phone)) throw bad("Enter a valid mobile number");
  const q = await quote(d, req.admin!.role === "PARTNER");
  const stateCode = stateFromGstin(d.gstin) || d.stateCode || "19";
  const result = await db.transaction(async (tx) => {
    let user = await tx.query.users.findFirst({ where: eq(S.users.phone, phone) });
    if (!user) [user] = await tx.insert(S.users).values({ phone, name: d.ownerName, email: d.email || null, passwordHash: d.password ? await bcrypt.hash(d.password, 10) : null }).returning();
    const n = (await tx.execute(sql`insert into counters (business_id, key, value) values ('__jippronex__', 'CUSTOMER', 1)
      on conflict (business_id, key) do update set value = counters.value + 1 returning value`)).rows[0] as any;
    const [biz] = await tx.insert(S.businesses).values({
      code: `JX-C-${String(n.value).padStart(5, "0")}`, name: d.businessName, ownerName: d.ownerName, phone, email: d.email || null, gstin: d.gstin || null,
      city: d.city, stateCode, state: GST_STATES[stateCode],
      preferences: { allowZeroStockBilling: true, sendInvoiceWhatsapp: true, lowStockWhatsapp: true, dailySummary: true, autoBackup: true },
    }).returning();
    await tx.insert(S.memberships).values({ userId: user.id, businessId: biz.id, role: "OWNER" });
    await tx.insert(S.parties).values({ businessId: biz.id, type: "CUSTOMER", name: "Walk-in customers" });
    if (d.trial) {
      await startTrial(tx, biz.id, q.plan.code);
      return { business: biz, trial: true as const };
    }
    if (d.priceMode === "CUSTOM" && d.saveCustomPrice && q.price < q.list)
      await tx.insert(S.customPrices).values({ businessId: biz.id, planId: q.plan.id, cycle: d.cycle, price: q.price, reason: `Set at sale by ${req.admin!.name}` });
    const out = await createSubscriptionOrder(tx, {
      businessId: biz.id, planId: q.plan.id, cycle: d.cycle, price: q.price, listPrice: q.list, purpose: "NEW_SALE",
      couponId: q.coupon?.id, sellerId: q.seller?.id, commissionPct: q.commissionPct, method: d.method,
      collectedBy: d.method === "CASH" ? (q.seller?.name || req.admin!.name) : null,
    });
    return { business: biz, order: out };
  });
  if ("trial" in result) return res.status(201).json({ business: result.business, trial: true });
  res.status(201).json({ business: result.business, ...(await linkMessage(result.business.id, result.order.payment, result.order.amount.total)) });
});

// ─────────── Plans & coupons ───────────
adminRouter.get("/plans", async (req, res) => {
  const plans = await db.select().from(S.plans).orderBy(asc(S.plans.sortOrder));
  const rows = await customerRows();
  const customs = rows.filter((c) => c.hasCustomPrice);
  const coupons = await db.select().from(S.coupons).orderBy(desc(S.coupons.createdAt));
  res.json({
    plans: plans.map((p) => ({ ...p, activeCustomers: rows.filter((c) => c.plan?.id === p.id && (c.status === "ACTIVE" || c.status === "EXPIRING")).length })),
    customPrices: customs.map((c) => ({ businessId: c.id, name: c.name, soldBy: sellerLabel(c.seller), plan: c.plan?.name, list: c.customPrice ? null : c.listPrice,
      price: c.customPrice?.price ?? c.price, listPrice: c.listPrice, cycle: c.customPrice?.cycle ?? c.cycle })),
    coupons,
  });
});
const planSchema = z.object({
  code: z.string().min(2).toUpperCase(), name: z.string().min(2), tagline: z.string().nullish(), monthlyPrice: z.coerce.number().min(0), yearlyPrice: z.coerce.number().min(0),
  twoYearPrice: z.coerce.number().nullish(), lifetimePrice: z.coerce.number().nullish(), usersIncluded: z.coerce.number().int().min(1),
  maxProducts: z.coerce.number().int().min(1).default(5000), storageGb: z.coerce.number().int().min(1).default(5), trialDays: z.coerce.number().int().min(0).default(7),
  features: z.record(z.boolean()).default({}), sortOrder: z.coerce.number().int().default(0), active: z.boolean().default(true),
});
adminRouter.post("/plans", superOnly, async (req, res) => {
  const [p] = await db.insert(S.plans).values(parse(planSchema, req.body)).returning();
  res.status(201).json(p);
});
adminRouter.put("/plans/:id", superOnly, async (req, res) => {
  const [p] = await db.update(S.plans).set(parse(planSchema.partial(), req.body)).where(eq(S.plans.id, String(req.params.id))).returning();
  res.json(p);
});
const couponSchema = z.object({
  code: z.string().min(3).toUpperCase(), description: z.string().nullish(), type: z.enum(["PERCENT", "FLAT"]).default("PERCENT"), value: z.coerce.number().positive(),
  maxUses: z.coerce.number().int().nullish(), partnersOnly: z.boolean().default(false), planCodes: z.array(z.string()).default([]),
  validTill: z.coerce.date().nullish(), active: z.boolean().default(true),
});
adminRouter.post("/coupons", superOnly, async (req, res) => {
  const [c] = await db.insert(S.coupons).values(parse(couponSchema, req.body)).returning();
  res.status(201).json(c);
});
adminRouter.put("/coupons/:id", superOnly, async (req, res) => {
  const [c] = await db.update(S.coupons).set(parse(couponSchema.partial(), req.body)).where(eq(S.coupons.id, String(req.params.id))).returning();
  res.json(c);
});

// ─────────── Payments ───────────
adminRouter.get("/payments", async (req, res) => {
  const { tab = "all", q, month } = req.query as Record<string, string>;
  const r = monthRange(month);
  const where = [gte(S.subscriptionPayments.createdAt, r.from), lt(S.subscriptionPayments.createdAt, r.to), sql`${S.subscriptionPayments.status} <> 'CREATED'`];
  if (tab === "captured") where.push(eq(S.subscriptionPayments.status, "CAPTURED"));
  if (tab === "failed") where.push(eq(S.subscriptionPayments.status, "FAILED"));
  if (tab === "refunded") where.push(eq(S.subscriptionPayments.status, "REFUNDED"));
  if (tab === "cash") where.push(eq(S.subscriptionPayments.gateway, "offline"));
  if (tab === "autopay") where.push(eq(S.subscriptionPayments.method, "Autopay"));
  if (tab === "pending") { where.splice(2, 1); where.push(eq(S.subscriptionPayments.status, "CREATED")); }
  if (q) where.push(or(ilike(S.subscriptionPayments.gatewayPaymentId, `%${q}%`), ilike(S.businesses.name, `%${q}%`), ilike(S.subscriptionPayments.invoiceNo, `%${q}%`))!);
  const rows = await db.select({ p: S.subscriptionPayments, customer: S.businesses.name, sellerId: S.subscriptions.sellerId }).from(S.subscriptionPayments)
    .innerJoin(S.businesses, eq(S.businesses.id, S.subscriptionPayments.businessId)).leftJoin(S.subscriptions, eq(S.subscriptions.id, S.subscriptionPayments.subscriptionId))
    .where(and(...where)).orderBy(desc(S.subscriptionPayments.createdAt)).limit(300);
  const visible = req.admin!.role === "SUPER_ADMIN" ? rows : rows.filter((x) => x.sellerId === req.admin!.sellerId);
  const sumBy = async (cond: any) => (await db.select({ amt: sql<number>`coalesce(sum(${S.subscriptionPayments.amount}),0)::float`, n: sql<number>`count(*)::int` })
    .from(S.subscriptionPayments).where(and(gte(S.subscriptionPayments.createdAt, r.from), lt(S.subscriptionPayments.createdAt, r.to), cond)))[0];
  const [collected, gateway, offline, toDeposit, failed, refunds] = await Promise.all([
    sumBy(inArray(S.subscriptionPayments.status, ["CAPTURED", "TO_DEPOSIT"])),
    sumBy(and(eq(S.subscriptionPayments.status, "CAPTURED"), eq(S.subscriptionPayments.gateway, "razorpay"))),
    sumBy(and(inArray(S.subscriptionPayments.status, ["CAPTURED", "TO_DEPOSIT"]), eq(S.subscriptionPayments.gateway, "offline"))),
    sumBy(eq(S.subscriptionPayments.status, "TO_DEPOSIT")),
    sumBy(eq(S.subscriptionPayments.status, "FAILED")),
    sumBy(eq(S.subscriptionPayments.status, "REFUNDED")),
  ]);
  res.json({ rows: visible.map((x) => ({ ...x.p, customer: x.customer })), summary: { collected, gateway, offline, toDeposit, failed, refunds, settled: gateway.amt } });
});

adminRouter.post("/payments/:id/deposit", superOnly, async (req, res) => {
  const [p] = await db.update(S.subscriptionPayments).set({ status: "CAPTURED" }).where(and(eq(S.subscriptionPayments.id, String(req.params.id)), eq(S.subscriptionPayments.status, "TO_DEPOSIT"))).returning();
  if (!p) throw bad("Nothing to mark");
  res.json(p);
});

/** Mark a pending link as paid offline (cash/cheque/bank) */
adminRouter.post("/payments/:id/offline", async (req, res) => {
  const d = parse(z.object({ method: z.enum(["Cash", "Bank", "Cheque", "UPI"]), reference: z.string().optional() }), req.body);
  const p = await db.query.subscriptionPayments.findFirst({ where: eq(S.subscriptionPayments.id, String(req.params.id)) });
  if (!p || p.status === "CAPTURED") throw bad("Payment not pending");
  const out = await db.transaction(async (tx) => {
    await tx.update(S.subscriptionPayments).set({ gateway: "offline", collectedBy: req.admin!.name, gatewayPaymentId: d.reference || `${d.method.toUpperCase()}-${p.id.slice(0, 6)}` }).where(eq(S.subscriptionPayments.id, p.id));
    const u = await activatePayment(tx, p.id, { method: d.method });
    if (d.method === "Cash") await tx.update(S.subscriptionPayments).set({ status: "TO_DEPOSIT" }).where(eq(S.subscriptionPayments.id, p.id));
    return u;
  });
  res.json(out);
});

adminRouter.post("/payments/:id/refund", superOnly, async (req, res) => {
  const d = parse(z.object({ amount: z.coerce.number().positive().optional(), reason: z.string().optional(), cancelSubscription: z.boolean().default(true) }), req.body);
  const p = await db.query.subscriptionPayments.findFirst({ where: eq(S.subscriptionPayments.id, String(req.params.id)) });
  if (!p || (p.status !== "CAPTURED" && p.status !== "TO_DEPOSIT")) throw bad("Only captured payments can be refunded");
  const amount = d.amount ?? p.amount;
  let refundId = `rfnd_offline_${p.id.slice(0, 6)}`;
  if (p.gateway === "razorpay" && p.gatewayPaymentId?.startsWith("pay_")) refundId = (await refundPayment(p.gatewayPaymentId, amount)).id;
  await db.transaction(async (tx) => {
    await tx.update(S.subscriptionPayments).set({ status: "REFUNDED" }).where(eq(S.subscriptionPayments.id, p.id));
    await tx.insert(S.subscriptionPayments).values({
      businessId: p.businessId, subscriptionId: p.subscriptionId, purpose: "REFUND", description: `Refund · ${d.reason || p.description}`,
      amount: -amount, baseAmount: -r2(amount / 1.18), gstAmount: -r2(amount - amount / 1.18), status: "REFUNDED", method: p.method, gateway: p.gateway,
      gatewayPaymentId: refundId, paidAt: new Date(),
    });
    if (d.cancelSubscription && p.subscriptionId) await tx.update(S.subscriptions).set({ status: "CANCELLED" }).where(eq(S.subscriptions.id, p.subscriptionId));
  });
  res.json({ ok: true, refundId });
});

/** Failed payment → fresh link */
adminRouter.post("/payments/:id/retry", async (req, res) => {
  const p = await db.query.subscriptionPayments.findFirst({ where: eq(S.subscriptionPayments.id, String(req.params.id)) });
  if (!p?.subscriptionId) throw notFound();
  const sub = await db.query.subscriptions.findFirst({ where: eq(S.subscriptions.id, p.subscriptionId) });
  const out = await db.transaction((tx) => createSubscriptionOrder(tx, {
    businessId: p.businessId, planId: sub!.planId, cycle: sub!.cycle, price: sub!.price, listPrice: sub!.listPrice, purpose: p.purpose === "NEW_SALE" ? "NEW_SALE" : "RENEWAL",
    sellerId: sub!.sellerId, commissionPct: sub!.commissionPct, couponId: sub!.couponId, autoRenew: sub!.autoRenew,
  }));
  await db.update(S.subscriptions).set({ status: "CANCELLED" }).where(and(eq(S.subscriptions.id, sub!.id), eq(S.subscriptions.status, "FAILED")));
  res.json(await linkMessage(p.businessId, out.payment, out.amount.total));
});

adminRouter.get("/payments/:id", async (req, res) => {
  const p = await db.query.subscriptionPayments.findFirst({ where: eq(S.subscriptionPayments.id, String(req.params.id)) });
  if (!p) throw notFound();
  const biz = await db.query.businesses.findFirst({ where: eq(S.businesses.id, p.businessId) });
  const seller = await db.query.appSettings.findFirst({ where: eq(S.appSettings.key, "company") });
  res.json({ ...p, business: biz, company: seller?.value ?? null });
});

// ─────────── Gateway & collection rules ───────────
const DEFAULT_RULES = { autoActivate: true, autopay: true, autoInvoice: true, retryFailed: true, suspendAfterDays: 7, passCharges: false,
  reminderDays: [15, 7, 3, 0], reminderTemplate: "Hi {name}, your JipproBill {plan} plan expires on {date}.\nRenew in one tap: {link}" };
adminRouter.get("/gateway", superOnly, async (_req, res) => {
  const cfgs = await db.select().from(S.gatewayConfigs);
  const rules = (await db.query.appSettings.findFirst({ where: eq(S.appSettings.key, "collection") }))?.value ?? DEFAULT_RULES;
  const mask = (s?: string | null) => (s ? s.slice(0, 9) + "••••••••" : null);
  res.json({
    gateways: ["razorpay", "cashfree", "phonepe"].map((p) => {
      const c = cfgs.find((x) => x.provider === p);
      return { provider: p, mode: c?.mode ?? "test", isPrimary: c?.isPrimary ?? false, connected: c?.connected ?? false, keyId: mask(c?.keyId),
        hasSecret: !!c?.keySecret, hasWebhookSecret: !!c?.webhookSecret, settlement: c?.settlement ?? null };
    }),
    webhookUrl: `${process.env.API_PUBLIC_URL || ""}/webhooks/razorpay`, rules: { ...DEFAULT_RULES, ...(rules as object) },
  });
});
adminRouter.put("/gateway/:provider", superOnly, async (req, res) => {
  const d = parse(z.object({ mode: z.enum(["test", "live"]).optional(), isPrimary: z.boolean().optional(), keyId: z.string().optional(), keySecret: z.string().optional(),
    webhookSecret: z.string().optional(), settlement: z.string().optional() }), req.body);
  const clean = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== "" && v !== undefined && !(typeof v === "string" && v.includes("••"))));
  const provider = String(req.params.provider);
  const existing = await db.query.gatewayConfigs.findFirst({ where: eq(S.gatewayConfigs.provider, provider) });
  const merged = { ...existing, ...clean };
  const connected = !!(merged.keyId && merged.keySecret);
  if (clean.isPrimary) await db.update(S.gatewayConfigs).set({ isPrimary: false });
  await db.insert(S.gatewayConfigs).values({ provider, ...clean, connected } as any)
    .onConflictDoUpdate({ target: S.gatewayConfigs.provider, set: { ...clean, connected, updatedAt: new Date() } as any });
  res.json({ ok: true, connected });
});
adminRouter.put("/settings/:key", superOnly, async (req, res) => {
  const key = String(req.params.key);
  if (!["collection", "company"].includes(key)) throw bad("Unknown setting");
  await db.insert(S.appSettings).values({ key, value: req.body }).onConflictDoUpdate({ target: S.appSettings.key, set: { value: req.body } });
  res.json({ ok: true });
});
adminRouter.get("/settings/:key", async (req, res) => {
  res.json((await db.query.appSettings.findFirst({ where: eq(S.appSettings.key, String(req.params.key)) }))?.value ?? null);
});

// ─────────── Renewals ───────────
adminRouter.get("/renewals", async (req, res) => {
  const rows = scope(req, await customerRows());
  const now = Date.now();
  const due = rows.filter((c) => c.subscription?.endsAt && c.cycle !== "TRIAL" && c.status !== "SUSPENDED" &&
    c.subscription.endsAt.getTime() > now && c.subscription.endsAt.getTime() - now < 30 * 86400000)
    .sort((a, b) => a.subscription!.endsAt!.getTime() - b.subscription!.endsAt!.getTime());
  const expired = rows.filter((c) => c.status === "EXPIRED" && c.cycle !== "TRIAL").sort((a, b) => (b.subscription?.endsAt?.getTime() || 0) - (a.subscription?.endsAt?.getTime() || 0));
  // renewal rate: last 90 days — subscriptions that ended and were renewed
  const since = addDays(new Date(), -90);
  const ended = rows.filter((c) => c.subscription?.endsAt && c.subscription.endsAt >= since && c.subscription.endsAt.getTime() < now);
  const renewedPays = await db.select({ b: S.subscriptionPayments.businessId }).from(S.subscriptionPayments)
    .where(and(eq(S.subscriptionPayments.purpose, "RENEWAL"), inArray(S.subscriptionPayments.status, ["CAPTURED", "TO_DEPOSIT"]), gte(S.subscriptionPayments.paidAt, since)));
  const renewedN = new Set(renewedPays.map((x) => x.b)).size;
  const rate = renewedN + ended.length ? Math.round((renewedN / (renewedN + ended.length)) * 100) : 100;
  const renewPrice = (c: (typeof rows)[number]) => (c.customPrice && (!c.customPrice.validTill || c.customPrice.validTill > new Date()) ? c.customPrice.price : c.price || c.listPrice);
  res.json({
    due: due.map((c) => ({ ...c, renewPrice: renewPrice(c), expected: withGst(renewPrice(c)).total })),
    expired: expired.map((c) => ({ ...c, lastPrice: c.price, daysAgo: Math.floor((now - c.subscription!.endsAt!.getTime()) / 86400000) })),
    stats: { dueCount: due.length, expected: due.reduce((s, c) => s + renewPrice(c), 0), autopay: due.filter((c) => c.autoRenew).length, renewalRate: rate, expired: expired.length },
  });
});

async function renewalLink(businessId: string, winBackPct = 0) {
  const sub = await currentSubscription(businessId);
  if (!sub) throw bad("No plan on this customer");
  const custom = await db.query.customPrices.findFirst({ where: and(eq(S.customPrices.businessId, businessId), eq(S.customPrices.planId, sub.planId)) });
  const cycle = sub.cycle === "TRIAL" ? "YEARLY" : sub.cycle;
  const list = listPriceFor(sub.plan, cycle);
  let price = custom && (!custom.validTill || custom.validTill > new Date()) ? custom.price : sub.price || list;
  if (winBackPct) price = r2(price * (1 - winBackPct / 100));
  const out = await db.transaction((tx) => createSubscriptionOrder(tx, {
    businessId, planId: sub.planId, cycle, price, listPrice: list, purpose: "RENEWAL", sellerId: sub.sellerId, commissionPct: sub.commissionPct, autoRenew: sub.autoRenew,
  }));
  await db.update(S.subscriptions).set({ remindersSent: sql`${S.subscriptions.remindersSent} + 1`, lastReminderAt: new Date() }).where(eq(S.subscriptions.id, sub.id));
  const biz = await db.query.businesses.findFirst({ where: eq(S.businesses.id, businessId) });
  const rules = ((await db.query.appSettings.findFirst({ where: eq(S.appSettings.key, "collection") }))?.value ?? DEFAULT_RULES) as typeof DEFAULT_RULES;
  const text = (winBackPct ? `Hi {name}, we miss you! Get ${winBackPct}% off on your JipproBill {plan} plan.\nRenew now: {link}` : rules.reminderTemplate || DEFAULT_RULES.reminderTemplate)
    .replace("{name}", biz?.ownerName || biz?.name || "").replace("{plan}", sub.plan.name)
    .replace("{date}", sub.endsAt ? sub.endsAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-").replace("{link}", out.payment.linkUrl || "");
  return { businessId, name: biz?.name, paymentId: out.payment.id, url: out.payment.linkUrl, amount: out.amount.total, text, whatsapp: waLink(biz?.phone, text) };
}
adminRouter.post("/renewals/:businessId/remind", async (req, res) => {
  const { winBackPct = 0 } = parse(z.object({ winBackPct: z.coerce.number().min(0).max(90).optional() }), req.body || {});
  res.json(await renewalLink(String(req.params.businessId), winBackPct));
});
adminRouter.post("/renewals/remind-all", async (req, res) => {
  const rows = scope(req, await customerRows());
  const now = Date.now();
  const due = rows.filter((c) => c.subscription?.endsAt && c.cycle !== "TRIAL" && !c.autoRenew && c.subscription.endsAt.getTime() > now && c.subscription.endsAt.getTime() - now < 30 * 86400000);
  const out: any[] = [];
  for (const c of due) out.push(await renewalLink(c.id));
  res.json({ count: out.length, list: out });
});

// ─────────── Sales reports ───────────
adminRouter.get("/reports", async (req, res) => {
  const fy = fyRange();
  const rows = scope(req, await customerRows());
  const sold = rows.filter((c) => c.cycle && c.cycle !== "TRIAL");
  const pays = await db.select({ p: S.subscriptionPayments, s: S.subscriptions }).from(S.subscriptionPayments)
    .leftJoin(S.subscriptions, eq(S.subscriptions.id, S.subscriptionPayments.subscriptionId))
    .where(and(inArray(S.subscriptionPayments.status, ["CAPTURED", "TO_DEPOSIT", "REFUNDED"]), gte(S.subscriptionPayments.paidAt, fy.from), lt(S.subscriptionPayments.paidAt, fy.to)));
  const revenue = r2(pays.reduce((s, x) => s + x.p.baseAmount, 0));
  const sales = pays.filter((x) => x.p.purpose !== "REFUND" && x.s);
  const discount = r2(sales.reduce((s, x) => s + Math.max(0, (x.s!.listPrice || 0) - (x.s!.price || 0)), 0));
  const sellers = await db.select().from(S.sellers);
  const payouts = await db.select({ sellerId: S.commissionPayouts.sellerId, amt: sql<number>`sum(${S.commissionPayouts.amount})::float` }).from(S.commissionPayouts).groupBy(S.commissionPayouts.sellerId);
  const bySeller = sellers.map((sl) => {
    const mine = sales.filter((x) => x.s!.sellerId === sl.id);
    const rev = r2(mine.reduce((s, x) => s + x.p.baseAmount, 0));
    const commission = r2(mine.reduce((s, x) => s + x.p.baseAmount * (x.s!.commissionPct || 0) / 100, 0));
    const paid = payouts.find((p) => p.sellerId === sl.id)?.amt || 0;
    return { id: sl.id, name: sl.name, type: sl.type, city: sl.city, commissionPct: sl.commissionPct, sold: sold.filter((c) => c.seller?.id === sl.id).length, revenue: rev, commission, payable: r2(commission - paid) };
  });
  const direct = sales.filter((x) => !x.s!.sellerId);
  bySeller.push({ id: "direct", name: "Website / App", type: "DIRECT", city: null, commissionPct: 0, sold: sold.filter((c) => !c.seller).length,
    revenue: r2(direct.reduce((s, x) => s + x.p.baseAmount, 0)), commission: 0, payable: 0 });
  const count = <K extends string>(f: (c: (typeof sold)[number]) => K | null | undefined) => {
    const m = new Map<string, number>(); sold.forEach((c) => { const k = f(c); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].map(([k, v]) => ({ key: k, count: v })).sort((a, b) => b.count - a.count);
  };
  const plans = await db.select().from(S.plans).orderBy(asc(S.plans.sortOrder));
  res.json({
    fy: fy.label, licences: sold.length, active: sold.filter((c) => c.status === "ACTIVE" || c.status === "EXPIRING").length, revenue,
    avgPrice: sales.length ? Math.round(sales.reduce((s, x) => s + x.s!.price, 0) / sales.length) : 0,
    avgList: sales.length ? Math.round(sales.reduce((s, x) => s + x.s!.listPrice, 0) / sales.length) : 0,
    discount, customCount: sold.filter((c) => c.hasCustomPrice).length,
    commission: { total: r2(bySeller.reduce((s, x) => s + x.commission, 0)), unpaid: r2(bySeller.reduce((s, x) => s + Math.max(0, x.payable), 0)) },
    bySeller: req.admin!.role === "SUPER_ADMIN" ? bySeller : bySeller.filter((s) => s.id === req.admin!.sellerId),
    cities: count((c) => c.city).slice(0, 8),
    byPlan: plans.map((p) => ({ name: p.name, count: sold.filter((c) => c.plan?.id === p.id).length,
      revenue: r2(sales.filter((x) => x.s!.planId === p.id).reduce((s, x) => s + x.p.baseAmount, 0)) })),
    byCycle: ["YEARLY", "MONTHLY", "TWO_YEAR", "LIFETIME"].map((cy) => ({ cycle: cy, count: sold.filter((c) => c.cycle === cy).length })),
    soldAt: { list: sold.filter((c) => !c.hasCustomPrice && !c.couponId).length, custom: sold.filter((c) => c.hasCustomPrice).length, coupon: sold.filter((c) => c.couponId).length },
  });
});

adminRouter.get("/reports/customers.xlsx", async (req, res) => {
  const rows = scope(req, await customerRows());
  await sendXlsx(res, "jippronex-customers", [
    { header: "Customer ID", key: "code" }, { header: "Business", key: "name", width: 26 }, { header: "Owner", key: "owner", width: 18 }, { header: "Mobile", key: "phone" },
    { header: "City", key: "city" }, { header: "Plan", key: "plan", width: 18 }, { header: "Cycle", key: "cycle" }, { header: "List", key: "listPrice" }, { header: "Sold at", key: "price" },
    { header: "Sold by", key: "soldBy", width: 20 }, { header: "Valid from", key: "from" }, { header: "Valid till", key: "till" }, { header: "Status", key: "status" },
  ], rows.map((c) => ({ ...c, owner: c.owner?.name, phone: c.owner?.phone, plan: c.plan?.name, soldBy: sellerLabel(c.seller),
    from: c.subscription?.startsAt?.toLocaleDateString("en-IN"), till: c.subscription?.endsAt?.toLocaleDateString("en-IN") ?? "Lifetime" })));
});

// ─────────── Team & partners ───────────
adminRouter.get("/sellers", async (_req, res) => {
  const sellers = await db.select().from(S.sellers).orderBy(asc(S.sellers.name));
  const admins = await db.select({ id: S.adminUsers.id, name: S.adminUsers.name, email: S.adminUsers.email, role: S.adminUsers.role, sellerId: S.adminUsers.sellerId, active: S.adminUsers.active }).from(S.adminUsers);
  const payouts = await db.select().from(S.commissionPayouts).orderBy(desc(S.commissionPayouts.paidAt)).limit(50);
  res.json({ sellers: sellers.map((s) => ({ ...s, login: admins.find((a) => a.sellerId === s.id) ?? null })), admins, payouts });
});
adminRouter.post("/sellers", superOnly, async (req, res) => {
  const d = parse(z.object({ name: z.string().min(2), type: z.enum(["STAFF", "PARTNER", "DIRECT"]), city: z.string().nullish(), phone: z.string().nullish(),
    commissionPct: z.coerce.number().min(0).max(100), email: z.string().email().optional(), password: z.string().min(6).optional() }), req.body);
  const out = await db.transaction(async (tx) => {
    const [s] = await tx.insert(S.sellers).values({ name: d.name, type: d.type, city: d.city, phone: d.phone, commissionPct: d.commissionPct }).returning();
    if (d.email && d.password) await tx.insert(S.adminUsers).values({ name: d.name, email: d.email.toLowerCase(), passwordHash: await bcrypt.hash(d.password, 10),
      role: d.type === "PARTNER" ? "PARTNER" : "SALES", sellerId: s.id });
    return s;
  });
  res.status(201).json(out);
});
adminRouter.put("/sellers/:id", superOnly, async (req, res) => {
  const d = parse(z.object({ name: z.string(), city: z.string().nullish(), phone: z.string().nullish(), commissionPct: z.coerce.number(), active: z.boolean() }).partial(), req.body);
  const [s] = await db.update(S.sellers).set(d).where(eq(S.sellers.id, String(req.params.id))).returning();
  res.json(s);
});
adminRouter.post("/sellers/:id/payout", superOnly, async (req, res) => {
  const d = parse(z.object({ amount: z.coerce.number().positive(), note: z.string().optional() }), req.body);
  const [p] = await db.insert(S.commissionPayouts).values({ sellerId: String(req.params.id), ...d }).returning();
  res.status(201).json(p);
});
adminRouter.post("/admins", superOnly, async (req, res) => {
  const d = parse(z.object({ name: z.string(), email: z.string().email(), password: z.string().min(6), role: z.enum(["SUPER_ADMIN", "SALES", "PARTNER"]) }), req.body);
  const [a] = await db.insert(S.adminUsers).values({ name: d.name, email: d.email.toLowerCase(), passwordHash: await bcrypt.hash(d.password, 10), role: d.role }).returning({ id: S.adminUsers.id });
  res.status(201).json(a);
});
adminRouter.put("/admins/:id/password", async (req, res) => {
  if (req.admin!.role !== "SUPER_ADMIN" && req.admin!.id !== String(req.params.id)) throw bad("Not allowed");
  const { password } = parse(z.object({ password: z.string().min(6) }), req.body);
  await db.update(S.adminUsers).set({ passwordHash: await bcrypt.hash(password, 10) }).where(eq(S.adminUsers.id, String(req.params.id)));
  res.json({ ok: true });
});

export const _v = endFor;
