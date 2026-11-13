const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb", verify: (req, _res, buf) => { req.rawBody = Buffer.from(buf); } }));

// Supabase is accessed only by this server process. Never expose this key to the browser.
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim();
const SUPABASE_SECRET_KEY = String(process.env.SUPABASE_SECRET_KEY || "").trim();
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY. Add both in Vercel Environment Variables.");
}
let parsedSupabaseUrl;
try { parsedSupabaseUrl = new URL(SUPABASE_URL); }
catch { throw new Error("SUPABASE_URL is not a valid URL."); }
if (parsedSupabaseUrl.protocol !== "https:" || !parsedSupabaseUrl.hostname.endsWith(".supabase.co")) {
  throw new Error("SUPABASE_URL must be your HTTPS Supabase project URL.");
}
const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

const razorpayReady = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
const razorpay = razorpayReady ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET }) : null;
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
  if (loginAttempts.size > 4000) for (const [k, v] of loginAttempts) if (now - v.start > windowMs) loginAttempts.delete(k);
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
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
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
  const payload = unsign(cookie(req, SESSION_COOKIE));
  return payload?.uid ? { uid: payload.uid, email: payload.email, name: payload.name } : null;
}
function requireUser(req, res, next) {
  const user = userFromReq(req);
  if (!user) return res.status(401).json({ error: "Please login first." });
  req.user = user; next();
}
function requireAdmin(req, res, next) {
  const payload = unsign(cookie(req, ADMIN_COOKIE));
  if (!payload?.admin) return res.status(401).json({ error: "Admin login required." });
  next();
}
function money(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function asNum(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function errorText(e) {
  const message = String(e?.message || e?.error?.description || "Something went wrong.");
  if (/SUPABASE|PGRST|postgres|database/i.test(message) && /fetch failed|timeout|ECONN|ENOTFOUND/i.test(message)) return "Could not connect to Supabase. Check project status and SUPABASE_URL / SUPABASE_SECRET_KEY in Vercel.";
  return message.slice(0, 350);
}
function validateHttpUrl(value) {
  try { const url = new URL(String(value)); return ["http:", "https:"].includes(url.protocol) && url.hostname.includes(".") ? url.toString() : ""; }
  catch { return ""; }
}
function safeUser(data, id = data.id) {
  return { id, name: data.name || "Customer", email: data.email || "", balance: Number(data.balance || 0), createdAt: data.createdAt || data.created_at || null, disabled: data.disabled === true };
}
function serviceFromDb(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, category: row.category, description: row.description,
    source: row.source, pricingModel: row.pricing_model, supplierServiceId: row.supplier_service_id,
    supplierRate: Number(row.supplier_rate || 0), supplierCurrency: row.supplier_currency,
    supplierType: row.supplier_type, min: Number(row.min_quantity || 1), max: Number(row.max_quantity || 10000),
    refill: Boolean(row.refill), cancel: Boolean(row.cancel), restricted: Boolean(row.restricted),
    approvalStatus: row.approval_status, complianceVerified: Boolean(row.compliance_verified), active: Boolean(row.active),
    sellingPricePer1000: Number(row.selling_price_per_1000 || 0), reviewNote: row.review_note || "",
    reviewedAt: row.reviewed_at, importedAt: row.imported_at, createdAt: row.created_at, updatedAt: row.updated_at
  };
}
function orderFromDb(row) {
  if (!row) return null;
  return {
    id: row.id, userId: row.user_id, userEmail: row.user_email, userName: row.user_name,
    serviceId: row.service_id, serviceName: row.service_name, category: row.category,
    pricingModel: row.pricing_model, source: row.source, supplierServiceId: row.supplier_service_id,
    link: row.link, quantity: Number(row.quantity), amount: Number(row.amount), status: row.status,
    supplierOrderId: row.supplier_order_id, supplierCharge: row.supplier_charge == null ? null : Number(row.supplier_charge),
    remains: row.remains == null ? null : Number(row.remains), startCount: row.start_count == null ? null : Number(row.start_count),
    refundedAmount: Number(row.refunded_amount || 0), refundNote: row.refund_note, refundedAt: row.refunded_at,
    adminNote: row.admin_note, dispatchNote: row.dispatch_note, supplierResponseAt: row.supplier_response_at,
    supplierStatusAt: row.supplier_status_at, createdAt: row.created_at, updatedAt: row.updated_at
  };
}
function transactionFromDb(row) {
  return { id: row.id, userId: row.user_id, type: row.type, amount: Number(row.amount), currency: row.currency, reference: row.reference, razorpayOrderId: row.razorpay_order_id, note: row.note, createdAt: row.created_at };
}
function providerConfigured() { return Boolean(LUVSMM_API_KEY); }
function providerUrlValid() {
  try { const url = new URL(LUVSMM_URL); return url.protocol === "https:" && url.hostname === "luvsmm.com" && url.pathname.replace(/\/$/, "") === "/api/v2"; }
  catch { return false; }
}
async function luvsmm(action, extra = {}) {
  if (!providerConfigured()) throw new Error("LUVSMM_API_KEY is not configured in Vercel.");
  if (!providerUrlValid()) throw new Error("LUVSMM_API_URL must be https://luvsmm.com/api/v2.");
  const body = new URLSearchParams({ key: LUVSMM_API_KEY, action, ...Object.fromEntries(Object.entries(extra).map(([key, value]) => [key, String(value)])) });
  const response = await fetch(LUVSMM_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body, signal: AbortSignal.timeout(12000), redirect: "error" });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(`LuvSMM returned invalid JSON (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(`LuvSMM HTTP ${response.status}: ${data?.error || "Request failed."}`);
  if (data?.error) throw new Error(String(data.error));
  return data;
}
async function supa(query) {
  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count };
}
async function getRow(table, id) {
  const { data } = await supa(db.from(table).select("*").eq("id", id).maybeSingle());
  return data;
}
async function getAdminSettings() {
  const { data } = await supa(db.from("smm_settings").select("*").eq("id", "main").maybeSingle());
  return { siteName: data?.site_name || SITE_NAME, markupPercent: Number(data?.markup_percent ?? DEFAULT_MARKUP), supportEmail: data?.support_email || "" };
}
async function refundReservedOrder(orderId, note) {
  const { data } = await supa(db.rpc("smm_refund_order", { p_order_id: orderId, p_note: String(note || "Refunded by admin").slice(0, 300) }));
  return data;
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

// Health / public config -----------------------------------------------------
app.get("/health", (_req, res) => res.json({ ok: true, service: "mintu-smm-api", database: "supabase", supabase: true, razorpay: razorpayReady, luvsmm: providerConfigured() }));
app.get("/api/public/config", async (_req, res) => {
  try {
    const settings = await getAdminSettings();
    res.json({ siteName: settings.siteName || SITE_NAME, supportEmail: settings.supportEmail || "", razorpayKeyId: process.env.RAZORPAY_KEY_ID || "", currency: "INR", signupEnabled: true });
  } catch { res.json({ siteName: SITE_NAME, supportEmail: "", razorpayKeyId: process.env.RAZORPAY_KEY_ID || "", currency: "INR", signupEnabled: true }); }
});

// Customer authentication. Passwords are scrypt hashes stored in Postgres;
// the signed HttpOnly cookie is issued by this API, not by client-side code.
app.post("/api/auth/signup", async (req, res) => {
  try {
    if (!rateAllowed(req, "signup", 8)) return res.status(429).json({ error: "Too many attempts. Try again later." });
    const name = String(req.body?.name || "").trim().slice(0, 60);
    const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 160);
    const password = String(req.body?.password || "");
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 128) return res.status(400).json({ error: "Enter your name, a valid email and a password of at least 8 characters." });
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key.toString("hex"))));
    const { data } = await supa(db.from("smm_users").insert({ name, email, password_hash: hash, password_salt: salt, balance: 0, disabled: false }).select("id,name,email,balance,disabled,created_at").single());
    setCookie(res, SESSION_COOKIE, sign({ uid: data.id, name, email, exp: Date.now() + 7 * 86400000 }));
    res.json({ ok: true, user: safeUser({ ...data, createdAt: data.created_at }) });
  } catch (e) {
    if (e?.code === "23505") return res.status(409).json({ error: "An account with this email already exists." });
    res.status(500).json({ error: errorText(e) });
  }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    if (!rateAllowed(req, "login", 12)) return res.status(429).json({ error: "Too many login attempts. Try again later." });
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const { data } = await supa(db.from("smm_users").select("*").eq("email", email).limit(1).maybeSingle());
    if (!data) return res.status(401).json({ error: "Invalid email or password." });
    const candidate = await new Promise((resolve, reject) => crypto.scrypt(password, data.password_salt, 64, (err, key) => err ? reject(err) : resolve(key.toString("hex"))));
    const a = Buffer.from(candidate, "hex"); const b = Buffer.from(String(data.password_hash || ""), "hex");
    if (!data.password_hash || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Invalid email or password." });
    if (data.disabled === true) return res.status(403).json({ error: "This account has been disabled. Contact support." });
    setCookie(res, SESSION_COOKIE, sign({ uid: data.id, name: data.name || "Customer", email: data.email, exp: Date.now() + 7 * 86400000 }));
    res.json({ ok: true, user: safeUser(data, data.id) });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.get("/api/auth/me", async (req, res) => {
  const user = userFromReq(req);
  if (!user) return res.json({ authenticated: false, user: null });
  try {
    const { data } = await supa(db.from("smm_users").select("id,name,email,balance,disabled,created_at").eq("id", user.uid).maybeSingle());
    if (!data || data.disabled) { clearCookie(res, SESSION_COOKIE); return res.json({ authenticated: false, user: null }); }
    res.json({ authenticated: true, user: safeUser(data, data.id) });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.post("/api/auth/logout", (_req, res) => { clearCookie(res, SESSION_COOKIE); res.json({ ok: true }); });

// Public catalogue: only admin-approved, active and reviewed services.
app.get("/api/services", async (_req, res) => {
  try {
    const { data } = await supa(db.from("smm_services").select("*").eq("active", true).eq("approval_status", "approved").eq("compliance_verified", true).gt("selling_price_per_1000", 0).order("category").order("name").limit(1500));
    const services = (data || []).map(serviceFromDb).map(s => ({
      id: s.id, name: s.name, category: s.category || "Other", description: s.description || "",
      min: s.min, max: s.max, pricePer1000: s.sellingPricePer1000, pricingModel: s.pricingModel || "per1000",
      type: s.supplierType || "Default", refill: s.refill, cancel: s.cancel, source: s.source || "manual"
    })).filter(s => s.pricePer1000 > 0);
    res.set("Cache-Control", "no-store"); res.json({ services });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

// Wallet ---------------------------------------------------------------------
app.get("/api/wallet", requireUser, async (req, res) => {
  try {
    const [userResult, txResult] = await Promise.all([
      supa(db.from("smm_users").select("id,balance,disabled").eq("id", req.user.uid).maybeSingle()),
      supa(db.from("smm_transactions").select("*").eq("user_id", req.user.uid).order("created_at", { ascending: false }).limit(30))
    ]);
    if (!userResult.data || userResult.data.disabled) return res.status(404).json({ error: "Account not found." });
    res.json({ balance: Number(userResult.data.balance || 0), transactions: (txResult.data || []).map(transactionFromDb) });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.post("/api/wallet/create-order", requireUser, async (req, res) => {
  try {
    if (!razorpayReady) return res.status(503).json({ error: "Razorpay is not configured. Add Razorpay keys in Vercel." });
    const amount = money(asNum(req.body?.amount));
    if (amount < 50 || amount > 50000) return res.status(400).json({ error: "Wallet recharge must be between ₹50 and ₹50,000." });
    const order = await razorpay.orders.create({ amount: Math.round(amount * 100), currency: "INR", receipt: `wallet_${req.user.uid.slice(0, 8)}_${Date.now()}` });
    await supa(db.from("smm_wallet_payments").insert({ razorpay_order_id: order.id, user_id: req.user.uid, amount, currency: "INR", status: "created" }));
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (e) { res.status(502).json({ error: errorText(e) }); }
});
async function creditWalletFromPayment({ razorpayOrderId, paymentId, userId, amountPaise, currency = "INR" }) {
  const { data } = await supa(db.rpc("smm_credit_wallet_payment", {
    p_razorpay_order_id: String(razorpayOrderId), p_payment_id: String(paymentId),
    p_user_id: userId, p_amount_paise: Math.round(Number(amountPaise)), p_currency: currency
  }));
  return data;
}
app.post("/api/wallet/verify", requireUser, async (req, res) => {
  try {
    if (!razorpayReady) return res.status(503).json({ error: "Razorpay is not configured." });
    const orderId = String(req.body?.razorpay_order_id || "");
    const paymentId = String(req.body?.razorpay_payment_id || "");
    const signature = String(req.body?.razorpay_signature || "");
    if (!orderId || !paymentId || !signature) return res.status(400).json({ error: "Incomplete Razorpay response." });
    const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
    const a = Buffer.from(signature); const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(400).json({ error: "Payment signature verification failed." });
    const payment = await razorpay.payments.fetch(paymentId);
    if (payment.order_id !== orderId || payment.status !== "captured") return res.status(409).json({ error: "Payment is not captured yet." });
    const result = await creditWalletFromPayment({ razorpayOrderId: orderId, paymentId, userId: req.user.uid, amountPaise: payment.amount, currency: payment.currency });
    res.json(result);
  } catch (e) { res.status(400).json({ error: errorText(e) }); }
});
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
        const { data } = await supa(db.from("smm_wallet_payments").select("user_id").eq("razorpay_order_id", String(payment.order_id)).maybeSingle());
        if (data) await creditWalletFromPayment({ razorpayOrderId: payment.order_id, paymentId: payment.id, userId: data.user_id, amountPaise: payment.amount, currency: payment.currency });
      }
    }
    res.json({ received: true });
  } catch (e) { res.status(400).json({ error: errorText(e) }); }
});

// Orders ---------------------------------------------------------------------
app.get("/api/orders", requireUser, async (req, res) => {
  try {
    const { data } = await supa(db.from("smm_orders").select("*").eq("user_id", req.user.uid).order("created_at", { ascending: false }).limit(50));
    res.json({ orders: (data || []).map(orderFromDb) });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.post("/api/orders/create", requireUser, async (req, res) => {
  let reservedOrder = null;
  try {
    const serviceId = String(req.body?.serviceId || "").slice(0, 160);
    const link = validateHttpUrl(req.body?.link);
    const quantity = Math.floor(asNum(req.body?.quantity));
    if (!serviceId || !link || !Number.isSafeInteger(quantity) || quantity < 1) return res.status(400).json({ error: "Select a service, enter a valid URL and quantity." });
    const { data: rawOrder } = await supa(db.rpc("smm_place_order", {
      p_user_id: req.user.uid, p_service_id: serviceId, p_link: link,
      p_quantity: quantity, p_user_email: req.user.email || "", p_user_name: req.user.name || "Customer"
    }));
    const orderData = orderFromDb(rawOrder);
    reservedOrder = orderData;
    if (orderData.source === "manual") return res.json({ ok: true, orderId: orderData.id, status: "Awaiting review", amount: orderData.amount });
    let upstream;
    try {
      upstream = await luvsmm("add", { service: orderData.supplierServiceId, link: orderData.link, quantity: orderData.quantity });
    } catch (providerError) {
      const msg = errorText(providerError);
      const isTimeout = /timeout|timed out|network|fetch failed|socket/i.test(msg);
      if (isTimeout) {
        await supa(db.from("smm_orders").update({ status: "Supplier confirmation needed", dispatch_note: "Supplier response could not be confirmed. Admin must reconcile before refunding.", updated_at: new Date().toISOString() }).eq("id", orderData.id));
        return res.status(202).json({ ok: true, orderId: orderData.id, status: "Supplier confirmation needed", message: "Order is reserved for manual reconciliation. Do not submit it again." });
      }
      await refundReservedOrder(orderData.id, `Supplier rejected order: ${msg}`);
      return res.status(502).json({ error: `Supplier rejected the order. Wallet amount was returned. ${msg}` });
    }
    const supplierOrderId = String(upstream?.order || upstream?.id || "");
    if (!supplierOrderId) {
      await refundReservedOrder(orderData.id, "Supplier did not return an order ID.");
      return res.status(502).json({ error: "Supplier did not return an order ID. Wallet amount was returned." });
    }
    await supa(db.from("smm_orders").update({ status: "Pending", supplier_order_id: supplierOrderId, supplier_response_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", orderData.id));
    res.json({ ok: true, orderId: orderData.id, status: "Pending", amount: orderData.amount });
  } catch (e) {
    const message = errorText(e);
    const status = /Insufficient wallet/i.test(message) ? 402 : /Quantity must/i.test(message) ? 400 : /not available|unavailable/i.test(message) ? 409 : 400;
    res.status(status).json({ error: message });
  }
});

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
    const [overviewResult, recentResult, settings] = await Promise.all([
      supa(db.rpc("smm_admin_overview")),
      supa(db.from("smm_orders").select("*").order("created_at", { ascending: false }).limit(15)),
      getAdminSettings()
    ]);
    const stats = overviewResult.data || {};
    res.json({ stats: {
      users: Number(stats.users || 0), services: Number(stats.services || 0), approvedServices: Number(stats.approvedServices || 0),
      orders: Number(stats.orders || 0), activeOrders: Number(stats.activeOrders || 0), payments: Number(stats.payments || 0),
      totalDeposits: money(Number(stats.totalDeposits || 0)), totalSales: money(Number(stats.totalSales || 0))
    }, recentOrders: (recentResult.data || []).map(orderFromDb), settings });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.get("/api/admin/users", requireAdmin, async (_req, res) => {
  try {
    const { data } = await supa(db.from("smm_users").select("id,name,email,balance,disabled,created_at").order("created_at", { ascending: false }).limit(100));
    res.json({ users: (data || []).map(row => safeUser({ ...row, createdAt: row.created_at }, row.id)) });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.get("/api/admin/services", requireAdmin, async (_req, res) => {
  try {
    const { data } = await supa(db.from("smm_services").select("*").order("category").order("name").limit(1500));
    res.json({ services: (data || []).map(serviceFromDb), providerConfigured: providerConfigured() });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.post("/api/admin/services/sync", requireAdmin, async (_req, res) => {
  try {
    const upstream = await luvsmm("services");
    const incoming = Array.isArray(upstream) ? upstream : (Array.isArray(upstream?.services) ? upstream.services : []);
    if (!incoming.length) return res.status(502).json({ error: "No service array received. Check the LuvSMM API response and key." });
    const now = new Date().toISOString();
    const legacyResult = await supa(db.from("smm_services").update({ approval_status: "needs_review", restricted: false, compliance_verified: false, active: false, review_note: "Moved to manual review by catalogue update.", updated_at: now }).eq("approval_status", "blocked").select("id"));
    const legacyMigrated = (legacyResult.data || []).length;
    const settings = await getAdminSettings();
    const margin = Math.max(0, Math.min(500, Number(settings.markupPercent ?? DEFAULT_MARKUP)));
    let added = 0, updated = 0, unchanged = 0, pendingReview = 0;
    for (let i = 0; i < incoming.length; i += 100) {
      const chunk = incoming.slice(i, i + 100);
      const normalized = chunk.map(raw => ({ raw, sid: String(raw.service ?? raw.id ?? "").trim() })).filter(item => item.sid);
      if (!normalized.length) continue;
      const ids = normalized.map(item => `luvsmm_${item.sid}`);
      const { data: existingRows } = await supa(db.from("smm_services").select("*").in("id", ids));
      const oldById = new Map((existingRows || []).map(row => [row.id, serviceFromDb(row)]));
      const upserts = [];
      for (const { raw, sid } of normalized) {
        const id = `luvsmm_${sid}`;
        const old = oldById.get(id) || {};
        const name = String(raw.name || `LuvSMM service ${sid}`).slice(0, 180);
        const category = String(raw.category || "Imported").slice(0, 100);
        const description = String(raw.description || "").slice(0, 500);
        const rate = asNum(raw.rate, 0);
        const currency = String(raw.currency || process.env.LUVSMM_CURRENCY || "INR").toUpperCase();
        const supplierType = String(raw.type || "Default").slice(0, 60);
        const min = Math.max(1, Math.floor(asNum(raw.min, 1)));
        const max = Math.max(min, Math.floor(asNum(raw.max, 10000)));
        const refill = [true, 1, "1", "true"].includes(raw.refill);
        const cancel = [true, 1, "1", "true"].includes(raw.cancel);
        const multiplier = currency === "USD" ? asNum(process.env.USD_TO_INR_RATE, 0) : 1;
        const calculatedPrice = multiplier > 0 ? money(rate * multiplier * (1 + margin / 100)) : 0;
        const exists = Boolean(old.id);
        const supplierMetadataChanged = exists && (
          old.name !== name || old.category !== category || old.description !== description || Number(old.supplierRate || 0) !== rate ||
          String(old.supplierCurrency || "INR") !== currency || String(old.supplierType || "Default") !== supplierType ||
          Number(old.min || 1) !== min || Number(old.max || 10000) !== max || Boolean(old.refill) !== refill || Boolean(old.cancel) !== cancel
        );
        const oldStatus = old.approvalStatus === "blocked" ? "needs_review" : (old.approvalStatus || "needs_review");
        const approvalStatus = supplierMetadataChanged ? "needs_review" : (["approved", "rejected", "needs_review"].includes(oldStatus) ? oldStatus : "needs_review");
        const finalPrice = Number(old.sellingPricePer1000) > 0 ? Number(old.sellingPricePer1000) : calculatedPrice;
        const record = {
          id, name, category, description, source: "luvsmm", pricing_model: "per1000", supplier_service_id: sid,
          supplier_rate: rate, supplier_currency: currency, supplier_type: supplierType, min_quantity: min, max_quantity: max,
          refill, cancel, restricted: false, approval_status: approvalStatus,
          compliance_verified: approvalStatus === "approved" && old.complianceVerified === true,
          active: approvalStatus === "approved" && old.active === true,
          selling_price_per_1000: finalPrice, review_note: supplierMetadataChanged ? "Supplier details changed. Please review again." : (old.reviewNote || ""),
          imported_at: now, updated_at: now, created_at: old.createdAt || now
        };
        if (approvalStatus === "needs_review") pendingReview++;
        const changed = !exists || supplierMetadataChanged || old.source !== "luvsmm" || old.supplierServiceId !== sid || old.approvalStatus !== approvalStatus ||
          Boolean(old.complianceVerified) !== Boolean(record.compliance_verified) || Boolean(old.active) !== Boolean(record.active) || old.restricted !== false ||
          Number(old.sellingPricePer1000 || 0) !== finalPrice;
        if (!changed) { unchanged++; continue; }
        if (exists) updated++; else added++;
        upserts.push(record);
      }
      if (upserts.length) await supa(db.from("smm_services").upsert(upserts, { onConflict: "id" }));
    }
    await supa(db.from("smm_settings").upsert({ id: "main", site_name: SITE_NAME, markup_percent: margin, last_service_sync_at: now, last_service_sync_count: incoming.length, updated_at: now }, { onConflict: "id" }));
    res.json({ ok: true, total: incoming.length, added, updated, unchanged, pendingReview, legacyMigrated });
  } catch (e) { res.status(502).json({ error: errorText(e) }); }
});
app.patch("/api/admin/services/:id", requireAdmin, async (req, res) => {
  try {
    const currentRow = await getRow("smm_services", req.params.id);
    if (!currentRow) return res.status(404).json({ error: "Service not found." });
    const current = serviceFromDb(currentRow); const body = req.body || {}; const patch = { updated_at: new Date().toISOString() };
    if (body.sellingPricePer1000 !== undefined) {
      const price = money(asNum(body.sellingPricePer1000, -1));
      if (price <= 0 || price > 10000000) return res.status(400).json({ error: "Enter a valid selling price per 1,000." });
      patch.selling_price_per_1000 = price;
    }
    if (["approved", "rejected"].includes(body.approvalStatus) && body.adminReviewed !== true) return res.status(400).json({ error: "Complete the admin review confirmation before saving this decision." });
    if (body.approvalStatus === "approved") {
      const finalPrice = Number(body.sellingPricePer1000 ?? current.sellingPricePer1000 ?? 0);
      if (!Number.isFinite(finalPrice) || finalPrice <= 0) return res.status(400).json({ error: "Set a valid customer selling price before publishing." });
      Object.assign(patch, { approval_status: "approved", compliance_verified: true, active: true, reviewed_at: new Date().toISOString(), review_note: String(body.reviewNote || "Manually reviewed and approved by admin.").trim().slice(0, 500) });
    } else if (body.approvalStatus === "rejected") {
      Object.assign(patch, { approval_status: "rejected", compliance_verified: false, active: false, reviewed_at: new Date().toISOString(), review_note: String(body.reviewNote || "Rejected by admin review.").trim().slice(0, 500) });
    } else if (body.approvalStatus === "needs_review") {
      Object.assign(patch, { approval_status: "needs_review", compliance_verified: false, active: false, review_note: String(body.reviewNote || "Returned to review queue.").trim().slice(0, 500) });
    }
    if (body.active !== undefined) {
      const nextActive = body.active === true;
      if (nextActive && current.approvalStatus !== "approved" && patch.approval_status !== "approved") return res.status(409).json({ error: "Review and approve this service before publishing it." });
      if (nextActive && Number(patch.selling_price_per_1000 ?? current.sellingPricePer1000 ?? 0) <= 0) return res.status(400).json({ error: "Set a valid selling price before publishing." });
      patch.active = nextActive;
    }
    await supa(db.from("smm_services").update(patch).eq("id", req.params.id));
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
    const min = pricingModel === "fixed" ? 1 : Math.max(1, Math.floor(asNum(req.body?.min, 1)));
    const max = pricingModel === "fixed" ? 1 : Math.max(min, Math.floor(asNum(req.body?.max, 100)));
    const id = `manual_${crypto.randomUUID()}`; const now = new Date().toISOString();
    await supa(db.from("smm_services").insert({
      id, name, category, description, source: "manual", pricing_model: pricingModel,
      min_quantity: min,
      max_quantity: max,
      selling_price_per_1000: price, active: false, approval_status: "needs_review", compliance_verified: false,
      created_at: now, updated_at: now
    }));
    res.json({ ok: true, id, approvalStatus: "needs_review" });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.delete("/api/admin/services/:id", requireAdmin, async (req, res) => {
  try { await supa(db.from("smm_services").delete().eq("id", req.params.id)); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.get("/api/admin/orders", requireAdmin, async (_req, res) => {
  try {
    const { data } = await supa(db.from("smm_orders").select("*").order("created_at", { ascending: false }).limit(150));
    res.json({ orders: (data || []).map(orderFromDb) });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.post("/api/admin/orders/sync", requireAdmin, async (_req, res) => {
  try {
    const { data } = await supa(db.from("smm_orders").select("*").eq("source", "luvsmm").not("supplier_order_id", "is", null).order("created_at", { ascending: false }).limit(150));
    const orders = (data || []).map(orderFromDb).filter(order => !["Completed", "Canceled", "Refunded", "Partially refunded"].includes(order.status)).slice(0, 100);
    if (!orders.length) return res.json({ ok: true, checked: 0, updated: 0 });
    const ids = orders.map(order => order.supplierOrderId);
    const result = await luvsmm("status", { orders: ids.join(",") }); let updated = 0;
    for (const order of orders) {
      const status = result?.[order.supplierOrderId] || (ids.length === 1 ? result : null);
      if (!status || status.error) continue;
      await supa(db.from("smm_orders").update({
        status: mapProviderStatus(status.status), remains: asNum(status.remains, order.remains),
        start_count: asNum(status.start_count, order.startCount), supplier_charge: asNum(status.charge, order.supplierCharge),
        supplier_status_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }).eq("id", order.id));
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
    const current = await getRow("smm_orders", req.params.id);
    if (!current) return res.status(404).json({ error: "Order not found." });
    if (current.status === "Refunded") return res.status(409).json({ error: "Order is already refunded." });
    await supa(db.from("smm_orders").update({ status, admin_note: String(req.body?.note || "").slice(0, 300), updated_at: new Date().toISOString() }).eq("id", req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.post("/api/admin/orders/:id/refund", requireAdmin, async (req, res) => {
  try {
    const current = await getRow("smm_orders", req.params.id);
    if (!current) return res.status(404).json({ error: "Order not found." });
    if (current.status === "Supplier confirmation needed") return res.status(409).json({ error: "Supplier acceptance is uncertain. Reconcile with LuvSMM before refunding." });
    if (current.source === "luvsmm" && current.supplier_order_id && !["Canceled", "Partial", "Refunded"].includes(current.status)) return res.status(409).json({ error: "Reconcile/cancel the supplier order before refunding the customer." });
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
    const { data } = await supa(db.from("smm_transactions").select("*").order("created_at", { ascending: false }).limit(100));
    res.json({ transactions: (data || []).map(transactionFromDb) });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.put("/api/admin/settings", requireAdmin, async (req, res) => {
  try {
    const markupPercent = Math.max(0, Math.min(500, asNum(req.body?.markupPercent, DEFAULT_MARKUP)));
    const supportEmail = String(req.body?.supportEmail || "").trim().slice(0, 160);
    await supa(db.from("smm_settings").upsert({ id: "main", site_name: SITE_NAME, markup_percent: markupPercent, support_email: supportEmail, updated_at: new Date().toISOString() }, { onConflict: "id" }));
    res.json({ ok: true, settings: await getAdminSettings() });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

module.exports = app;
