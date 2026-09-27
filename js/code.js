/* Lumina AI — Lumina Code view: a Claude Code–style terminal session.
   Exclusive models: "lumina-code" (agentic coding) and "lumina-guard"
   (cybersecurity). Both are routed by server/server.js; the upstream
   base models are an implementation detail never shown in the UI. */
(function () {
  "use strict";
  window.LM = window.LM || {};

  const ui = LM.ui;
  const K_SESSION = "lumina.code.session.v1";

  const code = {
    visible: false,
    generating: false,
    controller: null,
    session: { messages: [] },
    history: [],
    histIdx: -1
  };

  let els = {};
  let streamQueued = false;

  function settings() { return LM.storage.getSettings(); }

  function activeModelId() {
    return settings().code.model === "guard" ? "lumina-guard" : "lumina-code";
  }
  function activeModelName() {
    return settings().code.model === "guard" ? "Lumina Guard" : "Lumina Code 1.0";
  }

  /* ---------------- session persistence ---------------- */

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(K_SESSION) || "{}");
      code.session = s && Array.isArray(s.messages) ? s : { messages: [] };
    } catch (e) {
      code.session = { messages: [] };
    }
    code.history = code.session.messages
      .filter(function (m) { return m.role === "user"; })
      .map(function (m) { return m.content; });
  }

  function save() {
    try {
      const trimmed = code.session.messages.slice(-60);
      localStorage.setItem(K_SESSION, JSON.stringify({ messages: trimmed }));
    } catch (e) { /* storage full — session stays in memory */ }
  }

  /* ---------------- rendering ---------------- */

  function esc(s) { return ui.escapeHtml(s); }

  function scrollBottom() {
    els.output.scrollTop = els.output.scrollHeight;
  }

  function sysLine(text) {
    const div = document.createElement("div");
    div.className = "term-sys";
    div.innerHTML = '<span class="term-sys-icon">ℹ</span> ' + esc(text);
    els.output.appendChild(div);
    scrollBottom();
    return div;
  }

  function appendUser(text) {
    const w = els.output.querySelector(".term-welcome");
    if (w) w.remove();
    const div = document.createElement("div");
    div.className = "term-user";
    div.innerHTML =
      '<span class="term-prompt">❯</span>' +
      '<span class="term-user-text">' + esc(text) + "</span>";
    els.output.appendChild(div);
    scrollBottom();
    return div;
  }

  function appendAssistant(msg) {
    const div = document.createElement("div");
    div.className = "term-msg";
    div.innerHTML = '<div class="term-msg-content"></div>';
    els.output.appendChild(div);
    renderInto(div, msg);
    scrollBottom();
    return div;
  }

  function buildInner(msg) {
    let html = "";

    if (msg.reasoning) {
      const open = msg.streaming && !msg.content ? " open" : "";
      const label = msg.content
        ? "Thought for " + Math.max(1, Math.round((msg.thinkMs || 0) / 1000)) + "s"
        : "Thinking…";
      html +=
        '<details class="term-think"' + open + ">" +
          "<summary>✻ " + esc(label) + "</summary>" +
          '<div class="term-think-body">' + esc(msg.reasoning) + "</div>" +
        "</details>";
    }

    if (msg.streaming && !msg.content && !msg.reasoning) {
      html += '<div class="term-thinking">✻ Thinking<span class="dots"><span>.</span><span>.</span><span>.</span></span></div>';
    }

    if (msg.content) {
      html += LM.markdown.render(msg.content);
      if (msg.streaming) html += '<span class="stream-cursor" aria-hidden="true"></span>';
    }

    if (msg.stopped && !msg.streaming) {
      html += '<div class="term-sys">✻ Interrupted by user</div>';
    }

    if (msg.error) {
      html += '<div class="term-error">✗ ' + esc(msg.error.title) +
        (msg.error.detail ? " — " + esc(msg.error.detail) : "") + "</div>";
    }

    return html;
  }

  function renderInto(el, msg) {
    el.querySelector(".term-msg-content").innerHTML = buildInner(msg);
    scrollBottom();
  }

  function schedule(el, msg) {
    if (streamQueued) return;
    streamQueued = true;
    const render = function () {
      streamQueued = false;
      if (el.isConnected) renderInto(el, msg);
      if (msg.streaming) schedule(el, msg);
    };
    requestAnimationFrame(render);
  }

  function renderWelcome() {
    if (code.session.messages.length) return;
    els.output.innerHTML =
      '<div class="term-welcome">' +
        '<div class="term-welcome-title">✻ Welcome to Lumina Code</div>' +
        '<div class="term-welcome-sub">Your agentic coding assistant — build, debug, refactor, explain.</div>' +
        '<div class="term-welcome-sub">Type /help for commands. Switch models with the pills above.</div>' +
      "</div>";
  }

  function refreshModelPills() {
    const active = settings().code.model;
    els.pills.forEach(function (p) {
      p.classList.toggle("active", p.dataset.codeModel === active);
      p.setAttribute("aria-pressed", p.dataset.codeModel === active ? "true" : "false");
    });
    els.statusModel.textContent = activeModelName();
  }

  /* ---------------- commands & sending ---------------- */

  function handleCommand(text) {
    const cmd = text.trim().split(/\s+/)[0].toLowerCase();
    if (cmd === "/clear") {
      code.session.messages = [];
      els.output.innerHTML = "";
      save();
      renderWelcome();
      sysLine("Session cleared.");
    } else if (cmd === "/help") {
      sysLine("Commands: /clear — clear this session · /model — show the active model · /help — this help. Anything else is sent to the model.");
    } else if (cmd === "/model") {
      sysLine("Active model: " + activeModelName() + ". Switch with the pills in the header.");
    } else {
      sysLine("Unknown command " + cmd + " — try /help");
    }
  }

  function buildPayload() {
    const cap = LM.config.contextMessages || 30;
    return code.session.messages
      .filter(function (m) {
        return !m.error && typeof m.content === "string" && m.content.trim() !== "";
      })
      .slice(-cap)
      .map(function (m) { return { role: m.role, content: m.content }; });
  }

  async function send(text) {
    if (code.generating) return;

    if (text.charAt(0) === "/") { handleCommand(text); return; }

    code.history.push(text);
    code.histIdx = -1;
    code.session.messages.push({ role: "user", content: text });
    appendUser(text);
    save();

    const msg = { role: "assistant", content: "", streaming: true };
    code.session.messages.push(msg);
    const el = appendAssistant(msg);
    setGenerating(true);

    code.controller = new AbortController();
    try {
      await LM.ai.stream({
        messages: buildPayload(),
        model: activeModelId(),
        thinking: settings().ai.thinking,
        temperature: settings().ai.temperature,
        maxTokens: LM.config.maxTokens,
        stream: true,
        signal: code.controller.signal,
        onDelta: function (t) {
          if (!msg.content && msg.reasoning) {
            msg.thinkMs = Date.now() - (msg.thinkStart || Date.now());
          }
          msg.content += t;
          schedule(el, msg);
        },
        onReason: function (t) {
          if (!msg.reasoning) msg.thinkStart = Date.now();
          msg.reasoning = (msg.reasoning || "") + t;
          schedule(el, msg);
        },
        onStatus: function (s) {
          if (s === "upstream_error") msg.upstreamError = true;
        }
      });
      msg.streaming = false;
      if (!msg.content && msg.upstreamError) {
        msg.error = {
          title: "The backend reported an error mid-request.",
          detail: "The AI provider failed while streaming. Try again."
        };
      } else if (!msg.content) {
        msg.error = { title: "Empty response", detail: "The model returned an empty response. Try again." };
      }
    } catch (err) {
      msg.streaming = false;
      if (err.name === "AbortError") {
        msg.stopped = true;
        if (!msg.content && !msg.reasoning) {
          msg.error = { title: "Interrupted.", detail: "You stopped this response before any output." };
        }
      } else {
        const d = err.luminaDescribe || LM.ai.describeError(err);
        msg.error = d.friendly;
      }
    } finally {
      code.controller = null;
      setGenerating(false);
      if (msg.reasoning && !msg.thinkMs) {
        msg.thinkMs = Date.now() - (msg.thinkStart || Date.now());
      }
      renderInto(el, msg);
      save();
      scrollBottom();
    }
  }

  function stop() {
    if (code.controller) code.controller.abort();
  }

  function setGenerating(on) {
    code.generating = on;
    els.term.classList.toggle("generating", on);
    els.hint.textContent = on ? "esc to interrupt" : "Enter to send · /help for commands";
    els.pills.forEach(function (p) { p.disabled = on; });
  }

  /* ---------------- init ---------------- */

  function setVisible(v) {
    code.visible = v;
    if (v) {
      renderWelcome();
      refreshModelPills();
      scrollBottom();
      setTimeout(function () { els.input.focus(); }, 50);
    }
  }

  function focusInput() { els.input.focus(); }

  function init() {
    els = {
      view: document.getElementById("view-code"),
      term: document.querySelector(".term"),
      output: document.getElementById("code-output"),
      input: document.getElementById("code-input"),
      hint: document.getElementById("code-hint"),
      statusModel: document.getElementById("code-status-model"),
      pills: Array.prototype.slice.call(document.querySelectorAll("[data-code-model]"))
    };

    load();
    renderWelcome();
    refreshModelPills();

    /* replay persisted session into the terminal */
    code.session.messages.forEach(function (m) {
      if (m.role === "user") appendUser(m.content);
      else if (m.role === "assistant") appendAssistant(m);
    });
    scrollBottom();

    els.pills.forEach(function (p) {
      p.addEventListener("click", function () {
        if (code.generating || settings().code.model === p.dataset.codeModel) return;
        LM.storage.updateSection("code", { model: p.dataset.codeModel });
        refreshModelPills();
        sysLine("Switched to " + activeModelName() + ".");
      });
    });

    els.input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        const text = els.input.value.trim();
        if (!text || code.generating) return;
        els.input.value = "";
        send(text);
      } else if (e.key === "ArrowUp" && !els.input.value && code.history.length) {
        e.preventDefault();
        code.histIdx = code.histIdx < 0
          ? code.history.length - 1
          : Math.max(0, code.histIdx - 1);
        els.input.value = code.history[code.histIdx];
      } else if (e.key === "ArrowDown" && code.histIdx >= 0) {
        e.preventDefault();
        code.histIdx = Math.min(code.history.length, code.histIdx + 1);
        els.input.value = code.histIdx >= code.history.length ? "" : code.history[code.histIdx];
      }
    });

    /* esc interrupts generation while the terminal is visible */
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && code.visible && code.generating) {
        e.preventDefault();
        stop();
      }
    });
  }

  code.init = init;
  code.setVisible = setVisible;
  code.focusInput = focusInput;
  code.stop = stop;

  LM.code = code;
})();
