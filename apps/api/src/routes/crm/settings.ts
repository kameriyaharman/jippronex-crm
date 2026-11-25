import { Router } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db, schema as S } from "../../db/index.js";
import { parse, bad, notFound, normPhone, forbidden } from "../../lib/util.js";
import { need, PERMS } from "../../lib/auth.js";
import { currentSubscription, createSubscriptionOrder, effectivePrice, validCoupon, priceWithCoupon, withGst, listPriceFor } from "../../services/subscription.js";
import { stateFromGstin, GST_STATES } from "../../lib/gst.js";

export const settingsRouter = Router();

settingsRouter.get("/business", async (req, res) => {
  const b = await db.query.businesses.findFirst({ where: eq(S.businesses.id, req.businessId!) });
  const [shops] = await db.select({ c: sql<number>`count(*)::int` }).from(S.memberships).where(and(eq(S.memberships.userId, req.user!.id), eq(S.memberships.status, "ACTIVE")));
  res.json({ ...b, role: req.role, permissions: PERMS[req.role!], shops: shops.c, states: GST_STATES });
});

settingsRouter.put("/business", need("settings"), async (req, res) => {
  const d = parse(z.object({
    name: z.string().min(2), ownerName: z.string().nullish(), phone: z.string().nullish(), email: z.string().nullish(),
    gstin: z.string().trim().toUpperCase().nullish(), businessType: z.string().nullish(), address: z.string().nullish(), city: z.string().nullish(),
    stateCode: z.string().nullish(), pincode: z.string().nullish(), invoicePrefix: z.string().max(12).optional(),
    bankName: z.string().nullish(), bankAccount: z.string().nullish(), bankIfsc: z.string().nullish(), upiId: z.string().nullish(),
    terms: z.string().nullish(), invoiceTemplate: z.enum(["MODERN", "CLASSIC", "COMPACT"]).optional(),
    logoUrl: z.string().max(1_500_000).nullish(), signatureUrl: z.string().max(1_500_000).nullish(),
    preferences: z.object({
      allowZeroStockBilling: z.boolean(), lowStockWhatsapp: z.boolean(), sendInvoiceWhatsapp: z.boolean(), dailySummary: z.boolean(),
      autoBackup: z.boolean(), showMrp: z.boolean(), printer: z.string(), invoiceOptions: z.record(z.boolean()),
    }).partial().optional(),
  }).partial(), req.body);
  const cur = await db.query.businesses.findFirst({ where: eq(S.businesses.id, req.businessId!) });
  const stateCode = (d.gstin && stateFromGstin(d.gstin)) || d.stateCode || cur!.stateCode;
  const [b] = await db.update(S.businesses).set({
    ...d, stateCode, state: GST_STATES[stateCode],
    ...(d.preferences ? { preferences: { ...(cur!.preferences as object), ...d.preferences } } : {}),
  } as any).where(eq(S.businesses.id, req.businessId!)).returning();
  res.json(b);
});

// ── users & roles ──
settingsRouter.get("/users", async (req, res) => {
  const rows = await db.select({ m: S.memberships, u: S.users }).from(S.memberships).innerJoin(S.users, eq(S.users.id, S.memberships.userId))
    .where(eq(S.memberships.businessId, req.businessId!)).orderBy(asc(S.memberships.createdAt));
  const sub = await currentSubscription(req.businessId!);
  res.json({ users: rows.map((r) => ({ id: r.m.id, userId: r.u.id, name: r.u.name, phone: r.u.phone, role: r.m.role, status: r.m.status, lastLoginAt: r.u.lastLoginAt })),
    allowed: sub?.usersAllowed ?? 1, matrix: PERMS });
});

settingsRouter.post("/users", need("settings"), async (req, res) => {
  const d = parse(z.object({ name: z.string().min(1), phone: z.string(), role: z.enum(["BILLING", "ACCOUNTANT", "STORE", "OWNER"]), password: z.string().min(6, "Password must be at least 6 characters").optional().or(z.literal("")) }), req.body);
  const phone = normPhone(d.phone);
  if (!/^[6-9]\d{9}$/.test(phone)) throw bad("Enter a valid mobile number");
  const sub = await currentSubscription(req.businessId!);
  const [cnt] = await db.select({ c: sql<number>`count(*)::int` }).from(S.memberships).where(and(eq(S.memberships.businessId, req.businessId!), sql`${S.memberships.status} <> 'DISABLED'`));
  if (cnt.c >= (sub?.usersAllowed ?? 1)) throw bad(`Your plan allows ${sub?.usersAllowed ?? 1} users. Upgrade or add an extra user.`);
  let u = await db.query.users.findFirst({ where: eq(S.users.phone, phone) });
  if (!u) [u] = await db.insert(S.users).values({ name: d.name, phone }).returning();
  // Owner can give staff a starting password (needed while SMS OTP is not set up)
  if (d.password && !u.passwordHash) await db.update(S.users).set({ passwordHash: await bcrypt.hash(d.password, 10) }).where(eq(S.users.id, u.id));
  const [m] = await db.insert(S.memberships).values({ userId: u.id, businessId: req.businessId!, role: d.role, status: "INVITED" })
    .onConflictDoUpdate({ target: [S.memberships.userId, S.memberships.businessId], set: { role: d.role, status: "INVITED" } }).returning();
  res.status(201).json(m);
});

settingsRouter.put("/users/:id", need("settings"), async (req, res) => {
  const d = parse(z.object({ role: z.enum(["BILLING", "ACCOUNTANT", "STORE", "OWNER"]).optional(), status: z.enum(["ACTIVE", "DISABLED"]).optional() }), req.body);
  const m = await db.query.memberships.findFirst({ where: and(eq(S.memberships.id, String(req.params.id)), eq(S.memberships.businessId, req.businessId!)) });
  if (!m) throw notFound();
  if (m.userId === req.user!.id) throw forbidden("You can't change your own access");
  const [u] = await db.update(S.memberships).set(d).where(eq(S.memberships.id, m.id)).returning();
  res.json(u);
});

// ── subscription (Settings & subscription / onboarding plan screen) ──
settingsRouter.get("/subscription", async (req, res) => {
  const sub = await currentSubscription(req.businessId!);
  const history = await db.select().from(S.subscriptionPayments).where(eq(S.subscriptionPayments.businessId, req.businessId!)).orderBy(desc(S.subscriptionPayments.createdAt)).limit(20);
  res.json({ subscription: sub, payments: history });
});

settingsRouter.get("/plans", async (req, res) => {
  const plans = await db.select().from(S.plans).where(eq(S.plans.active, true)).orderBy(asc(S.plans.sortOrder));
  res.json(await Promise.all(plans.map(async (p) => {
    const y = await effectivePrice(req.businessId!, p, "YEARLY");
    const m = await effectivePrice(req.businessId!, p, "MONTHLY");
    return { ...p, yearly: { ...y, ...withGst(y.price) }, monthly: { ...m, ...withGst(m.price) } };
  })));
});

/** Start a payment for plan purchase / renewal / upgrade. Returns a payment link to open. */
settingsRouter.post("/subscribe", need("settings"), async (req, res) => {
  const d = parse(z.object({ planCode: z.string(), cycle: z.enum(["MONTHLY", "YEARLY", "TWO_YEAR"]), coupon: z.string().optional() }), req.body);
  const plan = await db.query.plans.findFirst({ where: eq(S.plans.code, d.planCode) });
  if (!plan) throw notFound("Plan not found");
  const eff = await effectivePrice(req.businessId!, plan, d.cycle);
  const coupon = await validCoupon(d.coupon, plan.code);
  const price = coupon ? priceWithCoupon(eff.price, coupon) : eff.price;
  const cur = await currentSubscription(req.businessId!);
  const purpose = !cur || cur.cycle === "TRIAL" ? "NEW_SALE" : cur.planId === plan.id ? "RENEWAL" : "UPGRADE";
  const out = await db.transaction((tx) => createSubscriptionOrder(tx, {
    businessId: req.businessId!, planId: plan.id, cycle: d.cycle, price, listPrice: listPriceFor(plan, d.cycle), purpose,
    couponId: coupon?.id, sellerId: cur?.sellerId, commissionPct: cur?.commissionPct, method: "LINK",
  }));
  res.status(201).json({ paymentId: out.payment.id, url: out.payment.linkUrl, amount: out.amount });
});

settingsRouter.get("/subscribe/:paymentId", async (req, res) => {
  const p = await db.query.subscriptionPayments.findFirst({ where: and(eq(S.subscriptionPayments.id, String(req.params.paymentId)), eq(S.subscriptionPayments.businessId, req.businessId!)) });
  if (!p) throw notFound();
  res.json({ status: p.status, paidAt: p.paidAt, subscription: await currentSubscription(req.businessId!) });
});
