"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Printer, Smartphone } from "lucide-react";
import { API_URL, inr } from "@/lib/api";
import { InvoiceDoc } from "@/components/InvoiceDoc";
import { Loading } from "@/components/ui";

/** Public bill link shared on WhatsApp (no login) */
export default function SharedInvoice() {
  const { token } = useParams<{ token: string }>();
  const [inv, setInv] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${API_URL}/public/invoice/${token}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setInv(j); }).catch((e) => setErr(e.message));
  }, [token]);
  if (err) return <div className="p-10 text-center text-muted">{err}</div>;
  if (!inv) return <Loading />;
  return (
    <div className="min-h-screen py-6 px-3">
      <div className="max-w-[794px] mx-auto flex flex-wrap gap-2 justify-between items-center mb-4 no-print">
        <div className="font-bold">{inv.business.name} · {inv.number}</div>
        <div className="flex gap-2">
          {inv.upiLink && <a href={inv.upiLink} className="btn-primary"><Smartphone className="size-4" />Pay {inr(inv.balance)} by UPI</a>}
          <button className="btn-outline" onClick={() => window.print()}><Printer className="size-4" />Download PDF</button>
        </div>
      </div>
      <div className="overflow-x-auto"><InvoiceDoc inv={inv} /></div>
    </div>
  );
}
