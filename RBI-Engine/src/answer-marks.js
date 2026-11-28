(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  else root.AnswerMarks = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function plainText(v) {
    return String(v || "").toLowerCase().replace(/[‘’`]/g, "'").replace(/[^a-z0-9']+/g, " ").trim();
  }

  function quoteInScript(quote, scriptPlain) {
    if (!scriptPlain) return true;
    const qp = plainText(String(quote || "").replace(/\.{3}|…/g, " "));
    if (!qp) return false;
    if (scriptPlain.includes(qp)) return true;
    const words = qp.split(" ").filter(x => x.length > 2);
    if (!words.length) return false;
    const have = new Set(scriptPlain.split(" "));
    return words.filter(x => have.has(x)).length / words.length >= 0.8;
  }

  const LL_STEMS = new Set(["travel", "cancel", "model", "label", "fuel", "signal", "counsel", "level", "total", "marvel", "channel", "dial", "equal", "jewel", "quarrel", "tunnel", "panel", "shovel", "funnel", "rival", "pedal", "marshal", "pencil", "libel", "duel", "enamel", "gravel"]);
  const US_WORDS = {
    grey: "gray", greys: "grays", tyre: "tire", tyres: "tires", aluminium: "aluminum", mould: "mold", moulds: "molds",
    plough: "plow", ageing: "aging", enrol: "enroll", enrols: "enrolls", enrolment: "enrollment", fulfil: "fulfill",
    fulfils: "fulfills", fulfilment: "fulfillment", instil: "instill", distil: "distill", skilful: "skillful", wilful: "willful",
    cheque: "check", cheques: "checks", jewellery: "jewelry", manoeuvre: "maneuver", oestrogen: "estrogen", paediatric: "pediatric",
    anaemia: "anemia", foetus: "fetus", draught: "draft", kerb: "curb", sceptical: "skeptical", sceptic: "skeptic",
    practise: "practice", practised: "practiced", practising: "practicing", practises: "practices",
    towards: "toward", afterwards: "afterward", amongst: "among", whilst: "while", learnt: "learned", spelt: "spelled",
    burnt: "burned", dreamt: "dreamed", leapt: "leaped", spoilt: "spoiled", encyclopaedia: "encyclopedia",
    haemoglobin: "hemoglobin", orthopaedic: "orthopedic", leukaemia: "leukemia"
  };
  const ISE_FIXED = new Set(["exercise", "advertise", "advise", "arise", "chastise", "comprise", "compromise", "concise", "despise", "devise", "disguise", "enterprise", "excise", "expertise", "franchise", "improvise", "incise", "merchandise", "precise", "premise", "promise", "demise", "revise", "supervise", "surmise", "surprise", "televise", "rise", "sunrise", "wise", "otherwise", "likewise", "clockwise", "noise", "poise", "raise", "praise", "appraise", "cruise", "bruise", "treatise", "mortise", "tortoise", "porpoise", "paradise", "guise", "reprise", "apprise", "circumcise", "valise"]);
  const OUR_FIXED = new Set(["our", "ours", "four", "fours", "your", "yours", "tour", "tours", "toured", "touring", "pour", "pours", "poured", "pouring", "hour", "hours", "sour", "sours", "soured", "flour", "flours", "detour", "detours", "contour", "contours", "devour", "devours", "devoured", "amour", "dour", "scour", "scoured", "troubadour", "paramour", "velour"]);
  const OGUE_FIXED = new Set(["vogue", "rogue", "rogues", "brogue", "brogues"]);

  function usForm(word) {
    let x = String(word || "").toLowerCase().trim();
    if (US_WORDS[x]) return US_WORDS[x];
    const ll = x.match(/^(.*?)ll(ed|ing|er|ers|or|ors)$/);
    if (ll && LL_STEMS.has(ll[1] + "l")) x = ll[1] + "l" + ll[2];
    const iseStem = x.replace(/(?:ises|ised|ising|isers|iser|ise)$/, "ise");
    if (!ISE_FIXED.has(iseStem)) {
      x = x.replace(/isation(al|ally|s)?$/, "ization$1").replace(/ise(s|d|r|rs)?$/, "ize$1").replace(/ising$/, "izing");
    }
    x = x.replace(/yse(s|d|r|rs)?$/, "yze$1").replace(/ysing$/, "yzing");
    if (!OUR_FIXED.has(x)) x = x.replace(/our(s|ed|ing|able|ably|ite|ites|er|ers|ful|less)?$/, "or$1");
    if (!OGUE_FIXED.has(x)) x = x.replace(/ogue(s)?$/, "og$1");
    return x
      .replace(/tre(s|d)?$/, "ter$1").replace(/amme(s|d)?$/, "am$1")
      .replace(/dgement(s)?$/, "dgment$1")
      .replace(/^(def|lic|off|pret)ence(s)?$/, "$1ense$2");
  }

  function isBritishVariant(wrong, correct) {
    const a = String(wrong || "").toLowerCase().trim();
    const b = String(correct || "").toLowerCase().trim();
    if (!a || !b || a === b) return false;
    return usForm(a) === usForm(b);
  }

  function onlyBritishChanges(wrong, fix) {
    const tok = s => String(s || "").match(/[A-Za-z]+|[^A-Za-z\s]+/g) || [];
    const a = tok(wrong);
    const b = tok(fix);
    if (a.length !== b.length || !a.length) return false;
    let variants = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      const isWord = /^[A-Za-z]+$/.test(a[i]) && /^[A-Za-z]+$/.test(b[i]);
      if (!isWord || !isBritishVariant(a[i], b[i])) return false;
      variants++;
    }
    return variants > 0;
  }

  const NORM_CHARS = { "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'", "`": "'", "“": "\"", "”": "\"", "„": "\"", "″": "\"", "–": "-", "—": "-", "‒": "-", "―": "-", "−": "-", " ": " ", " ": " ", " ": " " };

  function normChars(s) {
    let out = "";
    for (const c of String(s)) {
      if (c.length !== 1) { out += c; continue; }
      out += NORM_CHARS[c] || c;
    }
    return out;
  }

  function lowerSameLength(s) {
    let out = "";
    for (const c of String(s)) {
      const l = c.toLowerCase();
      out += l.length === c.length ? l : c;
    }
    return out;
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function findSpan(haystack, needle, from = 0) {
    const h = String(haystack || "");
    const n = String(needle || "");
    if (!n.trim()) return null;
    let i = h.indexOf(n, from);
    if (i >= 0) return { start: i, end: i + n.length };
    const hn = normChars(h);
    const nn = normChars(n);
    if (hn.length === h.length) {
      i = hn.indexOf(nn, from);
      if (i >= 0) return { start: i, end: i + nn.length };
      const hl = lowerSameLength(hn);
      const nl = lowerSameLength(nn);
      if (hl.length === h.length) {
        i = hl.indexOf(nl, from);
        if (i >= 0) return { start: i, end: i + nl.length };
        const parts = nl.trim().split(/\s+/).map(escapeRegExp);
        const re = new RegExp(parts.join("\\s+"), "g");
        re.lastIndex = from;
        const m = re.exec(hl);
        if (m) return { start: m.index, end: m.index + m[0].length };
      }
    }
    return null;
  }

  const KINDS = ["lang", "frame", "fact", "add", "cut"];
  const PREFIX = { lang: "L", frame: "B", fact: "F", add: "A", cut: "D" };
  const CLOSERS = /["'”’)\]]/;
  const STOPS = /[.!?।]/;

  function list(v) {
    return Array.isArray(v) ? v.filter(x => x && typeof x === "object") : [];
  }

  function clean(v) {
    return v == null ? "" : String(v).replace(/\r\n?/g, "\n").trim();
  }

  function first() {
    for (let i = 0; i < arguments.length; i++) if (arguments[i] != null && clean(arguments[i])) return clean(arguments[i]);
    return "";
  }

  function validRange(text, s, e) {
    return Number.isInteger(s) && Number.isInteger(e) && s >= 0 && e > s && e <= text.length;
  }

  function overlaps(a, b) {
    return a.start < b.end && b.start < a.end;
  }

  function inside(a, b) {
    return a.start >= b.start && a.end <= b.end;
  }

  function sentenceEnd(text, pos) {
    const t = String(text || "");
    let i = Math.max(0, Math.min(Number(pos) || 0, t.length));
    if (i > 0 && (STOPS.test(t[i - 1]) || CLOSERS.test(t[i - 1]))) {
      let j = i - 1;
      while (j > 0 && CLOSERS.test(t[j])) j--;
      if (STOPS.test(t[j])) {
        while (i < t.length && CLOSERS.test(t[i])) i++;
        return i;
      }
    }
    for (; i < t.length; i++) {
      if (t[i] === "\n") return i;
      if (STOPS.test(t[i]) && (i + 1 >= t.length || /\s/.test(t[i + 1]) || CLOSERS.test(t[i + 1]))) {
        let j = i + 1;
        while (j < t.length && CLOSERS.test(t[j])) j++;
        return j;
      }
    }
    return t.length;
  }

  function findFree(text, needle, taken) {
    let from = 0;
    for (let guard = 0; guard < 50; guard++) {
      const span = findSpan(text, needle, from);
      if (!span) return null;
      if (!taken.some(t => overlaps(t, span))) return span;
      from = span.start + 1;
    }
    return null;
  }

  function wordsBefore(text, at) {
    const words = text.slice(0, at).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "";
    return (words.length > 8 ? "…" : "") + words.slice(-8).join(" ");
  }

  function buildMarks(text, input) {
    const t = String(text == null ? "" : text);
    const src = input || {};
    const items = [];
    let dropped = 0;
    const add = (kind, span, fields) => items.push(Object.assign({ kind, seq: items.length, span, inline: false }, fields));

    const langTaken = [];
    for (const x of list(src.lang)) {
      const wrong = first(x.wrong, x.quote);
      const fix = clean(x.fix != null ? x.fix : x.correction);
      if (!wrong || wrong === fix) { dropped++; continue; }
      let span = validRange(t, x.start, x.end) && t.slice(x.start, x.end) === wrong ? { start: x.start, end: x.end } : null;
      const context = clean(x.context);
      if (!span && context) {
        const c = findSpan(t, context);
        const w = c ? findSpan(t.slice(c.start, c.end), wrong) : null;
        if (w) span = { start: c.start + w.start, end: c.start + w.end };
      }
      if (!span) span = findFree(t, wrong, langTaken);
      if (span) langTaken.push(span);
      add("lang", span, { wrong: span ? t.slice(span.start, span.end) : wrong, fix, why: first(x.why, x.rule, x.explanation), type: clean(x.type), severity: clean(x.severity) });
    }

    const factTaken = [];
    for (const x of list(src.facts)) {
      const quote = first(x.quote, x.wrong);
      const fix = first(x.fix, x.fact, x.correct_fact);
      const why = first(x.why, x.problem);
      if (!quote || !(fix || why)) { dropped++; continue; }
      const span = findFree(t, quote, factTaken);
      if (span) factTaken.push(span);
      add("fact", span, { wrong: span ? t.slice(span.start, span.end) : quote, fix, why });
    }

    for (const x of list(src.frames)) {
      const fix = first(x.fix, x.better, x.after);
      let span = validRange(t, x.start, x.end) ? { start: x.start, end: x.end } : null;
      const quote = first(x.quote, x.before);
      if (!span && quote) span = findSpan(t, quote);
      const original = span ? t.slice(span.start, span.end) : quote;
      if (!fix || !original || plainText(original) === plainText(fix)) { dropped++; continue; }
      add("frame", span, { wrong: original, fix, why: clean(x.why) });
    }

    for (const x of list(src.adds)) {
      const fix = first(x.fix, x.add, x.text);
      if (!fix) { dropped++; continue; }
      const after = first(x.after);
      let pos = Number.isInteger(x.at) && x.at >= 0 && x.at <= t.length ? x.at : null;
      if (pos === null && after) {
        const span = findSpan(t, after);
        if (span) pos = sentenceEnd(t, span.end);
      } else if (pos === null) {
        pos = t.length;
      }
      add("add", pos === null ? null : { start: pos, end: pos }, { fix, why: clean(x.why), after });
    }

    for (const x of list(src.cuts)) {
      const quote = clean(x.quote);
      const span = quote ? findSpan(t, quote) : null;
      if (!span) continue;
      add("cut", { start: span.end, end: span.end }, { wrong: t.slice(span.start, span.end), deduction: Number(x.deduction) || 0, label: clean(x.label), ref: clean(x.ref) });
    }

    const byStart = (a, b) => a.span.start - b.span.start || b.span.end - a.span.end || a.seq - b.seq;
    const placed = kind => items.filter(m => m.kind === kind && m.span).sort(byStart);
    const accepted = [];
    for (const f of placed("fact")) {
      if (accepted.some(a => overlaps(a.span, f.span))) continue;
      f.inline = true;
      accepted.push(f);
    }
    for (const fr of placed("frame")) {
      if (accepted.some(a => overlaps(a.span, fr.span) && (a.kind === "frame" || !inside(a.span, fr.span)))) continue;
      fr.inline = true;
      accepted.push(fr);
    }
    for (const l of placed("lang")) {
      if (accepted.some(a => overlaps(a.span, l.span) && (a.kind === "lang" || !inside(l.span, a.span)))) continue;
      l.inline = true;
      accepted.push(l);
    }
    for (const p of items.filter(m => (m.kind === "add" || m.kind === "cut") && m.span)) {
      let pos = p.span.start;
      const holders = accepted.filter(a => a.span.start < pos && pos < a.span.end && (p.kind === "add" || a.kind === "lang"));
      if (holders.length) pos = Math.max.apply(null, holders.map(a => a.span.end));
      p.span = { start: pos, end: pos };
      p.inline = true;
    }

    const marks = [];
    for (const kind of KINDS) {
      const mine = items.filter(m => m.kind === kind);
      const shown = mine.filter(m => m.inline).sort(byStart);
      const hidden = mine.filter(m => !m.inline).sort((a, b) => a.seq - b.seq);
      shown.concat(hidden).forEach((m, i) => {
        const out = { kind, id: PREFIX[kind] + (i + 1), inline: m.inline, start: m.inline ? m.span.start : null, end: m.inline ? m.span.end : null };
        ["wrong", "fix", "why", "type", "severity", "label", "ref"].forEach(k => { if (m[k] !== undefined && m[k] !== "") out[k] = m[k]; });
        if (kind === "cut") out.deduction = m.deduction;
        if (kind === "add") {
          out.atEnd = m.inline && m.span.start === t.length;
          out.where = m.inline ? wordsBefore(t, m.span.start) : m.after;
        }
        marks.push(out);
      });
    }
    const counts = {};
    KINDS.forEach(k => { counts[k] = marks.filter(m => m.kind === k).length; });
    return { text: t, marks, counts, dropped };
  }

  const HOW_PARAM = {
    A: [
      "Break the question into its parts before writing and give each part its own heading; obey the command word.",
      "Explain each point as a cause-and-effect chain with the correct technical terms.",
      "Add two or three specific reports, committees, schemes or data points, each with what it does.",
      "Use a short introduction, headed numbered points and a specific way forward.",
      "Write within 82-104% of the word limit in a sober third-person voice."
    ],
    B: [
      "Unpack the prompt in the first paragraph and state a clear thesis.",
      "Cover four or more dimensions and answer the strongest counter-view.",
      "Weave in concrete examples, data and recent developments.",
      "Write linked paragraphs with no bullets or headings, and close the loop at the end.",
      "Keep within 90-105% of the word limit in clear, varied sentences."
    ],
    C: [
      "Add a 3-8 word title that states the central idea.",
      "Keep every core argument of the passage and cut examples and repetition.",
      "Rewrite every idea in your own words; never copy five or more words in a row.",
      "Write one third-person paragraph with no opinion of your own.",
      "Stay within 92-105% of the word limit and check grammar."
    ],
    D: [
      "Take every answer from the passage and check each detail.",
      "Answer in your own words instead of copying sentences.",
      "Answer every sub-question in proportion to its weight.",
      "Write complete, grammatical sentences."
    ]
  };

  const HOW_PENALTY = {
    "RP-1": "Answer every part of the question; list the parts before you start writing.",
    "RP-2": "Replace slogans with a specific mechanism, scheme or institution.",
    "RP-3": "Whenever you name a scheme, report or theory, say what it does in the same sentence.",
    "RP-4": "Fix the format: headings and points for ESI/FM, continuous prose for an essay, one paragraph for a precis.",
    "RP-5": "Plan a word budget per section and stay inside the allowed band.",
    "RP-6": "Check facts, figures, dates and names before you use them, and leave out what you are not sure of.",
    "RP-7": "Paraphrase the passage in your own words and add no outside opinion.",
    "RP-8": "Keep a formal register and fix your repeated grammar patterns."
  };

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function num2(n) {
    const v = Math.round((Number(n) || 0) * 100) / 100;
    return String(v);
  }

  const RANK = { frame: 0, fact: 1, lang: 2 };

  function layout(built) {
    const t = built.text;
    const ranges = built.marks.filter(m => m.inline && RANK[m.kind] !== undefined)
      .sort((a, b) => a.start - b.start || b.end - a.end || RANK[a.kind] - RANK[b.kind]);
    const parent = new Map();
    const stack = [];
    for (const r of ranges) {
      while (stack.length && !inside(r, stack[stack.length - 1])) stack.pop();
      parent.set(r, stack.length ? stack[stack.length - 1] : null);
      stack.push(r);
    }
    const owned = new Map();
    for (const p of built.marks.filter(m => m.inline && (m.kind === "add" || m.kind === "cut"))) {
      let owner = null;
      if (p.kind === "cut") ranges.forEach(r => { if (r.kind !== "lang" && r.start < p.start && p.start <= r.end) owner = r; });
      if (!owned.has(owner)) owned.set(owner, []);
      owned.get(owner).push(p);
    }
    const level = container => {
      const s = container ? container.start : 0;
      const e = container ? container.end : t.length;
      const kids = ranges.filter(r => parent.get(r) === container);
      const pts = (owned.get(container) || []).slice().sort((a, b) => a.start - b.start || (a.kind === "cut" ? 0 : 1) - (b.kind === "cut" ? 0 : 1));
      const out = [];
      let pos = s;
      let pi = 0;
      const flush = upto => {
        while (pi < pts.length && pts[pi].start <= upto) {
          const p = pts[pi++];
          if (p.start > pos) { out.push({ text: t.slice(pos, p.start) }); pos = p.start; }
          out.push({ point: p });
        }
        if (upto > pos) { out.push({ text: t.slice(pos, upto) }); pos = upto; }
      };
      for (const r of kids) {
        flush(r.start);
        out.push({ mark: r, children: r.kind === "lang" ? [] : level(r) });
        pos = r.end;
      }
      flush(e);
      return out;
    };
    return level(null);
  }

  function refHTML(m, pre) {
    return "<a class=\"mk-ref\" href=\"#" + esc(pre + m.id) + "\">" + esc(m.id) + "</a>";
  }

  function cutHTML(m) {
    const amount = "−" + num2(m.deduction);
    return "<a class=\"mk-cut\"" + (m.ref ? " href=\"#" + esc(m.ref) + "\"" : "") + " title=\"" + esc((m.label ? m.label + " " : "") + "(" + amount + ")") + "\">" + amount + "</a>";
  }

  function nodesHTML(nodes, pre) {
    return nodes.map(n => {
      if (n.text !== undefined) return esc(n.text);
      if (n.point) {
        const m = n.point;
        if (m.kind === "cut") return cutHTML(m);
        return "<ins class=\"mk mk-add\" id=\"" + esc(pre + "mk-" + m.id) + "\"><span class=\"mk-tag\">Add</span> " + esc(m.fix) + refHTML(m, pre) + "</ins>";
      }
      const m = n.mark;
      const id = " id=\"" + esc(pre + "mk-" + m.id) + "\"";
      const fix = m.fix ? "<ins class=\"mk-new\">" + esc(m.fix) + "</ins>" : "";
      if (m.kind === "lang") return "<span class=\"mk mk-lang\"" + id + "><del class=\"mk-old\">" + esc(m.wrong) + "</del>" + fix + refHTML(m, pre) + "</span>";
      return "<span class=\"mk mk-" + m.kind + "\"" + id + "><span class=\"mk-old\">" + nodesHTML(n.children, pre) + "</span>" + fix + refHTML(m, pre) + "</span>";
    }).join("");
  }

  function markedHTML(built, opts) {
    const pre = (opts && opts.idPrefix) || "";
    return "<div class=\"mk-answer\">" + nodesHTML(layout(built), pre) + "</div>";
  }

  function nodesPlain(nodes, role, paint) {
    return nodes.map(n => {
      if (n.text !== undefined) return role ? paint(role, n.text) : n.text;
      if (n.point) {
        const m = n.point;
        if (m.kind === "cut") return paint("cut", "(-" + num2(m.deduction) + ")");
        return " " + paint("add", "{{" + m.id + " Add: " + m.fix + "}}");
      }
      const m = n.mark;
      if (m.kind === "lang") return paint("lang-old", "[-" + m.wrong + "-]") + (m.fix ? paint("lang-new", "{+" + m.fix + "+}") : "") + paint("ref", "(" + m.id + ")");
      const r = m.kind + "-old";
      return paint(r, "[[" + m.id + ": ") + nodesPlain(n.children, r, paint) + (m.fix ? paint(r, " => ") + paint(m.kind + "-new", m.fix) : "") + paint(r, "]]");
    }).join("");
  }

  function markedPlain(built, opts) {
    const paint = (opts && opts.paint) || ((role, s) => s);
    return nodesPlain(layout(built), null, paint);
  }

  const GROUPS = [
    ["lang", "Language mistakes"],
    ["frame", "Sentences to frame better"],
    ["fact", "Wrong facts"],
    ["add", "Add these to lift the answer"]
  ];

  const LEGEND = {
    lang: ["<span class=\"mk mk-lang\"><del class=\"mk-old\">wrong</del><ins class=\"mk-new\">right</ins></span>", "Language mistake, then the correction", "[-wrong-]{+right+}(L1)"],
    frame: ["<span class=\"mk mk-frame\"><span class=\"mk-old\">your sentence</span><ins class=\"mk-new\">better framing</ins></span>", "Sentence to frame better, then the better version", "[[B1: your sentence => better framing]]"],
    fact: ["<span class=\"mk mk-fact\"><span class=\"mk-old\">wrong fact</span><ins class=\"mk-new\">correct fact</ins></span>", "Wrong fact, then the correct fact", "[[F1: wrong fact => correct fact]]"],
    add: ["<ins class=\"mk mk-add\"><span class=\"mk-tag\">Add</span> suggestion</ins>", "Something to add at that point", "{{A1 Add: suggestion}}"],
    cut: ["<span class=\"mk-cut\">−0.25</span>", "Marks deducted for the words just before the tag", "(-0.25)"]
  };

  function shownKinds(built) {
    return KINDS.filter(k => built.marks.some(m => m.kind === k && m.inline));
  }

  function legendHTML(built) {
    const kinds = shownKinds(built);
    if (!kinds.length) return "";
    return "<ul class=\"mk-legend\">" + kinds.map(k => "<li>" + LEGEND[k][0] + " " + esc(LEGEND[k][1]) + "</li>").join("") + "</ul>";
  }

  function plainLegend(built) {
    return shownKinds(built).map(k => LEGEND[k][2] + "   " + LEGEND[k][1].charAt(0).toLowerCase() + LEGEND[k][1].slice(1)).join("\n");
  }

  function pairHTML(m) {
    const fix = m.fix ? "<ins class=\"mk-new\">" + esc(m.fix) + "</ins>" : "";
    if (m.kind === "lang") return "<span class=\"mk mk-lang\"><del class=\"mk-old\">" + esc(m.wrong) + "</del>" + fix + "</span>";
    if (m.kind === "add") return "<ins class=\"mk mk-add\"><span class=\"mk-tag\">Add</span> " + esc(m.fix) + "</ins>";
    return "<span class=\"mk mk-" + m.kind + "\"><span class=\"mk-old\">" + esc(m.wrong) + "</span>" + fix + "</span>";
  }

  function itemHTML(m, pre) {
    const num = m.inline
      ? "<a class=\"mk-num\" href=\"#" + esc(pre + "mk-" + m.id) + "\">" + esc(m.id) + "</a>"
      : "<span class=\"mk-num\">" + esc(m.id) + "</span>";
    let where = "";
    if (m.kind === "add") where = "<p class=\"mk-where\">" + (m.atEnd ? "At the end of your answer" : m.where ? "After “" + esc(m.where) + "”" : "Wherever it fits best") + "</p>";
    const meta = m.kind === "lang" && m.type ? m.type.charAt(0).toUpperCase() + m.type.slice(1) + (m.severity ? ", " + m.severity : "") + "." : "";
    const why = meta || m.why ? "<p class=\"mk-why\">" + (meta ? "<span class=\"mk-meta\">" + esc(meta) + "</span>" + (m.why ? " " : "") : "") + esc(m.why || "") + "</p>" : "";
    const note = m.inline ? "" : "<p class=\"mk-note\">" + (m.kind === "add" ? "Not placed in your answer: the sentence it belongs after was not found." : "Not shown in your answer: the exact words were not found.") + "</p>";
    return "<li id=\"" + esc(pre + m.id) + "\">" + num + "<div class=\"mk-body\">" + where + "<p class=\"mk-pair\">" + pairHTML(m) + "</p>" + why + note + "</div></li>";
  }

  function marksListHTML(built, opts) {
    const pre = (opts && opts.idPrefix) || "";
    const h = (opts && opts.heading) || "h4";
    const groups = GROUPS.map(([kind, title]) => {
      const mine = built.marks.filter(m => m.kind === kind);
      if (!mine.length) return "";
      return "<section class=\"mk-group mk-g-" + kind + "\"><" + h + " class=\"mk-gh\">" + esc(title) + " <span class=\"mk-count\">" + mine.length + "</span></" + h + "><ol class=\"mk-list\">" + mine.map(m => itemHTML(m, pre)).join("") + "</ol></section>";
    }).join("");
    return groups ? "<div class=\"mk-lists\">" + groups + "</div>" : "";
  }

  function r2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function endDot(s) {
    const t = clean(s);
    return !t || /[.!?:]$/.test(t) ? t : t + ".";
  }

  function capReason(cap) {
    const m = cap.match(/^(\d+(?:\.\d+)?%)\s*[-:–—]\s*(.+)$/);
    return m ? "Capped at " + m[1] + ": " + endDot(m[2]) : "Capped: " + endDot(cap);
  }

  const ZERO = {
    notAttempted: ["Not attempted", "You wrote nothing for this question, so it scores 0, as in the real exam.", "Always attempt: a one-line definition, three numbered points and a one-line way forward still earn marks."],
    autoFail: ["Under 60 words", "The rubric gives 0 marks to an ESI / FM answer or an essay under 60 words.", "Write at least a short introduction, three developed points and a conclusion; plan your time so no answer is left this short."],
    offTopic: ["Off-topic", "The answer does not address this question, so the rubric gives 0 marks.", "Decode the question before writing: mark the command word and every part, and answer exactly those."]
  };

  function lossLedger(input) {
    const x = input || {};
    const max = r2(x.max);
    const score = r2(x.score);
    const params = list(x.params);
    const penalties = list(x.penalties);
    const rows = [];
    const push = row => {
      row.ref = "loss-" + (rows.length + 1);
      rows.push(Object.assign({ detail: "", reasons: [], quote: "", fix: "" }, row));
      return row.ref;
    };
    const penaltyRefs = [];
    const zero = x.notAttempted ? "notAttempted" : x.autoFail ? "autoFail" : x.offTopic ? "offTopic" : "";
    if (zero) {
      push({ kind: "zero", title: ZERO[zero][0], lost: r2(max - score), reasons: [ZERO[zero][1]], fix: ZERO[zero][2] });
      penalties.forEach(() => penaltyRefs.push(""));
    } else {
      const how = HOW_PARAM[x.track] || HOW_PARAM.A;
      params.forEach((p, i) => {
        const lost = r2((Number(p.max) || 0) - (Number(p.awarded) || 0));
        if (!(lost > 0)) return;
        const reasons = clean(p.cap).split(/;\s+(?=\d+(?:\.\d+)?%)/).filter(Boolean).map(capReason);
        const own = (Array.isArray(p.reasons) ? p.reasons : []).map(endDot).filter(Boolean);
        if (own.length) own.forEach(r => reasons.push(r));
        else if (clean(p.why)) reasons.push(endDot(p.why));
        const no = Number(String(p.id || "").replace(/\D/g, "")) || i + 1;
        push({ kind: "param", title: (p.id ? p.id + " " : "") + clean(p.name), detail: num2(p.awarded) + " of " + num2(p.max), lost, reasons, fix: how[no - 1] || "" });
      });
      penalties.forEach(p => {
        const code = clean(p.code);
        penaltyRefs.push(push({ kind: "penalty", title: (clean(p.label) || code) + (code && clean(p.label) ? " (" + code + ")" : ""), lost: r2(p.deduction), reasons: clean(p.trigger) ? [clean(p.trigger)] : [], quote: clean(p.quote), fix: HOW_PENALTY[code] || "" }));
      });
      const raw = typeof x.rawSum === "number" ? r2(x.rawSum) : r2(params.reduce((s, p) => s + (Number(p.awarded) || 0), 0));
      const pen = typeof x.penaltySum === "number" ? r2(x.penaltySum) : r2(penalties.reduce((s, p) => s + (Number(p.deduction) || 0), 0));
      const net = r2(raw - pen);
      if (net < 0) push({ kind: "floor", title: "Marks cannot go below zero", lost: net, reasons: ["The penalties (" + num2(pen) + ") are more than the marks you earned (" + num2(raw) + "), so the score stops at 0."] });
      const floored = Math.max(0, net);
      if (typeof x.ceiling === "number" && floored > x.ceiling + 1e-9) {
        push({ kind: "ceiling", title: "Hard ceiling of the strict rubric", detail: num2(x.ceiling) + " of " + num2(max), lost: r2(floored - x.ceiling), reasons: ["The strict rubric never gives more than " + num2(x.ceiling) + " / " + num2(max) + " for this kind of answer; a real exam panel marks about 2-3 marks higher."] });
      }
    }
    let total = r2(rows.reduce((s, r) => s + r.lost, 0));
    const residual = r2(r2(max - score) - total);
    if (Math.abs(residual) >= 0.01) {
      const a = x.adjustment || {};
      push({ kind: "adjust", title: clean(a.title) || "Final adjustment", lost: residual, reasons: [clean(a.why) || "The final mark differs from the breakdown by " + num2(residual) + "."] });
      total = r2(total + residual);
    }
    const missed = list(x.missed).map(k => ({ id: clean(k.id), point: clean(k.point), weight: Number(k.weight) || 1, coverage: clean(k.coverage) }));
    return { max, score, total, zero, rows, penaltyRefs, missed };
  }

  function signed(v) {
    return v < 0 ? "+" + num2(-v) : "−" + num2(v);
  }

  function ledgerHTML(l, opts) {
    const pre = (opts && opts.idPrefix) || "";
    const cls = opts && opts.tableClass ? " " + opts.tableClass : "";
    const h = (opts && opts.heading) || "h4";
    const max = num2(l.max);
    let sum;
    if (l.zero === "notAttempted") sum = "You wrote nothing, so all " + max + " marks were lost.";
    else if (l.zero) sum = "The rubric gives 0 for this answer, so all " + max + " marks were lost.";
    else if (!(l.total > 0)) sum = "You lost no marks.";
    else sum = "You lost <strong>" + num2(l.total) + "</strong> of " + max + " marks: " + max + " − " + num2(l.total) + " = <strong>" + num2(l.score) + " / " + max + "</strong>.";
    let html = "<div class=\"mk-ledger\"><p class=\"mk-ledger-sum\">" + sum + "</p>";
    if (l.rows.length) {
      html += "<div class=\"mk-tw\"><table class=\"mk-ltable" + esc(cls) + "\"><thead><tr><th scope=\"col\">What cost you marks</th><th scope=\"col\" class=\"mk-n\">Lost</th><th scope=\"col\">Why</th><th scope=\"col\">How to earn them next time</th></tr></thead><tbody>" +
        l.rows.map(r => {
          const reasons = r.reasons.length > 1
            ? "<ul class=\"mk-reasons\">" + r.reasons.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>"
            : r.reasons.length ? "<p>" + esc(r.reasons[0]) + "</p>" : "";
          return "<tr id=\"" + esc(pre + r.ref) + "\" class=\"mk-r-" + r.kind + "\"><td><strong>" + esc(r.title) + "</strong>" + (r.detail ? "<span class=\"mk-sub\">" + esc(r.detail) + "</span>" : "") + "</td>" +
            "<td class=\"mk-n\">" + signed(r.lost) + "</td><td>" + reasons + (r.quote ? "<p class=\"mk-quote\">Your words: “" + esc(r.quote) + "”</p>" : "") + "</td><td>" + esc(r.fix) + "</td></tr>";
        }).join("") +
        "<tr class=\"mk-total\"><td>Total lost</td><td class=\"mk-n\">" + signed(l.total) + "</td><td colspan=\"2\">" + max + " − " + num2(l.total) + " = " + num2(l.score) + " / " + max + "</td></tr>" +
        "</tbody></table></div>";
    }
    if (l.missed.length) {
      html += "<div class=\"mk-missed\"><" + h + " class=\"mk-gh\">Key points from the model answer you missed or only partly covered</" + h + "><p class=\"mk-hint\">These decide most of the content marks above.</p><ul>" +
        l.missed.map(k => "<li><strong>" + esc(k.id) + "</strong> (weight " + k.weight + ", " + (k.coverage === "partial" ? "only partly covered" : "missing") + ") " + esc(k.point) + "</li>").join("") + "</ul></div>";
    }
    return html + "</div>";
  }

  return {
    plainText, quoteInScript, usForm, isBritishVariant, onlyBritishChanges, normChars, escapeRegExp, findSpan,
    KINDS, sentenceEnd, buildMarks, markedHTML, markedPlain, marksListHTML, legendHTML, plainLegend,
    HOW_PARAM, HOW_PENALTY, lossLedger, ledgerHTML
  };
});
