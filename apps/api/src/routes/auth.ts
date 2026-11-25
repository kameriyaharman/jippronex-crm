import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
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

/** Which login methods are available (SMS OTP needs a provider). */
authRouter.get("/config", (_req, res) => {
  const sms = (process.env.SMS_PROVIDER || "none") !== "none";
  res.json({ otp: sms || process.env.OTP_DEV_MODE === "true", password: true, demoPhone: process.env.DEMO_PHONE || null });
});

// Simple in-memory throttle for password attempts (per phone/email, 10 per 15 min)
const attempts = new Map<string, { n: number; t: number }>();
function throttle(key: string) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || now - a.t > 15 * 60000) { attempts.set(key, { n: 1, t: now }); return; }
  if (++a.n > 10) throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");
}

/** Retailer self-registration: name + mobile + password (+ optional email). */
authRouter.post("/register", async (req, res) => {
  const d = parse(z.object({ name: z.string().trim().min(2, "Enter your name"), phone: z.string(), password: z.string().min(6, "Password must be at least 6 characters"),
    email: z.string().trim().toLowerCase().email("Enter a valid email").optional().or(z.literal("")) }), req.body);
  const phone = normPhone(d.phone);
  if (!/^[6-9]\d{9}$/.test(phone)) throw bad("Enter a valid 10-digit mobile number");
  throttle("reg:" + (req.ip || ""));
  const existing = await db.query.users.findFirst({ where: eq(S.users.phone, phone) });
  if (existing?.passwordHash) throw bad("This mobile number is already registered. Please login.");
  if (existing) {
    // Without SMS verification we can't prove ownership — never let a stranger take over an existing business account
    const linked = await db.select({ id: S.memberships.id }).from(S.memberships).where(eq(S.memberships.userId, existing.id)).limit(1);
    if (linked.length || phone === process.env.DEMO_PHONE) throw bad("This number is already linked to a business. Ask your shop owner or Jippronex support to set your password.");
  }
  if (d.email) {
    const e = await db.query.users.findFirst({ where: eq(S.users.email, d.email) });
    if (e && e.id !== existing?.id) throw bad("This email is already registered");
  }
  const passwordHash = await bcrypt.hash(d.password, 10);
  let user;
  if (existing) {
    [user] = await db.update(S.users).set({ passwordHash, name: existing.name === "Owner" ? d.name : existing.name, email: d.email || existing.email }).where(eq(S.users.id, existing.id)).returning();
    await db.update(S.memberships).set({ status: "ACTIVE" }).where(and(eq(S.memberships.userId, user.id), eq(S.memberships.status, "INVITED")));
  } else {
    [user] = await db.insert(S.users).values({ name: d.name, phone, email: d.email || null, passwordHash }).returning();
  }
  await db.update(S.users).set({ lastLoginAt: new Date(), lastLoginVia: (req.headers["x-client"] as string) || "web" }).where(eq(S.users.id, user.id));
  res.status(201).json({ token: signUser(user.id), ...(await meFor(user.id)) });
});

/** Login with mobile or email + password */
authRouter.post("/login", async (req, res) => {
  const d = parse(z.object({ id: z.string().trim().min(3, "Enter mobile number or email"), password: z.string().min(1, "Enter password") }), req.body);
  const isEmail = d.id.includes("@");
  const key = isEmail ? d.id.toLowerCase() : normPhone(d.id);
  throttle("login:" + key);
  const user = await db.query.users.findFirst({ where: isEmail ? eq(S.users.email, key) : eq(S.users.phone, key) });
  if (!user) throw bad(isEmail ? "No account with this email" : "This number is not registered. Tap Register to create an account.");
  if (!user.passwordHash) throw bad("Password not set for this account. Tap Register with the same mobile number to set one.");
  if (!(await bcrypt.compare(d.password, user.passwordHash))) throw bad("Wrong password");
  attempts.delete("login:" + key);
  await db.update(S.users).set({ lastLoginAt: new Date(), lastLoginVia: (req.headers["x-client"] as string) || "web" }).where(eq(S.users.id, user.id));
  await db.update(S.memberships).set({ status: "ACTIVE" }).where(and(eq(S.memberships.userId, user.id), eq(S.memberships.status, "INVITED")));
  res.json({ token: signUser(user.id), ...(await meFor(user.id)) });
});

/** Change / set password when logged in */
authRouter.post("/password", requireUser, async (req, res) => {
  const d = parse(z.object({ current: z.string().optional(), password: z.string().min(6, "Password must be at least 6 characters") }), req.body);
  const u = req.user!;
  if (u.passwordHash && !(d.current && (await bcrypt.compare(d.current, u.passwordHash)))) throw bad("Current password is wrong");
  await db.update(S.users).set({ passwordHash: await bcrypt.hash(d.password, 10) }).where(eq(S.users.id, u.id));
  res.json({ ok: true });
});

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
  const u = await db.query.users.findFirst({ where: eq(S.users.id, userId) });
  const { passwordHash, ...rest } = u || ({} as any);
  const user = u ? { ...rest, hasPassword: !!passwordHash } : null;
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
