const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const money=n=>`₹${Number(n||0).toLocaleString("en-IN")}`;
const STORE_CACHE_KEY="qikly_store_cache_v4", STORE_CACHE_TTL=45_000;
let DATA={settings:{},categories:[],books:[],me:null,ownedIds:new Set()};
let chatHistory=[];

async function api(url,opt={}){
  const r=await fetch(url,{cache:"no-store",...opt,headers:{"Content-Type":"application/json",...(opt.headers||{})}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||`Request failed (${r.status})`);
  return d;
}
function setInitialLoading(){
  const root=$("#app");
  if(root)root.innerHTML=`<div class="app-splash"><div class="splash-mark">Q</div><div class="splash-line"></div><p>Loading your library…</p></div>`;
}
async function load(){
  let cached=null;
  try{const raw=sessionStorage.getItem(STORE_CACHE_KEY);if(raw){const x=JSON.parse(raw);if(Date.now()-x.time<STORE_CACHE_TTL)cached=x.data}}catch{}
  const storeP=api("/api/store").then(d=>{try{sessionStorage.setItem(STORE_CACHE_KEY,JSON.stringify({time:Date.now(),data:d}))}catch{};return d});
  const meP=api("/api/auth/me").catch(()=>({user:null}));
  if(cached){DATA={...cached,me:null,ownedIds:new Set()};const m=await meP;DATA.me=m.user||null;if(DATA.me)await loadOwned();storeP.catch(()=>{});return}
  const [d,m]=await Promise.all([storeP,meP]);DATA={...d,me:m.user||null,ownedIds:new Set()};if(DATA.me)await loadOwned();
}
async function loadOwned(){try{const d=await api("/api/library");DATA.ownedIds=new Set((d.books||[]).map(b=>b.id))}catch{DATA.ownedIds=new Set()}}
function shell(content,active="home"){
  const initial=(DATA.me?.name||"R").trim().slice(0,1).toUpperCase();
  document.querySelector("#app").innerHTML=`
  <div class="announcement"><span>✦</span>${esc(DATA.settings.announcement||"Premium e-books • Instant access • Secure checkout")}</div>
  <header class="header"><a class="brand" href="/"><span class="brand-mark">${esc(DATA.settings.logoText||"Q")}</span><span><b>${esc(DATA.settings.siteName||"Qikly Books")}</b><small>${esc(DATA.settings.tagline||"Digital books, beautifully delivered.")}</small></span></a>
    <nav class="desktop-nav" aria-label="Main navigation">
      <a class="${active==="home"?"active":""}" href="/">Home</a>
      <a class="${active==="store"?"active":""}" href="/store.html">E-books</a>
      <a href="/#categories">Categories</a>
      <a class="${active==="library"?"active":""}" href="/library.html">My Library</a>
    </nav>
    <div class="header-actions"><button class="icon-btn" id="themeBtn" title="Toggle theme">◐</button>${DATA.me?`<a class="account-pill" href="/library.html"><span>${initial}</span><b>${esc((DATA.me.name||"Reader").split(" ")[0])}</b></a>`:`<a class="login-link" href="/auth.html">Login</a>`}</div>
  </header>
  <main>${content}</main>
  <nav class="mobile-nav" aria-label="Mobile navigation"><a href="/" class="${active==="home"?"active":""}">⌂<span>Home</span></a><a href="/store.html" class="${active==="store"?"active":""}">▦<span>Store</span></a><a href="/library.html" class="${active==="library"?"active":""}">▤<span>My Books</span></a><a href="${DATA.me?"/library.html":"/auth.html"}">◉<span>Account</span></a></nav>
  <footer class="footer"><div><div class="brand"><span class="brand-mark">${esc(DATA.settings.logoText||"Q")}</span><span><b>${esc(DATA.settings.siteName||"Qikly Books")}</b><small>Premium digital reading.</small></span></div><p>${esc(DATA.settings.about||"A focused digital bookstore for useful books and original ideas.")}</p></div><div><h4>Explore</h4><a href="/store.html">All e-books</a><a href="/library.html">My Library</a><a href="/#categories">Categories</a></div><div><h4>Support</h4><a href="/#about">About</a><a href="mailto:${esc(DATA.settings.supportEmail||"support@qikly.shop")}">Contact</a></div></footer>
  <div id="toast" class="toast"></div>${aiBot()}`;
  $("#themeBtn").onclick=()=>{document.body.classList.toggle("light");localStorage.qTheme=document.body.classList.contains("light")?"light":"dark"};
  if(localStorage.qTheme==="light")document.body.classList.add("light");
  initAiBot();
}
function aiBot(){return `<div class="ai-bot"><button id="aiToggle" class="ai-fab" aria-label="Open Qikly AI"><span>✦</span><i></i></button><section id="aiPanel" class="ai-panel" aria-hidden="true"><div class="ai-head"><div><span class="ai-orb">✦</span><div><b>Qikly AI</b><small>Book guide & reading assistant</small></div></div><button id="aiClose" aria-label="Close">×</button></div><div id="aiMessages" class="ai-messages"><div class="ai-msg ai"><b>Qikly AI</b><p>Need help finding a book or using your library?</p><div class="ai-suggestions"><button data-ai="Which books should I start with?">Recommend a book</button><button data-ai="How does My Library work?">My Library help</button></div></div></div><form id="aiForm" class="ai-form"><input id="aiInput" maxlength="700" placeholder="Ask about books, learning or your account…" autocomplete="off"><button>Send</button></form></section></div>`}
function initAiBot(){
 const toggle=$("#aiToggle"),panel=$("#aiPanel"),close=$("#aiClose"),form=$("#aiForm"),input=$("#aiInput"),messages=$("#aiMessages");
 if(!toggle)return;
 const open=()=>{panel.classList.add("open");panel.setAttribute("aria-hidden","false");input.focus()};
 const shut=()=>{panel.classList.remove("open");panel.setAttribute("aria-hidden","true")};
 toggle.onclick=open;close.onclick=shut;
 $$("[data-ai]").forEach(b=>b.onclick=()=>{input.value=b.dataset.ai;form.requestSubmit()});
 const add=(who,text)=>{const node=document.createElement("div");node.className=`ai-msg ${who}`;node.innerHTML=who==="user"?`<p>${esc(text)}</p>`:`<b>Qikly AI</b><p>${esc(text).replace(/\n/g,"<br>")}</p>`;messages.appendChild(node);messages.scrollTop=messages.scrollHeight};
 form.onsubmit=async e=>{e.preventDefault();const message=input.value.trim();if(!message)return;input.value="";add("user",message);chatHistory.push({role:"user",parts:[{text:message}]});const loading=document.createElement("div");loading.className="ai-msg ai thinking";loading.innerHTML=`<b>Qikly AI</b><p><span></span><span></span><span></span></p>`;messages.appendChild(loading);messages.scrollTop=messages.scrollHeight;try{const recent=chatHistory.slice(-8);const d=await api("/api/ai/chat",{method:"POST",body:JSON.stringify({message,history:recent})});loading.remove();add("ai",d.text||"I couldn't answer that right now.");chatHistory.push({role:"model",parts:[{text:d.text||""}]})}catch(err){loading.remove();add("ai",err.message||"AI is temporarily unavailable.")}};
}
function toast(m){const t=$("#toast");if(!t)return;t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2500)}
function coverMarkup(b,small=false){return `<div class="cover ${esc(b.coverClass||"cover-violet")}${small?" cover-small":""}">${b.coverUrl?`<img loading="lazy" decoding="async" src="${esc(b.coverUrl)}" alt="${esc(b.title)} cover">`:`<div class="cover-shine"></div>`}<span class="cover-mini">${esc(b.categoryName||"E-BOOK")}</span><strong>${esc(b.title)}</strong><small>${esc(b.author||"Qikly Books")}</small></div>`}
function bookCard(b){const owned=DATA.ownedIds.has(b.id);return `<article class="book-card"><a class="book-link" href="/book.html?id=${encodeURIComponent(b.id)}">${coverMarkup(b)}${owned?`<span class="owned-chip">✓ You own this</span>`:""}</a><div class="book-meta"><div><b>${money(b.price)}</b>${b.oldPrice?`<del>${money(b.oldPrice)}</del>`:""}</div><span>★ ${Number(b.rating||5).toFixed(1)}</span></div><div class="book-footer"><span>${esc(b.author||"Qikly Books")}</span><a href="/book.html?id=${encodeURIComponent(b.id)}">${owned?"Read":"View book"} →</a></div></article>`}
function home(){
 const featured=DATA.books.filter(b=>b.featured),picks=(featured.length?featured:DATA.books).slice(0,3);
 shell(`<section class="hero"><div class="hero-copy"><span class="eyebrow">DIGITAL LIBRARY • INSTANT ACCESS</span><h1>${esc(DATA.settings.heroTitle||"Stories, skills & ideas — all in one digital library.")}</h1><p>${esc(DATA.settings.heroText||"Discover premium e-books created for learners, builders and curious minds. Pay securely and get instant access.")}</p><div class="hero-cta"><a class="btn primary" href="/store.html">Explore e-books <span>→</span></a><a class="btn ghost" href="#categories">Browse categories</a></div><div class="trust"><span>✓ Secure Razorpay checkout</span><span>✓ Your books stay in My Library</span><span>✓ Instant PDF access</span></div></div><div class="hero-stack">${picks.map((b,i)=>`<a class="hero-book hero-book-${i}" href="/book.html?id=${encodeURIComponent(b.id)}">${coverMarkup(b)}</a>`).join("")}</div></section>
 <section class="section"><div class="section-head"><div><span class="eyebrow">CURATED FOR YOU</span><h2>Featured e-books</h2></div><a href="/store.html">View all →</a></div><div class="book-grid">${picks.map(bookCard).join("")}</div></section>
 <section id="categories" class="section category-section"><div class="section-head"><div><span class="eyebrow">EXPLORE BY TOPIC</span><h2>Find your next read</h2></div></div><div class="category-grid">${DATA.categories.map(c=>`<a class="category-card" href="/store.html?category=${encodeURIComponent(c.id)}"><span>${esc(c.icon||"✦")}</span><b>${esc(c.title)}</b><small>${esc(c.description||"Explore books")}</small><em>Explore →</em></a>`).join("")}</div></section>
 <section class="feature-band"><div><span class="eyebrow">WHY QIKLY BOOKS</span><h2>One account. Your books, wherever you sign in.</h2><p>Every verified purchase is linked to your account and appears in My Library automatically.</p></div><div class="feature-list"><span>01 <b>Instant delivery</b></span><span>02 <b>Secure payments</b></span><span>03 <b>Personal library</b></span></div></section>
 <section id="about" class="section about"><span class="eyebrow">ABOUT QIKLY</span><h2>Built around your reading library.</h2><p>${esc(DATA.settings.about||"Qikly Books is a modern digital bookstore focused on practical, original e-books.")}</p></section>`);
}
async function store(){
 const qs=new URLSearchParams(location.search),cat=qs.get("category")||"all";
 shell(`<section class="store-top"><span class="eyebrow">QIKLY BOOKS STORE</span><h1>Find your next book.</h1><p>Search by title, author or topic and save your purchases to My Library.</p><div class="filters"><div class="searchbox"><span>⌕</span><input id="search" placeholder="Search books, authors or topics…" autocomplete="off"></div><select id="cat"><option value="all">All categories</option>${DATA.categories.map(c=>`<option value="${esc(c.id)}">${esc(c.title)}</option>`).join("")}</select><select id="sort"><option value="featured">Recommended</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="rating">Top rated</option><option value="new">New arrivals</option></select></div></section><section class="section compact"><div id="results" class="book-grid"></div><div id="empty" class="empty hidden"><h3>No books found</h3><p>Try another search or category.</p></div></section>`);
 $("#cat").value=cat;
 const render=()=>{let a=[...DATA.books],q=$("#search").value.toLowerCase().trim(),c=$("#cat").value,s=$("#sort").value;if(q)a=a.filter(b=>`${b.title} ${b.author} ${b.categoryName}`.toLowerCase().includes(q));if(c!=="all")a=a.filter(b=>b.categoryId===c);a.sort((x,y)=>s==="low"?x.price-y.price:s==="high"?y.price-x.price:s==="rating"?y.rating-x.rating:s==="new"?Number(y.newArrival)-Number(x.newArrival):Number(y.featured)-Number(x.featured));$("#results").innerHTML=a.map(bookCard).join("");$("#empty").classList.toggle("hidden",a.length>0)};
 ["search","cat","sort"].forEach(id=>$("#"+id).oninput=render);render();
}
async function bookPage(){
 const id=new URLSearchParams(location.search).get("id");let b=DATA.books.find(x=>x.id===id);if(!b){try{b=(await api("/api/books/"+encodeURIComponent(id))).book}catch{}}
 if(!b){shell(`<section class="empty-page"><h1>Book not found</h1><a class="btn primary" href="/store.html">Back to store</a></section>`);return}
 const owned=DATA.ownedIds.has(b.id);
 shell(`<section class="book-detail"><div class="detail-visual"><div class="detail-cover-wrap">${coverMarkup(b)}</div>${owned?`<div class="owned-banner">✓ You own this book</div>`:`<div class="cover-caption">Secure PDF • Instant access after payment</div>`}</div><div class="detail-copy"><span class="eyebrow">${esc(b.categoryName||"E-BOOK")}</span><h1>${esc(b.title)}</h1><p class="author">By ${esc(b.author||"Qikly Books")} · ${Number(b.pages||0)} pages · PDF</p><div class="rating">★★★★★ <span>${Number(b.rating||5).toFixed(1)}</span></div><p class="lead">${esc(b.description||"A premium digital book.")}</p><div class="price-row"><b>${owned?"Owned":money(b.price)}</b>${!owned&&b.oldPrice?`<del>${money(b.oldPrice)}</del>`:""}${!owned?`<span>one-time purchase</span>`:`<span>Available in your library</span>`}</div>${owned?`<a class="btn primary full" href="/library.html">You own this book · Read now →</a>`:`<button class="btn primary full" id="buy">Buy & get instant access</button>`}<div class="secure-note">🔒 Secure payment via Razorpay · Your purchase is saved to your private library.</div></div></section><section class="section book-info"><div><span class="eyebrow">WHAT'S INSIDE</span><h2>What you'll learn</h2><ul>${(b.highlights||[]).map(x=>`<li>✓ ${esc(x)}</li>`).join("")}</ul></div><div class="info-card"><span>FORMAT</span><b>PDF</b><span>PAGES</span><b>${Number(b.pages||0)}</b><span>ACCESS</span><b>Instant</b></div></section>`);
 if(!owned)$("#buy").onclick=()=>{if(!DATA.me){location.href="/auth.html?next="+encodeURIComponent("/book.html?id="+b.id);return}location.href="/checkout.html?id="+encodeURIComponent(b.id)};
}
async function checkout(){
 if(!DATA.me){location.href="/auth.html?next="+encodeURIComponent(location.pathname+location.search);return}
 const id=new URLSearchParams(location.search).get("id"),b=DATA.books.find(x=>x.id===id);if(!b){shell(`<section class="empty-page"><h1>Book not found</h1></section>`);return}
 if(DATA.ownedIds.has(id)){location.href="/library.html";return}
 shell(`<section class="checkout-page"><div><span class="eyebrow">SECURE CHECKOUT</span><h1>Complete your purchase</h1><p>Your book will appear in My Library immediately after payment verification.</p><div class="checkout-book">${bookCard(b)}</div></div><aside class="summary"><span class="summary-label">ORDER SUMMARY</span><h3>${esc(b.title)}</h3><div><span>Book</span><b>${money(b.price)}</b></div><div class="total"><span>Total</span><b>${money(b.price)}</b></div><button class="btn primary full" id="pay">Pay ${money(b.price)}</button><small>Payments are securely processed by Razorpay.</small><div id="payErr" class="error"></div></aside></section>`);
 $("#pay").onclick=async()=>{const btn=$("#pay");btn.disabled=true;btn.textContent="Opening payment…";try{const o=await api("/api/checkout/create-order",{method:"POST",body:JSON.stringify({bookId:id})});if(!window.Razorpay){await new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="https://checkout.razorpay.com/v1/checkout.js";s.onload=resolve;s.onerror=reject;document.head.appendChild(s)})}const rzp=new Razorpay({key:String(window.__RAZORPAY_KEY||""),amount:o.amount,currency:o.currency,name:DATA.settings.siteName||"Qikly Books",description:o.book.title,order_id:o.orderId,prefill:{name:DATA.me.name,email:DATA.me.email},theme:{color:DATA.settings.accent||"#7c3aed"},handler:async response=>{try{await api("/api/checkout/verify",{method:"POST",body:JSON.stringify({...response,bookId:id})});location.href="/library.html?purchased=1"}catch(e){$("#payErr").textContent=e.message;btn.disabled=false;btn.textContent=`Pay ${money(b.price)}`}}});rzp.open()}catch(e){$("#payErr").textContent=e.message;btn.disabled=false;btn.textContent=`Pay ${money(b.price)}`}};
 try{const d=await api("/api/payment/key");window.__RAZORPAY_KEY=d.key}catch{}
}
async function authPage(){
 const next=new URLSearchParams(location.search).get("next")||"/library.html";
 shell(`<section class="auth-wrap"><div class="auth-layout"><div class="auth-pitch"><span class="eyebrow">YOUR PRIVATE READING ACCOUNT</span><h1>Keep your books in one place.</h1><p>Create an account only to save your purchased books and access them again from your library.</p><div class="auth-benefits"><div><span>✓</span><div><b>Save your purchases</b><small>Every verified book is linked to your account.</small></div></div><div><span>✓</span><div><b>Read from any device</b><small>Sign in and open your My Library.</small></div></div><div><span>✓</span><div><b>No unnecessary setup</b><small>Your account exists for your digital books.</small></div></div></div></div><div class="auth-card"><div class="auth-card-top"><span class="ai-orb">Q</span><div><span class="eyebrow">QIKLY BOOKS</span><small>Private digital library</small></div></div><h2 id="authTitle">Welcome back</h2><p id="authSub">Sign in to access your saved books.</p><div class="auth-tabs"><button class="active" data-mode="login">Sign in</button><button data-mode="signup">Create account</button></div><form id="authForm"><label id="nameLabel" class="hidden">Your name<input id="name" autocomplete="name"></label><label>Email<input id="email" type="email" autocomplete="email" required></label><label>Password<input id="password" type="password" autocomplete="current-password" minlength="6" required></label><button class="btn primary full">Continue →</button><div id="authErr" class="error"></div></form><small class="auth-privacy">This account is only used to save and access your purchased e-books.</small></div></div></section>`);
 let mode="login";const setMode=m=>{mode=m;$$('.auth-tabs button').forEach(x=>x.classList.toggle('active',x.dataset.mode===m));$("#nameLabel").classList.toggle("hidden",m!=="signup");$("#authTitle").textContent=m==="signup"?"Create your reading account":"Welcome back";$("#authSub").textContent=m==="signup"?"Create a simple account for your e-books.":"Sign in to access your saved books.";$("#password").setAttribute("autocomplete",m==="signup"?"new-password":"current-password")};
 $$(".auth-tabs button").forEach(x=>x.onclick=()=>setMode(x.dataset.mode));
 $("#authForm").onsubmit=async e=>{e.preventDefault();$("#authErr").textContent="";const submit=e.submitter;submit.disabled=true;try{await api(mode==="signup"?"/api/auth/signup":"/api/auth/login",{method:"POST",body:JSON.stringify({name:$("#name").value,email:$("#email").value,password:$("#password").value})});location.href=next}catch(err){$("#authErr").textContent=err.message;submit.disabled=false}};
}
async function library(){
 if(!DATA.me){location.href="/auth.html?next=/library.html";return}
 let lib;try{lib=await api("/api/library");DATA.ownedIds=new Set((lib.books||[]).map(b=>b.id))}catch(e){shell(`<section class="empty-page"><h1>${esc(e.message)}</h1></section>`);return}
 const purchased=new URLSearchParams(location.search).get("purchased")==="1";
 shell(`<section class="library-head"><div><span class="eyebrow">YOUR PRIVATE COLLECTION</span><h1>My Library</h1><p>${lib.books.length} book${lib.books.length===1?"":"s"} saved to your account.</p></div><a class="btn ghost" href="/store.html">+ Browse e-books</a></section>${purchased?`<div class="purchase-success"><span>✓</span><div><b>Purchase complete.</b><small>Your book is now in My Library.</small></div><a href="#library-list">Read it now →</a></div>`:""}<section id="library-list" class="section compact">${lib.books.length?`<div class="library-grid">${lib.books.map(b=>`<article class="library-card"><div class="library-cover">${coverMarkup(b,true)}<span class="owned-chip">✓ You own this</span></div><div class="library-copy"><span class="eyebrow">${esc(b.categoryName||"E-BOOK")}</span><h3>${esc(b.title)}</h3><p>${esc((b.description||"").slice(0,150))}</p><div class="library-meta"><span>PDF · ${Number(b.pages||0)} pages</span><span>Purchased</span></div><button class="btn primary read" data-id="${esc(b.id)}">Read now →</button></div></article>`).join("")}</div>`:`<div class="empty"><span class="empty-icon">▤</span><h2>Your library is empty</h2><p>Buy your first e-book and it will appear here automatically.</p><a class="btn primary" href="/store.html">Explore e-books</a></div>`}</section>`);
 $$(".read").forEach(btn=>btn.onclick=async()=>{btn.disabled=true;btn.textContent="Opening…";try{const d=await api("/api/books/"+encodeURIComponent(btn.dataset.id)+"/access");location.href=d.url}catch(e){toast(e.message);btn.disabled=false;btn.textContent="Read now →"}});
}
async function route(){setInitialLoading();try{await load();const p=location.pathname;if(p==="/store.html")return store();if(p==="/book.html")return bookPage();if(p==="/checkout.html")return checkout();if(p==="/auth.html")return authPage();if(p==="/library.html")return library();return home()}catch(e){document.querySelector("#app").innerHTML=`<section class="empty-page"><h1>Something went wrong</h1><p class="error">${esc(e.message)}</p><a class="btn primary" href="/">Reload store</a></section>`}}
route();
