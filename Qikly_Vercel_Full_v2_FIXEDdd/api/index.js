
const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const admin = require("firebase-admin");
const {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
app.use(express.json({limit:"20mb"}));

if (!admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON");
  const serviceAccount = typeof raw === "string" ? JSON.parse(raw) : raw;
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL || undefined
  });
}
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const R2_READY = !!(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET
);

const r2 = R2_READY ? new S3Client({
  region:"auto",
  endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials:{
    accessKeyId:process.env.R2_ACCESS_KEY_ID,
    secretAccessKey:process.env.R2_SECRET_ACCESS_KEY
  }
}) : null;

let STORE_MEM_CACHE=null;
let STORE_MEM_EXPIRES=0;
const AI_RATE=new Map();
function invalidateStoreCache(){STORE_MEM_CACHE=null;STORE_MEM_EXPIRES=0}
async function getStoreSnapshot(){
  if(STORE_MEM_CACHE && Date.now()<STORE_MEM_EXPIRES)return STORE_MEM_CACHE;
  await ensureSeeds();
  const [settings,categories,books]=await Promise.all([getSettings(),listCol("categories"),listCol("books")]);
  STORE_MEM_CACHE={settings,categories,books:books.filter(b=>b.active!==false)};
  STORE_MEM_EXPIRES=Date.now()+30_000;
  return STORE_MEM_CACHE;
}
function aiAllowed(ip){
  const now=Date.now(),windowMs=60_000,limit=20;
  const bucket=AI_RATE.get(ip)||{start:now,count:0};
  if(now-bucket.start>windowMs){bucket.start=now;bucket.count=0}
  bucket.count++;AI_RATE.set(ip,bucket);
  if(AI_RATE.size>5000){for(const [k,v] of AI_RATE){if(now-v.start>windowMs)AI_RATE.delete(k)}}
  return bucket.count<=limit;
}

const SESSION_COOKIE="qikly_ebook_session";
const ADMIN_COOKIE="qikly_ebook_admin";
const SESSION_SECRET=String(process.env.SESSION_SECRET||"change-me");
const ADMIN_PASSWORD=String(process.env.ADMIN_PASSWORD||"change-me");
if(process.env.NODE_ENV==="production" && (SESSION_SECRET.length<32 || SESSION_SECRET==="change-me" || ADMIN_PASSWORD==="change-me" || ADMIN_PASSWORD.length<12)){
  throw new Error("Set a unique SESSION_SECRET (32+ characters) and ADMIN_PASSWORD (12+ characters) before production deployment.");
}

const defaults = {
  siteName:"Qikly Books",
  tagline:"Premium e-books, instantly in your library.",
  announcement:"Read smarter. Buy once. Keep your books.",
  heroTitle:"Stories, skills & ideas — all in one digital library.",
  heroText:"Discover premium e-books created for learners, builders and curious minds. Pay securely and get instant access.",
  supportEmail:"support@qikly.shop",
  currency:"INR",
  logoText:"Q",
  accent:"#7c3aed",
  secondary:"#06b6d4",
  featuredBookId:""
};

const seedCategories = [
  {id:"programming",title:"Programming",icon:"</>",description:"Code, web development and software engineering."},
  {id:"business",title:"Business",icon:"◈",description:"Business, freelancing, marketing and money skills."},
  {id:"self-growth",title:"Self Growth",icon:"✦",description:"Habits, productivity and personal development."},
  {id:"education",title:"Education",icon:"∑",description:"Study guides, concepts and practical learning."}
];

const seedBooks = [
  {
    id:"python-zero-to-builder",title:"Python: Zero to Builder",author:"Mintu",
    categoryId:"programming",categoryName:"Programming",price:199,oldPrice:299,
    rating:4.9,featured:true,newArrival:true,
    description:"A practical beginner-friendly Python guide with clear explanations, examples and small projects.",
    highlights:["Python fundamentals","Functions and modules","Files and APIs","Mini projects"],
    pages:180,format:"PDF",coverClass:"cover-violet",fileKey:""
  },
  {
    id:"modern-web-stack",title:"Modern Web Stack",author:"Qikly Books",
    categoryId:"programming",categoryName:"Programming",price:249,oldPrice:399,
    rating:4.8,featured:true,newArrival:true,
    description:"Learn how modern websites fit together: frontend, backend, databases, deployment and security basics.",
    highlights:["HTML/CSS/JS","Backend APIs","Firebase","Deployment"],
    pages:220,format:"PDF",coverClass:"cover-cyan",fileKey:""
  },
  {
    id:"creator-playbook",title:"The Creator Playbook",author:"Qikly Books",
    categoryId:"business",categoryName:"Business",price:149,oldPrice:249,
    rating:4.7,featured:false,newArrival:true,
    description:"A practical framework for turning ideas into content, products and repeatable online workflows.",
    highlights:["Content systems","Brand basics","Digital products","Simple analytics"],
    pages:140,format:"PDF",coverClass:"cover-amber",fileKey:""
  }
];

function sign(payload){
  const body=Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig=crypto.createHmac("sha256",SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function unsign(token){
  try{
    const [body,sig]=String(token||"").split(".");
    if(!body||!sig)return null;
    const expected=crypto.createHmac("sha256",SESSION_SECRET).update(body).digest("base64url");
    if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;
    const p=JSON.parse(Buffer.from(body,"base64url").toString());
    if(p.exp && Date.now()>p.exp)return null;
    return p;
  }catch{return null}
}
function cookieSet(res,name,value,maxAge=60*60*24*7){
  res.setHeader("Set-Cookie",`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV==="production"?"; Secure":""}`);
}
function cookieClear(res,name){res.setHeader("Set-Cookie",`${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV==="production"?"; Secure":""}`)}
function getCookie(req,name){
  const raw=req.headers.cookie||"";
  const m=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="));
  return m?decodeURIComponent(m.slice(name.length+1)):"";
}
function userFromReq(req){
  const p=unsign(getCookie(req,SESSION_COOKIE));
  return p?.uid?{uid:p.uid,email:p.email,name:p.name}:null;
}
function requireUser(req,res,next){
  const u=userFromReq(req);
  if(!u)return res.status(401).json({error:"Please login first."});
  req.user=u;next();
}
function requireAdmin(req,res,next){
  const p=unsign(getCookie(req,ADMIN_COOKIE));
  if(!p?.admin)return res.status(401).json({error:"Admin login required."});
  next();
}
function cleanUser(d,id){
  return {id,...d,passwordHash:undefined,passwordSalt:undefined};
}
function hashPassword(password,salt=crypto.randomBytes(16).toString("hex")){
  return new Promise((resolve,reject)=>crypto.scrypt(String(password),salt,64,(e,k)=>e?reject(e):resolve({salt,hash:k.toString("hex")})));
}
async function verifyPassword(password,salt,hash){
  const out=await hashPassword(password,salt);
  return crypto.timingSafeEqual(Buffer.from(out.hash,"hex"),Buffer.from(hash,"hex"));
}
async function ensureSeeds(){
  const sref=db.collection("settings").doc("main");
  const ss=await sref.get();
  if(!ss.exists) await sref.set(defaults);
  const cats=await db.collection("categories").limit(1).get();
  if(cats.empty){
    const b=db.batch();
    for(const c of seedCategories)b.set(db.collection("categories").doc(c.id),c);
    await b.commit();
  }
  const books=await db.collection("books").limit(1).get();
  if(books.empty){
    const b=db.batch();
    for(const x of seedBooks)b.set(db.collection("books").doc(x.id),x);
    await b.commit();
  }
}
async function listCol(name){
  const snap=await db.collection(name).get();
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}
async function getSettings(){
  const d=await db.collection("settings").doc("main").get();
  return d.exists?d.data():defaults;
}

app.get("/health",(req,res)=>res.json({ok:true,service:"yaadpage-api",r2:R2_READY}));

app.get("/api/store",async(req,res)=>{
  try{res.set("Cache-Control","public, max-age=20, stale-while-revalidate=45");res.json(await getStoreSnapshot())}
  catch(e){res.status(500).json({error:e.message})}
});

app.get("/api/books/:id",async(req,res)=>{
  try{
    const d=await db.collection("books").doc(req.params.id).get();
    if(!d.exists)return res.status(404).json({error:"Book not found."});
    res.json({book:{id:d.id,...d.data()}});
  }catch(e){res.status(500).json({error:e.message})}
});

app.post("/api/auth/signup",async(req,res)=>{
  try{
    const email=String(req.body.email||"").trim().toLowerCase();
    const name=String(req.body.name||"").trim();
    const password=String(req.body.password||"");
    if(!email||!name||password.length<6)return res.status(400).json({error:"Name, valid email and a 6+ character password are required."});
    const existing=await db.collection("users").where("email","==",email).limit(1).get();
    if(!existing.empty)return res.status(409).json({error:"An account with this email already exists."});
    const ph=await hashPassword(password);
    const ref=db.collection("users").doc();
    await ref.set({email,name,passwordHash:ph.hash,passwordSalt:ph.salt,createdAt:FieldValue.serverTimestamp()});
    cookieSet(res,SESSION_COOKIE,sign({uid:ref.id,email,name,exp:Date.now()+7*86400000}));
    res.json({ok:true,user:{id:ref.id,email,name}});
  }catch(e){res.status(500).json({error:e.message})}
});

app.post("/api/auth/login",async(req,res)=>{
  try{
    const email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");
    const q=await db.collection("users").where("email","==",email).limit(1).get();
    if(q.empty)return res.status(401).json({error:"Invalid email or password."});
    const d=q.docs[0],u=d.data();
    if(!u.passwordHash||!(await verifyPassword(password,u.passwordSalt,u.passwordHash)))return res.status(401).json({error:"Invalid email or password."});
    cookieSet(res,SESSION_COOKIE,sign({uid:d.id,email:u.email,name:u.name||"Reader",exp:Date.now()+7*86400000}));
    res.json({ok:true,user:{id:d.id,email:u.email,name:u.name||"Reader"}});
  }catch(e){res.status(500).json({error:e.message})}
});

app.post("/api/ai/chat",async(req,res)=>{
  try{
    const key=String(process.env.GEMINI_API_KEY||"").trim();
    if(!key)return res.status(503).json({error:"Qikly AI is not configured yet."});
    const ip=String(req.headers["x-forwarded-for"]||req.socket.remoteAddress||"anonymous").split(",")[0].trim();
    if(!aiAllowed(ip))return res.status(429).json({error:"AI is busy right now. Please try again in a minute."});
    const message=String(req.body?.message||"").trim().slice(0,700);
    if(!message)return res.status(400).json({error:"Message is required."});
    const history=Array.isArray(req.body?.history)?req.body.history.slice(-8).map(x=>({role:x.role==="model"?"model":"user",parts:[{text:String(x?.parts?.[0]?.text||"").slice(0,700)}]})).filter(x=>x.parts[0].text):[{role:"user",parts:[{text:message}]}];
    const store=await getStoreSnapshot();
    const catalog=store.books.slice(0,80).map(b=>`- ${b.title} | ${b.author||"Qikly Books"} | ${b.categoryName||"Other"} | ₹${Number(b.price||0)} | ${b.description||""}`).join("\n");
    const system=`You are Qikly AI, the helpful assistant inside Qikly Books. Keep answers concise, friendly and practical. Help visitors discover books, understand checkout, login, My Library and e-book access. Never claim a user purchased a book unless the site explicitly confirms it. Do not expose API keys, passwords, internal URLs, Firestore details or server secrets. If asked about a book, use the catalog below and clearly say when something is not in the catalog. You can also answer general study and productivity questions.\n\nCURRENT CATALOG:\n${catalog}`;
    const model=String(process.env.GEMINI_MODEL||"gemini-3.6-flash").trim();
    const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const rr=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:history,generationConfig:{temperature:0.45,maxOutputTokens:500}})});
    const data=await rr.json().catch(()=>({}));
    if(!rr.ok)return res.status(502).json({error:data?.error?.message||"Gemini request failed."});
    const text=(data?.candidates?.[0]?.content?.parts||[]).map(x=>x.text||"").join("\n").trim();
    if(!text)return res.status(502).json({error:"AI returned an empty response."});
    res.json({text});
  }catch(e){res.status(500).json({error:e.message})}
});

app.get("/api/payment/key",(req,res)=>res.json({key:process.env.RAZORPAY_KEY_ID||""}));

app.get("/api/auth/me",(req,res)=>{
  const u=userFromReq(req);res.json({authenticated:!!u,user:u||null});
});
app.post("/api/auth/logout",(req,res)=>{cookieClear(res,SESSION_COOKIE);res.json({ok:true})});

app.get("/api/library",requireUser,async(req,res)=>{
  try{
    const q=await db.collection("orders").where("userId","==",req.user.uid).get();
    const ids=q.docs.filter(d=>["paid","captured"].includes(d.data().status)).map(d=>d.data().bookId);
    const unique=[...new Set(ids)];
    const books=[];
    for(const id of unique){const d=await db.collection("books").doc(id).get();if(d.exists)books.push({id:d.id,...d.data()})}
    res.json({books});
  }catch(e){res.status(500).json({error:e.message})}
});

app.get("/api/books/:id/access",requireUser,async(req,res)=>{
  try{
    const oq=await db.collection("orders").where("userId","==",req.user.uid).where("bookId","==",req.params.id).limit(20).get();
    const owned=oq.docs.some(d=>["paid","captured"].includes(d.data().status));
    if(!owned)return res.status(403).json({error:"Purchase this book to access it."});
    const b=await db.collection("books").doc(req.params.id).get();
    if(!b.exists)return res.status(404).json({error:"Book not found."});
    const book={id:b.id,...b.data()};
    if(!book.fileKey)return res.status(404).json({error:"The e-book file has not been uploaded yet."});
    if(!R2_READY)return res.status(503).json({error:"R2 storage is not configured on the server yet."});
    const url=await getSignedUrl(r2,new GetObjectCommand({Bucket:process.env.R2_BUCKET,Key:book.fileKey}),{expiresIn:600});
    res.json({url,expiresIn:600});
  }catch(e){res.status(500).json({error:e.message})}
});

app.post("/api/checkout/create-order",requireUser,async(req,res)=>{
  try{
    const bookId=String(req.body.bookId||"");
    const b=await db.collection("books").doc(bookId).get();
    if(!b.exists||b.data().active===false)return res.status(404).json({error:"Book not found."});
    const book=b.data(), amount=Math.round(Number(book.price)*100);
    if(!amount||amount<100)return res.status(400).json({error:"Invalid book price."});
    const order=await razorpay.orders.create({amount,currency:"INR",receipt:`ebook_${bookId}_${Date.now()}`});
    res.json({orderId:order.id,amount,currency:"INR",book:{id:bookId,title:book.title,price:book.price}});
  }catch(e){res.status(500).json({error:e.error?.description||e.message})}
});

app.post("/api/checkout/verify",requireUser,async(req,res)=>{
  try{
    const {razorpay_order_id,razorpay_payment_id,razorpay_signature,bookId}=req.body||{};
    if(!razorpay_order_id||!razorpay_payment_id||!razorpay_signature||!bookId)return res.status(400).json({error:"Incomplete payment response."});
    const body=`${razorpay_order_id}|${razorpay_payment_id}`;
    const expected=crypto.createHmac("sha256",process.env.RAZORPAY_KEY_SECRET).update(body).digest("hex");
    if(Buffer.byteLength(expected)!==Buffer.byteLength(String(razorpay_signature))||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(String(razorpay_signature))))return res.status(400).json({error:"Payment signature verification failed."});
    const existing=await db.collection("orders").where("paymentId","==",razorpay_payment_id).limit(1).get();
    if(existing.empty){
      const b=await db.collection("books").doc(bookId).get();
      if(!b.exists)return res.status(404).json({error:"Book no longer exists."});
      await db.collection("orders").add({
        userId:req.user.uid,bookId,paymentId:razorpay_payment_id,razorpayOrderId:razorpay_order_id,
        amount:Number(b.data().price),status:"paid",createdAt:FieldValue.serverTimestamp()
      });
    }
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message})}
});

app.get("/api/admin/me",(req,res)=>res.json({authenticated:!!unsign(getCookie(req,ADMIN_COOKIE))?.admin}));

app.post("/api/admin/login",(req,res)=>{
  const password=String(req.body.password||"");
  if(Buffer.byteLength(password)!==Buffer.byteLength(ADMIN_PASSWORD)||!crypto.timingSafeEqual(Buffer.from(password),Buffer.from(ADMIN_PASSWORD)))return res.status(401).json({error:"Wrong admin password."});
  cookieSet(res,ADMIN_COOKIE,sign({admin:true,exp:Date.now()+12*3600000}),12*3600);
  res.json({ok:true});
});
app.post("/api/admin/logout",(req,res)=>{cookieClear(res,ADMIN_COOKIE);res.json({ok:true})});

app.get("/api/admin/data",requireAdmin,async(req,res)=>{
  try{
    const [settings,categories,books,orders,users]=await Promise.all([
      getSettings(),listCol("categories"),listCol("books"),listCol("orders"),listCol("users")
    ]);
    res.json({
      settings,categories,books,orders:orders.sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))),
      users:users.map(u=>cleanUser(u,u.id))
    });
  }catch(e){res.status(500).json({error:e.message})}
});

app.post("/api/admin/books",requireAdmin,async(req,res)=>{
  try{
    const data=req.body||{},ref=db.collection("books").doc();
    const book={title:String(data.title||"Untitled"),author:String(data.author||"Qikly Books"),
      categoryId:String(data.categoryId||"other"),categoryName:String(data.categoryName||"Other"),
      price:Number(data.price||0),oldPrice:Number(data.oldPrice||0),rating:Number(data.rating||5),
      description:String(data.description||""),highlights:Array.isArray(data.highlights)?data.highlights:[],
      pages:Number(data.pages||0),format:"PDF",coverUrl:String(data.coverUrl||""),coverClass:String(data.coverClass||"cover-violet"),
      fileKey:String(data.fileKey||""),featured:!!data.featured,newArrival:!!data.newArrival,active:data.active!==false,
      createdAt:FieldValue.serverTimestamp()};
    await ref.set(book);invalidateStoreCache();res.json({ok:true,book:{id:ref.id,...book}});
  }catch(e){res.status(500).json({error:e.message})}
});

app.put("/api/admin/books/:id",requireAdmin,async(req,res)=>{
  try{await db.collection("books").doc(req.params.id).set(req.body||{},{merge:true});invalidateStoreCache();res.json({ok:true})}
  catch(e){res.status(500).json({error:e.message})}
});
app.delete("/api/admin/books/:id",requireAdmin,async(req,res)=>{
  try{await db.collection("books").doc(req.params.id).delete();invalidateStoreCache();res.json({ok:true})}
  catch(e){res.status(500).json({error:e.message})}
});

app.post("/api/admin/categories",requireAdmin,async(req,res)=>{
  try{const d=req.body||{},id=String(d.id||d.title||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");if(!id)return res.status(400).json({error:"Category title required."});await db.collection("categories").doc(id).set({title:String(d.title||id),icon:String(d.icon||"✦"),description:String(d.description||"")},{merge:true});res.json({ok:true,id})}
  catch(e){res.status(500).json({error:e.message})}
});
app.delete("/api/admin/categories/:id",requireAdmin,async(req,res)=>{try{await db.collection("categories").doc(req.params.id).delete();invalidateStoreCache();res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});

app.put("/api/admin/settings",requireAdmin,async(req,res)=>{
  try{await db.collection("settings").doc("main").set(req.body||{},{merge:true});invalidateStoreCache();res.json({ok:true})}
  catch(e){res.status(500).json({error:e.message})}
});

app.post("/api/admin/cover-upload",requireAdmin,async(req,res)=>{
  try{
    const key=String(process.env.IMGBB_API_KEY||"").trim();
    if(!key)return res.status(503).json({error:"ImgBB API key is not configured on the server."});
    let image=String(req.body?.imageBase64||"").trim();
    if(!image)return res.status(400).json({error:"Image data is required."});
    image=image.replace(/^data:image\/[^;]+;base64,/i,"");
    if(Buffer.byteLength(image,"utf8")>10*1024*1024)return res.status(413).json({error:"Thumbnail is too large. Use an image under 7 MB."});
    const form=new URLSearchParams();form.set("image",image);
    const name=String(req.body?.fileName||"cover").replace(/[^a-zA-Z0-9._-]/g,"-").slice(0,80);form.set("name",name);
    const rr=await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(key)}`,{method:"POST",body:form,headers:{"Content-Type":"application/x-www-form-urlencoded"}});
    const data=await rr.json().catch(()=>({}));
    if(!rr.ok||!data?.success)return res.status(502).json({error:data?.error?.message||"ImgBB upload failed."});
    res.json({ok:true,url:data.data.display_url||data.data.url,thumbUrl:data.data.thumb?.url||data.data.display_url||data.data.url,deleteUrl:data.data.delete_url||""});
  }catch(e){res.status(500).json({error:e.message})}
});

app.post("/api/admin/upload-url",requireAdmin,async(req,res)=>{
  try{
    if(!R2_READY)return res.status(503).json({error:"R2 environment variables are missing."});
    const contentType=String(req.body.contentType||"application/pdf");
    if(contentType!=="application/pdf")return res.status(400).json({error:"Only PDF uploads are allowed."});
    const safe=String(req.body.fileName||"book.pdf").replace(/[^a-zA-Z0-9._-]/g,"-");
    const key=`ebooks/${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safe}`;
    const url=await getSignedUrl(r2,new PutObjectCommand({Bucket:process.env.R2_BUCKET,Key:key,ContentType:"application/pdf"}),{expiresIn:900});
    res.json({url,key,expiresIn:900});
  }catch(e){res.status(500).json({error:e.message})}
});


// -----------------------------------------------------------------------------
// YaadPage: automated personalized microsites (keeps the existing Firebase,
// Razorpay and Cloudflare R2 infrastructure and the legacy Qikly routes).
// -----------------------------------------------------------------------------
const YP_PLANS = {
  starter: { id:"starter", name:"Starter", price:199, photos:1, label:"A beautiful one-page surprise" },
  story:   { id:"story", name:"Story", price:399, photos:10, label:"A richer story with up to 10 photos" },
  premium: { id:"premium", name:"Premium", price:699, photos:100, label:"A complete memory gallery with up to 100 photos" }
};
const YP_TEMPLATES = [
  { id:"birthday", name:"Birthday Glow", category:"Birthday", description:"A bright, joyful birthday surprise." },
  { id:"birthday-confetti", name:"Confetti Party", category:"Birthday", description:"A colourful celebration with playful details." },
  { id:"birthday-elegance", name:"Birthday Elegance", category:"Birthday", description:"A soft, elegant birthday note." },
  { id:"birthday-night", name:"Midnight Wish", category:"Birthday", description:"A rich night-sky birthday design." },
  { id:"love", name:"Love Letter", category:"Love", description:"A warm page for a special person." },
  { id:"love-story", name:"Our Little World", category:"Love", description:"A romantic page for your shared story." },
  { id:"long-distance", name:"Miles Apart", category:"Love", description:"A page for people close at heart, even far away." },
  { id:"proposal", name:"One Question", category:"Proposal", description:"A thoughtful page for a big question." },
  { id:"valentine", name:"Be My Valentine", category:"Love", description:"A sweet Valentine surprise." },
  { id:"anniversary", name:"Our Story", category:"Anniversary", description:"Celebrate the moments you share." },
  { id:"anniversary-timeline", name:"Our Timeline", category:"Anniversary", description:"Turn your milestones into a memory journey." },
  { id:"golden-anniversary", name:"Golden Years", category:"Anniversary", description:"A timeless golden anniversary tribute." },
  { id:"wedding-invitation", name:"The Wedding Invite", category:"Wedding", description:"An elegant shareable wedding invitation." },
  { id:"wedding-save-date", name:"Save the Date", category:"Wedding", description:"A beautiful announcement for the big day." },
  { id:"wedding-floral", name:"Floral Vows", category:"Wedding", description:"A romantic floral wedding design." },
  { id:"wedding-royal", name:"Royal Celebration", category:"Wedding", description:"A grand wedding announcement in a regal style." },
  { id:"wedding-minimal", name:"Modern Minimal", category:"Wedding", description:"A clean and modern wedding invitation." },
  { id:"wedding-gallery", name:"Wedding Memories", category:"Wedding", description:"A photo-first page for wedding memories." },
  { id:"engagement", name:"The Engagement", category:"Wedding", description:"Celebrate the beginning of forever." },
  { id:"bestfriend", name:"Best Friend Forever", category:"Friendship", description:"A personal tribute to your best friend." },
  { id:"friendship-timeline", name:"Friendship Files", category:"Friendship", description:"A timeline of your favourite memories together." },
  { id:"graduation", name:"The Next Chapter", category:"Milestone", description:"Celebrate a graduation or new beginning." },
  { id:"thankyou", name:"A Thank You Page", category:"Appreciation", description:"A thoughtful page to say thank you." },
  { id:"family", name:"Family Moments", category:"Family", description:"A warm page for family celebrations." }
];
const YP_TEMPLATE_MAP = new Map(YP_TEMPLATES.map(x=>[x.id,x]));
const YP_OCCASIONS = new Set(YP_TEMPLATES.map(x=>x.id));
const YP_SLUG_LOCK_MS = 2 * 60 * 60 * 1000;

function ypSlug(value){
  return String(value||"").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,42).replace(/-+$/g,"");
}
function ypSafeText(value,max=500){return String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max)}
function ypUploadToken(orderId){return sign({purpose:"yaadpage-upload",orderId,exp:Date.now()+2*60*60*1000})}
function ypVerifyUploadToken(token,orderId){
  const p=unsign(token);
  return !!p && p.purpose==="yaadpage-upload" && p.orderId===orderId;
}
function ypImageType(buffer,declared){
  const b=buffer;
  if(declared==="image/jpeg" && b.length>=3 && b[0]===0xff && b[1]===0xd8 && b[2]===0xff)return "jpg";
  if(declared==="image/png" && b.length>=8 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return "png";
  if(declared==="image/webp" && b.length>=12 && b.toString("ascii",0,4)==="RIFF" && b.toString("ascii",8,12)==="WEBP")return "webp";
  return "";
}
function ypPublicPage(page){
  return {
    slug:page.slug, templateId:page.templateId, occasion:page.occasion,
    recipientName:page.recipientName, senderName:page.senderName,
    title:page.title, message:page.message, eventDate:page.eventDate||"",
    photos:(page.photos||[]).map(p=>({id:p.id,contentType:p.contentType})),
    planId:page.planId, createdAt:page.createdAt||null, expiresAt:page.expiresAt||null
  };
}

function ypPromoId(value){return String(value||"").toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,24)}
function ypYoutubeId(value){
  const raw=String(value||"").trim();
  if(/^[a-zA-Z0-9_-]{11}$/.test(raw))return raw;
  let id="";
  try{
    const u=new URL(raw);
    if(u.hostname==="youtu.be"||u.hostname.endsWith(".youtu.be"))id=(u.pathname.split("/").filter(Boolean)[0]||"");
    else if(u.hostname==="youtube.com"||u.hostname.endsWith(".youtube.com")||u.hostname==="youtube-nocookie.com"||u.hostname.endsWith(".youtube-nocookie.com")){
      if(u.pathname==="/watch")id=u.searchParams.get("v")||"";
      else {const parts=u.pathname.split("/").filter(Boolean),idx=parts.findIndex(x=>["embed","shorts","live"].includes(x));if(idx>=0)id=parts[idx+1]||"";}
    }
  }catch{}
  return /^[a-zA-Z0-9_-]{11}$/.test(id)?id:"";
}
function ypPromoQuote(plan,promo){
  const base=Number(plan.price||0);let discount=0;
  if(promo.type==="free")discount=base;
  else if(promo.type==="percent")discount=Math.round(base*Math.min(100,Math.max(0,Number(promo.value||0)))/100);
  else if(promo.type==="fixed")discount=Math.min(base,Math.max(0,Number(promo.value||0)));
  discount=Math.min(base,Math.max(0,discount));
  return {baseAmount:base,discount,amount:Math.max(0,base-discount)};
}
async function ypFindPromo(code,planId){
  const id=ypPromoId(code);
  if(!id)return {promo:null,quote:null};
  const snap=await db.collection("yaadPagePromoCodes").doc(id).get();
  if(!snap.exists)throw new Error("Promo code not found.");
  const promo={id:snap.id,...snap.data()};
  if(promo.active===false)throw new Error("This promo code is disabled.");
  if(promo.expiresAt&&Number(promo.expiresAt)<=Date.now())throw new Error("This promo code has expired.");
  if(Number(promo.maxUses||0)>0&&Number(promo.uses||0)+Number(promo.reserved||0)>=Number(promo.maxUses))throw new Error("This promo code has reached its usage limit.");
  if(Array.isArray(promo.planIds)&&promo.planIds.length&&!promo.planIds.includes(planId))throw new Error("This code is not valid for the selected plan.");
  if(!["percent","fixed","free"].includes(promo.type))throw new Error("This promo code is not configured correctly.");
  return {promo,quote:ypPromoQuote({price:YP_PLANS[planId].price},promo)};
}
app.get("/api/yaadpage/config",async(req,res)=>{
  try{
    const snap=await db.collection("yaadPageSettings").doc("main").get();
    const settings=snap.exists?snap.data():{};
    res.set("Cache-Control","no-store");
    res.json({brand:"YaadPage",domain:"yaadpage.online",plans:Object.values(YP_PLANS),templates:YP_TEMPLATES,howItWorksVideoId:ypYoutubeId(settings.howItWorksYoutubeUrl||"")});
  }catch(e){res.status(500).json({error:"Could not load website settings."})}
});

app.get("/api/yaadpage/promo/validate",async(req,res)=>{
  try{
    const planId=String(req.query.plan||"story"),plan=YP_PLANS[planId];
    if(!plan)return res.status(400).json({error:"Choose a valid plan first."});
    const {promo,quote}=await ypFindPromo(req.query.code,planId);
    if(!promo)return res.status(400).json({error:"Enter a promo code."});
    res.json({ok:true,code:promo.id,type:promo.type,discount:quote.discount,baseAmount:quote.baseAmount,amount:quote.amount,isFree:quote.amount===0});
  }catch(e){res.status(400).json({error:e.message||"Promo code could not be checked."})}
});

app.get("/api/yaadpage/slug/check",async(req,res)=>{
  try{
    const slug=ypSlug(req.query.slug);
    if(slug.length<3)return res.json({available:false,slug,reason:"Use at least 3 letters or numbers."});
    if(["admin","api","create","success","assets","pricing","about","favicon.ico","robots.txt","sitemap.xml"].includes(slug))return res.json({available:false,slug,reason:"This address is reserved."});
    const [page,lock]=await Promise.all([
      db.collection("yaadPages").doc(slug).get(),
      db.collection("yaadPageSlugLocks").doc(slug).get()
    ]);
    const locked=lock.exists && Number(lock.data().expiresAt||0)>Date.now();
    res.json({available:!page.exists&&!locked,slug,reason:page.exists?"This address is already in use.":locked?"Someone is currently creating this address.":""});
  }catch(e){res.status(500).json({error:"Could not check this address."})}
});

app.post("/api/yaadpage/orders/create",async(req,res)=>{
  try{
    const body=req.body||{};
    const slug=ypSlug(body.slug);
    const templateId=String(body.templateId||"");
    const plan=YP_PLANS[String(body.planId||"story")];
    const recipientName=ypSafeText(body.recipientName,70);
    const senderName=ypSafeText(body.senderName,70);
    const message=ypSafeText(body.message,1200);
    const email=ypSafeText(body.email,160).toLowerCase();
    const phone=ypSafeText(body.phone,20).replace(/[^0-9+ -]/g,"");
    const title=ypSafeText(body.title,90);
    const eventDate=String(body.eventDate||"").slice(0,10);
    if(slug.length<3)return res.status(400).json({error:"Please choose a page address with at least 3 characters."});
    if(["admin","api","create","success","assets","pricing","about"].includes(slug))return res.status(400).json({error:"That page address is reserved."});
    if(!YP_OCCASIONS.has(templateId)||!plan)return res.status(400).json({error:"Please choose a valid design and plan."});
    if(!recipientName||!senderName||message.length<8)return res.status(400).json({error:"Add the recipient, your name and a message of at least 8 characters."});
    if(!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:"Enter a valid email address."});
    if(phone.replace(/\D/g,"").length<10)return res.status(400).json({error:"Enter a valid phone number."});
    const currentPhotos=Array.isArray(body.photoNames)?body.photoNames.slice(0,plan.photos).map(x=>ypSafeText(x,80)):[];
    if(Array.isArray(body.photoNames)&&body.photoNames.length>plan.photos)return res.status(400).json({error:`The ${plan.name} plan allows up to ${plan.photos} photo(s).`});
    if(currentPhotos.length>0&&!R2_READY)return res.status(503).json({error:"Photo storage is not configured yet. Remove the photos or configure Cloudflare R2."});
    const promoCode=ypPromoId(body.promoCode||"");
    let promo=null,quote=ypPromoQuote(plan,{type:"none",value:0});
    if(promoCode){const found=await ypFindPromo(promoCode,plan.id);promo=found.promo;quote=found.quote;}
    const isFree=quote.amount===0;
    if(!isFree&&(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET))return res.status(503).json({error:"Payment is not configured yet."});
    const rzOrder=isFree?null:await razorpay.orders.create({amount:quote.amount*100,currency:"INR",receipt:`yp_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,notes:{slug,templateId,planId:plan.id,promoCode:promoCode||""}});
    const orderId=rzOrder?.id||`ypfree_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
    const pageRef=db.collection("yaadPages").doc(slug);
    const lockRef=db.collection("yaadPageSlugLocks").doc(slug);
    const orderRef=db.collection("yaadPageOrders").doc(orderId);
    const expiresAt=Date.now()+YP_SLUG_LOCK_MS;
    await db.runTransaction(async tx=>{
      const reads=[tx.get(pageRef),tx.get(lockRef)];
      const promoRef=promoCode?db.collection("yaadPagePromoCodes").doc(promoCode):null;
      if(promoRef)reads.push(tx.get(promoRef));
      const results=await Promise.all(reads);
      const pageSnap=results[0],lockSnap=results[1],promoSnap=promoRef?results[2]:null;
      const lockLive=lockSnap.exists&&Number(lockSnap.data().expiresAt||0)>Date.now();
      if(pageSnap.exists||lockLive)throw new Error("This page address is no longer available. Please choose another one.");
      if(promoRef){
        if(!promoSnap.exists)throw new Error("Promo code no longer exists. Please apply it again.");
        const currentPromo=promoSnap.data();
        if(currentPromo.active===false||(currentPromo.expiresAt&&Number(currentPromo.expiresAt)<=Date.now()))throw new Error("Promo code is no longer active.");
        if(Number(currentPromo.maxUses||0)>0&&Number(currentPromo.uses||0)+Number(currentPromo.reserved||0)>=Number(currentPromo.maxUses))throw new Error("Promo code has reached its usage limit.");
        if(Array.isArray(currentPromo.planIds)&&currentPromo.planIds.length&&!currentPromo.planIds.includes(plan.id))throw new Error("This code is not valid for the selected plan.");
        const freshQuote=ypPromoQuote(plan,currentPromo);
        if(freshQuote.amount!==quote.amount)throw new Error("Promo code changed while creating your order. Please apply it again.");
        tx.update(promoRef,{reserved:FieldValue.increment(1)});
      }
      tx.set(lockRef,{orderId,expiresAt,createdAt:FieldValue.serverTimestamp()});
      tx.set(orderRef,{
        orderId,slug,templateId,occasion:templateId,planId:plan.id,amount:quote.amount,listPrice:quote.baseAmount,discount:quote.discount,
        promoCode:promoCode||"",paymentMode:isFree?"promo-free":"razorpay",
        recipientName,senderName,title:title||`${recipientName}, this is for you`,message,eventDate,
        email,phone,photoNames:currentPhotos,photos:[],status:"pending",createdAt:FieldValue.serverTimestamp(),lockExpiresAt:expiresAt
      });
    });
    res.json({ok:true,orderId,amount:isFree?0:rzOrder.amount,currency:"INR",key:isFree?"":process.env.RAZORPAY_KEY_ID,slug,uploadToken:ypUploadToken(orderId),isFree,discount:quote.discount,baseAmount:quote.baseAmount,plan:{id:plan.id,name:plan.name,price:quote.amount,listPrice:quote.baseAmount,photos:plan.photos}});
  }catch(e){
    const msg=String(e.message||"");
    res.status(msg.includes("no longer available")?409:400).json({error:msg||"Could not create the order."});
  }
});

app.post("/api/yaadpage/orders/:orderId/upload",async(req,res)=>{
  try{
    if(!R2_READY)return res.status(503).json({error:"Photo storage is not configured yet."});
    const orderId=String(req.params.orderId||"");
    if(!ypVerifyUploadToken(req.body?.uploadToken,orderId))return res.status(403).json({error:"Upload session expired. Please restart your order."});
    const ref=db.collection("yaadPageOrders").doc(orderId);
    const snap=await ref.get();
    if(!snap.exists||snap.data().status!=="pending")return res.status(404).json({error:"Order not found or no longer active."});
    const order=snap.data(),plan=YP_PLANS[order.planId];
    if((order.photos||[]).length>=plan.photos)return res.status(400).json({error:`Your plan allows up to ${plan.photos} photo(s).`});
    const contentType=String(req.body?.contentType||"").toLowerCase();
    const raw=String(req.body?.dataBase64||"").replace(/^data:image\/(?:jpeg|png|webp);base64,/i,"");
    if(!raw||raw.length>2_800_000)return res.status(413).json({error:"Each photo must be smaller than 2 MB."});
    const buffer=Buffer.from(raw,"base64");
    if(buffer.length>=2_000_000)return res.status(413).json({error:"Each photo must be smaller than 2 MB."});
    const ext=ypImageType(buffer,contentType);
    if(!ext)return res.status(400).json({error:"Use a valid JPG, PNG or WebP image."});
    const assetId=crypto.randomBytes(12).toString("hex");
    const key=`yaadpage/${orderId}/${assetId}.${ext}`;
    await r2.send(new PutObjectCommand({Bucket:process.env.R2_BUCKET,Key:key,Body:buffer,ContentType:contentType,CacheControl:"public, max-age=31536000, immutable"}));
    const photo={id:assetId,key,contentType,fileName:ypSafeText(req.body?.fileName||`photo.${ext}`,100)};
    await ref.update({photos:FieldValue.arrayUnion(photo)});
    res.json({ok:true,photo:{id:assetId,contentType}});
  }catch(e){res.status(500).json({error:e.message||"Photo upload failed."})}
});

app.post("/api/yaadpage/orders/free/complete",async(req,res)=>{
  try{
    const orderId=String(req.body?.orderId||"");
    if(!orderId.startsWith("ypfree_")||!ypVerifyUploadToken(req.body?.uploadToken,orderId))return res.status(403).json({error:"This free order session is invalid or expired."});
    const ref=db.collection("yaadPageOrders").doc(orderId),snap=await ref.get();
    if(!snap.exists)return res.status(404).json({error:"Order not found."});
    const order=snap.data();
    if(order.status==="free")return res.json({ok:true,slug:order.slug});
    if(order.status!=="pending"||order.paymentMode!=="promo-free"||Number(order.amount)!==0)return res.status(409).json({error:"This order is not eligible for free publishing."});
    const plan=YP_PLANS[order.planId];
    if(!plan||(order.photos||[]).length>plan.photos)return res.status(400).json({error:"Order details are invalid."});
    const pageRef=db.collection("yaadPages").doc(order.slug),lockRef=db.collection("yaadPageSlugLocks").doc(order.slug);
    const promoRef=order.promoCode?db.collection("yaadPagePromoCodes").doc(ypPromoId(order.promoCode)):null;
    const now=Date.now();
    await db.runTransaction(async tx=>{
      const reads=[tx.get(ref),tx.get(pageRef),tx.get(lockRef)];
      if(promoRef)reads.push(tx.get(promoRef));
      const r=await Promise.all(reads),freshOrder=r[0],freshPage=r[1],freshLock=r[2],freshPromo=promoRef?r[3]:null;
      if(freshOrder.data()?.status==="free")return;
      if(freshOrder.data()?.status!=="pending"||freshPage.exists)throw new Error("This free order is no longer active.");
      if(!freshLock.exists||freshLock.data().orderId!==orderId)throw new Error("Page address reservation expired. Please contact support.");
      if(promoRef&&(!freshPromo?.exists||Number(freshPromo.data().reserved||0)<1))throw new Error("Promo reservation could not be verified. Please contact support.");
      const current=freshOrder.data(),expiresAt=now+365*24*60*60*1000;
      tx.set(pageRef,{slug:current.slug,templateId:current.templateId,occasion:current.occasion,recipientName:current.recipientName,senderName:current.senderName,title:current.title,message:current.message,eventDate:current.eventDate||"",planId:current.planId,photos:(current.photos||[]).map(p=>({id:p.id,key:p.key,contentType:p.contentType})),published:true,createdAt:FieldValue.serverTimestamp(),expiresAt});
      tx.update(ref,{status:"free",completedAt:FieldValue.serverTimestamp(),expiresAt});
      tx.delete(lockRef);
      if(promoRef)tx.update(promoRef,{reserved:FieldValue.increment(-1),uses:FieldValue.increment(1)});
    });
    res.json({ok:true,slug:order.slug});
  }catch(e){res.status(400).json({error:e.message||"Could not publish this free page."})}
});

app.post("/api/yaadpage/orders/verify",async(req,res)=>{
  try{
    const {razorpay_order_id,razorpay_payment_id,razorpay_signature}=req.body||{};
    if(!razorpay_order_id||!razorpay_payment_id||!razorpay_signature)return res.status(400).json({error:"Incomplete payment response."});
    const ref=db.collection("yaadPageOrders").doc(String(razorpay_order_id));
    const snap=await ref.get();
    if(!snap.exists)return res.status(404).json({error:"Order not found."});
    const order=snap.data();
    if(order.status==="paid")return res.json({ok:true,slug:order.slug});
    if(order.status!=="pending"||order.orderId!==razorpay_order_id)return res.status(409).json({error:"This order is no longer active."});
    const body=`${razorpay_order_id}|${razorpay_payment_id}`;
    const expected=crypto.createHmac("sha256",process.env.RAZORPAY_KEY_SECRET).update(body).digest("hex");
    const got=String(razorpay_signature);
    if(Buffer.byteLength(expected)!==Buffer.byteLength(got)||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(got)))return res.status(400).json({error:"Payment signature verification failed."});
    const payment=await razorpay.payments.fetch(razorpay_payment_id);
    if(payment.order_id!==razorpay_order_id || payment.status!=="captured" || Number(payment.amount)!==Number(order.amount)*100 || payment.currency!=="INR"){
      return res.status(409).json({error:"Payment is not yet captured for the expected amount. Please contact support if money was deducted."});
    }
    const plan=YP_PLANS[order.planId];
    if(!plan||(order.photos||[]).length>plan.photos)return res.status(400).json({error:"Order details are invalid."});
    const pageRef=db.collection("yaadPages").doc(order.slug);
    const lockRef=db.collection("yaadPageSlugLocks").doc(order.slug);
    const now=Date.now();
    await db.runTransaction(async tx=>{
      const reads=[tx.get(ref),tx.get(pageRef),tx.get(lockRef)];
      const promoRef=order.promoCode?db.collection("yaadPagePromoCodes").doc(ypPromoId(order.promoCode)):null;
      if(promoRef)reads.push(tx.get(promoRef));
      const r=await Promise.all(reads),freshOrder=r[0],freshPage=r[1],freshLock=r[2],freshPromo=promoRef?r[3]:null;
      if(freshOrder.data()?.status==="paid")return;
      if(freshPage.exists)return;
      if(!freshLock.exists||freshLock.data().orderId!==razorpay_order_id)throw new Error("Page address reservation expired. Contact support with your payment ID.");
      if(promoRef&&(!freshPromo?.exists||Number(freshPromo.data().reserved||0)<1))throw new Error("Promo reservation could not be verified. Contact support with your payment ID.");
      const expiresAt=now+365*24*60*60*1000;
      const current=freshOrder.data();
      tx.set(pageRef,{
        slug:current.slug,templateId:current.templateId,occasion:current.occasion,
        recipientName:current.recipientName,senderName:current.senderName,title:current.title,
        message:current.message,eventDate:current.eventDate||"",planId:current.planId,
        photos:(current.photos||[]).map(p=>({id:p.id,key:p.key,contentType:p.contentType})),
        published:true,createdAt:FieldValue.serverTimestamp(),expiresAt
      });
      tx.update(ref,{status:"paid",paymentId:razorpay_payment_id,paidAt:FieldValue.serverTimestamp(),expiresAt});
      tx.delete(lockRef);
      if(promoRef)tx.update(promoRef,{reserved:FieldValue.increment(-1),uses:FieldValue.increment(1)});
    });
    res.json({ok:true,slug:order.slug});
  }catch(e){res.status(500).json({error:e.message||"Payment verification failed."})}
});

app.get("/api/yaadpage/pages/:slug",async(req,res)=>{
  try{
    const slug=ypSlug(req.params.slug);
    const d=await db.collection("yaadPages").doc(slug).get();
    if(!d.exists||d.data().published!==true)return res.status(404).json({error:"This memory page was not found."});
    const page=d.data();
    if(page.expiresAt&&Number(page.expiresAt)<Date.now())return res.status(410).json({error:"This memory page has expired."});
    res.set("Cache-Control","public, max-age=30, stale-while-revalidate=60");
    res.json({page:ypPublicPage(page)});
  }catch(e){res.status(500).json({error:"Could not load this memory page."})}
});

app.get("/api/yaadpage/assets/:slug/:assetId",async(req,res)=>{
  try{
    if(!R2_READY)return res.status(503).end();
    const slug=ypSlug(req.params.slug),assetId=String(req.params.assetId||"");
    const d=await db.collection("yaadPages").doc(slug).get();
    if(!d.exists||d.data().published!==true)return res.status(404).end();
    const page=d.data();
    if(page.expiresAt&&Number(page.expiresAt)<Date.now())return res.status(410).end();
    const photo=(page.photos||[]).find(p=>p.id===assetId);
    if(!photo)return res.status(404).end();
    const object=await r2.send(new GetObjectCommand({Bucket:process.env.R2_BUCKET,Key:photo.key}));
    res.setHeader("Content-Type",object.ContentType||photo.contentType||"application/octet-stream");
    res.setHeader("X-Content-Type-Options","nosniff");
    res.setHeader("Cache-Control","public, max-age=86400, stale-while-revalidate=604800");
    if(object.ContentLength)res.setHeader("Content-Length",object.ContentLength);
    if(object.Body&&typeof object.Body.pipe==="function")object.Body.pipe(res);
    else res.end(Buffer.from(await object.Body.transformToByteArray()));
  }catch(e){res.status(404).end()}
});

app.get("/api/yaadpage/admin/data",requireAdmin,async(req,res)=>{
  try{
    const [pages,orders,promoCodes,settings]=await Promise.all([
      listCol("yaadPages"),listCol("yaadPageOrders"),listCol("yaadPagePromoCodes"),
      db.collection("yaadPageSettings").doc("main").get()
    ]);
    const paid=orders.filter(o=>["paid","free"].includes(o.status));
    res.json({
      pages:pages.sort((a,b)=>Number(b.createdAt?._seconds||0)-Number(a.createdAt?._seconds||0)),
      orders:orders.sort((a,b)=>Number(b.createdAt?._seconds||0)-Number(a.createdAt?._seconds||0)),
      promoCodes:promoCodes.sort((a,b)=>String(a.code||a.id).localeCompare(String(b.code||b.id))),
      settings:settings.exists?settings.data():{},
      stats:{pages:pages.length,active:pages.filter(p=>p.published&&(!p.expiresAt||p.expiresAt>Date.now())).length,orders:orders.length,paid:paid.length,pending:orders.filter(o=>o.status==="pending").length,revenue:paid.reduce((n,o)=>n+Number(o.amount||0),0)}
    });
  }catch(e){res.status(500).json({error:e.message})}
});

app.post("/api/yaadpage/admin/promos",requireAdmin,async(req,res)=>{
  try{
    const code=ypPromoId(req.body?.code),type=String(req.body?.type||"percent");
    const value=Number(req.body?.value||0),rawMaxUses=Number(req.body?.maxUses||0),maxUses=Number.isFinite(rawMaxUses)?Math.max(0,Math.floor(rawMaxUses)):NaN;
    const expiresAt=req.body?.expiresAt?Date.parse(`${String(req.body.expiresAt).slice(0,10)}T23:59:59.999Z`):0;
    if(code.length<3)return res.status(400).json({error:"Promo code must contain at least 3 letters or numbers."});
    if(!Number.isFinite(maxUses))return res.status(400).json({error:"Maximum uses must be a valid number."});
    if(!["percent","fixed","free"].includes(type))return res.status(400).json({error:"Choose a valid discount type."});
    if(type==="percent"&&(value<=0||value>100))return res.status(400).json({error:"Percentage must be between 1 and 100."});
    if(type==="fixed"&&(value<=0||value>100000))return res.status(400).json({error:"Fixed discount must be greater than ₹0."});
    if(req.body?.expiresAt&&(!Number.isFinite(expiresAt)||expiresAt<=Date.now()))return res.status(400).json({error:"Expiry date must be in the future."});
    const ref=db.collection("yaadPagePromoCodes").doc(code),old=await ref.get();
    if(old.exists)return res.status(409).json({error:"That promo code already exists."});
    const record={code,type,value:type==="free"?100:value,active:true,maxUses,uses:0,reserved:0,expiresAt:expiresAt||0,planIds:Array.isArray(req.body?.planIds)?req.body.planIds.filter(x=>YP_PLANS[x]):[],createdAt:FieldValue.serverTimestamp()};
    await ref.set(record);res.json({ok:true,promo:{id:code,...record,createdAt:null}});
  }catch(e){res.status(500).json({error:e.message||"Could not create promo code."})}
});

app.patch("/api/yaadpage/admin/promos/:code",requireAdmin,async(req,res)=>{
  try{
    const code=ypPromoId(req.params.code),ref=db.collection("yaadPagePromoCodes").doc(code),snap=await ref.get();
    if(!snap.exists)return res.status(404).json({error:"Promo code not found."});
    await ref.update({active:!!req.body?.active,updatedAt:FieldValue.serverTimestamp()});res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message})}
});

app.delete("/api/yaadpage/admin/promos/:code",requireAdmin,async(req,res)=>{
  try{
    const code=ypPromoId(req.params.code),ref=db.collection("yaadPagePromoCodes").doc(code),snap=await ref.get();
    if(!snap.exists)return res.status(404).json({error:"Promo code not found."});
    if(Number(snap.data().reserved||0)>0){await ref.update({active:false,updatedAt:FieldValue.serverTimestamp()});return res.json({ok:true,disabled:true,message:"Code has pending orders, so it was disabled instead of deleted."})}
    await ref.delete();res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message})}
});

app.put("/api/yaadpage/admin/settings",requireAdmin,async(req,res)=>{
  try{
    const videoUrl=ypYoutubeId(req.body?.howItWorksYoutubeUrl||"");
    if(req.body?.howItWorksYoutubeUrl&&!videoUrl)return res.status(400).json({error:"Enter a valid YouTube video URL or 11-character video ID."});
    await db.collection("yaadPageSettings").doc("main").set({howItWorksYoutubeUrl:videoUrl,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    res.json({ok:true,howItWorksVideoId:videoUrl});
  }catch(e){res.status(500).json({error:e.message})}
});

app.delete("/api/yaadpage/admin/orders/:orderId",requireAdmin,async(req,res)=>{
  try{
    const orderId=String(req.params.orderId||""),ref=db.collection("yaadPageOrders").doc(orderId),snap=await ref.get();
    if(!snap.exists)return res.status(404).json({error:"Order not found."});
    const order=snap.data();
    if(order.status!=="pending")return res.status(409).json({error:"Only unpaid or incomplete orders can be deleted here."});
    const lockRef=db.collection("yaadPageSlugLocks").doc(order.slug);
    const promoRef=order.promoCode?db.collection("yaadPagePromoCodes").doc(ypPromoId(order.promoCode)):null;
    await db.runTransaction(async tx=>{
      const reads=[tx.get(ref),tx.get(lockRef)];if(promoRef)reads.push(tx.get(promoRef));
      const r=await Promise.all(reads),current=r[0],lock=r[1],promo=promoRef?r[2]:null;
      if(!current.exists)return;
      if(current.data().status!=="pending")throw new Error("Only unpaid or incomplete orders can be deleted here.");
      if(lock.exists&&lock.data().orderId===orderId)tx.delete(lockRef);
      if(promoRef&&promo?.exists&&Number(promo.data().reserved||0)>0)tx.update(promoRef,{reserved:FieldValue.increment(-1)});
      tx.delete(ref);
    });
    if(R2_READY){for(const photo of order.photos||[]){try{await r2.send(new DeleteObjectCommand({Bucket:process.env.R2_BUCKET,Key:photo.key}))}catch{}}}
    res.json({ok:true});
  }catch(e){res.status(409).json({error:e.message||"Could not delete this order."})}
});

app.patch("/api/yaadpage/admin/pages/:slug",requireAdmin,async(req,res)=>{
  try{
    const slug=ypSlug(req.params.slug),published=!!req.body?.published;
    const ref=db.collection("yaadPages").doc(slug),snap=await ref.get();
    if(!snap.exists)return res.status(404).json({error:"Page not found."});
    await ref.update({published,updatedAt:FieldValue.serverTimestamp()});
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message})}
});

app.delete("/api/yaadpage/admin/pages/:slug",requireAdmin,async(req,res)=>{
  try{
    const slug=ypSlug(req.params.slug),ref=db.collection("yaadPages").doc(slug),snap=await ref.get();
    if(!snap.exists)return res.status(404).json({error:"Page not found."});
    if(R2_READY){for(const photo of snap.data().photos||[]){try{await r2.send(new DeleteObjectCommand({Bucket:process.env.R2_BUCKET,Key:photo.key}))}catch{}}}
    await ref.delete();
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message})}
});


ensureSeeds().catch(()=>{});
module.exports=app;
