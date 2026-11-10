const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
const money = value => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const API = "/api/yaadpage";
const templates = [
  { id:"birthday", name:"Birthday Glow", tag:"Birthday", detail:"Bright, joyful and full of little surprises", icon:"✦", theme:"pink" },
  { id:"birthday-confetti", name:"Confetti Party", tag:"Birthday", detail:"A colourful celebration with playful details", icon:"🎉", theme:"pink" },
  { id:"birthday-elegance", name:"Birthday Elegance", tag:"Birthday", detail:"A soft, elegant birthday note", icon:"❀", theme:"cream" },
  { id:"birthday-night", name:"Midnight Wish", tag:"Birthday", detail:"A rich night-sky birthday design", icon:"✧", theme:"night" },
  { id:"love", name:"Love Letter", tag:"Love", detail:"A warm digital letter for your person", icon:"♡", theme:"rose" },
  { id:"love-story", name:"Our Little World", tag:"Love", detail:"A romantic page for your shared story", icon:"∞", theme:"rose" },
  { id:"long-distance", name:"Miles Apart", tag:"Love", detail:"Close at heart, even when far away", icon:"☾", theme:"night" },
  { id:"proposal", name:"One Question", tag:"Proposal", detail:"A thoughtful page for a big question", icon:"❦", theme:"night" },
  { id:"valentine", name:"Be My Valentine", tag:"Love", detail:"A sweet Valentine surprise", icon:"♥", theme:"rose" },
  { id:"anniversary", name:"Our Story", tag:"Anniversary", detail:"Celebrate the moments you share", icon:"∞", theme:"cream" },
  { id:"anniversary-timeline", name:"Our Timeline", tag:"Anniversary", detail:"Turn your milestones into a memory journey", icon:"⌁", theme:"lilac" },
  { id:"golden-anniversary", name:"Golden Years", tag:"Anniversary", detail:"A timeless golden anniversary tribute", icon:"✧", theme:"cream" },
  { id:"wedding-invitation", name:"The Wedding Invite", tag:"Wedding", detail:"An elegant shareable wedding invitation", icon:"❀", theme:"cream" },
  { id:"wedding-save-date", name:"Save the Date", tag:"Wedding", detail:"A beautiful announcement for the big day", icon:"♧", theme:"cream" },
  { id:"wedding-floral", name:"Floral Vows", tag:"Wedding", detail:"A romantic floral wedding design", icon:"❦", theme:"pink" },
  { id:"wedding-royal", name:"Royal Celebration", tag:"Wedding", detail:"A grand wedding announcement", icon:"♛", theme:"night" },
  { id:"wedding-minimal", name:"Modern Minimal", tag:"Wedding", detail:"A clean and modern wedding invitation", icon:"◇", theme:"sage" },
  { id:"wedding-gallery", name:"Wedding Memories", tag:"Wedding", detail:"A photo-first page for wedding memories", icon:"▧", theme:"rose" },
  { id:"engagement", name:"The Engagement", tag:"Wedding", detail:"Celebrate the beginning of forever", icon:"♢", theme:"lilac" },
  { id:"bestfriend", name:"Best Friend Forever", tag:"Friendship", detail:"A personal tribute to your best friend", icon:"✷", theme:"lilac" },
  { id:"friendship-timeline", name:"Friendship Files", tag:"Friendship", detail:"A timeline of your favourite memories", icon:"✦", theme:"lilac" },
  { id:"graduation", name:"The Next Chapter", tag:"Milestone", detail:"Celebrate a graduation or new beginning", icon:"✧", theme:"night" },
  { id:"thankyou", name:"A Thank You Page", tag:"Appreciation", detail:"A thoughtful page to say thank you", icon:"✿", theme:"sage" },
  { id:"family", name:"Family Moments", tag:"Family", detail:"A warm page for family celebrations", icon:"⌂", theme:"sage" }
];
const plans = [
  { id:"starter", name:"Note", price:199, photos:1, detail:"A beautiful, personal page for one special photo.", features:["1 hero photo", "Personal letter and custom URL", "Elegant single-page design", "1-year hosting"] },
  { id:"story", name:"Story", price:399, photos:10, detail:"An interactive memory journey, not just a photo page.", features:["Up to 10 photos", "Tap-to-open letter reveal", "Three animated story chapters", "Polaroid-style memory gallery", "1-year hosting"], popular:true },
  { id:"premium", name:"Signature", price:699, photos:100, detail:"A cinematic keepsake for weddings, anniversaries and the biggest moments.", features:["Up to 100 photos", "Cinematic photo cover", "Occasion-specific wedding / anniversary layout", "Full-screen photo lightbox", "Premium memory timeline", "1-year hosting"] }
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
  const headline = item.tag === "Wedding" ? "Together forever" : item.tag === "Anniversary" ? "Every year, us" : item.tag === "Birthday" ? "Make a wish" : item.tag === "Friendship" ? "My favourite human" : item.tag === "Love" ? "A little note" : item.tag === "Proposal" ? "One special question" : "A moment to remember";
  const subline = item.tag === "Wedding" ? "A day made beautiful" : item.tag === "Anniversary" ? "A story still unfolding" : item.tag === "Birthday" ? "For someone wonderful" : "Made just for you";
  return `<article class="template-card"><a class="template-art art-${item.theme}" href="/create?template=${item.id}"><div class="art-window"><span class="art-spark">${item.icon}</span><small>${item.tag.toUpperCase()} EDITION</small><strong>${headline}</strong><i>${subline}</i><span class="art-button">Open surprise <b>↗</b></span></div><span class="art-index">0${index + 1}</span></a><div class="template-info"><div><h3>${item.name}</h3><p>${item.detail}</p></div><a class="round-arrow" href="/create?template=${item.id}" aria-label="Create ${item.name}">↗</a></div></article>`;
}
function home() {
  setTitle("Make Memories Shareable");
  const root = $("#app");
  root.innerHTML = `${header()}<main>
    <section class="hero wrap"><div class="hero-copy"><div class="eyebrow"><span class="eyebrow-dot"></span> A LITTLE WEBSITE. A BIG FEELING.</div><h1>Make a moment<br>they can <em>open.</em></h1><p class="hero-lede">Turn your photos, words and memories into a beautiful little website. Create it in minutes. Share it with someone special.</p><div class="hero-actions"><a class="button button-dark" href="/create">Create a surprise <span>↗</span></a><a class="text-link" href="#designs">Explore designs <span>↓</span></a></div><div class="hero-proof"><div class="avatar-stack"><i>A</i><i>R</i><i>M</i><i>+</i></div><span>Made for the people who matter.</span></div></div><div class="hero-visual"><div class="visual-orbit orbit-one"></div><div class="visual-orbit orbit-two"></div><div class="floating-note note-one"><span>♡</span><b>just for you</b></div><div class="floating-note note-two"><span>✦</span><b>a memory to keep</b></div><div class="hero-phone"><div class="phone-top"><span></span><span></span></div><div class="phone-screen"><div class="phone-flower">✿</div><small>A LITTLE SURPRISE FOR</small><h2>ANANYA</h2><p>Today is all about you.</p><div class="phone-photo"><span>♡</span></div><div class="phone-message">You make ordinary days feel special.</div><div class="phone-hearts">♡　♡　♡</div></div></div><div class="hero-sticker">made<br>with love <span>✦</span></div></div></section>
    <section class="trust-strip"><div class="wrap trust-inner"><span>NO DESIGN SKILLS NEEDED</span><i>✳</i><span>YOUR OWN SHAREABLE LINK</span><i>✳</i><span>READY IN MINUTES</span><i>✳</i><span>MADE TO FEEL PERSONAL</span></div></section>
    <section class="section wrap" id="designs"><div class="section-heading"><div><div class="eyebrow">CHOOSE YOUR FEELING</div><h2>A design for every <em>occasion.</em></h2></div><p>Pick a starting point. Add your own words and photos. We'll turn it into a page worth opening.</p></div><div class="template-grid">${templates.filter(t=>["birthday","anniversary","wedding-invitation","wedding-floral","wedding-royal","bestfriend"].includes(t.id)).map(templateCard).join("")}</div><div class="center-action"><a class="button button-outline" href="/create">See all designs <span>↗</span></a></div></section>
    <section class="how-section" id="how-it-works"><div class="wrap"><div class="section-heading"><div><div class="eyebrow">THREE SIMPLE STEPS</div><h2>From your idea<br>to their <em>surprise.</em></h2></div><p>No coding. No app to install. Just a few details and a link you can share anywhere.</p></div><div class="steps-grid"><article class="step-card"><span class="step-number">01</span><div class="step-icon">✿</div><h3>Choose a design</h3><p>Start with a birthday, love, anniversary, wedding, friendship or milestone design.</p></article><article class="step-card"><span class="step-number">02</span><div class="step-icon">⌁</div><h3>Make it yours</h3><p>Add names, a personal message and your favourite photos.</p></article><article class="step-card"><span class="step-number">03</span><div class="step-icon">↗</div><h3>Share the link</h3><p>Your page is created automatically. Send its unique link to your person.</p></article></div></div></section>
    <section class="video-section wrap" id="how-video"><div class="video-copy"><div class="eyebrow">SEE IT IN ACTION</div><h2>How YaadPage <em>works.</em></h2><p>A quick walkthrough of choosing a design, adding your memories and sharing your own page.</p></div><div class="how-video-frame" id="howVideoFrame"><div class="video-placeholder"><span>▶</span><b>How it works</b><small>Video guide will appear here.</small></div></div></section>
    <section class="pricing-section wrap" id="pricing"><div class="section-heading"><div><div class="eyebrow">SIMPLE, ONE-TIME PRICING</div><h2>A small price for a<br><em>lasting smile.</em></h2></div><p>Every plan gives you a personal link and one year of hosting. Choose the experience you want to create.</p></div><div class="pricing-grid">${plans.map(p=>`<article class="price-card price-${p.id} ${p.popular ? "price-popular" : ""}">${p.popular?'<span class="popular-label">MOST POPULAR</span>':""}<div class="price-name">${p.name}</div><div class="price-amount">${money(p.price)}<small> one time</small></div><p>${p.detail}</p><ul>${p.features.map(x=>`<li><span>✓</span>${x}</li>`).join("")}</ul><a class="button ${p.popular ? "button-dark" : "button-outline"}" href="/create?plan=${p.id}">Choose ${p.name} <span>↗</span></a></article>`).join("")}</div><p class="pricing-note">No subscription. No hidden monthly charge. Renewal details are shown before checkout.</p></section>
    <section class="quote-section"><div class="wrap quote-inner"><span class="quote-mark">“</span><blockquote>Some things are too special for a simple text message.</blockquote><p>Give the moment a page of its own.</p><a class="button button-dark" href="/create">Make their page <span>↗</span></a></div></section>
    <section class="faq-section wrap"><div class="section-heading"><div><div class="eyebrow">GOOD TO KNOW</div><h2>A few quick <em>answers.</em></h2></div><p>Everything you need to know before making your first page.</p></div><div class="faq-list"><details><summary>Do I need to know how to code? <span>＋</span></summary><p>No. Choose a design, fill in the form and YaadPage builds your page automatically.</p></details><details><summary>What will my page link look like? <span>＋</span></summary><p>Your page gets its own address, such as yaadpage.online/annayabirthday. You choose the ending when you create it.</p></details><details><summary>Can I share the page on WhatsApp? <span>＋</span></summary><p>Yes. Once your payment is verified, copy the link and share it through WhatsApp, Instagram or anywhere else.</p></details><details><summary>How long will my page stay online? <span>＋</span></summary><p>All current plans include one year of hosting. Renewal options will be shown before your page expires.</p></details><details><summary>Are my photos public? <span>＋</span></summary><p>Anyone with your page link can view the photos you choose to include. Do not upload private or sensitive images.</p></details></div></section>
  </main>${footer()}`;
  const menu = $("#mobileMenu");
  if (menu) menu.onclick = () => { const nav = $(".desktop-nav"); nav.classList.toggle("mobile-open"); };
  api(`${API}/config`).then(config => {
    if(config.howItWorksVideoId) $("#howVideoFrame").innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(config.howItWorksVideoId)}?rel=0" title="How YaadPage works" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
  }).catch(()=>{});
}

function createPage() {
  setTitle("Create your page");
  const params = new URLSearchParams(location.search);
  const chosenTemplate = templates.find(x => x.id === params.get("template")) || templates[0];
  const chosenPlan = plans.find(x => x.id === params.get("plan")) || plans[1];
  const root = $("#app");
  root.innerHTML = `${header()}<main class="create-wrap wrap"><div class="create-heading"><a href="/" class="back-link">← Back to home</a><div class="eyebrow">YOUR MOMENT STARTS HERE</div><h1>Make it <em>personal.</em></h1><p>Fill in a few details. Your page will be created automatically after payment.</p></div><div class="create-layout"><form class="create-form" id="createForm" novalidate>
    <section class="form-section"><div class="form-section-title"><span>01</span><div><h2>Choose your design</h2><p>Start with the occasion that feels right.</p></div></div><div class="template-filter-row"><button type="button" class="template-filter active" data-template-filter="All">All designs</button>${[...new Set(templates.map(t=>t.tag))].map(tag=>`<button type="button" class="template-filter" data-template-filter="${tag}">${tag}</button>`).join("")}</div><div class="design-select-grid">${templates.map(t=>`<button type="button" class="design-choice ${t.id===chosenTemplate.id?"selected":""}" data-template="${t.id}" data-category="${t.tag}"><span class="choice-icon theme-${t.theme}">${t.icon}</span><b>${t.name}</b><small>${t.tag}</small></button>`).join("")}</div><input type="hidden" id="templateId" value="${chosenTemplate.id}"></section>
    <section class="form-section"><div class="form-section-title"><span>02</span><div><h2>The people behind it</h2><p>These details make the page feel personal.</p></div></div><div class="field-grid"><label><span id="recipientLabel">Who is this page for?</span><input id="recipientName" maxlength="70" placeholder="e.g. Ananya" required></label><label><span id="senderLabel">Your name</span><input id="senderName" maxlength="70" placeholder="e.g. Mintu" required></label><label class="field-full">Page headline<input id="pageTitle" maxlength="90" placeholder="e.g. A little surprise for you"></label><label>Special date <span class="optional">Optional</span><input id="eventDate" type="date"></label><label>Page address <span class="required-note">Required</span><div class="slug-input"><span>yaadpage.online/</span><input id="slug" maxlength="42" placeholder="your-special-name" required></div><small id="slugStatus" class="field-hint">This will be your personal page link.</small></label><label class="field-full">Your message<textarea id="message" rows="5" maxlength="1200" placeholder="Write something they will love reading…" required></textarea><small class="field-hint"><span id="messageCount">0</span>/1200 characters</small></label></div></section>
    <section class="form-section"><div class="form-section-title"><span>03</span><div><h2>Add your photos</h2><p>Use JPG, PNG or WebP. Every photo must be smaller than 2 MB.</p></div></div><label class="upload-zone" for="photos"><span class="upload-icon">＋</span><b>Choose photos</b><small id="photoHelp">Up to ${chosenPlan.photos} photo(s) with your selected plan</small><input id="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label><div id="photoPreviews" class="photo-previews"></div><p class="privacy-hint">Only upload photos you have permission to share. Anyone with the page link can view them.</p></section>
    <section class="form-section"><div class="form-section-title"><span>04</span><div><h2>Choose your plan</h2><p>One-time payment. One year of hosting.</p></div></div><div class="plan-choice-grid">${plans.map(p=>`<label class="plan-choice plan-choice-${p.id} ${p.id===chosenPlan.id?"chosen":""}"><input type="radio" name="plan" value="${p.id}" ${p.id===chosenPlan.id?"checked":""}><span class="plan-choice-top"><b>${p.name}</b><strong>${money(p.price)}</strong></span><small>${p.photos===100?"Up to 100":p.photos} photo${p.photos>1?"s":""} · 1-year hosting</small><em>${p.detail}</em><span class="plan-choice-features">${p.features.slice(0,3).join(" · ")}</span>${p.popular?'<i>Popular</i>':""}</label>`).join("")}</div></section>
    <section class="form-section coupon-section"><div class="form-section-title"><span>05</span><div><h2>Have a promo code?</h2><p>Apply a discount code or a free-page code.</p></div></div><div class="coupon-row"><input id="promoCode" maxlength="24" placeholder="Enter promo code" autocomplete="off"><button type="button" class="button button-outline" id="applyPromo">Apply code</button></div><div id="promoStatus" class="field-hint" aria-live="polite"></div><div id="priceSummary" class="price-summary"><span>Order total</span><strong id="finalPrice">${money(chosenPlan.price)}</strong></div></section>
    <section class="form-section"><div class="form-section-title"><span>06</span><div><h2>Where should we send the link?</h2><p>Used for your order confirmation and support.</p></div></div><div class="field-grid"><label>Email address<input id="email" type="email" autocomplete="email" placeholder="you@example.com" required></label><label>WhatsApp number<input id="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="10-digit mobile number" required></label></div></section>
    <div id="createError" class="form-error" role="alert"></div><button type="submit" class="button button-dark button-wide" id="payButton">Create page & pay <span>↗</span></button><p class="checkout-note"><span>🔒</span> Secure checkout. Your page publishes after payment verification or a verified free promo code.</p>
  </form><aside class="live-preview"><div class="preview-top"><span class="live-dot"></span> LIVE PREVIEW <small>Illustrative</small></div><div class="preview-page art-${chosenTemplate.theme}" id="livePreview"><div class="preview-flower">${chosenTemplate.icon}</div><small>A LITTLE SURPRISE FOR</small><h2 id="previewName">YOUR PERSON</h2><p id="previewHeadline">A little surprise for you</p><div class="preview-photo" id="previewPhoto">♡</div><blockquote id="previewMessage">Your message will appear here. Make it personal, make it yours.</blockquote><div class="preview-sign">WITH LOVE · <span id="previewSender">YOU</span></div></div><div class="preview-url"><span>YOUR LINK</span><b id="previewSlug">yaadpage.online/your-special-name</b></div><p class="preview-disclaimer">Preview only. Your published page includes the final details and selected design.</p></aside></div></main>${footer()}`;
  bindCreateForm(chosenPlan.id);
}

function bindCreateForm(initialPlan) {
  const form = $("#createForm"), photoInput = $("#photos"), errorBox = $("#createError");
  let selectedPlan = initialPlan;
  let chosenPhotos = [];
  let appliedPromo = null;
  let slugTimer = null;
  let lastSlugCheck = "";
  const selectedTemplate = () => templates.find(t => t.id === $("#templateId").value) || templates[0];
  const slugify = value => String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 42).replace(/-+$/g, "");
  const updateFormLabels = () => {
    const t=selectedTemplate(),wedding=t.tag==="Wedding",anniversary=t.tag==="Anniversary";
    $("#recipientLabel").textContent=wedding?"Second partner / person's name":anniversary?"Partner's name":"Who is this page for?";
    $("#senderLabel").textContent=wedding?"First partner / person's name":"Your name";
  };
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
    $("#photoHelp").textContent = `${chosenPhotos.length}/${plan.photos} photos selected · each under 2 MB`;
    $("#photoPreviews").innerHTML = chosenPhotos.map((file, index) => `<div class="photo-preview"><img src="${URL.createObjectURL(file)}" alt="Selected photo"><button type="button" data-remove-photo="${index}" aria-label="Remove photo">×</button><small>${esc(file.name)}</small></div>`).join("");
    $$('[data-remove-photo]').forEach(btn => btn.onclick = () => { chosenPhotos.splice(Number(btn.dataset.removePhoto), 1); renderPhotos(); updatePreview(); });
  };
  const updatePriceSummary = () => {
    const plan=plans.find(p=>p.id===selectedPlan)||plans[1];
    const total=appliedPromo?appliedPromo.amount:plan.price;
    $("#finalPrice").textContent=money(total);
    $("#priceSummary").classList.toggle("has-discount",!!appliedPromo&&appliedPromo.discount>0);
  };
  const applyPromo = async () => {
    const code=$("#promoCode").value.trim().toUpperCase(),status=$("#promoStatus"),button=$("#applyPromo");
    appliedPromo=null;updatePriceSummary();
    const currentPlan=plans.find(x=>x.id===selectedPlan)||plans[1];
    $("#payButton").innerHTML=`Create page & pay · ${money(currentPlan.price)} <span>↗</span>`;
    if(!code){status.textContent="Enter a promo code first.";status.className="field-hint invalid";return;}
    button.disabled=true;button.textContent="Checking…";status.textContent="Validating code…";status.className="field-hint";
    try{
      const quote=await api(`${API}/promo/validate?code=${encodeURIComponent(code)}&plan=${encodeURIComponent(selectedPlan)}`);
      appliedPromo=quote;
      status.textContent=quote.isFree?`Code applied. Your page is free (${money(quote.discount)} off).`:`Code applied. You save ${money(quote.discount)}.`;
      status.className="field-hint valid";updatePriceSummary();
      $("#payButton").innerHTML=quote.isFree?"Publish my page for free <span>↗</span>":`Create page & pay · ${money(quote.amount)} <span>↗</span>`;
    }catch(e){status.textContent=e.message;status.className="field-hint invalid";}
    finally{button.disabled=false;button.textContent="Apply code";}
  };
  $$("[data-template-filter]").forEach(btn=>btn.onclick=()=>{
    $$("[data-template-filter]").forEach(x=>x.classList.toggle("active",x===btn));
    const category=btn.dataset.templateFilter;
    $$("[data-template]").forEach(card=>card.hidden=category!=="All"&&card.dataset.category!==category);
  });
  $$("[data-template]").forEach(btn => btn.onclick = () => {
    $$("[data-template]").forEach(x => x.classList.toggle("selected", x === btn));
    $("#templateId").value = btn.dataset.template;
    const t = selectedTemplate();
    updateFormLabels();
    $("#livePreview").className = `preview-page art-${t.theme}`;
    $(".preview-flower").textContent = t.icon;
  });
  $$('input[name="plan"]').forEach(input => input.onchange = () => {
    selectedPlan = input.value;
    $$(".plan-choice").forEach(el => el.classList.toggle("chosen", $("input", el).checked));
    const plan = plans.find(p => p.id === selectedPlan);
    if (chosenPhotos.length > plan.photos) chosenPhotos = chosenPhotos.slice(0, plan.photos);
    appliedPromo=null;$("#promoStatus").textContent="Plan changed. Apply your promo code again.";$("#promoStatus").className="field-hint";
    renderPhotos();updatePriceSummary();
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
    const valid = incoming.filter(file => ["image/jpeg","image/png","image/webp"].includes(file.type) && file.size < 2_000_000);
    const rejected = incoming.length-valid.length;
    const remaining = Math.max(0, plan.photos - chosenPhotos.length);
    chosenPhotos = [...chosenPhotos, ...valid.slice(0, remaining)];
    if(rejected)errorBox.textContent = `${rejected} file(s) skipped. Use JPG, PNG or WebP photos smaller than 2 MB.`;
    else errorBox.textContent="";
    if (valid.length > remaining) errorBox.textContent += ` Your ${plan.name} plan allows up to ${plan.photos} photo(s).`;
    renderPhotos(); updatePreview(); photoInput.value = "";
  };
  $("#slug").addEventListener("blur", checkSlug);
  $("#applyPromo").onclick=applyPromo;
  $("#promoCode").addEventListener("input",()=>{if(appliedPromo){appliedPromo=null;updatePriceSummary();const plan=plans.find(x=>x.id===selectedPlan)||plans[1];$("#payButton").innerHTML=`Create page & pay · ${money(plan.price)} <span>↗</span>`;$("#promoStatus").textContent="Code changed. Apply it again.";$("#promoStatus").className="field-hint";}});
  $("#promoCode").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();applyPromo();}});
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
        email, phone, photoNames: chosenPhotos.map(file => file.name), promoCode: appliedPromo?.code || ""
      };
      button.innerHTML = "Preparing your page… <span>…</span>";
      const order = await api(`${API}/orders/create`, { method:"POST", body:JSON.stringify(draft) });
      for (let i = 0; i < chosenPhotos.length; i++) {
        button.innerHTML = `Uploading photo ${i + 1}/${chosenPhotos.length}… <span>…</span>`;
        const dataBase64 = await fileAsDataUrl(chosenPhotos[i]);
        await api(`${API}/orders/${encodeURIComponent(order.orderId)}/upload`, { method:"POST", body:JSON.stringify({ uploadToken:order.uploadToken, fileName:chosenPhotos[i].name, contentType:chosenPhotos[i].type, dataBase64 }) });
      }
      if(order.isFree){
        button.innerHTML="Publishing your free page… <span>…</span>";
        const published=await api(`${API}/orders/free/complete`,{method:"POST",body:JSON.stringify({orderId:order.orderId,uploadToken:order.uploadToken})});
        go(`/success?slug=${encodeURIComponent(published.slug)}&mode=free`);
        return;
      }
      await loadRazorpay();
      button.innerHTML = `Opening secure payment · ${money(order.plan.price)} <span>…</span>`;
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
        modal: { ondismiss: () => { button.disabled = false; button.innerHTML = `Try payment again · ${money(order.plan.price)} <span>↗</span>`; errorBox.textContent = "Payment window closed. Your page was not published."; } }
      });
      checkout.on("payment.failed", response => { errorBox.textContent = response.error?.description || "Payment did not go through. Please try again."; button.disabled = false; button.innerHTML = `Pay ${money(order.plan.price)} <span>↗</span>`; });
      checkout.open();
    } catch (error) {
      errorBox.textContent = error.message || "Something went wrong. Please try again.";
      button.disabled = false;
      const p = plans.find(x => x.id === selectedPlan);
      button.innerHTML = appliedPromo?.isFree ? "Publish my page for free <span>↗</span>" : `Create page & pay · ${money(appliedPromo?.amount ?? p.price)} <span>↗</span>`;
    }
  };
  updateFormLabels();updatePreview(); renderPhotos();updatePriceSummary();
  $("#payButton").innerHTML = `Create page & pay · ${money(chosenPlan.price)} <span>↗</span>`;
}

function successPage() {
  setTitle("Your page is ready");
  const slug = new URLSearchParams(location.search).get("slug") || "";
  const url = `${location.origin}/${encodeURIComponent(slug)}`;
  $("#app").innerHTML = `${header()}<main class="success-wrap wrap"><div class="success-icon">✦</div><div class="eyebrow">${new URLSearchParams(location.search).get("mode")==="free"?"FREE PAGE PUBLISHED":"PAYMENT VERIFIED"}</div><h1>Your page is <em>ready.</em></h1><p>Your memory page has been published. Copy the link and share it with your special person.</p><div class="share-link"><span>${esc(url)}</span><button class="button button-dark" id="copyLink">Copy link</button></div><div class="success-actions"><a class="button button-outline" href="/${encodeURIComponent(slug)}" target="_blank" rel="noopener">View your page ↗</a><a class="text-link" href="/">Back to YaadPage</a></div><small>Keep this link safe. Anyone who has it can view the page.</small></main>${footer()}`;
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
    const photosList = Array.isArray(page.photos) ? page.photos : [];
    const imageUrl = photo => `${API}/assets/${encodeURIComponent(slug)}/${encodeURIComponent(photo.id)}`;
    const template = templates.find(t => t.id === page.templateId) || templates[0];
    const occasion = template.tag || "A SPECIAL MOMENT";
    const date = page.eventDate ? new Date(`${page.eventDate}T00:00:00`).toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" }) : "";
    const planId = ["starter", "story", "premium"].includes(page.planId) ? page.planId : "starter";
    const isStory = planId === "story";
    const isPremium = planId === "premium";
    const isWedding = page.templateId.startsWith("wedding-") || page.templateId === "engagement";
    const isAnniversary = page.templateId.startsWith("anniversary") || page.templateId === "golden-anniversary";
    const firstPhoto = photosList[0] ? imageUrl(photosList[0]) : "";
    const safeName = esc(page.recipientName || "Someone special");
    const safeSender = esc(page.senderName || "With love");
    const safeMessage = esc(page.message || "").replace(/\n/g,"<br>");

    const specialCard = isWedding
      ? `<section class="wedding-special ${isPremium?"wedding-special-premium":""}" data-reveal><div class="special-kicker">TOGETHER WITH THEIR FAMILIES</div><div class="special-flourish">✦　❦　✦</div><h2>${safeSender} <span>＆</span> ${safeName}</h2><p>invite you to celebrate their special day</p>${date?`<div class="special-date">${esc(date.toUpperCase())}</div>`:`<div class="special-date">A DAY TO REMEMBER</div>`}<div class="wedding-seal">FOREVER BEGINS HERE</div></section>`
      : isAnniversary
        ? `<section class="anniversary-special ${isPremium?"anniversary-special-premium":""}" data-reveal><div class="special-kicker">ANOTHER CHAPTER · A LIFETIME OF MEMORIES</div><div class="special-flourish">∞</div><h2>${safeSender} <span>＆</span> ${safeName}</h2><p>${esc(page.title || "Our story keeps getting better")}</p><div class="anniversary-steps"><span>THE BEGINNING</span><span>EVERY CHAPTER</span><span>FOREVER AHEAD</span></div>${date?`<div class="special-date">${esc(date.toUpperCase())}</div>`:""}</section>`
        : "";

    const storyOpening = isStory
      ? `<section class="story-opening" data-reveal><div class="story-opening-copy"><span class="experience-kicker">THE STORY EDITION · MADE JUST FOR YOU</span><div class="story-orbit">∞</div><h2>${safeName}<span>’s little world.</span></h2><p>${esc(page.title || "A collection of moments that mean everything")}</p><a class="story-start" href="#story-letter">Open the letter <b>↓</b></a></div>${firstPhoto?`<figure class="story-opening-photo"><img src="${esc(firstPhoto)}" alt="A favourite memory" fetchpriority="high"><figcaption>ONE OF OUR FAVOURITE MOMENTS</figcaption></figure>`:`<div class="story-opening-art"><span>♡</span><b>Made of little moments</b></div>`}</section>`
      : "";

    const signatureOpening = isPremium
      ? `<section class="signature-cover ${isWedding?"signature-wedding":isAnniversary?"signature-anniversary":""}" data-reveal>${firstPhoto?`<img class="signature-cover-image" src="${esc(firstPhoto)}" alt="A treasured memory" fetchpriority="high">`:""}<div class="signature-cover-shade"></div><div class="signature-cover-content"><span class="signature-overline">${isWedding?"A CELEBRATION OF FOREVER":isAnniversary?"A LOVE THAT KEEPS GROWING":`${esc(occasion.toUpperCase())} · SIGNATURE EDITION`}</span><div class="signature-monogram">${isWedding?"✦　❦　✦":isAnniversary?"∞":"✧"}</div><h1>${isWedding?`${safeSender} & ${safeName}`:isAnniversary?`${safeSender} & ${safeName}`:safeName}</h1><p>${esc(page.title || (isWedding?"Together is a beautiful place to be":isAnniversary?"Every chapter is better with you":"A story worth keeping forever"))}</p>${date?`<div class="signature-date">${esc(date.toUpperCase())}</div>`:""}<a href="#signature-story" class="signature-scroll">EXPLORE THE MEMORIES <span>↓</span></a></div><span class="signature-photo-count">${photosList.length} ${photosList.length===1?"MEMORY":"MEMORIES"}</span></section>`
      : "";

    const letter = isStory
      ? `<details class="memory-letter interactive-letter" id="story-letter"><summary><span><small>A LITTLE SOMETHING FROM ${safeSender.toUpperCase()}</small><b>There’s a letter for you</b></span><i>Tap to open　♡</i></summary><div class="letter-inside"><p class="letter-greeting">Dear ${safeName},</p><div class="letter-message">${safeMessage}</div><p class="letter-signoff">With love,<br><strong>${safeSender}</strong></p></div></details>`
      : `<article class="memory-letter ${isPremium?"signature-letter":""}" ${isPremium?'data-reveal':""}><p class="letter-greeting">${isWedding?"A note for our guests":`Dear ${safeName},`}</p><div class="letter-message">${safeMessage}</div><p class="letter-signoff">With love,<br><strong>${safeSender}</strong></p></article>`;

    const storyChapters = isStory
      ? `<section class="story-chapters" data-reveal><div class="experience-heading"><span class="experience-kicker">A FEW CHAPTERS OF US</span><h2>It’s the little things<br>that make a <em>whole story.</em></h2></div><div class="chapter-grid"><article class="chapter-card"><span>01</span><b>The beginning</b><p>One little moment that started it all.</p></article><article class="chapter-card"><span>02</span><b>The little things</b><p>All the ordinary days that became favourites.</p></article><article class="chapter-card"><span>03</span><b>And what comes next</b><p>More memories are waiting to be made.</p></article></div></section>`
      : "";

    const premiumStory = isPremium
      ? `<section class="signature-story" id="signature-story" data-reveal><div class="experience-heading"><span class="experience-kicker">THE SIGNATURE EXPERIENCE</span><h2>${isWedding?"A promise, a celebration, a forever.":isAnniversary?"Every year adds another beautiful chapter.":"A hundred little reasons to remember."}</h2><p>Collected in one place, made to be opened again and again.</p></div><div class="signature-milestones"><div><span>01</span><b>${isWedding?"The promise":isAnniversary?"The beginning":"The first frame"}</b><small>Where the story starts</small></div><div><span>02</span><b>${isWedding?"The celebration":isAnniversary?"Every chapter":"The little things"}</b><small>Moments worth keeping</small></div><div><span>03</span><b>${isWedding?"The forever":isAnniversary?"Forever ahead":"More to come"}</b><small>The best is still being written</small></div></div></section>`
      : "";

    const photoCards = photosList.map((photo,index) => {
      const src = imageUrl(photo);
      return isPremium
        ? `<button class="memory-photo signature-photo" type="button" data-lightbox-src="${esc(src)}" data-lightbox-alt="Memory ${index+1}"><img src="${esc(src)}" alt="Memory ${index+1}" loading="lazy"><span class="signature-photo-index">${String(index+1).padStart(2,"0")}</span><span class="signature-photo-zoom">＋</span></button>`
        : `<figure class="memory-photo ${isStory?"story-photo":""}" data-reveal><img src="${esc(src)}" alt="A shared memory ${index+1}" loading="lazy">${isStory?`<figcaption>MEMORY ${String(index+1).padStart(2,"0")}</figcaption>`:""}</figure>`;
    }).join("");

    const gallery = photosList.length
      ? `<section class="memory-gallery ${isStory?"story-gallery":""} ${isPremium?"signature-gallery":""}" id="${isPremium?"signature-gallery":"memory-gallery"}"><div class="memory-gallery-heading"><span>${isWedding?"A GLIMPSE OF THE CELEBRATION":isAnniversary?"OUR FAVOURITE CHAPTERS":isPremium?"A COLLECTION OF LITTLE FOREVERS":"THE LITTLE THINGS"}</span><h2>${isWedding?"Moments from our journey":isAnniversary?"Every picture, a memory":isPremium?"A gallery made to <em>revisit.</em>":"Moments worth <em>keeping.</em>"}</h2>${isPremium?`<p>${photosList.length} ${photosList.length===1?"photo":"photos"} · Tap any photo to see it up close</p>`:""}</div><div class="memory-photo-grid">${photoCards}</div></section>`
      : "";

    const progress = (isStory||isPremium) ? `<div class="memory-progress" aria-hidden="true"><span></span></div>` : "";
    const premiumShare = isPremium ? `<div class="signature-share-wrap"><p>This page is a keepsake. Share it with the people who belong in this story.</p><button class="signature-share" id="shareMemory" type="button">Share this keepsake <span>↗</span></button></div><div class="photo-lightbox" id="photoLightbox" aria-hidden="true"><button type="button" class="lightbox-close" data-lightbox-close aria-label="Close photo">×</button><button type="button" class="lightbox-prev" data-lightbox-prev aria-label="Previous photo">‹</button><img id="lightboxImage" alt="Expanded memory"><button type="button" class="lightbox-next" data-lightbox-next aria-label="Next photo">›</button><div class="lightbox-caption" id="lightboxCaption"></div></div>` : "";

    root.innerHTML = `<main class="memory-shell theme-${templateTheme(page.templateId)} plan-${planId} ${isWedding?"occasion-wedding":""} ${isAnniversary?"occasion-anniversary":""}">${progress}<div class="memory-grain"></div><header class="memory-brand">${brandMark()}<span>yaadpage</span>${isPremium?`<span class="brand-signature">SIGNATURE</span>`:""}</header>${signatureOpening}${storyOpening}<section class="memory-hero ${isStory?"memory-hero-story":""} ${isPremium?"memory-hero-premium":""}"><div class="memory-spark">${esc(template.icon)}</div><div class="memory-eyebrow">${esc(occasion)} · ${isPremium?"A KEEPSAKE MADE TO LAST":isStory?"A STORY MADE JUST FOR YOU":"A PAGE MADE FOR YOU"}</div>${!isPremium?`<h1>${isWedding?"A Day to Remember":isAnniversary?"Our Story, Always":safeName}</h1><p class="memory-subtitle">${esc(page.title || "A little surprise for you")}</p>`:""}${specialCard}<div class="memory-divider"><span>♡</span></div>${letter}${date&&!isWedding&&!isAnniversary?`<div class="memory-date">${esc(date)}</div>`:""}</section>${storyChapters}${premiumStory}${gallery}${premiumShare}<footer class="memory-footer"><span>${isPremium?"A little piece of forever, made with":"Made into a memory with"}</span><a href="/">${brandMark()} YaadPage</a></footer></main>`;

    if (isStory || isPremium) {
      const shell = $(".memory-shell", root);
      const progressBar = $(".memory-progress span", root);
      const updateProgress = () => {
        if (!progressBar) return;
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        progressBar.style.width = `${Math.min(100, Math.max(0, window.scrollY / max * 100))}%`;
      };
      window.addEventListener("scroll", updateProgress, { passive:true });
      updateProgress();
      if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(entries => entries.forEach(entry => {
          if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
        }), { threshold:0.12 });
        shell.querySelectorAll("[data-reveal]").forEach(el => observer.observe(el));
      } else shell.querySelectorAll("[data-reveal]").forEach(el => el.classList.add("is-visible"));
    }

    if (isPremium) {
      let currentLightboxIndex = 0;
      const lightbox = $("#photoLightbox", root);
      const lightboxImage = $("#lightboxImage", root);
      const lightboxCaption = $("#lightboxCaption", root);
      const lightboxButtons = () => $$('[data-lightbox-src]', root);
      const showLightbox = index => {
        const buttons = lightboxButtons();
        if (!buttons.length) return;
        currentLightboxIndex = (index + buttons.length) % buttons.length;
        const button = buttons[currentLightboxIndex];
        lightboxImage.src = button.dataset.lightboxSrc;
        lightboxImage.alt = button.dataset.lightboxAlt || "Memory photo";
        lightboxCaption.textContent = `${currentLightboxIndex+1} / ${buttons.length}`;
        lightbox.classList.add("open");lightbox.setAttribute("aria-hidden","false");document.body.classList.add("lightbox-open");
      };
      const closeLightbox = () => { lightbox.classList.remove("open");lightbox.setAttribute("aria-hidden","true");document.body.classList.remove("lightbox-open");lightboxImage.src=""; };
      root.addEventListener("click", event => {
        const photoButton = event.target.closest("[data-lightbox-src]");
        if (photoButton) { showLightbox(lightboxButtons().indexOf(photoButton)); return; }
        if (event.target.closest("[data-lightbox-close]") || event.target === lightbox) { closeLightbox(); return; }
        if (event.target.closest("[data-lightbox-prev]")) { showLightbox(currentLightboxIndex-1); return; }
        if (event.target.closest("[data-lightbox-next]")) { showLightbox(currentLightboxIndex+1); return; }
        if (event.target.closest("#shareMemory")) {
          const shareData = { title:document.title, text:"A special memory page made on YaadPage", url:location.href };
          if (navigator.share) navigator.share(shareData).catch(()=>{});
          else if (navigator.clipboard?.writeText) navigator.clipboard.writeText(location.href).then(()=>{ $("#shareMemory").innerHTML="Link copied <span>✓</span>"; }).catch(()=>{});
        }
      });
      document.addEventListener("keydown", event => {
        if (!lightbox.classList.contains("open")) return;
        if (event.key === "Escape") closeLightbox();
        if (event.key === "ArrowLeft") showLightbox(currentLightboxIndex-1);
        if (event.key === "ArrowRight") showLightbox(currentLightboxIndex+1);
      });
    }
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
