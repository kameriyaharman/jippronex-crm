/**
 * SMS / WhatsApp sending. Providers are pluggable through env:
 *   SMS_PROVIDER=msg91  (MSG91_AUTH_KEY, MSG91_OTP_TEMPLATE_ID)
 *   WHATSAPP_PROVIDER=interakt (INTERAKT_API_KEY)   ← optional
 * With no provider configured, messages are logged (dev mode) and the
 * apps fall back to opening WhatsApp on the user's device (wa.me link).
 */
export async function sendOtpSms(phone: string, code: string) {
  const provider = process.env.SMS_PROVIDER || "none";
  if (provider === "msg91" && process.env.MSG91_AUTH_KEY) {
    const url = `https://control.msg91.com/api/v5/otp?template_id=${process.env.MSG91_OTP_TEMPLATE_ID}&mobile=91${phone}&otp=${code}`;
    const r = await fetch(url, { method: "POST", headers: { authkey: process.env.MSG91_AUTH_KEY } });
    if (!r.ok) console.error("MSG91 OTP failed", r.status, await r.text());
    return;
  }
  console.log(`[OTP] ${phone} → ${code}`);
}

export async function sendWhatsApp(phone: string, text: string, mediaUrl?: string) {
  const provider = process.env.WHATSAPP_PROVIDER || "none";
  if (provider === "interakt" && process.env.INTERAKT_API_KEY) {
    // Interakt needs approved templates for business-initiated messages;
    // wire template names here once approved.
    console.log(`[WA:interakt] ${phone}: ${text}`);
    return { sent: true };
  }
  console.log(`[WA] ${phone}: ${text}${mediaUrl ? " " + mediaUrl : ""}`);
  return { sent: false, waLink: waLink(phone, text) };
}

export const waLink = (phone: string | null | undefined, text: string) =>
  `https://wa.me/${phone ? "91" + String(phone).replace(/\D/g, "").slice(-10) : ""}?text=${encodeURIComponent(text)}`;
