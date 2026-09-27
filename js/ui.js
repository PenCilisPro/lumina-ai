/* Lumina AI — shared UI utilities: escaping, toast, modal, clipboard,
   ids, the reusable custom dropdown, and a generic popover. */
(function () {
  "use strict";
  window.LM = window.LM || {};

  const ui = {};

  ui.uid = function () {
    const bytes = new Uint8Array(8);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else { for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256); }
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
    return s;
  };

  ui.escapeHtml = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  ui.debounce = function (fn, ms) {
    let t = null;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  };

  ui.clamp = function (n, min, max) { return Math.min(max, Math.max(min, n)); };

  /* ---------------- clipboard ---------------- */
  ui.copyText = async function (text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch (e2) {
        return false;
      }
    }
  };

  /* ---------------- toast ---------------- */
  let toastEl = null, toastTimer = null;

  ui.toast = function (message, kind) {
    if (!toastEl || !document.body.contains(toastEl)) {
      toastEl = document.createElement("div");
      toastEl.id = "lumina-toast";
      toastEl.className = "lumina-toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.remove("toast-ok", "toast-error", "toast-warn");
    if (kind) toastEl.classList.add("toast-" + kind);
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2600);
  };

  /* ---------------- modal dialogs ---------------- */
  let activeModal = null;

  function ensureModalRoot() {
    let root = document.getElementById("lumina-modal-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "lumina-modal-root";
      root.innerHTML =
        '<div class="modal-backdrop" hidden>' +
        '  <div class="modal-card" role="dialog" aria-modal="true">' +
        '    <h3 class="modal-title"></h3>' +
        '    <div class="modal-body"></div>' +
        '    <div class="modal-actions">' +
        '      <button type="button" class="btn btn-ghost modal-cancel"></button>' +
        '      <button type="button" class="btn modal-confirm"></button>' +
        '    </div>' +
        '  </div>' +
        '</div>';
      document.body.appendChild(root);
    }
    return root;
  }

  function openModal(opts) {
    const root = ensureModalRoot();
    const backdrop = root.querySelector(".modal-backdrop");
    const body = root.querySelector(".modal-body");
    const cancelBtn = root.querySelector(".modal-cancel");
    const confirmBtn = root.querySelector(".modal-confirm");

    root.querySelector(".modal-title").textContent = opts.title || "";
    body.innerHTML = opts.bodyHtml || "";
    cancelBtn.textContent = opts.cancelLabel || "Cancel";
    confirmBtn.textContent = opts.confirmLabel || "Confirm";
    confirmBtn.className = "btn modal-confirm" + (opts.danger ? " btn-danger" : " btn-primary");

    if (opts.input !== undefined) {
      const input = body.querySelector("input");
      if (input) setTimeout(function () { input.focus(); input.select(); }, 60);
    } else {
      setTimeout(function () { confirmBtn.focus(); }, 60);
    }

    backdrop.hidden = false;
    requestAnimationFrame(function () { backdrop.classList.add("open"); });

    let lastFocus = document.activeElement;

    function close(result) {
      backdrop.classList.remove("open");
      setTimeout(function () { backdrop.hidden = true; }, 180);
      document.removeEventListener("keydown", onKey);
      activeModal = null;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
      resolve(result);
    }

    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(opts.input !== undefined ? null : false); }
      else if (e.key === "Enter" && opts.input !== undefined && e.target && e.target.tagName === "INPUT") {
        e.preventDefault();
        close(body.querySelector("input").value);
      }
    }
    document.addEventListener("keydown", onKey);

    backdrop.addEventListener("mousedown", function (e) {
      if (e.target === backdrop) close(opts.input !== undefined ? null : false);
    });
    cancelBtn.addEventListener("click", function () { close(opts.input !== undefined ? null : false); });
    confirmBtn.addEventListener("click", function () {
      close(opts.input !== undefined ? body.querySelector("input").value : true);
    });

    let resolve;
    const promise = new Promise(function (r) { resolve = r; });
    activeModal = { close: close };
    return promise;
  }

  ui.modal = {
    confirm: function (opts) {
      return openModal({
        title: opts.title || "Are you sure?",
        bodyHtml: "<p>" + ui.escapeHtml(opts.body || "") + "</p>",
        confirmLabel: opts.confirmLabel || "Confirm",
        cancelLabel: opts.cancelLabel || "Cancel",
        danger: !!opts.danger
      });
    },
    prompt: function (opts) {
      return openModal({
        title: opts.title || "Enter a value",
        bodyHtml:
          '<label class="modal-label">' + ui.escapeHtml(opts.label || "Value") + '</label>' +
          '<input type="text" class="modal-input" maxlength="120" aria-label="' + ui.escapeHtml(opts.label || "Value") + '">',
        input: opts.value || "",
        confirmLabel: opts.confirmLabel || "Save",
        cancelLabel: "Cancel"
      });
    }
  };

  ui.closeModal = function () { if (activeModal) activeModal.close(false); };

  /* ---------------- shared bits ---------------- */

  const CHEVRON =
    '<svg class="dd-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

  function normOptions(list) {
    return (list || []).map(function (o) {
      return typeof o === "string" ? { value: o, label: o } : o;
    });
  }

  /* ---------------- custom dropdown ---------------- */

  /**
   * ui.dropdown(mountEl, {
   *   options: [{value,label,desc?}] | ["a","b"],
   *   value, placeholder, label, className, align ("left"|"right"),
   *   direction ("down"|"up"), onChange(value)
   * }) -> { get(), set(value), setOptions(list), disable(bool) }
   */
  ui.dropdown = function (mount, opts) {
    opts = opts || {};
    let options = normOptions(opts.options);
    let value = opts.value != null ? opts.value : (options[0] ? options[0].value : "");
    let disabled = false;
    let open = false;

    mount.classList.add("dd");
    if (opts.className) mount.classList.add(opts.className);
    if (opts.align === "right") mount.classList.add("align-right");
    if (opts.direction === "up") mount.classList.add("up");

    mount.innerHTML =
      '<button type="button" class="dd-btn" aria-haspopup="listbox" aria-expanded="false">' +
        (opts.label ? '<span class="dd-label">' + ui.escapeHtml(opts.label) + "</span>" : "") +
        '<span class="dd-value"></span>' +
        CHEVRON +
      "</button>" +
      '<div class="dd-menu" role="listbox" aria-label="' + ui.escapeHtml(opts.label || "Options") + '" hidden></div>';

    const btn = mount.querySelector(".dd-btn");
    const valueEl = mount.querySelector(".dd-value");
    const menu = mount.querySelector(".dd-menu");

    function render() {
      const current = options.find(function (o) { return o.value === value; });
      valueEl.textContent = current ? current.label : (opts.placeholder || "Select…");
      menu.innerHTML = options.map(function (o) {
        const sel = o.value === value;
        return '<button type="button" role="option" tabindex="-1" class="dd-opt' + (sel ? " selected" : "") +
          '" data-value="' + ui.escapeHtml(o.value) + '" aria-selected="' + sel + '">' +
          '<span class="dd-opt-body"><span class="dd-opt-label">' + ui.escapeHtml(o.label) + "</span>" +
          (o.desc ? '<span class="dd-opt-desc">' + ui.escapeHtml(o.desc) + "</span>" : "") +
          "</span></button>";
      }).join("");
    }

    function setOpen(v) {
      if (open === v || disabled) return;
      open = v;
      btn.setAttribute("aria-expanded", v ? "true" : "false");
      if (v) {
        menu.hidden = false;
        requestAnimationFrame(function () { menu.classList.add("open"); });
        const sel = menu.querySelector(".dd-opt.selected") || menu.querySelector(".dd-opt");
        if (sel) sel.focus();
      } else {
        menu.classList.remove("open");
        menu.hidden = true;
      }
    }

    function choose(v) {
      value = v;
      render();
      setOpen(false);
      btn.focus();
      if (opts.onChange) opts.onChange(value);
    }

    btn.addEventListener("click", function () { setOpen(!open); });

    btn.addEventListener("keydown", function (e) {
      if (disabled) return;
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
      }
    });

    menu.addEventListener("keydown", function (e) {
      const opts2 = Array.prototype.slice.call(menu.querySelectorAll(".dd-opt"));
      const idx = opts2.indexOf(document.activeElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const n = opts2[idx + 1] || opts2[0];
        if (n) n.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const p = opts2[idx - 1] || opts2[opts2.length - 1];
        if (p) p.focus();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        btn.focus();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (document.activeElement && document.activeElement.classList.contains("dd-opt")) {
          document.activeElement.click();
        }
      } else if (e.key === "Tab") {
        setOpen(false);
      }
    });

    menu.addEventListener("click", function (e) {
      const opt = e.target.closest(".dd-opt");
      if (!opt) return;
      e.preventDefault();
      choose(opt.dataset.value);
    });

    document.addEventListener("click", function (e) {
      if (open && !mount.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && open) { setOpen(false); btn.focus(); }
    });

    render();

    return {
      get: function () { return value; },
      set: function (v) { value = v; render(); },
      setOptions: function (list) {
        options = normOptions(list);
        if (!options.some(function (o) { return o.value === value; })) {
          value = options[0] ? options[0].value : "";
        }
        render();
      },
      disable: function (d) {
        disabled = !!d;
        btn.disabled = disabled;
        mount.classList.toggle("disabled", disabled);
        if (disabled) setOpen(false);
      }
    };
  };

  /* ---------------- popover (button + free-form floating panel) ---------------- */

  /**
   * ui.popover(mountEl, {
   *   buttonHtml, panelHtml, className, ariaLabel,
   *   direction ("down"|"up")
   * }) -> { btn, panel, isOpen, setOpen(v), disable(bool) }
   *
   * Closes on outside click and Escape. Animated via CSS (.pop-panel.open).
   */
  ui.popover = function (mount, opts) {
    opts = opts || {};
    let open = false;
    let disabled = false;

    mount.classList.add("pop");
    if (opts.className) mount.classList.add(opts.className);
    if (opts.direction === "up") mount.classList.add("up");

    mount.innerHTML =
      '<button type="button" class="pop-btn" aria-haspopup="dialog" aria-expanded="false">' +
        (opts.buttonHtml || "") +
        CHEVRON +
      "</button>" +
      '<div class="pop-panel" role="dialog" aria-label="' + ui.escapeHtml(opts.ariaLabel || "Options") + '" hidden>' +
        (opts.panelHtml || "") +
      "</div>";

    const btn = mount.querySelector(".pop-btn");
    const panel = mount.querySelector(".pop-panel");

    function setOpen(v) {
      if (open === v || disabled) return;
      open = v;
      btn.setAttribute("aria-expanded", v ? "true" : "false");
      if (v) {
        panel.hidden = false;
        requestAnimationFrame(function () { panel.classList.add("open"); });
        const f = panel.querySelector("input, select, textarea, button, [tabindex]");
        if (f) f.focus();
        else { panel.setAttribute("tabindex", "-1"); panel.focus(); }
      } else {
        panel.classList.remove("open");
        panel.hidden = true;
      }
    }

    btn.addEventListener("click", function () { setOpen(!open); });

    document.addEventListener("click", function (e) {
      if (open && !mount.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && open) { setOpen(false); btn.focus(); }
    });

    return {
      btn: btn,
      panel: panel,
      get isOpen() { return open; },
      setOpen: setOpen,
      disable: function (d) {
        disabled = !!d;
        btn.disabled = disabled;
        mount.classList.toggle("disabled", disabled);
        if (disabled) setOpen(false);
      }
    };
  };

  LM.ui = ui;
})();
