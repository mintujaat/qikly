# Qikly Fashion — Diwali E-commerce

This build converts the storefront into a **general fashion/clothing shopping website** for the Diwali sale. It keeps the existing server/payment infrastructure and adds a separate commerce UI + shop data layer.

## Customer website

- Diwali fashion storefront
- Women, Men, Ethnic Wear, Dresses, Kids, Winter Wear, Footwear, Accessories
- Product search, category filters, price/rating filters, sorting
- Product detail page with image gallery
- Size + colour selection
- Add to bag
- Buy Now -> delivery address first -> payment
- Shopping bag with quantity/remove controls
- Wishlist
- Product compare
- Coupons
- Saved address book (device-local)
- Guest checkout
- Login / signup
- My account
- My orders + status + cancellation where allowed
- Product reviews for logged-in users
- Razorpay online checkout using the existing environment variables
- COD controlled from Admin -> Storefront
- Gemini shopping assistant using the existing chatbot backend
- Diwali sale countdown and promotional banners
- Mobile bottom navigation

## Admin panel (`/admin.html`)

- Admin password login using the existing admin auth route
- Overview / order / customer metrics
- Product create / edit / delete
- Clothing fields: sizes, colours, gender, fabric, occasion, fit
- Product stock and pricing controls
- Product image upload through the existing **ImgBB server-side API**
- Category create / edit / delete
- Category image upload through ImgBB
- Coupon create / edit / delete
- Order status management
- Customer list
- Storefront branding controls
- Hero image upload through ImgBB
- Promo banner management + ImgBB upload
- Shipping fee / free-shipping threshold
- Return window
- **Cash on Delivery ON/OFF**
- Diwali sale label + end time

## Existing backend/payment

The original wallet/investment/payment handlers are kept in `api/index.js`. The shop uses separate `/api/shop/*` routes. Existing Razorpay environment variable names are preserved.

The commerce backend was additionally corrected for:

- Dynamic COD configuration from Firestore settings
- Clothing variant validation (size / colour)
- Correct stock restoration when cancelling COD/paid orders
- Versioned shop seed migration so the old general-product seed is hidden and the Diwali fashion catalogue is inserted

## Old frontend files removed

These were obsolete for the new clothing storefront and were removed from `public/`:

- `active-plans.html`
- `auth.html`, `auth.js`
- `chat.html`, `chat.js`
- `donate.html`
- `legal.js`
- `nav.js`
- `profile.html`, `profile.js`
- `refer.html`, `refer.js`
- `transactions.html`, `transactions.js`
- `withdrawal.html`
- `admin.js`
- `theme.js`

Kept because they are still useful/legal/store infrastructure:

- `index.html`
- `app.js`
- `style.css`
- `admin.html`
- `admin-shop.js`
- `admin-shop.css`
- `terms.html`
- `privacy.html`
- `refund.html`

## Deployment

Deploy the project root to Vercel. No React/Vite build step is required.

Environment variables still use the existing names:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_DATABASE_URL` (if your existing setup uses it)
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `SESSION_SECRET`
- `IMGBB_API_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `ADMIN_PASSWORD`
