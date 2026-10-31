# Qikly Request Portal

Qikly Request Portal is a mobile-friendly, admin-configurable form and payment workflow built on the existing Qikly backend.

## User page (`/`)

- The administrator controls the public form title, description, fee, announcement and confirmation text.
- The form is built dynamically from admin-created fields. Supported field types: short text, long text, number, email, phone, date, time, date and time, dropdown, single choice, checkbox and website URL.
- Fields can be added, removed, reordered, marked required and configured with placeholder text, help text, choices and numeric minimum/maximum values.
- A **Map location** field lets users tap the OpenStreetMap map, drag a pin or optionally use browser geolocation. The request stores latitude, longitude, the optional building/landmark label and whether the source was a map pin or device location.
- Users complete the current published form, agree to the confirmation text and pay through the existing Razorpay checkout.
- Payment is verified server-side before a submission is added to the paid request queue.
- Users can see their submitted field values, payment status, request status and admin reply from the same browser.
- A browser-local random token links a submission to the browser that created it. A limited set of device details is kept for admin context.
- The portal must not be used to collect passwords, OTPs, UPI PINs, ATM PINs or other confidential credentials.
- The map uses OpenStreetMap tiles and requires an internet connection. Device location is requested only when the user taps **Use my current location**; manual pin selection is also available.

## Admin page (`/admin.html`)

- Uses the existing `/api/admin/login` session and `ADMIN_PASSWORD` environment variable.
- Build the public form by adding as many as 40 fields, selecting each field type, editing labels and placeholders, adding help text or choices, setting numeric limits and marking fields required.
- Set the form title, description, payment fee, announcement and confirmation text.
- View all successfully paid submissions, their saved form fields, amount, Razorpay payment ID, request ID and submission time.
- Update a request status and send a reply. The reply appears in the user's submission list in the same browser.
- The admin console has separate **Requests** and **Settings** navigation sections. Paid requests appear under Requests; the form builder, announcement, terms and payment fee are kept under Settings.
- Map submissions show an embedded map preview, coordinates and a Google Maps link in the request details.

## Backend and storage

The configurable form workflow reuses the existing `attendanceRequests` Firestore collection, `attendanceSettings/main` document, admin session and Razorpay credentials. Each new request stores a snapshot of the field labels/types and the values submitted by the user, so later form edits do not change old submissions.

Routes used:

- `GET /api/attendance/config`
- `POST /api/attendance/order/create`
- `POST /api/attendance/order/verify`
- `GET /api/attendance/requests`
- `GET /api/admin/attendance/data`
- `POST /api/admin/attendance/settings`
- `POST /api/admin/attendance/reply`

The rest of the Qikly API, wallet, shop, admin authentication and existing payment routes are retained.

## Environment variables

No new environment variables are required. Keep the existing Vercel values:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_DATABASE_URL` (when used by the existing project)
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `SESSION_SECRET`
- `ADMIN_PASSWORD`
- `IMGBB_API_KEY` (existing shop infrastructure)
- `GEMINI_API_KEY` and `GEMINI_MODEL` (existing chatbot infrastructure)

Open `/admin.html`, sign in with the existing admin password, configure the form and fee, then save. The public form uses the saved configuration. The payment button remains unavailable until a fee and Razorpay credentials are configured.

## Important limitations

- The portal collects submissions, verifies payments, tracks status and delivers admin replies. It does not automatically perform actions in third-party services or guarantee approval/outcomes.
- Do not configure fields that ask users for passwords, OTPs, UPI PINs, ATM PINs or recovery codes.
- The browser token is stored in local storage. Clearing browser/site data or changing browser/device can remove access to that browser's submission history.
- Older paid attendance submissions remain visible in the admin queue and their legacy fields are displayed where available.

## Deploy

Deploy the project root to Vercel. No frontend build step or additional npm dependency is needed.
