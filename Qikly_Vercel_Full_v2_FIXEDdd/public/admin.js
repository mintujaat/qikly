const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#039;"}[c]));
const money = n => `₹${Number(n || 0).toLocaleString("en-IN")}`;
let DATA = {};
async function api(url, options = {}) { const r = await fetch(url, { cache: "no-store", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`); return d; }
function setMsg(id, text) { const el = $(id); if (el) el.textContent = text; }
function switchSection(id) { document.querySelectorAll(".admin-content section").forEach(s => s.classList.toggle("active", s.id === id)); document.querySelectorAll(".side-btn[data-section]").forEach(b => b.classList.toggle("active", b.dataset.section === id)); const labels = { dashboard: "Dashboard", banners: "Banners / Ads", content: "Website Content", faqAdmin: "FAQ", donations: "Donations", chatbotAdmin: "AI Chatbot", themeAdmin: "Theme" }; $("#pageTitle").textContent = labels[id] || id; }
document.querySelectorAll(".side-btn[data-section]").forEach(b => b.onclick = () => switchSection(b.dataset.section));

function fillForms() {
  const s = DATA.settings, t = s.theme;
  const ids = { ngoNameInput:s.ngoName, supportEmailInput:s.supportEmail, taglineInput:s.tagline, heroTitleInput:s.heroTitle, heroTextInput:s.heroText, marqueeInput:s.marqueeText, aboutInput:s.about, termsInput:s.terms, privacyInput:s.privacy, refundInput:s.refund };
  Object.entries(ids).forEach(([id, val]) => { if ($(id)) $(id).value = val || ""; });
  const c = DATA.chatbot || {}; ["botName","botIntro","botTopic","botPrompt"].forEach((id, i) => $(id).value = [c.name,c.intro,c.topic,c.prompt][i] || "");
  ["themePrimary","themeSecondary","themeBackground","themeSurface","themeText","themeMuted","themeAccent"].forEach(id => $(id).value = t[{themePrimary:"primary",themeSecondary:"secondary",themeBackground:"background",themeSurface:"surface",themeText:"text",themeMuted:"muted",themeAccent:"accent"}[id]] || "#000000");
}
function renderBanners() { $("#bannerTable").innerHTML = DATA.banners.length ? `<div class="table-wrap"><table><thead><tr><th>Preview</th><th>Title</th><th>Order</th><th>Active</th><th>Actions</th></tr></thead><tbody>${DATA.banners.map(x => `<tr><td><img class="thumb" src="${esc(x.imageUrl)}" alt=""></td><td>${esc(x.title || "—")}</td><td>${Number(x.sortOrder || 0)}</td><td>${x.active !== false ? "Yes" : "No"}</td><td><div class="actions"><button class="btn small edit-banner" data-id="${esc(x.id)}">Edit</button><button class="btn small danger del-banner" data-id="${esc(x.id)}">Delete</button></div></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">No banners yet.</div>`; }
function renderFaqs() { $("#faqTable").innerHTML = DATA.faqs.length ? `<div class="table-wrap"><table><thead><tr><th>Question</th><th>Order</th><th>Active</th><th>Actions</th></tr></thead><tbody>${DATA.faqs.map(x => `<tr><td>${esc(x.question)}</td><td>${Number(x.sortOrder || 0)}</td><td>${x.active !== false ? "Yes" : "No"}</td><td><div class="actions"><button class="btn small edit-faq" data-id="${esc(x.id)}">Edit</button><button class="btn small danger del-faq" data-id="${esc(x.id)}">Delete</button></div></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">No FAQs yet.</div>`; }
function renderDonations() { $("#donationsTable").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Rank</th><th>Name</th><th>Amount</th><th>Status</th><th>Type</th><th>Payment</th><th>Date</th></tr></thead><tbody>${DATA.donations.map((x, i) => `<tr><td>#${i+1}</td><td>${esc(x.name || "—")}</td><td>${money(x.amount)}</td><td><span class="status ${x.status}">${esc(x.status)}</span></td><td>${x.seed ? "Sample" : (x.source === "manual" ? "Manual / Cash" : "Razorpay")}</td><td>${esc(x.paymentId || "—")}</td><td>${formatDate(x.verifiedAt || x.createdAt)}</td></tr>`).join("")}</tbody></table></div>`; }
function renderRecent() { const paid = DATA.donations.filter(x => x.status === "paid").slice(0, 8); $("#recentDonations").innerHTML = paid.length ? `<div class="mini-list">${paid.map(x => `<div><span>${esc(x.name)} <small>${x.seed ? "sample" : "paid"}</small></span><strong>${money(x.amount)}</strong></div>`).join("")}</div>` : `<div class="empty">No donations yet.</div>`; }
function formatDate(v) { try { const d = v?.seconds ? new Date(Number(v.seconds) * 1000) : new Date(v); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", { dateStyle:"medium", timeStyle:"short" }); } catch { return "—"; } }
async function load() { DATA = await api("/api/admin/data"); $("#adminNgoName").textContent = DATA.settings.ngoName; $("#statRaised").textContent = money(DATA.stats.totalRaised); $("#statDonors").textContent = DATA.stats.donorCount; $("#statToday").textContent = money(DATA.stats.todayAmount); $("#statMonth").textContent = money(DATA.stats.monthAmount); fillForms(); renderBanners(); renderFaqs(); renderDonations(); renderRecent(); }

function resetBanner() { $("#bannerId").value=""; $("#bannerTitle").value=""; $("#bannerSort").value="1"; $("#bannerImage").value=""; $("#bannerLink").value=""; $("#bannerActive").checked=true; }
$("#saveBanner").onclick = async () => { try { await api("/api/admin/banner", { method:"POST", body:JSON.stringify({ id:$("#bannerId").value, title:$("#bannerTitle").value, sortOrder:Number($("#bannerSort").value)||1, imageUrl:$("#bannerImage").value, linkUrl:$("#bannerLink").value, active:$("#bannerActive").checked }) }); resetBanner(); await load(); } catch(e) { alert(e.message); } };
$("#resetBanner").onclick = resetBanner;
$("#bannerTable").onclick = async (e) => { const edit=e.target.closest(".edit-banner"), del=e.target.closest(".del-banner"); if(edit){const x=DATA.banners.find(b=>b.id===edit.dataset.id); $("#bannerId").value=x.id; $("#bannerTitle").value=x.title||""; $("#bannerSort").value=x.sortOrder||1; $("#bannerImage").value=x.imageUrl||""; $("#bannerLink").value=x.linkUrl||""; $("#bannerActive").checked=x.active!==false; switchSection("banners"); scrollTo(0,0);} if(del && confirm("Delete this banner?")){await api("/api/admin/delete",{method:"POST",body:JSON.stringify({collection:"banners",id:del.dataset.id})});await load();} };

$("#saveContent").onclick = async () => { try { const body={ngoName:$("#ngoNameInput").value,supportEmail:$("#supportEmailInput").value,tagline:$("#taglineInput").value,heroTitle:$("#heroTitleInput").value,heroText:$("#heroTextInput").value,marqueeText:$("#marqueeInput").value,about:$("#aboutInput").value,terms:$("#termsInput").value,privacy:$("#privacyInput").value,refund:$("#refundInput").value,theme:DATA.settings.theme}; await api("/api/admin/settings",{method:"POST",body:JSON.stringify(body)}); setMsg("#contentMsg","Saved successfully."); await load(); } catch(e) { setMsg("#contentMsg",e.message); } };

function resetFaq(){ $("#faqId").value=""; $("#faqQuestion").value=""; $("#faqAnswer").value=""; $("#faqSort").value="1"; $("#faqActive").checked=true; }
$("#saveFaq").onclick = async () => { try { await api("/api/admin/faq",{method:"POST",body:JSON.stringify({id:$("#faqId").value,question:$("#faqQuestion").value,answer:$("#faqAnswer").value,sortOrder:Number($("#faqSort").value)||1,active:$("#faqActive").checked})}); resetFaq(); await load(); } catch(e){ alert(e.message); } };
$("#resetFaq").onclick=resetFaq;
$("#faqTable").onclick=async(e)=>{const edit=e.target.closest(".edit-faq"),del=e.target.closest(".del-faq"); if(edit){const x=DATA.faqs.find(f=>f.id===edit.dataset.id);$("#faqId").value=x.id;$("#faqQuestion").value=x.question;$("#faqAnswer").value=x.answer;$("#faqSort").value=x.sortOrder||1;$("#faqActive").checked=x.active!==false;switchSection("faqAdmin");scrollTo(0,0);} if(del&&confirm("Delete this FAQ?")){await api("/api/admin/delete",{method:"POST",body:JSON.stringify({collection:"faq",id:del.dataset.id})});await load();}};

$("#seedSupporters").onclick = async () => { if(!confirm("Replace existing sample supporters with 450 generated sample rows? Real paid donations will stay safe.")) return; const b=$("#seedSupporters"); b.disabled=true; setMsg("#seedMsg","Generating 450 sample supporters…"); try { const d=await api("/api/admin/seed-supporters",{method:"POST",body:"{}"}); setMsg("#seedMsg",`Done — ${d.count} sample supporters added.`); await load(); } catch(e){setMsg("#seedMsg",e.message)} finally{b.disabled=false;} };

$("#addManualDonor").onclick = async () => {
  const name = $("#manualDonorName").value.trim();
  const amount = Number($("#manualDonorAmount").value);
  const b = $("#addManualDonor");
  b.disabled = true;
  setMsg("#manualDonorMsg", "Adding donor…");
  try {
    const d = await api("/api/admin/donations/manual", { method:"POST", body:JSON.stringify({ name, amount }) });
    $("#manualDonorName").value = ""; $("#manualDonorAmount").value = "";
    setMsg("#manualDonorMsg", `Added ${d.name} — ${money(d.amount)}.`);
    await load();
  } catch(e) { setMsg("#manualDonorMsg", e.message); } finally { b.disabled=false; }
};

$("#deleteAllDonors").onclick = async () => {
  if (!confirm("Delete ALL donor records, including real, manual and sample donors? This cannot be undone.")) return;
  const b = $("#deleteAllDonors");
  b.disabled = true;
  try {
    const d = await api("/api/admin/donations/delete-all", { method:"POST", body:"{}" });
    setMsg("#manualDonorMsg", `Deleted ${d.count} donor records.`);
    await load();
  } catch(e) { alert(e.message); } finally { b.disabled=false; }
};

$("#saveChatbot").onclick = async()=>{try{await api("/api/admin/chatbot",{method:"POST",body:JSON.stringify({name:$("#botName").value,intro:$("#botIntro").value,topic:$("#botTopic").value,prompt:$("#botPrompt").value})});setMsg("#botMsg","Chatbot settings saved.");await load();}catch(e){setMsg("#botMsg",e.message)}};
$("#saveTheme").onclick = async()=>{try{const theme={primary:$("#themePrimary").value,secondary:$("#themeSecondary").value,background:$("#themeBackground").value,surface:$("#themeSurface").value,text:$("#themeText").value,muted:$("#themeMuted").value,accent:$("#themeAccent").value}; const s=DATA.settings; await api("/api/admin/settings",{method:"POST",body:JSON.stringify({...s,theme})});setMsg("#themeMsg","Theme saved.");await load();}catch(e){setMsg("#themeMsg",e.message)}};

$("#loginForm").onsubmit=async(e)=>{e.preventDefault();$("#loginError").textContent="";try{await api("/api/admin/login",{method:"POST",body:JSON.stringify({password:$("#password").value})});$("#loginView").classList.add("hidden");$("#adminView").classList.remove("hidden");await load();}catch(e){$("#loginError").textContent=e.message}};
$("#logout").onclick=async()=>{await api("/api/admin/logout",{method:"POST",body:"{}"});location.reload();};
(async()=>{try{const me=await api("/api/admin/me");if(me.authenticated){$("#loginView").classList.add("hidden");$("#adminView").classList.remove("hidden");await load();}}catch(e){}})();
