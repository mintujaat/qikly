(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const state = { config: null, user: null, services: [], categories: [], wallet: null, orders: [], tickets: [], selectedService: null, activeCategory: "all" };
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
    if (logged) {
      const avatar = String(state.user.avatarUrl || "");
      $("#accountBtn").innerHTML = /^https:\/\//.test(avatar) ? `<img src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">` : esc((state.user.name || "M").charAt(0).toUpperCase());
      $("#headerBalance").textContent = money(state.user.balance);
    } else { $("#headerBalance").textContent = ""; $("#accountBtn").textContent = "M"; }
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
      const [data, groups] = await Promise.all([api("/api/services"), api("/api/categories")]);
      state.services = data.services || []; state.categories = groups.categories || [];
      renderCategoryPills(); renderServices();
    } catch (e) { $("#serviceGrid").innerHTML = `<div class="empty-state wide"><b>Could not load services</b><p>${esc(e.message)}</p><button class="btn btn-outline" id="retryServices">Try again</button></div>`; $("#retryServices")?.addEventListener("click", loadServices); }
  }
  function categoryGlyph(name) {
    const key = String(name || "").toLowerCase();
    if (key.includes("instagram")) return "◎";
    if (key.includes("youtube")) return "▶";
    if (key.includes("telegram")) return "➤";
    if (key.includes("facebook")) return "f";
    if (key === "x" || key.includes("twitter")) return "𝕏";
    return "◈";
  }
  function renderCategoryPills() {
    const names = ["all", ...state.categories.map(c => c.name)];
    if (!names.includes(state.activeCategory)) state.activeCategory = "all";
    $("#categoryPills").innerHTML = names.map(name => `<button class="category-pill ${state.activeCategory === name ? "active" : ""}" data-category="${esc(name)}">${name === "all" ? "All services" : `<span class="category-glyph">${categoryGlyph(name)}</span> ${esc(name)}`}</button>`).join("");
    $$('[data-category]').forEach(button => button.addEventListener("click", () => { state.activeCategory = button.dataset.category; renderCategoryPills(); renderServices(); }));
  }
  function renderServices() {
    const q = $("#serviceSearch").value.trim().toLowerCase();
    const category = state.activeCategory;
    const items = state.services.filter(s => (category === "all" || s.category === category) && (!q || `${s.name} ${s.category} ${s.description}`.toLowerCase().includes(q)));
    if (!items.length) {
      $("#serviceGrid").innerHTML = `<div class="empty-state wide"><div class="empty-symbol">✦</div><b>${state.services.length ? "No matching services" : "Services are being prepared"}</b><p>${state.services.length ? "Choose another platform or change your search." : "The catalogue is empty. Admin can import or create services."}</p></div>`;
      return;
    }
    $("#serviceGrid").innerHTML = items.map(s => `<article class="service-card"><div class="service-card-top"><span class="service-icon">${categoryGlyph(s.category)}</span><span class="service-category">${esc(s.category)}</span></div><h3>${esc(s.name)}</h3><p>${esc(s.description || "Service order with live status tracking.")}</p><div class="service-meta"><span>Min ${Number(s.min).toLocaleString("en-IN")}</span><span>Max ${Number(s.max).toLocaleString("en-IN")}</span><span>${s.refill ? "Refill" : "No refill"}</span></div><div class="service-card-bottom"><div><b>${money(s.pricePer1000)}</b><small>${s.pricingModel === "fixed" ? "per order" : "per 1,000"}</small></div><button class="btn btn-small btn-primary" data-order-service="${esc(s.id)}">Order now <span>↗</span></button></div></article>`).join("");
    $$('[data-order-service]').forEach(b => b.addEventListener("click", () => openOrder(b.dataset.orderService)));
  }
  function initGoogleButton() {
    const target = $("#googleSignIn");
    if (!target) return;
    if (!state.config?.googleClientId) {
      target.innerHTML = '<p class="google-unavailable">Google Sign-In setup pending. Add GOOGLE_CLIENT_ID in Vercel.</p>';
      return;
    }
    const render = () => {
      if (!window.google?.accounts?.id || !$("#googleSignIn")) {
        if (tries >= 40 && $("#googleSignIn")) $("#googleSignIn").innerHTML = '<p class="google-unavailable">Google sign-in could not load. Check the network and reload.</p>';
        return;
      }
      window.google.accounts.id.initialize({ client_id: state.config.googleClientId, callback: async response => {
        const error = $("#authError");
        try { await api("/api/auth/google", { method: "POST", body: JSON.stringify({ credential: response.credential }) }); closeModal(); await loadAccount(); toast("Google sign-in successful.", "success"); }
        catch (e) { if (error) error.textContent = e.message; }
      } });
      window.google.accounts.id.renderButton(target, { theme: "outline", size: "large", shape: "rectangular", text: "continue_with", width: Math.min(340, target.clientWidth || 340) });
    };
    let tries = 0; const timer = setInterval(() => { tries++; if (window.google?.accounts?.id || tries >= 40) { clearInterval(timer); render(); } }, 250);
  }
  function openAuth(mode = "login") {
    modal(`<button class="modal-x" data-modal-close aria-label="Close">×</button><div class="modal-kicker">YOUR WORKSPACE</div><h2>${mode === "signup" ? "Create your account" : "Welcome back"}</h2><p class="modal-sub">${mode === "signup" ? "Set up your account to manage orders and wallet payments." : "Log in to see your balance and recent orders."}</p><div class="auth-tabs"><button class="${mode === "login" ? "active" : ""}" data-auth-tab="login">Log in</button><button class="${mode === "signup" ? "active" : ""}" data-auth-tab="signup">Create account</button></div><form id="authForm" class="modal-form">${mode === "signup" ? `<label>Full name<input name="name" autocomplete="name" required maxlength="60" placeholder="Your name"></label>` : ""}<label>Email address<input name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label><label>Password<input name="password" type="password" required minlength="8" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" placeholder="At least 8 characters"></label><div class="form-error" id="authError"></div><button class="btn btn-primary btn-full" type="submit">${mode === "signup" ? "Create account" : "Log in"} <span>↗</span></button></form><div class="auth-divider"><span>OR</span></div><div id="googleSignIn" class="google-signin"></div><p class="fine-print">By continuing, you agree to use services lawfully and follow the relevant platform terms.</p>`);
    $$('[data-auth-tab]').forEach(b => b.addEventListener("click", () => openAuth(b.dataset.authTab)));
    $("#authForm").addEventListener("submit", async e => {
      e.preventDefault(); const form = new FormData(e.currentTarget); const btn = $("#authForm button[type=submit]"); btn.disabled = true; btn.textContent = "Please wait…";
      try {
        const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
        await api(endpoint, { method: "POST", body: JSON.stringify({ name: form.get("name"), email: form.get("email"), password: form.get("password") }) });
        closeModal(); await loadAccount(); toast(mode === "signup" ? "Account created." : "You are logged in.", "success");
      } catch (err) { $("#authError").textContent = err.message; btn.disabled = false; btn.textContent = mode === "signup" ? "Create account ↗" : "Log in ↗"; }
    });
    initGoogleButton();
  }
  async function loadAccount() {
    try {
      const auth = await api("/api/auth/me"); state.user = auth.authenticated ? auth.user : null;
      if (state.user) await Promise.all([loadWallet(), loadOrders(), loadTickets()]); else { state.wallet = null; state.orders = []; state.tickets = []; }
      updateHeader(); renderDashboard();
    } catch { state.user = null; updateHeader(); renderDashboard(); }
  }
  async function loadWallet() { const w = await api("/api/wallet"); state.wallet = w; state.user.balance = w.balance; updateHeader(); }
  async function loadOrders() { const d = await api("/api/orders"); state.orders = d.orders || []; }
  async function loadTickets() { const d = await api("/api/tickets"); state.tickets = d.tickets || []; }
  function openWallet() {
    if (!state.user) return openAuth("login");
    modal(`<button class="modal-x" data-modal-close aria-label="Close">×</button><div class="modal-kicker">ADD FUNDS</div><h2>Top up your wallet</h2><p class="modal-sub">Add funds securely with Razorpay. Minimum ${money(state.config?.minDeposit || 50)}, maximum ${money(state.config?.maxDeposit || 50000)} per recharge.</p><div class="balance-highlight"><small>Current available balance</small><b>${money(state.user.balance)}</b></div><form id="walletForm" class="modal-form"><label>Recharge amount (INR)<input name="amount" type="number" min="${Number(state.config?.minDeposit || 50)}" max="${Number(state.config?.maxDeposit || 50000)}" step="1" value="${Math.max(200, Number(state.config?.minDeposit || 50))}" required></label><div class="quick-amounts"><button type="button" data-amount="100">₹100</button><button type="button" data-amount="200">₹200</button><button type="button" data-amount="500">₹500</button><button type="button" data-amount="1000">₹1,000</button></div><div class="form-error" id="walletError"></div><button class="btn btn-primary btn-full" type="submit">Continue to secure payment <span>↗</span></button></form><p class="fine-print">Wallet balance is credited only after the server verifies a captured payment.</p>`);
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
    const orders = state.orders, txs = (state.wallet?.transactions || []).slice(0, 6), tickets = state.tickets.slice(0, 6);
    root.className = "dashboard-live";
    root.innerHTML = `<div class="account-overview"><div class="account-welcome"><span class="mini-label">SIGNED IN AS</span><h3>${esc(state.user.name)}</h3><p>${esc(state.user.email)}</p></div><div class="wallet-panel"><span>AVAILABLE BALANCE</span><b>${money(state.user.balance)}</b><button class="btn btn-primary btn-small" id="dashboardAddFunds">＋ Add funds</button></div><div class="account-stats"><div><small>Total orders</small><b>${state.orders.length}</b></div><div><small>Support tickets</small><b>${state.tickets.length}</b></div></div></div><div class="dashboard-columns"><section class="dash-panel"><div class="dash-panel-head"><div><span class="mini-label">ORDER HISTORY</span><h3>Your orders</h3></div><button class="text-button" id="refreshOrders">↻ Refresh</button></div>${orders.length ? `<div class="data-list">${orders.map(o => `<div class="data-row"><div class="data-row-main"><b>${esc(o.serviceName || "Service order")}</b><small>${esc(o.id.slice(0, 14))} · ${date(o.createdAt)}</small></div><div class="data-row-side"><b>${money(o.amount)}</b><span class="status-tag ${statusClass(o.status)}">${esc(o.status)}</span></div></div>`).join("")}</div>` : `<div class="small-empty">No orders yet. Browse services to place your first request.</div>`}</section><section class="dash-panel"><div class="dash-panel-head"><div><span class="mini-label">WALLET</span><h3>Transactions</h3></div><button class="text-button" id="refreshWallet">↻ Refresh</button></div>${txs.length ? `<div class="data-list">${txs.map(t => `<div class="data-row"><div class="data-row-main"><b>${esc(t.note || t.type || "Transaction")}</b><small>${date(t.createdAt)}</small></div><div class="data-row-side"><b class="${Number(t.amount) >= 0 ? "amount-plus" : ""}">${Number(t.amount) >= 0 ? "+" : "−"}${money(Math.abs(Number(t.amount)))}</b><span class="txn-type">${esc(t.type || "entry")}</span></div></div>`).join("")}</div>` : `<div class="small-empty">Your wallet transactions will appear here.</div>`}</section></div><section class="dash-panel ticket-panel"><div class="dash-panel-head"><div><span class="mini-label">HELP CENTRE</span><h3>Complaints & replies</h3></div><button class="btn btn-primary btn-small" id="dashboardRaiseComplaint">＋ Raise complaint</button></div>${tickets.length ? `<div class="data-list">${tickets.map(t => `<button class="ticket-row" data-ticket-id="${esc(t.id)}"><span><b>${esc(t.subject)}</b><small>${date(t.updated_at)}</small></span><span class="ticket-status">${esc(t.status)}</span></button>`).join("")}</div>` : `<div class="small-empty">No complaints yet. Raise a ticket when you need support.</div>`}</section><div class="dashboard-bottom"><span>Need help? Contact <a href="mailto:${esc(state.config?.supportEmail || "support@example.com")}">${esc(state.config?.supportEmail || "support@example.com")}</a></span><button class="text-button logout-button" id="logoutBtn">Log out ↗</button></div>`;
    $("#dashboardAddFunds").addEventListener("click", openWallet);
    $("#dashboardRaiseComplaint").addEventListener("click", openComplaint);
    $$('[data-ticket-id]').forEach(b => b.addEventListener("click", () => openTicket(b.dataset.ticketId)));
    $("#refreshOrders").addEventListener("click", async () => { try { await Promise.all([loadOrders(), loadWallet()]); renderDashboard(); toast("Dashboard refreshed."); } catch (e) { toast(e.message, "error"); } });
    $("#refreshWallet").addEventListener("click", async () => { try { await loadWallet(); renderDashboard(); toast("Wallet refreshed."); } catch (e) { toast(e.message, "error"); } });
    $("#logoutBtn").addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST", body: "{}" }); state.user = null; state.wallet = null; state.orders = []; state.tickets = []; updateHeader(); renderDashboard(); toast("You have logged out."); });
  }
  function openComplaint() {
    if (!state.user) return openAuth("login");
    modal(`<button class="modal-x" data-modal-close aria-label="Close">×</button><div class="modal-kicker">CUSTOMER SUPPORT</div><h2>Raise a complaint</h2><p class="modal-sub">Our admin team can reply to your ticket here.</p><form class="modal-form" id="ticketForm"><label>Subject<input name="subject" required minlength="3" maxlength="140" placeholder="Order issue / payment issue"></label><label>Message<textarea name="message" rows="4" required minlength="3" maxlength="4000" placeholder="Explain your issue..."></textarea></label><div class="form-error" id="ticketError"></div><button class="btn btn-primary btn-full" type="submit">Submit complaint</button></form>`);
    $("#ticketForm").addEventListener("submit", async e => { e.preventDefault(); const form = new FormData(e.currentTarget), button = $("#ticketForm button[type=submit]"); button.disabled = true; try { const result = await api("/api/tickets", { method: "POST", body: JSON.stringify({ subject: form.get("subject"), message: form.get("message") }) }); closeModal(); await loadTickets(); renderDashboard(); toast(`Complaint ${result.ticket.id.slice(0,8)} created.`, "success"); $("#dashboard").scrollIntoView({behavior:"smooth"}); } catch (err) { $("#ticketError").textContent = err.message; button.disabled = false; } });
  }
  async function openTicket(id) {
    if (!state.user) return openAuth("login");
    try {
      const data = await api(`/api/tickets/${encodeURIComponent(id)}`);
      const thread = data.messages.map(m => `<div class="thread-message ${m.sender_type === "admin" ? "from-admin" : "from-customer"}"><small>${m.sender_type === "admin" ? "Support team" : "You"} · ${date(m.created_at)}</small><p>${esc(m.body)}</p></div>`).join("");
      modal(`<button class="modal-x" data-modal-close aria-label="Close">×</button><div class="modal-kicker">SUPPORT TICKET · ${esc(data.ticket.status)}</div><h2>${esc(data.ticket.subject)}</h2><div class="ticket-thread">${thread || "<p>No messages yet.</p>"}</div><form class="modal-form" id="ticketReplyForm"><label>Reply<textarea name="message" rows="3" required maxlength="4000" placeholder="Write a reply..."></textarea></label><div class="form-error" id="ticketReplyError"></div><button class="btn btn-primary btn-full" type="submit">Send reply</button></form>`);
      $("#ticketReplyForm").addEventListener("submit", async e => { e.preventDefault(); const message = new FormData(e.currentTarget).get("message"), button = $("#ticketReplyForm button"); button.disabled = true; try { await api(`/api/tickets/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify({ message }) }); closeModal(); await loadTickets(); renderDashboard(); toast("Reply sent.", "success"); } catch (err) { $("#ticketReplyError").textContent = err.message; button.disabled = false; } });
    } catch (e) { toast(e.message, "error"); }
  }
  function openAccountMenu() {
    modal(`<button class="modal-x" data-modal-close aria-label="Close">×</button><div class="modal-kicker">ACCOUNT</div><h2>${esc(state.user?.name || "Your account")}</h2><p class="modal-sub">${esc(state.user?.email || "")}</p><div class="account-menu-actions"><button class="btn btn-outline btn-full" id="menuWallet">＋ Add funds</button><button class="btn btn-outline btn-full" id="menuDashboard">Order history</button><button class="btn btn-outline btn-full" id="menuComplaint">Raise a complaint</button><button class="btn btn-ghost btn-full" id="menuLogout">Log out</button></div>`);
    $("#menuWallet").addEventListener("click", () => { closeModal(); openWallet(); });
    $("#menuDashboard").addEventListener("click", () => { closeModal(); $("#dashboard").scrollIntoView({ behavior: "smooth" }); });
    $("#menuComplaint").addEventListener("click", () => { closeModal(); openComplaint(); });
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
    $("#navAddFunds").addEventListener("click", e => { e.preventDefault(); state.user ? openWallet() : openAuth("login"); });
    $("#navComplaints").addEventListener("click", e => { e.preventDefault(); openComplaint(); });
    $("#raiseComplaintBtn").addEventListener("click", openComplaint);
    $("#serviceSearch").addEventListener("input", renderServices);
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
