/* Lumina AI — Vercel serverless function: GET /api/health */
"use strict";

const shared = require("../server/shared");

module.exports = async function handler(req, res) {
  shared.sendJSON(res, 200, {
    ok: true,
    provider: "nvidia-nim",
    keyConfigured: !!shared.getApiKey(),
    models: Object.keys(shared.MODELS)
  });
};
