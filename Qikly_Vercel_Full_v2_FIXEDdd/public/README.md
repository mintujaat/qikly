# Qikly Books — Professional E-book Store

A premium digital bookstore using the same Firebase + Razorpay setup, with Cloudflare R2 for private PDF storage.

## Included
- Fast-loading responsive storefront
- Home, Store, Categories, Book Details, Checkout and My Library
- Professional Login / Signup explaining that the account is only for saving purchased e-books
- Ownership badges: **You own this book**
- Sticky responsive navigation with **My Library / My Books**
- Qikly AI assistant powered by Gemini via a server-side endpoint
- Admin e-book editor
- PDF upload to private Cloudflare R2 through signed URLs
- Cover thumbnail upload through ImgBB from the admin panel
- Firebase Firestore for catalog, users and orders
- Razorpay checkout and server-side payment signature verification

## Required environment variables
Keep the existing Firebase and Razorpay variables and add:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET=pdfs`
- `IMGBB_API_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional; defaults to `gemini-3.6-flash`)
- `SESSION_SECRET`
- `ADMIN_PASSWORD`

## ImgBB thumbnail workflow
Admin → Add/Edit e-book → Upload thumbnail → image is sent to `/api/admin/cover-upload` and then to ImgBB. The ImgBB key stays server-side.

## Gemini AI workflow
The floating Qikly AI chat calls `/api/ai/chat`. The Gemini key stays server-side and the model receives a small live catalog context so it can answer book and library questions.

## Deployment
Deploy the project to Vercel. Redeploy after changing environment variables. Keep the R2 bucket private; paid PDFs should only be accessed through the authenticated library endpoint.
