const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
const money = value => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const API = "/api/yaadpage";
const templates = [
  { id:"birthday", name:"Birthday Glow", tag:"Birthday", detail:"Bright, joyful and full of little surprises", icon:"✦", theme:"pink" },
  { id:"love", name:"Love Letter", tag:"Love", detail:"A warm digital letter for your person", icon:"♡", theme:"rose" },
  { id:"anniversary", name:"Our Story", tag:"Anniversary", detail:"Celebrate the moments that matter", icon:"∞", theme:"cream" },
  { id:"bestfriend", name:"Best Friend Forever", tag:"Friendship", detail:"A personal page for your favourite human", icon:"✷", theme:"lilac" },
  { id:"proposal", name:"One Question", tag:"Proposal", detail:"Make an important question unforgettable", icon:"❦", theme:"night" }
];
const plans = [
  { id:"starter", name:"Starter", price:199, photos:1, detail:"A beautiful one-page surprise", features:["1 photo", "Personal message", "Unique shareable URL", "1-year hosting"] },
  { id:"story", name:"Story", price:399, photos:3, detail:"Our most popular experience", features:["Up to 3 photos", "Animated sections", "Personal message", "1-year hosting"], popular:true },
  { id:"premium", name:"Premium", price:699, photos:6, detail:"The complete memory experience", features:["Up to 6 photos", "Premium visual effects", "Photo gallery", "1-year hosting"] }
];

async function api(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    ...options,
    headers: { ...(options.body instanceof FormData ? {} : { "Content-Type":"application/json" }), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function setTitle(title) { document.title = `${title} — YaadPage`; }
function go(path) { location.href = path; }
function brandMark() { return `<span class="brand-mark">Y</span>`; }
function header(active = "") {
  return `<header class="site-header"><a class="brand" href="/">${brandMark()}<span>yaadpage<span class="brand-dot">.</span></span></a><nav class="desktop-nav"><a href="/#designs" class="${active === "designs" ? "active" : ""}">Designs</a><a href="/#how-it-works">How it works</a><a href="/#pricing">Pricing</a></nav><a class="button button-dark nav-cta" href="/create">Create your page <span>↗</span></a><button class="mobile-menu" id="mobileMenu" aria-label="Open menu">☰</button></header>`;
}
function footer() {
  return `<footer class="site-footer"><a class="brand" href="/">${brandMark()}<span>yaadpage<span class="brand-dot">.</span></span></a><p>Make memories shareable.</p><div><a href="/">Home</a><a href="/#pricing">Pricing</a><a href="mailto:hello@yaadpage.online">Support</a><a href="/admin">Admin</a></div><small>© ${new Date().getFullYear()} YaadPage. Made for meaningful moments.</small></footer>`;
}
function templateCard(item, index) {
  return `<article class="template-card"><a class="template-art art-${item.theme}" href="/create?template=${item.id}"><div class="art-window"><span class="art-spark">${item.icon}</span><small>${item.tag.toUpperCase()} EDITION</small><strong>${item.id === "birthday" ? "Make a wish" : item.id === "love" ? "A little note" : item.id === "anniversary" ? "Our story" : item.id === "bestfriend" ? "My favourite human" : "One special question"}</strong><i>${item.id === "birthday" ? "For someone wonderful" : "Made just for you"}</i><span class="art-button">Open surprise <b>↗</b></span></div><span class="art-index">0${index + 1}</span></a><div class="template-info"><div><h3>${item.name}</h3><p>${item.detail}</p></div><a class="round-arrow" href="/create?template=${item.id}" aria-label="Create ${item.name}">↗</a></div></article>`;
}
function home() {
  setTitle("Make Memories Shareable");
  const root = $("#app");
  root.innerHTML = `${header()}<main>
    <section class="hero wrap"><div class="hero-copy"><div class="eyebrow"><span class="eyebrow-dot"></span> A LITTLE WEBSITE. A BIG FEELING.</div><h1>Make a moment<br>they can <em>open.</em></h1><p class="hero-lede">Turn your photos, words and memories into a beautiful little website. Create it in minutes. Share it with someone special.</p><div class="hero-actions"><a class="button button-dark" href="/create">Create a surprise <span>↗</span></a><a class="text-link" href="#designs">Explore designs <span>↓</span></a></div><div class="hero-proof"><div class="avatar-stack"><i>A</i><i>R</i><i>M</i><i>+</i></div><span>Made for the people who matter.</span></div></div><div class="hero-visual"><div class="visual-orbit orbit-one"></div><div class="visual-orbit orbit-two"></div><div class="floating-note note-one"><span>♡</span><b>just for you</b></div><div class="floating-note note-two"><span>✦</span><b>a memory to keep</b></div><div class="hero-phone"><div class="phone-top"><span></span><span></span></div><div class="phone-screen"><div class="phone-flower">✿</div><small>A LITTLE SURPRISE FOR</small><h2>ANANYA</h2><p>Today is all about you.</p><div class="phone-photo"><span>♡</span></div><div class="phone-message">You make ordinary days feel special.</div><div class="phone-hearts">♡　♡　♡</div></div></div><div class="hero-sticker">made<br>with love <span>✦</span></div></div></section>
    <section class="trust-strip"><div class="wrap trust-inner"><span>NO DESIGN SKILLS NEEDED</span><i>✳</i><span>YOUR OWN SHAREABLE LINK</span><i>✳</i><span>READY IN MINUTES</span><i>✳</i><span>MADE TO FEEL PERSONAL</span></div></section>
    <section class="section wrap" id="designs"><div class="section-heading"><div><div class="eyebrow">CHOOSE YOUR FEELING</div><h2>A design for every <em>occasion.</em></h2></div><p>Pick a starting point. Add your own words and photos. We'll turn it into a page worth opening.</p></div><div class="template-grid">${templates.map(templateCard).join("")}</div><div class="center-action"><a class="button button-outline" href="/create">See all designs <span>↗</span></a></div></section>
    <section class="how-section" id="how-it-works"><div class="wrap"><div class="section-heading"><div><div class="eyebrow">THREE SIMPLE STEPS</div><h2>From your idea<br>to their <em>surprise.</em></h2></div><p>No coding. No app to install. Just a few details and a link you can share anywhere.</p></div><div class="steps-grid"><article class="step-card"><span class="step-number">01</span><div class="step-icon">✿</div><h3>Choose a design</h3><p>Start with a birthday, love, anniversary, friendship or proposal design.</p></article><article class="step-card"><span class="step-number">02</span><div class="step-icon">⌁</div><h3>Make it yours</h3><p>Add names, a personal message and a few favourite photos.</p></article><article class="step-card"><span class="step-number">03</span><div class="step-icon">↗</div><h3>Share the link</h3><p>Your page is created automatically. Send its unique link to your person.</p></article></div></div></section>
    <section class="pricing-section wrap" id="pricing"><div class="section-heading"><div><div class="eyebrow">SIMPLE, ONE-TIME PRICING</div><h2>A small price for a<br><em>lasting smile.</em></h2></div><p>Choose how much of your story you want to share. Every plan includes its own YaadPage link and one year of hosting.</p></div><div class="pricing-grid">${plans.map(p=>`<article class="price-card ${p.popular ? "price-popular" : ""}">${p.popular?'<span class="popular-label">MOST POPULAR</span>':""}<div class="price-name">${p.name}</div><div class="price-amount">${money(p.price)}<small> one time</small></div><p>${p.detail}</p><ul>${p.features.map(x=>`<li><span>✓</span>${x}</li>`).join("")}</ul><a class="button ${p.popular ? "button-dark" : "button-outline"}" href="/create?plan=${p.id}">Choose ${p.name} <span>↗</span></a></article>`).join("")}</div><p class="pricing-note">No subscription. No hidden monthly charge. Renewal details are shown before checkout.</p></section>
    <section class="quote-section"><div class="wrap quote-inner"><span class="quote-mark">“</span><blockquote>Some things are too special for a simple text message.</blockquote><p>Give the moment a page of its own.</p><a class="button button-dark" href="/create">Make their page <span>↗</span></a></div></section>
    <section class="faq-section wrap"><div class="section-heading"><div><div class="eyebrow">GOOD TO KNOW</div><h2>A few quick <em>answers.</em></h2></div><p>Everything you need to know before making your first page.</p></div><div class="faq-list"><details><summary>Do I need to know how to code? <span>＋</span></summary><p>No. Choose a design, fill in the form and YaadPage builds your page automatically.</p></details><details><summary>What will my page link look like? <span>＋</span></summary><p>Your page gets its own address, such as yaadpage.online/annayabirthday. You choose the ending when you create it.</p></details><details><summary>Can I share the page on WhatsApp? <span>＋</span></summary><p>Yes. Once your payment is verified, copy the link and share it through WhatsApp, Instagram or anywhere else.</p></details><details><summary>How long will my page stay online? <span>＋</span></summary><p>All current plans include one year of hosting. Renewal options will be shown before your page expires.</p></details><details><summary>Are my photos public? <span>＋</span></summary><p>Anyone with your page link can view the photos you choose to include. Do not upload private or sensitive images.</p></details></div></section>
  </main>${footer()}`;
  const menu = $("#mobileMenu");
  if (menu) menu.onclick = () => { const nav = $(".desktop-nav"); nav.classList.toggle("mobile-open"); };
}

function createPage() {
  setTitle("Create your page");
  const params = new URLSearchParams(location.search);
  const chosenTemplate = templates.find(x => x.id === params.get("template")) || templates[0];
  const chosenPlan = plans.find(x => x.id === params.get("plan")) || plans[1];
  const root = $("#app");
  root.innerHTML = `${header()}<main class="create-wrap wrap"><div class="create-heading"><a href="/" class="back-link">← Back to home</a><div class="eyebrow">YOUR MOMENT STARTS HERE</div><h1>Make it <em>personal.</em></h1><p>Fill in a few details. Your page will be created automatically after payment.</p></div><div class="create-layout"><form class="create-form" id="createForm" novalidate>
    <section class="form-section"><div class="form-section-title"><span>01</span><div><h2>Choose your design</h2><p>Start with the occasion that feels right.</p></div></div><div class="design-select-grid">${templates.map(t=>`<button type="button" class="design-choice ${t.id===chosenTemplate.id?"selected":""}" data-template="${t.id}"><span class="choice-icon theme-${t.theme}">${t.icon}</span><b>${t.name}</b><small>${t.tag}</small></button>`).join("")}</div><input type="hidden" id="templateId" value="${chosenTemplate.id}"></section>
    <section class="form-section"><div class="form-section-title"><span>02</span><div><h2>The people behind it</h2><p>These details make the page feel personal.</p></div></div><div class="field-grid"><label>Who is this page for?<input id="recipientName" maxlength="70" placeholder="e.g. Ananya" required></label><label>Your name<input id="senderName" maxlength="70" placeholder="e.g. Mintu" required></label><label class="field-full">Page headline<input id="pageTitle" maxlength="90" placeholder="e.g. A little surprise for you"></label><label>Special date <span class="optional">Optional</span><input id="eventDate" type="date"></label><label>Page address <span class="required-note">Required</span><div class="slug-input"><span>yaadpage.online/</span><input id="slug" maxlength="42" placeholder="your-special-name" required></div><small id="slugStatus" class="field-hint">This will be your personal page link.</small></label><label class="field-full">Your message<textarea id="message" rows="5" maxlength="1200" placeholder="Write something they will love reading…" required></textarea><small class="field-hint"><span id="messageCount">0</span>/1200 characters</small></label></div></section>
    <section class="form-section"><div class="form-section-title"><span>03</span><div><h2>Add your photos</h2><p>Use JPG, PNG or WebP. Keep each photo under 2.3 MB.</p></div></div><label class="upload-zone" for="photos"><span class="upload-icon">＋</span><b>Choose photos</b><small id="photoHelp">Up to ${chosenPlan.photos} photo(s) with your selected plan</small><input id="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label><div id="photoPreviews" class="photo-previews"></div><p class="privacy-hint">Only upload photos you have permission to share. Anyone with the page link can view them.</p></section>
    <section class="form-section"><div class="form-section-title"><span>04</span><div><h2>Choose your plan</h2><p>One-time payment. One year of hosting.</p></div></div><div class="plan-choice-grid">${plans.map(p=>`<label class="plan-choice ${p.id===chosenPlan.id?"chosen":""}"><input type="radio" name="plan" value="${p.id}" ${p.id===chosenPlan.id?"checked":""}><span class="plan-choice-top"><b>${p.name}</b><strong>${money(p.price)}</strong></span><small>${p.photos} photo${p.photos>1?"s":""} · 1-year hosting</small>${p.popular?'<i>Popular</i>':""}</label>`).join("")}</div></section>
    <section class="form-section"><div class="form-section-title"><span>05</span><div><h2>Where should we send the link?</h2><p>Used for your order confirmation and support.</p></div></div><div class="field-grid"><label>Email address<input id="email" type="email" autocomplete="email" placeholder="you@example.com" required></label><label>WhatsApp number<input id="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="10-digit mobile number" required></label></div></section>
    <div id="createError" class="form-error" role="alert"></div><button type="submit" class="button button-dark button-wide" id="payButton">Create page & pay <span>↗</span></button><p class="checkout-note"><span>🔒</span> Secure checkout powered by Razorpay. Your page publishes after payment verification.</p>
  </form><aside class="live-preview"><div class="preview-top"><span class="live-dot"></span> LIVE PREVIEW <small>Illustrative</small></div><div class="preview-page art-${chosenTemplate.theme}" id="livePreview"><div class="preview-flower">${chosenTemplate.icon}</div><small>A LITTLE SURPRISE FOR</small><h2 id="previewName">YOUR PERSON</h2><p id="previewHeadline">A little surprise for you</p><div class="preview-photo" id="previewPhoto">♡</div><blockquote id="previewMessage">Your message will appear here. Make it personal, make it yours.</blockquote><div class="preview-sign">WITH LOVE · <span id="previewSender">YOU</span></div></div><div class="preview-url"><span>YOUR LINK</span><b id="previewSlug">yaadpage.online/your-special-name</b></div><p class="preview-disclaimer">Preview only. Your published page includes the final details and selected design.</p></aside></div></main>${footer()}`;
  bindCreateForm(chosenPlan.id);
}

function bindCreateForm(initialPlan) {
  const form = $("#createForm"), photoInput = $("#photos"), errorBox = $("#createError");
  let selectedPlan = initialPlan;
  let chosenPhotos = [];
  let slugTimer = null;
  let lastSlugCheck = "";
  const selectedTemplate = () => templates.find(t => t.id === $("#templateId").value) || templates[0];
  const slugify = value => String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 42).replace(/-+$/g, "");
  const updatePreview = () => {
    const recipient = $("#recipientName").value.trim() || "YOUR PERSON";
    const sender = $("#senderName").value.trim() || "YOU";
    const slug = $("#slug").value.trim() || "your-special-name";
    $("#previewName").textContent = recipient.toUpperCase();
    $("#previewSender").textContent = sender.toUpperCase();
    $("#previewHeadline").textContent = $("#pageTitle").value.trim() || "A little surprise for you";
    $("#previewMessage").textContent = $("#message").value.trim() || "Your message will appear here. Make it personal, make it yours.";
    $("#previewSlug").textContent = `yaadpage.online/${slug}`;
    const template = selectedTemplate();
    const preview = $("#livePreview");
    preview.className = `preview-page art-${template.theme}`;
    $(".preview-flower", preview).textContent = template.icon;
    if (chosenPhotos[0]) {
      const url = URL.createObjectURL(chosenPhotos[0]);
      const photo = $("#previewPhoto");
      photo.style.backgroundImage = `url("${url}")`;
      photo.classList.add("has-photo");
      photo.textContent = "";
      if (photo.dataset.url) URL.revokeObjectURL(photo.dataset.url);
      photo.dataset.url = url;
    }
  };
  const checkSlug = async () => {
    const slug = slugify($("#slug").value);
    const status = $("#slugStatus");
    if (slug.length < 3) { status.textContent = "Use at least 3 letters or numbers."; status.className = "field-hint invalid"; lastSlugCheck = ""; return false; }
    status.textContent = "Checking address…"; status.className = "field-hint";
    try {
      const result = await api(`${API}/slug/check?slug=${encodeURIComponent(slug)}`);
      if (slug !== slugify($("#slug").value)) return false;
      lastSlugCheck = result.available ? slug : "";
      status.textContent = result.available ? "Available — this can be your page link." : result.reason;
      status.className = `field-hint ${result.available ? "valid" : "invalid"}`;
      return result.available;
    } catch (error) { status.textContent = error.message; status.className = "field-hint invalid"; return false; }
  };
  const renderPhotos = () => {
    const plan = plans.find(p => p.id === selectedPlan) || plans[1];
    $("#photoHelp").textContent = `Up to ${plan.photos} photo(s) with your selected plan`;
    $("#photoPreviews").innerHTML = chosenPhotos.map((file, index) => `<div class="photo-preview"><img src="${URL.createObjectURL(file)}" alt="Selected photo"><button type="button" data-remove-photo="${index}" aria-label="Remove photo">×</button><small>${esc(file.name)}</small></div>`).join("");
    $$('[data-remove-photo]').forEach(btn => btn.onclick = () => { chosenPhotos.splice(Number(btn.dataset.removePhoto), 1); renderPhotos(); updatePreview(); });
  };
  $$("[data-template]").forEach(btn => btn.onclick = () => {
    $$("[data-template]").forEach(x => x.classList.toggle("selected", x === btn));
    $("#templateId").value = btn.dataset.template;
    const t = selectedTemplate();
    $("#livePreview").className = `preview-page art-${t.theme}`;
    $(".preview-flower").textContent = t.icon;
  });
  $$('input[name="plan"]').forEach(input => input.onchange = () => {
    selectedPlan = input.value;
    $$(".plan-choice").forEach(el => el.classList.toggle("chosen", $("input", el).checked));
    const plan = plans.find(p => p.id === selectedPlan);
    if (chosenPhotos.length > plan.photos) chosenPhotos = chosenPhotos.slice(0, plan.photos);
    renderPhotos();
    $("#payButton").innerHTML = `Create page & pay · ${money(plan.price)} <span>↗</span>`;
  });
  ["recipientName","senderName","pageTitle","message","slug"].forEach(id => {
    const el = $("#" + id);
    el.addEventListener("input", () => {
      if (id === "recipientName" && !$("#slug").dataset.edited) {
        $("#slug").value = slugify(el.value + ( $("#templateId").value === "birthday" ? " birthday" : ""));
      }
      if (id === "slug") $("#slug").dataset.edited = "true";
      if (id === "message") $("#messageCount").textContent = el.value.length;
      updatePreview();
      if (id === "slug") { clearTimeout(slugTimer); slugTimer = setTimeout(checkSlug, 450); }
    });
  });
  $("#templateId").addEventListener("change", updatePreview);
  photoInput.onchange = () => {
    const plan = plans.find(p => p.id === selectedPlan);
    const incoming = [...photoInput.files];
    const valid = incoming.filter(file => ["image/jpeg","image/png","image/webp"].includes(file.type) && file.size <= 2_400_000);
    if (valid.length !== incoming.length) errorBox.textContent = "Only JPG, PNG or WebP photos under 2.3 MB are accepted.";
    const remaining = Math.max(0, plan.photos - chosenPhotos.length);
    chosenPhotos = [...chosenPhotos, ...valid.slice(0, remaining)];
    if (incoming.length > remaining) errorBox.textContent = `Your ${plan.name} plan allows up to ${plan.photos} photo(s).`;
    renderPhotos(); updatePreview(); photoInput.value = "";
  };
  $("#slug").addEventListener("blur", checkSlug);
  const loadRazorpay = () => new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement("script"); script.src = "https://checkout.razorpay.com/v1/checkout.js"; script.onload = resolve; script.onerror = () => reject(new Error("Could not load secure checkout. Check your connection and try again.")); document.head.appendChild(script);
  });
  const fileAsDataUrl = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read one of your photos.")); reader.readAsDataURL(file); });

  form.onsubmit = async event => {
    event.preventDefault(); errorBox.textContent = "";
    const button = $("#payButton");
    const recipientName = $("#recipientName").value.trim(), senderName = $("#senderName").value.trim(), message = $("#message").value.trim();
    const email = $("#email").value.trim(), phone = $("#phone").value.trim();
    if (!recipientName || !senderName || message.length < 8 || !email || phone.replace(/\D/g, "").length < 10) { errorBox.textContent = "Please complete the required fields. Your message must have at least 8 characters."; return; }
    const slug = slugify($("#slug").value);
    if (!slug || slug.length < 3) { errorBox.textContent = "Please add a page address with at least 3 characters."; return; }
    button.disabled = true; button.innerHTML = "Checking details… <span>…</span>";
    try {
      const availability = await api(`${API}/slug/check?slug=${encodeURIComponent(slug)}`);
      if (!availability.available) throw new Error(availability.reason || "Choose another page address.");
      const plan = plans.find(p => p.id === selectedPlan);
      const draft = {
        slug, templateId: $("#templateId").value, planId: selectedPlan, recipientName, senderName,
        title: $("#pageTitle").value.trim(), message, eventDate: $("#eventDate").value,
        email, phone, photoNames: chosenPhotos.map(file => file.name)
      };
      button.innerHTML = "Preparing your page… <span>…</span>";
      const order = await api(`${API}/orders/create`, { method:"POST", body:JSON.stringify(draft) });
      for (let i = 0; i < chosenPhotos.length; i++) {
        button.innerHTML = `Uploading photo ${i + 1}/${chosenPhotos.length}… <span>…</span>`;
        const dataBase64 = await fileAsDataUrl(chosenPhotos[i]);
        await api(`${API}/orders/${encodeURIComponent(order.orderId)}/upload`, { method:"POST", body:JSON.stringify({ uploadToken:order.uploadToken, fileName:chosenPhotos[i].name, contentType:chosenPhotos[i].type, dataBase64 }) });
      }
      await loadRazorpay();
      button.innerHTML = `Opening secure payment · ${money(plan.price)} <span>…</span>`;
      const checkout = new Razorpay({
        key: order.key, amount: order.amount, currency: order.currency, name: "YaadPage",
        description: `${plan.name} memory page`, order_id: order.orderId,
        prefill: { name: senderName, email, contact: phone },
        notes: { page: order.slug }, theme: { color: "#bd6f78" },
        handler: async response => {
          try {
            button.innerHTML = "Verifying payment… <span>…</span>";
            const verified = await api(`${API}/orders/verify`, { method:"POST", body:JSON.stringify(response) });
            go(`/success?slug=${encodeURIComponent(verified.slug)}`);
          } catch (error) { errorBox.textContent = `Payment received, but page publishing needs support: ${error.message}. Keep your payment ID: ${response.razorpay_payment_id}`; button.disabled = false; button.innerHTML = "Retry / contact support <span>↗</span>"; }
        },
        modal: { ondismiss: () => { button.disabled = false; button.innerHTML = `Try payment again · ${money(plan.price)} <span>↗</span>`; errorBox.textContent = "Payment window closed. Your page was not published."; } }
      });
      checkout.on("payment.failed", response => { errorBox.textContent = response.error?.description || "Payment did not go through. Please try again."; button.disabled = false; button.innerHTML = `Pay ${money(plan.price)} <span>↗</span>`; });
      checkout.open();
    } catch (error) {
      errorBox.textContent = error.message || "Something went wrong. Please try again.";
      button.disabled = false;
      const p = plans.find(x => x.id === selectedPlan);
      button.innerHTML = `Create page & pay · ${money(p.price)} <span>↗</span>`;
    }
  };
  updatePreview(); renderPhotos();
  $("#payButton").innerHTML = `Create page & pay · ${money(chosenPlan.price)} <span>↗</span>`;
}

function successPage() {
  setTitle("Your page is ready");
  const slug = new URLSearchParams(location.search).get("slug") || "";
  const url = `${location.origin}/${encodeURIComponent(slug)}`;
  $("#app").innerHTML = `${header()}<main class="success-wrap wrap"><div class="success-icon">✦</div><div class="eyebrow">PAYMENT VERIFIED</div><h1>Your page is <em>ready.</em></h1><p>Your memory page has been published. Copy the link and share it with your special person.</p><div class="share-link"><span>${esc(url)}</span><button class="button button-dark" id="copyLink">Copy link</button></div><div class="success-actions"><a class="button button-outline" href="/${encodeURIComponent(slug)}" target="_blank" rel="noopener">View your page ↗</a><a class="text-link" href="/">Back to YaadPage</a></div><small>Keep this link safe. Anyone who has it can view the page.</small></main>${footer()}`;
  $("#copyLink").onclick = async () => { try { await navigator.clipboard.writeText(url); $("#copyLink").textContent = "Copied ✓"; } catch { $("#copyLink").textContent = "Copy unavailable"; } };
}
function templateTheme(id) { return templates.find(t => t.id === id)?.theme || "pink"; }
async function memoryPage(slug) {
  setTitle("A special memory");
  const root = $("#app"); root.innerHTML = `<main class="memory-loading"><span class="brand-mark">Y</span><p>Opening something special…</p></main>`;
  try {
    const data = await api(`${API}/pages/${encodeURIComponent(slug)}`);
    const page = data.page;
    setTitle(page.title || `For ${page.recipientName}`);
    const photos = (page.photos || []).map(photo => `<div class="memory-photo"><img src="${API}/assets/${encodeURIComponent(slug)}/${encodeURIComponent(photo.id)}" alt="A shared memory" loading="lazy"></div>`).join("");
    const occasion = templates.find(t => t.id === page.templateId)?.tag || "A SPECIAL MOMENT";
    const date = page.eventDate ? new Date(`${page.eventDate}T00:00:00`).toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" }) : "";
    root.innerHTML = `<main class="memory-shell theme-${templateTheme(page.templateId)}"><div class="memory-grain"></div><header class="memory-brand">${brandMark()}<span>yaadpage</span></header><section class="memory-hero"><div class="memory-spark">✦</div><div class="memory-eyebrow">${esc(occasion)} · A PAGE MADE FOR YOU</div><h1>${esc(page.recipientName)}</h1><p class="memory-subtitle">${esc(page.title || "A little surprise for you")}</p><div class="memory-divider"><span>♡</span></div><article class="memory-letter"><p class="letter-greeting">Dear ${esc(page.recipientName)},</p><div class="letter-message">${esc(page.message).replace(/\n/g,"<br>")}</div><p class="letter-signoff">With love,<br><strong>${esc(page.senderName)}</strong></p></article>${date?`<div class="memory-date">${esc(date)}</div>`:""}</section>${photos?`<section class="memory-gallery"><div class="memory-gallery-heading"><span>THE LITTLE THINGS</span><h2>Moments worth <em>keeping.</em></h2></div><div class="memory-photo-grid">${photos}</div></section>`:""}<footer class="memory-footer"><span>Made into a memory with</span><a href="/">${brandMark()} YaadPage</a></footer></main>`;
  } catch (error) {
    const expired = error.message.toLowerCase().includes("expired");
    root.innerHTML = `<main class="not-found"><a class="brand" href="/">${brandMark()}<span>yaadpage<span class="brand-dot">.</span></span></a><div class="not-found-icon">${expired ? "⌛" : "♡"}</div><h1>${expired ? "This page has expired." : "This memory page wasn't found."}</h1><p>${expired ? "The hosting period for this page has ended." : "The link may be incorrect, or the page may not have been published yet."}</p><a class="button button-dark" href="/">Explore YaadPage <span>↗</span></a></main>`;
  }
}

function boot() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return home();
  if (path === "/create") return createPage();
  if (path === "/success") return successPage();
  if (["/admin","/api","/favicon.ico","/robots.txt"].includes(path)) return home();
  return memoryPage(path.slice(1));
}
boot();
