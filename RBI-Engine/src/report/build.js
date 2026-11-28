"use strict";

const path = require("path");
const { marksLost } = require("../passes/synthesis");
const { defaultOutline, withWords } = require("../passes/scheme");
const { PENALTY_LABELS } = require("../rubric");
const { round1, round2, sha256, slug } = require("../util");
const pkg = require("../../package.json");

const BAND_LABELS = {
  full: "inside the full-credit band",
  half: "inside the half-credit band: word discipline capped at 50%",
  zero: "outside the allowed band: no word-discipline marks and a word-limit penalty"
};

const READINESS = {
  "ESI / FM": { borderline: 44, ready: 50, note: "strict targets: 22/50 borderline, 25/50 safe" },
  English: { borderline: 52, ready: 56, note: "strict targets: 52/100 borderline, 56/100 safe" }
};

function buildReport(result) {
  const { q, local, mechanical, scheme, marks, language, coach, coaching } = result;
  const status = Object.assign({}, result.status);
  delete status.debug;
  const st = local.stats;
  return {
    id: q.qhash + "-" + q.ahash,
    index: q.index,
    question: {
      index: q.index, paper: q.paper, paperKey: q.paperKey, topic: q.topic, marks: q.marks, wordLimit: q.wordLimit,
      track: q.track, trackLabel: q.trackLabel, text: q.question, passage: q.passage, reference: q.modelAnswer,
      date: q.date, warnings: q.warnings, qhash: q.qhash
    },
    answer: {
      text: q.answer, words: q.words, wordPercent: st.wordPercent, band: local.band, bandLabel: BAND_LABELS[local.band] || "no word band applies",
      seconds: q.seconds, minutes: st.minutes, wpm: st.wpm, idealMinutes: local.idealMinutes, ahash: q.ahash,
      units: local.units.map(u => ({ id: u.id, kind: u.kind, text: u.text }))
    },
    reading: {
      commandWords: local.commandWords,
      subparts: scheme ? scheme.subparts : [],
      outline: scheme ? scheme.outline : withWords(defaultOutline(q.track), q.wordLimit),
      outlineIsDefault: !scheme,
      dimensions: scheme ? scheme.dimensions : []
    },
    marks: marks || null,
    lost: marksLost(marks),
    language: language || null,
    mechanical: mechanical || [],
    structure: st,
    coach: coach || null,
    coaching,
    status
  };
}

function groupOf(paperKey) {
  return paperKey === "English" ? "English" : "ESI / FM";
}

function testSummary(reports) {
  const rows = reports.map(r => ({
    index: r.index,
    paper: r.question.paper,
    topic: r.question.topic,
    marks: r.question.marks,
    score: r.marks ? r.marks.score : null,
    percent: r.marks ? r.marks.percent : null,
    grade: r.marks ? r.marks.grade : "",
    words: r.answer.words,
    wordPercent: r.answer.wordPercent,
    minutes: r.answer.minutes
  }));
  const total = round2(rows.reduce((s, x) => s + (x.score || 0), 0));
  const max = round2(rows.reduce((s, x) => s + (Number(x.marks) || 0), 0));
  const groups = {};
  reports.forEach(r => {
    const g = groupOf(r.question.paperKey);
    groups[g] = groups[g] || { group: g, total: 0, max: 0 };
    groups[g].total = round2(groups[g].total + (r.marks ? r.marks.score : 0));
    groups[g].max = round2(groups[g].max + (Number(r.question.marks) || 0));
  });
  const readiness = Object.values(groups).map(g => {
    const t = READINESS[g.group];
    const percent = g.max ? round1(g.total / g.max * 100) : 0;
    const statusText = percent >= t.ready ? "MERIT-LIST READY" : percent >= t.borderline ? "BORDERLINE" : "BELOW CUTOFF";
    return { group: g.group, total: g.total, max: g.max, percent, status: statusText, note: t.note };
  });
  const pen = {};
  reports.forEach(r => (r.marks ? r.marks.penalties : []).forEach(p => {
    pen[p.code] = pen[p.code] || { code: p.code, label: PENALTY_LABELS[p.code] || p.code, count: 0, total: 0 };
    pen[p.code].count++;
    pen[p.code].total = round2(pen[p.code].total + p.deduction);
  }));
  const lang = {};
  reports.forEach(r => Object.entries((r.language && r.language.byType) || {}).forEach(([k, v]) => { lang[k] = (lang[k] || 0) + v; }));
  const ordered = rows.slice().sort((a, b) => a.index - b.index).filter(x => x.score !== null);
  const fatigue = [];
  if (ordered.length >= 2) {
    const a = ordered[0];
    const b = ordered[ordered.length - 1];
    if (a.wordPercent !== null && b.wordPercent !== null && a.wordPercent - b.wordPercent >= 15) fatigue.push("Your word count fell from " + a.wordPercent + "% of the limit in Q" + a.index + " to " + b.wordPercent + "% in Q" + b.index + ": plan your time so the last answer is not cut short.");
    if (a.percent - b.percent >= 15) fatigue.push("Your score fell from " + a.percent + "% in Q" + a.index + " to " + b.percent + "% in Q" + b.index + ": the last answer lost quality.");
  }
  return {
    total, max,
    percent: max ? round1(total / max * 100) : 0,
    rows,
    readiness,
    recurringPenalties: Object.values(pen).sort((x, y) => y.total - x.total || x.code.localeCompare(y.code)),
    recurringLanguage: Object.entries(lang).map(([type, count]) => ({ type, count })).sort((x, y) => y.count - x.count || x.type.localeCompare(y.type)),
    fatigue: ordered.length >= 2 ? (fatigue.length ? fatigue : ["No sign of fatigue: word count and quality held up from the first to the last answer."]) : []
  };
}

function buildSession(reports, meta = {}) {
  const file = meta.file || "";
  const name = meta.name || (file ? path.basename(file).replace(/\.[^.]+$/, "") : "answer");
  return {
    engine: "RBI-Engine " + pkg.version,
    createdAt: meta.createdAt || new Date().toISOString(),
    file,
    name,
    format: meta.format || "",
    reports,
    testSummary: reports.length >= 2 ? testSummary(reports) : null
  };
}

function localDate(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function reportDirName(session) {
  const hash = sha256(session.reports.map(r => r.id).join("|")).slice(0, 6);
  return localDate(session.createdAt) + "_" + slug(session.name, 40) + "_" + hash;
}

module.exports = { buildReport, buildSession, testSummary, reportDirName, localDate, BAND_LABELS };

function writeSession(session, outDir) {
  const fs = require("fs");
  const { writeAtomic } = require("../cache");
  const { renderMarkdown } = require("./markdown");
  const { renderHTML } = require("./html");
  const dir = path.join(outDir, reportDirName(session));
  fs.mkdirSync(dir, { recursive: true });
  const out = { dir, html: path.join(dir, "report.html"), md: path.join(dir, "report.md"), json: path.join(dir, "report.json") };
  writeAtomic(out.html, renderHTML(session));
  writeAtomic(out.md, renderMarkdown(session));
  writeAtomic(out.json, JSON.stringify(session, null, 2) + "\n");
  return out;
}

module.exports.writeSession = writeSession;
