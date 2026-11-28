"use strict";

(function () {
  const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
  const GEMINI_FALLBACK_MODEL = "gemini-flash-latest";
  const ANTHROPIC_API = "https://api.anthropic.com/v1";
  const AM = AnswerMarks;
  const { plainText, quoteInScript, isBritishVariant, onlyBritishChanges } = AM;

  const PROVIDERS = {
    gemini: {
      id: "gemini", label: "Google Gemini", kind: "gemini",
      defaultModel: "gemini-3.8-flash",
      suggestions: ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview"],
      keyUrl: "https://aistudio.google.com/app/apikey", keyHint: "starts with AIza or AQ.",
      note: "Has a free tier: create a key in Google AI Studio (takes a minute)."
    },
    openai: {
      id: "openai", label: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com/v1",
      defaultModel: "gpt-6.2-sol",
      suggestions: ["gpt-6.2-sol", "gpt-6.2-astra", "gpt-6.1-terra", "gpt-5.4-mini"],
      keyUrl: "https://platform.openai.com/api-keys", keyHint: "starts with sk-",
      note: "Paid API (separate from a ChatGPT subscription).",
      modelFilter: id => /^(gpt|o\d|chatgpt)/i.test(id) &&
        !/audio|realtime|tts|transcribe|image|embedding|search|moderation|whisper|dall-e|davinci|babbage|instruct/i.test(id)
    },
    anthropic: {
      id: "anthropic", label: "Anthropic Claude", kind: "anthropic",
      defaultModel: "claude-opus-5-5",
      suggestions: ["claude-opus-5-5", "claude-fable-5-2", "claude-sonnet-5-5", "claude-haiku-5-5"],
      keyUrl: "https://console.anthropic.com/settings/keys", keyHint: "starts with sk-ant-",
      note: "Paid API. Sonnet and Haiku cost less than Opus."
    },
    groq: {
      id: "groq", label: "Groq", kind: "openai", baseUrl: "https://api.groq.com/openai/v1",
      defaultModel: "openai/gpt-oss-120b",
      suggestions: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile"],
      keyUrl: "https://console.groq.com/keys", keyHint: "starts with gsk_",
      note: "Very fast open models, with a free tier.",
      modelFilter: id => !/whisper|tts|guard|orpheus|playai|distil/i.test(id)
    },
    openrouter: {
      id: "openrouter", label: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1",
      defaultModel: "nvidia/nemotron-3.5-super-vl:free",
      suggestions: ["nvidia/nemotron-3.5-super-vl:free", "nvidia/nemotron-3.5-super-vl", "openrouter/auto"],
      keyUrl: "https://openrouter.ai/settings/keys", keyHint: "starts with sk-or-",
      note: "One key for hundreds of models. Models ending in :free cost nothing but have a daily request cap; Load models lists free ones first.",
      headers: { "X-Title": "RBI Practice Console" },
      modelFilter: (id, m) => !(m && m.architecture && Array.isArray(m.architecture.output_modalities)) || m.architecture.output_modalities.includes("text"),
      modelRank: id => (/:free$/.test(id) ? 0 : 1)
    },
    deepseek: {
      id: "deepseek", label: "DeepSeek", kind: "openai", baseUrl: "https://api.deepseek.com",
      defaultModel: "deepseek-chat",
      suggestions: ["deepseek-chat", "deepseek-reasoner"],
      keyUrl: "https://platform.deepseek.com/api_keys", keyHint: "starts with sk-",
      note: "Low-cost API.",
      maxTokens: model => (model === "deepseek-chat" ? 8192 : 0)
    },
    mistral: {
      id: "mistral", label: "Mistral", kind: "openai", baseUrl: "https://api.mistral.ai/v1",
      defaultModel: "mistral-medium-latest",
      suggestions: ["mistral-medium-latest", "mistral-large-latest", "mistral-small-latest"],
      keyUrl: "https://console.mistral.ai/api-keys", keyHint: "",
      note: "European provider with a free experiment plan."
    },
    custom: {
      id: "custom", label: "Custom (OpenAI-compatible)", kind: "openai", baseUrl: "http://localhost:11434/v1",
      defaultModel: "llama3.1",
      suggestions: [],
      keyUrl: "", keyHint: "optional", keyOptional: true, customBaseUrl: true,
      note: "Ollama, LM Studio, vLLM, LiteLLM or any /chat/completions server. For Ollama, start it with OLLAMA_ORIGINS=* so the browser may call it."
    }
  };

  const SETTINGS_KEY = "rbi_ai_settings";
  const REPORTS_KEY = "rbi_ai_reports";
  const REPORTS_MAX_CHARS = 1500000;
  const REPORT_VERSION = 1;
  const MAX_PARALLEL = 4;
  const GENERATE_TIMEOUT_MS = 420000;
  const QUICK_TIMEOUT_MS = 45000;
  const MAX_ATTEMPTS = { rate: 4, overloaded: 4, network: 3 };

  const PENALTY_LABELS = {
    "RP-1": "Missing sub-part",
    "RP-2": "Platitude / fluff",
    "RP-3": "Bare name-drop",
    "RP-4": "Structure problem",
    "RP-5": "Word limit / pacing",
    "RP-6": "Factual or logic error",
    "RP-7": "Lifting / outside info",
    "RP-8": "Language / register",
    "TYPO": "Typing slip (no penalty)"
  };

  const PENALTY_TABLE = {
    "RP-1": { m10: 0.75, m15: 1.25, m30: 2.5, most: 4 },
    "RP-2": { m10: 0.25, m15: 0.25, m30: 0.5, most: 3 },
    "RP-3": { m10: 0.25, m15: 0.25, m30: 0.5, most: 3 },
    "RP-4": { m10: 0.75, m15: 1.25, m30: 2.5, most: 1 },
    "RP-5": { m10: 0.5, m15: 0.75, m30: 1.5, most: 1 },
    "RP-6": { m10: 1.0, m15: 1.25, m30: 2.0, most: 4 },
    "RP-7": { m10: 0, m15: 0, m30: 1.0, most: 4 },
    "RP-8": { m10: 0.25, m15: 0.25, m30: 0.5, most: 3 }
  };

  const WORD_BANDS = { A: [[82, 104], [72, 112]], B: [[90, 105], [80, 112]], C: [[92, 105], [86, 110]] };

  const EXAMINER_CHECKS = {
    A: {
      1: ["Every sub-part answered", [1, 0.45]],
      2: ["Command word obeyed", [1, 0.45]],
      3: ["At least 70% answers this question", [1, 0.45]],
      4: ["Domain terms and cause-effect mechanics", [2, 0.35]],
      5: ["Indian context", [2, 0.55]],
      6: ["Specific sources stated with their function", null],
      7: ["A recent development used correctly", [3, 0.63]],
      8: ["Headings / numbered points, not a wall of text", [4, 0.35]],
      9: ["A specific, feasible way forward", [4, 0.55]],
      10: ["Sober third-person institutional register", null],
      11: ["Calculation: correct formula, working and answer", [2, 0.45]]
    },
    B: {
      1: ["Prompt unpacked into a clear thesis", [1, 0.45]],
      2: ["4+ dimensions with counter-arguments", null],
      3: ["Concrete examples and evidence", null],
      4: ["Continuous prose, no bullets or headings", [4, 0.35]],
      5: ["Opening hook and a closing loop", null],
      6: ["Grammatically sound, clear prose", null]
    },
    C: {
      1: ["A 3-8 word title", [1, 0.33]],
      2: ["Every core idea retained", null],
      3: ["No 5+ word verbatim lifts", [3, 0.35]],
      4: ["One third-person paragraph, no opinion", [4, 0.30]]
    },
    D: {
      1: ["Every sub-question answered", null],
      2: ["Answers from the passage only", null],
      3: ["In the candidate's own words", [2, 0.30]],
      4: ["Complete sentences", null]
    }
  };
  const TRACK_PARAMS = { A: 5, B: 5, C: 5, D: 4 };

  function snap4(n) { return Math.round((Number(n) || 0) * 4) / 4; }
  function floor4(n) { return Math.floor((Number(n) || 0) * 4 + 1e-9) / 4; }

  function penaltyValue(code, max) {
    const t = PENALTY_TABLE[code];
    if (!t) return null;
    if (code === "RP-7") return max === 30 || max === 40 ? t.m30 : Math.max(0.25, snap4(t.m30 * max / 30));
    if (max === 10) return t.m10;
    if (max === 15) return t.m15;
    if (max === 30 || max === 40) return t.m30;
    return Math.max(0.25, snap4(t.m10 * max / 10));
  }

  function ceilingFor(track, max) {
    const m = Number(max);
    if (track === "A") return m === 10 ? 6.25 : m === 15 ? 9.5 : floor4(m * 0.63);
    if (track === "B") return m === 40 ? 28.5 : floor4(m * 0.7125);
    if (track === "C" || track === "D") return m === 30 ? 22.5 : floor4(m * 0.75);
    return m;
  }

  function wordBand(track, words, limit) {
    const b = WORD_BANDS[track];
    if (!b || !(limit > 0)) return null;
    const pct = Math.round(words / limit * 100);
    if (pct >= b[0][0] && pct <= b[0][1]) return "full";
    if (pct >= b[1][0] && pct <= b[1][1]) return "half";
    return "zero";
  }

  function enforceRubric(track, parameters, penalties, checks, anchorCount, q, words) {
    const max = maxMarksOf(q);
    const limit = wordLimitOf(q);
    const rules = [];
    const pmaxSum = sum(parameters.map(p => p.max));
    if (parameters.length && parameters.every(p => p.max > 0) && Math.abs(pmaxSum - max) > 0.05) {
      const k = max / pmaxSum;
      parameters.forEach(p => { p.max = round2(p.max * k); if (p.awarded !== null) p.awarded = round2(p.awarded * k); });
      rules.push("Parameter maxima rescaled to add up to " + fmt(max) + " marks.");
    }
    const byNo = {};
    const expected = TRACK_PARAMS[track];
    parameters.forEach((p, i) => {
      const code = (String(p.name).match(/^P(\d)\b/) || [])[1];
      const no = code ? Number(code) : (parameters.length === expected ? i + 1 : 0);
      if (no && !byNo[no]) byNo[no] = p;
    });
    const capParam = (no, share, why) => {
      const p = byNo[no];
      if (!p || !(p.max > 0) || p.awarded === null) return;
      const ceiling = Math.floor(p.max * share * 4) / 4;
      if (p.awarded > ceiling + 1e-9) {
        rules.push("P" + no + " limited to " + fmt(ceiling) + " / " + fmt(p.max) + " (" + Math.round(share * 100) + "% cap): " + why + ".");
        p.awarded = ceiling;
      }
      if (!p.cap) p.cap = Math.round(share * 100) + "% - " + why;
    };
    const table = EXAMINER_CHECKS[track] || {};
    checks.forEach(c => {
      const def = table[c.id];
      if (def && def[1] && c.pass === false) capParam(def[1][0], def[1][1], "check failed: " + def[0].charAt(0).toLowerCase() + def[0].slice(1));
    });
    if (track === "A" && anchorCount !== null) {
      if (anchorCount <= 0) capParam(3, 0.20, "no specific report, committee, scheme or data");
      else if (anchorCount === 1) capParam(3, 0.45, "only one specific source");
    }
    const band = wordBand(track, words, limit);
    const pct = limit > 0 ? Math.round(words / limit * 100) : 0;
    if (band === "half") capParam(5, 0.5, "word count " + words + " of " + limit + " (" + pct + "%)");
    if (band === "zero") capParam(5, 0, "word count " + words + " of " + limit + " (" + pct + "%)");
    if (band) {
      const has = penalties.some(p => p.code === "RP-5");
      if (band === "zero" && !has) {
        penalties.push({ code: "RP-5", trigger: "Word count " + words + " of " + limit + " (" + pct + "% of the limit)", deduction: 0 });
        rules.push("RP-5 added: the word count is outside the allowed band.");
      } else if (band !== "zero" && has) {
        for (let i = penalties.length - 1; i >= 0; i--) if (penalties[i].code === "RP-5") penalties.splice(i, 1);
        rules.push("RP-5 removed: " + pct + "% of the word limit is inside the allowed band.");
      }
    }
    if (track === "A" || track === "B") {
      const before = penalties.length;
      for (let i = penalties.length - 1; i >= 0; i--) if (penalties[i].code === "RP-7") penalties.splice(i, 1);
      if (penalties.length !== before) rules.push("RP-7 removed: it applies only to precis and comprehension.");
    }
    const seen = {};
    let changed = false;
    for (let i = 0; i < penalties.length; i++) {
      const p = penalties[i];
      const v = penaltyValue(p.code, max);
      if (v === null) continue;
      seen[p.code] = (seen[p.code] || 0) + 1;
      if (seen[p.code] > PENALTY_TABLE[p.code].most || v === 0) { penalties.splice(i--, 1); changed = true; continue; }
      if (Math.abs(p.deduction - v) > 1e-9) { p.deduction = v; changed = true; }
    }
    if (changed) rules.push("Penalties set to the rubric's table values for " + fmt(max) + " marks (RP-2, RP-3, RP-8 counted at most 3 times).");
    const autoFail = (track === "A" || track === "B") && words > 0 && words < 60;
    if (autoFail) rules.push("Under 60 words: the rubric gives 0 marks.");
    return { rules, autoFail };
  }

  const COVERAGE = {
    "DEEP & BALANCED": { label: "Covered well", cls: "good" },
    "TEXTBOOK ONLY": { label: "Textbook only", cls: "ok" },
    "SUPERFICIAL": { label: "Superficial", cls: "weak" },
    "MISSED": { label: "Missed", cls: "miss" }
  };

  const TRACKS = {
    A: "ESI / Finance & Management answer",
    B: "English essay",
    C: "English precis",
    D: "Reading comprehension"
  };

  const GRADES = [
    { grade: "A", min: 52, label: "AIR Top-10 ready", cls: "a" },
    { grade: "B", min: 42, label: "Strong selection zone", cls: "b" },
    { grade: "C", min: 32, label: "Borderline / cutoff zone", cls: "c" },
    { grade: "D", min: 20, label: "Below cutoff", cls: "d" },
    { grade: "F", min: 0, label: "Fail zone", cls: "f" }
  ];

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function inline(v) {
    return esc(v).replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
  }

  function num(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string") {
      const m = v.replace(/,(?=\d)/g, ".").match(/-?\d+(?:\.\d+)?/);
      return m ? Number(m[0]) : null;
    }
    return null;
  }

  function str(v, maxLen = 4000) {
    if (v == null) return "";
    let s = "";
    if (typeof v === "string") s = v;
    else if (typeof v === "number" || typeof v === "boolean") s = String(v);
    else if (typeof v === "object") s = v.text || v.name || v.value || v.point || "";
    s = String(s).replace(/\r\n?/g, "\n").trim();
    return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;
  }

  function strList(v, maxItems = 10, maxLen = 600) {
    const arr = Array.isArray(v) ? v : (typeof v === "string" && v.trim() ? v.split(/\n+/) : []);
    return arr
      .map(x => str(x, maxLen).replace(/^(?:[-*•]\s+|\d{1,2}[.)]\s+)/, ""))
      .filter(Boolean)
      .slice(0, maxItems);
  }

  function objList(v, maxItems) {
    return (Array.isArray(v) ? v : []).filter(x => x && typeof x === "object" && !Array.isArray(x)).slice(0, maxItems);
  }

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function round1(n) { return Math.round(n * 10) / 10; }
  function sum(list) { return list.reduce((s, x) => s + (Number(x) || 0), 0); }
  function fmt(n) { const v = Number(n); return Number.isFinite(v) ? String(round2(v)) : "–"; }
  function wordsIn(text) { const t = String(text || "").trim(); return t ? t.split(/\s+/).length : 0; }

  function answerOf(test, q) {
    const a = (test && test.answers && test.answers[q.id]) || {};
    const text = typeof a.text === "string" ? a.text : "";
    const wordCount = Number.isFinite(a.wordCount) ? a.wordCount : wordsIn(text);
    return { text, wordCount, secondsSpent: a.secondsSpent || 0 };
  }

  function wordLimitOf(q) {
    const w = Number(q.wordLimit);
    if (w > 0) return w;
    return Number(q.marks) === 15 ? 600 : 400;
  }

  function maxMarksOf(q) {
    const m = Number(q.marks);
    return m > 0 ? m : 10;
  }

  function gradeFor(percent) {
    return GRADES.find(g => percent >= g.min) || GRADES[GRADES.length - 1];
  }

  function gradeInfo(letter) {
    return GRADES.find(g => g.grade === letter) || GRADES[GRADES.length - 1];
  }

  function projectionFor(score, max, attempted) {
    if (!(score > 0) && !attempted) return null;
    let lo, hi;
    if (max >= 25) { lo = 3.5; hi = 5.5; }
    else if (max >= 10) { lo = 2.0; hi = 3.0; }
    else { lo = 2.0 * max / 10; hi = 3.0 * max / 10; }
    return [round2(Math.min(max, score + lo)), round2(Math.min(max, score + hi))];
  }

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) { reject(new AIError("cancelled", "Stopped.")); return; }
      const t = setTimeout(done, ms);
      function done() { if (signal) signal.removeEventListener("abort", onAbort); resolve(); }
      function onAbort() { clearTimeout(t); reject(new AIError("cancelled", "Stopped.")); }
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  function cssEsc(v) {
    return (typeof CSS !== "undefined" && CSS.escape) ? CSS.escape(String(v)) : String(v).replace(/["\\]/g, "\\$&");
  }

  const ENGINES = {
    check: {
      id: "check", n: 1, label: "AI Check and objective analysis",
      uses: "Used when you press AI Check (verifies uploaded questions and answer keys, builds the marking checklist) and AI Analysis after an objective test.",
      provider: "gemini", model: "gemini-4-hydrogen", thinking: "low"
    },
    grade: {
      id: "grade", n: 2, label: "Subjective marks and analysis",
      uses: "Gives the marks and the full analysis (writing, facts, topics) for every subjective answer.",
      provider: "gemini", model: "gemini-4-neon", thinking: "high"
    }
  };
  const ROLE_ENGINE = { check: "check", analysis: "check", grading: "grade" };
  const THINKING_LEVELS = ["low", "medium", "high"];
  const SESSION_KEYS = "rbi_ai_session_keys";

  function fileConfig() {
    const c = typeof window !== "undefined" ? window.AI_CONFIG : null;
    return c && typeof c === "object" ? c : {};
  }

  function readOverrides() {
    try {
      const o = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch (_) {
      return {};
    }
  }

  function writeOverrides(o) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(o));
      return true;
    } catch (_) {
      return false;
    }
  }

  function readSessionKeys() {
    try {
      const o = JSON.parse(sessionStorage.getItem(SESSION_KEYS) || "{}");
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch (_) {
      return {};
    }
  }

  function writeSessionKeys(o) {
    try {
      const clean = {};
      Object.keys(PROVIDERS).forEach(id => { const k = String((o && o[id]) || "").trim(); if (k && !isPlaceholderKey(k)) clean[id] = k; });
      if (Object.keys(clean).length) sessionStorage.setItem(SESSION_KEYS, JSON.stringify(clean));
      else sessionStorage.removeItem(SESSION_KEYS);
      return true;
    } catch (_) {
      return false;
    }
  }

  function dropStoredKeys() {
    const o = readOverrides();
    if (o.keys || o.provider || o.models) {
      delete o.keys;
      delete o.provider;
      delete o.models;
      delete o.baseUrls;
      writeOverrides(o);
    }
  }

  function isPlaceholderKey(key) {
    const k = String(key == null ? "" : key).trim();
    if (!k) return true;
    return /^DEMO[_-]/i.test(k) || /CHANGE[_-]?ME|YOUR[_-]?(API[_-]?)?KEY|PASTE[_-]?(YOUR[_-]?)?KEY/i.test(k);
  }

  function pickStr(obj, key) {
    return obj && typeof obj === "object" && typeof obj[key] === "string" ? obj[key].trim() : "";
  }

  function cleanModel(def, model) {
    let m = String(model || "").trim();
    if (def.kind === "gemini") m = m.replace(/^models\//, "");
    return m;
  }

  function getSettings() {
    const file = fileConfig();
    const local = readOverrides();
    const autoEvaluate = typeof local.autoEvaluate === "boolean" ? local.autoEvaluate
      : (typeof file.autoEvaluate === "boolean" ? file.autoEvaluate : true);
    const passes = local.passes === "two" || local.passes === "smart" ? local.passes : (file.passes === "two" ? "two" : "smart");
    return { autoEvaluate, passes };
  }

  function engineDefaults(id) {
    const base = ENGINES[id];
    const f = (fileConfig().engines || {})[id] || {};
    const provider = PROVIDERS[f.provider] ? f.provider : base.provider;
    const def = PROVIDERS[provider];
    return {
      provider,
      model: cleanModel(def, pickStr(f, "model")) || (provider === base.provider ? base.model : def.defaultModel),
      thinking: f.thinking === "default" || THINKING_LEVELS.includes(f.thinking) ? f.thinking : base.thinking,
      baseUrl: ((def.customBaseUrl && (pickStr(f, "baseUrl") || pickStr(fileConfig(), "customBaseUrl"))) || def.baseUrl || "").replace(/\/+$/, "")
    };
  }

  function engineSettings(id) {
    const d = engineDefaults(id);
    const local = (readOverrides().engines || {})[id] || {};
    const provider = PROVIDERS[local.provider] ? local.provider : d.provider;
    const def = PROVIDERS[provider];
    return {
      provider,
      model: cleanModel(def, pickStr(local, "model")) || (provider === d.provider ? d.model : def.defaultModel),
      thinking: local.thinking === "default" || THINKING_LEVELS.includes(local.thinking) ? local.thinking : d.thinking,
      baseUrl: ((def.customBaseUrl && pickStr(local, "baseUrl")) || (provider === d.provider ? d.baseUrl : def.baseUrl) || "").replace(/\/+$/, "")
    };
  }

  function makeConfig(def, apiKey, model, baseUrl) {
    const key = isPlaceholderKey(apiKey) ? "" : String(apiKey).trim();
    const base = String(baseUrl || def.baseUrl || "").trim().replace(/\/+$/, "");
    return {
      id: def.id,
      def,
      apiKey: key,
      model: cleanModel(def, model) || def.defaultModel,
      baseUrl: base,
      ready: def.keyOptional ? !!base : !!key
    };
  }

  function fileKeyFor(provider) {
    return pickStr(fileConfig().keys, provider);
  }

  function providersInUse(settingsById) {
    return [...new Set(Object.keys(ENGINES).map(id => (settingsById ? settingsById[id] : engineSettings(id)).provider))];
  }

  function resolveEngine(id) {
    const engine = ENGINES[id] ? id : "grade";
    const s = engineSettings(engine);
    const def = PROVIDERS[s.provider];
    const sessionKey = pickStr(readSessionKeys(), s.provider);
    const fileKey = fileKeyFor(s.provider);
    let apiKey = "";
    let keySource = "none";
    if (!isPlaceholderKey(sessionKey)) { apiKey = sessionKey; keySource = "session"; }
    else if (!isPlaceholderKey(fileKey)) { apiKey = fileKey; keySource = "file"; }
    const pc = makeConfig(def, apiKey, s.model, s.baseUrl);
    pc.keySource = keySource;
    pc.engine = engine;
    pc.thinking = def.kind === "gemini" && THINKING_LEVELS.includes(s.thinking) ? s.thinking : "";
    return pc;
  }

  function activeProvider(role) {
    return resolveEngine(ROLE_ENGINE[role] || "grade");
  }

  function engineLabel(pc) {
    return pc.def.label + " · " + pc.model + (pc.thinking ? " (" + pc.thinking + ")" : "");
  }


  const SYSTEM_INSTRUCTION =
    "You grade RBI Grade B Phase-2 descriptive answers inside a candidate's practice app. " +
    "Apply the user's rubric, gates, penalties and calibration exactly as written. " +
    "Reply with exactly one valid JSON object containing the keys listed in the OUTPUT CONTRACT - " +
    "no markdown, no code fences, no text before or after the JSON.";

  const JSON_CONTRACT = `################################################################################
#  OUTPUT CONTRACT - AUTOMATED GRADING (overrides the presentation format above)
################################################################################
This evaluation is read by the candidate's practice app, not pasted into a chat.
Carry out EVERY step of the REQUIRED EVALUATION OUTPUT FORMAT above, in the same
order (audit first, marks after), with the same tracks, evidence gates, red-pen
penalties and calibration bands. Then, instead of markdown, return ONE JSON
object and nothing else (no code fences, no text before or after it).

Keys, in this exact order (section numbers refer to the format above):
- "track": "A", "B", "C" or "D".                                       [Section 1]
- "checklist": one entry per key point of the FIXED MARKING CHECKLIST, in its
  order: {"id": "K1", "coverage": "full" | "partial" | "missing", "quote": the
  candidate's exact words that cover it, or ""}. [] when there is no checklist.
- "subparts": every explicit and implicit sub-part of the question, each
  {"part": short name, "coverage": "DEEP & BALANCED" | "TEXTBOOK ONLY" |
  "SUPERFICIAL" | "MISSED", "comment": one line on how it was handled}.
- "examiner_checks": every STAGE 1B check of the chosen track, in order, each
  {"id": the check number as a string ("1", "2", ...), "result": "YES" | "NO"
  | "N/A" (N/A only for Track A check 11 when no calculation is asked),
  "evidence": the candidate's exact words, or why the check fails}. The app
  applies the gate of every NO to the marks, so judge each check strictly.
- "anchor_count": Track A check 6 as a number - specific, ACCURATE data points,
  reports, committees or schemes (for pure management / OB questions: named
  theories and real cases) stated WITH their function; bare name-drops and
  wrong facts do not count. 0 for Tracks B, C and D.
- "off_topic": true only if the script does not answer this question at all.
- "caps_triggered": evidence-gate caps applied, e.g. "P3 capped at 20% - no
  data" ([] if none).
- "pacing_audit": word count %, time used, WPM and any speed risk (1-3 sentences).
- "anchors_used": high-value data, reports, committees or theorists actually
  used.                                                                 [Section 2]
- "bare_name_drops": items mentioned without their function, target or link.
- "missing_anchors": exactly 5 specific reports, committees, schemes, datasets
  or theories to add.
- "verify_flags": recent figures you tagged [VERIFY LATEST FIGURE] ([] if none).
  A figure you merely cannot confirm goes ONLY here, never in factual_errors.
- "error_log": up to 8 items {"quote": the candidate's exact words, "code":
  "RP-1" to "RP-8" (or "TYPO" for a no-penalty slip), "problem": what is wrong,
  "correction": the corrected wording or fact} - the mark-relevant errors
  (content, logic, structure and recurring language patterns).        [Section 3A]
- "parameters": one item per parameter of the chosen track, each {"name",
  "max_marks", "cap_applied" ("" if none, else e.g. "45% - sub-part missed"),
  "awarded", "justification": the evidence for the mark, "lost": the specific
  reasons the mark is below max_marks, one short line each, naming what was
  missing or wrong and what would have earned the mark ([] when awarded equals
  max_marks)}. The max_marks must add up to exactly {{MARKS}} (scale the
  track's allocation - RULE 5).                                         [Section 4A]
- "penalties": every Stage-2 deduction, each {"code": "RP-1" to "RP-8",
  "trigger": the exact trigger found in the script, "quote": the candidate's
  exact words that triggered it, copied character for character ("" when the
  trigger is not a passage, such as the word count), "deduction": a positive
  number such as 0.25 from the column for {{MARKS}} marks (RULE 5)}.  [Section 4B]
- "stage1_raw_sum", "total_penalties", "final_score": numbers, where
  final_score = max(0, stage1_raw_sum - total_penalties), never above {{MARKS}}.
- "grade": "A", "B", "C", "D" or "F" (STRICT SIMULATOR GRADE BRACKETS). [Section 5]
- "merit_check": the blunt two-line merit-list reality check.
- "summary": 3-4 short sentences written to the candidate as "you", in plain
  English with no rubric codes (no "RP-3", no "P2"): what this mark means, the
  1-2 biggest reasons marks were lost, and the single most important fix.
- "strengths": 2-4 specific things this answer genuinely did well ([] if none).
- "rewrites": every sentence an examiner would want framed better (vague,
  generic, wordy, informal, badly linked or not answering the question
  directly), weakest first, up to 8, each {"before": the candidate's exact
  sentence(s), copied character for character, "after": the better-framed
  version in exam style, keeping the candidate's meaning and correct facts,
  "why": what was weak and what the new version fixes}. Leave out sentences
  that are already good and pure grammar slips.                        [Section 6]
- "additions": up to 5 specific additions that would lift the marks, each
  placed where it belongs: {"after": the candidate's exact words that end the
  sentence after which it should go ("" for the end of the answer), "add": the
  exact sentence(s) to add, in exam style (a data point, an example, a
  committee or report, or a causal chain such as "Repo hike -> costlier loans
  -> lower demand"), "why": the key point, examiner check or parameter it
  earns}. Use only facts you are sure of; mark recent figures you cannot
  confirm with [VERIFY LATEST FIGURE].
- "model_answer": the complete benchmark answer as plain text in exam-portal
  format, with \\n for line breaks, ending with [EXACT WORD COUNT: N words].
                                                                        [Section 7]
- "action_plan": exactly 3 revision directives for tomorrow's drill.   [Section 8]
- "topic": the syllabus topic this question tests, 2-6 words (for example
  "Inflation targeting" or "Leadership styles"). Use the TOPIC given above
  when it is not "Not specified".
- "concept_gaps": up to 5 concepts of that topic the candidate got wrong,
  confused or left out, each one short line ([] if none). These are gaps in
  understanding the topic itself; missing reports or committees belong in
  missing_anchors instead.
- "writing_audit": the Writing Audit of Section 3B - a line-by-line language,
  fact and style audit of the candidate's script so they can improve their next
  exam. Check EVERY sentence. Rules: copy every "quote", "wrong" and "examples"
  entry character-for-character from the script (RULE 7 - no paraphrase, no
  "..."); never list Indian/British spellings (RULE 6); a typing slip still goes
  in spelling_errors; the audit is feedback and adds NO deduction beyond the
  Stage 2 penalties. Object with:
  - "grammar_errors": every grammar, tense, agreement, article, preposition,
    punctuation or sentence-construction error (up to 20), each {"quote": the
    candidate's exact words, "type": "grammar" | "tense" | "agreement" |
    "article" | "preposition" | "punctuation" | "sentence structure",
    "explanation": the rule that is broken, in one plain sentence,
    "correction": the corrected wording that replaces exactly the quoted
    words}.
  - "spelling_errors": every misspelt word (up to 25), each {"wrong": as typed,
    "correct": correct spelling, "context": the 3-8 words around it}.
  - "factual_errors": every PROVABLY wrong fact, figure, date, name, committee
    or report (up to 10), each {"quote": exact words, "problem": what is wrong,
    "correct_fact": the correct fact}. Unverifiable recent figures go to
    verify_flags, not here.
  - "style": {"verdict": "RBI-ready" | "Nearly there" | "Not yet", "score": a
    number 0-10 for how close the writing style is to a top RBI Grade B
    Phase-2 script OF THIS TRACK (A: sober third-person institutional register
    with headings and numbered points; B: continuous essay prose; C: one
    third-person paragraph; D: complete-sentence answers), "assessment": 3-5
    sentences on tone, register, objectivity,
    analytical depth and policy orientation compared with what RBI examiners
    expect, "issues": every style problem seen (conversational tone, first
    person, rhetorical questions, vague claims, opinion without evidence,
    repetition...) each one line}.
  - "structure": {"assessment": 2-4 sentences on introduction, body, conclusion,
    headings, paragraphing and logical flow, "issues": specific problems}.
  - "vocabulary": {"assessment": 1-3 sentences on word choice, technical terms
    and register, "weak_words": up to 10 {"used": the weak or informal word or
    phrase, "better": the exam-grade replacement}}.
  - "sentence_craft": {"assessment": 1-3 sentences on sentence length, clarity,
    run-ons, fragments, passive voice and connectors, "examples": up to 5 exact
    sentences that should be split or tightened}.
  - "presentation": 1-3 sentences on paragraphing, bullets, use of the word
    limit and how easy the script is for an examiner to mark.
  - "improvement_plan": 5-8 detailed, specific steps for the next exam, most
    important first, each naming exactly what to practise and how.
  For a blank, off-topic or under-60-word script return empty lists, style
  verdict "Not yet" and a short improvement plan.

Rules: all marks are JSON numbers (not strings) in 0.25 steps. Strings are plain
text (no markdown tables, no ** markers). Quote the candidate exactly in "quote",
"before" and "after". Skip Section 9 (SCORE_LOG): the app logs the score itself. If the
script is blank, off-topic or under 60 words, still return every key, with
final_score 0, "rewrites" as [] if there is nothing to rewrite, and a full model
answer. Never invent errors: an empty list is the right answer when the script
has no error of that kind, but do not skip real ones.
################################################################################`;

  function objSchema(props) {
    return { type: "object", properties: props, required: Object.keys(props) };
  }
  const S = { type: "string" };
  const N = { type: "number" };
  const SL = { type: "array", items: S };
  const B = { type: "boolean" };
  const CHECKLIST_SCHEMA = { type: "array", items: objSchema({ id: S, coverage: { type: "string", enum: ["full", "partial", "missing"] }, quote: S }) };
  const REPORT_SCHEMA = objSchema({
    track: { type: "string", enum: ["A", "B", "C", "D"] },
    checklist: CHECKLIST_SCHEMA,
    subparts: { type: "array", items: objSchema({ part: S, coverage: { type: "string", enum: Object.keys(COVERAGE) }, comment: S }) },
    examiner_checks: { type: "array", items: objSchema({ id: S, result: { type: "string", enum: ["YES", "NO", "N/A"] }, evidence: S }) },
    anchor_count: N,
    off_topic: B,
    caps_triggered: SL,
    pacing_audit: S,
    anchors_used: SL,
    bare_name_drops: SL,
    missing_anchors: SL,
    verify_flags: SL,
    error_log: { type: "array", items: objSchema({ quote: S, code: S, problem: S, correction: S }) },
    parameters: { type: "array", items: objSchema({ name: S, max_marks: N, cap_applied: S, awarded: N, justification: S, lost: SL }) },
    penalties: { type: "array", items: objSchema({ code: S, trigger: S, quote: S, deduction: N }) },
    stage1_raw_sum: N,
    total_penalties: N,
    final_score: N,
    grade: { type: "string", enum: ["A", "B", "C", "D", "F"] },
    merit_check: S,
    summary: S,
    strengths: SL,
    rewrites: { type: "array", items: objSchema({ before: S, after: S, why: S }) },
    additions: { type: "array", items: objSchema({ after: S, add: S, why: S }) },
    model_answer: S,
    action_plan: SL,
    topic: S,
    concept_gaps: SL,
    writing_audit: objSchema({
      grammar_errors: { type: "array", items: objSchema({ quote: S, type: S, explanation: S, correction: S }) },
      spelling_errors: { type: "array", items: objSchema({ wrong: S, correct: S, context: S }) },
      factual_errors: { type: "array", items: objSchema({ quote: S, problem: S, correct_fact: S }) },
      style: objSchema({ verdict: S, score: N, assessment: S, issues: SL }),
      structure: objSchema({ assessment: S, issues: SL }),
      vocabulary: objSchema({ assessment: S, weak_words: { type: "array", items: objSchema({ used: S, better: S }) } }),
      sentence_craft: objSchema({ assessment: S, examples: SL }),
      presentation: S,
      improvement_plan: SL
    })
  });

  const SCORE_SCHEMA = objSchema({
    track: { type: "string", enum: ["A", "B", "C", "D"] },
    checklist: CHECKLIST_SCHEMA,
    examiner_checks: { type: "array", items: objSchema({ id: S, result: { type: "string", enum: ["YES", "NO", "N/A"] }, evidence: S }) },
    anchor_count: N,
    off_topic: B,
    parameters: { type: "array", items: objSchema({ name: S, max_marks: N, cap_applied: S, awarded: N, justification: S }) },
    penalties: { type: "array", items: objSchema({ code: S, trigger: S, deduction: N }) },
    stage1_raw_sum: N,
    total_penalties: N,
    final_score: N
  });

  function buildPrompt(test, q, idx, scoreOnly) {
    if (typeof buildQuestionText !== "function") {
      throw new AIError("internal", "The evaluation prompt (prompt.js / app.js) is not loaded.");
    }
    const base = buildQuestionText(test, q, idx).replace(/^QUESTION \d+ OF \d+\n/, "");
    return base + "\n\n" + schemePromptBlock(schemeOf(q)) + (scoreOnly ? SCORE_CONTRACT : JSON_CONTRACT).replace(/\{\{MARKS\}\}/g, String(q.marks));
  }

  const SCORE_CONTRACT = `################################################################################
#  OUTPUT CONTRACT - SCORE-ONLY CROSS-CHECK (overrides the presentation format above)
################################################################################
This is an independent cross-check of the mark only; the feedback was written
separately. Carry out the full evaluation exactly as written above (tracks,
evidence gates, caps, red-pen penalties, calibration bands, arithmetic lock),
then return ONE JSON object with ONLY these keys and nothing else:
- "track": "A", "B", "C" or "D".
- "checklist": one entry per key point of the FIXED MARKING CHECKLIST, in its
  order: {"id": "K1", "coverage": "full" | "partial" | "missing", "quote": the
  candidate's exact words that cover it (at most 12 words), or ""}. [] when there
  is no checklist.
- "examiner_checks": every STAGE 1B check of the chosen track, in order, each
  {"id": the check number as a string ("1", "2", ...), "result": "YES" | "NO"
  | "N/A" (N/A only for Track A check 11 when no calculation is asked),
  "evidence": at most 10 words}. The app
  applies the gate of every NO to the marks, so judge each check strictly.
- "anchor_count": Track A check 6 as a number - specific, ACCURATE data points,
  reports, committees or schemes (for pure management / OB questions: named
  theories and real cases) stated WITH their function; bare name-drops and
  wrong facts do not count. 0 for Tracks B, C and D.
- "off_topic": true only if the script does not answer this question at all.
- "parameters": one item per parameter of the chosen track, each {"name",
  "max_marks", "cap_applied" ("" if none), "awarded", "justification": at most
  12 words}. The max_marks must add up to exactly {{MARKS}} (RULE 5).
- "penalties": every Stage-2 deduction, each {"code": "RP-1" to "RP-8",
  "trigger": at most 10 words, "deduction": a positive number from the column
  for {{MARKS}} marks}.
- "stage1_raw_sum", "total_penalties", "final_score": numbers, where
  final_score = max(0, stage1_raw_sum - total_penalties), never above {{MARKS}}.
All marks are JSON numbers in 0.25 steps. No other keys, no prose, no markdown.
################################################################################`;

  const SCHEMES_KEY = "rbi_ai_schemes";
  const RUN_SPREAD = 0.12;
  const ANCHOR_BELOW = 0.25;
  const ANCHOR_ABOVE = 0.15;
  const COVER_VALUE = { full: 1, partial: 0.5, missing: 0 };

  function schemeHash(q) {
    const src = [q.text, q.passage || "", q.modelAnswer || "", q.marks].join("\u0001");
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < src.length; i++) {
      const c = src.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
    }
    return h1.toString(36) + h2.toString(36);
  }

  function loadSchemes() {
    try { const o = JSON.parse(localStorage.getItem(SCHEMES_KEY) || "{}"); return o && typeof o === "object" ? o : {}; } catch (_) { return {}; }
  }

  function cleanScheme(raw) {
    const pts = objList(raw && (raw.points || raw.key_points), 12).map((p, i) => ({
      id: "K" + (i + 1),
      point: str(p.point || p.text || p.name, 300),
      weight: clamp(Math.round(num(p.weight) || 1), 1, 3)
    })).filter(p => p.point);
    return pts.length >= 2 ? pts : null;
  }

  function storeScheme(q, raw) {
    const points = cleanScheme(raw);
    if (!points || !q) return null;
    const hash = schemeHash(q);
    q.scheme = { hash, points };
    const all = loadSchemes();
    all[hash] = { points, createdAt: Date.now() };
    const keys = Object.keys(all);
    if (keys.length > 400) keys.sort((a, b) => (all[a].createdAt || 0) - (all[b].createdAt || 0)).slice(0, keys.length - 400).forEach(k => delete all[k]);
    try { localStorage.setItem(SCHEMES_KEY, JSON.stringify(all)); } catch (_) {}
    return q.scheme;
  }

  function schemeOf(q) {
    if (!q) return null;
    const hash = schemeHash(q);
    if (q.scheme && q.scheme.hash === hash && Array.isArray(q.scheme.points)) return q.scheme;
    const hit = loadSchemes()[hash];
    return hit && Array.isArray(hit.points) ? { hash, points: hit.points } : null;
  }

  const SCHEME_SYSTEM = "You are a senior RBI Grade B Phase-2 examiner writing the marking scheme for one descriptive question. Reply with exactly one valid JSON object.";

  function schemePrompt(q) {
    return [
      "Build the FIXED marking checklist for this question. It will be used for every attempt at this question, so that marks are consistent between attempts.",
      q.modelAnswer
        ? "Take the key points from the REFERENCE ANSWER below (the candidate uploaded it as the base answer for this question) and from what the question explicitly asks. Do not add points that are not in the reference answer unless the question clearly demands them."
        : "No reference answer was uploaded: list the points an RBI examiner expects for full marks.",
      "List 5-10 key points. Each point is one concrete, checkable sentence (a concept, cause, effect, figure, example, framework or recommendation), not a vague theme. weight: 3 = core to the question, 2 = important, 1 = supporting detail.",
      'Return {"points": [{"point": "...", "weight": 1 | 2 | 3}]}',
      "",
      "Paper: " + (q.paper || "Other") + " · " + q.marks + " marks · word limit " + (q.wordLimit || ""),
      q.passage ? "Passage / data:\n" + String(q.passage).slice(0, 3000) : "",
      "Question: " + q.text,
      q.modelAnswer ? "REFERENCE ANSWER:\n" + String(q.modelAnswer).slice(0, 14000) : ""
    ].filter(Boolean).join("\n");
  }

  async function ensureScheme(q, opts) {
    const have = schemeOf(q);
    if (have) { q.scheme = have; return have; }
    const res = await runJSON({
      role: "check",
      system: SCHEME_SYSTEM,
      prompt: schemePrompt(q),
      signal: opts && opts.signal,
      onStatus: opts && opts.onStatus,
      validate: o => !!cleanScheme(o)
    });
    return storeScheme(q, res.data);
  }

  function schemePromptBlock(scheme) {
    if (!scheme) return "";
    return [
      "################################################################################",
      "#  FIXED MARKING CHECKLIST (consistency anchor - same for every attempt)",
      "################################################################################",
      "These key points were taken once from the reference answer the candidate uploaded with this question. Every attempt at this question is marked against the same list, so that marks stay consistent and comparable:",
      ...scheme.points.map(p => p.id + " (weight " + p.weight + "): " + p.point),
      "",
      "Rules for the checklist:",
      "- Report every point in \"checklist\": \"full\" = made correctly and specifically (in any words); \"partial\" = mentioned but vague, incomplete or without the figure / example; \"missing\" = absent or wrong.",
      "- Judge by meaning, not wording. Never mark a point \"full\" unless you can quote the script.",
      "- The content marks MUST follow the checklist: an answer that covers more of the weighted points must get more content marks than one that covers fewer. Correct, relevant points beyond the list can earn some credit, but never make up for missing weight-3 points.",
      "- Apply the rubric, caps and penalties exactly as usual on top of this.",
      "",
      ""
    ].join("\n");
  }

  function checklistCoverage(r) {
    const list = r && r.checklist;
    if (!list || !list.length) return null;
    const total = sum(list.map(c => c.weight || 1));
    return total ? sum(list.map(c => (c.weight || 1) * (COVER_VALUE[c.coverage] || 0))) / total : null;
  }

  class AIError extends Error {
    constructor(kind, message, extra) {
      super(message);
      this.name = "AIError";
      this.kind = kind;
      if (extra) Object.assign(this, extra);
    }
  }

  function providerMessage(data, text, status) {
    if (data && typeof data === "object") {
      const e = data.error;
      if (e && typeof e === "object") {
        if (typeof e.message === "string" && e.message.trim()) {
          const raw = e.metadata && typeof e.metadata.raw === "string" ? e.metadata.raw : "";
          return raw && raw.length < 400 ? e.message + " - " + raw : e.message;
        }
      }
      if (typeof e === "string" && e.trim()) return e;
      if (typeof data.message === "string" && data.message.trim()) return data.message;
      if (typeof data.detail === "string" && data.detail.trim()) return data.detail;
      if (Array.isArray(data.detail) && data.detail[0] && data.detail[0].msg) return String(data.detail[0].msg);
    }
    const t = String(text || "").trim();
    if (t && t.length < 300 && !t.startsWith("<")) return t;
    return "HTTP " + status;
  }

  function retryDelayMs(data, message) {
    const details = data && data.error && Array.isArray(data.error.details) ? data.error.details : [];
    for (const d of details) {
      if (d && typeof d.retryDelay === "string") {
        const s = parseFloat(d.retryDelay);
        if (Number.isFinite(s)) return s * 1000;
      }
    }
    const m = String(message || "").match(/(?:try again|retry)(?:\s+after|\s+in)?\s+(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?)\b/i);
    if (m) {
      const v = parseFloat(m[1]);
      return /^m/i.test(m[2]) ? v : v * 1000;
    }
    return null;
  }

  function isGeminiDailyQuota(data, message) {
    const details = data && data.error && Array.isArray(data.error.details) ? data.error.details : [];
    let sawViolation = false;
    for (const d of details) {
      for (const v of (d && Array.isArray(d.violations) ? d.violations : [])) {
        sawViolation = true;
        if (/per\s*day/i.test(String(v.quotaId || "") + " " + String(v.quotaMetric || ""))) return true;
      }
    }
    if (sawViolation) return false;
    return /per day|daily/i.test(String(message || ""));
  }

  function httpError(pc, status, data, text) {
    const detail = providerMessage(data, text, status);
    const e = data && data.error && typeof data.error === "object" ? data.error : {};
    const code = String(e.code || e.type || e.status || "").toLowerCase();
    const reasons = (Array.isArray(e.details) ? e.details : []).map(d => d && d.reason).filter(Boolean);
    const extra = { status, detail, code };
    const kindIs = k => new AIError(k, detail, extra);

    if (status === 429) {
      if (pc.def.kind === "gemini") return isGeminiDailyQuota(data, detail) ? kindIs("quota") : new AIError("rate", detail, Object.assign({ retryAfterMs: retryDelayMs(data, detail) }, extra));
      if (code === "insufficient_quota" || /insufficient[_ ]quota|billing|credit/i.test(detail)) return kindIs("quota");
      return new AIError("rate", detail, Object.assign({ retryAfterMs: retryDelayMs(data, detail) }, extra));
    }
    if (status === 402) return kindIs("quota");
    if (/data policy|privacy settings|settings\/privacy/i.test(detail)) return kindIs("privacy");
    if (status === 401 || reasons.includes("API_KEY_INVALID") || /api key not valid|api key expired|invalid api key|incorrect api key|invalid x-api-key/i.test(detail)) return kindIs("auth");
    if (status === 403) return kindIs("permission");
    if (status === 404) return kindIs("model");
    if (status === 408) return kindIs("timeout");
    if (status === 413) return kindIs("too_large");
    if (status >= 500) return kindIs("overloaded");
    if (/credit balance|insufficient (balance|credits?|funds)/i.test(detail)) return kindIs("quota");
    if (/\bmodels?\b/i.test(detail) && /(not\s+(be\s+)?found|not\s+exist|does\s?n[o']t\s+exist|not\s+supported|not\s+available|no\s+such|unknown|invalid|not\s+a\s+valid|decommissioned|deprecated|retired|no longer)/i.test(detail)) return kindIs("model");
    if (/location is not supported|not available in your (country|region)/i.test(detail)) return kindIs("permission");
    return kindIs("bad_request");
  }

  async function requestJSON(url, init, opts) {
    const timeoutMs = (opts && opts.timeoutMs) || GENERATE_TIMEOUT_MS;
    const signal = opts && opts.signal;
    if (signal && signal.aborted) throw new AIError("cancelled", "Stopped.");
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
    const relay = () => ctrl.abort();
    if (signal) signal.addEventListener("abort", relay, { once: true });
    const failed = (err) => {
      if (timedOut) return new AIError("timeout", "No reply within " + Math.round(timeoutMs / 1000) + " seconds.", { timeoutMs });
      if (signal && signal.aborted) return new AIError("cancelled", "Stopped.");
      return new AIError("network", (err && err.message) || "Network error", { offline: typeof navigator !== "undefined" && navigator.onLine === false });
    };
    try {
      let res;
      try {
        res = await fetch(url, Object.assign({}, init, { signal: ctrl.signal }));
      } catch (err) {
        throw failed(err);
      }
      let text = "";
      try {
        text = await res.text();
      } catch (err) {
        throw failed(err);
      }
      let data = null;
      if (text) {
        try { data = JSON.parse(text); } catch (_) { data = null; }
      }
      return { ok: res.ok, status: res.status, data, text };
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", relay);
    }
  }

  async function withRetries(fn, opts) {
    const signal = opts && opts.signal;
    const onStatus = (opts && opts.onStatus) || function () {};
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn(attempt);
      } catch (err) {
        const limit = err instanceof AIError ? MAX_ATTEMPTS[err.kind] : 0;
        if (!limit || attempt >= limit) {
          if (err instanceof AIError) err.attempts = attempt;
          throw err;
        }
        let wait = err.retryAfterMs != null ? err.retryAfterMs + 500 : [3000, 8000, 20000][attempt - 1] || 20000;
        if (wait > 65000) { err.attempts = attempt; throw err; }
        wait = Math.max(wait, 1000);
        const why = { rate: "Rate limited", overloaded: "Provider busy", network: "Connection problem", timeout: "No reply yet" }[err.kind];
        const until = Date.now() + wait;
        while (Date.now() < until) {
          onStatus(why + " - retrying in " + Math.ceil((until - Date.now()) / 1000) + " s (attempt " + (attempt + 1) + " of " + limit + ")…");
          await sleep(Math.min(1000, until - Date.now()), signal);
        }
      }
    }
  }

  function explainError(err, pc) {
    const label = pc ? pc.def.label : "The AI provider";
    const model = pc ? pc.model : "";
    const detail = err && err.detail ? " (" + err.detail + ")" : "";
    const kind = err && err.kind;
    switch (kind) {
      case "not_configured":
        return { title: "AI grading is not set up", body: "Add your API keys with the API keys button in the top bar.", settings: true };
      case "auth":
        return { title: "API key rejected", body: label + " did not accept the API key" + detail + ". Open API keys (top bar) and paste a valid key.", settings: true };
      case "permission":
        return { title: "Access denied", body: label + " refused this request" + detail + ". The key may be restricted, the API not enabled for its project, or the service unavailable in your region.", settings: true };
      case "model":
        return { title: "Model not available", body: "The model \u201c" + model + "\u201d is not available for your key - it may have been retired or renamed" + detail + ". Open API keys (top bar), press \u201cLoad models\u201d and pick one.", settings: true };
      case "quota":
        if (pc && pc.id === "openrouter" && /:free$/.test(model)) {
          return { title: "Free daily limit reached", body: "OpenRouter allows only a limited number of free-model requests per day" + detail + ". It resets daily; adding a few credits to your OpenRouter account raises the limit, or pick another model in API keys (top bar).", settings: true };
        }
        return { title: "Quota used up", body: label + " says this key has no quota left" + detail + ". Free-tier limits reset daily; you can also choose another model or provider in API keys (top bar).", settings: true };
      case "privacy":
        return { title: "Blocked by your OpenRouter privacy settings", body: "No provider of “" + model + "” matches your account's data policy" + detail + ". Free models need “free endpoints that may train on inputs” (or similar) allowed at openrouter.ai/settings/privacy - or pick a paid model.", settings: true };
      case "rate":
        return { title: "Too many requests", body: label + " is rate-limiting this key. The app already retried; wait a minute and press Retry" + detail + ".", settings: false };
      case "overloaded":
        return { title: "Provider busy", body: label + " is overloaded or having a problem" + detail + ". Press Retry in a minute.", settings: false };
      case "network": {
        let body = "Could not reach " + label + ".";
        if (err.offline) body += " You appear to be offline.";
        else if (pc && pc.def.customBaseUrl) body += " Check that the server is running at " + pc.baseUrl + " and allows browser requests (CORS; for Ollama set OLLAMA_ORIGINS=*).";
        else body += " Check your internet connection (or an ad-blocker / firewall blocking the API).";
        return { title: "Connection failed", body, settings: !!(pc && pc.def.customBaseUrl) };
      }
      case "timeout":
        return { title: "No reply in time", body: label + " did not reply in time. Press Retry, or pick a faster model in API keys (top bar).", settings: false };
      case "blocked":
        return { title: "Grading blocked", body: label + " refused to grade this answer" + detail + ".", settings: false };
      case "truncated":
        return { title: "Reply cut off", body: "The model stopped before finishing the assessment. Press Retry; if it keeps happening, choose another model in API keys (top bar).", settings: false };
      case "format":
      case "bad_response":
        return { title: "Unreadable reply", body: "The model did not return the assessment in the expected format, even after asking twice. Press Retry, or choose a stronger model in API keys (top bar).", settings: false };
      case "too_large":
        return { title: "Answer too long for this model", body: label + " rejected the request as too large" + detail + ". Choose a model with a bigger context window.", settings: true };
      case "bad_request":
        return { title: "Request rejected", body: label + " rejected the request" + detail + ".", settings: true };
      case "cancelled":
        return { title: "Stopped", body: "Grading was stopped.", settings: false };
      default:
        return { title: "Something went wrong", body: (err && err.message) || String(err), settings: false };
    }
  }

  function usageFrom(data, kind) {
    const n = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
    if (!data || typeof data !== "object") return null;
    if (kind === "gemini") {
      const u = data.usageMetadata;
      return u ? { input: n(u.promptTokenCount), cached: n(u.cachedContentTokenCount), output: n(u.candidatesTokenCount), thinking: n(u.thoughtsTokenCount) } : null;
    }
    const u = data.usage;
    if (!u) return null;
    if (kind === "anthropic") {
      return { input: n(u.input_tokens) + n(u.cache_read_input_tokens) + n(u.cache_creation_input_tokens), cached: n(u.cache_read_input_tokens), output: n(u.output_tokens), thinking: 0 };
    }
    const reasoning = n(u.completion_tokens_details && u.completion_tokens_details.reasoning_tokens);
    return { input: n(u.prompt_tokens), cached: n(u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens), output: Math.max(0, n(u.completion_tokens) - reasoning), thinking: reasoning };
  }

  function addUsage(a, b) {
    if (!b) return a || null;
    if (!a) return Object.assign({}, b);
    return { input: a.input + b.input, cached: a.cached + b.cached, output: a.output + b.output, thinking: a.thinking + b.thinking };
  }

  function tokensText(u) {
    if (!u) return "";
    const k = v => (v >= 1000 ? (Math.round(v / 100) / 10) + "k" : String(v));
    return k(u.input) + " in" + (u.cached ? " (" + k(u.cached) + " cached)" : "") + " · " + k(u.output) + " out" + (u.thinking ? " · " + k(u.thinking) + " thinking" : "");
  }

  function geminiParse(data) {
    const cand = data && Array.isArray(data.candidates) ? data.candidates[0] : null;
    if (!cand) {
      const block = data && data.promptFeedback && data.promptFeedback.blockReason;
      if (block) throw new AIError("blocked", "Blocked: " + block, { detail: "blocked: " + block });
      throw new AIError("bad_response", "Empty reply (no candidates).");
    }
    const parts = cand.content && Array.isArray(cand.content.parts) ? cand.content.parts : [];
    const text = parts.filter(p => p && typeof p.text === "string" && !p.thought).map(p => p.text).join("");
    const reason = String(cand.finishReason || "");
    let finish = "stop";
    if (reason === "MAX_TOKENS") finish = "length";
    else if (/SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION/.test(reason)) finish = "blocked";
    if (!text.trim()) {
      if (finish === "blocked") throw new AIError("blocked", "Blocked (" + reason + ").", { detail: "safety filter: " + reason });
      if (finish === "length") throw new AIError("truncated", "The reply hit the output limit.");
      throw new AIError("bad_response", "Empty reply" + (reason ? " (" + reason + ")" : "") + ".");
    }
    return { text, finish, modelUsed: (data && data.modelVersion) || "", usage: usageFrom(data, "gemini") };
  }

  async function geminiGenerate(pc, req, opts) {
    const url = GEMINI_API + "/models/" + encodeURIComponent(pc.model) + ":generateContent";
    const variants = req.json ? (req.schema === null ? ["mime", "plain"] : ["schema", "mime", "plain"]) : ["plain"];
    let lastErr = null;
    for (const v of variants) {
      const body = {};
      if (v === "plain") {
        body.contents = [{ role: "user", parts: [{ text: (req.system ? req.system + "\n\n" : "") + req.prompt }] }];
      } else {
        body.contents = [{ role: "user", parts: [{ text: req.prompt }] }];
        if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
        const schema = req.schema === undefined ? REPORT_SCHEMA : req.schema;
        body.generationConfig = v === "schema" && schema
          ? { responseMimeType: "application/json", responseJsonSchema: schema }
          : { responseMimeType: "application/json" };
      }
      if (pc.thinking) body.generationConfig = Object.assign({}, body.generationConfig, { thinkingConfig: { thinkingLevel: pc.thinking } });
      const r = await requestJSON(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": pc.apiKey },
        body: JSON.stringify(body)
      }, opts);
      if (r.ok) return geminiParse(r.data);
      const err = httpError(pc, r.status, r.data, r.text);
      if (err.kind === "bad_request" && pc.thinking && /thinking/i.test(err.detail || err.message || "")) {
        return geminiGenerate(Object.assign({}, pc, { thinking: "" }), req, opts);
      }
      if (err.kind === "bad_request" && v !== "plain" &&
          /schema|mime|json|unknown name|invalid json payload|generation_?config|instruction|not supported|unsupported/i.test(err.detail || "")) {
        lastErr = err;
        continue;
      }
      throw err;
    }
    throw lastErr || new AIError("bad_request", "Request rejected.");
  }

  function chatCompletionsUrl(baseUrl) {
    const b = String(baseUrl || "").replace(/\/+$/, "");
    return /\/chat\/completions$/i.test(b) ? b : b + "/chat/completions";
  }

  function openaiParse(data, pc) {
    if (data && data.error) throw httpError(pc, 400, data, "");
    const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
    if (!choice) throw new AIError("bad_response", "Empty reply (no choices).");
    const msg = choice.message || {};
    let text = "";
    if (typeof msg.content === "string") text = msg.content;
    else if (Array.isArray(msg.content)) text = msg.content.map(p => (p && typeof p.text === "string" ? p.text : "")).join("");
    const reason = String(choice.finish_reason || "");
    const finish = reason === "length" ? "length" : (reason === "content_filter" ? "blocked" : "stop");
    if (!text.trim()) {
      if (typeof msg.refusal === "string" && msg.refusal) throw new AIError("blocked", msg.refusal, { detail: msg.refusal });
      if (finish === "blocked") throw new AIError("blocked", "Blocked by the content filter.", { detail: "content filter" });
      if (finish === "length") throw new AIError("truncated", "The reply hit the output limit.");
      throw new AIError("bad_response", "Empty reply.");
    }
    return { text, finish, modelUsed: (data && data.model) || "", usage: usageFrom(data, "openai") };
  }

  async function openaiGenerate(pc, req, opts) {
    const headers = { "Content-Type": "application/json" };
    if (pc.apiKey) headers.Authorization = "Bearer " + pc.apiKey;
    Object.assign(headers, pc.def.headers || {});
    const variants = req.json ? ["json", "plain"] : ["plain"];
    let lastErr = null;
    for (const v of variants) {
      const messages = [];
      if (req.system) messages.push({ role: "system", content: req.system });
      messages.push({ role: "user", content: req.prompt });
      const body = { model: pc.model, messages };
      if (v === "json") body.response_format = { type: "json_object" };
      const maxTokens = pc.def.maxTokens ? pc.def.maxTokens(pc.model) : 0;
      if (maxTokens && req.json) body.max_tokens = maxTokens;
      const r = await requestJSON(chatCompletionsUrl(pc.baseUrl), { method: "POST", headers, body: JSON.stringify(body) }, opts);
      if (r.ok) return openaiParse(r.data, pc);
      const err = httpError(pc, r.status, r.data, r.text);
      if (v === "json" && err.kind === "bad_request" &&
          /response_format|json_object|json mode|json_validate|failed to generate json|not supported|unsupported/i.test((err.detail || "") + " " + (err.code || ""))) {
        lastErr = err;
        continue;
      }
      throw err;
    }
    throw lastErr || new AIError("bad_request", "Request rejected.");
  }

  async function anthropicGenerate(pc, req, opts) {
    const body = { model: pc.model, max_tokens: req.json ? (req.maxTokens || 16000) : 64, messages: [{ role: "user", content: req.prompt }] };
    if (req.system) body.system = req.system;
    const headers = {
      "Content-Type": "application/json",
      "x-api-key": pc.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    };
    for (let tries = 0; tries < 2; tries++) {
      const r = await requestJSON(ANTHROPIC_API + "/messages", { method: "POST", headers, body: JSON.stringify(body) }, opts);
      if (r.ok) {
        const data = r.data || {};
        const blocks = Array.isArray(data.content) ? data.content : [];
        const text = blocks.filter(b => b && b.type === "text" && typeof b.text === "string").map(b => b.text).join("");
        const stop = String(data.stop_reason || "");
        if (!text.trim()) {
          if (stop === "refusal") throw new AIError("blocked", "The model declined.", { detail: "refusal" });
          if (stop === "max_tokens") throw new AIError("truncated", "The reply hit the output limit.");
          throw new AIError("bad_response", "Empty reply.");
        }
        return { text, finish: stop === "max_tokens" ? "length" : (stop === "refusal" ? "blocked" : "stop"), modelUsed: data.model || "", usage: usageFrom(data, "anthropic") };
      }
      const err = httpError(pc, r.status, r.data, r.text);
      const m = /max_tokens[^0-9]*\d+\s*>\s*(\d+)/i.exec(err.detail || "");
      if (err.kind === "bad_request" && m && tries === 0) { body.max_tokens = Number(m[1]); continue; }
      throw err;
    }
    throw new AIError("bad_request", "Request rejected.");
  }

  function generate(pc, req, opts) {
    if (pc.def.kind === "gemini") return geminiGenerate(pc, req, opts);
    if (pc.def.kind === "anthropic") return anthropicGenerate(pc, req, opts);
    return openaiGenerate(pc, req, opts);
  }

  function sortModels(list, def) {
    const seen = new Set();
    const uniq = list.filter(m => m.id && !seen.has(m.id) && seen.add(m.id));
    const rank = id => { const i = def.suggestions.indexOf(id); return i < 0 ? 999 : i; };
    const group = id => (def.modelRank ? def.modelRank(id) : 0);
    return uniq.sort((a, b) => (rank(a.id) - rank(b.id)) || (group(a.id) - group(b.id)) ||
      (def.modelRank ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id, undefined, { numeric: true })));
  }

  async function listModels(pc) {
    const opts = { timeoutMs: QUICK_TIMEOUT_MS };
    const out = [];
    if (pc.def.kind === "gemini") {
      let token = "";
      for (let page = 0; page < 5; page++) {
        const url = GEMINI_API + "/models?pageSize=1000" + (token ? "&pageToken=" + encodeURIComponent(token) : "");
        const r = await requestJSON(url, { headers: { "x-goog-api-key": pc.apiKey } }, opts);
        if (!r.ok) throw httpError(pc, r.status, r.data, r.text);
        for (const m of (r.data && Array.isArray(r.data.models) ? r.data.models : [])) {
          const id = String(m.name || "").replace(/^models\//, "");
          const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
          if (!id || !methods.includes("generateContent")) continue;
          if (/embed|aqa|imagen|veo|tts|audio|live|image|robotics|computer-use|gemma|learnlm|lyria|banana/i.test(id)) continue;
          out.push({ id, label: m.displayName || id });
        }
        token = r.data && r.data.nextPageToken;
        if (!token) break;
      }
    } else if (pc.def.kind === "anthropic") {
      const r = await requestJSON(ANTHROPIC_API + "/models?limit=1000", {
        headers: { "x-api-key": pc.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }
      }, opts);
      if (!r.ok) throw httpError(pc, r.status, r.data, r.text);
      for (const m of (r.data && Array.isArray(r.data.data) ? r.data.data : [])) out.push({ id: m.id, label: m.display_name || m.id });
    } else {
      const headers = {};
      if (pc.apiKey) headers.Authorization = "Bearer " + pc.apiKey;
      const r = await requestJSON(String(pc.baseUrl).replace(/\/chat\/completions$/i, "") + "/models", { headers }, opts);
      if (!r.ok) throw httpError(pc, r.status, r.data, r.text);
      const rows = Array.isArray(r.data) ? r.data : (r.data && (r.data.data || r.data.models)) || [];
      for (const m of rows) {
        const id = typeof m === "string" ? m : (m && (m.id || m.name)) || "";
        if (id && (!pc.def.modelFilter || pc.def.modelFilter(id, typeof m === "object" ? m : null))) out.push({ id, label: (m && m.name) || id });
      }
    }
    return sortModels(out, pc.def);
  }

  async function testConnection(pc) {
    if (!pc.ready) throw new AIError("not_configured", "No API key.");
    const t0 = Date.now();
    const res = await generate(pc, { system: "", prompt: "Connection test. Reply with exactly: OK", json: false }, { timeoutMs: 60000 });
    return { ms: Date.now() - t0, modelUsed: res.modelUsed || pc.model, reply: res.text.trim().slice(0, 60) };
  }

  function extractJSON(text) {
    if (!text) return null;
    let t = String(text).replace(/^\uFEFF/, "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const tries = [t];
    if (fence) tries.push(fence[1].trim());
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) tries.push(t.slice(start, end + 1));
    for (const candidate of tries) {
      try {
        const v = JSON.parse(candidate);
        if (v && typeof v === "object" && !Array.isArray(v)) return v;
      } catch (_) {}
    }
    return null;
  }

  function normCode(code) {
    const s = String(code || "").toUpperCase();
    const m = s.match(/RP\s*-?\s*([1-8])/);
    if (m) return "RP-" + m[1];
    if (/TYPO/.test(s)) return "TYPO";
    return s.trim().slice(0, 12);
  }

  function normCoverage(v) {
    const s = String(v || "").toUpperCase();
    if (/DEEP|BALANCED|WELL/.test(s)) return "DEEP & BALANCED";
    if (/TEXTBOOK/.test(s)) return "TEXTBOOK ONLY";
    if (/SUPERFICIAL|PARTIAL|SHALLOW|WEAK/.test(s)) return "SUPERFICIAL";
    if (/MISS|ABSENT|NOT/.test(s)) return "MISSED";
    return "";
  }

  const KEEP_UPPER = /^(?:RBI|IBC|GDP|GVA|ESI|FM|F&M|MPC|SEBI|NITI|HDI|MPI|CPI|WPI|RP|IMF|NSO|UPSC|SDG|NPA|ECF|CRR|SLR)$/;
  function criterionName(raw) {
    let t = str(raw, 200);
    const code = (t.match(/^(P\d)\b/i) || [])[1];
    if (code) t = t.slice(code.length).replace(/^\s*[.:\-–—]?\s*/, "");
    const letters = t.replace(/[^A-Za-z]/g, "");
    if (letters && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.7) {
      t = t.toLowerCase().replace(/[a-z][a-z&]*/g, w => (KEEP_UPPER.test(w.toUpperCase()) ? w.toUpperCase() : w));
      t = t.charAt(0).toUpperCase() + t.slice(1);
    }
    t = t.replace(/\s*[—–]\s*/g, " - ").replace(/"/g, "");
    return code ? code.toUpperCase() + " · " + t : t;
  }

  function normalizeReport(o, q, answerText) {
    const max = maxMarksOf(q);
    const parameters = objList(o.parameters, 8).map(p => {
      const pmax = num(p.max_marks != null ? p.max_marks : p.max);
      let awarded = num(p.awarded != null ? p.awarded : (p.marks_awarded != null ? p.marks_awarded : p.score));
      if (awarded !== null) awarded = Math.max(0, pmax !== null && pmax > 0 ? Math.min(awarded, pmax) : awarded);
      return { name: criterionName(p.name || p.parameter || p.criterion), max: pmax, awarded, cap: str(p.cap_applied || p.cap, 300), why: str(p.justification || p.reason || p.comment, 1500), lost: strList(p.lost, 6, 400) };
    }).filter(p => p.name || p.why);
    const scriptPlain = plainText(answerText);
    const verified = v => (v && quoteInScript(v, scriptPlain) ? v : "");
    const penalties = objList(o.penalties, 15).map(p => ({
      code: normCode(p.code),
      trigger: str(p.trigger || p.reason || p.detail, 600),
      quote: verified(str(p.quote, 400)),
      deduction: Math.abs(num(p.deduction != null ? p.deduction : p.marks) || 0)
    })).filter(p => p.deduction > 0 || /^RP-[1-8]$/.test(p.code));

    const track = /^[ABCD]$/.test(String(o.track || "").trim().toUpperCase().charAt(0)) ? String(o.track).trim().toUpperCase().charAt(0) : "";
    const checks = objList(o.examiner_checks, 15).map(c => {
      const res = String(c.result != null ? c.result : c.pass).trim().toUpperCase();
      return { id: Number(String(c.id || "").replace(/[^0-9]/g, "")) || 0, pass: /^(YES|TRUE|PASS)/.test(res) ? true : /^(NO|FALSE|FAIL)/.test(res) ? false : null, evidence: str(c.evidence || c.reason, 600) };
    }).filter(c => c.id);
    const anchorCount = num(o.anchor_count);
    const words = answerText ? wordsIn(answerText) : 0;
    const enforced = track ? enforceRubric(track, parameters, penalties, checks, anchorCount, q, words) : { rules: [], autoFail: false };
    for (let i = penalties.length - 1; i >= 0; i--) if (!(penalties[i].deduction > 0)) penalties.splice(i, 1);
    const offTopic = o.off_topic === true || /^(?:true|yes)$/i.test(String(o.off_topic == null ? "" : o.off_topic).trim());
    if (offTopic) enforced.rules.push("Off-topic answer: the rubric gives 0 marks.");

    const scored = parameters.filter(p => p.awarded !== null);
    if (!scored.length) throw new AIError("format", "The reply had no marks breakdown.");
    const rawSum = scored.length ? round2(sum(scored.map(p => p.awarded))) : num(o.stage1_raw_sum);
    const penaltySum = penalties.length || Array.isArray(o.penalties) ? round2(sum(penalties.map(p => p.deduction))) : Math.abs(num(o.total_penalties) || 0);
    const modelFinal = num(o.final_score != null ? o.final_score : o.score);
    let score = rawSum !== null ? rawSum - penaltySum : modelFinal;
    if (enforced.autoFail || offTopic) score = 0;
    if (score === null || !Number.isFinite(score)) {
      throw new AIError("format", "The reply contained no usable score.");
    }
    const unclamped = round2(score);
    score = clamp(unclamped, 0, max);
    const capped = unclamped !== score;
    const ceiling = track ? ceilingFor(track, max) : max;
    const ceilingApplied = score > ceiling + 1e-9;
    if (ceilingApplied) {
      score = ceiling;
      enforced.rules.push("Capped at the rubric's hard ceiling of " + fmt(ceiling) + " / " + fmt(max) + " for this answer type (a real exam panel marks about 2-3 marks higher).");
    }
    const percent = round1(score / max * 100);
    const g = gradeFor(percent);

    return {
      score,
      max,
      percent,
      grade: g.grade,
      projection: projectionFor(score, max),
      rawSum: rawSum !== null ? rawSum : null,
      penaltySum,
      capped,
      ceiling,
      ceilingApplied,
      offTopic,
      autoFail: enforced.autoFail,
      modelFinal,
      adjusted: modelFinal !== null && Math.abs(clamp(modelFinal, 0, max) - score) >= 0.125,
      rules: enforced.rules,
      checks: checks.map(c => ({ id: c.id, pass: c.pass, evidence: c.evidence, label: ((EXAMINER_CHECKS[track] || {})[c.id] || [""])[0] })),
      anchorCount,
      checklist: (function () {
        const scheme = schemeOf(q);
        if (!scheme) return [];
        const got = objList(o.checklist, 15);
        return scheme.points.map((p, i) => {
          const c = got.find(x => String(x.id || "").trim().toUpperCase() === p.id) || got[i] || {};
          const cov = String(c.coverage || "").toLowerCase();
          const quote = str(c.quote, 400);
          const coverage = COVER_VALUE[cov] === undefined ? "missing" : (cov === "full" && (!quote || !quoteInScript(quote, plainText(answerText))) ? "partial" : cov);
          return { id: p.id, point: p.point, weight: p.weight, coverage, quote };
        });
      })(),
      track,
      subparts: objList(o.subparts, 10).map(s => ({ part: str(s.part || s.name, 300), coverage: normCoverage(s.coverage), comment: str(s.comment || s.note, 600) })).filter(s => s.part),
      caps: strList(o.caps_triggered, 8, 300).filter(c => !/^none\.?$/i.test(c)),
      pacing: str(o.pacing_audit, 1200),
      anchorsUsed: strList(o.anchors_used, 10, 300).filter(c => !/^none\.?$/i.test(c)),
      nameDrops: strList(o.bare_name_drops, 10, 300).filter(c => !/^none\.?$/i.test(c)),
      missingAnchors: strList(o.missing_anchors, 8, 400),
      verifyFlags: strList(o.verify_flags, 8, 300).filter(c => !/^none\.?$/i.test(c)),
      errors: objList(o.error_log, 12).map(x => ({ quote: str(x.quote, 600), code: normCode(x.code), problem: str(x.problem || x.issue, 600), correction: str(x.correction || x.fix, 800) })).filter(x => x.quote && quoteInScript(x.quote, scriptPlain) && (x.problem || x.correction)),
      parameters,
      penalties,
      meritCheck: str(o.merit_check, 800),
      summary: str(o.summary, 1500),
      strengths: strList(o.strengths, 5, 400),
      rewrites: objList(o.rewrites, 12).map(x => ({ before: str(x.before, 1200), after: str(x.after, 1600).replace(/\\n/g, "\n"), why: str(x.why, 500) }))
        .filter(x => x.before && x.after && quoteInScript(x.before, scriptPlain) && plainText(x.before) !== plainText(x.after)).slice(0, 8),
      additions: objList(o.additions, 8).map(x => ({ after: str(x.after, 600), add: str(x.add || x.text, 1200).replace(/\\n/g, "\n"), why: str(x.why, 500) }))
        .filter(x => x.add && (!x.after || quoteInScript(x.after, scriptPlain))).slice(0, 5),
      modelAnswer: str(o.model_answer, 14000).replace(/\\n/g, "\n"),
      actions: strList(o.action_plan, 5, 500),
      topic: sanitizeTopic(o.topic) || sanitizeTopic(q && q.topic),
      conceptGaps: strList(o.concept_gaps, 6, 400).filter(c => !/^none\.?$/i.test(c)),
      writing: normalizeWriting(o.writing_audit, answerText)
    };
  }

  function sanitizeTopic(v) {
    const t = str(v, 120).replace(/^topic\s*[:\-]\s*/i, "").trim();
    return /^(?:not specified|none|n\/a|unknown)$/i.test(t) ? "" : t;
  }

  function normalizeWriting(w, answerText) {
    if (!w || typeof w !== "object" || Array.isArray(w)) return null;
    const script = plainText(answerText);
    const scriptWords = new Set(script.split(" "));
    const obj = v => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
    const style = obj(w.style);
    const structure = obj(w.structure);
    const vocab = obj(w.vocabulary);
    const craft = obj(w.sentence_craft);
    let verdict = str(style.verdict, 40);
    if (/ready|yes|meets|good/i.test(verdict) && !/not|near/i.test(verdict)) verdict = "RBI-ready";
    else if (/near|close|almost|partly|partial/i.test(verdict)) verdict = "Nearly there";
    else if (verdict) verdict = "Not yet";
    const score = num(style.score);
    const out = {
      grammar: objList(w.grammar_errors, 25).map(x => ({ quote: str(x.quote, 500), type: str(x.type, 40).toLowerCase(), explanation: str(x.explanation || x.error || x.problem, 500), correction: str(x.correction || x.fix, 600) }))
        .filter(x => x.quote && x.correction && quoteInScript(x.quote, script) && plainText(x.quote) !== plainText(x.correction) && !onlyBritishChanges(x.quote, x.correction)),
      spelling: objList(w.spelling_errors, 30).map(x => ({ wrong: str(x.wrong || x.word, 80), correct: str(x.correct || x.correction, 80), context: str(x.context, 200) }))
        .filter(x => x.wrong && x.correct && x.wrong.toLowerCase() !== x.correct.toLowerCase() && (!script || plainText(x.wrong).split(" ").every(t => scriptWords.has(t))) && !isBritishVariant(x.wrong, x.correct)),
      facts: objList(w.factual_errors, 12).map(x => {
        const problem = str(x.problem || x.issue, 600);
        const fact = str(x.correct_fact || x.correction, 600);
        return { quote: str(x.quote, 500), problem, fact, verify: /\[?\s*VERIFY\b/i.test(problem + " " + fact) };
      }).filter(x => x.quote && quoteInScript(x.quote, script) && (x.problem || x.fact)),
      style: { verdict, score: score === null ? null : clamp(round1(score), 0, 10), assessment: str(style.assessment, 1500), issues: strList(style.issues, 10, 300) },
      structure: { assessment: str(structure.assessment, 1200), issues: strList(structure.issues, 8, 300) },
      vocabulary: { assessment: str(vocab.assessment, 800), weak: objList(vocab.weak_words, 12).map(x => ({ used: str(x.used, 120), better: str(x.better, 160) })).filter(x => x.used && x.better && quoteInScript(x.used, script) && !isBritishVariant(x.used, x.better) && !onlyBritishChanges(x.used, x.better)) },
      craft: { assessment: str(craft.assessment, 800), examples: strList(craft.examples, 6, 600).filter(x => quoteInScript(x, script)) },
      presentation: str(w.presentation, 800),
      plan: strList(w.improvement_plan, 10, 500)
    };
    const any = out.grammar.length || out.spelling.length || out.facts.length || out.style.assessment || out.structure.assessment || out.plan.length;
    return any ? out : null;
  }

  function notAttemptedReport(test, q) {
    const max = maxMarksOf(q);
    return {
      v: REPORT_VERSION,
      testId: test.id,
      qid: q.id,
      notAttempted: true,
      score: 0, max, percent: 0, grade: "F", projection: null,
      summary: "You did not write anything for this question, so it scores 0 - the same as in the real exam. Even a short structured attempt (a one-line definition, three numbered points and a one-line way forward) earns marks, so never leave a question blank.",
      modelAnswer: str(q.modelAnswer, 14000),
      modelAnswerFromQuestion: true,
      parameters: [], penalties: [], subparts: [], caps: [], anchorsUsed: [], nameDrops: [],
      missingAnchors: [], verifyFlags: [], errors: [], strengths: [], rewrites: [], actions: [],
      wordCount: 0, wordLimit: wordLimitOf(q),
      provider: "", providerLabel: "", model: "", modelUsed: "",
      createdAt: Date.now(), durationMs: 0
    };
  }

  async function gradeAnswer(test, idx, opts) {
    const q = test.questions[idx];
    const onStatus = (opts && opts.onStatus) || function () {};
    if (!activeProvider("grading").ready) throw new AIError("not_configured", "No API key set up.");
    const started = Date.now();
    if (!schemeOf(q) && activeProvider("check").ready) {
      onStatus("Building the marking checklist from your reference answer…");
      try { await ensureScheme(q, { signal: opts && opts.signal }); } catch (err) {
        if (err.kind === "cancelled") throw err;
        console.warn("Marking checklist not built:", err && err.message);
      }
    }
    const max = maxMarksOf(q);
    const ans = answerOf(test, q);
    const pass = (label, scoreOnly) => gradeOnce(test, idx, Object.assign({}, opts, { scoreOnly, onStatus: m => onStatus(label + ": " + m) }));
    const extra = async (label) => {
      try { return await pass(label, true); } catch (err) { if (err.kind === "cancelled") throw err; return null; }
    };
    const runs = [];
    let reason = "";
    if (getSettings().passes === "two") {
      const [full, check] = await Promise.allSettled([pass("Grading", false), pass("Cross-check", true)]);
      if (full.status === "fulfilled") runs.push(full.value);
      else if (full.reason && full.reason.kind === "cancelled") throw full.reason;
      else runs.push(await pass("Grading again", false));
      if (check.status === "fulfilled") runs.push(check.value);
      reason = "set to two gradings for every answer";
    } else {
      runs.push(await pass("Grading", false));
      reason = crossCheckReason(runs[0], q, ans);
      if (reason) {
        onStatus("Cross-checking the mark (" + reason + ")…");
        const r = await extra("Cross-check");
        if (r) runs.push(r);
      }
    }
    if (runs.length === 2 && Math.abs(runs[0].score - runs[1].score) > RUN_SPREAD * max) {
      onStatus("The two gradings differ by " + fmt(Math.abs(runs[0].score - runs[1].score)) + " marks - a third, deciding grading…");
      const r = await extra("Deciding grading");
      if (r) runs.push(r);
    }
    const fullRun = runs.find(r => !r.scoreOnly);
    if (runs.length >= 2 && fullRun && Math.abs(fullRun.score - combinedMark(runs.map(r => r.score))) > RUN_SPREAD * max) {
      onStatus("Writing fresh feedback (the first grading disagreed with the others)…");
      try { runs.push(await pass("Feedback", false)); } catch (err) { if (err.kind === "cancelled") throw err; }
    }
    return combineRuns(runs, q, max, started, reason);
  }

  function combinedMark(scores) {
    const s = scores.slice().sort((a, b) => a - b);
    const n = s.length;
    if (!n) return 0;
    if (n < 3) return sum(s) / n;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }

  const LEX_STOP = new Set("that this with from have been were their there which what when where while also into than then them they these those such only more most very much many some other over under about after before between because would could should shall will must each every both either neither does doing done make made using used uses being upon onto your yours itself shows show shown gives given give take taken takes like just even still well same different within without across along among around through during against towards toward".split(" "));
  function lexWords(text) {
    return (String(text || "").toLowerCase().match(/[a-z][a-z0-9-]*/g) || [])
      .filter(w => w.length >= 4 && !LEX_STOP.has(w))
      .map(w => (w.length > 5 ? w.replace(/(ational|ations|ation|ities|ity|ings|ing|ments|ment|ness|ies|ied|ed|es|s|ly|al)$/, "") : w.replace(/s$/, "")));
  }

  function lexicalCoverage(points, answerText) {
    const have = new Set(lexWords(answerText));
    let total = 0;
    let got = 0;
    (points || []).forEach(p => {
      const ws = [...new Set(lexWords(p.point))];
      if (!ws.length) return;
      const hit = ws.filter(w => have.has(w)).length / ws.length;
      total += p.weight || 1;
      got += (p.weight || 1) * (hit >= 0.5 ? 1 : hit >= 0.25 ? 0.5 : 0);
    });
    return total ? got / total : null;
  }

  function crossCheckReason(r, q, ans) {
    const scheme = schemeOf(q);
    const max = maxMarksOf(q);
    const words = (ans && ans.wordCount) || 0;
    const substantial = words >= Math.max(60, 0.3 * wordLimitOf(q));
    const modelCov = checklistCoverage(r);
    const lex = scheme ? lexicalCoverage(scheme.points, ans && ans.text) : null;
    if (scheme && modelCov === null && substantial) return "the marking checklist was missing from the reply";
    if (modelCov !== null && lex !== null && Math.abs(modelCov - lex) >= 0.45) return "its checklist verdict does not match the text of your answer";
    if (r.score === 0 && substantial && (lex === null || lex >= 0.3)) return "a zero for a full, on-topic answer";
    if (r.score >= 0.52 * max && lex !== null && lex < 0.2) return "a top-grade mark for an answer that covers little of the reference";
    return "";
  }

  function combineRuns(runs, q, max, started, reason) {
    const scores = runs.map(r => r.score);
    const sorted = scores.slice().sort((a, b) => a - b);
    let final = combinedMark(scores);
    const combined = final;
    const method = sorted.length === 1 ? "one full grading" : sorted.length === 2 ? "average of 2 independent gradings" : "median of " + sorted.length + " independent gradings (the first two disagreed)";
    const covs = runs.map(checklistCoverage).filter(c => c !== null).sort((a, b) => a - b);
    const coverage = !covs.length ? null : covs.length % 2 ? covs[(covs.length - 1) / 2] : (covs[covs.length / 2 - 1] + covs[covs.length / 2]) / 2;
    let anchored = "";
    const track = (runs.find(r => r.track) || {}).track || "";
    const ceiling = track ? ceilingFor(track, max) : max;
    if (coverage !== null) {
      const anchor = coverage * ceiling;
      const lo = Math.max(0, anchor - ANCHOR_BELOW * max);
      const hi = Math.min(ceiling, anchor + ANCHOR_ABOVE * max);
      if (final < lo) { anchored = "raised"; final = lo; }
      else if (final > hi) { anchored = "lowered"; final = hi; }
    }
    final = clamp(Math.round(final * 4) / 4, 0, ceiling);
    const fulls = runs.filter(r => !r.scoreOnly);
    const base = (fulls.length ? fulls : runs).slice().sort((a, b) => Math.abs(a.score - combined) - Math.abs(b.score - combined))[0];
    const usage = runs.reduce((u, r) => addUsage(u, r.usage), null);
    if (base.checklist && base.checklist.length) {
      base.checklist = base.checklist.map((c, i) => {
        const votes = runs.map(r => (r.checklist && r.checklist[i] ? r.checklist[i].coverage : null)).filter(Boolean);
        const tally = {};
        votes.forEach(v => { tally[v] = (tally[v] || 0) + 1; });
        const top = Object.keys(tally).sort((a, b) => tally[b] - tally[a] || COVER_VALUE[b] - COVER_VALUE[a])[0];
        return Object.assign({}, c, { coverage: top || c.coverage });
      });
    }
    const percent = round1(final / max * 100);
    return Object.assign(base, {
      score: final,
      percent,
      grade: gradeFor(percent).grade,
      projection: projectionFor(final, max, true),
      consistency: {
        runs: scores,
        method,
        coverage: coverage === null ? null : round1(coverage * 100),
        anchored,
        spread: round2(sorted[sorted.length - 1] - sorted[0]),
        reason: runs.length > 1 ? (reason || "") : "",
        feedbackOff: runs.length > 1 && Math.abs(base.score - combined) > RUN_SPREAD * max
      },
      usage,
      durationMs: Date.now() - started
    });
  }

  async function gradeOnce(test, idx, opts) {
    const q = test.questions[idx];
    const ans = answerOf(test, q);
    const ref = { pc: activeProvider("grading"), fallbackFrom: "" };
    if (!ref.pc.ready) throw new AIError("not_configured", "No API key set up.");
    const onStatus = (opts && opts.onStatus) || function () {};
    const scoreOnly = !!(opts && opts.scoreOnly);
    const req = { system: SYSTEM_INSTRUCTION, prompt: buildPrompt(test, q, idx, scoreOnly), json: true, schema: scoreOnly ? SCORE_SCHEMA : undefined };
    const netOpts = { timeoutMs: GENERATE_TIMEOUT_MS, signal: opts && opts.signal };
    const started = Date.now();
    let usage = null;

    const call = async () => {
      onStatus("Grading with " + ref.pc.def.label + " · " + ref.pc.model + "…");
      try {
        return await withRetries(() => generate(ref.pc, req, netOpts), { signal: netOpts.signal, onStatus });
      } catch (err) {
        if (err.kind === "model" && ref.pc.def.kind === "gemini" && ref.pc.model !== GEMINI_FALLBACK_MODEL) {
          ref.fallbackFrom = ref.pc.model;
          ref.pc = Object.assign({}, ref.pc, { model: GEMINI_FALLBACK_MODEL });
          onStatus("\u201c" + ref.fallbackFrom + "\u201d is not available - trying " + GEMINI_FALLBACK_MODEL + "…");
          return await withRetries(() => generate(ref.pc, req, netOpts), { signal: netOpts.signal, onStatus });
        }
        throw err;
      }
    };

    let lastErr = null;
    let lastRaw = "";
    for (let round = 1; round <= 2; round++) {
      let res;
      try {
        res = await call();
      } catch (err) {
        if (round === 1 && (err.kind === "bad_response" || err.kind === "truncated")) {
          lastErr = err;
          onStatus("The reply was incomplete - asking again…");
          continue;
        }
        throw err;
      }
      usage = addUsage(usage, res.usage);
      lastRaw = res.text;
      const obj = extractJSON(res.text);
      if (obj) {
        try {
          const report = normalizeReport(obj, q, ans.text);
          report.scoreOnly = scoreOnly;
          report.usage = usage;
          if (!report.projection && ans.wordCount >= 60) report.projection = projectionFor(report.score, report.max, true);
          return Object.assign(report, {
            v: REPORT_VERSION,
            testId: test.id,
            qid: q.id,
            wordCount: ans.wordCount,
            wordLimit: wordLimitOf(q),
            provider: ref.pc.id,
            providerLabel: ref.pc.def.label,
            model: ref.pc.model + (ref.pc.thinking ? " (" + ref.pc.thinking + ")" : ""),
            modelUsed: res.modelUsed && res.modelUsed !== ref.pc.model ? res.modelUsed : "",
            fallbackFrom: ref.fallbackFrom,
            createdAt: Date.now(),
            durationMs: Date.now() - started
          });
        } catch (err) {
          lastErr = err;
        }
      } else {
        lastErr = new AIError(res.finish === "length" ? "truncated" : "format", "The reply was not a valid assessment.");
      }
      if (round === 1) onStatus("The reply was not a complete assessment - asking again…");
    }
    if (lastErr) {
      lastErr.raw = lastRaw;
      throw lastErr;
    }
    throw new AIError("format", "No assessment.", { raw: lastRaw });
  }

  async function runJSON(req) {
    const pc = activeProvider(req.role || "check");
    if (!pc.ready) throw new AIError("not_configured", "No API key set up.");
    const onStatus = req.onStatus || function () {};
    const netOpts = { timeoutMs: req.timeoutMs || GENERATE_TIMEOUT_MS, signal: req.signal };
    const call = { system: req.system, prompt: req.prompt, json: true, schema: req.schema === undefined ? null : req.schema };
    let lastErr = null;
    let lastRaw = "";
    let usage = null;
    for (let round = 1; round <= 2; round++) {
      let res;
      try {
        res = await withRetries(() => generate(pc, call, netOpts), { signal: req.signal, onStatus });
      } catch (err) {
        if (round === 1 && (err.kind === "bad_response" || err.kind === "truncated")) { lastErr = err; onStatus("The reply was incomplete - asking again…"); continue; }
        throw err;
      }
      usage = addUsage(usage, res.usage);
      lastRaw = res.text;
      const obj = extractJSON(res.text);
      if (obj && (!req.validate || req.validate(obj))) return { data: obj, provider: pc.def.label, model: pc.model, thinking: pc.thinking, modelUsed: res.modelUsed || "", usage };
      lastErr = new AIError(res.finish === "length" ? "truncated" : "format", "The reply was not in the expected format.");
      if (round === 1) onStatus("The reply was not complete - asking again…");
    }
    lastErr.raw = lastRaw;
    throw lastErr;
  }

  let reportsCache = null;
  let storageProblem = "";

  function loadReports() {
    if (reportsCache) return reportsCache;
    try {
      const o = JSON.parse(localStorage.getItem(REPORTS_KEY) || "{}");
      reportsCache = o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch (_) {
      reportsCache = {};
    }
    return reportsCache;
  }

  function newestTime(byQ) {
    let t = 0;
    for (const r of Object.values(byQ || {})) t = Math.max(t, (r && r.createdAt) || 0);
    return t;
  }

  function dropOldestTest(all, keepTestId) {
    let oldestId = null;
    let oldest = Infinity;
    for (const [tid, byQ] of Object.entries(all)) {
      if (tid === keepTestId) continue;
      const t = newestTime(byQ);
      if (t < oldest) { oldest = t; oldestId = tid; }
    }
    if (oldestId === null) return false;
    delete all[oldestId];
    return true;
  }

  function persistReports(all, keepTestId) {
    let pruned = 0;
    while (JSON.stringify(all).length > REPORTS_MAX_CHARS && dropOldestTest(all, keepTestId)) pruned++;
    for (;;) {
      try {
        localStorage.setItem(REPORTS_KEY, JSON.stringify(all));
        reportsCache = all;
        return { ok: true, pruned };
      } catch (_) {
        if (!dropOldestTest(all, keepTestId)) {
          reportsCache = all;
          return { ok: false, pruned };
        }
        pruned++;
      }
    }
  }

  function getReport(testId, qid) {
    const byQ = loadReports()[testId];
    return (byQ && byQ[qid]) || null;
  }

  function saveReport(report) {
    const all = loadReports();
    all[report.testId] = all[report.testId] || {};
    all[report.testId][report.qid] = report;
    const res = persistReports(all, report.testId);
    if (!res.ok) storageProblem = "Browser storage is full, so the latest AI report could not be saved permanently (its score is still in History). Download reports you want to keep.";
    else if (res.pruned) storageProblem = "Older detailed AI reports were removed to free browser storage. Their scores are still in History.";
    return res;
  }

  function deleteTestReports(testId) {
    stopTest(testId);
    const all = loadReports();
    if (all[testId]) {
      delete all[testId];
      persistReports(all, null);
    }
  }

  function clearAllReports() {
    for (const job of jobs.values()) cancelJob(job);
    reportsCache = {};
    try { localStorage.removeItem(REPORTS_KEY); } catch (_) {}
  }

  function historyList() {
    return typeof loadJSON === "function" ? loadJSON("rbi_history", []) : [];
  }

  function findTest(testId) {
    if (typeof state !== "undefined" && state.lastResultTest && state.lastResultTest.id === testId) return state.lastResultTest;
    const h = historyList();
    return (Array.isArray(h) ? h : []).find(t => t && t.id === testId) || null;
  }

  function writeScore(testId, qid, score) {
    const history = historyList();
    const t = Array.isArray(history) ? history.find(h => h && h.id === testId) : null;
    if (t) {
      t.scores = t.scores || {};
      t.scores[qid] = score;
      t.totalScore = Object.values(t.scores).reduce((a, b) => a + (Number(b) || 0), 0);
      if (typeof saveJSON === "function") saveJSON("rbi_history", history);
    }
    if (typeof state !== "undefined" && state.lastResultTest && state.lastResultTest.id === testId) {
      state.lastResultTest.scores = state.lastResultTest.scores || {};
      state.lastResultTest.scores[qid] = score;
    }
    if (t && typeof calOnTestScored === "function") {
      try { calOnTestScored("write", testId); } catch (e) { console.warn("Calendar update failed:", e); }
    }
    return !!t;
  }

  const jobs = new Map();
  const queue = [];
  const runs = new Map();
  let running = 0;

  function jobKey(testId, qid) { return testId + "::" + qid; }
  function getJob(testId, qid) { return jobs.get(jobKey(testId, qid)) || null; }
  function isActive(job) { return !!job && (job.status === "queued" || job.status === "running"); }

  function anyActive(testId) {
    for (const j of jobs.values()) if (isActive(j) && (!testId || j.testId === testId)) return true;
    return false;
  }

  function enqueue(test, idx) {
    const q = test.questions[idx];
    const key = jobKey(test.id, q.id);
    if (isActive(jobs.get(key))) return false;
    const job = {
      key, testId: test.id, qid: q.id, idx, test,
      status: "queued", message: "Waiting for its turn…", startedAt: 0,
      controller: new AbortController(), error: null
    };
    jobs.set(key, job);
    queue.push(job);
    setPending(test.id, q.id, true);
    const run = runs.get(test.id) || { total: 0, done: 0 };
    run.total++;
    runs.set(test.id, run);
    pump();
    return true;
  }

  function pump() {
    while (running < MAX_PARALLEL && queue.length) {
      const job = queue.shift();
      if (job.status !== "queued") continue;
      running++;
      runJob(job).finally(() => {
        running--;
        pump();
      });
    }
  }

  function finishRun(testId) {
    const run = runs.get(testId);
    if (!run) return;
    run.done++;
    if (!anyActive(testId)) {
      runs.delete(testId);
      const failed = Array.from(jobs.values()).filter(j => j.testId === testId && j.status === "error").length;
      emit("ai:run-done", { testId, total: run.total, failed });
    }
  }

  async function runJob(job) {
    job.status = "running";
    job.startedAt = Date.now();
    job.message = "Sending your answer…";
    changed(job);
    const ticker = setInterval(() => tick(job), 1000);
    try {
      const report = await gradeAnswer(job.test, job.idx, {
        signal: job.controller.signal,
        onStatus: (m) => { job.message = m; tick(job); }
      });
      jobs.delete(job.key);
      if (historyList().some(t => t && t.id === job.testId)) {
        saveReport(report);
        writeScore(job.testId, job.qid, report.score);
        emit("ai:graded", { testId: job.testId, qid: job.qid });
      }
    } catch (err) {
      const e = err instanceof AIError ? err : new AIError("internal", (err && err.message) || String(err));
      if (e.kind === "cancelled") {
        jobs.delete(job.key);
      } else {
        job.status = "error";
        job.error = e;
        job.provider = activeProvider("grading");
        console.warn("AI evaluation failed for Q" + (job.idx + 1) + ":", e.kind, e.message, e.detail || "");
      }
    } finally {
      clearInterval(ticker);
      setPending(job.testId, job.qid, false);
      finishRun(job.testId);
      changed(job);
    }
  }

  function cancelJob(job) {
    if (job.status === "queued") {
      job.status = "cancelled";
      jobs.delete(job.key);
      setPending(job.testId, job.qid, false);
      finishRun(job.testId);
    } else if (job.status === "running") {
      job.controller.abort();
    } else {
      jobs.delete(job.key);
    }
  }

  function stopTest(testId) {
    for (const job of Array.from(jobs.values())) if (job.testId === testId) cancelJob(job);
    runs.delete(testId);
    refreshPanel(testId);
    refreshAllSlots(testId);
  }

  function saveNotAttempted(test, q) {
    saveReport(notAttemptedReport(test, q));
    writeScore(test.id, q.id, 0);
    emit("ai:graded", { testId: test.id, qid: q.id });
  }

  function evaluateTest(test, options) {
    const onlyMissing = !options || options.onlyMissing !== false;
    if (!test || !Array.isArray(test.questions)) return 0;
    if (!activeProvider("grading").ready) {
      openSettings(test.id);
      if (draft) draft.wantsGrading = true;
      return 0;
    }
    let started = 0;
    test.questions.forEach((q, idx) => {
      if (onlyMissing && getReport(test.id, q.id)) return;
      const job = getJob(test.id, q.id);
      if (isActive(job)) return;
      if (job) jobs.delete(job.key);
      if (!answerOf(test, q).wordCount) {
        saveNotAttempted(test, q);
        return;
      }
      if (enqueue(test, idx)) started++;
    });
    refreshPanel(test.id);
    refreshAllSlots(test.id);
    return started;
  }

  function evaluateQuestion(test, qid) {
    const idx = test.questions.findIndex(q => q.id === qid);
    if (idx < 0) return;
    if (!activeProvider("grading").ready) {
      openSettings(test.id);
      return;
    }
    const q = test.questions[idx];
    const old = getJob(test.id, qid);
    if (isActive(old)) return;
    if (old) jobs.delete(old.key);
    if (!answerOf(test, q).wordCount) saveNotAttempted(test, q);
    else enqueue(test, idx);
    refreshQuestion(test.id, qid);
    refreshPanel(test.id);
  }

  function autoEvaluate(test) {
    void test;
    return;
  }

  function currentResultTest() {
    return (typeof state !== "undefined" && state.lastResultTest) || null;
  }

  function slotFor(qid) {
    return document.querySelector('#result-list .ai-slot[data-qid="' + cssEsc(qid) + '"]');
  }

  function refreshQuestion(testId, qid) {
    const t = currentResultTest();
    if (!t || t.id !== testId) return;
    const idx = t.questions.findIndex(q => q.id === qid);
    const slot = slotFor(qid);
    if (slot && idx >= 0) slot.innerHTML = slotHTML(t, t.questions[idx], idx);
  }

  function refreshAllSlots(testId) {
    const t = currentResultTest();
    if (!t || t.id !== testId) return;
    t.questions.forEach(q => refreshQuestion(testId, q.id));
  }

  function refreshPanel(testId) {
    const t = currentResultTest();
    const el = document.getElementById("ai-panel");
    if (t && el && t.id === testId) el.innerHTML = panelHTML(t);
  }

  function changed(job) {
    refreshQuestion(job.testId, job.qid);
    refreshPanel(job.testId);
    emit("ai:activity", { testId: job.testId });
  }

  function emit(name, detail) {
    try { document.dispatchEvent(new CustomEvent(name, { detail })); } catch (e) { console.warn(e); }
  }

  function activity() {
    const out = [];
    runs.forEach((run, testId) => {
      const active = Array.from(jobs.values()).filter(j => j.testId === testId && isActive(j)).length;
      if (active) out.push({ testId, total: run.total, done: run.done, active });
    });
    return out;
  }

  const PENDING_KEY = "rbi_ai_pending";
  function pendingAll() {
    try { const o = JSON.parse(localStorage.getItem(PENDING_KEY) || "{}"); return o && typeof o === "object" ? o : {}; } catch (_) { return {}; }
  }
  function setPending(testId, qid, on) {
    const all = pendingAll();
    const list = new Set(all[testId] || []);
    if (on) list.add(qid); else list.delete(qid);
    if (list.size) all[testId] = [...list]; else delete all[testId];
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(all)); } catch (_) {}
  }

  function resumePending() {
    const all = pendingAll();
    const ids = Object.keys(all);
    if (!ids.length || !activeProvider("grading").ready) return 0;
    let resumed = 0;
    ids.forEach(testId => {
      const test = findTest(testId);
      const qids = test ? (all[testId] || []).filter(qid => test.questions.some(q => q.id === qid)) : [];
      delete all[testId];
      try { localStorage.setItem(PENDING_KEY, JSON.stringify(all)); } catch (_) {}
      qids.forEach(qid => {
        const idx = test.questions.findIndex(q => q.id === qid);
        if (isActive(getJob(testId, qid))) return;
        if (!answerOf(test, test.questions[idx]).wordCount) { saveNotAttempted(test, test.questions[idx]); return; }
        if (enqueue(test, idx)) resumed++;
      });
      if (qids.length) { refreshPanel(testId); refreshAllSlots(testId); }
    });
    if (resumed) emit("ai:resumed", { count: resumed });
    return resumed;
  }

  function tick(job) {
    const secs = Math.max(0, Math.round((Date.now() - job.startedAt) / 1000));
    document.querySelectorAll('[data-ai-time="' + cssEsc(job.key) + '"]').forEach(el => { el.textContent = secs + " s"; });
    document.querySelectorAll('[data-ai-msg="' + cssEsc(job.key) + '"]').forEach(el => { el.textContent = job.message; });
  }

  function renderResultScreen(test) {
    if (!test) return;
    const panel = document.getElementById("ai-panel");
    if (panel) panel.innerHTML = panelHTML(test);
    test.questions.forEach((q, idx) => {
      const slot = slotFor(q.id);
      if (slot) slot.innerHTML = slotHTML(test, q, idx);
    });
    updateNavDot();
  }

  function testState(test) {
    const rows = (test.questions || []).map((q, idx) => ({
      q, idx, ans: answerOf(test, q), report: getReport(test.id, q.id), job: getJob(test.id, q.id)
    }));
    return {
      rows,
      graded: rows.filter(r => r.report),
      active: rows.filter(r => isActive(r.job)),
      runningRows: rows.filter(r => r.job && r.job.status === "running"),
      errors: rows.filter(r => r.job && r.job.status === "error"),
      missing: rows.filter(r => !r.report && !isActive(r.job)).length
    };
  }

  function btn(action, label, test, extra, cls) {
    return '<button type="button" class="' + (cls || "btn-soft") + '" data-ai-action="' + action + '" data-test-id="' + esc(test.id) + '"' + (extra || "") + ">" + label + "</button>";
  }

  function ringHTML(score, max, gradeCls, big) {
    const pct = max > 0 ? clamp(score / max * 100, 0, 100) : 0;
    return '<div class="ai-ring ai-g-' + gradeCls + (big ? " ai-ring-big" : "") + '" style="--pct:' + pct.toFixed(1) + '">' +
      '<div class="ai-ring-inner"><strong>' + fmt(score) + "</strong><span>/ " + fmt(max) + "</span></div></div>";
  }

  function setupCardHTML(test) {
    const def = activeProvider("grading").def;
    const host = def.keyUrl ? def.keyUrl.replace(/^https?:\/\//, "").split("/")[0] : "";
    return '<div class="ai-setup">' +
      '<div class="ai-setup-text">' +
        "<h3>AI Analysis of your answers</h3>" +
        "<p>Add your API key, then press AI Analysis: marks for each answer, exactly where you lost them, your own sentences rewritten, and an exam-ready model answer. Questions you did not answer are left out of the analysis.</p>" +
        '<p class="ai-muted">' + esc(def.label) + (host ? ' key: <a href="' + esc(def.keyUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(host) + "</a>" : "") +
        ". Your key stays in this browser. You can still copy the prompts below into any chatbot.</p>" +
      "</div>" +
      btn("evaluate-all", "AI Analysis", test, "", "ai-btn-primary") +
      "</div>";
  }

  function leaksAcross(reports) {
    const by = {};
    reports.forEach(r => (r.penalties || []).forEach(p => {
      const k = p.code || "Other";
      by[k] = by[k] || { code: k, total: 0, count: 0 };
      by[k].total += p.deduction;
      by[k].count++;
    }));
    return Object.values(by).sort((a, b) => b.total - a.total).slice(0, 3);
  }

  function fatigueNote(rows) {
    const done = rows.filter(r => r.report && !r.report.notAttempted).sort((a, b) => a.idx - b.idx);
    const blanks = rows.filter(r => r.report && r.report.notAttempted).length;
    if (done.length < 2) {
      return blanks ? blanks + " question" + (blanks > 1 ? "s were" : " was") + " left blank - in the exam a short structured attempt always beats a blank." : "";
    }
    const first = done[0];
    const last = done[done.length - 1];
    const wp = r => (r.report.wordLimit ? Math.round(r.ans.wordCount / r.report.wordLimit * 100) : 0);
    const dropScore = first.report.percent - last.report.percent;
    const dropWords = wp(first) - wp(last);
    let note;
    if (dropScore >= 10 || dropWords >= 20) {
      note = "Quality fell towards the end: Q" + (first.idx + 1) + " scored " + fmt(first.report.percent) + "% using " + wp(first) + "% of the word limit, Q" + (last.idx + 1) + " scored " + fmt(last.report.percent) + "% using " + wp(last) + "%. Practise a fixed time budget per question.";
    } else {
      note = "No fatigue drop: your last answer held up as well as your first. Keep the same pacing.";
    }
    if (blanks) note += " " + blanks + " question" + (blanks > 1 ? "s were" : " was") + " left blank.";
    return note;
  }

  function topicStats(rows) {
    const by = new Map();
    rows.forEach(r => {
      const key = String(r.topic || "Other").trim();
      const k = key.toLowerCase();
      const t = by.get(k) || { topic: key, count: 0, score: 0, max: 0, gaps: [] };
      t.count++;
      t.score += Number(r.score) || 0;
      t.max += Number(r.max) || 0;
      (r.gaps || []).forEach(g => { if (t.gaps.length < 6 && !t.gaps.includes(g)) t.gaps.push(g); });
      by.set(k, t);
    });
    return Array.from(by.values()).map(t => {
      const pct = t.max ? round1(t.score / t.max * 100) : 0;
      return Object.assign(t, { score: round2(t.score), pct, verdict: pct >= 42 ? "Strong" : pct >= 32 ? "Fair" : "Weak" });
    }).sort((a, b) => a.pct - b.pct);
  }

  function allGradedRows() {
    const out = [];
    const all = loadReports();
    const history = historyList();
    (Array.isArray(history) ? history : []).forEach(t => {
      const byQ = all[t && t.id];
      if (!byQ) return;
      (t.questions || []).forEach(q => {
        const r = byQ[q.id];
        if (r && !r.notAttempted) out.push({ topic: r.topic || q.topic || q.paper || "Other", score: r.score, max: r.max, gaps: r.conceptGaps || [] });
      });
    });
    return out;
  }

  function topicTableHTML(rows) {
    const cls = { Strong: "good", Fair: "ok", Weak: "weak" };
    return '<div class="table-scroll"><table class="ai-table ai-topic-table"><thead><tr><th>Topic</th><th>Answers</th><th>Marks</th><th>Score</th><th>Concepts to revise</th></tr></thead><tbody>' +
      rows.map(t => "<tr><td><strong>" + esc(t.topic) + '</strong> <span class="ai-cov ai-cov-' + cls[t.verdict] + '">' + t.verdict + "</span></td>" +
        '<td class="ai-num">' + t.count + '</td><td class="ai-num">' + fmt(t.score) + " / " + fmt(t.max) + '</td><td class="ai-num">' + fmt(t.pct) + "%</td>" +
        "<td>" + (t.gaps.length ? t.gaps.map(g => esc(g)).join("; ") : '<span class="ai-muted">-</span>') + "</td></tr>").join("") +
      "</tbody></table></div>";
  }

  function panelHTML(test) {
    const pc = activeProvider("grading");
    const st = testState(test);
    if (!pc.ready && !st.graded.length) return setupCardHTML(test);

    const busy = st.active.length > 0;
    let actions = "";
    if (!pc.ready) actions += btn("open-settings", "Add API key", test, "", "ai-btn-primary");
    else if (busy) actions += btn("stop", "Stop grading", test);
    else if (st.missing > 0) actions += btn("evaluate-all", st.graded.length ? "AI Analysis (" + st.missing + " left)" : "AI Analysis", test, "", "ai-btn-primary");
    else actions += btn("reevaluate-all", "Re-grade all", test);
    if (st.graded.length) {
      actions += btn("download-test-report", "Download report", test);
      actions += btn("copy-test-report", "Copy report", test);
    }
    actions += btn("open-settings", "API keys", test);

    let html = '<div class="ai-panel-head">' +
      '<div class="ai-panel-title"><h3>AI assessment</h3>' +
      '<span class="ai-chip' + (pc.ready ? "" : " ai-chip-off") + '">' + (pc.ready ? esc(pc.def.label) + " · " + esc(pc.model) : "AI grading off") + "</span></div>" +
      '<div class="ai-panel-actions">' + actions + "</div></div>";

    if (busy) {
      const run = runs.get(test.id) || { total: st.active.length, done: 0 };
      const total = Math.max(run.total, run.done + st.active.length);
      const pct = total ? Math.round(run.done / total * 100) : 0;
      const live = st.runningRows.map(r =>
        '<li><span class="ai-spinner"></span><strong>Q' + (r.idx + 1) + "</strong> " +
        '<span class="ai-live-msg" data-ai-msg="' + esc(r.job.key) + '">' + esc(r.job.message) + "</span> " +
        '<span class="ai-live-time" data-ai-time="' + esc(r.job.key) + '">' + Math.round((Date.now() - r.job.startedAt) / 1000) + " s</span></li>").join("");
      html += '<div class="ai-progress"><div class="ai-progress-top"><span>Grading your answers… ' + run.done + " of " + total + " done</span><span>" + pct + "%</span></div>" +
        '<div class="ai-progress-track"><div class="ai-progress-fill" style="width:' + Math.max(pct, 4) + '%"></div></div>' +
        (live ? '<ul class="ai-live-list">' + live + "</ul>" : "") +
        '<p class="ai-muted">Grading usually takes 1-3 minutes per answer (answers are graded in parallel). You can keep using the app - results appear here and in History.</p></div>';
    }

    if (st.errors.length) {
      html += '<div class="ai-panel-errors">' + st.errors.map(r => {
        const ex = explainError(r.job.error, r.job.provider || pc);
        return "<div><strong>Q" + (r.idx + 1) + " · " + esc(ex.title) + ":</strong> " + esc(ex.body) + " " +
          btn("evaluate-q", "Retry", test, ' data-qid="' + esc(r.q.id) + '"') + "</div>";
      }).join("") + "</div>";
    }

    if (st.graded.length) {
      const reports = st.graded.map(r => r.report);
      const total = round2(sum(reports.map(r => r.score)));
      const max = sum(reports.map(r => r.max));
      const pct = max ? round1(total / max * 100) : 0;
      const g = gradeFor(pct);
      const projLo = round2(sum(reports.map(r => (r.projection ? r.projection[0] : r.score))));
      const projHi = round2(sum(reports.map(r => (r.projection ? r.projection[1] : r.score))));
      const allDone = st.graded.length === st.rows.length;

      const rowsHTML = st.rows.map(r => {
        const limit = wordLimitOf(r.q);
        let status;
        if (r.report && !isActive(r.job)) {
          const gi = gradeInfo(r.report.grade);
          status = r.report.notAttempted ? '<span class="ai-tag">Not attempted</span>' : '<span class="ai-grade-badge ai-g-' + gi.cls + '">' + gi.grade + "</span>";
        } else if (r.job && r.job.status === "running") status = '<span class="ai-tag ai-tag-live">Grading…</span>';
        else if (r.job && r.job.status === "queued") status = '<span class="ai-tag">Waiting</span>';
        else if (r.job && r.job.status === "error") status = '<span class="ai-tag ai-tag-err">Failed</span>';
        else status = '<span class="ai-tag">Not graded</span>';
        return '<tr><td><button type="button" class="ai-link" data-ai-action="goto-q" data-qid="' + esc(r.q.id) + '">Q' + (r.idx + 1) + "</button></td>" +
          "<td>" + esc(r.q.paper || "") + "</td>" +
          '<td class="ai-num">' + r.ans.wordCount + " / " + limit + "</td>" +
          '<td class="ai-num">' + (r.report ? "<strong>" + fmt(r.report.score) + "</strong> / " + fmt(r.report.max) : "– / " + fmt(maxMarksOf(r.q))) + "</td>" +
          "<td>" + status + "</td></tr>";
      }).join("");

      const analysed = reports.filter(r => !r.notAttempted);
      const leaks = leaksAcross(analysed);
      const leaksHTML = leaks.length
        ? "<ul>" + leaks.map(l => "<li><strong>" + esc(l.code) + " " + esc(PENALTY_LABELS[l.code] || "") + "</strong> · −" + fmt(l.total) + " marks (" + l.count + "×)</li>").join("") + "</ul>"
        : '<p class="ai-muted">No red-pen penalties.</p>';
      const drills = [];
      analysed.forEach(r => { if (r.actions && r.actions[0] && !drills.includes(r.actions[0])) drills.push(r.actions[0]); });
      const fatigue = fatigueNote(st.rows.filter(r => r.ans.wordCount > 0));

      const topicRows = topicStats(st.rows.filter(r => r.report && !r.report.notAttempted).map(r => ({ topic: r.report.topic || r.q.topic || r.q.paper || "Other", score: r.report.score, max: r.report.max, gaps: r.report.conceptGaps || [] })));
      const wTotals = analysed.reduce((a, r) => { const c = writingCounts(r.writing); a.grammar += c.grammar; a.spelling += c.spelling; a.facts += c.facts; if (r.writing && r.writing.style.verdict) a.verdicts.push(r.writing.style.verdict); return a; }, { grammar: 0, spelling: 0, facts: 0, verdicts: [] });
      const plans = [];
      analysed.forEach(r => { (r.writing ? r.writing.plan : []).slice(0, 2).forEach(x => { if (plans.length < 5 && !plans.includes(x)) plans.push(x); }); });
      const allTopics = topicStats(allGradedRows());
      html += '<div class="ai-overall">' +
        '<div class="ai-overall-score">' + ringHTML(total, max, g.cls, true) +
          '<div class="ai-overall-text">' +
            '<div class="ai-overall-label">' + (allDone ? "Total score" : "Score so far · " + st.graded.length + " of " + st.rows.length + " graded") + "</div>" +
            '<span class="ai-grade-badge ai-g-' + g.cls + '">Grade ' + g.grade + " · " + esc(g.label) + "</span> <span class=\"ai-pct\">" + fmt(pct) + "%</span>" +
            '<div class="ai-projection">Likely in the real RBI exam: <strong>' + fmt(projLo) + "–" + fmt(projHi) + " / " + fmt(max) + "</strong></div>" +
            '<p class="ai-muted">This grader is deliberately about 2–3 marks stricter per answer than the real RBI panel.</p>' +
            (function () { const u = reports.reduce((a, r) => addUsage(a, r.usage), null); return u ? '<p class="ai-muted">AI tokens for this test: ' + esc(tokensText(u)) + "</p>" : ""; })() +
          "</div></div>" +
        '<div class="table-scroll"><table class="ai-table ai-q-table"><thead><tr><th>Q</th><th>Paper</th><th>Words</th><th>Score</th><th>Grade</th></tr></thead><tbody>' + rowsHTML + "</tbody></table></div>" +
        "</div>" +
        '<div class="ai-insights">' +
          '<div class="ai-insight"><h5>Biggest mark leaks</h5>' + leaksHTML + "</div>" +
          (fatigue ? '<div class="ai-insight"><h5>Pacing &amp; fatigue</h5><p>' + esc(fatigue) + "</p></div>" : "") +
          (drills.length ? '<div class="ai-insight"><h5>Next drills</h5><ol>' + drills.slice(0, 4).map(d => "<li>" + inline(d) + "</li>").join("") + "</ol></div>" : "") +
        "</div>" +
        (topicRows.length ? '<div class="ai-topic-block"><h4>Topic-wise performance in this test</h4>' + topicTableHTML(topicRows) + "</div>" : "") +
        (analysed.some(r => r.writing) ? '<div class="ai-topic-block"><h4>Your writing across this test</h4>' +
          '<div class="ai-wchips"><span class="ai-wchip' + (wTotals.grammar ? " has" : "") + '"><strong>' + wTotals.grammar + "</strong> grammar / punctuation</span>" +
          '<span class="ai-wchip' + (wTotals.spelling ? " has" : "") + '"><strong>' + wTotals.spelling + "</strong> spelling</span>" +
          '<span class="ai-wchip' + (wTotals.facts ? " has" : "") + '"><strong>' + wTotals.facts + "</strong> factual</span>" +
          (wTotals.verdicts.length ? '<span class="ai-muted">Style: ' + esc(wTotals.verdicts.join(", ")) + "</span>" : "") + "</div>" +
          (plans.length ? "<h6>Most important fixes for your next exam</h6><ol>" + plans.map(x => "<li>" + inline(x) + "</li>").join("") + "</ol>" : "") +
          '<p class="ai-muted">Open each answer below for the full line-by-line list.</p></div>' : "") +
        (allTopics.length > 1 && allTopics.some(t => t.count > 1) ? '<details class="ai-sec"><summary><span>Topic-wise performance across all your subjective tests</span><span class="ai-sec-meta">' + allTopics.length + " topics</span></summary><div class=\"ai-sec-body\">" + topicTableHTML(allTopics) + "</div></details>" : "");
    }

    if (storageProblem) html += '<p class="ai-warning">' + esc(storageProblem) + "</p>";
    return html;
  }

  function slotHTML(test, q, idx) {
    const pc = activeProvider("grading");
    const report = getReport(test.id, q.id);
    const job = getJob(test.id, q.id);
    const qAttr = ' data-qid="' + esc(q.id) + '"';
    if (isActive(job)) {
      const live = job.status === "running";
      return '<div class="ai-slot-status' + (report ? " ai-slot-regrade" : "") + '">' +
        (live ? '<span class="ai-spinner"></span>' : '<span class="ai-wait-dot"></span>') +
        '<div class="ai-slot-status-text"><strong>' + (live ? (report ? "Re-grading" : "Grading") + " this answer…" : "Waiting for its turn…") + "</strong>" +
        (live ? '<span class="ai-live-msg" data-ai-msg="' + esc(job.key) + '">' + esc(job.message) + "</span>" : "") + "</div>" +
        (live ? '<span class="ai-live-time" data-ai-time="' + esc(job.key) + '">' + Math.round((Date.now() - job.startedAt) / 1000) + " s</span>" : "") +
        btn("stop-q", "Cancel", test, qAttr) +
        "</div>";
    }
    let html = "";
    if (job && job.status === "error") {
      const ex = explainError(job.error, job.provider || pc);
      html += '<div class="ai-error-box"><div class="ai-error-text"><strong>' + esc(ex.title) + "</strong><p>" + esc(ex.body) + "</p></div>" +
        '<div class="ai-error-actions">' + btn("evaluate-q", "Retry", test, qAttr, "ai-btn-primary") +
        (ex.settings ? btn("open-settings", "API keys", test) : "") +
        (job.error.raw ? btn("show-raw", "Show raw reply", test, qAttr) : "") + "</div>" +
        (job.error.raw ? '<pre class="ai-raw" hidden>' + esc(String(job.error.raw).slice(0, 20000)) + "</pre>" : "") +
        "</div>";
      if (report) html += '<p class="ai-muted ai-prev-note">Previous assessment:</p>';
    }
    if (report) return html + reportHTML(report, q, { test, idx });
    if (html) return html;
    if (!pc.ready) {
      return '<div class="ai-slot-idle"><span>AI grading is off.</span>' + btn("open-settings", "Add API key", test) + "</div>";
    }
    return '<div class="ai-slot-idle"><span>Not graded yet.</span>' + btn("evaluate-q", "Grade this answer", test, qAttr, "ai-btn-primary") + "</div>";
  }

  function listHTML(items, empty) {
    if (!items || !items.length) return '<p class="ai-muted">' + esc(empty) + "</p>";
    return "<ul>" + items.map(x => "<li>" + inline(x) + "</li>").join("") + "</ul>";
  }

  function section(title, meta, body, open) {
    return '<details class="ai-sec"' + (open ? " open" : "") + "><summary><span>" + title + "</span>" +
      (meta ? '<span class="ai-sec-meta">' + esc(meta) + "</span>" : "") + "</summary>" +
      '<div class="ai-sec-body">' + body + "</div></details>";
  }

  function markPrefix(q) {
    return "ai-" + String((q && q.id) || "q").replace(/[^A-Za-z0-9_-]/g, "") + "-";
  }

  function siteLedger(r, q) {
    const params = r.parameters || [];
    const named = params.length === TRACK_PARAMS[r.track];
    const missed = (r.checklist || []).map((k, i) => Object.assign({ order: i }, k)).filter(k => k.coverage !== "full")
      .sort((a, b) => (b.weight || 1) - (a.weight || 1) || (a.coverage === "missing" ? 0 : 1) - (b.coverage === "missing" ? 0 : 1) || a.order - b.order);
    const c = r.consistency;
    const why = [];
    if (c && c.runs && c.runs.length > 1) why.push("Your final mark is the " + c.method + " (" + c.runs.map(fmt).join(", ") + "), not this breakdown's own total.");
    if (c && c.anchored) why.push("It was " + c.anchored + " to stay in line with how much of your reference answer the script covers.");
    return AM.lossLedger({
      max: r.max || maxMarksOf(q), score: r.score, rawSum: r.rawSum, penaltySum: r.penaltySum, ceiling: r.ceiling,
      autoFail: !!r.autoFail, offTopic: !!r.offTopic, notAttempted: !!r.notAttempted, track: r.track,
      params: params.map((p, i) => ({ id: named && !/^P\d\b/.test(p.name) ? "P" + (i + 1) : "", name: p.name, max: p.max, awarded: p.awarded, cap: p.cap, reasons: p.lost && p.lost.length ? p.lost : (p.why ? [p.why] : []) })),
      penalties: (r.penalties || []).map(p => ({ code: p.code, label: PENALTY_LABELS[p.code] || p.code, trigger: p.trigger, quote: p.quote || "", deduction: p.deduction })),
      missed: missed.map(k => ({ id: k.id, point: k.point, weight: k.weight, coverage: k.coverage })),
      adjustment: why.length ? { title: "Consistency check", why: why.join(" ") } : null
    });
  }

  function siteMarks(r, answerText, prefix, ledger) {
    const w = r.writing || {};
    const refs = (ledger && ledger.penaltyRefs) || [];
    return AM.buildMarks(answerText, {
      lang: (w.grammar || []).map(g => ({ wrong: g.quote, fix: g.correction, why: g.explanation, type: g.type }))
        .concat((w.spelling || []).map(x => ({ wrong: x.wrong, fix: x.correct, context: x.context, why: "Spelling mistake.", type: "spelling" }))),
      facts: (w.facts || []).filter(x => !x.verify && x.quote).map(x => ({ quote: x.quote, fix: x.fact, why: x.problem })),
      frames: (r.rewrites || []).map(x => ({ quote: x.before, fix: x.after, why: x.why })),
      adds: (r.additions || []).map(x => ({ after: x.after, fix: x.add, why: x.why })),
      cuts: (r.penalties || []).map((p, i) => ({ quote: p.quote, deduction: p.deduction, label: (PENALTY_LABELS[p.code] || p.code) + " (" + p.code + ")", ref: refs[i] ? prefix + refs[i] : "" }))
    });
  }

  const MARK_WORDS = [["lang", "language mistake", "language mistakes"], ["frame", "sentence to frame better", "sentences to frame better"], ["fact", "wrong fact", "wrong facts"], ["add", "addition", "additions"], ["cut", "deduction", "deductions"]];
  const MARK_GROUPS = [["lang", "Language mistakes"], ["frame", "Sentences to frame better"], ["fact", "Wrong facts"], ["add", "Add these to lift the answer"]];

  function markCountsText(built) {
    const c = built.counts;
    return MARK_WORDS.filter(([k]) => c[k]).map(([k, one, many]) => c[k] + " " + (c[k] === 1 ? one : many)).join(" · ");
  }

  function lossTitleText(ledger) {
    return ledger.total > 0 ? "Why you lost " + fmt(ledger.total) + " mark" + (ledger.total === 1 ? "" : "s") : "Marks lost";
  }

  function markedSectionHTML(built, prefix) {
    if (!built.marks.length) return '<p class="ai-muted">Nothing to mark: no language, framing or fact changes were found.</p><div class="mk-answer">' + esc(built.text) + "</div>";
    const opts = { idPrefix: prefix, heading: "h6" };
    return AM.legendHTML(built) + AM.markedHTML(built, opts) + AM.marksListHTML(built, opts);
  }

  function markLine(m) {
    const where = m.kind === "add" ? " (" + (m.atEnd ? "at the end" : m.where ? "after \u201c" + m.where + "\u201d" : "wherever it fits best") + ")" : "";
    const pair = m.kind === "add" ? "add \u201c" + m.fix + "\u201d" : "\u201c" + m.wrong + "\u201d -> " + (m.fix ? "\u201c" + m.fix + "\u201d" : "(delete)");
    return "- " + m.id + where + ": " + pair + (m.kind === "lang" && m.type ? " [" + m.type + "]" : "") + (m.why ? ". " + m.why : "") + (m.inline ? "" : " (not shown in your answer)");
  }

  function lossesHTML(ledger) {
    const rows = ledger.rows.map((x, i) => Object.assign({ order: i }, x)).filter(x => x.lost > 0).sort((a, b) => b.lost - a.lost || a.order - b.order).slice(0, 4);
    if (!rows.length) return '<p class="ai-muted">No marks lost.</p>';
    return "<ul>" + rows.map(x => "<li><strong>−" + fmt(x.lost) + " · " + esc(x.title) + "</strong>" + (x.reasons[0] ? ': <span class="ai-muted">' + inline(x.reasons[0]) + "</span>" : "") + "</li>").join("") + "</ul>";
  }

  function breakdownHTML(r) {
    let h = "";
    if (r.checks && r.checks.length) {
      h += '<h6>Examiner checks</h6><div class="table-scroll"><table class="ai-table ai-checks"><thead><tr><th>Check</th><th>Result</th><th>Evidence</th></tr></thead><tbody>' +
        r.checks.map(c => "<tr><td>" + esc(c.label || "Check " + c.id) + "</td>" +
          '<td><span class="ai-check-res ' + (c.pass === true ? "is-yes" : c.pass === false ? "is-no" : "is-na") + '">' + (c.pass === true ? "Yes" : c.pass === false ? "No" : "N/A") + "</span></td>" +
          "<td>" + inline(c.evidence) + "</td></tr>").join("") +
        "</tbody></table></div>" +
        (r.anchorCount !== null && r.anchorCount !== undefined && r.track === "A" ? '<p class="ai-muted">Specific sources stated with their function: ' + fmt(r.anchorCount) + ".</p>" : "");
    }
    if (r.parameters.length) {
      h += '<div class="table-scroll"><table class="ai-table"><thead><tr><th>Criterion</th><th>Marks</th><th>Why</th></tr></thead><tbody>' +
        r.parameters.map(p => {
          const ratio = p.max > 0 && p.awarded !== null ? clamp(p.awarded / p.max, 0, 1) : 0;
          return "<tr><td><strong>" + esc(p.name) + "</strong>" + (p.cap ? '<span class="ai-cap">Capped: ' + esc(p.cap) + "</span>" : "") + "</td>" +
            '<td class="ai-num"><span class="ai-bar"><i style="width:' + Math.round(ratio * 100) + '%"></i></span>' +
            (p.awarded !== null ? fmt(p.awarded) : "–") + (p.max !== null ? " / " + fmt(p.max) : "") + "</td>" +
            "<td>" + inline(p.why) + "</td></tr>";
        }).join("") +
        '<tr class="ai-total-row"><td>Marks earned (before penalties)</td><td class="ai-num">' + fmt(r.rawSum) + " / " + fmt(r.max) + "</td><td></td></tr>" +
        "</tbody></table></div>";
    }
    h += "<h6>Red-pen penalties</h6>";
    if (r.penalties.length) {
      h += '<div class="table-scroll"><table class="ai-table"><thead><tr><th>Penalty</th><th>What triggered it</th><th>Marks</th></tr></thead><tbody>' +
        r.penalties.map(p => '<tr><td><span class="ai-code">' + esc(p.code) + "</span> " + esc(PENALTY_LABELS[p.code] || "") + "</td><td>" + inline(p.trigger) + '</td><td class="ai-num ai-neg">−' + fmt(p.deduction) + "</td></tr>").join("") +
        "</tbody></table></div>";
    } else {
      h += '<p class="ai-muted">No penalties.</p>';
    }
    const net = r.rawSum !== null ? round2(r.rawSum - r.penaltySum) : null;
    const note = r.offTopic ? "but the answer is off-topic, so the rubric gives 0"
      : r.autoFail ? "but the rubric gives 0 under 60 words"
      : r.ceilingApplied ? "capped at the rubric's hard ceiling"
      : r.capped ? "limited to the 0–" + fmt(r.max) + " range"
      : net !== null && Math.abs(net - r.score) >= 0.005 ? "and the consistency check set the final mark" : "";
    h += '<p class="ai-math">' + (net !== null ? fmt(r.rawSum) + " − " + fmt(r.penaltySum) + " penalties = " + (note ? fmt(net) + ", " + note + ": " : "") : "Final score: ") +
      "<strong>" + fmt(r.score) + " / " + fmt(r.max) + "</strong></p>";
    if (r.rules && r.rules.length) {
      h += '<h6>Rubric rules applied by the app</h6><ul class="ai-rules">' + r.rules.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>";
    }
    if (r.adjusted) h += '<p class="ai-muted">The model\'s own total was ' + fmt(r.modelFinal) + "; the score above is re-added from this breakdown" + (r.rules && r.rules.length ? " after the rules above" : "") + " so the numbers match.</p>";
    return h;
  }

  function subpartsHTML(r) {
    return '<ul class="ai-subparts">' + r.subparts.map(s => {
      const c = COVERAGE[s.coverage] || { label: s.coverage || "–", cls: "ok" };
      return '<li><span class="ai-cov ai-cov-' + c.cls + '">' + esc(c.label) + "</span><div><strong>" + esc(s.part) + "</strong>" + (s.comment ? "<p>" + inline(s.comment) + "</p>" : "") + "</div></li>";
    }).join("") + "</ul>";
  }

  function errorsHTML(r) {
    return r.errors.map(e =>
      '<div class="ai-err">' +
        (e.quote ? "<blockquote>\u201c" + esc(e.quote) + "\u201d</blockquote>" : "") +
        "<p>" + (e.code ? '<span class="ai-code">' + esc(e.code) + "</span> " : "") + inline(e.problem) + "</p>" +
        (e.correction ? '<p class="ai-fix"><strong>Better:</strong> ' + inline(e.correction) + "</p>" : "") +
      "</div>").join("");
  }

  function anchorsHTML(r) {
    let h = "";
    if (r.anchorsUsed.length) h += "<h6>Used well</h6>" + listHTML(r.anchorsUsed, "");
    if (r.nameDrops.length) h += "<h6>Mentioned without explaining what it does</h6>" + listHTML(r.nameDrops, "");
    if (r.missingAnchors.length) h += "<h6>Add these to reach Grade A</h6>" + listHTML(r.missingAnchors, "");
    if (r.verifyFlags.length) h += "<h6>Double-check these figures</h6>" + listHTML(r.verifyFlags, "");
    return h;
  }

  const VERDICT_CLS = { "RBI-ready": "good", "Nearly there": "ok", "Not yet": "weak" };

  function writingCounts(w) {
    return w ? { grammar: w.grammar.length, spelling: w.spelling.length, facts: w.facts.filter(f => !f.verify).length } : { grammar: 0, spelling: 0, facts: 0 };
  }

  function writingHTML(w) {
    const c = writingCounts(w);
    const chip = (n, label) => '<span class="ai-wchip' + (n ? " has" : "") + '"><strong>' + n + "</strong> " + label + "</span>";
    let h = '<div class="ai-wchips">' + chip(c.grammar, "grammar / punctuation") + chip(c.spelling, "spelling") + chip(c.facts, "factual") +
      (w.style.verdict ? '<span class="ai-cov ai-cov-' + (VERDICT_CLS[w.style.verdict] || "ok") + '">Style: ' + esc(w.style.verdict) + (w.style.score !== null ? " · " + fmt(w.style.score) + "/10" : "") + "</span>" : "") +
      "</div>" +
      '<p class="ai-muted">' + (c.grammar + c.spelling + c.facts
        ? "Every grammar, spelling and fact correction is marked in Your answer, marked above, with its reason."
        : "No grammar, spelling or factual errors were found.") + "</p>";
    if (w.style.assessment || w.style.issues.length) {
      h += "<h6>Is the writing style up to RBI standard?</h6>" + (w.style.assessment ? "<p>" + inline(w.style.assessment) + "</p>" : "") + (w.style.issues.length ? listHTML(w.style.issues, "") : "");
    }
    const checkFacts = w.facts.filter(f => f.verify);
    if (checkFacts.length) {
      h += "<h6>Check these figures (could not be verified, not counted as errors)</h6>" +
        checkFacts.map(f => '<div class="ai-err">' + (f.quote ? "<blockquote>\u201c" + esc(f.quote) + "\u201d</blockquote>" : "") + "<p>" + inline(f.problem) + "</p>" + (f.fact ? '<p class="ai-fix"><strong>Latest known:</strong> ' + inline(f.fact) + "</p>" : "") + "</div>").join("");
    }
    if (w.structure.assessment || w.structure.issues.length) h += "<h6>Structure and flow</h6>" + (w.structure.assessment ? "<p>" + inline(w.structure.assessment) + "</p>" : "") + (w.structure.issues.length ? listHTML(w.structure.issues, "") : "");
    if (w.vocabulary.assessment || w.vocabulary.weak.length) {
      h += "<h6>Vocabulary and register</h6>" + (w.vocabulary.assessment ? "<p>" + inline(w.vocabulary.assessment) + "</p>" : "") +
        (w.vocabulary.weak.length ? '<ul class="ai-spell">' + w.vocabulary.weak.map(x => '<li><span class="ai-wrong">' + esc(x.used) + '</span> <span aria-hidden="true">&rarr;</span> <span class="ai-right">' + esc(x.better) + "</span></li>").join("") + "</ul>" : "");
    }
    if (w.craft.assessment || w.craft.examples.length) h += "<h6>Sentence construction</h6>" + (w.craft.assessment ? "<p>" + inline(w.craft.assessment) + "</p>" : "") + (w.craft.examples.length ? listHTML(w.craft.examples.map(x => "\u201c" + x + "\u201d"), "") : "");
    if (w.presentation) h += "<h6>Presentation</h6><p>" + inline(w.presentation) + "</p>";
    if (w.plan.length) h += "<h6>How to improve in your next exam</h6><ol>" + w.plan.map(x => "<li>" + inline(x) + "</li>").join("") + "</ol>";
    return h;
  }

  function reportHTML(r, q, opts) {
    const test = opts && opts.test;
    const readonly = !!(opts && opts.readonly);
    const tid = test ? test.id : r.testId;
    const ids = ' data-test-id="' + esc(tid) + '" data-qid="' + esc(q.id) + '"';
    const footBtns =
      (readonly ? "" : '<button type="button" class="btn-soft" data-ai-action="evaluate-q"' + ids + ">Re-grade</button>") +
      '<button type="button" class="btn-soft" data-ai-action="copy-report"' + ids + ">Copy report</button>" +
      '<button type="button" class="btn-soft" data-ai-action="download-report"' + ids + ">Download .md</button>";

    if (r.notAttempted) {
      return '<div class="ai-report ai-report-blank"><div class="ai-report-head">' + ringHTML(0, r.max, "f") +
        '<div class="ai-report-head-text"><span class="ai-tag">Not attempted</span><p class="ai-summary">' + inline(r.summary) + "</p></div></div>" +
        (r.modelAnswer ? section("Reference answer (from your question set)", wordsIn(r.modelAnswer) + " words", '<div class="ai-model-answer">' + esc(r.modelAnswer) + "</div>") : "") +
        '<div class="ai-report-foot"><span class="ai-meta">Recorded as 0 / ' + fmt(r.max) + " in History</span>" +
        '<div class="ai-foot-actions">' + (readonly ? "" : '<button type="button" class="btn-soft" data-ai-action="copy-report"' + ids + ">Copy</button>") + "</div></div></div>";
    }

    const g = gradeInfo(r.grade);
    const proj = r.projection ? fmt(r.projection[0]) + "–" + fmt(r.projection[1]) + " / " + fmt(r.max) : "–";
    const when = new Date(r.createdAt || Date.now()).toLocaleString();
    const mwords = r.modelAnswer ? wordsIn(r.modelAnswer.replace(/\[EXACT WORD COUNT[^\]]*\]/i, "")) : 0;
    const refCount = r.anchorsUsed.length + r.nameDrops.length + r.missingAnchors.length + r.verifyFlags.length;
    const missed = r.subparts.filter(s => s.coverage === "MISSED").length;
    const prefix = markPrefix(q);
    const ledger = siteLedger(r, q);
    const answer = test ? answerOf(test, q).text : "";
    const built = answer ? siteMarks(r, answer, prefix, ledger) : null;

    return '<div class="ai-report">' +
      '<div class="ai-report-head">' + ringHTML(r.score, r.max, g.cls) +
        '<div class="ai-report-head-text">' +
          '<div class="ai-report-title-row"><span class="ai-grade-badge ai-g-' + g.cls + '">Grade ' + g.grade + " · " + esc(g.label) + '</span><span class="ai-pct">' + fmt(r.percent) + "%</span>" +
          (r.track && TRACKS[r.track] ? '<span class="ai-tag">' + esc(TRACKS[r.track]) + "</span>" : "") + "</div>" +
          '<div class="ai-projection">Likely in the real RBI exam: <strong>' + proj + "</strong></div>" +
          '<div class="ai-muted">Strict grader: about 2–3 marks tougher than the real panel, so clearing it here means you are safe there.</div>' +
        "</div></div>" +
      (r.summary ? '<p class="ai-summary">' + inline(r.summary) + "</p>" : "") +
      consistencyHTML(r) +
      '<div class="ai-quick-grid">' +
        '<div class="ai-quick ai-quick-good"><h5>What worked</h5>' + listHTML(r.strengths, "Nothing stood out yet - focus on the fixes.") + "</div>" +
        '<div class="ai-quick ai-quick-bad"><h5>Where you lost marks</h5>' + lossesHTML(ledger) + "</div>" +
        '<div class="ai-quick ai-quick-next"><h5>Fix these next</h5>' + (r.actions.length ? "<ol>" + r.actions.map(a => "<li>" + inline(a) + "</li>").join("") + "</ol>" : '<p class="ai-muted">–</p>') + "</div>" +
      "</div>" +
      (built ? section("Your answer, marked", markCountsText(built), markedSectionHTML(built, prefix), true) : "") +
      section(lossTitleText(ledger), "", AM.ledgerHTML(ledger, { idPrefix: prefix, tableClass: "ai-table", heading: "h6" }), true) +
      (r.writing ? section("Writing analysis: grammar, spelling, facts and style", (function () { const c = writingCounts(r.writing); return c.grammar + " grammar · " + c.spelling + " spelling · " + c.facts + " factual"; })(), writingHTML(r.writing), true) : "") +
      ((r.topic || (r.conceptGaps && r.conceptGaps.length)) ? section("Topic and concept gaps", r.topic || "", (r.topic ? "<p><strong>Topic:</strong> " + esc(r.topic) + "</p>" : "") + (r.conceptGaps && r.conceptGaps.length ? "<h6>Concepts to revise</h6>" + listHTML(r.conceptGaps, "") : '<p class="ai-muted">No concept gaps flagged.</p>')) : "") +
      section("Marks breakdown", r.parameters.length + " criteria · " + r.penalties.length + " penalties", breakdownHTML(r)) +
      (r.subparts.length ? section("Did you answer every part?", r.subparts.length + " parts" + (missed ? " · " + missed + " missed" : ""), subpartsHTML(r)) : "") +
      (r.errors.length ? section("Mistakes, line by line", String(r.errors.length), errorsHTML(r)) : "") +
      (refCount ? section("Facts, data and references", r.anchorsUsed.length + " used · " + r.missingAnchors.length + " to add", anchorsHTML(r)) : "") +
      (r.modelAnswer ? section("Model answer (exam format)", "~" + mwords + " words",
        '<div class="ai-model-answer">' + esc(r.modelAnswer) + "</div>" +
        '<div class="ai-sec-actions"><button type="button" class="btn-soft" data-ai-action="copy-model"' + ids + ">Copy model answer</button></div>") : "") +
      ((r.pacing || r.caps.length || r.meritCheck) ? section("Pacing, caps and examiner verdict", "",
        (r.pacing ? "<h6>Pacing</h6><p>" + inline(r.pacing) + "</p>" : "") +
        (r.caps.length ? "<h6>Caps applied</h6>" + listHTML(r.caps, "") : "") +
        (r.meritCheck ? "<h6>Merit-list reality check</h6><p>" + inline(r.meritCheck) + "</p>" : "")) : "") +
      '<div class="ai-report-foot"><span class="ai-meta">Graded by ' + esc(r.providerLabel) + " · " + esc(r.model) +
        (r.modelUsed ? " (" + esc(r.modelUsed) + ")" : "") + " · " + esc(when) + (r.durationMs ? " · " + Math.round(r.durationMs / 1000) + " s" : "") +
        (r.usage ? " · tokens: " + esc(tokensText(r.usage)) : "") +
        (r.fallbackFrom ? ' · <span class="ai-warn-text">\u201c' + esc(r.fallbackFrom) + "\u201d was unavailable - pick a model in API keys (top bar)</span>" : "") + "</span>" +
        '<div class="ai-foot-actions">' + footBtns + "</div></div>" +
      "</div>";
  }

  function consistencyHTML(r) {
    const c = r.consistency;
    const list = r.checklist || [];
    if (!c && !list.length) return "";
    const label = { full: "Covered", partial: "Partly", missing: "Missing" };
    const covered = list.filter(x => x.coverage === "full").length;
    const partly = list.filter(x => x.coverage === "partial").length;
    const head = c ? (c.runs.length > 1 ? "Marked " + c.runs.length + " times independently: " + c.runs.map(fmt).join(", ") + " → " + fmt(r.score) : "Marked once") : "";
    const body =
      (c ? "<p>" + esc(head) + " (" + esc(c.method) + ")." +
        (c.runs.length > 1 && c.reason ? " Cross-checked because " + esc(c.reason) + "." : "") +
        (c.runs.length === 1 && list.length ? " The checklist verdict matched the text of your answer, so no cross-check was needed." : "") +
        (c.anchored ? " The mark was " + esc(c.anchored) + " to stay in line with how much of your reference answer the script covers." : "") +
        (c.feedbackOff ? " The written feedback below comes from a grading whose own mark differed from the final one; press Re-grade for fresh feedback." : "") + "</p>" : "") +
      (list.length
        ? "<p>Your reference answer gives " + list.length + " key points: <strong>" + covered + " covered</strong>, " + partly + " partly, " + (list.length - covered - partly) + " missing" + (c && c.coverage !== null ? " (" + fmt(c.coverage) + "% of the weighted checklist)" : "") + ".</p>" +
          '<table class="ai-table ai-checklist"><thead><tr><th>Key point from your reference answer</th><th>Weight</th><th>In your script</th></tr></thead><tbody>' +
          list.map(x => '<tr class="ai-ck-' + esc(x.coverage) + '"><td>' + esc(x.point) + (x.quote ? '<div class="ai-muted">\u201c' + esc(x.quote) + "\u201d</div>" : "") + "</td><td>" + x.weight + '</td><td><span class="ai-ck-tag">' + esc(label[x.coverage] || x.coverage) + "</span></td></tr>").join("") +
          "</tbody></table>"
        : '<p class="ai-muted">No reference checklist for this question (no model answer was uploaded, or it could not be built).</p>');
    return section("How this mark was set (consistency check)", list.length ? covered + " of " + list.length + " key points covered" : (c ? c.runs.length + " gradings" : ""), body);
  }

  function historyBlockHTML(test, q) {
    const r = getReport(test.id, q.id);
    if (!r) return "";
    const key = esc(jobKey(test.id, q.id));
    const ids = ' data-test-id="' + esc(test.id) + '" data-qid="' + esc(q.id) + '"';
    if (r.notAttempted) {
      return '<div class="ai-hist"><div class="ai-hist-row"><span class="ai-hist-score">AI: not attempted · 0 / ' + fmt(r.max) + "</span></div></div>";
    }
    const g = gradeInfo(r.grade);
    return '<div class="ai-hist">' +
      '<div class="ai-hist-row"><span class="ai-hist-score">AI assessment: <strong>' + fmt(r.score) + " / " + fmt(r.max) + "</strong></span>" +
      '<span class="ai-grade-badge ai-g-' + g.cls + '">Grade ' + g.grade + " · " + esc(g.label) + "</span>" +
      (r.projection ? '<span class="ai-muted">Likely real: ' + fmt(r.projection[0]) + "–" + fmt(r.projection[1]) + "</span>" : "") +
      '<button type="button" class="btn-soft" data-ai-action="toggle-history"' + ids + ">View full AI report</button></div>" +
      (r.summary ? '<p class="ai-hist-summary">' + inline(r.summary) + "</p>" : "") +
      '<div class="ai-hist-body" data-ai-hist-body="' + key + '" hidden></div>' +
      "</div>";
  }

  function cell(v) { return String(v == null ? "" : v).replace(/\|/g, "/").replace(/\s*\n\s*/g, " "); }

  function questionMarkdown(test, q, idx, r) {
    const ans = answerOf(test, q);
    const L = [];
    const g = gradeInfo(r.grade);
    L.push("## Q" + (idx + 1) + " · " + (q.paper || "") + " · " + q.marks + " marks: " + fmt(r.score) + " / " + fmt(r.max) +
      (r.notAttempted ? " (not attempted)" : " (" + fmt(r.percent) + "%, Grade " + g.grade + " - " + g.label + ")"));
    L.push("");
    if (q.passage) L.push("**Based on:**", "", "```text", q.passage, "```", "");
    L.push("**Question:** " + (q.text || ""));
    L.push("");
    if (r.projection) L.push("**Likely real RBI score:** " + fmt(r.projection[0]) + "–" + fmt(r.projection[1]) + " / " + fmt(r.max) + " (this grader is ~2–3 marks stricter)", "");
    if (r.summary) L.push("**In plain words:** " + r.summary, "");
    const ledger = siteLedger(r, q);
    const built = ans.text ? siteMarks(r, ans.text, "", ledger) : null;
    if (built && built.marks.length) {
      L.push("### Your answer, marked", "", "How to read the marks:", "", "```text", AM.plainLegend(built), "```", "", "```text", AM.markedPlain(built), "```", "");
      MARK_GROUPS.forEach(([kind, title]) => {
        const mine = built.marks.filter(m => m.kind === kind);
        if (mine.length) L.push("**" + title + " (" + mine.length + ")**", ...mine.map(markLine), "");
      });
    }
    if (!r.notAttempted) {
      L.push("### " + lossTitleText(ledger), ...ledger.rows.map(x => "- " + x.title + (x.detail ? " (" + x.detail + ")" : "") + ": " + (x.lost < 0 ? "+" + fmt(-x.lost) : "-" + fmt(x.lost)) + ". " + x.reasons.join(" ") + (x.quote ? " Your words: \u201c" + x.quote + "\u201d." : "") + (x.fix ? " Next time: " + x.fix : "")), "", "**Total lost: " + fmt(ledger.total) + "** (" + fmt(ledger.max) + " - " + fmt(ledger.total) + " = " + fmt(ledger.score) + " / " + fmt(ledger.max) + ")", "");
      if (ledger.missed.length) L.push("Key points from your reference answer you missed or only partly covered:", ...ledger.missed.map(k => "- " + k.id + " (weight " + k.weight + ", " + (k.coverage === "partial" ? "only partly covered" : "missing") + "): " + k.point), "");
    }
    if (r.consistency) L.push("**How the mark was set:** " + r.consistency.method + " (" + r.consistency.runs.map(fmt).join(", ") + ")" + (r.consistency.coverage !== null ? "; reference checklist covered " + fmt(r.consistency.coverage) + "%" : "") + (r.consistency.anchored ? "; " + r.consistency.anchored + " to match the checklist" : "") + ".", "");
    if (r.checklist && r.checklist.length) L.push("### Key points from your reference answer", ...r.checklist.map(x => "- [" + x.coverage + "] (weight " + x.weight + ") " + x.point), "");
    if (r.strengths.length) L.push("### What worked", ...r.strengths.map(s => "- " + s), "");
    if (r.checks && r.checks.length) L.push("### Examiner checks", ...r.checks.map(c => "- [" + (c.pass === true ? "Yes" : c.pass === false ? "No" : "N/A") + "] " + (c.label || "Check " + c.id) + (c.evidence ? " - " + c.evidence : "")), "");
    if (r.parameters.length) {
      L.push("### Marks breakdown", "| Criterion | Marks | Why |", "|---|---|---|");
      r.parameters.forEach(p => L.push("| " + cell(p.name) + (p.cap ? " (capped: " + cell(p.cap) + ")" : "") + " | " + fmt(p.awarded) + " / " + fmt(p.max) + " | " + cell(p.why) + " |"));
      L.push("", (r.rawSum !== null ? fmt(r.rawSum) + " − " + fmt(r.penaltySum) + " penalties = " : "") + "**" + fmt(r.score) + " / " + fmt(r.max) + "**", "");
      if (r.rules && r.rules.length) L.push("Rubric rules applied by the app:", ...r.rules.map(x => "- " + x), "");
    }
    if (r.subparts.length) L.push("### Question coverage", ...r.subparts.map(s => "- [" + ((COVERAGE[s.coverage] || {}).label || s.coverage) + "] " + s.part + (s.comment ? " - " + s.comment : "")), "");
    if (r.errors.length) L.push("### Mistakes, line by line", ...r.errors.map(e => "- " + (e.quote ? "\u201c" + e.quote + "\u201d - " : "") + (e.code ? e.code + ": " : "") + e.problem + (e.correction ? " Better: " + e.correction : "")), "");
    if (r.anchorsUsed.length) L.push("### References used", ...r.anchorsUsed.map(s => "- " + s), "");
    if (r.nameDrops.length) L.push("### Mentioned without explaining", ...r.nameDrops.map(s => "- " + s), "");
    if (r.missingAnchors.length) L.push("### Add these to reach Grade A", ...r.missingAnchors.map(s => "- " + s), "");
    if (r.modelAnswer) L.push(r.modelAnswerFromQuestion ? "### Reference answer" : "### Model answer (exam format)", "```text", r.modelAnswer, "```", "");
    if (r.actions.length) L.push("### Next drills", ...r.actions.map((a, i) => (i + 1) + ". " + a), "");
    if (r.topic) L.push("**Topic:** " + r.topic, "");
    if (r.conceptGaps && r.conceptGaps.length) L.push("### Concepts to revise", ...r.conceptGaps.map(s => "- " + s), "");
    const w = r.writing;
    if (w) {
      L.push("### Writing analysis");
      if (w.style.verdict) L.push("**Style:** " + w.style.verdict + (w.style.score !== null ? " (" + fmt(w.style.score) + "/10)" : "") + (w.style.assessment ? " - " + w.style.assessment : ""));
      w.style.issues.forEach(x => L.push("- " + x));
      const wc = writingCounts(w);
      L.push("", wc.grammar + wc.spelling + wc.facts ? "Grammar, spelling and fact corrections (" + wc.grammar + " grammar, " + wc.spelling + " spelling, " + wc.facts + " factual) are listed under Your answer, marked." : "No grammar, spelling or factual errors were found.");
      const checkFacts = w.facts.filter(f => f.verify);
      if (checkFacts.length) L.push("", "**Check these figures (" + checkFacts.length + ")**", ...checkFacts.map(f => "- " + (f.quote ? "\u201c" + f.quote + "\u201d: " : "") + f.problem + (f.fact ? " Latest known: " + f.fact : "")));
      if (w.structure.assessment) L.push("", "**Structure:** " + w.structure.assessment, ...w.structure.issues.map(x => "- " + x));
      if (w.vocabulary.assessment || w.vocabulary.weak.length) L.push("", "**Vocabulary:** " + w.vocabulary.assessment, ...w.vocabulary.weak.map(x => "- " + x.used + " -> " + x.better));
      if (w.craft.assessment) L.push("", "**Sentences:** " + w.craft.assessment, ...w.craft.examples.map(x => "- \u201c" + x + "\u201d"));
      if (w.presentation) L.push("", "**Presentation:** " + w.presentation);
      if (w.plan.length) L.push("", "**How to improve:**", ...w.plan.map((x, i) => (i + 1) + ". " + x));
      L.push("");
    }
    if (r.pacing) L.push("**Pacing:** " + r.pacing, "");
    if (r.meritCheck) L.push("**Merit-list reality check:** " + r.meritCheck, "");
    L.push("### Your answer (" + ans.wordCount + " words)", "```text", ans.text || "[No answer written]", "```", "");
    L.push("SCORE_LOG | " + (q.paper || "") + " | " + q.marks + " marks | " + fmt(r.score) + "/" + q.marks + " | " + ans.wordCount + " words");
    if (r.providerLabel) L.push("", "_Graded by " + r.providerLabel + " · " + r.model + " on " + new Date(r.createdAt).toLocaleString() + "_");
    return L.join("\n");
  }

  function testMarkdown(test) {
    const st = testState(test);
    const reports = st.graded.map(r => r.report);
    const total = round2(sum(reports.map(r => r.score)));
    const max = sum(reports.map(r => r.max));
    const pct = max ? round1(total / max * 100) : 0;
    const g = gradeFor(pct);
    const L = ["# RBI Grade B Phase-2 - AI assessment", ""];
    L.push("Test date: " + new Date(test.date).toLocaleString() + " · " + test.questions.length + " question(s)" +
      (typeof formatDuration === "function" ? " · time used " + formatDuration(test.usedSeconds || 0) + " of " + test.totalMinutes + " min" : ""), "");
    L.push("**Total: " + fmt(total) + " / " + fmt(max) + " (" + fmt(pct) + "%) · Grade " + g.grade + " - " + g.label + "**" +
      (st.graded.length < st.rows.length ? " (" + st.graded.length + " of " + st.rows.length + " graded)" : ""), "");
    L.push("| Q | Paper | Marks | Words | Score | Grade |", "|---|---|---|---|---|---|");
    st.rows.forEach(r => L.push("| " + (r.idx + 1) + " | " + cell(r.q.paper) + " | " + r.q.marks + " | " + r.ans.wordCount + "/" + wordLimitOf(r.q) + " | " +
      (r.report ? fmt(r.report.score) : "–") + " | " + (r.report ? (r.report.notAttempted ? "not attempted" : r.report.grade) : "not graded") + " |"));
    L.push("");
    st.rows.forEach(r => { if (r.report) L.push("---", "", questionMarkdown(test, r.q, r.idx, r.report), ""); });
    return L.join("\n");
  }

  function reportFilename(test, idx, q) {
    const date = typeof getLocalDateString === "function" ? getLocalDateString(test.date) : String(test.date || "").slice(0, 10);
    const paper = String((q && q.paper) || "").replace(/&/g, "and").replace(/[^a-zA-Z0-9]/g, "");
    return "RBI_AI_Assessment_" + date + (q ? "_Q" + (idx + 1) + "_" + paper : "_FullTest") + ".md";
  }

  function copyOut(text, button) {
    if (typeof copyText === "function") copyText(text, button);
    else if (navigator.clipboard) navigator.clipboard.writeText(text);
  }

  function downloadOut(name, text) {
    if (typeof downloadText === "function") downloadText(name, text);
  }

  function onClick(e) {
    const el = e.target.closest("[data-ai-action]");
    if (!el) return;
    const action = el.dataset.aiAction;
    const testId = el.dataset.testId || "";
    const qid = el.dataset.qid || "";
    const test = testId ? findTest(testId) : null;
    const q = test && qid ? test.questions.find(x => x.id === qid) : null;
    const idx = test && q ? test.questions.indexOf(q) : -1;

    switch (action) {
      case "open-settings":
        openSettings(testId, el.dataset.engine || (testId ? "grade" : ""));
        break;
      case "evaluate-all":
        if (test) evaluateTest(test, { onlyMissing: true });
        break;
      case "reevaluate-all":
        if (test && confirm("Grade every answer of this test again? Each written answer is graded at least twice (about " + (test.questions.length * 2) + " AI requests), and the current reports are replaced.")) {
          evaluateTest(test, { onlyMissing: false });
        }
        break;
      case "stop":
        stopTest(testId);
        break;
      case "stop-q": {
        const job = getJob(testId, qid);
        if (job) cancelJob(job);
        refreshQuestion(testId, qid);
        refreshPanel(testId);
        break;
      }
      case "evaluate-q":
        if (test) evaluateQuestion(test, qid);
        break;
      case "copy-report": {
        const r = getReport(testId, qid);
        if (test && q && r) copyOut(questionMarkdown(test, q, idx, r), el);
        break;
      }
      case "download-report": {
        const r = getReport(testId, qid);
        if (test && q && r) downloadOut(reportFilename(test, idx, q), questionMarkdown(test, q, idx, r));
        break;
      }
      case "copy-model": {
        const r = getReport(testId, qid);
        if (r && r.modelAnswer) copyOut(r.modelAnswer, el);
        break;
      }
      case "copy-test-report":
        if (test) copyOut(testMarkdown(test), el);
        break;
      case "download-test-report":
        if (test) downloadOut(reportFilename(test, -1, null), testMarkdown(test));
        break;
      case "toggle-history": {
        const body = document.querySelector('[data-ai-hist-body="' + cssEsc(jobKey(testId, qid)) + '"]');
        if (!body) break;
        if (body.hidden) {
          const r = getReport(testId, qid);
          if (!body.dataset.rendered && r && q) {
            body.innerHTML = reportHTML(r, q, { test, readonly: true });
            body.dataset.rendered = "1";
          }
          body.hidden = false;
          el.textContent = "Hide AI report";
        } else {
          body.hidden = true;
          el.textContent = "View full AI report";
        }
        break;
      }
      case "goto-q": {
        const slot = slotFor(qid);
        const card = slot && slot.closest(".result-card");
        if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      }
      case "show-raw": {
        const pre = el.closest(".ai-error-box") && el.closest(".ai-error-box").querySelector(".ai-raw");
        if (pre) {
          pre.hidden = !pre.hidden;
          el.textContent = pre.hidden ? "Show raw reply" : "Hide raw reply";
        }
        break;
      }
      default:
        break;
    }
  }

  function updateNavDot() {
    const ready = Object.keys(ENGINES).filter(id => resolveEngine(id).ready);
    const dot = document.getElementById("ai-nav-dot");
    const navBtn = document.getElementById("nav-ai-settings");
    if (dot) {
      dot.classList.toggle("on", ready.length === Object.keys(ENGINES).length);
      dot.classList.toggle("half", ready.length > 0 && ready.length < Object.keys(ENGINES).length);
    }
    if (navBtn) {
      navBtn.title = Object.values(ENGINES).map(e => {
        const pc = resolveEngine(e.id);
        return "Model " + e.n + " (" + e.label + "): " + (pc.ready ? engineLabel(pc) : "no API key");
      }).join("\n");
      const label = navBtn.querySelector(".ai-nav-label");
      if (label) label.textContent = ready.length ? "API keys" : "Add API keys";
    }
  }

  let draft = null;

  function el(id) { return document.getElementById(id); }
  function card(id) { return document.querySelector('#ai-engines [data-engine="' + id + '"]'); }
  function field(id, name) { const c = card(id); return c ? c.querySelector('[data-f="' + name + '"]') : null; }

  function openSettings(testId, focusEngine) {
    const modal = el("ai-settings-modal");
    if (!modal) return;
    draft = { autoEvaluate: getSettings().autoEvaluate, passes: getSettings().passes, testId: testId || "", engines: {}, keys: Object.assign({}, readSessionKeys()) };
    Object.keys(ENGINES).forEach(id => { draft.engines[id] = Object.assign({}, engineSettings(id)); });
    if (el("ai-keys")) el("ai-keys").innerHTML = "";
    if (el("ai-engines")) el("ai-engines").innerHTML = "";
    setStatusNode(el("ai-save-status"), "");
    renderEngineCards();
    if (el("ai-auto")) el("ai-auto").checked = !!draft.autoEvaluate;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("is-open"));
    void focusEngine;
    setTimeout(() => {
      const k = document.querySelector('#ai-keys [data-key-provider] input');
      if (k) k.focus();
    }, 60);
  }

  function closeSettings() {
    const modal = el("ai-settings-modal");
    if (modal) { modal.classList.remove("is-open"); modal.hidden = true; }
    draft = null;
  }

  function setStatusNode(node, text, kind) {
    if (!node) return;
    node.textContent = text || "";
    node.className = "ai-field-status" + (kind ? " is-" + kind : "");
  }

  function keyStateText(provider, value) {
    const v = String(value || "").trim();
    if (!v) return !isPlaceholderKey(fileKeyFor(provider)) ? "Using the key from ai_config.js." : "No key yet.";
    if (isPlaceholderKey(v)) return "This is a placeholder, not a real key.";
    return "Kept for this browser session only.";
  }

  function keyBlockHTML() {
    const used = providersInUse(draft.engines);
    return used.map(pid => {
      const def = PROVIDERS[pid];
      const ns = Object.values(ENGINES).filter(e => draft.engines[e.id].provider === pid).map(e => e.n);
      const who = [ns.length === 1 ? "model " + ns[0] : "models " + ns.slice(0, -1).join(", ") + " and " + ns[ns.length - 1]];
      if (def.keyOptional) return "";
      const v = pickStr(draft.keys, pid);
      return '<div class="ai-key-block" data-key-provider="' + pid + '">' +
        '<label>' + esc(def.label) + ' API key <span class="ai-key-for">used by ' + esc(who.join(" and ")) + "</span></label>" +
        '<div class="ai-input-row"><input type="password" autocomplete="off" spellcheck="false" value="' + esc(v) + '" placeholder="Paste your ' + esc(def.label) + " key" + (def.keyHint ? " (" + esc(def.keyHint) + ")" : "") + '">' +
        '<button type="button" class="btn-soft" data-key-act="toggle">Show</button></div>' +
        '<p class="ai-field-note"><span data-key-state>' + esc(keyStateText(pid, v)) + "</span>" + (def.keyUrl ? ' <a href="' + esc(def.keyUrl) + '" target="_blank" rel="noopener noreferrer">Get a key</a>' : "") + "</p>" +
      "</div>";
    }).join("");
  }

  function engineCardHTML(id) {
    const e = ENGINES[id];
    const s = draft.engines[id];
    const def = PROVIDERS[s.provider];
    return (
      '<section class="ai-engine" data-engine="' + id + '">' +
        '<div class="ai-engine-head"><span class="ai-engine-num">' + e.n + '</span><div><strong>' + esc(e.label) + '</strong><p class="ai-field-note">' + esc(e.uses) + "</p></div></div>" +
        '<div class="ai-tier" role="radiogroup" aria-label="Reasoning tier for model ' + e.n + '" data-f="thinkwrap"' + (def.kind === "gemini" ? "" : " hidden") + ">" +
          '<span class="ai-tier-label">Reasoning</span>' +
          ["low", "medium", "high"].map(t => '<label class="ai-tier-opt"><input type="radio" name="tier-' + id + '" value="' + t + '"' + (t === s.thinking ? " checked" : "") + '><span>' + t[0].toUpperCase() + t.slice(1) + "</span></label>").join("") +
        "</div>" +
        (def.kind === "gemini" ? "" : '<p class="ai-field-note">This provider has no reasoning tiers; its model decides.</p>') +
        (id === "grade" ? '<div class="ai-tier" role="radiogroup" aria-label="Gradings per answer"><span class="ai-tier-label">Gradings</span>' +
          [["smart", "Smart"], ["two", "Always 2"]].map(([v, t]) => '<label class="ai-tier-opt"><input type="radio" name="passes" value="' + v + '"' + (draft.passes === v ? " checked" : "") + "><span>" + t + "</span></label>").join("") + "</div>" +
          '<p class="ai-field-note">Smart: one full grading per answer, plus a short score-only cross-check only when the mark looks unreliable (about half the tokens). Always 2: a cross-check for every answer.</p>' : "") +
        '<details class="ai-engine-adv"><summary>Model: <span data-f="summary">' + esc(s.model) + "</span></summary>" +
          '<div class="ai-engine-grid">' +
            '<label>Provider<select data-f="provider">' + Object.values(PROVIDERS).map(p => '<option value="' + p.id + '"' + (p.id === s.provider ? " selected" : "") + ">" + esc(p.label) + "</option>").join("") + "</select></label>" +
          "</div>" +
          '<label' + (def.customBaseUrl ? "" : " hidden") + ' data-f="basewrap">Server URL (OpenAI-compatible)<input data-f="baseUrl" type="url" spellcheck="false" value="' + esc(s.baseUrl) + '"></label>' +
          '<label>Model</label><div class="ai-input-row"><input data-f="model" type="text" list="ai-models-' + id + '" autocomplete="off" spellcheck="false" value="' + esc(s.model) + '">' +
          '<button type="button" class="btn-soft" data-f-act="load">Load models</button></div>' +
          '<datalist id="ai-models-' + id + '">' + def.suggestions.concat(e.provider === s.provider ? [e.model] : []).map(m => '<option value="' + esc(m) + '"></option>').join("") + "</datalist>" +
        "</details>" +
        '<div class="ai-test-row"><button type="button" class="btn-soft" data-f-act="test">Test this model</button><p class="ai-field-status" data-f="status" role="status" aria-live="polite"></p></div>' +
      "</section>"
    );
  }

  function renderEngineCards() {
    if (!draft) return;
    readKeys();
    const keys = el("ai-keys");
    if (keys) keys.innerHTML = keyBlockHTML();
    const box = el("ai-engines");
    if (box) box.innerHTML = Object.keys(ENGINES).map(engineCardHTML).join("");
  }

  function readKeys() {
    if (!draft) return;
    document.querySelectorAll("#ai-keys [data-key-provider]").forEach(b => {
      draft.keys[b.dataset.keyProvider] = String(b.querySelector("input").value || "").trim();
    });
  }

  function readEngine(id) {
    if (!draft) return null;
    const s = draft.engines[id];
    const get = name => { const f = field(id, name); return f ? String(f.value || "").trim() : ""; };
    s.provider = PROVIDERS[get("provider")] ? get("provider") : s.provider;
    s.model = get("model") || s.model;
    const tier = card(id) && card(id).querySelector('input[name="tier-' + id + '"]:checked');
    if (tier) s.thinking = tier.value;
    s.baseUrl = get("baseUrl");
    return s;
  }

  function readForm() {
    if (!draft) return;
    readKeys();
    Object.keys(ENGINES).forEach(readEngine);
    draft.autoEvaluate = false;
    const passes = document.querySelector('#ai-engines input[name="passes"]:checked');
    if (passes) draft.passes = passes.value;
  }

  function formEngineConfig(id) {
    readKeys();
    const s = readEngine(id);
    const def = PROVIDERS[s.provider];
    const key = pickStr(draft.keys, s.provider) || fileKeyFor(s.provider);
    const pc = makeConfig(def, key, s.model, s.baseUrl || def.baseUrl);
    pc.engine = id;
    pc.thinking = def.kind === "gemini" && THINKING_LEVELS.includes(s.thinking) ? s.thinking : "";
    return pc;
  }

  function saveSettings() {
    readForm();
    const local = readOverrides();
    const engines = {};
    const keys = {};
    Object.keys(ENGINES).forEach(id => {
      const s = draft.engines[id];
      const d = engineDefaults(id);
      const def = PROVIDERS[s.provider];
      const out = {};
      if (s.provider !== d.provider) out.provider = s.provider;
      const m = cleanModel(def, s.model);
      if (m && !(s.provider === d.provider && m === d.model)) out.model = m;
      if (s.thinking !== d.thinking) out.thinking = s.thinking;
      if (def.customBaseUrl && s.baseUrl && s.baseUrl !== d.baseUrl) out.baseUrl = s.baseUrl.replace(/\/+$/, "");
      if (Object.keys(out).length) engines[id] = out;
    });
    providersInUse(draft.engines).forEach(pid => { const k = pickStr(draft.keys, pid); if (k && !isPlaceholderKey(k)) keys[pid] = k; });
    const ok = writeOverrides({ autoEvaluate: draft.autoEvaluate, passes: draft.passes, engines }) && writeSessionKeys(keys);
    if (!ok) {
      setStatusNode(el("ai-save-status"), "Could not save - this browser is blocking storage for this page.", "error");
      return;
    }
    void local;
    const reopenTestId = draft.testId;
    const draftWantsGrading = !!draft.wantsGrading;
    closeSettings();
    updateNavDot();
    const t = currentResultTest();
    const resultVisible = el("screen-result") && !el("screen-result").hidden;
    if (t && resultVisible) {
      renderResultScreen(t);
      if (reopenTestId === t.id && activeProvider("grading").ready && draftWantsGrading && testState(t).missing > 0) {
        evaluateTest(t, { onlyMissing: true });
      }
    }
    if (typeof onAISettingsSaved === "function") {
      try { onAISettingsSaved(); } catch (e) { console.warn(e); }
    }
  }

  function wireSettings() {
    const modal = el("ai-settings-modal");
    const form = el("ai-settings-form");
    if (!modal || !form) return;
    dropStoredKeys();

    form.addEventListener("input", (e) => {
      const kb = e.target.closest("[data-key-provider]");
      if (kb) { kb.querySelector("[data-key-state]").textContent = keyStateText(kb.dataset.keyProvider, e.target.value); return; }
      const c = e.target.closest("[data-engine]");
      if (!c) return;
      const id = c.dataset.engine;
      if (e.target.dataset.f === "model") {
        const s = readEngine(id);
        const sum = field(id, "summary");
        if (sum) sum.textContent = s.model;
      }
    });

    form.addEventListener("change", (e) => {
      const c = e.target.closest("[data-engine]");
      if (!c || e.target.dataset.f !== "provider") return;
      const id = c.dataset.engine;
      readForm();
      const s = draft.engines[id];
      const def = PROVIDERS[s.provider];
      const d = engineDefaults(id);
      s.model = s.provider === d.provider ? d.model : def.defaultModel;
      s.baseUrl = def.baseUrl || "";
      renderEngineCards();
      const adv = card(id) && card(id).querySelector("details");
      if (adv) adv.open = true;
    });

    form.addEventListener("click", async (e) => {
      const kt = e.target.closest('[data-key-act="toggle"]');
      if (kt) {
        const k = kt.closest("[data-key-provider]").querySelector("input");
        k.type = k.type === "password" ? "text" : "password";
        kt.textContent = k.type === "password" ? "Show" : "Hide";
        return;
      }
      const b = e.target.closest("[data-f-act]");
      if (!b) return;
      const id = b.closest("[data-engine]").dataset.engine;
      const status = field(id, "status");
      const act = b.dataset.fAct;
      const pc = formEngineConfig(id);
      if (!pc.ready) { setStatusNode(status, pc.def.keyOptional ? "Enter the server URL first." : "Paste the API key first.", "warn"); return; }
      b.disabled = true;
      try {
        if (act === "test") {
          setStatusNode(status, "Contacting " + engineLabel(pc) + "…", "loading");
          const res = await testConnection(pc);
          setStatusNode(status, "Connected: " + res.modelUsed + " replied in " + (res.ms / 1000).toFixed(1) + " s.", "ok");
        } else if (act === "load") {
          setStatusNode(status, "Loading models…", "loading");
          const models = await listModels(pc);
          const list = el("ai-models-" + id);
          if (list) list.innerHTML = models.map(m => '<option value="' + esc(m.id) + '">' + (m.label && m.label !== m.id ? esc(m.label) : "") + "</option>").join("");
          setStatusNode(status, models.length ? "Found " + models.length + " models: type in the Model box to pick one." : "No suitable models found for this key.", models.length ? "ok" : "warn");
        }
      } catch (err) {
        const ex = explainError(err, pc);
        setStatusNode(status, ex.title + ": " + ex.body, "error");
      } finally {
        b.disabled = false;
      }
    });

    el("ai-forget-keys").addEventListener("click", () => {
      writeSessionKeys({});
      document.querySelectorAll("#ai-keys [data-key-provider]").forEach(b => {
        b.querySelector("input").value = "";
        b.querySelector("[data-key-state]").textContent = keyStateText(b.dataset.keyProvider, "");
      });
      if (draft) draft.keys = {};
      updateNavDot();
      setStatusNode(el("ai-save-status"), "The keys were removed from this session.", "warn");
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      saveSettings();
    });

    modal.querySelectorAll("[data-ai-close]").forEach(b => b.addEventListener("click", closeSettings));
    modal.addEventListener("mousedown", (e) => { if (e.target === modal) closeSettings(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) closeSettings();
    });
  }

  let initialised = false;

  function init() {
    if (initialised) return;
    initialised = true;
    wireSettings();
    document.addEventListener("click", onClick);
    window.addEventListener("beforeunload", (e) => {
      if (anyActive()) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
    updateNavDot();
  }

  window.AIEval = {
    init,
    autoEvaluate,
    renderResultScreen,
    historyBlockHTML,
    deleteTestReports,
    clearAllReports,
    getReport,
    openSettings,
    runJSON,
    isReady: (role) => activeProvider(role || "check").ready,
    activity,
    resumePending,
    stopTest,
    storeScheme,
    schemeOf,
    tokensText,
    providerLabel: (role) => engineLabel(activeProvider(role || "check")),
    explain: (err, role) => explainError(err, activeProvider(role || "check")),
    evaluateTest: (test) => evaluateTest(test, { onlyMissing: true }),
    _internal: {
      PROVIDERS, REPORT_SCHEMA, JSON_CONTRACT, extractJSON, normalizeReport, httpError, explainError,
      isPlaceholderKey, resolveEngine, getSettings, projectionFor, gradeFor, buildPrompt, generate,
      listModels, testConnection, gradeAnswer, questionMarkdown, testMarkdown, reportHTML, panelHTML,
      AIError, normalizeWriting, topicStats, quoteInScript, isBritishVariant, combineRuns, checklistCoverage, schemeHash,
      lexicalCoverage, crossCheckReason, usageFrom, penaltyValue, ceilingFor, siteLedger, siteMarks
    }
  };
})();
