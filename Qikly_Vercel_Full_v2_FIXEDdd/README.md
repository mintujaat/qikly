# Qikly — Diwali Shopping Commerce Build

This build uses the supplied **Qikly Invest v7** project as the base.

## What changed

The storefront has been rebuilt as a pure **HTML + CSS + JavaScript** e-commerce website. The original investment/wallet backend and its existing payment handlers remain in `api/index.js`.

A separate additive commerce layer was added under `/api/shop/*` for:

- Products and categories
- Product search, filters, sorting and stock
- Wishlist and compare
- Shopping cart
- Coupons
- Guest checkout and logged-in checkout
- Cash on Delivery
- Razorpay online checkout using the existing `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`
- Order creation, payment verification and order tracking
- Order cancellation before shipment
- Product reviews API
- Admin product/category/coupon/order/storefront control
- ImgBB product image upload through the existing `/api/admin/upload-image` endpoint
- Diwali sale banners and storefront settings
- Existing Gemini support remains available through the existing chatbot route

## Pages

- `/` — customer shopping storefront
- `/admin.html` — commerce admin dashboard
- `/terms.html` — shopping terms
- `/privacy.html` — shopping privacy policy
- `/refund.html` — shopping return/refund policy

The older investment pages/files are retained in the project so the existing application routes/assets are not deleted.

## Existing environment variables

Keep the existing environment variables. The commerce layer uses the same configuration for payment, Firebase, Gemini and ImgBB.

Required for the existing project:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `SESSION_SECRET`
- `ADMIN_PASSWORD`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET` (keep your existing value)
- `GEMINI_API_KEY`
- `IMGBB_API_KEY`

Telegram/cron variables from the supplied project can remain unchanged.

## Vercel deployment

Upload the project root to Vercel and keep the root directory unchanged.

No React, Vite or frontend build command is required. The customer UI is static HTML/CSS/JS and the backend is the existing Vercel Node API.

After deployment, open `/admin.html` and log in with `ADMIN_PASSWORD`.

On first store access the commerce layer seeds starter categories, products, storefront settings and the `DIWALI10` coupon into these Firestore collections:

- `shopSettings`
- `shopCategories`
- `shopProducts`
- `shopCoupons`
- `shopOrders`
- `shopReviews`
- `shopMeta`
- `shopDeletedProducts`
- `shopDeletedCategories`

This is done by the server using Firebase Admin SDK; Firestore client rules are not used for these server-side writes.

## Image uploads

In the admin product editor, choose an image and click **Upload**. The existing server-side ImgBB integration is used, so the `IMGBB_API_KEY` stays on the server and is not placed in the browser code.

## Payment

The existing Qikly investment/wallet payment endpoints are retained. Shopping checkout adds separate `/api/shop/order/*` routes and uses the same Razorpay account/credentials. No existing investment payment route is replaced.
