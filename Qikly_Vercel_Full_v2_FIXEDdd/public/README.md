# Qikly E-Book Store

This is a complete redesign of the previous Qikly shopping site into a premium e-book marketplace.

## Kept
- Firebase/Firestore backend and session-based authentication
- Razorpay payment gateway
- Admin-controlled content
- Vercel deployment model

## Added
- E-book catalog, categories, search and filters
- Book detail pages
- Razorpay one-time checkout
- My Library
- Secure time-limited R2 download links
- Admin dashboard for books, orders, categories and store settings
- R2 direct browser uploads using server-generated presigned URLs
- Responsive dark/light UI

## Environment
Copy `.env.example` to your Vercel environment variables. Keep R2 credentials server-side only.

R2 credentials are used only by the server to create short-lived presigned PUT/GET URLs. The browser never receives the Access Key or Secret Access Key.

Your existing Worker URL can remain, but this build uses the S3-compatible R2 API for secure uploads/downloads, so a public Worker route is not required for paid books.

## Firestore collections
- `settings/main`
- `categories`
- `books`
- `users`
- `orders`

The API creates sample categories/books only when the catalog is empty.
