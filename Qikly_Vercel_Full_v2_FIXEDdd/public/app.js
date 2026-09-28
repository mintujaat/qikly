
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const money=n=>`₹${Number(n||0).toLocaleString("en-IN")}`;
let DATA={settings:{},categories:[],books:[],me:null};

async function api(url,opt={}){const r=await fetch(url,{cache:"no-store",...opt,headers:{"Content-Type":"application/json",...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`Request failed (${r.status})`);return d}
async function load(){const d=await api("/api/store");DATA={...d};try{const m=await api("/api/auth/me");DATA.me=m.user||null}catch{}}
function shell(content,active="home"){
 document.querySelector("#app").innerHTML=`
 <div class="announcement">${esc(DATA.settings.announcement||"Premium e-books • Instant access • Secure checkout")}</div>
 <header class="header"><a class="brand" href="/"><span class="brand-mark">${esc(DATA.settings.logoText||"Q")}</span><span><b>${esc(DATA.settings.siteName||"Qikly Books")}</b><small>${esc(DATA.settings.tagline||"Digital books, beautifully delivered.")}</small></span></a>
 <nav class="desktop-nav"><a class="${active==="home"?"active":""}" href="/">Home</a><a href="/store.html">E-books</a><a href="/#categories">Categories</a><a href="/#about">About</a></nav>
 <div class="header-actions"><button class="icon-btn" id="themeBtn" title="Theme">◐</button>${DATA.me?`<a class="avatar" href="/library.html">${esc((DATA.me.name||"R").slice(0,1).toUpperCase())}</a>`:`<a class="login-link" href="/auth.html">Login</a>`}</div></header>
 <main>${content}</main>
 <footer class="footer"><div><div class="brand"><span class="brand-mark">${esc(DATA.settings.logoText||"Q")}</span><span><b>${esc(DATA.settings.siteName||"Qikly Books")}</b><small>Premium digital reading.</small></span></div><p>${esc(DATA.settings.about||"A focused digital bookstore for useful books and original ideas.")}</p></div><div><h4>Explore</h4><a href="/store.html">All e-books</a><a href="/library.html">My library</a><a href="/auth.html">Account</a></div><div><h4>Support</h4><a href="/#about">About</a><a href="mailto:${esc(DATA.settings.supportEmail||"support@qikly.shop")}">Contact</a></div></footer>
 <div id="toast"></div>`;
 $("#themeBtn").onclick=()=>{document.body.classList.toggle("light");localStorage.qTheme=document.body.classList.contains("light")?"light":"dark"};
 if(localStorage.qTheme==="light")document.body.classList.add("light");
}
function toast(m){const t=$("#toast");if(!t)return;t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2500)}
function bookCard(b){
 return `<article class="book-card"><a class="cover ${esc(b.coverClass||"cover-violet")}" href="/book.html?id=${encodeURIComponent(b.id)}">${b.coverUrl?`<img src="${esc(b.coverUrl)}" alt="">`:`<div class="cover-shine"></div>`}<span class="cover-mini">${esc(b.categoryName||"E-BOOK")}</span><strong>${esc(b.title)}</strong><small>${esc(b.author||"Qikly Books")}</small></a><div class="book-meta"><div><b>${money(b.price)}</b>${b.oldPrice?`<del>${money(b.oldPrice)}</del>`:""}</div><span>★ ${Number(b.rating||5).toFixed(1)}</span></div></article>`;
}
function home(){
 const featured=DATA.books.filter(b=>b.featured), picks=(featured.length?featured:DATA.books).slice(0,3);
 shell(`<section class="hero"><div class="hero-copy"><span class="eyebrow">DIGITAL LIBRARY • INSTANT ACCESS</span><h1>${esc(DATA.settings.heroTitle)}</h1><p>${esc(DATA.settings.heroText)}</p><div class="hero-cta"><a class="btn primary" href="/store.html">Explore e-books →</a><a class="btn ghost" href="#categories">Browse categories</a></div><div class="trust"><span>✓ Secure Razorpay checkout</span><span>✓ Instant library access</span><span>✓ PDF format</span></div></div><div class="hero-stack">${picks.map((b,i)=>`<a class="hero-book hero-book-${i}" href="/book.html?id=${encodeURIComponent(b.id)}"><span class="cover ${esc(b.coverClass||"cover-violet")}"><div class="cover-shine"></div><span class="cover-mini">${esc(b.categoryName)}</span><strong>${esc(b.title)}</strong><small>${esc(b.author)}</small></span></a>`).join("")}</div></section>
 <section class="section"><div class="section-head"><div><span class="eyebrow">CURATED FOR YOU</span><h2>Featured e-books</h2></div><a href="/store.html">View all →</a></div><div class="book-grid">${picks.map(bookCard).join("")}</div></section>
 <section id="categories" class="section category-section"><div class="section-head"><div><span class="eyebrow">EXPLORE</span><h2>Choose your topic</h2></div></div><div class="category-grid">${DATA.categories.map(c=>`<a class="category-card" href="/store.html?category=${encodeURIComponent(c.id)}"><span>${esc(c.icon||"✦")}</span><b>${esc(c.title)}</b><small>${esc(c.description||"Explore books")}</small></a>`).join("")}</div></section>
 <section class="feature-band"><div><span class="eyebrow">WHY QIKLY BOOKS</span><h2>Buy once. Keep learning.</h2><p>Every purchase is added to your personal library so you can return to it whenever you need.</p></div><div class="feature-list"><span>01 <b>Instant delivery</b></span><span>02 <b>Secure payments</b></span><span>03 <b>Private library</b></span></div></section>
 <section id="about" class="section about"><span class="eyebrow">ABOUT</span><h2>Made for readers who build things.</h2><p>${esc(DATA.settings.about||"Qikly Books is a modern digital bookstore focused on practical, original e-books.")}</p></section>`);
}
async function store(){
 const qs=new URLSearchParams(location.search), cat=qs.get("category")||"all";
 shell(`<section class="store-top"><span class="eyebrow">QIKLY BOOKS</span><h1>All e-books</h1><p>Find a practical book for your next idea, skill or project.</p><div class="filters"><input id="search" placeholder="Search title, author or topic…"><select id="cat"><option value="all">All categories</option>${DATA.categories.map(c=>`<option value="${esc(c.id)}">${esc(c.title)}</option>`).join("")}</select><select id="sort"><option value="featured">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="rating">Top rated</option><option value="new">New arrivals</option></select></div></section><section class="section compact"><div id="results" class="book-grid"></div><div id="empty" class="empty hidden">No books match your search.</div></section>`);
 $("#cat").value=cat;
 const render=()=>{let a=[...DATA.books],q=$("#search").value.toLowerCase().trim(),c=$("#cat").value,s=$("#sort").value;if(q)a=a.filter(b=>`${b.title} ${b.author} ${b.categoryName}`.toLowerCase().includes(q));if(c!=="all")a=a.filter(b=>b.categoryId===c);a.sort((x,y)=>s==="low"?x.price-y.price:s==="high"?y.price-x.price:s==="rating"?y.rating-x.rating:s==="new"?Number(y.newArrival)-Number(x.newArrival):Number(y.featured)-Number(x.featured));$("#results").innerHTML=a.map(bookCard).join("");$("#empty").classList.toggle("hidden",a.length>0)};
 ["search","cat","sort"].forEach(id=>$("#"+id).oninput=render);render();
}
async function bookPage(){
 const id=new URLSearchParams(location.search).get("id");let b=DATA.books.find(x=>x.id===id);
 if(!b){try{b=(await api("/api/books/"+encodeURIComponent(id))).book}catch{}}
 if(!b){shell(`<section class="empty-page"><h1>Book not found</h1><a class="btn primary" href="/store.html">Back to store</a></section>`);return}
 shell(`<section class="book-detail"><div class="detail-cover cover ${esc(b.coverClass||"cover-violet")}">${b.coverUrl?`<img src="${esc(b.coverUrl)}" alt="">`:`<div class="cover-shine"></div>`}<span class="cover-mini">${esc(b.categoryName)}</span><strong>${esc(b.title)}</strong><small>${esc(b.author)}</small></div><div class="detail-copy"><span class="eyebrow">${esc(b.categoryName||"E-BOOK")}</span><h1>${esc(b.title)}</h1><p class="author">By ${esc(b.author||"Qikly Books")} · ${Number(b.pages||0)} pages · PDF</p><div class="rating">★★★★★ <span>${Number(b.rating||5).toFixed(1)}</span></div><p class="lead">${esc(b.description||"A premium digital book.")}</p><div class="price-row"><b>${money(b.price)}</b>${b.oldPrice?`<del>${money(b.oldPrice)}</del>`:""}<span>one-time purchase</span></div><button class="btn primary full" id="buy">Buy & get instant access</button><div class="secure-note">🔒 Secure payment via Razorpay · Your book appears in My Library after payment.</div></div></section><section class="section book-info"><div><span class="eyebrow">WHAT'S INSIDE</span><h2>What you'll learn</h2><ul>${(b.highlights||[]).map(x=>`<li>✓ ${esc(x)}</li>`).join("")}</ul></div><div class="info-card"><span>FORMAT</span><b>PDF</b><span>PAGES</span><b>${Number(b.pages||0)}</b><span>ACCESS</span><b>Instant</b></div></section>`);
 $("#buy").onclick=()=>{if(!DATA.me){location.href="/auth.html?next="+encodeURIComponent("/book.html?id="+b.id);return}location.href="/checkout.html?id="+encodeURIComponent(b.id)};
}
async function checkout(){
 if(!DATA.me){location.href="/auth.html?next="+encodeURIComponent(location.pathname+location.search);return}
 const id=new URLSearchParams(location.search).get("id"),b=DATA.books.find(x=>x.id===id);
 if(!b){shell(`<section class="empty-page"><h1>Book not found</h1></section>`);return}
 shell(`<section class="checkout-page"><div><span class="eyebrow">SECURE CHECKOUT</span><h1>Complete your purchase</h1><p>You're one step away from adding this book to your library.</p><div class="checkout-book">${bookCard(b)}</div></div><aside class="summary"><h3>Order summary</h3><div><span>${esc(b.title)}</span><b>${money(b.price)}</b></div><div class="total"><span>Total</span><b>${money(b.price)}</b></div><button class="btn primary full" id="pay">Pay ${money(b.price)}</button><small>Payments are securely processed by Razorpay.</small><div id="payErr" class="error"></div></aside></section>`);
 $("#pay").onclick=async()=>{
  const btn=$("#pay");btn.disabled=true;btn.textContent="Opening payment…";
  try{
   const o=await api("/api/checkout/create-order",{method:"POST",body:JSON.stringify({bookId:id})});
   if(!window.Razorpay){await new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="https://checkout.razorpay.com/v1/checkout.js";s.onload=resolve;s.onerror=reject;document.head.appendChild(s)})}
   const rzp=new Razorpay({key:""+(window.__RAZORPAY_KEY||""),amount:o.amount,currency:o.currency,name:DATA.settings.siteName||"Qikly Books",description:o.book.title,order_id:o.orderId,prefill:{name:DATA.me.name,email:DATA.me.email},theme:{color:DATA.settings.accent||"#7c3aed"},handler:async response=>{try{await api("/api/checkout/verify",{method:"POST",body:JSON.stringify({...response,bookId:id})});location.href="/library.html?purchased=1"}catch(e){$("#payErr").textContent=e.message;btn.disabled=false;btn.textContent="Try payment again"}}});rzp.open();
  }catch(e){$("#payErr").textContent=e.message;btn.disabled=false;btn.textContent=`Pay ${money(b.price)}`}
 };
 // public key is fetched from endpoint below
 try{const d=await api("/api/payment/key");window.__RAZORPAY_KEY=d.key}catch{}
}
async function authPage(){
 const next=new URLSearchParams(location.search).get("next")||"/library.html";
 shell(`<section class="auth-wrap"><div class="auth-card"><span class="eyebrow">QIKLY BOOKS</span><h1 id="authTitle">Welcome back</h1><p id="authSub">Sign in to access your personal library.</p><div class="auth-tabs"><button class="active" data-mode="login">Login</button><button data-mode="signup">Create account</button></div><form id="authForm"><label id="nameLabel" class="hidden">Name<input id="name"></label><label>Email<input id="email" type="email" required></label><label>Password<input id="password" type="password" minlength="6" required></label><button class="btn primary full">Continue →</button><div id="authErr" class="error"></div></form></div></section>`);
 let mode="login";const setMode=m=>{mode=m;$$(".auth-tabs button").forEach(x=>x.classList.toggle("active",x.dataset.mode===m));$("#nameLabel").classList.toggle("hidden",m!=="signup");$("#authTitle").textContent=m==="signup"?"Create your account":"Welcome back";$("#authSub").textContent=m==="signup"?"Create your free reading account.":"Sign in to access your personal library."};
 $$(".auth-tabs button").forEach(x=>x.onclick=()=>setMode(x.dataset.mode));
 $("#authForm").onsubmit=async e=>{e.preventDefault();$("#authErr").textContent="";try{await api(mode==="signup"?"/api/auth/signup":"/api/auth/login",{method:"POST",body:JSON.stringify({name:$("#name").value,email:$("#email").value,password:$("#password").value})});location.href=next}catch(err){$("#authErr").textContent=err.message}};
}
async function library(){
 if(!DATA.me){location.href="/auth.html?next=/library.html";return}
 let lib;try{lib=await api("/api/library")}catch(e){shell(`<section class="empty-page"><h1>${esc(e.message)}</h1></section>`);return}
 shell(`<section class="store-top"><span class="eyebrow">YOUR COLLECTION</span><h1>My Library</h1><p>${lib.books.length} book${lib.books.length===1?"":"s"} ready to read.</p></section><section class="section compact">${lib.books.length?`<div class="library-grid">${lib.books.map(b=>`<article class="library-card"><div class="cover ${esc(b.coverClass||"cover-violet")}">${b.coverUrl?`<img src="${esc(b.coverUrl)}">`:`<div class="cover-shine"></div>`}<strong>${esc(b.title)}</strong><small>${esc(b.author)}</small></div><div><span class="eyebrow">${esc(b.categoryName)}</span><h3>${esc(b.title)}</h3><p>${esc((b.description||"").slice(0,120))}</p><button class="btn primary read" data-id="${esc(b.id)}">Read now →</button></div></article>`).join("")}</div>`:`<div class="empty"><h2>Your library is empty</h2><p>Buy your first e-book and it will appear here instantly.</p><a class="btn primary" href="/store.html">Browse books</a></div>`}</section>`);
 $$(".read").forEach(btn=>btn.onclick=async()=>{btn.disabled=true;try{const d=await api("/api/books/"+encodeURIComponent(btn.dataset.id)+"/access");location.href=d.url}catch(e){toast(e.message);btn.disabled=false}});
}
async function route(){
 await load();
 const p=location.pathname;
 if(p==="/store.html")return store();
 if(p==="/book.html")return bookPage();
 if(p==="/checkout.html")return checkout();
 if(p==="/auth.html")return authPage();
 if(p==="/library.html")return library();
 return home();
}
route();
