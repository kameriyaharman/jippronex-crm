import bcrypt from "bcryptjs";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db, schema as S } from "./db/index.js";

export const DEFAULT_PLANS = [
  { code: "SMART", name: "Smart Billing", tagline: "GST & non-GST billing, parties", monthlyPrice: 499, yearlyPrice: 4999, usersIncluded: 1, maxProducts: 2000, storageGb: 2, sortOrder: 1,
    features: { billing: true, whatsapp: true, ledger: true, inventory: false, purchase: false, accounts: false, android: true } },
  { code: "BILLING_INV", name: "Billing + Inventory", tagline: "+ stock, barcode, purchase", monthlyPrice: 799, yearlyPrice: 7999, usersIncluded: 3, maxProducts: 5000, storageGb: 5, sortOrder: 2,
    features: { billing: true, whatsapp: true, ledger: true, inventory: true, purchase: true, accounts: false, android: true } },
  { code: "COMPLETE", name: "Complete Business", tagline: "+ accounts, GST reports, users", monthlyPrice: 1199, yearlyPrice: 11999, usersIncluded: 5, maxProducts: 20000, storageGb: 10, sortOrder: 3,
    features: { billing: true, whatsapp: true, ledger: true, inventory: true, purchase: true, accounts: true, android: true } },
];

/** First boot: plans + super admin */
export async function bootstrap() {
  const [p] = await db.select({ c: sql<number>`count(*)::int` }).from(S.plans);
  if (!p.c) await db.insert(S.plans).values(DEFAULT_PLANS);
  const [a] = await db.select({ c: sql<number>`count(*)::int` }).from(S.adminUsers);
  if (!a.c) {
    const email = (process.env.ADMIN_EMAIL || "admin@jippronex.com").toLowerCase();
    await db.insert(S.adminUsers).values({ name: "Super Admin", email, passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || "Admin@123", 10), role: "SUPER_ADMIN" });
    console.log(`Created super admin ${email}`);
  }
}

async function expireSubscriptions() {
  const now = new Date();
  const r = await db.update(S.subscriptions).set({ status: "EXPIRED" })
    .where(and(inArray(S.subscriptions.status, ["ACTIVE", "TRIAL"]), lt(S.subscriptions.endsAt, now))).returning({ id: S.subscriptions.id });
  if (r.length) console.log(`[jobs] expired ${r.length} subscriptions`);
  // Stale unpaid links older than 30 days → cancelled
  await db.update(S.subscriptions).set({ status: "CANCELLED" })
    .where(and(eq(S.subscriptions.status, "PENDING_PAYMENT"), lt(S.subscriptions.createdAt, new Date(now.getTime() - 30 * 86400000))));
}

export function startJobs() {
  const run = () => expireSubscriptions().catch((e) => console.error("[jobs]", e));
  setTimeout(run, 10_000);
  setInterval(run, 60 * 60 * 1000);
}
