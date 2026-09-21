# Qikly Shop — Vanilla HTML/CSS/JS Diwali Build

This version removes React/Vite/Lucide from the storefront. The customer and admin UIs are plain HTML/CSS/JavaScript, while the existing Node serverless API remains for secure Firebase Admin, Razorpay, Gemini and ImgBB operations.

## Deploy on Vercel

1. Upload the project or connect the repository.
2. Do not add a build command. The website is already static.
3. Keep the same environment variables from the existing Qikly project.
4. Open `/` for the store and `/admin` or `/admin.html` for admin.

## Preserved backend integrations

- Firebase Admin / Firestore
- Razorpay server order creation + signature verification
- Gemini API through the existing `/api/chatbot`
- ImgBB admin image upload endpoint
- Existing user/admin session cookies and API routes

## Frontend

- `index.html` — storefront shell
- `app.js` — shopping, account, cart, checkout, orders, AI chat
- `style.css` — responsive Diwali design
- `admin.html` — admin shell
- `admin.js` — admin controls
