import { Router } from "express";
import { and, asc, desc, eq, gte, lt, sql, gt, inArray, isNotNull } from "drizzle-orm";
import { db, schema as S } from "../../db/index.js";
import { rangeFor, monthRange, fyRange, istMonthStart, istParts, r2, addDays, bad } from "../../lib/util.js";
import { can, need } from "../../lib/auth.js";
import { sendXlsx } from "./sales.js";
import { partyLedger } from "../../services/core.js";

export const reportsRouter = Router();
const I = S.invoices;

const salesWhere = (b: string, from: Date, to: Date) =>
  and(eq(I.businessId, b), eq(I.kind, "INVOICE"), eq(I.cancelled, false), gte(I.date, from), lt(I.date, to));

async function salesAgg(b: string, from: Date, to: Date) {
  const [s] = await db.select({
    total: sql<number>`coalesce(sum(${I.total}),0)::float`, taxable: sql<number>`coalesce(sum(${I.taxable}),0)::float`,
    cost: sql<number>`coalesce(sum(${I.costTotal}),0)::float`, bills: sql<number>`count(*)::int`,
  }).from(I).where(salesWhere(b, from, to));
  const [cn] = await db.select({ taxable: sql<number>`coalesce(sum(${I.taxable}),0)::float`, cost: sql<number>`coalesce(sum(${I.costTotal}),0)::float` })
    .from(I).where(and(eq(I.businessId, b), eq(I.kind, "CREDIT_NOTE"), eq(I.cancelled, false), gte(I.date, from), lt(I.date, to)));
  return { ...s, netSales: r2(s.taxable - cn.taxable), cogs: r2(s.cost - cn.cost) };
}
async function expenseSum(b: string, from: Date, to: Date) {
  const [e] = await db.select({ amt: sql<number>`coalesce(sum(${S.expenses.amount}),0)::float` }).from(S.expenses)
    .where(and(eq(S.expenses.businessId, b), gte(S.expenses.date, from), lt(S.expenses.date, to)));
  return e.amt;
}

// ─────────── Dashboard ───────────
reportsRouter.get("/dashboard", async (req, res) => {
  const b = req.businessId!;
  const range = (req.query.range as string) || "today";
  const r = rangeFor(range);
  const span = r.to.getTime() - r.from.getTime();
  const prev = { from: new Date(r.from.getTime() - (range === "today" ? 86400000 : span)), to: r.from };
  const [cur, before] = await Promise.all([salesAgg(b, r.from, r.to), salesAgg(b, prev.from, prev.to)]);
  const [pur] = await db.select({ total: sql<number>`coalesce(sum(${S.purchases.total}),0)::float`, bills: sql<number>`count(*)::int` })
    .from(S.purchases).where(and(eq(S.purchases.businessId, b), gte(S.purchases.date, r.from), lt(S.purchases.date, r.to)));
  const [bal] = await db.select({
    receive: sql<number>`coalesce(sum(${S.parties.balance}) filter (where ${S.parties.balance} > 0),0)::float`,
    receiveN: sql<number>`count(*) filter (where ${S.parties.balance} > 0)::int`,
    pay: sql<number>`coalesce(-sum(${S.parties.balance}) filter (where ${S.parties.balance} < 0),0)::float`,
    payN: sql<number>`count(*) filter (where ${S.parties.balance} < 0)::int`,
  }).from(S.parties).where(eq(S.parties.businessId, b));
  const [stock] = await db.select({ value: sql<number>`coalesce(sum(greatest(${S.products.stock},0)*${S.products.purchaseRate}),0)::float`, n: sql<number>`count(*)::int` })
    .from(S.products).where(and(eq(S.products.businessId, b), eq(S.products.isActive, true)));
  const m = monthRange();
  const ms = await salesAgg(b, m.from, m.to);
  const mexp = await expenseSum(b, m.from, m.to);
  const profitMonth = r2(ms.netSales - ms.cogs - mexp);
  const profitRange = r2(cur.netSales - cur.cogs);

  // FY chart: sales vs purchase by month
  const fy = fyRange();
  const salesByM = await db.select({ m: sql<string>`to_char(${I.date} at time zone 'Asia/Kolkata','YYYY-MM')`, v: sql<number>`sum(${I.total})::float` })
    .from(I).where(salesWhere(b, fy.from, fy.to)).groupBy(sql`1`);
  const purByM = await db.select({ m: sql<string>`to_char(${S.purchases.date} at time zone 'Asia/Kolkata','YYYY-MM')`, v: sql<number>`sum(${S.purchases.total})::float` })
    .from(S.purchases).where(and(eq(S.purchases.businessId, b), gte(S.purchases.date, fy.from), lt(S.purchases.date, fy.to))).groupBy(sql`1`);
  const chart = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(fy.startY, 3 + i, 15));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return { month: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }), key,
      sales: salesByM.find((x) => x.m === key)?.v || 0, purchase: purByM.find((x) => x.m === key)?.v || 0 };
  });
  const lowStock = await db.select({ id: S.products.id, name: S.products.name, stock: S.products.stock, minStock: S.products.minStock, unit: S.products.unit })
    .from(S.products).where(and(eq(S.products.businessId, b), eq(S.products.isActive, true), sql`${S.products.stock} < ${S.products.minStock}`))
    .orderBy(asc(sql`${S.products.stock} / nullif(${S.products.minStock},0)`)).limit(8);
  const [lowCount] = await db.select({ c: sql<number>`count(*)::int` }).from(S.products)
    .where(and(eq(S.products.businessId, b), eq(S.products.isActive, true), sql`${S.products.stock} < ${S.products.minStock}`));
  const recent = await db.select().from(I).where(and(eq(I.businessId, b), eq(I.kind, "INVOICE"), eq(I.cancelled, false)))
    .orderBy(desc(I.date)).limit(6);
  const top = await db.select({ name: S.invoiceItems.name, amount: sql<number>`sum(${S.invoiceItems.amount})::float`, qty: sql<number>`sum(${S.invoiceItems.qty})::float` })
    .from(S.invoiceItems).innerJoin(I, eq(I.id, S.invoiceItems.invoiceId)).where(salesWhere(b, m.from, m.to))
    .groupBy(S.invoiceItems.name).orderBy(desc(sql`sum(${S.invoiceItems.amount})`)).limit(5);
  const showProfit = can(req, "cost.view");
  res.json({
    range, fy: fy.label,
    sales: { amount: cur.total, bills: cur.bills, changePct: before.total ? Math.round(((cur.total - before.total) / before.total) * 100) : null },
    purchase: pur, toReceive: { amount: bal.receive, parties: bal.receiveN }, toPay: { amount: bal.pay, parties: bal.payN },
    stock: { value: showProfit ? r2(stock.value) : null, products: stock.n },
    profit: showProfit ? { month: profitMonth, marginPct: ms.netSales ? r2((profitMonth / ms.netSales) * 100) : 0, range: profitRange } : null,
    chart, lowStock, lowStockCount: lowCount.c, recent, topProducts: top,
  });
});

// ─────────── Accounts & GST ───────────
reportsRouter.get("/accounts", need("accounts"), async (req, res) => {
  const b = req.businessId!;
  const r = monthRange(req.query.month as string);
  const prevR = monthRange(`${r.m === 0 ? r.y - 1 : r.y}-${String(r.m === 0 ? 12 : r.m).padStart(2, "0")}`);
  const pl = async (from: Date, to: Date) => {
    const s = await salesAgg(b, from, to);
    const e = await expenseSum(b, from, to);
    const gross = r2(s.netSales - s.cogs);
    const net = r2(gross - e);
    return { sales: s.netSales, cogs: s.cogs, gross, expenses: e, otherIncome: 0, net, marginPct: s.netSales ? r2((net / s.netSales) * 100) : 0 };
  };
  const [cur, prev] = await Promise.all([pl(r.from, r.to), pl(prevR.from, prevR.to)]);
  const tax = async (kind: "INVOICE" | "CREDIT_NOTE") => (await db.select({
    cgst: sql<number>`coalesce(sum(${I.cgst}),0)::float`, sgst: sql<number>`coalesce(sum(${I.sgst}),0)::float`, igst: sql<number>`coalesce(sum(${I.igst}),0)::float`,
    taxable: sql<number>`coalesce(sum(${I.taxable}),0)::float`,
    b2b: sql<number>`count(*) filter (where ${S.parties.gstin} is not null and ${S.parties.gstin} <> '')::int`,
    b2c: sql<number>`count(*) filter (where ${S.parties.gstin} is null or ${S.parties.gstin} = '')::int`,
    b2bValue: sql<number>`coalesce(sum(${I.taxable}) filter (where ${S.parties.gstin} is not null and ${S.parties.gstin} <> ''),0)::float`,
  }).from(I).leftJoin(S.parties, eq(S.parties.id, I.partyId))
    .where(and(eq(I.businessId, b), eq(I.kind, kind), eq(I.billType, "GST"), eq(I.cancelled, false), gte(I.date, r.from), lt(I.date, r.to))))[0];
  const out = await tax("INVOICE");
  const cn = await tax("CREDIT_NOTE");
  const [inp] = await db.select({ cgst: sql<number>`coalesce(sum(${S.purchases.cgst}),0)::float`, sgst: sql<number>`coalesce(sum(${S.purchases.sgst}),0)::float`,
    igst: sql<number>`coalesce(sum(${S.purchases.igst}),0)::float`, bills: sql<number>`count(*)::int` })
    .from(S.purchases).where(and(eq(S.purchases.businessId, b), gte(S.purchases.date, r.from), lt(S.purchases.date, r.to)));
  const output = { cgst: r2(out.cgst - cn.cgst), sgst: r2(out.sgst - cn.sgst), igst: r2(out.igst - cn.igst) };
  const input = { cgst: inp.cgst, sgst: inp.sgst, igst: inp.igst };
  // ITC set-off simplified: IGST credit first against IGST, then CGST/SGST.
  const net = { cgst: r2(Math.max(0, output.cgst - input.cgst)), sgst: r2(Math.max(0, output.sgst - input.sgst)), igst: r2(Math.max(0, output.igst - input.igst)) };
  const [nongst] = await db.select({ v: sql<number>`coalesce(sum(${I.total}),0)::float`, n: sql<number>`count(*)::int` }).from(I)
    .where(and(eq(I.businessId, b), eq(I.kind, "INVOICE"), eq(I.billType, "NON_GST"), eq(I.cancelled, false), gte(I.date, r.from), lt(I.date, r.to)));
  const [hsn] = await db.select({ n: sql<number>`count(distinct coalesce(${S.invoiceItems.hsn},''))::int` }).from(S.invoiceItems).innerJoin(I, eq(I.id, S.invoiceItems.invoiceId))
    .where(and(eq(I.businessId, b), eq(I.kind, "INVOICE"), eq(I.billType, "GST"), eq(I.cancelled, false), gte(I.date, r.from), lt(I.date, r.to)));
  // Simple balance sheet snapshot
  const [stock] = await db.select({ v: sql<number>`coalesce(sum(greatest(${S.products.stock},0)*${S.products.purchaseRate}),0)::float` }).from(S.products).where(eq(S.products.businessId, b));
  const [pb] = await db.select({ recv: sql<number>`coalesce(sum(${S.parties.balance}) filter (where ${S.parties.balance} > 0),0)::float`,
    pay: sql<number>`coalesce(-sum(${S.parties.balance}) filter (where ${S.parties.balance} < 0),0)::float` }).from(S.parties).where(eq(S.parties.businessId, b));
  const dueY = r.m === 11 ? r.y + 1 : r.y, dueM = (r.m + 1) % 12;
  res.json({
    month: `${r.y}-${String(r.m + 1).padStart(2, "0")}`, pl: cur, prevMarginPct: prev.marginPct,
    gst: { output, input, net, totalOutput: r2(output.cgst + output.sgst + output.igst), totalInput: r2(input.cgst + input.sgst + input.igst),
      totalNet: r2(net.cgst + net.sgst + net.igst) },
    gstr1: { b2b: out.b2b, b2c: out.b2c, b2bValue: out.b2bValue, b2cValue: r2(out.taxable - out.b2bValue), dueDate: new Date(Date.UTC(dueY, dueM, 11)) },
    gstr3bDue: new Date(Date.UTC(dueY, dueM, 20)),
    taxableSales: out.taxable, nonGstSales: nongst, itc: { amount: r2(input.cgst + input.sgst + input.igst), bills: inp.bills }, hsnCodes: hsn.n,
    balanceSheet: { stock: r2(stock.v), receivables: pb.recv, payables: pb.pay },
  });
});

/** GSTR-1 data as Excel (B2B, B2C, HSN sheets) for the CA */
reportsRouter.get("/accounts/gstr1.xlsx", need("reports.export"), async (req, res) => {
  const b = req.businessId!;
  const r = monthRange(req.query.month as string);
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const rows = await db.select({ i: I, gstin: S.parties.gstin, party: S.parties.name }).from(I).leftJoin(S.parties, eq(S.parties.id, I.partyId))
    .where(and(eq(I.businessId, b), eq(I.kind, "INVOICE"), eq(I.billType, "GST"), eq(I.cancelled, false), gte(I.date, r.from), lt(I.date, r.to))).orderBy(asc(I.date));
  const b2b = wb.addWorksheet("B2B");
  b2b.columns = ["GSTIN of Recipient", "Receiver Name", "Invoice Number", "Invoice date", "Invoice Value", "Place Of Supply", "Taxable Value", "CGST", "SGST", "IGST"].map((h) => ({ header: h, width: 18 }));
  const b2c = wb.addWorksheet("B2C");
  b2c.columns = ["Invoice Number", "Invoice date", "Customer", "Place Of Supply", "Invoice Value", "Taxable Value", "CGST", "SGST", "IGST"].map((h) => ({ header: h, width: 18 }));
  for (const x of rows) {
    const d = x.i.date.toLocaleDateString("en-GB");
    if (x.gstin) b2b.addRow([x.gstin, x.party, x.i.number, d, x.i.total, x.i.placeOfSupply, x.i.taxable, x.i.cgst, x.i.sgst, x.i.igst]);
    else b2c.addRow([x.i.number, d, x.i.customerName, x.i.placeOfSupply, x.i.total, x.i.taxable, x.i.cgst, x.i.sgst, x.i.igst]);
  }
  const hsn = await hsnSummary(b, r.from, r.to);
  const hs = wb.addWorksheet("HSN");
  hs.columns = ["HSN", "Description", "UQC", "Total Quantity", "Taxable Value", "Rate", "CGST", "SGST", "IGST"].map((h) => ({ header: h, width: 16 }));
  hsn.forEach((h) => hs.addRow([h.hsn, h.name, h.unit, h.qty, h.taxable, h.rate, h.cgst, h.sgst, h.igst]));
  wb.worksheets.forEach((w) => (w.getRow(1).font = { bold: true }));
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename=GSTR1-${req.query.month || "month"}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
});

async function hsnSummary(b: string, from: Date, to: Date) {
  return db.select({
    hsn: sql<string>`coalesce(${S.invoiceItems.hsn},'')`, name: sql<string>`min(${S.invoiceItems.name})`, unit: sql<string>`min(${S.invoiceItems.unit})`,
    rate: S.invoiceItems.gstRate, qty: sql<number>`sum(${S.invoiceItems.qty})::float`, taxable: sql<number>`sum(${S.invoiceItems.taxable})::float`,
    cgst: sql<number>`sum(${S.invoiceItems.cgst})::float`, sgst: sql<number>`sum(${S.invoiceItems.sgst})::float`, igst: sql<number>`sum(${S.invoiceItems.igst})::float`,
  }).from(S.invoiceItems).innerJoin(I, eq(I.id, S.invoiceItems.invoiceId))
    .where(and(eq(I.businessId, b), eq(I.kind, "INVOICE"), eq(I.billType, "GST"), eq(I.cancelled, false), gte(I.date, from), lt(I.date, to)))
    .groupBy(sql`1`, S.invoiceItems.gstRate).orderBy(sql`1`);
}

// ─────────── Reports & analytics ───────────
reportsRouter.get("/reports/overview", async (req, res) => {
  const b = req.businessId!;
  const fy = fyRange();
  const lastFrom = istMonthStart(fy.startY - 1, 3);
  const now = new Date();
  const sameDayLastYear = new Date(now.getTime() - 365 * 86400000);
  const [cur, last] = await Promise.all([salesAgg(b, fy.from, fy.to), salesAgg(b, lastFrom, sameDayLastYear)]);
  const trend = await db.select({ m: sql<string>`to_char(${I.date} at time zone 'Asia/Kolkata','YYYY-MM')`,
    revenue: sql<number>`sum(${I.total})::float`, profit: sql<number>`sum(${I.taxable} - ${I.costTotal})::float` })
    .from(I).where(salesWhere(b, fy.from, fy.to)).groupBy(sql`1`).orderBy(sql`1`);
  const top = await db.select({ name: I.customerName, partyId: I.partyId, amount: sql<number>`sum(${I.total})::float`, bills: sql<number>`count(*)::int` })
    .from(I).where(and(salesWhere(b, fy.from, fy.to), isNotNull(I.partyId))).groupBy(I.customerName, I.partyId).orderBy(desc(sql`sum(${I.total})`)).limit(6);
  const [rep] = await db.select({ v: sql<number>`coalesce(sum(t.amt) filter (where t.n > 1),0)::float`, all: sql<number>`coalesce(sum(t.amt),0)::float` })
    .from(sql`(select party_id, count(*) n, sum(total) amt from invoices where business_id = ${b} and kind='INVOICE' and cancelled=false and date >= ${fy.from} and date < ${fy.to} group by party_id) t`);
  const gross = r2(cur.netSales - cur.cogs);
  const showProfit = can(req, "cost.view");
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(fy.startY, 3 + i, 15));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const t = trend.find((x) => x.m === key);
    return { month: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }), revenue: t?.revenue || 0, profit: showProfit ? t?.profit || 0 : null };
  });
  res.json({
    fy: fy.label, revenue: cur.total, revenueChangePct: last.total ? Math.round(((cur.total - last.total) / last.total) * 100) : null,
    grossProfit: showProfit ? gross : null, grossMarginPct: showProfit && cur.netSales ? r2((gross / cur.netSales) * 100) : null,
    avgBill: cur.bills ? Math.round(cur.total / cur.bills) : 0, bills: cur.bills,
    repeatPct: rep.all ? Math.round((rep.v / rep.all) * 100) : 0, trend: months, topCustomers: top,
    salesThisMonth: (await salesAgg(b, monthRange().from, monthRange().to)).total,
  });
});

/** Downloadable reports (Excel). Pass ?month=YYYY-MM or ?from=&to= */
reportsRouter.get("/reports/:key.xlsx", need("reports.export"), async (req, res) => {
  const b = req.businessId!;
  const key = String(req.params.key);
  const q = req.query as Record<string, string>;
  const r = q.from ? { from: new Date(q.from), to: addDays(new Date(q.to || q.from), 1) } : monthRange(q.month);
  const d = (x: Date) => x.toLocaleDateString("en-IN");
  switch (key) {
    case "sales-register": {
      const rows = await db.select().from(I).where(salesWhere(b, r.from, r.to)).orderBy(asc(I.date));
      return sendXlsx(res, key, [{ header: "Date", key: "date" }, { header: "Bill", key: "number", width: 16 }, { header: "Type", key: "billType" }, { header: "Customer", key: "customerName", width: 28 },
        { header: "Taxable", key: "taxable" }, { header: "CGST", key: "cgst" }, { header: "SGST", key: "sgst" }, { header: "IGST", key: "igst" }, { header: "Total", key: "total" },
        { header: "Received", key: "received" }, { header: "Balance", key: "balance" }, { header: "Status", key: "status" }], rows.map((x) => ({ ...x, date: d(x.date) })));
    }
    case "purchase-register": {
      const rows = await db.select({ p: S.purchases, s: S.parties.name, g: S.parties.gstin }).from(S.purchases).innerJoin(S.parties, eq(S.parties.id, S.purchases.supplierId))
        .where(and(eq(S.purchases.businessId, b), gte(S.purchases.date, r.from), lt(S.purchases.date, r.to))).orderBy(asc(S.purchases.date));
      return sendXlsx(res, key, [{ header: "Date", key: "date" }, { header: "No.", key: "number" }, { header: "Supplier", key: "s", width: 26 }, { header: "GSTIN", key: "g", width: 18 },
        { header: "Supplier bill", key: "supplierBillNo", width: 16 }, { header: "Taxable", key: "taxable" }, { header: "CGST", key: "cgst" }, { header: "SGST", key: "sgst" },
        { header: "IGST", key: "igst" }, { header: "Total", key: "total" }, { header: "Paid", key: "paid" }, { header: "Balance", key: "balance" }],
        rows.map((x) => ({ ...x.p, s: x.s, g: x.g, date: d(x.p.date) })));
    }
    case "stock-summary":
    case "low-stock": {
      const where = [eq(S.products.businessId, b), eq(S.products.isActive, true)];
      if (key === "low-stock") where.push(sql`${S.products.stock} < ${S.products.minStock}`);
      const rows = await db.select().from(S.products).where(and(...where)).orderBy(asc(S.products.name));
      return sendXlsx(res, key, [{ header: "Product", key: "name", width: 32 }, { header: "Barcode", key: "barcode", width: 16 }, { header: "Unit", key: "unit" },
        { header: "Stock", key: "stock" }, { header: "Min", key: "minStock" }, { header: "Purchase", key: "purchaseRate" }, { header: "Sale", key: "saleRate" }, { header: "Value", key: "value" }],
        rows.map((p) => ({ ...p, value: r2(Math.max(0, p.stock) * p.purchaseRate) })));
    }
    case "stock-movement": {
      const rows = await db.select({ m: S.stockMovements, n: S.products.name }).from(S.stockMovements).innerJoin(S.products, eq(S.products.id, S.stockMovements.productId))
        .where(and(eq(S.stockMovements.businessId, b), gte(S.stockMovements.createdAt, r.from), lt(S.stockMovements.createdAt, r.to))).orderBy(asc(S.stockMovements.createdAt));
      return sendXlsx(res, key, [{ header: "Date", key: "date", width: 18 }, { header: "Product", key: "n", width: 30 }, { header: "Reason", key: "reason" }, { header: "Ref", key: "refNo", width: 16 },
        { header: "Qty", key: "qty" }, { header: "Balance", key: "balanceAfter" }, { header: "Note", key: "note", width: 24 }],
        rows.map((x) => ({ ...x.m, n: x.n, date: x.m.createdAt.toLocaleString("en-IN") })));
    }
    case "outstanding": {
      const rows = await db.select().from(S.parties).where(and(eq(S.parties.businessId, b), sql`${S.parties.balance} <> 0`)).orderBy(desc(S.parties.balance));
      return sendXlsx(res, key, [{ header: "Party", key: "name", width: 30 }, { header: "Type", key: "type" }, { header: "Phone", key: "phone" }, { header: "Receivable", key: "dr" }, { header: "Payable", key: "cr" }],
        rows.map((p) => ({ ...p, dr: p.balance > 0 ? p.balance : "", cr: p.balance < 0 ? -p.balance : "" })));
    }
    case "party-ledger": {
      if (!q.partyId) throw bad("partyId required");
      const l = await partyLedger(b, q.partyId, r.from, r.to);
      return sendXlsx(res, `ledger-${l.party.name.replace(/\W+/g, "-")}`, [{ header: "Date", key: "date" }, { header: "Particulars", key: "particulars", width: 26 },
        { header: "Debit", key: "debit" }, { header: "Credit", key: "credit" }, { header: "Balance", key: "balance" }],
        [{ date: "", particulars: "Opening balance", balance: l.opening }, ...l.rows.map((x) => ({ ...x, date: d(x.date), debit: x.debit || "", credit: x.credit || "" }))]);
    }
    case "expense-report": {
      const rows = await db.select().from(S.expenses).where(and(eq(S.expenses.businessId, b), gte(S.expenses.date, r.from), lt(S.expenses.date, r.to))).orderBy(asc(S.expenses.date));
      return sendXlsx(res, key, [{ header: "Date", key: "date" }, { header: "Description", key: "description", width: 30 }, { header: "Category", key: "category" }, { header: "Amount", key: "amount" }, { header: "Paid by", key: "mode" }],
        rows.map((x) => ({ ...x, date: d(x.date) })));
    }
    case "hsn-summary": {
      const rows = await hsnSummary(b, r.from, r.to);
      return sendXlsx(res, key, [{ header: "HSN", key: "hsn" }, { header: "Description", key: "name", width: 28 }, { header: "UQC", key: "unit" }, { header: "Qty", key: "qty" },
        { header: "Rate %", key: "rate" }, { header: "Taxable", key: "taxable" }, { header: "CGST", key: "cgst" }, { header: "SGST", key: "sgst" }, { header: "IGST", key: "igst" }], rows);
    }
    case "item-profit": {
      if (!can(req, "cost.view")) throw bad("Not allowed");
      const rows = await db.select({ name: S.invoiceItems.name, qty: sql<number>`sum(${S.invoiceItems.qty})::float`, sales: sql<number>`sum(${S.invoiceItems.taxable})::float`,
        cost: sql<number>`sum(${S.invoiceItems.qty} * ${S.invoiceItems.costRate})::float` }).from(S.invoiceItems).innerJoin(I, eq(I.id, S.invoiceItems.invoiceId))
        .where(salesWhere(b, r.from, r.to)).groupBy(S.invoiceItems.name).orderBy(desc(sql`sum(${S.invoiceItems.taxable})`));
      return sendXlsx(res, key, [{ header: "Item", key: "name", width: 30 }, { header: "Qty", key: "qty" }, { header: "Sales", key: "sales" }, { header: "Cost", key: "cost" }, { header: "Profit", key: "profit" }, { header: "Margin %", key: "m" }],
        rows.map((x) => ({ ...x, profit: r2(x.sales - x.cost), m: x.sales ? r2(((x.sales - x.cost) / x.sales) * 100) : 0 })));
    }
    case "salesman": {
      const rows = await db.select({ name: S.users.name, bills: sql<number>`count(*)::int`, total: sql<number>`sum(${I.total})::float` }).from(I)
        .leftJoin(S.users, eq(S.users.id, I.createdById)).where(salesWhere(b, r.from, r.to)).groupBy(S.users.name);
      return sendXlsx(res, key, [{ header: "Staff", key: "name", width: 24 }, { header: "Bills", key: "bills" }, { header: "Sales", key: "total" }], rows);
    }
    case "day-book":
    case "cash-book":
    case "bank-book": {
      const pays = await db.select({ p: S.payments, n: S.parties.name }).from(S.payments).leftJoin(S.parties, eq(S.parties.id, S.payments.partyId))
        .where(and(eq(S.payments.businessId, b), gte(S.payments.date, r.from), lt(S.payments.date, r.to)));
      const exps = await db.select().from(S.expenses).where(and(eq(S.expenses.businessId, b), gte(S.expenses.date, r.from), lt(S.expenses.date, r.to)));
      let rows: any[] = [
        ...pays.map((x) => ({ at: x.p.date, date: d(x.p.date), particulars: `${x.n || "Walk-in"} · ${x.p.number}`, mode: x.p.mode, in: x.p.direction === "IN" ? x.p.amount : "", out: x.p.direction === "OUT" ? x.p.amount : "" })),
        ...exps.map((e) => ({ at: e.date, date: d(e.date), particulars: `Expense · ${e.description}`, mode: e.mode, in: "", out: e.amount })),
      ];
      if (key === "day-book") {
        const invs = await db.select().from(I).where(salesWhere(b, r.from, r.to));
        rows.push(...invs.map((i) => ({ at: i.date, date: d(i.date), particulars: `Sale ${i.number} · ${i.customerName}`, mode: "BILL", in: "", out: "", bill: i.total })));
      }
      if (key === "cash-book") rows = rows.filter((x) => x.mode === "CASH");
      if (key === "bank-book") rows = rows.filter((x) => x.mode !== "CASH");
      rows.sort((a, b) => a.at - b.at);
      return sendXlsx(res, key, [{ header: "Date", key: "date" }, { header: "Particulars", key: "particulars", width: 40 }, { header: "Mode", key: "mode" },
        ...(key === "day-book" ? [{ header: "Bill amount", key: "bill" }] : []), { header: "In", key: "in" }, { header: "Out", key: "out" }], rows);
    }
    case "profit-loss": {
      if (!can(req, "accounts")) throw bad("Not allowed");
      const s = await salesAgg(b, r.from, r.to);
      const e = await expenseSum(b, r.from, r.to);
      return sendXlsx(res, key, [{ header: "Particulars", key: "k", width: 32 }, { header: "Amount", key: "v", width: 16 }], [
        { k: "Sales (excl. GST)", v: s.netSales }, { k: "Less: Cost of goods sold", v: -s.cogs }, { k: "Gross profit", v: r2(s.netSales - s.cogs) },
        { k: "Less: Expenses", v: -e }, { k: "Net profit", v: r2(s.netSales - s.cogs - e) }]);
    }
    default:
      throw bad("Unknown report");
  }
});

export const _w = [gt, inArray, istParts];
