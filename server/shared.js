/* ==========================================================================
   Lumina AI — shared chat-proxy logic
   Used by BOTH runtimes:
     - server/server.js   (bundled local dev server, plain Node)
     - api/chat.js        (Vercel serverless function)
   ========================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");
const { Readable, pipeline } = require("stream");

/* Local .env support — on Vercel the key comes from dashboard env vars. */
try {
  const raw = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
  raw.split(/\r?\n/).forEach(function (line) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  });
} catch (e) { /* no .env file — fine */ }

const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";

/* ---------------- model routing ---------------- */

const MODELS = {
  "lumina-comet":   { id: "nvidia/nemotron-3.5-lightning-30b-a3b", reasoning: false },
  "lumina-aurora":  { id: "mistralai/mistral-large-2-instruct",  reasoning: false },
  "lumina-eclipse": { id: "z-ai/glm-5.3-flash",                    reasoning: true },
  /* Lumina Code / Lumina Guard are exclusive to the Lumina Code tab —
     they are not selectable as chat models. The upstream model behind
     each persona is an implementation detail the UI never shows.     */
  "lumina-code":    { id: "moonshotai/kimi-k3",                    reasoning: false, persona: "code" },
  "lumina-guard":   { id: "z-ai/glm-5.3-flash",                    reasoning: false, persona: "guard" }
};

const LUMINA_CODE_PROMPT =
  "You are Lumina Code, an expert agentic coding assistant inside the Lumina AI app.\n" +
  "- Think like a senior engineer: briefly restate the task, plan the approach, then implement.\n" +
  "- Always provide complete, runnable code in fenced blocks with the correct language tag.\n" +
  "- When modifying existing code, show a precise diff or the full updated file.\n" +
  "- Call out edge cases, likely errors, and suggested next steps concisely.\n" +
  "- Prefer standard libraries; explain non-obvious choices with short comments.";

const LUMINA_GUARD_PROMPT =
  "You are Lumina Guard, a cybersecurity expert assistant inside the Lumina AI app.\n" +
  "- You specialize in defensive security: vulnerability analysis, secure code review, threat " +
  "modeling, incident response, network defense, log analysis, malware concepts, and CTF-style learning.\n" +
  "- You assist only with lawful, defensive, and authorized security work. For offensive techniques, " +
  "keep guidance high-level and educational, and decline requests that would enable attacks against " +
  "systems the user does not own or lack written authorization to test.\n" +
  "- Be precise and technical: give concrete commands, code, and configurations with safety notes.\n" +
  "- Structure answers: summary or findings first, then evidence or steps, then remediation.";

const DEEP_THINK_PROMPT =
  "Deep Thinking mode is active. Before answering, reason through the problem thoroughly:\n" +
  "- Restate the problem and identify what is actually being asked.\n" +
  "- Break the problem into steps and work through them carefully.\n" +
  "- Consider alternative approaches and their trade-offs, and double-check your reasoning for errors.\n" +
  "- State assumptions explicitly and address relevant edge cases.\n" +
  "- Only then give a clear, well-structured final answer.";

function getApiKey() {
  return process.env.NVIDIA_API_KEY || "";
}

/* ---------------- web search (keyless DuckDuckGo) ----------------
   Hardened: the fetch target is a fixed, validated https allowlisted
   host; only the query string varies. Result URLs are validated
   (http/https only, no private/loopback/link-local hosts) before they
   are returned as citation links to the client.                    */

const SEARCH_HOST = "html.duckduckgo.com";

function isPublicHttpUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return false;
    if (/^(127|10)\./.test(h)) return false;
    if (/^192\.168\./.test(h)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    if (/^169\.254\./.test(h)) return false;
    if (/^0\.0\.0\.0$/.test(h) || /^::1$/.test(h)) return false;
    return true;
  } catch (e) {
    return false;
  }
}

function decodeEntities(s) {
  return String(s)
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, " ");
}

function unwrapDDGUrl(href) {
  try {
    let u = href;
    const m = u.match(/[?&]uddg=([^&]+)/);
    if (m) u = decodeURIComponent(m[1]);
    if (u.startsWith("//")) u = "https:" + u;
    return u;
  } catch (e) {
    return href;
  }
}

async function webSearch(query) {
  const target = new URL("https://" + SEARCH_HOST + "/html/");
  target.searchParams.set("q", String(query).slice(0, 400));
  if (target.protocol !== "https:" || target.hostname !== SEARCH_HOST) {
    return []; /* defensive: never fetch anything but the allowlisted host */
  }

  const res = await fetch(target, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Accept": "text/html"
    },
    signal: AbortSignal.timeout(9000),
    redirect: "follow"
  });
  if (!res.ok) return [];
  const htmlText = await res.text();

  const titles = [];
  const linkRe = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of htmlText.matchAll(linkRe)) {
    if (titles.length >= 6) break;
    const url = unwrapDDGUrl(m[1]);
    if (!isPublicHttpUrl(url)) continue;
    titles.push({ url: url, title: decodeEntities(m[2]).trim() });
  }

  const snippets = [];
  const snipRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of htmlText.matchAll(snipRe)) {
    if (snippets.length >= 6) break;
    snippets.push(decodeEntities(m[1]).trim());
  }

  return titles.map(function (t, i) {
    return { title: t.title, url: t.url, snippet: snippets[i] || "" };
  }).filter(function (r) { return r.title && r.url; });
}

function formatSearchBlock(query, results) {
  let block =
    "Web search results for \"" + query + "\" (retrieved " + new Date().toUTCString() + "):\n\n";
  results.forEach(function (r, i) {
    block += "[" + (i + 1) + "] " + r.title + "\n" + r.url + "\n" + r.snippet + "\n\n";
  });
  if (!results.length) block += "(No results found.)\n\n";
  block +=
    "Use these results to answer the user's latest message. Citation format rules — follow them exactly:\n" +
    "1. NEVER use special citation brackets like 【2†L1-L3】 or [2†source]. Only standard markdown links.\n" +
    "2. Cite relevant results inline in your answer as markdown links, like: ([Formula1.com](https://...))\n" +
    "3. End with a 'Sources:' section where EVERY entry is a markdown link to the result URL, like:\n" +
    "   - [2026 Spanish Grand Prix report](https://www.formula1.com/...)\n" +
    "If the results are insufficient to answer, say so plainly and list the sources you tried.";
  return block;
}

/* ---------------- shared response helpers ---------------- */

function sendJSON(res, status, obj, cors) {
  const headers = { "Content-Type": "application/json" };
  if (cors) headers["Access-Control-Allow-Origin"] = cors;
  res.writeHead(status, headers);
  res.end(JSON.stringify(obj));
}

function sseHeaders(cors) {
  const headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache"
  };
  if (cors) headers["Access-Control-Allow-Origin"] = cors;
  return headers;
}

function sseStatus(status) {
  return 'data: {"lumina_status":"' + status + '"}\n\n';
}

function injectPersona(payload, persona) {
  if (persona !== "code" && persona !== "guard") return;
  const prompt = persona === "code" ? LUMINA_CODE_PROMPT : LUMINA_GUARD_PROMPT;
  injectSystemPrompt(payload, prompt);
}

/* Prepend a system prompt ahead of any existing one. */
function injectSystemPrompt(payload, prompt) {
  if (payload.messages.length && payload.messages[0].role === "system") {
    payload.messages[0] = {
      role: "system",
      content: prompt + "\n\n" + payload.messages[0].content
    };
  } else {
    payload.messages.unshift({ role: "system", content: prompt });
  }
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let body = "";
    req.on("data", function (c) {
      body += c;
      if (body.length > 5 * 1024 * 1024) { reject(new Error("body too large")); req.destroy(); }
    });
    req.on("end", function () { resolve(body); });
    req.on("error", reject);
  });
}

/* ---------------- main chat proxy ---------------- */

/* opts.cors — optional Access-Control-Allow-Origin value. The Vercel
   functions serve the frontend same-origin and pass nothing; the local
   dev server enables "*" for tooling convenience.                     */
async function proxyChat(parsed, res, opts) {
  const cors = opts && opts.cors;
  const key = getApiKey();
  if (!key) {
    sendJSON(res, 500, {
      error: { message: "NVIDIA_API_KEY is not configured. Set it in server/.env (local) or in your hosting provider's environment variables." }
    }, cors);
    return;
  }

  const target = MODELS[parsed.model] || { id: parsed.model, reasoning: false };
  const payload = {
    model: target.id,
    messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    stream: !!parsed.stream
  };
  if (typeof parsed.temperature === "number") payload.temperature = parsed.temperature;
  if (parsed.max_tokens) payload.max_tokens = parsed.max_tokens;
  if (target.reasoning && parsed.reasoning_effort) payload.reasoning_effort = parsed.reasoning_effort;
  injectPersona(payload, target.persona);

  /* deep think: push reasoning to maximum on reasoning-capable models,
     raise the token budget to fit the longer chain of thought, and
     inject the deep-think instructions (works on every model) */
  if (parsed.deep_think) {
    if (target.reasoning) payload.reasoning_effort = "xhigh";
    if (!payload.max_tokens || payload.max_tokens < 8192) payload.max_tokens = 8192;
    injectSystemPrompt(payload, DEEP_THINK_PROMPT);
  }

  /* web search: run before the model call, inject results as context */
  if (parsed.web_search) {
    let lastUser = "";
    for (let i = payload.messages.length - 1; i >= 0; i--) {
      if (payload.messages[i].role === "user") {
        lastUser = String(payload.messages[i].content || "").replace(/\s+/g, " ").trim().slice(0, 300);
        break;
      }
    }
    if (payload.stream) {
      res.writeHead(200, sseHeaders(cors));
      res.write(sseStatus("searching_web"));
    }
    let results = [];
    try { results = await webSearch(lastUser); } catch (e) { results = []; }
    const block = formatSearchBlock(lastUser, results);
    let insertAt = 0;
    while (insertAt < payload.messages.length && payload.messages[insertAt].role === "system") insertAt++;
    payload.messages.splice(insertAt, 0, { role: "system", content: block });
    if (payload.stream) res.write(sseStatus("search_done"));
  }

  let upstream;
  try {
    upstream = await fetch(NVIDIA_BASE + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": payload.stream ? "text/event-stream" : "application/json",
        "Authorization": "Bearer " + key
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    if (res.headersSent) {
      res.write(sseStatus("upstream_error"));
      res.end();
    } else {
      sendJSON(res, 502, { error: { message: "Could not reach the NVIDIA API: " + (err && err.message || err) } });
    }
    return;
  }

  if (!res.headersSent) {
    const headers = {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
      "Cache-Control": "no-cache"
    };
    if (cors) headers["Access-Control-Allow-Origin"] = cors;
    res.writeHead(upstream.status, headers);
  } else if (!upstream.ok) {
    /* headers already sent for the SSE search path — signal the failure */
    res.write(sseStatus("upstream_error"));
    res.end();
    return;
  }

  if (upstream.body) {
    /* pipeline (not .pipe) forwards upstream errors — a hung NVIDIA stream
       (e.g. body timeout) ends the client response instead of crashing us */
    pipeline(Readable.fromWeb(upstream.body), res, function (err) {
      if (err) {
        try { res.destroy(); } catch (e) { /* already gone */ }
      }
    });
  } else {
    res.end();
  }
}

module.exports = {
  MODELS: MODELS,
  getApiKey: getApiKey,
  sendJSON: sendJSON,
  readBody: readBody,
  proxyChat: proxyChat
};
