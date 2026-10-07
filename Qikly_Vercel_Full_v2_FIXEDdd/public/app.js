const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#039;"}[c]));
const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
let DATA = null, razorpayKey = "", bannerTimer = null, bannerIndex = 0, chatHistory = [];

async function api(url, options = {}) {
  const r = await fetch(url, { cache: "no-store", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2800); }
function cssVar(name, value) { document.documentElement.style.setProperty(`--${name}`, value); }
function applyTheme(theme = {}) { for (const [k, v] of Object.entries(theme)) cssVar(k, v); }

function renderBanners(items = []) {
  const track = $("#bannerTrack"), dots = $("#bannerDots"); clearInterval(bannerTimer); bannerIndex = 0;
  if (!items.length) { track.innerHTML = `<div class="banner-empty"><span>♥</span><strong>Your support matters</strong><small>Add banners from the admin panel.</small></div>`; dots.innerHTML = ""; return; }
  track.innerHTML = items.map((b, i) => {
    const link = b.linkUrl ? `href="${esc(b.linkUrl)}" target="_blank" rel="noopener"` : 'href="#donate"';
    return `<a class="banner-slide ${i === 0 ? "active" : ""}" data-index="${i}" ${link}><img src="${esc(b.imageUrl)}" alt="${esc(b.title || "Donation banner")}" loading="${i === 0 ? "eager" : "lazy"}"><span>${esc(b.title || "Support our work")}</span></a>`;
  }).join("");
  dots.innerHTML = items.map((_, i) => `<button class="${i === 0 ? "active" : ""}" data-index="${i}"></button>`).join("");
  const go = (i) => { bannerIndex = i; track.querySelectorAll(".banner-slide").forEach((x, n) => x.classList.toggle("active", n === i)); dots.querySelectorAll("button").forEach((x, n) => x.classList.toggle("active", n === i)); };
  dots.querySelectorAll("button").forEach(btn => btn.onclick = () => go(Number(btn.dataset.index)));
  bannerTimer = setInterval(() => go((bannerIndex + 1) % items.length), 3000);
}

function renderDonors(donors = []) {
  $("#donorList").innerHTML = donors.length ? donors.map((d, i) => `<div class="donor-row ${i < 3 ? "top-three" : ""}"><span class="rank">#${d.rank || i + 1}</span><span class="donor-name">${esc(d.name)}</span><strong>${money(d.amount)}</strong></div>`).join("") : `<div class="empty card">No supporters yet. Be the first ❤️</div>`;
}
function renderFaq(faqs = []) { $("#faqList").innerHTML = faqs.length ? faqs.map(f => `<details class="faq-item"><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`).join("") : `<div class="empty card">FAQ will be added soon.</div>`; }
function loadPublic() {
  const s = DATA.settings, c = DATA.chatbot || {};
  $("#ngoName").textContent = s.ngoName; $("#footerName").textContent = s.ngoName;
  $("#heroTitle").textContent = s.heroTitle; $("#heroText").textContent = s.heroText; $("#tagline").textContent = s.tagline;
  $("#marqueeText").textContent = s.marqueeText; $("#aboutText").textContent = s.about; $("#termsText").textContent = s.terms; $("#privacyText").textContent = s.privacy; $("#refundText").textContent = s.refund;
  $("#totalRaised").textContent = money(DATA.totalRaised); $("#donorCount").textContent = Number(DATA.donorCount || 0).toLocaleString("en-IN");
  $("#footerTag").textContent = s.tagline; $("#supportEmail").href = `mailto:${s.supportEmail || "support@example.org"}`; $("#supportEmail").textContent = s.supportEmail || "Email";
  $("#chatName").textContent = c.name; $("#chatNameShort").textContent = c.name;
  applyTheme(s.theme); renderBanners(DATA.banners); renderDonors(DATA.topDonors); renderFaq(DATA.faqs);
}

$(".quick-amounts")?.addEventListener("click", (e) => { const b = e.target.closest("button[data-amount]"); if (b) $("#donorAmount").value = b.dataset.amount; });
$("#donationForm").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("#donorName").value.trim(), amount = Number($("#donorAmount").value), btn = $("#donateBtn");
  $("#donateError").textContent = ""; $("#donateSuccess").textContent = "";
  if (!name || !Number.isInteger(amount) || amount < 1) { $("#donateError").textContent = "Enter a valid name and amount."; return; }
  if (!razorpayKey || typeof Razorpay === "undefined") { $("#donateError").textContent = "Razorpay is not configured yet."; return; }
  btn.disabled = true; btn.textContent = "Creating secure order…";
  try {
    const o = await api("/api/donation/create-order", { method: "POST", body: JSON.stringify({ name, amount }) });
    const rzp = new Razorpay({ key: razorpayKey, amount: o.amount, currency: "INR", name: DATA.settings.ngoName, description: "Donation support", order_id: o.orderId, prefill: { name }, theme: { color: DATA.settings.theme.primary },
      handler: async (response) => {
        try {
          btn.textContent = "Verifying payment…";
          const v = await api("/api/donation/verify-payment", { method: "POST", body: JSON.stringify(response) });
          $("#donateSuccess").textContent = `Thank you ${v.name} ❤️ Your ${money(v.amount)} donation is verified. Live rank: #${v.rank}.`;
          $("#myRank").textContent = `#${v.rank}`; localStorage.setItem("ngo_last_rank", String(v.rank)); localStorage.setItem("ngo_last_name", v.name);
          toast("Donation successful ❤️"); $("#donationForm").reset(); const fresh = await api("/api/public/data"); DATA = fresh; loadPublic();
        } catch (err) { $("#donateError").textContent = err.message; }
        finally { btn.disabled = false; btn.textContent = "Donate Securely ↗"; }
      }, modal: { ondismiss: () => { btn.disabled = false; btn.textContent = "Donate Securely ↗"; } }
    });
    rzp.on("payment.failed", (x) => { $("#donateError").textContent = x.error?.description || "Payment failed."; btn.disabled = false; btn.textContent = "Donate Securely ↗"; });
    rzp.open();
  } catch (err) { $("#donateError").textContent = err.message; btn.disabled = false; btn.textContent = "Donate Securely ↗"; }
};

function openChat() { $("#chatWidget").classList.remove("hidden"); if (!chatHistory.length) addChat("model", DATA.chatbot?.intro || "Namaste ❤️ Main aapko donation se related questions mein help kar sakta hoon."); $("#chatInput").focus(); }
function addChat(role, text) { const el = document.createElement("div"); el.className = `chat-msg ${role}`; el.innerHTML = `<div>${esc(text).replace(/\n/g, "<br>")}</div>`; $("#chatMessages").appendChild(el); $("#chatMessages").scrollTop = $("#chatMessages").scrollHeight; }
$("#chatOpen").onclick = openChat; $("#chatClose").onclick = () => $("#chatWidget").classList.add("hidden");
$("#chatForm").onsubmit = async (e) => {
  e.preventDefault(); const input = $("#chatInput"), msg = input.value.trim(); if (!msg) return; input.value = "";
  chatHistory.push({ role: "user", text: msg }); addChat("user", msg); const btn = $("#chatForm button"); btn.disabled = true; const typing = document.createElement("div"); typing.className = "chat-msg model"; typing.innerHTML = "<div class='typing'>•••</div>"; $("#chatMessages").appendChild(typing);
  try { const d = await api("/api/chatbot", { method: "POST", body: JSON.stringify({ message: msg, history: chatHistory.slice(-8) }) }); typing.remove(); chatHistory.push({ role: "model", text: d.answer }); addChat("model", d.answer); }
  catch (err) { typing.remove(); addChat("model", err.message || "Chatbot unavailable right now."); }
  finally { btn.disabled = false; input.focus(); }
};

(async function init() {
  try {
    const [data, cfg] = await Promise.all([api("/api/public/data"), api("/api/public/config")]); DATA = data; razorpayKey = cfg.razorpayKeyId || ""; loadPublic();
    const savedRank = localStorage.getItem("ngo_last_rank"); if (savedRank) $("#myRank").textContent = `#${savedRank}`;
  } catch (e) { $("#donorList").innerHTML = `<div class="empty card">${esc(e.message)}</div>`; }
})();
