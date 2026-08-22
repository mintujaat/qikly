const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
async function json(url,opt={}){const r=await fetch(url,{cache:"no-store",...opt,headers:{"Content-Type":"application/json",...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`Request failed (${r.status})`);return d}
function avatar(g){return g.imageUrl?`<img src="${esc(g.imageUrl)}" alt="${esc(g.name)}" loading="lazy">`:`<span>${esc(g.emoji||"🔮")}</span>`}
async function init(){
 try{
  const d=await json("/api/public/data");
  renderGurus(d.gurus||[]);
  renderReviews(d.reviews||[]);
  renderFaq(d.faqs||[]);
  if(d.marqueeText) $("#marqueeText").textContent=d.marqueeText;
 }catch(e){$("#guruList").innerHTML=`<div class="loading-card">${esc(e.message)}</div>`}
}
function renderGurus(gurus){
 const list=$("#guruList");
 if(!gurus.length){list.innerHTML='<div class="loading-card">अभी कोई गुरु उपलब्ध नहीं है।</div>';return}
 list.innerHTML=gurus.map(g=>`<a class="guru-card" href="/chat.html?guru=${encodeURIComponent(g.id)}">
   <div class="guru-avatar">${avatar(g)}<i></i><span class="online-dot"></span></div>
   <div class="guru-info"><small>${esc(g.specialty||"AI Guide")}</small><h3>${esc(g.name)}</h3><p>${esc(g.description||"निजी AI guidance.")}</p><span class="chat-cta">बात करें <b>→</b></span></div>
 </a>`).join("");
}
function renderReviews(reviews){
 const el=$("#reviewList"); if(!el)return;
 if(!reviews.length){el.innerHTML='<div class="loading-card">अभी reviews उपलब्ध नहीं हैं।</div>';return}
 el.innerHTML=reviews.slice(0,6).map(r=>`<article class="review-card"><div class="review-stars">${esc(r.rating||"★★★★★")}</div><p>“${esc(r.review||"बहुत अच्छा अनुभव रहा।")}”</p><strong>${esc(r.name||"Anonymous")}</strong></article>`).join("");
}
function renderFaq(faqs){
 const el=$("#faqList"); if(!el)return;
 el.innerHTML=(faqs||[]).slice(0,8).map(f=>`<details><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`).join("");
}
init();