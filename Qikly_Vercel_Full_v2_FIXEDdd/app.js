(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = {
    config: null, user: null, services: [], categories: [], wallet: null,
    orders: [], tickets: [], dataErrors: { wallet: "", orders: "", tickets: "" },
    route: "/", orderCategory: "", orderServiceId: "",
    orderBusy: false, orderPage: 1,
    walletPromo: null, orderPromo: null, announcementDismissed: false, serviceCat: "all", theme: document.documentElement.getAttribute("data-theme") || "light"
  };
  const icons = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    order: '<path d="M4 5h16M4 12h16M4 19h16"/><circle cx="7" cy="5" r="1"/><circle cx="7" cy="12" r="1"/><circle cx="7" cy="19" r="1"/>',
    bag: '<path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    wallet: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9h18M16 15h2"/>',
    support: '<path d="M4 5h16v12H8l-4 3z"/><path d="M8 9h8M8 13h5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.5-3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
  };
  const icon = (name, cls = "") => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.home}</svg>`;
  function categoryGlyph(category) {
    const name = String(category.name || "").toLowerCase();
    if (name.includes("instagram")) return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle class="glyph-dot" cx="17.5" cy="6.8" r="1"/></svg>';
    if (name.includes("youtube")) return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="4"/><path class="glyph-fill" d="m10 9 5 3-5 3z"/></svg>';
    if (name.includes("telegram")) return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 17-7-5 17-4-7-8-3Z"/><path d="m11 14 9-10"/></svg>';
    if (name.includes("facebook")) return '<b class="brand-letter">f</b>';
    if (name.includes("twitter") || name === "x") return '<b class="brand-letter">X</b>';
    const customIcon = String(category.icon || "").trim();
    return esc(customIcon || String(category.name || "C").trim().charAt(0).toUpperCase());
  }
  const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const date = value => {
    const parsed = value?.toDate ? value.toDate() : value?.seconds ? new Date(value.seconds * 1000) : value ? new Date(value) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  };

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin", ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }

  const CACHE_KEY = "mintu_swr_v1";
  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch { return null; }
  }
  function writeCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        ts: Date.now(),
        config: state.config,
        services: state.services,
        categories: state.categories,
        user: state.user
      }));
    } catch {}
  }
  async function withBusyButton(button, loadingLabel, fn) {
    if (!button || button.disabled || button.dataset.busy === "1") return;
    const originalHtml = button.innerHTML;
    button.dataset.busy = "1";
    button.disabled = true;
    button.classList.add("is-loading");
    button.innerHTML = `<span class="inline-spinner"></span><span>${esc(loadingLabel)}</span>`;
    try {
      return await fn();
    } finally {
      button.dataset.busy = "0";
      button.disabled = false;
      button.classList.remove("is-loading");
      if (button.isConnected) button.innerHTML = originalHtml;
    }
  }

  let toastTimer;
  function toast(message, kind = "") {
    const node = $("#toast");
    node.textContent = message;
    node.className = `toast show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.className = "toast"; }, 3600);
  }

  function shellMarkup() {
    const nav = [
      ["/", "home", "Home"], ["/new-order", "bag", "New order"],
      ["/services", "order", "Services"], ["/orders", "clock", "Orders"],
      ["/wallet", "wallet", "Add funds"], ["/support", "support", "Complaints"],
      ["/profile", "user", "Profile"]
    ];
    return `<div class="app-shell" id="appShell">
      <div class="drawer-scrim" id="drawerScrim"></div>
      <aside class="app-sidebar" id="appSidebar">
        <a class="brand" href="/" data-route="/" aria-label="Mintu SMM home"><span class="brand-mark">M</span><span class="brand-copy"><b id="brandName">Mintu SMM</b><small>GROWTH WORKSPACE</small></span></a>
        <div class="workspace-label">WORKSPACE</div>
        <nav class="side-nav" aria-label="Main navigation">${nav.map(([route, ico, label]) => `<a href="${route}" data-route="${route}" data-nav-route="${route}">${icon(ico)}<span>${label}</span>${route === "/orders" ? '<span class="nav-indicator" id="orderNavCount"></span>' : ""}</a>`).join("")}</nav>
        <div class="sidebar-spacer"></div>
        <section class="sidebar-wallet">
          <div class="wallet-card-top"><span>AVAILABLE BALANCE</span>${icon("wallet")}</div>
          <b id="sideBalance">₹0.00</b>
          <a class="btn btn-light" href="/wallet" data-route="/wallet">${icon("plus")} Add funds</a>
        </section>
        <div class="sidebar-profile" id="sidebarProfile">
          <span class="avatar" id="sideAvatar">M</span>
          <span class="profile-copy"><b id="sideName">Guest account</b><small id="sideEmail">Sign in to get started</small></span>
          <button class="icon-button" id="sidebarLogout" type="button" aria-label="Log out" hidden>↗</button>
        </div>
        <a class="admin-link" href="/admin">Admin workspace <span>↗</span></a>
      </aside>
      <div class="main-column">
        <header class="topbar">
          <button class="mobile-menu icon-button" id="mobileMenu" type="button" aria-label="Open navigation" aria-expanded="false">☰</button>
          <div class="crumb"><span id="pageEyebrow">YOUR WORKSPACE</span><b id="pageTitle">Home</b></div>
          <div class="topbar-actions">
            <button class="theme-toggle" type="button" id="themeToggle" aria-label="Toggle dark or light mode" title="Switch theme">${icon(state.theme === "dark" ? "sun" : "moon")}</button>
            <a class="top-balance" href="/wallet" data-route="/wallet">${icon("wallet")}<span id="topBalance">₹0.00</span></a>
            <a class="btn btn-quiet top-login" href="/login" data-route="/login" id="topLogin">Log in</a>
            <a class="btn btn-primary top-signup" href="/signup" data-route="/signup" id="topSignup">Create account</a>
            <button class="avatar avatar-button" type="button" id="topAvatar" aria-label="Open profile" hidden>M</button>
          </div>
        </header>
        <main class="page-content" id="pageContent" tabindex="-1"></main>
        <footer class="app-footer"><span>© <span id="year"></span> <b id="footerBrand">Mintu SMM</b></span><a id="supportEmailLink" href="mailto:support@example.com">Contact support</a><span>Secure · Clear · Trackable</span></footer>
      </div>
      <nav class="mobile-dock" aria-label="Quick navigation">${nav.slice(0, 5).map(([route, ico, label]) => `<a href="${route}" data-route="${route}" data-nav-route="${route}">${icon(ico)}<span>${label === "New order" ? "Order" : label === "Add funds" ? "Wallet" : label}</span></a>`).join("")}</nav>
    </div><section class="auth-root" id="authRoot" hidden></section>`;
  }

  function navPath(path) {
    const url = new URL(path, location.origin);
    history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    renderRoute();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function currentPath() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    return path;
  }

  function selectedUserAvatar() {
    const name = state.user?.name || "M";
    return state.user?.avatarUrl
      ? `<img src="${esc(state.user.avatarUrl)}" alt="" referrerpolicy="no-referrer">`
      : esc(name.trim().charAt(0).toUpperCase() || "M");
  }

  function updateChrome(route) {
    const shell = $("#appShell");
    const authRoot = $("#authRoot");
    const authPage = route === "/login" || route === "/signup";
    shell.hidden = authPage;
    authRoot.hidden = !authPage;
    if (authPage) return;
    $("#brandName").textContent = state.config?.siteName || "Mintu SMM";
    $("#footerBrand").textContent = state.config?.siteName || "Mintu SMM";
    $("#year").textContent = new Date().getFullYear();
    const labels = {
      "/": ["YOUR WORKSPACE", "Home"], "/new-order": ["ORDER DESK", "New order"],
      "/services": ["SERVICE CATALOGUE", "Services"], "/orders": ["ORDER ACTIVITY", "Orders"],
      "/wallet": ["WALLET & PAYMENTS", "Add funds"], "/support": ["CUSTOMER CARE", "Complaints"],
      "/profile": ["ACCOUNT CENTER", "Profile"]
    };
    const [eyebrow, title] = labels[route] || labels["/"];
    $("#pageEyebrow").textContent = eyebrow;
    $("#pageTitle").textContent = title;
    $("#topBalance").textContent = money(state.user?.balance || 0);
    $("#sideBalance").textContent = money(state.user?.balance || 0);
    $("#sideName").textContent = state.user?.name || "Guest account";
    $("#sideEmail").textContent = state.user?.email || "Sign in to get started";
    $("#sideAvatar").innerHTML = selectedUserAvatar();
    $("#topAvatar").innerHTML = selectedUserAvatar();
    $("#topAvatar").hidden = !state.user;
    $("#topLogin").hidden = Boolean(state.user);
    $("#topSignup").hidden = Boolean(state.user);
    $("#sidebarLogout").hidden = !state.user;
    $("#orderNavCount").textContent = state.orders.length ? String(state.orders.length) : "";
    $$("[data-nav-route]").forEach(link => {
      const active = link.dataset.navRoute === route;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
    });
    const email = state.config?.supportEmail;
    if (email) {
      $("#supportEmailLink").href = `mailto:${email}`;
      $("#supportEmailLink").textContent = email;
    }
  }

  async function loadConfig() {
    try {
      state.config = await api("/api/public/config");
      document.title = `${state.config.siteName || "Mintu SMM"} — Your growth workspace`;
    } catch (error) {
      state.configError = error.message;
      console.error("Could not load public configuration:", error);
    }
  }

  async function loadServices() {
    try {
      const [serviceData, categoryData] = await Promise.all([api("/api/services"), api("/api/categories")]);
      state.services = serviceData.services || [];
      state.categories = categoryData.categories || [];
      state.serviceError = "";
    } catch (error) {
      state.services = [];
      state.categories = [];
      state.serviceError = error.message;
      console.error("Could not load service catalogue:", error);
    }
  }

  async function loadAccount(deferSecondary = false) {
    try {
      const auth = await api("/api/auth/me");
      state.user = auth.authenticated ? auth.user : null;
      state.accountError = "";
    } catch (error) {
      state.user = null;
      state.accountError = error.message;
      console.error("Could not load account:", error);
    }
    if (!state.user) {
      state.wallet = null;
      state.orders = [];
      state.tickets = [];
      state.dataErrors = { wallet: "", orders: "", tickets: "" };
      return;
    }
    if (deferSecondary) return;
    const requests = await Promise.allSettled([loadWallet(), loadOrders(), loadTickets()]);
    writeCache();
    const failures = requests.filter(result => result.status === "rejected");
    if (failures.length) {
      state.accountError = failures.map(result => result.reason.message).join(" ");
      console.error("Some account data could not be loaded:", state.accountError);
    }
  }

  async function loadWallet() {
    try {
      state.wallet = await api("/api/wallet");
      state.user.balance = state.wallet.balance;
      state.dataErrors.wallet = "";
    } catch (error) {
      state.dataErrors.wallet = error.message;
      throw error;
    }
  }
  async function loadOrders() {
    try {
      const result = await api("/api/orders");
      state.orders = result.orders || [];
      state.dataErrors.orders = "";
    } catch (error) {
      state.dataErrors.orders = error.message;
      throw error;
    }
  }
  async function loadTickets() {
    try {
      const result = await api("/api/tickets", { cache: "no-store" });
      state.tickets = result.tickets || [];
      state.dataErrors.tickets = "";
    } catch (error) {
      state.dataErrors.tickets = error.message;
      throw error;
    }
  }

  function statusClass(status) {
    const value = String(status || "").toLowerCase();
    if (value.includes("complete") || value === "resolved") return "good";
    if (value.includes("cancel") || value.includes("refund")) return "muted";
    if (value.includes("review") || value.includes("confirm") || value.includes("open")) return "warning";
    return "active";
  }
  function statusPill(status) {
    return `<span class="status-pill ${statusClass(status)}"><i></i>${esc(status || "Pending")}</span>`;
  }

  function renderRoute() {
    let route = currentPath();
    const routes = ["/", "/new-order", "/services", "/orders", "/wallet", "/support", "/profile", "/login", "/signup"];
    if (!routes.includes(route)) route = "/";
    state.route = route;
    if (["/wallet", "/orders", "/support", "/profile"].includes(route) && !state.user) {
      navPath(`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
      return;
    }
    updateChrome(route);
    const page = $("#pageContent");
    if (route === "/login" || route === "/signup") {
      renderAuth(route === "/signup" ? "signup" : "login");
      return;
    }
    const renderers = {
      "/": renderHome, "/new-order": renderOrderPage, "/services": renderServicesPage,
      "/orders": renderOrdersPage, "/wallet": renderWalletPage, "/support": renderSupportPage,
      "/profile": renderProfilePage
    };
    page.innerHTML = `${announcementMarkup()}<div class="page-transition">${renderers[route]()}</div>`;
    page.focus({ preventScroll: true });
    bindPage(route);
    animateCounters();
  }

  function animateCounters() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    $$("[data-counter]").forEach(node => {
      const target = Number(node.dataset.counter || 0);
      if (reducedMotion || target === 0) {
        node.textContent = target.toLocaleString("en-IN");
        return;
      }
      const duration = 550;
      const started = performance.now();
      const frame = now => {
        if (!node.isConnected) return;
        const progress = Math.min(1, (now - started) / duration);
        const eased = 1 - (1 - progress) ** 3;
        node.textContent = Math.round(target * eased).toLocaleString("en-IN");
        if (progress < 1) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  function announcementMarkup() {
    const a = state.config?.announcement;
    if (!a?.enabled || !a?.text || state.announcementDismissed) return "";
    const kind = ["info", "offer", "warning"].includes(a.type) ? a.type : "info";
    const link = String(a.link || "").trim();
    const isInternal = link.startsWith("/") && !link.startsWith("//");
    const cta = link ? (isInternal
      ? `<a class="announcement-cta" href="${esc(link)}" data-route="${esc(link)}">Check now →</a>`
      : `<a class="announcement-cta" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open →</a>`) : "";
    return `<div class="announcement-bar ${kind}" role="status">
      <span class="announcement-badge">${kind === "offer" ? "OFFER" : kind === "warning" ? "ALERT" : "NOTICE"}</span>
      <p>${esc(a.text)}</p>
      <div class="announcement-actions">${cta}<button type="button" class="announcement-close" id="dismissAnnouncement" aria-label="Dismiss announcement">×</button></div>
    </div>`;
  }

  function renderHome() {
    const completed = state.orders.filter(order => String(order.status).toLowerCase() === "completed").length;
    const pending = state.orders.filter(order => !["completed", "canceled", "refunded", "partially refunded"].includes(String(order.status).toLowerCase())).length;
    const recent = state.orders.slice(0, 4);
    return `<section class="welcome-hero">
      <div class="welcome-copy">
        <span class="eyebrow"><i></i> MINTU SMM WORKSPACE</span>
        <h1>${state.user ? `Welcome back, <em>${esc((state.user.name || "there").split(" ")[0])}.</em>` : `Grow faster,<br><em>all in one panel.</em>`}</h1>
        <p>Place instant social media orders, manage your wallet with bonus offers, and track every order live.</p>
        <div class="welcome-actions"><a class="btn btn-primary btn-large" href="/new-order" data-route="/new-order">Create an order ${icon("arrow")}</a><a class="btn btn-outline btn-large" href="${state.user ? "/wallet" : "/services"}" data-route="${state.user ? "/wallet" : "/services"}">${state.user ? "Add funds" : "Browse services"}</a></div>
        <div class="hero-badges"><span>${icon("lock")} Secure wallet</span><span>${icon("clock")} Live tracking</span><span>${icon("check")} Instant processing</span></div>
      </div>
      <div class="hero-orbit" aria-hidden="true"><div class="orbit-ring"></div><div class="orbit-ring ring-two"></div><div class="orbit-core"><span>M</span><small>SMM<br>PANEL</small></div></div>
    </section>
    ${state.serviceError ? `<div class="notice notice-error">${esc(state.serviceError)} <button type="button" data-retry-services>Try again</button></div>` : ""}
    ${state.accountError && state.user ? `<div class="notice notice-warning">${esc(state.accountError)} <button type="button" data-refresh-account>Refresh account</button></div>` : ""}
    <section class="smm-quick-bar" aria-label="Quick actions">
      <a class="quick-pill" href="/new-order" data-route="/new-order"><span>${icon("bag")}</span><div><b>New Order</b><small>Fast checkout</small></div></a>
      <a class="quick-pill" href="/services" data-route="/services"><span>${icon("order")}</span><div><b>Services</b><small>${state.services.length} active</small></div></a>
      <a class="quick-pill" href="${state.user ? "/wallet" : "/login"}" data-route="${state.user ? "/wallet" : "/login"}"><span>${icon("wallet")}</span><div><b>Add Funds</b><small>Instant UPI</small></div></a>
      <a class="quick-pill" href="${state.user ? "/orders" : "/login"}" data-route="${state.user ? "/orders" : "/login"}"><span>${icon("clock")}</span><div><b>Track Orders</b><small>${state.orders.length} total</small></div></a>
    </section>
    <section class="home-summary">
      <article class="balance-card"><div class="balance-label"><span>WALLET BALANCE</span>${icon("wallet")}</div><b>${money(state.user?.balance || 0)}</b><p>${state.user ? "Ready when you are. Add funds securely at any time." : "Sign in to manage your wallet and payments."}</p><a class="btn btn-light" href="${state.user ? "/wallet" : "/login"}" data-route="${state.user ? "/wallet" : "/login"}">${state.user ? "Add funds" : "Sign in"} ${icon("arrow")}</a><div class="balance-decoration"></div></article>
      <article class="stat-card stat-indigo"><span class="stat-icon">${icon("bag")}</span><small>TOTAL ORDERS</small><b data-counter="${state.orders.length}">0</b><span class="stat-note">All-time activity</span></article>
      <article class="stat-card"><span class="stat-icon">${icon("check")}</span><small>COMPLETED</small><b data-counter="${completed}">0</b><span class="stat-note">Successfully delivered</span></article>
      <article class="stat-card"><span class="stat-icon">${icon("clock")}</span><small>IN PROGRESS</small><b data-counter="${pending}">0</b><span class="stat-note">Being worked on</span></article>
    </section>

    <section class="home-order-section">
      <div class="section-title"><div><span class="eyebrow">QUICK ORDER</span><h2>New order</h2></div><a class="text-link" href="/services" data-route="/services">Browse all services ${icon("arrow")}</a></div>
      ${orderWorkspaceMarkup()}
    </section>
    <section class="home-bottom-grid">
      <div class="section-panel">
        <div class="section-title compact"><div><span class="eyebrow">LATEST ACTIVITY</span><h2>Recent orders</h2></div><a class="text-link" href="/orders" data-route="/orders">See all ${icon("arrow")}</a></div>
        ${recent.length ? `<div class="mini-order-list">${recent.map(order => `<div class="mini-order"><span class="mini-service-icon">${icon("bag")}</span><div class="mini-order-copy"><b>${esc(order.serviceName || "Service order")}</b><small>${esc(String(order.id).slice(0, 12))} · ${date(order.createdAt)}</small></div><div class="mini-order-side">${statusPill(order.status)}<b>${money(order.amount)}</b></div></div>`).join("")}</div>` : `<div class="empty-inline"><span class="empty-icon">${icon("bag")}</span><b>No orders yet</b><p>Your order updates will appear here.</p><a class="text-link" href="/new-order" data-route="/new-order">Place your first order ${icon("arrow")}</a></div>`}
      </div>
      <aside class="help-card"><span class="help-illustration">${icon("support")}</span><span class="eyebrow">HERE TO HELP</span><h2>Questions along the way?</h2><p>Start a support conversation and keep replies together with your order details.</p><a class="btn btn-outline" href="${state.user ? "/support?new=1" : "/login"}" data-route="${state.user ? "/support?new=1" : "/login"}">Visit support ${icon("arrow")}</a></aside>
    </section>`;
  }

  function serviceCard(service, index = 0) {
    return `<article class="service-card" style="--delay:${index * 55}ms">
      <div class="service-card-head"><span class="service-symbol">${esc((service.category || "S").trim().charAt(0).toUpperCase())}</span><span class="service-category">${esc(service.category || "Other")}</span></div>
      <h3>${esc(service.name)}</h3><p>${esc(service.description || "Review service details, quantity limits and delivery information before placing an order.")}</p>
      <div class="service-limits"><span>Min <b>${Number(service.min).toLocaleString("en-IN")}</b></span><span>Max <b>${Number(service.max).toLocaleString("en-IN")}</b></span></div>
      <div class="service-card-foot"><div><b>${money(service.pricePer1000)}</b><small>${service.pricingModel === "fixed" ? "per order" : "per 1,000"}</small></div><a class="btn btn-small btn-primary" href="/new-order?service=${encodeURIComponent(service.id)}" data-order-service="${esc(service.id)}">Select ${icon("arrow")}</a></div>
    </article>`;
  }

  function renderServicesPage() {
    const cats = [...new Set(state.services.map(s => s.category || "Other"))];
    const filtered = state.serviceCat === "all" ? state.services : state.services.filter(s => (s.category || "Other") === state.serviceCat);
    return `<section class="page-intro services-intro"><div><span class="eyebrow">SERVICE CATALOGUE</span><h1>Find the right<br><em>service for you.</em></h1><p>Filter by platform, compare rates and start your order in one tap.</p></div><div class="intro-art">${icon("search")}<span>Explore<br>with ease</span></div></section>
      ${state.serviceError ? `<div class="notice notice-error">${esc(state.serviceError)} <button type="button" data-retry-services>Retry</button></div>` : ""}
      <section class="catalog-toolbar"><label class="search-field">${icon("search")}<input type="search" id="catalogSearch" placeholder="Search service name, category or description" autocomplete="off"></label><span class="result-count" id="catalogCount">${filtered.length} services</span></section>
      ${cats.length ? `<div class="category-filter-bar" id="serviceCatBar"><button type="button" class="cat-chip ${state.serviceCat === "all" ? "active" : ""}" data-service-cat="all">All platforms</button>${cats.map(c => `<button type="button" class="cat-chip ${state.serviceCat === c ? "active" : ""}" data-service-cat="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : ""}
      <section class="catalog-grid" id="catalogGrid">${filtered.length ? filtered.map(serviceCard).join("") : `<div class="empty-panel">${state.serviceError ? "The service list is unavailable. Try again shortly." : "No services are available yet."}</div>`}</section>
      <p class="catalog-note">${icon("lock")} Prices are shown in INR. Final order cost is calculated and validated by the server before wallet deduction.</p>`;
  }

  function orderWorkspaceMarkup() {
    const categories = state.categories.filter(category => state.services.some(service => service.category === category.name));
    const queryService = new URLSearchParams(location.search).get("service");
    const candidate = state.services.find(service => service.id === (queryService || state.orderServiceId));
    if (candidate) {
      state.orderServiceId = candidate.id;
      state.orderCategory = candidate.category;
    }
    if (!categories.some(category => category.name === state.orderCategory)) state.orderCategory = categories[0]?.name || "";
    const available = state.services.filter(service => service.category === state.orderCategory);
    if (!available.some(service => service.id === state.orderServiceId)) state.orderServiceId = available[0]?.id || "";
    const selected = state.services.find(service => service.id === state.orderServiceId) || null;
    return `<div class="order-workspace">
        <section class="order-main">
          <div class="order-progress"><span class="progress-node current"><i>1</i><b>Platform</b></span><span class="progress-line"></span><span class="progress-node ${selected ? "current" : ""}"><i>2</i><b>Service</b></span><span class="progress-line"></span><span class="progress-node"><i>3</i><b>Details</b></span></div>
          <section class="order-step-card">
            <div class="step-title"><span class="step-number">01</span><div><h2>Select a platform</h2><p>Choose the category that best matches your request.</p></div></div>
            <div class="platform-picker" id="platformPicker">${categories.length ? categories.map(category => `<button type="button" class="platform-option ${category.name === state.orderCategory ? "selected" : ""}" data-order-category="${esc(category.name)}"><span class="platform-icon">${categoryGlyph(category)}</span><span><b>${esc(category.name)}</b><small>${state.services.filter(service => service.category === category.name).length} services</small></span><i class="option-check">${icon("check")}</i></button>`).join("") : `<div class="empty-panel">${state.serviceError ? "Categories could not be loaded." : "Service categories will appear when the catalogue is ready."}</div>`}</div>
          </section>
          <section class="order-step-card">
            <div class="step-title"><span class="step-number">02</span><div><h2>Choose a service</h2><p>Check its price, limits and service notes before continuing.</p></div></div>
            <label class="field-label" for="orderServiceSearch">Search this category</label>
            <label class="search-field service-search-field">${icon("search")}<input id="orderServiceSearch" type="search" placeholder="Type a service name" autocomplete="off"></label>
            <label class="field-label" for="orderServiceSelect">Available services</label>
            <select class="form-control service-select" id="orderServiceSelect">${available.map(service => `<option value="${esc(service.id)}" ${service.id === state.orderServiceId ? "selected" : ""}>${esc(service.name)} — ${money(service.pricePer1000)} ${service.pricingModel === "fixed" ? "/ order" : "/ 1,000"}</option>`).join("")}</select>
            <div class="service-selected-preview" id="serviceSelectedPreview">${selected ? `<span class="service-preview-icon">${esc((selected.category || "S").charAt(0))}</span><div><b>${esc(selected.name)}</b><small>${esc(selected.description || "No additional description provided.")}</small></div><span class="preview-price">${money(selected.pricePer1000)}<small>${selected.pricingModel === "fixed" ? "per order" : "per 1,000"}</small></span>` : `<div class="empty-inline">Choose a category with an available service.</div>`}</div>
          </section>
          <section class="order-step-card">
            <div class="step-title"><span class="step-number">03</span><div><h2>Enter order details</h2><p>Provide the target URL and a quantity within the service limits.</p></div></div>
            <form id="orderForm" class="order-form">
              <label class="field-label" for="orderLink">Target link</label><input class="form-control" id="orderLink" name="link" type="url" required placeholder="https://www.example.com/your-page">
              <div class="field-row"><div><label class="field-label" for="orderQuantity">Quantity</label><input class="form-control" id="orderQuantity" name="quantity" type="number" step="1" min="${selected?.min || 1}" max="${selected?.max || 1}" value="${selected?.min || 1}" ${selected?.pricingModel === "fixed" ? "readonly" : ""} required></div><div class="quantity-limit"><span>Allowed range</span><b id="quantityRange">${selected ? `${Number(selected.min).toLocaleString("en-IN")} – ${Number(selected.max).toLocaleString("en-IN")}` : "—"}</b></div></div>
              <div class="quantity-presets" id="quantityPresets">${selected && selected.pricingModel !== "fixed" ? quantityPresets(selected).map(value => `<button type="button" data-quantity="${value}">${Number(value).toLocaleString("en-IN")}</button>`).join("") : ""}</div>
              <div class="promo-box">
                <label class="field-label" for="orderPromoInput">Promo code <span class="optional">(optional)</span></label>
                <div class="promo-row">
                  <input class="form-control" id="orderPromoInput" type="text" maxlength="40" placeholder="Enter coupon code" value="${esc(state.orderPromo?.code || "")}">
                  <button type="button" class="btn btn-outline" id="applyOrderPromo">Apply</button>
                  ${state.orderPromo ? `<button type="button" class="btn btn-quiet" id="clearOrderPromo">Remove</button>` : ""}
                </div>
                <div class="promo-status" id="orderPromoStatus">${state.orderPromo ? `<span class="promo-applied">Applied ${esc(state.orderPromo.code)} (−${money(state.orderPromo.effectAmount)})</span>` : ""}</div>
              </div>
              <p class="field-hint" id="orderHint">${selected?.pricingModel === "fixed" ? "This service has a fixed price per order." : "The total updates as you change the quantity."}</p>
              <div class="form-error" id="orderError" role="alert"></div>
              <button class="btn btn-primary btn-large submit-order" id="reviewOrder" type="submit" ${selected ? "" : "disabled"}>Review order ${icon("arrow")}</button>
            </form>
          </section>
        </section>
        <aside class="order-aside">
          <section class="order-aside-card service-info-card" id="serviceInfoCard">${renderServiceInfo(selected)}</section>
          <section class="order-aside-card charge-card">
            <div class="charge-card-title"><span class="charge-icon">${icon("wallet")}</span><div><small>ORDER SUMMARY</small><b>Estimated charge</b></div></div>
            <div class="charge-line"><span>Service</span><b class="truncate" id="chargeService">${esc(selected?.name || "Select a service")}</b></div>
            <div class="charge-line"><span>Quantity</span><b id="chargeQuantity">${Number(selected?.min || 1).toLocaleString("en-IN")}</b></div>
            <div class="charge-line" id="chargeDiscountRow" hidden><span>Promo discount</span><b class="positive" id="chargeDiscount">−₹0.00</b></div><div class="charge-total"><span>Total charge</span><b id="chargeTotal">${money(selected ? calculateCost(selected, selected.min) : 0)}</b></div>
            <div class="balance-after"><span>Available balance</span><b id="chargeBalance">${money(state.user?.balance || 0)}</b><small id="balanceAfterNote">${state.user ? "Your balance after this order" : "Sign in to see your balance"}</small><strong id="remainingBalance">${money((state.user?.balance || 0) - (selected ? calculateCost(selected, selected.min) : 0))}</strong></div>
            <p class="charge-footnote">${icon("lock")} Server verifies the service price and balance when you place the order.</p>
          </section>
          <a class="support-nudge" href="${state.user ? "/support?new=1" : "/login"}" data-route="${state.user ? "/support?new=1" : "/login"}"><span>${icon("support")}</span><span><b>Need help choosing?</b><small>Our support team can help.</small></span>${icon("arrow")}</a>
        </aside>
      </div>`;
  }

  function renderOrderPage() {
    return `<section class="order-heading"><div><span class="eyebrow">ORDER DESK / STEP-BY-STEP</span><h1>Build your <em>new order.</em></h1><p>Choose a platform, review a service and see your total before you confirm.</p></div><a class="text-link" href="/services" data-route="/services">${icon("search")} Browse full catalogue</a></section>
      ${state.serviceError ? `<div class="notice notice-error">${esc(state.serviceError)} <button type="button" data-retry-services>Try again</button></div>` : ""}
      ${orderWorkspaceMarkup()}`;
  }

  function quantityPresets(service) {
    const min = Number(service.min);
    const max = Number(service.max);
    return [...new Set([min, 500, 1000, 2500, 5000, max].filter(value => value >= min && value <= max))].slice(0, 5);
  }
  function calculateCost(service, quantity) {
    const raw = service.pricingModel === "fixed" ? Number(service.pricePer1000) : Math.max(1, Number(quantity || 0) * Number(service.pricePer1000) / 1000);
    return Math.round((raw + Number.EPSILON) * 100) / 100;
  }
  function renderServiceInfo(service) {
    if (!service) return `<div class="service-info-empty"><span class="info-orbit">${icon("bag")}</span><span class="eyebrow">SERVICE DETAILS</span><h3>Details appear here</h3><p>Select a service to review the limits, delivery notes and refill information.</p></div>`;
    return `<div class="service-info-top"><span class="eyebrow">SERVICE DETAILS</span><span class="service-id">ID ${esc(String(service.id).slice(0, 12))}</span></div><h2>${esc(service.name)}</h2><p class="service-info-description">${esc(service.description || "No additional service description was provided.")}</p>
      <div class="info-metrics"><div><small>PRICE</small><b>${money(service.pricePer1000)}</b><span>${service.pricingModel === "fixed" ? "per order" : "per 1,000"}</span></div><div><small>QUANTITY</small><b>${Number(service.min).toLocaleString("en-IN")} – ${Number(service.max).toLocaleString("en-IN")}</b><span>min – max</span></div></div>
      <div class="service-facts"><div><span class="fact-icon">${icon("clock")}</span><span><b>Delivery details</b><small>${esc(service.processingDetails || "Timing details not provided")}</small></span></div><div><span class="fact-icon">${icon("check")}</span><span><b>Refill</b><small>${service.refill ? "Available for this service" : "Not listed for this service"}</small></span></div><div><span class="fact-icon">${icon("lock")}</span><span><b>Fulfilment</b><small>${service.source === "luvsmm" ? "Supplier-connected service" : "Manual service"}</small></span></div></div>
      <div class="service-info-disclaimer">Review all service details and link carefully before submitting. Orders are processed according to the service description.</div>`;
  }

  function renderOrdersPage() {
    return `<section class="page-intro orders-intro"><div><span class="eyebrow">YOUR ACTIVITY</span><h1>Orders, clearly<br><em>tracked.</em></h1><p>Search your order history, filter by status and open any order to review its details.</p></div><a class="btn btn-primary" href="/new-order" data-route="/new-order">Create new order ${icon("arrow")}</a></section>
      <section class="order-stat-strip"><div><small>ALL ORDERS</small><b>${state.orders.length}</b></div><div><small>COMPLETED</small><b>${state.orders.filter(order => String(order.status).toLowerCase() === "completed").length}</b></div><div><small>IN PROGRESS</small><b>${state.orders.filter(order => !["completed", "canceled", "refunded", "partially refunded"].includes(String(order.status).toLowerCase())).length}</b></div><div><small>REFUNDED</small><b>${state.orders.filter(order => String(order.status).toLowerCase().includes("refund")).length}</b></div></section>
      ${state.dataErrors.orders ? `<div class="notice notice-error">${esc(state.dataErrors.orders)} <button type="button" data-refresh-account>Try again</button></div>` : ""}
      <section class="orders-panel">
        <div class="orders-toolbar"><div><span class="eyebrow">ORDER HISTORY</span><h2>All orders <small id="ordersCount">${state.orders.length}</small></h2></div><div class="orders-filters"><label class="search-field">${icon("search")}<input type="search" id="ordersSearch" placeholder="Search order ID or service"></label><select class="form-control compact-select" id="ordersStatus"><option value="all">All statuses</option>${["Pending", "Processing", "Completed", "Partial", "Canceled", "Refunded", "Partially refunded", "Awaiting review", "Supplier confirmation needed"].map(status => `<option>${status}</option>`).join("")}</select><select class="form-control compact-select" id="ordersDate"><option value="all">Any date</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></div></div>
        <div class="orders-table-wrap"><table class="orders-table"><thead><tr><th>ORDER</th><th>SERVICE</th><th>QUANTITY</th><th>AMOUNT</th><th>STATUS</th><th></th></tr></thead><tbody id="ordersRows"></tbody></table></div>
        <div class="orders-cards" id="ordersCards"></div>
        <div class="orders-pagination" id="ordersPagination"></div>
      </section>`;
  }
  function filteredOrders() {
    const root = $("#pageContent");
    const query = ($("#ordersSearch", root)?.value || "").trim().toLowerCase();
    const status = $("#ordersStatus", root)?.value || "all";
    const days = $("#ordersDate", root)?.value || "all";
    const since = days === "all" ? null : Date.now() - Number(days) * 86400000;
    return state.orders.filter(order => {
      const matchesQuery = !query || `${order.id} ${order.serviceName || ""} ${order.category || ""}`.toLowerCase().includes(query);
      const matchesStatus = status === "all" || String(order.status).toLowerCase() === status.toLowerCase();
      const created = new Date(order.createdAt).getTime();
      const matchesDate = !since || (Number.isFinite(created) && created >= since);
      return matchesQuery && matchesStatus && matchesDate;
    });
  }
  function renderOrderRow(order, mobile = false) {
    const details = `<div class="order-detail-grid"><div><small>Order ID</small><b>${esc(order.id)}</b></div><div><small>Order date</small><b>${date(order.createdAt)}</b></div><div><small>Order link</small><a href="${esc(order.link || "#")}" target="_blank" rel="noopener noreferrer">${esc(order.link || "—")}</a></div><div><small>Supplier order ID</small><b>${esc(order.supplierOrderId || "Not applicable")}</b></div><div><small>Category</small><b>${esc(order.category || "—")}</b></div><div><small>Updates</small><b>${esc(order.dispatchNote || order.adminNote || "No additional update")}</b></div></div>`;
    if (mobile) return `<details class="order-mobile-card"><summary><div class="order-mobile-top"><span class="mono">#${esc(String(order.id).slice(0, 12))}</span>${statusPill(order.status)}</div><b>${esc(order.serviceName || "Service order")}</b><div class="order-mobile-meta"><span>Qty ${Number(order.quantity || 0).toLocaleString("en-IN")}</span><strong>${money(order.amount)}</strong></div></summary>${details}</details>`;
    return `<tr><td><button class="order-id-button" type="button" data-order-detail="${esc(order.id)}">#${esc(String(order.id).slice(0, 12))}</button><small>${date(order.createdAt)}</small></td><td><b>${esc(order.serviceName || "Service order")}</b><small>${esc(order.category || "—")}</small></td><td>${Number(order.quantity || 0).toLocaleString("en-IN")}</td><td><b>${money(order.amount)}</b></td><td>${statusPill(order.status)}</td><td><button class="icon-button details-button" type="button" data-order-detail="${esc(order.id)}" aria-label="View order details">↗</button></td></tr>`;
  }
  function updateOrdersList() {
    const filtered = filteredOrders();
    const pages = Math.max(1, Math.ceil(filtered.length / 10));
    state.orderPage = Math.min(state.orderPage, pages);
    const shown = filtered.slice((state.orderPage - 1) * 10, state.orderPage * 10);
    $("#ordersCount").textContent = String(filtered.length);
    $("#ordersRows").innerHTML = shown.length ? shown.map(order => renderOrderRow(order)).join("") : `<tr><td colspan="6"><div class="empty-inline"><b>No matching orders</b><p>Try changing the search or filters.</p></div></td></tr>`;
    $("#ordersCards").innerHTML = shown.length ? shown.map(order => renderOrderRow(order, true)).join("") : `<div class="empty-inline"><b>No matching orders</b><p>Try changing the search or filters.</p></div>`;
    $("#ordersPagination").innerHTML = pages > 1 ? `<button type="button" data-order-page="${state.orderPage - 1}" ${state.orderPage <= 1 ? "disabled" : ""}>Previous</button><span>Page ${state.orderPage} of ${pages}</span><button type="button" data-order-page="${state.orderPage + 1}" ${state.orderPage >= pages ? "disabled" : ""}>Next</button>` : `<span>${filtered.length ? `Showing ${filtered.length} order${filtered.length === 1 ? "" : "s"}` : ""}</span>`;
  }

  function computeSlabBonus(amount) {
    const slabs = state.config?.depositBonuses || [];
    const isFirst = !state.wallet?.hasPaidDeposit;
    let best = 0;
    let label = "";
    for (const s of slabs) {
      if (s.firstDepositOnly && !isFirst) continue;
      if (amount < Number(s.minAmount || 0)) continue;
      const b = s.bonusType === "percent" ? Math.round((amount * Number(s.bonusValue || 0) / 100 + Number.EPSILON) * 100) / 100 : Number(s.bonusValue || 0);
      if (b > best) { best = b; label = s.title || "Deposit bonus"; }
    }
    return { bonus: best, label };
  }

  function renderWalletPage() {
    const minDeposit = Number(state.config?.minDeposit || state.config?.minDepositInr || 50);
    const transactions = state.wallet?.transactions || [];
    const quickAmounts = [100, 200, 500, 1000, 2000].filter(amount => amount >= minDeposit);
    const slabs = (state.config?.depositBonuses || []).filter(s => !s.firstDepositOnly || !state.wallet?.hasPaidDeposit);
    const defaultAmt = Math.max(minDeposit, 200);
    return `<section class="wallet-hero"><div><span class="eyebrow">WALLET CENTER</span><h1>Keep your work<br><em>moving forward.</em></h1><p>Recharge securely and keep a clear record of every wallet movement.</p></div><div class="wallet-total-card"><span>${icon("wallet")} AVAILABLE BALANCE</span><b>${money(state.user?.balance || 0)}</b><small>Your wallet is only credited after payment verification.</small></div></section>
      ${slabs.length ? `<section class="bonus-offers-strip">${slabs.map(s => `<div class="offer-chip"><span class="offer-tag">${s.firstDepositOnly ? "FIRST DEPOSIT" : "BONUS"}</span><div><b>${esc(s.title || "Deposit Bonus")}</b><small>Add ${money(s.minAmount)}+ → Get +${s.bonusType === "percent" ? `${Number(s.bonusValue)}%` : money(s.bonusValue)} extra</small></div></div>`).join("")}</section>` : ""}
      <div class="wallet-layout">
        <section class="deposit-panel"><div class="panel-heading"><span class="panel-icon">${icon("plus")}</span><div><span class="eyebrow">ADD FUNDS</span><h2>Recharge your wallet</h2><p>Choose an amount and continue to secure Razorpay checkout.</p></div></div>
          <div class="minimum-note">${icon("lock")} Minimum deposit: <b>${money(minDeposit)}</b><span>Maximum ₹50,000 per payment</span></div>
          <form id="walletForm" class="wallet-form"><label class="field-label" for="walletAmount">Amount in INR</label><div class="amount-input-wrap"><span>₹</span><input id="walletAmount" name="amount" type="number" min="${minDeposit}" max="50000" step="1" value="${defaultAmt}" required></div><div class="quick-amounts">${quickAmounts.map(amount => `<button type="button" data-amount="${amount}">${money(amount)}</button>`).join("")}</div>
          <div class="promo-box">
            <label class="field-label" for="walletPromoInput">Promo code <span class="optional">(optional)</span></label>
            <div class="promo-row">
              <input class="form-control" id="walletPromoInput" type="text" maxlength="40" placeholder="Enter deposit promo code" value="${esc(state.walletPromo?.code || "")}">
              <button type="button" class="btn btn-outline" id="applyWalletPromo">Apply</button>
              ${state.walletPromo ? `<button type="button" class="btn btn-quiet" id="clearWalletPromo">Remove</button>` : ""}
            </div>
            <div class="promo-status" id="walletPromoStatus">${state.walletPromo ? `<span class="promo-applied">Applied ${esc(state.walletPromo.code)} (+${money(state.walletPromo.effectAmount)} bonus)</span>` : ""}</div>
          </div>
          <div class="bonus-preview" id="walletBonusPreview"></div>
          <div class="payment-method"><span class="razorpay-mark">R</span><span><b>Razorpay secure checkout</b><small>Cards, UPI and supported payment methods</small></span><span class="secure-check">${icon("lock")}</span></div><div class="form-error" id="walletError" role="alert"></div><button class="btn btn-primary btn-large full-width" type="submit" id="payButton">Continue to payment ${icon("arrow")}</button></form>
          <p class="security-note">${icon("lock")} Payment details are handled by Razorpay. Mintu SMM never receives your card or UPI credentials.</p>
        </section>
        <aside class="wallet-side"><div class="wallet-side-title"><span class="eyebrow">YOUR WALLET</span><h2>Simple and transparent</h2></div><div class="wallet-benefit">${icon("check")}<span><b>Verified payments</b><small>Funds are credited only after server-side payment verification.</small></span></div><div class="wallet-benefit">${icon("order")}<span><b>Track every movement</b><small>Deposits, order deductions and refunds appear in your ledger.</small></span></div><div class="wallet-help"><b>Need help with a payment?</b><p>Raise a support ticket and include the payment reference if available.</p><a href="/support?new=1" data-route="/support?new=1">Contact support ${icon("arrow")}</a></div></aside>
      </div>
      ${state.dataErrors.wallet ? `<div class="notice notice-error">${esc(state.dataErrors.wallet)} <button type="button" data-refresh-account>Retry wallet history</button></div>` : ""}
      <section class="transactions-panel"><div class="section-title"><div><span class="eyebrow">WALLET LEDGER</span><h2>Transaction history</h2><p>A record of your deposits, order payments and refunds.</p></div><button type="button" class="btn btn-outline" id="refreshWallet">${icon("refresh")} Refresh</button></div><div class="transaction-list">${transactions.length ? transactions.map(transaction => `<article class="transaction-row"><span class="transaction-icon ${Number(transaction.amount) >= 0 ? "credit" : "debit"}">${icon(Number(transaction.amount) >= 0 ? "plus" : "bag")}</span><div class="transaction-copy"><b>${esc(transaction.note || transaction.type || "Wallet transaction")}</b><small>${date(transaction.createdAt)} · ${esc(transaction.reference || "Wallet ledger")}</small></div><span class="transaction-type">${esc(transaction.type || "entry")}</span><b class="transaction-amount ${Number(transaction.amount) >= 0 ? "positive" : ""}">${Number(transaction.amount) >= 0 ? "+" : "−"}${money(Math.abs(Number(transaction.amount)))}</b></article>`).join("") : `<div class="empty-inline"><span class="empty-icon">${icon("wallet")}</span><b>No transactions yet</b><p>Your wallet activity will show here after your first payment or order.</p></div>`}</div></section>`;
  }

  function renderSupportPage() {
    const params = new URLSearchParams(location.search);
    const activeId = params.get("ticket");
    const createNew = params.get("new") === "1";
    const ticket = state.tickets.find(item => item.id === activeId);
    return `<section class="support-hero"><div><span class="eyebrow">CUSTOMER CARE</span><h1>Support that keeps<br><em>things clear.</em></h1><p>Start a conversation, include an order if relevant and follow replies in one place.</p></div><a class="btn btn-primary" href="/support?new=1" data-route="/support?new=1">${icon("plus")} New complaint</a></section>
      ${state.dataErrors.tickets ? `<div class="notice notice-error">${esc(state.dataErrors.tickets)} <button type="button" data-refresh-account>Retry tickets</button></div>` : ""}
      <div class="support-layout">
        <aside class="ticket-list-panel"><div class="ticket-list-heading"><div><span class="eyebrow">YOUR TICKETS</span><h2>Conversations <small>${state.tickets.length}</small></h2></div><button class="icon-button" type="button" id="refreshTickets" aria-label="Refresh tickets">${icon("refresh")}</button></div>
          <div class="ticket-list">${state.tickets.length ? state.tickets.map(item => `<a class="ticket-list-item ${item.id === activeId ? "selected" : ""}" href="/support?ticket=${encodeURIComponent(item.id)}" data-route="/support?ticket=${encodeURIComponent(item.id)}"><span class="ticket-list-icon">${icon("support")}</span><span class="ticket-list-copy"><b>${esc(item.subject)}</b><small>${esc(item.category || "Other")} · ${date(item.updated_at)}</small><span>${esc(item.messages?.[item.messages.length - 1]?.message || "No messages")}</span></span>${statusPill(item.status)}</a>`).join("") : `<div class="empty-inline"><b>No conversations yet</b><p>Your support tickets will be kept here.</p></div>`}</div>
        </aside>
        <section class="ticket-conversation-panel">
          ${createNew ? ticketFormMarkup() : ticket ? ticketConversationMarkup(ticket) : `<div class="conversation-empty"><span class="conversation-empty-icon">${icon("support")}</span><span class="eyebrow">SUPPORT DESK</span><h2>How can we help?</h2><p>Select a conversation to view replies, or open a new complaint and our team will follow up here.</p><a class="btn btn-primary" href="/support?new=1" data-route="/support?new=1">Start a conversation ${icon("arrow")}</a></div>`}
        </section>
      </div>`;
  }
  function ticketFormMarkup() {
    return `<div class="conversation-heading"><div><span class="eyebrow">NEW SUPPORT REQUEST</span><h2>Tell us what happened.</h2><p>Include enough detail so our team can help without unnecessary back-and-forth.</p></div><a class="icon-button" href="/support" data-route="/support" aria-label="Close">×</a></div>
      <form class="ticket-form" id="ticketForm"><label class="field-label" for="ticketCategory">Issue category</label><select class="form-control" id="ticketCategory" name="category"><option>Order issue</option><option>Payment or wallet</option><option>Service question</option><option>Account access</option><option>Other</option></select>
      <label class="field-label" for="ticketSubject">Subject</label><input class="form-control" id="ticketSubject" name="subject" required minlength="3" maxlength="160" placeholder="Briefly describe your issue">
      <label class="field-label" for="ticketOrder">Related order <span class="optional">(optional)</span></label><select class="form-control" id="ticketOrder" name="orderId"><option value="">Not related to a specific order</option>${state.orders.map(order => `<option value="${esc(order.id)}">${esc(String(order.id).slice(0, 12))} · ${esc(order.serviceName || "Order")} · ${esc(order.status)}</option>`).join("")}</select>
      <label class="field-label" for="ticketMessage">Details</label><textarea class="form-control" id="ticketMessage" name="message" rows="6" required minlength="5" maxlength="4000" placeholder="Share what you expected, what happened, and any useful context."></textarea>
      <div class="form-error" id="ticketError" role="alert"></div><div class="ticket-form-actions"><a class="btn btn-outline" href="/support" data-route="/support">Cancel</a><button class="btn btn-primary" type="submit" id="ticketSubmit">Submit complaint ${icon("arrow")}</button></div></form>`;
  }
  function ticketConversationMarkup(ticket) {
    const messages = ticket.messages || [];
    return `<div class="conversation-heading"><div><span class="eyebrow">${esc(ticket.category || "SUPPORT")} · ${esc(String(ticket.id).slice(0, 8))}</span><h2>${esc(ticket.subject)}</h2><p>Created ${date(ticket.created_at)}${ticket.order_id ? ` · Order ${esc(String(ticket.order_id).slice(0, 12))}` : ""}</p></div>${statusPill(ticket.status)}</div>
      <div class="conversation-thread">${messages.length ? messages.map(message => `<article class="message-bubble ${message.author_role === "admin" ? "support-reply" : "customer-message"}"><span>${message.author_role === "admin" ? "Mintu SMM support" : "You"}</span><p>${esc(message.message)}</p><small>${date(message.created_at)}</small></article>`).join("") : `<div class="empty-inline">There are no messages in this ticket yet.</div>`}</div>
      ${ticket.status !== "Resolved" ? `<form class="ticket-reply-form" id="ticketReplyForm" data-ticket-id="${esc(ticket.id)}"><label class="field-label" for="ticketReply">Reply to this conversation</label><div class="reply-input-row"><textarea class="form-control" id="ticketReply" name="message" rows="2" maxlength="4000" required placeholder="Write a message…"></textarea><button class="btn btn-primary" type="submit" id="replySubmit" aria-label="Send reply">${icon("arrow")}</button></div><div class="form-error" id="replyError" role="alert"></div></form>` : `<div class="resolved-note">${icon("check")} This ticket is resolved. Create a new complaint if you need more help.</div>`}`;
  }

  function renderProfilePage() {
    const avatar = selectedUserAvatar();
    const transactions = state.wallet?.transactions || [];
    const created = state.user?.createdAt;
    return `<section class="profile-cover"><div class="profile-cover-art"><span></span><span></span><span></span></div><div class="profile-identity"><span class="profile-avatar-large">${avatar}</span><div><span class="eyebrow">ACCOUNT CENTER</span><h1>${esc(state.user?.name || "Your profile")}</h1><p>${esc(state.user?.email || "")}</p></div><span class="account-provider">${state.user?.authProvider === "google" ? "Google account" : "Email account"}</span></div></section>
      <div class="profile-grid">
        <section class="profile-details-panel"><div class="section-title compact"><div><span class="eyebrow">PERSONAL DETAILS</span><h2>Your account</h2></div></div><div class="profile-detail-list"><div><span>Full name</span><b>${esc(state.user?.name || "—")}</b></div><div><span>Email address</span><b>${esc(state.user?.email || "—")}</b></div><div><span>Sign-in method</span><b>${state.user?.authProvider === "google" ? "Google" : "Email and password"}</b></div><div><span>Account created</span><b>${date(created)}</b></div><div><span>Account ID</span><b class="profile-id">${esc(state.user?.id || "—")}</b></div></div><p class="profile-note">${icon("lock")} Sensitive authentication details are never shown here. For account access or credential help, contact support.</p></section>
        <aside class="profile-security-panel"><span class="security-illustration">${icon("lock")}</span><span class="eyebrow">ACCOUNT SECURITY</span><h2>Your account, protected.</h2><p>Never share your password or payment details with anyone. Sign out when using a shared device.</p><button class="btn btn-outline full-width" type="button" id="profileLogout">Log out of Mintu SMM ${icon("arrow")}</button><a class="profile-help-link" href="/support?new=1" data-route="/support?new=1">Need account help? Contact support</a></aside>
      </div>
      ${state.dataErrors.wallet ? `<div class="notice notice-error">${esc(state.dataErrors.wallet)} <button type="button" data-refresh-account>Retry wallet history</button></div>` : ""}
      <section class="profile-details-panel" id="referEarnCard" style="margin-bottom:18px">
        <div class="section-title compact"><div><span class="eyebrow">REFER &amp; EARN</span><h2>Invite friends &amp; earn wallet cash</h2></div></div>
        <div class="profile-detail-list">
          <div><span>Your Invite Link</span><b class="mono break-anywhere">${state.user?.referralCode ? `${esc(location.origin)}/signup?ref=${esc(state.user.referralCode)}` : "Loading…"}</b></div>
          <div><span>Reward Rate</span><b>${state.config?.referral?.bonusType === "fixed" ? money(state.config?.referral?.bonusValue || 0) : `${Number(state.config?.referral?.bonusValue ?? 5)}%`} on friend's 1st deposit</b></div>
          <div><span>Friends Invited</span><b>${Number(state.user?.invitedCount || 0)}</b></div>
          <div><span>Total Referral Earnings</span><b class="positive">${money(state.user?.referralEarnings || 0)}</b></div>
        </div>
        <div class="welcome-actions" style="margin-top:14px">
          <button type="button" class="btn btn-primary btn-small" id="copyReferralLink">Copy Invite Link</button>
          <a class="btn btn-outline btn-small" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=${encodeURIComponent(`Join Mintu SMM using my link & get started: ${location.origin}/signup?ref=${state.user?.referralCode || ""}`)}">Share on WhatsApp</a>
        </div>
      </section>
      <section class="profile-details-panel" style="margin-bottom:18px">
        <div class="section-title compact"><div><span class="eyebrow">RESELLER API v2</span><h2>Developer & Panel API</h2></div></div>
        <div class="profile-detail-list">
          <div><span>API Endpoint (POST)</span><b class="mono break-anywhere">${esc(location.origin)}/api/v2</b></div>
          <div><span>Your API Key</span><b class="mono break-anywhere" id="profileApiKeyText">${state.user?.apiKey ? esc(state.user.apiKey) : "Not generated yet"}</b></div>
        </div>
        <div class="welcome-actions" style="margin-top:14px">
          <button type="button" class="btn btn-primary btn-small" id="generateApiKey">${state.user?.apiKey ? "Regenerate API Key" : "Generate API Key"}</button>
          ${state.user?.apiKey ? `<button type="button" class="btn btn-outline btn-small" id="copyApiKey">Copy Key</button>` : ""}
        </div>
        <p class="profile-note">${icon("lock")} Supports standard SMM parameters: <code>key</code>, <code>action</code> (<code>balance</code>, <code>services</code>, <code>add</code>, <code>status</code>).</p>
      </section>
      <section class="profile-activity"><div class="section-title"><div><span class="eyebrow">RECENT WALLET ACTIVITY</span><h2>Latest transactions</h2><p>Your most recent wallet changes.</p></div><a class="text-link" href="/wallet" data-route="/wallet">Open wallet ${icon("arrow")}</a></div>${transactions.length ? `<div class="transaction-list">${transactions.slice(0, 4).map(transaction => `<article class="transaction-row"><span class="transaction-icon ${Number(transaction.amount) >= 0 ? "credit" : "debit"}">${icon(Number(transaction.amount) >= 0 ? "plus" : "bag")}</span><div class="transaction-copy"><b>${esc(transaction.note || transaction.type || "Wallet transaction")}</b><small>${date(transaction.createdAt)} · ${esc(transaction.reference || "")}</small></div><span class="transaction-type">${esc(transaction.type || "entry")}</span><b class="transaction-amount ${Number(transaction.amount) >= 0 ? "positive" : ""}">${Number(transaction.amount) >= 0 ? "+" : "−"}${money(Math.abs(Number(transaction.amount)))}</b></article>`).join("")}</div>` : `<div class="empty-inline"><b>No wallet activity yet</b><p>Transactions will appear here after you add funds or place an order.</p></div>`}</section>`;
  }

  function renderAuth(mode) {
    const isSignup = mode === "signup";
    const supportEmail = state.config?.supportEmail || "support@example.com";
    const next = new URLSearchParams(location.search).get("next");
    $("#authRoot").innerHTML = `<div class="auth-layout">
      <section class="auth-brand-panel"><a class="brand auth-brand" href="/" data-route="/"><span class="brand-mark">M</span><span class="brand-copy"><b>${esc(state.config?.siteName || "Mintu SMM")}</b><small>GROWTH WORKSPACE</small></span></a><div class="auth-brand-copy"><span class="eyebrow"><i></i> YOUR WORK, IN ONE PLACE</span><h1>${isSignup ? "Start with a<br><em>clear plan.</em>" : "Welcome back<br><em>to your desk.</em>"}</h1><p>Manage services, wallet activity and customer support in a workspace built to keep everything simple.</p><div class="auth-points"><span>${icon("check")} Order tracking</span><span>${icon("lock")} Secure wallet</span><span>${icon("support")} Helpful support</span></div></div><div class="auth-brand-bottom">MINTU SMM <span>·</span> DIGITAL SERVICES</div></section>
      <section class="auth-form-panel"><div class="auth-theme-bar"><button class="theme-toggle" type="button" data-theme-toggle aria-label="Toggle dark or light mode" title="Switch theme">${icon(state.theme === "dark" ? "sun" : "moon")}</button></div><a class="auth-mobile-brand brand" href="/" data-route="/"><span class="brand-mark">M</span><span class="brand-copy"><b>${esc(state.config?.siteName || "Mintu SMM")}</b><small>GROWTH WORKSPACE</small></span></a><div class="auth-card">${isSignup && Number(state.config?.welcomeBonus || 0) > 0 && !getDeviceMeta().deviceClaimed ? `<div class="auth-bonus-pill">🎁 Get ${money(state.config.welcomeBonus)} Welcome Bonus</div>` : ""}${isSignup && getStoredReferralCode() ? `<div class="auth-bonus-pill">🤝 Referral code: ${esc(getStoredReferralCode())}</div>` : ""}<span class="eyebrow">${isSignup ? "CREATE YOUR ACCOUNT" : "ACCOUNT SIGN IN"}</span><h2>${isSignup ? "Create your account" : "Good to see you again."}</h2><p>${isSignup ? (Number(state.config?.welcomeBonus || 0) > 0 ? `A few details and your workspace is ready. Get ${money(state.config.welcomeBonus)} welcome bonus on signup.` : "A few details and your workspace is ready.") : "Sign in to manage your orders, wallet and support."}</p>
        <div class="auth-switch"><a class="${!isSignup ? "active" : ""}" href="/login${next ? `?next=${encodeURIComponent(next)}` : ""}" data-route="/login${next ? `?next=${encodeURIComponent(next)}` : ""}">Log in</a><a class="${isSignup ? "active" : ""}" href="/signup${next ? `?next=${encodeURIComponent(next)}` : ""}" data-route="/signup${next ? `?next=${encodeURIComponent(next)}` : ""}">Create account</a></div>
        ${state.config?.googleClientId ? `<div class="google-signin-wrap"><div id="googleSignInButton" aria-label="Continue with Google"></div><div class="form-error" id="googleAuthError" role="alert"></div></div><div class="auth-divider"><span>or continue with email</span></div>` : ""}
        <form id="authForm" class="auth-form" data-mode="${mode}" data-next="${esc(next || "/")}">
          ${isSignup ? `<label class="field-label" for="authName">Full name</label><input class="form-control" id="authName" name="name" autocomplete="name" minlength="2" maxlength="60" required placeholder="Your name">` : ""}
          <label class="field-label" for="authEmail">Email address</label><input class="form-control" id="authEmail" name="email" type="email" autocomplete="email" required placeholder="you@example.com">
          <label class="field-label" for="authPassword">Password</label><div class="password-wrap"><input class="form-control" id="authPassword" name="password" type="password" autocomplete="${isSignup ? "new-password" : "current-password"}" minlength="8" required placeholder="At least 8 characters"><button type="button" class="password-toggle" data-toggle-password aria-label="Show password">Show</button></div>
          ${isSignup ? `<div class="password-strength" id="passwordStrength"><span></span><span></span><span></span><span></span><small>Use at least 8 characters.</small></div>` : `<div class="auth-options"><span class="remember-option">${icon("lock")} Protected sign-in</span><a href="mailto:${esc(supportEmail)}?subject=Password%20help">Need password help?</a></div>`}
          <div class="form-error" id="authError" role="alert"></div><button class="btn btn-primary btn-large full-width" type="submit" id="authSubmit">${isSignup ? "Create account" : "Log in"} ${icon("arrow")}</button>
        </form><p class="auth-legal">By continuing, you agree to use services lawfully and follow the relevant platform terms.</p><a class="back-home" href="/" data-route="/">← Back to Mintu SMM</a></div><span class="auth-footer">© ${new Date().getFullYear()} ${esc(state.config?.siteName || "Mintu SMM")}</span></section>
    </div>`;
    const form = $("#authForm");
    form.addEventListener("submit", submitAuth);
    if (state.config?.googleClientId) {
      const googleHost = $("#googleSignInButton");
      const googleError = $("#googleAuthError");
      const mountGoogleButton = (tries = 0) => {
        if (!googleHost.isConnected) return;
        if (!window.google?.accounts?.id) {
          if (tries === 0) googleHost.innerHTML = `<div class="google-loading"><span class="inline-spinner"></span><span>Loading Google sign-in…</span></div>`;
          if (tries < 25) return setTimeout(() => mountGoogleButton(tries + 1), 200);
          googleHost.innerHTML = "";
          googleError.textContent = "Google sign-in could not load. Check your connection or use email.";
          return;
        }
        try {
          googleHost.innerHTML = "";
          window.google.accounts.id.initialize({
            client_id: state.config.googleClientId,
            callback: async response => {
              if (!response?.credential) {
                googleError.textContent = "Google did not return a sign-in credential. Please try again.";
                return;
              }
              googleError.textContent = "";
              googleHost.innerHTML = `<div class="google-loading"><span class="inline-spinner"></span><span>Signing in with Google…</span></div>`;
              try {
                const authResult = await api("/api/auth/google", { method: "POST", body: JSON.stringify({ credential: response.credential, referralCode: getStoredReferralCode(), ...getDeviceMeta() }) });
                if (Number(authResult?.welcomeBonus || 0) > 0) markDeviceWelcomeClaimed();
                await loadAccount();
                if (authResult?.isNewUser && Number(authResult?.welcomeBonus || 0) > 0) {
                  toast(`Welcome! ${money(authResult.welcomeBonus)} welcome bonus credited to your wallet.`, "success");
                } else {
                  toast("You are signed in with Google.", "success");
                }
                const destination = form.dataset.next || "/";
                navPath(destination.startsWith("/") && !destination.startsWith("//") ? destination : "/");
              } catch (error) {
                googleError.textContent = error.message;
                mountGoogleButton(0);
              }
            },
            auto_select: false,
            cancel_on_tap_outside: true
          });
          window.google.accounts.id.renderButton(googleHost, {
            type: "standard", theme: "outline", size: "large", text: "continue_with",
            shape: "rect", logo_alignment: "left", width: Math.min(340, Math.max(230, window.innerWidth - 76))
          });
        } catch (error) {
          googleError.textContent = error.message;
        }
      };
      mountGoogleButton(0);
    }
    $("#authPassword").addEventListener("input", updatePasswordStrength);
    $$("[data-toggle-password]", $("#authRoot")).forEach(button => button.addEventListener("click", () => {
      const field = $("#authPassword");
      const visible = field.type === "password";
      field.type = visible ? "text" : "password";
      button.textContent = visible ? "Hide" : "Show";
      button.setAttribute("aria-label", visible ? "Hide password" : "Show password");
    }));
  }
  function googleMark() {
    return '<svg class="google-mark" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94a11.1 11.1 0 0 1-4.8 7.27l7.73 5.99c4.51-4.16 7.11-10.29 7.11-17.73Z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.73l-7.73-5.99c-2.14 1.45-4.89 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>';
  }
  function updatePasswordStrength() {
    const field = $("#authPassword");
    const meter = $("#passwordStrength");
    if (!field || !meter) return;
    const value = field.value;
    const score = [
      value.length >= 8,
      /[A-Z]/.test(value) && /[a-z]/.test(value),
      /\d/.test(value),
      /[^A-Za-z0-9]/.test(value)
    ].filter(Boolean).length;
    meter.dataset.score = String(score);
    $("small", meter).textContent = !value ? "Use at least 8 characters." : score < 2 ? "Add more characters for a stronger password." : score < 4 ? "Good start. A number or symbol helps." : "Strong password.";
  }
  async function submitAuth(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const mode = form.dataset.mode;
    const formData = new FormData(form);
    const button = $("#authSubmit");
    const error = $("#authError");
    button.disabled = true;
    error.textContent = "";
    button.innerHTML = `${mode === "signup" ? "Creating account…" : "Signing in…"} <span class="inline-spinner"></span>`;
    try {
      const authResult = await api(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ name: formData.get("name"), email: formData.get("email"), password: formData.get("password"), ...(mode === "signup" ? { ...getDeviceMeta(), referralCode: getStoredReferralCode() } : {}) })
      });
      await loadAccount();
      if (mode === "signup" && Number(authResult?.welcomeBonus || 0) > 0) {
        markDeviceWelcomeClaimed();
        toast(`Your account is ready! ${money(authResult.welcomeBonus)} welcome bonus credited.`, "success");
      } else {
        toast(mode === "signup" ? "Your account is ready." : "You are signed in.", "success");
      }
      const next = form.dataset.next || "/";
      navPath(next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (error) {
      error.textContent = error.message;
      button.disabled = false;
      button.innerHTML = `${mode === "signup" ? "Create account" : "Log in"} ${icon("arrow")}`;
    }
  }

  async function startWalletPayment(amount) {
    const error = $("#walletError");
    const button = $("#payButton");
    error.textContent = "";
    if (!state.user) return navPath("/login?next=%2Fwallet");
    if (!Number.isFinite(amount) || amount < Number(state.config?.minDepositInr || 50) || amount > 50000) {
      error.textContent = `Enter an amount between ${money(state.config?.minDepositInr || 50)} and ₹50,000.`;
      return;
    }
    if (!window.Razorpay) {
      error.textContent = "Secure checkout did not load. Refresh the page and try again.";
      return;
    }
    button.disabled = true;
    button.innerHTML = `Preparing secure checkout… <span class="inline-spinner"></span>`;
    try {
      const order = await api("/api/wallet/create-order", { method: "POST", body: JSON.stringify({ amount, promoCode: state.walletPromo?.code || "" }) });
      const checkout = new Razorpay({
        key: order.keyId, amount: order.amount, currency: order.currency,
        name: state.config?.siteName || "Mintu SMM", description: "Wallet recharge",
        order_id: order.orderId, prefill: { name: state.user.name, email: state.user.email },
        theme: { color: "#635bda" },
        handler: async response => {
          try {
            await api("/api/wallet/verify", { method: "POST", body: JSON.stringify(response) });
            await loadAccount();
            toast("Payment verified and wallet updated.", "success");
            renderRoute();
          } catch (verificationError) {
            toast(`Payment confirmation needs attention: ${verificationError.message}. Contact support with your payment ID.`, "error");
          } finally {
            button.disabled = false;
            button.innerHTML = `Continue to payment ${icon("arrow")}`;
          }
        },
        modal: { ondismiss: () => { button.disabled = false; button.innerHTML = `Continue to payment ${icon("arrow")}`; } }
      });
      checkout.on("payment.failed", response => {
        error.textContent = response.error?.description || "Payment failed. Please try again.";
        button.disabled = false;
        button.innerHTML = `Continue to payment ${icon("arrow")}`;
      });
      checkout.open();
    } catch (paymentError) {
      error.textContent = paymentError.message;
      button.disabled = false;
      button.innerHTML = `Continue to payment ${icon("arrow")}`;
    }
  }

  function bindPage(route) {
    if (route === "/services") bindServicesPage();
    if (route === "/" || route === "/new-order") bindOrderPage();
    if (route === "/orders") bindOrdersPage();
    if (route === "/wallet") bindWalletPage();
    if (route === "/support") bindSupportPage();
    if (route === "/profile") {
      $("#profileLogout")?.addEventListener("click", logout);
      $("#copyReferralLink")?.addEventListener("click", async () => {
        if (!state.user?.referralCode) return;
        const link = `${location.origin}/signup?ref=${state.user.referralCode}`;
        try { await navigator.clipboard.writeText(link); toast("Invite link copied!", "success"); }
        catch { toast("Copy failed; select the link manually.", "error"); }
      });
      $("#generateApiKey")?.addEventListener("click", e => {
        withBusyButton(e.currentTarget, "Generating…", async () => {
          const res = await api("/api/account/api-key", { method: "POST", body: "{}" });
          state.user.apiKey = res.apiKey;
          writeCache();
          renderRoute();
          toast("New API key generated.", "success");
        }).catch(err => toast(err.message, "error"));
      });
      $("#copyApiKey")?.addEventListener("click", async () => {
        if (!state.user?.apiKey) return;
        try { await navigator.clipboard.writeText(state.user.apiKey); toast("API key copied!", "success"); }
        catch { toast("Copy failed; select the key manually.", "error"); }
      });
    }
    $$("[data-retry-services]").forEach(button => button.addEventListener("click", async () => { await loadServices(); renderRoute(); }));
    $$("[data-refresh-account]").forEach(button => button.addEventListener("click", async () => { await loadAccount(); renderRoute(); }));
  }

  function bindServicesPage() {
    $$("[data-service-cat]").forEach(btn => btn.addEventListener("click", () => {
      state.serviceCat = btn.dataset.serviceCat;
      renderRoute();
    }));
    const search = $("#catalogSearch");
    const apply = () => {
      const query = search.value.trim().toLowerCase();
      const filtered = state.services.filter(service => !query || `${service.name} ${service.description} ${service.category}`.toLowerCase().includes(query));
      $("#catalogGrid").innerHTML = filtered.length ? filtered.map(serviceCard).join("") : `<div class="empty-panel">No services match your search. Try another search term.</div>`;
      $("#catalogCount").textContent = `${filtered.length} service${filtered.length === 1 ? "" : "s"}`;
    };
    search.addEventListener("input", apply);
  }

  function bindOrderPage() {
    const categoryButtons = $$("[data-order-category]");
    categoryButtons.forEach(button => button.addEventListener("click", () => {
      state.orderCategory = button.dataset.orderCategory;
      const first = state.services.find(service => service.category === state.orderCategory);
      state.orderServiceId = first?.id || "";
      renderRoute();
    }));
    const serviceSelect = $("#orderServiceSelect");
    const search = $("#orderServiceSearch");
    const updateServiceOptions = () => {
      const query = search.value.trim().toLowerCase();
      const matches = state.services.filter(service => service.category === state.orderCategory && (!query || `${service.name} ${service.description}`.toLowerCase().includes(query)));
      serviceSelect.innerHTML = matches.map(service => `<option value="${esc(service.id)}">${esc(service.name)} — ${money(service.pricePer1000)} ${service.pricingModel === "fixed" ? "/ order" : "/ 1,000"}</option>`).join("");
      if (!matches.length) {
        serviceSelect.innerHTML = `<option value="">No matching service</option>`;
        state.orderServiceId = "";
      } else {
        const preferred = matches.find(service => service.id === state.orderServiceId) || matches[0];
        state.orderServiceId = preferred.id;
        serviceSelect.value = preferred.id;
      }
      updateOrderPreview();
    };
    search.addEventListener("input", updateServiceOptions);
    serviceSelect.addEventListener("change", () => { state.orderServiceId = serviceSelect.value; updateOrderPreview(); });
    $$("[data-quantity]").forEach(button => button.addEventListener("click", () => {
      $("#orderQuantity").value = button.dataset.quantity;
      updateOrderTotal();
    }));
    $("#orderQuantity")?.addEventListener("input", updateOrderTotal);
    $("#orderForm")?.addEventListener("submit", event => {
      event.preventDefault();
      const service = state.services.find(item => item.id === state.orderServiceId);
      const quantity = Number($("#orderQuantity").value);
      const link = $("#orderLink").value.trim();
      const error = $("#orderError");
      error.textContent = "";
      if (!service) return error.textContent = "Choose an available service to continue.";
      if (!state.user) return navPath(`/login?next=${encodeURIComponent("/new-order")}`);
      if (!link || !/^https?:\/\//i.test(link)) return error.textContent = "Enter a complete link beginning with http:// or https://.";
      if (!Number.isInteger(quantity) || quantity < Number(service.min) || quantity > Number(service.max)) {
        return error.textContent = `Quantity must be between ${Number(service.min).toLocaleString("en-IN")} and ${Number(service.max).toLocaleString("en-IN")}.`;
      }
      const rawAmount = calculateCost(service, quantity);
      const discount = computeOrderPromoDiscount(rawAmount);
      const amount = Math.max(0, Math.round((rawAmount - discount + Number.EPSILON) * 100) / 100);
      if (amount > Number(state.user.balance)) return error.textContent = `Your balance is ${money(state.user.balance)}. Add funds before placing this order.`;
      openOrderConfirmation(service, link, quantity, amount, state.orderPromo?.code || "", discount);
    });
    $("#applyOrderPromo")?.addEventListener("click", e => {
      withBusyButton(e.currentTarget, "Checking…", async () => {
        const codeInput = $("#orderPromoInput");
        const statusEl = $("#orderPromoStatus");
        const codeVal = String(codeInput?.value || "").trim().toUpperCase();
        if (!state.user) return navPath(`/login?next=${encodeURIComponent("/new-order")}`);
        const service = state.services.find(item => item.id === state.orderServiceId);
        const quantity = Number($("#orderQuantity")?.value || service?.min || 1);
        const rawAmount = service ? calculateCost(service, quantity) : 0;
        if (!codeVal) { statusEl.innerHTML = `<span class="promo-err">Enter a promo code.</span>`; return; }
        statusEl.innerHTML = `<span>Checking…</span>`;
        try {
          const res = await api("/api/promos/validate", { method: "POST", body: JSON.stringify({ code: codeVal, context: "order", amount: rawAmount }) });
          state.orderPromo = res.promo;
          statusEl.innerHTML = `<span class="promo-applied">Applied ${esc(res.promo.code)} (−${money(res.promo.effectAmount)})</span>`;
          updateOrderTotal();
          toast(`Promo ${res.promo.code} applied!`, "success");
        } catch (err) {
          state.orderPromo = null;
          statusEl.innerHTML = `<span class="promo-err">${esc(err.message)}</span>`;
          updateOrderTotal();
        }
      });
    });
    $("#clearOrderPromo")?.addEventListener("click", () => {
      state.orderPromo = null;
      if ($("#orderPromoInput")) $("#orderPromoInput").value = "";
      if ($("#orderPromoStatus")) $("#orderPromoStatus").innerHTML = "";
      updateOrderTotal();
    });
    updateOrderPreview();
  }

  function updateOrderPreview() {
    const service = state.services.find(item => item.id === state.orderServiceId) || null;
    const preview = $("#serviceSelectedPreview");
    if (!service) {
      preview.innerHTML = `<div class="empty-inline">No matching service. Try another search or platform.</div>`;
      $("#serviceInfoCard").innerHTML = renderServiceInfo(null);
      $("#reviewOrder").disabled = true;
      updateOrderTotal();
      return;
    }
    preview.innerHTML = `<span class="service-preview-icon">${esc((service.category || "S").charAt(0))}</span><div><b>${esc(service.name)}</b><small>${esc(service.description || "No additional description provided.")}</small></div><span class="preview-price">${money(service.pricePer1000)}<small>${service.pricingModel === "fixed" ? "per order" : "per 1,000"}</small></span>`;
    $("#serviceInfoCard").innerHTML = renderServiceInfo(service);
    $("#chargeService").textContent = service.name;
    $("#orderQuantity").min = service.min;
    $("#orderQuantity").max = service.max;
    $("#orderQuantity").readOnly = service.pricingModel === "fixed";
    $("#orderQuantity").value = service.pricingModel === "fixed" ? service.min : Math.max(Number(service.min), Number($("#orderQuantity").value || service.min));
    $("#quantityRange").textContent = `${Number(service.min).toLocaleString("en-IN")} – ${Number(service.max).toLocaleString("en-IN")}`;
    $("#quantityPresets").innerHTML = service.pricingModel === "fixed" ? "" : quantityPresets(service).map(value => `<button type="button" data-quantity="${value}">${Number(value).toLocaleString("en-IN")}</button>`).join("");
    $("#orderHint").textContent = service.pricingModel === "fixed" ? "This service has a fixed price per order." : "The total updates as you change the quantity.";
    $$("[data-quantity]").forEach(button => button.addEventListener("click", () => { $("#orderQuantity").value = button.dataset.quantity; updateOrderTotal(); }));
    $("#reviewOrder").disabled = false;
    updateOrderTotal();
  }

  function computeOrderPromoDiscount(rawAmount) {
    const p = state.orderPromo;
    if (!p || rawAmount <= 0) return 0;
    let d = p.discountType === "percent" ? Math.round((rawAmount * Number(p.discountValue || 0) / 100 + Number.EPSILON) * 100) / 100 : Number(p.discountValue || 0);
    return Math.max(0, Math.min(d, Math.max(0, rawAmount - 0.01)));
  }

  function updateOrderTotal() {
    const service = state.services.find(item => item.id === state.orderServiceId);
    const quantity = Number($("#orderQuantity")?.value || service?.min || 1);
    const rawAmount = service ? calculateCost(service, quantity) : 0;
    const discount = computeOrderPromoDiscount(rawAmount);
    const amount = Math.max(0, Math.round((rawAmount - discount + Number.EPSILON) * 100) / 100);
    const discRow = $("#chargeDiscountRow");
    if (discRow) {
      discRow.hidden = discount <= 0;
      $("#chargeDiscount").textContent = `−${money(discount)}`;
    }
    $("#chargeTotal").textContent = money(amount);
    $("#chargeQuantity").textContent = quantity.toLocaleString("en-IN");
    $("#chargeBalance").textContent = money(state.user?.balance || 0);
    $("#remainingBalance").textContent = money((state.user?.balance || 0) - amount);
    $("#remainingBalance").classList.toggle("insufficient", amount > Number(state.user?.balance || 0));
  }

  function openOrderConfirmation(service, link, quantity, amount, promoCode = "", discount = 0) {
    const modalRoot = $("#modalRoot");
    modalRoot.innerHTML = `<div class="modal-backdrop" data-modal-backdrop><section class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirmTitle"><button class="modal-close" type="button" data-modal-close aria-label="Close">×</button><span class="eyebrow">FINAL REVIEW</span><h2 id="confirmTitle">Confirm this order</h2><p>Check the details below. Your wallet will only be charged after the server accepts the order.</p><div class="confirm-summary"><div><small>SERVICE</small><b>${esc(service.name)}</b></div><div><small>TARGET LINK</small><b class="break-anywhere">${esc(link)}</b></div><div><small>QUANTITY</small><b>${Number(quantity).toLocaleString("en-IN")}</b></div>${discount > 0 ? `<div><small>PROMO (${esc(promoCode)})</small><b class="positive">−${money(discount)}</b></div>` : ""}<div><small>WALLET DEDUCTION</small><b>${money(amount)}</b></div><div class="confirm-balance"><small>ESTIMATED REMAINING BALANCE</small><b>${money(Number(state.user.balance) - amount)}</b></div></div><div class="form-error" id="confirmError" role="alert"></div><div class="confirm-actions"><button class="btn btn-outline" type="button" data-modal-close>Go back</button><button class="btn btn-primary" type="button" id="confirmPlaceOrder">Confirm and place order ${icon("arrow")}</button></div></section></div>`;
    modalRoot.querySelector("[data-modal-backdrop]").addEventListener("click", event => { if (event.target === event.currentTarget) closeModal(); });
    modalRoot.querySelectorAll("[data-modal-close]").forEach(button => button.addEventListener("click", closeModal));
    $("#confirmPlaceOrder").addEventListener("click", () => placeOrder(service, link, quantity, promoCode));
  }

  async function placeOrder(service, link, quantity, promoCode = "") {
    if (state.orderBusy) return;
    state.orderBusy = true;
    const button = $("#confirmPlaceOrder");
    button.disabled = true;
    button.innerHTML = `Placing your order… <span class="inline-spinner"></span>`;
    $("#confirmError").textContent = "";
    try {
      const result = await api("/api/orders/create", { method: "POST", body: JSON.stringify({ serviceId: service.id, link, quantity, promoCode }) });
      state.orderPromo = null;
      closeModal();
      await loadAccount();
      toast(`Order ${String(result.orderId || "").slice(0, 12)} submitted.`, "success");
      navPath("/orders");
    } catch (error) {
      $("#confirmError").textContent = error.message;
      button.disabled = false;
      button.innerHTML = `Confirm and place order ${icon("arrow")}`;
      await loadWallet().catch(walletError => console.error("Could not refresh wallet after order error:", walletError));
    } finally {
      state.orderBusy = false;
    }
  }

  function bindOrdersPage() {
    ["#ordersSearch", "#ordersStatus", "#ordersDate"].forEach(selector => {
      $(selector).addEventListener(selector === "#ordersSearch" ? "input" : "change", () => {
        state.orderPage = 1;
        updateOrdersList();
      });
    });
    $("#ordersRows").addEventListener("click", event => {
      const button = event.target.closest("[data-order-detail]");
      if (button) showOrderDetails(button.dataset.orderDetail);
    });
    $("#ordersPagination").addEventListener("click", event => {
      const button = event.target.closest("[data-order-page]");
      if (!button || button.disabled) return;
      state.orderPage = Number(button.dataset.orderPage);
      updateOrdersList();
      $("#pageContent").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    updateOrdersList();
  }

  function showOrderDetails(id) {
    const order = state.orders.find(item => item.id === id);
    if (!order) return;
    $("#modalRoot").innerHTML = `<div class="modal-backdrop" data-modal-backdrop><section class="confirm-modal order-detail-modal" role="dialog" aria-modal="true" aria-labelledby="orderDetailTitle"><button class="modal-close" type="button" data-modal-close aria-label="Close">×</button><span class="eyebrow">ORDER DETAILS · ${esc(String(order.id).slice(0, 12))}</span><h2 id="orderDetailTitle">${esc(order.serviceName || "Service order")}</h2><div class="detail-status">${statusPill(order.status)}<span>${date(order.createdAt)}</span></div><div class="order-detail-grid"><div><small>Quantity</small><b>${Number(order.quantity || 0).toLocaleString("en-IN")}</b></div><div><small>Amount</small><b>${money(order.amount)}</b></div><div><small>Category</small><b>${esc(order.category || "—")}</b></div><div><small>Supplier order ID</small><b>${esc(order.supplierOrderId || "Not applicable")}</b></div><div class="detail-wide"><small>Order link</small><a href="${esc(order.link || "#")}" target="_blank" rel="noopener noreferrer">${esc(order.link || "—")}</a></div><div class="detail-wide"><small>Latest update</small><b>${esc(order.dispatchNote || order.adminNote || "No additional update available.")}</b></div></div><div class="modal-bottom-actions"><button class="btn btn-primary" type="button" data-modal-close>Done</button></div></section></div>`;
    $("#modalRoot").querySelector("[data-modal-backdrop]").addEventListener("click", event => { if (event.target === event.currentTarget) closeModal(); });
    $("#modalRoot").querySelectorAll("[data-modal-close]").forEach(button => button.addEventListener("click", closeModal));
  }

  function updateWalletBonusPreview() {
    const preview = $("#walletBonusPreview");
    if (!preview) return;
    const amount = Math.max(0, Number($("#walletAmount")?.value || 0));
    const { bonus: slabBonus, label } = computeSlabBonus(amount);
    let promoBonus = 0;
    if (state.walletPromo && amount > 0) {
      const p = state.walletPromo;
      promoBonus = p.discountType === "percent" ? Math.round((amount * Number(p.discountValue || 0) / 100 + Number.EPSILON) * 100) / 100 : Number(p.discountValue || 0);
    }
    const totalCredit = Math.round((amount + slabBonus + promoBonus + Number.EPSILON) * 100) / 100;
    if (slabBonus <= 0 && promoBonus <= 0) {
      preview.innerHTML = "";
      preview.hidden = true;
      return;
    }
    preview.hidden = false;
    preview.innerHTML = `<div><span>Recharge</span><b>${money(amount)}</b></div>${slabBonus > 0 ? `<div><span>${esc(label)}</span><b class="positive">+${money(slabBonus)}</b></div>` : ""}${promoBonus > 0 ? `<div><span>Promo (${esc(state.walletPromo.code)})</span><b class="positive">+${money(promoBonus)}</b></div>` : ""}<div class="preview-total"><span>Total wallet credit</span><b>${money(totalCredit)}</b></div>`;
  }

  function bindWalletPage() {
    $("#walletForm").addEventListener("submit", event => {
      event.preventDefault();
      const amount = Number(new FormData(event.currentTarget).get("amount"));
      withBusyButton($("#payButton"), "Opening checkout…", () => startWalletPayment(amount));
    });
    $("#walletAmount")?.addEventListener("input", updateWalletBonusPreview);
    $$("[data-amount]").forEach(button => button.addEventListener("click", () => {
      $("#walletAmount").value = button.dataset.amount;
      $$(".quick-amounts button").forEach(item => item.classList.toggle("active", item === button));
      updateWalletBonusPreview();
    }));
    $("#applyWalletPromo")?.addEventListener("click", e => {
      withBusyButton(e.currentTarget, "Checking…", async () => {
        const codeVal = String($("#walletPromoInput")?.value || "").trim().toUpperCase();
        const statusEl = $("#walletPromoStatus");
        const amount = Number($("#walletAmount")?.value || 0);
        if (!codeVal) { statusEl.innerHTML = `<span class="promo-err">Enter a promo code.</span>`; return; }
        statusEl.innerHTML = `<span>Checking…</span>`;
        try {
          const res = await api("/api/promos/validate", { method: "POST", body: JSON.stringify({ code: codeVal, context: "deposit", amount }) });
          state.walletPromo = res.promo;
          statusEl.innerHTML = `<span class="promo-applied">Applied ${esc(res.promo.code)} (+${money(res.promo.effectAmount)} bonus)</span>`;
          updateWalletBonusPreview();
          toast(`Promo ${res.promo.code} applied!`, "success");
        } catch (err) {
          state.walletPromo = null;
          statusEl.innerHTML = `<span class="promo-err">${esc(err.message)}</span>`;
          updateWalletBonusPreview();
        }
      });
    });
    $("#clearWalletPromo")?.addEventListener("click", () => {
      state.walletPromo = null;
      if ($("#walletPromoInput")) $("#walletPromoInput").value = "";
      if ($("#walletPromoStatus")) $("#walletPromoStatus").innerHTML = "";
      updateWalletBonusPreview();
    });
    updateWalletBonusPreview();
    $("#refreshWallet").addEventListener("click", async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try { await loadWallet(); renderRoute(); toast("Wallet updated.", "success"); }
      catch (error) { toast(error.message, "error"); button.disabled = false; }
    });
  }

  function bindSupportPage() {
    $("#ticketForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form).entries());
      const button = $("#ticketSubmit");
      button.disabled = true;
      button.innerHTML = `Sending… <span class="inline-spinner"></span>`;
      $("#ticketError").textContent = "";
      try {
        await api("/api/tickets", { method: "POST", body: JSON.stringify(data) });
        await loadTickets();
        toast("Your complaint was submitted.", "success");
        navPath("/support");
      } catch (error) {
        $("#ticketError").textContent = error.message;
        button.disabled = false;
        button.innerHTML = `Submit complaint ${icon("arrow")}`;
      }

    });
    $("#ticketReplyForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = $("#replySubmit");
      if (button.disabled) return;
      button.disabled = true;
      button.classList.add("is-loading");
      button.innerHTML = `<span class="inline-spinner"></span>`;
      $("#replyError").textContent = "";
      try {
        await api(`/api/tickets/${encodeURIComponent(form.dataset.ticketId)}/reply`, {
          method: "POST", body: JSON.stringify({ message: new FormData(form).get("message") })
        });
        await loadTickets();
        navPath(`/support?ticket=${encodeURIComponent(form.dataset.ticketId)}`);
        toast("Your reply was sent.", "success");
      } catch (error) {
        $("#replyError").textContent = error.message;
        button.disabled = false;
        button.classList.remove("is-loading");
        button.innerHTML = `${icon("arrow")}`;
      }
    });
    $("#refreshTickets")?.addEventListener("click", async event => {
      event.currentTarget.disabled = true;
      try { await loadTickets(); renderRoute(); toast("Support tickets refreshed.", "success"); }
      catch (error) { toast(error.message, "error"); event.currentTarget.disabled = false; }
    });
  }

  function startTicketPolling() {
    let refreshing = false;
    let refreshFailed = false;
    window.setInterval(async () => {
      if (!state.user || location.pathname !== "/support" || document.visibilityState === "hidden") return;
      if (new URLSearchParams(location.search).get("new") === "1") return;
      const reply = $("#ticketReplyForm textarea");
      if (reply && (reply.value.trim() || document.activeElement === reply)) return;
      if (refreshing) return;
      refreshing = true;
      try {
        const previousSignature = state.tickets.map(ticket => {
          const messages = ticket.messages || [];
          return `${ticket.id}:${ticket.status}:${ticket.updated_at}:${messages.length}:${messages[messages.length - 1]?.id || ""}`;
        }).join("|");
        await loadTickets();
        const nextSignature = state.tickets.map(ticket => {
          const messages = ticket.messages || [];
          return `${ticket.id}:${ticket.status}:${ticket.updated_at}:${messages.length}:${messages[messages.length - 1]?.id || ""}`;
        }).join("|");
        if (previousSignature !== nextSignature && location.pathname === "/support" && !$("#ticketReplyForm textarea")?.value.trim()) {
          const scrollY = window.scrollY;
          renderRoute();
          window.scrollTo(0, scrollY);
        }
        refreshFailed = false;
      } catch (error) {
        if (!refreshFailed) toast(`Support messages could not refresh: ${error.message}`, "error");
        refreshFailed = true;
        if (location.pathname === "/support") renderRoute();
      } finally {
        refreshing = false;
      }
    }, 10000);
  }

  function closeModal() { $("#modalRoot").innerHTML = ""; }
  async function logout() {
    const button = $("#sidebarLogout") || $("#profileLogout");
    if (button) button.disabled = true;
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
      state.user = null;
      state.wallet = null;
      state.orders = [];
      state.tickets = [];
      toast("You are signed out.", "success");
      navPath("/");
    } catch (error) {
      toast(error.message, "error");
      if (button) button.disabled = false;
    }
  }

  function getDeviceMeta() {
    let deviceId = "";
    let deviceClaimed = false;
    try {
      deviceId = localStorage.getItem("mintu_device_id") || "";
      if (!deviceId) {
        deviceId = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
        localStorage.setItem("mintu_device_id", deviceId);
      }
      deviceClaimed = localStorage.getItem("mintu_welcome_claimed") === "1";
    } catch {}
    const rawFp = [
      navigator.platform || "",
      navigator.language || "",
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      navigator.hardwareConcurrency || "",
      navigator.maxTouchPoints || 0
    ].join("|");
    let h = 2166136261;
    for (let i = 0; i < rawFp.length; i++) { h ^= rawFp.charCodeAt(i); h = Math.imul(h, 16777619); }
    const deviceFp = `fp_${(h >>> 0).toString(16)}`;
    return { deviceId, deviceFp, deviceClaimed };
  }
  function markDeviceWelcomeClaimed() {
    try { localStorage.setItem("mintu_welcome_claimed", "1"); } catch {}
  }

  function captureReferralCode() {
    try {
      const ref = new URLSearchParams(location.search).get("ref");
      if (ref && /^[A-Za-z0-9_-]{3,30}$/.test(ref.trim())) {
        localStorage.setItem("mintu_ref_code", ref.trim().toUpperCase());
      }
    } catch {}
  }
  function getStoredReferralCode() {
    try { return localStorage.getItem("mintu_ref_code") || ""; } catch { return ""; }
  }
  function showReferralPosterIfEligible() {
    const refCfg = state.config?.referral;
    if (!refCfg?.enabled || Number(refCfg?.bonusValue || 0) <= 0) return;
    try {
      if (sessionStorage.getItem("mintu_ref_poster_seen") === "1") return;
      if (localStorage.getItem("mintu_ref_poster_hide") === "1") return;
      sessionStorage.setItem("mintu_ref_poster_seen", "1");
    } catch {}
    const rewardText = refCfg.bonusType === "fixed" ? money(refCfg.bonusValue) : `${Number(refCfg.bonusValue)}%`;
    const inviteUrl = state.user?.referralCode ? `${location.origin}/signup?ref=${encodeURIComponent(state.user.referralCode)}` : "";
    const modalRoot = $("#modalRoot");
    if (!modalRoot || modalRoot.innerHTML.trim()) return;
    modalRoot.innerHTML = `<div class="modal-backdrop" data-modal-backdrop>
      <section class="poster-modal" role="dialog" aria-modal="true" aria-labelledby="posterTitle">
        <button class="poster-close" type="button" data-modal-close aria-label="Close">×</button>
        <div class="poster-hero">
          <span class="poster-badge">🎁 REFER &amp; EARN</span>
          <h2 id="posterTitle">Get ${esc(rewardText)} Bonus on Your Friend's First Deposit!</h2>
          <p>Invite friends to ${esc(state.config?.siteName || "Mintu SMM")} and earn instant wallet cash automatically.</p>
        </div>
        <div class="poster-steps">
          <div><b>1</b><span>Share your invite link</span></div>
          <div><b>2</b><span>Friend signs up &amp; adds ${money(refCfg.minDeposit || 50)}+</span></div>
          <div><b>3</b><span>You get ${esc(rewardText)} credited!</span></div>
        </div>
        ${inviteUrl ? `<div class="poster-link-box"><input class="form-control mono" id="posterRefLink" readonly value="${esc(inviteUrl)}"><button type="button" class="btn btn-primary" id="posterCopyBtn">Copy Link</button></div>` : `<button type="button" class="btn btn-primary btn-large full-width" id="posterCtaBtn">${state.user ? "Open Refer & Earn" : "Create Account &amp; Start Earning"} ${icon("arrow")}</button>`}
        <button type="button" class="poster-dismiss" id="posterDontShow">Don't show this again</button>
      </section>
    </div>`;
    modalRoot.querySelector("[data-modal-backdrop]").addEventListener("click", e => { if (e.target === e.currentTarget) closeModal(); });
    modalRoot.querySelectorAll("[data-modal-close]").forEach(b => b.addEventListener("click", closeModal));
    $("#posterCopyBtn")?.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(inviteUrl); toast("Invite link copied!", "success"); closeModal(); }
      catch { toast("Copy failed; select link manually.", "error"); }
    });
    $("#posterCtaBtn")?.addEventListener("click", () => {
      closeModal();
      navPath(state.user ? "/profile" : "/signup");
    });
    $("#posterDontShow")?.addEventListener("click", () => {
      try { localStorage.setItem("mintu_ref_poster_hide", "1"); } catch {}
      closeModal();
    });
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", state.theme);
    try { localStorage.setItem("mintu_theme", state.theme); } catch {}
    const meta = $("#themeColorMeta");
    if (meta) meta.setAttribute("content", state.theme === "dark" ? "#080c14" : "#f4f6fb");
    $$("#themeToggle, [data-theme-toggle]").forEach(btn => {
      btn.innerHTML = icon(state.theme === "dark" ? "sun" : "moon");
    });
  }

  function bindGlobalEvents(root) {
    root.addEventListener("click", event => {
      const routeLink = event.target.closest("[data-route]");
      if (routeLink && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        navPath(routeLink.dataset.route);
        closeSidebar();
        return;
      }
      if (event.target.closest("#mobileMenu")) {
        const sidebar = $("#appSidebar");
        sidebar.classList.toggle("open");
        $("#drawerScrim").classList.toggle("visible", sidebar.classList.contains("open"));
        $("#mobileMenu").setAttribute("aria-expanded", String(sidebar.classList.contains("open")));
        return;
      }
      if (event.target.closest("#drawerScrim")) closeSidebar();
      if (event.target.closest("#dismissAnnouncement")) { state.announcementDismissed = true; event.target.closest(".announcement-bar")?.remove(); return; }
      if (event.target.closest("#sidebarLogout")) logout();
      if (event.target.closest("#topAvatar")) navPath("/profile");
      if (event.target.closest("#themeToggle") || event.target.closest("[data-theme-toggle]")) { toggleTheme(); return; }
      const retry = event.target.closest("[data-retry-services]");
      if (retry) { loadServices().then(renderRoute); return; }
    });
    window.addEventListener("popstate", () => { closeSidebar(); renderRoute(); });
  }
  function closeSidebar() {
    $("#appSidebar")?.classList.remove("open");
    $("#drawerScrim")?.classList.remove("visible");
    $("#mobileMenu")?.setAttribute("aria-expanded", "false");
  }

  async function start() {
    captureReferralCode();
    const root = $("#appRoot");
    root.innerHTML = shellMarkup();
    bindGlobalEvents(root);
    const cached = readCache();
    if (cached) {
      if (cached.config) state.config = cached.config;
      if (Array.isArray(cached.services)) state.services = cached.services;
      if (Array.isArray(cached.categories)) state.categories = cached.categories;
      if (cached.user) state.user = cached.user;
      renderRoute();
    }
    await Promise.all([loadConfig(), loadServices(), loadAccount(true)]);
    writeCache();
    renderRoute();
    if (state.user) {
      Promise.allSettled([loadWallet(), loadOrders(), loadTickets()]).then(() => {
        writeCache();
        if (!["/login", "/signup"].includes(currentPath())) renderRoute();
      });
    }
    setTimeout(showReferralPosterIfEligible, 650);
    startTicketPolling();
    try {
      if (!sessionStorage.getItem("mintu_visited")) {
        sessionStorage.setItem("mintu_visited", "1");
        fetch("/api/public/visit", { method: "POST" }).catch(() => {});
      }
    } catch {}
    const params = new URLSearchParams(location.search);
    if (params.get("oauth") === "success") {
      toast("Google sign-in successful.", "success");
      history.replaceState(null, "", location.pathname);
    } else if (params.has("oauth_error")) {
      toast("Google sign-in could not be completed. Try again or use email and password.", "error");
      history.replaceState(null, "", location.pathname);
    }
  }

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  start();
})();
