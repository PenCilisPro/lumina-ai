"use strict";
const shared = require("../server/shared");

module.exports = async function handler(req, res) {
  try {
    const key = shared.getApiKey();
    const r = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: { "Authorization": "Bearer " + key }
    });
    const text = await r.text();
    res.writeHead(r.status, { "Content-Type": "application/json" });
    res.end(text);
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(e) }));
  }
};
