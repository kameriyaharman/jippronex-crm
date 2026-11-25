import { and, asc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { db, schema, type DbOrTx, type Tx } from "../db/index.js";
import { calcDoc } from "../lib/gst.js";
import { nextDocNumber } from "../lib/numbering.js";
import { bad, notFound, r2, r3, addDays } from "../lib/util.js";

const S = schema;
type StockReason = (typeof S.stockReasonEnum.enumValues)[number];
type PayMode = (typeof S.payModeEnum.enumValues)[number];
type DocKind = (typeof S.docKindEnum.enumValues)[number];

// ─────────────── Stock ───────────────
export async function moveStock(tx: DbOrTx, o: {
  businessId: string; productId: string; qty: number; reason: StockReason;
  refType?: string; refId?: string; refNo?: string; note?: string; userId?: string; date?: Date;
}) {
  if (!o.qty) return null;
  const [p] = await tx.update(S.products)
    .set({ stock: sql`${S.products.stock} + ${o.qty}`, updatedAt: new Date() })
    .where(and(eq(S.products.id, o.productId), eq(S.products.businessId, o.businessId)))
    .returning({ stock: S.products.stock });
  if (!p) throw notFound("Product not found");
  await tx.insert(S.stockMovements).values({
    businessId: o.businessId, productId: o.productId, reason: o.reason, qty: r3(o.qty),
    balanceAfter: p.stock, refType: o.refType, refId: o.refId, refNo: o.refNo, note: o.note,
    userId: o.userId, createdAt: o.date || new Date(),
  });
  return p.stock;
}

// ─────────────── Party balance (+ = they owe us) ───────────────
export async function adjustParty(tx: DbOrTx, partyId: string | null | undefined, delta: number) {
  if (!partyId || !delta) return;
  await tx.update(S.parties).set({ balance: sql`${S.parties.balance} + ${r2(delta)}` }).where(eq(S.parties.id, partyId));
}

const statusOf = (total: number, paid: number) => (paid <= 0.004 ? "UNPAID" : paid >= total - 0.004 ? "PAID" : "PARTIAL") as "PAID" | "PARTIAL" | "UNPAID";

// ─────────────── Invoices / quotations / credit notes ───────────────
export type ItemIn = {
  productId?: string | null; name?: string; hsn?: string | null; unit?: string;
  qty: number; rate?: number; discountPct?: number; gstRate?: number;
};
export type InvoiceIn = {
  kind?: DocKind; billType?: "GST" | "NON_GST";
  partyId?: string | null; customerName?: string | null; customerPhone?: string | null;
  date?: Date; dueDate?: Date | null; validTill?: Date | null; placeOfSupply?: string;
  items: ItemIn[]; extraDiscount?: number;
  payment?: { mode: PayMode; amount: number; reference?: string; account?: string } | null;
  transport?: string | null; ewayBill?: string | null; notes?: string | null; shipTo?: string | null; printFormat?: string;
};

export async function createInvoice(tx: Tx, businessId: string, input: InvoiceIn, userId?: string) {
  const biz = await tx.query.businesses.findFirst({ where: eq(S.businesses.id, businessId) });
  if (!biz) throw notFound("Business not found");
  const kind = input.kind || "INVOICE";
  const billType = input.billType || "GST";
  if (!input.items?.length) throw bad("Add at least one item");

  const party = input.partyId
    ? await tx.query.parties.findFirst({ where: and(eq(S.parties.id, input.partyId), eq(S.parties.businessId, businessId)) })
    : null;
  if (input.partyId && !party) throw notFound("Customer not found");

  const placeOfSupply = input.placeOfSupply || party?.stateCode || biz.stateCode;
  const interState = billType === "GST" && placeOfSupply !== biz.stateCode;

  // Resolve products
  const ids = input.items.map((i) => i.productId).filter(Boolean) as string[];
  const prods = ids.length
    ? await tx.select().from(S.products).where(and(eq(S.products.businessId, businessId), inArray(S.products.id, ids)))
    : [];
  const pmap = new Map(prods.map((p) => [p.id, p]));
  const lines = input.items.map((it) => {
    const p = it.productId ? pmap.get(it.productId) : undefined;
    if (it.productId && !p) throw bad("A product in this bill no longer exists");
    const name = it.name || p?.name;
    if (!name) throw bad("Item name is required");
    if (!(it.qty > 0)) throw bad(`Quantity must be more than 0 for ${name}`);
    return {
      productId: p?.id ?? null, name, hsn: it.hsn ?? p?.hsn ?? null, unit: it.unit || p?.unit || "pcs",
      qty: r3(it.qty), rate: r2(it.rate ?? p?.saleRate ?? 0), discountPct: it.discountPct || 0,
      gstRate: billType === "GST" ? (it.gstRate ?? p?.gstRate ?? 0) : 0, costRate: p?.purchaseRate ?? 0,
    };
  });

  const affectsStock = kind === "INVOICE" || kind === "CREDIT_NOTE";
  if (kind === "INVOICE" && biz.preferences?.allowZeroStockBilling === false) {
    const need = new Map<string, number>();
    lines.forEach((l) => l.productId && need.set(l.productId, (need.get(l.productId) || 0) + l.qty));
    for (const [pid, q] of need) {
      const p = pmap.get(pid)!;
      if (p.stock < q) throw bad(`Only ${p.stock} ${p.unit} of ${p.name} in stock`);
    }
  }

  const c = calcDoc(lines, interState, billType === "GST", input.extraDiscount || 0);
  const date = input.date || new Date();
  const numberType = kind === "INVOICE" ? (billType === "NON_GST" ? "NON_GST" : "INVOICE") : kind;
  const number = await nextDocNumber(tx, businessId, numberType, { prefix: biz.invoicePrefix, date });

  const isSale = kind === "INVOICE";
  const pay = isSale && input.payment && input.payment.mode !== "CREDIT" ? input.payment : null;
  const received = pay ? Math.min(r2(pay.amount || 0), c.total) : 0;
  const balance = isSale ? r2(c.total - received) : 0;
  if (isSale && !party && balance > 0.004) throw bad("Credit sale needs a customer — select the party or collect full amount");
  const costTotal = r2(lines.reduce((s, l) => s + l.qty * l.costRate, 0));

  const [inv] = await tx.insert(S.invoices).values({
    businessId, kind, billType, number, date,
    dueDate: isSale && balance > 0 ? input.dueDate || addDays(date, 7) : input.dueDate || null,
    validTill: kind === "QUOTATION" ? input.validTill || addDays(date, 14) : null,
    partyId: party?.id ?? null,
    customerName: party ? party.name : input.customerName || "Walk-in customer",
    customerPhone: party?.phone ?? input.customerPhone ?? null,
    placeOfSupply, interState,
    subtotal: c.subtotal, discount: c.discount, taxable: c.taxable, cgst: c.cgst, sgst: c.sgst, igst: c.igst,
    // received/balance/status are updated by recordPayment() below
    roundOff: c.roundOff, total: c.total, received: 0, balance: isSale ? c.total : 0, costTotal,
    status: isSale ? "UNPAID" : kind === "CREDIT_NOTE" ? "PAID" : "UNPAID",
    paymentMode: isSale ? (pay?.mode ?? "CREDIT") : null,
    transport: input.transport, ewayBill: input.ewayBill, notes: input.notes, shipTo: input.shipTo,
    printFormat: input.printFormat || "A4", createdById: userId,
  }).returning();

  await tx.insert(S.invoiceItems).values(lines.map((l, i) => ({
    invoiceId: inv.id, sort: i, productId: l.productId, name: l.name, hsn: l.hsn, unit: l.unit, qty: l.qty,
    rate: l.rate, discountPct: l.discountPct, gstRate: l.gstRate, costRate: l.costRate,
    taxable: c.lines[i].taxable, cgst: c.lines[i].cgst, sgst: c.lines[i].sgst, igst: c.lines[i].igst, amount: c.lines[i].amount,
  })));

  if (affectsStock) {
    for (const l of lines) {
      if (!l.productId) continue;
      await moveStock(tx, {
        businessId, productId: l.productId, qty: kind === "INVOICE" ? -l.qty : l.qty,
        reason: kind === "INVOICE" ? "SALE" : "RETURN", refType: "invoice", refId: inv.id, refNo: inv.number,
        note: kind === "CREDIT_NOTE" ? `Return from ${inv.customerName}` : undefined, userId, date,
      });
    }
  }

  if (isSale) {
    await adjustParty(tx, party?.id, c.total);
    if (received > 0) {
      await recordPayment(tx, businessId, {
        direction: "IN", partyId: party?.id ?? null, amount: received, mode: pay!.mode, reference: pay!.reference,
        account: pay!.account, date, note: `Against ${number}`, allocations: [{ invoiceId: inv.id, amount: received }],
      });
    }
  } else if (kind === "CREDIT_NOTE") {
    await adjustParty(tx, party?.id, -c.total);
  }
  return inv;
}

export async function cancelInvoice(tx: Tx, businessId: string, id: string, userId?: string) {
  const inv = await tx.query.invoices.findFirst({ where: and(eq(S.invoices.id, id), eq(S.invoices.businessId, businessId)), with: undefined });
  if (!inv) throw notFound("Invoice not found");
  if (inv.cancelled) throw bad("Already cancelled");
  const items = await tx.select().from(S.invoiceItems).where(eq(S.invoiceItems.invoiceId, id));
  if (inv.kind === "INVOICE" || inv.kind === "CREDIT_NOTE") {
    for (const it of items) {
      if (!it.productId) continue;
      await moveStock(tx, {
        businessId, productId: it.productId, qty: inv.kind === "INVOICE" ? it.qty : -it.qty,
        reason: "SALE_CANCEL", refType: "invoice", refId: inv.id, refNo: inv.number, note: "Bill cancelled", userId,
      });
    }
    // Payments stay with the party as advance; only the bill amount is reversed.
    await adjustParty(tx, inv.partyId, inv.kind === "INVOICE" ? -inv.total : inv.total);
    await tx.delete(S.paymentAllocations).where(eq(S.paymentAllocations.invoiceId, id));
  }
  await tx.update(S.invoices).set({ cancelled: true, balance: 0 }).where(eq(S.invoices.id, id));
}

// ─────────────── Purchases ───────────────
export type PurchaseIn = {
  supplierId: string; supplierBillNo?: string | null; date?: Date; creditDays?: number; dueDate?: Date | null;
  items: { productId: string; qty: number; rate: number; gstRate?: number }[];
  payment?: { mode: PayMode; amount: number; reference?: string; account?: string } | null;
  notes?: string | null;
};

export async function createPurchase(tx: Tx, businessId: string, input: PurchaseIn, userId?: string) {
  const biz = await tx.query.businesses.findFirst({ where: eq(S.businesses.id, businessId) });
  const sup = await tx.query.parties.findFirst({ where: and(eq(S.parties.id, input.supplierId), eq(S.parties.businessId, businessId)) });
  if (!biz || !sup) throw notFound("Supplier not found");
  if (!input.items?.length) throw bad("Add at least one item");
  const prods = await tx.select().from(S.products).where(and(eq(S.products.businessId, businessId), inArray(S.products.id, input.items.map((i) => i.productId))));
  const pmap = new Map(prods.map((p) => [p.id, p]));
  const interState = !!sup.stateCode && sup.stateCode !== biz.stateCode;
  const lines = input.items.map((it) => {
    const p = pmap.get(it.productId);
    if (!p) throw bad("Product not found");
    if (!(it.qty > 0)) throw bad(`Quantity required for ${p.name}`);
    return { p, qty: r3(it.qty), rate: r2(it.rate), gstRate: it.gstRate ?? p.gstRate };
  });
  const c = calcDoc(lines.map((l) => ({ qty: l.qty, rate: l.rate, gstRate: l.gstRate })), interState, true);
  const date = input.date || new Date();
  const number = await nextDocNumber(tx, businessId, "PURCHASE", { date });
  const paid = input.payment ? Math.min(r2(input.payment.amount), c.total) : 0;
  const balance = r2(c.total - paid);
  const [pur] = await tx.insert(S.purchases).values({
    businessId, number, supplierId: sup.id, supplierBillNo: input.supplierBillNo, date,
    dueDate: balance > 0 ? input.dueDate || addDays(date, input.creditDays ?? 15) : null,
    interState, taxable: c.taxable, cgst: c.cgst, sgst: c.sgst, igst: c.igst, roundOff: c.roundOff,
    total: c.total, paid, balance, status: statusOf(c.total, paid), notes: input.notes,
  }).returning();
  await tx.insert(S.purchaseItems).values(lines.map((l, i) => ({
    purchaseId: pur.id, productId: l.p.id, name: l.p.name, hsn: l.p.hsn, unit: l.p.unit, qty: l.qty, rate: l.rate,
    gstRate: l.gstRate, taxable: c.lines[i].taxable, tax: c.lines[i].tax, amount: c.lines[i].amount,
  })));
  for (const l of lines) {
    await moveStock(tx, { businessId, productId: l.p.id, qty: l.qty, reason: "PURCHASE", refType: "purchase", refId: pur.id, refNo: number, userId, date });
    await tx.update(S.products).set({ purchaseRate: l.rate }).where(eq(S.products.id, l.p.id));
  }
  await adjustParty(tx, sup.id, -c.total);
  if (paid > 0) {
    await recordPayment(tx, businessId, {
      direction: "OUT", partyId: sup.id, amount: paid, mode: input.payment!.mode, reference: input.payment!.reference,
      account: input.payment!.account, date, note: `Against ${number}`, allocations: [{ purchaseId: pur.id, amount: paid }],
    });
  }
  return pur;
}

// ─────────────── Payments (receipts & payouts) ───────────────
export type PaymentIn = {
  direction: "IN" | "OUT"; partyId?: string | null; amount: number; mode: PayMode;
  reference?: string; account?: string; note?: string; date?: Date;
  allocations?: { invoiceId?: string; purchaseId?: string; amount: number }[] | "auto";
};

export async function recordPayment(tx: Tx, businessId: string, input: PaymentIn) {
  const amount = r2(input.amount);
  if (!(amount > 0)) throw bad("Amount must be more than 0");
  if (input.partyId) {
    const p = await tx.query.parties.findFirst({ where: and(eq(S.parties.id, input.partyId), eq(S.parties.businessId, businessId)) });
    if (!p) throw notFound("Party not found");
  }
  const number = await nextDocNumber(tx, businessId, input.direction === "IN" ? "RECEIPT" : "PAYOUT", { date: input.date });
  const [pay] = await tx.insert(S.payments).values({
    businessId, number, direction: input.direction, partyId: input.partyId ?? null, amount, mode: input.mode,
    account: input.account || (input.mode === "CASH" ? "Cash" : null), reference: input.reference, note: input.note,
    date: input.date || new Date(),
  }).returning();

  let allocs = input.allocations;
  if ((allocs === "auto" || allocs === undefined) && input.partyId) {
    // FIFO against oldest open bills
    allocs = [];
    let left = amount;
    if (input.direction === "IN") {
      const open = await tx.select().from(S.invoices).where(and(eq(S.invoices.businessId, businessId), eq(S.invoices.partyId, input.partyId),
        eq(S.invoices.kind, "INVOICE"), eq(S.invoices.cancelled, false), gt(S.invoices.balance, 0))).orderBy(asc(S.invoices.date));
      for (const o of open) { if (left <= 0) break; const a = Math.min(left, o.balance); allocs.push({ invoiceId: o.id, amount: r2(a) }); left = r2(left - a); }
    } else {
      const open = await tx.select().from(S.purchases).where(and(eq(S.purchases.businessId, businessId), eq(S.purchases.supplierId, input.partyId),
        gt(S.purchases.balance, 0))).orderBy(asc(S.purchases.date));
      for (const o of open) { if (left <= 0) break; const a = Math.min(left, o.balance); allocs.push({ purchaseId: o.id, amount: r2(a) }); left = r2(left - a); }
    }
  }
  for (const a of (allocs as any[]) || []) {
    if (!(a.amount > 0)) continue;
    await tx.insert(S.paymentAllocations).values({ paymentId: pay.id, invoiceId: a.invoiceId ?? null, purchaseId: a.purchaseId ?? null, amount: r2(a.amount) });
    if (a.invoiceId) {
      const [inv] = await tx.update(S.invoices).set({
        received: sql`${S.invoices.received} + ${a.amount}`, balance: sql`greatest(${S.invoices.balance} - ${a.amount}, 0)`,
      }).where(and(eq(S.invoices.id, a.invoiceId), eq(S.invoices.businessId, businessId))).returning();
      if (inv) await tx.update(S.invoices).set({ status: statusOf(inv.total, inv.received) }).where(eq(S.invoices.id, inv.id));
    }
    if (a.purchaseId) {
      const [pur] = await tx.update(S.purchases).set({
        paid: sql`${S.purchases.paid} + ${a.amount}`, balance: sql`greatest(${S.purchases.balance} - ${a.amount}, 0)`,
      }).where(and(eq(S.purchases.id, a.purchaseId), eq(S.purchases.businessId, businessId))).returning();
      if (pur) await tx.update(S.purchases).set({ status: statusOf(pur.total, pur.paid) }).where(eq(S.purchases.id, pur.id));
    }
  }
  // Receipt reduces what customer owes; payout reduces what we owe supplier.
  await adjustParty(tx, input.partyId, input.direction === "IN" ? -amount : amount);
  return pay;
}

// ─────────────── Party ledger ───────────────
export async function partyLedger(businessId: string, partyId: string, from?: Date, to?: Date) {
  const party = await db.query.parties.findFirst({ where: and(eq(S.parties.id, partyId), eq(S.parties.businessId, businessId)) });
  if (!party) throw notFound("Party not found");
  const invs = await db.select().from(S.invoices).where(and(eq(S.invoices.businessId, businessId), eq(S.invoices.partyId, partyId),
    inArray(S.invoices.kind, ["INVOICE", "CREDIT_NOTE"]), eq(S.invoices.cancelled, false)));
  const purs = await db.select().from(S.purchases).where(and(eq(S.purchases.businessId, businessId), eq(S.purchases.supplierId, partyId)));
  const pays = await db.select().from(S.payments).where(and(eq(S.payments.businessId, businessId), eq(S.payments.partyId, partyId)));
  type Row = { date: Date; type: string; refId: string; particulars: string; debit: number; credit: number; balance?: number };
  const rows: Row[] = [
    ...invs.map((i) => ({ date: i.date, type: i.kind === "INVOICE" ? "invoice" : "credit_note", refId: i.id, particulars: i.number,
      debit: i.kind === "INVOICE" ? i.total : 0, credit: i.kind === "CREDIT_NOTE" ? i.total : 0 })),
    ...purs.map((p) => ({ date: p.date, type: "purchase", refId: p.id, particulars: `${p.number}${p.supplierBillNo ? " · " + p.supplierBillNo : ""}`, debit: 0, credit: p.total })),
    ...pays.map((p) => ({ date: p.date, type: p.direction === "IN" ? "receipt" : "payout", refId: p.id,
      particulars: `Payment · ${p.mode === "UPI" ? "UPI" : p.mode[0] + p.mode.slice(1).toLowerCase()}`,
      debit: p.direction === "OUT" ? p.amount : 0, credit: p.direction === "IN" ? p.amount : 0 })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
  let bal = party.openingBalance;
  let opening = bal;
  const out: Row[] = [];
  for (const r of rows) {
    bal = r2(bal + r.debit - r.credit);
    if (from && r.date < from) { opening = bal; continue; }
    if (to && r.date >= to) continue;
    out.push({ ...r, balance: bal });
  }
  const totals = {
    billed: r2(invs.filter((i) => i.kind === "INVOICE").reduce((s, i) => s + i.total, 0)),
    purchased: r2(purs.reduce((s, p) => s + p.total, 0)),
    received: r2(pays.filter((p) => p.direction === "IN").reduce((s, p) => s + p.amount, 0)),
    paid: r2(pays.filter((p) => p.direction === "OUT").reduce((s, p) => s + p.amount, 0)),
  };
  return { party, opening, rows: out, closing: party.balance, totals };
}

export { statusOf };
