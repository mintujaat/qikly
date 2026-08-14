# Qikly v2 — Full Vercel package

Deploy the WHOLE folder as one Vercel project. It contains the public website and backend API.

## Checkout fields
- Telegram Username, e.g. @mintu
- Telegram Name

Both are stored in orders and subscriptions.

## Admin
Open `/admin.html`.
Admin uses ONE password only. The requested password is configured as:
`ADMIN_PASSWORD=mintu@admin.in`

For production, change this environment variable to a stronger secret. Do not hardcode it into frontend code.

## Vercel variables
- RAZORPAY_KEY_ID
- RAZORPAY_KEY_SECRET
- RAZORPAY_WEBHOOK_SECRET
- ADMIN_PASSWORD
- FIREBASE_SERVICE_ACCOUNT_JSON

## Health check
After deployment:
`https://YOUR-DOMAIN.vercel.app/api/health`

## Razorpay webhook
Create after deployment:
`https://YOUR-DOMAIN.vercel.app/api/webhook/razorpay`

Use a separate webhook secret in Razorpay and the same value in `RAZORPAY_WEBHOOK_SECRET`.

## Important
Never expose Razorpay Key Secret or Firebase service-account JSON in public files.
