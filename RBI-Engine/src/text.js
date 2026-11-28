"use strict";

const { round1 } = require("./util");

const ABBREV = new Set([
  "e.g", "i.e", "etc", "vs", "viz", "cf", "mr", "mrs", "ms", "dr", "prof", "st", "no", "nos", "rs", "re", "govt", "dept",
  "co", "ltd", "inc", "approx", "est", "fig", "figs", "art", "arts", "sec", "ch", "vol", "pp", "jan", "feb", "mar", "apr",
  "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "al", "ed", "eds", "shri", "smt", "sh", "hon", "sr", "jr", "lt",
  "col", "capt", "gen", "mt", "ft", "max", "min", "ref", "para", "paras", "cl", "w.r.t", "a.k.a", "p.a"
]);

const POINT_RE = /^((?:[-*•·●▪◦➢➔→]|\(?\d{1,2}[.)]|\(?[a-zA-Z][.)]|\(?(?:i{1,3}|iv|vi{0,3}|ix|xi{0,2}|I{1,3}|IV|VI{0,3}|IX|XI{0,2})[.)]))\s+/;
const CONCLUSION_RE = /^(?:conclusion|in conclusion|to conclude|conclude|concluding|way forward|the way forward|way ahead|the way ahead|road ahead|the road ahead|going forward|to sum up|summing up|in sum|in short|overall|thus|hence|therefore)\b/i;

function normalizeText(s) {
  return String(s == null ? "" : s)
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[   ]/g, " ")
    .replace(/[​‌‍⁠﻿­]/g, "");
}

function countWords(text) {
  const s = String(text || "").trim();
  return s ? s.split(/\s+/).length : 0;
}

function isAbbrev(token) {
  const t = String(token || "").replace(/^["'“‘(\[]+/, "");
  if (!t) return false;
  const low = t.toLowerCase();
  if (ABBREV.has(low)) return true;
  if (/^[A-Za-z]$/.test(t)) return true;
  return /^(?:[A-Za-z]{1,2}\.)+[A-Za-z]{1,2}$/.test(t);
}

function isHeadingText(text) {
  const s = String(text || "").trim();
  if (!s || s.length > 90) return false;
  const words = s.split(/\s+/);
  if (words.length > 10) return false;
  if (/[.!?।]["'”’)\]]*$/.test(s)) return false;
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 3 && letters.replace(/[^A-Z]/g, "").length / letters.length >= 0.7) return true;
  if (/:$/.test(s) && words.length <= 8) return true;
  if (words.length <= 8) {
    const sig = words.filter(w => /[A-Za-z]/.test(w) && !/^(?:and|or|of|the|in|on|for|to|a|an|with|vs|at|by|from|&)$/i.test(w));
    if (sig.length && sig.every(w => /^[^A-Za-z]*[A-Z]/.test(w))) return true;
  }
  return false;
}

function isAllCapsHeading(text) {
  const s = String(text || "").trim();
  const letters = s.replace(/[^A-Za-z]/g, "");
  return isHeadingText(s) && letters.length >= 3 && letters.replace(/[^A-Z]/g, "").length / letters.length >= 0.7;
}

function lineRecords(text) {
  const out = [];
  let pos = 0;
  let para = 0;
  let prevBlank = true;
  const lines = String(text).split("\n");
  lines.forEach((raw, i) => {
    const lead = raw.length - raw.replace(/^\s+/, "").length;
    const content = raw.trim();
    const start = pos + lead;
    const rec = { line: i + 1, start, end: start + content.length, text: content, blank: !content, para: 0 };
    if (content) {
      if (prevBlank) para++;
      rec.para = para;
      prevBlank = false;
    } else {
      prevBlank = true;
    }
    out.push(rec);
    pos += raw.length + 1;
  });
  return out;
}

const BOUNDARY_RE = /[.!?।]+["'”’)\]]*(?=\s+["'“‘(\[]?(?:[A-Z0-9]|[^\x00-\x7F\s]))/g;

function sentenceRanges(content, markerEnd = 0) {
  const ranges = [];
  let start = 0;
  BOUNDARY_RE.lastIndex = 0;
  let m;
  while ((m = BOUNDARY_RE.exec(content))) {
    if (m.index < markerEnd) continue;
    const punct = m[0].replace(/["'”’)\]]+$/, "");
    if (punct === ".") {
      const before = content.slice(start, m.index);
      const tok = (before.match(/(\S+)$/) || ["", ""])[1];
      if (isAbbrev(tok)) continue;
    }
    const end = m.index + m[0].length;
    if (content.slice(start, end).trim()) ranges.push([start, end]);
    start = end;
    while (start < content.length && /\s/.test(content[start])) start++;
  }
  if (content.slice(start).trim()) ranges.push([start, content.replace(/\s+$/, "").length]);
  return ranges;
}

function splitUnits(text) {
  const src = String(text || "");
  const units = [];
  for (const rec of lineRecords(src)) {
    if (rec.blank) continue;
    const pm = rec.text.match(POINT_RE);
    const body = pm ? rec.text.slice(pm[0].length) : rec.text;
    const push = (s, e, kind) => units.push({ id: "S" + (units.length + 1), text: src.slice(rec.start + s, rec.start + e), start: rec.start + s, end: rec.start + e, line: rec.line, para: rec.para, kind });
    if (pm ? isAllCapsHeading(body) : isHeadingText(body)) {
      push(0, rec.text.length, "heading");
      continue;
    }
    const kind = pm ? "point" : "sentence";
    for (const [s, e] of sentenceRanges(rec.text, pm ? pm[0].length : 0)) push(s, e, kind);
  }
  return units;
}

function paragraphs(text) {
  const src = String(text || "");
  const out = [];
  let cur = null;
  for (const rec of lineRecords(src)) {
    if (rec.blank) { cur = null; continue; }
    if (!cur) {
      cur = { id: "P" + (out.length + 1), start: rec.start, end: rec.end, lines: 0, headingOnly: true };
      out.push(cur);
    }
    cur.end = rec.end;
    cur.lines++;
    const pm = rec.text.match(POINT_RE);
    const body = pm ? rec.text.slice(pm[0].length) : rec.text;
    if (!(pm ? isAllCapsHeading(body) : isHeadingText(body))) cur.headingOnly = false;
  }
  return out.map(p => {
    const t = src.slice(p.start, p.end);
    return { id: p.id, text: t, start: p.start, end: p.end, words: countWords(t), lines: p.lines, headingOnly: p.headingOnly };
  });
}

function blocksForShares(text, paras) {
  if (paras.length >= 3) return paras.map(p => ({ text: p.text, words: p.words, headingOnly: p.headingOnly }));
  const lines = lineRecords(text).filter(r => !r.blank);
  if (lines.length >= 3) {
    return lines.map(r => {
      const pm = r.text.match(POINT_RE);
      const body = pm ? r.text.slice(pm[0].length) : r.text;
      return { text: r.text, words: countWords(r.text), headingOnly: pm ? isAllCapsHeading(body) : isHeadingText(body) };
    });
  }
  return null;
}

function shares(blocks) {
  if (!blocks) return { intro: null, body: null, conclusion: null, conclusionText: "" };
  const total = blocks.reduce((s, b) => s + b.words, 0);
  if (!total) return { intro: null, body: null, conclusion: null, conclusionText: "" };
  let introEnd = 1;
  while (introEnd < blocks.length - 1 && blocks[introEnd - 1].headingOnly) introEnd++;
  let conclStart = blocks.length - 1;
  if (conclStart - 1 >= introEnd && blocks[conclStart - 1].headingOnly) conclStart--;
  if (conclStart < introEnd + 1) return { intro: null, body: null, conclusion: null, conclusionText: "" };
  const words = (a, b) => blocks.slice(a, b).reduce((s, x) => s + x.words, 0);
  const intro = Math.round(words(0, introEnd) / total * 100);
  const conclusion = Math.round(words(conclStart, blocks.length) / total * 100);
  return { intro, body: 100 - intro - conclusion, conclusion, conclusionText: blocks.slice(conclStart).map(b => b.text).join("\n") };
}

function latinShare(text) {
  const letters = String(text || "").match(/\p{L}/gu) || [];
  if (!letters.length) return 1;
  const latin = letters.filter(c => /[A-Za-zÀ-ɏ]/.test(c)).length;
  return latin / letters.length;
}

function structureStats(text, opts = {}) {
  const src = String(text || "");
  const units = splitUnits(src);
  const paras = paragraphs(src);
  const words = countWords(src);
  const body = units.filter(u => u.kind !== "heading");
  const lens = body.map(u => ({ id: u.id, words: countWords(u.text) }));
  const longest = lens.reduce((best, x) => (!best || x.words > best.words ? x : best), null);
  const sh = shares(blocksForShares(src, paras));
  const firstLine = String(sh.conclusionText || "").replace(POINT_RE, "").trim();
  const limit = Number(opts.wordLimit) || 0;
  const seconds = Number(opts.seconds) || 0;
  const lines = lineRecords(src).filter(r => !r.blank);
  return {
    words,
    sentences: body.length,
    paragraphs: paras.length,
    lines: lines.length,
    headings: units.filter(u => u.kind === "heading").map(u => u.text),
    points: lines.filter(r => POINT_RE.test(r.text)).length,
    avgSentenceWords: lens.length ? round1(lens.reduce((s, x) => s + x.words, 0) / lens.length) : 0,
    longest,
    introShare: sh.intro,
    bodyShare: sh.body,
    conclusionShare: sh.conclusion,
    hasConclusion: !!firstLine && CONCLUSION_RE.test(firstLine),
    wordPercent: limit > 0 ? Math.round(words / limit * 100) : null,
    wpm: seconds > 0 ? Math.round(words / (seconds / 60)) : null,
    minutes: seconds > 0 ? round1(seconds / 60) : null
  };
}

module.exports = {
  normalizeText, countWords, splitUnits, paragraphs, structureStats, latinShare, isHeadingText, POINT_RE
};
