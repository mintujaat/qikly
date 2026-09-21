# Qikly Shop — Diwali Commerce Rebuild

This project is a full React ecommerce rebuild of the supplied Qikly codebase. The old investment-style frontend has been replaced with a modern, mobile-first shopping experience while keeping the existing server-side integration names for Firebase, Razorpay, Gemini and ImgBB.

## Store features

- Diwali-first visual system with festive purple/gold styling, diya details and sale ribbon
- Responsive desktop + mobile navigation with mobile bottom bar
- Homepage hero, dynamic campaign banners, categories, deal zone, trending products and sale countdown
- Product search, category pages, price filter, deals-only filter and sorting
- Product gallery, reviews, wishlist and quick add-to-cart
- Guest cart stored locally in the browser
- Login/signup with Firebase-backed account storage through the existing server session flow
- Saved addresses
- Checkout with Razorpay online payment or admin-controlled COD
- Server-side Razorpay signature verification and order creation
- Coupon validation and discount calculation on the server
- Order history, order detail and fulfillment tracking timeline
- Order cancellation before dispatch (paid cancellations are marked for manual refund handling)
- Gemini-powered shopping support assistant using the existing Gemini key/model variables
- Responsive account/profile area

## Admin control room

`/admin` provides:

- Dashboard revenue/order/customer/inventory KPIs
- Product CRUD, pricing, compare-at pricing, stock, images, SKU, badges, highlights and featured state
- Category CRUD
- Homepage/campaign banner CRUD
- Coupon CRUD with percentage/fixed discount, minimum order, max discount, usage limit and expiry
- Order fulfillment status + tracking ID field support
- Customer list with enable/disable access
- Website settings for brand, announcement, hero, sale end time, shipping, COD, support details and policies
- Gemini support assistant name, intro, scope and system prompt controls
- ImgBB upload endpoint for admin images

## Existing integrations preserved

The original server-side environment variable names remain in use:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_DATABASE_URL`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `IMGBB_API_KEY`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`

No payment secret, Firebase service account or Gemini private key is placed in the React client.

## Firestore collections used

`settings/main`, `chatbot/main`, `products/*`, `categories/*`, `banners/*`, `coupons/*`, `users/*`, `users/{uid}/addresses/*`, `orders/*`, `reviews/*`, and `transactions/*`.

When the ecommerce collections are empty, the first store read seeds the default Diwali catalog/categories into Firestore so inventory updates and orders work against persisted documents.

## Local development

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
```

For Vercel, keep the `api/index.js` function and the supplied `vercel.json`. The `/api/*` routes are served by Express and Vite's built client handles the storefront routes.

## Environment setup

Copy `.env.example` to your Vercel/project environment configuration and paste the same values from the previous project. Do not commit real secrets.

For a real launch, also configure the business's shipping, return/refund, tax, consumer-protection and applicable legal requirements before processing customer payments.
