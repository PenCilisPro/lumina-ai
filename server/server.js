/* ==========================================================================
   Lumina AI — bundled local dev server (plain Node, zero dependencies)
   --------------------------------------------------------------------------
   Serves the frontend and the /api/chat + /api/health endpoints from one
   origin. The proxy logic itself lives in server/shared.js so the exact
   same code also powers the Vercel serverless functions in api/.

   Run:  npm start   (or: node server/server.js)
   Key:  server/.env (NVIDIA_API_KEY=...) or the NVIDIA_API_KEY env var.
   ========================================================================== */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const shared = require("./shared");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 8399;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
  ".woff2": "font/woff2"
};

/* Static file serving via an explicit allowlist: every servable route is
   hardcoded below and pre-resolved to an absolute path at startup from
   these literals only — request input never reaches the filesystem path,
   so path traversal is impossible by construction. Unknown paths -> 404. */
const STATIC_ROUTES = [
  "/", "index.html",
  "/index.html", "index.html",
  "/login.html", "login.html",
  "/settings.html", "settings.html",
  "/README.md", "README.md",
  "/package.json", "package.json",
  "/assets/lumina-logo.svg", "assets/lumina-logo.svg",
  "/css/main.css", "css/main.css",
  "/css/chat.css", "css/chat.css",
  "/css/settings.css", "css/settings.css",
  "/css/themes.css", "css/themes.css",
  "/css/code.css", "css/code.css",
  "/css/auth.css", "css/auth.css",
  "/js/config.js", "js/config.js",
  "/js/ui.js", "js/ui.js",
  "/js/storage.js", "js/storage.js",
  "/js/themes.js", "js/themes.js",
  "/js/markdown.js", "js/markdown.js",
  "/js/api.js", "js/api.js",
  "/js/ai.js", "js/ai.js",
  "/js/chat.js", "js/chat.js",
  "/js/code.js", "js/code.js",
  "/js/app.js", "js/app.js",
  "/js/settings.js", "js/settings.js",
  "/js/supabase-config.js", "js/supabase-config.js",
  "/js/auth.js", "js/auth.js",
  "/js/vendor/supabase.js", "js/vendor/supabase.js"
];

const ROOT_PREFIX = ROOT.replace(/[\\/]+$/, "") + "/";
const STATIC_PATHS = new Map();
for (let i = 0; i < STATIC_ROUTES.length; i += 2) {
  STATIC_PATHS.set(STATIC_ROUTES[i], ROOT_PREFIX + STATIC_ROUTES[i + 1]);
}

function serveStatic(req, res, pathname) {
  const filePath = STATIC_PATHS.get(pathname);
  if (!filePath) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }
  fs.stat(filePath, function (err, stat) {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*"
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(function (req, res) {
  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  const pathname = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  if (pathname === "/api/health" && req.method === "GET") {
    shared.sendJSON(res, 200, {
      ok: true,
      provider: "nvidia-nim",
      keyConfigured: !!shared.getApiKey(),
      models: Object.keys(shared.MODELS)
    });
    return;
  }

  if (pathname === "/api/chat" && req.method === "POST") {
    shared.readBody(req)
      .then(function (raw) {
        let parsed;
        try { parsed = JSON.parse(raw || "{}"); }
        catch (e) { shared.sendJSON(res, 400, { error: { message: "Invalid JSON body" } }); return; }
        return shared.proxyChat(parsed, res);
      })
      .catch(function (err) {
        try { shared.sendJSON(res, 500, { error: { message: String(err && err.message || err) } }); } catch (e) { /* headers sent */ }
      });
    return;
  }

  if (pathname.startsWith("/api/")) {
    shared.sendJSON(res, 404, { error: { message: "Unknown API endpoint" } });
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, function () {
  console.log("Lumina backend running on http://localhost:" + PORT);
  console.log("  NVIDIA key: " + (shared.getApiKey() ? "configured" : "MISSING — set NVIDIA_API_KEY in server/.env"));
  console.log("  Models: " + Object.keys(shared.MODELS).map(function (k) { return k + " -> " + shared.MODELS[k].id; }).join(", "));
});

/* availability guard: a stray stream error must never take the backend down */
process.on("uncaughtException", function (err) {
  console.error("[uncaught]", err && (err.stack || err.message || err));
});
process.on("unhandledRejection", function (err) {
  console.error("[unhandledRejection]", err && (err.stack || err.message || err));
});
