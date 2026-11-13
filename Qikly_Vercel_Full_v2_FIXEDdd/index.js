const express = require("express");
const path = require("path");
const app = express();
const api = require("./api/index.js");

app.disable("x-powered-by");
app.use(api);
app.use((req, res, next) => {
  if (req.path === "/api" || req.path.startsWith("/api/")) return res.status(404).end();
  return express.static(__dirname, { etag: true, maxAge: "1h", dotfiles: "deny" })(req, res, next);
});
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "admin.html")));
app.get("/:slug", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, "index.html")));

if (require.main === module) {
  app.listen(process.env.PORT || 3000, () => console.log("Mintu Social panel running"));
}
module.exports = app;
