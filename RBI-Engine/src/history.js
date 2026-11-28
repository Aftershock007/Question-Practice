"use strict";

const fs = require("fs");
const { writeAtomic } = require("./cache");
const { PENALTY_LABELS } = require("./rubric");
const { round1 } = require("./util");

function loadHistory(paths) {
  let raw;
  try {
    raw = fs.readFileSync(paths.history, "utf8");
  } catch (_) {
    return [];
  }
  try {
    const o = JSON.parse(raw);
    const list = Array.isArray(o) ? o : (o && Array.isArray(o.entries) ? o.entries : null);
    if (!list) throw new Error("unexpected shape");
    return list.filter(e => e && typeof e === "object" && e.key);
  } catch (_) {
    const moved = paths.history.replace(/history\.json$/, "history.corrupt-" + Date.now() + ".json");
    try { fs.renameSync(paths.history, moved); } catch (_) {}
    return [];
  }
}

function saveHistory(paths, entries) {
  writeAtomic(paths.history, JSON.stringify({ version: 1, entries }, null, 2) + "\n");
}

function entryFor(r, session, dir) {
  const counts = {};
  (r.marks.penalties || []).forEach(p => { counts[p.code] = (counts[p.code] || 0) + 1; });
  return {
    key: r.question.qhash + "-" + r.answer.ahash,
    date: session.createdAt,
    file: session.file || "",
    reportDir: dir || "",
    index: r.index,
    paper: r.question.paper,
    paperKey: r.question.paperKey,
    topic: r.question.topic || "",
    question: String(r.question.text || "").slice(0, 160),
    track: r.question.track,
    marks: r.question.marks,
    score: r.marks.score,
    percent: r.marks.percent,
    grade: r.marks.grade,
    notAttempted: !!r.marks.notAttempted,
    words: r.answer.words,
    wordLimit: r.question.wordLimit,
    wordPercent: r.answer.wordPercent,
    band: r.answer.band || null,
    params: (r.marks.params || []).map(p => ({ id: p.id, name: p.name, max: p.max, awarded: p.awarded })),
    penalties: counts,
    language: r.language ? { total: r.language.issues.length, per100: r.language.per100, byType: r.language.byType } : null,
    styleScore: r.language && r.language.style ? r.language.style.score : null,
    engineChecks: (r.mechanical || []).length
  };
}

function recordSession(paths, session, dir) {
  const entries = loadHistory(paths);
  for (const r of session.reports) {
    if (!r.marks) continue;
    const e = entryFor(r, session, dir);
    const i = entries.findIndex(x => x.key === e.key);
    if (i >= 0) entries[i] = e; else entries.push(e);
  }
  saveHistory(paths, entries);
  return entries;
}

function mean(list) {
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}

function byDate(a, b) {
  return String(a.date).localeCompare(String(b.date));
}

function progressStats(entries, opts = {}) {
  const want = String(opts.paper || "").trim().toLowerCase();
  const list = (entries || []).filter(e => !want || String(e.paperKey || "").toLowerCase() === want || String(e.paper || "").toLowerCase().includes(want));
  const scored = list.filter(e => !e.notAttempted).sort(byDate);
  const papers = {};
  scored.forEach(e => { (papers[e.paperKey] = papers[e.paperKey] || []).push(e.percent); });
  const params = {};
  scored.forEach(e => (e.params || []).forEach(p => {
    if (!(p.max > 0)) return;
    const key = e.track + "|" + p.id + "|" + p.name;
    (params[key] = params[key] || { name: p.name, id: p.id, track: e.track, values: [] }).values.push(p.awarded / p.max * 100);
  }));
  const pen = {};
  scored.forEach(e => Object.entries(e.penalties || {}).forEach(([code, n]) => { pen[code] = (pen[code] || 0) + n; }));
  const lang = {};
  scored.forEach(e => Object.entries((e.language && e.language.byType) || {}).forEach(([t, n]) => { lang[t] = (lang[t] || 0) + n; }));
  const withWords = scored.filter(e => typeof e.wordPercent === "number");
  const best = scored.reduce((b, e) => (!b || e.percent >= b.percent ? e : b), null);
  return {
    count: scored.length,
    notAttempted: list.length - scored.length,
    average: scored.length ? round1(mean(scored.map(e => e.percent))) : null,
    byPaper: Object.entries(papers).map(([paper, xs]) => ({ paper, count: xs.length, average: round1(mean(xs)) })).sort((a, b) => b.count - a.count || a.paper.localeCompare(b.paper)),
    trend: scored.slice(-10).map(e => e.percent),
    recent: scored.slice(-10).map(e => ({ date: e.date, paper: e.paper, score: e.score, marks: e.marks, percent: e.percent })),
    weakestParams: Object.values(params).map(p => ({ name: p.name, id: p.id, track: p.track, avgPercent: round1(mean(p.values)), count: p.values.length })).sort((a, b) => a.avgPercent - b.avgPercent || a.name.localeCompare(b.name)),
    topPenalties: Object.entries(pen).map(([code, count]) => ({ code, label: PENALTY_LABELS[code] || code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    topLanguage: Object.entries(lang).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    wordDiscipline: { averagePercent: withWords.length ? round1(mean(withWords.map(e => e.wordPercent))) : null, outOfBand: scored.filter(e => e.band === "zero").length, total: withWords.length },
    latest: scored.length ? scored[scored.length - 1] : null,
    best
  };
}

module.exports = { loadHistory, saveHistory, recordSession, progressStats, entryFor };
