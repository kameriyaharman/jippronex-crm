// Jippronex — single database for Business CRM, Android app and Master Admin.
// Every business-side table carries businessId (multi-tenant).
import { randomUUID } from "node:crypto";
import {
  pgTable, pgEnum, text, integer, boolean, timestamp, numeric, jsonb,
  uniqueIndex, index, primaryKey,
} from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => randomUUID());
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const qtyCol = (name: string) => numeric(name, { precision: 14, scale: 3, mode: "number" });
const rateCol = (name: string) => numeric(name, { precision: 5, scale: 2, mode: "number" });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

// ─────────────────────────── Enums ───────────────────────────
export const roleEnum = pgEnum("role", ["OWNER", "BILLING", "ACCOUNTANT", "STORE"]);
export const memberStatusEnum = pgEnum("member_status", ["ACTIVE", "INVITED", "DISABLED"]);
export const businessStatusEnum = pgEnum("business_status", ["ACTIVE", "SUSPENDED"]);
export const stockReasonEnum = pgEnum("stock_reason", ["OPENING", "SALE", "PURCHASE", "RETURN", "DAMAGE", "ADJUSTMENT", "TRANSFER", "SALE_CANCEL"]);
export const partyTypeEnum = pgEnum("party_type", ["CUSTOMER", "SUPPLIER"]);
export const docKindEnum = pgEnum("doc_kind", ["INVOICE", "QUOTATION", "CREDIT_NOTE", "DELIVERY_CHALLAN", "PROFORMA"]);
export const billTypeEnum = pgEnum("bill_type", ["GST", "NON_GST"]);
export const payStatusEnum = pgEnum("pay_status", ["PAID", "PARTIAL", "UNPAID"]);
export const payModeEnum = pgEnum("pay_mode", ["CASH", "UPI", "CARD", "BANK", "CHEQUE", "CREDIT"]);
export const directionEnum = pgEnum("direction", ["IN", "OUT"]);
export const adminRoleEnum = pgEnum("admin_role", ["SUPER_ADMIN", "SALES", "PARTNER"]);
export const sellerTypeEnum = pgEnum("seller_type", ["DIRECT", "STAFF", "PARTNER"]);
export const cycleEnum = pgEnum("cycle", ["TRIAL", "MONTHLY", "YEARLY", "TWO_YEAR", "LIFETIME"]);
export const subStatusEnum = pgEnum("sub_status", ["TRIAL", "PENDING_PAYMENT", "ACTIVE", "FAILED", "EXPIRED", "SUSPENDED", "CANCELLED"]);
export const couponTypeEnum = pgEnum("coupon_type", ["PERCENT", "FLAT"]);
export const subPayPurposeEnum = pgEnum("sub_pay_purpose", ["NEW_SALE", "RENEWAL", "UPGRADE", "EXTRA_USER", "REFUND"]);
export const subPayStatusEnum = pgEnum("sub_pay_status", ["CREATED", "CAPTURED", "FAILED", "REFUNDED", "TO_DEPOSIT"]);

// ─────────────────────────── Identity ───────────────────────────
export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(), // 10-digit login id
  email: text("email").unique(),
  lastLoginAt: ts("last_login_at"),
  lastLoginVia: text("last_login_via"),
  createdAt: createdAt(),
});

export const memberships = pgTable("memberships", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull().default("OWNER"),
  status: memberStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("membership_user_business").on(t.userId, t.businessId)]);

export const otps = pgTable("otps", {
  id: id(),
  phone: text("phone").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: ts("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
}, (t) => [index("otp_phone").on(t.phone)]);

export type Preferences = {
  allowZeroStockBilling?: boolean;
  lowStockWhatsapp?: boolean;
  sendInvoiceWhatsapp?: boolean;
  dailySummary?: boolean;
  autoBackup?: boolean;
  showMrp?: boolean;
  printer?: string;
};

export const businesses = pgTable("businesses", {
  id: id(),
  code: text("code").notNull().unique(), // JX-C-00214
  name: text("name").notNull(),
  ownerName: text("owner_name"),
  phone: text("phone"),
  email: text("email"),
  gstin: text("gstin"),
  businessType: text("business_type"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  stateCode: text("state_code").notNull().default("19"),
  pincode: text("pincode"),
  logoUrl: text("logo_url"),
  signatureUrl: text("signature_url"),
  invoicePrefix: text("invoice_prefix").notNull().default("INV-"),
  bankName: text("bank_name"),
  bankAccount: text("bank_account"),
  bankIfsc: text("bank_ifsc"),
  upiId: text("upi_id"),
  terms: text("terms").default("1. Goods once sold will not be taken back.\n2. Interest @18% p.a. after due date."),
  invoiceTemplate: text("invoice_template").notNull().default("MODERN"),
  preferences: jsonb("preferences").$type<Preferences>().notNull().default({}),
  status: businessStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: createdAt(),
});

export const counters = pgTable("counters", {
  businessId: text("business_id").notNull(),
  key: text("key").notNull(),
  value: integer("value").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.businessId, t.key] })]);

// ─────────────────────────── Inventory ───────────────────────────
export const categories = pgTable("categories", {
  id: id(),
  businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
}, (t) => [uniqueIndex("category_business_name").on(t.businessId, t.name)]);

export const products = pgTable("products", {
  id: id(),
  businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  barcode: text("barcode"),
  hsn: text("hsn"),
  unit: text("unit").notNull().default("pcs"),
  purchaseRate: money("purchase_rate").notNull().default(0),
  saleRate: money("sale_rate").notNull().default(0),
  mrp: money("mrp"),
  gstRate: rateCol("gst_rate").notNull().default(0),
  stock: qtyCol("stock").notNull().default(0),
  minStock: qtyCol("min_stock").notNull().default(0),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("product_business_barcode").on(t.businessId, t.barcode),
  index("product_business_name").on(t.businessId, t.name),
]);

export const stockMovements = pgTable("stock_movements", {
  id: id(),
  businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  reason: stockReasonEnum("reason").notNull(),
  qty: qtyCol("qty").notNull(), // signed
  balanceAfter: qtyCol("balance_after").notNull(),
  refType: text("ref_type"),
  refId: text("ref_id"),
  refNo: text("ref_no"),
  note: text("note"),
  userId: text("user_id"),
  createdAt: createdAt(),
}, (t) => [
  index("movement_business_date").on(t.businessId, t.createdAt),
  index("movement_product_date").on(t.productId, t.createdAt),
]);

// ─────────────────────────── Parties ───────────────────────────
export const parties = pgTable("parties", {
  id: id(),
  businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  type: partyTypeEnum("type").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  gstin: text("gstin"),
  address: text("address"),
  city: text("city"),
  stateCode: text("state_code"),
  shipToAddress: text("ship_to_address"),
  creditLimit: money("credit_limit"),
  // Sign convention: + receivable (Dr, they owe us) / − payable (Cr, we owe them)
  openingBalance: money("opening_balance").notNull().default(0),
  balance: money("balance").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [index("party_business_type").on(t.businessId, t.type)]);

// ─────────────────────────── Sales ───────────────────────────
export const invoices = pgTable("invoices", {
  id: id(),
  businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  kind: docKindEnum("kind").notNull().default("INVOICE"),
  billType: billTypeEnum("bill_type").notNull().default("GST"),
  number: text("number").notNull(),
  date: ts("date").notNull().defaultNow(),
  dueDate: ts("due_date"),
  validTill: ts("valid_till"),
  partyId: text("party_id").references(() => parties.id),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  placeOfSupply: text("place_of_supply").notNull().default("19"),
  interState: boolean("inter_state").notNull().default(false),
  subtotal: money("subtotal").notNull().default(0),
  discount: money("discount").notNull().default(0),
  taxable: money("taxable").notNull().default(0),
  cgst: money("cgst").notNull().default(0),
  sgst: money("sgst").notNull().default(0),
  igst: money("igst").notNull().default(0),
  roundOff: money("round_off").notNull().default(0),
  total: money("total").notNull().default(0),
  received: money("received").notNull().default(0),
  balance: money("balance").notNull().default(0),
  costTotal: money("cost_total").notNull().default(0),
  status: payStatusEnum("status").notNull().default("UNPAID"),
  paymentMode: payModeEnum("payment_mode"),
  transport: text("transport"),
  ewayBill: text("eway_bill"),
  notes: text("notes"),
  shipTo: text("ship_to"),
  printFormat: text("print_format").notNull().default("A4"),
  cancelled: boolean("cancelled").notNull().default(false),
  convertedToId: text("converted_to_id"),
  shareToken: text("share_token").notNull().$defaultFn(() => randomUUID().replace(/-/g, "").slice(0, 16)),
  createdById: text("created_by_id"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("invoice_business_number").on(t.businessId, t.number),
  index("invoice_business_kind_date").on(t.businessId, t.kind, t.date),
  uniqueIndex("invoice_share_token").on(t.shareToken),
]);

export const invoiceItems = pgTable("invoice_items", {
  id: id(),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
  sort: integer("sort").notNull().default(0),
  name: text("name").notNull(),
  hsn: text("hsn"),
  unit: text("unit").notNull().default("pcs"),
  qty: qtyCol("qty").notNull(),
  rate: money("rate").notNull(),
  discountPct: rateCol("discount_pct").notNull().default(0),
  gstRate: rateCol("gst_rate").notNull().default(0),
  taxable: money("taxable").notNull(),
  cgst: money("cgst").notNull().default(0),
  sgst: money("sgst").notNull().default(0),
  igst: money("igst").notNull().default(0),
  amount: money("amount").notNull(),
  costRate: money("cost_rate").notNull().default(0),
});

// ─────────────────────────── Purchases ───────────────────────────
export const purchases = pgTable("purchases", {
  id: id(),
  businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  number: text("number").notNull(),
  supplierId: text("supplier_id").notNull().references(() => parties.id),
  supplierBillNo: text("supplier_bill_no"),
  date: ts("date").notNull().defaultNow(),
  dueDate: ts("due_date"),
  interState: boolean("inter_state").notNull().default(false),
  taxable: money("taxable").notNull().default(0),
  cgst: money("cgst").notNull().default(0),
  sgst: money("sgst").notNull().default(0),
  igst: money("igst").notNull().default(0),
  roundOff: money("round_off").notNull().default(0),
  total: money("total").notNull().default(0),
  paid: money("paid").notNull().default(0),
  balance: money("balance").notNull().default(0),
  status: payStatusEnum("status").notNull().default("UNPAID"),
  notes: text("notes"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("purchase_business_number").on(t.businessId, t.number),
  index("purchase_business_date").on(t.businessId, t.date),
]);

export const purchaseItems = pgTable("purchase_items", {
  id: id(),
  purchaseId: text("purchase_id").notNull().references(() => purchases.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => products.id),
  name: text("name").notNull(),
  hsn: text("hsn"),
  unit: text("unit").notNull().default("pcs"),
  qty: qtyCol("qty").notNull(),
  rate: money("rate").notNull(),
  gstRate: rateCol("gst_rate").notNull().default(0),
  taxable: money("taxable").notNull(),
  tax: money("tax").notNull().default(0),
  amount: money("amount").notNull(),
});

// ─────────────────────────── Money ───────────────────────────
export const payments = pgTable("payments", {
  id: id(),
  businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  number: text("number").notNull(),
  direction: directionEnum("direction").notNull(),
  partyId: text("party_id").references(() => parties.id),
  amount: money("amount").notNull(),
  mode: payModeEnum("mode").notNull(),
  account: text("account"),
  reference: text("reference"),
  note: text("note"),
  date: ts("date").notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("payment_business_number").on(t.businessId, t.number),
  index("payment_business_date").on(t.businessId, t.date),
]);

export const paymentAllocations = pgTable("payment_allocations", {
  id: id(),
  paymentId: text("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
  invoiceId: text("invoice_id").references(() => invoices.id, { onDelete: "cascade" }),
  purchaseId: text("purchase_id").references(() => purchases.id, { onDelete: "cascade" }),
  amount: money("amount").notNull(),
});

export const expenses = pgTable("expenses", {
  id: id(),
  businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  date: ts("date").notNull().defaultNow(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  amount: money("amount").notNull(),
  mode: payModeEnum("mode").notNull().default("CASH"),
  account: text("account"),
  attachmentUrl: text("attachment_url"),
  createdAt: createdAt(),
}, (t) => [index("expense_business_date").on(t.businessId, t.date)]);

// ─────────────────────────── Master Admin (SaaS) ───────────────────────────
export const sellers = pgTable("sellers", {
  id: id(),
  name: text("name").notNull(),
  type: sellerTypeEnum("type").notNull(),
  city: text("city"),
  phone: text("phone"),
  commissionPct: rateCol("commission_pct").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const adminUsers = pgTable("admin_users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: adminRoleEnum("role").notNull().default("SUPER_ADMIN"),
  sellerId: text("seller_id").references(() => sellers.id),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const commissionPayouts = pgTable("commission_payouts", {
  id: id(),
  sellerId: text("seller_id").notNull().references(() => sellers.id),
  amount: money("amount").notNull(),
  note: text("note"),
  paidAt: ts("paid_at").notNull().defaultNow(),
});

export type PlanFeatures = {
  billing?: boolean; whatsapp?: boolean; ledger?: boolean; inventory?: boolean;
  purchase?: boolean; accounts?: boolean; android?: boolean;
};

export const plans = pgTable("plans", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline"),
  monthlyPrice: money("monthly_price").notNull(),
  yearlyPrice: money("yearly_price").notNull(),
  twoYearPrice: money("two_year_price"),
  lifetimePrice: money("lifetime_price"),
  usersIncluded: integer("users_included").notNull().default(1),
  maxProducts: integer("max_products").notNull().default(5000),
  storageGb: integer("storage_gb").notNull().default(5),
  trialDays: integer("trial_days").notNull().default(7),
  features: jsonb("features").$type<PlanFeatures>().notNull().default({}),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const coupons = pgTable("coupons", {
  id: id(),
  code: text("code").notNull().unique(),
  description: text("description"),
  type: couponTypeEnum("type").notNull().default("PERCENT"),
  value: money("value").notNull(),
  maxUses: integer("max_uses"),
  used: integer("used").notNull().default(0),
  partnersOnly: boolean("partners_only").notNull().default(false),
  planCodes: jsonb("plan_codes").$type<string[]>().notNull().default([]),
  validTill: ts("valid_till"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const subscriptions = pgTable("subscriptions", {
  id: id(),
  businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull().references(() => plans.id),
  cycle: cycleEnum("cycle").notNull(),
  status: subStatusEnum("status").notNull(),
  listPrice: money("list_price").notNull(),
  price: money("price").notNull(), // selling price excl. GST
  couponId: text("coupon_id").references(() => coupons.id),
  sellerId: text("seller_id").references(() => sellers.id),
  commissionPct: rateCol("commission_pct").notNull().default(0),
  usersAllowed: integer("users_allowed").notNull().default(1),
  shops: integer("shops").notNull().default(1),
  autoRenew: boolean("auto_renew").notNull().default(false),
  startsAt: ts("starts_at").notNull(),
  endsAt: ts("ends_at"),
  remindersSent: integer("reminders_sent").notNull().default(0),
  lastReminderAt: ts("last_reminder_at"),
  createdAt: createdAt(),
}, (t) => [index("subscription_status_ends").on(t.status, t.endsAt), index("subscription_business").on(t.businessId)]);

export const customPrices = pgTable("custom_prices", {
  id: id(),
  businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull().references(() => plans.id),
  cycle: cycleEnum("cycle").notNull().default("YEARLY"),
  price: money("price").notNull(),
  extraUserPrice: money("extra_user_price"),
  validTill: ts("valid_till"), // null = lifetime
  reason: text("reason"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("custom_price_business_plan").on(t.businessId, t.planId)]);

export const subscriptionPayments = pgTable("subscription_payments", {
  id: id(),
  businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  subscriptionId: text("subscription_id").references(() => subscriptions.id),
  purpose: subPayPurposeEnum("purpose").notNull(),
  description: text("description"),
  amount: money("amount").notNull(), // incl. GST (negative for refund)
  baseAmount: money("base_amount").notNull(),
  gstAmount: money("gst_amount").notNull(),
  status: subPayStatusEnum("status").notNull().default("CREATED"),
  method: text("method"),
  gateway: text("gateway"),
  gatewayOrderId: text("gateway_order_id"),
  gatewayLinkId: text("gateway_link_id"),
  gatewayPaymentId: text("gateway_payment_id").unique(),
  linkCode: text("link_code").unique(),
  linkUrl: text("link_url"),
  collectedBy: text("collected_by"),
  invoiceNo: text("invoice_no").unique(),
  failureReason: text("failure_reason"),
  paidAt: ts("paid_at"),
  createdAt: createdAt(),
}, (t) => [index("subpay_status_created").on(t.status, t.createdAt)]);

export const gatewayConfigs = pgTable("gateway_configs", {
  id: id(),
  provider: text("provider").notNull().unique(), // razorpay | cashfree | phonepe
  mode: text("mode").notNull().default("test"),
  isPrimary: boolean("is_primary").notNull().default(false),
  connected: boolean("connected").notNull().default(false),
  keyId: text("key_id"),
  keySecret: text("key_secret"),
  webhookSecret: text("webhook_secret"),
  settlement: text("settlement"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});
