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
    $("#loginBtn").hidden = logged; $("#signupBtn").hidden = logged; $("#accountBtn").hidden = !logged; $("#navLogout").hidden = !logged;
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
    if (state.config.minDepositInr) $("#catalogFootnote").textContent = `Prices are shown in INR. Minimum wallet deposit is ${money(state.config.minDepositInr)}. Check service limits before ordering.`;
    $("#year").textContent = new Date().getFullYear();
  }
  async function loadServices() {
    try {
      const [data, categoryData] = await Promise.all([api("/api/services"), api("/api/categories")]);
      state.services = data.services || []; state.categories = categoryData.categories || [];
      const cats = [...new Set(state.services.map(s => s.category).filter(Boolean))].sort();
      $("#categoryFilter").innerHTML = `<option value="all">All categories</option>${cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}`;
      renderCategories();
      renderServices();
    } catch (e) { $("#serviceGrid").innerHTML = `<div class="empty-state wide"><b>Could not load services</b><p>${esc(e.message)}</p><button class="btn btn-outline" id="retryServices">Try again</button></div>`; $("#retryServices")?.addEventListener("click", loadServices); }
  }
  function renderCategories() {
    const root = $("#popularCategories");
    const available = state.categories.filter(c => state.services.some(s => s.category === c.name));
    if (!available.length) { root.innerHTML = ""; return; }
    root.innerHTML = `<button class="category-chip ${$("#categoryFilter").value === "all" ? "active" : ""}" data-category-chip="all">All services</button>${available.map(c => `<button class="category-chip ${$("#categoryFilter").value === c.name ? "active" : ""}" data-category-chip="${esc(c.name)}"><span>${esc(c.icon || "◈")}</span>${esc(c.name)}</button>`).join("")}`;
    $$("[data-category-chip]").forEach(button => button.addEventListener("click", () => {
      $("#categoryFilter").value = button.dataset.categoryChip;
      renderCategories(); renderServices();
    }));
  }
  function renderServices() {
    const q = $("#serviceSearch").value.trim().toLowerCase();
    const category = $("#categoryFilter").value;
    const items = state.services.filter(s => (category === "all" || s.category === category) && (!q || `${s.name} ${s.category} ${s.description}`.toLowerCase().includes(q)));
    if (!items.length) {
      $("#serviceGrid").innerHTML = `<div class="empty-state wide"><div class="empty-symbol">✦</div><b>${state.services.length ? "No matching services" : "Services are being prepared"}</b><p>${state.services.length ? "Try a different search or category." : "The catalogue is empty. Import services from your admin panel to get started."}</p></div>`;
      return;
    }
    const icons = ["◈", "✦", "↗", "⌘", "◎", "◇"];
    $("#serviceGrid").innerHTML = items.map((s, i) => `<article class="service-card"><div class="service-card-top"><span class="service-icon">${icons[i % icons.length]}</span><span class="service-category">${esc(s.category)}</span></div><h3>${esc(s.name)}</h3><p>${esc(s.description || "Professional digital marketing support with order tracking.")}</p><div class="service-meta"><span>Min ${Number(s.min).toLocaleString("en-IN")}</span><span>Max ${Number(s.max).toLocaleString("en-IN")}</span></div><div class="service-card-bottom"><div><b>${money(s.pricePer1000)}</b><small>${s.pricingModel === "fixed" ? "per order" : "per 1,000 units"}</small></div><button class="btn btn-small btn-primary" data-order-service="${esc(s.id)}">View service <span>↗</span></button></div></article>`).join("");
    $$('[data-order-service]').forEach(b => b.addEventListener("click", () => openOrder(b.dataset.orderService)));
  }
  function openAuth(mode = "login") {
    modal(`<button class="modal-x" data-modal-close aria-label="Close">×</button><div class="modal-kicker">YOUR WORKSPACE</div><h2>${mode === "signup" ? "Create your account" : "Welcome back"}</h2><p class="modal-sub">${mode === "signup" ? "Set up your account to manage orders and wallet payments." : "Log in to see your balance and recent orders."}</p><div class="auth-tabs"><button class="${mode === "login" ? "active" : ""}" data-auth-tab="login">Log in</button><button class="${mode === "signup" ? "active" : ""}" data-auth-tab="signup">Create account</button></div>${state.config?.googleAuthEnabled ? `<a class="google-signin btn btn-outline btn-full" href="/api/auth/google"><span class="google-mark">G</span> Continue with Google</a><div class="auth-divider"><span>or use email</span></div>` : ""}<form id="authForm" class="modal-form">${mode === "signup" ? `<label>Full name<input name="name" autocomplete="name" required maxlength="60" placeholder="Your name"></label>` : ""}<label>Email address<input name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label><label>Password<input name="password" type="password" required minlength="8" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" placeholder="At least 8 characters"></label><div class="form-error" id="authError"></div><button class="btn btn-primary btn-full" type="submit">${mode === "signup" ? "Create account" : "Log in"} <span>↗</span></button></form><p class="fine-print">By continuing, you agree to use services lawfully and follow the relevant platform terms.</p>`);
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
      if (state.user) await Promise.all([loadWallet(), loadOrders(), loadTickets()]); else { state.wallet = null; state.orders = []; state.tickets = []; }
      updateHeader(); renderDashboard(); renderSupport();
    } catch { state.user = null; updateHeader(); renderDashboard(); }
  }
  async function loadWallet() { const w = await api("/api/wallet"); state.wallet = w; state.user.balance = w.balance; updateHeader(); }
  async function loadOrders() { const d = await api("/api/orders"); state.orders = d.orders || []; }
  async function loadTickets() { const d = await api("/api/tickets"); state.tickets = d.tickets || []; }
  function openWallet() {
    if (!state.user) return openAuth("login");
    const minDeposit = Number(state.config?.minDepositInr || 50);
    const quickAmounts = [100, 200, 500, 1000].filter(amount => amount >= minDeposit);
    modal(`<button class="modal-x" data-modal-close aria-label="Close">×</button><div class="modal-kicker">ADD FUNDS</div><h2>Top up your wallet</h2><p class="modal-sub">Add funds securely with Razorpay. Minimum ${money(minDeposit)}, maximum ₹50,000 per recharge.</p><div class="balance-highlight"><small>Current available balance</small><b>${money(state.user.balance)}</b></div><form id="walletForm" class="modal-form"><label>Recharge amount (INR)<input name="amount" type="number" min="${minDeposit}" max="50000" step="1" value="${Math.max(200, minDeposit)}" required></label><div class="quick-amounts">${quickAmounts.map(amount => `<button type="button" data-amount="${amount}">${money(amount)}</button>`).join("")}</div><div class="form-error" id="walletError"></div><button class="btn btn-primary btn-full" type="submit">Continue to secure payment <span>↗</span></button></form><p class="fine-print">Wallet balance is credited only after the server verifies a captured payment.</p>`);
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
    modal(`<button class="modal-x" data-modal-close aria-label="Close">×</button><div class="modal-kicker">NEW ORDER</div><h2>${esc(service.name)}</h2><p class="modal-sub">${esc(service.description || "Review the details and submit your request.")}</p>${service.processingDetails ? `<div class="service-processing"><b>Delivery details</b><p>${esc(service.processingDetails)}</p></div>` : ""}<div class="order-summary"><div><small>${service.pricingModel === "fixed" ? "Fixed price" : "Price per 1,000"}</small><b>${money(service.pricePer1000)}</b></div><div><small>${service.pricingModel === "fixed" ? "Order quantity" : "Allowed quantity"}</small><b>${service.pricingModel === "fixed" ? "1 order" : `${Number(service.min).toLocaleString("en-IN")} – ${Number(service.max).toLocaleString("en-IN")}`}</b></div></div><form id="orderForm" class="modal-form"><label>Target URL<input name="link" type="url" placeholder="https://…" required></label>${service.pricingModel === "fixed" ? `<input type="hidden" name="quantity" value="1">` : `<label>Quantity<input name="quantity" type="number" min="${service.min}" max="${service.max}" step="1" value="${service.min}" required></label>`}<div class="order-total"><span>Estimated total</span><b id="orderTotal">${money(service.pricingModel === "fixed" ? service.pricePer1000 : Math.max(1, service.min * service.pricePer1000 / 1000))}</b></div><div class="wallet-line"><span>Wallet balance</span><b>${money(state.user.balance)}</b></div><div class="form-error" id="orderError"></div><button class="btn btn-primary btn-full" type="submit">Place order <span>↗</span></button></form><p class="fine-print">Submitting an order confirms that you own or are authorised to manage the target account/page.</p>`);
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
    if (!state.user) {
      root.className = "dashboard-placeholder";
      root.innerHTML = `<div class="placeholder-icon">⌘</div><div><b>Your dashboard will appear here</b><p>Log in or create an account to manage your wallet and orders.</p></div>`;
      $("#dashboardAuth").hidden = false; $("#dashboardAuth").textContent = "Log in to continue";
      return;
    }
    $("#dashboardAuth").hidden = true;
    const orders = state.orders;
    const txs = state.wallet?.transactions || [];
    const completed = orders.filter(order => String(order.status).toLowerCase() === "completed").length;
    const avatar = state.user.avatarUrl ? `<img src="${esc(state.user.avatarUrl)}" alt="" referrerpolicy="no-referrer">` : esc((state.user.name || "M").charAt(0).toUpperCase());
    root.className = "dashboard-live";
    root.innerHTML = `<div class="account-overview"><div class="account-welcome"><span class="profile-avatar">${avatar}</span><div><span class="mini-label">PROFILE</span><h3>${esc(state.user.name)}</h3><p>${esc(state.user.email)}</p></div></div><div class="wallet-panel"><span>WALLET BALANCE</span><b>${money(state.user.balance)}</b><button class="btn btn-primary btn-small" id="dashboardAddFunds">＋ Add funds</button></div><div class="account-stats"><div><small>Total orders</small><b>${orders.length}</b></div><div><small>Completed orders</small><b>${completed}</b></div></div></div><div class="dashboard-columns"><section class="dash-panel" id="orderHistory"><div class="dash-panel-head"><div><span class="mini-label">ORDER HISTORY</span><h3>Recent orders</h3></div><button class="text-button" id="refreshOrders">↻ Refresh</button></div>${orders.length ? `<div class="data-list">${orders.map(o => `<div class="data-row"><div class="data-row-main"><b>${esc(o.serviceName || "Service order")}</b><small>${esc(o.id)} · ${date(o.createdAt)} · Qty ${Number(o.quantity || 0).toLocaleString("en-IN")}</small></div><div class="data-row-side"><b>${money(o.amount)}</b><span class="status-tag ${statusClass(o.status)}">${esc(o.status)}</span></div></div>`).join("")}</div>` : `<div class="small-empty">No orders yet. Browse services to place your first request.</div>`}</section><section class="dash-panel"><div class="dash-panel-head"><div><span class="mini-label">WALLET LEDGER</span><h3>Transactions</h3></div><button class="text-button" id="refreshWallet">↻ Refresh</button></div>${txs.length ? `<div class="data-list">${txs.map(t => `<div class="data-row"><div class="data-row-main"><b>${esc(t.note || t.type || "Transaction")}</b><small>${date(t.createdAt)} · ${esc(t.reference || "")}</small></div><div class="data-row-side"><b class="${Number(t.amount) >= 0 ? "amount-plus" : ""}">${Number(t.amount) >= 0 ? "+" : "−"}${money(Math.abs(Number(t.amount)))}</b><span class="txn-type">${esc(t.type || "entry")}</span></div></div>`).join("")}</div>` : `<div class="small-empty">Your wallet transactions will appear here.</div>`}</section></div><div class="dashboard-bottom"><span>Need help? <a href="mailto:${esc(state.config?.supportEmail || "support@example.com")}">${esc(state.config?.supportEmail || "Contact support")}</a></span><button class="text-button logout-button" id="logoutBtn">Log out ↗</button></div>`;
    $("#dashboardAddFunds").addEventListener("click", openWallet);
    $("#refreshOrders").addEventListener("click", async () => { try { await Promise.all([loadOrders(), loadWallet()]); renderDashboard(); toast("Dashboard refreshed."); } catch (e) { toast(e.message, "error"); } });
    $("#refreshWallet").addEventListener("click", async () => { try { await loadWallet(); renderDashboard(); toast("Wallet refreshed."); } catch (e) { toast(e.message, "error"); } });
    $("#logoutBtn").addEventListener("click", logout);
  }
  function renderSupport() {
    const root = $("#supportContent");
    if (!state.user) { root.innerHTML = `<p>Sign in to contact support and view your conversations.</p><button class="btn btn-outline" id="supportLogin">Log in</button>`; $("#supportLogin").addEventListener("click", () => openAuth("login")); return; }
    root.innerHTML = state.tickets.length ? `<div class="customer-ticket-list">${state.tickets.map(ticket => `<article class="customer-ticket"><div class="ticket-heading"><div><span class="mini-label">${esc(ticket.id.slice(0, 8))} · ${date(ticket.updated_at)}</span><h3>${esc(ticket.subject)}</h3></div><span class="status-tag ${statusClass(ticket.status)}">${esc(ticket.status)}</span></div><div class="ticket-thread">${(ticket.messages || []).map(message => `<div class="ticket-message ${message.author_role === "admin" ? "admin-reply" : ""}"><b>${message.author_role === "admin" ? "Support team" : "You"}</b><p>${esc(message.message)}</p><small>${date(message.created_at)}</small></div>`).join("")}</div>${ticket.status !== "Resolved" ? `<form class="customer-ticket-reply" data-customer-ticket-reply="${esc(ticket.id)}"><textarea name="message" rows="2" maxlength="4000" placeholder="Write a reply…" required></textarea><button class="btn btn-outline btn-small" type="submit">Reply</button></form>` : ""}</article>`).join("")}</div>` : `<p>No complaints yet. Raise a complaint if you need help with an order or payment.</p>`;
    $$("[data-customer-ticket-reply]").forEach(form => form.addEventListener("submit", async e => {
      e.preventDefault(); const message = new FormData(form).get("message"); const button = $("button", form); button.disabled = true;
      try { await api(`/api/tickets/${encodeURIComponent(form.dataset.customerTicketReply)}/reply`, { method: "POST", body: JSON.stringify({ message }) }); await loadTickets(); renderSupport(); toast("Your reply was sent.", "success"); }
      catch (err) { toast(err.message, "error"); button.disabled = false; }
    }));
  }
  function openTicket() {
    if (!state.user) return openAuth("login");
    modal(`<button class="modal-x" data-modal-close aria-label="Close">×</button><div class="modal-kicker">CUSTOMER SUPPORT</div><h2>Raise a complaint</h2><p class="modal-sub">Share the issue and select an order if it is related.</p><form id="ticketForm" class="modal-form"><label>Subject<input name="subject" required minlength="3" maxlength="160" placeholder="Payment or order issue"></label><label>Related order<select name="orderId"><option value="">Not related to a specific order</option>${state.orders.map(order => `<option value="${esc(order.id)}">${esc(order.id.slice(0, 12))} · ${esc(order.serviceName)} · ${esc(order.status)}</option>`).join("")}</select></label><label>Complaint details<textarea name="message" rows="5" required minlength="5" maxlength="4000" placeholder="Explain what happened and how we can help"></textarea></label><div class="form-error" id="ticketError"></div><button class="btn btn-primary btn-full" type="submit">Submit complaint</button></form>`);
    $("#ticketForm").addEventListener("submit", async e => {
      e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget).entries()); const button = $("button[type=submit]", e.currentTarget); button.disabled = true;
      try { await api("/api/tickets", { method: "POST", body: JSON.stringify(data) }); closeModal(); await loadTickets(); renderSupport(); toast("Complaint submitted.", "success"); $("#support").scrollIntoView({ behavior: "smooth" }); }
      catch (err) { $("#ticketError").textContent = err.message; button.disabled = false; }
    });
  }
  async function logout() {
    try { await api("/api/auth/logout", { method: "POST", body: "{}" }); }
    catch (e) { return toast(e.message, "error"); }
    state.user = null; state.wallet = null; state.orders = []; state.tickets = [];
    updateHeader(); renderDashboard(); renderSupport(); toast("You have logged out.");
  }
  function openAccountMenu() {
    modal(`<button class="modal-x" data-modal-close aria-label="Close">×</button><div class="modal-kicker">ACCOUNT</div><h2>${esc(state.user?.name || "Your account")}</h2><p class="modal-sub">${esc(state.user?.email || "")}</p><div class="account-menu-actions"><button class="btn btn-outline btn-full" id="menuWallet">＋ Add funds</button><button class="btn btn-outline btn-full" id="menuDashboard">Open dashboard</button><button class="btn btn-ghost btn-full" id="menuLogout">Log out</button></div>`);
    $("#menuWallet").addEventListener("click", () => { closeModal(); openWallet(); });
    $("#menuDashboard").addEventListener("click", () => { closeModal(); $("#dashboard").scrollIntoView({ behavior: "smooth" }); });
    $("#menuLogout").addEventListener("click", async () => { closeModal(); await logout(); });
  }
  function bind() {
    $("#loginBtn").addEventListener("click", () => openAuth("login"));
    $("#signupBtn").addEventListener("click", () => openAuth("signup"));
    $("#heroLogin").addEventListener("click", () => state.user ? $("#dashboard").scrollIntoView({ behavior: "smooth" }) : openAuth("login"));
    $("#ctaSignup").addEventListener("click", () => openAuth("signup"));
    $("#dashboardAuth").addEventListener("click", () => openAuth("login"));
    $("#accountBtn").addEventListener("click", openAccountMenu);
    $("#headerBalance").addEventListener("click", openWallet);
    $("#raiseTicket").addEventListener("click", openTicket);
    $("#navLogout").addEventListener("click", logout);
    $("[data-nav-wallet]").addEventListener("click", e => {
      if (!state.user) { e.preventDefault(); openAuth("login"); }
      else { e.preventDefault(); openWallet(); }
    });
    $("[data-nav-profile]").addEventListener("click", e => {
      if (!state.user) { e.preventDefault(); openAuth("login"); }
      else { e.preventDefault(); $("#dashboard").scrollIntoView({ behavior: "smooth" }); }
    });
    $("[data-nav-orders]").addEventListener("click", e => {
      e.preventDefault();
      if (!state.user) return openAuth("login");
      $("#orderHistory").scrollIntoView({ behavior: "smooth" });
    });
    $("#serviceSearch").addEventListener("input", renderServices);
    $("#categoryFilter").addEventListener("change", () => { renderCategories(); renderServices(); });
    $("#mobileMenu").addEventListener("click", () => document.querySelector(".main-nav").classList.toggle("nav-open"));
    $$(".main-nav a").forEach(a => a.addEventListener("click", () => document.querySelector(".main-nav").classList.remove("nav-open")));
    $(".main-nav").addEventListener("click", e => { if (e.target.matches("button")) document.querySelector(".main-nav").classList.remove("nav-open"); });
  }
  async function start() {
    bind();
    try { await loadConfig(); } catch (e) { toast(e.message, "error"); }
    await Promise.all([loadServices(), loadAccount()]);
    const params = new URLSearchParams(location.search);
    if (params.get("oauth") === "success") { toast("Google sign-in successful.", "success"); history.replaceState(null, "", location.pathname); }
    if (params.has("oauth_error")) { toast("Google sign-in could not be completed. Try again or use email and password.", "error"); history.replaceState(null, "", location.pathname); }
    const hash = location.hash; if (hash === "#dashboard" && !state.user) openAuth("login");
  }
  start();
})();
