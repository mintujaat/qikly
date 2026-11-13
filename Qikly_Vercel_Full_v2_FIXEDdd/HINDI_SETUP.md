# Mintu SMM Panel — Supabase Setup (Hindi)

यह build Firebase/Firestore की जगह Supabase PostgreSQL इस्तेमाल करता है। आपने **Fresh Start** चुना है, इसलिए पुराने Firebase users, wallet balance, orders और passwords migrate नहीं होंगे। नए customers को फिर से signup करना होगा।

## Step 1 — SQL schema चलाओ

1. Supabase Dashboard खोलो: https://supabase.com/dashboard/project/rhpwlxivnoupnjktesih
2. बाईं तरफ **SQL Editor** → **New query** खोलो।
3. इस project के `supabase/schema.sql` की पूरी SQL copy करो और editor में paste करो।
4. **Run** दबाओ। पूरा script successful होना चाहिए।
5. Table Editor में ये tables दिखनी चाहिए:
   - `smm_users`
   - `smm_services`
   - `smm_orders`
   - `smm_wallet_payments`
   - `smm_transactions`
   - `smm_settings`

SQL script केवल ये नई SMM tables/functions बनाता है; Firebase या पुरानी YaadPage/Qikly data को modify नहीं करता।

## Step 2 — Supabase Secret Key निकालो

Supabase → **Project Settings → API Keys** खोलो। नया `sb_secret_...` Secret Key copy करो। इसे मुझे chat में मत भेजना। इसे केवल Vercel में add करना है। अगर अभी नए keys न दिखें तो पुराने `service_role` key को temporary backend key की तरह इस्तेमाल कर सकते हो। दोनों keys पूरी तरह private रखें।

तुम्हारा Project URL पहले से code/config में set है:

`https://rhpwlxivnoupnjktesih.supabase.co`

## Step 3 — Vercel Environment Variables

Vercel → अपना Project → Settings → Environment Variables में जाओ। ये दो नए required variables add करो:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://rhpwlxivnoupnjktesih.supabase.co` |
| `SUPABASE_SECRET_KEY` | तुम्हारा `sb_secret_...` key |

बाकी पुराने Razorpay और LuvSMM values वही रखो:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `SESSION_SECRET`
- `ADMIN_PASSWORD`
- `LUVSMM_API_URL`
- `LUVSMM_API_KEY`
- `LUVSMM_CURRENCY`
- `USD_TO_INR_RATE` (केवल जब supplier rate USD में हो)
- `SITE_NAME`
- `DEFAULT_MARKUP_PERCENT`

`FIREBASE_SERVICE_ACCOUNT_JSON` और `FIREBASE_DATABASE_URL` अब जरूरी नहीं हैं। नया build successful चलने के बाद Firebase variables हटा सकते हो।

`SESSION_SECRET` बनाने के लिए:

```bash
openssl rand -hex 32
```

`SUPABASE_SECRET_KEY`, Razorpay secret, LuvSMM key और `.env` को GitHub/frontend में कभी upload मत करना।

## Step 4 — GitHub और Vercel deploy

1. ZIP extract करो।
2. `mintu-social-panel` folder के अंदर की सारी files GitHub repository में पुरानी files के ऊपर replace करो।
3. Vercel redeploy करो। Framework preset `Other` ही रखो।
4. Deployment के बाद `https://YOUR_DOMAIN/health` खोलो। JSON में `"supabase":true` आना चाहिए।
5. `/admin` खोलो और `ADMIN_PASSWORD` से login करो।
6. Services tab → **Import / sync all** दबाओ। Imported services पहले `Needs review` में आएँगी।
7. हर service का rate/details check करके price set करो और Approve या Reject करो।

## Step 5 — Razorpay test

पहले Razorpay Test Mode में ₹50 का wallet recharge करके देखो। Wallet में एक ही deposit transaction बननी चाहिए। उसके बाद approved service पर छोटा test order लगाओ। Live Mode केवल सारे tests successful होने के बाद चालू करना।

Webhook URL:

`https://YOUR_DOMAIN/api/razorpay/webhook`

Razorpay dashboard में `payment.captured` और `order.paid` events select करो और वही webhook secret Vercel के `RAZORPAY_WEBHOOK_SECRET` में डालो।

## सिस्टम कैसे काम करेगा?

- Signup/login: PostgreSQL में account + scrypt password hash; secure HttpOnly cookie.
- Wallet: Razorpay payment verify होने पर PostgreSQL function एक transaction में balance और ledger update करेगा।
- Services: LuvSMM catalogue automatic import होकर `smm_services` में save होगी। New/changed services manual admin review में जाएँगी।
- Orders: PostgreSQL function wallet balance check, deduction, order और ledger entry atomic तरीके से बनाएगा।
- Status: Admin supplier status sync करेगा।
- Refund: PostgreSQL function wallet credit, order status और refund ledger एक transaction में update करेगा।

## ध्यान दें

- SQL schema चलाए बिना website API काम नहीं करेगी।
- Fresh start है: पुराने Firebase customers और balances नहीं आएँगे।
- इस version में current email/password flow custom server-side auth से चलता है; Supabase Google OAuth अभी configure नहीं है।
- Live credentials के साथ payment/provider test यहाँ नहीं किया गया है। Launch से पहले Test Mode में पूरा flow जाँचो।
- Supabase Free project inactivity पर pause हो सकता है; current usage/plan dashboard में देखना।
