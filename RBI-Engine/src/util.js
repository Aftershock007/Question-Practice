"use strict";

const crypto = require("crypto");

function str(v, maxLen = 4000) {
  if (v == null) return "";
  let s = "";
  if (typeof v === "string") s = v;
  else if (typeof v === "number" || typeof v === "boolean") s = String(v);
  else if (typeof v === "object" && !Array.isArray(v)) s = v.text || v.name || v.value || v.point || "";
  s = String(s).replace(/\r\n?/g, "\n").trim();
  return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;
}

function num(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const m = v.replace(/,(?=\d)/g, ".").match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  }
  return null;
}

function strList(v, maxItems = 10, maxLen = 600) {
  const arr = Array.isArray(v) ? v : (typeof v === "string" && v.trim() ? v.split(/\n+/) : []);
  return arr
    .map(x => str(x, maxLen).replace(/^(?:[-*•]\s+|\d{1,2}[.)]\s+)/, ""))
    .filter(x => x && !/^(?:none|n\/a|nil)\.?$/i.test(x))
    .slice(0, maxItems);
}

function objList(v, maxItems = 50) {
  return (Array.isArray(v) ? v : []).filter(x => x && typeof x === "object" && !Array.isArray(x)).slice(0, maxItems);
}

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
function snap4(n) { return Math.round((Number(n) || 0) * 4) / 4; }
function floor4(n) { return Math.floor((Number(n) || 0) * 4 + 1e-9) / 4; }
function round2(n) { return Math.round(n * 100) / 100; }
function round1(n) { return Math.round(n * 10) / 10; }
function sum(list) { return list.reduce((s, x) => s + (Number(x) || 0), 0); }
function fmt(n) { const v = Number(n); return Number.isFinite(v) ? String(round2(v)) : "-"; }

function median(list) {
  const s = list.filter(x => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  const n = s.length;
  if (!n) return null;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

function slug(text, max = 40) {
  const s = String(text || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "");
  return s || "answer";
}

function escapeHTML(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return Math.floor(s / 60) + " min " + (s % 60) + " sec";
}

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

module.exports = {
  str, num, strList, objList, clamp, snap4, floor4, round2, round1, sum, fmt, median, sha256, slug,
  escapeHTML, formatDuration, plainText, quoteInScript, isBritishVariant, onlyBritishChanges, findSpan,
  normChars, escapeRegExp
};
