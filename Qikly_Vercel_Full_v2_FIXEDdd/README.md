# Mintu Social — SMM / Digital Marketing Panel

This project replaces the old YaadPage storefront with a responsive marketing-services panel. It reuses the existing Firebase Admin/Firestore project and Razorpay account, adds a server-side LuvSMM v2 integration, and provides a separate admin workspace. New SMM records use isolated `smm*` Firestore collections; existing YaadPage/Qikly collections are left untouched. Existing YaadPage accounts are not automatically migrated into `smmUsers`, so customers create a new panel account.

## What is included

### Customer website
- Responsive home page and public service catalogue.
- Email/password signup, login and logout. Sessions are signed, HttpOnly cookies; passwords are stored as scrypt hashes.
- Razorpay wallet top-up (₹50–₹50,000 per checkout).
- Server-side Razorpay signature verification plus a payment-capture check before wallet credit.
- Optional Razorpay webhook endpoint for payment reconciliation.
- Wallet transaction history, order history and live balance display.
- Server-side price, quantity, account and wallet validation before an order is accepted.

### Admin workspace (`/admin`)
- Password-protected admin login.
- Overview: customers, catalogue counts, order counts, wallet deposits and latest orders.
- **Import / sync all**: fetches the LuvSMM `services` API response and upserts the complete service list into the `smmServices` collection.
- Every newly imported supplier service and every manually created service enters `Needs review`; no keyword-based automatic block or auto-publish is applied.
- Admin opens each service's review card (name, description, supplier ID/rate, price, quantity range and refill/cancel options), then manually approves and publishes or rejects it.
- Previously `Blocked` legacy imports are migrated to `Needs review` the next time the admin runs **Import / sync all**.
- Service approval, publish/pause, rejection, custom selling prices, supplier balance check and manual service creation.
- Order list, batch supplier-status synchronization, status adjustment and safeguarded wallet refunds.
- Customer directory, wallet transaction ledger and default markup settings.

## Service moderation model

This build uses manual admin moderation rather than automatic keyword restrictions. The complete catalogue returned by LuvSMM is imported into Firestore and stays private to the admin until reviewed. Each service starts in `Needs review`; the admin can inspect the supplier-provided name, description, ID, rate, quantity range, refill/cancel flags and retail price, then choose **Approve & publish** or **Reject & hide**. The server requires an authenticated admin session and a review-confirmation flag for either decision. Only active, approved services with a valid selling price appear in the customer catalogue and pass the server-side order check.

A later sync refreshes supplier metadata while preserving the admin's selling price. If supplier metadata (name, description, rate, currency, type, quantity bounds or refill/cancel flags) changes, the item is returned to `Needs review` and hidden until the admin checks it again. Unchanged records preserve the moderation decision. Legacy records previously marked `blocked` are moved to `Needs review` during the next sync. Admin-created manual services also enter the same review queue. The admin remains responsible for checking supplier terms, platform rules, local law, service quality and customer disclosures before approval; approval is not a claim that a supplier service is endorsed by a social platform or guaranteed to be safe for an account.

The LuvSMM API key and endpoint are called only from `api/index.js`. The integration uses HTTPS certificate validation (native Node fetch) and does not copy the unsafe SSL-verification bypass from the provider's sample PHP snippet.

## Before deployment: Vercel environment variables

Open **Vercel → Project → Settings → Environment Variables** and add these values for Production (and Preview/Development if needed):

| Variable | Required? | Where it comes from / purpose |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes | Full service-account JSON from Firebase Console → Project settings → Service accounts → Generate new private key. Paste as one-line JSON. |
| `FIREBASE_DATABASE_URL` | Optional | Keep the existing value from your old project if you use Realtime Database. This panel stores its data in Firestore. |
| `RAZORPAY_KEY_ID` | Yes for wallet | Razorpay Dashboard → Account & Settings / API Keys. Start with Test Mode keys. |
| `RAZORPAY_KEY_SECRET` | Yes for wallet | Secret paired with the Razorpay Key ID. Backend only. |
| `RAZORPAY_WEBHOOK_SECRET` | Recommended | A secret you create when adding the webhook URL in Razorpay. Optional for client-side verified checkout; recommended for reconciliation. |
| `SESSION_SECRET` | Yes | Long random secret, at least 32 characters. Example generator: `openssl rand -hex 32`. |
| `ADMIN_PASSWORD` | Yes | Unique admin password of at least 12 characters. Keep it private. |
| `LUVSMM_API_URL` | Yes for supplier sync | `https://luvsmm.com/api/v2` |
| `LUVSMM_API_KEY` | Yes for supplier sync | Generate/copy your API key from your LuvSMM account's API settings. Never share it in chat or GitHub. |
| `LUVSMM_CURRENCY` | Yes for price calculation | Currency used for service `rate` values if the API response omits currency; default is `INR`. Confirm this in your LuvSMM account/API response. |
| `USD_TO_INR_RATE` | Only if supplier rate is USD | Current USD→INR conversion number, e.g. `83.5` (example only; set the current rate yourself). If blank and API rate is USD, imported services get no auto-calculated sale price until configured. |
| `DEFAULT_MARKUP_PERCENT` | Optional | Starting markup applied only when a supplier service is first imported. Default `30`. |
| `SITE_NAME` | Optional | Public brand name. Default `Mintu Social`. |

The old YaadPage-only variables (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_WORKER_URL`, `IMGBB_API_KEY`, `GEMINI_API_KEY` and `GEMINI_MODEL`) are not used by this new SMM build; you may leave them in Vercel, but they are not required.

Do **not** add `LUVSMM_API_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SESSION_SECRET` or Firebase service-account JSON as `NEXT_PUBLIC_*` variables or put them in frontend files. Do not commit `.env` or downloaded service-account files to GitHub.

### Razorpay webhook (recommended)

After deployment, add a webhook in the Razorpay Dashboard pointing to:

`https://YOUR_DOMAIN/api/razorpay/webhook`

Select `payment.captured` and `order.paid`. Set a strong webhook secret and add the same value as `RAZORPAY_WEBHOOK_SECRET` in Vercel. Redeploy after changing Vercel environment variables.

## Deploy to Vercel

1. Extract the ZIP. The project folder is `mintu-social-panel/` (the code and package configuration are inside this folder).
2. Push the contents of `mintu-social-panel/` to a GitHub repository. Do not upload `.env` or private keys.
3. In Vercel, import that repository. Framework preset: **Other**. Build command can remain empty; install command is `npm install`.
4. Add the environment variables listed above. Use Razorpay Test Mode keys for the first deployment and your LuvSMM API key only in the server environment.
5. Deploy. Open `https://YOUR_DOMAIN/health` and confirm the JSON reports `firebase: true`, `razorpay: true` (when keys exist), and `luvsmm: true` (when the provider key exists).
6. Open `/admin`, sign in with `ADMIN_PASSWORD`, open Service catalogue and use **Import / sync all**.
7. Run **Import / sync all**. The next sync also converts legacy `Blocked` records into `Needs review`.
8. Open **Review** on each service, inspect its details and customer price, tick the admin review confirmation, then choose **Approve & publish** or **Reject & hide**. Only approved services with a valid selling price are visible to customers.
9. Make a Test Mode wallet recharge, verify the balance and transaction record, then place a test order using a service you reviewed and approved. Do not switch to live payments until the full flow has been checked.

Vercel rewrites in `vercel.json` keep `/api/*` routed to the serverless Express API, `/admin` routed to the admin HTML, and the home route routed to `index.html`.

## Local development

Requirements: Node.js 20.6 or newer.

```bash
cp .env.example .env
# Fill the .env values with test credentials
npm install
npm start
```

Open `http://localhost:3000` and `http://localhost:3000/admin`.

## How the main flows work

### A. Service sync
1. Admin presses **Import / sync all**.
2. Server sends `action=services` to `https://luvsmm.com/api/v2` using `LUVSMM_API_KEY`.
3. Every returned service with an ID is upserted into the Firestore `smmServices` collection (`luvsmm_<supplier-id>` document ID).
4. Supplier name/category/rate/min/max/type are refreshed. Existing selling price is preserved; if supplier metadata changes, the service returns to `Needs review`.
5. New and materially changed services appear in the admin catalogue as `Needs review`. No name/category keyword screening is used. The admin must manually approve each service before it can be listed or ordered. Legacy `blocked` records are moved to `needs_review` at the next sync.

### B. Customer wallet recharge
1. Customer signs up/logs in and enters a recharge amount.
2. Server creates a Razorpay order and stores a pending record in `smmWalletPayments`.
3. Razorpay Checkout opens in the browser.
4. On payment success, the browser sends the checkout response to the server.
5. Server verifies the Razorpay HMAC signature, fetches the payment and confirms it is captured with the exact INR amount.
6. A Firestore transaction credits the wallet and creates one unique entry in `smmTransactions`. Repeated verification does not credit twice.

### C. Customer order
1. Customer chooses a published service, target URL and quantity.
2. Server rechecks service approval, quantity bounds, URL and wallet balance.
3. A Firestore transaction deducts/reserves the amount and creates the order + ledger entry.
4. For a verified supplier service, server sends the `add` request to LuvSMM. A returned supplier order ID is saved.
5. Admin can batch-sync supplier statuses using the `status` API action. Manual-service orders remain in the admin queue until fulfilled and updated by the admin.
6. If LuvSMM clearly rejects an order, the server returns the reserved wallet amount. If the network times out and supplier acceptance is uncertain, it marks the order for admin reconciliation instead of risking a duplicate submission or refunding an order that may already be in progress.

### D. Refunds

Manual service pricing can be either a fixed price per order or a price per 1,000 units. A refund credits the customer's **internal website wallet**, not the original bank/card/UPI payment method. Supplier orders cannot be refunded from the admin panel while they are still active upstream; reconcile/cancel them first. Keep the supplier-side action and customer wallet action consistent.

## Firestore collections

- `smmUsers/{uid}` — customer account, scrypt password hash/salt, wallet balance and account state.
- `smmServices/{serviceId}` — supplier or manual service details, cost metadata, selling price and approval state.
- `smmOrders/{orderId}` — customer order, price, status and upstream supplier order ID.
- `smmWalletPayments/{razorpayOrderId}` — pending/paid Razorpay wallet top-ups.
- `smmTransactions/{ledgerId}` — immutable-style wallet ledger entries for deposits, order deductions and refunds.
- `smmSettings/main` — site support email, markup and last sync details.

`firestore.rules` denies direct browser access. All database operations use Firebase Admin on the server. All new collections are prefixed with `smm` so the existing YaadPage/Qikly collections are not modified. Publish these rules in Firebase Console → Firestore Database → Rules.

## Limitations / things to verify on your own account

- I can validate code syntax and configuration structure here, but cannot verify your private Firebase project, Razorpay account, LuvSMM API key, Vercel deployment or live supplier balance from this ZIP alone.
- LuvSMM's public API page currently renders parts of the service response schema dynamically. The sync code accepts the common SMM v2 response shape (an array of objects with `service`, `name`, `category`, `rate`, `min`, `max`, `type`, `refill` and `cancel`). Confirm the actual response and the rate currency against your own API account before accepting orders.
- The panel currently uses periodic/manual admin refresh for supplier order status; it does not run a background scheduler. Open Admin → Orders → **Sync supplier statuses** when you need to refresh active orders.
- This build does not include Google sign-in, email verification, forgot-password flow, customer support ticketing or automatic cash refunds to bank accounts.
- Before taking real payments, ask Razorpay to approve the exact business/service category and publish your refund/contact/terms policies. Follow the terms of every connected social platform.
