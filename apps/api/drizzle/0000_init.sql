CREATE TYPE "public"."admin_role" AS ENUM('SUPER_ADMIN', 'SALES', 'PARTNER');--> statement-breakpoint
CREATE TYPE "public"."bill_type" AS ENUM('GST', 'NON_GST');--> statement-breakpoint
CREATE TYPE "public"."business_status" AS ENUM('ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."coupon_type" AS ENUM('PERCENT', 'FLAT');--> statement-breakpoint
CREATE TYPE "public"."cycle" AS ENUM('TRIAL', 'MONTHLY', 'YEARLY', 'TWO_YEAR', 'LIFETIME');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('IN', 'OUT');--> statement-breakpoint
CREATE TYPE "public"."doc_kind" AS ENUM('INVOICE', 'QUOTATION', 'CREDIT_NOTE', 'DELIVERY_CHALLAN', 'PROFORMA');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('ACTIVE', 'INVITED', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."party_type" AS ENUM('CUSTOMER', 'SUPPLIER');--> statement-breakpoint
CREATE TYPE "public"."pay_mode" AS ENUM('CASH', 'UPI', 'CARD', 'BANK', 'CHEQUE', 'CREDIT');--> statement-breakpoint
CREATE TYPE "public"."pay_status" AS ENUM('PAID', 'PARTIAL', 'UNPAID');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('OWNER', 'BILLING', 'ACCOUNTANT', 'STORE');--> statement-breakpoint
CREATE TYPE "public"."seller_type" AS ENUM('DIRECT', 'STAFF', 'PARTNER');--> statement-breakpoint
CREATE TYPE "public"."stock_reason" AS ENUM('OPENING', 'SALE', 'PURCHASE', 'RETURN', 'DAMAGE', 'ADJUSTMENT', 'TRANSFER', 'SALE_CANCEL');--> statement-breakpoint
CREATE TYPE "public"."sub_pay_purpose" AS ENUM('NEW_SALE', 'RENEWAL', 'UPGRADE', 'EXTRA_USER', 'REFUND');--> statement-breakpoint
CREATE TYPE "public"."sub_pay_status" AS ENUM('CREATED', 'CAPTURED', 'FAILED', 'REFUNDED', 'TO_DEPOSIT');--> statement-breakpoint
CREATE TYPE "public"."sub_status" AS ENUM('TRIAL', 'PENDING_PAYMENT', 'ACTIVE', 'FAILED', 'EXPIRED', 'SUSPENDED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "admin_role" DEFAULT 'SUPER_ADMIN' NOT NULL,
	"seller_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"owner_name" text,
	"phone" text,
	"email" text,
	"gstin" text,
	"business_type" text,
	"address" text,
	"city" text,
	"state" text,
	"state_code" text DEFAULT '19' NOT NULL,
	"pincode" text,
	"logo_url" text,
	"signature_url" text,
	"invoice_prefix" text DEFAULT 'INV-' NOT NULL,
	"bank_name" text,
	"bank_account" text,
	"bank_ifsc" text,
	"upi_id" text,
	"terms" text DEFAULT '1. Goods once sold will not be taken back.
2. Interest @18% p.a. after due date.',
	"invoice_template" text DEFAULT 'MODERN' NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "business_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"seller_id" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"note" text,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"business_id" text NOT NULL,
	"key" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "counters_business_id_key_pk" PRIMARY KEY("business_id","key")
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"type" "coupon_type" DEFAULT 'PERCENT' NOT NULL,
	"value" numeric(14, 2) NOT NULL,
	"max_uses" integer,
	"used" integer DEFAULT 0 NOT NULL,
	"partners_only" boolean DEFAULT false NOT NULL,
	"plan_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"valid_till" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "custom_prices" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"cycle" "cycle" DEFAULT 'YEARLY' NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"extra_user_price" numeric(14, 2),
	"valid_till" timestamp with time zone,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"mode" "pay_mode" DEFAULT 'CASH' NOT NULL,
	"account" text,
	"attachment_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gateway_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"mode" text DEFAULT 'test' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"connected" boolean DEFAULT false NOT NULL,
	"key_id" text,
	"key_secret" text,
	"webhook_secret" text,
	"settlement" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gateway_configs_provider_unique" UNIQUE("provider")
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"product_id" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"hsn" text,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"rate" numeric(14, 2) NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT 0 NOT NULL,
	"gst_rate" numeric(5, 2) DEFAULT 0 NOT NULL,
	"taxable" numeric(14, 2) NOT NULL,
	"cgst" numeric(14, 2) DEFAULT 0 NOT NULL,
	"sgst" numeric(14, 2) DEFAULT 0 NOT NULL,
	"igst" numeric(14, 2) DEFAULT 0 NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"cost_rate" numeric(14, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"kind" "doc_kind" DEFAULT 'INVOICE' NOT NULL,
	"bill_type" "bill_type" DEFAULT 'GST' NOT NULL,
	"number" text NOT NULL,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" timestamp with time zone,
	"valid_till" timestamp with time zone,
	"party_id" text,
	"customer_name" text,
	"customer_phone" text,
	"place_of_supply" text DEFAULT '19' NOT NULL,
	"inter_state" boolean DEFAULT false NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT 0 NOT NULL,
	"discount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"taxable" numeric(14, 2) DEFAULT 0 NOT NULL,
	"cgst" numeric(14, 2) DEFAULT 0 NOT NULL,
	"sgst" numeric(14, 2) DEFAULT 0 NOT NULL,
	"igst" numeric(14, 2) DEFAULT 0 NOT NULL,
	"round_off" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"received" numeric(14, 2) DEFAULT 0 NOT NULL,
	"balance" numeric(14, 2) DEFAULT 0 NOT NULL,
	"cost_total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"status" "pay_status" DEFAULT 'UNPAID' NOT NULL,
	"payment_mode" "pay_mode",
	"transport" text,
	"eway_bill" text,
	"notes" text,
	"ship_to" text,
	"print_format" text DEFAULT 'A4' NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"converted_to_id" text,
	"share_token" text NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"business_id" text NOT NULL,
	"role" "role" DEFAULT 'OWNER' NOT NULL,
	"status" "member_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otps" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"type" "party_type" NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"gstin" text,
	"address" text,
	"city" text,
	"state_code" text,
	"ship_to_address" text,
	"credit_limit" numeric(14, 2),
	"opening_balance" numeric(14, 2) DEFAULT 0 NOT NULL,
	"balance" numeric(14, 2) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"invoice_id" text,
	"purchase_id" text,
	"amount" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"number" text NOT NULL,
	"direction" "direction" NOT NULL,
	"party_id" text,
	"amount" numeric(14, 2) NOT NULL,
	"mode" "pay_mode" NOT NULL,
	"account" text,
	"reference" text,
	"note" text,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text,
	"monthly_price" numeric(14, 2) NOT NULL,
	"yearly_price" numeric(14, 2) NOT NULL,
	"two_year_price" numeric(14, 2),
	"lifetime_price" numeric(14, 2),
	"users_included" integer DEFAULT 1 NOT NULL,
	"max_products" integer DEFAULT 5000 NOT NULL,
	"storage_gb" integer DEFAULT 5 NOT NULL,
	"trial_days" integer DEFAULT 7 NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"category_id" text,
	"name" text NOT NULL,
	"barcode" text,
	"hsn" text,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"purchase_rate" numeric(14, 2) DEFAULT 0 NOT NULL,
	"sale_rate" numeric(14, 2) DEFAULT 0 NOT NULL,
	"mrp" numeric(14, 2),
	"gst_rate" numeric(5, 2) DEFAULT 0 NOT NULL,
	"stock" numeric(14, 3) DEFAULT 0 NOT NULL,
	"min_stock" numeric(14, 3) DEFAULT 0 NOT NULL,
	"image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_items" (
	"id" text PRIMARY KEY NOT NULL,
	"purchase_id" text NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"hsn" text,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"rate" numeric(14, 2) NOT NULL,
	"gst_rate" numeric(5, 2) DEFAULT 0 NOT NULL,
	"taxable" numeric(14, 2) NOT NULL,
	"tax" numeric(14, 2) DEFAULT 0 NOT NULL,
	"amount" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"number" text NOT NULL,
	"supplier_id" text NOT NULL,
	"supplier_bill_no" text,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" timestamp with time zone,
	"inter_state" boolean DEFAULT false NOT NULL,
	"taxable" numeric(14, 2) DEFAULT 0 NOT NULL,
	"cgst" numeric(14, 2) DEFAULT 0 NOT NULL,
	"sgst" numeric(14, 2) DEFAULT 0 NOT NULL,
	"igst" numeric(14, 2) DEFAULT 0 NOT NULL,
	"round_off" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"paid" numeric(14, 2) DEFAULT 0 NOT NULL,
	"balance" numeric(14, 2) DEFAULT 0 NOT NULL,
	"status" "pay_status" DEFAULT 'UNPAID' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sellers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "seller_type" NOT NULL,
	"city" text,
	"phone" text,
	"commission_pct" numeric(5, 2) DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"product_id" text NOT NULL,
	"reason" "stock_reason" NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"balance_after" numeric(14, 3) NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"ref_no" text,
	"note" text,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"subscription_id" text,
	"purpose" "sub_pay_purpose" NOT NULL,
	"description" text,
	"amount" numeric(14, 2) NOT NULL,
	"base_amount" numeric(14, 2) NOT NULL,
	"gst_amount" numeric(14, 2) NOT NULL,
	"status" "sub_pay_status" DEFAULT 'CREATED' NOT NULL,
	"method" text,
	"gateway" text,
	"gateway_order_id" text,
	"gateway_link_id" text,
	"gateway_payment_id" text,
	"link_code" text,
	"link_url" text,
	"collected_by" text,
	"invoice_no" text,
	"failure_reason" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_payments_gateway_payment_id_unique" UNIQUE("gateway_payment_id"),
	CONSTRAINT "subscription_payments_link_code_unique" UNIQUE("link_code"),
	CONSTRAINT "subscription_payments_invoice_no_unique" UNIQUE("invoice_no")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"cycle" "cycle" NOT NULL,
	"status" "sub_status" NOT NULL,
	"list_price" numeric(14, 2) NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"coupon_id" text,
	"seller_id" text,
	"commission_pct" numeric(5, 2) DEFAULT 0 NOT NULL,
	"users_allowed" integer DEFAULT 1 NOT NULL,
	"shops" integer DEFAULT 1 NOT NULL,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"reminders_sent" integer DEFAULT 0 NOT NULL,
	"last_reminder_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"last_login_at" timestamp with time zone,
	"last_login_via" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_prices" ADD CONSTRAINT "custom_prices_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_prices" ADD CONSTRAINT "custom_prices_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_parties_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_business_name" ON "categories" USING btree ("business_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_price_business_plan" ON "custom_prices" USING btree ("business_id","plan_id");--> statement-breakpoint
CREATE INDEX "expense_business_date" ON "expenses" USING btree ("business_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_business_number" ON "invoices" USING btree ("business_id","number");--> statement-breakpoint
CREATE INDEX "invoice_business_kind_date" ON "invoices" USING btree ("business_id","kind","date");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_share_token" ON "invoices" USING btree ("share_token");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_user_business" ON "memberships" USING btree ("user_id","business_id");--> statement-breakpoint
CREATE INDEX "otp_phone" ON "otps" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "party_business_type" ON "parties" USING btree ("business_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_business_number" ON "payments" USING btree ("business_id","number");--> statement-breakpoint
CREATE INDEX "payment_business_date" ON "payments" USING btree ("business_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "product_business_barcode" ON "products" USING btree ("business_id","barcode");--> statement-breakpoint
CREATE INDEX "product_business_name" ON "products" USING btree ("business_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_business_number" ON "purchases" USING btree ("business_id","number");--> statement-breakpoint
CREATE INDEX "purchase_business_date" ON "purchases" USING btree ("business_id","date");--> statement-breakpoint
CREATE INDEX "movement_business_date" ON "stock_movements" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "movement_product_date" ON "stock_movements" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "subpay_status_created" ON "subscription_payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "subscription_status_ends" ON "subscriptions" USING btree ("status","ends_at");--> statement-breakpoint
CREATE INDEX "subscription_business" ON "subscriptions" USING btree ("business_id");