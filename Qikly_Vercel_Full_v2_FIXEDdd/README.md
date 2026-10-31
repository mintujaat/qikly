# Qikly Request Portal

Qikly Request Portal is a mobile-friendly, admin-configurable form and payment workflow built on the existing Qikly backend.

## User page (`/`)

- The administrator controls the public form title, description, fee, announcement and confirmation text.
- The form is built dynamically from admin-created fields. Supported field types: short text, long text, number, email, phone, date, time, date and time, dropdown, single choice, checkbox and website URL.
- Fields can be added, removed, reordered, marked required and configured with placeholder text, help text, choices and numeric minimum/maximum values.
- A **Map location** field lets users tap the OpenStreetMap map, drag a pin or optionally use browser geolocation. The request stores latitude, longitude, the optional building/landmark label and whether the source was a map pin or device location.
- Users complete the current published form, agree to the confirmation text and pay through the existing Razorpay checkout.
- Payment is verified server-side before a submission is added to the paid request queue.
- Users can see their submitted field values, wallet payment amount, referral code used, payment status, request status and admin reply after signing in from any device.
- User accounts are required before submitting a form. Email/password signup and signin use server-side scrypt password hashing and a signed HttpOnly session cookie. Users can also sign in or register with Google through Firebase Authentication using the Firebase JavaScript SDK. The backend verifies Firebase ID tokens with the Firebase Admin SDK before linking or creating the Qikly account. Verified Google email addresses can be linked to an existing email/password account without creating a second wallet or losing its referral history. Paid requests are linked to the account, with a device token retained as an additional checkout check.
- The portal must not be used to collect passwords, OTPs, UPI PINs, ATM PINs or other confidential credentials.
- The map uses OpenStreetMap tiles and requires an internet connection. Device location is requested only when the user taps **Use my current location**; manual pin selection is also available.

## Admin page (`/admin.html`)

- Uses the existing `/api/admin/login` session and `ADMIN_PASSWORD` environment variable.
- Build the public form by adding as many as 40 fields, selecting each field type, editing labels and placeholders, adding help text or choices, setting numeric limits and marking fields required.
- Set the form title, description, payment fee, announcement and confirmation text.
- View all successfully paid submissions, their saved form fields, amount, Razorpay payment ID, request ID and submission time.
- Update a request status and send a reply. The reply appears in the user's submission list in the same browser.
- The admin console has separate **Requests**, **Referrals & wallets**, and **Settings** navigation sections. The account ledger also shows profile photos, email addresses, authentication methods, signup timestamps and last-login timestamps. Paid requests appear under Requests; account balances, referral codes and successful reward ledger entries appear under Referrals & wallets; the form builder, announcement, terms, payment fee and referral reward amount are kept under Settings.
- Map submissions show an embedded map preview, coordinates and a Google Maps link in the request details.

## Backend and storage

The configurable form workflow reuses the existing `attendanceRequests` Firestore collection, `attendanceSettings/main` document, admin session and Razorpay credentials. Each new request stores a snapshot of the field labels/types and the values submitted by the user, so later form edits do not change old submissions.

Routes used:

- `GET /api/auth/me`, `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/google` (verifies Firebase Auth ID tokens), `POST /api/auth/logout`
- `GET /api/user/referrals`
- `GET /api/attendance/config`
- `POST /api/attendance/order/create` (requires a signed-in user; accepts an optional referral code and wallet-use selection)
- `POST /api/attendance/order/verify` (server-verifies Razorpay and atomically settles wallet / referral credits)
- `POST /api/attendance/order/cancel` (releases reserved wallet balance if checkout is cancelled)
- `GET /api/attendance/requests` (account-scoped request history)
- `GET /api/admin/attendance/data`
- `GET /api/admin/attendance/referrals` (account balances and referral reward ledger; admin-only)
- `POST /api/admin/attendance/settings`
- `POST /api/admin/attendance/reply`

The rest of the Qikly API, wallet, shop, admin authentication and existing payment routes are retained.

## Environment variables

Keep the existing Vercel values. Add the Firebase Web App settings below to enable Google sign-in:

- `FIREBASE_SERVICE_ACCOUNT_JSON` (existing server-only Firebase Admin service account JSON)
- `FIREBASE_DATABASE_URL` (when used by the existing project)
- `FIREBASE_PROJECT_ID` (Firebase project ID)
- `FIREBASE_WEB_API_KEY` (Firebase Web App `apiKey`; public browser configuration)
- `FIREBASE_AUTH_DOMAIN` (Firebase Web App `authDomain`, usually `<project-id>.firebaseapp.com`)
- `FIREBASE_APP_ID` (Firebase Web App `appId`)
- `FIREBASE_MESSAGING_SENDER_ID` (optional; Web App `messagingSenderId`)
- `FIREBASE_STORAGE_BUCKET` (optional; Web App `storageBucket`)
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `SESSION_SECRET`
- `ADMIN_PASSWORD`
- `IMGBB_API_KEY` (existing shop infrastructure)
- `GEMINI_API_KEY` and `GEMINI_MODEL` (existing chatbot infrastructure)

`FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID` and `FIREBASE_APP_ID` are the standard Firebase Web App configuration values. They are returned to the browser by `/api/attendance/config`; do not place the Firebase Admin service-account private key in frontend code. No `GOOGLE_CLIENT_ID` environment variable is used by this Firebase Auth implementation.

Open `/admin.html`, sign in with the existing admin password, configure the form and fee, then save. The public form uses the saved configuration. The payment button remains unavailable until a fee and Razorpay credentials are configured.

## Referral rewards and wallet

- Every account receives a unique referral code. Users can copy a share link that pre-fills the code.
- The form's referral-code field is optional. A valid form code is attached to that paid request; when the field is blank, a valid signup referrer is used if the account was originally referred.
- The default reward is ₹3 per successfully verified paid form transaction. The admin can adjust the rate in Settings. Invalid codes and self-referrals are rejected.
- Rewards are credited to the referrer's `wallets/{uid}` balance and `bonusBalance`, with a deterministic transaction ledger ID per paid request to prevent duplicate rewards if the payment verification endpoint is retried.
- Users can tick **Use my wallet balance** to pay fully or partially from their wallet. Wallet funds are reserved during checkout, spent only after successful payment, and released if checkout is cancelled or the reservation expires. Full-wallet payments do not open Razorpay; the server marks the request paid after an atomic wallet debit.
- The admin **Referrals & wallets** section lists account balances, referral codes, earned totals and each successful reward transaction.

## Important limitations

- The portal collects submissions, verifies payments, tracks status and delivers admin replies. It does not automatically perform actions in third-party services or guarantee approval/outcomes.
- Do not configure fields that ask users for passwords, OTPs, UPI PINs, ATM PINs or recovery codes.
- User accounts use a signed HttpOnly cookie. The device token is stored in local storage and remains an additional check for payment verification; clearing browser/site data during an open payment can require restarting checkout.
- Older paid attendance submissions remain visible in the admin queue and their legacy fields are displayed where available.

## Deploy

Deploy the project root to Vercel. No frontend build step or additional npm dependency is needed.

## Attendance account, referral and wallet flow

- Users must sign up or sign in before accessing the dynamic request form.
- Every new account receives a unique referral code. Referral links use `/?ref=CODE` and prefill the signup and optional form referral-code fields.
- A form may include an optional referral code. If it is blank, the signup referrer is used when available. Self-referrals and invalid codes are rejected.
- The attendance referral reward defaults to ₹3 and is configurable under Admin → Settings. The reward is credited only after a Razorpay payment is verified as captured or a wallet-only payment completes.
- Referral credits are recorded in `transactions` with type `referral_bonus` and source `attendance_form`. Deterministic transaction IDs prevent duplicate credits when payment verification is retried.
- Users can select “Use my wallet balance” for full or partial form payment. Referral bonus funds are applied first, then deposit balance, then earnings. Wallet funds are reserved during checkout and returned when checkout is cancelled or the reservation expires.
- Admin → Referrals & wallets lists registered accounts, referral codes, current wallet buckets, join/last-login times, successful referral credits, and the latest 300 account transactions.
- User passwords are scrypt-hashed on the server. Password hashes are never included in user or admin API responses. Firestore writes continue to go through the server-side Firebase Admin SDK.


## Firebase Google sign-in setup

1. Open the existing project in the [Firebase Console](https://console.firebase.google.com/).
2. Go to **Authentication → Sign-in method** and enable **Google**. Choose the support email and save.
3. Go to **Authentication → Settings → Authorized domains** and add the deployed Vercel domain and any custom domain used by the website.
4. Open **Project settings → General → Your apps**. Register a **Web app** if the project does not already have one, then copy its Firebase SDK configuration values.
5. In Vercel → **Settings → Environment Variables**, add `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN`, and `FIREBASE_APP_ID`. The `FIREBASE_AUTH_DOMAIN` value should match the Web App config exactly. `FIREBASE_MESSAGING_SENDER_ID` and `FIREBASE_STORAGE_BUCKET` are optional for this sign-in flow.
6. Keep the existing `FIREBASE_SERVICE_ACCOUNT_JSON` server-side value. It must belong to the same Firebase project as the Web App configuration so Firebase Admin can verify the browser's ID token.
7. Redeploy the Vercel project. The **Continue with Google** button appears when the Web App configuration is complete. Desktop browsers use a popup; mobile browsers use Firebase's redirect flow.

When Google sign-in succeeds, the backend verifies the Firebase ID token with Firebase Admin, then creates or links the Qikly account. New accounts receive the normal referral code and wallet; existing email/password users keep their original wallet and referral history. The admin account ledger displays the Firebase Google user's profile image, display name, email, sign-in method, signup time and last-login time.
