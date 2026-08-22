const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
async function api(url,opt={}){const r=await fetch(url,{cache:"no-store",...opt,headers:{"Content-Type":"application/json",...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`Request failed (${r.status})`);return d}
const params=new URLSearchParams(location.search);const guruId=params.get("guru")||"aarav";
let gurus=[],plans=[],guru=null,sessionId=null,timer=null,seconds=0,razorpayKey="",customerName="Guest";
const trialKey="astrosage_trial_used_v2";
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2400)}
function avatar(g){return g?.imageUrl?`<img src="${esc(g.imageUrl)}" alt="">`:`<span>${esc(g?.emoji||"🔮")}</span>`}
async function init(){
 try{
  const [d,c]=await Promise.all([api("/api/public/data"),api("/api/public/config")]);
  gurus=d.gurus||[];plans=(d.plans||[]).filter(p=>p.active!==false&&Number(p.price)>0&&Number(p.durationMinutes||0)>0);razorpayKey=c.razorpayKeyId||"";
  guru=gurus.find(g=>g.id===guruId)||gurus[0];if(!guru)throw Error("कोई गुरु उपलब्ध नहीं है।");
  $("#topGuru").innerHTML=`<div class="tiny-avatar">${avatar(guru)}</div><div><strong>${esc(guru.name)}</strong><small>${esc(guru.specialty||"AI मार्गदर्शक")}</small></div>`;
  customerName=localStorage.getItem("astrosage_name")||"Guest";
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
function startSession(id,s,name){hideTyping();sessionId=id;seconds=Number(s)||30;$("#plansBox").classList.add("hidden");$("#message").disabled=false;$("#sendBtn").disabled=false;addMsg("ai",`नमस्ते ${esc(name==="Guest"?"":name)} 🙏<br>अपनी बात आराम से बताइए। मैं ध्यान से सुन रहा हूँ।`);runTimer()}
function runTimer(){clearInterval(timer);renderTimer();timer=setInterval(()=>{seconds--;renderTimer();if(seconds<=0){clearInterval(timer);endSession()}},1000)}
function renderTimer(){$("#timer").textContent=`${String(Math.max(0,Math.floor(seconds/60))).padStart(2,"0")}:${String(Math.max(0,seconds%60)).padStart(2,"0")}`;$("#timer").classList.toggle("urgent",seconds<=10)}
function endSession(){hideTyping();sessionId=null;$("#message").disabled=true;$("#sendBtn").disabled=true;$("#timer").textContent="00:00";setTimeout(showPlans,350);addMsg("system","समय पूरा हो गया। अगर आप बातचीत जारी रखना चाहते हैं, एक session चुनें।")}
function showPlans(){
  $("#plansBox").classList.remove("hidden");
  $("#chatPlans").innerHTML=plans.length
    ? plans.map((p,i)=>`<button class="chat-plan ${i===1?"featured":""}" data-id="${esc(p.id)}"><span><b>${esc(p.name)}</b><small>${Number(p.durationMinutes)} मिनट चैट</small></span><strong>₹${Number(p.price).toLocaleString("en-IN")}</strong></button>`).join("")
    : `<p class="muted">अभी कोई session plan उपलब्ध नहीं है।</p>`;
  document.querySelectorAll(".chat-plan").forEach(b=>b.onclick=()=>buy(b.dataset.id));
  setTimeout(()=>$("#plansBox").scrollIntoView({behavior:"smooth",block:"nearest"}),60);
}

function addMsg(type,text){const el=document.createElement("div");el.className=`bubble-row ${type}`;el.innerHTML=`<div class="bubble">${text}</div>`;$("#chatMessages").appendChild(el);$("#chatMessages").scrollTop=$("#chatMessages").scrollHeight}
function showTyping(){
 const old=$("#typingBubble"); if(old)old.remove();
 const el=document.createElement("div");el.id="typingBubble";el.className="bubble-row ai typing-row";
 el.innerHTML='<div class="bubble typing-bubble"><span></span><span></span><span></span><em>गुरु लिख रहे हैं…</em></div>';
 $("#chatMessages").appendChild(el);$("#chatMessages").scrollTop=$("#chatMessages").scrollHeight;
}
function hideTyping(){const el=$("#typingBubble");if(el)el.remove()}
$("#chatForm").onsubmit=async e=>{
 e.preventDefault();if(!sessionId||seconds<=0)return;
 const input=$("#message"),msg=input.value.trim();if(!msg)return;input.value="";addMsg("user",esc(msg));$("#sendBtn").disabled=true;$("#message").disabled=true;showTyping();
 try{
   const d=await api("/api/ai/chat",{method:"POST",body:JSON.stringify({sessionId,guruId:guru.id,message:msg})});
   const answer=String(d.answer||"").trim();
   const delay=Math.min(2200,700+Math.max(0,answer.length)*10);
   await new Promise(r=>setTimeout(r,delay));
   hideTyping();addMsg("ai",esc(answer).replace(/\n/g,"<br>"));seconds=Number(d.remainingSeconds||seconds);renderTimer();if(seconds<=0)endSession();
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