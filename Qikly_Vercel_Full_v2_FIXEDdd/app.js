(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const state = { config: null, user: null, services: [], wallet: null, orders: [], selectedService: null, activeCategory: "all" };
  const money = n => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const date = value => {
    const d = value?.toDate ? value.toDate() : value?.seconds ? new Date(value.seconds * 1000) : value ? new Date(value) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  };
  async function api(url, options = {}) {
    const response = await fetch(url, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }
  let toastTimer;
  function toast(message, kind = "") {
    const el = $("#toast"); el.textContent = message; el.className = `toast show ${kind}`;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = "toast"; }, 3500);
  }
  function modal(html) { $("#modalRoot").innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal-card" role="dialog" aria-modal="true">${html}</section></div>`; $(".modal-card").addEventListener("click", e => e.stopPropagation()); $("[data-close-modal]").addEventListener("click", e => { if (e.target.matches("[data-close-modal]")) closeModal(); }); $("[data-modal-close]")?.addEventListener("click", closeModal); }
  function closeModal() { $("#modalRoot").innerHTML = ""; }
  function updateHeader() {
    const logged = Boolean(state.user);
    $("#loginBtn").hidden = logged; $("#signupBtn").hidden = logged; $("#accountBtn").hidden = !logged;
    $("#headerBalance").hidden = !logged;
    if (logged) { $("#accountBtn").textContent = (state.user.name || "M").charAt(0).toUpperCase(); $("#headerBalance").textContent = money(state.user.balance); }
    else $("#headerBalance").textContent = "";
  }
  async function loadConfig() {
    state.config = await api("/api/public/config");
    $("#brandName").textContent = state.config.siteName || "Mintu Social";
    $("#footerBrand").textContent = state.config.siteName || "Mintu Social";
    document.title = `${state.config.siteName || "Mintu Social"} — Digital Marketing Services`;
    if (state.config.supportEmail) { $("#supportLink").href = `mailto:${state.config.supportEmail}`; $("#supportLink").textContent = state.config.supportEmail; }
    $("#year").textContent = new Date().getFullYear();
  }
  async function loadServices() {
    try {
      const data = await api("/api/services"); state.services = data.services || [];
      const cats = [...new Set(state.services.map(s => s.category).filter(Boolean))].sort();
      $("#categoryFilter").innerHTML = `<option value="all">All categories</option>${cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}`;
      renderServices();
    } catch (e) { $("#serviceGrid").innerHTML = `<div class="empty-state wide"><b>Could not load services</b><p>${esc(e.message)}</p><button class="btn btn-outline" id="retryServices">Try again</button></div>`; $("#retryServices")?.addEventListener("click", loadServices); }
  }
  function renderServices() {
    const q = $("#serviceSearch").value.trim().toLowerCase();
    const category = $("#categoryFilter").value;
    const items = state.services.filter(s => (category === "all" || s.category === category) && (!q || `${s.name} ${s.category} ${s.description}`.toLowerCase().includes(q)));
    if (!items.length) {
      $("#serviceGrid").innerHTML = `<div class="empty-state wide"><div class="empty-symbol">✦</div><b>${state.services.length ? "No matching services" : "Services are being prepared"}</b><p>${state.services.length ? "Try a different search or category." : "New supplier services are imported into admin review first. Only verified, policy-compliant services appear here."}</p></div>`;
      return;
    }
    const icons = ["◈", "✦", "↗", "⌘", "◎", "◇"];
    $("#serviceGrid").innerHTML = items.map((s, i) => `<article class="service-card"><div class="service-card-top"><span class="service-icon">${icons[i % icons.length]}</span><span class="service-category">${esc(s.category)}</span></div><h3>${esc(s.name)}</h3><p>${esc(s.description || "Professional digital marketing support with order tracking.")}</p><div class="service-meta"><span>Min ${Number(s.min).toLocaleString("en-IN")}</span><span>Max ${Number(s.max).toLocaleString("en-IN")}</span></div><div class="service-card-bottom"><div><b>${money(s.pricePer1000)}</b><small>${s.pricingModel === "fixed" ? "per order" : "per 1,000 units"}</small></div><button class="btn btn-small btn-primary" data-order-service="${esc(s.id)}">View service <span>↗</span></button></div></article>`).join("");
    $$('[data-order-service]').forEach(b => b.addEventListener("click", () => openOrder(b.dataset.orderService)));
  }
  function openAuth(mode = "login") {
    modal(`<button class="modal-x" data-modal-close aria-label="Close">×</button><div class="modal-kicker">YOUR WORKSPACE</div><h2>${mode === "signup" ? "Create your account" : "Welcome back"}</h2><p class="modal-sub">${mode === "signup" ? "Set up your account to manage orders and wallet payments." : "Log in to see your balance and recent orders."}</p><div class="auth-tabs"><button class="${mode === "login" ? "active" : ""}" data-auth-tab="login">Log in</button><button class="${mode === "signup" ? "active" : ""}" data-auth-tab="signup">Create account</button></div><form id="authForm" class="modal-form">${mode === "signup" ? `<label>Full name<input name="name" autocomplete="name" required maxlength="60" placeholder="Your name"></label>` : ""}<label>Email address<input name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label><label>Password<input name="password" type="password" required minlength="8" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" placeholder="At least 8 characters"></label><div class="form-error" id="authError"></div><button class="btn btn-primary btn-full" type="submit">${mode === "signup" ? "Create account" : "Log in"} <span>↗</span></button></form><p class="fine-print">By continuing, you agree to use services lawfully and follow the relevant platform terms.</p>`);
    $$('[data-auth-tab]').forEach(b => b.addEventListener("click", () => openAuth(b.dataset.authTab)));
    $("#authForm").addEventListener("submit", async e => {
      e.preventDefault(); const form = new FormData(e.currentTarget); const btn = $("#authForm button[type=submit]"); btn.disabled = true; btn.textContent = "Please wait…";
      try {
        const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
        await api(endpoint, { method: "POST", body: JSON.stringify({ name: form.get("name"), email: form.get("email"), password: form.get("password") }) });
        closeModal(); await loadAccount(); toast(mode === "signup" ? "Account created." : "You are logged in.", "success");
      } catch (err) { $("#authError").textContent = err.message; btn.disabled = false; btn.textContent = mode === "signup" ? "Create account ↗" : "Log in ↗"; }
    });
  }
  async function loadAccount() {
    try {
      const auth = await api("/api/auth/me"); state.user = auth.authenticated ? auth.user : null;
      if (state.user) await Promise.all([loadWallet(), loadOrders()]); else { state.wallet = null; state.orders = []; }
      updateHeader(); renderDashboard();
    } catch { state.user = null; updateHeader(); renderDashboard(); }
  }
  async function loadWallet() { const w = await api("/api/wallet"); state.wallet = w; state.user.balance = w.balance; updateHeader(); }
  async function loadOrders() { const d = await api("/api/orders"); state.orders = d.orders || []; }
  function openWallet() {
    if (!state.user) return openAuth("login");
    modal(`<button class="modal-x" data-modal-close aria-label="Close">×</button><div class="modal-kicker">ADD FUNDS</div><h2>Top up your wallet</h2><p class="modal-sub">Add funds securely with Razorpay. Minimum ₹50, maximum ₹50,000 per recharge.</p><div class="balance-highlight"><small>Current available balance</small><b>${money(state.user.balance)}</b></div><form id="walletForm" class="modal-form"><label>Recharge amount (INR)<input name="amount" type="number" min="50" max="50000" step="1" value="200" required></label><div class="quick-amounts"><button type="button" data-amount="100">₹100</button><button type="button" data-amount="200">₹200</button><button type="button" data-amount="500">₹500</button><button type="button" data-amount="1000">₹1,000</button></div><div class="form-error" id="walletError"></div><button class="btn btn-primary btn-full" type="submit">Continue to secure payment <span>↗</span></button></form><p class="fine-print">Wallet balance is credited only after the server verifies a captured payment.</p>`);
    $$('[data-amount]').forEach(b => b.addEventListener("click", () => { $("#walletForm [name=amount]").value = b.dataset.amount; }));
    $("#walletForm").addEventListener("submit", async e => {
      e.preventDefault(); const amount = Number(new FormData(e.currentTarget).get("amount")); const btn = $("#walletForm button[type=submit]"); btn.disabled = true; btn.textContent = "Creating payment…";
      try {
        if (!window.Razorpay) throw new Error("Razorpay Checkout did not load. Refresh the page and try again.");
        const order = await api("/api/wallet/create-order", { method: "POST", body: JSON.stringify({ amount }) });
        const checkout = new Razorpay({ key: order.keyId, amount: order.amount, currency: order.currency, name: state.config.siteName, description: "Wallet recharge", order_id: order.orderId, prefill: { name: state.user.name, email: state.user.email }, theme: { color: "#8b78ff" }, handler: async response => {
          try { await api("/api/wallet/verify", { method: "POST", body: JSON.stringify(response) }); closeModal(); await loadAccount(); toast("Wallet recharge successful.", "success"); }
          catch (err) { toast(`Payment received but confirmation failed: ${err.message}. Contact support with your payment ID.`, "error"); }
        }, modal: { ondismiss: () => { btn.disabled = false; btn.textContent = "Continue to secure payment ↗"; } } });
        checkout.on("payment.failed", response => { $("#walletError").textContent = response.error?.description || "Payment failed. Try again."; btn.disabled = false; btn.textContent = "Continue to secure payment ↗"; });
        checkout.open();
      } catch (err) { $("#walletError").textContent = err.message; btn.disabled = false; btn.textContent = "Continue to secure payment ↗"; }
    });
  }
  function openOrder(serviceId) {
    const service = state.services.find(s => s.id === serviceId); if (!service) return;
    if (!state.user) return openAuth("login");
    state.selectedService = service;
    modal(`<button class="modal-x" data-modal-close aria-label="Close">×</button><div class="modal-kicker">NEW ORDER</div><h2>${esc(service.name)}</h2><p class="modal-sub">${esc(service.description || "Review the details and submit your request.")}</p><div class="order-summary"><div><small>${service.pricingModel === "fixed" ? "Fixed price" : "Price per 1,000"}</small><b>${money(service.pricePer1000)}</b></div><div><small>${service.pricingModel === "fixed" ? "Order quantity" : "Allowed quantity"}</small><b>${service.pricingModel === "fixed" ? "1 order" : `${Number(service.min).toLocaleString("en-IN")} – ${Number(service.max).toLocaleString("en-IN")}`}</b></div></div><form id="orderForm" class="modal-form"><label>Target URL<input name="link" type="url" placeholder="https://…" required></label>${service.pricingModel === "fixed" ? `<input type="hidden" name="quantity" value="1">` : `<label>Quantity<input name="quantity" type="number" min="${service.min}" max="${service.max}" step="1" value="${service.min}" required></label>`}<div class="order-total"><span>Estimated total</span><b id="orderTotal">${money(service.pricingModel === "fixed" ? service.pricePer1000 : Math.max(1, service.min * service.pricePer1000 / 1000))}</b></div><div class="wallet-line"><span>Wallet balance</span><b>${money(state.user.balance)}</b></div><div class="form-error" id="orderError"></div><button class="btn btn-primary btn-full" type="submit">Place order <span>↗</span></button></form><p class="fine-print">Submitting an order confirms that you own or are authorised to manage the target account/page.</p>`);
    const qty = $("#orderForm [name=quantity]"); const total = () => { const n = Number(qty.value || 0); $("#orderTotal").textContent = money(service.pricingModel === "fixed" ? service.pricePer1000 : Math.max(1, n * service.pricePer1000 / 1000)); };
    qty?.addEventListener("input", total);
    $("#orderForm").addEventListener("submit", async e => {
      e.preventDefault(); const form = new FormData(e.currentTarget); const btn = $("#orderForm button[type=submit]"); btn.disabled = true; btn.textContent = "Submitting…";
      try {
        const result = await api("/api/orders/create", { method: "POST", body: JSON.stringify({ serviceId: service.id, link: form.get("link"), quantity: Number(form.get("quantity")) }) });
        closeModal(); await loadAccount(); toast(`Order ${result.orderId.slice(0, 10)} created.`, "success"); $("#dashboard").scrollIntoView({ behavior: "smooth" });
      } catch (err) { $("#orderError").textContent = err.message; btn.disabled = false; btn.textContent = "Place order ↗"; await loadWallet().catch(() => {}); }
    });
  }
  function statusClass(s) { const v = String(s || "").toLowerCase(); return v.includes("complete") ? "status-done" : v.includes("cancel") || v.includes("refund") ? "status-muted" : v.includes("review") || v.includes("confirm") ? "status-warn" : "status-live"; }
  function renderDashboard() {
    const root = $("#dashboardContent");
    if (!state.user) { root.className = "dashboard-placeholder"; root.innerHTML = `<div class="placeholder-icon">⌘</div><div><b>Your dashboard will appear here</b><p>Log in or create an account to manage your wallet and orders.</p></div>`; $("#dashboardAuth").hidden = false; $("#dashboardAuth").textContent = "Log in to continue"; return; }
    $("#dashboardAuth").hidden = true;
    const orders = state.orders.slice(0, 8);
    const txs = (state.wallet?.transactions || []).slice(0, 6);
    root.className = "dashboard-live";
    root.innerHTML = `<div class="account-overview"><div class="account-welcome"><span class="mini-label">SIGNED IN AS</span><h3>${esc(state.user.name)}</h3><p>${esc(state.user.email)}</p></div><div class="wallet-panel"><span>AVAILABLE BALANCE</span><b>${money(state.user.balance)}</b><button class="btn btn-primary btn-small" id="dashboardAddFunds">＋ Add funds</button></div><div class="account-stats"><div><small>Total orders</small><b>${state.orders.length}</b></div><div><small>Recent transactions</small><b>${(state.wallet?.transactions || []).length}</b></div></div></div><div class="dashboard-columns"><section class="dash-panel"><div class="dash-panel-head"><div><span class="mini-label">ACTIVITY</span><h3>Recent orders</h3></div><button class="text-button" id="refreshOrders">↻ Refresh</button></div>${orders.length ? `<div class="data-list">${orders.map(o => `<div class="data-row"><div class="data-row-main"><b>${esc(o.serviceName || "Service order")}</b><small>${esc(o.id.slice(0, 14))} · ${date(o.createdAt)}</small></div><div class="data-row-side"><b>${money(o.amount)}</b><span class="status-tag ${statusClass(o.status)}">${esc(o.status)}</span></div></div>`).join("")}</div>` : `<div class="small-empty">No orders yet. Browse services to place your first request.</div>`}</section><section class="dash-panel"><div class="dash-panel-head"><div><span class="mini-label">WALLET</span><h3>Transactions</h3></div><button class="text-button" id="refreshWallet">↻ Refresh</button></div>${txs.length ? `<div class="data-list">${txs.map(t => `<div class="data-row"><div class="data-row-main"><b>${esc(t.note || t.type || "Transaction")}</b><small>${date(t.createdAt)}</small></div><div class="data-row-side"><b class="${Number(t.amount) >= 0 ? "amount-plus" : ""}">${Number(t.amount) >= 0 ? "+" : "−"}${money(Math.abs(Number(t.amount)))}</b><span class="txn-type">${esc(t.type || "entry")}</span></div></div>`).join("")}</div>` : `<div class="small-empty">Your wallet transactions will appear here.</div>`}</section></div><div class="dashboard-bottom"><span>Need help? Contact <a href="mailto:${esc(state.config?.supportEmail || "support@example.com")}">${esc(state.config?.supportEmail || "support@example.com")}</a></span><button class="text-button logout-button" id="logoutBtn">Log out ↗</button></div>`;
    $("#dashboardAddFunds").addEventListener("click", openWallet);
    $("#refreshOrders").addEventListener("click", async () => { try { await Promise.all([loadOrders(), loadWallet()]); renderDashboard(); toast("Dashboard refreshed."); } catch (e) { toast(e.message, "error"); } });
    $("#refreshWallet").addEventListener("click", async () => { try { await loadWallet(); renderDashboard(); toast("Wallet refreshed."); } catch (e) { toast(e.message, "error"); } });
    $("#logoutBtn").addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST", body: "{}" }); state.user = null; state.wallet = null; state.orders = []; updateHeader(); renderDashboard(); toast("You have logged out."); });
  }
  function openAccountMenu() {
    modal(`<button class="modal-x" data-modal-close aria-label="Close">×</button><div class="modal-kicker">ACCOUNT</div><h2>${esc(state.user?.name || "Your account")}</h2><p class="modal-sub">${esc(state.user?.email || "")}</p><div class="account-menu-actions"><button class="btn btn-outline btn-full" id="menuWallet">＋ Add funds</button><button class="btn btn-outline btn-full" id="menuDashboard">Open dashboard</button><button class="btn btn-ghost btn-full" id="menuLogout">Log out</button></div>`);
    $("#menuWallet").addEventListener("click", () => { closeModal(); openWallet(); });
    $("#menuDashboard").addEventListener("click", () => { closeModal(); $("#dashboard").scrollIntoView({ behavior: "smooth" }); });
    $("#menuLogout").addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST", body: "{}" }); state.user = null; state.wallet = null; state.orders = []; closeModal(); updateHeader(); renderDashboard(); toast("You have logged out."); });
  }
  function bind() {
    $("#loginBtn").addEventListener("click", () => openAuth("login"));
    $("#signupBtn").addEventListener("click", () => openAuth("signup"));
    $("#heroLogin").addEventListener("click", () => state.user ? $("#dashboard").scrollIntoView({ behavior: "smooth" }) : openAuth("login"));
    $("#ctaSignup").addEventListener("click", () => openAuth("signup"));
    $("#dashboardAuth").addEventListener("click", () => openAuth("login"));
    $("#accountBtn").addEventListener("click", openAccountMenu);
    $("#headerBalance").addEventListener("click", openWallet);
    $("#serviceSearch").addEventListener("input", renderServices);
    $("#categoryFilter").addEventListener("change", renderServices);
    $("#mobileMenu").addEventListener("click", () => document.querySelector(".main-nav").classList.toggle("nav-open"));
    $$(".main-nav a").forEach(a => a.addEventListener("click", () => document.querySelector(".main-nav").classList.remove("nav-open")));
  }
  async function start() {
    bind();
    try { await loadConfig(); } catch (e) { toast(e.message, "error"); }
    await Promise.all([loadServices(), loadAccount()]);
    const hash = location.hash; if (hash === "#dashboard" && !state.user) openAuth("login");
  }
  start();
})();
