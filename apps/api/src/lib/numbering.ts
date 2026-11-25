import { sql } from "drizzle-orm";
import type { DbOrTx } from "../db/index.js";
import { istParts, fyRange } from "./util.js";

/** Atomically increments a per-business counter and returns the new value. */
export async function nextSeq(tx: DbOrTx, businessId: string, key: string) {
  const r = await tx.execute(sql`
    insert into counters (business_id, key, value) values (${businessId}, ${key}, 1)
    on conflict (business_id, key) do update set value = counters.value + 1
    returning value`);
  return Number((r.rows[0] as any).value);
}

const pad = (n: number, w = 4) => String(n).padStart(w, "0");

/**
 * Document numbers, FY-wise sequence:
 *  INVOICE GST → INV-2611-0483 (prefix from settings + YYMM + seq)
 *  INVOICE NON_GST → NG-2611-0081 · QUOTATION → QT-0042 · PURCHASE → PUR-0214
 *  RECEIPT → RCPT-2611-0219 · PAYMENT OUT → PAY-2611-0012
 */
export async function nextDocNumber(tx: DbOrTx, businessId: string, type: string, opts: { prefix?: string; date?: Date } = {}) {
  const d = opts.date || new Date();
  const fy = fyRange(d).startY;
  const { y, m } = istParts(d);
  const yymm = `${String(y).slice(2)}${String(m + 1).padStart(2, "0")}`;
  const seq = await nextSeq(tx, businessId, `${type}:${fy}`);
  switch (type) {
    case "INVOICE": return `${opts.prefix || "INV-"}${yymm}-${pad(seq)}`;
    case "NON_GST": return `NG-${yymm}-${pad(seq)}`;
    case "QUOTATION": return `QT-${pad(seq)}`;
    case "CREDIT_NOTE": return `CN-${yymm}-${pad(seq)}`;
    case "DELIVERY_CHALLAN": return `DC-${pad(seq)}`;
    case "PROFORMA": return `PI-${pad(seq)}`;
    case "PURCHASE": return `PUR-${pad(seq)}`;
    case "RECEIPT": return `RCPT-${yymm}-${pad(seq)}`;
    case "PAYOUT": return `PAY-${yymm}-${pad(seq)}`;
    default: return `${type}-${pad(seq)}`;
  }
}
