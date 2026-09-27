/* ==========================================================================
   Lumina AI — Central Configuration
   --------------------------------------------------------------------------
   Lumina talks to YOUR backend. No API keys live in the frontend — the
   backend holds provider credentials and proxies requests to your provider.

   BACKEND CONTRACT
     POST {backend.chatUrl}
       body: {
         model:            "<model id from LUMINA_CONFIG.models>",
         messages:         [{ role: "system"|"user"|"assistant", content }],
         stream:           true|false,
         temperature:      0..2,
         max_tokens:       number,
         reasoning_effort: "low"|"medium"|"high"|"xhigh"
       }
       response: OpenAI chat-completions compatible.
         stream=true  -> SSE  "data: {choices:[{delta:{content}}]}" ... "data: [DONE]"
         stream=false -> JSON { choices:[{ message:{ content } }] }

     GET {backend.testUrl}  (optional) -> 200 { ok: true } used by Test Connection

   To change what "Light/Medium/High/Extra High" send, edit the `effort`
   strings in thinkingLevels below.
   ========================================================================== */

window.LM = window.LM || {};

const LUMINA_CONFIG = {

  /* ------------------------------------------------------------------
   * 1) BACKEND  <<< POINT THIS AT YOUR SERVER >>>
   *    Relative URL ("...") = same origin as the app.
   *    Absolute URL ("https://api.example.com/api/chat") for a separate host.
   * ------------------------------------------------------------------ */
  backend: {
    chatUrl: "/api/chat",
    testUrl: "/api/health"
  },

  /* ------------------------------------------------------------------
   * 2) MODELS
   *    Map each Lumina model name to the model ID your backend expects.
   *    The backend is responsible for routing these to the real provider.
   * ------------------------------------------------------------------ */
  models: {
    "Lumina Comet 1.0": "lumina-comet",
    "Lumina Aurora 2.0": "lumina-aurora",
    "Lumina Eclipse 3.0": "lumina-eclipse"
  },

  /* Short descriptions shown in the model picker popup.
     Keys must match the model names above.
     NOTE: "lumina-code" (Lumina Code) and "lumina-guard" (Lumina Guard)
     are NOT chat models — they live only in the Lumina Code tab and are
     routed by server/server.js.                                       */
  modelDescriptions: {
    "Lumina Comet 1.0": "Fast everyday conversations",
    "Lumina Aurora 2.0": "Balanced intelligence, speed, and reasoning",
    "Lumina Eclipse 3.0": "Highest reasoning capability"
  },

  /* Old model names found in a user's localStorage are renamed
     automatically to the keys above when Lumina starts.               */
  legacyModelNames: {
    "Lumina Flash 1.0": "Lumina Comet 1.0",
    "Lumina Pro 2.0": "Lumina Aurora 2.0",
    "Lumina Ultra 3.0": "Lumina Eclipse 3.0",
    "Lumina Code 1.0": "Lumina Aurora 2.0"
  },

  /* ------------------------------------------------------------------
   * 3) DEFAULTS
   * ------------------------------------------------------------------ */
  defaults: {
    model: "Lumina Aurora 2.0",
    thinking: "medium"
  },

  /* Max output tokens per AI response (sent to the backend)            */
  maxTokens: 4096,

  /* Hard request timeout in milliseconds
     (NVIDIA free-tier queues can hold requests for a minute or more)   */
  requestTimeout: 180000,

  /* How many recent conversation messages are sent as context          */
  contextMessages: 30,

  version: "1.3.0"
};

/* --------------------------------------------------------------------
 * 4) THINKING LEVELS — the slider's four stops.
 *    `effort` is the value sent as reasoning_effort. Change the strings
 *    to whatever your backend understands (e.g. map xhigh -> "high"
 *    for an OpenAI-compatible pass-through).
 * ------------------------------------------------------------------ */
LUMINA_CONFIG.thinkingLevels = {
  light:  { label: "Light",      effort: "low",    desc: "Fast responses with minimal reasoning" },
  medium: { label: "Medium",     effort: "medium", desc: "Balanced speed and reasoning" },
  high:   { label: "High",       effort: "high",   desc: "Deep reasoning for complex tasks" },
  xhigh:  { label: "Extra High", effort: "xhigh",  desc: "Maximum reasoning effort" }
};
LUMINA_CONFIG.thinkingOrder = ["light", "medium", "high", "xhigh"];

/* Expose as the single global config */
LM.config = LUMINA_CONFIG;
