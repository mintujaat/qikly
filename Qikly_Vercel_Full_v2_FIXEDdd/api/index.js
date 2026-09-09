const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const admin = require("firebase-admin");
const { promisify } = require("util");

const app = express();
app.use(express.json({ limit: "12mb" }));

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

const ADMIN_COOKIE = "qikly_admin";
const SESSION_COOKIE = "qikly_session";
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "change-this-password");
const SESSION_SECRET = String(process.env.SESSION_SECRET || ADMIN_PASSWORD);
const MIN_WITHDRAWAL = 450;
const DAY_MS = 24 * 60 * 60 * 1000;
const scrypt = promisify(crypto.scrypt);

const defaults = {
  settings: {
    siteName: "Qikly Invest",
    tagline: "Simple investing, transparent tracking.",
    heroTitle: "Grow your balance with clear, admin-managed plans.",
    heroText: "Create your account, add funds securely with Razorpay, choose an available plan and track your balance, earnings and withdrawals from one place.",
    marqueeText: "₹450 minimum withdrawal • Secure Razorpay deposits • Live transaction history •",
    about: "Qikly Invest is an investment-management style web platform where users can maintain a wallet, activate plans and request withdrawals. Plan values and daily credit figures are configured by the administrator.",
    terms: "Use only funds you understand and can afford to risk. Plan returns shown on this website are configurable projections/credits and are not a guarantee of profit. The operator is responsible for using the platform only where legally permitted and for completing all required KYC, taxation and regulatory obligations.",
    privacy: "Account, transaction and withdrawal details are stored to operate the platform. Payment credentials are handled by Razorpay and are not stored by this application. Only information required for account, ledger and support operations should be collected.",
    refund: "Wallet deposits are payment transactions. For duplicate or incorrect payments, contact support with the Razorpay payment ID. Investment purchases and withdrawal reversals are subject to the operator's configured policy and applicable law.",
    riskDisclosure: "Investment involves risk. Displayed daily credit values are administrator-configured and should not be presented as guaranteed returns. Verify the business, applicable licenses, tax treatment and regulatory requirements before accepting real money.",
    supportEmail: "support@example.com",
    minWithdrawal: MIN_WITHDRAWAL,
    currency: "INR",
    theme: {
      primary: "#7c3aed",
      secondary: "#22c55e",
      background: "#090b12",
      surface: "#111522",
      text: "#f8fafc",
      muted: "#9aa4b2",
      accent: "#38bdf8",
    },
  },
  chatbot: {
    name: "Qikly Support",
    topic: "Answer questions about account signup, deposits, investment plans, daily credits, withdrawals, transaction history and general website support.",
    intro: "Hi! Main Qikly Support hoon. Account, deposit, plan ya withdrawal ke baare mein pooch sakte ho.",
    prompt: "Be concise, helpful and factual. Never guarantee profits, invent policies, invent transaction status, or tell a user that money has been sent unless the provided data says so. Use Hindi/Hinglish unless the user uses another language.",
  },
};

const defaultInvestmentPlans = [
  {
    id: "starter",
    title: "Starter Plan",
    amount: 1000,
    days: 10,
    dailyIncrease: 35,
    imageUrl: "https://images.unsplash.com/photo-1559526324-593bc073d938?auto=format&fit=crop&w=1200&q=80",
    description: "Entry-level plan with a fixed daily credit configured by admin.",
    active: true,
    sortOrder: 1,
  },
  {
    id: "growth",
    title: "Growth Plan",
    amount: 5000,
    days: 20,
    dailyIncrease: 220,
    imageUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&q=80",
    description: "Higher-value plan with a larger daily credit figure.",
    active: true,
    sortOrder: 2,
  },
  {
    id: "premium",
    title: "Premium Plan",
    amount: 10000,
    days: 30,
    dailyIncrease: 520,
    imageUrl: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80",
    description: "Longer duration plan for users who want a larger allocation.",
    active: true,
    sortOrder: 3,
  },
];

const defaultAiGurus = [
  { id: "qikly-ai", name: "Qikly AI", specialty: "AI Support", emoji: "✦", active: true, sortOrder: 1 },
];
const defaultAiPlans = [
  { id: "ai-10", name: "10 Minute Chat", price: 49, durationMinutes: 10, active: true, sortOrder: 1 },
  { id: "ai-30", name: "30 Minute Chat", price: 99, durationMinutes: 30, active: true, sortOrder: 2 },
];

const clean = (v, max = 5000) => String(v ?? "").trim().slice(0, max);
const cleanEmail = (v) => clean(v, 180).toLowerCase();
const num = (v) => Number(v);
const money = (v) => Math.round(Number(v) || 0);
const cleanHex = (v, fallback) => /^#[0-9a-f]{6}$/i.test(String(v || "")) ? String(v) : fallback;

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
function signValue(body, secret) { return crypto.createHmac("sha256", secret).update(body).digest("hex"); }
function createToken(prefix, id, hours, secret) {
  const exp = Date.now() + hours * 60 * 60 * 1000;
  const body = `${prefix}.${id}.${exp}`;
  return `${body}.${signValue(body, secret)}`;
}
function verifyToken(token, prefix, secret) {
  const bits = String(token || "").split(".");
  if (bits.length !== 4 || bits[0] !== prefix || Number(bits[2]) < Date.now()) return null;
  const body = bits.slice(0, 3).join(".");
  return timingSafeEqualText(signValue(body, secret), bits[3]) ? bits[1] : null;
}
function setCookie(res, name, value, maxAge) {
  res.setHeader("Set-Cookie", `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
}
function clearCookie(res, name) { setCookie(res, name, "", 0); }
function isAdmin(req) { return !!verifyToken(parseCookies(req)[ADMIN_COOKIE], "admin", ADMIN_PASSWORD); }
async function currentUser(req) {
  const uid = verifyToken(parseCookies(req)[SESSION_COOKIE], "user", SESSION_SECRET);
  if (!uid) return null;
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists || snap.data()?.active === false) return null;
  return { id: snap.id, ...snap.data() };
}
const guardAdmin = (req, res, next) => isAdmin(req) ? next() : res.status(401).json({ error: "Admin login required." });
async function guardUser(req, res, next) {
  try {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: "Login required." });
    req.user = user;
    next();
  } catch (e) { next(e); }
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(String(password), salt, 64);
  return `scrypt$${salt}$${key.toString("hex")}`;
}
async function verifyPassword(password, encoded) {
  const [scheme, salt, hex] = String(encoded || "").split("$");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const key = await scrypt(String(password), salt, 64);
  return timingSafeEqualText(key.toString("hex"), hex);
}
function publicSettings(data = {}) {
  const s = { ...defaults.settings, ...data };
  s.theme = { ...defaults.settings.theme, ...(data.theme || {}) };
  return s;
}
async function getDoc(collection, id, fallback) {
  const snap = await db.collection(collection).doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : fallback;
}
async function listCollection(collection) {
  const snap = await db.collection(collection).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function getPlans() {
  const rows = await listCollection("investmentPlans");
  return (rows.length ? rows : defaultInvestmentPlans).filter(x => x.active !== false).sort((a,b) => num(a.sortOrder)-num(b.sortOrder));
}
async function getAiGurus() {
  const rows = await listCollection("aiGurus");
  return (rows.length ? rows : defaultAiGurus).filter(x => x.active !== false).sort((a,b)=>num(a.sortOrder)-num(b.sortOrder));
}
async function getAiPlans() {
  const rows = await listCollection("aiPlans");
  return (rows.length ? rows : defaultAiPlans).filter(x => x.active !== false).sort((a,b)=>num(a.sortOrder)-num(b.sortOrder));
}

function dateMs(v) {
  if (!v) return 0;
  if (typeof v.toDate === "function") return v.toDate().getTime();
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}
function jsonSafe(value) {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === "object") { const out = {}; Object.entries(value).forEach(([k,v]) => { out[k] = jsonSafe(v); }); return out; }
  return value;
}
async function settleEarnings(uid) {
  const invSnap = await db.collection("investments").where("uid", "==", uid).get();
  const walletRef = db.collection("wallets").doc(uid);
  let totalCredit = 0;
  const updates = [];
  const now = Date.now();
  invSnap.docs.forEach(doc => {
    const x = doc.data();
    const start = dateMs(x.startAt);
    const end = Math.min(now, dateMs(x.endAt));
    const totalDays = Math.max(0, Number(x.days) || 0);
    const elapsed = start ? Math.min(totalDays, Math.floor(Math.max(0, end - start) / DAY_MS)) : 0;
    const creditedDays = Number(x.creditedDays || 0);
    const deltaDays = Math.max(0, elapsed - creditedDays);
    if (deltaDays > 0) {
      const credit = deltaDays * money(x.dailyIncrease);
      totalCredit += credit;
      updates.push({ ref: doc.ref, deltaDays, credit, complete: elapsed >= totalDays });
    } else if (elapsed >= totalDays && x.status === "active") {
      updates.push({ ref: doc.ref, deltaDays: 0, credit: 0, complete: true });
    }
  });
  if (!totalCredit && !updates.some(x=>x.complete)) return 0;
  await db.runTransaction(async tx => {
    const walletSnap = await tx.get(walletRef);
    const currentBalance = money(walletSnap.exists ? walletSnap.data().balance : 0);
    if (totalCredit) tx.set(walletRef, { uid, balance: currentBalance + totalCredit, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    updates.forEach(u => {
      const patch = {};
      if (u.deltaDays) patch.creditedDays = admin.firestore.FieldValue.increment(u.deltaDays);
      if (u.complete) { patch.status = "completed"; patch.completedAt = FieldValue.serverTimestamp(); }
      if (Object.keys(patch).length) tx.set(u.ref, patch, { merge: true });
    });
  });
  if (totalCredit) {
    const batch = db.batch();
    updates.filter(x=>x.credit>0).forEach(u => batch.set(db.collection("transactions").doc(), {
      uid, type: "return", amount: u.credit, status: "completed", title: "Daily plan credit", description: `Plan earnings credited (${u.deltaDays} day${u.deltaDays>1?'s':''}).`, referenceId: u.ref.id, createdAt: FieldValue.serverTimestamp()
    }));
    await batch.commit();
  }
  return totalCredit;
}
async function getWallet(uid) {
  const snap = await db.collection("wallets").doc(uid).get();
  return money(snap.exists ? snap.data().balance : 0);
}
async function userDashboard(uid) {
  await settleEarnings(uid);
  const savedSettings = await getDoc("settings", "main", defaults.settings);
  const [userSnap, walletSnap, invSnap, txSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("wallets").doc(uid).get(),
    db.collection("investments").where("uid", "==", uid).get(),
    db.collection("transactions").where("uid", "==", uid).get(),
  ]);
  const user = { id: userSnap.id, ...userSnap.data() };
  const investments = invSnap.docs.map(d => jsonSafe({ id: d.id, ...d.data() })).sort((a,b)=>dateMs(b.startAt)-dateMs(a.startAt));
  const transactions = txSnap.docs.map(d => jsonSafe({ id:d.id, ...d.data() })).sort((a,b)=>dateMs(b.createdAt)-dateMs(a.createdAt)).slice(0,200);
  const referral = await getReferralInfo(uid);
  return jsonSafe({ user: sanitizeUser({...user,referralCode:referral.code}), wallet: money(walletSnap.exists ? walletSnap.data().balance : 0), investments, transactions, minWithdrawal: Math.max(1, money(savedSettings.minWithdrawal) || MIN_WITHDRAWAL), referral });
}
function sanitizeUser(user) { const { passwordHash, ...safe } = user || {}; return safe; }

async function createReferralCode() {
  for (let i=0;i<8;i++) {
    const code = `QIKLY${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const snap = await db.collection("users").where("referralCode","==",code).limit(1).get();
    if (snap.empty) return code;
  }
  return `QIKLY${Date.now().toString(36).toUpperCase()}`;
}
async function ensureReferralCode(uid) {
  const ref = db.collection("users").doc(uid), snap = await ref.get();
  if (!snap.exists) return "";
  const current = clean(snap.data().referralCode,40).toUpperCase();
  if (current) return current;
  const code = await createReferralCode();
  await ref.set({referralCode:code,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  return code;
}
async function getReferralInfo(uid) {
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const code = userSnap.exists ? (clean(userSnap.data().referralCode,40).toUpperCase() || await ensureReferralCode(uid)) : "";
  const snap = await db.collection("referrals").where("referrerUid","==",uid).get();
  const referrals = snap.docs.map(d=>jsonSafe({id:d.id,...d.data()})).sort((a,b)=>dateMs(b.createdAt)-dateMs(a.createdAt));
  const users = await Promise.all(referrals.map(async r=>{
    const rs = await db.collection("users").doc(r.referredUid).get();
    const u = rs.exists ? rs.data() : {};
    return { ...r, name:clean(u.name,100)||"Member", email:cleanEmail(u.email) };
  }));
  return {code,link:`${process.env.PUBLIC_BASE_URL || ""}/auth.html?ref=${encodeURIComponent(code)}`,count:users.length,users};
}
async function geminiGenerate(contents, systemInstruction) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini API is not configured on the server.");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const body = { contents, systemInstruction:{parts:[{text:systemInstruction}]}, generationConfig:{temperature:0.4,maxOutputTokens:550} };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const d = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.error?.message || `Gemini API error (${r.status})`);
  return d.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("").trim() || "Main abhi jawab generate nahi kar pa raha hoon.";
}

app.get("/api/public/config", (req,res)=>res.json({razorpayKeyId:process.env.RAZORPAY_KEY_ID||"", minWithdrawal:MIN_WITHDRAWAL}));
app.get("/api/public/data", async (req,res)=>{
  try {
    const [settings, chatbot, plans, aiGurus, aiPlans] = await Promise.all([
      getDoc("settings","main",defaults.settings), getDoc("chatbot","main",defaults.chatbot), getPlans(), getAiGurus(), getAiPlans()
    ]);
    res.json({ settings:publicSettings(settings), plans:aiPlans, investmentPlans:plans, gurus:aiGurus, chatbot:{name:clean(chatbot.name,80)||defaults.chatbot.name,intro:clean(chatbot.intro,700)||defaults.chatbot.intro} });
  } catch(e){ res.status(500).json({error:e.message||"Unable to load public data."}); }
});

// User authentication
app.post("/api/auth/signup", async (req,res)=>{
  try {
    const name=clean(req.body.name,100), email=cleanEmail(req.body.email), password=String(req.body.password||""), referralCode=clean(req.body.referralCode,40).toUpperCase();
    if(name.length<2) return res.status(400).json({error:"Name is required."});
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:"Enter a valid email."});
    if(password.length<6) return res.status(400).json({error:"Password must be at least 6 characters."});
    const existing=await db.collection("users").where("email","==",email).limit(1).get();
    if(!existing.empty) return res.status(409).json({error:"An account with this email already exists."});
    let referrer=null;
    if(referralCode){
      const rs=await db.collection("users").where("referralCode","==",referralCode).limit(1).get();
      if(!rs.empty) referrer={id:rs.docs[0].id,...rs.docs[0].data()};
    }
    const ref=db.collection("users").doc();
    const newReferralCode=await createReferralCode();
    await ref.set({name,email,passwordHash:await hashPassword(password),active:true,upiId:"",phone:"",profileImage:"",referralCode:newReferralCode,referredBy:referrer?.id||"",createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    await db.collection("wallets").doc(ref.id).set({uid:ref.id,balance:0,updatedAt:FieldValue.serverTimestamp()});
    if(referrer) await db.collection("referrals").doc(ref.id).set({referrerUid:referrer.id,referredUid:ref.id,referralCode,createdAt:FieldValue.serverTimestamp(),status:"joined"});
    setCookie(res,SESSION_COOKIE,createToken("user",ref.id,168,SESSION_SECRET),7*24*60*60);
    res.json({ok:true,user:{id:ref.id,name,email,balance:0,referralCode:newReferralCode}});
  } catch(e){res.status(500).json({error:e.message||"Unable to create account."});}
});
app.post("/api/auth/login", async (req,res)=>{
  try {
    const email=cleanEmail(req.body.email), password=String(req.body.password||"");
    const snap=await db.collection("users").where("email","==",email).limit(1).get();
    if(snap.empty || !(await verifyPassword(password,snap.docs[0].data().passwordHash))) return res.status(401).json({error:"Invalid email or password."});
    const user={id:snap.docs[0].id,...snap.docs[0].data()}; if(user.active===false) return res.status(403).json({error:"This account is disabled."});
    setCookie(res,SESSION_COOKIE,createToken("user",user.id,168,SESSION_SECRET),7*24*60*60);
    res.json({ok:true,user:sanitizeUser(user),balance:await getWallet(user.id)});
  } catch(e){res.status(500).json({error:e.message||"Login failed."});}
});
app.post("/api/auth/logout",(req,res)=>{clearCookie(res,SESSION_COOKIE);res.json({ok:true});});
app.get("/api/auth/me",async(req,res)=>{try{const u=await currentUser(req);if(!u)return res.json({authenticated:false});const referralCode=await ensureReferralCode(u.id);const safe=sanitizeUser({...u,referralCode});res.json({authenticated:true,user:safe,balance:await getWallet(u.id)});}catch(e){res.status(500).json({error:e.message});}});

// User dashboard/profile
app.get("/api/user/dashboard",guardUser,async(req,res)=>{try{res.json(await userDashboard(req.user.id));}catch(e){res.status(500).json({error:e.message||"Unable to load dashboard."});}});
app.post("/api/user/profile",guardUser,async(req,res)=>{
  try {
    const currentSnap=await db.collection("users").doc(req.user.id).get();
    const current=currentSnap.exists?currentSnap.data():{};
    const name=clean(req.body.name,100), phone=clean(req.body.phone,30), requestedUpi=clean(req.body.upiId,120);
    if(name.length<2) return res.status(400).json({error:"Name is required."});
    const existingUpi=clean(current.upiId,120);
    if(existingUpi && requestedUpi && requestedUpi!==existingUpi) {
      return res.status(409).json({error:"UPI ID can only be changed by admin after the first save."});
    }
    const upiId=existingUpi||requestedUpi;
    const patch={name,phone,upiId,updatedAt:FieldValue.serverTimestamp()};
    await db.collection("users").doc(req.user.id).set(patch,{merge:true});
    res.json({ok:true,user:sanitizeUser({...req.user,...patch})});
  } catch(e){res.status(500).json({error:e.message||"Unable to save profile."});}
});
app.get("/api/user/transactions",guardUser,async(req,res)=>{try{await settleEarnings(req.user.id);const snap=await db.collection("transactions").where("uid","==",req.user.id).get();res.json({transactions:snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>dateMs(b.createdAt)-dateMs(a.createdAt)).slice(0,300)});}catch(e){res.status(500).json({error:e.message});}});
app.get("/api/user/referrals",guardUser,async(req,res)=>{
  try{
    const info=await getReferralInfo(req.user.id);
    const forwardedProto=String(req.headers["x-forwarded-proto"]||"").split(",")[0].trim();
    const proto=forwardedProto||req.protocol||"https";
    const host=String(req.headers["x-forwarded-host"]||req.headers.host||"").split(",")[0].trim();
    info.link=`${process.env.PUBLIC_BASE_URL||`${proto}://${host}`}/auth.html?ref=${encodeURIComponent(info.code||"")}`;
    res.json(info);
  }catch(e){res.status(500).json({error:e.message||"Unable to load referrals."});}
});

// User profile image upload (ImgBB)
app.post("/api/user/profile-image",guardUser,async(req,res)=>{
  try {
    const key=String(process.env.IMGBB_API_KEY||"").trim(); if(!key)return res.status(503).json({error:"ImgBB API is not configured."});
    const raw=String(req.body?.image||""); if(!raw)return res.status(400).json({error:"Please select an image first."});
    const base64=raw.includes(",")?raw.split(",").slice(1).join(","):raw;
    const bytes=Math.floor((base64.replace(/\s/g,"").length*3)/4); if(bytes>8*1024*1024)return res.status(413).json({error:"Image must be under 8 MB."});
    const params=new URLSearchParams(); params.set("image",base64.replace(/\s/g,"")); params.set("name",`qikly_profile_${req.user.id}`);
    const r=await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(key)}`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:params});
    const d=await r.json().catch(()=>({})); if(!r.ok||!d?.success||!d?.data?.url)return res.status(502).json({error:d?.error?.message||"ImgBB upload failed."});
    const profileImage=d.data.url;
    await db.collection("users").doc(req.user.id).set({profileImage,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    res.json({ok:true,profileImage});
  }catch(e){res.status(500).json({error:e.message||"Unable to upload profile image."});}
});

// Wallet / Razorpay deposits
app.post("/api/wallet/create-order",guardUser,async(req,res)=>{
  try {
    const amount=money(req.body.amount); if(amount<1||amount>10000000)return res.status(400).json({error:"Enter a valid amount between ₹1 and ₹1,00,00,000."});
    const order=await razorpay.orders.create({amount:amount*100,currency:"INR",receipt:`qikly_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,notes:{uid:req.user.id}});
    await db.collection("transactions").doc(order.id).set({uid:req.user.id,type:"deposit",amount,status:"created",title:"Wallet deposit",description:"Razorpay wallet top-up",orderId:order.id,createdAt:FieldValue.serverTimestamp()});
    res.json({ok:true,orderId:order.id,amount:order.amount,currency:order.currency});
  } catch(e){res.status(500).json({error:e.message||"Unable to create payment order."});}
});
app.post("/api/wallet/verify-payment",guardUser,async(req,res)=>{
  try {
    const {razorpay_order_id,razorpay_payment_id,razorpay_signature}=req.body||{};
    if(!razorpay_order_id||!razorpay_payment_id||!razorpay_signature)return res.status(400).json({error:"Incomplete Razorpay response."});
    const expected=crypto.createHmac("sha256",process.env.RAZORPAY_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
    if(!timingSafeEqualText(expected,razorpay_signature))return res.status(400).json({error:"Payment signature verification failed."});
    const ref=db.collection("transactions").doc(razorpay_order_id), snap=await ref.get();
    if(!snap.exists||snap.data().uid!==req.user.id||snap.data().type!=="deposit")return res.status(404).json({error:"Deposit order not found."});
    const tx=snap.data(); const payment=await razorpay.payments.fetch(razorpay_payment_id);
    if(payment.status!=="captured"||payment.order_id!==razorpay_order_id)return res.status(400).json({error:"Payment is not valid or captured."});
    if(money(payment.amount)!==money(tx.amount)*100)return res.status(400).json({error:"Payment amount does not match."});
    if(tx.status!=="completed"){
      await db.runTransaction(async t=>{
        const tr=await t.get(ref); if(tr.data()?.status==="completed")return;
        const walletRef=db.collection("wallets").doc(req.user.id), ws=await t.get(walletRef), bal=money(ws.exists?ws.data().balance:0);
        t.set(walletRef,{uid:req.user.id,balance:bal+money(tx.amount),updatedAt:FieldValue.serverTimestamp()},{merge:true});
        t.set(ref,{status:"completed",paymentId:razorpay_payment_id,verifiedAt:FieldValue.serverTimestamp()},{merge:true});
      });
    }
    res.json({ok:true,balance:await getWallet(req.user.id)});
  } catch(e){res.status(500).json({error:e.message||"Payment verification failed."});}
});

// Investments
app.post("/api/investments/buy",guardUser,async(req,res)=>{
  try {
    const plans=await getPlans(); const plan=plans.find(p=>p.id===String(req.body.planId));
    if(!plan)return res.status(404).json({error:"Plan not found."});
    const amount=money(plan.amount); if(amount<=0||money(plan.days)<=0||money(plan.dailyIncrease)<=0)return res.status(400).json({error:"This plan is not configured correctly."});
    await settleEarnings(req.user.id);
    const ref=db.collection("investments").doc();
    await db.runTransaction(async t=>{
      const walletRef=db.collection("wallets").doc(req.user.id), ws=await t.get(walletRef), bal=money(ws.exists?ws.data().balance:0);
      if(bal<amount) throw new Error(`Insufficient balance. Add ${money(amount-bal).toLocaleString("en-IN")} more.`);
      const start=new Date(), end=new Date(start.getTime()+money(plan.days)*DAY_MS);
      t.set(walletRef,{uid:req.user.id,balance:bal-amount,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      t.set(ref,{uid:req.user.id,planId:plan.id,planTitle:clean(plan.title,160),amount,days:money(plan.days),dailyIncrease:money(plan.dailyIncrease),startAt:start,endAt:end,creditedDays:0,status:"active",createdAt:FieldValue.serverTimestamp()});
      t.set(db.collection("transactions").doc(),{uid:req.user.id,type:"investment",amount:-amount,status:"completed",title:`Plan activated: ${clean(plan.title,160)}`,description:`${money(plan.days)} day plan`,referenceId:ref.id,createdAt:FieldValue.serverTimestamp()});
    });
    res.json({ok:true,balance:await getWallet(req.user.id)});
  } catch(e){res.status(400).json({error:e.message||"Unable to activate plan."});}
});

// Withdrawals (manual admin payout flow)
app.post("/api/withdrawals",guardUser,async(req,res)=>{
  try {
    const settings = await getDoc("settings", "main", defaults.settings);
    const minWithdrawal = Math.max(1, money(settings.minWithdrawal) || MIN_WITHDRAWAL);
    const amount=money(req.body.amount); await settleEarnings(req.user.id);
    if(amount<minWithdrawal)return res.status(400).json({error:`Minimum withdrawal is ₹${minWithdrawal}.`});
    const userSnap=await db.collection("users").doc(req.user.id).get(), user=userSnap.data()||{};
    const upiId=clean(req.body.upiId||user.upiId,120); if(!upiId)return res.status(400).json({error:"Add a UPI ID in your profile first."});
    const withdrawalRef=db.collection("withdrawals").doc(), txRef=db.collection("transactions").doc();
    await db.runTransaction(async t=>{
      const walletRef=db.collection("wallets").doc(req.user.id), ws=await t.get(walletRef), bal=money(ws.exists?ws.data().balance:0);
      if(bal<amount)throw new Error("Insufficient available balance.");
      t.set(walletRef,{uid:req.user.id,balance:bal-amount,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      t.set(withdrawalRef,{uid:req.user.id,amount,upiId,status:"pending",requestedAt:FieldValue.serverTimestamp(),processedAt:null});
      t.set(txRef,{uid:req.user.id,type:"withdrawal",amount:-amount,status:"pending",title:"Withdrawal request",description:`Requested to ${upiId}`,referenceId:withdrawalRef.id,createdAt:FieldValue.serverTimestamp()});
    });
    res.json({ok:true,message:"Withdrawal request submitted for admin review.",balance:await getWallet(req.user.id)});
  } catch(e){res.status(400).json({error:e.message||"Unable to create withdrawal request."});}
});

// Support chatbot
app.post("/api/chatbot",async(req,res)=>{
  try {
    const [chatbot,settings,plans]=await Promise.all([getDoc("chatbot","main",defaults.chatbot),getDoc("settings","main",defaults.settings),getPlans()]);
    const message=clean(req.body.message,1200); if(!message)return res.status(400).json({error:"Message is required."});
    const history=Array.isArray(req.body.history)?req.body.history.slice(-8):[];
    const contents=[]; history.forEach(item=>{if(item?.role==="user"||item?.role==="model")contents.push({role:item.role,parts:[{text:clean(item.text,1200)}]});}); contents.push({role:"user",parts:[{text:message}]});
    const planContext=plans.map(p=>`${p.title}: ₹${money(p.amount)}, ${money(p.days)} days, daily credit ₹${money(p.dailyIncrease)}`).join(" | ");
    const system=`You are ${clean(chatbot.name,80)||defaults.chatbot.name}, the support assistant for ${clean(settings.siteName,120)}.\nAdmin topic: ${clean(chatbot.topic,1800)}\nInstructions: ${clean(chatbot.prompt,1800)}\nSite summary: ${clean(settings.heroText,1800)}\nConfigured plans: ${planContext}\nMinimum withdrawal: ₹${MIN_WITHDRAWAL}.\nNever promise guaranteed profit, never fabricate balances or transaction outcomes, and never give regulated financial advice as certainty. Keep replies concise.`;
    res.json({ok:true,name:clean(chatbot.name,80)||defaults.chatbot.name,answer:await geminiGenerate(contents,system)});
  } catch(e){res.status(500).json({error:e.message||"Support assistant is unavailable right now."});}
});

// Admin auth
app.post("/api/admin/login",(req,res)=>{const password=String(req.body.password||"");if(!timingSafeEqualText(password,ADMIN_PASSWORD))return res.status(401).json({error:"Wrong password."});setCookie(res,ADMIN_COOKIE,createToken("admin","panel",12,ADMIN_PASSWORD),12*60*60);res.json({ok:true});});
app.post("/api/admin/logout",(req,res)=>{clearCookie(res,ADMIN_COOKIE);res.json({ok:true});});
app.get("/api/admin/me",(req,res)=>res.json({authenticated:isAdmin(req)}));

app.get("/api/admin/data",guardAdmin,async(req,res)=>{
  try {
    const [settings,chatbot,plans,withdrawals,users,transactions,aiGurus,aiPlans,referrals]=await Promise.all([getDoc("settings","main",defaults.settings),getDoc("chatbot","main",defaults.chatbot),listCollection("investmentPlans"),listCollection("withdrawals"),listCollection("users"),listCollection("transactions"),listCollection("aiGurus"),listCollection("aiPlans"),listCollection("referrals")]);
    const activePlans=plans.length?plans:defaultInvestmentPlans;
    const paidDeposits=transactions.filter(t=>t.type==="deposit"&&t.status==="completed");
    const pendingW=withdrawals.filter(w=>w.status==="pending");
    const usersWithBalances = await Promise.all(users.map(async u => ({...sanitizeUser(u), balance: await getWallet(u.id)})));
    const stats={users:users.length,depositTotal:paidDeposits.reduce((s,x)=>s+money(x.amount),0),pendingWithdrawals:pendingW.reduce((s,x)=>s+money(x.amount),0),pendingWithdrawalCount:pendingW.length,activePlans:activePlans.filter(x=>x.active!==false).length,referrals:referrals.length};
    res.set("Cache-Control","no-store");
    res.json(jsonSafe({settings:publicSettings(settings),chatbot,plans:activePlans.sort((a,b)=>num(a.sortOrder)-num(b.sortOrder)),withdrawals:withdrawals.sort((a,b)=>dateMs(b.requestedAt)-dateMs(a.requestedAt)),users:usersWithBalances.sort((a,b)=>dateMs(b.createdAt)-dateMs(a.createdAt)),transactions:transactions.sort((a,b)=>dateMs(b.createdAt)-dateMs(a.createdAt)).slice(0,500),referrals:referrals.sort((a,b)=>dateMs(b.createdAt)-dateMs(a.createdAt)),aiGurus:aiGurus.length?aiGurus:defaultAiGurus,aiPlans:aiPlans.length?aiPlans:defaultAiPlans,stats}));
  } catch(e){res.status(500).json({error:e.message||"Unable to load admin data."});}
});
app.post("/api/admin/settings",guardAdmin,async(req,res)=>{
  try {
    const b=req.body||{},theme=b.theme||{};
    const payload={siteName:clean(b.siteName,120)||defaults.settings.siteName,tagline:clean(b.tagline,240),heroTitle:clean(b.heroTitle,240),heroText:clean(b.heroText,1800),marqueeText:clean(b.marqueeText,700),about:clean(b.about,6000),terms:clean(b.terms,8000),privacy:clean(b.privacy,8000),refund:clean(b.refund,8000),riskDisclosure:clean(b.riskDisclosure,2500),supportEmail:cleanEmail(b.supportEmail),minWithdrawal:Math.max(1,money(b.minWithdrawal)||MIN_WITHDRAWAL),currency:"INR",theme:{primary:cleanHex(theme.primary,defaults.settings.theme.primary),secondary:cleanHex(theme.secondary,defaults.settings.theme.secondary),background:cleanHex(theme.background,defaults.settings.theme.background),surface:cleanHex(theme.surface,defaults.settings.theme.surface),text:cleanHex(theme.text,defaults.settings.theme.text),muted:cleanHex(theme.muted,defaults.settings.theme.muted),accent:cleanHex(theme.accent,defaults.settings.theme.accent)}};
    await db.collection("settings").doc("main").set(payload,{merge:true});res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message||"Unable to save settings."});}
});
app.post("/api/admin/chatbot",guardAdmin,async(req,res)=>{try{await db.collection("chatbot").doc("main").set({name:clean(req.body.name,80)||defaults.chatbot.name,intro:clean(req.body.intro,800),topic:clean(req.body.topic,2500),prompt:clean(req.body.prompt,2500),updatedAt:FieldValue.serverTimestamp()},{merge:true});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

app.post("/api/admin/upload-image",guardAdmin,async(req,res)=>{
  try {
    const key=String(process.env.IMGBB_API_KEY||"").trim(); if(!key)return res.status(503).json({error:"ImgBB API is not configured."});
    const raw=String(req.body?.image||""); if(!raw)return res.status(400).json({error:"Please select an image first."});
    const base64=raw.includes(",")?raw.split(",").slice(1).join(","):raw;
    const bytes=Math.floor((base64.replace(/\s/g,"").length*3)/4); if(bytes>8*1024*1024)return res.status(413).json({error:"Image must be under 8 MB."});
    const params=new URLSearchParams();params.set("image",base64.replace(/\s/g,""));if(req.body?.name)params.set("name",clean(req.body.name,120));
    const r=await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(key)}`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:params});
    const d=await r.json().catch(()=>({})); if(!r.ok||!d?.success||!d?.data?.url)return res.status(502).json({error:d?.error?.message||"ImgBB upload failed."});
    res.json({ok:true,imageUrl:d.data.url,displayUrl:d.data.display_url||d.data.url});
  } catch(e){res.status(500).json({error:e.message||"Unable to upload image."});}
});

app.post("/api/admin/plan",guardAdmin,async(req,res)=>{try{const id=clean(req.body.id,80)||`plan_${Date.now()}`;const payload={title:clean(req.body.title,160),amount:money(req.body.amount),days:money(req.body.days),dailyIncrease:money(req.body.dailyIncrease),imageUrl:clean(req.body.imageUrl,1200),description:clean(req.body.description,1200),active:req.body.active!==false,sortOrder:money(req.body.sortOrder)||Date.now(),updatedAt:FieldValue.serverTimestamp()};if(!payload.title||!payload.amount||!payload.days||!payload.dailyIncrease||!/^(https?:\/\/)/i.test(payload.imageUrl))return res.status(400).json({error:"Title, amount, days, daily credit and HTTPS image URL are required."});await db.collection("investmentPlans").doc(id).set(payload,{merge:true});res.json({ok:true});}catch(e){res.status(500).json({error:e.message||"Unable to save plan."});}});
app.post("/api/admin/delete-plan",guardAdmin,async(req,res)=>{try{const id=clean(req.body.id,80);if(!id)return res.status(400).json({error:"Plan id required."});await db.collection("investmentPlans").doc(id).delete();res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

app.post("/api/admin/user/adjust-balance",guardAdmin,async(req,res)=>{try{const uid=clean(req.body.uid,120),delta=money(req.body.amount),direction=String(req.body.direction||"add")==="subtract"?"subtract":"add";if(!uid||delta<=0)return res.status(400).json({error:"Valid user and amount required."});const signed=direction==="add"?delta:-delta;await db.runTransaction(async t=>{const wr=db.collection("wallets").doc(uid),ws=await t.get(wr),bal=money(ws.exists?ws.data().balance:0);if(bal+signed<0)throw new Error("Balance cannot go below zero.");t.set(wr,{uid,balance:bal+signed,updatedAt:FieldValue.serverTimestamp()},{merge:true});t.set(db.collection("transactions").doc(),{uid,type:"admin_adjustment",amount:signed,status:"completed",title:direction==="add"?"Admin balance credit":"Admin balance debit",description:"Manual wallet adjustment by admin.",createdAt:FieldValue.serverTimestamp()});});res.json({ok:true,balance:await getWallet(uid)});}catch(e){res.status(400).json({error:e.message||"Unable to adjust balance."});}});

app.post("/api/admin/withdrawal/action",guardAdmin,async(req,res)=>{
  try {
    const id=clean(req.body.id,120), action=String(req.body.action||""); if(!id||!["approve","reject"].includes(action))return res.status(400).json({error:"Invalid withdrawal action."});
    const ref=db.collection("withdrawals").doc(id), txSnap=await db.collection("transactions").where("referenceId","==",id).limit(1).get();
    await db.runTransaction(async t=>{
      const wsnap=await t.get(ref); if(!wsnap.exists)throw new Error("Withdrawal not found."); const w=wsnap.data();
      if(w.status!=="pending")return;
      if(txSnap.empty)throw new Error("Linked transaction not found.");
      const txRef=txSnap.docs[0].ref;
      if(action==="approve") { t.set(ref,{status:"approved",processedAt:FieldValue.serverTimestamp()},{merge:true});t.set(txRef,{status:"completed",description:`Admin approved payout to ${w.upiId}`},{merge:true}); }
      else { const wr=db.collection("wallets").doc(w.uid),wallet=await t.get(wr),bal=money(wallet.exists?wallet.data().balance:0);t.set(wr,{uid:w.uid,balance:bal+money(w.amount),updatedAt:FieldValue.serverTimestamp()},{merge:true});t.set(ref,{status:"rejected",processedAt:FieldValue.serverTimestamp()},{merge:true});t.set(txRef,{status:"rejected",description:"Withdrawal rejected; amount returned to wallet."},{merge:true}); }
    });
    res.json({ok:true});
  } catch(e){res.status(400).json({error:e.message||"Unable to process withdrawal."});}
});

app.post("/api/admin/user/update-upi",guardAdmin,async(req,res)=>{
  try{
    const uid=clean(req.body.uid,120), upiId=clean(req.body.upiId,120);
    if(!uid)return res.status(400).json({error:"User id required."});
    if(upiId && !/^[^\s@]+@[^\s@]+$/i.test(upiId)) return res.status(400).json({error:"Enter a valid UPI ID."});
    await db.collection("users").doc(uid).set({upiId,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    res.json({ok:true,upiId});
  }catch(e){res.status(500).json({error:e.message||"Unable to update UPI ID."});}
});
app.post("/api/admin/user/toggle",guardAdmin,async(req,res)=>{try{const uid=clean(req.body.uid,120),active=req.body.active!==false;if(!uid)return res.status(400).json({error:"User id required."});await db.collection("users").doc(uid).set({active,updatedAt:FieldValue.serverTimestamp()},{merge:true});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

// AI compatibility layer: preserves the old paid AI chat flow.
app.get("/api/ai/public/data",async(req,res)=>{try{res.json({gurus:await getAiGurus(),plans:await getAiPlans()});}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/ai/trial",async(req,res)=>{try{const guruId=clean(req.body.guruId,80),guru=(await getAiGurus()).find(x=>x.id===guruId);if(!guru)return res.status(404).json({error:"AI guide not found."});const ref=db.collection("aiSessions").doc();const seconds=30;await ref.set({guruId,customerName:clean(req.body.customerName,80)||"Guest",seconds,remainingSeconds:seconds,expiresAt:new Date(Date.now()+seconds*1000),createdAt:FieldValue.serverTimestamp(),paid:false});res.json({ok:true,sessionId:ref.id,seconds});}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/ai/create-order",async(req,res)=>{try{const p=(await getAiPlans()).find(x=>x.id===clean(req.body.planId,80)),guru=(await getAiGurus()).find(x=>x.id===clean(req.body.guruId,80));if(!p||!guru)return res.status(404).json({error:"AI plan not found."});const order=await razorpay.orders.create({amount:money(p.price)*100,currency:"INR",receipt:`ai_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,notes:{guruId:guru.id,planId:p.id}});await db.collection("aiOrders").doc(order.id).set({orderId:order.id,guruId:guru.id,planId:p.id,price:money(p.price),durationMinutes:money(p.durationMinutes),status:"created",createdAt:FieldValue.serverTimestamp()});res.json({ok:true,orderId:order.id,amount:order.amount,currency:order.currency});}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/ai/verify-payment",async(req,res)=>{try{const {razorpay_order_id,razorpay_payment_id,razorpay_signature}=req.body||{};const expected=crypto.createHmac("sha256",process.env.RAZORPAY_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");if(!timingSafeEqualText(expected,razorpay_signature))return res.status(400).json({error:"Payment signature verification failed."});const ref=db.collection("aiOrders").doc(razorpay_order_id),snap=await ref.get();if(!snap.exists)return res.status(404).json({error:"AI order not found."});const order=snap.data(),payment=await razorpay.payments.fetch(razorpay_payment_id);if(payment.status!=="captured"||money(payment.amount)!==money(order.price)*100)return res.status(400).json({error:"AI payment is not valid."});const seconds=money(order.durationMinutes)*60,sessionRef=db.collection("aiSessions").doc();await sessionRef.set({guruId:order.guruId,customerName:"Guest",seconds,remainingSeconds:seconds,expiresAt:new Date(Date.now()+seconds*1000),createdAt:FieldValue.serverTimestamp(),paid:true,orderId:razorpay_order_id});await ref.set({status:"completed",paymentId:razorpay_payment_id,verifiedAt:FieldValue.serverTimestamp(),sessionId:sessionRef.id},{merge:true});res.json({ok:true,sessionId:sessionRef.id,seconds});}catch(e){res.status(500).json({error:e.message||"AI payment verification failed."});}});
app.post("/api/ai/chat",async(req,res)=>{try{const sessionId=clean(req.body.sessionId,120),message=clean(req.body.message,1200);const ref=db.collection("aiSessions").doc(sessionId),snap=await ref.get();if(!snap.exists)return res.status(404).json({error:"Session not found."});const s=snap.data(),remaining=Math.max(0,Math.ceil((dateMs(s.expiresAt)-Date.now())/1000));if(remaining<=0)return res.status(400).json({error:"Session expired."});const guru=(await getAiGurus()).find(x=>x.id===s.guruId)||defaultAiGurus[0];const answer=await geminiGenerate([{role:"user",parts:[{text:message}]}],`You are ${guru.name}, ${guru.specialty||"AI guide"}. Answer briefly and helpfully. Do not claim certainty about future events or finances.`);await ref.set({remainingSeconds:remaining,updatedAt:FieldValue.serverTimestamp()},{merge:true});res.json({ok:true,answer,remainingSeconds:Math.max(0,remaining-2)});}catch(e){res.status(500).json({error:e.message||"AI chat failed."});}});

// Admin AI controls
app.post("/api/admin/ai-guru",guardAdmin,async(req,res)=>{try{const id=clean(req.body.id,80)||`guru_${Date.now()}`;await db.collection("aiGurus").doc(id).set({name:clean(req.body.name,100),specialty:clean(req.body.specialty,160),emoji:clean(req.body.emoji,10)||"✦",imageUrl:clean(req.body.imageUrl,1200),active:req.body.active!==false,sortOrder:money(req.body.sortOrder)||1,updatedAt:FieldValue.serverTimestamp()},{merge:true});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/admin/ai-plan",guardAdmin,async(req,res)=>{try{const id=clean(req.body.id,80)||`ai_${Date.now()}`;const payload={name:clean(req.body.name,120),price:money(req.body.price),durationMinutes:money(req.body.durationMinutes),active:req.body.active!==false,sortOrder:money(req.body.sortOrder)||1,updatedAt:FieldValue.serverTimestamp()};if(!payload.name||!payload.price||!payload.durationMinutes)return res.status(400).json({error:"Name, price and duration are required."});await db.collection("aiPlans").doc(id).set(payload,{merge:true});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

app.get("/api/health",(req,res)=>res.json({ok:true,firebaseConfigured:!!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,razorpayConfigured:!!process.env.RAZORPAY_KEY_ID&&!!process.env.RAZORPAY_KEY_SECRET,geminiConfigured:!!process.env.GEMINI_API_KEY}));

module.exports=app;
