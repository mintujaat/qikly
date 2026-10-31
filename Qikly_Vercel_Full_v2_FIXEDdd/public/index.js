
const express=require("express"),path=require("path");
const app=express();
const api=require("./api/index.js");
app.use(express.static(__dirname));
app.use(api);
app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"admin.html")));
app.listen(process.env.PORT||3000,()=>console.log("Qikly E-Book Store running"));
