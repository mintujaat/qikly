# NGO Donation Platform

This build replaces the old AstroSage/Qikly experience with a two-page NGO donation website:

- `/` — public donation website
- `/admin.html` — protected admin panel
- Firebase Firestore — banners, FAQs, NGO content, theme, chatbot settings and donations
- Razorpay — donation checkout + server-side signature/payment verification
- Gemini — donation-support chatbot whose name/topic/prompt are controlled from admin

## Firestore collections

- `settings/main`
- `banners/*`
- `faq/*`
- `donations/*`
- `chatbot/main`

## First setup

1. Create a Firebase project and enable Firestore.
2. Put the Firebase service-account JSON into `FIREBASE_SERVICE_ACCOUNT_JSON` in Vercel.
3. Put Razorpay live/test key values into `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
4. Put your Gemini API key into `GEMINI_API_KEY` and optionally set `GEMINI_MODEL`.
5. Set a strong `ADMIN_PASSWORD`.
6. Deploy to Vercel.
7. Open `/admin.html`, log in, save NGO settings, add banners and FAQs, then use the sample-supporter seeder if you want 400–500 demo leaderboard rows.

## Banner images

The admin panel uses public HTTPS image URLs for banners. This keeps the first build simple and avoids introducing a separate image-storage service. Add as many banners as you need; the public site rotates them every 3 seconds.

## Notes

- Seed supporters are stored with `seed: true` and can be replaced from the admin panel.
- Real paid donations are `seed: false` and are never deleted by the sample-supporter seeder.
- Donation amount and payment status are server-controlled.
- Never expose `RAZORPAY_KEY_SECRET`, Firebase service-account JSON, or `GEMINI_API_KEY` in client-side code.
