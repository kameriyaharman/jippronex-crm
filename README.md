# Jippronex

GST billing, inventory and accounts software for Indian businesses — sold as a subscription.

| App | Folder | Tech | What it is |
|---|---|---|---|
| **API** | `apps/api` | Node 22 · Express 5 · Drizzle ORM · PostgreSQL | One backend for all three apps (multi-tenant) |
| **Business CRM** | `apps/crm` | Next.js 15 · Tailwind 4 | `app.jippronex.com` — billing, stock, ledger, GST |
| **Master Admin** | `apps/admin` | Next.js 15 · Tailwind 4 | Jippronex team — customers, plans, payments, renewals |
| **Android app** | `apps/mobile` | React Native · Expo SDK 58 · Expo Router | Owner/staff app with camera barcode billing |

## Live (Railway project `jippronex`)

| Service | URL |
|---|---|
| API | https://api-production-6c83491d.up.railway.app (`/health`) |
| CRM | https://crm-production-27bc537a.up.railway.app |
| Admin | https://admin-production-b422dfd7.up.railway.app |

Every push to `main` redeploys the service whose folder changed (watch paths).
Database migrations run automatically when the API starts. On an empty database the API creates the 3 plans and the super admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).

### API environment variables

| Variable | Notes |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | long random string |
| `CORS_ORIGINS` | CRM + Admin URLs, comma separated |
| `CRM_URL` | used in WhatsApp bill links (`/i/<token>`) |
| `API_PUBLIC_URL` | used for payment links and the Razorpay webhook |
| `OTP_DEV_MODE` | `true` returns the OTP in the API response — **only for testing** |
| `SMS_PROVIDER` / `MSG91_AUTH_KEY` / `MSG91_OTP_TEMPLATE_ID` | real OTP SMS (`msg91`). With `none`, OTPs are only printed in the API logs |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | first super admin (only used when no admin exists) |
| `ALLOW_PAYMENT_SIMULATION` | `true` adds a "simulate payment" button on fallback pay pages — never in production |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | optional; can instead be saved from Admin › Payment Gateway |

CRM: `NEXT_PUBLIC_API_URL`. Admin: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CRM_URL` (these are baked in at build time).

### Razorpay
Admin › Payment Gateway → paste Key ID / Secret / Webhook secret → in the Razorpay dashboard add webhook
`https://<api>/webhooks/razorpay` with events `payment_link.paid`, `payment.captured`, `payment.failed`.
Without keys, "payment links" open a fallback page on the API and sales can be recorded as cash/bank.

## Local development

```bash
# Postgres running locally, then:
cd apps/api && cp .env.example .env && npm i && npm run db:seed -- --reset && npm run dev   # :4000
cd apps/crm && cp .env.example .env.local && npm i && npm run dev                          # :3000
cd apps/admin && cp .env.example .env.local && npm i && npm run dev                        # :3001
cd apps/mobile && npm i && npx expo start                                                  # Expo
```

Demo data (seed): CRM login `9830012345` (Sharma Traders, OTP in API log/response in dev) · Admin `admin@jippronex.com` / `Admin@123`.
To load the same demo data on Railway: run `npm run db:seed:prod` in the api service shell (only works on an empty DB).

Schema changes: edit `apps/api/src/db/schema.ts` → `npm run db:generate` → commit the new SQL in `apps/api/drizzle/`.

## Android APK

```bash
cd apps/mobile
# set EXPO_PUBLIC_API_URL in eas.json (preview/production) to the API URL
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview      # installable .apk
npx eas-cli@latest build -p android --profile production   # .aab for Play Store
```

## Business rules worth knowing
- GST: per line `taxable = qty × rate − discount`; same state → CGST+SGST, other state → IGST; total rounded to the rupee.
- Party balance: positive = customer owes you (Dr), negative = you owe supplier (Cr). Every bill, purchase and payment updates it.
- Roles: Owner, Billing staff, Accountant, Store keeper — matrix in `apps/api/src/lib/auth.ts`.
- Plans gate features: Smart Billing (billing), Billing + Inventory (+ stock, purchase), Complete Business (+ accounts & GST). Expired plans are read-only.
- Subscription price is ex-GST; customer pays +18% GST. Customer-specific prices auto-apply on renewal.
