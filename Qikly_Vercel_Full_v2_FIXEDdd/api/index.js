const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const admin = require("firebase-admin");

const app = express();
app.use(express.json({ limit: "200kb" }));

if (!admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON");
  const serviceAccount = typeof raw === "string" ? JSON.parse(raw) : raw;
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL || undefined,
  });
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const ADMIN_COOKIE = "ngo_admin";
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "change-this-password");

const defaults = {
  settings: {
    ngoName: "Seva Jyoti Foundation",
    tagline: "Aapki chhoti si madad kisi ki badi zarurat ban sakti hai.",
    heroTitle: "Milkar kisi ki zindagi mein roshni laayein",
    heroText: "Aapka donation education, food, healthcare aur emergency support jaise ground-level kaamon ko fund karne mein madad karta hai.",
    marqueeText: "❤️ Aapka har donation kisi ki umeed ko mazboot banata hai • Thank you for supporting Seva Jyoti Foundation •",
    about: "Seva Jyoti Foundation ek community-focused NGO hai jo zaruratmand parivaron aur bachchon tak practical support pahunchane par kaam karta hai.\n\nHum donations ko ground-level initiatives, education support, food assistance aur emergency help jaise projects mein use karte hain.",
    terms: "Donation karne se pehle amount aur donor name carefully check karein. Payment Razorpay ke secure checkout ke through process hota hai.\n\nWebsite par dikhaya gaya donor ranking social recognition ke liye hai. Refund requests project policy aur applicable payment rules ke subject hain.",
    privacy: "Hum donation complete karne ke liye zaruri information jaise donor name aur payment references process karte hain. Payment credentials humare server par store nahi hote; Razorpay payment processing handle karta hai.\n\nPublic donor wall par wahi donor name dikhaya jata hai jo donation ke waqt submit kiya gaya ho.",
    refund: "Galat ya duplicate payment hone par support team se payment ID ke saath contact karein. Refund approval transaction details aur payment provider ke rules ke mutabik process kiya jayega.",
    supportEmail: "support@example.org",
    theme: {
      primary: "#ff5a36",
      secondary: "#ffb347",
      background: "#fffaf5",
      surface: "#ffffff",
      text: "#202020",
      muted: "#6b625b",
      accent: "#0f8a65",
    },
  },
  chatbot: {
    name: "Sakhi",
    topic: "Explain why a donation matters, answer common NGO questions, and encourage the visitor to donate without making false promises, guilt-tripping, or guaranteeing outcomes.",
    intro: "Namaste ❤️ Main Sakhi hoon. Aap pooch sakte hain ki aapka donation kis tarah help kar sakta hai.",
    prompt: "Be warm, concise, honest and donation-supportive. Encourage action only when appropriate. Never invent projects, statistics, tax benefits, beneficiary stories, government registrations, or impact numbers that are not provided. Never shame a user for not donating. Use Hindi/Hinglish unless the user uses another language.",
  },
};

const clean = (v, max = 5000) => String(v ?? "").trim().slice(0, max);
const cleanHex = (v, fallback) => /^#[0-9a-f]{6}$/i.test(String(v || "")) ? String(v) : fallback;
const num = (v) => Number(v);

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i >= 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function timingSafeEqualText(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function createAdminToken() {
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const body = `admin.${exp}`;
  const sig = crypto.createHmac("sha256", ADMIN_PASSWORD).update(body).digest("hex");
  return `${body}.${sig}`;
}

function isAdmin(req) {
  const token = String(parseCookies(req)[ADMIN_COOKIE] || "").split(".");
  if (token.length !== 3 || token[0] !== "admin" || Number(token[1]) < Date.now()) return false;
  const expected = crypto.createHmac("sha256", ADMIN_PASSWORD).update(`admin.${token[1]}`).digest("hex");
  return timingSafeEqualText(expected, token[2]);
}

function setAdminCookie(res, token) {
  res.setHeader("Set-Cookie", `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
}

const guard = (req, res, next) => isAdmin(req) ? next() : res.status(401).json({ error: "Admin login required." });

function publicSettings(data = {}) {
  const s = { ...defaults.settings, ...data };
  s.theme = { ...defaults.settings.theme, ...(data.theme || {}) };
  return s;
}

async function getDoc(collection, id, fallback) {
  const snap = await db.collection(collection).doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : fallback;
}

async function getPublicData() {
  const [settings, chatbot, bannersSnap, faqSnap, donationsSnap] = await Promise.all([
    getDoc("settings", "main", defaults.settings),
    getDoc("chatbot", "main", defaults.chatbot),
    db.collection("banners").get(),
    db.collection("faq").get(),
    db.collection("donations").get(),
  ]);

  const banners = bannersSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(x => x.active !== false)
    .sort((a, b) => num(a.sortOrder) - num(b.sortOrder));

  const faqs = faqSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(x => x.active !== false)
    .sort((a, b) => num(a.sortOrder) - num(b.sortOrder));

  const donations = donationsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(x => x.status === "paid")
    .sort((a, b) => num(b.amount) - num(a.amount) || String(a.name).localeCompare(String(b.name)))
    .map((x, index) => ({
      id: x.id,
      name: clean(x.name, 100) || "Anonymous",
      amount: num(x.amount) || 0,
      rank: index + 1,
      createdAt: x.createdAt || null,
    }));

  const totalRaised = donations.reduce((sum, d) => sum + d.amount, 0);

  return {
    settings: publicSettings(settings),
    banners,
    faqs,
    topDonors: donations.slice(0, 500),
    donorCount: donations.length,
    totalRaised,
    chatbot: {
      name: clean(chatbot.name, 80) || defaults.chatbot.name,
      intro: clean(chatbot.intro, 500) || defaults.chatbot.intro,
    },
  };
}

async function getRankForDonation(name, amount, donationId) {
  const donations = (await db.collection("donations").get()).docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(x => x.status === "paid")
    .sort((a, b) => num(b.amount) - num(a.amount) || String(a.name).localeCompare(String(b.name)));
  const index = donations.findIndex(x => x.id === donationId);
  return {
    rank: index >= 0 ? index + 1 : donations.filter(x => num(x.amount) > amount).length + 1,
    totalDonors: donations.length,
    name,
    amount,
  };
}

function randomSeedName(index) {
  const first = [
    "Aarav","Aditi","Aditya","Aisha","Aman","Ananya","Aniket","Anjali","Arjun","Avni",
    "Bhavya","Chirag","Diya","Dev","Divya","Eshan","Gauri","Harsh","Isha","Ishaan",
    "Kabir","Kajal","Karan","Kavya","Krish","Kriti","Manav","Meera","Mohit","Naina",
    "Naman","Neha","Nikhil","Nisha","Pooja","Pranav","Priya","Rahul","Riya","Rohan",
    "Sahil","Sakshi","Sameer","Simran","Sneha","Sonam","Tanya","Varun","Vansh","Yash",
  ];
  const last = ["Sharma","Verma","Gupta","Singh","Mehta","Jain","Malhotra","Kapoor","Kumar","Bansal","Saini","Yadav","Joshi","Chauhan","Patel","Agarwal","Mishra","Rana","Arora","Nair"];
  const f = first[index % first.length];
  const l = last[Math.floor(index / first.length) % last.length];
  const suffix = Math.floor(index / (first.length * last.length));
  return `${f} ${l}${suffix ? ` ${suffix + 1}` : ""}`;
}

async function seedSupporters() {
  const snap = await db.collection("donations").where("seed", "==", true).get();
  const batchDelete = db.batch();
  snap.docs.forEach(d => batchDelete.delete(d.ref));
  if (snap.docs.length) await batchDelete.commit();

  const count = 450;
  let batch = db.batch();
  let written = 0;
  for (let i = 0; i < count; i++) {
    const ref = db.collection("donations").doc(`seed_${String(i + 1).padStart(3, "0")}`);
    const amount = [101, 151, 251, 501, 751, 1001, 1501, 2101, 2501, 3101][i % 10] + (i % 7) * 10;
    batch.set(ref, {
      name: randomSeedName(i),
      amount,
      status: "paid",
      seed: true,
      paymentId: `seed_payment_${i + 1}`,
      orderId: `seed_order_${i + 1}`,
      createdAt: new Date(Date.now() - i * 7 * 60 * 1000),
    });
    written++;
    if (written === 450) await batch.commit();
  }
  return { count };
}

async function geminiGenerate(contents, systemInstruction) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini API is not configured on the server.");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const body = {
    contents,
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: { temperature: 0.7, maxOutputTokens: 450 },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error?.message || `Gemini API error (${r.status})`);
  return d.candidates?.[0]?.content?.parts?.map(x => x.text || "").join("").trim() || "Main abhi jawab generate nahi kar pa raha hoon. Aap directly donation box se bhi support kar sakte hain. ❤️";
}

app.get("/api/public/data", async (req, res) => {
  try { res.json(await getPublicData()); }
  catch (e) { console.error(e); res.status(500).json({ error: e.message || "Unable to load public data." }); }
});

app.get("/api/public/config", (req, res) => res.json({ razorpayKeyId: process.env.RAZORPAY_KEY_ID || "" }));

app.post("/api/donation/create-order", async (req, res) => {
  try {
    const name = clean(req.body.name, 100);
    const amount = Math.round(num(req.body.amount));
    if (!name || name.length < 2) return res.status(400).json({ error: "Please enter your name." });
    if (!Number.isInteger(amount) || amount < 1 || amount > 10000000) return res.status(400).json({ error: "Enter a valid donation amount between ₹1 and ₹1,00,00,000." });
    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: `ngo_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      notes: { donorName: name },
    });
    await db.collection("donations").doc(order.id).set({
      orderId: order.id,
      name,
      amount,
      status: "created",
      seed: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    res.json({ ok: true, orderId: order.id, amount: order.amount, currency: order.currency, name });
  } catch (e) {
    console.error(e); res.status(500).json({ error: e.message || "Unable to create donation order." });
  }
});

app.post("/api/donation/verify-payment", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return res.status(400).json({ error: "Incomplete Razorpay response." });
    const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
    if (!timingSafeEqualText(expected, razorpay_signature)) return res.status(400).json({ error: "Payment signature verification failed." });

    const ref = db.collection("donations").doc(razorpay_order_id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Donation order not found." });
    const donation = snap.data();
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (payment.status !== "captured") return res.status(400).json({ error: "Payment has not been captured." });
    if (payment.order_id !== razorpay_order_id) return res.status(400).json({ error: "Payment order does not match." });
    if (num(payment.amount) !== Math.round(num(donation.amount) * 100)) return res.status(400).json({ error: "Payment amount does not match the donation." });

    if (donation.status !== "paid") {
      await ref.update({ status: "paid", paymentId: razorpay_payment_id, verifiedAt: FieldValue.serverTimestamp() });
    }
    const result = await getRankForDonation(donation.name, donation.amount, razorpay_order_id);
    res.json({ success: true, ...result });
  } catch (e) {
    console.error(e); res.status(500).json({ error: e.message || "Payment verification failed." });
  }
});

app.post("/api/chatbot", async (req, res) => {
  try {
    const chatbot = await getDoc("chatbot", "main", defaults.chatbot);
    const settings = await getDoc("settings", "main", defaults.settings);
    const message = clean(req.body.message, 1200);
    if (!message) return res.status(400).json({ error: "Message is required." });
    const history = Array.isArray(req.body.history) ? req.body.history.slice(-8) : [];
    const contents = [];
    history.forEach(item => {
      if (item?.role === "user" || item?.role === "model") contents.push({ role: item.role, parts: [{ text: clean(item.text, 1200) }] });
    });
    contents.push({ role: "user", parts: [{ text: message }] });
    const context = publicSettings(settings);
    const system = `You are ${clean(chatbot.name, 80) || defaults.chatbot.name}, the donation-support assistant for ${clean(context.ngoName, 120)}.\nTopic controlled by admin: ${clean(chatbot.topic, 1800)}\nAdmin behavior instructions: ${clean(chatbot.prompt, 1800)}\nNGO summary: ${clean(context.heroText, 1200)}\nAbout: ${clean(context.about, 2200)}\n\nDo not fabricate facts. Do not guilt-trip the visitor. Do not promise guaranteed outcomes. You may explain why donating can help and invite the visitor to use the donation box. Keep replies conversational and concise.`;
    const answer = await geminiGenerate(contents, system);
    res.json({ ok: true, name: clean(chatbot.name, 80) || defaults.chatbot.name, answer });
  } catch (e) {
    console.error(e); res.status(500).json({ error: e.message || "Chatbot is unavailable right now." });
  }
});

app.post("/api/admin/login", (req, res) => {
  const password = String(req.body.password || "");
  if (!timingSafeEqualText(password, ADMIN_PASSWORD)) return res.status(401).json({ error: "Wrong password." });
  setAdminCookie(res, createAdminToken());
  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  res.setHeader("Set-Cookie", `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  res.json({ ok: true });
});

app.get("/api/admin/me", (req, res) => res.json({ authenticated: isAdmin(req) }));

app.get("/api/admin/data", guard, async (req, res) => {
  try {
    const [publicData, settings, chatbot, bannersSnap, faqSnap, donationsSnap] = await Promise.all([
      getPublicData(),
      getDoc("settings", "main", defaults.settings),
      getDoc("chatbot", "main", defaults.chatbot),
      db.collection("banners").get(),
      db.collection("faq").get(),
      db.collection("donations").get(),
    ]);
    const donations = donationsSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => num(b.amount) - num(a.amount));
    const paid = donations.filter(x => x.status === "paid");
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const toMs = x => x?.toDate?.()?.getTime?.() || new Date(x?.createdAt || x).getTime();
    const today = paid.filter(x => toMs(x.verifiedAt || x.createdAt) >= dayStart);
    const month = paid.filter(x => toMs(x.verifiedAt || x.createdAt) >= monthStart);
    res.json({
      settings: publicSettings(settings), chatbot,
      banners: bannersSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => num(a.sortOrder) - num(b.sortOrder)),
      faqs: faqSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => num(a.sortOrder) - num(b.sortOrder)),
      donations,
      stats: {
        donorCount: paid.length,
        totalRaised: paid.reduce((s, x) => s + num(x.amount), 0),
        todayAmount: today.reduce((s, x) => s + num(x.amount), 0),
        monthAmount: month.reduce((s, x) => s + num(x.amount), 0),
        seedCount: paid.filter(x => x.seed === true).length,
      },
      publicDonorCount: publicData.donorCount,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message || "Unable to load admin data." }); }
});

app.post("/api/admin/settings", guard, async (req, res) => {
  try {
    const b = req.body || {};
    const theme = b.theme || {};
    const payload = {
      ngoName: clean(b.ngoName, 120) || defaults.settings.ngoName,
      tagline: clean(b.tagline, 240),
      heroTitle: clean(b.heroTitle, 240),
      heroText: clean(b.heroText, 1500),
      marqueeText: clean(b.marqueeText, 700),
      about: clean(b.about, 6000), terms: clean(b.terms, 6000), privacy: clean(b.privacy, 6000), refund: clean(b.refund, 6000),
      supportEmail: clean(b.supportEmail, 180),
      theme: {
        primary: cleanHex(theme.primary, defaults.settings.theme.primary),
        secondary: cleanHex(theme.secondary, defaults.settings.theme.secondary),
        background: cleanHex(theme.background, defaults.settings.theme.background),
        surface: cleanHex(theme.surface, defaults.settings.theme.surface),
        text: cleanHex(theme.text, defaults.settings.theme.text),
        muted: cleanHex(theme.muted, defaults.settings.theme.muted),
        accent: cleanHex(theme.accent, defaults.settings.theme.accent),
      },
    };
    await db.collection("settings").doc("main").set(payload, { merge: true });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message || "Unable to save settings." }); }
});

app.post("/api/admin/chatbot", guard, async (req, res) => {
  try {
    await db.collection("chatbot").doc("main").set({
      name: clean(req.body.name, 80) || defaults.chatbot.name,
      topic: clean(req.body.topic, 2500),
      intro: clean(req.body.intro, 700),
      prompt: clean(req.body.prompt, 2500),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message || "Unable to save chatbot settings." }); }
});

app.post("/api/admin/banner", guard, async (req, res) => {
  try {
    const id = clean(req.body.id, 80) || `banner_${Date.now()}`;
    const imageUrl = clean(req.body.imageUrl, 1200);
    if (!/^https:\/\//i.test(imageUrl)) return res.status(400).json({ error: "Banner image must use an HTTPS URL." });
    await db.collection("banners").doc(id).set({
      title: clean(req.body.title, 160), imageUrl, linkUrl: clean(req.body.linkUrl, 1200),
      active: req.body.active !== false, sortOrder: num(req.body.sortOrder) || Date.now(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message || "Unable to save banner." }); }
});

app.post("/api/admin/faq", guard, async (req, res) => {
  try {
    const id = clean(req.body.id, 80) || `faq_${Date.now()}`;
    await db.collection("faq").doc(id).set({
      question: clean(req.body.question, 300), answer: clean(req.body.answer, 2500),
      active: req.body.active !== false, sortOrder: num(req.body.sortOrder) || Date.now(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message || "Unable to save FAQ." }); }
});

app.post("/api/admin/delete", guard, async (req, res) => {
  try {
    const collection = ["banners", "faq"].includes(String(req.body.collection)) ? String(req.body.collection) : "";
    const id = clean(req.body.id, 120);
    if (!collection || !id) return res.status(400).json({ error: "Invalid delete request." });
    await db.collection(collection).doc(id).delete();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message || "Unable to delete record." }); }
});

app.post("/api/admin/seed-supporters", guard, async (req, res) => {
  try { res.json({ ok: true, ...(await seedSupporters()) }); }
  catch (e) { console.error(e); res.status(500).json({ error: e.message || "Unable to seed supporters." }); }
});

app.get("/api/health", (req, res) => res.json({
  ok: true,
  firebaseConfigured: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  razorpayConfigured: !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET,
  geminiConfigured: !!process.env.GEMINI_API_KEY,
}));

module.exports = app;
