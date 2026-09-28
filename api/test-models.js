"use strict";
const shared = require("../server/shared");

const CANDIDATES = [
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-nano-3-30b-a3b",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "mistralai/mistral-large-2-instruct",
  "z-ai/glm-5.3-flash",
  "moonshotai/kimi-k3",
  "openai/gpt-oss-20b"
];

module.exports = async function handler(req, res) {
  const key = shared.getApiKey();
  if (!key) { shared.sendJSON(res, 500, { error: "no key" }); return; }

  const tests = CANDIDATES.map(function (m) {
    return fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({ model: m, messages: [{ role: "user", content: "Say OK" }], max_tokens: 16, stream: false }),
      signal: AbortSignal.timeout(25000)
    })
    .then(function (r) {
      return r.text().then(function (t) {
        return { model: m, ok: r.ok, status: r.status, snippet: t.slice(0, 120) };
      });
    })
    .catch(function (e) {
      return { model: m, ok: false, status: "timeout", snippet: "" };
    });
  });

  shared.sendJSON(res, 200, { results: await Promise.all(tests) });
};

module.exports.maxDuration = 60;
