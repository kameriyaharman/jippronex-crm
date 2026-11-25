/** HTML documents for expo-print (PDF / system print / thermal). */
const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const n2 = (n: number) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n0 = (n: number) => "₹" + Number(n).toLocaleString("en-IN");
const d = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const TITLE: Record<string, string> = { INVOICE: "TAX INVOICE", QUOTATION: "QUOTATION / ESTIMATE", CREDIT_NOTE: "CREDIT NOTE", DELIVERY_CHALLAN: "DELIVERY CHALLAN", PROFORMA: "PROFORMA INVOICE" };

export function invoiceHtml(inv: any, format: "A4" | "A5" | "THERMAL" = "A4") {
  if (format === "THERMAL") return thermalHtml(inv);
  const b = inv.business;
  const ig = inv.interState;
  const gst = inv.billType === "GST";
  const rows = inv.items.map((it: any, i: number) => `<tr><td>${i + 1}</td><td><b>${esc(it.name)}</b></td>${gst ? `<td class=r>${esc(it.hsn || "")}</td>` : ""}<td class=r>${it.qty} ${esc(it.unit)}</td><td class=r>${n2(it.rate)}</td><td class=r>${it.discountPct}%</td>
    ${gst ? (ig ? `<td class=r>${it.gstRate}%<br><small>${n2(it.igst)}</small></td>` : `<td class=r>${it.gstRate / 2}%<br><small>${n2(it.cgst)}</small></td><td class=r>${it.gstRate / 2}%<br><small>${n2(it.sgst)}</small></td>`) : ""}<td class=r><b>${n2(it.amount)}</b></td></tr>`).join("");
  const taxRows = inv.taxSummary.map((t: any) => `<tr><td>${t.rate}%</td><td class=r>${n2(t.taxable)}</td>${ig ? `<td class=r>${n2(t.igst)}</td>` : `<td class=r>${n2(t.cgst)}</td><td class=r>${n2(t.sgst)}</td>`}<td class=r>${n2(t.cgst + t.sgst + t.igst)}</td></tr>`).join("");
  const size = format === "A5" ? "A5" : "A4";
  return `<!doctype html><html><head><meta charset=utf-8><style>
  @page{size:${size};margin:10mm} body{font-family:Helvetica,Arial,sans-serif;color:#1b1d3a;font-size:${size === "A5" ? 9 : 10.5}px}
  .top{display:flex;justify-content:space-between} .nm{font-size:18px;font-weight:800;color:#0b46c4} h1{margin:0;font-size:17px}
  .bar{height:3px;background:#0b46c4;margin:10px 0;border-radius:2px} table{width:100%;border-collapse:collapse;margin-top:10px}
  th{background:#0b46c4;color:#fff;font-size:9px;padding:6px;text-align:left} td{padding:5px 6px;border-bottom:1px solid #e6e7f0;vertical-align:top} .r{text-align:right}
  .grid{display:flex;gap:16px;margin-top:10px} .box{background:#f5f7fb;border-radius:8px;padding:8px;flex:1} small{color:#6b7090} .lab{font-size:8px;font-weight:700;color:#6b7090;letter-spacing:1px}
  .tot{margin-left:auto;width:260px;margin-top:10px} .tot div{display:flex;justify-content:space-between;padding:2px 0} .gt{background:#0b46c4;color:#fff;border-radius:6px;padding:6px 8px!important;font-weight:800;font-size:13px}
  </style></head><body>
  <div class=top><div><div class=nm>${esc(b.name.toUpperCase())}</div><div>${esc(b.address || "")}</div><div>Ph: ${esc(b.phone || "")}</div>${b.gstin && gst ? `<div><b>GSTIN: ${esc(b.gstin)}</b> · State: ${esc(b.state || "")} (${esc(b.stateCode)})</div>` : ""}</div>
  <div style="text-align:right"><h1>${inv.billType === "NON_GST" && inv.kind === "INVOICE" ? "BILL / CASH MEMO" : TITLE[inv.kind]}</h1><div>${esc(inv.number)}</div><div>${d(inv.date)}</div>${inv.dueDate ? `<div>Due ${d(inv.dueDate)}</div>` : ""}</div></div>
  <div class=bar></div>
  <div class=grid><div class=box><div class=lab>BILL TO</div><b>${esc(inv.customerName)}</b>${inv.party?.address ? `<div>${esc(inv.party.address)}</div>` : ""}${inv.party?.gstin ? `<div><b>GSTIN: ${esc(inv.party.gstin)}</b></div>` : ""}</div>
  ${gst ? `<div class=box><div class=lab>PLACE OF SUPPLY</div>${esc(inv.placeOfSupplyName)} (${esc(inv.placeOfSupply)})${inv.transport ? `<div>Transport: ${esc(inv.transport)}</div>` : ""}${inv.ewayBill ? `<div>E-way: ${esc(inv.ewayBill)}</div>` : ""}</div>` : ""}</div>
  <table><tr><th>#</th><th>ITEM</th>${gst ? "<th class=r>HSN</th>" : ""}<th class=r>QTY</th><th class=r>RATE</th><th class=r>DISC</th>${gst ? (ig ? "<th class=r>IGST</th>" : "<th class=r>CGST</th><th class=r>SGST</th>") : ""}<th class=r>AMOUNT</th></tr>${rows}</table>
  ${gst ? `<table style="width:55%"><tr><th>GST RATE</th><th class=r>TAXABLE</th>${ig ? "<th class=r>IGST</th>" : "<th class=r>CGST</th><th class=r>SGST</th>"}<th class=r>TOTAL TAX</th></tr>${taxRows}</table>` : ""}
  <div class=tot>
    <div><span>Taxable amount</span><span>₹${n2(inv.taxable)}</span></div>
    ${gst ? (ig ? `<div><span>IGST</span><span>₹${n2(inv.igst)}</span></div>` : `<div><span>CGST</span><span>₹${n2(inv.cgst)}</span></div><div><span>SGST</span><span>₹${n2(inv.sgst)}</span></div>`) : ""}
    <div><span>Round off</span><span>${inv.roundOff >= 0 ? "+" : "−"}${n2(Math.abs(inv.roundOff))}</span></div>
    <div class=gt><span>GRAND TOTAL</span><span>${n0(inv.total)}</span></div>
    ${inv.kind === "INVOICE" ? `<div><span>Received</span><span style="color:#15803d">₹${n2(inv.received)}</span></div><div><span>Balance due</span><span style="color:#dc2626">₹${n2(inv.balance)}</span></div>` : ""}
  </div>
  <div><div class=lab>AMOUNT IN WORDS</div><b>${esc(inv.amountInWords)}</b></div>
  <div style="display:flex;justify-content:space-between;margin-top:24px"><div>${b.bankName ? `<div class=lab>BANK DETAILS</div><div>${esc(b.bankName)}</div><div>A/c ${esc(b.bankAccount || "")} · IFSC ${esc(b.bankIfsc || "")}</div>` : ""}${b.upiId ? `<div>UPI: ${esc(b.upiId)}</div>` : ""}<div style="white-space:pre-line;margin-top:6px">${esc(b.terms || "")}</div></div>
  <div style="text-align:right"><b>For ${esc(b.name.toUpperCase())}</b><div style="height:40px"></div><div style="border-top:1px solid #1b1d3a;padding-top:3px;color:#6b7090">Authorised Signatory</div></div></div>
  <div style="margin-top:16px;color:#9a9db5;font-size:8px;display:flex;justify-content:space-between"><span>This is a computer generated invoice</span><span>Powered by JipproBill · jippronex.com</span></div>
  </body></html>`;
}

export function thermalHtml(inv: any) {
  const b = inv.business;
  const line = "-".repeat(32);
  const items = inv.items.map((it: any) => `<div class=r><span>${esc(it.name.slice(0, 18))} x${it.qty}</span><span>${n2(it.amount)}</span></div>`).join("");
  return `<!doctype html><html><head><meta charset=utf-8><style>@page{size:58mm auto;margin:2mm} body{font-family:monospace;font-size:10px;width:54mm;color:#000}
  .c{text-align:center} .r{display:flex;justify-content:space-between} .b{font-weight:bold}</style></head><body>
  <div class="c b" style="font-size:12px">${esc(b.name.toUpperCase())}</div><div class=c>${esc(b.city || "")} · Ph ${esc(b.phone || "")}</div>
  ${inv.billType === "GST" && b.gstin ? `<div class=c>GSTIN ${esc(b.gstin)}</div>` : ""}<div>${line}</div>
  <div>Bill ${esc(inv.number)}</div><div>Date ${d(inv.date)}</div>${inv.partyId ? `<div>To: ${esc(inv.customerName)}</div>` : ""}<div>${line}</div>
  ${items}<div>${line}</div>
  <div class="r b" style="font-size:12px"><span>TOTAL</span><span>Rs ${inv.total.toLocaleString("en-IN")}</span></div>
  <div class=r><span>Paid ${esc(inv.paymentMode && inv.paymentMode !== "CREDIT" ? inv.paymentMode : "")}</span><span>${inv.received}</span></div>
  ${inv.balance > 0 ? `<div class=r><span>Balance</span><span>${inv.balance}</span></div>` : ""}<div>${line}</div><div class=c>Thank you · Visit again</div></body></html>`;
}
