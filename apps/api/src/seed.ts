/**
 * Demo data matching the design (Sharma Traders + Jippronex customers).
 *   npm run db:seed            → only if database is empty
 *   npm run db:seed -- --reset → wipe everything and reseed
 * Demo logins:
 *   CRM / app : mobile 9830012345 (OTP shown in API logs / dev response)
 *   Admin     : admin@jippronex.com / Admin@123
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db, pool, schema as S, runMigrations } from "./db/index.js";
import { bootstrap } from "./jobs.js";
import { createInvoice, createPurchase, recordPayment, moveStock } from "./services/core.js";
import { createSubscriptionOrder, activatePayment, markPaymentFailed, listPriceFor, endFor } from "./services/subscription.js";
import { addDays, istStartOfDay } from "./lib/util.js";

let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const between = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1));

async function reset() {
  const tables = ["payment_allocations", "payments", "invoice_items", "invoices", "purchase_items", "purchases", "stock_movements", "products", "categories",
    "expenses", "parties", "subscription_payments", "subscriptions", "custom_prices", "coupons", "commission_payouts", "admin_users", "sellers",
    "memberships", "otps", "users", "counters", "businesses", "plans", "gateway_configs", "app_settings"];
  await db.execute(sql.raw(`truncate ${tables.join(",")} cascade`));
}

const PRODUCTS = [
  ["Aashirvaad Atta 10kg", "8901725181221", "1101", "Grocery", "bag", 382, 420, 440, 5, 25],
  ["Aashirvaad Atta 5kg", "8901725181238", "1101", "Grocery", "bag", 205, 230, 240, 5, 20],
  ["Fortune Sunflower Oil 1L", "8906007280014", "1512", "Edible oil", "pcs", 128, 145, 155, 5, 25],
  ["Tata Salt 1kg", "8904043901015", "2501", "Grocery", "pcs", 21, 26, 28, 0, 50],
  ["Surf Excel Easy Wash 1kg", "8901030617234", "3402", "Home care", "pcs", 98, 118, 125, 18, 20],
  ["Parle-G Biscuit 800g", "8901719110016", "1905", "Biscuits", "pcs", 66, 78, 80, 18, 30],
  ["Sunfeast Biscuit 200g", "8901725132216", "1905", "Biscuits", "pcs", 28, 35, 38, 18, 40],
  ["Colgate Strong 200g", "8901314010421", "3306", "Personal care", "pcs", 92, 110, 118, 18, 24],
  ["Dettol Soap 125g", "8901396393313", "3401", "Personal care", "pcs", 42, 52, 55, 18, 30],
  ["Maggi Noodles 280g", "8901058851298", "1902", "Packaged food", "pcs", 44, 52, 56, 12, 30],
  ["Vim Bar 300g", "8901030704521", "3402", "Home care", "pcs", 24, 30, 32, 18, 30],
  ["Tata Tea Premium 500g", "8901052071234", "0902", "Grocery", "pcs", 228, 260, 275, 5, 15],
  ["Fortune Mustard Oil 1L", "8906007280113", "1514", "Edible oil", "pcs", 152, 172, 180, 5, 20],
  ["Dabur Red Paste 200g", "8901207012345", "3306", "Personal care", "pcs", 96, 112, 120, 18, 15],
  ["Parachute Coconut Oil 500ml", "8901088012347", "1513", "Personal care", "pcs", 168, 192, 205, 18, 12],
  ["Nescafe Classic 50g", "8901058002346", "2101", "Packaged food", "pcs", 148, 170, 180, 18, 10],
  ["Tata Sampann Toor Dal 1kg", "8901052082341", "0713", "Grocery", "pcs", 148, 168, 175, 0, 20],
  ["India Gate Basmati 5kg", "8901765112340", "1006", "Grocery", "bag", 520, 590, 625, 5, 8],
  ["Lizol Floor Cleaner 975ml", "8901396312345", "3808", "Home care", "pcs", 182, 210, 222, 18, 10],
  ["Good Day Cashew 200g", "8901063012348", "1905", "Biscuits", "pcs", 34, 42, 45, 18, 30],
] as const;

const CUSTOMERS = [
  ["Gupta Kirana Store", "9434055121", "19AAKFG4471M1ZQ", "Station Road, Durgapur", "Durgapur", 50000, "Gupta Kirana Store (Godown), Plot 7, City Centre, Durgapur"],
  ["Maa Durga Traders", "9434011223", "19AAMFM2231K1Z2", "GT Road, Burnpur", "Asansol", 60000, null],
  ["Shree Ram Mart", "9832044556", "19ABEFS8812Q1Z9", "Hutton Road, Asansol", "Asansol", 40000, null],
  ["Bansal Stores", "9800122334", null, "Murgasol, Asansol", "Asansol", 25000, null],
  ["Lakshmi General Store", "9933011445", "19AAGFL5521P1ZK", "Benachity, Durgapur", "Durgapur", 30000, null],
] as const;
const SUPPLIERS = [
  ["ITC Distributors", "9830099001", "19AAACI1234F1Z1"], ["HUL Distributor", "9830099002", "19AAACH1234G1Z2"], ["Adani Wilmar", "9830099003", "24AAACA1234H1Z3"],
  ["Parle Depot", "9830099004", "19AAACP1234J1Z4"], ["Tata Consumer", "9830099005", "19AAACT1234K1Z5"], ["Dabur Agency", "9830099006", "19AAACD1234L1Z6"],
  ["Marico Depot", "9830099007", "19AAACM1234M1Z7"], ["Nestle Agency", "9830099008", "19AAACN1234N1Z8"],
] as const;
const supplierFor = (name: string) =>
  /Atta|Sunfeast|Good Day/.test(name) ? "ITC Distributors" : /Surf|Vim|Lizol/.test(name) ? "HUL Distributor" : /Fortune|Basmati/.test(name) ? "Adani Wilmar" :
  /Parle/.test(name) ? "Parle Depot" : /Tata/.test(name) ? "Tata Consumer" : /Dabur/.test(name) ? "Dabur Agency" : /Parachute/.test(name) ? "Marico Depot" :
  /Maggi|Nescafe/.test(name) ? "Nestle Agency" : "ITC Distributors";

/** Demo data should never show negative stock: top such items back up with a stock adjustment. */
async function fixNegativeStock(businessId: string) {
  const neg = await db.select().from(S.products).where(sql`${S.products.businessId} = ${businessId} and ${S.products.stock} < 0`);
  for (const p of neg) await db.transaction((tx) => moveStock(tx, { businessId, productId: p.id, qty: p.minStock * 3 - p.stock, reason: "ADJUSTMENT", note: "Physical stock count" }));
  return neg.length;
}

async function seedShop(code?: string) {
  const [owner] = await db.insert(S.users).values({ name: "Rakesh Sharma", phone: "9830012345", email: "rakesh@sharmatraders.in" }).returning();
  const n = code ? { value: 0 } : (await db.execute(sql`insert into counters (business_id, key, value) values ('__jippronex__','CUSTOMER',214) on conflict (business_id,key) do update set value = 214 returning value`)).rows[0] as any;
  const [biz] = await db.insert(S.businesses).values({
    code: code || `JX-C-${String(n.value).padStart(5, "0")}`, name: "Sharma Traders", ownerName: "Rakesh Sharma", phone: "9830012345", email: "sharmatraders@gmail.com",
    gstin: "19ABCPS1234K1Z5", businessType: "Retail / Wholesale — Grocery", address: "12, Bazar Road, Asansol, West Bengal", city: "Asansol", state: "West Bengal",
    stateCode: "19", pincode: "713301", bankName: "State Bank of India, Asansol Branch", bankAccount: "34567812 0091", bankIfsc: "SBIN0001234", upiId: "sharmatraders@sbi",
    terms: "1. Goods once sold will not be taken back.\n2. Interest @18% p.a. after due date.\n3. Subject to Asansol jurisdiction.",
    preferences: { allowZeroStockBilling: true, lowStockWhatsapp: true, sendInvoiceWhatsapp: true, dailySummary: true, autoBackup: true, showMrp: false, openingBalances: { Cash: 25000, SBI: 250000, HDFC: 90000 } } as any,
    createdAt: new Date("2025-11-17T06:00:00Z"),
  }).returning();
  const b = biz.id;
  await db.insert(S.memberships).values({ userId: owner.id, businessId: b, role: "OWNER" });
  for (const [name, phone, role, status] of [["Amit Verma", "9830022110", "BILLING", "ACTIVE"], ["Pooja Das", "9830033221", "ACCOUNTANT", "ACTIVE"], ["Sunil Kumar", "9830044332", "STORE", "INVITED"]] as const) {
    const [u] = await db.insert(S.users).values({ name, phone }).returning();
    await db.insert(S.memberships).values({ userId: u.id, businessId: b, role, status });
  }
  // catalogue
  const cats = new Map<string, string>();
  for (const c of [...new Set(PRODUCTS.map((p) => p[3]))]) cats.set(c, (await db.insert(S.categories).values({ businessId: b, name: c }).returning())[0].id);
  const prods: (typeof S.products.$inferSelect)[] = [];
  for (const [name, barcode, hsn, cat, unit, pr, sr, mrp, gst, min] of PRODUCTS)
    prods.push((await db.insert(S.products).values({ businessId: b, name, barcode, hsn, categoryId: cats.get(cat), unit, purchaseRate: pr, saleRate: sr, mrp, gstRate: gst, minStock: min, createdAt: new Date("2026-04-01T03:00:00Z") }).returning())[0]);
  const custs: (typeof S.parties.$inferSelect)[] = [];
  for (const [name, phone, gstin, address, city, limit, shipTo] of CUSTOMERS)
    custs.push((await db.insert(S.parties).values({ businessId: b, type: "CUSTOMER", name, phone, gstin, address, city, stateCode: "19", creditLimit: limit, shipToAddress: shipTo, openingBalance: 0, balance: 0 }).returning())[0]);
  await db.insert(S.parties).values({ businessId: b, type: "CUSTOMER", name: "Walk-in customers" });
  const sups = new Map<string, string>();
  for (const [name, phone, gstin] of SUPPLIERS)
    sups.set(name, (await db.insert(S.parties).values({ businessId: b, type: "SUPPLIER", name, phone, gstin, stateCode: gstin.slice(0, 2), address: "Kolkata" }).returning())[0].id);

  // opening stock 1 Apr
  await db.transaction(async (tx) => {
    for (const p of prods) await moveStock(tx, { businessId: b, productId: p.id, qty: p.minStock * 4, reason: "OPENING", date: new Date("2026-04-01T03:30:00Z") });
  });

  // ── simulate the FY day by day ──
  const start = new Date("2026-04-01T04:00:00Z");
  const today = istStartOfDay();
  let day = 0;
  for (let d = start; d < addDays(today, 1); d = addDays(d, 1), day++) {
    const isToday = d >= today;
    const growth = 1 + day / 400; // business grows through the year
    await db.transaction(async (tx) => {
      // Weekly restock (Mon & Thu)
      const dow = d.getUTCDay();
      if ((dow === 1 || dow === 4) && !isToday) {
        const cur = await tx.select().from(S.products).where(eq(S.products.businessId, b));
        const bySup = new Map<string, typeof cur>();
        cur.filter((p) => p.stock < p.minStock * 4).forEach((p) => { const s = supplierFor(p.name); bySup.set(s, [...(bySup.get(s) || []), p]); });
        for (const [sup, items] of bySup) {
          const paidNow = rnd() < 0.55;
          await createPurchase(tx, b, {
            supplierId: sups.get(sup)!, supplierBillNo: `${sup.split(" ")[0].toUpperCase()}/${between(1000, 9999)}`, date: new Date(d.getTime() + 3600000), creditDays: 15,
            items: items.map((p) => ({ productId: p.id, qty: Math.ceil((p.minStock * 9 - p.stock) / 6) * 6, rate: p.purchaseRate })),
            payment: paidNow ? { mode: "BANK", amount: 1e9, account: pick(["SBI", "HDFC"]) } : null,
          });
        }
      }
      // Sales
      const bills = isToday ? 6 : Math.round(between(2, 4) * growth);
      for (let i = 0; i < bills; i++) {
        const walkIn = rnd() < 0.3;
        const party = walkIn ? null : pick(custs);
        const items = Array.from({ length: between(walkIn ? 2 : 3, walkIn ? 4 : 6) }, () => pick(prods));
        const uniq = [...new Map(items.map((p) => [p.id, p])).values()];
        const at = new Date(d.getTime() + (1 + i * 1.3) * 3600000);
        const nonGst = walkIn && rnd() < 0.6;
        const mode = walkIn ? pick(["CASH", "CASH", "UPI"] as const) : pick(["UPI", "CASH", "BANK", "CREDIT", "CREDIT"] as const);
        const partial = !walkIn && mode !== "CREDIT" && rnd() < 0.35;
        const inv = await createInvoice(tx, b, {
          kind: "INVOICE", billType: nonGst ? "NON_GST" : "GST", partyId: party?.id, customerName: walkIn ? "Walk-in customer" : undefined,
          customerPhone: walkIn ? `98${between(10000000, 99999999)}` : undefined, date: at,
          items: uniq.map((p) => ({ productId: p.id, qty: walkIn ? between(1, 4) : between(6, 40), discountPct: !walkIn && rnd() < 0.2 ? pick([2, 5]) : 0 })),
          payment: mode === "CREDIT" ? { mode: "CREDIT", amount: 0 } : { mode, amount: partial ? 0 : 1e9, account: mode === "CASH" ? undefined : "SBI" },
          transport: !walkIn && rnd() < 0.3 ? "WB 39 C 4410" : null,
        });
        if (partial) {
          const amt = Math.round((inv.total * between(40, 85)) / 100 / 100) * 100;
          if (amt > 0) await recordPayment(tx, b, { direction: "IN", partyId: party!.id, amount: amt, mode: mode as any, account: "SBI", date: at, allocations: [{ invoiceId: inv.id, amount: amt }] });
        }
      }
      // Customers clear old dues now and then
      if (!isToday && rnd() < 0.45) {
        const p = pick(custs);
        const [cur] = await tx.select().from(S.parties).where(eq(S.parties.id, p.id));
        if (cur.balance > 5000) await recordPayment(tx, b, { direction: "IN", partyId: p.id, amount: Math.round((cur.balance * between(50, 90)) / 100 / 100) * 100, mode: pick(["UPI", "CASH", "BANK"]), account: "SBI", date: new Date(d.getTime() + 8 * 3600000), allocations: "auto" });
      }
      // Pay suppliers weekly
      if (dow === 6 && !isToday) {
        for (const [, sid] of sups) {
          const [cur] = await tx.select().from(S.parties).where(eq(S.parties.id, sid));
          if (cur.balance < -10000 && rnd() < 0.7) await recordPayment(tx, b, { direction: "OUT", partyId: sid, amount: Math.round((-cur.balance * 0.8) / 1000) * 1000, ...(rnd() < 0.6 ? { mode: "CASH" as const } : { mode: "BANK" as const, account: pick(["SBI", "HDFC"]) }), date: new Date(d.getTime() + 9 * 3600000), allocations: "auto" });
        }
      }
      // Monthly expenses
      const dom = new Date(d.getTime() + 5.5 * 3600000).getUTCDate();
      const exp: [string, string, number, string][] = [];
      if (dom === 1) exp.push(["Shop rent", "Rent", 25000, "BANK"]);
      if (dom === 5) exp.push(["Staff salary — Ramesh", "Salary", 14000, "CASH"], ["Staff salary — Amit", "Salary", 12000, "BANK"]);
      if (dom === 10) exp.push(["Electricity bill", "Electricity", between(4200, 5600), "UPI"]);
      if (dom % 7 === 3) exp.push(["Transport / tempo", "Transport", between(800, 2400), "CASH"]);
      if (dom === 15) exp.push(["Stationery & bill rolls", "Office", between(600, 1500), "CASH"]);
      for (const [desc, cat, amt, mode] of exp) await tx.insert(S.expenses).values({ businessId: b, description: desc, category: cat, amount: amt, mode: mode as any, account: mode === "CASH" ? "Cash" : "SBI", date: new Date(d.getTime() + 2 * 3600000) });
    });
  }
  // a few stock events like the design
  await db.transaction(async (tx) => {
    const by = (n: string) => prods.find((p) => p.name.startsWith(n))!;
    await moveStock(tx, { businessId: b, productId: by("Dettol").id, qty: -6, reason: "DAMAGE", note: "Damaged / expired", date: addDays(today, -1) });
    await moveStock(tx, { businessId: b, productId: by("Colgate").id, qty: 4, reason: "RETURN", note: "Return from customer", date: addDays(today, -1) });
    await moveStock(tx, { businessId: b, productId: by("Vim").id, qty: -24, reason: "TRANSFER", note: "Transfer to Shop 2", date: addDays(today, -2) });
    // quotation
    await createInvoice(tx, b, { kind: "QUOTATION", partyId: custs[1].id, items: [{ productId: by("Aashirvaad Atta 10kg").id, qty: 100 }, { productId: by("Fortune Sunflower").id, qty: 120 }] });
  });
  // Push a few products to low / out of stock like the design
  for (const [nm, target] of [["Fortune Sunflower", 6], ["Tata Salt", 12], ["Surf Excel", 4], ["Parle-G", 9], ["Dettol", 0], ["Lizol", 0]] as const) {
    const p = prods.find((x) => x.name.startsWith(nm))!;
    const [cur] = await db.select().from(S.products).where(eq(S.products.id, p.id));
    if (cur.stock !== target) await db.transaction((tx) => moveStock(tx, { businessId: b, productId: p.id, qty: target - cur.stock, reason: "ADJUSTMENT", note: "Physical stock count", date: addDays(today, -1) }));
  }
  await fixNegativeStock(b);
  return biz;
}

const CITIES = [["Asansol", "19"], ["Durgapur", "19"], ["Dhanbad", "20"], ["Bokaro", "20"], ["Ranchi", "20"], ["Kolkata", "19"], ["Siliguri", "19"], ["Jamshedpur", "20"]] as const;
const SHOP_WORDS = ["Agencies", "Traders", "Stores", "Medical", "Electronics", "Hardware", "Garments", "Enterprises", "Mart", "Distributors"];
const NAMES = ["Agarwal", "Singh", "Mondal", "Ghosh", "Jain", "Mahato", "Prasad", "Das", "Kumar", "Saha", "Banerjee", "Yadav", "Mishra", "Sinha", "Roy", "Paul"];

async function seedSaas(sharma: typeof S.businesses.$inferSelect, withLogins = true) {
  const plans = await db.select().from(S.plans);
  const plan = (c: string) => plans.find((p) => p.code === c)!;
  const [amit] = await db.insert(S.sellers).values({ name: "Amit", type: "STAFF", city: "Asansol", phone: "9830055001", commissionPct: 10 }).returning();
  const [priya] = await db.insert(S.sellers).values({ name: "Priya", type: "STAFF", city: "Kolkata", phone: "9830055002", commissionPct: 10 }).returning();
  const [rajesh] = await db.insert(S.sellers).values({ name: "Rajesh", type: "PARTNER", city: "Dhanbad", phone: "9431055003", commissionPct: 20 }).returning();
  if (withLogins) await db.insert(S.adminUsers).values([
    { name: "Amit", email: "amit@jippronex.com", passwordHash: await bcrypt.hash("Amit@123", 10), role: "SALES", sellerId: amit.id },
    { name: "Rajesh Traders", email: "rajesh@partner.jippronex.com", passwordHash: await bcrypt.hash("Rajesh@123", 10), role: "PARTNER", sellerId: rajesh.id },
  ]);
  const [welcome] = await db.insert(S.coupons).values({ code: "WELCOME20", description: "20% off first year", type: "PERCENT", value: 20, maxUses: 100, used: 0 }).returning();
  await db.insert(S.coupons).values({ code: "PARTNER10", description: "10% off · partners only", type: "PERCENT", value: 10, partnersOnly: true });
  await db.insert(S.gatewayConfigs).values([
    { provider: "razorpay", mode: "test", isPrimary: true, connected: false, settlement: "HDFC ••••8812" },
    { provider: "cashfree", mode: "test", connected: false }, { provider: "phonepe", mode: "test", connected: false },
  ]);
  await db.insert(S.appSettings).values({ key: "company", value: { name: "Jippronex Technologies", gstin: "19AAKCJ1234A1Z9", address: "Asansol, West Bengal", email: "billing@jippronex.com" } });

  const mkBiz = async (o: { name: string; owner: string; phone: string; city: string; state: string; gstin?: string; createdAt: Date }) => {
    const [u] = await db.insert(S.users).values({ name: o.owner, phone: o.phone, lastLoginAt: addDays(new Date(), -between(0, 6)), lastLoginVia: pick(["android", "web"]) }).onConflictDoNothing().returning();
    const user = u || (await db.query.users.findFirst({ where: eq(S.users.phone, o.phone) }))!;
    const n = (await db.execute(sql`insert into counters (business_id, key, value) values ('__jippronex__','CUSTOMER',1) on conflict (business_id,key) do update set value = counters.value + 1 returning value`)).rows[0] as any;
    const [b] = await db.insert(S.businesses).values({ code: `JX-C-${String(n.value).padStart(5, "0")}`, name: o.name, ownerName: o.owner, phone: o.phone, city: o.city, stateCode: o.state, gstin: o.gstin, createdAt: o.createdAt }).returning();
    await db.insert(S.memberships).values({ userId: user.id, businessId: b.id, role: "OWNER" });
    return b;
  };
  /** A paid sale at a given time; start date = paidAt */
  const sell = async (b: { id: string }, o: { plan: string; cycle: "YEARLY" | "MONTHLY"; price?: number; seller?: typeof amit | null; at: Date; purpose?: "NEW_SALE" | "RENEWAL";
    method?: string; cash?: boolean; coupon?: string; fail?: boolean; autoRenew?: boolean }) => {
    const p = plan(o.plan);
    const list = listPriceFor(p, o.cycle);
    await db.transaction(async (tx) => {
      const out = await createSubscriptionOrder(tx, { businessId: b.id, planId: p.id, cycle: o.cycle, price: o.price ?? list, listPrice: list, purpose: o.purpose || "NEW_SALE",
        sellerId: o.seller?.id, commissionPct: o.seller?.commissionPct, couponId: o.coupon, method: o.cash ? "CASH" : "LINK", collectedBy: o.cash ? o.seller?.name : null, autoRenew: o.autoRenew });
      if (o.fail) { await markPaymentFailed(tx, out.payment.id, "Card declined by bank", `pay_${Math.random().toString(36).slice(2, 12)}`); }
      else if (!o.cash) await activatePayment(tx, out.payment.id, { gatewayPaymentId: `pay_${Math.random().toString(36).slice(2, 12).toUpperCase()}`, method: o.method || pick(["UPI", "UPI", "Card", "UPI link"]) });
      // back-date
      await tx.update(S.subscriptionPayments).set({ createdAt: o.at, ...(o.fail ? {} : { paidAt: o.at }) }).where(eq(S.subscriptionPayments.id, out.payment.id));
      await tx.update(S.subscriptions).set({ createdAt: o.at, ...(o.fail ? {} : { startsAt: o.at, endsAt: endFor(o.at, o.cycle) }) }).where(eq(S.subscriptions.id, out.subscription.id));
    });
  };
  const now = new Date();
  const ago = (days: number, h = 0) => new Date(now.getTime() - days * 86400000 - h * 3600000);

  // Sharma Traders: trial → sale last year → renewal today at custom price
  await db.insert(S.subscriptions).values({ businessId: sharma.id, planId: plan("BILLING_INV").id, cycle: "TRIAL", status: "CANCELLED", listPrice: 0, price: 0, startsAt: new Date("2025-11-17T06:00:00Z"), endsAt: new Date("2025-11-24T06:00:00Z"), createdAt: new Date("2025-11-17T06:00:00Z") });
  await db.insert(S.subscriptionPayments).values({ businessId: sharma.id, purpose: "NEW_SALE", description: "Trial started", amount: 0, baseAmount: 0, gstAmount: 0, status: "CAPTURED", method: "—", createdAt: new Date("2025-11-17T06:00:00Z"), paidAt: new Date("2025-11-17T06:00:00Z") });
  await sell(sharma, { plan: "BILLING_INV", cycle: "YEARLY", price: 7499, at: ago(365), method: "Card" });
  await sell(sharma, { plan: "BILLING_INV", cycle: "YEARLY", price: 6999, at: ago(0, 0.05), purpose: "RENEWAL", method: "UPI", autoRenew: true });
  await db.insert(S.customPrices).values({ businessId: sharma.id, planId: plan("BILLING_INV").id, cycle: "YEARLY", price: 6999, extraUserPrice: 999, reason: "Early customer" });

  const named = [
    { name: "Bansal Electricals", owner: "Vikas Bansal", phone: "9434022118", city: "Durgapur", state: "19", gstin: "19AAHFB2210L1Z8", plan: "COMPLETE", price: 9999, seller: amit, at: ago(0, 0.6), method: "Card" },
    { name: "Maa Tara Medical", owner: "S. Mahato", phone: "7004081122", city: "Bokaro", state: "20", plan: "SMART", seller: rajesh, at: ago(0, 1), cash: true },
    { name: "Patel Agencies", owner: "Hitesh Patel", phone: "9835044010", city: "Ranchi", state: "20", plan: "BILLING_INV", price: 6500, seller: amit, at: ago(0, 3.5), method: "UPI link" },
    { name: "Gupta Kirana Store", owner: "Anil Gupta", phone: "9434055121", city: "Durgapur", state: "19", plan: "SMART", seller: null, at: ago(363), method: "UPI" },
    { name: "New Delhi Hardware", owner: "Mohan Lal", phone: "9811077210", city: "Dhanbad", state: "20", plan: "COMPLETE", seller: rajesh, at: ago(359), autoRenew: true },
    { name: "Shree Balaji Garments", owner: "Pankaj Agarwal", phone: "9830166420", city: "Kolkata", state: "19", plan: "BILLING_INV", seller: null, at: ago(356) },
  ];
  for (const c of named) {
    const b = await mkBiz({ ...c, createdAt: c.at });
    if (c.price && c.price < listPriceFor(plan(c.plan), "YEARLY")) await db.insert(S.customPrices).values({ businessId: b.id, planId: plan(c.plan).id, cycle: "YEARLY", price: c.price, reason: "Negotiated at sale" });
    await sell(b, { plan: c.plan, cycle: "YEARLY", price: c.price, seller: c.seller, at: c.at, method: c.method, cash: (c as any).cash, autoRenew: (c as any).autoRenew });
  }
  const kumar = await mkBiz({ name: "Kumar Distributors", owner: "Suresh Kumar", phone: "9332031271", city: "Asansol", state: "19", createdAt: ago(120) });
  await db.insert(S.customPrices).values({ businessId: kumar.id, planId: plan("BILLING_INV").id, cycle: "MONTHLY", price: 700, reason: "Monthly discount" });
  for (let m = 4; m >= 0; m--) await sell(kumar, { plan: "BILLING_INV", cycle: "MONTHLY", price: 700, seller: priya, at: ago(m * 30 + 17), method: m < 4 ? "Autopay" : "UPI", purpose: m < 4 ? "RENEWAL" : "NEW_SALE", autoRenew: true });
  const roy = await mkBiz({ name: "Roy Mobile Point", owner: "Subhash Roy", phone: "9007012099", city: "Siliguri", state: "19", createdAt: ago(5) });
  await db.insert(S.subscriptions).values({ businessId: roy.id, planId: plan("SMART").id, cycle: "TRIAL", status: "TRIAL", listPrice: 0, price: 0, startsAt: ago(5), endsAt: addDays(ago(5), 7) });
  const singh = await mkBiz({ name: "Singh Auto Parts", owner: "Gurpreet Singh", phone: "9814033021", city: "Jamshedpur", state: "20", createdAt: ago(318) });
  await sell(singh, { plan: "COMPLETE", cycle: "YEARLY", price: 10800, seller: rajesh, at: ago(318) });
  await db.insert(S.customPrices).values({ businessId: singh.id, planId: plan("COMPLETE").id, cycle: "YEARLY", price: 10800, reason: "Partner deal" });
  await sell(singh, { plan: "COMPLETE", cycle: "YEARLY", price: 10800, seller: rajesh, at: ago(0, 6), purpose: "RENEWAL", fail: true });
  for (const [name, owner, phone, city, st, p, cyc, days] of [
    ["Das Medical Hall", "Bikash Das", "9733012001", "Asansol", "19", "SMART", "YEARLY", 377], ["Raj Electronics", "Raj Saha", "9733012002", "Durgapur", "19", "BILLING_INV", "YEARLY", 384],
    ["Sen Bakery", "Amit Sen", "9733012003", "Kolkata", "19", "SMART", "MONTHLY", 53],
  ] as const) {
    const b = await mkBiz({ name, owner, phone, city, state: st, createdAt: ago(days) });
    await sell(b, { plan: p, cycle: cyc, at: ago(days) });
  }
  // Bulk customers for realistic charts
  for (let i = 0; i < 60; i++) {
    const [city, st] = pick([...CITIES]);
    const days = between(3, 360);
    const b = await mkBiz({ name: `${pick(NAMES)} ${pick(SHOP_WORDS)}`, owner: `${pick(["Ravi", "Sunil", "Manoj", "Deepak", "Arjun", "Pooja", "Neha", "Sanjay", "Vivek", "Kavita"])} ${pick(NAMES)}`,
      phone: `9${between(100000000, 999999999)}`, city, state: st, createdAt: ago(days) });
    const p = pick(["SMART", "BILLING_INV", "BILLING_INV", "COMPLETE"]);
    const r = rnd();
    const seller = r < 0.25 ? amit : r < 0.4 ? priya : r < 0.6 ? rajesh : null;
    const list = listPriceFor(plan(p), "YEARLY");
    const priceType = rnd();
    const coupon = priceType < 0.12 ? welcome : null;
    const price = coupon ? Math.round(list * 0.8) : priceType < 0.3 ? Math.round(list * (0.82 + rnd() * 0.12)) : list;
    if (!coupon && price < list) await db.insert(S.customPrices).values({ businessId: b.id, planId: plan(p).id, cycle: "YEARLY", price, reason: "Negotiated" });
    await sell(b, { plan: p, cycle: "YEARLY", price, seller, at: ago(days), coupon: coupon?.id, cash: !!seller && seller.type === "PARTNER" && rnd() < 0.2 });
  }
  for (let i = 0; i < 6; i++) {
    const [city, st] = pick([...CITIES]);
    const b = await mkBiz({ name: `${pick(NAMES)} ${pick(SHOP_WORDS)}`, owner: `${pick(["Ravi", "Manoj", "Neha", "Kavita"])} ${pick(NAMES)}`, phone: `8${between(100000000, 999999999)}`, city, state: st, createdAt: ago(between(0, 6)) });
    await db.insert(S.subscriptions).values({ businessId: b.id, planId: plan(pick(["SMART", "BILLING_INV"])).id, cycle: "TRIAL", status: "TRIAL", listPrice: 0, price: 0, startsAt: b.createdAt, endsAt: addDays(b.createdAt, 7) });
  }
  // cash already deposited for older partner sales
  await db.execute(sql`update subscription_payments set status='CAPTURED' where status='TO_DEPOSIT' and paid_at < now() - interval '3 days'`);
  await db.insert(S.commissionPayouts).values([{ sellerId: rajesh.id, amount: 20000, note: "Q1 payout" }, { sellerId: amit.id, amount: 15000, note: "Sep payout" }]);
}

/** Used by the API on boot when SEED_DEMO=true and the database has no businesses yet. */
export async function seedDemo(opts: { withLogins?: boolean } = {}) {
  const t = Date.now();
  const sharma = await seedShop();
  await seedSaas(sharma, opts.withLogins ?? false);
  console.log(`Demo data loaded in ${((Date.now() - t) / 1000).toFixed(1)}s`);
}

const isCli = /seed\.(ts|js)$/.test(process.argv[1] || "");
if (isCli) (async () => {
  await runMigrations();
  if (process.argv.includes("--demo-shop")) {
    // Production demo account: only the Sharma Traders shop, no fake SaaS customers/revenue.
    await bootstrap();
    const exists = (await db.execute(sql`select 1 from businesses where code = 'JX-DEMO' or phone = '9830012345' limit 1`)).rows.length;
    if (exists) {
      const demo = (await db.execute(sql`select id from businesses where code = 'JX-DEMO' limit 1`)).rows[0] as any;
      const fixed = demo ? await fixNegativeStock(demo.id) : 0;
      console.log(`Demo shop already present${fixed ? ` · fixed ${fixed} negative stock items` : ""}`);
      await pool.end(); return;
    }
    const t = Date.now();
    const shop = await seedShop("JX-DEMO");
    const plan = await db.query.plans.findFirst({ where: eq(S.plans.code, "COMPLETE") });
    const start = addDays(new Date(), -30);
    await db.insert(S.subscriptions).values({ businessId: shop.id, planId: plan!.id, cycle: "YEARLY", status: "ACTIVE", listPrice: plan!.yearlyPrice, price: 0, usersAllowed: 5, startsAt: start, endsAt: addDays(start, 365) });
    console.log(`Demo shop created in ${((Date.now() - t) / 1000).toFixed(1)}s`);
    await pool.end(); return;
  }
  const doReset = process.argv.includes("--reset");
  const [c] = await db.select({ c: sql<number>`count(*)::int` }).from(S.businesses);
  if (c.c && !doReset) {
    const st = (await db.execute(sql`select (select count(*) from businesses)::int b, (select count(*) from invoices)::int i, (select max(date) from invoices) last, (select count(*) from subscriptions)::int s, (select count(*) from admin_users)::int a`)).rows[0];
    console.log("Database already has data. Use --reset to wipe and reseed.", JSON.stringify(st));
    await pool.end(); return;
  }
  if (doReset) await reset();
  await bootstrap();
  const t = Date.now();
  const sharma = await seedShop();
  console.log(`Shop seeded in ${((Date.now() - t) / 1000).toFixed(1)}s`);
  await seedSaas(sharma, !process.argv.includes("--no-logins"));
  console.log("Seed complete. CRM login: 9830012345 · Admin: admin@jippronex.com / Admin@123");
  await pool.end();
})().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
