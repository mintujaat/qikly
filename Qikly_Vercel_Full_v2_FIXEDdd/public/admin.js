const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;", "'":"&#039;"}[c]));
const money = n => `₹${Number(n || 0).toLocaleString("en-IN")}`;
let DATA = {};

async function api(url, options = {}) {
  const r = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
  return d;
}

function setMsg(id, text) { const el = $(id); if (el) el.textContent = text; }
function truncate(v, max = 220) { const s = String(v ?? "").trim(); return s.length > max ? `${s.slice(0, max)}…` : s; }
function previewText(v) { return esc(v || "Not set").replace(/\n/g, "<br>"); }
function formatDate(v) {
  try {
    const d = v?.seconds ? new Date(Number(v.seconds) * 1000) : new Date(v);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch { return "—"; }
}

function switchSection(id) {
  document.querySelectorAll(".admin-content section").forEach(s => s.classList.toggle("active", s.id === id));
  document.querySelectorAll(".side-btn[data-section]").forEach(b => b.classList.toggle("active", b.dataset.section === id));
  const labels = { dashboard: "Dashboard", banners: "Banners / Ads", content: "Website Content", faqAdmin: "FAQ", donations: "Donations", chatbotAdmin: "AI Chatbot", themeAdmin: "Theme" };
  $("#pageTitle").textContent = labels[id] || id;
}
document.querySelectorAll(".side-btn[data-section]").forEach(b => b.onclick = () => switchSection(b.dataset.section));

function fillForms() {
  const s = DATA.settings || {};
  const t = s.theme || {};
  const ids = {
    ngoNameInput: s.ngoName,
    supportEmailInput: s.supportEmail,
    taglineInput: s.tagline,
    heroTitleInput: s.heroTitle,
    heroTextInput: s.heroText,
    marqueeInput: s.marqueeText,
    aboutInput: s.about,
    termsInput: s.terms,
    privacyInput: s.privacy,
    refundInput: s.refund,
  };
  Object.entries(ids).forEach(([id, val]) => { if ($(id)) $(id).value = val || ""; });

  const c = DATA.chatbot || {};
  ["botName", "botIntro", "botTopic", "botPrompt"].forEach((id, i) => $(id).value = [c.name, c.intro, c.topic, c.prompt][i] || "");

  const colorMap = { themePrimary:"primary", themeSecondary:"secondary", themeBackground:"background", themeSurface:"surface", themeText:"text", themeMuted:"muted", themeAccent:"accent" };
  Object.entries(colorMap).forEach(([id, key]) => { if ($(id)) $(id).value = t[key] || "#000000"; });
  renderBannerImagePreview(s.bannerImageDraft || "");
}

function renderBannerImagePreview(url = $("#bannerImage")?.value || "") {
  const box = $("#bannerImagePreview");
  if (!box) return;
  const safe = String(url || "").trim();
  if (!safe) {
    box.className = "span-2 image-preview empty";
    box.innerHTML = "Image preview will appear here.";
    return;
  }
  box.className = "span-2 image-preview";
  box.innerHTML = `<img src="${esc(safe)}" alt="Banner preview" onerror="this.parentElement.classList.add('image-error');this.insertAdjacentHTML('beforeend','<small>Image could not be loaded.</small>')">`;
}

function renderBanners() {
  const el = $("#bannerTable");
  if (!DATA.banners?.length) {
    el.innerHTML = `<div class="empty">No banners yet. Add your first banner above.</div>`;
    return;
  }
  el.innerHTML = `<div class="saved-grid banner-saved-grid">${DATA.banners.map(x => `
    <article class="saved-card banner-saved-card">
      <div class="saved-media"><img src="${esc(x.imageUrl)}" alt="${esc(x.title || "Donation banner")}" loading="lazy"></div>
      <div class="saved-card-body">
        <div class="saved-card-head"><div><strong>${esc(x.title || "Untitled banner")}</strong><span class="saved-meta">Order ${Number(x.sortOrder || 0)} · ${x.active !== false ? "Active" : "Hidden"}</span></div><span class="status ${x.active !== false ? "paid" : "created"}">${x.active !== false ? "LIVE" : "OFF"}</span></div>
        <p class="saved-copy">${esc(truncate(x.linkUrl || x.imageUrl, 150))}</p>
        <div class="actions"><button class="btn small edit-banner" data-id="${esc(x.id)}">Edit</button><button class="btn small danger del-banner" data-id="${esc(x.id)}">Delete</button></div>
      </div>
    </article>`).join("")}</div>`;
}

function renderFaqs() {
  const el = $("#faqTable");
  if (!DATA.faqs?.length) {
    el.innerHTML = `<div class="empty">No FAQs yet. Add your first FAQ above.</div>`;
    return;
  }
  el.innerHTML = `<div class="saved-grid">${DATA.faqs.map(x => `
    <article class="saved-card">
      <div class="saved-card-body">
        <div class="saved-card-head"><strong>${esc(x.question || "Untitled question")}</strong><span class="status ${x.active !== false ? "paid" : "created"}">${x.active !== false ? "LIVE" : "OFF"}</span></div>
        <p class="saved-copy">${previewText(truncate(x.answer || "No answer", 420))}</p>
        <span class="saved-meta">Order ${Number(x.sortOrder || 0)}</span>
        <div class="actions"><button class="btn small edit-faq" data-id="${esc(x.id)}">Edit</button><button class="btn small danger del-faq" data-id="${esc(x.id)}">Delete</button></div>
      </div>
    </article>`).join("")}</div>`;
}

function renderContentPreview() {
  const s = DATA.settings || {};
  const items = [
    ["ngoName", "NGO name", s.ngoName],
    ["supportEmail", "Support email", s.supportEmail],
    ["tagline", "Tagline", s.tagline],
    ["heroTitle", "Hero title", s.heroTitle],
    ["heroText", "Hero paragraph", s.heroText],
    ["marqueeText", "Marquee line", s.marqueeText],
    ["about", "About us", s.about],
    ["terms", "Terms & Conditions", s.terms],
    ["privacy", "Privacy Policy", s.privacy],
    ["refund", "Refund Policy", s.refund],
  ];
  $("#contentPreview").innerHTML = `<div class="saved-grid">${items.map(([field, title, value]) => `
    <article class="saved-card">
      <div class="saved-card-body">
        <div class="saved-card-head"><div><strong>${esc(title)}</strong><span class="saved-meta">Saved in website settings</span></div><span class="preview-dot"></span></div>
        <div class="saved-copy">${previewText(truncate(value || "Not set", 500))}</div>
        <div class="actions"><button class="btn small edit-content" data-field="${field}">Edit</button><button class="btn small danger reset-content" data-field="${field}">Reset</button></div>
      </div>
    </article>`).join("")}</div>`;
}

function renderChatbotPreview() {
  const c = DATA.chatbot || {};
  $("#chatbotPreview").innerHTML = `<article class="saved-card chatbot-saved-card">
    <div class="saved-card-body">
      <div class="saved-card-head"><div><strong>${esc(c.name || "Unnamed bot")}</strong><span class="saved-meta">Current published chatbot profile</span></div><span class="preview-dot"></span></div>
      <div class="preview-bubble">${previewText(truncate(c.intro || "No opening message", 320))}</div>
      <div class="saved-field"><span>Admin topic / objective</span><p>${previewText(truncate(c.topic || "Not set", 500))}</p></div>
      <div class="saved-field"><span>Behavior prompt</span><p>${previewText(truncate(c.prompt || "Not set", 500))}</p></div>
      <div class="actions"><button class="btn small edit-chatbot">Edit</button><button class="btn small danger reset-chatbot">Reset to Default</button></div>
    </div>
  </article>`;
}

function renderThemePreview() {
  const t = DATA.settings?.theme || {};
  const names = { primary:"Primary", secondary:"Secondary", background:"Background", surface:"Surface", text:"Text", muted:"Muted", accent:"Accent" };
  $("#themePreview").innerHTML = `<article class="saved-card theme-saved-card">
    <div class="saved-card-body">
      <div class="saved-card-head"><div><strong>Current website palette</strong><span class="saved-meta">Colors currently saved in Firebase</span></div><span class="preview-dot"></span></div>
      <div class="theme-preview-swatches">${Object.entries(names).map(([key, label]) => `<div class="theme-swatch"><i style="background:${esc(t[key] || "#000000")}"></i><span>${label}</span><small>${esc(t[key] || "")}</small></div>`).join("")}</div>
      <div class="theme-demo" style="background:${esc(t.background || "#fff")};color:${esc(t.text || "#000")}"><strong style="color:${esc(t.primary || "#000")}">Qikly Support NGO</strong><span style="color:${esc(t.muted || "#666")}">Donation page preview</span><button style="background:${esc(t.primary || "#000")};color:#fff">Donate</button></div>
      <div class="actions"><button class="btn small edit-theme">Edit</button><button class="btn small danger reset-theme">Reset to Default</button></div>
    </div>
  </article>`;
}

function renderDonations() {
  const rows = DATA.donations || [];
  $("#donationsTable").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Rank</th><th>Name</th><th>Amount</th><th>Status</th><th>Type</th><th>Payment</th><th>Date</th></tr></thead><tbody>${rows.map((x, i) => `<tr><td>#${i+1}</td><td>${esc(x.name || "—")}</td><td>${money(x.amount)}</td><td><span class="status ${x.status}">${esc(x.status)}</span></td><td>${x.seed ? "Sample" : (x.source === "manual" ? "Manual / Cash" : "Razorpay")}</td><td>${esc(x.paymentId || "—")}</td><td>${formatDate(x.verifiedAt || x.createdAt)}</td></tr>`).join("") || `<tr><td colspan="7"><div class="empty">No donor records yet.</div></td></tr>`}</tbody></table></div>`;
}

function renderRecent() {
  const paid = (DATA.donations || []).filter(x => x.status === "paid").slice(0, 8);
  $("#recentDonations").innerHTML = paid.length ? `<div class="mini-list">${paid.map(x => `<div><span>${esc(x.name)} <small>${x.seed ? "sample" : "paid"}</small></span><strong>${money(x.amount)}</strong></div>`).join("")}</div>` : `<div class="empty">No donations yet.</div>`;
}

async function load() {
  setMsg("#adminDataStatus", "Loading saved data…");
  try {
    const loaded = await api(`/api/admin/data?ts=${Date.now()}`);
    if (!loaded || typeof loaded !== "object") throw new Error("Admin data response was empty.");

    DATA = {
      settings: loaded.settings && typeof loaded.settings === "object" ? loaded.settings : {},
      chatbot: loaded.chatbot && typeof loaded.chatbot === "object" ? loaded.chatbot : {},
      banners: Array.isArray(loaded.banners) ? loaded.banners : [],
      faqs: Array.isArray(loaded.faqs) ? loaded.faqs : [],
      donations: Array.isArray(loaded.donations) ? loaded.donations : [],
      stats: loaded.stats && typeof loaded.stats === "object" ? loaded.stats : { donorCount: 0, totalRaised: 0, todayAmount: 0, monthAmount: 0, seedCount: 0 },
      publicDonorCount: Number(loaded.publicDonorCount || 0),
    };

    // Always paint saved previews even if one form/widget has a malformed value.
    const steps = [
      ["header", () => { $("#adminNgoName").textContent = DATA.settings.ngoName || "Qikly Support NGO"; }],
      ["stats", () => { $("#statRaised").textContent = money(DATA.stats.totalRaised); $("#statDonors").textContent = Number(DATA.stats.donorCount || 0); $("#statToday").textContent = money(DATA.stats.todayAmount); $("#statMonth").textContent = money(DATA.stats.monthAmount); }],
      ["forms", fillForms],
      ["banners", renderBanners],
      ["faqs", renderFaqs],
      ["content", renderContentPreview],
      ["chatbot", renderChatbotPreview],
      ["theme", renderThemePreview],
      ["donations", renderDonations],
      ["recent", renderRecent],
    ];

    const failed = [];
    for (const [name, fn] of steps) {
      try { fn(); } catch (err) { console.error(`Admin ${name} render failed:`, err); failed.push(`${name}: ${err.message || err}`); }
    }

    const loadedMsg = `Loaded ${DATA.banners.length} banner${DATA.banners.length === 1 ? "" : "s"}, ${DATA.faqs.length} FAQ${DATA.faqs.length === 1 ? "" : "s"}, ${DATA.donations.length} donor record${DATA.donations.length === 1 ? "" : "s"}.`;
    setMsg("#adminDataStatus", failed.length ? `${loadedMsg} Some UI fields failed: ${failed.join(" | ")}` : loadedMsg);
  } catch (e) {
    console.error("Admin data load failed:", e);
    const msg = e?.message || "Unable to load saved admin data.";
    setMsg("#adminDataStatus", `ERROR: ${msg}`);
    ["#bannerTable", "#faqTable", "#contentPreview", "#chatbotPreview", "#themePreview", "#donationsTable", "#recentDonations"].forEach(sel => {
      const el = $(sel);
      if (el) el.innerHTML = `<div class="empty error-state">Saved data could not be loaded.<br><small>${esc(msg)}</small><br><button class="btn small retry-admin-data" type="button">Retry</button></div>`;
    });
  }
}

function resetBanner() {
  $("#bannerId").value = ""; $("#bannerTitle").value = ""; $("#bannerSort").value = "1"; $("#bannerImage").value = ""; $("#bannerLink").value = ""; $("#bannerActive").checked = true;
  $("#bannerFile").value = ""; setMsg("#bannerUploadMsg", ""); renderBannerImagePreview("");
}

async function uploadBannerFile() {
  const file = $("#bannerFile")?.files?.[0];
  if (!file) { setMsg("#bannerUploadMsg", "Choose an image first."); return; }
  if (!file.type.startsWith("image/")) { setMsg("#bannerUploadMsg", "Please select an image file."); return; }
  if (file.size > 8 * 1024 * 1024) { setMsg("#bannerUploadMsg", "Image must be under 8 MB."); return; }
  const btn = $("#uploadBannerImage");
  btn.disabled = true; setMsg("#bannerUploadMsg", "Uploading to ImgBB…");
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read image."));
      reader.readAsDataURL(file);
    });
    const d = await api("/api/admin/upload-image", { method: "POST", body: JSON.stringify({ image: dataUrl, name: file.name.replace(/\.[^.]+$/, "") }) });
    $("#bannerImage").value = d.imageUrl;
    setMsg("#bannerUploadMsg", "Uploaded successfully. URL added to the banner form.");
    renderBannerImagePreview(d.imageUrl);
  } catch (e) { setMsg("#bannerUploadMsg", e.message); }
  finally { btn.disabled = false; }
}

$("#saveBanner").onclick = async () => {
  try {
    await api("/api/admin/banner", { method:"POST", body:JSON.stringify({ id:$("#bannerId").value, title:$("#bannerTitle").value, sortOrder:Number($("#bannerSort").value)||1, imageUrl:$("#bannerImage").value, linkUrl:$("#bannerLink").value, active:$("#bannerActive").checked }) });
    resetBanner(); await load();
  } catch(e) { alert(e.message); }
};
$("#resetBanner").onclick = resetBanner;
$("#uploadBannerImage").onclick = uploadBannerFile;
$("#bannerImage").addEventListener("input", e => renderBannerImagePreview(e.target.value));
$("#bannerTable").onclick = async (e) => {
  const edit = e.target.closest(".edit-banner"), del = e.target.closest(".del-banner");
  if (edit) {
    const x = DATA.banners.find(b => b.id === edit.dataset.id); if (!x) return;
    $("#bannerId").value=x.id; $("#bannerTitle").value=x.title||""; $("#bannerSort").value=x.sortOrder||1; $("#bannerImage").value=x.imageUrl||""; $("#bannerLink").value=x.linkUrl||""; $("#bannerActive").checked=x.active!==false; renderBannerImagePreview(x.imageUrl || ""); switchSection("banners"); scrollTo(0,0);
  }
  if (del && confirm("Delete this banner?")) { await api("/api/admin/delete", { method:"POST", body:JSON.stringify({collection:"banners", id:del.dataset.id}) }); await load(); }
};

$("#saveContent").onclick = async () => {
  try {
    const body={ngoName:$("#ngoNameInput").value,supportEmail:$("#supportEmailInput").value,tagline:$("#taglineInput").value,heroTitle:$("#heroTitleInput").value,heroText:$("#heroTextInput").value,marqueeText:$("#marqueeInput").value,about:$("#aboutInput").value,terms:$("#termsInput").value,privacy:$("#privacyInput").value,refund:$("#refundInput").value,theme:DATA.settings.theme};
    await api("/api/admin/settings",{method:"POST",body:JSON.stringify(body)}); setMsg("#contentMsg","Saved successfully."); await load();
  } catch(e) { setMsg("#contentMsg",e.message); }
};

$("#contentPreview").onclick = async (e) => {
  const edit = e.target.closest(".edit-content"), reset = e.target.closest(".reset-content");
  if (edit) {
    const map = { ngoName:"ngoNameInput", supportEmail:"supportEmailInput", tagline:"taglineInput", heroTitle:"heroTitleInput", heroText:"heroTextInput", marqueeText:"marqueeInput", about:"aboutInput", terms:"termsInput", privacy:"privacyInput", refund:"refundInput" };
    const target = $("#" + map[edit.dataset.field]); if (target) { switchSection("content"); target.scrollIntoView({ behavior:"smooth", block:"center" }); setTimeout(() => target.focus(), 250); }
  }
  if (reset && confirm("Reset this saved section to its default content?")) {
    try { await api("/api/admin/reset-section", { method:"POST", body:JSON.stringify({section:reset.dataset.field}) }); await load(); }
    catch(e) { alert(e.message); }
  }
};

function resetFaq(){ $("#faqId").value=""; $("#faqQuestion").value=""; $("#faqAnswer").value=""; $("#faqSort").value="1"; $("#faqActive").checked=true; }
$("#saveFaq").onclick = async () => { try { await api("/api/admin/faq",{method:"POST",body:JSON.stringify({id:$("#faqId").value,question:$("#faqQuestion").value,answer:$("#faqAnswer").value,sortOrder:Number($("#faqSort").value)||1,active:$("#faqActive").checked})}); resetFaq(); await load(); } catch(e){ alert(e.message); } };
$("#resetFaq").onclick=resetFaq;
$("#faqTable").onclick=async(e)=>{
  const edit=e.target.closest(".edit-faq"),del=e.target.closest(".del-faq");
  if(edit){const x=DATA.faqs.find(f=>f.id===edit.dataset.id); if (!x) return; $("#faqId").value=x.id; $("#faqQuestion").value=x.question||""; $("#faqAnswer").value=x.answer||""; $("#faqSort").value=x.sortOrder||1; $("#faqActive").checked=x.active!==false; switchSection("faqAdmin"); scrollTo(0,0); }
  if(del&&confirm("Delete this FAQ?")){await api("/api/admin/delete",{method:"POST",body:JSON.stringify({collection:"faq",id:del.dataset.id})});await load();}
};

$("#seedSupporters").onclick = async () => { if(!confirm("Replace existing sample supporters with 450 generated sample rows? Real paid donations will stay safe.")) return; const b=$("#seedSupporters"); b.disabled=true; setMsg("#seedMsg","Generating 450 sample supporters…"); try { const d=await api("/api/admin/seed-supporters",{method:"POST",body:"{}"}); setMsg("#seedMsg",`Done — ${d.count} sample supporters added.`); await load(); } catch(e){setMsg("#seedMsg",e.message)} finally{b.disabled=false;} };

$("#addManualDonor").onclick = async () => {
  const name = $("#manualDonorName").value.trim(); const amount = Number($("#manualDonorAmount").value); const b=$("#addManualDonor"); b.disabled=true; setMsg("#manualDonorMsg","Adding donor…");
  try { const d=await api("/api/admin/donations/manual",{method:"POST",body:JSON.stringify({name,amount})}); $("#manualDonorName").value=""; $("#manualDonorAmount").value=""; setMsg("#manualDonorMsg",`Added ${d.name} — ${money(d.amount)}.`); await load(); }
  catch(e){setMsg("#manualDonorMsg",e.message)} finally{b.disabled=false;}
};

$("#deleteAllDonors").onclick = async () => {
  if (!confirm("Delete ALL donor records, including real, manual and sample donors? This cannot be undone.")) return;
  const b=$("#deleteAllDonors"); b.disabled=true;
  try { const d=await api("/api/admin/donations/delete-all",{method:"POST",body:"{}"}); setMsg("#manualDonorMsg",`Deleted ${d.count} donor records.`); await load(); }
  catch(e){alert(e.message)} finally{b.disabled=false;}
};

$("#saveChatbot").onclick=async()=>{try{await api("/api/admin/chatbot",{method:"POST",body:JSON.stringify({name:$("#botName").value,intro:$("#botIntro").value,topic:$("#botTopic").value,prompt:$("#botPrompt").value})});setMsg("#botMsg","Chatbot settings saved.");await load();}catch(e){setMsg("#botMsg",e.message)}};
$("#chatbotPreview").onclick=async(e)=>{
  if(e.target.closest(".edit-chatbot")){switchSection("chatbotAdmin");$("#botName").scrollIntoView({behavior:"smooth",block:"center"});setTimeout(()=>$("#botName").focus(),250);}
  if(e.target.closest(".reset-chatbot")&&confirm("Reset chatbot settings to the default bot?")){try{await api("/api/admin/reset-section",{method:"POST",body:JSON.stringify({section:"chatbot"})});await load();}catch(err){alert(err.message)}}
};

$("#saveTheme").onclick=async()=>{try{const theme={primary:$("#themePrimary").value,secondary:$("#themeSecondary").value,background:$("#themeBackground").value,surface:$("#themeSurface").value,text:$("#themeText").value,muted:$("#themeMuted").value,accent:$("#themeAccent").value};const s=DATA.settings;await api("/api/admin/settings",{method:"POST",body:JSON.stringify({...s,theme})});setMsg("#themeMsg","Theme saved.");await load();}catch(e){setMsg("#themeMsg",e.message)}};
$("#themePreview").onclick=async(e)=>{
  if(e.target.closest(".edit-theme")){switchSection("themeAdmin");$("#themePrimary").scrollIntoView({behavior:"smooth",block:"center"});}
  if(e.target.closest(".reset-theme")&&confirm("Reset all theme colors to the default palette?")){try{await api("/api/admin/reset-section",{method:"POST",body:JSON.stringify({section:"theme"})});await load();}catch(err){alert(err.message)}}
};

$("#loginForm").onsubmit=async(e)=>{e.preventDefault();$("#loginError").textContent="";try{await api("/api/admin/login",{method:"POST",body:JSON.stringify({password:$("#password").value})});$("#loginView").classList.add("hidden");$("#adminView").classList.remove("hidden");await load();}catch(e){$("#loginError").textContent=e.message}};
document.addEventListener("click", e => {
  if (e.target.closest(".retry-admin-data")) load();
});

$("#logout").onclick=async()=>{await api("/api/admin/logout",{method:"POST",body:"{}"});location.reload();};

(async()=>{try{const me=await api("/api/admin/me");if(me.authenticated){$("#loginView").classList.add("hidden");$("#adminView").classList.remove("hidden");await load();}}catch(e){}})();
