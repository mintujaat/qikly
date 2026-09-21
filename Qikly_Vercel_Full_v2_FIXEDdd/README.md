# Qikly — Diwali E-commerce Store

This version uses the supplied Qikly Invest project as the backend/payment base while replacing the customer-facing UI with a complete shopping storefront.

## Customer flow

- Home: Diwali sale, categories, flash deals, banners, search and filters.
- Product details: gallery, price, discount, highlights, reviews, wishlist, compare, add to cart and Buy Now.
- Buy Now goes directly to `/checkout.html?mode=buy-now` so the customer enters a delivery address before payment.
- Cart goes to `/cart.html` and then checkout.
- Checkout supports saved addresses for logged-in users, guest checkout, coupon validation, Razorpay online payment and Cash on Delivery when enabled by admin.
- Orders are saved in `shopOrders` and are visible in Account with status tracking and cancellation while eligible.
- Wishlist and compare use browser storage for fast interaction.
- Qikly AI remains available through the existing Gemini-backed chatbot endpoint.

## Admin flow

`/admin.html` controls:

- Products, stock, prices, categories, badges and visibility.
- Product, hero, category and banner images through the existing server-side ImgBB upload endpoint.
- Orders and delivery statuses.
- Customers.
- Coupons.
- Store name, hero, sale countdown, shipping, free-shipping threshold, returns and support details.
- **Cash on Delivery ON/OFF**. The setting is enforced both in the checkout UI and on the `/api/shop/order/cod` server endpoint.

## Payment preservation

The original Razorpay/investment/wallet API handlers in `api/index.js` are retained. Shopping uses separate `/api/shop/*` routes and the same existing Razorpay credentials. No original payment credentials or wallet handlers are replaced.

## Environment variables

Keep the existing project variables. The storefront uses:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `SESSION_SECRET`
- `ADMIN_PASSWORD`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `GEMINI_API_KEY`
- `IMGBB_API_KEY`

## Vercel

Deploy the project root directly. No frontend build command is required; the customer UI is static HTML/CSS/JS and the backend is the Vercel Node API.
