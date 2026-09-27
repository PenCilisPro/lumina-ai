/* Lumina AI — Settings page logic: binds every control (custom dropdowns,
   switches, sliders) to persisted settings, manages the backend connection
   override, connection test and maintenance actions. */
(function () {
  "use strict";
  window.LM = window.LM || {};

  const ui = LM.ui;
  const $ = function (id) { return document.getElementById(id); };

  const DD = {}; // dropdown handles by mount id

  function settings() { return LM.storage.getSettings(); }

  function savedToast() { ui.toast("Settings saved.", "ok"); }

  function modelOpts() {
    const descs = LM.config.modelDescriptions || {};
    return Object.keys(LM.config.models).map(function (n) {
      return { value: n, label: n, desc: descs[n] || "" };
    });
  }

  function thinkingOpts() {
    return LM.config.thinkingOrder.map(function (k) {
      return {
        value: k,
        label: LM.config.thinkingLevels[k].label,
        desc: LM.config.thinkingLevels[k].desc || ""
      };
    });
  }

  function createDropdown(id, options, section, key, onChange) {
    DD[id] = ui.dropdown($(id), {
      options: options,
      value: settings()[section][key],
      align: "right",
      onChange: function (v) {
        const patch = {};
        patch[key] = v;
        LM.storage.updateSection(section, patch);
        if (onChange) onChange(v);
        savedToast();
      }
    });
  }

  /* ---------------- creation ---------------- */

  function buildDropdowns() {
    createDropdown("dd-language", [
      { value: "auto", label: "Auto (model default)" },
      { value: "english", label: "English" },
      { value: "spanish", label: "Spanish" },
      { value: "french", label: "French" },
      { value: "german", label: "German" },
      { value: "portuguese", label: "Portuguese" },
      { value: "chinese", label: "Chinese" },
      { value: "japanese", label: "Japanese" }
    ], "general", "language");

    DD["dd-enter"] = ui.dropdown($("dd-enter"), {
      options: [
        { value: "enter", label: "Enter sends message" },
        { value: "ctrl-enter", label: "Ctrl+Enter sends (Enter = new line)" }
      ],
      value: settings().general.enterToSend ? "enter" : "ctrl-enter",
      align: "right",
      onChange: function (v) {
        LM.storage.updateSection("general", { enterToSend: v === "enter" });
        savedToast();
      }
    });

    createDropdown("dd-background", [
      { value: "solid", label: "Solid" },
      { value: "subtle", label: "Subtle glow" },
      { value: "gradient", label: "Gradient glow" }
    ], "appearance", "background", function () { LM.themes.apply(); });

    createDropdown("dd-message-style", [
      { value: "bubbles", label: "Bubbles" },
      { value: "full", label: "Full width" }
    ], "appearance", "messageStyle", function () { LM.themes.apply(); });

    createDropdown("dd-sidebar-style", [
      { value: "solid", label: "Solid" },
      { value: "glass", label: "Glass" },
      { value: "minimal", label: "Minimal" }
    ], "appearance", "sidebarStyle", function () { LM.themes.apply(); });

    createDropdown("dd-font-size", [
      { value: "small", label: "Small" },
      { value: "medium", label: "Medium" },
      { value: "large", label: "Large" }
    ], "appearance", "fontSize", function () { LM.themes.apply(); });

    createDropdown("dd-density", [
      { value: "comfortable", label: "Comfortable" },
      { value: "compact", label: "Compact" }
    ], "appearance", "density", function (v) {
      LM.storage.setDensity(v === "compact");
      LM.themes.apply();
      $("chk-compact").checked = v === "compact";
    });

    createDropdown("dd-radius", [
      { value: "small", label: "Small" },
      { value: "medium", label: "Medium" },
      { value: "large", label: "Large" }
    ], "appearance", "radius", function () { LM.themes.apply(); });

    createDropdown("dd-default-model", modelOpts(), "ai", "defaultModel");

    createDropdown("dd-thinking", thinkingOpts(), "ai", "thinking");

    createDropdown("dd-response-length", [
      { value: "concise", label: "Concise" },
      { value: "balanced", label: "Balanced" },
      { value: "detailed", label: "Detailed" }
    ], "ai", "responseLength");
  }

  /* ---------------- population ---------------- */

  function populate() {
    const s = settings();

    DD["dd-language"].set(s.general.language);
    DD["dd-enter"].set(s.general.enterToSend ? "enter" : "ctrl-enter");
    $("chk-compact").checked = s.appearance.density === "compact";
    $("chk-animations").checked = s.general.animations;

    markOptionGroup("theme-options", "data-theme", s.appearance.theme);
    markOptionGroup("accent-options", "data-accent", s.appearance.accent);
    markOptionGroup("custom-base-options", "data-base", s.appearance.customBase);
    $("row-custom-base").hidden = s.appearance.theme !== "custom";
    DD["dd-background"].set(s.appearance.background);
    DD["dd-message-style"].set(s.appearance.messageStyle);
    DD["dd-sidebar-style"].set(s.appearance.sidebarStyle);
    DD["dd-font-size"].set(s.appearance.fontSize);
    DD["dd-density"].set(s.appearance.density);
    DD["dd-radius"].set(s.appearance.radius);

    DD["dd-default-model"].set(s.ai.defaultModel);
    DD["dd-thinking"].set(s.ai.thinking);
    $("rng-temperature").value = s.ai.temperature;
    $("temp-value").textContent = Number(s.ai.temperature).toFixed(1);
    $("chk-streaming").checked = s.ai.streaming;
    $("txt-system-prompt").value = s.ai.systemPrompt;
    DD["dd-response-length"].set(s.ai.responseLength);

    $("chk-save-history").checked = s.chat.saveHistory;
    $("chk-autoname").checked = s.chat.autoName;
    $("chk-timestamps").checked = s.chat.showTimestamps;
    $("chk-confirm-delete").checked = s.chat.confirmDelete;

    $("inp-backend-url").value = s.connection.backendUrl || "";
    $("inp-backend-url").placeholder = LM.config.backend.chatUrl || "/api/chat";
    updateConnectionHint();
    fillModelTable();

    $("about-version").textContent = "Version " + (LM.config.version || "1.1.0");
  }

  function fillModelTable() {
    const tbody = $("api-models");
    tbody.innerHTML = "";
    const models = LM.config.models || {};
    const names = Object.keys(models);
    if (!names.length) {
      tbody.innerHTML = '<tr><td colspan="2" class="muted">No models configured — edit js/config.js.</td></tr>';
      return;
    }
    names.forEach(function (name) {
      const tr = document.createElement("tr");
      const td1 = document.createElement("td");
      td1.textContent = name;
      const td2 = document.createElement("td");
      td2.className = "mono";
      td2.textContent = models[name];
      tr.appendChild(td1);
      tr.appendChild(td2);
      tbody.appendChild(tr);
    });
  }

  function markOptionGroup(groupId, attr, value) {
    const group = $(groupId);
    if (!group) return;
    group.querySelectorAll("[" + attr + "]").forEach(function (btn) {
      btn.classList.toggle("selected", btn.getAttribute(attr) === value);
      btn.setAttribute("aria-pressed", btn.getAttribute(attr) === value ? "true" : "false");
    });
  }

  function updateConnectionHint() {
    const hint = $("api-key-hint");
    const override = settings().connection.backendUrl;
    if (override) {
      hint.textContent = "Overriding js/config.js with this page's backend URL.";
    } else {
      hint.textContent = "Using the endpoint from js/config.js → backend.chatUrl (" + (LM.config.backend.chatUrl || "not set") + ").";
    }
  }

  /* ---------------- binding ---------------- */

  function bindGeneral() {
    $("chk-compact").addEventListener("change", function () {
      LM.storage.setDensity(this.checked);
      LM.themes.apply();
      DD["dd-density"].set(this.checked ? "compact" : "comfortable");
      savedToast();
    });
    $("chk-animations").addEventListener("change", function () {
      LM.storage.updateSection("general", { animations: this.checked });
      LM.themes.apply();
      savedToast();
    });
    $("btn-reset-settings").addEventListener("click", async function () {
      const ok = await ui.modal.confirm({
        title: "Reset all settings?",
        body: "Every setting will return to its default value. Conversations are not deleted.",
        confirmLabel: "Reset",
        danger: true
      });
      if (!ok) return;
      LM.storage.resetSettings();
      LM.themes.apply();
      populate();
      ui.toast("Settings reset to defaults.", "ok");
    });
  }

  function bindAppearance() {
    $("theme-options").addEventListener("click", function (e) {
      const btn = e.target.closest("[data-theme]");
      if (!btn) return;
      LM.themes.set({ theme: btn.dataset.theme });
      markOptionGroup("theme-options", "data-theme", btn.dataset.theme);
      $("row-custom-base").hidden = btn.dataset.theme !== "custom";
      savedToast();
    });
    $("accent-options").addEventListener("click", function (e) {
      const btn = e.target.closest("[data-accent]");
      if (!btn) return;
      LM.themes.set({ accent: btn.dataset.accent });
      markOptionGroup("accent-options", "data-accent", btn.dataset.accent);
      savedToast();
    });
    $("custom-base-options").addEventListener("click", function (e) {
      const btn = e.target.closest("[data-base]");
      if (!btn) return;
      LM.themes.set({ customBase: btn.dataset.base });
      markOptionGroup("custom-base-options", "data-base", btn.dataset.base);
      savedToast();
    });
  }

  function bindAI() {
    $("rng-temperature").addEventListener("input", function () {
      $("temp-value").textContent = Number(this.value).toFixed(1);
    });
    $("rng-temperature").addEventListener("change", function () {
      LM.storage.updateSection("ai", { temperature: Number(this.value) });
      savedToast();
    });
    $("chk-streaming").addEventListener("change", function () {
      LM.storage.updateSection("ai", { streaming: this.checked });
      savedToast();
    });
    $("txt-system-prompt").addEventListener("change", function () {
      LM.storage.updateSection("ai", { systemPrompt: this.value });
      savedToast();
    });
  }

  function bindChat() {
    [["chk-save-history", "saveHistory"], ["chk-autoname", "autoName"],
     ["chk-timestamps", "showTimestamps"], ["chk-confirm-delete", "confirmDelete"]]
      .forEach(function (pair) {
        $(pair[0]).addEventListener("change", function () {
          const patch = {};
          patch[pair[1]] = this.checked;
          LM.storage.updateSection("chat", patch);
          savedToast();
        });
      });
    $("btn-clear-chats").addEventListener("click", async function () {
      const count = LM.storage.listConversations().length;
      const ok = await ui.modal.confirm({
        title: "Delete all conversations?",
        body: count + " conversation(s) will be permanently deleted from this browser. This cannot be undone.",
        confirmLabel: "Delete all",
        danger: true
      });
      if (!ok) return;
      LM.storage.clearAllConversations();
      ui.toast("All conversations deleted.", "ok");
    });
  }

  function bindConnection() {
    $("inp-backend-url").addEventListener("change", function () {
      LM.storage.updateSection("connection", { backendUrl: this.value.trim() });
      updateConnectionHint();
      savedToast();
    });

    $("btn-test-connection").addEventListener("click", async function () {
      const btn = this;
      const status = $("api-status");
      btn.disabled = true;
      status.hidden = false;
      status.className = "api-status testing";
      status.innerHTML = "Testing connection…";
      try {
        const result = await LM.ai.testConnection();
        status.className = "api-status ok";
        status.innerHTML = "Connected ✓ <span class='muted'>(" + result.ms + " ms · via " +
          (result.via === "health" ? "health endpoint" : "chat ping") + ")</span>";
      } catch (err) {
        const d = err.luminaDescribe || LM.ai.describeError(err);
        status.className = "api-status fail";
        status.innerHTML = "Connection failed — " + ui.escapeHtml(d.friendly.detail) +
          (d.tech ? "<details class='error-details'><summary>Details</summary><pre>" + ui.escapeHtml(d.tech) + "</pre></details>" : "");
      } finally {
        btn.disabled = false;
      }
    });
  }

  function bindNav() {
    document.querySelectorAll(".settings-nav a").forEach(function (a) {
      a.addEventListener("click", function () {
        document.querySelectorAll(".settings-nav a").forEach(function (x) { x.classList.remove("active"); });
        a.classList.add("active");
      });
    });
  }

  function init() {
    buildDropdowns();
    bindGeneral();
    bindAppearance();
    bindAI();
    bindChat();
    bindConnection();
    bindNav();
    populate();
    LM.themes.apply();
  }

  LM.settings = { init: init, populate: populate };
})();
