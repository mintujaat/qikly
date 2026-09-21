# Qikly Diwali Shopping Store

This version keeps the existing Qikly backend/payment infrastructure intact and updates the public storefront and admin UI into a modern Diwali shopping experience.

## What changed
- Pure HTML + CSS + JavaScript storefront.
- Diwali-themed responsive home page with search, categories, filters, wishlist and cart.
- Product cards are sourced from the existing `investmentPlans` collection so the existing Firebase data and purchase endpoint continue to work.
- Checkout continues through the existing Qikly wallet/Razorpay flow. `api/index.js`, `package.json`, `vercel.json`, rules and environment-variable names were not changed.
- Admin panel product section uses the existing plan-management API and existing ImgBB upload endpoint.
- Existing AI/Gemini support flow is retained.
- Login, profile, wallet, transactions, withdrawals and account flows remain available.
- Light/dark theme works with the existing theme toggle.

## Deploy
Deploy this folder to Vercel exactly like the original project. Keep the same environment variables from the working project.

The API/payment backend was intentionally left unchanged.
