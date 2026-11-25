import { and, desc, eq, inArray, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { db, schema, type DbOrTx, type Tx } from "../db/index.js";
import { addMonths, addDays, bad, notFound, r2, fyRange } from "../lib/util.js";
import { createPaymentLink } from "../lib/razorpay.js";
import { nextSeq } from "../lib/numbering.js";

const S = schema;
export type Cycle = (typeof S.cycleEnum.enumValues)[number];
export const GST_RATE = 18;

export function listPriceFor(plan: typeof S.plans.$inferSelect, cycle: Cycle) {
  switch (cycle) {
    case "MONTHLY": return plan.monthlyPrice;
    case "YEARLY": return plan.yearlyPrice;
    case "TWO_YEAR": return plan.twoYearPrice ?? r2(plan.yearlyPrice * 2);
    case "LIFETIME": return plan.lifetimePrice ?? r2(plan.yearlyPrice * 4);
    default: return 0;
  }
}
export function endFor(start: Date, cycle: Cycle, trialDays = 7) {
  switch (cycle) {
    case "MONTHLY": return addDays(addMonths(start, 1), -1);
    case "YEARLY": return addDays(addMonths(start, 12), -1);
    case "TWO_YEAR": return addDays(addMonths(start, 24), -1);
    case "LIFETIME": return null;
    default: return addDays(start, trialDays);
  }
}
export const withGst = (base: number) => {
  const gst = r2(base * GST_RATE / 100);
  return { base: r2(base), gst, total: Math.round(base + gst) };
};

/** Effective subscription for a business (latest non-cancelled), with live status. */
export async function currentSubscription(businessId: string, tx: DbOrTx = db) {
  const rows = await tx.select({ s: S.subscriptions, p: S.plans }).from(S.subscriptions)
    .innerJoin(S.plans, eq(S.plans.id, S.subscriptions.planId))
    .where(and(eq(S.subscriptions.businessId, businessId), inArray(S.subscriptions.status, ["TRIAL", "ACTIVE", "EXPIRED", "SUSPENDED", "FAILED"])))
    .orderBy(desc(S.subscriptions.startsAt)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const now = Date.now();
  let status = row.s.status;
  if ((status === "ACTIVE" || status === "TRIAL") && row.s.endsAt && row.s.endsAt.getTime() < now) status = "EXPIRED";
  const daysLeft = row.s.endsAt ? Math.ceil((row.s.endsAt.getTime() - now) / 86400000) : null;
  return { ...row.s, status, daysLeft, plan: row.p, usable: status === "ACTIVE" || status === "TRIAL" };
}

export async function invoiceNoFor(tx: DbOrTx) {
  const fy = fyRange();
  const seq = await nextSeq(tx, "__jippronex__", `SAAS_INV:${fy.startY}`);
  return `JX/${String(fy.startY).slice(2)}-${String(fy.startY + 1).slice(2)}/${String(seq).padStart(4, "0")}`;
}

export function priceWithCoupon(list: number, coupon?: typeof S.coupons.$inferSelect | null) {
  if (!coupon) return list;
  return coupon.type === "PERCENT" ? r2(list * (1 - coupon.value / 100)) : r2(Math.max(0, list - coupon.value));
}

export async function validCoupon(code: string | undefined | null, planCode: string, isPartner = false) {
  if (!code) return null;
  const c = await db.query.coupons.findFirst({ where: eq(S.coupons.code, code.trim().toUpperCase()) });
  if (!c || !c.active) throw bad("Coupon is not valid");
  if (c.validTill && c.validTill < new Date()) throw bad("Coupon has expired");
  if (c.maxUses != null && c.used >= c.maxUses) throw bad("Coupon limit reached");
  if (c.partnersOnly && !isPartner) throw bad("Coupon is for partners only");
  if (c.planCodes.length && !c.planCodes.includes(planCode)) throw bad("Coupon not valid for this plan");
  return c;
}

/**
 * Creates a pending subscription + payment and a payment link.
 * Used by: Admin › New Sale, Admin › Renewal link, app/CRM "Pay / Renew / Upgrade".
 */
export async function createSubscriptionOrder(tx: Tx, o: {
  businessId: string; planId: string; cycle: Cycle; price: number; listPrice: number;
  purpose: "NEW_SALE" | "RENEWAL" | "UPGRADE"; sellerId?: string | null; commissionPct?: number;
  couponId?: string | null; usersAllowed?: number; autoRenew?: boolean;
  method?: "LINK" | "CASH" | "BANK" | "UPI_QR"; collectedBy?: string | null; reference?: string | null;
}) {
  const biz = await tx.query.businesses.findFirst({ where: eq(S.businesses.id, o.businessId) });
  const plan = await tx.query.plans.findFirst({ where: eq(S.plans.id, o.planId) });
  if (!biz || !plan) throw notFound();
  const amt = withGst(o.price);
  const [sub] = await tx.insert(S.subscriptions).values({
    businessId: biz.id, planId: plan.id, cycle: o.cycle, status: "PENDING_PAYMENT", listPrice: o.listPrice, price: r2(o.price),
    couponId: o.couponId ?? null, sellerId: o.sellerId ?? null, commissionPct: o.commissionPct ?? 0,
    usersAllowed: o.usersAllowed ?? plan.usersIncluded, autoRenew: !!o.autoRenew, startsAt: new Date(),
  }).returning();
  const linkCode = `${biz.name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "JX"}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const offline = o.method === "CASH" || o.method === "BANK";
  const [pay] = await tx.insert(S.subscriptionPayments).values({
    businessId: biz.id, subscriptionId: sub.id, purpose: o.purpose,
    description: `${o.purpose === "RENEWAL" ? "Renewal" : o.purpose === "UPGRADE" ? "Upgrade" : "New sale"} — ${plan.name} (${o.cycle.toLowerCase()})`,
    amount: amt.total, baseAmount: amt.base, gstAmount: amt.gst,
    status: offline ? "TO_DEPOSIT" : "CREATED", method: offline ? (o.method === "CASH" ? "Cash" : "Bank") : null,
    gateway: offline ? "offline" : "razorpay", linkCode, collectedBy: o.collectedBy ?? null,
    gatewayPaymentId: offline ? `${o.method}-${crypto.randomBytes(3).toString("hex").toUpperCase()}` : null,
  }).returning();
  let linkUrl = `${process.env.API_PUBLIC_URL || ""}/pay/${linkCode}`;
  if (!offline) {
    try {
      const link = await createPaymentLink({
        amount: amt.total, reference: pay.id, description: pay.description!,
        customer: { name: biz.ownerName || biz.name, contact: biz.phone, email: biz.email },
        callbackUrl: `${process.env.API_PUBLIC_URL || ""}/pay/${linkCode}/done`,
      });
      if (link) { linkUrl = link.url; await tx.update(S.subscriptionPayments).set({ gatewayLinkId: link.id }).where(eq(S.subscriptionPayments.id, pay.id)); }
    } catch (e: any) { console.error("Payment link failed:", e.message); }
  }
  await tx.update(S.subscriptionPayments).set({ linkUrl }).where(eq(S.subscriptionPayments.id, pay.id));
  // Offline cash/bank: activate right away (money is with the seller → "To deposit")
  if (offline) await activatePayment(tx, pay.id, { method: o.method === "CASH" ? "Cash" : "Bank", keepStatus: true });
  return { subscription: sub, payment: { ...pay, linkUrl }, amount: amt };
}

/** Marks a subscription payment captured and activates/extends the plan. Idempotent. */
export async function activatePayment(tx: Tx, paymentRowId: string, o: { gatewayPaymentId?: string; method?: string; keepStatus?: boolean } = {}) {
  const pay = await tx.query.subscriptionPayments.findFirst({ where: eq(S.subscriptionPayments.id, paymentRowId) });
  if (!pay) throw notFound("Payment not found");
  if (pay.status === "CAPTURED" || (pay.paidAt && pay.invoiceNo)) return pay;
  const sub = pay.subscriptionId ? await tx.query.subscriptions.findFirst({ where: eq(S.subscriptions.id, pay.subscriptionId) }) : null;
  const invoiceNo = await invoiceNoFor(tx);
  const [updated] = await tx.update(S.subscriptionPayments).set({
    status: o.keepStatus ? pay.status : "CAPTURED", paidAt: new Date(), invoiceNo,
    gatewayPaymentId: o.gatewayPaymentId ?? pay.gatewayPaymentId, method: o.method ?? pay.method,
  }).where(eq(S.subscriptionPayments.id, pay.id)).returning();
  if (sub) {
    const plan = await tx.query.plans.findFirst({ where: eq(S.plans.id, sub.planId) });
    // Start after the current paid period if renewing early
    const prev = await currentSubscription(sub.businessId, tx);
    const start = prev && prev.id !== sub.id && prev.status === "ACTIVE" && prev.endsAt && prev.endsAt > new Date() && pay.purpose === "RENEWAL"
      ? addDays(prev.endsAt, 1) : new Date();
    if (prev && prev.id !== sub.id && (pay.purpose !== "RENEWAL" || prev.status !== "ACTIVE")) {
      await tx.update(S.subscriptions).set({ status: "CANCELLED" }).where(eq(S.subscriptions.id, prev.id));
    }
    await tx.update(S.subscriptions).set({ status: "ACTIVE", startsAt: start, endsAt: endFor(start, sub.cycle, plan?.trialDays) })
      .where(eq(S.subscriptions.id, sub.id));
    if (sub.couponId) await tx.update(S.coupons).set({ used: sql`${S.coupons.used} + 1` }).where(eq(S.coupons.id, sub.couponId));
    await tx.update(S.businesses).set({ status: "ACTIVE" }).where(eq(S.businesses.id, sub.businessId));
  }
  return updated;
}

export async function markPaymentFailed(tx: Tx, paymentRowId: string, reason?: string, gatewayPaymentId?: string) {
  const pay = await tx.query.subscriptionPayments.findFirst({ where: eq(S.subscriptionPayments.id, paymentRowId) });
  if (!pay || pay.status === "CAPTURED") return;
  await tx.update(S.subscriptionPayments).set({ status: "FAILED", failureReason: reason, gatewayPaymentId: gatewayPaymentId ?? pay.gatewayPaymentId })
    .where(eq(S.subscriptionPayments.id, pay.id));
  if (pay.subscriptionId) await tx.update(S.subscriptions).set({ status: "FAILED" }).where(and(eq(S.subscriptions.id, pay.subscriptionId), eq(S.subscriptions.status, "PENDING_PAYMENT")));
}

export async function startTrial(tx: DbOrTx, businessId: string, planCode = "BILLING_INV") {
  const plan = await tx.query.plans.findFirst({ where: eq(S.plans.code, planCode) });
  if (!plan) throw notFound("Plan not found");
  const start = new Date();
  const [sub] = await tx.insert(S.subscriptions).values({
    businessId, planId: plan.id, cycle: "TRIAL", status: "TRIAL", listPrice: 0, price: 0, usersAllowed: plan.usersIncluded,
    startsAt: start, endsAt: addDays(start, plan.trialDays),
  }).returning();
  return sub;
}

/** Customer-specific price if one exists & valid, else list price. */
export async function effectivePrice(businessId: string, plan: typeof S.plans.$inferSelect, cycle: Cycle) {
  const list = listPriceFor(plan, cycle);
  const cp = await db.query.customPrices.findFirst({ where: and(eq(S.customPrices.businessId, businessId), eq(S.customPrices.planId, plan.id)) });
  if (cp && cp.cycle === cycle && (!cp.validTill || cp.validTill > new Date())) return { list, price: cp.price, custom: true };
  return { list, price: list, custom: false };
}
