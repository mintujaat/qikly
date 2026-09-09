# Qikly Invest

This version converts the old Qikly/NGO website into an account-first investment-management style platform while keeping the existing Razorpay-powered AI chat flow available separately.

## User flow

1. User opens `/` and is sent to `/auth.html` until logged in.
2. Signup creates a Firebase-backed user profile and an empty wallet.
3. User can add money to the wallet using Razorpay. The server verifies the Razorpay signature, payment status, order and amount before crediting the wallet.
4. Home shows active investment plans managed from `/admin.html`. Each plan supports:
   - photo
   - title
   - amount
   - duration in days
   - daily credit amount
   - description
5. User activates plans from their wallet balance.
6. Daily credits are calculated from the plan start date and are settled into the wallet on dashboard/transaction/withdrawal operations.
7. User can request a withdrawal. Default minimum is ₹450; the admin can change the minimum from Website Content settings.
8. Withdrawals are held as `pending` until admin manually completes the payout. Rejecting a request returns the reserved amount to the wallet.
9. `/profile.html` shows balance, active/completed plans, profile details, deposit/top-up, withdrawal request and recent activity.
10. `/transactions.html` shows the full transaction history.

## Admin panel

`/admin.html` includes:

- dashboard KPIs
- investment plan builder + ImgBB image upload
- withdrawal approval/rejection queue
- user list, wallet balance and enable/disable controls
- manual wallet balance adjustments
- site name, hero copy, legal text, risk disclosure and minimum withdrawal
- Gemini support chatbot name/topic/prompt
- legacy AI chat plans/guides for the existing paid AI chat flow

## Firestore collections

- `settings/main`
- `users/*`
- `wallets/*`
- `investmentPlans/*`
- `investments/*`
- `transactions/*`
- `withdrawals/*`
- `chatbot/main`
- `aiGurus/*`
- `aiPlans/*`
- `aiOrders/*`
- `aiSessions/*`

## Environment variables

See `.env.example`. Keep the Razorpay secret, Firebase service account, Gemini key, ImgBB key and session secret server-side only.

## Important production note

The displayed plan amounts and daily credits are administrator-configured values. They should not be marketed as guaranteed investment returns. Before processing real user money, the operator should complete the applicable business, KYC, taxation, payment, consumer-protection and financial/regulatory requirements for the jurisdiction in which the service operates.
