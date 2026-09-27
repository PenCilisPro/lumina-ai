/* Lumina AI — theme engine: applies appearance settings as CSS variables /
   data attributes so every theme change is instant, with no page reload. */
(function () {
  "use strict";
  window.LM = window.LM || {};

  const THEMES = [
    { id: "lumina-dark", name: "Lumina Dark" },
    { id: "midnight", name: "Midnight" },
    { id: "aurora", name: "Aurora" },
    { id: "deep-space", name: "Deep Space" },
    { id: "light", name: "Light" },
    { id: "custom", name: "Custom" }
  ];

  const ACCENTS = [
    { id: "blue",   name: "Blue",   a: "#3b82f6", b: "#8b5cf6" },
    { id: "purple", name: "Purple", a: "#8b5cf6", b: "#d946ef" },
    { id: "indigo", name: "Indigo", a: "#6366f1", b: "#a855f7" },
    { id: "violet", name: "Violet", a: "#7c3aed", b: "#ec4899" },
    { id: "cyan",   name: "Cyan",   a: "#06b6d4", b: "#3b82f6" }
  ];

  function apply() {
    if (!LM.storage) return;
    const s = LM.storage.getSettings();
    const a = s.appearance;
    const root = document.documentElement;

    /* base palette — "custom" reuses a built-in base chosen by the user */
    const baseTheme = a.theme === "custom" ? (a.customBase === "light" ? "light" : "lumina-dark") : a.theme;
    root.setAttribute("data-theme", baseTheme);
    root.setAttribute("data-custom-theme", a.theme === "custom" ? "true" : "false");

    root.setAttribute("data-accent", a.accent || "blue");
    root.setAttribute("data-bg", a.background || "gradient");
    root.setAttribute("data-msgstyle", a.messageStyle || "bubbles");
    root.setAttribute("data-sidebar", a.sidebarStyle || "glass");
    root.setAttribute("data-fontsize", a.fontSize || "medium");
    root.setAttribute("data-radius", a.radius || "medium");

    root.classList.toggle("lumina-compact", a.density === "compact");
    root.classList.toggle("no-animations", !s.general.animations);
  }

  function set(patch) {
    LM.storage.updateSection("appearance", patch);
    apply();
  }

  LM.themes = {
    THEMES: THEMES,
    ACCENTS: ACCENTS,
    apply: apply,
    set: set
  };
})();
