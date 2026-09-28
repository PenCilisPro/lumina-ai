"use strict";
const shared = require("../server/shared");

module.exports = async function handler(req, res) {
  try {
    const key = shared.getApiKey();
    if (!key) { shared.sendJSON(res, 500, { error: { message: "no key" } }); return; }
    const r = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: { "Authorization": "Bearer " + key }
    });
    shared.sendJSON(res, 200, await r.json());
  } catch (e) {
    shared.sendJSON(res, 500, { error: { message: String(e) } });
  }
};
