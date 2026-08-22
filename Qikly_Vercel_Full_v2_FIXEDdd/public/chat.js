const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
async function api(url,opt={}){const r=await fetch(url,{cache:"no-store",...opt,headers:{"Content-Type":"application/json",...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`Request failed (${r.status})`);return d}
const params=new URLSearchParams(location.search);const guruId=params.get("guru")||"aarav";
let gurus=[],plans=[],guru=null,sessionId=null,timer=null,seconds=0,expiresAt=0,razorpayKey="",customerName="Guest";
const trialKey="astrosage_trial_used_v2";
const activeSessionKey="astrosage_active_session_v3";
const chatHistoryKey="astrosage_chat_history_v3_";
let restoring=false;
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2400)}
function avatar(g){return g?.imageUrl?`<img src="${esc(g.imageUrl)}" alt="">`:`<span>${esc(g?.emoji||"🔮")}</span>`}
async function init(){
 try{
  const [d,c]=await Promise.all([api("/api/public/data"),api("/api/public/config")]);
  gurus=d.gurus||[];plans=(d.plans||[]).filter(p=>p.active!==false&&Number(p.price)>0&&Number(p.durationMinutes||0)>0);razorpayKey=c.razorpayKeyId||"";
  guru=gurus.find(g=>g.id===guruId)||gurus[0];if(!guru)throw Error("कोई गुरु उपलब्ध नहीं है।");
  $("#topGuru").innerHTML=`<div class="tiny-avatar">${avatar(guru)}</div><div><strong>${esc(guru.name)}</strong><small>${esc(guru.specialty||"AI मार्गदर्शक")}</small></div>`;
  customerName=localStorage.getItem("astrosage_name")||"Guest";
  setComposer(false);
  restoreChatHistory();
  const restored=restoreActiveSession();
  if(restored) return;
  const used=localStorage.getItem(trialKey)==="1";
  if(used){ addMsg("system","आपका complimentary session पहले इस्तेमाल हो चुका है। आगे बढ़ने के लिए नीचे से समय चुनें।"); setTimeout(showPlans,500); }
  else { await startComplimentary(); }
 }catch(e){toast(e.message)}
}
async function startComplimentary(){
 try{
  const d=await api("/api/ai/trial",{method:"POST",body:JSON.stringify({guruId:guru.id,customerName})});
  localStorage.setItem(trialKey,"1");startSession(d.sessionId,d.seconds,customerName);
 }catch(e){toast(e.message)}
}
function setComposer(show){const f=$("#chatForm");if(f)f.classList.toggle("composer-hidden",!show)}
function saveActiveSession(){
  if(!sessionId||!expiresAt)return;
  localStorage.setItem(activeSessionKey,JSON.stringify({sessionId,guruId:guru?.id||guruId,customerName,expiresAt}));
}
function clearActiveSession(){localStorage.removeItem(activeSessionKey);sessionId=null;expiresAt=0}
function restoreActiveSession(){
  try{
    const raw=localStorage.getItem(activeSessionKey); if(!raw)return false;
    const saved=JSON.parse(raw);
    if(saved.guruId!==guru?.id || !saved.sessionId || !Number(saved.expiresAt)) { localStorage.removeItem(activeSessionKey); return false; }
    const remaining=Math.max(0,Math.ceil((Number(saved.expiresAt)-Date.now())/1000));
    if(remaining<=0){ localStorage.removeItem(activeSessionKey); return false; }
    sessionId=saved.sessionId;customerName=saved.customerName||customerName;expiresAt=Number(saved.expiresAt);seconds=remaining;
    $("#plansBox").classList.add("hidden");setComposer(true);$("#message").disabled=false;$("#sendBtn").disabled=false;renderTimer();runTimer();
    return true;
  }catch(e){localStorage.removeItem(activeSessionKey);return false}
}
function startSession(id,s,name){
  hideTyping();sessionId=id;seconds=Math.max(1,Number(s)||30);expiresAt=Date.now()+seconds*1000;customerName=name||customerName;
  saveActiveSession();$("#plansBox").classList.add("hidden");setComposer(true);$("#message").disabled=false;$("#sendBtn").disabled=false;
  if(!restoring && !hasHistoryForCurrentSession()) addMsg("ai",`नमस्ते ${esc(name==="Guest"?"":name)} 🙏<br>अपनी बात आराम से बताइए। मैं ध्यान से सुन रहा हूँ।`);
  runTimer();
}
function runTimer(){
  clearInterval(timer);
  const tick=()=>{seconds=Math.max(0,Math.ceil((expiresAt-Date.now())/1000));renderTimer();if(seconds<=0){clearInterval(timer);endSession()}};
  tick();timer=setInterval(tick,1000);
}
function hasHistoryForCurrentSession(){
  try{return JSON.parse(localStorage.getItem(chatHistoryKey+guru.id)||"[]").some(m=>m.sessionId===sessionId)}catch{return false}
}
function restoreChatHistory(){
  try{
    const items=JSON.parse(localStorage.getItem(chatHistoryKey+guru.id)||"[]");
    items.slice(-80).forEach(m=>renderStoredMsg(m));
  }catch{}
}
function renderStoredMsg(m){
  const el=document.createElement("div");el.className=`bubble-row ${m.type}`;el.innerHTML=`<div class="bubble">${m.html||esc(m.text||"")}</div>`;
  if(m.type==="user"&&m.status){const meta=document.createElement("div");meta.className="message-status";meta.textContent=m.status;el.appendChild(meta)}
  $("#chatMessages").appendChild(el);$("#chatMessages").scrollTop=$("#chatMessages").scrollHeight;
}
function persistMsg(type,text,html,status){
  if(restoring||!guru)return;
  try{
    const key=chatHistoryKey+guru.id;const items=JSON.parse(localStorage.getItem(key)||"[]");
    items.push({sessionId,type,text,html,status:status||"",at:Date.now()});
    localStorage.setItem(key,JSON.stringify(items.slice(-80)));
  }catch{}
}
function renderTimer(){$("#timer").textContent=`${String(Math.max(0,Math.floor(seconds/60))).padStart(2,"0")}:${String(Math.max(0,seconds%60)).padStart(2,"0")}`;$("#timer").classList.toggle("urgent",seconds<=10)}
function endSession(){hideTyping();clearInterval(timer);clearActiveSession();$("#message").disabled=true;$("#sendBtn").disabled=true;setComposer(false);$("#timer").textContent="00:00";setTimeout(showPlans,350);addMsg("system","समय पूरा हो गया। अगर आप बातचीत जारी रखना चाहते हैं, एक session चुनें।")}
function showPlans(){
  $("#plansBox").classList.remove("hidden");
  $("#chatPlans").innerHTML=plans.length
    ? plans.map((p,i)=>`<button class="chat-plan ${i===1?"featured":""}" data-id="${esc(p.id)}"><span><b>${esc(p.name)}</b><small>${Number(p.durationMinutes)} मिनट चैट</small></span><strong>₹${Number(p.price).toLocaleString("en-IN")}</strong></button>`).join("")
    : `<p class="muted">अभी कोई session plan उपलब्ध नहीं है।</p>`;
  document.querySelectorAll(".chat-plan").forEach(b=>b.onclick=()=>buy(b.dataset.id));
  setTimeout(()=>$("#plansBox").scrollIntoView({behavior:"smooth",block:"nearest"}),60);
}

function addMsg(type,text){const el=document.createElement("div");el.className=`bubble-row ${type}`;el.innerHTML=`<div class="bubble">${text}</div>`;$("#chatMessages").appendChild(el);$("#chatMessages").scrollTop=$("#chatMessages").scrollHeight;persistMsg(type,text.replace(/<br\s*\/?>(?=.)/gi,"\n"),text);return el}
function addUserMsg(text){
 const el=addMsg("user",esc(text));
 const meta=document.createElement("div");meta.className="message-status";meta.textContent="sent";el.appendChild(meta);
 persistMsg("user",text,esc(text),"sent");
 return meta;
}
function markRead(meta){
 if(meta)meta.textContent="read";
 try{const key=chatHistoryKey+guru.id;const items=JSON.parse(localStorage.getItem(key)||"[]");const last=[...items].reverse().find(m=>m.type==="user"&&m.sessionId===sessionId);if(last){last.status="read";localStorage.setItem(key,JSON.stringify(items));}}catch{}
}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function responseDelay(text){
 const len=String(text||"").length;
 return Math.min(15000,7000+Math.min(8000,Math.max(0,len-80)*18));
}
function showTyping(){
 const old=$("#typingBubble"); if(old)old.remove();
 const el=document.createElement("div");el.id="typingBubble";el.className="bubble-row ai typing-row";
 el.innerHTML='<div class="bubble typing-bubble"><span></span><span></span><span></span><em>गुरु लिख रहे हैं…</em></div>';
 $("#chatMessages").appendChild(el);$("#chatMessages").scrollTop=$("#chatMessages").scrollHeight;
}
function hideTyping(){const el=$("#typingBubble");if(el)el.remove()}
$("#chatForm").onsubmit=async e=>{
 e.preventDefault();if(!sessionId||seconds<=0)return;
 const input=$("#message"),msg=input.value.trim();if(!msg)return;input.value="";const status=addUserMsg(msg);$("#sendBtn").disabled=true;$("#message").disabled=true;
 try{
   const request=api("/api/ai/chat",{method:"POST",body:JSON.stringify({sessionId,guruId:guru.id,message:msg})});
   await wait(3000);
   markRead(status);
   showTyping();
   const d=await request;
   const answer=String(d.answer||"").trim();
   await wait(responseDelay(answer));
   hideTyping();
   if(!sessionId||seconds<=0)return;
   addMsg("ai",esc(answer).replace(/\n/g,"<br>"));seconds=Number(d.remainingSeconds||seconds);renderTimer();if(seconds<=0)endSession();
 }catch(e){hideTyping();addMsg("system",esc(e.message))}finally{$("#sendBtn").disabled=!sessionId||seconds<=0;$("#message").disabled=!sessionId||seconds<=0}
};
async function buy(planId){
 const p=plans.find(x=>x.id===planId);if(!p)return;
 try{
  const o=await api("/api/ai/create-order",{method:"POST",body:JSON.stringify({planId,guruId:guru.id,customerName})});
  const rzp=new Razorpay({key:razorpayKey,amount:o.amount,currency:o.currency||"INR",name:"AstroSage AI",description:`${p.name} — ${guru.name}`,order_id:o.orderId,prefill:{name:customerName},theme:{color:"#d58a17"},handler:async response=>{
   try{const v=await api("/api/ai/verify-payment",{method:"POST",body:JSON.stringify(response)});
   $("#plansBox").classList.add("hidden");
   $("#chatPlans").innerHTML="";
   addMsg("system","Payment verified. आपका session शुरू हो रहा है 🙏");
   startSession(v.sessionId,v.seconds,customerName)}
   catch(e){toast(e.message)}
  },modal:{ondismiss:()=>{}}});rzp.open();
 }catch(e){toast(e.message)}
}
init();