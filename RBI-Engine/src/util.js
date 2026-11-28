"use strict";

const crypto = require("crypto");
const { plainText, quoteInScript, isBritishVariant, onlyBritishChanges, findSpan, normChars, escapeRegExp } = require("./answer-marks");

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

module.exports = {
  str, num, strList, objList, clamp, snap4, floor4, round2, round1, sum, fmt, median, sha256, slug,
  escapeHTML, formatDuration, plainText, quoteInScript, isBritishVariant, onlyBritishChanges, findSpan,
  normChars, escapeRegExp
};
