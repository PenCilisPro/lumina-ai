/* Lumina AI — chat area: message rendering, composer, streaming,
   stop generation, regenerate, edit, copy, and the two composer pills
   (model picker popup + thinking popup with slider). */
(function () {
  "use strict";
  window.LM = window.LM || {};

  const ui = LM.ui;

  const chat = {
    conversation: null,
    generating: false,
    controller: null,
    userAborted: false,
    timedOut: false,
    editingMessageId: null,
    modelDD: null,
    thinkPop: null,
    webSearch: false
  };

  let els = {};
  let streamQueued = false;
  let lastStreamRender = 0;

  const ICONS = {
    copy: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    refresh: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>',
    edit: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    sparkle: '<svg class="icon think-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="M5.6 5.6l2.2 2.2"/><path d="M16.2 16.2l2.2 2.2"/><path d="M5.6 18.4l2.2-2.2"/><path d="M16.2 7.8l2.2-2.2"/></svg>'
  };

  /* ================= helpers ================= */

  function settings() { return LM.storage.getSettings(); }

  function scrollToBottom(force) {
    if (force || chat._stickBottom) {
      els.messages.scrollTop = els.messages.scrollHeight;
    }
  }

  function currentModelName() {
    if (chat.conversation && chat.conversation.model) return chat.conversation.model;
    return settings().ai.defaultModel || LM.config.defaults.model;
  }

  function currentThinking() {
    return settings().ai.thinking || LM.config.defaults.thinking;
  }

  function modelOptions() {
    const models = LM.config.models || {};
    const names = Object.keys(models);
    if (!names.length) return [{ value: "", label: "No models configured" }];
    const descs = LM.config.modelDescriptions || {};
    return names.map(function (n) {
      return { value: n, label: n, desc: descs[n] || "" };
    });
  }

  function persist() {
    if (chat.conversation && settings().chat.saveHistory) {
      LM.storage.saveConversation(chat.conversation);
    }
    if (LM.app && LM.app.refreshSidebar) LM.app.refreshSidebar();
  }

  /* ================= rendering ================= */

  function logoSvg(size) {
    return '<svg class="lumina-logo" style="width:' + size + 'px;height:' + size + 'px" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="lumina-g-msg" x1="0%" y1="0%" x2="100%" y2="100%">' +
      '<stop offset="0%" stop-color="#5b8cff"/><stop offset="100%" stop-color="#8b5cf6"/>' +
      "</linearGradient></defs>" +
      '<mask id="lumina-m-msg"><rect width="48" height="48" fill="#fff"/><circle cx="34" cy="14" r="18" fill="#000"/></mask>' +
      '<circle cx="24" cy="26" r="16" fill="url(#lumina-g-msg)" mask="url(#lumina-m-msg)"/></svg>';
  }

  function fmtTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (e) { return ""; }
  }

  function actionsHtml(msg) {
    if (msg.role === "assistant") {
      return (
        '<div class="msg-actions">' +
          '<button type="button" class="msg-action" data-action="copy" data-id="' + msg.id + '" aria-label="Copy response" title="Copy">' + ICONS.copy + "</button>" +
          '<button type="button" class="msg-action" data-action="regenerate" data-id="' + msg.id + '" aria-label="Regenerate response" title="Regenerate">' + ICONS.refresh + "</button>" +
        "</div>"
      );
    }
    return (
      '<div class="msg-actions">' +
        '<button type="button" class="msg-action" data-action="edit" data-id="' + msg.id + '" aria-label="Edit message" title="Edit">' + ICONS.edit + "</button>" +
      "</div>"
    );
  }

  function buildMessageEl(msg) {
    const wrap = document.createElement("div");
    wrap.className = "msg msg-" + msg.role;
    wrap.dataset.id = msg.id;

    const avatar = msg.role === "assistant"
      ? '<div class="msg-avatar">' + logoSvg(18) + "</div>"
      : "";

    const showMeta = settings().chat.showTimestamps;
    const metaBits = [];
    if (msg.role === "assistant") metaBits.push("Lumina");
    if (showMeta) metaBits.push('<span class="msg-time">' + fmtTime(msg.createdAt) + "</span>");
    const metaHtml = metaBits.length
      ? '<div class="msg-meta">' + metaBits.join('<span class="meta-dot">·</span>') + "</div>"
      : "";

    wrap.innerHTML =
      '<div class="msg-row">' +
        avatar +
        '<div class="msg-body">' +
          metaHtml +
          '<div class="msg-content"></div>' +
          '<div class="msg-foot"></div>' +
        "</div>" +
      "</div>";

    const content = wrap.querySelector(".msg-content");
    const foot = wrap.querySelector(".msg-foot");

    if (msg.role === "user") {
      const div = document.createElement("div");
      div.className = "user-text";
      div.textContent = msg.content;
      content.appendChild(div);
      foot.innerHTML = actionsHtml(msg);
    } else {
      renderAssistantContent(content, foot, msg);
    }
    return wrap;
  }

  function buildAssistantInner(msg) {
    let html = "";

    /* deep-thinking block: streamed reasoning, collapsed once the answer starts */
    if (msg.reasoning) {
      const open = msg.streaming && !msg.content ? " open" : "";
      const label = msg.content
        ? "Thought for " + Math.max(1, Math.round((msg.thinkMs || 0) / 1000)) + "s"
        : "Thinking…";
      html +=
        '<details class="think-block"' + open + ">" +
          "<summary>" + ui.escapeHtml(label) + "</summary>" +
          '<div class="think-body">' + ui.escapeHtml(msg.reasoning) + "</div>" +
        "</details>";
    }

    /* tool status chips (web search phases) */
    if (msg.streaming && !msg.content && !msg.reasoning && msg.statusText) {
      html +=
        '<div class="tool-status" role="status">' +
          '<span class="thinking-dot"></span>' + ui.escapeHtml(msg.statusText) +
        "</div>";
    }

    /* generic thinking pulse before anything arrives */
    if (msg.streaming && !msg.content && !msg.reasoning && !msg.statusText) {
      html +=
        '<div class="thinking-status" role="status">' +
          '<span class="thinking-dot"></span> Thinking<span class="dots"><span>.</span><span>.</span><span>.</span></span>' +
          '<span class="thinking-level-note">' + ui.escapeHtml(LM.ai.thinkingLabel(currentThinking())) + "</span>" +
        "</div>";
    }

    if (msg.content) {
      html += LM.markdown.render(msg.content);
      if (msg.streaming) html += streamCursor();
    }

    if (msg.stopped && !msg.streaming) {
      html += '<div class="stopped-note">Generation stopped.</div>';
    }

    if (msg.error) {
      html +=
        '<div class="msg-error" role="alert">' +
          "<strong>" + ui.escapeHtml(msg.error.title) + "</strong>" +
          "<p>" + ui.escapeHtml(msg.error.detail) + "</p>" +
          (msg.errorTech ? '<details class="error-details"><summary>Details</summary><pre>' + ui.escapeHtml(msg.errorTech) + "</pre></details>" : "") +
        "</div>";
    }

    return html;
  }

  function renderAssistantContent(contentEl, footEl, msg) {
    contentEl.innerHTML = buildAssistantInner(msg);
    footEl.innerHTML = msg.streaming ? "" : actionsHtml(msg);
  }

  function streamCursor() {
    return '<span class="stream-cursor" aria-hidden="true"></span>';
  }

  function renderAll() {
    els.messages.innerHTML = "";
    const has = chat.conversation && chat.conversation.messages.length > 0;
    els.welcome.hidden = !!has;
    els.messages.hidden = !has;
    if (!has) { chat._stickBottom = true; return; }

    const frag = document.createDocumentFragment();
    chat.conversation.messages.forEach(function (msg) {
      frag.appendChild(buildMessageEl(msg));
    });
    els.messages.appendChild(frag);
    chat._stickBottom = true;
    scrollToBottom(true);
  }

  function appendMessageEl(msg) {
    els.welcome.hidden = true;
    els.messages.hidden = false;
    const el = buildMessageEl(msg);
    els.messages.appendChild(el);
    chat._stickBottom = true;
    scrollToBottom(true);
    return el;
  }

  function findMessageEl(id) {
    return els.messages.querySelector('.msg[data-id="' + id + '"]');
  }

  function refreshMessageEl(msg) {
    const el = findMessageEl(msg.id);
    if (!el) return;
    const fresh = buildMessageEl(msg);
    el.replaceWith(fresh);
  }

  function scheduleStreamRender(msg) {
    if (streamQueued) return;
    streamQueued = true;
    const render = function () {
      streamQueued = false;
      const now = Date.now();
      if (now - lastStreamRender < 80) {
        setTimeout(function () { if (msg.streaming) scheduleStreamRender(msg); }, 90);
        return;
      }
      lastStreamRender = now;
      const el = findMessageEl(msg.id);
      if (!el) return;
      const contentEl = el.querySelector(".msg-content");
      contentEl.innerHTML = buildAssistantInner(msg);
      if (chat._stickBottom) scrollToBottom(true);
      if (msg.streaming) scheduleStreamRender(msg);
    };
    requestAnimationFrame(render);
  }

  /* ================= composer controls ================= */

  function refreshSendButton() {
    const btn = els.send;
    if (chat.generating) {
      btn.classList.add("is-stop");
      btn.disabled = false;
      btn.setAttribute("aria-label", "Stop generating");
      btn.title = "Stop generating";
    } else {
      btn.classList.remove("is-stop");
      btn.disabled = els.input.value.trim() === "";
      btn.setAttribute("aria-label", "Send message");
      btn.title = "Send message";
    }
  }

  function autoGrow() {
    const ta = els.input;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }

  function updateModelControls() {
    if (!chat.modelDD) return;
    chat.modelDD.setOptions(modelOptions());
    chat.modelDD.set(currentModelName() || modelOptions()[0].value);
    chat.modelDD.disable(chat.generating || !Object.keys(LM.config.models || {}).length);
  }

  function updateThinkingControl() {
    if (!chat.thinkPop) return;
    const level = currentThinking();
    const order = LM.config.thinkingOrder;
    const idx = Math.max(0, order.indexOf(level));
    const lv = LM.config.thinkingLevels[level] || {};
    els.thinkSlider.value = String(idx + 1);
    els.thinkSlider.setAttribute("aria-valuetext", lv.label || "");
    els.thinkSlider.style.setProperty("--fill", (idx / (order.length - 1)) * 100 + "%");
    els.thinkingCurrent.textContent = lv.label || "";
    els.thinkDesc.textContent = lv.desc || "";
    els.thinkTicks.forEach(function (t) {
      t.classList.toggle("active", t.dataset.level === level);
    });
  }

  function setThinking(level) {
    LM.storage.updateSection("ai", { thinking: level });
    updateThinkingControl();
  }

  function setModel(name) {
    if (!name) return;
    if (chat.conversation) chat.conversation.model = name;
    LM.storage.updateSection("ai", { defaultModel: name });
  }

  function setGenerating(on) {
    chat.generating = on;
    els.composerArea.classList.toggle("generating", on);
    if (chat.modelDD) chat.modelDD.disable(on || !Object.keys(LM.config.models || {}).length);
    if (chat.thinkPop) chat.thinkPop.disable(on);
    if (els.searchToggle) els.searchToggle.disabled = on;
    refreshSendButton();
  }

  function updateApiNote() {
    const note = els.apiNote;
    if (!LM.api.hasBackend()) {
      note.innerHTML = 'Backend not configured — set <code>backend.chatUrl</code> in js/config.js or in <a href="settings.html">Settings → API</a>.';
      note.classList.add("warn");
    } else {
      note.textContent = "";
      note.classList.remove("warn");
    }
  }

  /* ================= conversation flows ================= */

  function newChat() {
    cancelEdit();
    chat.conversation = null;
    renderAll();
    updateModelControls();
    els.input.value = "";
    autoGrow();
    refreshSendButton();
    els.input.focus();
    if (LM.app) { LM.app.setActiveConversation(null); LM.app.closeDrawer(); }
  }

  function openConversation(id) {
    if (chat.generating) stopGeneration();
    const conv = LM.storage.getConversation(id);
    if (!conv) return;
    cancelEdit();
    chat.conversation = conv;
    renderAll();
    updateModelControls();
    if (LM.app) { LM.app.setActiveConversation(id); LM.app.closeDrawer(); }
  }

  function ensureConversation() {
    if (chat.conversation) return chat.conversation;
    chat.conversation = {
      id: ui.uid(),
      title: "New Chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: currentModelName(),
      messages: [],
      pinned: false
    };
    return chat.conversation;
  }

  async function handleSend() {
    if (chat.generating) { stopGeneration(); return; }
    const text = els.input.value.trim();
    if (!text) return;

    if (chat.editingMessageId) { applyEdit(text); return; }

    const conv = ensureConversation();
    const userMsg = { id: ui.uid(), role: "user", content: text, createdAt: Date.now() };
    conv.messages.push(userMsg);

    if (settings().chat.autoName && (conv.messages.length === 1 || conv.title === "New Chat")) {
      conv.title = LM.markdown.titleFrom(text, 48);
    }
    persist();
    appendMessageEl(userMsg);
    els.input.value = "";
    autoGrow();
    refreshSendButton();
    await runAssistant();
  }

  async function runAssistant() {
    const conv = chat.conversation;
    if (!conv) return;
    const aiMsg = { id: ui.uid(), role: "assistant", content: "", createdAt: Date.now(), streaming: true };
    conv.messages.push(aiMsg);
    const el = appendMessageEl(aiMsg);
    setGenerating(true);

    chat.userAborted = false;
    chat.timedOut = false;
    chat.controller = new AbortController();
    const timeoutId = setTimeout(function () {
      chat.timedOut = true;
      chat.controller.abort();
    }, LM.config.requestTimeout);

    chat._stickBottom = true;
    try {
      await LM.ai.stream({
        messages: LM.ai.buildPayload(conv, settings()),
        model: LM.ai.resolveModelId(conv.model || currentModelName()),
        thinking: currentThinking(),
        temperature: settings().ai.temperature,
        maxTokens: LM.config.maxTokens,
        stream: !!settings().ai.streaming,
        web_search: !!chat.webSearch,
        signal: chat.controller.signal,
        onDelta: function (t) {
          if (!aiMsg.content && aiMsg.reasoning) {
            aiMsg.thinkMs = Date.now() - (aiMsg.thinkStart || aiMsg.createdAt);
          }
          aiMsg.content += t;
          aiMsg.statusText = null;
          scheduleStreamRender(aiMsg);
        },
        onReason: function (t) {
          if (!aiMsg.reasoning) aiMsg.thinkStart = Date.now();
          aiMsg.reasoning = (aiMsg.reasoning || "") + t;
          scheduleStreamRender(aiMsg);
        },
        onStatus: function (s) {
          if (s === "searching_web") aiMsg.statusText = "Searching the web…";
          else if (s === "upstream_error") aiMsg.upstreamError = true;
          else aiMsg.statusText = null;
          scheduleStreamRender(aiMsg);
        }
      });
      aiMsg.streaming = false;
      if (!aiMsg.content && aiMsg.upstreamError && !aiMsg.error) {
        aiMsg.error = {
          title: "The backend reported an error mid-request.",
          detail: "The AI provider failed while streaming. Try again — you can also regenerate this response."
        };
        aiMsg.errorTech = "Backend sent lumina_status=upstream_error (upstream HTTP failure after streaming started).";
      } else if (!aiMsg.content) {
        aiMsg.error = { title: "Empty response", detail: "The model returned an empty response. Try again or switch models." };
        aiMsg.errorTech = "Backend stream ended without any text deltas.";
      }
    } catch (err) {
      aiMsg.streaming = false;
      if (err.name === "AbortError" && chat.userAborted && !chat.timedOut) {
        aiMsg.stopped = true;
        if (!aiMsg.content) {
          aiMsg.error = { title: "Generation stopped", detail: "You stopped this response before any text was generated." };
        }
      } else {
        const d = err.luminaDescribe || LM.ai.describeError(err);
        aiMsg.error = d.friendly;
        aiMsg.errorTech = d.tech;
      }
    } finally {
      clearTimeout(timeoutId);
      chat.controller = null;
      if (aiMsg.reasoning && !aiMsg.thinkMs) {
        aiMsg.thinkMs = Date.now() - (aiMsg.thinkStart || aiMsg.createdAt);
      }
      aiMsg.statusText = null;
      setGenerating(false);
      refreshMessageEl(aiMsg);
      conv.updatedAt = Date.now();
      persist();
      scrollToBottom();
    }
  }

  function stopGeneration() {
    if (chat.controller) {
      chat.userAborted = true;
      chat.controller.abort();
    }
  }

  function regenerate(messageId) {
    if (chat.generating) { ui.toast("Stop the current response first.", "warn"); return; }
    const conv = chat.conversation;
    if (!conv) return;
    const idx = conv.messages.findIndex(function (m) { return m.id === messageId; });
    if (idx < 0) return;
    conv.messages = conv.messages.slice(0, idx);
    renderAll();
    persist();
    runAssistant();
  }

  function startEdit(messageId) {
    if (chat.generating) { ui.toast("Stop the current response first.", "warn"); return; }
    const conv = chat.conversation;
    if (!conv) return;
    const msg = conv.messages.find(function (m) { return m.id === messageId; });
    if (!msg || msg.role !== "user") return;
    chat.editingMessageId = messageId;
    els.editBanner.hidden = false;
    els.input.value = msg.content;
    autoGrow();
    refreshSendButton();
    els.input.focus();
    els.input.setSelectionRange(msg.content.length, msg.content.length);
  }

  function applyEdit(newText) {
    const conv = chat.conversation;
    if (!conv) return;
    const idx = conv.messages.findIndex(function (m) { return m.id === chat.editingMessageId; });
    if (idx < 0) { cancelEdit(); return; }
    conv.messages = conv.messages.slice(0, idx);
    cancelEdit();
    const userMsg = { id: ui.uid(), role: "user", content: newText, createdAt: Date.now() };
    conv.messages.push(userMsg);
    persist();
    appendMessageEl(userMsg);
    els.input.value = "";
    autoGrow();
    refreshSendButton();
    runAssistant();
  }

  function cancelEdit() {
    chat.editingMessageId = null;
    if (els.editBanner) els.editBanner.hidden = true;
  }

  /* ================= event wiring ================= */

  function onMessagesClick(e) {
    const codeBtn = e.target.closest("[data-code-copy]");
    if (codeBtn) {
      const block = codeBtn.closest(".code-block");
      const codeEl = block && block.querySelector("code");
      const text = codeEl ? codeEl.textContent : "";
      ui.copyText(text).then(function (ok) {
        codeBtn.textContent = ok ? "Copied ✓" : "Failed";
        codeBtn.classList.toggle("ok", ok);
        setTimeout(function () { codeBtn.textContent = "Copy"; codeBtn.classList.remove("ok"); }, 1600);
      });
      return;
    }
    const actionBtn = e.target.closest(".msg-action");
    if (!actionBtn) return;
    const id = actionBtn.dataset.id;
    const action = actionBtn.dataset.action;
    const conv = chat.conversation;
    const msg = conv && conv.messages.find(function (m) { return m.id === id; });
    if (!msg) return;

    if (action === "copy") {
      ui.copyText(msg.content).then(function (ok) {
        ui.toast(ok ? "Copied to clipboard." : "Copy failed.", ok ? "ok" : "error");
      });
    } else if (action === "regenerate") {
      regenerate(id);
    } else if (action === "edit") {
      startEdit(id);
    }
  }

  function onInputKeydown(e) {
    const enterToSend = settings().general.enterToSend;
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      if (enterToSend) { e.preventDefault(); handleSend(); }
      else if (e.ctrlKey || e.metaKey) { e.preventDefault(); handleSend(); }
    }
  }

  function init() {
    els = {
      messages: document.getElementById("messages"),
      welcome: document.getElementById("welcome"),
      composerArea: document.getElementById("composer-area"),
      input: document.getElementById("composer-input"),
      send: document.getElementById("composer-send"),
      modelMount: document.getElementById("model-dd"),
      thinkMount: document.getElementById("thinking-dd"),
      searchToggle: document.getElementById("websearch-toggle"),
      editBanner: document.getElementById("edit-banner"),
      editCancel: document.getElementById("edit-cancel"),
      apiNote: document.getElementById("api-note")
    };

    /* model picker pill (popup menu with descriptions) */
    chat.modelDD = ui.dropdown(els.modelMount, {
      options: modelOptions(),
      value: currentModelName(),
      className: "dd-pill",
      direction: "up",
      ariaLabel: "Model",
      onChange: function (v) { setModel(v); }
    });

    /* thinking pill (popup panel with the slider) */
    const tickBtns = LM.config.thinkingOrder.map(function (k) {
      return '<button type="button" class="think-tick" data-level="' + k + '">' +
        ui.escapeHtml(LM.config.thinkingLevels[k].label) + "</button>";
    }).join("");
    chat.thinkPop = ui.popover(els.thinkMount, {
      className: "think-pill",
      direction: "up",
      ariaLabel: "Thinking level",
      buttonHtml: ICONS.sparkle +
        '<span class="pill-label">Thinking: <b id="thinking-current" aria-live="polite">Medium</b></span>',
      panelHtml:
        '<div class="think-panel">' +
          '<div class="think-slider-wrap">' +
            '<input type="range" id="thinking-slider" min="1" max="4" step="1" value="2" aria-label="Thinking level">' +
            '<div class="think-ticks" aria-hidden="true">' + tickBtns + "</div>" +
          "</div>" +
          '<p class="think-desc" id="thinking-desc"></p>' +
        "</div>"
    });
    els.thinkSlider = chat.thinkPop.panel.querySelector("#thinking-slider");
    els.thinkTicks = Array.prototype.slice.call(chat.thinkPop.panel.querySelectorAll(".think-tick"));
    els.thinkingCurrent = chat.thinkPop.btn.querySelector("#thinking-current");
    els.thinkDesc = chat.thinkPop.panel.querySelector("#thinking-desc");

    els.thinkSlider.addEventListener("input", function () {
      const order = LM.config.thinkingOrder;
      const level = order[parseInt(els.thinkSlider.value, 10) - 1];
      if (level) setThinking(level);
    });
    els.thinkTicks.forEach(function (tick) {
      tick.addEventListener("click", function () {
        if (!chat.generating) setThinking(tick.dataset.level);
      });
    });

    /* web search toggle pill */
    els.searchToggle.addEventListener("click", function () {
      chat.webSearch = !chat.webSearch;
      els.searchToggle.classList.toggle("active", chat.webSearch);
      els.searchToggle.setAttribute("aria-pressed", chat.webSearch ? "true" : "false");
    });

    els.input.addEventListener("input", function () { autoGrow(); refreshSendButton(); });
    els.input.addEventListener("keydown", onInputKeydown);
    els.send.addEventListener("click", handleSend);
    els.messages.addEventListener("click", onMessagesClick);
    els.editCancel.addEventListener("click", function () {
      cancelEdit();
      els.input.value = "";
      autoGrow();
      refreshSendButton();
    });

    document.querySelectorAll(".suggestion").forEach(function (btn) {
      btn.addEventListener("click", function () {
        els.input.value = btn.dataset.prompt || "";
        autoGrow();
        refreshSendButton();
        els.input.focus();
        els.welcome.hidden = true;
        els.messages.hidden = false;
      });
    });

    updateModelControls();
    updateThinkingControl();
    updateApiNote();
    refreshSendButton();
    renderAll();
  }

  chat.init = init;
  chat.newChat = newChat;
  chat.openConversation = openConversation;
  chat.stopGeneration = stopGeneration;
  chat.updateApiNote = updateApiNote;
  chat.isActive = function (id) { return !!(chat.conversation && chat.conversation.id === id); };

  LM.chat = chat;
})();
