const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
async function api(url,opt={}){const r=await fetch(url,{cache:"no-store",...opt,headers:{"Content-Type":"application/json",...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`Request failed (${r.status})`);return d}
const params=new URLSearchParams(location.search);const guruId=params.get("guru")||"aarav";
let gurus=[],plans=[],guru=null,sessionId=null,timer=null,seconds=0,trial=false,razorpayKey="";
const trialKey="astrosage_trial_used_v1";
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2400)}
function avatar(g){return g?.imageUrl?`<img src="${esc(g.imageUrl)}" alt="">`:`<span>${esc(g?.emoji||"🔮")}</span>`}
async function init(){
 try{
  const [d,c]=await Promise.all([api("/api/public/data"),api("/api/public/config")]);
  gurus=d.gurus||[];plans=(d.plans||[]).filter(p=>p.active!==false&&Number(p.price)>0&&Number(p.durationMinutes||0)>0);razorpayKey=c.razorpayKeyId||"";
  guru=gurus.find(g=>g.id===guruId)||gurus[0];if(!guru)throw Error("No Guru is available.");
  $("#topGuru").innerHTML=`<div class="tiny-avatar">${avatar(guru)}</div><div><strong>${esc(guru.name)}</strong><small>${esc(guru.specialty)}</small></div>`;
  if(localStorage.getItem(trialKey)==="1") showPlans(); else showNameModal();
 }catch(e){toast(e.message)}
}
function showNameModal(){ $("#nameModal").classList.remove("hidden"); }
$("#startBtn").onclick=async()=>{const name=$("#customerName").value.trim()||"Guest";try{const d=await api("/api/ai/trial",{method:"POST",body:JSON.stringify({guruId:guru.id,customerName:name})});localStorage.setItem(trialKey,"1");startSession(d.sessionId,d.seconds,true,name);$("#nameModal").classList.add("hidden")}catch(e){toast(e.message)}};
function startSession(id,s,isTrial,name){sessionId=id;seconds=Number(s)||30;trial=isTrial;$("#plansBox").classList.add("hidden");$("#message").disabled=false;$("#sendBtn").disabled=false;addMsg("ai",`Namaste ${name||""} 🙏<br>Apna sawal poochiye. Main aapki baat dhyan se sununga.`);runTimer()}
function runTimer(){clearInterval(timer);renderTimer();timer=setInterval(()=>{seconds--;renderTimer();if(seconds<=0){clearInterval(timer);endSession()}},1000)}
function renderTimer(){$("#timer").textContent=`${String(Math.max(0,Math.floor(seconds/60))).padStart(2,"0")}:${String(Math.max(0,seconds%60)).padStart(2,"0")}`;$("#timer").classList.toggle("urgent",seconds<=10)}
function endSession(){sessionId=null;$("#message").disabled=true;$("#sendBtn").disabled=true;$("#timer").textContent="00:00";showPlans();addMsg("system","Session time khatam ho gaya. Continue karne ke liye ek time plan choose karein.");}
function showPlans(){$("#plansBox").classList.remove("hidden");$("#chatPlans").innerHTML=plans.map((p,i)=>`<button class="chat-plan ${i===1?"featured":""}" data-id="${esc(p.id)}"><span><b>${esc(p.name)}</b><small>${Number(p.durationMinutes)} minutes private chat</small></span><strong>₹${Number(p.price).toLocaleString("en-IN")}</strong></button>`).join("");document.querySelectorAll(".chat-plan").forEach(b=>b.onclick=()=>buy(b.dataset.id))}
function addMsg(type,text){const el=document.createElement("div");el.className=`bubble-row ${type}`;el.innerHTML=`<div class="bubble">${text}</div>`;$("#chatMessages").appendChild(el);$("#chatMessages").scrollTop=$("#chatMessages").scrollHeight}
$("#chatForm").onsubmit=async e=>{e.preventDefault();if(!sessionId||seconds<=0)return;const input=$("#message"),msg=input.value.trim();if(!msg)return;input.value="";addMsg("user",esc(msg));$("#sendBtn").disabled=true;try{const d=await api("/api/ai/chat",{method:"POST",body:JSON.stringify({sessionId,guruId:guru.id,message:msg})});addMsg("ai",esc(d.answer).replace(/\n/g,"<br>"));seconds=Number(d.remainingSeconds||seconds);renderTimer();if(seconds<=0)endSession()}catch(e){addMsg("system",esc(e.message))}finally{$("#sendBtn").disabled=false}};
async function buy(planId){const p=plans.find(x=>x.id===planId);if(!p)return;const name=prompt("Your name")||"Guest";try{const o=await api("/api/ai/create-order",{method:"POST",body:JSON.stringify({planId,guruId:guru.id,customerName:name})});const rzp=new Razorpay({key:razorpayKey,amount:o.amount,currency:o.currency||"INR",name:"AstroSage AI",description:`${p.name} — ${guru.name}`,order_id:o.orderId,prefill:{name},theme:{color:"#e4b84a"},handler:async response=>{try{const v=await api("/api/ai/verify-payment",{method:"POST",body:JSON.stringify(response)});$("#plansBox").classList.add("hidden");addMsg("system","Payment verified. Your private session is active.");startSession(v.sessionId,v.seconds,false,name)}catch(e){toast(e.message)}}});rzp.open()}catch(e){toast(e.message)}}
init();