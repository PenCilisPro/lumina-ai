/* Lumina AI — Markdown renderer + lightweight syntax highlighter.
   Self-contained (no external libraries): works offline, escapes all raw
   HTML in the source text, and renders headings, lists, tables, quotes,
   links, images, inline code and fenced code blocks with highlighting. */
(function () {
  "use strict";
  window.LM = window.LM || {};

  const esc = function (s) { return LM.ui.escapeHtml(s); };

  /* ====================================================================
   * Syntax highlighting
   * ==================================================================== */
  const RULES = {};
  const add = function (id, rules) { RULES[id] = rules; };

  const num = "\\b0[xX][0-9a-fA-F]+\\b|\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b";
  const rx = function (src, flags) { return new RegExp(src, (flags || "") + "y"); };

  add("javascript", [
    ["com", rx("\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/")],
    ["str", rx("\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'|`(?:\\\\.|[^`\\\\])*`")],
    ["num", rx(num)],
    ["kw", rx("\\b(?:abstract|arguments|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|function|get|if|implements|import|in|instanceof|interface|let|new|of|package|private|protected|public|return|set|static|super|switch|this|throw|try|typeof|var|void|while|with|yield)\\b")],
    ["lit", rx("\\b(?:true|false|null|undefined|NaN|Infinity)\\b")],
    ["fn", rx("\\b[A-Za-z_$][\\w$]*(?=\\s*\\()")]
  ]);
  add("typescript", RULES.javascript.concat([
    ["kw", rx("\\b(?:any|as|boolean|declare|is|keyof|namespace|never|number|object|readonly|string|symbol|type|unknown)\\b")]
  ]));
  add("python", [
    ["com", rx("#[^\\n]*")],
    ["str", rx("\"\"\"[\\s\\S]*?\"\"\"|'''[\\s\\S]*?'''|\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'")],
    ["num", rx(num)],
    ["kw", rx("\\b(?:and|as|assert|async|await|break|case|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|match|nonlocal|not|or|pass|raise|return|try|while|with|yield)\\b")],
    ["lit", rx("\\b(?:True|False|None|self|cls)\\b")],
    ["fn", rx("\\b[A-Za-z_]\\w*(?=\\s*\\()")]
  ]);
  add("json", [
    ["key", rx("\"(?:\\\\.|[^\"\\\\])*\"(?=\\s*:)")],
    ["str", rx("\"(?:\\\\.|[^\"\\\\])*\"")],
    ["num", rx(num)],
    ["lit", rx("\\b(?:true|false|null)\\b")]
  ]);
  add("html", [
    ["com", rx("<!--[\\s\\S]*?-->")],
    ["str", rx("\"[^\"]*\"|'[^']*'")],
    ["tag", rx("<\\/?[A-Za-z][\\w-]*|\\/?>")],
    ["attr", rx("[A-Za-z-]+(?=\\s*=)")],
    ["doctype", rx("<!(?:DOCTYPE|doctype)[^>]*>")]
  ]);
  add("css", [
    ["com", rx("\\/\\*[\\s\\S]*?\\*\\/")],
    ["str", rx("\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'")],
    ["kw", rx("@[\\w-]+|!important")],
    ["attr", rx("[-A-Za-z]+(?=\\s*:)")],
    ["num", rx("#[0-9a-fA-F]{3,8}\\b|\\b\\d+(?:\\.\\d+)?(?:px|em|rem|%|vh|vw|vmin|vmax|s|ms|deg|fr|ch|ex|pt)?\\b")],
    ["fn", rx("\\b[a-zA-Z-]+(?=\\()")]
  ]);
  add("bash", [
    ["com", rx("#[^\\n]*")],
    ["str", rx("\"(?:\\\\.|[^\"\\\\\\n])*\"|'[^'\\n]*'")],
    ["lit", rx("\\$\\{[^}]*\\}|\\$\\w+")],
    ["kw", rx("\\b(?:if|then|else|elif|fi|for|while|in|do|done|case|esac|function|select|until|return|export|source|alias|local|readonly|declare|set|unset|shift)\\b")],
    ["fn", rx("\\b(?:echo|cd|ls|cat|grep|sed|awk|curl|wget|mkdir|rmdir|rm|cp|mv|chmod|chown|sudo|apt|apt-get|brew|npm|npx|node|python|pip|git|docker|make|tar|zip|unzip|ssh|kill|ps|head|tail|sort|uniq|wc|xargs|find|touch|ln|pwd|which|man)\\b")]
  ]);
  add("sql", [
    ["com", rx("--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/")],
    ["str", rx("'(?:''|[^'])*'")],
    ["num", rx(num)],
    ["kw", rx("\\b(?:add|all|alter|and|as|asc|between|by|case|check|column|constraint|create|cross|database|default|delete|desc|distinct|drop|else|end|escape|exists|foreign|from|full|group|having|if|in|index|inner|insert|into|is|join|key|left|like|limit|not|null|offset|on|or|order|outer|primary|references|right|select|set|table|then|to|union|unique|update|values|view|when|where|with)\\b", "i")]
  ]);
  add("java", [
    ["com", rx("\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/")],
    ["str", rx("\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'")],
    ["num", rx(num)],
    ["kw", rx("\\b(?:abstract|boolean|break|byte|case|catch|char|class|continue|default|do|double|else|enum|extends|final|finally|float|for|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while|var|record|sealed)\\b")],
    ["lit", rx("\\b(?:true|false|null)\\b")],
    ["fn", rx("\\b[A-Za-z_$][\\w$]*(?=\\s*\\()")]
  ]);
  add("c", [
    ["com", rx("\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/")],
    ["str", rx("\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'")],
    ["num", rx(num)],
    ["kw", rx("\\b(?:auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|restrict|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|bool|class|namespace|new|delete|template|typename|public|private|protected|virtual|override|nullptr)\\b")],
    ["lit", rx("\\b(?:true|false|NULL|nullptr)\\b")],
    ["fn", rx("\\b[A-Za-z_]\\w*(?=\\s*\\()")]
  ]);
  RULES.cpp = RULES.c;
  add("csharp", RULES.java.concat([
    ["kw", rx("\\b(?:as|base|checked|decimal|delegate|event|explicit|extern|fixed|foreach|goto|implicit|in|internal|is|lock|namespace|object|operator|out|override|params|readonly|ref|sbyte|sealed|sizeof|stackalloc|string|struct|typeof|uint|ulong|unchecked|unsafe|ushort|using|virtual)\\b")]
  ]));
  add("go", [
    ["com", rx("\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/")],
    ["str", rx("\"(?:\\\\.|[^\"\\\\\\n])*\"|`[^`]*`")],
    ["num", rx(num)],
    ["kw", rx("\\b(?:break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go|goto|if|import|interface|map|package|range|return|select|struct|switch|type|var)\\b")],
    ["lit", rx("\\b(?:nil|true|false|iota)\\b")],
    ["fn", rx("\\b[A-Za-z_]\\w*(?=\\s*\\()")]
  ]);
  add("rust", [
    ["com", rx("\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/")],
    ["str", rx("\"(?:\\\\.|[^\"\\\\\\n])*\"")],
    ["num", rx(num)],
    ["kw", rx("\\b(?:as|async|await|break|const|continue|crate|dyn|else|enum|extern|fn|for|if|impl|in|let|loop|match|mod|move|mut|pub|ref|return|static|struct|super|trait|type|unsafe|use|where|while)\\b")],
    ["lit", rx("\\b(?:true|false|Some|None|Ok|Err|self|Self)\\b")],
    ["fn", rx("\\b[A-Za-z_]\\w*(?=\\s*[(!])")]
  ]);
  add("php", [
    ["com", rx("\\/\\/[^\\n]*|#[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/")],
    ["str", rx("\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'")],
    ["num", rx(num)],
    ["kw", rx("\\b(?:abstract|and|array|as|break|callable|case|catch|class|clone|const|continue|declare|default|do|echo|else|elseif|empty|extends|final|finally|fn|for|foreach|function|global|goto|if|implements|include|instanceof|interface|isset|list|match|namespace|new|or|print|private|protected|public|require|return|static|switch|throw|trait|try|unset|use|var|while|xor|yield)\\b")],
    ["lit", rx("\\b(?:true|false|null|TRUE|FALSE|NULL)\\b")],
    ["fn", rx("\\b[A-Za-z_]\\w*(?=\\s*\\()")]
  ]);
  add("ruby", [
    ["com", rx("#[^\\n]*")],
    ["str", rx("\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'")],
    ["num", rx(num)],
    ["kw", rx("\\b(?:alias|and|begin|break|case|class|def|do|else|elsif|end|ensure|for|if|in|module|next|not|or|redo|rescue|retry|return|super|then|undef|unless|until|when|while|yield|require|attr_accessor|attr_reader|attr_writer|puts|p)\\b")],
    ["lit", rx("\\b(?:true|false|nil|self)\\b")],
    ["fn", rx("\\b[A-Za-z_]\\w*(?=\\s*\\()")]
  ]);
  add("yaml", [
    ["com", rx("#[^\\n]*")],
    ["key", rx("^[ \\t]*[-]?[ \\t]*[\\w.-]+(?=\\s*:)", "m")],
    ["str", rx("\"(?:\\\\.|[^\"\\\\\\n])*\"|'[^'\\n]*'")],
    ["num", rx(num)],
    ["lit", rx("\\b(?:true|false|null|yes|no|on|off)\\b", "i")]
  ]);
  const GENERIC = [
    ["com", rx("\\/\\/[^\\n]*|#[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/")],
    ["str", rx("\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'")],
    ["num", rx(num)]
  ];

  const ALIASES = {
    javascript: "javascript", js: "javascript", jsx: "javascript", mjs: "javascript", node: "javascript",
    typescript: "typescript", ts: "typescript", tsx: "typescript",
    python: "python", py: "python",
    json: "json", html: "html", xml: "html", svg: "html", vue: "html",
    css: "css", scss: "css", sass: "css", less: "css",
    bash: "bash", sh: "bash", shell: "bash", zsh: "bash", console: "bash", powershell: "bash",
    sql: "sql", java: "java", c: "c", cpp: "c", "c++": "c", h: "c", hpp: "c",
    csharp: "csharp", "c#": "csharp", cs: "csharp",
    go: "go", golang: "go", rust: "rust", rs: "rust",
    php: "php", ruby: "ruby", rb: "ruby", yaml: "yaml", yml: "yaml"
  };

  const LABELS = {
    javascript: "JavaScript", typescript: "TypeScript", python: "Python", json: "JSON",
    html: "HTML", css: "CSS", bash: "Bash", sql: "SQL", java: "Java", c: "C / C++",
    csharp: "C#", go: "Go", rust: "Rust", php: "PHP", ruby: "Ruby", yaml: "YAML"
  };

  function tokenize(code, rules) {
    let out = "", plain = "", pos = 0;
    const n = code.length;
    const flush = function () {
      if (plain) { out += esc(plain); plain = ""; }
    };
    while (pos < n) {
      let hit = null, hitType = "";
      for (let i = 0; i < rules.length; i++) {
        const r = rules[i];
        r[1].lastIndex = pos;
        const m = r[1].exec(code);
        if (m && m.index === pos && m[0].length > 0) { hit = m[0]; hitType = r[0]; break; }
      }
      if (hit) {
        flush();
        out += '<span class="tok-' + hitType + '">' + esc(hit) + "</span>";
        pos += hit.length;
      } else {
        plain += code.charAt(pos);
        pos++;
      }
    }
    flush();
    return out;
  }

  function highlight(code, lang) {
    const id = ALIASES[(lang || "").toLowerCase()];
    const rules = id ? RULES[id] : GENERIC;
    try {
      return tokenize(code, rules);
    } catch (e) {
      return esc(code);
    }
  }

  function prettyLang(lang) {
    const id = ALIASES[(lang || "").toLowerCase()];
    if (id && LABELS[id]) return LABELS[id];
    if (!lang) return "Code";
    return lang.charAt(0).toUpperCase() + lang.slice(1);
  }

  /* ====================================================================
   * Markdown parsing
   * ==================================================================== */
  const BLOCK_RE = /^\s*\u0001B\d+\u0001\s*$/;
  const LIST_RE = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;

  function indentOf(line) {
    const m = line.match(/^[ \t]*/);
    return m ? m[0].replace(/\t/g, "  ").length : 0;
  }

  function isSafeUrl(u) {
    const clean = String(u).replace(/&amp;/g, "&").trim();
    if (/^https?:\/\//i.test(clean)) return true;
    if (/^mailto:/i.test(clean)) return true;
    if (/^data:image\//i.test(clean)) return true;
    if (clean.indexOf(":") === -1) return true; /* relative URL */
    return false;
  }

  function codeBlockHtml(block) {
    const lang = block.lang || "";
    return (
      '<div class="code-block" data-lang="' + esc(lang) + '">' +
        '<div class="code-head">' +
          '<span class="code-lang">' + esc(prettyLang(lang)) + "</span>" +
          '<button type="button" class="code-copy" data-code-copy aria-label="Copy code">Copy</button>' +
        "</div>" +
        "<pre><code class=\"code-body\">" + highlight(block.code, lang) + "</code></pre>" +
      "</div>"
    );
  }

  function inline(text) {
    let s = esc(text);
    const codes = [];

    /* code spans first so their contents are never formatted */
    s = s.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, function (m, ticks, inner) {
      let t = inner;
      if (t.length > 2 && t.charAt(0) === " " && t.charAt(t.length - 1) === " ") t = t.slice(1, -1);
      codes.push(t);
      return "\u0001C" + (codes.length - 1) + "\u0001";
    });

    s = s.replace(/\*\*([^\n]+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^\w\\])__([^\n]+?)__(?!\w)/g, "$1<strong>$2</strong>");
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    s = s.replace(/(^|[^\w\\])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
    s = s.replace(/~~([^\n]+?)~~/g, "<del>$1</del>");

    /* images, links and bare URLs in a single pass */
    s = s.replace(
      /(!?\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\))|(https?:\/\/[^\s<>()\[\]{}]+)/g,
      function (m, mdlink, label, url, bare) {
        if (bare) {
          if (!isSafeUrl(bare)) return m;
          return '<a href="' + bare + '" target="_blank" rel="noopener noreferrer">' + bare + "</a>";
        }
        if (mdlink.charAt(0) === "!") {
          if (!isSafeUrl(url)) return label || "";
          return '<img class="md-img" src="' + url + '" alt="' + (label || "") + '" loading="lazy">';
        }
        if (!isSafeUrl(url)) return label || "";
        return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + (label || "") + "</a>";
      }
    );

    /* restore code spans */
    s = s.replace(/\u0001C(\d+)\u0001/g, function (m, i) {
      return "<code>" + codes[parseInt(i, 10)] + "</code>";
    });

    return s;
  }

  function parseTable(lines, i) {
    const splitRow = function (row) {
      let r = row.trim();
      if (r.charAt(0) === "|") r = r.slice(1);
      if (r.charAt(r.length - 1) === "|") r = r.slice(0, -1);
      return r.split("|").map(function (c) { return c.trim(); });
    };
    const header = splitRow(lines[i]);
    const seps = splitRow(lines[i + 1]);
    const aligns = header.map(function (_, idx) {
      const s = seps[idx] || "";
      if (/^:-+:$/.test(s)) return "center";
      if (/^-+:$/.test(s)) return "right";
      return "left";
    });
    let html = '<div class="md-table-wrap"><table><thead><tr>';
    header.forEach(function (h, idx) {
      html += '<th style="text-align:' + aligns[idx] + '">' + inline(h) + "</th>";
    });
    html += "</tr></thead><tbody>";
    let j = i + 2;
    while (j < lines.length && lines[j].indexOf("|") !== -1 && !/^\s*$/.test(lines[j]) && !BLOCK_RE.test(lines[j])) {
      const cells = splitRow(lines[j]);
      html += "<tr>";
      header.forEach(function (_, idx) {
        html += '<td style="text-align:' + aligns[idx] + '">' + inline(cells[idx] || "") + "</td>";
      });
      html += "</tr>";
      j++;
    }
    html += "</tbody></table></div>";
    return { html: html, next: j };
  }

  function isSimpleLine(l) {
    return (
      !LIST_RE.test(l) && !BLOCK_RE.test(l) && !/^#{1,6}\s/.test(l) &&
      !/^\s*>/.test(l) && l.indexOf("|") === -1
    );
  }

  function renderListAt(lines, i) {
    const first = lines[i].match(LIST_RE);
    const base = first ? indentOf(lines[i]) : 0;
    const ordered = first ? /\d/.test(first[2]) : false;
    let html = "";
    let idx = i;
    while (idx < lines.length) {
    const line = lines[idx];
    if (/^\s*$/.test(line)) {
      let j = idx;
      while (j < lines.length && /^\s*$/.test(lines[j])) j++;
      if (j < lines.length) {
        const nm = lines[j].match(LIST_RE);
        if (nm && indentOf(lines[j]) >= base && (/\d/.test(nm[2])) === ordered) { idx = j; continue; }
      }
      break;
    }
    const m = line.match(LIST_RE);
    if (m && indentOf(line) === base) {
      const contentLines = [m[3]];
      idx++;
      while (idx < lines.length && !/^\s*$/.test(lines[idx]) && indentOf(lines[idx]) > base) {
        contentLines.push(lines[idx].slice(Math.min(indentOf(lines[idx]), base + 2)));
        idx++;
      }
      const firstIsSimple = isSimpleLine(contentLines[0]);
      let inner;
      if (contentLines.length === 1 && firstIsSimple) {
        inner = inline(contentLines[0]);
      } else if (firstIsSimple) {
        inner = inline(contentLines[0]) + renderBlocks(contentLines.slice(1));
      } else {
        inner = renderBlocks(contentLines);
      }
      html += "<li>" + inner + "</li>";
      continue;
    }
    break;
    }
    const tag = ordered ? "ol" : "ul";
    return { html: "<" + tag + ">" + html + "</" + tag + ">", next: idx };
  }

  function isBlockStart(line) {
    return (
      /^\s*$/.test(line) ||
      /^#{1,6}\s/.test(line) ||
      /^\s*>/.test(line) ||
      BLOCK_RE.test(line) ||
      LIST_RE.test(line) ||
      /^\s*(?:[-*_]\s*){3,}$/.test(line)
    );
  }

  function renderBlocks(lines) {
    let html = "";
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*$/.test(line)) { i++; continue; }

      let m = line.match(/^(#{1,6})\s+(.*)$/);
      if (m) {
        const lvl = m[1].length;
        html += "<h" + lvl + ">" + inline(m[2].replace(/\s+#+\s*$/, "")) + "</h" + lvl + ">";
        i++;
        continue;
      }

      if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) { html += "<hr>"; i++; continue; }

      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s*>\s?/, ""));
          i++;
        }
        html += "<blockquote>" + renderBlocks(buf) + "</blockquote>";
        continue;
      }

      if (BLOCK_RE.test(line)) {
        const bi = parseInt(line.replace(/[^0-9]/g, ""), 10);
        html += codeBlockHtml(currentBlocks[bi]);
        i++;
        continue;
      }

      if (
        line.indexOf("|") !== -1 && i + 1 < lines.length &&
        /^\s*\|?\s*:?-{2,}[\s:|-]*$/.test(lines[i + 1]) && lines[i + 1].indexOf("|") !== -1
      ) {
        const t = parseTable(lines, i);
        html += t.html;
        i = t.next;
        continue;
      }

      if (LIST_RE.test(line)) {
        const r = renderListAt(lines, i);
        html += r.html;
        i = r.next;
        continue;
      }

      /* paragraph */
      const p = [];
      while (i < lines.length && !isBlockStart(lines[i])) {
        p.push(lines[i]);
        i++;
      }
      if (p.length) html += "<p>" + p.map(inline).join("<br>") + "</p>";
      else i++;
    }
    return html;
  }

  let currentBlocks = [];

  function render(src) {
    if (src == null || src === "") return "";
    currentBlocks = [];
    let text = String(src).replace(/\r\n?/g, "\n");
    text = text.replace(/```([^\n`]*)\n?([\s\S]*?)(?:```|$)/g, function (m, info, code) {
      currentBlocks.push({
        lang: (info || "").trim().split(/\s+/)[0].toLowerCase(),
        code: code.replace(/\n$/, "")
      });
      return "\n\u0001B" + (currentBlocks.length - 1) + "\u0001\n";
    });
    return renderBlocks(text.split("\n"));
  }

  /* first-line plain text, used for auto titles */
  function titleFrom(text, maxLen) {
    const line = String(text || "").split("\n")[0].replace(/[#>*`_\-\[\]]/g, "").replace(/\s+/g, " ").trim();
    if (!line) return "New Chat";
    if (line.length <= maxLen) return line;
    return line.slice(0, maxLen - 1).trimEnd() + "…";
  }

  LM.markdown = { render: render, highlight: highlight, titleFrom: titleFrom };
})();
