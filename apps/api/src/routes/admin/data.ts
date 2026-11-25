import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema as S } from "../../db/index.js";

export type CustomerStatus = "ACTIVE" | "TRIAL" | "EXPIRING" | "EXPIRED" | "FAILED" | "SUSPENDED" | "PENDING";

/** One row per business with its effective subscription — used by Customers, Renewals, Dashboard, Reports. */
export async function customerRows() {
  const [bizs, subs, plans, sellers, owners, customs] = await Promise.all([
    db.select().from(S.businesses),
    db.select().from(S.subscriptions).orderBy(desc(S.subscriptions.startsAt)),
    db.select().from(S.plans),
    db.select().from(S.sellers),
    db.select({ businessId: S.memberships.businessId, name: S.users.name, phone: S.users.phone, lastLoginAt: S.users.lastLoginAt, via: S.users.lastLoginVia })
      .from(S.memberships).innerJoin(S.users, eq(S.users.id, S.memberships.userId)).where(eq(S.memberships.role, "OWNER")),
    db.select().from(S.customPrices),
  ]);
  const planById = new Map(plans.map((p) => [p.id, p]));
  const sellerById = new Map(sellers.map((s) => [s.id, s]));
  const subsByBiz = new Map<string, typeof subs>();
  subs.forEach((s) => { const a = subsByBiz.get(s.businessId) || []; a.push(s); subsByBiz.set(s.businessId, a); });
  const now = Date.now();
  return bizs.map((b) => {
    const list = subsByBiz.get(b.id) || [];
    const live = list.filter((s) => s.status !== "CANCELLED" && s.status !== "PENDING_PAYMENT");
    const latest = live[0];
    const paid = live.find((s) => s.status === "ACTIVE" || s.status === "EXPIRED" || s.status === "SUSPENDED") || latest;
    const shown = latest?.status === "FAILED" && paid ? paid : latest;
    const pending = list.find((s) => s.status === "PENDING_PAYMENT");
    let status: CustomerStatus = "PENDING";
    if (b.status === "SUSPENDED") status = "SUSPENDED";
    else if (latest?.status === "FAILED") status = "FAILED";
    else if (shown) {
      const ends = shown.endsAt?.getTime();
      if (shown.status === "TRIAL") status = ends && ends < now ? "EXPIRED" : "TRIAL";
      else if (shown.status === "ACTIVE" || shown.status === "EXPIRED") {
        if (ends && ends < now) status = "EXPIRED";
        else if (ends && ends - now < 30 * 86400000 && shown.cycle !== "MONTHLY") status = "EXPIRING";
        else if (ends && ends - now < 7 * 86400000) status = "EXPIRING";
        else status = "ACTIVE";
      } else status = shown.status as CustomerStatus;
    }
    const plan = shown ? planById.get(shown.planId) : pending ? planById.get(pending.planId) : undefined;
    const seller = shown?.sellerId ? sellerById.get(shown.sellerId) : pending?.sellerId ? sellerById.get(pending.sellerId) : undefined;
    const owner = owners.find((o) => o.businessId === b.id);
    const custom = customs.find((c) => c.businessId === b.id);
    const daysLeft = shown?.endsAt ? Math.ceil((shown.endsAt.getTime() - now) / 86400000) : null;
    return {
      id: b.id, code: b.code, name: b.name, city: b.city, state: b.state, gstin: b.gstin, createdAt: b.createdAt, businessStatus: b.status,
      owner: owner ? { name: owner.name, phone: owner.phone, lastLoginAt: owner.lastLoginAt, via: owner.via } : null,
      plan: plan ? { id: plan.id, code: plan.code, name: plan.name } : null,
      subscription: shown || pending || null, cycle: shown?.cycle ?? pending?.cycle ?? null,
      listPrice: shown?.listPrice ?? 0, price: shown?.price ?? 0,
      discountPct: shown && shown.listPrice ? Math.round(((shown.listPrice - shown.price) / shown.listPrice) * 100) : 0,
      seller: seller ? { id: seller.id, name: seller.name, type: seller.type } : null,
      status, daysLeft, customPrice: custom || null, hasCustomPrice: !!custom || (!!shown && shown.price < shown.listPrice && !shown.couponId),
      couponId: shown?.couponId ?? null, autoRenew: shown?.autoRenew ?? false,
    };
  });
}

export function sellerLabel(s: { name: string; type: string } | null | undefined) {
  if (!s) return "Direct · Website";
  if (s.type === "DIRECT") return `Direct · ${s.name}`;
  if (s.type === "PARTNER") return `Partner · ${s.name}`;
  return `${s.name} (sales)`;
}

export async function revenueBetween(from: Date, to: Date) {
  const [r] = await db.select({
    gross: sql<number>`coalesce(sum(${S.subscriptionPayments.amount}),0)::float`,
    base: sql<number>`coalesce(sum(${S.subscriptionPayments.baseAmount}),0)::float`,
    n: sql<number>`count(*)::int`,
  }).from(S.subscriptionPayments).where(and(inArray(S.subscriptionPayments.status, ["CAPTURED", "TO_DEPOSIT", "REFUNDED"]),
    sql`${S.subscriptionPayments.paidAt} >= ${from} and ${S.subscriptionPayments.paidAt} < ${to}`));
  return r;
}
