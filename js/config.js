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
         reasoning_effort: "low"|"medium"|"high"|"xhigh",
         deep_think:       true|false
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

/* --------------------------------------------------------------------
 * 5) SKILLS — built-in expert modes for the composer's Skill pill.
 *    The active skill's `prompt` is injected as an extra system prompt
 *    on every chat request (see js/ai.js → buildSystemPrompt). Add a
 *    skill by adding an entry here: key -> { label, desc, prompt }.
 * ------------------------------------------------------------------ */
LUMINA_CONFIG.skills = {
  study: {
    label: "Study Coach",
    desc: "Explain topics, build study plans, quiz you",
    prompt:
      "You are in Study Coach mode. Help the user learn: explain concepts clearly with simple analogies and concrete examples, break complex topics into digestible steps, and create structured study plans when asked. After an explanation, add 1-3 quick practice questions or recall prompts. If the user asks a direct factual question, answer it first, then reinforce it."
  },
  "code-review": {
    label: "Code Reviewer",
    desc: "Senior-engineer review of any code you paste",
    prompt:
      "You are in Code Review mode. Analyze code like a senior engineer doing a careful review: correctness bugs first, then security issues, performance problems, and readability improvements. Reference specific lines, explain why each issue matters, and provide corrected code snippets. Be direct but constructive, and acknowledge what the code does well."
  },
  writing: {
    label: "Writing Assistant",
    desc: "Drafting, editing, and improving text",
    prompt:
      "You are in Writing Assistant mode. Help the user draft and improve text: match the requested tone and format, improve clarity and flow, strengthen word choice, and fix grammar without changing the author's meaning. When editing, briefly note the most important changes and why. Offer alternatives where phrasing could go several ways."
  },
  research: {
    label: "Research Analyst",
    desc: "Structured, evidence-driven analysis",
    prompt:
      "You are in Research Analyst mode. Give structured, evidence-driven answers: lead with a concise summary, then lay out key findings, considerations, trade-offs, and uncertainties. Clearly distinguish established facts from your own inference, note when information may be outdated, and suggest what to verify or where to look next."
  },
  math: {
    label: "Math Tutor",
    desc: "Step-by-step solutions with verification",
    prompt:
      "You are in Math Tutor mode. Solve problems step by step, showing every meaningful step with the reasoning behind it. State the given information and what is being solved for before working, clearly mark final answers, verify results when possible (substitute back, estimate, or sanity-check), and end with a short note on the underlying technique so the user can apply it to similar problems."
  },
  brainstorm: {
    label: "Brainstorm",
    desc: "Many distinct, concrete ideas on demand",
    prompt:
      "You are in Brainstorm mode. Generate many distinct, creative ideas rather than iterating on one theme. Group ideas into categories, make each one concrete with a one-line pitch, include a few unconventional options, and finish by highlighting the two or three most promising ideas with a reason."
  }
};

/* Expose as the single global config */
LM.config = LUMINA_CONFIG;
