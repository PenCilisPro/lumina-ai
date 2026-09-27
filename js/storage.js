/* Lumina AI — local persistence: conversations and settings. */
(function () {
  "use strict";
  window.LM = window.LM || {};

  const K_CONV = "lumina.conversations.v1";
  const K_SET = "lumina.settings.v1";

  const DEFAULTS = {
    general: {
      language: "auto",        // AI response language: auto|english|spanish|...
      enterToSend: true,
      compact: false,          // mirror of appearance.density === "compact"
      animations: true
    },
    appearance: {
      theme: "lumina-dark",    // lumina-dark|midnight|aurora|deep-space|light|custom
      customBase: "dark",      // used when theme === "custom"
      accent: "blue",          // blue|purple|indigo|violet|cyan
      background: "solid",     // solid|subtle|gradient
      messageStyle: "bubbles", // bubbles|full
      sidebarStyle: "solid",   // solid|glass|minimal
      fontSize: "medium",      // small|medium|large
      density: "comfortable",  // comfortable|compact
      radius: "medium"         // small|medium|large
    },
    ai: {
      defaultModel: LM.config.defaults.model,
      thinking: LM.config.defaults.thinking, // light|medium|high|xhigh
      skill: "",                // active skill key from LM.config.skills ("" = none)
      temperature: 0.7,
      streaming: true,
      systemPrompt: "",
      responseLength: "balanced" // concise|balanced|detailed
    },
    chat: {
      saveHistory: true,
      autoName: true,
      showTimestamps: false,
      confirmDelete: true
    },
    connection: {
      backendUrl: ""           // optional override of config.backend.chatUrl
    },
    code: {
      model: "code"            // Lumina Code tab model: "code" | "guard"
    }
  };

  let settings = null;
  let conversations = [];

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function deepMerge(base, extra) {
    if (!extra || typeof extra !== "object") return base;
    for (const k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) {
        if (extra[k] && typeof extra[k] === "object" && !Array.isArray(extra[k]) &&
            base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) {
          deepMerge(base[k], extra[k]);
        } else if (extra[k] !== undefined && extra[k] !== null) {
          base[k] = extra[k];
        }
      }
    }
    return base;
  }

  function persistSettings() {
    try {
      localStorage.setItem(K_SET, JSON.stringify(settings));
    } catch (e) {
      if (LM.ui) LM.ui.toast("Could not save settings (storage may be full).", "error");
    }
  }

  function persistConversations() {
    try {
      localStorage.setItem(K_CONV, JSON.stringify(conversations));
      return true;
    } catch (e) {
      if (LM.ui) LM.ui.toast("Storage is full — try deleting some old conversations.", "error");
      return false;
    }
  }

  const storage = {
    init: function () {
      try {
        settings = deepMerge(clone(DEFAULTS), JSON.parse(localStorage.getItem(K_SET) || "{}"));
      } catch (e) {
        settings = clone(DEFAULTS);
      }
      settings.general.compact = settings.appearance.density === "compact";
      try {
        conversations = JSON.parse(localStorage.getItem(K_CONV) || "[]");
      } catch (e) {
        conversations = [];
      }
      if (!Array.isArray(conversations)) conversations = [];
      conversations = conversations.filter(function (c) {
        return c && typeof c === "object" && c.id && Array.isArray(c.messages);
      });
      const modelNames = Object.keys(LM.config.models);
      const legacy = LM.config.legacyModelNames || {};

      /* remap old model names (e.g. after a rename) */
      conversations.forEach(function (c) {
        if (c.model && !modelNames.includes(c.model) && legacy[c.model]) {
          c.model = legacy[c.model];
        }
      });
      if (settings.ai.defaultModel && !modelNames.includes(settings.ai.defaultModel)) {
        settings.ai.defaultModel = legacy[settings.ai.defaultModel] || LM.config.defaults.model;
      }
      if (modelNames.length && modelNames.indexOf(settings.ai.defaultModel) === -1) {
        settings.ai.defaultModel = LM.config.defaults.model;
      }
      persistSettings();
      persistConversations();
    },

    /* ---------------- settings ---------------- */
    getSettings: function () { return settings; },

    updateSection: function (section, patch) {
      if (!settings[section]) return settings;
      deepMerge(settings[section], patch || {});
      persistSettings();
      return settings;
    },

    setDensity: function (compact) {
      settings.appearance.density = compact ? "compact" : "comfortable";
      settings.general.compact = compact;
      persistSettings();
    },

    resetSettings: function () {
      try { localStorage.removeItem(K_SET); } catch (e) { /* ignore */ }
      settings = clone(DEFAULTS);
      persistSettings();
    },

    /* ---------------- conversations ---------------- */
    listConversations: function () {
      return conversations.slice().sort(function (a, b) {
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
    },

    getConversation: function (id) {
      for (let i = 0; i < conversations.length; i++) {
        if (conversations[i].id === id) return conversations[i];
      }
      return null;
    },

    saveConversation: function (conv) {
      conv.updatedAt = Date.now();
      const idx = conversations.findIndex(function (c) { return c.id === conv.id; });
      if (idx >= 0) conversations[idx] = conv;
      else conversations.push(conv);
      persistConversations();
    },

    deleteConversation: function (id) {
      conversations = conversations.filter(function (c) { return c.id !== id; });
      persistConversations();
    },

    clearAllConversations: function () {
      conversations = [];
      try { localStorage.removeItem(K_CONV); } catch (e) { /* ignore */ }
    }
  };

  LM.storage = storage;
})();
