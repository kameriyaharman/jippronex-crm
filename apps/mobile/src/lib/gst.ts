export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type LineInput = { qty: number; rate: number; discountPct?: number; gstRate?: number };
export type LineCalc = {
  gross: number; discount: number; taxable: number;
  cgst: number; sgst: number; igst: number; tax: number; amount: number;
};

/**
 * One invoice line. Matches the design:
 *  Atta 10 × 420, 2% disc, 5% GST → taxable 4116.00, CGST 102.90, SGST 102.90, amount 4321.80
 */
export function calcLine(l: LineInput, interState: boolean, gstApplies = true): LineCalc {
  const gross = r2(l.qty * l.rate);
  const discount = r2(gross * (l.discountPct || 0) / 100);
  const taxable = r2(gross - discount);
  const rate = gstApplies ? l.gstRate || 0 : 0;
  let cgst = 0, sgst = 0, igst = 0;
  if (interState) igst = r2(taxable * rate / 100);
  else { cgst = r2(taxable * rate / 200); sgst = cgst; }
  const tax = r2(cgst + sgst + igst);
  return { gross, discount, taxable, cgst, sgst, igst, tax, amount: r2(taxable + tax) };
}

export function calcDoc(lines: LineInput[], interState: boolean, gstApplies = true, extraDiscount = 0) {
  const calc = lines.map((l) => calcLine(l, interState, gstApplies));
  const sum = (k: keyof LineCalc) => r2(calc.reduce((s, c) => s + c[k], 0));
  const subtotal = sum("gross");
  const lineDiscount = sum("discount");
  const taxable = r2(sum("taxable") - extraDiscount);
  const cgst = sum("cgst"), sgst = sum("sgst"), igst = sum("igst");
  const exact = r2(taxable + cgst + sgst + igst);
  const total = Math.round(exact);
  const roundOff = r2(total - exact);
  // rate-wise summary (HSN tax table)
  const byRate = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  lines.forEach((l, i) => {
    const rate = gstApplies ? l.gstRate || 0 : 0;
    const e = byRate.get(rate) || { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    e.taxable = r2(e.taxable + calc[i].taxable); e.cgst = r2(e.cgst + calc[i].cgst);
    e.sgst = r2(e.sgst + calc[i].sgst); e.igst = r2(e.igst + calc[i].igst);
    byRate.set(rate, e);
  });
  return {
    lines: calc, subtotal, discount: r2(lineDiscount + extraDiscount), taxable,
    cgst, sgst, igst, roundOff, total,
    taxSummary: [...byRate.values()].sort((a, b) => a.rate - b.rate),
  };
}

export const GST_STATES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand",
  "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
  "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya",
  "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
  "24": "Gujarat", "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa",
  "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar",
  "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};
export const stateFromGstin = (g?: string | null) => (g && /^\d{2}/.test(g) ? g.slice(0, 2) : null);
