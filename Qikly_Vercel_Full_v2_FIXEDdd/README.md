# AstroSage AI — Chat Fix v3

## Changes in this build
- Chat typing indicator is now an in-chat WhatsApp-style bubble, not a fixed overlay.
- Paid plan cards remain inline inside the chat; no blocking plan popup.
- After successful Razorpay verification, plan cards are cleared/hidden and the paid session starts immediately.
- AI Guru admin list now has a **Show on website** checkbox for every Guru.
- Unchecked Gurus are excluded from the public site.
- Guru edit/delete actions are preserved; Guru delete now correctly targets `aiGurus`.
- Added a dedicated protected endpoint for toggling Guru visibility without overwriting other Guru fields.
- Plan editor now reads/writes `durationMinutes` correctly.

## Deployment
Keep existing Vercel environment variables. No new secret is required by this fix.


## Free test plan
Set `ENABLE_FREE_TEST_PLAN=true` in Vercel while testing. It adds a ₹0 `Free Test` report plan without requiring Razorpay. Set it back to `false` (or remove it) after testing.
