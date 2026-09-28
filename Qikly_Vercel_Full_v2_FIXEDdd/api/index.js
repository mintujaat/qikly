
const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const admin = require("firebase-admin");
const {
  S3Client, PutObjectCommand, GetObjectCommand
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

app.get("/health",(req,res)=>res.json({ok:true,service:"qikly-ebook-api",r2:R2_READY}));

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

ensureSeeds().catch(()=>{});
module.exports=app;
