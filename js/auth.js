/* ==========================================================================
   Lumina AI — Supabase authentication
   --------------------------------------------------------------------------
   LM.auth powers the login/signup page (login.html) and gates the app
   pages (index.html, settings.html) when js/supabase-config.js is filled
   in. While the config is empty everything is a no-op and Lumina behaves
   exactly like the un-authenticated version.

   Only the publishable anon key is used here — never the service_role key.
   ========================================================================== */
(function () {
  "use strict";
  window.LM = window.LM || {};

  const VENDOR_PATH = "js/vendor/supabase.js";
  const CDN_FALLBACK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
  const LOGIN_PAGE = "login.html";

  let client = null;
  let clientPromise = null;

  function isConfigured() {
    const cfg = LM.supabaseConfig || {};
    return !!(cfg.url && cfg.anonKey);
  }

  function gatingEnabled() {
    return isConfigured() && (LM.supabaseConfig || {}).required !== false;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { s.remove(); reject(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
  }

  function getClient() {
    if (client) return Promise.resolve(client);
    if (!isConfigured()) return Promise.resolve(null);
    if (!clientPromise) {
      clientPromise = (async function () {
        if (!window.supabase || !window.supabase.createClient) {
          try {
            await loadScript(VENDOR_PATH);
          } catch (e) {
            await loadScript(CDN_FALLBACK);
          }
        }
        if (!window.supabase || !window.supabase.createClient) {
          throw new Error("The Supabase client library could not be loaded.");
        }
        client = window.supabase.createClient(LM.supabaseConfig.url, LM.supabaseConfig.anonKey, {
          auth: { persistSession: true, detectSessionInUrl: true }
        });
        return client;
      })().catch(function (err) {
        clientPromise = null;
        throw err;
      });
    }
    return clientPromise;
  }

  function requireClient() {
    return getClient().then(function (c) {
      if (!c) throw new Error("Supabase is not configured — fill in js/supabase-config.js.");
      return c;
    });
  }

  async function getSession() {
    const c = await getClient();
    if (!c) return null;
    try {
      const res = await c.auth.getSession();
      return res && res.data ? res.data.session : null;
    } catch (e) {
      return null;
    }
  }

  /* ---------------- friendly error messages ---------------- */

  function friendlyError(err) {
    const raw = (err && (err.message || err.msg)) || String(err || "Something went wrong.");
    const map = {
      "invalid login credentials": "Wrong email or password.",
      "email not confirmed": "Please confirm your email first — check your inbox.",
      "user already registered": "An account with this email already exists — try signing in.",
      "email rate limit exceeded": "Too many emails sent. Please wait a minute and try again.",
      "over_request_rate_limit": "Too many attempts. Please wait a moment and try again.",
      "user banned": "This account has been disabled.",
      "signups not allowed": "New sign-ups are currently disabled on this server."
    };
    const lower = raw.toLowerCase();
    for (const key in map) {
      if (lower.indexOf(key) >= 0) return map[key];
    }
    if (/password/i.test(lower) && /at least|too weak|short/i.test(lower)) {
      return "Password is too weak — " + raw;
    }
    return raw;
  }

  /* ---------------- auth actions ---------------- */

  async function signUp(email, password) {
    const c = await requireClient();
    const res = await c.auth.signUp({ email: email, password: password });
    if (res.error) throw res.error;
    return res.data; // { user, session } — session is null when email confirmation is on
  }

  async function signIn(email, password) {
    const c = await requireClient();
    const res = await c.auth.signInWithPassword({ email: email, password: password });
    if (res.error) throw res.error;
    return res.data;
  }

  async function signOut() {
    const c = await requireClient();
    const res = await c.auth.signOut();
    if (res && res.error) throw res.error;
  }

  async function requestPasswordReset(email) {
    const c = await requireClient();
    const redirectTo = (LM.supabaseConfig || {}).redirectTo || location.origin + "/" + LOGIN_PAGE;
    const res = await c.auth.resetPasswordForEmail(email, { redirectTo: redirectTo });
    if (res.error) throw res.error;
    return res.data;
  }

  async function updatePassword(newPassword) {
    const c = await requireClient();
    const res = await c.auth.updateUser({ password: newPassword });
    if (res.error) throw res.error;
    return res.data;
  }

  /* ---------------- profile UI (data-attribute driven) ---------------- */

  function applyProfileUI(session) {
    const email = session && session.user ? (session.user.email || "Signed in") : null;
    document.querySelectorAll("[data-auth-email]").forEach(function (el) {
      el.textContent = email || el.getAttribute("data-auth-fallback") || "Local workspace";
    });
    document.querySelectorAll("[data-auth-sub]").forEach(function (el) {
      el.textContent = email
        ? (el.getAttribute("data-auth-sub-label") || "Signed in")
        : (el.getAttribute("data-auth-fallback") || "Runs in your browser");
    });
    document.querySelectorAll("[data-auth-avatar]").forEach(function (el) {
      el.textContent = email ? email.charAt(0).toUpperCase() : (el.getAttribute("data-auth-fallback") || "L");
    });
    document.querySelectorAll("[data-auth-signout]").forEach(function (b) { b.hidden = !email; });
    document.querySelectorAll("[data-auth-signedin-only]").forEach(function (el) {
      el.hidden = !email;
    });
  }

  /* ---------------- page gate ----------------
     page "app":  redirect to login when required and no session,
                  otherwise fill the profile UI.
     page "auth": redirect to the app when already signed in
                  (skipped while a password-recovery link is being used).  */

  function nextPage() {
    try {
      const next = new URLSearchParams(location.search).get("next");
      if (next && next.charAt(0) === "/" && next.charAt(1) !== "/") return next;
    } catch (e) { /* ignore malformed URLs */ }
    return "index.html";
  }

  function bindSignOutButtons() {
    document.querySelectorAll("[data-auth-signout]").forEach(function (b) {
      if (b.dataset.authBound) return;
      b.dataset.authBound = "1";
      b.addEventListener("click", function () {
        signOut().catch(function (err) {
          console.error("[auth] sign out failed", err);
        });
      });
    });
  }

  async function gate(page) {
    if (!isConfigured()) return null;

    let c = null;
    try { c = await getClient(); }
    catch (err) { console.error("[auth] client init failed", err); return null; }
    if (!c) return null;

    const recovery = /type=recovery/.test(location.hash);

    let session = null;
    try { session = await getSession(); }
    catch (err) { console.error("[auth] session lookup failed", err); }

    if (page === "app") {
      c.auth.onAuthStateChange(function (event, sess) {
        if (event === "SIGNED_OUT" && gatingEnabled()) {
          location.replace(LOGIN_PAGE);
          return;
        }
        applyProfileUI(event === "SIGNED_OUT" ? null : sess);
      });
      if (!session && gatingEnabled()) {
        location.replace(LOGIN_PAGE + "?next=" + encodeURIComponent(location.pathname + location.search));
        return null;
      }
      bindSignOutButtons();
      applyProfileUI(session);
      return session;
    }

    /* page === "auth" */
    if (session && !recovery) {
      location.replace(nextPage());
      return session;
    }
    return session;
  }

  LM.auth = {
    isConfigured: isConfigured,
    getClient: getClient,
    getSession: getSession,
    gate: gate,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    requestPasswordReset: requestPasswordReset,
    updatePassword: updatePassword,
    friendlyError: friendlyError,
    applyProfileUI: applyProfileUI
  };
})();
