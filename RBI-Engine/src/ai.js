"use strict";

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_FALLBACK_MODEL = "gemini-flash-latest";
const ANTHROPIC_API = "https://api.anthropic.com/v1";
const MAX_ATTEMPTS = { rate: 4, overloaded: 4, network: 3 };

const PROVIDERS = {
  gemini: { id: "gemini", label: "Google Gemini", kind: "gemini", defaultModel: "gemini-flash-latest", env: "GEMINI_API_KEY", keyUrl: "https://aistudio.google.com/app/apikey", keyHint: "starts with AIza or AQ." },
  openai: { id: "openai", label: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-5.4-mini", env: "OPENAI_API_KEY", keyUrl: "https://platform.openai.com/api-keys", keyHint: "starts with sk-",
    modelFilter: id => /^(gpt|o\d|chatgpt)/i.test(id) && !/audio|realtime|tts|transcribe|image|embedding|search|moderation|whisper|dall-e|davinci|babbage|instruct/i.test(id) },
  anthropic: { id: "anthropic", label: "Anthropic Claude", kind: "anthropic", defaultModel: "claude-sonnet-5-5", env: "ANTHROPIC_API_KEY", keyUrl: "https://console.anthropic.com/settings/keys", keyHint: "starts with sk-ant-" },
  groq: { id: "groq", label: "Groq", kind: "openai", baseUrl: "https://api.groq.com/openai/v1", defaultModel: "openai/gpt-oss-120b", env: "GROQ_API_KEY", keyUrl: "https://console.groq.com/keys", keyHint: "starts with gsk_",
    modelFilter: id => !/whisper|tts|guard|orpheus|playai|distil/i.test(id) },
  openrouter: { id: "openrouter", label: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", defaultModel: "openrouter/auto", env: "OPENROUTER_API_KEY", keyUrl: "https://openrouter.ai/settings/keys", keyHint: "starts with sk-or-",
    headers: { "X-Title": "RBI-Engine" } },
  deepseek: { id: "deepseek", label: "DeepSeek", kind: "openai", baseUrl: "https://api.deepseek.com", defaultModel: "deepseek-chat", env: "DEEPSEEK_API_KEY", keyUrl: "https://platform.deepseek.com/api_keys", keyHint: "starts with sk-",
    maxTokens: model => (model === "deepseek-chat" ? 8192 : 0) },
  mistral: { id: "mistral", label: "Mistral", kind: "openai", baseUrl: "https://api.mistral.ai/v1", defaultModel: "mistral-medium-latest", env: "MISTRAL_API_KEY", keyUrl: "https://console.mistral.ai/api-keys", keyHint: "" },
  custom: { id: "custom", label: "Local / custom (OpenAI-compatible)", kind: "openai", baseUrl: "http://localhost:11434/v1", defaultModel: "llama3.1", env: "CUSTOM_API_KEY", keyUrl: "", keyHint: "optional", keyOptional: true, customBaseUrl: true }
};

class AIError extends Error {
  constructor(kind, message, extra) {
    super(message);
    this.name = "AIError";
    this.kind = kind;
    if (extra) Object.assign(this, extra);
  }
}

function providerConfig(engine, keys = {}, settings = {}, env = process.env) {
  const def = PROVIDERS[String(engine && engine.provider || "").toLowerCase()];
  if (!def) throw new AIError("not_configured", "Unknown provider \"" + (engine && engine.provider) + "\". Use one of: " + Object.keys(PROVIDERS).join(", ") + ".");
  const urls = (settings && settings.baseUrls) || {};
  let baseUrl = urls[def.id] || "";
  if (!baseUrl) {
    if (def.kind === "gemini") baseUrl = env.RBI_GEMINI_BASE || GEMINI_API;
    else if (def.kind === "anthropic") baseUrl = env.RBI_ANTHROPIC_BASE || ANTHROPIC_API;
    else baseUrl = def.baseUrl;
  }
  const apiKey = String(keys[def.id] || "").trim();
  const model = String(engine.model || def.defaultModel).trim().replace(/^models\//, "");
  return {
    id: def.id,
    def,
    apiKey,
    model,
    thinking: def.kind === "gemini" ? String(engine.thinking || "") : "",
    temperature: typeof engine.temperature === "number" ? engine.temperature : null,
    baseUrl: String(baseUrl).replace(/\/+$/, ""),
    ready: !!apiKey || !!def.keyOptional
  };
}

function providerMessage(data, text, status) {
  if (data && typeof data === "object") {
    const e = data.error;
    if (e && typeof e === "object" && typeof e.message === "string" && e.message.trim()) {
      const raw = e.metadata && typeof e.metadata.raw === "string" ? e.metadata.raw : "";
      return raw && raw.length < 400 ? e.message + " - " + raw : e.message;
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

function sleepFor(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) { reject(new AIError("cancelled", "Stopped.")); return; }
    const t = setTimeout(done, ms);
    function done() { if (signal) signal.removeEventListener("abort", onAbort); resolve(); }
    function onAbort() { clearTimeout(t); reject(new AIError("cancelled", "Stopped.")); }
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function requestJSON(url, init, opts = {}) {
  const timeoutMs = opts.timeoutMs || 420000;
  const signal = opts.signal;
  if (signal && signal.aborted) throw new AIError("cancelled", "Stopped.");
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
  const relay = () => ctrl.abort();
  if (signal) signal.addEventListener("abort", relay, { once: true });
  const failed = (err) => {
    if (timedOut) return new AIError("timeout", "No reply within " + Math.round(timeoutMs / 1000) + " seconds.", { timeoutMs });
    if (signal && signal.aborted) return new AIError("cancelled", "Stopped.");
    const cause = err && err.cause;
    const why = cause && (cause.code || cause.message) ? String(cause.code || cause.message) : (err && err.message) || "Network error";
    return new AIError("network", why, { detail: why });
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

async function withRetries(fn, opts = {}) {
  const signal = opts.signal;
  const onStatus = opts.onStatus || function () {};
  const sleep = opts.sleep || ((ms) => sleepFor(ms, signal));
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
      const why = { rate: "Rate limited", overloaded: "Provider busy", network: "Connection problem" }[err.kind];
      for (let left = wait; left > 0; left -= 1000) {
        onStatus(why + " - retrying in " + Math.ceil(left / 1000) + " s (attempt " + (attempt + 1) + " of " + limit + ")");
        await sleep(Math.min(1000, left));
      }
    }
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

function usageText(u) {
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
  const url = pc.baseUrl + "/models/" + encodeURIComponent(pc.model) + ":generateContent";
  const variants = req.json ? (req.schema ? ["schema", "mime", "plain"] : ["mime", "plain"]) : ["plain"];
  let lastErr = null;
  for (const v of variants) {
    const body = {};
    if (v === "plain") {
      body.contents = [{ role: "user", parts: [{ text: (req.system ? req.system + "\n\n" : "") + req.prompt }] }];
    } else {
      body.contents = [{ role: "user", parts: [{ text: req.prompt }] }];
      if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
      body.generationConfig = v === "schema"
        ? { responseMimeType: "application/json", responseJsonSchema: req.schema }
        : { responseMimeType: "application/json" };
    }
    if (pc.thinking) body.generationConfig = Object.assign({}, body.generationConfig, { thinkingConfig: { thinkingLevel: pc.thinking } });
    if (pc.temperature !== null) body.generationConfig = Object.assign({}, body.generationConfig, { temperature: pc.temperature });
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
    if (err.kind === "bad_request" && v !== "plain" && /schema|mime|json|unknown name|invalid json payload|generation_?config|instruction|not supported|unsupported/i.test(err.detail || "")) {
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
    if (pc.temperature !== null) body.temperature = pc.temperature;
    const maxTokens = pc.def.maxTokens ? pc.def.maxTokens(pc.model) : 0;
    if (maxTokens && req.json) body.max_tokens = maxTokens;
    const r = await requestJSON(chatCompletionsUrl(pc.baseUrl), { method: "POST", headers, body: JSON.stringify(body) }, opts);
    if (r.ok) return openaiParse(r.data, pc);
    const err = httpError(pc, r.status, r.data, r.text);
    if (v === "json" && err.kind === "bad_request" && /response_format|json_object|json mode|json_validate|failed to generate json|not supported|unsupported/i.test((err.detail || "") + " " + (err.code || ""))) {
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
  if (pc.temperature !== null) body.temperature = pc.temperature;
  const headers = { "Content-Type": "application/json", "x-api-key": pc.apiKey, "anthropic-version": "2023-06-01" };
  for (let tries = 0; tries < 2; tries++) {
    const r = await requestJSON(pc.baseUrl + "/messages", { method: "POST", headers, body: JSON.stringify(body) }, opts);
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

function generate(pc, req, opts = {}) {
  if (!pc.ready) return Promise.reject(new AIError("not_configured", "No API key for " + pc.def.label + "."));
  if (pc.def.kind === "gemini") return geminiGenerate(pc, req, opts);
  if (pc.def.kind === "anthropic") return anthropicGenerate(pc, req, opts);
  return openaiGenerate(pc, req, opts);
}

async function callModel(pc, req, opts = {}) {
  const run = (p) => withRetries(() => generate(p, req, opts), opts);
  try {
    const res = await run(pc);
    return Object.assign(res, { model: pc.model, fallbackFrom: "" });
  } catch (err) {
    if (err.kind === "model" && pc.def.kind === "gemini" && pc.model !== GEMINI_FALLBACK_MODEL) {
      if (opts.onStatus) opts.onStatus("\"" + pc.model + "\" is not available - trying " + GEMINI_FALLBACK_MODEL);
      const res = await run(Object.assign({}, pc, { model: GEMINI_FALLBACK_MODEL }));
      return Object.assign(res, { model: GEMINI_FALLBACK_MODEL, fallbackFrom: pc.model });
    }
    throw err;
  }
}

function extractJSON(text) {
  if (!text) return null;
  const t = String(text).replace(/^﻿/, "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
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

function explainError(err, pc) {
  const label = pc ? pc.def.label : "The AI provider";
  const model = pc ? pc.model : "";
  const detail = err && err.detail ? " (" + err.detail + ")" : "";
  const env = pc && pc.def.env ? pc.def.env : "the API key variable";
  switch (err && err.kind) {
    case "not_configured":
      return { title: "AI is not set up", body: "No API key for " + label + ". Run: node rbi.js setup (or set the " + env + " environment variable)." };
    case "auth":
      return { title: "API key rejected", body: label + " did not accept the API key" + detail + ". Run: node rbi.js setup and paste a valid key." };
    case "permission":
      return { title: "Access denied", body: label + " refused this request" + detail + ". The key may be restricted, the API may not be enabled for its project, or the service may not be available in your region." };
    case "model":
      return { title: "Model not available", body: "The model \"" + model + "\" is not available for your key" + detail + ". Run: node rbi.js setup to pick another model, or: node rbi.js config set grade.model <model-name>." };
    case "quota":
      return { title: "Quota used up", body: label + " says this key has no quota left" + detail + ". Free-tier limits reset daily. Finished parts are saved, so run the same command again later to continue." };
    case "privacy":
      return { title: "Blocked by your OpenRouter privacy settings", body: "No provider of \"" + model + "\" matches your account's data policy" + detail + ". Allow free endpoints at openrouter.ai/settings/privacy, or pick a paid model." };
    case "rate":
      return { title: "Too many requests", body: label + " is rate-limiting this key" + detail + ". The engine already retried. Wait a minute and run the same command again; finished parts are saved." };
    case "overloaded":
      return { title: "Provider busy", body: label + " is overloaded or having a problem" + detail + ". Run the same command again in a minute; finished parts are saved." };
    case "network": {
      let body = "Could not reach " + label + detail + ".";
      if (pc && pc.def.customBaseUrl) body += " Check that the server is running at " + pc.baseUrl + ".";
      else body += " Check your internet connection, VPN or firewall.";
      return { title: "Connection failed", body };
    }
    case "timeout":
      return { title: "No reply in time", body: label + " did not reply in time. Run the same command again, or lower the thinking level: node rbi.js config set grade.thinking medium." };
    case "blocked":
      return { title: "Request blocked", body: label + " refused to analyse this answer" + detail + "." };
    case "truncated":
      return { title: "Reply cut off", body: "The model stopped before finishing. Run the same command again; if it keeps happening, choose another model." };
    case "format":
    case "bad_response":
      return { title: "Unreadable reply", body: "The model did not return the expected format, even after asking twice. Run the same command again, or choose a stronger model." };
    case "too_large":
      return { title: "Answer too long for this model", body: label + " rejected the request as too large" + detail + ". Choose a model with a bigger context window." };
    case "bad_request":
      return { title: "Request rejected", body: label + " rejected the request" + detail + "." };
    case "cancelled":
      return { title: "Stopped", body: "The analysis was stopped." };
    default:
      return { title: "Something went wrong", body: (err && err.message) || String(err) };
  }
}

function sortModels(list) {
  const seen = new Set();
  return list.filter(m => m.id && !seen.has(m.id) && seen.add(m.id)).sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
}

async function listModels(pc) {
  const opts = { timeoutMs: 45000 };
  const out = [];
  if (pc.def.kind === "gemini") {
    let token = "";
    for (let page = 0; page < 5; page++) {
      const url = pc.baseUrl + "/models?pageSize=1000" + (token ? "&pageToken=" + encodeURIComponent(token) : "");
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
    const r = await requestJSON(pc.baseUrl + "/models?limit=1000", { headers: { "x-api-key": pc.apiKey, "anthropic-version": "2023-06-01" } }, opts);
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
  return sortModels(out);
}

async function testConnection(pc, opts = {}) {
  const t0 = Date.now();
  const res = await callModel(pc, { system: "", prompt: "Connection test. Reply with exactly: OK", json: false }, Object.assign({ timeoutMs: 90000 }, opts));
  return { ms: Date.now() - t0, model: res.model, modelUsed: res.modelUsed || res.model, fallbackFrom: res.fallbackFrom, reply: res.text.trim().slice(0, 60) };
}

module.exports = {
  PROVIDERS, AIError, GEMINI_FALLBACK_MODEL, providerConfig, generate, callModel, withRetries, extractJSON,
  explainError, addUsage, usageText, usageFrom, listModels, testConnection, httpError, requestJSON
};
