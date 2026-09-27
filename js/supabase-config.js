/* ==========================================================================
   Lumina AI — Supabase configuration
   --------------------------------------------------------------------------
   Fill these in from your Supabase dashboard (Project Settings → API):
     url      → "Project URL",  e.g. "https://abcd1234.supabase.co"
     anonKey  → the "anon" / publishable key

   The anon key is a PUBLISHABLE key: it is designed to live in browser
   code and is safe to commit. It only grants what your Row Level Security
   policies allow — never paste the service_role (secret) key here.

   While url/anonKey are empty, Lumina runs exactly as before (no login).
   Once both are filled in, login.html activates and — with `required`
   left true — the chat and settings pages require signing in.
   ========================================================================== */

window.LM = window.LM || {};

const LUMINA_SUPABASE = {
  url: "",      // <<< paste your Project URL here
  anonKey: "",  // <<< paste your anon / publishable key here

  /* When true (and the keys above are set), index.html and settings.html
     redirect visitors without a session to login.html. Set to false to
     keep Lumina usable while still offering the login page.               */
  required: true,

  /* Where password-reset (and other auth) emails send the user back to.
     Add this exact URL to Authentication → URL Configuration →
     Redirect URLs in your Supabase dashboard.                             */
  redirectTo: (typeof location !== "undefined" ? location.origin + "/login.html" : "")
};

LM.supabaseConfig = LUMINA_SUPABASE;
