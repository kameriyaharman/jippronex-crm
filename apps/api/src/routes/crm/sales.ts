import { Router } from "express";
import { and, asc, desc, eq, gte, ilike, lt, or, sql, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import ExcelJS from "exceljs";
import { db, schema as S } from "../../db/index.js";
import { parse, notFound, bad, amountInWords, monthRange, r2 } from "../../lib/util.js";
import { can, need } from "../../lib/auth.js";
import { createInvoice, cancelInvoice, createPurchase, recordPayment } from "../../services/core.js";
import { GST_STATES } from "../../lib/gst.js";
import { waLink } from "../../lib/notify.js";

export const salesRouter = Router();

const payMode = z.enum(["CASH", "UPI", "CARD", "BANK", "CHEQUE", "CREDIT"]);
const dateish = z.coerce.date();
const invoiceSchema = z.object({
  kind: z.enum(["INVOICE", "QUOTATION", "CREDIT_NOTE", "DELIVERY_CHALLAN", "PROFORMA"]).default("INVOICE"),
  billType: z.enum(["GST", "NON_GST"]).default("GST"),
  partyId: z.string().nullish(), customerName: z.string().nullish(), customerPhone: z.string().nullish(),
  date: dateish.optional(), dueDate: dateish.nullish(), validTill: dateish.nullish(), placeOfSupply: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().nullish(), name: z.string().optional(), hsn: z.string().nullish(), unit: z.string().optional(),
    qty: z.coerce.number().positive(), rate: z.coerce.number().min(0).optional(), discountPct: z.coerce.number().min(0).max(100).optional(),
    gstRate: z.coerce.number().min(0).max(40).optional(),
  })).min(1),
  extraDiscount: z.coerce.number().min(0).optional(),
  payment: z.object({ mode: payMode, amount: z.coerce.number().min(0), reference: z.string().optional(), account: z.string().optional() }).nullish(),
  transport: z.string().nullish(), ewayBill: z.string().nullish(), notes: z.string().nullish(), shipTo: z.string().nullish(),
  printFormat: z.enum(["A4", "A5", "THERMAL"]).optional(),
});

// ─────────── Invoices / quotations ───────────
salesRouter.get("/invoices", async (req, res) => {
  const { kind = "INVOICE", tab = "all", q, month, partyId, limit = "100", offset = "0" } = req.query as Record<string, string>;
  const b = req.businessId!;
  const base = [eq(S.invoices.businessId, b), eq(S.invoices.kind, kind as any), eq(S.invoices.cancelled, false)];
  if (month) { const r = monthRange(month); base.push(gte(S.invoices.date, r.from), lt(S.invoices.date, r.to)); }
  if (partyId) base.push(eq(S.invoices.partyId, partyId));
  if (q) base.push(or(ilike(S.invoices.number, `%${q}%`), ilike(S.invoices.customerName, `%${q}%`), ilike(S.invoices.customerPhone, `%${q}%`))!);
  const where = [...base];
  if (tab === "gst") where.push(eq(S.invoices.billType, "GST"));
  if (tab === "nongst") where.push(eq(S.invoices.billType, "NON_GST"));
  if (tab === "unpaid") where.push(eq(S.invoices.status, "UNPAID"));
  if (tab === "partial") where.push(eq(S.invoices.status, "PARTIAL"));
  const rows = await db.select().from(S.invoices).where(and(...where)).orderBy(desc(S.invoices.date), desc(S.invoices.number))
    .limit(Math.min(+limit, 500)).offset(+offset);
  const [counts] = await db.select({
    all: sql<number>`count(*)::int`,
    gst: sql<number>`count(*) filter (where ${S.invoices.billType}='GST')::int`,
    nongst: sql<number>`count(*) filter (where ${S.invoices.billType}='NON_GST')::int`,
    unpaid: sql<number>`count(*) filter (where ${S.invoices.status}='UNPAID')::int`,
    partial: sql<number>`count(*) filter (where ${S.invoices.status}='PARTIAL')::int`,
    total: sql<number>`coalesce(sum(${S.invoices.total}),0)::float`,
    gstCollected: sql<number>`coalesce(sum(${S.invoices.cgst}+${S.invoices.sgst}+${S.invoices.igst}),0)::float`,
    received: sql<number>`coalesce(sum(${S.invoices.received}),0)::float`,
    pending: sql<number>`coalesce(sum(${S.invoices.balance}),0)::float`,
  }).from(S.invoices).where(and(...base));
  res.json({ rows, counts });
});

salesRouter.post("/invoices", async (req, res) => {
  const d = parse(invoiceSchema, req.body);
  if (d.kind === "INVOICE" || d.kind === "CREDIT_NOTE") { if (!can(req, "invoice.create")) throw bad("You can't create bills"); }
  const inv = await db.transaction((tx) => createInvoice(tx, req.businessId!, d, req.user!.id));
  res.status(201).json(await invoiceDetail(req.businessId!, inv.id));
});

salesRouter.get("/invoices/:id", async (req, res) => {
  res.json(await invoiceDetail(req.businessId!, String(req.params.id)));
});

salesRouter.post("/invoices/:id/cancel", need("invoice.edit"), async (req, res) => {
  await db.transaction((tx) => cancelInvoice(tx, req.businessId!, String(req.params.id), req.user!.id));
  res.json({ ok: true });
});

/** Quotation / proforma → bill */
salesRouter.post("/invoices/:id/convert", need("invoice.create"), async (req, res) => {
  const src = await invoiceDetail(req.businessId!, String(req.params.id));
  if (src.kind === "INVOICE") throw bad("Already a bill");
  if (src.convertedToId) throw bad("Already converted");
  const body = parse(z.object({ payment: invoiceSchema.shape.payment }), req.body || {});
  const inv = await db.transaction(async (tx) => {
    const inv = await createInvoice(tx, req.businessId!, {
      kind: "INVOICE", billType: src.billType, partyId: src.partyId, customerName: src.customerName, placeOfSupply: src.placeOfSupply,
      items: src.items.map((i) => ({ productId: i.productId, name: i.name, hsn: i.hsn, unit: i.unit, qty: i.qty, rate: i.rate, discountPct: i.discountPct, gstRate: i.gstRate })),
      payment: body.payment ?? null, notes: src.notes,
    }, req.user!.id);
    await tx.update(S.invoices).set({ convertedToId: inv.id }).where(eq(S.invoices.id, src.id));
    return inv;
  });
  res.status(201).json(await invoiceDetail(req.businessId!, inv.id));
});

export async function invoiceDetail(businessId: string | null, idOrToken: string, byToken = false) {
  const inv = await db.query.invoices.findFirst({
    where: byToken ? eq(S.invoices.shareToken, idOrToken) : and(eq(S.invoices.businessId, businessId!), eq(S.invoices.id, idOrToken)),
  });
  if (!inv) throw notFound("Bill not found");
  const items = await db.select().from(S.invoiceItems).where(eq(S.invoiceItems.invoiceId, inv.id)).orderBy(asc(S.invoiceItems.sort));
  const business = await db.query.businesses.findFirst({ where: eq(S.businesses.id, inv.businessId) });
  const party = inv.partyId ? await db.query.parties.findFirst({ where: eq(S.parties.id, inv.partyId) }) : null;
  const byRate = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const it of items) {
    const e = byRate.get(it.gstRate) || { rate: it.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    e.taxable = r2(e.taxable + it.taxable); e.cgst = r2(e.cgst + it.cgst); e.sgst = r2(e.sgst + it.sgst); e.igst = r2(e.igst + it.igst);
    byRate.set(it.gstRate, e);
  }
  const payments = await db.select({ a: S.paymentAllocations, p: S.payments }).from(S.paymentAllocations)
    .innerJoin(S.payments, eq(S.payments.id, S.paymentAllocations.paymentId)).where(eq(S.paymentAllocations.invoiceId, inv.id));
  // Party balance before this bill
  const previousBalance = party ? r2(party.balance - inv.balance) : 0;
  const shareUrl = `${process.env.CRM_URL || ""}/i/${inv.shareToken}`;
  const msg = `Dear ${inv.customerName}, your bill ${inv.number} of ₹${inv.total.toLocaleString("en-IN")} is attached.` +
    (inv.received ? ` Received ₹${inv.received.toLocaleString("en-IN")}.` : "") +
    (inv.balance > 0 ? ` Balance ₹${inv.balance.toLocaleString("en-IN")}${inv.dueDate ? " due " + inv.dueDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : ""}.` : "") +
    (business?.upiId && inv.balance > 0 ? ` Pay by UPI: ${business.upiId}` : "") + `\nView bill: ${shareUrl}\n– ${business?.name}`;
  const { preferences: _p, ...publicBiz } = business!;
  return {
    ...inv, items, business: publicBiz, party, payments: payments.map((x) => ({ ...x.p, allocated: x.a.amount })),
    taxSummary: [...byRate.values()].sort((a, b) => a.rate - b.rate), amountInWords: amountInWords(inv.total),
    placeOfSupplyName: GST_STATES[inv.placeOfSupply], previousBalance, shareUrl,
    upiLink: business?.upiId && inv.balance > 0 ? `upi://pay?pa=${business.upiId}&pn=${encodeURIComponent(business.name)}&am=${inv.balance}&tn=${inv.number}&cu=INR` : null,
    whatsapp: { text: msg, link: waLink(inv.customerPhone, msg) },
  };
}

salesRouter.get("/invoices.xlsx", need("reports.export"), async (req, res) => {
  const { month, kind = "INVOICE" } = req.query as Record<string, string>;
  const r = monthRange(month);
  const rows = await db.select().from(S.invoices).where(and(eq(S.invoices.businessId, req.businessId!), eq(S.invoices.kind, kind as any),
    eq(S.invoices.cancelled, false), gte(S.invoices.date, r.from), lt(S.invoices.date, r.to))).orderBy(asc(S.invoices.date));
  await sendXlsx(res, "sales-register", [
    { header: "Date", key: "date", width: 12 }, { header: "Invoice", key: "number", width: 16 }, { header: "Type", key: "billType", width: 9 },
    { header: "Customer", key: "customerName", width: 28 }, { header: "Taxable", key: "taxable" }, { header: "CGST", key: "cgst" },
    { header: "SGST", key: "sgst" }, { header: "IGST", key: "igst" }, { header: "Total", key: "total" }, { header: "Received", key: "received" },
    { header: "Balance", key: "balance" }, { header: "Status", key: "status" },
  ], rows.map((x) => ({ ...x, date: x.date.toLocaleDateString("en-IN") })));
});

export async function sendXlsx(res: any, name: string, columns: Partial<ExcelJS.Column>[], rows: any[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(name.slice(0, 30));
  ws.columns = columns.map((c) => ({ width: 13, ...c }));
  rows.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename=${name}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
}

// ─────────── Purchases ───────────
salesRouter.get("/purchases", async (req, res) => {
  const { month, q, supplierId } = req.query as Record<string, string>;
  const b = req.businessId!;
  const r = monthRange(month);
  const where = [eq(S.purchases.businessId, b), gte(S.purchases.date, r.from), lt(S.purchases.date, r.to)];
  if (supplierId) where.push(eq(S.purchases.supplierId, supplierId));
  if (q) where.push(or(ilike(S.purchases.number, `%${q}%`), ilike(S.purchases.supplierBillNo, `%${q}%`), ilike(S.parties.name, `%${q}%`))!);
  const rows = await db.select({ p: S.purchases, supplier: S.parties.name }).from(S.purchases).innerJoin(S.parties, eq(S.parties.id, S.purchases.supplierId))
    .where(and(...where)).orderBy(desc(S.purchases.date), desc(S.purchases.number)).limit(300);
  const [m] = await db.select({
    total: sql<number>`coalesce(sum(${S.purchases.total}),0)::float`, bills: sql<number>`count(*)::int`,
    itc: sql<number>`coalesce(sum(${S.purchases.cgst}+${S.purchases.sgst}+${S.purchases.igst}),0)::float`,
  }).from(S.purchases).where(and(eq(S.purchases.businessId, b), gte(S.purchases.date, r.from), lt(S.purchases.date, r.to)));
  const [payable] = await db.select({ amount: sql<number>`coalesce(-sum(${S.parties.balance}) filter (where ${S.parties.balance} < 0),0)::float`,
    suppliers: sql<number>`count(*) filter (where ${S.parties.balance} < 0)::int` }).from(S.parties).where(and(eq(S.parties.businessId, b), eq(S.parties.type, "SUPPLIER")));
  const week = new Date(Date.now() + 7 * 86400000);
  const [due] = await db.select({ amount: sql<number>`coalesce(sum(${S.purchases.balance}),0)::float`, bills: sql<number>`count(*)::int` }).from(S.purchases)
    .where(and(eq(S.purchases.businessId, b), sql`${S.purchases.balance} > 0`, lt(S.purchases.dueDate, week)));
  res.json({ rows: rows.map((x) => ({ ...x.p, supplier: x.supplier, gst: r2(x.p.cgst + x.p.sgst + x.p.igst) })), summary: { ...m, payable, dueThisWeek: due } });
});

salesRouter.post("/purchases", need("purchase"), async (req, res) => {
  const d = parse(z.object({
    supplierId: z.string(), supplierBillNo: z.string().nullish(), date: dateish.optional(), creditDays: z.coerce.number().int().min(0).optional(),
    dueDate: dateish.nullish(), notes: z.string().nullish(),
    items: z.array(z.object({ productId: z.string(), qty: z.coerce.number().positive(), rate: z.coerce.number().min(0), gstRate: z.coerce.number().optional() })).min(1),
    payment: z.object({ mode: payMode, amount: z.coerce.number().min(0), reference: z.string().optional(), account: z.string().optional() }).nullish(),
  }), req.body);
  const pur = await db.transaction((tx) => createPurchase(tx, req.businessId!, d, req.user!.id));
  res.status(201).json(pur);
});

salesRouter.get("/purchases/:id", async (req, res) => {
  const p = await db.query.purchases.findFirst({ where: and(eq(S.purchases.businessId, req.businessId!), eq(S.purchases.id, String(req.params.id))) });
  if (!p) throw notFound();
  const items = await db.select().from(S.purchaseItems).where(eq(S.purchaseItems.purchaseId, p.id));
  const supplier = await db.query.parties.findFirst({ where: eq(S.parties.id, p.supplierId) });
  res.json({ ...p, items, supplier });
});

export const _y = [inArray, ne, recordPayment];
