const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const admin = require("firebase-admin");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb", verify: (req, _res, buf) => { req.rawBody = Buffer.from(buf); } }));

// Firebase Admin is the only database client. Browser-side Firestore access stays disabled.
if (!admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON");
  const serviceAccount = typeof raw === "string" ? JSON.parse(raw) : raw;
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL || undefined
  });
}
const db = admin.firestore();
const FV = admin.firestore.FieldValue;
const razorpayReady = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
const razorpay = razorpayReady ? new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
}) : null;

const SESSION_COOKIE = "mintu_smm_session";
const ADMIN_COOKIE = "mintu_smm_admin";
const SESSION_SECRET = String(process.env.SESSION_SECRET || "");
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "");
const LUVSMM_URL = String(process.env.LUVSMM_API_URL || "https://luvsmm.com/api/v2").trim();
const LUVSMM_API_KEY = String(process.env.LUVSMM_API_KEY || "").trim();
const DEFAULT_MARKUP = Math.min(500, Math.max(0, Number(process.env.DEFAULT_MARKUP_PERCENT || 30)));
const SITE_NAME = String(process.env.SITE_NAME || "Mintu Social").trim().slice(0, 50);

if (process.env.NODE_ENV === "production") {
  if (SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET must contain at least 32 random characters.");
  if (ADMIN_PASSWORD.length < 12 || ADMIN_PASSWORD === "change-me") throw new Error("Set a unique ADMIN_PASSWORD with at least 12 characters.");
}

const loginAttempts = new Map();
function rateAllowed(req, key, max = 12, windowMs = 10 * 60 * 1000) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  const id = `${key}:${ip}`;
  const now = Date.now();
  const item = loginAttempts.get(id) || { start: now, count: 0 };
  if (now - item.start > windowMs) { item.start = now; item.count = 0; }
  item.count += 1;
  loginAttempts.set(id, item);
  if (loginAttempts.size > 4000) {
    for (const [k, v] of loginAttempts) if (now - v.start > windowMs) loginAttempts.delete(k);
  }
  return item.count <= max;
}
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET || "local-development-only").update(body).digest("base64url");
  return `${body}.${sig}`;
}
function unsign(token) {
  try {
    const [body, sig] = String(token || "").split(".");
    if (!body || !sig) return null;
    const expected = crypto.createHmac("sha256", SESSION_SECRET || "local-development-only").update(body).digest("base64url");
    const a = Buffer.from(sig); const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch { return null; }
}
function setCookie(res, name, value, seconds = 7 * 86400) {
  res.setHeader("Set-Cookie", `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
}
function clearCookie(res, name) {
  res.setHeader("Set-Cookie", `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
}
function cookie(req, name) {
  const part = String(req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : "";
}
function userFromReq(req) {
  const p = unsign(cookie(req, SESSION_COOKIE));
  return p?.uid ? { uid: p.uid, email: p.email, name: p.name } : null;
}
function requireUser(req, res, next) {
  const user = userFromReq(req);
  if (!user) return res.status(401).json({ error: "Please login first." });
  req.user = user;
  next();
}
function requireAdmin(req, res, next) {
  const p = unsign(cookie(req, ADMIN_COOKIE));
  if (!p?.admin) return res.status(401).json({ error: "Admin login required." });
  next();
}
function safeUser(data, id) {
  return { id, name: data.name || "Customer", email: data.email || "", balance: Number(data.balance || 0), createdAt: data.createdAt || null, disabled: data.disabled === true };
}
function money(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function asNum(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function errorText(e) { return String(e?.error?.description || e?.message || "Something went wrong.").slice(0, 300); }
function validateHttpUrl(value) {
  try { const u = new URL(String(value)); return ["http:", "https:"].includes(u.protocol) && u.hostname.includes(".") ? u.toString() : ""; }
  catch { return ""; }
}
// Services are never auto-published. An authenticated admin must review and approve
// each imported item before it can appear in the public catalogue or be ordered.
function serviceIsSellable(s) {
  return Boolean(s && s.active === true && s.approvalStatus === "approved" &&
    s.complianceVerified === true && Number(s.sellingPricePer1000 || 0) > 0);
}
function providerConfigured() { return Boolean(LUVSMM_API_KEY); }
function providerUrlValid() {
  try { const u = new URL(LUVSMM_URL); return u.protocol === "https:" && u.hostname === "luvsmm.com" && u.pathname.replace(/\/$/, "") === "/api/v2"; }
  catch { return false; }
}
async function luvsmm(action, extra = {}) {
  if (!providerConfigured()) throw new Error("LUVSMM_API_KEY is not configured in Vercel.");
  if (!providerUrlValid()) throw new Error("LUVSMM_API_URL must be https://luvsmm.com/api/v2.");
  const body = new URLSearchParams({ key: LUVSMM_API_KEY, action, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) });
  const response = await fetch(LUVSMM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
    body,
    signal: AbortSignal.timeout(8000),
    redirect: "error"
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(`LuvSMM returned invalid JSON (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(`LuvSMM HTTP ${response.status}: ${data?.error || "Request failed."}`);
  if (data?.error) throw new Error(String(data.error));
  return data;
}
async function listCollection(name, max = 250) {
  const snap = await db.collection(name).limit(max).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
function mapProviderStatus(value) {
  const s = String(value || "Pending").toLowerCase();
  if (s.includes("complete")) return "Completed";
  if (s.includes("partial")) return "Partial";
  if (s.includes("cancel")) return "Canceled";
  if (s.includes("progress")) return "In progress";
  if (s.includes("process")) return "Processing";
  if (s.includes("pending")) return "Pending";
  return String(value || "Pending").slice(0, 40);
}
async function creditWalletFromPayment({ razorpayOrderId, paymentId, userId, amount, currency = "INR" }) {
  const paymentRef = db.collection("smmWalletPayments").doc(String(razorpayOrderId));
  return db.runTransaction(async tx => {
    const paymentSnap = await tx.get(paymentRef);
    if (!paymentSnap.exists) throw new Error("Payment record not found.");
    const payment = paymentSnap.data();
    if (payment.userId !== userId) throw new Error("Payment belongs to another account.");
    if (payment.status === "paid") return { ok: true, alreadyCredited: true };
    if (payment.status !== "created") throw new Error("This payment is no longer active.");
    const expectedPaise = Math.round(Number(payment.amount) * 100);
    if (Math.round(Number(amount)) !== expectedPaise || currency !== "INR") throw new Error("Payment amount or currency mismatch.");
    const userRef = db.collection("smmUsers").doc(userId);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists || userSnap.data().disabled === true) throw new Error("User account is unavailable.");
    const nextBalance = money(Number(userSnap.data().balance || 0) + Number(payment.amount));
    tx.update(userRef, { balance: nextBalance, updatedAt: FV.serverTimestamp() });
    tx.update(paymentRef, { status: "paid", paymentId: String(paymentId), paidAt: FV.serverTimestamp() });
    const ledgerRef = db.collection("smmTransactions").doc(`deposit_${String(razorpayOrderId)}`);
    tx.set(ledgerRef, {
      userId, type: "deposit", amount: Number(payment.amount), currency: "INR",
      reference: String(paymentId), razorpayOrderId: String(razorpayOrderId),
      note: "Wallet recharge", createdAt: FV.serverTimestamp()
    });
    return { ok: true, balance: nextBalance };
  });
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "mintu-smm-api", firebase: true, razorpay: razorpayReady, luvsmm: providerConfigured() }));
app.get("/api/public/config", async (_req, res) => {
  try { const settings = await getAdminSettings(); res.json({ siteName: settings.siteName || SITE_NAME, supportEmail: settings.supportEmail || "", razorpayKeyId: process.env.RAZORPAY_KEY_ID || "", currency: "INR", signupEnabled: true }); }
  catch { res.json({ siteName: SITE_NAME, supportEmail: "", razorpayKeyId: process.env.RAZORPAY_KEY_ID || "", currency: "INR", signupEnabled: true }); }
});

// Customer authentication ----------------------------------------------------
app.post("/api/auth/signup", async (req, res) => {
  try {
    if (!rateAllowed(req, "signup", 8)) return res.status(429).json({ error: "Too many attempts. Try again later." });
    const name = String(req.body?.name || "").trim().slice(0, 60);
    const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 160);
    const password = String(req.body?.password || "");
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: "Enter your name, a valid email and a password of at least 8 characters." });
    }
    const existing = await db.collection("smmUsers").where("email", "==", email).limit(1).get();
    if (!existing.empty) return res.status(409).json({ error: "An account with this email already exists." });
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (e, k) => e ? reject(e) : resolve(k.toString("hex"))));
    const ref = db.collection("smmUsers").doc();
    await ref.set({ name, email, passwordHash: hash, passwordSalt: salt, balance: 0, disabled: false, createdAt: FV.serverTimestamp() });
    setCookie(res, SESSION_COOKIE, sign({ uid: ref.id, name, email, exp: Date.now() + 7 * 86400000 }));
    res.json({ ok: true, user: { id: ref.id, name, email, balance: 0 } });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    if (!rateAllowed(req, "login", 12)) return res.status(429).json({ error: "Too many login attempts. Try again later." });
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const found = await db.collection("smmUsers").where("email", "==", email).limit(1).get();
    if (found.empty) return res.status(401).json({ error: "Invalid email or password." });
    const d = found.docs[0]; const u = d.data();
    const candidate = await new Promise((resolve, reject) => crypto.scrypt(password, u.passwordSalt, 64, (e, k) => e ? reject(e) : resolve(k.toString("hex"))));
    const a = Buffer.from(candidate, "hex"); const b = Buffer.from(String(u.passwordHash || ""), "hex");
    if (!u.passwordHash || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Invalid email or password." });
    if (u.disabled === true) return res.status(403).json({ error: "This account has been disabled. Contact support." });
    setCookie(res, SESSION_COOKIE, sign({ uid: d.id, name: u.name || "Customer", email: u.email, exp: Date.now() + 7 * 86400000 }));
    res.json({ ok: true, user: safeUser(u, d.id) });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.get("/api/auth/me", async (req, res) => {
  const u = userFromReq(req);
  if (!u) return res.json({ authenticated: false, user: null });
  try {
    const snap = await db.collection("smmUsers").doc(u.uid).get();
    if (!snap.exists || snap.data().disabled === true) { clearCookie(res, SESSION_COOKIE); return res.json({ authenticated: false, user: null }); }
    res.json({ authenticated: true, user: safeUser(snap.data(), snap.id) });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.post("/api/auth/logout", (_req, res) => { clearCookie(res, SESSION_COOKIE); res.json({ ok: true }); });

// Public catalogue contains only services manually approved by an admin.
app.get("/api/services", async (_req, res) => {
  try {
    const all = await listCollection("smmServices", 1000);
    const services = all.filter(serviceIsSellable).map(s => ({
      id: s.id, name: s.name, category: s.category || "Other", description: s.description || "",
      min: Number(s.min || 1), max: Number(s.max || 10000), pricePer1000: Number(s.sellingPricePer1000 || 0), pricingModel: s.pricingModel || "per1000",
      type: s.type || "Default", refill: Boolean(s.refill), cancel: Boolean(s.cancel), source: s.source || "manual"
    })).filter(s => s.pricePer1000 > 0).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    res.set("Cache-Control", "no-store");
    res.json({ services });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

// Wallet ---------------------------------------------------------------------
app.get("/api/wallet", requireUser, async (req, res) => {
  try {
    const [u, txs] = await Promise.all([
      db.collection("smmUsers").doc(req.user.uid).get(),
      db.collection("smmTransactions").where("userId", "==", req.user.uid).limit(30).get()
    ]);
    if (!u.exists) return res.status(404).json({ error: "Account not found." });
    const transactions = txs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    res.json({ balance: Number(u.data().balance || 0), transactions });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.post("/api/wallet/create-order", requireUser, async (req, res) => {
  try {
    if (!razorpayReady) return res.status(503).json({ error: "Razorpay is not configured. Add Razorpay keys in Vercel." });
    const amount = money(asNum(req.body?.amount));
    if (amount < 50 || amount > 50000) return res.status(400).json({ error: "Wallet recharge must be between ₹50 and ₹50,000." });
    const order = await razorpay.orders.create({ amount: Math.round(amount * 100), currency: "INR", receipt: `wallet_${req.user.uid.slice(0, 8)}_${Date.now()}` });
    await db.collection("smmWalletPayments").doc(order.id).set({ userId: req.user.uid, amount, currency: "INR", status: "created", createdAt: FV.serverTimestamp() });
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (e) { res.status(502).json({ error: errorText(e) }); }
});
app.post("/api/wallet/verify", requireUser, async (req, res) => {
  try {
    if (!razorpayReady) return res.status(503).json({ error: "Razorpay is not configured." });
    const orderId = String(req.body?.razorpay_order_id || "");
    const paymentId = String(req.body?.razorpay_payment_id || "");
    const signature = String(req.body?.razorpay_signature || "");
    if (!orderId || !paymentId || !signature) return res.status(400).json({ error: "Incomplete Razorpay response." });
    const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
    const x = Buffer.from(signature); const y = Buffer.from(expected);
    if (x.length !== y.length || !crypto.timingSafeEqual(x, y)) return res.status(400).json({ error: "Payment signature verification failed." });
    const payment = await razorpay.payments.fetch(paymentId);
    if (payment.order_id !== orderId || payment.status !== "captured") return res.status(409).json({ error: "Payment is not captured yet." });
    const result = await creditWalletFromPayment({ razorpayOrderId: orderId, paymentId, userId: req.user.uid, amount: payment.amount, currency: payment.currency });
    res.json(result);
  } catch (e) { res.status(400).json({ error: errorText(e) }); }
});

// Optional Razorpay webhook. Configure the exact URL in the Razorpay dashboard.
app.post("/api/razorpay/webhook", async (req, res) => {
  try {
    const secret = String(process.env.RAZORPAY_WEBHOOK_SECRET || "");
    if (!secret) return res.status(503).json({ error: "Webhook secret is not configured." });
    const signature = String(req.headers["x-razorpay-signature"] || "");
    const expected = crypto.createHmac("sha256", secret).update(req.rawBody || Buffer.alloc(0)).digest("hex");
    const a = Buffer.from(signature); const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(400).json({ error: "Invalid webhook signature." });
    const event = req.body?.event;
    if (event === "payment.captured" || event === "order.paid") {
      const payment = req.body?.payload?.payment?.entity;
      if (payment?.order_id && payment?.id && payment.status === "captured") {
        const p = await db.collection("smmWalletPayments").doc(String(payment.order_id)).get();
        if (p.exists) await creditWalletFromPayment({ razorpayOrderId: payment.order_id, paymentId: payment.id, userId: p.data().userId, amount: payment.amount, currency: payment.currency });
      }
    }
    res.json({ received: true });
  } catch (e) { res.status(400).json({ error: errorText(e) }); }
});

// Orders ---------------------------------------------------------------------
app.get("/api/orders", requireUser, async (req, res) => {
  try {
    const snap = await db.collection("smmOrders").where("userId", "==", req.user.uid).limit(100).get();
    const orders = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    res.json({ orders });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.post("/api/orders/create", requireUser, async (req, res) => {
  let reservedOrderRef = null;
  try {
    const serviceId = String(req.body?.serviceId || "").slice(0, 160);
    const link = validateHttpUrl(req.body?.link);
    const quantity = Math.floor(asNum(req.body?.quantity));
    if (!serviceId || !link || !Number.isSafeInteger(quantity) || quantity < 1) return res.status(400).json({ error: "Select a service, enter a valid URL and quantity." });
    const serviceRef = db.collection("smmServices").doc(serviceId);
    const orderRef = db.collection("smmOrders").doc();
    reservedOrderRef = orderRef;
    let orderData;
    await db.runTransaction(async tx => {
      const [serviceSnap, userSnap] = await Promise.all([tx.get(serviceRef), tx.get(db.collection("smmUsers").doc(req.user.uid))]);
      if (!serviceSnap.exists || !serviceIsSellable({ id: serviceSnap.id, ...serviceSnap.data() })) throw new Error("This service is not available for ordering.");
      const service = { id: serviceSnap.id, ...serviceSnap.data() };
      if (quantity < Number(service.min || 1) || quantity > Number(service.max || 10000)) throw new Error(`Quantity must be between ${service.min} and ${service.max}.`);
      if (!userSnap.exists || userSnap.data().disabled === true) throw new Error("User account is unavailable.");
      const cost = service.pricingModel === "fixed" ? money(Number(service.sellingPricePer1000 || 0)) : money(Math.max(1, quantity * Number(service.sellingPricePer1000 || 0) / 1000));
      const balance = money(Number(userSnap.data().balance || 0));
      if (balance < cost) throw new Error(`Insufficient wallet balance. Required ₹${cost.toFixed(2)}.`);
      const provider = service.source === "luvsmm" ? "luvsmm" : "manual";
      if (provider === "luvsmm" && !service.supplierServiceId) throw new Error("Supplier service ID is missing. Re-sync the catalogue.");
      tx.update(userSnap.ref, { balance: money(balance - cost), updatedAt: FV.serverTimestamp() });
      orderData = {
        userId: req.user.uid, userEmail: req.user.email, userName: req.user.name,
        serviceId, serviceName: service.name, category: service.category || "Other", pricingModel: service.pricingModel || "per1000",
        source: provider, supplierServiceId: service.supplierServiceId || null,
        link, quantity, amount: cost, status: provider === "manual" ? "Awaiting review" : "Submitting",
        supplierOrderId: null, supplierCharge: null, remains: quantity, startCount: null,
        createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp()
      };
      tx.set(orderRef, orderData);
      tx.set(db.collection("smmTransactions").doc(`order_${orderRef.id}`), {
        userId: req.user.uid, type: "order", amount: -cost, currency: "INR", reference: orderRef.id,
        note: `Order: ${service.name}`, createdAt: FV.serverTimestamp()
      });
    });
    if (orderData.source === "manual") return res.json({ ok: true, orderId: orderRef.id, status: "Awaiting review", amount: orderData.amount });

    // Only manually approved and active services reach this dispatch path.
    let upstream;
    try {
      upstream = await luvsmm("add", { service: orderData.supplierServiceId, link: orderData.link, quantity: orderData.quantity });
    } catch (providerError) {
      // A timeout can happen after the supplier has accepted an order. Do not auto-refund an ambiguous dispatch.
      const msg = errorText(providerError);
      const isTimeout = /timeout|timed out|network|fetch failed|socket/i.test(msg);
      if (isTimeout) {
        await orderRef.update({ status: "Supplier confirmation needed", dispatchNote: "Supplier response could not be confirmed. Admin must reconcile before refunding.", updatedAt: FV.serverTimestamp() });
        return res.status(202).json({ ok: true, orderId: orderRef.id, status: "Supplier confirmation needed", message: "Order is reserved for manual reconciliation. Do not submit it again." });
      }
      await refundReservedOrder(orderRef.id, `Supplier rejected order: ${msg}`);
      return res.status(502).json({ error: `Supplier rejected the order. Wallet amount was returned. ${msg}` });
    }
    const supplierOrderId = String(upstream?.order || upstream?.id || "");
    if (!supplierOrderId) {
      await refundReservedOrder(orderRef.id, "Supplier did not return an order ID.");
      return res.status(502).json({ error: "Supplier did not return an order ID. Wallet amount was returned." });
    }
    await orderRef.update({ status: "Pending", supplierOrderId, supplierResponseAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() });
    res.json({ ok: true, orderId: orderRef.id, status: "Pending", amount: orderData.amount });
  } catch (e) {
    const message = errorText(e);
    const status = /Insufficient wallet/.test(message) ? 402 : /Quantity must/.test(message) ? 400 : /not available|eligible|unavailable/.test(message) ? 409 : 400;
    res.status(status).json({ error: message });
  }
});
async function refundReservedOrder(orderId, note) {
  const orderRef = db.collection("smmOrders").doc(orderId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) throw new Error("Order not found.");
    const order = snap.data();
    if (["Refunded", "Partially refunded", "Completed"].includes(order.status) || Number(order.refundedAmount || 0) > 0) throw new Error("This order is already closed or refunded.");
    let refundAmount = Number(order.amount || 0);
    if (order.status === "Partial") {
      const quantity = Math.max(1, Number(order.quantity || 1));
      const remains = Math.max(0, Math.min(quantity, Number(order.remains || 0)));
      refundAmount = money(refundAmount * remains / quantity);
    }
    if (refundAmount <= 0) throw new Error("There is no refundable balance for this order.");
    const userRef = db.collection("smmUsers").doc(order.userId);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new Error("Customer account not found.");
    tx.update(userRef, { balance: money(Number(userSnap.data().balance || 0) + refundAmount), updatedAt: FV.serverTimestamp() });
    tx.update(orderRef, { status: order.status === "Partial" ? "Partially refunded" : "Refunded", refundedAmount: refundAmount, refundNote: String(note || "Refunded by admin"), refundedAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() });
    tx.set(db.collection("smmTransactions").doc(`refund_${orderId}`), {
      userId: order.userId, type: "refund", amount: refundAmount, currency: "INR",
      reference: orderId, note: String(note || "Order refund"), createdAt: FV.serverTimestamp()
    });
    return { ok: true, refundAmount };
  });
}

// Admin ----------------------------------------------------------------------
app.get("/api/admin/me", (req, res) => res.json({ authenticated: !!unsign(cookie(req, ADMIN_COOKIE))?.admin }));
app.post("/api/admin/login", (req, res) => {
  if (!rateAllowed(req, "admin-login", 8)) return res.status(429).json({ error: "Too many attempts. Try again later." });
  const password = String(req.body?.password || "");
  const a = Buffer.from(password); const b = Buffer.from(ADMIN_PASSWORD);
  if (!ADMIN_PASSWORD || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Incorrect admin password." });
  setCookie(res, ADMIN_COOKIE, sign({ admin: true, exp: Date.now() + 12 * 3600000 }), 12 * 3600);
  res.json({ ok: true });
});
app.post("/api/admin/logout", (_req, res) => { clearCookie(res, ADMIN_COOKIE); res.json({ ok: true }); });
app.get("/api/admin/overview", requireAdmin, async (_req, res) => {
  try {
    const [users, services, orders, payments, transactions] = await Promise.all([
      listCollection("smmUsers", 1000), listCollection("smmServices", 1000), listCollection("smmOrders", 1000),
      listCollection("smmWalletPayments", 1000), listCollection("smmTransactions", 1000)
    ]);
    const paid = payments.filter(p => p.status === "paid");
    const totalDeposits = money(paid.reduce((n, p) => n + Number(p.amount || 0), 0));
    const totalSales = money(orders.reduce((n, o) => n + Number(o.amount || 0), 0));
    res.json({
      stats: { users: users.length, services: services.length, approvedServices: services.filter(serviceIsSellable).length,
        orders: orders.length, activeOrders: orders.filter(o => !["Completed", "Partial", "Partially refunded", "Canceled", "Refunded"].includes(o.status)).length,
        totalDeposits, totalSales },
      recentOrders: orders.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)).slice(0, 15),
      recentPayments: paid.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)).slice(0, 10),
      users: users.map(u => safeUser(u, u.id)).slice(0, 100),
      settings: await getAdminSettings()
    });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
async function getAdminSettings() {
  const snap = await db.collection("smmSettings").doc("main").get();
  const d = snap.exists ? snap.data() : {};
  return { siteName: d.siteName || SITE_NAME, markupPercent: Number(d.markupPercent ?? DEFAULT_MARKUP), supportEmail: d.supportEmail || "" };
}
app.get("/api/admin/services", requireAdmin, async (_req, res) => {
  try {
    const services = await listCollection("smmServices", 1500);
    services.sort((a, b) => String(a.category || "").localeCompare(String(b.category || "")) || String(a.name || "").localeCompare(String(b.name || "")));
    res.json({ services, providerConfigured: providerConfigured() });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.post("/api/admin/services/sync", requireAdmin, async (_req, res) => {
  try {
    const upstream = await luvsmm("services");
    const incoming = Array.isArray(upstream) ? upstream : (Array.isArray(upstream?.services) ? upstream.services : []);
    if (!incoming.length) return res.status(502).json({ error: "No service array received. Check the LuvSMM API response and key." });
    // One-time migration for legacy blocked rows, including rows no longer returned by the supplier.
    const legacyBlocked = await db.collection("smmServices").where("approvalStatus", "==", "blocked").get();
    let legacyMigrated = 0;
    for (let i = 0; i < legacyBlocked.docs.length; i += 400) {
      const migrationBatch = db.batch();
      legacyBlocked.docs.slice(i, i + 400).forEach(doc => migrationBatch.update(doc.ref, {
        approvalStatus: "needs_review", restricted: false, complianceVerified: false, active: false,
        reviewNote: "Moved to manual review by catalogue update.", updatedAt: FV.serverTimestamp()
      }));
      await migrationBatch.commit();
      legacyMigrated += Math.min(400, legacyBlocked.docs.length - i);
    }
    const settings = await getAdminSettings();
    const margin = Math.max(0, Math.min(500, Number(settings.markupPercent ?? DEFAULT_MARKUP)));
    let added = 0, updated = 0, pendingReview = 0;
    for (let i = 0; i < incoming.length; i += 250) {
      const chunk = incoming.slice(i, i + 250);
      const existingSnaps = await Promise.all(chunk.map(rawItem => {
        const itemId = String(rawItem.service ?? rawItem.id ?? "").trim();
        return itemId ? db.collection("smmServices").doc(`luvsmm_${itemId}`).get() : Promise.resolve(null);
      }));
      const batch = db.batch();
      chunk.forEach((raw, idx) => {
        const sid = String(raw.service ?? raw.id ?? "").trim();
        if (!sid) return;
        const ref = db.collection("smmServices").doc(`luvsmm_${sid}`);
        const oldSnap = existingSnaps[idx];
        const old = oldSnap?.exists ? oldSnap.data() : {};
        const name = String(raw.name || `LuvSMM service ${sid}`).slice(0, 180);
        const category = String(raw.category || "Imported").slice(0, 100);
        const description = String(raw.description || "").slice(0, 500);
        const rate = asNum(raw.rate, 0);
        const currency = String(raw.currency || process.env.LUVSMM_CURRENCY || "INR").toUpperCase();
        const supplierType = String(raw.type || "Default").slice(0, 60);
        const min = Math.max(1, Math.floor(asNum(raw.min, 1)));
        const max = Math.max(1, Math.floor(asNum(raw.max, 10000)));
        const refill = [true, 1, "1", "true"].includes(raw.refill);
        const cancel = [true, 1, "1", "true"].includes(raw.cancel);
        const multiplier = currency === "USD" ? asNum(process.env.USD_TO_INR_RATE, 0) : 1;
        const calculatedPrice = multiplier > 0 ? money(rate * multiplier * (1 + margin / 100)) : 0;
        const supplierMetadataChanged = Boolean(oldSnap?.exists) && (
          String(old.name || "") !== name || String(old.category || "") !== category ||
          String(old.description || "") !== description || Number(old.supplierRate || 0) !== rate ||
          String(old.supplierCurrency || "INR") !== currency || String(old.supplierType || "Default") !== supplierType ||
          Number(old.min || 1) !== min || Number(old.max || 10000) !== max ||
          Boolean(old.refill) !== refill || Boolean(old.cancel) !== cancel
        );
        // Every new or materially changed supplier item returns to manual review.
        // Existing retail prices are preserved, but the admin must re-check changed provider data.
        const oldStatus = old.approvalStatus === "blocked" ? "needs_review" : (old.approvalStatus || "needs_review");
        const statusAfterSync = supplierMetadataChanged ? "needs_review" : oldStatus;
        const approvalStatus = ["approved", "rejected", "needs_review"].includes(statusAfterSync) ? statusAfterSync : "needs_review";
        const record = {
          name, category, description, source: "luvsmm", pricingModel: "per1000",
          supplierServiceId: sid, supplierRate: rate, supplierCurrency: currency,
          supplierType, min, max, refill, cancel,
          restricted: false, approvalStatus,
          complianceVerified: approvalStatus === "approved" && old.complianceVerified === true,
          active: approvalStatus === "approved" && old.active === true,
          sellingPricePer1000: Number.isFinite(Number(old.sellingPricePer1000)) && Number(old.sellingPricePer1000) > 0 ? Number(old.sellingPricePer1000) : calculatedPrice,
          importedAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp(), createdAt: old.createdAt || FV.serverTimestamp()
        };
        if (oldSnap?.exists) updated++; else added++;
        if (approvalStatus === "needs_review") pendingReview++;
        batch.set(ref, record, { merge: true });
      });
      await batch.commit();
    }
    await db.collection("smmSettings").doc("main").set({ lastServiceSyncAt: FV.serverTimestamp(), lastServiceSyncCount: incoming.length }, { merge: true });
    res.json({ ok: true, total: incoming.length, added, updated, pendingReview, legacyMigrated });
  } catch (e) { res.status(502).json({ error: errorText(e) }); }
});
app.patch("/api/admin/services/:id", requireAdmin, async (req, res) => {
  try {
    const ref = db.collection("smmServices").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Service not found." });
    const current = { id: snap.id, ...snap.data() };
    const body = req.body || {};
    const patch = { updatedAt: FV.serverTimestamp() };
    if (body.sellingPricePer1000 !== undefined) {
      const price = money(asNum(body.sellingPricePer1000, -1));
      if (price <= 0 || price > 10000000) return res.status(400).json({ error: "Enter a valid selling price per 1,000." });
      patch.sellingPricePer1000 = price;
    }
    if (["approved", "rejected"].includes(body.approvalStatus) && body.adminReviewed !== true) {
      return res.status(400).json({ error: "Complete the admin review confirmation before saving this decision." });
    }
    if (body.approvalStatus === "approved") {
      const finalPrice = Number(body.sellingPricePer1000 ?? current.sellingPricePer1000 ?? 0);
      if (!Number.isFinite(finalPrice) || finalPrice <= 0) return res.status(400).json({ error: "Set a valid customer selling price before publishing." });
      patch.approvalStatus = "approved";
      patch.complianceVerified = true;
      patch.active = true;
      patch.reviewedAt = FV.serverTimestamp();
      patch.reviewNote = String(body.reviewNote || "Manually reviewed and approved by admin.").trim().slice(0, 500);
    } else if (body.approvalStatus === "rejected") {
      patch.approvalStatus = "rejected";
      patch.complianceVerified = false;
      patch.active = false;
      patch.reviewedAt = FV.serverTimestamp();
      patch.reviewNote = String(body.reviewNote || "Rejected by admin review.").trim().slice(0, 500);
    } else if (body.approvalStatus === "needs_review") {
      patch.approvalStatus = "needs_review";
      patch.complianceVerified = false;
      patch.active = false;
      patch.reviewNote = String(body.reviewNote || "Returned to review queue.").trim().slice(0, 500);
    }
    if (body.active !== undefined) {
      const nextActive = body.active === true;
      if (nextActive && (current.approvalStatus !== "approved" && patch.approvalStatus !== "approved")) {
        return res.status(409).json({ error: "Review and approve this service before publishing it." });
      }
      if (nextActive && Number(patch.sellingPricePer1000 ?? current.sellingPricePer1000 ?? 0) <= 0) {
        return res.status(400).json({ error: "Set a valid selling price before publishing." });
      }
      patch.active = nextActive;
    }
    await ref.update(patch);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.post("/api/admin/services/manual", requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim().slice(0, 180);
    const category = String(req.body?.category || "Marketing").trim().slice(0, 100);
    const description = String(req.body?.description || "").trim().slice(0, 500);
    const price = money(asNum(req.body?.sellingPricePer1000));
    const pricingModel = req.body?.pricingModel === "fixed" ? "fixed" : "per1000";
    if (name.length < 3 || price <= 0) return res.status(400).json({ error: "Service name and a valid price are required." });
    const ref = db.collection("smmServices").doc();
    await ref.set({ name, category, description, source: "manual", pricingModel, min: pricingModel === "fixed" ? 1 : Math.max(1, Math.floor(asNum(req.body?.min, 1))), max: pricingModel === "fixed" ? 1 : Math.max(1, Math.floor(asNum(req.body?.max, 100))), sellingPricePer1000: price, active: false, approvalStatus: "needs_review", complianceVerified: false, createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() });
    res.json({ ok: true, id: ref.id, approvalStatus: "needs_review" });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.delete("/api/admin/services/:id", requireAdmin, async (req, res) => {
  try { await db.collection("smmServices").doc(req.params.id).delete(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.get("/api/admin/orders", requireAdmin, async (_req, res) => {
  try {
    const orders = await listCollection("smmOrders", 1000);
    orders.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    res.json({ orders });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.post("/api/admin/orders/sync", requireAdmin, async (_req, res) => {
  try {
    const orders = (await listCollection("smmOrders", 1000)).filter(o => o.source === "luvsmm" && o.supplierOrderId && !["Completed", "Canceled", "Refunded", "Partially refunded"].includes(o.status)).slice(0, 100);
    if (!orders.length) return res.json({ ok: true, checked: 0, updated: 0 });
    const ids = orders.map(o => o.supplierOrderId);
    const result = await luvsmm("status", { orders: ids.join(",") });
    let updated = 0;
    for (const order of orders) {
      const status = result?.[order.supplierOrderId] || (ids.length === 1 ? result : null);
      if (!status || status.error) continue;
      await db.collection("smmOrders").doc(order.id).update({ status: mapProviderStatus(status.status), remains: asNum(status.remains, order.remains), startCount: asNum(status.start_count, order.startCount), supplierCharge: asNum(status.charge, order.supplierCharge), supplierStatusAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() });
      updated++;
    }
    res.json({ ok: true, checked: orders.length, updated });
  } catch (e) { res.status(502).json({ error: errorText(e) }); }
});
app.patch("/api/admin/orders/:id", requireAdmin, async (req, res) => {
  try {
    const status = String(req.body?.status || "");
    const allowed = ["Awaiting review", "Processing", "Completed", "Partial", "Canceled", "Supplier confirmation needed"];
    if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid order status." });
    const ref = db.collection("smmOrders").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Order not found." });
    if (snap.data().status === "Refunded") return res.status(409).json({ error: "Order is already refunded." });
    await ref.update({ status, adminNote: String(req.body?.note || "").slice(0, 300), updatedAt: FV.serverTimestamp() });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.post("/api/admin/orders/:id/refund", requireAdmin, async (req, res) => {
  try {
    const ref = db.collection("smmOrders").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Order not found." });
    const order = snap.data();
    if (order.status === "Supplier confirmation needed") return res.status(409).json({ error: "Supplier acceptance is uncertain. Reconcile with LuvSMM before refunding." });
    if (order.source === "luvsmm" && order.supplierOrderId && !["Canceled", "Partial", "Refunded"].includes(order.status)) {
      return res.status(409).json({ error: "Reconcile/cancel the supplier order before refunding the customer." });
    }
    const result = await refundReservedOrder(req.params.id, String(req.body?.note || "Refunded by admin"));
    res.json(result);
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.get("/api/admin/provider/balance", requireAdmin, async (_req, res) => {
  try { const balance = await luvsmm("balance"); res.json({ balance }); }
  catch (e) { res.status(502).json({ error: errorText(e) }); }
});
app.get("/api/admin/transactions", requireAdmin, async (_req, res) => {
  try {
    const txs = await listCollection("smmTransactions", 1000);
    txs.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    res.json({ transactions: txs.slice(0, 300) });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.put("/api/admin/settings", requireAdmin, async (req, res) => {
  try {
    const markupPercent = Math.max(0, Math.min(500, asNum(req.body?.markupPercent, DEFAULT_MARKUP)));
    const supportEmail = String(req.body?.supportEmail || "").trim().slice(0, 160);
    await db.collection("smmSettings").doc("main").set({ siteName: SITE_NAME, markupPercent, supportEmail, updatedAt: FV.serverTimestamp() }, { merge: true });
    res.json({ ok: true, settings: await getAdminSettings() });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

module.exports = app;
