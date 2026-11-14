(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const S = { overview: null, services: [], orders: [], users: [], transactions: [], categories: [], tickets: [], tab: "overview", busy: false };
  let ticketPollTimer = null;
  let ticketPollBusy = false;
  let ticketPollErrorShown = false;
  const money = n => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const date = value => { const d = value?.toDate ? value.toDate() : value?.seconds ? new Date(value.seconds * 1000) : value ? new Date(value) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"; };
  async function api(url, options = {}) { const r = await fetch(url, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } }); const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error || `Request failed (${r.status}).`); return data; }
  let timer;
  function toast(msg, kind = "") { const el = $("#adminToast"); el.textContent = msg; el.className = `toast show ${kind}`; clearTimeout(timer); timer = setTimeout(() => el.className = "toast", 3600); }
  function loginScreen() {
    $("#adminApp").innerHTML = `<main class="login-wrap"><div class="login-brand"><span class="brand-mark">M</span><div><b>Mintu Social</b><small>ADMIN WORKSPACE</small></div></div><form id="adminLogin" class="login-card"><div class="admin-kicker">SECURE ACCESS</div><h1>Welcome back.</h1><p>Sign in to manage services, orders, users and wallet activity.</p><label>Admin password<input type="password" name="password" required autocomplete="current-password" autofocus placeholder="Enter admin password"></label><div class="admin-error" id="loginError"></div><button class="admin-primary" type="submit">Open dashboard <span>↗</span></button><a href="/" class="back-link">← Back to website</a></form></main>`;
    $("#adminLogin").addEventListener("submit", async e => { e.preventDefault(); const btn = $("#adminLogin button"); btn.disabled = true; btn.textContent = "Checking…"; try { await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: new FormData(e.currentTarget).get("password") }) }); await startApp(); } catch (err) { $("#loginError").textContent = err.message; btn.disabled = false; btn.textContent = "Open dashboard ↗"; } });
  }
  function shell() {
    $("#adminApp").innerHTML = `<div class="admin-layout"><aside class="sidebar"><a class="admin-logo" href="/"><span class="brand-mark">M</span><span><b>Mintu Social</b><small>CONTROL CENTRE</small></span></a><div class="side-label">WORKSPACE</div><nav class="side-nav"><button data-tab="overview" class="active"><i>▦</i>Overview</button><button data-tab="users"><i>♙</i>Customers</button><button data-tab="wallet"><i>₹</i>Wallet</button><button data-tab="categories"><i>▤</i>Categories</button><button data-tab="services"><i>◈</i>Services & Import <span class="nav-count" id="serviceCount">0</span></button><button data-tab="orders"><i>⇄</i>Orders <span class="nav-count" id="orderCount">0</span></button><button data-tab="tickets"><i>✉</i>Complaints</button><button data-tab="transactions"><i>↗</i>Deposits & Payments</button><button data-tab="settings"><i>⚙</i>Pricing & Settings</button></nav><div class="sidebar-bottom"><div class="admin-status"><i></i><span>Admin session active</span></div><a href="/" target="_blank">↗ Open website</a><button id="adminLogout">Log out <span>→</span></button></div></aside><main class="admin-main"><header class="admin-topbar"><div><span class="admin-kicker">MINTU SOCIAL / ADMIN</span><h1 id="pageTitle">Overview</h1></div><div class="admin-top-actions"><span class="admin-date" id="todayDate"></span><button class="admin-icon-btn" id="refreshAll" title="Refresh data">↻</button><span class="admin-avatar">M</span></div></header><div id="adminContent" class="admin-content"><div class="admin-loading"><span class="loader"></span><p>Loading dashboard data…</p></div></div></main></div>`;
    $$("[data-tab]").forEach(b => b.addEventListener("click", () => go(b.dataset.tab)));
    $("#adminLogout").addEventListener("click", async () => { try { await api("/api/admin/logout", { method: "POST", body: "{}" }); } finally { setTicketPolling(false); loginScreen(); } });
    $("#refreshAll").addEventListener("click", async () => { await refreshData(); renderTab(); toast("Dashboard refreshed."); });
    $("#todayDate").textContent = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  }
  async function refreshData() {
    // Load the small overview first; fetch large tables only when that tab is opened.
    const tab = S.tab;
    const jobs = [api("/api/admin/overview")];
    if (tab === "services") jobs.push(api("/api/admin/services"));
    if (tab === "services") jobs.push(api("/api/admin/categories"));
    if (tab === "orders") jobs.push(api("/api/admin/orders"));
    if (tab === "users") jobs.push(api("/api/admin/users"));
    if (tab === "transactions") jobs.push(api("/api/admin/transactions"));
    if (tab === "categories") jobs.push(api("/api/admin/categories"));
    if (tab === "tickets") jobs.push(api("/api/admin/tickets", { cache: "no-store" }));
    if (tab === "wallet") jobs.push(api("/api/admin/users"));
    const results = await Promise.all(jobs);
    S.overview = results[0];
    if (S.tab !== tab) return;
    if (tab === "services") {
      S.services = results[1].services || [];
      S.categories = results[2].categories || [];
    }
    if (tab === "orders") S.orders = results[1].orders || [];
    if (tab === "users") S.users = results[1].users || [];
    if (tab === "transactions") S.transactions = results[1].transactions || [];
    if (tab === "categories") S.categories = results[1].categories || [];
    if (tab === "tickets") S.tickets = results[1].tickets || [];
    if (tab === "wallet") S.users = results[1].users || [];
    $("#serviceCount").textContent = S.services.length || Number(S.overview?.stats?.services || 0);
    $("#orderCount").textContent = S.orders.length || Number(S.overview?.stats?.orders || 0);
  }
  function go(tab, reload = true) {
    S.tab = tab;
    setTicketPolling(tab === "tickets");
    $$("[data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    $("#pageTitle").textContent = ({ overview: "Overview", categories: "Categories", services: "Services & LuvSMM import", orders: "Order management", users: "Customers", wallet: "Wallet management", tickets: "Complaints & support", transactions: "Deposits & payments", settings: "Pricing & website settings" })[tab] || "Overview";
    renderTab();
    if (reload) refreshData().then(() => { if (S.tab === tab) renderTab(); }).catch(e => toast(e.message, "error"));
  }
  function setTicketPolling(enabled) {
    clearInterval(ticketPollTimer);
    ticketPollTimer = null;
    if (!enabled) return;
    ticketPollTimer = setInterval(async () => {
      if (S.tab !== "tickets" || document.visibilityState === "hidden" || ticketPollBusy) return;
      if ($$(".ticket-reply-form textarea").some(textarea => textarea.value.trim()) || document.activeElement?.closest(".ticket-admin-card")) return;
      ticketPollBusy = true;
      try {
        const previousSignature = ticketSignature(S.tickets);
        await refreshData();
        if (S.tab === "tickets" && previousSignature !== ticketSignature(S.tickets)) renderTab();
        ticketPollErrorShown = false;
      } catch (error) {
        if (!ticketPollErrorShown) toast(`Support messages could not refresh: ${error.message}`, "error");
        ticketPollErrorShown = true;
      } finally {
        ticketPollBusy = false;
      }
    }, 10000);
  }
  function ticketSignature(tickets) {
    return tickets.map(ticket => {
      const messages = ticket.messages || [];
      return `${ticket.id}:${ticket.status}:${ticket.updated_at}:${messages.length}:${messages[messages.length - 1]?.id || ""}`;
    }).join("|");
  }
  function status(s) { const v = String(s || "").toLowerCase(); const cls = v.includes("complete") ? "good" : v.includes("cancel") || v.includes("refund") || v.includes("blocked") || v.includes("reject") ? "bad" : v.includes("review") || v.includes("confirm") || v.includes("pending") ? "warn" : "info"; return `<span class="pill ${cls}">${esc(s || "—")}</span>`; }
  function renderTab() {
    const root = $("#adminContent");
    if (S.tab === "overview") root.innerHTML = overviewHtml();
    if (S.tab === "categories") root.innerHTML = categoriesHtml();
    if (S.tab === "services") root.innerHTML = servicesHtml();
    if (S.tab === "orders") root.innerHTML = ordersHtml();
    if (S.tab === "users") root.innerHTML = usersHtml();
    if (S.tab === "wallet") root.innerHTML = walletHtml();
    if (S.tab === "tickets") root.innerHTML = ticketsHtml();
    if (S.tab === "transactions") root.innerHTML = transactionsHtml();
    if (S.tab === "settings") root.innerHTML = settingsHtml();
    bindTab();
  }
  function overviewHtml() {
    const s = S.overview?.stats || {};
    return `<section class="welcome-row"><div><div class="admin-kicker">YOUR BUSINESS AT A GLANCE</div><h2>Good work starts<br><em>with a clear view.</em></h2><p>Review your store activity, keep the service catalogue up to date and follow customer orders.</p></div><div class="welcome-art"><div class="art-ring"></div><span>MS</span><small>CONTROL<br>YOUR FLOW</small></div></section><section class="metric-grid"><article class="metric-card"><span>Customers</span><b>${Number(s.users || 0).toLocaleString("en-IN")}</b><small>Registered accounts</small><i>♙</i></article><article class="metric-card"><span>Total orders</span><b>${Number(s.orders || 0).toLocaleString("en-IN")}</b><small>${Number(s.completedOrders || 0)} completed · ${Number(s.activeOrders || 0)} active</small><i>⇄</i></article><article class="metric-card"><span>Wallet deposits</span><b>${money(s.totalDeposits)}</b><small>Captured Razorpay payments</small><i>₹</i></article><article class="metric-card"><span>Total revenue</span><b>${money(s.totalSales)}</b><small>Customer order value</small><i>↗</i></article><article class="metric-card"><span>Customer wallet liability</span><b>${money(s.walletLiability)}</b><small>Current customer balances</small><i>◉</i></article><article class="metric-card"><span>Supplier cost</span><b>${money(s.supplierCost)}</b><small>Reported supplier charges</small><i>↗</i></article><article class="metric-card"><span>Approx. profit</span><b>${money(Number(s.totalSales || 0) - Number(s.supplierCost || 0))}</b><small>Sales less recorded supplier cost</small><i>⌁</i></article><article class="metric-card"><span>Pending approvals</span><b>${Number(s.pendingApprovals || 0)}</b><small>Services awaiting review</small><i>◈</i></article><article class="metric-card"><span>Open complaints</span><b>${Number(s.pendingTickets || 0)}</b><small>Tickets not resolved</small><i>✉</i></article></section><section class="overview-grid"><div class="admin-panel"><div class="panel-head"><div><span class="admin-kicker">LATEST ACTIVITY</span><h3>Recent orders</h3></div><button class="admin-link" data-go="orders">View all ↗</button></div>${(S.overview?.recentOrders || []).length ? `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Service</th><th>Amount</th><th>Status</th></tr></thead><tbody>${S.overview.recentOrders.map(o => `<tr><td><b class="mono">${esc(String(o.id).slice(0, 10))}</b><small>${date(o.createdAt)}</small></td><td>${esc(o.serviceName || "—")}</td><td>${money(o.amount)}</td><td>${status(o.status)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-admin">No orders have been placed yet.</div>`}</div><div class="admin-panel quick-panel"><div class="panel-head"><div><span class="admin-kicker">QUICK ACTIONS</span><h3>Keep things moving</h3></div></div><button class="quick-action" data-go="services"><span>↻</span><div><b>Sync supplier services</b><small>Import latest LuvSMM catalogue</small></div><i>→</i></button><button class="quick-action" data-go="orders"><span>⇄</span><div><b>Review customer orders</b><small>Check status and resolve issues</small></div><i>→</i></button><button class="quick-action" data-go="tickets"><span>✉</span><div><b>Reply to complaints</b><small>View customer support conversations</small></div><i>→</i></button><button class="quick-action" data-go="settings"><span>⚙</span><div><b>Configure pricing</b><small>Set exchange rate, margin and deposits</small></div><i>→</i></button><div class="system-note"><i></i><div><b>Server-side secrets</b><p>LuvSMM and Razorpay secret keys stay in Vercel environment variables. They are never sent to the browser.</p></div></div></div></section>`;
  }
  function servicesHtml() {
    const activeCategoryNames = new Set((S.categories || []).filter(category => category.active).map(category => category.name));
    const activeServices = S.services.filter(service => service.active && service.approvalStatus === "approved" && service.complianceVerified && Number(service.sellingPricePer1000 || 0) > 0 && activeCategoryNames.has(service.category));
    const activeIds = new Set(activeServices.map(service => service.id));
    const otherServices = S.services.filter(service => !activeIds.has(service.id));
    const review = S.services.filter(service => !["approved", "rejected"].includes(service.approvalStatus)).length;
    const rejected = S.services.filter(service => service.approvalStatus === "rejected").length;
    const noPrice = S.services.filter(service => Number(service.sellingPricePer1000 || 0) <= 0).length;
    return `<div class="page-toolbar"><div><h2>Services</h2><p>Published services are shown separately. Review or publish the remaining catalogue items below.</p></div><div class="toolbar-actions"><button class="admin-secondary" id="supplierBalance">Supplier balance</button><button class="admin-secondary" id="addManual">＋ Manual service</button><button class="admin-primary" id="syncServices">↻ Import / sync all</button></div></div><div class="inline-summary"><div><b>${S.services.length}</b><span>Total services</span></div><div><b>${activeServices.length}</b><span>Published & active</span></div><div><b>${review}</b><span>Pending review</span></div><div><b>${rejected}</b><span>Rejected</span></div></div><div class="admin-panel service-catalogue-panel"><div class="panel-head"><div><span class="admin-kicker">CUSTOMER VISIBLE CATALOGUE</span><h3>${activeServices.length} active services</h3></div><input class="table-search" id="serviceAdminSearch" placeholder="Search name, category or ID…"></div><div class="table-wrap"><table class="wide-table"><thead><tr><th>Service</th><th>Provider</th><th>Supplier rate</th><th>Selling price</th><th>Review status</th><th>Customer visibility</th><th>Actions</th></tr></thead><tbody id="activeServiceRows">${activeServices.map(service => serviceRow(service, true)).join("") || `<tr><td colspan="7" class="empty-cell">No active services are currently published.</td></tr>`}</tbody></table></div></div><div class="admin-panel service-catalogue-panel service-review-panel"><div class="panel-head"><div><span class="admin-kicker">SERVICE REVIEW & MANAGEMENT</span><h3>${otherServices.length} services to review or manage</h3></div></div><div class="table-wrap"><table class="wide-table"><thead><tr><th>Service</th><th>Provider</th><th>Supplier rate</th><th>Selling price</th><th>Review status</th><th>Customer visibility</th><th>Actions</th></tr></thead><tbody id="serviceRows">${otherServices.map(service => serviceRow(service, false)).join("") || `<tr><td colspan="7" class="empty-cell">All services are currently published.</td></tr>`}</tbody></table></div></div><p class="admin-footnote">New and previously blocked imports remain hidden until you inspect the service details, set a selling price, and approve them. Pausing a published service moves it to the management list. Sync preserves your selling price; changed supplier details send the item back to review.</p>${noPrice ? `<p class="admin-footnote">${noPrice} service(s) currently have no valid retail price. Set a price before approval.</p>` : ""}`;
  }
  function serviceRow(s, isActiveList = false) {
    const supplierRate = s.source === "luvsmm" ? `${esc(s.supplierCurrency || "INR")} ${Number(s.supplierRate || 0).toFixed(4)}` : "—";
    const hasPrice = Number(s.sellingPricePer1000 || 0) > 0;
    const approved = s.approvalStatus === "approved";
    const rejected = s.approvalStatus === "rejected";
    const catalogue = approved ? status("Approved") : rejected ? status("Rejected") : status("Needs review");
    const categoryActive = S.categories.some(category => category.active && category.name === s.category);
    const sale = approved && s.active && s.complianceVerified && hasPrice && categoryActive ? status("Visible") : status("Hidden");
    const publish = approved ? `<button class="table-action" data-toggle-service="${esc(s.id)}" data-active="${s.active ? "1" : "0"}">${s.active ? "Pause" : "Publish"}</button>` : "";
    const rowAttribute = isActiveList ? "data-active-service-row" : "data-service-row";
    return `<tr ${rowAttribute} data-search="${esc(`${s.name} ${s.category} ${s.id} ${s.supplierServiceId || ""} ${s.source || ""}`.toLowerCase())}"><td><b>${esc(s.name)}</b><small>${esc(s.category || "Other")} · ID ${esc(s.supplierServiceId || s.id)}</small></td><td>${s.source === "luvsmm" ? `<span class="provider-tag">LuvSMM</span>` : `<span class="provider-tag manual">Manual</span>`}</td><td>${supplierRate}</td><td><div class="price-edit"><span>₹</span><input type="number" step="0.01" min="0.01" value="${Number(s.sellingPricePer1000 || 0)}" data-price-service="${esc(s.id)}"><small>${s.pricingModel === "fixed" ? "/ order" : "/ 1K"}</small></div></td><td>${catalogue}</td><td>${sale}</td><td><div class="service-actions"><button class="table-action review" data-review-service="${esc(s.id)}">Review</button>${publish}<button class="icon-danger" title="Delete service" data-delete-service="${esc(s.id)}">×</button></div></td></tr>`;
  }
  function ordersHtml() {
    return `<div class="page-toolbar"><div><h2>Orders</h2><p>Monitor supplier dispatch, customer status and refunds. Supplier order status can be batch-synced.</p></div><div class="toolbar-actions"><button class="admin-primary" id="syncOrders">↻ Sync supplier statuses</button></div></div><div class="admin-panel"><div class="panel-head"><div><span class="admin-kicker">ORDER LEDGER</span><h3>All customer orders</h3></div><input class="table-search" id="orderSearch" placeholder="Search order, email, service…"></div><div class="table-wrap"><table class="wide-table"><thead><tr><th>Order / customer</th><th>Service / link</th><th>Quantity</th><th>Amount</th><th>Status</th><th>Update</th></tr></thead><tbody id="orderRows">${S.orders.map(orderRow).join("")}</tbody></table></div></div>`;
  }
  function orderRow(o) {
    const canRefund = !["Completed", "Refunded", "Partially refunded", "Supplier confirmation needed"].includes(o.status) && (o.source !== "luvsmm" || o.supplierReconciled);
    const options = ["Awaiting review", "Pending", "Processing", "In progress", "Completed", "Partial", "Canceled", "Supplier confirmation needed"];
    return `<tr data-order-row data-search="${esc(`${o.id} ${o.userEmail || ""} ${o.serviceName || ""} ${o.link || ""}`.toLowerCase())}"><td><b class="mono">${esc(o.id.slice(0, 12))}</b><small>${esc(o.userEmail || "Customer")}<br>${date(o.createdAt)}${o.adminNote ? `<br>Admin: ${esc(o.adminNote)}` : ""}</small></td><td><b>${esc(o.serviceName || "—")}</b><small class="truncate"><a href="${esc(o.link || "#")}" target="_blank" rel="noopener">${esc(o.link || "—")}</a><br>Supplier: ${esc(o.supplierOrderId || "Manual")}${o.supplierError ? `<br>Supplier error: ${esc(o.supplierError)}` : ""}${o.dispatchNote ? `<br>${esc(o.dispatchNote)}` : ""}</small></td><td>${Number(o.quantity || 0).toLocaleString("en-IN")}<small>Remains: ${Number(o.remains ?? 0).toLocaleString("en-IN")}</small></td><td>${money(o.amount)}</td><td>${status(o.status)}</td><td><div class="order-actions"><select data-order-status="${esc(o.id)}">${options.map(v => `<option ${v === o.status ? "selected" : ""}>${esc(v)}</option>`).join("")}</select><button class="table-action" data-save-order="${esc(o.id)}">Save</button>${o.source === "luvsmm" ? `<label class="supplier-confirm"><input type="checkbox" data-supplier-reconciled="${esc(o.id)}" ${o.supplierReconciled ? "checked" : ""}>Confirmed canceled / reconciled</label>` : ""}${canRefund ? `<button class="table-action refund" data-refund-order="${esc(o.id)}">Refund</button>` : ""}</div></td></tr>`;
  }
  function categoriesHtml() {
    return `<div class="page-toolbar"><div><h2>Service categories</h2><p>Create and organize customer-facing service sections. Deactivate a category to hide it from customers without deleting its services.</p></div></div><section class="admin-panel settings-card"><div class="panel-head"><div><span class="admin-kicker">NEW CATEGORY</span><h3>Add a category</h3></div></div><form id="categoryForm" class="admin-form category-create"><label>Category name<input name="name" required minlength="2" maxlength="80" placeholder="e.g. TikTok"></label><label>Icon / emoji<input name="icon" maxlength="8" value="◈"></label><label>Display order<input name="displayOrder" type="number" value="100"></label><button class="admin-primary" type="submit">Create category ↗</button></form></section><div class="admin-panel category-list"><div class="panel-head"><div><span class="admin-kicker">CATEGORY CONTROL</span><h3>${S.categories.length} categories</h3></div></div><div class="table-wrap"><table><thead><tr><th>Icon</th><th>Name</th><th>Display order</th><th>Status</th><th>Actions</th></tr></thead><tbody>${S.categories.map(c => `<tr data-category-row="${esc(c.id)}"><td><input class="category-icon-input" value="${esc(c.icon || "◈")}" maxlength="8" aria-label="Category icon"></td><td><input class="category-name-input" value="${esc(c.name)}" aria-label="Category name"></td><td><input class="category-order-input" type="number" value="${Number(c.display_order || 0)}" aria-label="Display order"></td><td>${status(c.active ? "Active" : "Inactive")}</td><td><button class="table-action" data-save-category="${esc(c.id)}">Save</button> <button class="table-action" data-toggle-category="${esc(c.id)}" data-active="${c.active ? "1" : "0"}">${c.active ? "Deactivate" : "Activate"}</button> <button class="table-action refund" data-delete-category="${esc(c.id)}">Delete</button></td></tr>`).join("") || `<tr><td colspan="5" class="empty-cell">No categories have been created.</td></tr>`}</tbody></table></div></div>`;
  }
  function userRow(u, showAction = false) {
    const initial = String(u.name || "C").trim().charAt(0).toUpperCase() || "C";
    const avatar = u.avatarUrl ? `<img src="${esc(u.avatarUrl)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : esc(initial);
    const provider = u.authProvider === "google" ? `<span class="provider-tag google-provider">Google</span>` : `<span class="provider-tag manual">Email</span>`;
    return `<tr data-user-row data-search="${esc(`${u.name} ${u.email} ${u.id} ${u.authProvider || "email"}`.toLowerCase())}"><td><div class="customer-cell"><span class="customer-avatar">${avatar}</span><span class="customer-identity"><b>${esc(u.name)}</b><small>${esc(u.email)}</small></span></div></td><td class="mono">${esc(u.id.slice(0, 14))}</td><td>${provider}</td><td><b>${money(u.balance)}</b></td><td>${date(u.createdAt)}</td><td>${u.disabled ? status("Disabled") : status("Active")}</td>${showAction ? `<td><button class="table-action" data-adjust-wallet="${esc(u.id)}" data-user-name="${esc(u.name)}">Adjust wallet</button></td>` : ""}</tr>`;
  }
  function usersHtml() {
    const users = S.users || [];
    return `<div class="page-toolbar"><div><h2>Customers</h2><p>Registered user accounts and current wallet balances.</p></div><div class="toolbar-actions"><span class="summary-label">${users.length} latest customers</span></div></div><div class="admin-panel"><div class="panel-head"><div><span class="admin-kicker">CUSTOMER DIRECTORY</span><h3>Accounts</h3></div><input class="table-search" id="userSearch" placeholder="Search customer or sign-in method…"></div><div class="table-wrap"><table><thead><tr><th>Customer</th><th>Account ID</th><th>Sign-in method</th><th>Wallet balance</th><th>Joined</th><th>Account</th><th>Wallet action</th></tr></thead><tbody id="userRows">${users.map(u => userRow(u, true)).join("") || `<tr><td colspan="7" class="empty-cell">No customer accounts yet.</td></tr>`}</tbody></table></div></div>`;
  }
  function walletHtml() {
    return `<div class="page-toolbar"><div><h2>Wallet management</h2><p>Manual credits and deductions are recorded in the same wallet ledger as payments, orders and refunds.</p></div><button class="admin-secondary" data-go="transactions">View ledger ↗</button></div><div class="admin-panel"><div class="panel-head"><div><span class="admin-kicker">CUSTOMER BALANCES</span><h3>Adjust a wallet</h3></div><input class="table-search" id="userSearch" placeholder="Search customer or sign-in method…"></div><div class="table-wrap"><table><thead><tr><th>Customer</th><th>Account ID</th><th>Sign-in method</th><th>Wallet balance</th><th>Joined</th><th>Account</th><th>Wallet action</th></tr></thead><tbody id="userRows">${(S.users || []).map(u => userRow(u, true)).join("") || `<tr><td colspan="7" class="empty-cell">No customer accounts yet.</td></tr>`}</tbody></table></div></div>`;
  }
  function ticketsHtml() {
    return `<div class="page-toolbar"><div><h2>Complaints & support</h2><p>Review customer conversations, related orders and ticket status.</p></div></div><div class="ticket-admin-list">${(S.tickets || []).map(t => `<article class="admin-panel ticket-admin-card"><div class="panel-head"><div><span class="admin-kicker">${esc(t.user?.email || "Customer")} · ${date(t.created_at)}</span><h3>${esc(t.subject)}</h3><small>${t.order ? `Order: ${esc(t.order.service_name)} · ${esc(t.order.status)}` : "No related order"}</small></div><select data-ticket-status="${esc(t.id)}"><option ${t.status === "Open" ? "selected" : ""}>Open</option><option ${t.status === "In Progress" ? "selected" : ""}>In Progress</option><option ${t.status === "Resolved" ? "selected" : ""}>Resolved</option></select></div><div class="ticket-thread">${(t.messages || []).map(m => `<div class="ticket-message ${m.author_role === "admin" ? "admin-reply" : ""}"><b>${m.author_role === "admin" ? "Admin" : esc(t.user?.name || "Customer")}</b><p>${esc(m.message)}</p><small>${date(m.created_at)}</small></div>`).join("")}</div><form class="ticket-reply-form" data-ticket-reply="${esc(t.id)}"><textarea name="message" rows="2" maxlength="4000" placeholder="Write a reply…" required></textarea><button class="admin-primary" type="submit">Reply</button></form></article>`).join("") || `<div class="admin-panel empty-admin">No complaints have been submitted.</div>`}</div>`;
  }
  function transactionsHtml() {
    return `<div class="page-toolbar"><div><h2>Deposits & payments</h2><p>Razorpay deposits, order deductions, manual wallet changes and refunds in the customer ledger.</p></div></div><div class="admin-panel"><div class="panel-head"><div><span class="admin-kicker">WALLET LEDGER</span><h3>Latest transactions</h3></div><input class="table-search" id="transactionSearch" placeholder="Search type, reference or user…"></div><div class="table-wrap"><table><thead><tr><th>Type / reference</th><th>Customer</th><th>Amount</th><th>Note</th><th>Date</th></tr></thead><tbody id="transactionRows">${S.transactions.map(t => `<tr data-transaction-row data-search="${esc(`${t.type} ${t.reference} ${t.userId} ${t.note}`.toLowerCase())}"><td><b>${esc(t.type || "Entry")}</b><small class="mono">${esc(t.reference || "—")}</small></td><td class="mono">${esc(t.userId || "—")}</td><td class="${Number(t.amount) >= 0 ? "positive" : "negative"}">${Number(t.amount) >= 0 ? "+" : "−"}${money(Math.abs(Number(t.amount)))}</td><td>${esc(t.note || "—")}</td><td>${date(t.createdAt)}</td></tr>`).join("") || `<tr><td colspan="5" class="empty-cell">No transactions yet.</td></tr>`}</tbody></table></div></div>`;
  }
  function settingsHtml() {
    const s = S.overview?.settings || {};
    return `<div class="page-toolbar"><div><h2>Settings</h2><p>Configure website branding, exchange rate, new-service price calculation, customer deposits and support contact.</p></div></div><div class="settings-grid"><section class="admin-panel settings-card"><div class="panel-head"><div><span class="admin-kicker">WEBSITE & PRICING RULES</span><h3>Branding and defaults</h3></div></div><form id="settingsForm" class="admin-form"><label>Website name<input name="siteName" value="${esc(s.siteName || "Mintu Social")}" maxlength="50" required></label><label>USD to INR exchange rate<input type="number" min="1" max="1000" step="0.01" name="usdToInrRate" value="${Number(s.usdToInrRate ?? 83)}" required><small>Applied only to supplier rates reported in USD. INR rates are not converted.</small></label><label>Default margin (%)<input type="number" min="0" max="500" step="0.5" name="markupPercent" value="${Number(s.markupPercent ?? 30)}" required></label><label>Fixed margin per 1,000 (₹)<input type="number" min="0" step="0.01" name="fixedMarginInr" value="${Number(s.fixedMarginInr ?? 0)}" required></label><label>Minimum deposit (₹)<input type="number" min="1" max="50000" step="1" name="minDepositInr" value="${Number(s.minDepositInr ?? 50)}" required></label><label>Support email<input type="email" name="supportEmail" value="${esc(s.supportEmail || "")}" placeholder="support@example.com"><small>Displayed in the customer support area.</small></label><button class="admin-primary" type="submit">Save settings <span>↗</span></button></form></section><section class="admin-panel settings-card"><div class="panel-head"><div><span class="admin-kicker">INTEGRATIONS</span><h3>Connection checklist</h3></div></div><div class="integration-row"><span class="integration-icon">S</span><div><b>Supabase</b><small>PostgreSQL database connection</small></div><span class="connection-state">Server configured</span></div><div class="integration-row"><span class="integration-icon">R</span><div><b>Razorpay</b><small>Payments and wallet recharge</small></div><span class="connection-state">Check /health</span></div><div class="integration-row"><span class="integration-icon">L</span><div><b>LuvSMM API</b><small>Service import and order status</small></div><span class="connection-state">Server secret</span></div><div class="secure-note"><b>Keep API keys private</b><p>Do not put LUVSMM_API_KEY, RAZORPAY_KEY_SECRET or Supabase Secret Key in frontend JavaScript or GitHub. Add them only under Vercel → Settings → Environment Variables.</p></div></section></div>`;
  }
  function bindTab() {
    $$('[data-go]').forEach(b => b.addEventListener("click", () => go(b.dataset.go)));
    $("#syncServices")?.addEventListener("click", async () => { const b = $("#syncServices"); b.disabled = true; b.textContent = "Syncing catalogue…"; try { const r = await api("/api/admin/services/sync", { method: "POST", body: "{}" }); await refreshData(); renderTab(); toast(`Sync complete: ${r.total} services · ${r.added} new · ${r.updated} updated · ${r.unchanged || 0} unchanged · ${r.pendingReview} pending review · ${r.legacyMigrated || 0} legacy rows migrated.`, "success"); } catch (e) { toast(e.message, "error"); b.disabled = false; b.textContent = "↻ Import / sync all"; } });
    $("#supplierBalance")?.addEventListener("click", async () => { const b = $("#supplierBalance"); b.disabled = true; b.textContent = "Checking…"; try { const r = await api("/api/admin/provider/balance"); const value = r.balance?.balance ?? r.balance?.amount ?? "Response received"; toast(`LuvSMM balance: ${value} ${r.balance?.currency || ""}`, "success"); } catch (e) { toast(e.message, "error"); } finally { b.disabled = false; b.textContent = "Supplier balance"; } });
    $("#addManual")?.addEventListener("click", manualServiceModal);
    $("#serviceAdminSearch")?.addEventListener("input", e => { const q = e.target.value.trim().toLowerCase(); $$(`[data-active-service-row], [data-service-row]`).forEach(row => row.hidden = !String(row.dataset.search || "").includes(q)); });
    $("#orderSearch")?.addEventListener("input", e => filterRows("orderRows", "data-order-row", e.target.value));
    $("#userSearch")?.addEventListener("input", e => filterRows("userRows", "data-user-row", e.target.value));
    $("#transactionSearch")?.addEventListener("input", e => filterRows("transactionRows", "data-transaction-row", e.target.value));
    $$('[data-review-service]').forEach(b => b.addEventListener("click", () => openServiceReview(b.dataset.reviewService)));
    $$('[data-adjust-wallet]').forEach(b => b.addEventListener("click", () => walletAdjustmentModal(b.dataset.adjustWallet, b.dataset.userName)));
    $("#categoryForm")?.addEventListener("submit", async e => {
      e.preventDefault(); const form = Object.fromEntries(new FormData(e.currentTarget).entries());
      const b = $("#categoryForm button[type=submit]"); b.disabled = true;
      try { await api("/api/admin/categories", { method: "POST", body: JSON.stringify(form) }); await refreshData(); renderTab(); toast("Category created.", "success"); }
      catch (err) { toast(err.message, "error"); b.disabled = false; }
    });
    $$("[data-save-category]").forEach(b => b.addEventListener("click", async () => {
      const row = b.closest("tr"); b.disabled = true;
      try {
        await api(`/api/admin/categories/${encodeURIComponent(b.dataset.saveCategory)}`, { method: "PATCH", body: JSON.stringify({
          name: $(".category-name-input", row).value, icon: $(".category-icon-input", row).value,
          displayOrder: Number($(".category-order-input", row).value)
        }) });
        await refreshData(); renderTab(); toast("Category saved.", "success");
      } catch (e) { toast(e.message, "error"); b.disabled = false; }
    }));
    $$("[data-toggle-category]").forEach(b => b.addEventListener("click", async () => {
      b.disabled = true;
      try { await api(`/api/admin/categories/${encodeURIComponent(b.dataset.toggleCategory)}`, { method: "PATCH", body: JSON.stringify({ active: b.dataset.active !== "1" }) }); await refreshData(); renderTab(); toast("Category visibility updated."); }
      catch (e) { toast(e.message, "error"); b.disabled = false; }
    }));
    $$("[data-delete-category]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm("Delete this empty category? Categories with assigned services cannot be deleted.")) return;
      b.disabled = true;
      try { await api(`/api/admin/categories/${encodeURIComponent(b.dataset.deleteCategory)}`, { method: "DELETE" }); await refreshData(); renderTab(); toast("Category deleted."); }
      catch (e) { toast(e.message, "error"); b.disabled = false; }
    }));
    $$("[data-ticket-status]").forEach(select => select.addEventListener("change", async () => {
      select.disabled = true;
      try { await api(`/api/admin/tickets/${encodeURIComponent(select.dataset.ticketStatus)}`, { method: "PATCH", body: JSON.stringify({ status: select.value }) }); await refreshData(); renderTab(); toast("Ticket status updated."); }
      catch (e) { toast(e.message, "error"); select.disabled = false; }
    }));
    $$("[data-ticket-reply]").forEach(formEl => formEl.addEventListener("submit", async e => {
      e.preventDefault(); const form = new FormData(formEl); const button = $("button", formEl); button.disabled = true;
      try { await api(`/api/admin/tickets/${encodeURIComponent(formEl.dataset.ticketReply)}/reply`, { method: "POST", body: JSON.stringify({ message: form.get("message") }) }); await refreshData(); renderTab(); toast("Reply sent.", "success"); }
      catch (err) { toast(err.message, "error"); button.disabled = false; }
    }));
    $$('[data-toggle-service]').forEach(b => b.addEventListener("click", async () => { b.disabled = true; try { await api(`/api/admin/services/${encodeURIComponent(b.dataset.toggleService)}`, { method: "PATCH", body: JSON.stringify({ active: b.dataset.active !== "1" }) }); await refreshData(); renderTab(); toast("Service updated.", "success"); } catch (e) { toast(e.message, "error"); b.disabled = false; } }));
    $$('[data-price-service]').forEach(input => input.addEventListener("change", async () => { input.disabled = true; try { const price = Number(input.value); await api(`/api/admin/services/${encodeURIComponent(input.dataset.priceService)}`, { method: "PATCH", body: JSON.stringify({ sellingPricePer1000: price }) }); const item = S.services.find(service => service.id === input.dataset.priceService); if (item) item.sellingPricePer1000 = price; toast("Selling price saved.", "success"); } catch (e) { toast(e.message, "error"); } finally { input.disabled = false; } }));
    $$('[data-delete-service]').forEach(b => b.addEventListener("click", async () => { if (!confirm("Delete this service from your catalogue? Existing orders are not deleted.")) return; try { await api(`/api/admin/services/${encodeURIComponent(b.dataset.deleteService)}`, { method: "DELETE" }); await refreshData(); renderTab(); toast("Service deleted."); } catch (e) { toast(e.message, "error"); } }));
    $("#syncOrders")?.addEventListener("click", async () => { const b = $("#syncOrders"); b.disabled = true; b.textContent = "Checking supplier…"; try { const r = await api("/api/admin/orders/sync", { method: "POST", body: "{}" }); await refreshData(); renderTab(); toast(`Checked ${r.checked} orders; updated ${r.updated}.`, "success"); } catch (e) { toast(e.message, "error"); b.disabled = false; b.textContent = "↻ Sync supplier statuses"; } });
    $$('[data-save-order]').forEach(b => b.addEventListener("click", async () => { const select = $(`[data-order-status="${CSS.escape(b.dataset.saveOrder)}"]`); const reconciled = $(`[data-supplier-reconciled="${CSS.escape(b.dataset.saveOrder)}"]`); b.disabled = true; try { await api(`/api/admin/orders/${encodeURIComponent(b.dataset.saveOrder)}`, { method: "PATCH", body: JSON.stringify({ status: select.value, supplierReconciled: Boolean(reconciled?.checked) }) }); await refreshData(); renderTab(); toast("Order status updated.", "success"); } catch (e) { toast(e.message, "error"); b.disabled = false; } }));
    $$('[data-refund-order]').forEach(b => b.addEventListener("click", async () => { if (!confirm("Refund this order amount to the customer's internal wallet? Ensure the supplier side has already been cancelled/reconciled.")) return; b.disabled = true; try { await api(`/api/admin/orders/${encodeURIComponent(b.dataset.refundOrder)}/refund`, { method: "POST", body: JSON.stringify({ note: "Refunded by admin" }) }); await refreshData(); renderTab(); toast("Wallet refund completed.", "success"); } catch (e) { toast(e.message, "error"); b.disabled = false; } }));
    $("#settingsForm")?.addEventListener("submit", async e => { e.preventDefault(); const form = new FormData(e.currentTarget); const b = $("#settingsForm button"); b.disabled = true; try { await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ siteName: form.get("siteName"), markupPercent: Number(form.get("markupPercent")), usdToInrRate: Number(form.get("usdToInrRate")), fixedMarginInr: Number(form.get("fixedMarginInr")), minDepositInr: Number(form.get("minDepositInr")), supportEmail: form.get("supportEmail") }) }); await refreshData(); renderTab(); toast("Settings saved.", "success"); } catch (err) { toast(err.message, "error"); } finally { b.disabled = false; } });
  }
  function openServiceReview(id) {
    const s = S.services.find(item => item.id === id);
    if (!s) return toast("Service details are not available. Refresh the dashboard.", "error");
    const activeCategories = S.categories.filter(category => category.active);
    const selectedCategory = activeCategories.some(category => category.name === s.category) ? s.category : "";
    const supplierRate = s.source === "luvsmm" ? `${s.supplierCurrency || "INR"} ${Number(s.supplierRate || 0).toFixed(4)}` : "Manual service";
    const isApproved = s.approvalStatus === "approved";
    const overlay = document.createElement("div");
    overlay.className = "admin-modal-backdrop";
    overlay.innerHTML = `<form class="admin-modal review-modal" id="serviceReviewForm"><button type="button" class="admin-modal-x" data-dismiss>×</button><div class="admin-kicker">SERVICE REVIEW & EDIT</div><h2>${esc(s.name)}</h2><p>Inspect supplier details, edit the selling information and manually approve or reject this service.</p><div class="review-details"><div><small>Supplier rate</small><b>${esc(supplierRate)}</b></div><div><small>Supplier service ID</small><b>${esc(s.supplierServiceId || s.id)}</b></div><div><small>Provider type</small><b>${esc(s.supplierType || "Default")}</b></div><div><small>Refill / Cancel</small><b>${s.refill ? "Refill" : "No refill"} / ${s.cancel ? "Cancel" : "No cancel"}</b></div><div><small>Current status</small><b>${esc(s.approvalStatus || "needs_review")}</b></div></div><label>Service name<input name="name" required minlength="3" maxlength="180" value="${esc(s.name)}"></label><label>Category<select name="category" required><option value="" disabled ${selectedCategory ? "" : "selected"}>Choose an active category</option>${activeCategories.map(category => `<option value="${esc(category.name)}" ${category.name === selectedCategory ? "selected" : ""}>${esc(category.name)}</option>`).join("")}</select></label><label>Description<textarea name="description" rows="3" maxlength="500">${esc(s.description || "")}</textarea></label><div class="two-fields"><label>Minimum quantity<input name="min" type="number" min="1" value="${Number(s.min || 1)}" required></label><label>Maximum quantity<input name="max" type="number" min="1" value="${Number(s.max || 10000)}" required></label></div><label>Price (₹ / ${s.pricingModel === "fixed" ? "order" : "1,000"})<input name="sellingPricePer1000" type="number" min="0.01" step="0.01" value="${Number(s.sellingPricePer1000 || 0)}" required></label><label>Delivery / processing details<textarea name="processingDetails" rows="2" maxlength="500">${esc(s.processingDetails || "")}</textarea></label><label>Fulfillment method<select name="fulfillmentMethod"><option value="manual" ${s.fulfillmentMethod !== "supplier" ? "selected" : ""}>Manual</option><option value="supplier" ${s.fulfillmentMethod === "supplier" ? "selected" : ""}>LuvSMM supplier</option></select></label><label>Supplier service ID<input name="supplierServiceId" maxlength="120" value="${esc(s.supplierServiceId || "")}" placeholder="Required for supplier fulfillment"></label><label>Admin review note<textarea name="reviewNote" rows="2" placeholder="Optional note about this decision">${esc(s.reviewNote || "")}</textarea></label><label class="review-confirm"><input type="checkbox" name="adminReviewed" required><span>I personally checked the service name, description, supplier details and customer price before making this decision.</span></label><div class="review-actions"><button type="button" class="admin-secondary reject-review" id="rejectReviewedService">Reject & hide</button><button type="submit" class="admin-primary">${isApproved ? "Save & approve" : "Approve & publish"} ↗</button></div><div class="admin-error" id="serviceReviewError"></div></form>`;
    document.body.append(overlay);
    overlay.addEventListener("click", e => { if (e.target === overlay || e.target.closest("[data-dismiss]")) overlay.remove(); });
    const form = $("#serviceReviewForm", overlay);
    const confirmChecked = () => form.elements.adminReviewed.checked;
    const saveDecision = async approvalStatus => {
      if (!confirmChecked()) { $("#serviceReviewError", overlay).textContent = "Tick the review confirmation after checking the details."; return; }
      if (approvalStatus === "approved" && !activeCategories.some(category => category.name === form.elements.category.value)) {
        $("#serviceReviewError", overlay).textContent = "Create and activate a category before approving this service.";
        return;
      }
      const note = form.elements.reviewNote.value.trim();
      const fields = Object.fromEntries(new FormData(form).entries());
      const buttons = $$('button', form); buttons.forEach(button => button.disabled = true);
      try {
        await api(`/api/admin/services/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({
          approvalStatus, adminReviewed: true, complianceVerified: approvalStatus === "approved", active: approvalStatus === "approved",
          reviewNote: note, name: fields.name, category: fields.category, description: fields.description,
          min: Number(fields.min), max: Number(fields.max), processingDetails: fields.processingDetails,
          fulfillmentMethod: fields.fulfillmentMethod, supplierServiceId: fields.supplierServiceId,
          sellingPricePer1000: Number(fields.sellingPricePer1000)
        }) });
        overlay.remove(); await refreshData(); renderTab();
        toast(approvalStatus === "approved" ? "Service approved and published." : "Service rejected and hidden from customers.", "success");
      } catch (e) { $("#serviceReviewError", overlay).textContent = e.message; buttons.forEach(button => button.disabled = false); }
    };
    $("#rejectReviewedService", overlay).addEventListener("click", () => saveDecision("rejected"));
    form.addEventListener("submit", e => { e.preventDefault(); saveDecision("approved"); });
  }
  function filterRows(rootId, selector, query) { const q = query.trim().toLowerCase(); $$(`#${rootId} [${selector}]`).forEach(row => row.hidden = !String(row.dataset.search || "").includes(q)); }
  function manualServiceModal() {
    const overlay = document.createElement("div"); overlay.className = "admin-modal-backdrop";     overlay.innerHTML = `<form class="admin-modal" id="manualServiceForm"><button type="button" class="admin-modal-x" data-dismiss>×</button><div class="admin-kicker">CREATE CATALOGUE ITEM</div><h2>Create a custom service</h2><p>Manual services enter your admin fulfilment queue. Add a supplier ID only when this service should be sent to LuvSMM.</p><label>Service name<input name="name" required minlength="3" placeholder="e.g. Social media strategy consultation"></label><label>Category<select name="category" required><option value="" disabled selected>Choose an active category</option>${S.categories.filter(category => category.active).map(category => `<option value="${esc(category.name)}">${esc(category.name)}</option>`).join("")}</select></label><label>Description<textarea name="description" rows="3" placeholder="Explain what the customer receives"></textarea></label><label>Delivery / processing details<textarea name="processingDetails" rows="2" placeholder="Expected delivery time or fulfillment notes"></textarea></label><label>Fulfillment method<select name="fulfillmentMethod" id="manualFulfillment"><option value="manual">Manual fulfillment</option><option value="supplier">LuvSMM supplier</option></select></label><label id="manualSupplierField" hidden>Supplier service ID<input name="supplierServiceId" placeholder="LuvSMM service ID"></label><label>Pricing model<select name="pricingModel" id="manualPricingModel"><option value="fixed">Fixed price per order</option><option value="per1000">Price per 1,000 units</option></select></label><label>Price (₹)<input name="sellingPricePer1000" type="number" min="0.01" step="0.01" value="100" required></label><div class="two-fields manual-quantity-fields" hidden><label>Minimum quantity<input name="min" type="number" min="1" value="1"></label><label>Maximum quantity<input name="max" type="number" min="1" value="100"></label></div><div class="admin-error" id="manualError"></div><button class="admin-primary" type="submit">Create service ↗</button></form>`;
    document.body.append(overlay); overlay.addEventListener("click", e => { if (e.target === overlay || e.target.closest("[data-dismiss]")) overlay.remove(); });
    $("#manualPricingModel", overlay).addEventListener("change", e => { $(".manual-quantity-fields", overlay).hidden = e.target.value === "fixed"; });
    $("#manualFulfillment", overlay).addEventListener("change", e => { $("#manualSupplierField", overlay).hidden = e.target.value !== "supplier"; });
    $("#manualServiceForm", overlay).addEventListener("submit", async e => { e.preventDefault(); const form = new FormData(e.currentTarget); const b = $("#manualServiceForm button[type=submit]"); b.disabled = true; try { await api("/api/admin/services/manual", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) }); overlay.remove(); await refreshData(); renderTab(); toast("Manual service created. Review it before publishing.", "success"); } catch (err) { $("#manualError").textContent = err.message; b.disabled = false; } });
  }
  function walletAdjustmentModal(userId, userName) {
    const overlay = document.createElement("div"); overlay.className = "admin-modal-backdrop";
    overlay.innerHTML = `<form class="admin-modal" id="walletAdjustmentForm"><button type="button" class="admin-modal-x" data-dismiss>×</button><div class="admin-kicker">WALLET LEDGER</div><h2>Adjust ${esc(userName || "customer")}’s wallet</h2><p>Every adjustment is saved as a ledger transaction with the admin action and reason.</p><label>Action<select name="direction"><option value="add">Add funds</option><option value="deduct">Deduct funds</option></select></label><label>Amount (₹)<input name="amount" type="number" min="0.01" max="1000000" step="0.01" required></label><label>Reason<input name="reason" minlength="3" maxlength="300" required placeholder="e.g. Goodwill credit"></label><div class="admin-error" id="adjustmentError"></div><button class="admin-primary" type="submit">Save wallet adjustment ↗</button></form>`;
    document.body.append(overlay); overlay.addEventListener("click", e => { if (e.target === overlay || e.target.closest("[data-dismiss]")) overlay.remove(); });
    $("#walletAdjustmentForm", overlay).addEventListener("submit", async e => {
      e.preventDefault(); const form = new FormData(e.currentTarget); const button = $("button[type=submit]", e.currentTarget); button.disabled = true;
      const amount = Number(form.get("amount")) * (form.get("direction") === "deduct" ? -1 : 1);
      try { await api(`/api/admin/users/${encodeURIComponent(userId)}/wallet-adjustment`, { method: "POST", body: JSON.stringify({ amount, reason: form.get("reason") }) }); overlay.remove(); await refreshData(); renderTab(); toast("Wallet updated and recorded in the ledger.", "success"); }
      catch (err) { $("#adjustmentError", overlay).textContent = err.message; button.disabled = false; }
    });
  }
  async function startApp() {
    shell();
    try { S.tab = "overview"; await refreshData(); go("overview", false); }
    catch (e) { $("#adminContent").innerHTML = `<div class="admin-panel error-panel"><h3>Could not load admin data</h3><p>${esc(e.message)}</p><button class="admin-primary" id="retryLoad">Retry</button></div>`; $("#retryLoad").addEventListener("click", startApp); }
  }
  async function init() {
    try { const me = await api("/api/admin/me"); if (me.authenticated) await startApp(); else loginScreen(); }
    catch { loginScreen(); }
  }
  init();
})();
