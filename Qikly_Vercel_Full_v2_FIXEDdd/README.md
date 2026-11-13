# Mintu Social — Supabase SMM Panel

This build replaces the Firestore/Firebase Admin database layer with Supabase PostgreSQL. It keeps the existing customer website, admin workspace, Razorpay wallet flow, LuvSMM v2 server integration, manual service review, and Vercel deployment layout.

**Fresh start:** this schema starts with empty SMM tables. No Firebase customers, wallet balances, orders, or passwords are migrated. Existing Razorpay and LuvSMM integrations remain environment-based and can be reused.

## Included features

- Light-theme, mobile-responsive customer website with Home, Services, Add Funds, Complaints, Order History, profile menu and responsive mobile navigation.
- Email/password signup and login plus Google Sign-In (Google Identity Services). Google profile name, verified email and avatar are saved to the customer record. Passwords use Node.js `scrypt` hashes; the app issues signed HttpOnly cookies. Google sign-in is verified server-side against the configured Google Web Client ID.
- Razorpay wallet recharge, server-side HMAC verification, captured-payment verification, webhook reconciliation, and exactly-once crediting.
- Razorpay wallet deposits with admin-configurable minimum/maximum amounts, wallet ledger, order history, supplier status synchronization, manual orders and controlled refunds.
- Admin customer wallet controls: manual add/deduct with a reason recorded in the transaction ledger; deductions cannot make a wallet negative.
- Dynamic service groups/categories (Instagram, YouTube, Telegram, etc.). Admin creates, renames, hides or deletes groups; every service is assigned to a group. Customers see only services belonging to visible groups.
- Manual/custom service builder and LuvSMM service import. Admin can create a service under any group, optionally map it to a LuvSMM supplier service ID, review, approve, reject, publish, pause or delete it. Manual-only orders enter the admin fulfillment queue.
- USD supplier rate conversion to INR with an admin-set exchange rate and configurable percentage or fixed margin. Manual service price overrides are preserved through supplier sync. Supplier metadata is stored separately from admin's customer-facing name/category/description, so future syncs do not undo admin assignments.
- Customer support tickets with threaded replies. Customers create and reply to complaints; admins respond and change ticket status from `/admin`.
- Admin dashboard with services, group management, complaints, customer wallet adjustments, orders, transactions, pricing/deposit settings and LuvSMM supplier balance lookup.
- PostgreSQL functions for atomic payment credit, order wallet reservation, refunds, admin wallet adjustment, price recalculation and dashboard aggregates.
- Row Level Security enabled on all SMM tables. The server uses the Supabase secret key; it is never included in browser assets.

## 1. Create the database tables

1. Open your Supabase project: <https://supabase.com/dashboard/project/rhpwlxivnoupnjktesih>.
2. Open **SQL Editor** → **New query**.
3. Open `supabase/schema.sql` from this project and copy all its contents into the SQL Editor.
4. Press **Run** and confirm that the tables and SQL functions are created without errors.
5. Open **Table Editor** and confirm these tables exist: `smm_users`, `smm_services`, `smm_orders`, `smm_wallet_payments`, `smm_transactions`, `smm_settings`, `smm_categories`, `smm_tickets`, and `smm_ticket_messages`. The same complete schema can be re-run after a prior partial setup; new columns and RPCs are created idempotently.

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
| `LUVSMM_CURRENCY` | `USD` (default when the supplier response omits currency) | Supplier pricing |
| `USD_TO_INR_RATE` | Optional initial USD→INR fallback | Optional; can be set in Admin → Settings |
| `GOOGLE_CLIENT_ID` | Google Cloud Console OAuth Web Client ID | Google Sign-In |
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
7. Open `/admin`, log in using `ADMIN_PASSWORD`, open **Settings**, set USD→INR exchange rate, margin type/value, and minimum/maximum deposit. Save settings before importing a USD catalogue.
8. Open **Groups** and create the customer-facing platform groups you need (Instagram, YouTube, Telegram, etc.).
9. Open **Services** → **Import / sync all**. Supplier services enter `Needs review`. Review a service, choose its customer-facing group, verify the INR price, and approve or reject it. You can also use **Manual service** to create a service yourself; choose its group and optionally enter a LuvSMM service ID if it should be sent to the supplier.
10. Test Google Sign-In, a Razorpay Test Mode wallet top-up (minimum deposit enforced), a manual wallet add/deduct, a support ticket and admin reply, and a small order using an approved service. Only switch to Live Mode after those flows are verified.

## 5. Razorpay webhook

After deployment, configure a Razorpay webhook URL:

`https://YOUR_DOMAIN/api/razorpay/webhook`

Select `payment.captured` and `order.paid`, create a webhook secret, and set the same value as `RAZORPAY_WEBHOOK_SECRET` in Vercel. Redeploy after editing environment variables.

## 6. How the application works

### Database and authentication

The browser talks only to the existing `/api/*` endpoints. The Vercel API uses `@supabase/supabase-js` with `SUPABASE_SECRET_KEY`. The secret key never reaches the browser. Customer credentials are stored as scrypt hashes in PostgreSQL; cookies are signed using `SESSION_SECRET` and are HttpOnly/SameSite=Lax/Secure in production.

### Groups, service sync and manual review

Admin creates platform groups (for example Instagram, YouTube and Telegram). Imported services initially enter `Needs review`. During review, the admin chooses the customer-facing group and the final name/description/price. A customer selecting Instagram sees only approved services assigned to Instagram. Hidden groups are excluded from the public catalogue. Admin can also create a custom service directly and choose its group. A custom service with a LuvSMM service ID is dispatched through LuvSMM; a service without a supplier mapping becomes an admin-fulfillment order.

Supplier name/category/description are stored separately from customer-facing fields. This prevents catalogue sync from undoing admin-assigned names and groups. If supplier metadata changes, the service is returned to manual review. For USD supplier rates, the configured exchange rate converts supplier cost into INR; a percentage or fixed margin is then applied. Services with manual price overrides are not overwritten by global margin updates or syncs.

### Wallet payments

The API creates a Razorpay order and stores a pending row in `smm_wallet_payments`. On checkout success, the API verifies the Razorpay HMAC signature and confirms the payment is captured and in INR. A PostgreSQL function locks the payment and user rows, marks the payment paid, updates the balance, and inserts a unique ledger record in one database transaction. Webhook retries do not credit twice.

### New orders

A PostgreSQL function locks the selected service and user rows, validates service approval/price/quantity and available balance, deducts the wallet amount, creates an order, and inserts a ledger row atomically. Only after this reservation does the server submit LuvSMM `action=add`. A clear supplier rejection triggers a wallet refund. An ambiguous timeout is marked `Supplier confirmation needed` so the same order is not accidentally duplicated.

### Wallet administration and complaints

Admin can manually add or deduct funds from a customer wallet with a note; each adjustment is recorded in the same INR wallet ledger. A deduction is rejected if it would make the balance negative. Customers can open a complaint thread, reply to it, and see the admin's replies. Admin can reply and set Open, In Progress, Resolved or Closed status.

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
- Authentication uses the application's Postgres user table and signed HttpOnly cookies; the browser does not get a Supabase Auth session. Google Sign-In requires a Google OAuth Web Client ID. In Google Cloud Console, add your site origin (for example `https://YOUR_DOMAIN`) and `http://localhost:3000` under Authorized JavaScript origins, then set `GOOGLE_CLIENT_ID` in Vercel.
- Before importing the USD catalogue, set the USD/INR rate in Admin → Settings. A zero rate intentionally leaves auto-priced USD services at ₹0 and they cannot be published until a valid rate/price is saved.
- Live Supabase, Razorpay, and LuvSMM credentials were not available during code generation; complete the test-mode checks above before public launch.
- Supabase Free projects can pause after a week of inactivity and have a 500 MB database quota. Check current usage and plan limits in your Supabase dashboard.
