"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { inr, inr2, dt, qty, tm } from "@/lib/api";
import { cx } from "./ui";

export type DocOptions = { logo: boolean; hsn: boolean; bank: boolean; qr: boolean; signature: boolean };
export const defaultOptions: DocOptions = { logo: true, hsn: true, bank: true, qr: true, signature: true };

const TITLE: Record<string, string> = { INVOICE: "TAX INVOICE", QUOTATION: "QUOTATION / ESTIMATE", CREDIT_NOTE: "CREDIT NOTE", DELIVERY_CHALLAN: "DELIVERY CHALLAN", PROFORMA: "PROFORMA INVOICE" };

function useQr(text: string | null) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { if (text) QRCode.toDataURL(text, { margin: 0, width: 220 }).then(setSrc); else setSrc(null); }, [text]);
  return src;
}

/** Picks the right layout: Non-GST → cash memo (A5), thermal → 3" receipt, else A4 tax invoice */
export function InvoiceDoc({ inv, format, template = "MODERN", options = defaultOptions }: { inv: any; format?: string; template?: string; options?: DocOptions }) {
  const f = format || inv.printFormat || "A4";
  if (f === "THERMAL") return <Thermal inv={inv} />;
  if (inv.billType === "NON_GST" || f === "A5") return <CashMemo inv={inv} />;
  return <TaxInvoice inv={inv} template={template} o={options} />;
}

function TaxInvoice({ inv, template, o }: { inv: any; template: string; o: DocOptions }) {
  const b = inv.business;
  const qr = useQr(o.qr ? inv.upiLink : null);
  const classic = template === "CLASSIC";
  const head = classic ? "bg-ink" : "bg-brand";
  const igst = inv.interState;
  const isInvoice = inv.kind === "INVOICE";
  return (
    <div className="print-area bg-white w-[794px] max-w-full mx-auto shadow-xl rounded-sm p-10 text-[11px] leading-snug text-ink">
      <div className="flex justify-between gap-6">
        <div className="flex gap-3">
          {o.logo && (b.logoUrl ? <img src={b.logoUrl} alt="" className="size-14 rounded-xl object-contain" /> :
            <div className={cx("size-14 rounded-xl text-white grid place-items-center text-xl font-extrabold", head)}>{b.name.split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("")}</div>)}
          <div>
            <div className={cx("text-xl font-extrabold tracking-wide", classic ? "text-ink" : "text-brand")}>{b.name.toUpperCase()}</div>
            <div>{b.address}{b.pincode ? ` – ${b.pincode}` : ""}</div>
            <div>Ph: {b.phone}{b.email ? ` · ${b.email}` : ""}</div>
            {b.gstin && <div className="font-bold">GSTIN: {b.gstin} · State: {b.state} ({b.stateCode})</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-extrabold">{TITLE[inv.kind]}</div>
          {isInvoice && <div className="inline-block mt-1 border border-brand text-brand rounded px-2 py-0.5 text-[9px] font-bold">ORIGINAL FOR RECIPIENT</div>}
          {inv.cancelled && <div className="mt-1 text-bad font-extrabold text-base">CANCELLED</div>}
        </div>
      </div>
      <div className={cx("h-[3px] my-4 rounded", head)} />
      <div className="grid grid-cols-3 gap-5">
        <div>
          <div className="text-[9px] font-bold text-muted tracking-widest mb-1">BILL TO</div>
          <div className="font-bold text-[12px]">{inv.customerName}</div>
          {inv.party?.address && <div>{inv.party.address}{inv.party.city ? `, ${inv.party.city}` : ""}</div>}
          {inv.customerPhone && <div>Ph: +91 {inv.customerPhone}</div>}
          {inv.party?.gstin && <div className="font-bold">GSTIN: {inv.party.gstin}</div>}
        </div>
        <div>
          {(inv.shipTo || inv.party?.shipToAddress || inv.transport) && <>
            <div className="text-[9px] font-bold text-muted tracking-widest mb-1">SHIP TO</div>
            <div>{inv.shipTo || inv.party?.shipToAddress || inv.customerName}</div>
            {inv.transport && <div>Transport: {inv.transport}</div>}
            {inv.ewayBill && <div>E-way bill: {inv.ewayBill}</div>}
          </>}
        </div>
        <div className="bg-canvas rounded-lg p-3 space-y-0.5">
          <KV k={inv.kind === "QUOTATION" ? "Quotation no." : "Invoice no."} v={inv.number} bold />
          <KV k="Date" v={dt(inv.date)} />
          {inv.dueDate && <KV k="Due date" v={dt(inv.dueDate)} />}
          {inv.validTill && <KV k="Valid till" v={dt(inv.validTill)} />}
          <KV k="Place of supply" v={`${inv.placeOfSupplyName} (${inv.placeOfSupply})`} />
          <KV k="Reverse charge" v="No" />
        </div>
      </div>
      <table className="w-full mt-5 border-collapse">
        <thead><tr className={cx("text-white text-[9.5px]", head)}>
          {["#", "ITEM", o.hsn ? "HSN" : "", "QTY", "RATE", "DISC", "TAXABLE", ...(igst ? ["IGST"] : ["CGST", "SGST"]), "AMOUNT"].filter((x) => x !== "").map((h, i) =>
            <th key={h} className={cx("px-2 py-2 font-bold", i <= 1 ? "text-left" : "text-right")}>{h}</th>)}
        </tr></thead>
        <tbody>
          {inv.items.map((it: any, i: number) => (
            <tr key={it.id} className="border-b border-line align-top">
              <td className="px-2 py-2">{i + 1}</td>
              <td className="px-2 py-2 font-semibold">{it.name}</td>
              {o.hsn && <td className="px-2 py-2 text-right">{it.hsn}</td>}
              <td className="px-2 py-2 text-right">{qty(it.qty)} {it.unit[0].toUpperCase() + it.unit.slice(1)}</td>
              <td className="px-2 py-2 text-right">{inr2(it.rate)}</td>
              <td className="px-2 py-2 text-right">{it.discountPct}%</td>
              <td className="px-2 py-2 text-right">{inr2(it.taxable)}</td>
              {igst ? <td className="px-2 py-2 text-right">{it.gstRate}%<div className="text-muted">{inr2(it.igst)}</div></td> : <>
                <td className="px-2 py-2 text-right">{it.gstRate / 2}%<div className="text-muted">{inr2(it.cgst)}</div></td>
                <td className="px-2 py-2 text-right">{it.gstRate / 2}%<div className="text-muted">{inr2(it.sgst)}</div></td></>}
              <td className="px-2 py-2 text-right font-semibold">{inr2(it.amount)}</td>
            </tr>
          ))}
          <tr className="bg-canvas font-bold">
            <td className="px-2 py-2" colSpan={o.hsn ? 3 : 2}>Total</td>
            <td className="px-2 py-2 text-right">{qty(inv.items.reduce((s: number, x: any) => s + x.qty, 0))}</td>
            <td colSpan={2} /><td className="px-2 py-2 text-right">{inr2(inv.taxable)}</td>
            {igst ? <td className="px-2 py-2 text-right">{inr2(inv.igst)}</td> : <><td className="px-2 py-2 text-right">{inr2(inv.cgst)}</td><td className="px-2 py-2 text-right">{inr2(inv.sgst)}</td></>}
            <td className="px-2 py-2 text-right">{inr2(inv.taxable + inv.cgst + inv.sgst + inv.igst)}</td>
          </tr>
        </tbody>
      </table>
      <div className="grid grid-cols-[1fr_300px] gap-6 mt-5">
        <div>
          {o.hsn && <>
            <div className="text-[9px] font-bold text-muted tracking-widest mb-1">TAX SUMMARY (HSN RATE-WISE)</div>
            <table className="w-full border-collapse mb-4">
              <thead><tr className={cx("text-white text-[9px]", head)}>{["GST RATE", "TAXABLE", ...(igst ? ["IGST"] : ["CGST", "SGST"]), "TOTAL TAX"].map((h) => <th key={h} className="px-2 py-1.5 text-right first:text-left">{h}</th>)}</tr></thead>
              <tbody>{inv.taxSummary.map((t: any) => (
                <tr key={t.rate} className="border-b border-line"><td className="px-2 py-1.5">{t.rate}%</td><td className="px-2 py-1.5 text-right">{inr2(t.taxable)}</td>
                  {igst ? <td className="px-2 py-1.5 text-right">{inr2(t.igst)}</td> : <><td className="px-2 py-1.5 text-right">{inr2(t.cgst)}</td><td className="px-2 py-1.5 text-right">{inr2(t.sgst)}</td></>}
                  <td className="px-2 py-1.5 text-right">{inr2(t.cgst + t.sgst + t.igst)}</td></tr>))}
              </tbody>
            </table>
          </>}
          <div className="text-[9px] font-bold text-muted tracking-widest">AMOUNT IN WORDS</div>
          <div className="font-bold text-[12px]">{inv.amountInWords}</div>
        </div>
        <div className="border border-line rounded-lg p-3 space-y-1">
          <KV k="Taxable amount" v={inr(inv.taxable, true)} />
          {igst ? <KV k="IGST" v={inr(inv.igst, true)} /> : <><KV k="CGST" v={inr(inv.cgst, true)} /><KV k="SGST" v={inr(inv.sgst, true)} /></>}
          <KV k="Round off" v={`${inv.roundOff >= 0 ? "+" : "−"}${inr2(Math.abs(inv.roundOff))}`} />
          <div className={cx("flex justify-between text-white rounded-md px-3 py-2 my-1.5 font-extrabold text-sm", head)}><span>GRAND TOTAL</span><span>{inr(inv.total)}</span></div>
          {isInvoice && <>
            <KV k={`Received${inv.paymentMode && inv.paymentMode !== "CREDIT" ? ` (${inv.paymentMode})` : ""}`} v={inr(inv.received, true)} tone="text-ok" />
            <KV k="Balance due" v={inr(inv.balance, true)} tone="text-bad" />
            {inv.party && <KV k="Previous balance" v={inr(inv.previousBalance, true)} />}
          </>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-5 mt-6 items-end">
        <div className="space-y-3">
          {o.bank && (b.bankName || b.upiId) && <div><div className="text-[9px] font-bold text-muted tracking-widest">BANK DETAILS</div>
            {b.bankName && <div>{b.bankName}</div>}{b.bankAccount && <div>A/c no: {b.bankAccount} · IFSC: {b.bankIfsc}</div>}{b.upiId && <div>UPI: {b.upiId}</div>}</div>}
          {b.terms && <div><div className="text-[9px] font-bold text-muted tracking-widest">TERMS & CONDITIONS</div><div className="whitespace-pre-line">{b.terms}</div></div>}
        </div>
        <div className="text-center">{qr && <><img src={qr} alt="UPI QR" className="size-20 mx-auto" /><div className="text-[9px] text-muted mt-1">Scan to pay {inr(inv.balance)}</div></>}</div>
        <div className="text-right">
          <div className="font-bold">For {b.name.toUpperCase()}</div>
          {o.signature && (b.signatureUrl ? <img src={b.signatureUrl} alt="" className="h-12 ml-auto my-1" /> : <div className="font-serif italic text-xl text-brand my-2">{(b.ownerName || "").split(" ").map((w: string, i: number) => (i === 0 ? w[0] + "." : w)).join(" ")}</div>)}
          <div className="border-t border-ink pt-1 text-muted">Authorised Signatory</div>
        </div>
      </div>
      {inv.notes && <div className="mt-4 text-muted">Note: {inv.notes}</div>}
      <div className="flex justify-between mt-6 pt-3 border-t border-line text-[9px] text-faint"><span>This is a computer generated invoice</span><span>Powered by Jippronex · jippronex.com</span></div>
    </div>
  );
}

function CashMemo({ inv }: { inv: any }) {
  const b = inv.business;
  return (
    <div className="print-area bg-white w-[560px] max-w-full mx-auto shadow-xl rounded-sm p-8 text-[11.5px] text-ink">
      <div className="text-center"><div className="text-lg font-extrabold text-brand">{b.name.toUpperCase()}</div><div>{b.address} · {b.phone}</div>
        <div className="inline-block mt-2 bg-brand text-white rounded px-3 py-1 font-bold text-[10px] tracking-widest">{inv.kind === "INVOICE" ? "BILL / CASH MEMO" : TITLE[inv.kind]}</div>
        {inv.billType === "NON_GST" && <div className="text-muted text-[10px] mt-1">Non-GST</div>}</div>
      <div className="flex justify-between mt-4 pb-3 border-b border-line">
        <div><div className="text-[9px] font-bold text-muted tracking-widest">CUSTOMER</div><div className="font-bold">{inv.customerName}</div>{inv.customerPhone && <div>Ph: {inv.customerPhone.slice(0, 2)}•••• {inv.customerPhone.slice(-4)}</div>}</div>
        <div className="text-right"><div>Bill no. <b>{inv.number}</b></div><div>Date {dt(inv.date)}, {tm(inv.date)}</div></div>
      </div>
      <table className="w-full mt-2">
        <thead><tr className="text-[9.5px] text-muted">{["#", "ITEM", "QTY", "RATE", "AMOUNT"].map((h, i) => <th key={h} className={cx("py-2", i < 2 ? "text-left" : "text-right")}>{h}</th>)}</tr></thead>
        <tbody>{inv.items.map((it: any, i: number) => (
          <tr key={it.id} className="border-b border-line"><td className="py-1.5">{i + 1}</td><td className="py-1.5">{it.name}</td><td className="py-1.5 text-right">{qty(it.qty)}</td><td className="py-1.5 text-right">{inr2(it.rate)}</td><td className="py-1.5 text-right">{inr2(it.qty * it.rate)}</td></tr>))}
        </tbody>
      </table>
      <div className="ml-auto w-60 mt-3 space-y-1">
        <KV k="Sub total" v={inr(inv.subtotal, true)} />
        {inv.discount > 0 && <KV k="Discount" v={`− ${inr(inv.discount, true)}`} />}
        {inv.cgst + inv.sgst + inv.igst > 0 && <KV k="GST" v={inr(inv.cgst + inv.sgst + inv.igst, true)} />}
        <div className="flex justify-between bg-brand text-white rounded-md px-3 py-1.5 font-extrabold"><span>TOTAL</span><span>{inr(inv.total)}</span></div>
        <KV k={`Paid · ${inv.paymentMode && inv.paymentMode !== "CREDIT" ? inv.paymentMode[0] + inv.paymentMode.slice(1).toLowerCase() : "—"}`} v={inr(inv.received)} tone="text-ok" />
        {inv.balance > 0 && <KV k="Balance" v={inr(inv.balance)} tone="text-bad" />}
      </div>
      <div className="mt-3"><div className="text-[9px] font-bold text-muted tracking-widest">IN WORDS</div><div className="font-bold">{inv.amountInWords}</div></div>
      <div className="flex justify-between items-end mt-8"><div className="text-muted">Thank you! Visit again.</div>
        <div className="text-center"><div className="font-serif italic text-brand text-lg">{(b.ownerName || "").split(" ").map((w: string, i: number) => (i === 0 ? w[0] + "." : w)).join(" ")}</div><div className="border-t border-ink text-muted px-6">Signature</div></div></div>
    </div>
  );
}

function Thermal({ inv }: { inv: any }) {
  const b = inv.business;
  const line = "-".repeat(32);
  return (
    <div className="print-area bg-white w-[300px] mx-auto shadow-xl p-4 font-mono text-[11px] leading-tight text-black">
      <div className="text-center font-bold text-[13px]">{b.name.toUpperCase()}</div>
      <div className="text-center">{b.city || b.address} · Ph {b.phone}</div>
      {b.gstin && inv.billType === "GST" && <div className="text-center">GSTIN {b.gstin}</div>}
      <div>{line}</div>
      <div>Bill {inv.number}</div><div>Date {dt(inv.date, { day: "2-digit", month: "2-digit", year: "2-digit" })} {tm(inv.date)}</div>
      {inv.party && <div>To: {inv.customerName}</div>}
      <div>{line}</div>
      {inv.items.map((it: any) => (
        <div key={it.id} className="flex justify-between gap-2"><span className="truncate">{it.name.slice(0, 16)} x{qty(it.qty)}</span><span>{inr2(it.amount)}</span></div>
      ))}
      <div>{line}</div>
      {inv.billType === "GST" && <div className="flex justify-between"><span>GST incl.</span><span>{inr2(inv.cgst + inv.sgst + inv.igst)}</span></div>}
      <div className="flex justify-between font-bold text-[13px]"><span>TOTAL</span><span>Rs {inv.total.toLocaleString("en-IN")}</span></div>
      <div className="flex justify-between"><span>Paid {inv.paymentMode && inv.paymentMode !== "CREDIT" ? inv.paymentMode[0] + inv.paymentMode.slice(1).toLowerCase() : ""}</span><span>{inv.received.toLocaleString("en-IN")}</span></div>
      {inv.balance > 0 && <div className="flex justify-between"><span>Balance</span><span>{inv.balance.toLocaleString("en-IN")}</span></div>}
      <div>{line}</div>
      <div className="text-center">Thank you · Visit again</div>
    </div>
  );
}

const KV = ({ k, v, bold, tone }: { k: string; v: string; bold?: boolean; tone?: string }) => (
  <div className="flex justify-between gap-3"><span className="text-muted">{k}</span><span className={cx("font-semibold text-right", bold && "font-extrabold", tone)}>{v}</span></div>
);
