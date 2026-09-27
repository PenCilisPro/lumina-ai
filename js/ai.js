/* Lumina AI — AI orchestration: payload building, friendly error mapping,
   and the connection test (Settings → API). */
(function () {
  "use strict";
  window.LM = window.LM || {};

  const LANG_NAMES = {
    auto: "", english: "English", spanish: "Spanish", french: "French",
    german: "German", portuguese: "Portuguese", chinese: "Chinese", japanese: "Japanese"
  };

  function buildSystemPrompt(settings) {
    const parts = [];
    if (settings.ai.systemPrompt && settings.ai.systemPrompt.trim()) {
      parts.push(settings.ai.systemPrompt.trim());
    }
    const lang = LANG_NAMES[settings.general.language];
    if (lang) parts.push("Always respond in " + lang + ".");
    if (settings.ai.responseLength === "concise") {
      parts.push("Keep responses concise and to the point.");
    } else if (settings.ai.responseLength === "detailed") {
      parts.push("Give thorough, detailed and well-structured responses.");
    }
    return parts.join("\n\n");
  }

  function buildPayload(conversation, settings) {
    const sys = buildSystemPrompt(settings);
    const msgs = [];
    if (sys) msgs.push({ role: "system", content: sys });
    const history = conversation.messages.filter(function (m) {
      return !m.error && typeof m.content === "string" && m.content.trim() !== "";
    });
    const cap = LM.config.contextMessages || 30;
    history.slice(-cap).forEach(function (m) {
      msgs.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
    });
    return msgs;
  }

  function resolveModelId(luminaModelName) {
    const models = LM.config.models || {};
    if (Object.prototype.hasOwnProperty.call(models, luminaModelName)) {
      return models[luminaModelName];
    }
    const first = Object.keys(models)[0];
    return first ? models[first] : "";
  }

  function thinkingLabel(key) {
    const lv = LM.config.thinkingLevels[key];
    return lv ? lv.label : "Medium";
  }

  /* Map any thrown error to a user-friendly message + technical detail. */
  function describeError(err) {
    const generic = {
      title: "Lumina couldn't complete that request.",
      detail: "Check your backend configuration and try again."
    };
    if (!err) return { friendly: generic, tech: "Unknown error" };

    if (err.kind === "no_backend") {
      return {
        friendly: {
          title: "Backend not configured",
          detail: "Set your server endpoint in js/config.js → backend.chatUrl (or Settings → API). The backend holds your provider credentials — the frontend never needs API keys."
        },
        tech: "backend.chatUrl is empty."
      };
    }
    if (err.kind === "network") {
      return {
        friendly: {
          title: "Couldn't reach the Lumina backend",
          detail: "Make sure your backend is running and reachable from this page. If it runs on another port or domain, enable CORS for this origin or serve both from the same origin."
        },
        tech: "fetch() failed: " + (err.cause || "network/CORS error")
      };
    }
    if (err.name === "AbortError") {
      return {
        friendly: { title: "Request timed out", detail: "The backend took too long to respond. Try again, or pick a faster model." },
        tech: "Aborted: timeout or user stop."
      };
    }

    const status = err.status;
    const body = err.body || "";
    const snippet = body.replace(/\s+/g, " ").slice(0, 300);
    let detail = "";

    if (status === 401 || status === 403) {
      detail = /sign in/i.test(body)
        ? "Your session has expired or is missing. Refresh the page to sign in again."
        : "The backend rejected this request. Check the credentials your backend uses for the AI provider.";
    } else if (status === 404) {
      detail = "Endpoint or model not found. Check backend.chatUrl and the model IDs in js/config.js → models.";
    } else if (status === 429) {
      detail = "Rate limit or quota reached on the AI provider. Wait a moment and try again.";
    } else if (status === 408) {
      detail = "The backend took too long to respond. Try again.";
    } else if (status >= 500) {
      detail = "The backend or AI provider is having temporary issues. Try again in a moment.";
    } else if (status) {
      detail = "The backend rejected the request. Review your backend configuration.";
    }

    if (status === 400 && /model/i.test(body) && /not found|does not exist|invalid model|decommissioned/i.test(body)) {
      detail = "The model ID configured for this Lumina model was not found. Check the models section of js/config.js.";
    }

    return {
      friendly: {
        title: status ? "Lumina couldn't complete that request. (HTTP " + status + ")" : generic.title,
        detail: detail || generic.detail
      },
      tech: status ? "HTTP " + status + " — " + (snippet || "(no response body)") : String(err.message || err)
    };
  }

  /* Wrap LM.api.streamChat, enriching errors with friendly descriptions. */
  async function stream(request) {
    try {
      await LM.api.streamChat(request);
    } catch (err) {
      err.luminaDescribe = describeError(err);
      throw err;
    }
  }

  /* Settings → API: "Test Connection" */
  async function testConnection() {
    const t0 = (window.performance && performance.now()) || Date.now();
    const signal = (typeof AbortSignal !== "undefined" && AbortSignal.timeout)
      ? AbortSignal.timeout(10000)
      : undefined;
    const via = await LM.api.testBackend(signal);
    const ms = Math.round(((window.performance && performance.now()) || Date.now()) - t0);
    return { ok: true, ms: ms, via: via.via };
  }

  LM.ai = {
    buildPayload: buildPayload,
    resolveModelId: resolveModelId,
    thinkingLabel: thinkingLabel,
    describeError: describeError,
    stream: stream,
    testConnection: testConnection
  };
})();
