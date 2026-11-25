import { Router } from "express";
import { and, asc, desc, eq, ilike, or, sql, lte, gt, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import ExcelJS from "exceljs";
import { db, schema as S } from "../../db/index.js";
import { parse, bad, notFound, r2, addDays } from "../../lib/util.js";
import { can, need } from "../../lib/auth.js";
import { moveStock } from "../../services/core.js";

export const inventoryRouter = Router();

const hideCost = <T extends { purchaseRate?: number }>(req: any, p: T) => (can(req, "cost.view") ? p : { ...p, purchaseRate: undefined });

// ── categories ──
inventoryRouter.get("/categories", async (req, res) => {
  const rows = await db.select({ id: S.categories.id, name: S.categories.name, count: sql<number>`count(${S.products.id})::int` })
    .from(S.categories).leftJoin(S.products, and(eq(S.products.categoryId, S.categories.id), eq(S.products.isActive, true)))
    .where(eq(S.categories.businessId, req.businessId!)).groupBy(S.categories.id).orderBy(asc(S.categories.name));
  res.json(rows);
});
inventoryRouter.post("/categories", async (req, res) => {
  const { name } = parse(z.object({ name: z.string().min(1) }), req.body);
  const [c] = await db.insert(S.categories).values({ businessId: req.businessId!, name: name.trim() }).onConflictDoNothing().returning();
  res.status(201).json(c || (await db.query.categories.findFirst({ where: and(eq(S.categories.businessId, req.businessId!), eq(S.categories.name, name.trim())) })));
});

// ── products ──
const stockState = (p: { stock: number; minStock: number }) => (p.stock <= 0 ? "OUT" : p.stock < p.minStock ? "LOW" : "OK");

inventoryRouter.get("/products", async (req, res) => {
  const { q, category, filter, limit = "200", offset = "0" } = req.query as Record<string, string>;
  const where = [eq(S.products.businessId, req.businessId!), eq(S.products.isActive, true)];
  if (q) where.push(or(ilike(S.products.name, `%${q}%`), eq(S.products.barcode, q), ilike(S.products.hsn, `${q}%`))!);
  if (category) where.push(eq(S.products.categoryId, category));
  if (filter === "low") where.push(and(gt(S.products.stock, 0), sql`${S.products.stock} < ${S.products.minStock}`)!);
  if (filter === "out") where.push(lte(S.products.stock, 0));
  const rows = await db.select({ p: S.products, category: S.categories.name }).from(S.products)
    .leftJoin(S.categories, eq(S.categories.id, S.products.categoryId))
    .where(and(...where)).orderBy(asc(S.products.name)).limit(Math.min(+limit, 1000)).offset(+offset);
  res.json(rows.map((r) => hideCost(req, { ...r.p, category: r.category, state: stockState(r.p),
    margin: r.p.saleRate ? Math.round(((r.p.saleRate - r.p.purchaseRate) / r.p.saleRate) * 100) : 0 })));
});

inventoryRouter.get("/products/summary", async (req, res) => {
  const b = req.businessId!;
  const [s] = await db.select({
    total: sql<number>`count(*)::int`,
    value: sql<number>`coalesce(sum(greatest(${S.products.stock},0) * ${S.products.purchaseRate}),0)::float`,
    low: sql<number>`count(*) filter (where ${S.products.stock} > 0 and ${S.products.stock} < ${S.products.minStock})::int`,
    out: sql<number>`count(*) filter (where ${S.products.stock} <= 0)::int`,
  }).from(S.products).where(and(eq(S.products.businessId, b), eq(S.products.isActive, true)));
  const [cats] = await db.select({ c: sql<number>`count(*)::int` }).from(S.categories).where(eq(S.categories.businessId, b));
  const since = addDays(new Date(), -90);
  const [dead] = await db.select({ c: sql<number>`count(*)::int` }).from(S.products).where(and(eq(S.products.businessId, b), eq(S.products.isActive, true),
    gt(S.products.stock, 0), sql`not exists (select 1 from ${S.stockMovements} m where m.product_id = ${S.products.id} and m.reason = 'SALE' and m.created_at >= ${since})`));
  res.json({ ...s, value: can(req, "cost.view") ? r2(s.value) : null, categories: cats.c, dead: dead.c });
});

inventoryRouter.get("/products/barcode/:code", async (req, res) => {
  const p = await db.query.products.findFirst({ where: and(eq(S.products.businessId, req.businessId!), eq(S.products.barcode, String(req.params.code)), eq(S.products.isActive, true)) });
  if (!p) throw notFound("No product with this barcode");
  res.json(hideCost(req, p));
});

inventoryRouter.get("/products/:id", async (req, res) => {
  const p = await db.query.products.findFirst({ where: and(eq(S.products.businessId, req.businessId!), eq(S.products.id, String(req.params.id))) });
  if (!p) throw notFound("Product not found");
  const history = await db.select().from(S.stockMovements).where(eq(S.stockMovements.productId, p.id)).orderBy(desc(S.stockMovements.createdAt)).limit(50);
  res.json({ ...hideCost(req, p), state: stockState(p), margin: p.saleRate ? Math.round(((p.saleRate - p.purchaseRate) / p.saleRate) * 100) : 0,
    reorderQty: await reorderQty(req.businessId!, p), history });
});

const productSchema = z.object({
  name: z.string().min(1), barcode: z.string().trim().optional().nullable(), hsn: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(), category: z.string().optional(), unit: z.string().default("pcs"),
  purchaseRate: z.coerce.number().min(0).default(0), saleRate: z.coerce.number().min(0).default(0),
  mrp: z.coerce.number().optional().nullable(), gstRate: z.coerce.number().refine((v) => [0, 0.25, 3, 5, 12, 18, 28, 40].includes(v), "GST must be 0/0.25/3/5/12/18/28/40").default(0),
  openingStock: z.coerce.number().min(0).optional(), minStock: z.coerce.number().min(0).default(0), imageUrl: z.string().optional().nullable(),
});

async function categoryIdFor(businessId: string, name?: string) {
  if (!name) return null;
  const [c] = await db.insert(S.categories).values({ businessId, name: name.trim() }).onConflictDoUpdate({ target: [S.categories.businessId, S.categories.name], set: { name: name.trim() } }).returning();
  return c.id;
}

inventoryRouter.post("/products", need("stock.adjust"), async (req, res) => {
  const d = parse(productSchema, req.body);
  const businessId = req.businessId!;
  const out = await db.transaction(async (tx) => {
    const [p] = await tx.insert(S.products).values({
      businessId, name: d.name, barcode: d.barcode || null, hsn: d.hsn, unit: d.unit, purchaseRate: d.purchaseRate, saleRate: d.saleRate,
      mrp: d.mrp ?? null, gstRate: d.gstRate, minStock: d.minStock, imageUrl: d.imageUrl,
      categoryId: d.categoryId || (await categoryIdFor(businessId, d.category)),
    }).returning();
    if (d.openingStock) await moveStock(tx, { businessId, productId: p.id, qty: d.openingStock, reason: "OPENING", userId: req.user!.id });
    return p;
  });
  res.status(201).json(out);
});

inventoryRouter.put("/products/:id", need("stock.adjust"), async (req, res) => {
  const d = parse(productSchema.partial().omit({ openingStock: true }), req.body);
  const { category, ...rest } = d;
  const [p] = await db.update(S.products).set({ ...rest, barcode: d.barcode === "" ? null : d.barcode, updatedAt: new Date(),
    ...(category ? { categoryId: await categoryIdFor(req.businessId!, category) } : {}) })
    .where(and(eq(S.products.businessId, req.businessId!), eq(S.products.id, String(req.params.id)))).returning();
  if (!p) throw notFound("Product not found");
  res.json(p);
});

inventoryRouter.delete("/products/:id", need("stock.adjust"), async (req, res) => {
  await db.update(S.products).set({ isActive: false }).where(and(eq(S.products.businessId, req.businessId!), eq(S.products.id, String(req.params.id))));
  res.json({ ok: true });
});

/** Import products from Excel/CSV: columns Name, Barcode, HSN, Category, Unit, Purchase, Sale, MRP, GST, Stock, Min */
inventoryRouter.post("/products/import", need("stock.adjust"), async (req, res) => {
  const { rows } = parse(z.object({ rows: z.array(z.record(z.any())).max(5000) }), req.body);
  let created = 0, updated = 0;
  const errors: string[] = [];
  const pick = (r: any, ...keys: string[]) => { for (const k of Object.keys(r)) if (keys.includes(k.toLowerCase().replace(/[^a-z]/g, ""))) return r[k]; };
  for (const [i, r] of rows.entries()) {
    try {
      const d = parse(productSchema, {
        name: String(pick(r, "name", "productname", "item") ?? "").trim(), barcode: pick(r, "barcode", "ean")?.toString(),
        hsn: pick(r, "hsn", "hsncode")?.toString(), category: pick(r, "category")?.toString(), unit: pick(r, "unit") || "pcs",
        purchaseRate: pick(r, "purchase", "purchaserate", "buy", "cost") ?? 0, saleRate: pick(r, "sale", "salerate", "price", "rate") ?? 0,
        mrp: pick(r, "mrp") ?? null, gstRate: Number(String(pick(r, "gst", "gstrate", "tax") ?? 0).replace("%", "")),
        openingStock: pick(r, "stock", "openingstock", "qty") ?? 0, minStock: pick(r, "min", "minstock", "reorder") ?? 0,
      });
      await db.transaction(async (tx) => {
        const existing = d.barcode ? await tx.query.products.findFirst({ where: and(eq(S.products.businessId, req.businessId!), eq(S.products.barcode, d.barcode)) }) : null;
        const categoryId = await categoryIdFor(req.businessId!, d.category);
        if (existing) {
          await tx.update(S.products).set({ name: d.name, hsn: d.hsn, unit: d.unit, purchaseRate: d.purchaseRate, saleRate: d.saleRate, mrp: d.mrp, gstRate: d.gstRate, minStock: d.minStock, categoryId, isActive: true }).where(eq(S.products.id, existing.id));
          updated++;
        } else {
          const [p] = await tx.insert(S.products).values({ businessId: req.businessId!, name: d.name, barcode: d.barcode || null, hsn: d.hsn, unit: d.unit,
            purchaseRate: d.purchaseRate, saleRate: d.saleRate, mrp: d.mrp, gstRate: d.gstRate, minStock: d.minStock, categoryId }).returning();
          if (d.openingStock) await moveStock(tx, { businessId: req.businessId!, productId: p.id, qty: d.openingStock, reason: "OPENING", userId: req.user!.id });
          created++;
        }
      });
    } catch (e: any) { errors.push(`Row ${i + 2}: ${e.message}`); }
  }
  res.json({ created, updated, errors: errors.slice(0, 50) });
});

// ── stock movements ──
inventoryRouter.get("/stock/movements", async (req, res) => {
  const { productId, days = "2", limit = "100" } = req.query as Record<string, string>;
  const where = [eq(S.stockMovements.businessId, req.businessId!), gte(S.stockMovements.createdAt, addDays(new Date(), -Number(days)))];
  if (productId) where.push(eq(S.stockMovements.productId, productId));
  const rows = await db.select({ m: S.stockMovements, product: S.products.name, unit: S.products.unit }).from(S.stockMovements)
    .innerJoin(S.products, eq(S.products.id, S.stockMovements.productId))
    .where(and(...where)).orderBy(desc(S.stockMovements.createdAt)).limit(Math.min(+limit, 500));
  res.json(rows.map((r) => ({ ...r.m, product: r.product, unit: r.unit })));
});

inventoryRouter.post("/stock/adjust", need("stock.adjust"), async (req, res) => {
  const d = parse(z.object({
    productId: z.string(), direction: z.enum(["IN", "OUT"]), qty: z.coerce.number().positive(),
    reason: z.enum(["OPENING", "RETURN", "DAMAGE", "ADJUSTMENT", "TRANSFER"]), note: z.string().optional(),
  }), req.body);
  const balance = await db.transaction((tx) => moveStock(tx, {
    businessId: req.businessId!, productId: d.productId, qty: d.direction === "IN" ? d.qty : -d.qty, reason: d.reason, note: d.note, userId: req.user!.id,
  }));
  res.json({ ok: true, balance });
});

async function reorderQty(businessId: string, p: { id: string; stock: number; minStock: number }) {
  const [s] = await db.select({ sold: sql<number>`coalesce(-sum(${S.stockMovements.qty}),0)::float` }).from(S.stockMovements)
    .where(and(eq(S.stockMovements.businessId, businessId), eq(S.stockMovements.productId, p.id), eq(S.stockMovements.reason, "SALE"), gte(S.stockMovements.createdAt, addDays(new Date(), -30))));
  // Cover next 30 days of sales + min stock, rounded up to a dozen
  const need = Math.max(s.sold + p.minStock - p.stock, p.minStock * 2 - p.stock, 0);
  return need > 0 ? Math.ceil(need / 12) * 12 : 0;
}

inventoryRouter.get("/stock/reorder", async (req, res) => {
  const low = await db.select().from(S.products).where(and(eq(S.products.businessId, req.businessId!), eq(S.products.isActive, true),
    sql`${S.products.stock} < ${S.products.minStock}`)).orderBy(asc(S.products.stock)).limit(30);
  res.json(await Promise.all(low.map(async (p) => ({ id: p.id, name: p.name, unit: p.unit, stock: p.stock, minStock: p.minStock, order: await reorderQty(req.businessId!, p) }))));
});

/** Excel export of the product list */
inventoryRouter.get("/products.xlsx", async (req, res) => {
  const rows = await db.select({ p: S.products, c: S.categories.name }).from(S.products).leftJoin(S.categories, eq(S.categories.id, S.products.categoryId))
    .where(and(eq(S.products.businessId, req.businessId!), eq(S.products.isActive, true))).orderBy(asc(S.products.name));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Products");
  ws.columns = [
    { header: "Name", key: "name", width: 34 }, { header: "Barcode", key: "barcode", width: 16 }, { header: "HSN", key: "hsn", width: 10 },
    { header: "Category", key: "category", width: 16 }, { header: "Unit", key: "unit", width: 8 },
    ...(can(req, "cost.view") ? [{ header: "Purchase", key: "purchaseRate", width: 10 }] : []),
    { header: "Sale", key: "saleRate", width: 10 }, { header: "MRP", key: "mrp", width: 10 }, { header: "GST", key: "gstRate", width: 6 },
    { header: "Stock", key: "stock", width: 10 }, { header: "Min", key: "minStock", width: 8 },
  ];
  rows.forEach((r) => ws.addRow({ ...r.p, category: r.c }));
  ws.getRow(1).font = { bold: true };
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=products.xlsx");
  await wb.xlsx.write(res);
  res.end();
});

export const _x = inArray;
