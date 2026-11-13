# Mintu Social — Hindi Setup Guide

## 1) Vercel par kya rakhna hai

Aapke existing Firebase aur Razorpay project ko dobara banane ki zarurat nahi. Purane project ki existing secret values ko Vercel mein rehne dein. Is panel ke liye ye values set/verify karein:

| Environment variable | Value / source |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Console → Project settings → Service accounts se service-account JSON |
| `RAZORPAY_KEY_ID` | Razorpay Test Mode API Key ID |
| `RAZORPAY_KEY_SECRET` | Razorpay Test Mode API Secret |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook banate waqt aapka khud ka secret |
| `SESSION_SECRET` | kam-se-kam 32 random characters; `openssl rand -hex 32` se bana sakte hain |
| `ADMIN_PASSWORD` | unique, kam-se-kam 12 characters |
| `LUVSMM_API_URL` | `https://luvsmm.com/api/v2` |
| `LUVSMM_API_KEY` | LuvSMM account ki API settings se secret key |
| `LUVSMM_CURRENCY` | `INR` ya supplier API rate ki actual currency |
| `USD_TO_INR_RATE` | Sirf tab jab supplier rates USD mein aate hon; current rate set karein |
| `DEFAULT_MARKUP_PERCENT` | default selling markup, jaise `30` |
| `SITE_NAME` | `Mintu Social` ya apna brand |

`LUVSMM_API_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, Firebase service-account JSON aur `SESSION_SECRET` ko browser code ya GitHub mein kabhi na daalein.

## 2) Deploy kaise karna hai

1. ZIP extract karein.
2. `mintu-social-panel` folder ke andar ka code GitHub repository mein upload karein.
3. Vercel mein repository import karein; Framework Preset `Other` rahe.
4. Vercel → Settings → Environment Variables mein upar wali values add karein.
5. Deploy karein.
6. `https://YOUR_DOMAIN/health` kholkar check karein ki Firebase, Razorpay aur LuvSMM configured show ho rahe hain.
7. Firebase Console → Firestore Database → Rules mein project ka `firestore.rules` publish karein.

## 3) Admin panel kaise chalana hai

- `https://YOUR_DOMAIN/admin` open karein.
- `ADMIN_PASSWORD` se login karein.
- Service Catalogue mein **Import / sync all** press karein.
- LuvSMM ki complete returned list Firestore ke `smmServices` collection mein import hogi.
- Har row ke **Review** button se service ka naam, description, supplier ID/rate, min/max quantity, refill/cancel aur selling price dekhein.
- Service ko khud check karein. Confirm checkbox tick karne ke baad **Approve & publish** ya **Reject & hide** select karein.
- Approved service ko baad mein Pause/Publish kar sakte hain. Rejected service customer ko nahi dikhegi.
- Purane version ki `Blocked` services agle **Import / sync all** par `Needs review` mein aa jayengi. Supplier ka naam, description, rate, type, quantity limit ya refill/cancel details badalne par approved service bhi dobara review queue mein chali jayegi.
- Manual service banane par bhi woh pehle review queue mein aayegi.
- Supplier balance button se LuvSMM balance check karein.

Ab koi service name keyword ke basis par automatic block nahi hoti. Koi bhi imported service apne aap customer ko visible nahi hoti: har service ko admin ka manual approval chahiye. Admin ko supplier terms, service quality, applicable platform rules, local law aur customer disclosure ko check karke hi approve karna chahiye.

## 4) Customer ka flow

1. Customer website par email/password se signup/login karta hai.
2. Add Funds se Razorpay Checkout khulta hai.
3. Server payment signature aur captured amount verify karke hi Firestore wallet credit karta hai.
4. Customer available service choose karke target URL aur quantity submit karta hai.
5. Server wallet balance check karta hai, order create karta hai aur admin-approved LuvSMM supplier service ko order bhejta hai.
6. Supplier order ID customer order ke saath save hoti hai.
7. Admin → Orders → **Sync supplier statuses** se latest status fetch hota hai.

## 5) Important checks

- Pehle Razorpay Test Mode hi use karein. Test recharge aur test order verify hone ke baad hi live keys use karein.
- `LUVSMM_CURRENCY` ko apne API response se confirm karein. USD rate ho to `USD_TO_INR_RATE` set karein; galat currency se selling price galat banegi.
- First service sync ke baad prices verify karein. Existing manually edited selling prices later sync mein preserve rehti hain. Supplier details change hone par service dobara review queue mein aati hai.
- Is build mein LuvSMM ke `services`, `add`, `status` aur `balance` actions wired hain. `refill`, `refill_status` aur `cancel` ke admin workflows abhi include nahi hain.
- LuvSMM ke kuch service types ko normal URL + quantity ke alawa special inputs chahiye (jaise keywords, usernames, comments, runs/interval ya subscription settings). Is build ka customer order form abhi standard URL + quantity flow use karta hai, isliye un special types ko extra form fields add kiye bina “fully supported” nahi maana ja sakta.
- Order status sync admin se manually trigger hota hai; background scheduler configured nahi hai.
- Refund customer ke internal website wallet mein credit hota hai, original UPI/card/bank method par automatic refund nahi.
- Real payments lene se pehle Razorpay se apne service/business category ki approval aur refund/terms pages confirm karein.
