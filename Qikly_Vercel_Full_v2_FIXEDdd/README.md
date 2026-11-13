# Mintu Social — Supabase SMM Panel

This build replaces the Firestore/Firebase Admin database layer with Supabase PostgreSQL. It keeps the existing customer website, admin workspace, Razorpay wallet flow, LuvSMM v2 server integration, manual service review, and Vercel deployment layout.

**Fresh start:** this schema starts with empty SMM tables. No Firebase customers, wallet balances, orders, or passwords are migrated. Existing Razorpay and LuvSMM integrations remain environment-based and can be reused.

## Included features

- Responsive customer website and separate `/admin` workspace.
- Email/password signup and login. Passwords are stored as Node.js `scrypt` hashes in the Supabase `smm_users` table; the app issues signed HttpOnly cookies. This build uses Supabase PostgreSQL as its database and does not require enabling Supabase Auth for the current email/password flow.
- Razorpay wallet recharge, server-side HMAC verification, captured-payment verification, webhook reconciliation, and exactly-once crediting.
- Wallet ledger, order history, order placement, supplier status synchronization, manual order handling, and admin wallet refunds.
- LuvSMM service catalogue import/sync. Every new/changed service enters `Needs review`. Admin approves or rejects each service; only active, approved, verified services appear publicly and can be ordered.
- Admin dashboard with database-side aggregate counts, services, orders, customers, transactions, settings and supplier balance.
- PostgreSQL functions for atomic payment credit, order wallet reservation, refunds, and dashboard aggregates.
- Row Level Security enabled on all SMM tables. The server uses the Supabase secret key; it is never included in browser assets.

## 1. Create the database tables

1. Open your Supabase project: <https://supabase.com/dashboard/project/rhpwlxivnoupnjktesih>.
2. Open **SQL Editor** → **New query**.
3. Open `supabase/schema.sql` from this project and copy all its contents into the SQL Editor.
4. Press **Run** and confirm that the tables and SQL functions are created without errors.
5. Open **Table Editor** and confirm these tables exist: `smm_users`, `smm_services`, `smm_orders`, `smm_wallet_payments`, `smm_transactions`, and `smm_settings`.

The script creates only the SMM tables and functions in the `public` schema. It does not modify Firebase or any older YaadPage/Qikly database.

## 2. Get the server key

In Supabase Dashboard, open **Project Settings → API Keys**. Use the new **Secret key** (`sb_secret_...`). If your project still shows only legacy keys, use the `service_role` key as a temporary server-only alternative. Never use either key in browser code, HTML, `app.js`, `admin.js`, GitHub, or a `NEXT_PUBLIC_*` variable. Secret/service-role keys bypass Row Level Security and must stay on the Vercel server.

The project URL is already filled in as:

`https://rhpwlxivnoupnjktesih.supabase.co`

## 3. Vercel environment variables

Open **Vercel → Project → Settings → Environment Variables** and add:

| Variable | Value / source | Required |
|---|---|---|
| `SUPABASE_URL` | `https://rhpwlxivnoupnjktesih.supabase.co` | Yes |
| `SUPABASE_SECRET_KEY` | Supabase `sb_secret_...` key; backend only | Yes |
| `RAZORPAY_KEY_ID` | Your Razorpay Key ID; start with Test Mode | Wallet |
| `RAZORPAY_KEY_SECRET` | Matching Razorpay secret; backend only | Wallet |
| `RAZORPAY_WEBHOOK_SECRET` | The same secret set in Razorpay Webhooks | Recommended |
| `SESSION_SECRET` | Generate using `openssl rand -hex 32` | Yes |
| `ADMIN_PASSWORD` | Unique admin password, minimum 12 characters | Yes |
| `LUVSMM_API_URL` | `https://luvsmm.com/api/v2` | Supplier |
| `LUVSMM_API_KEY` | Your LuvSMM API key; backend only | Supplier |
| `LUVSMM_CURRENCY` | Usually `INR`; verify supplier response | Yes for pricing |
| `USD_TO_INR_RATE` | Current USD→INR conversion value | Only for USD supplier rates |
| `SITE_NAME` | `Mintu Social` | Optional |
| `DEFAULT_MARKUP_PERCENT` | `30` (change as needed) | Optional |

Do not add `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_DATABASE_URL`; this build no longer reads them. You can remove those old Firebase variables from Vercel after deploying this build. Existing Razorpay and LuvSMM values can stay the same. Do not paste any private key into chat or commit `.env` to GitHub.

## 4. Deploy

1. Extract the ZIP.
2. Upload the contents of the `mintu-social-panel/` folder to the GitHub repository connected to your Vercel project. Replace the prior project code.
3. In Vercel, keep Framework Preset as **Other**. Build command may remain empty; Vercel installs `package.json` dependencies.
4. Add the environment variables above to Production (and Preview if you test there).
5. Redeploy.
6. Open `https://YOUR_DOMAIN/health`. Expected example: `{"ok":true,"service":"mintu-smm-api","database":"supabase","supabase":true,...}`.
7. Open `/admin`, log in using `ADMIN_PASSWORD`, choose **Services**, and press **Import / sync all** once. Supplier services are inserted into PostgreSQL and initially remain in `Needs review`.
8. Review each service, set/confirm the selling price, and choose **Approve & publish** or **Reject & hide**.
9. Test a Razorpay Test Mode wallet top-up, confirm one wallet transaction is created, then place a small test order using an approved service. Only switch to Live Mode after those flows are verified.

## 5. Razorpay webhook

After deployment, configure a Razorpay webhook URL:

`https://YOUR_DOMAIN/api/razorpay/webhook`

Select `payment.captured` and `order.paid`, create a webhook secret, and set the same value as `RAZORPAY_WEBHOOK_SECRET` in Vercel. Redeploy after editing environment variables.

## 6. How the application works

### Database and authentication

The browser talks only to the existing `/api/*` endpoints. The Vercel API uses `@supabase/supabase-js` with `SUPABASE_SECRET_KEY`. The secret key never reaches the browser. Customer credentials are stored as scrypt hashes in PostgreSQL; cookies are signed using `SESSION_SECRET` and are HttpOnly/SameSite=Lax/Secure in production.

### Service sync and manual review

Admin presses **Import / sync all**. The server requests `action=services` from LuvSMM and upserts services into `smm_services` in batches. Existing selling prices are preserved. When supplier details materially change, that service returns to `Needs review`. New/manual services also enter `Needs review`. The admin has to review and approve before a service is shown to customers or orderable.

### Wallet payments

The API creates a Razorpay order and stores a pending row in `smm_wallet_payments`. On checkout success, the API verifies the Razorpay HMAC signature and confirms the payment is captured and in INR. A PostgreSQL function locks the payment and user rows, marks the payment paid, updates the balance, and inserts a unique ledger record in one database transaction. Webhook retries do not credit twice.

### New orders

A PostgreSQL function locks the selected service and user rows, validates service approval/price/quantity and available balance, deducts the wallet amount, creates an order, and inserts a ledger row atomically. Only after this reservation does the server submit LuvSMM `action=add`. A clear supplier rejection triggers a wallet refund. An ambiguous timeout is marked `Supplier confirmation needed` so the same order is not accidentally duplicated.

### Refunds

Admin wallet refunds run through one PostgreSQL function that locks the order and user, calculates a full/partial refund, updates the balance and order, and inserts a unique refund ledger record atomically. Supplier-side cancellation/reconciliation must be completed before refunding an order that has already been accepted upstream.

## Local development

Requirements: Node.js 22 or newer.

```bash
cp .env.example .env
# Fill the .env values locally. Never commit .env.
npm install
npm start
```

Open `http://localhost:3000` and `http://localhost:3000/admin`.

## Important notes

- The SQL schema must be run before the first deployment/API request. Ensure the `public` schema is exposed in Supabase Data API settings if you have changed the default API exposure settings.
- This is a fresh database; customers must register again. No Firebase data or passwords are imported.
- The application currently uses its own email/password auth table rather than Supabase Auth. Google OAuth is not wired in this build. The project uses `@supabase/supabase-js` 2.119.x and Node.js 22 or newer.
- Live Supabase, Razorpay, and LuvSMM credentials were not available during code generation; complete the test-mode checks above before public launch.
- Supabase Free projects can pause after a week of inactivity and have a 500 MB database quota. Check current usage and plan limits in your Supabase dashboard.
