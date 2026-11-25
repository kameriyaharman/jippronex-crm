import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";

export async function razorpayConfig() {
  const cfg = await db.query.gatewayConfigs.findFirst({ where: eq(schema.gatewayConfigs.provider, "razorpay") });
  const keyId = cfg?.keyId || process.env.RAZORPAY_KEY_ID;
  const keySecret = cfg?.keySecret || process.env.RAZORPAY_KEY_SECRET;
  const webhookSecret = cfg?.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET;
  return { keyId, keySecret, webhookSecret, live: cfg?.mode === "live", enabled: !!(keyId && keySecret) };
}

async function rzp(path: string, body: unknown) {
  const { keyId, keySecret } = await razorpayConfig();
  const r = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64") },
    body: JSON.stringify(body),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error(j?.error?.description || `Razorpay error ${r.status}`);
  return j;
}

/** Creates a Razorpay Payment Link (UPI / card / netbanking). Returns null when gateway isn't configured. */
export async function createPaymentLink(o: {
  amount: number; reference: string; description: string;
  customer: { name: string; contact?: string | null; email?: string | null };
  callbackUrl?: string; notify?: boolean;
}) {
  const cfg = await razorpayConfig();
  if (!cfg.enabled) return null;
  const j = await rzp("/payment_links", {
    amount: Math.round(o.amount * 100),
    currency: "INR",
    reference_id: o.reference,
    description: o.description.slice(0, 2048),
    customer: { name: o.customer.name, contact: o.customer.contact ? "+91" + o.customer.contact : undefined, email: o.customer.email || undefined },
    notify: { sms: !!o.notify, email: !!o.notify },
    reminder_enable: true,
    callback_url: o.callbackUrl,
    callback_method: o.callbackUrl ? "get" : undefined,
    notes: { reference: o.reference },
  });
  return { id: j.id as string, url: j.short_url as string };
}

export async function refundPayment(paymentId: string, amount: number) {
  return rzp(`/payments/${paymentId}/refund`, { amount: Math.round(amount * 100) });
}

export async function verifyWebhook(rawBody: Buffer, signature: string | undefined) {
  const { webhookSecret } = await razorpayConfig();
  if (!webhookSecret || !signature) return false;
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature.padEnd(expected.length).slice(0, expected.length)));
}
