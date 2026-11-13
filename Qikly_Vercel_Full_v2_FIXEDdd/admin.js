(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const S = { overview: null, services: [], orders: [], users: [], transactions: [], categories: [], tickets: [], tab: "overview", busy: false };
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
    $("#adminApp").innerHTML = `<div class="admin-layout"><aside class="sidebar"><a class="admin-logo" href="/"><span class="brand-mark">M</span><span><b>Mintu Social</b><small>CONTROL CENTRE</small></span></a><div class="side-label">WORKSPACE</div><nav class="side-nav"><button data-tab="overview" class="active"><i>▦</i>Overview</button><button data-tab="services"><i>◈</i>Services <span class="nav-count" id="serviceCount">0</span></button><button data-tab="categories"><i>▦</i>Groups</button><button data-tab="orders"><i>⇄</i>Orders <span class="nav-count" id="orderCount">0</span></button><button data-tab="tickets"><i>✉</i>Complaints</button><button data-tab="users"><i>♙</i>Customers</button><button data-tab="transactions"><i>↗</i>Transactions</button><button data-tab="settings"><i>⚙</i>Settings</button></nav><div class="sidebar-bottom"><div class="admin-status"><i></i><span>Admin session active</span></div><a href="/" target="_blank">↗ Open website</a><button id="adminLogout">Log out <span>→</span></button></div></aside><main class="admin-main"><header class="admin-topbar"><div><span class="admin-kicker">MINTU SOCIAL / ADMIN</span><h1 id="pageTitle">Overview</h1></div><div class="admin-top-actions"><span class="admin-date" id="todayDate"></span><button class="admin-icon-btn" id="refreshAll" title="Refresh data">↻</button><span class="admin-avatar">M</span></div></header><div id="adminContent" class="admin-content"><div class="admin-loading"><span class="loader"></span><p>Loading dashboard data…</p></div></div></main></div>`;
    $$("[data-tab]").forEach(b => b.addEventListener("click", () => go(b.dataset.tab)));
    $("#adminLogout").addEventListener("click", async () => { try { await api("/api/admin/logout", { method: "POST", body: "{}" }); } finally { loginScreen(); } });
    $("#refreshAll").addEventListener("click", async () => { await refreshData(); renderTab(); toast("Dashboard refreshed."); });
    $("#todayDate").textContent = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  }
  async function refreshData() {
    // Load the small overview first; fetch large tables only when that tab is opened.
    const tab = S.tab;
    const jobs = [api("/api/admin/overview")];
    if (tab === "services") { jobs.push(api("/api/admin/services")); jobs.push(api("/api/admin/categories")); }
    if (tab === "categories") { jobs.push(api("/api/admin/categories")); jobs.push(api("/api/admin/services")); }
    if (tab === "tickets") jobs.push(api("/api/admin/tickets"));
    if (tab === "orders") jobs.push(api("/api/admin/orders"));
    if (tab === "users") jobs.push(api("/api/admin/users"));
    if (tab === "transactions") jobs.push(api("/api/admin/transactions"));
    const results = await Promise.all(jobs);
    S.overview = results[0];
    if (S.tab !== tab) return;
    if (tab === "services") { S.services = results[1].services || []; S.categories = results[2].categories || []; }
    if (tab === "categories") { S.categories = results[1].categories || []; S.services = results[2].services || []; }
    if (tab === "tickets") S.tickets = results[1].tickets || [];
    if (tab === "orders") S.orders = results[1].orders || [];
    if (tab === "users") S.users = results[1].users || [];
    if (tab === "transactions") S.transactions = results[1].transactions || [];
    $("#serviceCount").textContent = S.services.length || Number(S.overview?.stats?.services || 0);
    $("#orderCount").textContent = S.orders.length || Number(S.overview?.stats?.orders || 0);
  }
  function go(tab, reload = true) {
    S.tab = tab;
    $$("[data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    $("#pageTitle").textContent = ({ overview: "Overview", services: "Service catalogue", categories: "Service groups", tickets: "Customer complaints", orders: "Order management", users: "Customers", transactions: "Transactions", settings: "Settings" })[tab] || "Overview";
    renderTab();
    if (reload) refreshData().then(() => { if (S.tab === tab) renderTab(); }).catch(e => toast(e.message, "error"));
  }
  function status(s) { const v = String(s || "").toLowerCase(); const cls = v.includes("complete") ? "good" : v.includes("cancel") || v.includes("refund") || v.includes("blocked") || v.includes("reject") ? "bad" : v.includes("review") || v.includes("confirm") || v.includes("pending") ? "warn" : "info"; return `<span class="pill ${cls}">${esc(s || "—")}</span>`; }
  function renderTab() {
    const root = $("#adminContent");
    if (S.tab === "overview") root.innerHTML = overviewHtml();
    if (S.tab === "services") root.innerHTML = servicesHtml();
    if (S.tab === "categories") root.innerHTML = categoriesHtml();
    if (S.tab === "tickets") root.innerHTML = ticketsHtml();
    if (S.tab === "orders") root.innerHTML = ordersHtml();
    if (S.tab === "users") root.innerHTML = usersHtml();
    if (S.tab === "transactions") root.innerHTML = transactionsHtml();
    if (S.tab === "settings") root.innerHTML = settingsHtml();
    bindTab();
  }
  function overviewHtml() {
    const s = S.overview?.stats || {};
    return `<section class="welcome-row"><div><div class="admin-kicker">YOUR BUSINESS AT A GLANCE</div><h2>Good work starts<br><em>with a clear view.</em></h2><p>Review your store activity, keep the service catalogue up to date and follow customer orders.</p></div><div class="welcome-art"><div class="art-ring"></div><span>MS</span><small>CONTROL<br>YOUR FLOW</small></div></section><section class="metric-grid"><article class="metric-card"><span>Customers</span><b>${Number(s.users || 0).toLocaleString("en-IN")}</b><small>Registered accounts</small><i>♙</i></article><article class="metric-card"><span>Catalogue services</span><b>${Number(s.services || 0).toLocaleString("en-IN")}</b><small>${Number(s.approvedServices || 0)} approved for sale</small><i>◈</i></article><article class="metric-card"><span>Total orders</span><b>${Number(s.orders || 0).toLocaleString("en-IN")}</b><small>${Number(s.activeOrders || 0)} currently active</small><i>⇄</i></article><article class="metric-card"><span>Wallet deposits</span><b>${money(s.totalDeposits)}</b><small>Captured Razorpay payments</small><i>₹</i></article></section><section class="overview-grid"><div class="admin-panel"><div class="panel-head"><div><span class="admin-kicker">LATEST ACTIVITY</span><h3>Recent orders</h3></div><button class="admin-link" data-go="orders">View all ↗</button></div>${(S.overview?.recentOrders || []).length ? `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Service</th><th>Amount</th><th>Status</th></tr></thead><tbody>${S.overview.recentOrders.map(o => `<tr><td><b class="mono">${esc(String(o.id).slice(0, 10))}</b><small>${date(o.createdAt)}</small></td><td>${esc(o.serviceName || "—")}</td><td>${money(o.amount)}</td><td>${status(o.status)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-admin">No orders have been placed yet.</div>`}</div><div class="admin-panel quick-panel"><div class="panel-head"><div><span class="admin-kicker">QUICK ACTIONS</span><h3>Keep things moving</h3></div></div><button class="quick-action" data-go="services"><span>↻</span><div><b>Sync supplier services</b><small>Import latest LuvSMM catalogue</small></div><i>→</i></button><button class="quick-action" data-go="orders"><span>⇄</span><div><b>Review customer orders</b><small>Check status and resolve issues</small></div><i>→</i></button><button class="quick-action" data-go="settings"><span>⚙</span><div><b>Configure selling margin</b><small>Set default catalogue markup</small></div><i>→</i></button><div class="system-note"><i></i><div><b>Server-side secrets</b><p>LuvSMM and Razorpay secret keys stay in Vercel environment variables. They are never sent to the browser.</p></div></div></div></section>`;
  }
  function servicesHtml() {
    const active = S.services.filter(s => s.active && s.approvalStatus === "approved").length;
    const review = S.services.filter(s => !["approved", "rejected"].includes(s.approvalStatus)).length;
    const rejected = S.services.filter(s => s.approvalStatus === "rejected").length;
    const noPrice = S.services.filter(s => Number(s.sellingPricePer1000 || 0) <= 0).length;
    return `<div class="page-toolbar"><div><h2>Services</h2><p>Import the LuvSMM catalogue, inspect every new service and manually approve the ones you want to publish.</p></div><div class="toolbar-actions"><button class="admin-secondary" id="supplierBalance">Supplier balance</button><button class="admin-secondary" id="addManual">＋ Manual service</button><button class="admin-primary" id="syncServices">↻ Import / sync all</button></div></div><div class="inline-summary"><div><b>${S.services.length}</b><span>Total services</span></div><div><b>${active}</b><span>Published</span></div><div><b>${review}</b><span>Pending review</span></div><div><b>${rejected}</b><span>Rejected</span></div></div><div class="admin-panel"><div class="panel-head"><div><span class="admin-kicker">MANUAL MODERATION</span><h3>Supplier and manual catalogue</h3></div><input class="table-search" id="serviceAdminSearch" placeholder="Search name, category or ID…"></div><div class="table-wrap"><table class="wide-table"><thead><tr><th>Service</th><th>Provider</th><th>Supplier rate</th><th>Selling price</th><th>Review status</th><th>Customer visibility</th><th>Actions</th></tr></thead><tbody id="serviceRows">${S.services.map(serviceRow).join("")}</tbody></table></div></div><p class="admin-footnote">New and previously blocked imports are moved to Pending review. They remain hidden from customers until you inspect the service details, set a selling price, and approve them. Sync preserves your selling price; changed supplier details send the item back to review.</p>${noPrice ? `<p class="admin-footnote">${noPrice} service(s) currently have no valid retail price. Set a price before approval.</p>` : ""}`;
  }
  function serviceRow(s) {
    const supplierRate = s.source === "luvsmm" ? `${esc(s.supplierCurrency || "INR")} ${Number(s.supplierRate || 0).toFixed(4)}` : "—";
    const hasPrice = Number(s.sellingPricePer1000 || 0) > 0;
    const approved = s.approvalStatus === "approved";
    const rejected = s.approvalStatus === "rejected";
    const catalogue = approved ? status("Approved") : rejected ? status("Rejected") : status("Needs review");
    const sale = approved && s.active && hasPrice ? status("Visible") : status("Hidden");
    const publish = approved ? `<button class="table-action" data-toggle-service="${esc(s.id)}" data-active="${s.active ? "1" : "0"}">${s.active ? "Pause" : "Publish"}</button>` : "";
    return `<tr data-service-row data-search="${esc(`${s.name} ${s.category} ${s.id} ${s.supplierServiceId || ""}`.toLowerCase())}"><td><b>${esc(s.name)}</b><small>${esc(s.category || "Other")} · ID ${esc(s.supplierServiceId || s.id)}</small></td><td>${s.source === "luvsmm" ? `<span class="provider-tag">LuvSMM</span>` : `<span class="provider-tag manual">Manual</span>`}</td><td>${supplierRate}</td><td><div class="price-edit"><span>₹</span><input type="number" step="0.01" min="0.01" value="${Number(s.sellingPricePer1000 || 0)}" data-price-service="${esc(s.id)}"><small>${s.pricingModel === "fixed" ? "/ order" : "/ 1K"}</small></div></td><td>${catalogue}</td><td>${sale}</td><td><div class="service-actions"><button class="table-action review" data-review-service="${esc(s.id)}">Review</button>${publish}<button class="icon-danger" title="Delete service" data-delete-service="${esc(s.id)}">×</button></div></td></tr>`;
  }
  function ordersHtml() {
    return `<div class="page-toolbar"><div><h2>Orders</h2><p>Monitor supplier dispatch, customer status and refunds. Supplier order status can be batch-synced.</p></div><div class="toolbar-actions"><button class="admin-primary" id="syncOrders">↻ Sync supplier statuses</button></div></div><div class="admin-panel"><div class="panel-head"><div><span class="admin-kicker">ORDER LEDGER</span><h3>All customer orders</h3></div><input class="table-search" id="orderSearch" placeholder="Search order, email, service…"></div><div class="table-wrap"><table class="wide-table"><thead><tr><th>Order / customer</th><th>Service / link</th><th>Quantity</th><th>Amount</th><th>Status</th><th>Update</th></tr></thead><tbody id="orderRows">${S.orders.map(orderRow).join("")}</tbody></table></div></div>`;
  }
  function orderRow(o) {
    const canRefund = !["Completed", "Refunded", "Partially refunded", "Supplier confirmation needed"].includes(o.status);
    const options = ["Awaiting review", "Submitting", "Pending", "Processing", "In progress", "Completed", "Partial", "Canceled", "Supplier confirmation needed"];
    return `<tr data-order-row data-search="${esc(`${o.id} ${o.userEmail || ""} ${o.serviceName || ""} ${o.link || ""}`.toLowerCase())}"><td><b class="mono">${esc(o.id.slice(0, 12))}</b><small>${esc(o.userEmail || "Customer")}<br>${date(o.createdAt)}</small></td><td><b>${esc(o.serviceName || "—")}</b><small class="truncate"><a href="${esc(o.link || "#")}" target="_blank" rel="noopener">${esc(o.link || "—")}</a><br>Supplier: ${esc(o.supplierOrderId || "Manual")}</small></td><td>${Number(o.quantity || 0).toLocaleString("en-IN")}<small>Remains: ${Number(o.remains ?? 0).toLocaleString("en-IN")}</small></td><td>${money(o.amount)}</td><td>${status(o.status)}</td><td><div class="order-actions"><select data-order-status="${esc(o.id)}">${options.map(v => `<option ${v === o.status ? "selected" : ""}>${esc(v)}</option>`).join("")}</select><button class="table-action" data-save-order="${esc(o.id)}">Save</button>${canRefund ? `<button class="table-action refund" data-refund-order="${esc(o.id)}">Refund</button>` : ""}</div></td></tr>`;
  }
  function usersHtml() {
    const users = S.users || [];
    return `<div class="page-toolbar"><div><h2>Customers</h2><p>Registered user accounts and current wallet balances.</p></div><div class="toolbar-actions"><span class="summary-label">${users.length} latest customers</span></div></div><div class="admin-panel"><div class="panel-head"><div><span class="admin-kicker">CUSTOMER DIRECTORY</span><h3>Accounts</h3></div><input class="table-search" id="userSearch" placeholder="Search customer…"></div><div class="table-wrap"><table><thead><tr><th>Customer</th><th>Account ID</th><th>Wallet balance</th><th>Joined</th><th>Account</th><th>Wallet controls</th></tr></thead><tbody id="userRows">${users.map(u => `<tr data-user-row data-search="${esc(`${u.name} ${u.email} ${u.id}`.toLowerCase())}"><td><div class="customer-cell">${u.avatarUrl ? `<img src="${esc(u.avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="customer-avatar-fallback">${esc((u.name || "C").charAt(0).toUpperCase())}</span>`}<span><b>${esc(u.name)}</b><small>${esc(u.email)}</small></span></div></td><td class="mono">${esc(u.id.slice(0, 14))}</td><td><b>${money(u.balance)}</b></td><td>${date(u.createdAt)}</td><td>${u.disabled ? status("Disabled") : status("Active")}</td><td><div class="user-wallet-actions"><button class="table-action" data-wallet-add="${esc(u.id)}">＋ Add</button><button class="table-action refund" data-wallet-deduct="${esc(u.id)}">− Deduct</button></div></td></tr>`).join("") || `<tr><td colspan="6" class="empty-cell">No customer accounts yet.</td></tr>`}</tbody></table></div></div>`;
  }
  function transactionsHtml() {
    return `<div class="page-toolbar"><div><h2>Transactions</h2><p>Deposits, order deductions and refunds recorded in the wallet ledger.</p></div></div><div class="admin-panel"><div class="panel-head"><div><span class="admin-kicker">WALLET LEDGER</span><h3>Latest transactions</h3></div><input class="table-search" id="transactionSearch" placeholder="Search type, reference or user…"></div><div class="table-wrap"><table><thead><tr><th>Type / reference</th><th>Customer</th><th>Amount</th><th>Note</th><th>Date</th></tr></thead><tbody id="transactionRows">${S.transactions.map(t => `<tr data-transaction-row data-search="${esc(`${t.type} ${t.reference} ${t.userId} ${t.note}`.toLowerCase())}"><td><b>${esc(t.type || "Entry")}</b><small class="mono">${esc(t.reference || "—")}</small></td><td class="mono">${esc(t.userId || "—")}</td><td class="${Number(t.amount) >= 0 ? "positive" : "negative"}">${Number(t.amount) >= 0 ? "+" : "−"}${money(Math.abs(Number(t.amount)))}</td><td>${esc(t.note || "—")}</td><td>${date(t.createdAt)}</td></tr>`).join("") || `<tr><td colspan="6" class="empty-cell">No transactions yet.</td></tr>`}</tbody></table></div></div>`;
  }
  function settingsHtml() {
    const s = S.overview?.settings || {};
    return `<div class="page-toolbar"><div><h2>Settings</h2><p>Set currency conversion, reseller margin, wallet deposit limits and support contact.</p></div></div><div class="settings-grid"><section class="admin-panel settings-card"><div class="panel-head"><div><span class="admin-kicker">PRICING & WALLET RULES</span><h3>Store settings</h3></div></div><form id="settingsForm" class="admin-form"><label>USD to INR exchange rate<input type="number" min="0" step="0.0001" name="usdToInrRate" value="${Number(s.usdToInrRate || 0)}" required><small>Set the USD/INR rate used to convert LuvSMM USD supplier prices. Enter 0 only if your supplier catalogue is not in USD.</small></label><label>Margin type<select name="markupType"><option value="percent" ${s.markupType !== "fixed" ? "selected" : ""}>Percentage (%)</option><option value="fixed" ${s.markupType === "fixed" ? "selected" : ""}>Fixed amount (₹ per 1,000)</option></select></label><label>Margin value<input type="number" min="0" max="500" step="0.01" name="markupValue" value="${Number(s.markupValue ?? s.markupPercent ?? 30)}" required><small>Applies to services whose price has not been manually overridden by admin.</small></label><div class="two-fields"><label>Minimum deposit (₹)<input type="number" min="1" max="50000" step="1" name="minDeposit" value="${Number(s.minDeposit || 50)}" required></label><label>Maximum deposit (₹)<input type="number" min="1" max="500000" step="1" name="maxDeposit" value="${Number(s.maxDeposit || 50000)}" required></label></div><label>Support email<input type="email" name="supportEmail" value="${esc(s.supportEmail || "")}" placeholder="support@example.com"><small>Displayed in the customer support area.</small></label><button class="admin-primary" type="submit">Save settings <span>↗</span></button></form></section><section class="admin-panel settings-card"><div class="panel-head"><div><span class="admin-kicker">INTEGRATIONS</span><h3>Connection checklist</h3></div></div><div class="integration-row"><span class="integration-icon">S</span><div><b>Supabase</b><small>Database, categories, tickets and wallet ledger</small></div><span class="connection-state">Server configured</span></div><div class="integration-row"><span class="integration-icon">R</span><div><b>Razorpay</b><small>Wallet deposits and payment verification</small></div><span class="connection-state">Server secret</span></div><div class="integration-row"><span class="integration-icon">L</span><div><b>LuvSMM API</b><small>Supplier service import and dispatch</small></div><span class="connection-state">Server secret</span></div><div class="integration-row"><span class="integration-icon">G</span><div><b>Google Sign-In</b><small>Google Identity Services</small></div><span class="connection-state">Client ID required</span></div><div class="secure-note"><b>Keep API keys private</b><p>Supabase Secret Key, LUVSMM_API_KEY and RAZORPAY_KEY_SECRET remain server-side in Vercel. Google Client ID is public and may be exposed in website config.</p></div></section></div>`;
  }
  function categoriesHtml() {
    return `<div class="page-toolbar"><div><h2>Service groups</h2><p>Create the customer-facing platforms. Instagram category par sirf Instagram assigned services hi dikhengi.</p></div><div class="toolbar-actions"><button class="admin-primary" id="addCategory">＋ Add group</button></div></div><div class="admin-panel"><div class="table-wrap"><table><thead><tr><th>Group</th><th>Slug / ID</th><th>Services</th><th>Visibility</th><th>Actions</th></tr></thead><tbody>${S.categories.map(c => { const count = S.services.filter(s => s.category === c.name).length; return `<tr><td><b>${esc(c.icon || "layers")} ${esc(c.name)}</b></td><td class="mono">${esc(c.id)}</td><td>${count}</td><td>${c.active ? status("Active") : status("Hidden")}</td><td><div class="service-actions"><button class="table-action" data-edit-category="${esc(c.id)}">Edit</button><button class="table-action" data-toggle-category="${esc(c.id)}" data-active="${c.active ? "1":"0"}">${c.active ? "Hide":"Show"}</button><button class="icon-danger" data-delete-category="${esc(c.id)}">×</button></div></td></tr>`; }).join("") || `<tr><td colspan="5" class="empty-cell">No groups yet. Create Instagram, YouTube, Telegram and other groups here.</td></tr>`}</tbody></table></div></div><p class="admin-footnote">Imported supplier services are not automatically visible. During service review, choose the group where each service should appear.</p>`;
  }
  function ticketsHtml() {
    return `<div class="page-toolbar"><div><h2>Complaints & support</h2><p>Reply to customer tickets and update their status from this admin panel.</p></div><div class="toolbar-actions"><span class="summary-label">${S.tickets.filter(t => !["Resolved","Closed"].includes(t.status)).length} open tickets</span></div></div><div class="admin-panel"><div class="table-wrap"><table><thead><tr><th>Ticket</th><th>Customer</th><th>Latest message</th><th>Status</th><th>Updated</th><th>Action</th></tr></thead><tbody>${S.tickets.map(t => `<tr><td><b>${esc(t.subject)}</b><small class="mono">${esc(t.id.slice(0,12))}</small></td><td>${esc(t.user_email || "Customer")}</td><td>${esc(t.latestMessage?.body || "—").slice(0,90)}</td><td>${status(t.status)}</td><td>${date(t.updated_at)}</td><td><button class="table-action review" data-open-ticket="${esc(t.id)}">Open / Reply</button></td></tr>`).join("") || `<tr><td colspan="6" class="empty-cell">No customer complaints yet.</td></tr>`}</tbody></table></div></div>`;
  }
  function bindTab() {
    $$('[data-go]').forEach(b => b.addEventListener("click", () => go(b.dataset.go)));
    $("#syncServices")?.addEventListener("click", async () => { const b = $("#syncServices"); b.disabled = true; b.textContent = "Syncing catalogue…"; try { const r = await api("/api/admin/services/sync", { method: "POST", body: "{}" }); await refreshData(); renderTab(); toast(`Sync complete: ${r.total} services · ${r.added} new · ${r.updated} updated · ${r.unchanged || 0} unchanged · ${r.pendingReview} pending review · ${r.legacyMigrated || 0} legacy rows migrated.`, "success"); } catch (e) { toast(e.message, "error"); b.disabled = false; b.textContent = "↻ Import / sync all"; } });
    $("#supplierBalance")?.addEventListener("click", async () => { const b = $("#supplierBalance"); b.disabled = true; b.textContent = "Checking…"; try { const r = await api("/api/admin/provider/balance"); const value = r.balance?.balance ?? r.balance?.amount ?? "Response received"; toast(`LuvSMM balance: ${value} ${r.balance?.currency || ""}`, "success"); } catch (e) { toast(e.message, "error"); } finally { b.disabled = false; b.textContent = "Supplier balance"; } });
    $("#addManual")?.addEventListener("click", manualServiceModal);
    $("#serviceAdminSearch")?.addEventListener("input", e => filterRows("serviceRows", "data-service-row", e.target.value));
    $("#orderSearch")?.addEventListener("input", e => filterRows("orderRows", "data-order-row", e.target.value));
    $("#userSearch")?.addEventListener("input", e => filterRows("userRows", "data-user-row", e.target.value));
    $("#transactionSearch")?.addEventListener("input", e => filterRows("transactionRows", "data-transaction-row", e.target.value));
    $$('[data-review-service]').forEach(b => b.addEventListener("click", () => openServiceReview(b.dataset.reviewService)));
    $$('[data-toggle-service]').forEach(b => b.addEventListener("click", async () => { b.disabled = true; try { await api(`/api/admin/services/${encodeURIComponent(b.dataset.toggleService)}`, { method: "PATCH", body: JSON.stringify({ active: b.dataset.active !== "1" }) }); await refreshData(); renderTab(); toast("Service updated.", "success"); } catch (e) { toast(e.message, "error"); b.disabled = false; } }));
    $$('[data-price-service]').forEach(input => input.addEventListener("change", async () => { input.disabled = true; try { const price = Number(input.value); await api(`/api/admin/services/${encodeURIComponent(input.dataset.priceService)}`, { method: "PATCH", body: JSON.stringify({ sellingPricePer1000: price }) }); const item = S.services.find(service => service.id === input.dataset.priceService); if (item) item.sellingPricePer1000 = price; toast("Selling price saved.", "success"); } catch (e) { toast(e.message, "error"); } finally { input.disabled = false; } }));
    $$('[data-delete-service]').forEach(b => b.addEventListener("click", async () => { if (!confirm("Delete this service from your catalogue? Existing orders are not deleted.")) return; try { await api(`/api/admin/services/${encodeURIComponent(b.dataset.deleteService)}`, { method: "DELETE" }); await refreshData(); renderTab(); toast("Service deleted."); } catch (e) { toast(e.message, "error"); } }));
    $("#syncOrders")?.addEventListener("click", async () => { const b = $("#syncOrders"); b.disabled = true; b.textContent = "Checking supplier…"; try { const r = await api("/api/admin/orders/sync", { method: "POST", body: "{}" }); await refreshData(); renderTab(); toast(`Checked ${r.checked} orders; updated ${r.updated}.`, "success"); } catch (e) { toast(e.message, "error"); b.disabled = false; b.textContent = "↻ Sync supplier statuses"; } });
    $$('[data-save-order]').forEach(b => b.addEventListener("click", async () => { const select = $(`[data-order-status="${CSS.escape(b.dataset.saveOrder)}"]`); b.disabled = true; try { await api(`/api/admin/orders/${encodeURIComponent(b.dataset.saveOrder)}`, { method: "PATCH", body: JSON.stringify({ status: select.value }) }); await refreshData(); renderTab(); toast("Order status updated.", "success"); } catch (e) { toast(e.message, "error"); b.disabled = false; } }));
    $$('[data-refund-order]').forEach(b => b.addEventListener("click", async () => { if (!confirm("Refund this order amount to the customer's internal wallet? Ensure the supplier side has already been cancelled/reconciled.")) return; b.disabled = true; try { await api(`/api/admin/orders/${encodeURIComponent(b.dataset.refundOrder)}/refund`, { method: "POST", body: JSON.stringify({ note: "Refunded by admin" }) }); await refreshData(); renderTab(); toast("Wallet refund completed.", "success"); } catch (e) { toast(e.message, "error"); b.disabled = false; } }));
    $("#addCategory")?.addEventListener("click", addCategoryModal);
    $$('[data-edit-category]').forEach(b => b.addEventListener("click", () => editCategory(b.dataset.editCategory)));
    $$('[data-toggle-category]').forEach(b => b.addEventListener("click", async () => { const item = S.categories.find(c => c.id === b.dataset.toggleCategory); try { await api(`/api/admin/categories/${encodeURIComponent(item.id)}`, { method:"PATCH", body:JSON.stringify({ active: b.dataset.active !== "1" }) }); await refreshData(); renderTab(); toast("Group visibility updated.","success"); } catch(e) { toast(e.message,"error"); } }));
    $$('[data-delete-category]').forEach(b => b.addEventListener("click", async () => { if(!confirm("Delete this empty service group?")) return; try { await api(`/api/admin/categories/${encodeURIComponent(b.dataset.deleteCategory)}`,{method:"DELETE"}); await refreshData(); renderTab(); toast("Group deleted."); } catch(e) { toast(e.message,"error"); } }));
    $$('[data-open-ticket]').forEach(b => b.addEventListener("click", () => openAdminTicket(b.dataset.openTicket)));
    $$('[data-wallet-add]').forEach(b => b.addEventListener("click", () => walletAdjust(b.dataset.walletAdd, 1)));
    $$('[data-wallet-deduct]').forEach(b => b.addEventListener("click", () => walletAdjust(b.dataset.walletDeduct, -1)));
    $("#settingsForm")?.addEventListener("submit", async e => { e.preventDefault(); const form = new FormData(e.currentTarget); const b = $("#settingsForm button"); b.disabled = true; try { const payload = { usdToInrRate:Number(form.get("usdToInrRate")), markupType:form.get("markupType"), markupValue:Number(form.get("markupValue")), minDeposit:Number(form.get("minDeposit")), maxDeposit:Number(form.get("maxDeposit")), supportEmail:form.get("supportEmail") }; if(payload.minDeposit > payload.maxDeposit) throw new Error("Minimum deposit cannot exceed maximum deposit."); await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(payload) }); await refreshData(); renderTab(); toast("Settings saved. Automatic supplier prices recalculated.", "success"); } catch (err) { toast(err.message, "error"); } finally { b.disabled = false; } });
  }
  function addCategoryModal() { categoryModal(null); }
  function editCategory(id) {
    const item = S.categories.find(c => c.id === id);
    if (item) categoryModal(item);
  }
  function categoryModal(item) {
    const editing = Boolean(item);
    const overlay = document.createElement("div");
    overlay.className = "admin-modal-backdrop";
    overlay.innerHTML = `<form class="admin-modal category-admin-modal" id="categoryAdminForm"><button type="button" class="admin-modal-x" data-dismiss>×</button><div class="admin-kicker">PLATFORM GROUPS</div><h2>${editing ? "Edit service group" : "Create service group"}</h2><p>Services assigned to this group will appear only when the customer selects this platform.</p><label>Group name<input name="name" required minlength="2" maxlength="80" value="${esc(item?.name || "")}" placeholder="Instagram, YouTube, Telegram…"></label><label>Icon / short label<input name="icon" maxlength="30" value="${esc(item?.icon || "layers")}" placeholder="instagram, youtube, ◎"></label><label>Display order<input name="sortOrder" type="number" step="1" value="${Number(item?.sort_order || 0)}"></label><div class="admin-error" id="categoryAdminError"></div><button class="admin-primary" type="submit">${editing ? "Save group" : "Create group"} ↗</button></form>`;
    document.body.append(overlay);
    overlay.addEventListener("click", e => { if (e.target === overlay || e.target.closest("[data-dismiss]")) overlay.remove(); });
    $("#categoryAdminForm", overlay).addEventListener("submit", async e => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const payload = { name: String(form.get("name") || "").trim(), icon: String(form.get("icon") || "layers").trim(), sortOrder: Number(form.get("sortOrder") || 0) };
      const button = $("#categoryAdminForm button[type=submit]", overlay); button.disabled = true;
      try {
        const url = editing ? `/api/admin/categories/${encodeURIComponent(item.id)}` : "/api/admin/categories";
        await api(url, { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) });
        overlay.remove(); await refreshData(); renderTab(); toast(editing ? "Service group updated." : "Service group created.", "success");
      } catch (err) { $("#categoryAdminError", overlay).textContent = err.message; button.disabled = false; }
    });
  }
  async function walletAdjust(userId, direction) {
    const customer = (S.users || []).find(user => user.id === userId);
    const adding = direction > 0;
    const overlay = document.createElement("div");
    overlay.className = "admin-modal-backdrop";
    overlay.innerHTML = `<form class="admin-modal wallet-adjust-modal" id="walletAdjustForm"><button type="button" class="admin-modal-x" data-dismiss>×</button><div class="admin-kicker">CUSTOMER WALLET</div><h2>${adding ? "Add money" : "Deduct money"}</h2><p>${esc(customer?.name || "Customer")} · ${esc(customer?.email || "")}</p><label>Amount (₹)<input name="amount" type="number" min="0.01" max="1000000" step="0.01" required placeholder="Enter amount"></label><label>Reason / note<input name="note" maxlength="300" required value="${adding ? "Manual wallet credit" : "Manual wallet deduction"}"></label><div class="admin-error" id="walletAdjustError"></div><button class="admin-primary" type="submit">${adding ? "Confirm add" : "Confirm deduction"}</button></form>`;
    document.body.append(overlay);
    overlay.addEventListener("click", e => { if (e.target === overlay || e.target.closest("[data-dismiss]")) overlay.remove(); });
    $("#walletAdjustForm", overlay).addEventListener("submit", async e => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const amount = Number(form.get("amount"));
      const note = String(form.get("note") || "").trim();
      const button = $("#walletAdjustForm button[type=submit]", overlay);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000 || !note) { $("#walletAdjustError", overlay).textContent = "Enter a valid amount and reason."; return; }
      button.disabled = true;
      try {
        await api(`/api/admin/users/${encodeURIComponent(userId)}/wallet`, { method: "POST", body: JSON.stringify({ amount: direction * amount, note }) });
        overlay.remove(); await refreshData(); renderTab(); toast("Customer wallet updated.", "success");
      } catch (err) { $("#walletAdjustError", overlay).textContent = err.message; button.disabled = false; }
    });
  }
  async function openAdminTicket(id) {
    try {
      const data = await api(`/api/admin/tickets/${encodeURIComponent(id)}`);
      const overlay = document.createElement("div"); overlay.className="admin-modal-backdrop";
      const messages = data.messages.map(m => `<div class="thread-message ${m.sender_type === "admin" ? "from-admin":"from-customer"}"><small>${m.sender_type === "admin" ? "Admin":"Customer"} · ${date(m.created_at)}</small><p>${esc(m.body)}</p></div>`).join("");
      overlay.innerHTML = `<form class="admin-modal ticket-admin-modal" id="adminTicketForm"><button type="button" class="admin-modal-x" data-dismiss>×</button><div class="admin-kicker">CUSTOMER SUPPORT</div><h2>${esc(data.ticket.subject)}</h2><p>${esc(data.ticket.userName)} · ${esc(data.ticket.userEmail)}</p><div class="ticket-thread">${messages}</div><label>Status<select name="status">${["Open","In Progress","Resolved","Closed"].map(v=>`<option ${v===data.ticket.status?"selected":""}>${v}</option>`).join("")}</select></label><label>Reply to customer<textarea name="message" rows="4" placeholder="Write your reply..."></textarea></label><div class="admin-error" id="ticketAdminError"></div><button class="admin-primary" type="submit">Send reply & save status</button></form>`;
      document.body.append(overlay); overlay.addEventListener("click", e => { if(e.target===overlay || e.target.closest("[data-dismiss]")) overlay.remove(); });
      $("#adminTicketForm",overlay).addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget),message=String(f.get("message")||"").trim(),status=f.get("status"),btn=$("#adminTicketForm button[type=submit]",overlay);btn.disabled=true;try{if(message) await api(`/api/admin/tickets/${encodeURIComponent(id)}/reply`,{method:"POST",body:JSON.stringify({message,status})});else await api(`/api/admin/tickets/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({status})});overlay.remove();await refreshData();renderTab();toast("Complaint updated.","success");}catch(err){$("#ticketAdminError",overlay).textContent=err.message;btn.disabled=false;}});
    } catch(e) { toast(e.message,"error"); }
  }

  function openServiceReview(id) {
    const s = S.services.find(item => item.id === id);
    if (!s) return toast("Service details are not available. Refresh the dashboard.", "error");
    const supplierRate = s.source === "luvsmm" ? `${s.supplierCurrency || "INR"} ${Number(s.supplierRate || 0).toFixed(4)}` : "Manual service";
    const isApproved = s.approvalStatus === "approved";
    const overlay = document.createElement("div");
    overlay.className = "admin-modal-backdrop";
    overlay.innerHTML = `<form class="admin-modal review-modal" id="serviceReviewForm"><button type="button" class="admin-modal-x" data-dismiss>×</button><div class="admin-kicker">MANUAL SERVICE REVIEW</div><h2>Review service</h2><p>Change the customer-facing service name, choose the platform group and set the final INR selling price before publishing.</p><label>Customer-facing service name<input name="serviceName" value="${esc(s.name)}" required maxlength="180"></label><label>Show under platform / group<select name="category">${S.categories.map(c => `<option value="${esc(c.name)}" ${c.name === s.category ? "selected" : ""}>${esc(c.name)}</option>`).join("")}${!S.categories.some(c=>c.name===s.category) ? `<option selected value="${esc(s.category)}">${esc(s.category)}</option>` : ""}</select></label><label>Customer selling price (₹ per 1,000)<input name="sellingPricePer1000" type="number" min="0.01" step="0.01" value="${Number(s.sellingPricePer1000 || 0)}" required></label><label class="review-confirm"><input type="checkbox" name="autoPrice" ${s.priceOverride ? "" : "checked"}><span>Keep this service linked to the global USD/INR rate and margin. Untick to lock this exact selling price.</span></label><div class="review-details"><div><small>Category</small><b>${esc(s.category || "Other")}</b></div><div><small>Supplier service ID</small><b>${esc(s.supplierServiceId || s.id)}</b></div><div><small>Supplier rate</small><b>${esc(supplierRate)}</b></div><div><small>INR converted cost</small><b>₹${(Number(s.supplierRate || 0) * (String(s.supplierCurrency || "INR").toUpperCase()==="USD" ? Number(S.overview?.settings?.usdToInrRate || 0) : 1)).toFixed(2)} / 1K</b></div><div><small>Quantity range</small><b>${Number(s.min || 1).toLocaleString("en-IN")} – ${Number(s.max || 10000).toLocaleString("en-IN")}</b></div><div><small>Provider type</small><b>${esc(s.supplierType || "Default")}</b></div><div><small>Refill / Cancel</small><b>${s.refill ? "Refill" : "No refill"} / ${s.cancel ? "Cancel" : "No cancel"}</b></div><div><small>Current status</small><b>${esc(s.approvalStatus || "needs_review")}</b></div></div><div class="review-description"><small>Supplier description</small><p>${esc(s.description || "No description was provided by the supplier.")}</p></div><label>Admin review note<textarea name="reviewNote" rows="2" placeholder="Optional note about this decision">${esc(s.reviewNote || "")}</textarea></label><label class="review-confirm"><input type="checkbox" name="adminReviewed" required><span>I personally checked the service name, description, supplier details and customer price before making this decision.</span></label><div class="review-actions"><button type="button" class="admin-secondary reject-review" id="rejectReviewedService">Reject & hide</button><button type="submit" class="admin-primary">${isApproved ? "Confirm approval" : "Approve & publish"} ↗</button></div><div class="admin-error" id="serviceReviewError"></div></form>`;
    document.body.append(overlay);
    overlay.addEventListener("click", e => { if (e.target === overlay || e.target.closest("[data-dismiss]")) overlay.remove(); });
    const form = $("#serviceReviewForm", overlay);
    const confirmChecked = () => form.elements.adminReviewed.checked;
    const saveDecision = async approvalStatus => {
      if (!confirmChecked()) { $("#serviceReviewError", overlay).textContent = "Tick the review confirmation after checking the details."; return; }
      const note = form.elements.reviewNote.value.trim();
      const sellingPricePer1000 = Number(form.elements.sellingPricePer1000.value);
      const serviceName = form.elements.serviceName.value.trim();
      const category = form.elements.category.value;
      if (!serviceName || !category || (approvalStatus === "approved" && sellingPricePer1000 <= 0)) { $("#serviceReviewError", overlay).textContent = "Enter service name and group; approval also requires a valid INR price."; return; }
      const buttons = $$('button', form); buttons.forEach(button => button.disabled = true);
      try {
        const payload = { approvalStatus, adminReviewed: true, complianceVerified: approvalStatus === "approved", active: approvalStatus === "approved", reviewNote: note, name: serviceName, category };
        if (approvalStatus === "approved") { payload.sellingPricePer1000 = sellingPricePer1000; payload.autoPrice = form.elements.autoPrice.checked; }
        await api(`/api/admin/services/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
        overlay.remove(); await refreshData(); renderTab();
        toast(approvalStatus === "approved" ? "Service approved and published." : "Service rejected and hidden from customers.", "success");
      } catch (e) { $("#serviceReviewError", overlay).textContent = e.message; buttons.forEach(button => button.disabled = false); }
    };
    $("#rejectReviewedService", overlay).addEventListener("click", () => saveDecision("rejected"));
    form.addEventListener("submit", e => { e.preventDefault(); saveDecision("approved"); });
  }
  function filterRows(rootId, selector, query) { const q = query.trim().toLowerCase(); $$(`#${rootId} ${selector}`).forEach(row => row.hidden = !row.dataset.search.includes(q)); }
  function manualServiceModal() {
    if (!S.categories.length) return toast("Create a service group first, then add a service to it.", "error");
    const overlay = document.createElement("div"); overlay.className = "admin-modal-backdrop"; overlay.innerHTML = `<form class="admin-modal" id="manualServiceForm"><button type="button" class="admin-modal-x" data-dismiss>×</button><div class="admin-kicker">CREATE CATALOGUE ITEM</div><h2>Add a manual service</h2><p>This creates an order that appears in your admin queue for manual fulfilment.</p><label>Service name<input name="name" required minlength="3" placeholder="e.g. Social media strategy consultation"></label><label>Show under group<select name="category" required>${S.categories.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("") || `<option value="Other">Other</option>`}</select></label><label>Description<textarea name="description" rows="3" placeholder="Explain what the customer receives"></textarea></label><label>Optional LuvSMM supplier service ID<input name="supplierServiceId" placeholder="Leave blank for manual fulfilment"><small>When filled, successful customer orders are sent to this supplier service ID.</small></label><label>Pricing model<select name="pricingModel" id="manualPricingModel"><option value="fixed">Fixed price per order</option><option value="per1000">Price per 1,000 units</option></select></label><label>Price (₹)<input name="sellingPricePer1000" type="number" min="0.01" step="0.01" value="100" required></label><div class="two-fields manual-quantity-fields" hidden><label>Minimum quantity<input name="min" type="number" min="1" value="1"></label><label>Maximum quantity<input name="max" type="number" min="1" value="100"></label></div><div class="admin-error" id="manualError"></div><button class="admin-primary" type="submit">Create service ↗</button></form>`;
    document.body.append(overlay); overlay.addEventListener("click", e => { if (e.target === overlay || e.target.closest("[data-dismiss]")) overlay.remove(); });
    $("#manualPricingModel", overlay).addEventListener("change", e => { $(".manual-quantity-fields", overlay).hidden = e.target.value === "fixed"; });
    $("#manualServiceForm", overlay).addEventListener("submit", async e => { e.preventDefault(); const form = new FormData(e.currentTarget); const b = $("#manualServiceForm button[type=submit]"); b.disabled = true; try { await api("/api/admin/services/manual", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) }); overlay.remove(); await refreshData(); renderTab(); toast("Manual service created. Review it before publishing.", "success"); } catch (err) { $("#manualError").textContent = err.message; b.disabled = false; } });
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
