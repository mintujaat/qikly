const express = require('express')
const crypto = require('crypto')
const Razorpay = require('razorpay')
const admin = require('firebase-admin')
const { promisify } = require('util')

const app = express()
app.use(express.json({ limit: '12mb' }))

if (!admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON')
  const serviceAccount = typeof raw === 'string' ? JSON.parse(raw) : raw
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL || undefined
  })
}

const db = admin.firestore()
const FieldValue = admin.firestore.FieldValue
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
})

const ADMIN_COOKIE = 'qikly_admin'
const SESSION_COOKIE = 'qikly_session'
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || 'change-this-password')
const SESSION_SECRET = String(process.env.SESSION_SECRET || ADMIN_PASSWORD)
const scrypt = promisify(crypto.scrypt)

const defaults = {
  settings: {
    siteName: 'Qikly Shop',
    tagline: 'Diwali shopping, made brighter.',
    heroTitle: 'Diwali Mega Sale — Light up every cart.',
    heroText: 'Festive deals, fast delivery, secure checkout and a premium shopping experience built for every screen.',
    announcement: '🪔 Diwali Mega Sale is live • Extra savings on selected products • Free shipping above ₹999',
    about: 'Qikly Shop is a modern festive shopping experience with secure payments, order tracking, flexible offers and human + AI customer support.',
    privacy: 'Account, address and order information is stored to operate the store, fulfill purchases and provide support. Payment credentials are handled by Razorpay.',
    refund: 'Return/refund handling is controlled by the store policy and order status. Contact support with your order number for help.',
    supportEmail: 'support@qikly.shop',
    supportPhone: '+91 99999 99999',
    freeShipping: 999,
    shippingFlat: 79,
    codEnabled: true,
    chatbotEnabled: true,
    logoText: 'Q',
    primary: '#f59e0b',
    secondary: '#8b5cf6',
    heroImage: 'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=1500&q=85'
  },
  chatbot: {
    name: 'Qikly AI',
    intro: 'Hi! Main Qikly AI hoon. Product, order, delivery, offers ya store policy ke baare mein pooch sakte ho.',
    topic: 'Answer questions about products, pricing, orders, delivery, returns, coupons and store support using only the provided store data when available.',
    prompt: 'Be concise, helpful and factual. Never invent order status, discounts, stock or policies. Never ask for passwords, card numbers, UPI PINs or OTPs. Use Hinglish unless the user clearly uses another language.'
  }
}

const seedCategories = [
  { id: 'fashion', name: 'Fashion', slug: 'fashion', imageUrl: 'https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=600&q=80', active: true, sortOrder: 1 },
  { id: 'electronics', name: 'Electronics', slug: 'electronics', imageUrl: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=600&q=80', active: true, sortOrder: 2 },
  { id: 'home', name: 'Home & Living', slug: 'home-living', imageUrl: 'https://images.unsplash.com/photo-1616046229478-9901c5536a45?auto=format&fit=crop&w=600&q=80', active: true, sortOrder: 3 },
  { id: 'beauty', name: 'Beauty', slug: 'beauty', imageUrl: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=600&q=80', active: true, sortOrder: 4 },
  { id: 'gifts', name: 'Gifts', slug: 'gifts', imageUrl: 'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=600&q=80', active: true, sortOrder: 5 },
  { id: 'gadgets', name: 'Gadgets', slug: 'gadgets', imageUrl: 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=600&q=80', active: true, sortOrder: 6 }
]

const seedProducts = [
  { id: 'diwali-lamp-set', title: 'Festive Brass Diya Set', slug: 'festive-brass-diya-set', category: 'gifts', price: 699, compareAtPrice: 1199, stock: 42, sku: 'QK-DIYA-001', images: ['https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=1000&q=85'], description: 'A premium brass diya set made for festive décor and gifting. Warm, elegant and easy to style for Diwali.', highlights: ['Festive-ready quality', 'Gift-friendly packaging', 'Fast dispatch'], rating: 4.8, ratingCount: 124, featured: true, badge: 'Diwali Pick', active: true, sortOrder: 1 },
  { id: 'sneaker-urban', title: 'Urban Motion Sneakers', slug: 'urban-motion-sneakers', category: 'fashion', price: 1499, compareAtPrice: 2499, stock: 18, sku: 'QK-FAS-102', images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1000&q=85'], description: 'Comfort-first everyday sneakers with a clean streetwear profile.', highlights: ['Lightweight sole', 'All-day comfort', 'Easy returns'], rating: 4.6, ratingCount: 89, featured: true, badge: 'Best Seller', active: true, sortOrder: 2 },
  { id: 'wireless-headphones', title: 'Pulse ANC Wireless Headphones', slug: 'pulse-anc-wireless-headphones', category: 'electronics', price: 2499, compareAtPrice: 3999, stock: 27, sku: 'QK-ELX-304', images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=85'], description: 'Wireless headphones with active noise cancellation, deep bass and long listening time.', highlights: ['ANC mode', 'Fast USB-C charge', 'Comfort fit'], rating: 4.7, ratingCount: 212, featured: true, badge: 'Hot Deal', active: true, sortOrder: 3 },
  { id: 'smartwatch', title: 'Aura Fit Smartwatch', slug: 'aura-fit-smartwatch', category: 'gadgets', price: 1899, compareAtPrice: 2999, stock: 11, sku: 'QK-GAD-209', images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1000&q=85'], description: 'A sleek smartwatch for daily activity, notifications and calls.', highlights: ['Bright display', 'Daily activity tracking', 'Magnetic charging'], rating: 4.5, ratingCount: 71, featured: true, badge: 'Trending', active: true, sortOrder: 4 },
  { id: 'perfume', title: 'Noor Eau de Parfum', slug: 'noor-eau-de-parfum', category: 'beauty', price: 999, compareAtPrice: 1499, stock: 30, sku: 'QK-BEA-117', images: ['https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1000&q=85'], description: 'A warm, festive fragrance with a refined everyday character.', highlights: ['Long-wear profile', 'Gift-ready box', 'Elegant bottle'], rating: 4.7, ratingCount: 54, featured: true, badge: 'Festive', active: true, sortOrder: 5 },
  { id: 'table-lamp', title: 'Amber Glow Table Lamp', slug: 'amber-glow-table-lamp', category: 'home', price: 1299, compareAtPrice: 1999, stock: 14, sku: 'QK-HOM-311', images: ['https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1000&q=85'], description: 'Soft ambient lighting for a warm living room or bedside corner.', highlights: ['Warm glow', 'Premium finish', 'Plug and play'], rating: 4.6, ratingCount: 38, featured: true, badge: 'Home Pick', active: true, sortOrder: 6 },
  { id: 'kurta', title: 'Festive Cotton Kurta', slug: 'festive-cotton-kurta', category: 'fashion', price: 899, compareAtPrice: 1399, stock: 23, sku: 'QK-FAS-155', images: ['https://images.unsplash.com/photo-1610652492500-ded49ceeb378?auto=format&fit=crop&w=1000&q=85'], description: 'Breathable cotton kurta designed for festive evenings and everyday comfort.', highlights: ['Soft cotton', 'Festive silhouette', 'Easy care'], rating: 4.4, ratingCount: 62, featured: true, badge: 'Diwali Edit', active: true, sortOrder: 7 },
  { id: 'gift-box', title: 'Premium Celebration Gift Box', slug: 'premium-celebration-gift-box', category: 'gifts', price: 1599, compareAtPrice: 2299, stock: 16, sku: 'QK-GFT-502', images: ['https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=1000&q=85'], description: 'A curated gifting set for family, friends and festive occasions.', highlights: ['Premium presentation', 'Ready to gift', 'Limited festive stock'], rating: 4.9, ratingCount: 144, featured: true, badge: 'Gift Favourite', active: true, sortOrder: 8 }
]

const clean = (v, max = 5000) => String(v ?? '').trim().slice(0, max)
const email = v => clean(v, 180).toLowerCase()
const money = v => Math.max(0, Math.round(Number(v) || 0))
const num = v => Number(v) || 0
const safeId = v => clean(v, 140).replace(/[^a-zA-Z0-9_-]/g, '-')
const validUrl = v => /^https?:\/\//i.test(String(v || ''))

function cookies(req) {
  const out = {}
  String(req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=')
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  })
  return out
}
function safeEqual(a, b) { const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b)); return aa.length === bb.length && crypto.timingSafeEqual(aa, bb) }
function sign(body, secret) { return crypto.createHmac('sha256', secret).update(body).digest('hex') }
function token(prefix, id, hours, secret) { const exp = Date.now() + hours * 3600000; const body = `${prefix}.${id}.${exp}`; return `${body}.${sign(body, secret)}` }
function verifyToken(value, prefix, secret) { const bits = String(value || '').split('.'); if (bits.length !== 4 || bits[0] !== prefix || Number(bits[2]) < Date.now()) return null; const body = bits.slice(0, 3).join('.'); return safeEqual(sign(body, secret), bits[3]) ? bits[1] : null }
function setCookie(res, name, value, maxAge) { res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`) }
function clearCookie(res, name) { setCookie(res, name, '', 0) }
function isAdmin(req) { return !!verifyToken(cookies(req)[ADMIN_COOKIE], 'admin', ADMIN_PASSWORD) }
async function currentUser(req) { const uid = verifyToken(cookies(req)[SESSION_COOKIE], 'user', SESSION_SECRET); if (!uid) return null; const s = await db.collection('users').doc(uid).get(); if (!s.exists || s.data()?.active === false) return null; return { id: s.id, ...s.data() } }
async function guardUser(req, res, next) { try { const user = await currentUser(req); if (!user) return res.status(401).json({ error: 'Login required.' }); req.user = user; next() } catch (e) { next(e) } }
const guardAdmin = (req, res, next) => isAdmin(req) ? next() : res.status(401).json({ error: 'Admin login required.' })

async function hashPassword(password) { const salt = crypto.randomBytes(16).toString('hex'); const key = await scrypt(String(password), salt, 64); return `scrypt$${salt}$${key.toString('hex')}` }
async function verifyPassword(password, encoded) { const [scheme, salt, hex] = String(encoded || '').split('$'); if (scheme !== 'scrypt' || !salt || !hex) return false; const key = await scrypt(String(password), salt, 64); return safeEqual(key.toString('hex'), hex) }
function dateMs(v) { if (!v) return 0; if (typeof v.toDate === 'function') return v.toDate().getTime(); const t = new Date(v).getTime(); return Number.isFinite(t) ? t : 0 }
function jsonSafe(value) { if (value == null) return value; if (typeof value?.toDate === 'function') return value.toDate().toISOString(); if (Array.isArray(value)) return value.map(jsonSafe); if (typeof value === 'object') { const o = {}; for (const [k, v] of Object.entries(value)) o[k] = jsonSafe(v); return o } return value }
function publicSettings(data = {}) { return { ...defaults.settings, ...data } }
async function getDoc(col, id, fallback = null) { const s = await db.collection(col).doc(id).get(); return s.exists ? { id: s.id, ...s.data() } : fallback }
async function listCollection(col, limit = 1000) { const s = await db.collection(col).limit(limit).get(); return s.docs.map(d => ({ id: d.id, ...d.data() })) }
async function getSettings() { const s = await getDoc('settings', 'main', {}); return publicSettings(s || {}) }
async function getChatbot() { const s = await getDoc('chatbot', 'main', {}); return { ...defaults.chatbot, ...(s || {}) } }
async function getProducts(all = false) { const rows = await listCollection('products', 1000); if (!rows.length) { await Promise.all(seedProducts.map(x => db.collection('products').doc(x.id).set(x, { merge: true }))); return seedProducts.filter(x => all || x.active !== false).sort((a,b)=>num(a.sortOrder)-num(b.sortOrder)) } const base = rows; return base.filter(x => all || x.active !== false).sort((a, b) => num(a.sortOrder) - num(b.sortOrder)) }
async function getCategories(all = false) { const rows = await listCollection('categories', 200); if (!rows.length) { await Promise.all(seedCategories.map(x => db.collection('categories').doc(x.id).set(x, { merge: true }))); return seedCategories.filter(x => all || x.active !== false).sort((a,b)=>num(a.sortOrder)-num(b.sortOrder)) } const base = rows; return base.filter(x => all || x.active !== false).sort((a,b)=>num(a.sortOrder)-num(b.sortOrder)) }
async function getBanners(all = false) { const rows = await listCollection('banners', 100); return rows.filter(x => all || x.active !== false).sort((a,b)=>num(a.sortOrder)-num(b.sortOrder)) }
async function getCoupons(all = false) { const rows = await listCollection('coupons', 300); return rows.filter(x => all || x.active !== false).sort((a,b)=>dateMs(b.updatedAt)-dateMs(a.updatedAt)) }
async function couponFor(code, subtotal) { const c = (await getCoupons()).find(x => String(x.code).toUpperCase() === String(code || '').toUpperCase()); if (!c) throw new Error('Invalid coupon code.'); if (c.expiresAt && dateMs(c.expiresAt) && dateMs(c.expiresAt) < Date.now()) throw new Error('This coupon has expired.'); if (num(c.usageLimit) > 0 && num(c.usedCount) >= num(c.usageLimit)) throw new Error('This coupon has reached its usage limit.'); if (money(subtotal) < money(c.minOrder)) throw new Error(`Minimum order for this coupon is ${money(c.minOrder)}.`); let amount = c.type === 'fixed' ? money(c.value) : Math.floor(money(subtotal) * (num(c.value) / 100)); if (c.maxDiscount > 0) amount = Math.min(amount, money(c.maxDiscount)); amount = Math.max(0, Math.min(amount, money(subtotal))); return { id: c.id || c.code, code: c.code, amount, type: c.type, value: c.value } }

async function geminiGenerate(contents, systemInstruction) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('Gemini API is not configured on the server.')
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: systemInstruction }] }, contents, generationConfig: { temperature: .35, maxOutputTokens: 420 } })
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error?.message || `Gemini API error (${response.status})`)
  return data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')?.trim() || 'I could not generate a response right now.'
}

app.get('/api/public/config', (req, res) => res.json({ razorpayKeyId: process.env.RAZORPAY_KEY_ID || '' }))
app.get('/api/public/store', async (req, res) => { try { const [settings, chatbot, products, categories, banners] = await Promise.all([getSettings(), getChatbot(), getProducts(), getCategories(), getBanners()]); res.json({ settings: { ...settings, chatbotName: chatbot.name }, chatbot, chatbotEnabled: settings.chatbotEnabled !== false, categories, products, banners }) } catch (e) { res.status(500).json({ error: e.message }) } })

app.post('/api/auth/signup', async (req, res) => {
  try {
    const name = clean(req.body.name, 120), em = email(req.body.email), password = String(req.body.password || ''), phone = clean(req.body.phone, 25)
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) || password.length < 6) return res.status(400).json({ error: 'Enter a valid name, email and password (min 6 chars).' })
    const exists = await db.collection('users').where('email', '==', em).limit(1).get(); if (!exists.empty) return res.status(409).json({ error: 'An account with this email already exists.' })
    const ref = db.collection('users').doc(); const passwordHash = await hashPassword(password)
    await ref.set({ name, email: em, phone, passwordHash, active: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
    await db.collection('wallets').doc(ref.id).set({ uid: ref.id, balance: 0, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    setCookie(res, SESSION_COOKIE, token('user', ref.id, 168, SESSION_SECRET), 7 * 86400)
    res.json({ ok: true, user: { id: ref.id, name, email: em, phone, active: true } })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
app.post('/api/auth/login', async (req, res) => {
  try { const em = email(req.body.email), password = String(req.body.password || ''); const q = await db.collection('users').where('email', '==', em).limit(1).get(); if (q.empty || !(await verifyPassword(password, q.docs[0].data().passwordHash))) return res.status(401).json({ error: 'Invalid email or password.' }); const u = q.docs[0].data(); if (u.active === false) return res.status(403).json({ error: 'This account is disabled.' }); setCookie(res, SESSION_COOKIE, token('user', q.docs[0].id, 168, SESSION_SECRET), 7 * 86400); res.json({ ok: true, user: { id: q.docs[0].id, name: u.name, email: u.email, phone: u.phone || '', active: u.active !== false } }) } catch (e) { res.status(500).json({ error: e.message }) }
})
app.post('/api/auth/logout', (req, res) => { clearCookie(res, SESSION_COOKIE); res.json({ ok: true }) })
app.get('/api/auth/me', async (req, res) => { try { const u = await currentUser(req); res.json({ authenticated: !!u, user: u ? { id: u.id, name: u.name, email: u.email, phone: u.phone || '', active: u.active !== false } : null }) } catch (e) { res.status(500).json({ error: e.message }) } })

app.get('/api/user/profile', guardUser, async (req, res) => res.json({ user: { id: req.user.id, name: req.user.name, email: req.user.email, phone: req.user.phone || '' } }))
app.post('/api/user/profile', guardUser, async (req, res) => { try { const name = clean(req.body.name, 120), phone = clean(req.body.phone, 25); if (name.length < 2) return res.status(400).json({ error: 'Enter a valid name.' }); await db.collection('users').doc(req.user.id).set({ name, phone, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); const user = await getDoc('users', req.user.id, {}); res.json({ ok: true, user: { id: req.user.id, name, email: user.email, phone } }) } catch (e) { res.status(500).json({ error: e.message }) } })

app.get('/api/shop/addresses', guardUser, async (req, res) => { try { const s = await db.collection('users').doc(req.user.id).collection('addresses').get(); res.json({ addresses: s.docs.map(d => ({ id: d.id, ...d.data() })) }) } catch (e) { res.status(500).json({ error: e.message }) } })
app.post('/api/shop/addresses', guardUser, async (req, res) => { try { const p = { name: clean(req.body.name, 100), phone: clean(req.body.phone, 25), line1: clean(req.body.line1, 300), city: clean(req.body.city, 100), state: clean(req.body.state, 100), pincode: clean(req.body.pincode, 10), landmark: clean(req.body.landmark, 150), updatedAt: FieldValue.serverTimestamp() }; if (!p.name || !p.phone || !p.line1 || !p.city || !p.state || !/^\d{6}$/.test(p.pincode)) return res.status(400).json({ error: 'Complete the address with a valid 6-digit pincode.' }); const ref = db.collection('users').doc(req.user.id).collection('addresses').doc(); await ref.set({ ...p, createdAt: FieldValue.serverTimestamp() }); res.json({ ok: true, id: ref.id }) } catch (e) { res.status(500).json({ error: e.message }) } })
app.delete('/api/shop/addresses', guardUser, async (req, res) => { try { const id = safeId(req.body.id); await db.collection('users').doc(req.user.id).collection('addresses').doc(id).delete(); res.json({ ok: true }) } catch (e) { res.status(500).json({ error: e.message }) } })

app.post('/api/shop/coupon', async (req, res) => { try { res.json(await couponFor(req.body.code, req.body.subtotal)) } catch (e) { res.status(400).json({ error: e.message }) } })

function orderNo() { return `QK-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}` }
async function buildOrderItems(items) {
  const products = await getProducts()
  const map = new Map(products.map(p => [p.id, p]))
  const result = []
  for (const raw of Array.isArray(items) ? items : []) {
    const p = map.get(safeId(raw.id)); const qty = Math.min(99, Math.max(1, money(raw.qty)))
    if (!p || p.active === false) throw new Error('One of the selected products is no longer available.')
    if (money(p.stock) < qty) throw new Error(`${p.title} has only ${p.stock} left.`)
    result.push({ id: p.id, title: p.title, qty, price: money(p.price), image: p.images?.[0] || p.imageUrl || '' })
  }
  if (!result.length) throw new Error('Your cart is empty.')
  return result
}
function totals(items, settings, discount) { const subtotal = items.reduce((s, x) => s + x.price * x.qty, 0); const d = Math.min(subtotal, Math.max(0, money(discount))); const shipping = subtotal >= money(settings.freeShipping) ? 0 : money(settings.shippingFlat); return { subtotal, discount: d, shipping, total: subtotal - d + shipping } }

app.post('/api/shop/create-order', guardUser, async (req, res) => {
  try {
    const settings = await getSettings(); const items = await buildOrderItems(req.body.items); const t = totals(items, settings, req.body.discount)
    let coupon = null; if (req.body.coupon) { try { coupon = await couponFor(req.body.coupon, t.subtotal); if (coupon.amount !== t.discount) t.discount = coupon.amount; t.total = t.subtotal - t.discount + t.shipping } catch (e) { return res.status(400).json({ error: e.message }) } }
    const address = { name: clean(req.body.address?.name, 100), phone: clean(req.body.address?.phone, 25), line1: clean(req.body.address?.line1, 300), city: clean(req.body.address?.city, 100), state: clean(req.body.address?.state, 100), pincode: clean(req.body.address?.pincode, 10), landmark: clean(req.body.address?.landmark, 150) }
    if (!address.name || !address.phone || !address.line1 || !address.city || !address.state || !/^\d{6}$/.test(address.pincode)) return res.status(400).json({ error: 'Complete a valid delivery address.' })
    const paymentMethod = req.body.paymentMethod === 'cod' ? 'cod' : 'online'
    if (paymentMethod === 'cod' && settings.codEnabled === false) return res.status(400).json({ error: 'Cash on delivery is not enabled.' })
    const ref = db.collection('orders').doc(); const common = { orderNumber: orderNo(), uid: req.user.id, customer: { name: req.user.name, email: req.user.email, phone: address.phone }, items, address, subtotal: t.subtotal, discount: t.discount, shipping: t.shipping, total: t.total, coupon: coupon ? { code: coupon.code, amount: coupon.amount } : null, paymentMethod, paymentStatus: paymentMethod === 'cod' ? 'cod' : 'created', fulfillmentStatus: paymentMethod === 'cod' ? 'confirmed' : 'processing', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }
    if (paymentMethod === 'cod') {
      await db.runTransaction(async tx => { for (const item of items) { const pr = db.collection('products').doc(item.id); const ps = await tx.get(pr); if (ps.exists) { const stock = money(ps.data().stock); if (stock < item.qty) throw new Error(`${item.title} went out of stock. Please refresh your cart.`); tx.update(pr, { stock: stock - item.qty, updatedAt: FieldValue.serverTimestamp() }) } } tx.set(ref, common); if (coupon) tx.set(db.collection('coupons').doc(coupon.id), { usedCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true }) })
      return res.json({ ok: true, orderId: ref.id, paymentMethod })
    }
    const rpOrder = await razorpay.orders.create({ amount: t.total * 100, currency: 'INR', receipt: `shop_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`, notes: { uid: req.user.id, orderId: ref.id } })
    await ref.set({ ...common, paymentStatus: 'created', razorpayOrderId: rpOrder.id })
    res.json({ ok: true, orderId: ref.id, razorpayOrderId: rpOrder.id, amount: rpOrder.amount, currency: rpOrder.currency, keyId: process.env.RAZORPAY_KEY_ID })
  } catch (e) { res.status(400).json({ error: e.message || 'Unable to create order.' }) }
})

app.post('/api/shop/verify-payment', guardUser, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {}
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex')
    if (!safeEqual(expected, razorpay_signature)) return res.status(400).json({ error: 'Payment signature verification failed.' })
    const q = await db.collection('orders').where('razorpayOrderId', '==', razorpay_order_id).limit(1).get(); if (q.empty) return res.status(404).json({ error: 'Order not found.' }); const ref = q.docs[0].ref; const o = q.docs[0].data(); if (o.uid !== req.user.id) return res.status(403).json({ error: 'Order access denied.' }); if (o.paymentStatus === 'paid') return res.json({ ok: true, alreadyVerified: true, orderId: ref.id })
    const payment = await razorpay.payments.fetch(razorpay_payment_id); if (payment.status !== 'captured' || money(payment.amount) !== money(o.total) * 100 || payment.order_id !== razorpay_order_id) return res.status(400).json({ error: 'Payment is not valid or captured.' })
    await db.runTransaction(async tx => { for (const item of o.items || []) { const pr = db.collection('products').doc(item.id); const ps = await tx.get(pr); if (ps.exists) { const stock = money(ps.data().stock); if (stock < item.qty) throw new Error(`${item.title} is out of stock after payment verification. Contact support with your order number.`); tx.update(pr, { stock: stock - item.qty, updatedAt: FieldValue.serverTimestamp() }) } } tx.set(ref, { paymentStatus: 'paid', fulfillmentStatus: 'confirmed', paymentId: razorpay_payment_id, paidAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); if (o.coupon?.code) tx.set(db.collection('coupons').doc(o.coupon.code), { usedCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); tx.set(db.collection('transactions').doc(), { uid: req.user.id, orderId: ref.id, type: 'shop_order', amount: o.total, status: 'completed', title: `Order ${o.orderNumber}`, createdAt: FieldValue.serverTimestamp() }) })
    res.json({ ok: true, orderId: ref.id })
  } catch (e) { res.status(400).json({ error: e.message || 'Payment verification failed.' }) }
})

app.get('/api/shop/orders', guardUser, async (req, res) => { try { const q = await db.collection('orders').where('uid', '==', req.user.id).get(); const rows = q.docs.map(d=>({ id:d.id, ...d.data() })).sort((a,b)=>dateMs(b.createdAt)-dateMs(a.createdAt)); res.json({ orders: rows.slice(0, 200).map(jsonSafe) }) } catch (e) { res.status(500).json({ error: e.message }) } })
app.get('/api/shop/orders/:id', guardUser, async (req, res) => { try { const o = await getDoc('orders', safeId(req.params.id), null); if (!o || o.uid !== req.user.id) return res.status(404).json({ error: 'Order not found.' }); res.json({ order: jsonSafe(o) }) } catch (e) { res.status(500).json({ error: e.message }) } })
app.post('/api/shop/orders/cancel', guardUser, async (req, res) => { try { const ref = db.collection('orders').doc(safeId(req.body.id)); const snap = await ref.get(); if (!snap.exists || snap.data().uid !== req.user.id) return res.status(404).json({ error: 'Order not found.' }); const o=snap.data(); if (!['processing','confirmed'].includes(o.fulfillmentStatus)) return res.status(400).json({ error: 'This order can no longer be cancelled online.' }); await ref.set({ fulfillmentStatus:'cancelled', cancelledAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp(), refundStatus:o.paymentStatus==='paid'?'pending_not_automatic':'not_required' },{merge:true}); res.json({ok:true}) } catch(e){res.status(400).json({error:e.message})} })

app.get('/api/shop/reviews/:productId', async (req,res)=>{try{const q=await db.collection('reviews').where('productId','==',safeId(req.params.productId)).limit(100).get();res.json({reviews:q.docs.map(d=>jsonSafe({id:d.id,...d.data()})).sort((a,b)=>dateMs(b.createdAt)-dateMs(a.createdAt))})}catch(e){res.status(500).json({error:e.message})}})
app.post('/api/shop/reviews', guardUser, async(req,res)=>{try{const productId=safeId(req.body.productId),rating=Math.min(5,Math.max(1,money(req.body.rating))),text=clean(req.body.text,1200);const p=await getDoc('products',productId,null);if(!p)return res.status(404).json({error:'Product not found.'});if(text.length<8)return res.status(400).json({error:'Review is too short.'});const existing=await db.collection('reviews').where('productId','==',productId).limit(100).get(); const own=existing.docs.find(d=>d.data()?.uid===req.user.id);const ref=own?own.ref:db.collection('reviews').doc();await ref.set({productId,uid:req.user.id,name:req.user.name,rating,text,createdAt:own?own.data().createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}})

app.post('/api/chatbot', async (req,res)=>{try{const bot=await getChatbot();if((await getSettings()).chatbotEnabled===false)return res.status(403).json({error:'AI support is currently disabled.'});const userMessage=clean(req.body.message,1500);if(!userMessage)return res.status(400).json({error:'Message is required.'});const products=(await getProducts()).slice(0,60).map(p=>`${p.title} | ₹${p.price} | stock ${p.stock} | category ${p.category}`).join('\n');const answer=await geminiGenerate([{role:'user',parts:[{text:userMessage}]}],`${bot.prompt}\nStore context:\n${products}\nCurrent support scope: ${bot.topic}`);res.json({ok:true,name:bot.name,answer})}catch(e){res.status(500).json({error:e.message})}})

app.post('/api/admin/login',(req,res)=>{const password=String(req.body.password||'');if(!safeEqual(password,ADMIN_PASSWORD))return res.status(401).json({error:'Wrong password.'});setCookie(res,ADMIN_COOKIE,token('admin','panel',12,ADMIN_PASSWORD),12*3600);res.json({ok:true})})
app.post('/api/admin/logout',(req,res)=>{clearCookie(res,ADMIN_COOKIE);res.json({ok:true})})
app.get('/api/admin/me',(req,res)=>res.json({authenticated:isAdmin(req)}))

app.get('/api/admin/data',guardAdmin,async(req,res)=>{try{
  const [settings,chatbot,products,categories,banners,coupons,orders] = await Promise.all([getSettings(),getChatbot(),getProducts(true),getCategories(true),getBanners(true),getCoupons(true),listCollection('orders',1000)])
  const usersRaw=await listCollection('users',1000);const ordersSorted=orders.sort((a,b)=>dateMs(b.createdAt)-dateMs(a.createdAt)); const paidRevenue=orders.filter(o=>o.paymentStatus==='paid').reduce((s,o)=>s+money(o.total),0)
  const userStats=new Map(); orders.forEach(o=>{const x=userStats.get(o.uid)||{orderCount:0,totalSpend:0};x.orderCount++;if(o.paymentStatus==='paid')x.totalSpend+=money(o.total);userStats.set(o.uid,x)})
  const users=usersRaw.map(u=>({id:u.id,name:u.name,email:u.email,phone:u.phone||'',active:u.active!==false,createdAt:u.createdAt,...(userStats.get(u.id)||{})})).sort((a,b)=>dateMs(b.createdAt)-dateMs(a.createdAt))
  const stats={revenue:paidRevenue,orders:orders.length,pendingOrders:orders.filter(o=>!['delivered','cancelled'].includes(o.fulfillmentStatus)).length,users:users.length,activeUsers:users.filter(u=>u.active!==false).length,products:products.length,lowStock:products.filter(p=>money(p.stock)<5&&p.active!==false).length,activeCoupons:coupons.filter(c=>c.active!==false).length,activeBanners:banners.filter(b=>b.active!==false).length}
  res.json({settings,chatbot,products:products.map(jsonSafe),categories:categories.map(jsonSafe),banners:banners.map(jsonSafe),coupons:coupons.map(jsonSafe),orders:ordersSorted.map(jsonSafe),users:users.map(jsonSafe),stats})
}catch(e){res.status(500).json({error:e.message})}})

app.post('/api/admin/settings',guardAdmin,async(req,res)=>{try{const current=await getSettings();const next={...current,...req.body,freeShipping:money(req.body.freeShipping),shippingFlat:money(req.body.shippingFlat),codEnabled:req.body.codEnabled!==false,chatbotEnabled:req.body.chatbotEnabled!==false,logoText:clean(req.body.logoText,4)||'Q',siteName:clean(req.body.siteName,100)||defaults.settings.siteName,heroImage:validUrl(req.body.heroImage)?clean(req.body.heroImage,1200):current.heroImage};await db.collection('settings').doc('main').set(next,{merge:true});res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}})
app.post('/api/admin/chatbot',guardAdmin,async(req,res)=>{try{await db.collection('chatbot').doc('main').set({name:clean(req.body.name,80)||defaults.chatbot.name,intro:clean(req.body.intro,500),topic:clean(req.body.topic,1800),prompt:clean(req.body.prompt,2000),updatedAt:FieldValue.serverTimestamp()},{merge:true});res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}})

app.post('/api/admin/upload-image',guardAdmin,async(req,res)=>{try{const key=String(process.env.IMGBB_API_KEY||'');if(!key)return res.status(503).json({error:'ImgBB upload is not configured.'});const image=String(req.body.image||'').split(',').pop().replace(/\s/g,'');if(!image)return res.status(400).json({error:'Image is required.'});const params=new URLSearchParams();params.set('image',image);if(req.body.name)params.set('name',clean(req.body.name,120));const r=await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params});const d=await r.json().catch(()=>({}));if(!r.ok||!d?.success||!d?.data?.url)return res.status(502).json({error:d?.error?.message||'ImgBB upload failed.'});res.json({ok:true,imageUrl:d.data.url})}catch(e){res.status(500).json({error:e.message})}})

function saveValidationProduct(req){const p={id:safeId(req.body.id)||`product_${Date.now()}`,title:clean(req.body.title,180),slug:safeId(req.body.slug)||clean(req.body.title,160).toLowerCase().replace(/[^a-z0-9]+/g,'-'),category:clean(req.body.category,80),price:money(req.body.price),compareAtPrice:money(req.body.compareAtPrice),stock:money(req.body.stock),sku:clean(req.body.sku,80),images:Array.isArray(req.body.images)?req.body.images.slice(0,8).map(x=>clean(x,1200)).filter(validUrl):[],imageUrl:validUrl(req.body.imageUrl)?clean(req.body.imageUrl,1200):'',description:clean(req.body.description,3000),highlights:Array.isArray(req.body.highlights)?req.body.highlights.slice(0,12).map(x=>clean(x,140)) : [],featured:req.body.featured!==false,badge:clean(req.body.badge,80),active:req.body.active!==false,sortOrder:money(req.body.sortOrder)||Date.now(),updatedAt:FieldValue.serverTimestamp()};if(!p.title||p.price<=0)return {error:'Product title and selling price are required.'};if(!p.images.length&&p.imageUrl)p.images=[p.imageUrl];if(!p.images.length)return {error:'At least one HTTPS image URL is required.'};return {p}}
app.post('/api/admin/product',guardAdmin,async(req,res)=>{try{const out=saveValidationProduct(req);if(out.error)return res.status(400).json({error:out.error});await db.collection('products').doc(out.p.id).set(out.p,{merge:true});res.json({ok:true,id:out.p.id})}catch(e){res.status(400).json({error:e.message})}})
app.delete('/api/admin/product',guardAdmin,async(req,res)=>{try{await db.collection('products').doc(safeId(req.body.id)).delete();res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}})

app.post('/api/admin/category',guardAdmin,async(req,res)=>{try{const id=safeId(req.body.id)||`category_${Date.now()}`;const p={name:clean(req.body.name,100),slug:safeId(req.body.slug)||clean(req.body.name,100).toLowerCase().replace(/[^a-z0-9]+/g,'-'),imageUrl:validUrl(req.body.imageUrl)?clean(req.body.imageUrl,1200):'',active:req.body.active!==false,sortOrder:money(req.body.sortOrder)||1,updatedAt:FieldValue.serverTimestamp()};if(!p.name)return res.status(400).json({error:'Category name is required.'});await db.collection('categories').doc(id).set(p,{merge:true});res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}})
app.delete('/api/admin/category',guardAdmin,async(req,res)=>{try{await db.collection('categories').doc(safeId(req.body.id)).delete();res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}})

app.post('/api/admin/banner',guardAdmin,async(req,res)=>{try{const id=safeId(req.body.id)||`banner_${Date.now()}`;const p={title:clean(req.body.title,160),subtitle:clean(req.body.subtitle,300),imageUrl:validUrl(req.body.imageUrl)?clean(req.body.imageUrl,1200):'',link:clean(req.body.link,300)||'/shop',badge:clean(req.body.badge,80),active:req.body.active!==false,sortOrder:money(req.body.sortOrder)||1,updatedAt:FieldValue.serverTimestamp()};if(!p.title||!p.imageUrl)return res.status(400).json({error:'Banner title and HTTPS image URL are required.'});await db.collection('banners').doc(id).set(p,{merge:true});res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}})
app.delete('/api/admin/banner',guardAdmin,async(req,res)=>{try{await db.collection('banners').doc(safeId(req.body.id)).delete();res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}})

app.post('/api/admin/coupon',guardAdmin,async(req,res)=>{try{const code=clean(req.body.code,40).toUpperCase();if(!/^[A-Z0-9_-]{3,40}$/.test(code))return res.status(400).json({error:'Coupon code must be 3-40 letters/numbers.'});const p={code,type:req.body.type==='fixed'?'fixed':'percent',value:money(req.body.value),minOrder:money(req.body.minOrder),maxDiscount:money(req.body.maxDiscount),usageLimit:money(req.body.usageLimit),expiresAt:clean(req.body.expiresAt,80),active:req.body.active!==false,usedCount:money(req.body.usedCount),updatedAt:FieldValue.serverTimestamp()};if(p.value<=0)return res.status(400).json({error:'Coupon value must be greater than zero.'});await db.collection('coupons').doc(code).set(p,{merge:true});res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}})
app.delete('/api/admin/coupon',guardAdmin,async(req,res)=>{try{await db.collection('coupons').doc(safeId(req.body.id).toUpperCase()).delete();res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}})

app.post('/api/admin/order/status',guardAdmin,async(req,res)=>{try{const id=safeId(req.body.id),status=clean(req.body.status,40);if(!['processing','confirmed','packed','shipped','out_for_delivery','delivered','cancelled'].includes(status))return res.status(400).json({error:'Invalid fulfillment status.'});await db.collection('orders').doc(id).set({fulfillmentStatus:status,trackingId:clean(req.body.trackingId,120),updatedAt:FieldValue.serverTimestamp()},{merge:true});res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}})
app.post('/api/admin/user/toggle',guardAdmin,async(req,res)=>{try{await db.collection('users').doc(safeId(req.body.uid)).set({active:req.body.active!==false,updatedAt:FieldValue.serverTimestamp()},{merge:true});res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}})

app.get('/api/health',(req,res)=>res.json({ok:true,firebaseConfigured:!!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,razorpayConfigured:!!process.env.RAZORPAY_KEY_ID&&!!process.env.RAZORPAY_KEY_SECRET,geminiConfigured:!!process.env.GEMINI_API_KEY}))

module.exports = app
