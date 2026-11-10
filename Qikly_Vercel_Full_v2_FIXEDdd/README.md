# YaadPage — Personalized Website Builder

YaadPage turns a customer's photos and message into a personalized, shareable microsite. Customers choose a design, complete a short form, pay with Razorpay, and receive a page URL such as `https://yaadpage.online/annayabirthday`.

## What is included

- Responsive YaadPage storefront and 24 occasion designs, including dedicated wedding and anniversary layouts
- Customer create-page flow with live preview, custom page slug and image upload
- Three one-time plans: Starter ₹199 (1 photo), Story ₹399 (10 photos) and Premium ₹699 (up to 100 photos)
- Razorpay order creation and server-side payment-signature verification
- Firebase Admin / Firestore storage for page data, orders and slug reservations
- Cloudflare R2 image storage; customer photo uploads are sent through the server (no bucket CORS setup required)
- Dynamic customer pages served from one renderer at `/:slug`
- Public image proxy that only serves assets belonging to a published page
- Admin Studio at `/admin` for page status, unpaid-order deletion, promo-code management, YouTube walkthrough settings, revenue and pages
- Existing legacy Qikly API routes and integrations are retained in `api/index.js`; the public UI is now YaadPage

## Required environment variables

Configure these in your hosting provider. The ZIP does not contain live credentials.

```env
# Firebase Admin service account JSON (keep private)
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"YOUR_PROJECT_ID",...}
FIREBASE_DATABASE_URL=https://YOUR_PROJECT-default-rtdb.firebaseio.com

# Razorpay (server-side secret must never be placed in frontend code)
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

# Signed admin sessions and admin login
SESSION_SECRET=replace-with-a-long-random-secret-at-least-32-characters
ADMIN_PASSWORD=replace-with-a-strong-unique-password

# Cloudflare R2 (the existing bucket can be reused; current example bucket is pdfs)
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET=pdfs

# Optional legacy integrations kept from the source project
R2_WORKER_URL=https://your-existing-r2-worker.example.workers.dev
IMGBB_API_KEY=your_imgbb_api_key
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=your-supported-gemini-model
```

Do not commit a real `.env` file or service-account JSON to GitHub. Keep all secrets in Vercel Environment Variables or your server environment. Rotate any key that has previously been exposed publicly.

## Firestore collections used by YaadPage

- `yaadPages/{slug}` — published page data and R2 photo keys
- `yaadPageOrders/{razorpayOrderId}` — customer contact, order status and uploaded photo metadata
- `yaadPageSlugLocks/{slug}` — short-lived reservation while checkout is in progress
- `yaadPagePromoCodes/{CODE}` — discount definitions, usage counts and pending checkout reservations
- `yaadPageSettings/main` — public how-it-works YouTube video ID

The existing `firestore.rules` denies direct browser reads and writes. All page and order operations go through the Express API using Firebase Admin.

## Local run

Requires Node.js 20+ and the environment variables above.

```bash
npm install
cp .env.example .env
# Add real values to .env
npm start
```

Open `http://localhost:3000`. The admin area is at `http://localhost:3000/admin`.

## Deploy to Vercel

1. Import this folder into a Vercel project.
2. Add the environment variables above in Project Settings → Environment Variables.
3. Deploy the project.
4. Connect `yaadpage.online` in Vercel Domains after purchasing the domain.
5. Redeploy after changing environment variables.

The `vercel.json` rewrites send `/api/*` to the Express serverless API, `/admin` to the admin page, and customer slugs to the storefront app. Do not add a second wildcard rewrite above the API rewrite.

## Before accepting real orders

1. Test Razorpay in Test Mode first, including payment success, payment failure and modal-close cases.
2. Confirm the R2 bucket is the intended bucket and that the server-side R2 credentials have PutObject, GetObject and DeleteObject permissions.
3. Verify Firestore Admin credentials can create, read, update and delete the YaadPage collections.
4. Set a strong `SESSION_SECRET` and `ADMIN_PASSWORD` before production.
5. Confirm the final domain and support email in the storefront before promoting it.
6. Make a test page, open its public slug on mobile, and verify that images load before sharing with customers.

## Notes

- Plans are currently one-time prices with one-year hosting. Renewal / extension checkout is not automated in this version.
- Customers can upload JPG, PNG or WebP images smaller than 2 MB each. The Premium ₹699 plan accepts up to 100 photos. Images are served only through the matching published page URL.
- A customer page is published only after the server verifies the Razorpay payment signature.
- The order flow uses Razorpay Checkout plus server-side signature verification and a server-side payment fetch that checks capture status and exact amount. A dedicated webhook-reconciliation endpoint is not included in this build; add and test one before high-volume production use. Promo codes can apply percentage discounts, fixed rupee discounts or a full free order. Usage limits and expiry dates are enforced server-side. Free-code orders publish only after the server confirms the reserved code and upload session.
- The archive contained `.env.example`, not real service credentials. Existing live integrations can only connect after the same values are entered in the deployment environment.
