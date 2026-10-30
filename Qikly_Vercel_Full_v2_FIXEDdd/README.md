# Qikly Attendance

Qikly Attendance is a two-page request portal built on the existing Qikly backend.

## User page (`/`)

- Attendance request form for college account ID, class time and teacher name.
- Admin-configured request fee displayed before checkout.
- Razorpay checkout using the existing `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` environment variables.
- Payment is verified server-side before a request enters the admin queue.
- User can view paid requests, request status and admin replies from the same browser.
- Browser-local random token links a request to that browser; a limited set of device details is kept for admin context.
- No college password or OTP is requested or stored.
- The terms require requests to be for authorised attendance corrections or administrative support. Payment does not guarantee a change to college records.

## Admin page (`/admin.html`)

- Uses the existing `/api/admin/login` session and `ADMIN_PASSWORD` environment variable.
- Shows paid requests only, with payment amount, request ID, college account ID, class time, teacher and limited browser/device metadata.
- Admin can set the request fee and the public marquee announcement.
- Admin can set a request status and send a reply. The reply appears in the same browser's user request list.

## Backend additions

The attendance workflow adds these routes in `api/index.js`:

- `GET /api/attendance/config`
- `POST /api/attendance/order/create`
- `POST /api/attendance/order/verify`
- `GET /api/attendance/requests`
- `GET /api/admin/attendance/data`
- `POST /api/admin/attendance/settings`
- `POST /api/admin/attendance/reply`

Attendance documents are stored in Firestore collection `attendanceRequests`; public settings are stored in `attendanceSettings/main`. Existing user, wallet, investment, shop, admin-auth and Razorpay routes remain in place.

## Environment variables

No new environment variables are required. Keep the existing values and names:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_DATABASE_URL` (when used by the existing project)
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `SESSION_SECRET`
- `ADMIN_PASSWORD`
- `IMGBB_API_KEY` (existing shop infrastructure)
- `GEMINI_API_KEY` and `GEMINI_MODEL` (existing chatbot infrastructure)

Set the existing Firebase Admin and Razorpay values in Vercel. Open `/admin.html`, sign in with the existing admin password, and set an attendance fee and marquee announcement before accepting requests. The public payment button stays disabled until the fee and Razorpay configuration are ready.

## Important limitations

This portal manages request intake, payment verification, status and admin replies. It does not sign in to a college system or make attendance changes automatically. Do not collect third-party college passwords, OTPs or recovery codes. The browser token is stored in local storage; clearing browser/site data or changing browsers/devices can remove access to the request history for that browser.

## Deploy

Deploy the project root to Vercel. No frontend build step or additional npm dependency is needed.
