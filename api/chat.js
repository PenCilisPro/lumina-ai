/* Lumina AI — Vercel serverless function: POST /api/chat
   Shares its logic with server/shared.js (used by the local dev server). */
"use strict";

const shared = require("../server/shared");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    shared.sendJSON(res, 404, { error: { message: "Use POST /api/chat" } });
    return;
  }

  try {
    const raw = await shared.readBody(req);
    let parsed;
    try { parsed = JSON.parse(raw || "{}"); }
    catch (e) {
      shared.sendJSON(res, 400, { error: { message: "Invalid JSON body" } });
      return;
    }
    await shared.proxyChat(parsed, res);
  } catch (err) {
    try { shared.sendJSON(res, 500, { error: { message: String(err && err.message || err) } }); } catch (e) { /* headers sent */ }
  }
};

module.exports.config = { api: { bodyParser: false } };
