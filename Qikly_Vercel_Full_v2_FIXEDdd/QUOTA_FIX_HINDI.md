# Firebase `8 RESOURCE_EXHAUSTED: Quota exceeded` — fix notes

इस update में Firestore पर अनावश्यक reads कम किए गए हैं:

1. Public website अब पूरी imported catalogue नहीं पढ़ती; सिर्फ `active == true` services पढ़ती है। Pending/Rejected services customer page पर fetch नहीं होतीं।
2. Admin overview में users/services/orders/payments की पूरी documents list download करने के बजाय Firestore `count()` और `sum()` aggregation queries इस्तेमाल होती हैं।
3. Admin dashboard अब शुरू में सिर्फ overview load करता है। Services, Orders, Customers और Transactions की बड़ी tables तभी load होती हैं जब वह tab खोला जाता है।
4. Admin tables सीमित latest records दिखाती हैं, ताकि हर बार बहुत पुराना data download न हो।
5. LuvSMM service sync अब हर batch में 100 document references को `getAll()` से पढ़ता है; 250 concurrent individual reads नहीं चलाता।
6. Quota error आने पर UI में Firebase Usage page देखने का स्पष्ट संदेश दिखेगा।

## Deploy

1. इस ZIP को extract करें।
2. पूरा folder GitHub repository में पुराने project files की जगह upload/replace करें।
3. Vercel में वही existing Firebase, Razorpay, LuvSMM और session Environment Variables रखें।
4. Redeploy करें।
5. पहले home page खोलें; फिर Admin → Overview खोलें। Service catalogue sync सिर्फ जरूरत होने पर करें।

## Firebase में usage जाँचें

Firebase Console → Build / Databases & Storage → Firestore Database → Usage खोलें। Reads, Writes और Deletes का chart देखें। Google Cloud Console → Firestore API → Quotas में request-rate limits भी जाँचें।

Cloud Firestore की Free quota में सामान्यतः 50,000 document reads/day और 20,000 writes/day शामिल होते हैं; daily quota midnight Pacific time के आसपास reset होती है। वास्तविक project usage Firebase Console में ही देखें। अगर quota पहले ही exhaust हो चुकी है, तो code redeploy करने से उसी समय quota reset नहीं होगी; reset/limit recovery का इंतज़ार करना होगा या billing enable करने से पहले Google Cloud billing budget/alerts सेट करें।

## Important

ये code-side read optimizations हैं। आपके Firebase project के live quota metrics और billing plan तक मेरी पहुँच नहीं है, इसलिए exact exhausted quota (reads, writes, request rate, या कोई दूसरी Firebase service) की पुष्टि Firebase Usage/Cloud Quotas panel से ही होगी।
