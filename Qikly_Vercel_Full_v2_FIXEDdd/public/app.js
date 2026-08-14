import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, orderBy, limit, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBDFVnzLiS5XqOkKG7gA29rGfAiQwHd0v0",
  authDomain: "ziro-tournament.firebaseapp.com",
  databaseURL: "https://ziro-tournament-default-rtdb.firebaseio.com",
  projectId: "ziro-tournament",
  storageBucket: "ziro-tournament.firebasestorage.app",
  messagingSenderId: "43314349279",
  appId: "1:43314349279:web:32272ee27254d495d6d56a",
  measurementId: "G-ZBLS3DX71J"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const API_BASE = "";
const RAZORPAY_KEY_ID = "rzp_live_TIU7NHtPDfx3b1";

const $ = s => document.querySelector(s);
const toast = msg => { const t=$("#toast"); t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2800); };

$("#year").textContent = new Date().getFullYear();

if(localStorage.getItem("qikly_age_verified")==="1") $("#ageGate").classList.add("hidden");
$("#enterSite").onclick=()=>{localStorage.setItem("qikly_age_verified","1");$("#ageGate").classList.add("hidden")};
$("#leaveSite").onclick=()=>{location.href="https://www.google.com"};

let plans = [];
let selectedPlan = null;

async function loadPlans(){
  try{
    const q=query(collection(db,"plans"),where("active","==",true),orderBy("sortOrder","asc"));
    const snap=await getDocs(q);
    plans=snap.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){
    console.warn("Firestore plans unavailable; using demo plans.",e);
    plans=[
      {id:"1month",name:"1 Month",price:99,durationDays:30,description:"30 days access",featured:false,active:true,sortOrder:1},
      {id:"2months",name:"2 Months",price:149,durationDays:60,description:"60 days access",featured:true,active:true,sortOrder:2},
      {id:"permanent",name:"Permanent",price:299,durationDays:null,description:"Lifetime access",featured:false,active:true,sortOrder:3}
    ];
  }
  renderPlans();
}
function renderPlans(){
  $("#plansGrid").innerHTML=plans.map(p=>`
    <article class="plan ${p.featured?"featured":""}">
      ${p.featured?'<div class="tag">POPULAR</div>':''}
      <h3>${esc(p.name)}</h3>
      <div class="price">₹${Number(p.price).toLocaleString("en-IN")}</div>
      <div class="duration">${p.durationDays?`${p.durationDays} days`:"Permanent access"}</div>
      <ul>
        <li>Private Telegram access</li>
        <li>18+ premium community</li>
        <li>Secure Razorpay payment</li>
        <li>Instant verification</li>
      </ul>
      <button class="btn primary choose-plan" data-id="${esc(p.id)}">Choose Plan →</button>
    </article>`).join("");
  document.querySelectorAll(".choose-plan").forEach(b=>b.onclick=()=>selectPlan(b.dataset.id));
}
function selectPlan(id){
  selectedPlan=plans.find(p=>p.id===id);
  if(!selectedPlan) return;
  $("#selectedPlanId").value=selectedPlan.id;
  $("#summaryName").textContent=selectedPlan.name;
  $("#summaryPrice").textContent=`₹${Number(selectedPlan.price).toLocaleString("en-IN")}`;
  $("#summaryDuration").textContent=selectedPlan.durationDays?`${selectedPlan.durationDays} days`:"Permanent";
  $("#checkout").classList.remove("hidden");
  $("#checkout").scrollIntoView({behavior:"smooth",block:"center"});
}
$("#checkoutForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const telegramName=$("#telegramName").value.trim();
  if(!telegramName){showError("Enter your Telegram username.");return;}
  if(!selectedPlan){showError("Please select a plan.");return;}
  $("#payBtn").disabled=true; $("#payBtn").textContent="Creating secure order...";
  try{
    const r=await fetch(`${API_BASE}/api/create-order`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({planId:selectedPlan.id,telegramName})
    });
    const raw=await r.text();
    let data;
    try { data=JSON.parse(raw); } catch {
      throw new Error(`Payment server is not connected (${r.status}). Deploy the Qikly backend and set the API URL.`);
    }
    if(!r.ok) throw new Error(data.error||"Unable to create order.");
    const options={
      key: RAZORPAY_KEY_ID,
      amount:data.amount,
      currency:data.currency||"INR",
      name:"Qikly",
      description:`${selectedPlan.name} subscription`,
      order_id:data.orderId,
      prefill:{name:telegramName},
      theme:{color:"#8d62ff"},
      handler: async response=>{
        $("#payBtn").textContent="Verifying payment...";
        const vr=await fetch(`${API_BASE}/api/verify-payment`,{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            ...response,
            planId:selectedPlan.id,
            telegramName
          })
        });
        const vraw=await vr.text();
        let vd;
        try { vd=JSON.parse(vraw); } catch { throw new Error(`Payment verification server is unavailable (${vr.status}).`); }
        if(!vr.ok || !vd.success) throw new Error(vd.error||"Payment verification failed.");
        showSuccess(vd.subscription);
      },
      modal:{ondismiss:()=>{ $("#payBtn").disabled=false; $("#payBtn").textContent="Buy Now →"; }}
    };
    const rzp=new Razorpay(options);
    rzp.on("payment.failed",resp=>showError(resp.error?.description||"Payment failed."));
    rzp.open();
  }catch(err){showError(err.message);$("#payBtn").disabled=false;$("#payBtn").textContent="Buy Now →";}
});
function showError(m){$("#checkoutError").textContent=m;toast(m)}
function showSuccess(s){
  $("#checkout").classList.add("hidden");
  $("#success").classList.remove("hidden");
  const expiry=s.expiryDate?new Date(s.expiryDate).toLocaleDateString("en-IN"):"Permanent";
  $("#successDetails").innerHTML=`
    <div><span>Plan</span><strong>${esc(s.planName)}</strong></div>
    <div><span>Telegram username</span><strong>${esc(s.telegramUsername)}</strong></div><div><span>Telegram name</span><strong>${esc(s.telegramName)}</strong></div>
    <div><span>Expires</span><strong>${expiry}</strong></div>
    <div><span>Status</span><strong style="color:var(--good)">ACTIVE</strong></div>`;
  $("#telegramBtn").href=s.telegramLink;
  localStorage.setItem("qikly_subscription",JSON.stringify({subscriptionId:s.subscriptionId,expiryDate:s.expiryDate||null,plan:s.planName}));
  $("#success").scrollIntoView({behavior:"smooth"});
}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}

async function loadReviews(){
  const defaults=[
    ["Aman","★★★★★","Sample member review — replace this with a verified customer review."],
    ["R","★★★★★","Sample member review — replace this with a verified customer review."],
    ["Karan","★★★★☆","Sample member review — replace this with a verified customer review."]
  ];
  try{
    const snap=await getDocs(query(collection(db,"reviews"),where("active","==",true),orderBy("createdAt","desc"),limit(6)));
    const rows=snap.docs.map(d=>d.data());
    renderReviews(rows.length?rows:defaults.map(x=>({name:x[0],rating:x[1],review:x[2]})));
  }catch{renderReviews(defaults.map(x=>({name:x[0],rating:x[1],review:x[2]})));}
}
function renderReviews(rows){$("#reviewsGrid").innerHTML=rows.map(r=>`<article class="review"><div class="review-top"><span class="review-name">${esc(r.name)}</span><span class="stars">${esc(r.rating||"★★★★★")}</span></div><p>${esc(r.review)}</p></article>`).join("")}

async function loadFaq(){
  const defaults=[
    ["What is Qikly?","Qikly provides time-based access to a private Telegram community for adults 18+. Select a plan and complete checkout."],
    ["How do I get Telegram access?","Enter your Telegram username and numeric User ID, pay through Razorpay, and access is shown after server-side payment verification."],
    ["How long does access last?","Your access lasts for the duration of the plan you purchased. Permanent plans do not have an expiry date."],
    ["What happens when my plan expires?","The subscription becomes inactive and you can purchase a new plan to regain access."],
    ["Is my payment secure?","Payments are handled through Razorpay. Qikly does not store your card or UPI credentials."],
    ["Can I get a refund?","See the Refund Policy page for the current policy before purchasing."]
  ];
  let rows=defaults;
  try{
    const snap=await getDocs(query(collection(db,"faq"),where("active","==",true),orderBy("sortOrder","asc")));
    if(!snap.empty) rows=snap.docs.map(d=>[d.data().question,d.data().answer]);
  }catch{}
  $("#faqList").innerHTML=rows.map(r=>`<div class="faq"><button>${esc(r[0])}<span>+</span></button><div class="faq-answer">${esc(r[1])}</div></div>`).join("");
  document.querySelectorAll(".faq button").forEach(b=>b.onclick=()=>b.parentElement.classList.toggle("open"));
}
loadPlans(); loadReviews(); loadFaq();