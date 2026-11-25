import { Router } from "express";
import crypto from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema as S } from "../db/index.js";
import { parse, bad, HttpError, normPhone } from "../lib/util.js";
import { signUser, requireUser } from "../lib/auth.js";
import { sendOtpSms } from "../lib/notify.js";
import { currentSubscription, startTrial } from "../services/subscription.js";
import { stateFromGstin, GST_STATES } from "../lib/gst.js";

export const authRouter = Router();
const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

authRouter.post("/otp/send", async (req, res) => {
  const { phone } = parse(z.object({ phone: z.string() }), req.body);
  const p = normPhone(phone);
  if (!/^[6-9]\d{9}$/.test(p)) throw bad("Enter a valid 10-digit mobile number");
  // simple rate limit: 5 OTPs / 15 min
  const recent = await db.select({ c: sql<number>`count(*)::int` }).from(S.otps)
    .where(and(eq(S.otps.phone, p), gt(S.otps.createdAt, new Date(Date.now() - 15 * 60000))));
  if (recent[0].c >= 5) throw new HttpError(429, "Too many OTP requests. Try again in a few minutes.");
  const demo = process.env.DEMO_PHONE && p === process.env.DEMO_PHONE;
  const code = demo ? (process.env.DEMO_OTP || "482100") : String(crypto.randomInt(100000, 999999));
  await db.insert(S.otps).values({ phone: p, codeHash: hash(p + code), expiresAt: new Date(Date.now() + 10 * 60000) });
  await sendOtpSms(p, code);
  res.json({ ok: true, resendIn: 30, ...(process.env.OTP_DEV_MODE === "true" ? { devOtp: code } : {}) });
});

authRouter.post("/otp/verify", async (req, res) => {
  const { phone, code, name } = parse(z.object({ phone: z.string(), code: z.string().min(4), name: z.string().optional(), via: z.string().optional() }), req.body);
  const p = normPhone(phone);
  const otp = (await db.select().from(S.otps).where(and(eq(S.otps.phone, p), isNull(S.otps.usedAt), gt(S.otps.expiresAt, new Date())))
    .orderBy(desc(S.otps.createdAt)).limit(1))[0];
  if (!otp) throw bad("OTP expired. Please request a new one.");
  if (otp.attempts >= 5) throw bad("Too many wrong attempts. Request a new OTP.");
  if (otp.codeHash !== hash(p + code.trim())) {
    await db.update(S.otps).set({ attempts: otp.attempts + 1 }).where(eq(S.otps.id, otp.id));
    throw bad("Wrong OTP");
  }
  await db.update(S.otps).set({ usedAt: new Date() }).where(eq(S.otps.id, otp.id));
  let user = await db.query.users.findFirst({ where: eq(S.users.phone, p) });
  if (!user) [user] = await db.insert(S.users).values({ phone: p, name: name || "Owner" }).returning();
  await db.update(S.users).set({ lastLoginAt: new Date(), lastLoginVia: (req.body.via as string) || (req.headers["x-client"] as string) || "web" }).where(eq(S.users.id, user.id));
  // Activate pending invites
  await db.update(S.memberships).set({ status: "ACTIVE" }).where(and(eq(S.memberships.userId, user.id), eq(S.memberships.status, "INVITED")));
  res.json({ token: signUser(user.id), ...(await meFor(user.id)) });
});

async function meFor(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(S.users.id, userId) });
  const rows = await db.select({ m: S.memberships, b: S.businesses }).from(S.memberships)
    .innerJoin(S.businesses, eq(S.businesses.id, S.memberships.businessId))
    .where(and(eq(S.memberships.userId, userId), eq(S.memberships.status, "ACTIVE")))
    .orderBy(desc(S.memberships.createdAt));
  const businesses = await Promise.all(rows.map(async (r) => ({
    id: r.b.id, name: r.b.name, gstin: r.b.gstin, city: r.b.city, role: r.m.role, status: r.b.status,
    subscription: await currentSubscription(r.b.id),
  })));
  return { user, businesses, needsSetup: businesses.length === 0 };
}

authRouter.get("/me", requireUser, async (req, res) => {
  res.json({ ...(await meFor(req.user!.id)), impersonatedBy: req.impersonatedBy });
});

const setupSchema = z.object({
  name: z.string().min(2),
  ownerName: z.string().optional(),
  gstin: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Invalid GSTIN").optional().or(z.literal("")),
  businessType: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  stateCode: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  planCode: z.string().optional(),
});

/** Onboarding step 1 (Business setup) — also used to add a 2nd shop. Starts a 7-day trial. */
authRouter.post("/business", requireUser, async (req, res) => {
  const b = parse(setupSchema, req.body);
  const stateCode = stateFromGstin(b.gstin) || b.stateCode || "19";
  const out = await db.transaction(async (tx) => {
    const n = (await tx.execute(sql`insert into counters (business_id, key, value) values ('__jippronex__', 'CUSTOMER', 1)
      on conflict (business_id, key) do update set value = counters.value + 1 returning value`)).rows[0] as any;
    const [biz] = await tx.insert(S.businesses).values({
      code: `JX-C-${String(n.value).padStart(5, "0")}`, name: b.name, ownerName: b.ownerName || req.user!.name,
      phone: req.user!.phone, email: b.email || req.user!.email, gstin: b.gstin || null, businessType: b.businessType,
      address: b.address, city: b.city, stateCode, state: GST_STATES[stateCode],
      preferences: { allowZeroStockBilling: true, sendInvoiceWhatsapp: true, lowStockWhatsapp: true, dailySummary: true, autoBackup: true, showMrp: false },
    }).returning();
    await tx.insert(S.memberships).values({ userId: req.user!.id, businessId: biz.id, role: "OWNER" });
    if (b.ownerName && req.user!.name === "Owner") await tx.update(S.users).set({ name: b.ownerName }).where(eq(S.users.id, req.user!.id));
    await startTrial(tx, biz.id, b.planCode || "BILLING_INV");
    for (const c of ["Grocery", "Personal care", "Home care", "Packaged food"]) await tx.insert(S.categories).values({ businessId: biz.id, name: c }).onConflictDoNothing();
    await tx.insert(S.parties).values({ businessId: biz.id, type: "CUSTOMER", name: "Walk-in customers" });
    return biz;
  });
  res.status(201).json({ business: out, ...(await meFor(req.user!.id)) });
});
