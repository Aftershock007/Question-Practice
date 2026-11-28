"use strict";

const fs = require("fs");
const path = require("path");

const ENGINE_IDS = ["check", "grade"];
const PASS_IDS = ["scheme", "language", "score", "coach", "synthesis"];
const THINKING = ["", "low", "medium", "high"];
const LIMITS = { runs: [1, 5], maxRuns: [1, 7], concurrency: [1, 8], timeoutSeconds: [30, 1800] };

const DEFAULT_SETTINGS = Object.freeze({
  engines: {
    check: { provider: "gemini", model: "gemini-4-hydrogen", thinking: "low", temperature: null },
    grade: { provider: "gemini", model: "gemini-4-neon", thinking: "high", temperature: null }
  },
  passes: { scheme: "check", language: "grade", score: "grade", coach: "grade", synthesis: "check" },
  runs: 3,
  maxRuns: 5,
  concurrency: 3,
  timeoutSeconds: 420,
  reportsDir: "",
  baseUrls: {}
});

const ENV_KEYS = {
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  groq: ["GROQ_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
  custom: ["CUSTOM_API_KEY"]
};

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function validInt(name, v) {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  const [lo, hi] = LIMITS[name];
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
}

function validTemperature(v) {
  if (v === null || v === undefined || v === "" || v === "none" || v === "default") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 2 ? n : undefined;
}

function mergeEngine(def, raw) {
  const out = clone(def);
  if (!raw || typeof raw !== "object") return out;
  if (typeof raw.provider === "string" && raw.provider.trim()) out.provider = raw.provider.trim().toLowerCase();
  if (typeof raw.model === "string" && raw.model.trim()) out.model = raw.model.trim();
  if (typeof raw.thinking === "string" && THINKING.includes(raw.thinking.trim().toLowerCase())) out.thinking = raw.thinking.trim().toLowerCase();
  const t = validTemperature(raw.temperature);
  if (t !== undefined) out.temperature = t;
  return out;
}

function mergeSettings(raw) {
  const s = clone(DEFAULT_SETTINGS);
  if (!raw || typeof raw !== "object") return s;
  for (const id of ENGINE_IDS) s.engines[id] = mergeEngine(s.engines[id], raw.engines && raw.engines[id]);
  if (raw.passes && typeof raw.passes === "object") {
    for (const p of PASS_IDS) if (ENGINE_IDS.includes(raw.passes[p])) s.passes[p] = raw.passes[p];
  }
  for (const name of Object.keys(LIMITS)) {
    const v = validInt(name, raw[name]);
    if (v !== null) s[name] = v;
  }
  if (s.maxRuns < s.runs) s.maxRuns = s.runs;
  if (typeof raw.reportsDir === "string") s.reportsDir = raw.reportsDir.trim();
  if (raw.baseUrls && typeof raw.baseUrls === "object") {
    for (const [k, v] of Object.entries(raw.baseUrls)) if (typeof v === "string" && v.trim()) s.baseUrls[k] = v.trim();
  }
  return s;
}

function loadSettings(paths) {
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(paths.settings, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return mergeSettings(null);
    throw new Error("The settings file " + paths.settings + " is not valid JSON (" + err.message + "). Fix it or delete it to go back to the defaults.");
  }
  return mergeSettings(raw);
}

function saveSettings(paths, settings) {
  fs.mkdirSync(path.dirname(paths.settings), { recursive: true });
  fs.writeFileSync(paths.settings, JSON.stringify(mergeSettings(settings), null, 2) + "\n");
}

function settingKeys() {
  return [
    ...ENGINE_IDS.flatMap(id => ["provider", "model", "thinking", "temperature"].map(f => id + "." + f)),
    ...PASS_IDS.map(p => "passes." + p),
    ...Object.keys(LIMITS),
    "reportsDir",
    "baseUrls.<provider>"
  ];
}

function setSetting(settings, key, value) {
  const s = mergeSettings(settings);
  const k = String(key || "").trim();
  const v = value == null ? "" : String(value).trim();
  const [head, field] = k.split(".");
  if (ENGINE_IDS.includes(head) && field) {
    const e = s.engines[head];
    if (field === "provider") {
      if (!v) throw new Error("provider cannot be empty.");
      e.provider = v.toLowerCase();
    } else if (field === "model") {
      if (!v) throw new Error("model cannot be empty.");
      e.model = v;
    } else if (field === "thinking") {
      const t = v.toLowerCase() === "none" ? "" : v.toLowerCase();
      if (!THINKING.includes(t)) throw new Error("thinking must be one of: low, medium, high, none.");
      e.thinking = t;
    } else if (field === "temperature") {
      const t = validTemperature(v);
      if (t === undefined) throw new Error("temperature must be a number from 0 to 2, or none.");
      e.temperature = t;
    } else {
      throw new Error("Unknown setting \"" + k + "\". Settings you can change: " + settingKeys().join(", ") + ".");
    }
    return s;
  }
  if (head === "passes" && PASS_IDS.includes(field)) {
    if (!ENGINE_IDS.includes(v)) throw new Error("passes." + field + " must be check or grade.");
    s.passes[field] = v;
    return s;
  }
  if (head === "baseUrls" && field) {
    if (v) s.baseUrls[field] = v; else delete s.baseUrls[field];
    return s;
  }
  if (Object.prototype.hasOwnProperty.call(LIMITS, k)) {
    const n = validInt(k, v);
    if (n === null) throw new Error(k + " must be a whole number from " + LIMITS[k][0] + " to " + LIMITS[k][1] + ".");
    s[k] = n;
    if (k === "runs" && s.maxRuns < n) s.maxRuns = n;
    if (k === "maxRuns" && s.runs > n) s.runs = n;
    return s;
  }
  if (k === "reportsDir") {
    s.reportsDir = v;
    return s;
  }
  throw new Error("Unknown setting \"" + k + "\". Settings you can change: " + settingKeys().join(", ") + ".");
}

function isPlaceholderKey(key) {
  const k = String(key || "").trim();
  return !k || /^DEMO_/i.test(k) || /^(?:YOUR|PASTE)[_-]/i.test(k);
}

function readKeysFile(paths) {
  try {
    const o = JSON.parse(fs.readFileSync(paths.keysFile, "utf8"));
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch (_) {
    return {};
  }
}

function loadKeys(paths, env = process.env) {
  const file = readKeysFile(paths);
  const out = {};
  const providers = new Set([...Object.keys(ENV_KEYS), ...Object.keys(file)]);
  for (const p of providers) {
    const fromEnv = (ENV_KEYS[p] || []).map(n => env[n]).find(v => !isPlaceholderKey(v));
    const fromFile = typeof file[p] === "string" && !isPlaceholderKey(file[p]) ? file[p] : "";
    const key = (fromEnv || fromFile || "").trim();
    if (key) out[p] = key;
  }
  return out;
}

function keySource(paths, env, provider) {
  const name = (ENV_KEYS[provider] || []).find(n => !isPlaceholderKey(env[n]));
  if (name) return "environment variable " + name;
  const file = readKeysFile(paths);
  if (typeof file[provider] === "string" && !isPlaceholderKey(file[provider])) return "keys file " + paths.keysFile;
  return "";
}

function saveKey(paths, provider, key) {
  const file = readKeysFile(paths);
  const k = String(key || "").trim();
  if (k) file[provider] = k; else delete file[provider];
  fs.mkdirSync(path.dirname(paths.keysFile), { recursive: true, mode: 0o700 });
  fs.writeFileSync(paths.keysFile, JSON.stringify(file, null, 2) + "\n", { mode: 0o600 });
  try { fs.chmodSync(paths.keysFile, 0o600); } catch (_) {}
}

function maskKey(key) {
  const k = String(key || "");
  if (!k) return "";
  if (k.length <= 8) return "****";
  return k.slice(0, 4) + "..." + k.slice(-4);
}

function engineForPass(settings, pass) {
  const e = settings && settings.passes ? settings.passes[pass] : "";
  return e === "check" ? "check" : "grade";
}

module.exports = {
  DEFAULT_SETTINGS, ENV_KEYS, ENGINE_IDS, PASS_IDS,
  loadSettings, saveSettings, mergeSettings, setSetting, settingKeys,
  loadKeys, keySource, saveKey, maskKey, isPlaceholderKey, engineForPass
};
