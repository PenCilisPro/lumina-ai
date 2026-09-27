# Lumina AI

A complete AI chatbot web app built with **HTML5, CSS3 and vanilla JavaScript** — no frameworks, no build step.

Lumina runs entirely in the browser and talks to **your backend**, which holds the provider credentials and proxies requests to any AI provider. **No API keys are stored in the frontend, in browser storage, or in this repository.**

```
Think, create, and explore with Lumina.
```

---

## Quick start

1. **Point Lumina at your backend** — edit `js/config.js`:
   ```javascript
   backend: {
     chatUrl: "/api/chat",      // POST endpoint (OpenAI-compatible)
     testUrl: "/api/health"     // optional GET endpoint for Test Connection
   }
   ```
   Use an absolute URL (`https://api.example.com/api/chat`) if the backend runs on another origin.
2. **Map the models** your backend exposes:
   ```javascript
   models: {
     "Lumina Comet 1.0":  "lumina-comet",   // fast everyday conversations
     "Lumina Aurora 2.0": "lumina-aurora",  // balanced intelligence, speed, and reasoning
     "Lumina Eclipse 3.0": "lumina-eclipse" // highest reasoning capability
   }
   ```
3. **Run the frontend**:
   ```
   python -m http.server 8080
   # then open http://localhost:8080
   ```
4. Verify with **Settings → API → Test Connection**.

---

## Backend contract

Lumina sends an **OpenAI chat-completions compatible** request — most existing proxy/gateway implementations work unchanged:

```http
POST /api/chat
Content-Type: application/json

{
  "model": "lumina-pro",
  "messages": [
    { "role": "system",    "content": "…" },
    { "role": "user",      "content": "…" },
    { "role": "assistant", "content": "…" }
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 4096,
  "reasoning_effort": "medium"      // "low" | "medium" | "high" | "xhigh"
}
```

**Streaming response** (`stream: true`) — standard SSE:

```
data: {"choices":[{"delta":{"content":"Hel"}}]}
data: {"choices":[{"delta":{"content":"lo"}}]}
data: [DONE]
```

**Non-streaming response** (`stream: false`):

```json
{ "choices": [ { "message": { "content": "Hello!" } } ] }
```

**Health check** (optional, used by Test Connection): `GET /api/health` → `200 { "ok": true }`.
Without it, Lumina falls back to a tiny chat ping.

The four thinking levels map to `reasoning_effort` strings defined in `js/config.js → thinkingLevels`. If your provider only supports `low|medium|high`, change `xhigh`'s `effort` to `"high"` there. If the backend rejects reasoning or temperature parameters, Lumina retries the request without them automatically.

Models that stream `reasoning_content` deltas (Nemotron 3, GLM hybrid thinkers, DeepSeek-R1…) automatically get the collapsible "Thought for Ns" deep-thinking block in the UI — no extra wiring needed.

Web search (`web_search: true` in the payload) is served by the bundled backend: it searches DuckDuckGo (no key required), injects the top results as context, and emits `{"lumina_status":"searching_web"|"search_done"}` SSE events the UI renders as status chips. The search host is allowlisted and result URLs are validated (public http/https only).

### Minimal Express example

```javascript
import express from "express";

const app = express();
app.use(express.json());

app.post("/api/chat", async (req, res) => {
  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` // key lives HERE
    },
    body: JSON.stringify({
      ...req.body,
      model: { "lumina-flash": "gpt-4o-mini", "lumina-pro": "gpt-4o", "lumina-ultra": "o3" }[req.body.model],
      reasoning_effort: { low: "low", medium: "medium", high: "high", xhigh: "high" }[req.body.reasoning_effort]
    })
  });

  res.status(upstream.status);
  res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
  Readable.fromWeb(upstream.body).pipe(res); // streams SSE straight through
});
```
(Adjust the model map in the example to whichever provider models you want behind Comet / Aurora / Eclipse.)

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.listen(3000);
```

Enable CORS (or serve Lumina from the same origin) if the frontend and backend run on different ports.

---

## Security notice

> All AI traffic goes through your backend, which owns the provider credentials. The frontend never sees or stores keys. Conversations are saved only in the user's browser (localStorage) and are never sent anywhere except your configured backend endpoint.

---

## Features

**Chat**
- Real multi-turn conversations with full context preservation
- Streaming responses (SSE) with progressive markdown rendering
- Stop generation (real `AbortController` cancellation, partial output kept)
- Regenerate any AI response, edit any user message and resend from that point
- Copy messages, copy code blocks, language-labeled code blocks with syntax highlighting
- Markdown: headings, lists, tables, quotes, links, images, inline code, code fences
- Friendly error handling with expandable technical details

**Conversations**
- New chat, rename, delete (with confirmation), pin
- Search across titles and message contents (debounced, live)
- History grouped by Pinned / Today / Yesterday / Previous 7 days / Older
- Auto-generated titles from the first message (optional)
- Persisted in `localStorage`

**Models & thinking**
- Three selectable chat models (names → backend model IDs in `js/config.js`):
  **Lumina Comet 1.0** (fast), **Lumina Aurora 2.0** (balanced), **Lumina Eclipse 3.0** (highest reasoning)
- Codex-style **thinking slider**: Light · Medium · High · Extra High, sent as `reasoning_effort`
- **Deep thinking**: streamed model reasoning (`reasoning_content`) appears in a collapsible "Thought for Ns" block; hidden chain-of-thought is never mixed into the answer
- Automatic graceful fallback when the backend rejects reasoning/temperature

**Tools**
- **Web search** toggle: the backend runs a keyless DuckDuckGo search on your message and feeds the results to the model as context; the UI shows a "Searching the web…" status chip and answers cite sources as markdown links
- **Lumina Code tab** (`Ctrl/⌘+J`): a Claude Code–style terminal session with its own persisted history, slash commands (`/clear`, `/help`, `/model`), arrow-key prompt recall, and `esc` to interrupt — its two exclusive models are **Lumina Code** (agentic coding persona) and **Lumina Guard** (cybersecurity persona: vulnerability analysis, secure code review, threat modeling, CTF learning; defensive and authorized security work only). Both are routed in `server.js → MODELS` and never exposed to the chat picker

**Interface**
- ChatGPT-style layout: flat sidebar, centered conversation column, soft user bubbles, plain assistant messages
- Custom animated dropdowns for every selector (models, thinking, language, styles…)
- Smooth animations throughout: message entrances, dropdown pop, drawer, modal, toast, theme transitions
- Theme presets: Lumina Dark (default), Midnight, Aurora, Deep Space, Light, Custom + accent colors (Blue + Purple default)
- Full settings page: General, Appearance, AI, Chat, API, About — everything persists
- Responsive: desktop, tablet, mobile (sidebar becomes a drawer)
- Accessible: custom dropdowns and slider are keyboard-navigable, ARIA roles, focus states, Escape closes everything

---

## Project structure

```
Lumina/
├── index.html              Main chat application
├── settings.html           Full settings page
├── css/
│   ├── main.css            Shell, sidebar, topbar, dropdowns, slider, composer, animations
│   ├── chat.css            Messages, markdown, code blocks, syntax tokens
│   ├── settings.css        Settings page
│   ├── code.css            Lumina Code terminal styling
│   └── themes.css          Design tokens, theme/accent palettes, modifiers
├── js/
│   ├── config.js           ★ THE file to edit: backend URL, models, defaults, thinking levels
│   ├── ui.js               Shared utils: toast, modals, clipboard, custom dropdown
│   ├── storage.js          localStorage: conversations + settings
│   ├── markdown.js         Self-contained markdown renderer + syntax highlighter
│   ├── api.js              Backend adapter: OpenAI-compatible request building + SSE parsing
│   ├── ai.js               Payload building, friendly error mapping, connection test
│   ├── chat.js             Chat UI: composer, streaming, stop, regenerate, edit, copy
│   ├── code.js             Lumina Code tab: terminal session, slash commands, model pills
│   ├── app.js              App shell: sidebar, search, groups, context menu, drawer, view switching
│   ├── themes.js           Theme engine (appearance settings → CSS variables)
│   └── settings.js         Settings page logic
├── assets/
│   └── lumina-logo.svg     Quarter-moon logo
└── README.md
```

## Browser support

Modern evergreen browsers (Chrome, Edge, Firefox, Safari). Serve over HTTP(S) — both `python -m http.server` and any static server work. If the backend runs on another origin, enable CORS for the frontend origin.
