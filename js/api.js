/* Lumina AI — API layer.
   The frontend talks to a single backend endpoint (configured in
   js/config.js → backend). The backend holds provider credentials and
   proxies to the real AI provider using an OpenAI chat-completions
   compatible contract (streaming via SSE).

   Unsupported reasoning/temperature settings degrade gracefully: if the
   backend rejects them with a 400, the request is retried without them. */
(function () {
  "use strict";
  window.LM = window.LM || {};

  function resolveBackend() {
    const cfg = LM.config.backend || {};
    const s = LM.storage ? LM.storage.getSettings() : null;
    const override = s && s.connection && s.connection.backendUrl ? s.connection.backendUrl.trim() : "";
    return {
      chatUrl: override || cfg.chatUrl || "",
      testUrl: override ? "" : (cfg.testUrl || "")
    };
  }

  function hasBackend() {
    return !!resolveBackend().chatUrl;
  }

  /* Heuristic: model ids that carry reasoning controls end-to-end. Wrong
     guesses are harmless — unsupported params are retried without them. */
  function looksLikeReasoningModel(modelId) {
    return /(^|\/)(o[134]([-.]|$)|gpt-5|deepseek-r1|qwq|reasoner|thinking|lumina)/i.test(modelId || "");
  }

  function buildHeaders(stream) {
    const h = { "Content-Type": "application/json" };
    if (stream) h["Accept"] = "text/event-stream";
    return h;
  }

  /* Supabase session token for the backend's auth gate (js/auth.js).
     Empty when Supabase isn't configured or there's no session. */
  async function authToken() {
    try {
      if (!LM.auth || !LM.auth.isConfigured()) return "";
      const session = await LM.auth.getSession();
      return session && session.access_token ? session.access_token : "";
    } catch (e) {
      return "";
    }
  }

  function buildBody(opts, flags) {
    const levels = LM.config.thinkingLevels;
    const level = levels[opts.thinking] || levels[LM.config.defaults.thinking] || levels.medium;
    const body = {
      model: opts.model,
      messages: opts.messages,
      stream: !!opts.stream
    };
    if (!flags.noTemperature) body.temperature = opts.temperature;
    if (!flags.noReasoning && level) body.reasoning_effort = level.effort;
    body.max_tokens = opts.maxTokens || LM.config.maxTokens;
    if (opts.web_search) body.web_search = true;
    return body;
  }

  function extractDelta(json) {
    try {
      const ch = json.choices && json.choices[0];
      if (ch && ch.delta && typeof ch.delta.content === "string") return ch.delta.content;
      return "";
    } catch (e) {
      return "";
    }
  }

  function extractReasoning(json) {
    try {
      const ch = json.choices && json.choices[0];
      if (ch && ch.delta && typeof ch.delta.reasoning_content === "string") return ch.delta.reasoning_content;
      return "";
    } catch (e) {
      return "";
    }
  }

  function extractFull(json) {
    try {
      const ch = json.choices && json.choices[0];
      return (ch && ch.message && ch.message.content) || "";
    } catch (e) {
      return "";
    }
  }

  async function readSSE(response, onData) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const step = await reader.read();
      if (step.done) break;
      buffer += decoder.decode(step.value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (line.indexOf("data:") !== 0) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try { onData(JSON.parse(data)); } catch (e) { /* ignore keep-alive fragments */ }
      }
    }
  }

  function httpError(status, body) {
    const e = new Error("HTTP " + status);
    e.status = status;
    e.body = String(body || "").slice(0, 2000);
    e.kind = "http";
    return e;
  }

  async function chatOnce(opts, flags) {
    const backend = resolveBackend();
    if (!backend.chatUrl) {
      const e = new Error("backend not configured");
      e.kind = "no_backend";
      throw e;
    }
    let res;
    try {
      const headers = buildHeaders(!!opts.stream);
      const token = await authToken();
      if (token) headers["Authorization"] = "Bearer " + token;
      res = await fetch(backend.chatUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(buildBody(opts, flags)),
        signal: opts.signal
      });
    } catch (err) {
      if (err && err.name === "AbortError") throw err;
      const e = new Error("network");
      e.kind = "network";
      e.cause = String(err && err.message || err);
      throw e;
    }
    if (!res.ok) {
      let text = "";
      try { text = await res.text(); } catch (e) { /* ignore */ }
      throw httpError(res.status, text);
    }
    return res;
  }

  /**
   * Stream (or fetch) a chat completion from the backend.
   * opts: { messages, model, thinking, temperature, maxTokens, stream, signal, onDelta }
   */
  async function streamChat(opts) {
    let flags = { noReasoning: false, noTemperature: false };

    for (let attempt = 0; attempt < 4; attempt++) {
      let res;
      try {
        res = await chatOnce(opts, flags);
      } catch (e) {
        if ((e.status === 400 || e.status === 422) && attempt < 3) {
          const msg = (e.body || "").toLowerCase();
          let changed = false;
          if (!flags.noReasoning && /reasoning|thinking|effort|budget/.test(msg)) {
            flags.noReasoning = true; changed = true;
          }
          if (!flags.noTemperature && /temperature/.test(msg)) {
            flags.noTemperature = true; changed = true;
          }
          if (changed) continue;
        }
        throw e;
      }

      if (!opts.stream) {
        const data = await res.json();
        const text = extractFull(data);
        if (text) opts.onDelta(text);
        return;
      }
      await readSSE(res, function (json) {
        const t = extractDelta(json);
        if (t) opts.onDelta(t);
        const r = extractReasoning(json);
        if (r && opts.onReason) opts.onReason(r);
        if (json.lumina_status && opts.onStatus) opts.onStatus(json.lumina_status);
      });
      return;
    }
  }

  /* Quick health check: GET testUrl if configured, else a tiny chat ping. */
  async function testBackend(signal) {
    const backend = resolveBackend();
    if (backend.testUrl) {
      const res = await fetch(backend.testUrl, { method: "GET", signal: signal });
      if (!res.ok) throw httpError(res.status, await res.text().catch(function () { return ""; }));
      return { via: "health" };
    }
    await streamChat({
      messages: [{ role: "user", content: "Reply with the single word OK." }],
      model: (LM.config.models && Object.keys(LM.config.models)[0]) || "",
      thinking: "light",
      temperature: 0,
      maxTokens: 64,
      stream: false,
      signal: signal,
      onDelta: function () {}
    });
    return { via: "chat" };
  }

  LM.api = {
    resolveBackend: resolveBackend,
    hasBackend: hasBackend,
    streamChat: streamChat,
    testBackend: testBackend
  };
})();
