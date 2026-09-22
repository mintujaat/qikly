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
    referralReward: 0,
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
async function ensureWalletBuckets(uid) {
  const ref = db.collection("wallets").doc(uid);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : {};
  if (data && Number.isFinite(Number(data.depositBalance)) && Number.isFinite(Number(data.earningsBalance)) && Number.isFinite(Number(data.bonusBalance)) && Number(data.balanceSourceVersion || 0) >= 2) {
    return { total: money(data.balance), deposit: money(data.depositBalance), earnings: money(data.earningsBalance), bonus: money(data.bonusBalance) };
  }
  const txSnap = await db.collection("transactions").where("uid", "==", uid).get();
  const rows = txSnap.docs.map(d => d.data()).sort((a,b) => dateMs(a.createdAt)-dateMs(b.createdAt));
  let deposit = 0, earnings = 0, bonus = 0;
  for (const tx of rows) {
    const amount = money(tx.amount);
    const status = String(tx.status || "");
    if (status === "rejected") continue;
    if (tx.type === "deposit" && status === "completed") deposit += amount;
    else if (tx.type === "return" && status === "completed") earnings += amount;
    else if (tx.type === "referral_bonus" && status === "completed") bonus += amount;
    else if (tx.type === "admin_adjustment" && status === "completed") {
      if (amount >= 0) deposit += amount;
      else {
        let need = Math.abs(amount);
        const a=Math.min(deposit,need); deposit-=a; need-=a;
        const b=Math.min(bonus,need); bonus-=b; need-=b;
        const c=Math.min(earnings,need); earnings-=c; need-=c;
      }
    } else if (tx.type === "investment" && amount < 0 && status === "completed") {
      let need = Math.abs(amount);
      const a=Math.min(deposit,need); deposit-=a; need-=a;
      const b=Math.min(bonus,need); bonus-=b; need-=b;
      const c=Math.min(earnings,need); earnings-=c; need-=c;
    } else if (tx.type === "withdrawal" && status !== "rejected") {
      earnings = Math.max(0, earnings - Math.abs(amount));
    }
  }
  const currentTotal = money(snap.exists ? data.balance : (deposit + earnings + bonus));
  const diff = money(currentTotal - money(deposit + earnings + bonus));
  if (diff > 0) deposit += diff;
  else if (diff < 0) {
    let need=Math.abs(diff);
    const a=Math.min(earnings,need); earnings-=a; need-=a;
    const b=Math.min(bonus,need); bonus-=b; need-=b;
    deposit=Math.max(0,deposit-need);
  }
  await ref.set({uid,balance:money(currentTotal),depositBalance:money(deposit),earningsBalance:money(earnings),bonusBalance:money(bonus),balanceSourceVersion:2,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  return { total:money(currentTotal), deposit:money(deposit), earnings:money(earnings), bonus:money(bonus) };
}

async function settleEarnings(uid) {
  await ensureWalletBuckets(uid);
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
    const wallet = walletSnap.exists ? walletSnap.data() : {};
    const currentBalance = money(wallet.balance);
    const currentEarnings = money(wallet.earningsBalance);
    if (totalCredit) tx.set(walletRef,{uid,balance:currentBalance+totalCredit,earningsBalance:currentEarnings+totalCredit,depositBalance:money(wallet.depositBalance),bonusBalance:money(wallet.bonusBalance),balanceSourceVersion:2,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    updates.forEach(u=>{
      const patch={};
      if(u.deltaDays) patch.creditedDays=admin.firestore.FieldValue.increment(u.deltaDays);
      if(u.complete){patch.status="completed";patch.completedAt=FieldValue.serverTimestamp();}
      if(Object.keys(patch).length)tx.set(u.ref,patch,{merge:true});
    });
  });
  if(totalCredit){
    const batch=db.batch();
    updates.filter(x=>x.credit>0).forEach(u=>batch.set(db.collection("transactions").doc(),{uid,type:"return",amount:u.credit,status:"completed",title:"Daily plan credit",description:`Plan earnings credited (${u.deltaDays} day${u.deltaDays>1?'s':''}).`,referenceId:u.ref.id,createdAt:FieldValue.serverTimestamp(),source:"plan_earnings"}));
    await batch.commit();
  }
  return totalCredit;
}

async function getWalletBreakdown(uid) {
  await ensureWalletBuckets(uid);
  const snap = await db.collection("wallets").doc(uid).get();
  const data = snap.exists ? snap.data() : {};
  return { total: money(data.balance), deposit: money(data.depositBalance), earnings: money(data.earningsBalance), bonus: money(data.bonusBalance), withdrawable: money(data.earningsBalance) };
}
async function getWallet(uid) {
  const b = await getWalletBreakdown(uid);
  return b.total;
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
  const wallet = walletSnap.exists ? walletSnap.data() : {};
  return jsonSafe({ user: sanitizeUser({...user,referralCode:referral.code}), wallet: money(wallet.balance), walletBreakdown: { total: money(wallet.balance), deposit: money(wallet.depositBalance), earnings: money(wallet.earningsBalance), bonus: money(wallet.bonusBalance), withdrawable: money(wallet.earningsBalance) }, investments, transactions, minWithdrawal: Math.max(1, money(savedSettings.minWithdrawal) || MIN_WITHDRAWAL), referral });
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
  return {code,count:users.length,users};
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
    await db.collection("wallets").doc(ref.id).set({uid:ref.id,balance:0,depositBalance:0,earningsBalance:0,bonusBalance:0,balanceSourceVersion:2,updatedAt:FieldValue.serverTimestamp()});
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
    const [info, settings] = await Promise.all([getReferralInfo(req.user.id), getDoc("settings","main",defaults.settings)]);
    info.rewardAmount = Math.max(0, money(settings.referralReward));
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
    await ensureWalletBuckets(req.user.id);
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
        const walletRef=db.collection("wallets").doc(req.user.id), ws=await t.get(walletRef), wd=ws.exists?ws.data():{};
        const bal=money(wd.balance), deposit=money(wd.depositBalance);
        t.set(walletRef,{uid:req.user.id,balance:bal+money(tx.amount),depositBalance:deposit+money(tx.amount),earningsBalance:money(wd.earningsBalance),bonusBalance:money(wd.bonusBalance),balanceSourceVersion:2,updatedAt:FieldValue.serverTimestamp()},{merge:true});
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
    const settings=await getDoc("settings","main",defaults.settings);
    const referralReward=Math.max(0,money(settings.referralReward));
    const referralSnap=await db.collection("referrals").where("referredUid","==",req.user.id).limit(1).get();
    const referralRef=referralSnap.empty?null:referralSnap.docs[0].ref;
    if(referralRef){const referralSeed=await referralRef.get();const referrerUid=referralSeed.exists?referralSeed.data().referrerUid:"";if(referrerUid)await ensureWalletBuckets(referrerUid);}
    const ref=db.collection("investments").doc();
    await db.runTransaction(async t=>{
      const walletRef=db.collection("wallets").doc(req.user.id);
      const ws=await t.get(walletRef);
      const wd=ws.exists?ws.data():{};
      const bal=money(wd.balance), deposit=money(wd.depositBalance), bonus=money(wd.bonusBalance), earnings=money(wd.earningsBalance);
      if(bal<amount) throw new Error(`Insufficient balance. Add ${money(amount-bal).toLocaleString("en-IN")} more.`);

      const referralState=referralRef?await t.get(referralRef):null;
      const referralData=referralState?.exists?referralState.data():null;
      let referrerWalletRef=null, referrerWalletSnap=null, reward=0;
      const shouldProcessFirstPlan=!!referralData && !referralData.firstPlanPurchasedAt;
      if(shouldProcessFirstPlan){
        reward=referralReward;
        if(referralData.referrerUid){
          referrerWalletRef=db.collection("wallets").doc(referralData.referrerUid);
          referrerWalletSnap=await t.get(referrerWalletRef);
        }
      }

      const start=new Date(), end=new Date(start.getTime()+money(plan.days)*DAY_MS);
      let needToSpend=amount;
      const spendDeposit=Math.min(deposit,needToSpend); needToSpend-=spendDeposit;
      const spendBonus=Math.min(bonus,needToSpend); needToSpend-=spendBonus;
      const spendEarnings=Math.min(earnings,needToSpend); needToSpend-=spendEarnings;
      if(needToSpend>0) throw new Error("Insufficient balance.");
      t.set(walletRef,{uid:req.user.id,balance:bal-amount,depositBalance:deposit-spendDeposit,bonusBalance:bonus-spendBonus,earningsBalance:earnings-spendEarnings,balanceSourceVersion:2,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      t.set(ref,{uid:req.user.id,planId:plan.id,planTitle:clean(plan.title,160),amount,days:money(plan.days),dailyIncrease:money(plan.dailyIncrease),startAt:start,endAt:end,creditedDays:0,status:"active",createdAt:FieldValue.serverTimestamp()});
      t.set(db.collection("transactions").doc(),{uid:req.user.id,type:"investment",amount:-amount,status:"completed",title:`Plan activated: ${clean(plan.title,160)}`,description:`${money(plan.days)} day plan`,referenceId:ref.id,createdAt:FieldValue.serverTimestamp()});

      if(shouldProcessFirstPlan && referralData.referrerUid){
        const referrerWalletData=referrerWalletSnap?.exists?referrerWalletSnap.data():{};
        const currentReferrerBalance=money(referrerWalletData.balance), currentBonus=money(referrerWalletData.bonusBalance);
        t.set(referrerWalletRef,{uid:referralData.referrerUid,balance:currentReferrerBalance+reward,bonusBalance:currentBonus+reward,depositBalance:money(referrerWalletData.depositBalance),earningsBalance:money(referrerWalletData.earningsBalance),balanceSourceVersion:2,updatedAt:FieldValue.serverTimestamp()},{merge:true});
        t.set(referralRef,{firstPlanPurchasedAt:FieldValue.serverTimestamp(),rewardPaid:true,rewardAmount:reward,rewardPaidAt:FieldValue.serverTimestamp(),status:reward>0?"rewarded":"qualified"},{merge:true});
        if(reward>0){
          t.set(db.collection("transactions").doc(),{uid:referralData.referrerUid,type:"referral_bonus",amount:reward,status:"completed",title:"Referral plan bonus",description:`One-time bonus for ${clean(req.user.name,100)||"a referred user"}'s first plan purchase.`,referenceId:ref.id,createdAt:FieldValue.serverTimestamp()});
        }
      } else if(referralData && !referralData.firstPlanPurchasedAt){
        t.set(referralRef,{firstPlanPurchasedAt:FieldValue.serverTimestamp(),rewardPaid:true,rewardAmount:0,status:"qualified"},{merge:true});
      }
    });
    res.json({ok:true,balance:await getWallet(req.user.id),referralBonus:referralReward});
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
    const upiId=clean(user.upiId,120); if(!upiId)return res.status(400).json({error:"Add a UPI ID in your profile first."});
    const withdrawalRef=db.collection("withdrawals").doc(), txRef=db.collection("transactions").doc();
    await db.runTransaction(async t=>{
      const walletRef=db.collection("wallets").doc(req.user.id), ws=await t.get(walletRef), wd=ws.exists?ws.data():{}, earnings=money(wd.earningsBalance), bal=money(wd.balance);
      if(earnings<amount)throw new Error(`Only plan earnings can be withdrawn. Withdrawable earnings: ${money(earnings)}.`);
      t.set(walletRef,{uid:req.user.id,balance:bal-amount,earningsBalance:earnings-amount,depositBalance:money(wd.depositBalance),bonusBalance:money(wd.bonusBalance),balanceSourceVersion:2,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      t.set(withdrawalRef,{uid:req.user.id,amount,upiId,status:"pending",requestedAt:FieldValue.serverTimestamp(),processedAt:null,source:"plan_earnings"});
      t.set(txRef,{uid:req.user.id,type:"withdrawal",amount:-amount,status:"pending",title:"Withdrawal request",description:`Requested to ${upiId} from plan earnings`,referenceId:withdrawalRef.id,createdAt:FieldValue.serverTimestamp(),source:"plan_earnings"});
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
    const payload={siteName:clean(b.siteName,120)||defaults.settings.siteName,tagline:clean(b.tagline,240),heroTitle:clean(b.heroTitle,240),heroText:clean(b.heroText,1800),marqueeText:clean(b.marqueeText,700),about:clean(b.about,6000),terms:clean(b.terms,8000),privacy:clean(b.privacy,8000),refund:clean(b.refund,8000),riskDisclosure:clean(b.riskDisclosure,2500),supportEmail:cleanEmail(b.supportEmail),minWithdrawal:Math.max(1,money(b.minWithdrawal)||MIN_WITHDRAWAL),referralReward:Math.max(0,money(b.referralReward)),currency:"INR",theme:{primary:cleanHex(theme.primary,defaults.settings.theme.primary),secondary:cleanHex(theme.secondary,defaults.settings.theme.secondary),background:cleanHex(theme.background,defaults.settings.theme.background),surface:cleanHex(theme.surface,defaults.settings.theme.surface),text:cleanHex(theme.text,defaults.settings.theme.text),muted:cleanHex(theme.muted,defaults.settings.theme.muted),accent:cleanHex(theme.accent,defaults.settings.theme.accent)}};
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

app.post("/api/admin/user/adjust-balance",guardAdmin,async(req,res)=>{try{const uid=clean(req.body.uid,120),delta=money(req.body.amount),direction=String(req.body.direction||"add")==="subtract"?"subtract":"add";if(!uid||delta<=0)return res.status(400).json({error:"Valid user and amount required."});await ensureWalletBuckets(uid);const signed=direction==="add"?delta:-delta;await db.runTransaction(async t=>{const wr=db.collection("wallets").doc(uid),ws=await t.get(wr),wd=ws.exists?ws.data():{},bal=money(wd.balance),deposit=money(wd.depositBalance),bonus=money(wd.bonusBalance),earnings=money(wd.earningsBalance);if(bal+signed<0)throw new Error("Balance cannot go below zero.");let nd=deposit,nb=bonus,ne=earnings;if(signed>=0)nd+=signed;else{let need=-signed;const a=Math.min(nd,need);nd-=a;need-=a;const b=Math.min(nb,need);nb-=b;need-=b;const c=Math.min(ne,need);ne-=c;need-=c;if(need>0)throw new Error("Not enough balance to subtract that amount.");}t.set(wr,{uid,balance:bal+signed,depositBalance:nd,bonusBalance:nb,earningsBalance:ne,balanceSourceVersion:2,updatedAt:FieldValue.serverTimestamp()},{merge:true});t.set(db.collection("transactions").doc(),{uid,type:"admin_adjustment",amount:signed,status:"completed",title:direction==="add"?"Admin balance credit":"Admin balance debit",description:"Manual wallet adjustment by admin (principal-safe).",createdAt:FieldValue.serverTimestamp()});});res.json({ok:true,balance:await getWallet(uid)});}catch(e){res.status(400).json({error:e.message||"Unable to adjust balance."});}});

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
      else { const wr=db.collection("wallets").doc(w.uid),wallet=await t.get(wr),wd=wallet.exists?wallet.data():{},bal=money(wd.balance),earnings=money(wd.earningsBalance);t.set(wr,{uid:w.uid,balance:bal+money(w.amount),earningsBalance:earnings+money(w.amount),depositBalance:money(wd.depositBalance),bonusBalance:money(wd.bonusBalance),balanceSourceVersion:2,updatedAt:FieldValue.serverTimestamp()},{merge:true});t.set(ref,{status:"rejected",processedAt:FieldValue.serverTimestamp()},{merge:true});t.set(txRef,{status:"rejected",description:"Withdrawal rejected; amount returned to plan-earnings balance."},{merge:true}); }
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



// =========================
// Qikly Shopping Commerce Layer
// Additive routes only: the original wallet/investment/payment handlers above remain intact.
// =========================
const shopDefaultSettings = {
  siteName: "Qikly Fashion",
  tagline: "Diwali Fashion Edit",
  announcement: "🪔 Diwali Fashion Sale • Up to 80% off • Free shipping above ₹999",
  heroTitle: "Diwali, styled your way.",
  heroText: "Festive lehengas, sarees, kurtas, shirts and dresses — handpicked for the season.",
  heroImage: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1800&q=85",
  logoText: "Qikly Fashion",
  logoMark: "Q",
  shippingFee: 49,
  freeShippingAbove: 999,
  codEnabled: true,
  returnDays: 7,
  saleLabel: "UP TO 70% OFF",
  saleEndsAt: "2026-11-01T23:59:59+05:30",
  trustBadges: [
    {icon:"🚚",title:"Fast Delivery",text:"Across India"},
    {icon:"🔒",title:"Secure Payments",text:"Razorpay protected"},
    {icon:"↩️",title:"Easy Returns",text:"7 day returns"},
    {icon:"💬",title:"AI Support",text:"Gemini powered"}
  ],
  banners: [
    {title:"Bridal & Wedding Edit",text:"Lehengas from ₹1,499",imageUrl:"https://images.unsplash.com/photo-1583391733956-6c78276477e2?auto=format&fit=crop&w=1200&q=85",link:"#shop?cat=ethnic"},
    {title:"Men’s Festive Edit",text:"Kurtas, shirts & jackets",imageUrl:"https://images.unsplash.com/photo-1617127365659-c47fa864d8bc?auto=format&fit=crop&w=1200&q=85",link:"#shop?cat=men"},
    {title:"Women’s Diwali Edit",text:"Sarees, dresses & suits",imageUrl:"https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=85",link:"#shop?cat=women"}
  ],
  supportEmail: "support@qikly.shop",
  footerText: "Qikly brings everyday shopping, festive deals and secure checkout together in one modern storefront."
};
const shopDefaultCategories = [
  {id:"women",title:"Women",slug:"women",icon:"👗",imageUrl:"https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=900&q=80",sortOrder:1,active:true},
  {id:"men",title:"Men",slug:"men",icon:"👔",imageUrl:"https://images.unsplash.com/photo-1617127365659-c47fa864d8bc?auto=format&fit=crop&w=900&q=80",sortOrder:2,active:true},
  {id:"ethnic",title:"Ethnic Wear",slug:"ethnic",icon:"✨",imageUrl:"https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=80",sortOrder:3,active:true},
  {id:"dresses",title:"Dresses",slug:"dresses",icon:"👗",imageUrl:"https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&w=900&q=80",sortOrder:4,active:true},
  {id:"kids",title:"Kids",slug:"kids",icon:"🧸",imageUrl:"https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&w=900&q=80",sortOrder:5,active:true},
  {id:"winter",title:"Winter Wear",slug:"winter",icon:"🧥",imageUrl:"https://images.unsplash.com/photo-1548883354-7622d03aca27?auto=format&fit=crop&w=900&q=80",sortOrder:6,active:true},
  {id:"footwear",title:"Footwear",slug:"footwear",icon:"👟",imageUrl:"https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",sortOrder:7,active:true},
  {id:"accessories",title:"Accessories",slug:"accessories",icon:"👜",imageUrl:"https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=80",sortOrder:8,active:true}
];
const shopDefaultProducts = [
  {id:"p-w-saree",sku:"QK-W-101",title:"Kanjivaram Silk Festive Saree",slug:"kanjivaram-silk-festive-saree",categoryId:"women",categoryName:"Women",brand:"Qikly Luxe",price:1899,mrp:4499,stock:38,rating:4.8,ratingCount:184,badge:"Diwali Pick",featured:true,newArrival:true,active:true,gender:"women",fabric:"Silk Blend",occasion:"Festive",fit:"Regular",sizes:["Free Size"],colors:["Maroon","Mustard","Emerald"],tags:["saree","silk","diwali"],highlights:["Rich zari inspired border","Soft drape","Blouse piece included"],description:"Festive silk-blend saree with a rich border and easy-to-style drape.",images:["https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=85","https://images.unsplash.com/photo-1609357605129-26f69add5d6e?auto=format&fit=crop&w=1200&q=85"]},
  {id:"p-w-lehenga",sku:"QK-W-102",title:"Festive Mirrorwork Lehenga Set",slug:"festive-mirrorwork-lehenga-set",categoryId:"ethnic",categoryName:"Ethnic Wear",brand:"Qikly Ethnic",price:2499,mrp:5999,stock:24,rating:4.7,ratingCount:129,badge:"Bestseller",featured:true,newArrival:true,active:true,gender:"women",fabric:"Georgette",occasion:"Wedding / Diwali",fit:"Flared",sizes:["S","M","L","XL"],colors:["Wine","Pink","Black"],tags:["lehenga","mirrorwork","wedding"],highlights:["Lightweight flare","Mirrorwork details","Matching dupatta"],description:"Statement festive lehenga set designed for Diwali parties and wedding celebrations.",images:["https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=1200&q=85"]},
  {id:"p-w-anarkali",sku:"QK-W-103",title:"Embroidered Anarkali Suit Set",slug:"embroidered-anarkali-suit-set",categoryId:"dresses",categoryName:"Dresses",brand:"Rangrez",price:1399,mrp:2999,stock:42,rating:4.6,ratingCount:91,badge:"Hot Deal",featured:true,active:true,gender:"women",fabric:"Rayon",occasion:"Festive",fit:"Regular",sizes:["S","M","L","XL","XXL"],colors:["Teal","Wine","Navy"],tags:["anarkali","suit","women"],highlights:["Soft rayon","Thread embroidery","Straight fit pants"],description:"Easy festive suit set with embroidered neckline and comfortable straight pants.",images:["https://images.unsplash.com/photo-1609748341205-0b2c772b3643?auto=format&fit=crop&w=1200&q=85"]},
  {id:"p-w-dress",sku:"QK-W-104",title:"Sequin Party Midi Dress",slug:"sequin-party-midi-dress",categoryId:"dresses",categoryName:"Dresses",brand:"Aura",price:1199,mrp:2499,stock:31,rating:4.5,ratingCount:77,badge:"Party Edit",active:true,gender:"women",fabric:"Poly Blend",occasion:"Party",fit:"Regular",sizes:["S","M","L","XL"],colors:["Black","Emerald","Gold"],tags:["dress","party","sequin"],highlights:["Comfort lining","Soft sparkle finish","Knee-length midi"],description:"Shimmer-ready party dress for Diwali dinners, parties and festive nights.",images:["https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&w=1200&q=85"]},
  {id:"p-m-kurta",sku:"QK-M-105",title:"Men’s Premium Cotton Kurta Set",slug:"mens-premium-cotton-kurta-set",categoryId:"men",categoryName:"Men",brand:"Qikly Men",price:1099,mrp:2299,stock:56,rating:4.7,ratingCount:163,badge:"Festive Favourite",featured:true,newArrival:true,active:true,gender:"men",fabric:"Cotton",occasion:"Diwali",fit:"Regular",sizes:["S","M","L","XL","XXL"],colors:["Cream","Black","Olive"],tags:["kurta","men","cotton"],highlights:["Breathable cotton","Mandarin collar","Matching pajama"],description:"Premium cotton kurta set made for puja, family dinners and festive gatherings.",images:["https://images.unsplash.com/photo-1617127365659-c47fa864d8bc?auto=format&fit=crop&w=1200&q=85"]},
  {id:"p-m-shirt",sku:"QK-M-106",title:"Textured Festive Shirt",slug:"textured-festive-shirt",categoryId:"men",categoryName:"Men",brand:"Northlane",price:799,mrp:1599,stock:73,rating:4.4,ratingCount:88,badge:"Under ₹999",active:true,gender:"men",fabric:"Cotton Blend",occasion:"Casual Festive",fit:"Slim",sizes:["S","M","L","XL","XXL"],colors:["Wine","White","Black"],tags:["shirt","men","casual"],highlights:["Breathable weave","Easy iron","Regular collar"],description:"Textured shirt that works with festive trousers or everyday denim.",images:["https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=1200&q=85"]},
  {id:"p-m-blazer",sku:"QK-M-107",title:"Velvet Party Blazer",slug:"velvet-party-blazer",categoryId:"men",categoryName:"Men",brand:"Aurelius",price:2199,mrp:4999,stock:18,rating:4.6,ratingCount:54,badge:"Premium Edit",active:true,gender:"men",fabric:"Velvet",occasion:"Party",fit:"Slim",sizes:["S","M","L","XL"],colors:["Black","Bottle Green","Wine"],tags:["blazer","party","premium"],highlights:["Soft velvet","Single button","Party-ready finish"],description:"Sharp velvet blazer for late-evening Diwali parties and celebrations.",images:["https://images.unsplash.com/photo-1598808503746-f34c53b9323e?auto=format&fit=crop&w=1200&q=85"]},
  {id:"p-kurta-kids",sku:"QK-K-108",title:"Kids Festive Kurta Pajama Set",slug:"kids-festive-kurta-pajama-set",categoryId:"kids",categoryName:"Kids",brand:"MiniFest",price:699,mrp:1299,stock:48,rating:4.8,ratingCount:66,badge:"Kids Pick",active:true,gender:"kids",fabric:"Cotton",occasion:"Diwali",fit:"Regular",sizes:["2-3Y","4-5Y","6-7Y","8-9Y","10-11Y"],colors:["Yellow","Blue","Maroon"],tags:["kids","kurta","diwali"],highlights:["Soft cotton","Easy waist pajama","Comfort-first cut"],description:"Festive cotton kurta pajama made for kids who want to run, play and celebrate.",images:["https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&w=1200&q=85"]},
  {id:"p-kids-frock",sku:"QK-K-109",title:"Girls Floral Party Frock",slug:"girls-floral-party-frock",categoryId:"kids",categoryName:"Kids",brand:"TinyGlow",price:749,mrp:1499,stock:41,rating:4.6,ratingCount:53,badge:"New",newArrival:true,active:true,gender:"kids",fabric:"Cotton Blend",occasion:"Party",fit:"Flared",sizes:["2-3Y","4-5Y","6-7Y","8-9Y"],colors:["Pink","Lavender","Peach"],tags:["girls","frock","party"],highlights:["Flare silhouette","Soft lining","Festive floral print"],description:"Cute party-ready frock with a soft lining and playful floral print.",images:["https://images.unsplash.com/photo-1503919005314-30d93d07d823?auto=format&fit=crop&w=1200&q=85"]},
  {id:"p-winter-jacket",sku:"QK-W-110",title:"Women’s Quilted Winter Jacket",slug:"womens-quilted-winter-jacket",categoryId:"winter",categoryName:"Winter Wear",brand:"NorthPeak",price:1399,mrp:2999,stock:35,rating:4.5,ratingCount:72,badge:"Winter Drop",newArrival:true,active:true,gender:"women",fabric:"Poly Fill",occasion:"Winter",fit:"Regular",sizes:["S","M","L","XL"],colors:["Black","Beige","Olive"],tags:["jacket","winter","women"],highlights:["Lightweight warmth","Zip pockets","Stand collar"],description:"Lightweight quilted jacket for chilly festive evenings and everyday winter wear.",images:["https://images.unsplash.com/photo-1548883354-7622d03aca27?auto=format&fit=crop&w=1200&q=85"]},
  {id:"p-m-hoodie",sku:"QK-M-111",title:"Oversized Festive Hoodie",slug:"oversized-festive-hoodie",categoryId:"winter",categoryName:"Winter Wear",brand:"StreetNorth",price:899,mrp:1899,stock:67,rating:4.5,ratingCount:102,badge:"Street Edit",active:true,gender:"men",fabric:"Fleece",occasion:"Casual",fit:"Oversized",sizes:["S","M","L","XL","XXL"],colors:["Black","Grey","Burgundy"],tags:["hoodie","oversized","winter"],highlights:["Warm fleece","Drop shoulder","Everyday street fit"],description:"Cozy oversized hoodie for late-night festive hangs and winter streetwear.",images:["https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=1200&q=85"]},
  {id:"p-sneakers",sku:"QK-F-112",title:"Festive Court Sneakers",slug:"festive-court-sneakers",categoryId:"footwear",categoryName:"Footwear",brand:"StreetFlex",price:1199,mrp:2499,stock:62,rating:4.5,ratingCount:147,badge:"Bestseller",active:true,gender:"unisex",fabric:"Synthetic",occasion:"Casual",fit:"Regular",sizes:["6","7","8","9","10"],colors:["White","Black","Beige"],tags:["sneakers","shoes","unisex"],highlights:["Cushioned footbed","Lightweight sole","Easy-clean finish"],description:"Clean sneakers that pair with festive kurtas, dresses or everyday denim.",images:["https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=85"]},
  {id:"p-bag",sku:"QK-A-113",title:"Structured Festive Handbag",slug:"structured-festive-handbag",categoryId:"accessories",categoryName:"Accessories",brand:"Aurea",price:899,mrp:1799,stock:44,rating:4.6,ratingCount:83,badge:"Trending",active:true,gender:"women",fabric:"Faux Leather",occasion:"Festive",fit:"One Size",sizes:["One Size"],colors:["Tan","Black","Wine"],tags:["handbag","women","accessory"],highlights:["Structured shape","Detachable strap","Zip closure"],description:"Compact structured handbag that finishes a festive outfit without overpowering it.",images:["https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&q=85"]},
  {id:"p-dupatta",sku:"QK-A-114",title:"Embroidered Festive Dupatta",slug:"embroidered-festive-dupatta",categoryId:"ethnic",categoryName:"Ethnic Wear",brand:"Rangrez",price:499,mrp:999,stock:95,rating:4.7,ratingCount:112,badge:"Add-on Pick",active:true,gender:"women",fabric:"Chiffon",occasion:"Festive",fit:"One Size",sizes:["Free Size"],colors:["Red","Gold","Green"],tags:["dupatta","ethnic","festive"],highlights:["Lightweight drape","Embroidered border","Gift-ready"],description:"Lightweight embroidered dupatta for upgrading an existing kurta or suit.",images:["https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=1200&q=85"]}
];
const shopDefaultCoupon={code:"DIWALI10",type:"percent",value:10,minOrder:799,maxDiscount:300,active:true,expiry:"2026-11-15T23:59:59+05:30"};
function shopSlug(v){return clean(v,160).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||`item-${Date.now()}`;}
async function ensureShopSeeded(){
  const meta=db.collection("shopMeta").doc("main");
  const metaSnap=await meta.get();
  if(metaSnap.exists&&metaSnap.data()?.seeded&&Number(metaSnap.data()?.version||1)>=3) return;
  const [settingsSnap,catSnap,productSnap,couponSnap]=await Promise.all([
    db.collection("shopSettings").doc("main").get(),
    db.collection("shopCategories").limit(1).get(),
    db.collection("shopProducts").limit(1).get(),
    db.collection("shopCoupons").limit(1).get()
  ]);
  const batch=db.batch();
  if(!settingsSnap.exists)batch.set(db.collection("shopSettings").doc("main"),{...shopDefaultSettings,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  if(catSnap.empty)shopDefaultCategories.forEach(c=>batch.set(db.collection("shopCategories").doc(c.id),{...c,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()}));
  if(productSnap.empty)shopDefaultProducts.forEach(x=>batch.set(db.collection("shopProducts").doc(x.id),{...x,sortOrder:shopDefaultProducts.indexOf(x)+1,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()}));
  if(couponSnap.empty)batch.set(db.collection("shopCoupons").doc(shopDefaultCoupon.code),{...shopDefaultCoupon,usedCount:0,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  const legacyProductIds=["p-earbuds-pro","p-iphone-case","p-sneakers","p-kurta","p-lamp","p-watch","p-facewash","p-mixer","p-football","p-bag","p-kids-set","p-grocery"];
  const legacyCategoryIds=["electronics","home","beauty","grocery","sports","fashion"];
  if(!metaSnap.exists || Number(metaSnap.data()?.version||1)<3){
    legacyProductIds.forEach(id=>batch.set(db.collection("shopProducts").doc(id),{active:false,legacyHidden:true,updatedAt:FieldValue.serverTimestamp()},{merge:true}));
    legacyCategoryIds.forEach(id=>batch.set(db.collection("shopCategories").doc(id),{active:false,legacyHidden:true,updatedAt:FieldValue.serverTimestamp()},{merge:true}));
    shopDefaultCategories.forEach(c=>batch.set(db.collection("shopCategories").doc(c.id),{...c,updatedAt:FieldValue.serverTimestamp()},{merge:true}));
    shopDefaultProducts.forEach((x,i)=>batch.set(db.collection("shopProducts").doc(x.id),{...x,sortOrder:i+1,updatedAt:FieldValue.serverTimestamp()},{merge:true}));
  }
  batch.set(meta,{seeded:true,version:3,seededAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
  await batch.commit();
}
async function getShopSettings(){return await getDoc("shopSettings","main",shopDefaultSettings);}
async function getShopCategories(includeInactive=false){
  const rows=await listCollection("shopCategories");
  const deletedSnap=await listCollection("shopDeletedCategories");
  const deleted=new Set(deletedSnap.map(x=>x.id));
  const merged=new Map(shopDefaultCategories.filter(x=>!deleted.has(x.id)).map(x=>[x.id,x]));
  rows.forEach(x=>merged.set(x.id,x));
  return [...merged.values()].filter(x=>includeInactive||x.active!==false).sort((a,b)=>num(a.sortOrder)-num(b.sortOrder));
}
async function getShopProducts(includeInactive=false){
  const rows=await listCollection("shopProducts");
  const deletedSnap=await listCollection("shopDeletedProducts");
  const deleted=new Set(deletedSnap.map(x=>x.id));
  const merged=new Map(shopDefaultProducts.filter(x=>!deleted.has(x.id)).map(x=>[x.id,x]));
  rows.forEach(x=>merged.set(x.id,x));
  return [...merged.values()].filter(x=>includeInactive||x.active!==false).sort((a,b)=>num(a.sortOrder)-num(b.sortOrder));
}
async function getShopCoupons(){const rows=await listCollection("shopCoupons");return rows.length?rows:[shopDefaultCoupon];}
function shopOrderNumber(){return `QK${Date.now().toString().slice(-8)}${crypto.randomBytes(2).toString("hex").toUpperCase()}`;}
function shopPublicProduct(p){const price=money(p.price),mrp=Math.max(price,money(p.mrp)||price),discount=Math.max(0,Math.round((1-price/mrp)*100));return jsonSafe({...p,price,mrp,discount,stock:Math.max(0,money(p.stock))});}
function shopCouponValid(c, subtotal){if(!c||c.active===false)return false;if(c.expiry&&new Date(c.expiry).getTime()<Date.now())return false;if(num(c.minOrder)>subtotal)return false;if(money(c.usageLimit)>0&&money(c.usedCount)>=money(c.usageLimit))return false;return true;}
async function buildShopQuote(itemsInput,couponCode){
  await ensureShopSeeded();
  const products=await getShopProducts(false); const byId=new Map(products.map(p=>[p.id,p]));
  const input=Array.isArray(itemsInput)?itemsInput:[]; if(!input.length)throw new Error("Cart is empty.");
  const items=[]; let subtotal=0;
  for(const raw of input){const id=clean(raw?.id,120),qty=Math.max(1,Math.min(20,money(raw?.qty)||1)),p=byId.get(id);if(!p)throw new Error("One of the products is no longer available.");if(money(p.stock)<=0)throw new Error(`${p.title} is out of stock.`);if(qty>money(p.stock))throw new Error(`${p.title} has only ${p.stock} left.`);const size=clean(raw?.size,40),color=clean(raw?.color,60);if(Array.isArray(p.sizes)&&p.sizes.length&&size&&!p.sizes.includes(size))throw new Error(`Selected size is unavailable for ${p.title}.`);if(Array.isArray(p.sizes)&&p.sizes.length&&!size)throw new Error(`Please select a size for ${p.title}.`);if(Array.isArray(p.colors)&&p.colors.length&&color&&!p.colors.includes(color))throw new Error(`Selected colour is unavailable for ${p.title}.`);if(Array.isArray(p.colors)&&p.colors.length&&!color)throw new Error(`Please select a colour for ${p.title}.`);const price=money(p.price);const row={id:p.id,title:p.title,sku:p.sku||"",price,qty,size,color,imageUrl:p.images?.[0]||p.imageUrl||"",brand:p.brand||"",categoryId:p.categoryId||""};items.push(row);subtotal+=price*qty;}
  let discount=0,coupon=null;const code=clean(couponCode,40).toUpperCase();if(code){const coupons=await getShopCoupons();coupon=coupons.find(x=>String(x.code||"").toUpperCase()===code);if(!shopCouponValid(coupon,subtotal))throw new Error("Coupon is invalid, expired or minimum order value is not met.");if(coupon.type==="percent")discount=Math.min(Math.round(subtotal*num(coupon.value)/100),Math.max(0,money(coupon.maxDiscount)||subtotal));else discount=Math.min(subtotal,Math.max(0,money(coupon.value)));}
  const settings=await getShopSettings();const afterDiscount=Math.max(0,subtotal-discount);const shipping=afterDiscount>=money(settings.freeShippingAbove)?0:Math.max(0,money(settings.shippingFee));const total=afterDiscount+shipping;
  return {items,subtotal,discount,shipping,total,coupon:coupon?{code:coupon.code,type:coupon.type,value:coupon.value}:null,freeShippingAbove:money(settings.freeShippingAbove),codEnabled:settings.codEnabled!==false};
}
async function decrementShopStock(tx,items,increment=false){for(const item of items){const ref=db.collection("shopProducts").doc(item.id);const snap=await tx.get(ref);if(!snap.exists)continue;const p=snap.data();const current=money(p.stock);const next=increment?current+money(item.qty):current-money(item.qty);if(!increment&&next<0)throw new Error(`${p.title} went out of stock.`);tx.set(ref,{stock:next,updatedAt:FieldValue.serverTimestamp()},{merge:true});}}
async function incrementShopCoupon(code){if(!code)return;const snap=await db.collection("shopCoupons").where("code","==",code).limit(1).get();if(!snap.empty){const ref=snap.docs[0].ref;await ref.set({usedCount:money(snap.docs[0].data().usedCount)+1,updatedAt:FieldValue.serverTimestamp()},{merge:true});}}
async function createShopOrder({quote,customer,address,userId,paymentMethod,paymentStatus,razorpayOrderId="",orderStatus="placed"}){
  const ref=db.collection("shopOrders").doc();const order={id:ref.id,orderNumber:shopOrderNumber(),userId:userId||"",customer:{name:clean(customer?.name,120),email:cleanEmail(customer?.email),phone:clean(customer?.phone,30)},address:{line1:clean(address?.line1,200),line2:clean(address?.line2,200),city:clean(address?.city,80),state:clean(address?.state,80),pincode:clean(address?.pincode,12),landmark:clean(address?.landmark,160)},items:quote.items,subtotal:quote.subtotal,discount:quote.discount,shipping:quote.shipping,total:quote.total,coupon:quote.coupon,paymentMethod,paymentStatus,orderStatus,razorpayOrderId,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};await db.runTransaction(async t=>{await decrementShopStock(t,quote.items,false);t.set(ref,order);});return jsonSafe(order);
}
app.get("/api/shop/public",async(req,res)=>{try{await ensureShopSeeded();const [settings,categories,products]=await Promise.all([getShopSettings(),getShopCategories(false),getShopProducts(false)]);res.set("Cache-Control","no-store");res.json({settings,categories,products:products.map(shopPublicProduct)});}catch(e){res.status(500).json({error:e.message||"Unable to load store."});}});
app.get("/api/shop/product/:id",async(req,res)=>{try{const products=await getShopProducts(false);const p=products.find(x=>x.id===clean(req.params.id,120));if(!p)return res.status(404).json({error:"Product not found."});const related=products.filter(x=>x.id!==p.id&&x.categoryId===p.categoryId).slice(0,4);res.json({product:shopPublicProduct(p),related:related.map(shopPublicProduct)});}catch(e){res.status(500).json({error:e.message});}});
app.get("/api/shop/reviews/:id",async(req,res)=>{try{const snap=await db.collection("shopReviews").where("productId","==",clean(req.params.id,120)).get();const rows=snap.docs.map(d=>jsonSafe({id:d.id,...d.data()})).filter(x=>x.approved!==false).sort((a,b)=>dateMs(b.createdAt)-dateMs(a.createdAt)).slice(0,100);res.json({reviews:rows});}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/shop/reviews",guardUser,async(req,res)=>{try{const productId=clean(req.body.productId,120),rating=Math.max(1,Math.min(5,money(req.body.rating)||5)),title=clean(req.body.title,120),body=clean(req.body.body,1000);if(!productId||!body)return res.status(400).json({error:"Product and review text are required."});const ref=db.collection("shopReviews").doc();await ref.set({productId,userId:req.user.id,userName:req.user.name||"Verified Buyer",rating,title,body,approved:true,createdAt:FieldValue.serverTimestamp()});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/shop/quote",async(req,res)=>{try{res.json(await buildShopQuote(req.body.items,req.body.couponCode));}catch(e){res.status(400).json({error:e.message});}});
app.post("/api/shop/order/cod",async(req,res)=>{try{const quote=await buildShopQuote(req.body.items,req.body.couponCode);if(!quote.codEnabled)return res.status(400).json({error:"Cash on Delivery is currently disabled."});const user=await currentUser(req);if(!clean(req.body.customer?.name,120)||!clean(req.body.customer?.phone,30)||!clean(req.body.address?.line1,200)||!clean(req.body.address?.city,80)||!clean(req.body.address?.state,80)||!clean(req.body.address?.pincode,12))return res.status(400).json({error:"Please complete delivery details."});const order=await createShopOrder({quote,customer:req.body.customer,address:req.body.address,userId:user?.id||"",paymentMethod:"cod",paymentStatus:"pending",orderStatus:"placed"});await incrementShopCoupon(quote.coupon?.code);res.json({ok:true,order});}catch(e){res.status(400).json({error:e.message||"Unable to place COD order."});}});
app.get("/api/shop/config",async(req,res)=>{try{const settings=await getShopSettings();res.json({razorpayKeyId:process.env.RAZORPAY_KEY_ID||"",codEnabled:settings.codEnabled!==false});}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/shop/order/create",async(req,res)=>{try{const quote=await buildShopQuote(req.body.items,req.body.couponCode);const rpayKey=String(process.env.RAZORPAY_KEY_ID||"");if(!rpayKey||!String(process.env.RAZORPAY_KEY_SECRET||""))return res.status(503).json({error:"Online payment is not configured."});const ref=db.collection("shopOrders").doc();const receipt=`shop_${Date.now().toString().slice(-10)}_${crypto.randomBytes(2).toString("hex")}`;const rp=await razorpay.orders.create({amount:quote.total*100,currency:"INR",receipt,notes:{shopOrderId:ref.id,cartItems:String(quote.items.length)}});const user=await currentUser(req);const order={id:ref.id,orderNumber:shopOrderNumber(),userId:user?.id||"",customer:{name:clean(req.body.customer?.name,120),email:cleanEmail(req.body.customer?.email),phone:clean(req.body.customer?.phone,30)},address:{line1:clean(req.body.address?.line1,200),line2:clean(req.body.address?.line2,200),city:clean(req.body.address?.city,80),state:clean(req.body.address?.state,80),pincode:clean(req.body.address?.pincode,12),landmark:clean(req.body.address?.landmark,160)},items:quote.items,subtotal:quote.subtotal,discount:quote.discount,shipping:quote.shipping,total:quote.total,coupon:quote.coupon,paymentMethod:"razorpay",paymentStatus:"created",orderStatus:"payment_pending",razorpayOrderId:rp.id,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};await ref.set(order);res.json({ok:true,keyId:rpayKey,razorpayOrder:{id:rp.id,amount:rp.amount,currency:rp.currency},order:jsonSafe(order)});}catch(e){res.status(400).json({error:e.message||"Unable to create payment order."});}});
app.post("/api/shop/order/verify",async(req,res)=>{try{const {razorpay_order_id,razorpay_payment_id,razorpay_signature}=req.body||{};if(!razorpay_order_id||!razorpay_payment_id||!razorpay_signature)return res.status(400).json({error:"Payment details are incomplete."});const expected=crypto.createHmac("sha256",String(process.env.RAZORPAY_KEY_SECRET||"")).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");if(!timingSafeEqualText(expected,razorpay_signature))return res.status(400).json({error:"Payment verification failed."});const ref=db.collection("shopOrders").where("razorpayOrderId","==",razorpay_order_id).limit(1);const snap=await ref.get();if(snap.empty)return res.status(404).json({error:"Shop order not found."});const orderRef=snap.docs[0].ref;const existing=snap.docs[0].data();if(existing.paymentStatus==="paid")return res.json({ok:true,order:jsonSafe(existing)});const payment=await razorpay.payments.fetch(razorpay_payment_id);if(payment.status!=="captured"||money(payment.amount)!==money(existing.total)*100)return res.status(400).json({error:"Payment amount/status is not valid."});await db.runTransaction(async t=>{const latest=await t.get(orderRef);const o=latest.data()||{};if(o.paymentStatus==="paid")return;await decrementShopStock(t,o.items||[],false);t.set(orderRef,{paymentStatus:"paid",orderStatus:"placed",razorpayPaymentId:razorpay_payment_id,razorpaySignature:razorpay_signature,updatedAt:FieldValue.serverTimestamp()},{merge:true});});const updated=await orderRef.get();await incrementShopCoupon(updated.data()?.coupon?.code);res.json({ok:true,order:jsonSafe({id:updated.id,...updated.data()})});}catch(e){res.status(400).json({error:e.message||"Payment verification failed."});}});
app.get("/api/shop/my-orders",guardUser,async(req,res)=>{try{const snap=await db.collection("shopOrders").where("userId","==",req.user.id).get();res.json({orders:snap.docs.map(d=>jsonSafe({id:d.id,...d.data()})).sort((a,b)=>dateMs(b.createdAt)-dateMs(a.createdAt))});}catch(e){res.status(500).json({error:e.message});}});
app.get("/api/shop/my-orders/:id",guardUser,async(req,res)=>{try{const snap=await db.collection("shopOrders").doc(clean(req.params.id,120)).get();if(!snap.exists||snap.data().userId!==req.user.id)return res.status(404).json({error:"Order not found."});res.json({order:jsonSafe({id:snap.id,...snap.data()})});}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/shop/orders/:id/cancel",guardUser,async(req,res)=>{try{const ref=db.collection("shopOrders").doc(clean(req.params.id,120));await db.runTransaction(async t=>{const snap=await t.get(ref);if(!snap.exists||snap.data().userId!==req.user.id)throw new Error("Order not found.");const o=snap.data();if(o.paymentStatus==="paid"||o.razorpayPaymentId)throw new Error("Paid orders cannot be cancelled. Please contact support for refund assistance.");if(!["payment_pending","placed","packed"].includes(o.orderStatus))throw new Error("This order can no longer be cancelled.");const reserved=o.paymentMethod==="cod";if(reserved)await decrementShopStock(t,o.items||[],true);t.set(ref,{orderStatus:"cancelled",paymentStatus:o.paymentStatus,updatedAt:FieldValue.serverTimestamp()},{merge:true});});res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});
app.get("/api/admin/shop/data",guardAdmin,async(req,res)=>{try{await ensureShopSeeded();const [settings,cats,prods,coupons,orders,users]=await Promise.all([getShopSettings(),getShopCategories(true),getShopProducts(true),getShopCoupons(),listCollection("shopOrders"),listCollection("users")]);const rows=orders.sort((a,b)=>dateMs(b.createdAt)-dateMs(a.createdAt));const stats={products:prods.length,categories:cats.length,orders:rows.length,revenue:rows.filter(x=>x.paymentStatus==="paid"||x.paymentMethod==="cod").filter(x=>x.orderStatus!=="cancelled").reduce((s,x)=>s+money(x.total),0),pending:rows.filter(x=>["payment_pending","placed","packed","shipped","out_for_delivery"].includes(x.orderStatus)).length,customers:users.length};res.json(jsonSafe({settings,categories:cats,products:prods.map(shopPublicProduct),coupons,orders:rows,users,stats}));}catch(e){res.status(500).json({error:e.message||"Unable to load shop admin data."});}});
app.post("/api/admin/shop/settings",guardAdmin,async(req,res)=>{try{const b=req.body||{},payload={...shopDefaultSettings,...b,siteName:clean(b.siteName,120)||shopDefaultSettings.siteName,tagline:clean(b.tagline,240),announcement:clean(b.announcement,500),heroTitle:clean(b.heroTitle,240),heroText:clean(b.heroText,1200),heroImage:clean(b.heroImage,1200),logoText:clean(b.logoText,60)||"Qikly",logoMark:clean(b.logoMark,6)||"Q",shippingFee:Math.max(0,money(b.shippingFee)),freeShippingAbove:Math.max(0,money(b.freeShippingAbove)),codEnabled:b.codEnabled!==false,returnDays:Math.max(0,money(b.returnDays)||7),saleLabel:clean(b.saleLabel,100),saleEndsAt:clean(b.saleEndsAt,80),supportEmail:cleanEmail(b.supportEmail),trustBadges:Array.isArray(b.trustBadges)?b.trustBadges.slice(0,8):shopDefaultSettings.trustBadges,banners:Array.isArray(b.banners)?b.banners.slice(0,6):shopDefaultSettings.banners,footerText:clean(b.footerText,1200),updatedAt:FieldValue.serverTimestamp()};await db.collection("shopSettings").doc("main").set(payload,{merge:true});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/admin/shop/product",guardAdmin,async(req,res)=>{try{const b=req.body||{},id=clean(b.id,120)||`product_${Date.now()}`,images=Array.isArray(b.images)?b.images.map(x=>clean(x,1200)).filter(Boolean).slice(0,8):[],price=money(b.price),mrp=Math.max(price,money(b.mrp)||price);if(!clean(b.title,160)||price<=0||!images.length)return res.status(400).json({error:"Title, valid price and at least one image are required."});const payload={sku:clean(b.sku,80)||`QK-${Date.now().toString().slice(-6)}`,title:clean(b.title,160),slug:shopSlug(b.slug||b.title),categoryId:clean(b.categoryId,80),categoryName:clean(b.categoryName,120),brand:clean(b.brand,100),price,mrp,stock:Math.max(0,money(b.stock)),rating:Math.min(5,Math.max(0,num(b.rating)||0)),ratingCount:Math.max(0,money(b.ratingCount)),badge:clean(b.badge,60),featured:b.featured===true,newArrival:b.newArrival===true,active:b.active!==false,gender:clean(b.gender,40),fabric:clean(b.fabric,80),occasion:clean(b.occasion,100),fit:clean(b.fit,60),sizes:Array.isArray(b.sizes)?b.sizes.map(x=>clean(x,40)).filter(Boolean).slice(0,20):clean(b.sizes,300).split(",").map(x=>x.trim()).filter(Boolean).slice(0,20),colors:Array.isArray(b.colors)?b.colors.map(x=>clean(x,60)).filter(Boolean).slice(0,12):clean(b.colors,300).split(",").map(x=>x.trim()).filter(Boolean).slice(0,12),tags:Array.isArray(b.tags)?b.tags.map(x=>clean(x,40)).filter(Boolean).slice(0,15):clean(b.tags,300).split(",").map(x=>x.trim()).filter(Boolean).slice(0,15),highlights:Array.isArray(b.highlights)?b.highlights.map(x=>clean(x,160)).filter(Boolean).slice(0,10):[],description:clean(b.description,4000),images,sortOrder:money(b.sortOrder)||Date.now(),updatedAt:FieldValue.serverTimestamp()};await db.collection("shopProducts").doc(id).set(payload,{merge:true});res.json({ok:true,id});}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/admin/shop/delete-product",guardAdmin,async(req,res)=>{try{const id=clean(req.body.id,120);if(!id)return res.status(400).json({error:"Product id required."});await db.collection("shopProducts").doc(id).delete();await db.collection("shopDeletedProducts").doc(id).set({id,deletedAt:FieldValue.serverTimestamp()});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/admin/shop/category",guardAdmin,async(req,res)=>{try{const b=req.body||{},id=clean(b.id,80)||shopSlug(b.title);const payload={title:clean(b.title,120),slug:shopSlug(b.slug||b.title),icon:clean(b.icon,12),imageUrl:clean(b.imageUrl,1200),sortOrder:money(b.sortOrder)||1,active:b.active!==false,updatedAt:FieldValue.serverTimestamp()};if(!payload.title)return res.status(400).json({error:"Category title required."});await db.collection("shopCategories").doc(id).set(payload,{merge:true});res.json({ok:true,id});}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/admin/shop/delete-category",guardAdmin,async(req,res)=>{try{const id=clean(req.body.id,80);if(!id)return res.status(400).json({error:"Category id required."});await db.collection("shopCategories").doc(id).delete();await db.collection("shopDeletedCategories").doc(id).set({id,deletedAt:FieldValue.serverTimestamp()});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/admin/shop/coupon",guardAdmin,async(req,res)=>{try{const b=req.body||{},id=clean(b.id,80)||clean(b.code,40).toUpperCase();const code=clean(b.code,40).toUpperCase();const type=b.type==="fixed"?"fixed":"percent";const value=Math.max(0,money(b.value));if(!code||value<=0)return res.status(400).json({error:"Coupon code and value are required."});const payload={code,type,value,minOrder:Math.max(0,money(b.minOrder)),maxDiscount:Math.max(0,money(b.maxDiscount)),active:b.active!==false,expiry:clean(b.expiry,80),usageLimit:Math.max(0,money(b.usageLimit)),updatedAt:FieldValue.serverTimestamp()};await db.collection("shopCoupons").doc(id).set(payload,{merge:true});res.json({ok:true,id});}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/admin/shop/delete-coupon",guardAdmin,async(req,res)=>{try{const id=clean(req.body.id,80);if(!id)return res.status(400).json({error:"Coupon id required."});await db.collection("shopCoupons").doc(id).delete();res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/admin/shop/order-status",guardAdmin,async(req,res)=>{try{const id=clean(req.body.id,120),status=clean(req.body.status,40);const allowed=["payment_pending","placed","packed","shipped","out_for_delivery","delivered","cancelled"];if(!allowed.includes(status))return res.status(400).json({error:"Invalid order status."});const ref=db.collection("shopOrders").doc(id);const snap=await ref.get();if(!snap.exists)return res.status(404).json({error:"Order not found."});await ref.set({orderStatus:status,updatedAt:FieldValue.serverTimestamp()},{merge:true});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

app.get("/api/health",(req,res)=>res.json({ok:true,firebaseConfigured:!!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,razorpayConfigured:!!process.env.RAZORPAY_KEY_ID&&!!process.env.RAZORPAY_KEY_SECRET,geminiConfigured:!!process.env.GEMINI_API_KEY}));

module.exports=app;
