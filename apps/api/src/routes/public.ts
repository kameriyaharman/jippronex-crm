import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { db, schema as S } from "../db/index.js";
import { notFound, HttpError } from "../lib/util.js";
import { verifyWebhook } from "../lib/razorpay.js";
import { activatePayment, markPaymentFailed, withGst } from "../services/subscription.js";
import { invoiceDetail } from "./crm/sales.js";

export const publicRouter = Router();

publicRouter.get("/health", (_req, res) => res.json({ ok: true, service: "jippronex-api", time: new Date() }));

publicRouter.get("/public/plans", async (_req, res) => {
  const plans = await db.select().from(S.plans).where(eq(S.plans.active, true)).orderBy(asc(S.plans.sortOrder));
  res.json(plans.map((p) => ({ ...p, yearly: withGst(p.yearlyPrice), monthly: withGst(p.monthlyPrice) })));
});

/** Shared bill (link sent on WhatsApp) */
publicRouter.get("/public/invoice/:token", async (req, res) => {
  const inv = await invoiceDetail(null, String(req.params.token), true);
  if (inv.cancelled) throw notFound("This bill was cancelled");
  const { createdById: _c, costTotal: _ct, items, ...rest } = inv;
  res.json({ ...rest, items: items.map(({ costRate: _r, ...i }) => i) });
});

// ─────────── Payment link landing page (fallback when gateway is not set) ───────────
const page = (title: string, body: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto;background:#f5f7fb;margin:0;display:grid;place-items:center;min-height:100vh;color:#1b1d3a}
.c{background:#fff;border-radius:16px;padding:28px;max-width:380px;width:90%;box-shadow:0 10px 30px #0b46c41a;text-align:center}
.b{display:block;background:#0b46c4;color:#fff;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;margin-top:18px;border:0;width:100%;font-size:15px;cursor:pointer}
.amt{font-size:34px;font-weight:800;margin:8px 0}.m{color:#6b7090;font-size:14px}.logo{font-weight:800;color:#0b46c4;letter-spacing:1px}</style></head><body><div class="c"><div class="logo">JIPPRONEX</div>${body}</div></body></html>`;

publicRouter.get("/pay/:code", async (req, res) => {
  const p = await db.query.subscriptionPayments.findFirst({ where: eq(S.subscriptionPayments.linkCode, String(req.params.code)) });
  if (!p) throw notFound("Payment link not found");
  const biz = await db.query.businesses.findFirst({ where: eq(S.businesses.id, p.businessId) });
  if (p.status === "CAPTURED" || p.status === "TO_DEPOSIT") return res.send(page("Paid", `<h2>Payment received ✓</h2><p class="m">${p.description}<br/>Invoice ${p.invoiceNo}</p>`));
  if (p.linkUrl && !p.linkUrl.includes(`/pay/${p.linkCode}`)) return res.redirect(p.linkUrl);
  const sim = process.env.ALLOW_PAYMENT_SIMULATION === "true";
  res.send(page("Pay Jippronex", `<p class="m">${biz?.name}</p><div class="amt">₹${p.amount.toLocaleString("en-IN")}</div><p class="m">${p.description}<br/>incl. 18% GST</p>
    ${sim ? `<form method="post" action="/pay/${p.linkCode}/simulate"><button class="b">Simulate successful payment (test)</button></form>` : `<p class="m" style="margin-top:18px">Online payment is being set up. Please pay via UPI / bank transfer and share the reference with Jippronex.</p>`}`));
});

publicRouter.post("/pay/:code/simulate", async (req, res) => {
  if (process.env.ALLOW_PAYMENT_SIMULATION !== "true") throw new HttpError(403, "Disabled");
  const p = await db.query.subscriptionPayments.findFirst({ where: eq(S.subscriptionPayments.linkCode, String(req.params.code)) });
  if (!p) throw notFound();
  await db.transaction((tx) => activatePayment(tx, p.id, { gatewayPaymentId: `pay_TEST${Date.now().toString(36).toUpperCase()}`, method: "UPI" }));
  res.redirect(`/pay/${p.linkCode}`);
});

publicRouter.get("/pay/:code/done", async (req, res) => {
  // Razorpay redirects here after payment; activation happens via webhook (source of truth).
  const p = await db.query.subscriptionPayments.findFirst({ where: eq(S.subscriptionPayments.linkCode, String(req.params.code)) });
  const ok = req.query.razorpay_payment_link_status === "paid" || p?.status === "CAPTURED";
  res.send(page("Thank you", ok ? `<h2>Payment successful ✓</h2><p class="m">Your Jippronex account will be active in a few seconds. You can go back to the app.</p>`
    : `<h2>Payment pending</h2><p class="m">If money was debited, it will reflect shortly.</p>`));
});

// ─────────── Razorpay webhook ───────────
// Events: payment_link.paid, payment.captured, payment.failed, refund.processed
publicRouter.post("/webhooks/razorpay", async (req, res) => {
  const raw = (req as any).rawBody as Buffer;
  if (!(await verifyWebhook(raw, req.headers["x-razorpay-signature"] as string))) throw new HttpError(400, "Bad signature");
  const ev = req.body;
  const payment = ev.payload?.payment?.entity;
  const link = ev.payload?.payment_link?.entity;
  const ref = link?.reference_id || payment?.notes?.reference;
  if (!ref) return res.json({ ok: true, ignored: true });
  const method = payment?.method === "upi" ? "UPI" : payment?.method === "card" ? "Card" : payment?.method === "netbanking" ? "Netbanking" : payment?.method;
  if (ev.event === "payment_link.paid" || ev.event === "payment.captured") {
    await db.transaction((tx) => activatePayment(tx, ref, { gatewayPaymentId: payment?.id, method: link ? `${method}` : method }));
  } else if (ev.event === "payment.failed") {
    await db.transaction((tx) => markPaymentFailed(tx, ref, payment?.error_description, payment?.id));
  }
  res.json({ ok: true });
});
