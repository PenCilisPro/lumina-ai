/* Lumina AI — app shell: sidebar, conversation list (pinned/date groups),
   search with debounce, context menu, mobile drawer, keyboard shortcuts. */
(function () {
  "use strict";
  window.LM = window.LM || {};

  const ui = LM.ui;

  const DAY = 86400000;

  let els = {};

  function bucketOf(conv) {
    if (conv.pinned) return "Pinned";
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (conv.updatedAt >= startToday) return "Today";
    if (conv.updatedAt >= startToday - DAY) return "Yesterday";
    if (conv.updatedAt >= startToday - 6 * DAY) return "Previous 7 days";
    return "Older";
  }

  const BUCKET_ORDER = ["Pinned", "Today", "Yesterday", "Previous 7 days", "Older"];

  function snippetFor(conv, query) {
    const q = query.toLowerCase();
    for (let i = conv.messages.length - 1; i >= 0; i--) {
      const content = conv.messages[i].content || "";
      const idx = content.toLowerCase().indexOf(q);
      if (idx >= 0) {
        const start = Math.max(0, idx - 24);
        const frag = content.slice(start, idx + query.length + 36).replace(/\s+/g, " ").trim();
        return (start > 0 ? "…" : "") + frag + (idx + query.length + 36 < content.length ? "…" : "");
      }
    }
    return "";
  }

  function convItemHtml(conv, query) {
    const active = LM.chat.isActive(conv.id) ? " active" : "";
    const title = ui.escapeHtml(conv.title || "Untitled");
    const pin = conv.pinned ? '<svg class="icon pin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg>' : "";
    const snippet = query ? '<span class="conv-snippet">' + ui.escapeHtml(snippetFor(conv, query)) + "</span>" : "";
    return (
      '<div class="conv-item' + active + '" data-id="' + conv.id + '" role="button" tabindex="0" aria-label="' + title + '">' +
        pin +
        '<span class="conv-title">' + title + "</span>" +
        snippet +
        '<button type="button" class="conv-menu-btn" data-menu="' + conv.id + '" aria-label="Conversation options" aria-haspopup="menu">' +
          '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>' +
        "</button>" +
      "</div>"
    );
  }

  function refreshSidebar() {
    const list = els.list;
    const query = els.search.value.trim();
    const convs = LM.storage.listConversations();

    if (query) {
      const q = query.toLowerCase();
      const matches = convs.filter(function (c) {
        if ((c.title || "").toLowerCase().indexOf(q) >= 0) return true;
        return c.messages.some(function (m) {
          return (m.content || "").toLowerCase().indexOf(q) >= 0;
        });
      });
      if (!matches.length) {
        list.innerHTML = '<div class="conv-empty">No conversations match “' + ui.escapeHtml(query) + "”.</div>";
        return;
      }
      let html = '<div class="conv-group-label">Search results (' + matches.length + ")</div>";
      matches.forEach(function (c) { html += convItemHtml(c, query); });
      list.innerHTML = html;
      return;
    }

    if (!convs.length) {
      list.innerHTML = '<div class="conv-empty">No conversations yet.<br>Start a new chat to begin.</div>';
      return;
    }

    const groups = {};
    convs.forEach(function (c) {
      const b = bucketOf(c);
      (groups[b] = groups[b] || []).push(c);
    });
    let html = "";
    BUCKET_ORDER.forEach(function (b) {
      if (!groups[b] || !groups[b].length) return;
      html += '<div class="conv-group-label">' + b + "</div>";
      groups[b].forEach(function (c) { html += convItemHtml(c, ""); });
    });
    list.innerHTML = html;
  }

  /* ---------------- context menu ---------------- */

  let menuEl = null;

  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
    document.removeEventListener("click", onDocClickForMenu, true);
  }

  function onDocClickForMenu() { closeMenu(); }

  function openMenu(convId, anchor) {
    closeMenu();
    const conv = LM.storage.getConversation(convId);
    if (!conv) return;
    menuEl = document.createElement("div");
    menuEl.className = "ctx-menu";
    menuEl.setAttribute("role", "menu");
    menuEl.innerHTML =
      '<button type="button" role="menuitem" data-act="rename">' +
        '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg> Rename</button>' +
      '<button type="button" role="menuitem" data-act="pin">' +
        '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg>' +
        (conv.pinned ? "Unpin" : "Pin") + "</button>" +
      '<button type="button" role="menuitem" class="danger" data-act="delete">' +
        '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg> Delete</button>';

    document.body.appendChild(menuEl);
    const rect = anchor.getBoundingClientRect();
    const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
    let x = Math.min(rect.left, window.innerWidth - mw - 8);
    let y = rect.bottom + 6;
    if (y + mh > window.innerHeight - 8) y = rect.top - mh - 6;
    menuEl.style.left = Math.max(8, x) + "px";
    menuEl.style.top = Math.max(8, y) + "px";

    menuEl.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      e.stopPropagation();
      const act = btn.dataset.act;
      closeMenu();
      if (act === "rename") renameConversation(conv);
      else if (act === "pin") togglePin(conv);
      else if (act === "delete") deleteConversation(conv);
    });

    setTimeout(function () { document.addEventListener("click", onDocClickForMenu, true); }, 0);
  }

  async function renameConversation(conv) {
    const name = await ui.modal.prompt({
      title: "Rename conversation",
      label: "Conversation name",
      value: conv.title,
      confirmLabel: "Rename"
    });
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) { ui.toast("Name can't be empty.", "warn"); return; }
    conv.title = trimmed;
    LM.storage.saveConversation(conv);
    refreshSidebar();
    ui.toast("Conversation renamed.", "ok");
  }

  function togglePin(conv) {
    conv.pinned = !conv.pinned;
    LM.storage.saveConversation(conv);
    refreshSidebar();
  }

  async function deleteConversation(conv) {
    if (LM.storage.getSettings().chat.confirmDelete) {
      const ok = await ui.modal.confirm({
        title: "Delete conversation?",
        body: "“" + conv.title + "” will be permanently deleted. This cannot be undone.",
        confirmLabel: "Delete",
        danger: true
      });
      if (!ok) return;
    }
    LM.storage.deleteConversation(conv.id);
    if (LM.chat.isActive(conv.id)) LM.chat.newChat();
    refreshSidebar();
    ui.toast("Conversation deleted.", "ok");
  }

  /* ---------------- drawer (mobile) ---------------- */

  function openDrawer() {
    els.sidebar.classList.add("open");
    els.overlay.classList.add("show");
    els.menuBtn.setAttribute("aria-expanded", "true");
  }
  function closeDrawer() {
    els.sidebar.classList.remove("open");
    els.overlay.classList.remove("show");
    els.menuBtn.setAttribute("aria-expanded", "false");
  }
  function toggleDrawer() {
    if (els.sidebar.classList.contains("open")) closeDrawer();
    else openDrawer();
  }

  /* ---------------- init ---------------- */

  function init() {
    els = {
      sidebar: document.getElementById("sidebar"),
      overlay: document.getElementById("sidebar-overlay"),
      menuBtn: document.getElementById("menu-btn"),
      newChat: document.getElementById("new-chat-btn"),
      search: document.getElementById("search-input"),
      list: document.getElementById("conversation-list")
    };

    els.newChat.addEventListener("click", function () { LM.chat.newChat(); });
    els.menuBtn.addEventListener("click", toggleDrawer);
    els.overlay.addEventListener("click", closeDrawer);

    els.search.addEventListener("input", ui.debounce(refreshSidebar, 200));
    els.search.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { els.search.value = ""; refreshSidebar(); els.search.blur(); }
    });

    els.list.addEventListener("click", function (e) {
      const menuBtn = e.target.closest("[data-menu]");
      if (menuBtn) {
        e.stopPropagation();
        openMenu(menuBtn.dataset.menu, menuBtn);
        return;
      }
      const item = e.target.closest(".conv-item");
      if (item) LM.chat.openConversation(item.dataset.id);
    });
    els.list.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      const item = e.target.closest(".conv-item");
      if (item) { e.preventDefault(); LM.chat.openConversation(item.dataset.id); }
    });

    document.addEventListener("keydown", function (e) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        els.search.focus();
        els.search.select();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        LM.chat.newChat();
      } else if (mod && e.key.toLowerCase() === "j") {
        e.preventDefault();
        switchView(document.getElementById("view-code").hidden ? "code" : "chat");
      } else if (e.key === "Escape") {
        if (menuEl) { closeMenu(); }
        else if (els.sidebar.classList.contains("open")) closeDrawer();
      }
    });

    /* view switching: Chat <-> Lumina Code terminal */
    els.tabs = Array.prototype.slice.call(document.querySelectorAll(".top-tab"));
    els.viewChat = document.getElementById("view-chat");
    els.viewCode = document.getElementById("view-code");
    els.tabs.forEach(function (t) {
      t.addEventListener("click", function () { switchView(t.dataset.view); });
    });

    refreshSidebar();
  }

  function switchView(v) {
    if (!els.viewChat || !els.viewCode) return;
    els.tabs.forEach(function (t) {
      const on = t.dataset.view === v;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    els.viewChat.hidden = v === "code";
    els.viewCode.hidden = v !== "code";
    if (v === "code") {
      LM.code.setVisible(true);
    } else {
      LM.code.setVisible(false);
      const composerInput = document.getElementById("composer-input");
      if (composerInput) composerInput.focus();
    }
  }

  LM.app = {
    init: init,
    refreshSidebar: refreshSidebar,
    setActiveConversation: function () { refreshSidebar(); },
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    switchView: switchView
  };
})();
