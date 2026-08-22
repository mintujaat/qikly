const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
async function json(url,opt={}){const r=await fetch(url,{cache:"no-store",...opt,headers:{"Content-Type":"application/json",...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`Request failed (${r.status})`);return d}
function avatar(g){
  return g.imageUrl?`<img src="${esc(g.imageUrl)}" alt="${esc(g.name)}" loading="lazy">`:`<span>${esc(g.emoji||"🔮")}</span>`;
}
async function init(){
  try{
    const d=await json("/api/public/data");
    renderGurus(d.gurus||[]);
    if(d.marqueeText) $("#marqueeText").textContent=d.marqueeText;
  }catch(e){$("#guruList").innerHTML=`<div class="loading-card">${esc(e.message)}</div>`}
}
function renderGurus(gurus){
  const list=$("#guruList");
  if(!gurus.length){list.innerHTML='<div class="loading-card">No Gurus are available right now.</div>';return}
  list.innerHTML=gurus.map(g=>`<a class="guru-card" href="/chat.html?guru=${encodeURIComponent(g.id)}">
    <div class="guru-avatar">${avatar(g)}<i></i></div>
    <div class="guru-info"><small>${esc(g.specialty||"AI Guide")}</small><h3>${esc(g.name)}</h3><p>${esc(g.description||"Private AI guidance.")}</p><span class="chat-cta">Chat now <b>→</b></span></div>
  </a>`).join("");
}
init();