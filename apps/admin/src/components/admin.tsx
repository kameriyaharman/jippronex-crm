"use client";
import { useState } from "react";
import { Copy, MessageCircle, Mail, MessageSquare, CircleCheck } from "lucide-react";
import QRCode from "qrcode";
import { useEffect } from "react";
import { inr } from "@/lib/api";
import { Modal, cx, useToast } from "./ui";

const PLAN_STYLE: Record<string, string> = { SMART: "bg-brand-50 text-brand", BILLING_INV: "bg-brand-50 text-brand", COMPLETE: "bg-violet-50 text-violet-600" };
export function PlanBadge({ code, name }: { code?: string | null; name?: string | null }) {
  if (!name) return <span className="text-faint">—</span>;
  return <span className={cx("pill rounded-md", PLAN_STYLE[code || ""] || "bg-canvas text-muted")}>{name}</span>;
}

const ST: Record<string, [string, string]> = {
  ACTIVE: ["bg-ok-50 text-ok", "Active"], TRIAL: ["bg-brand-50 text-brand", "Trial"], EXPIRING: ["bg-warn-50 text-warn", "Expiring"],
  EXPIRED: ["bg-bad-50 text-bad", "Expired"], FAILED: ["bg-bad-50 text-bad", "Failed"], SUSPENDED: ["bg-canvas text-muted", "Suspended"], PENDING: ["bg-canvas text-muted", "Pending payment"],
};
export function CustStatus({ status, daysLeft }: { status: string; daysLeft?: number | null }) {
  const [c, l] = ST[status] || ["bg-canvas text-muted", status];
  return <span className={cx("pill", c)}><span className="size-1.5 rounded-full bg-current opacity-70" />{status === "EXPIRING" && daysLeft != null ? `Expires ${daysLeft} d` : l}</span>;
}

export function sellerName(s?: { name: string; type: string } | null) {
  if (!s) return "Direct · Website";
  return s.type === "PARTNER" ? `Partner · ${s.name}` : s.type === "DIRECT" ? `Direct · ${s.name}` : `${s.name} (sales)`;
}

/** Shown after creating a payment link / renewal link */
export function LinkResult({ data, onClose }: { data: any; onClose: () => void }) {
  const toast = useToast();
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => { if (data?.url) QRCode.toDataURL(data.url, { margin: 1, width: 200 }).then(setQr); }, [data]);
  if (!data) return null;
  const paid = data.status === "TO_DEPOSIT" || data.status === "CAPTURED";
  return (
    <Modal open onClose={onClose} title={paid ? "Sale recorded ✓" : "Payment link ready"}>
      {paid ? <div className="text-center py-4"><CircleCheck className="size-12 text-ok mx-auto" /><div className="font-bold mt-2">Account activated</div><div className="text-sm text-muted">{inr(data.amount)} recorded as cash/bank — mark deposited from Payments.</div></div> : <>
        <div className="text-center"><div className="text-sm text-muted">Customer pays</div><div className="text-3xl font-extrabold">{inr(data.amount)}</div></div>
        {qr && <img src={qr} alt="QR" className="size-40 mx-auto my-3" />}
        <div className="flex items-center gap-2 rounded-xl bg-canvas px-3 py-2.5 font-mono text-sm"><span className="flex-1 truncate">{data.url}</span>
          <button className="btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(data.url); toast("Link copied"); }}><Copy className="size-4" /></button></div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <a className="btn-wa" href={data.whatsapp} target="_blank" rel="noreferrer"><MessageCircle className="size-4" />WhatsApp</a>
          <a className="btn-outline" href={data.email}><Mail className="size-4" />Email</a>
          <a className="btn-outline" href={data.sms}><MessageSquare className="size-4" />SMS</a>
        </div>
        <p className="text-xs text-muted text-center mt-3">Account activates automatically when payment is received.</p>
      </>}
    </Modal>
  );
}
