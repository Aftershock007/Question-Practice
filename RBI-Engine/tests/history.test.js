"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const h = require("./helpers");
const { enginePaths } = require("../src/paths");
const hist = require("../src/history");

function report(o = {}) {
  const marks = o.marks || 15;
  return {
    id: (o.q || "q1") + "-" + (o.a || "a1"),
    index: 1,
    question: { paper: o.paper || "ESI", paperKey: o.paperKey || "ESI", topic: o.topic || "Inflation", text: "Critically examine FIT.", marks, track: o.track || "A", wordLimit: 600, qhash: o.q || "q1" },
    answer: { words: o.words || 500, wordPercent: o.wordPercent === undefined ? 83 : o.wordPercent, band: o.band || "full", ahash: o.a || "a1" },
    marks: o.noMarks ? null : {
      score: o.score, percent: Math.round(o.score / marks * 1000) / 10, grade: o.grade || "C", notAttempted: !!o.notAttempted,
      params: o.params || [{ id: "P1", name: "Scope", max: 3, awarded: 1.5 }, { id: "P3", name: "Evidence", max: 4, awarded: 1 }],
      penalties: o.penalties || [{ code: "RP-1", deduction: 1.25 }]
    },
    language: { issues: new Array(o.mistakes || 2).fill({}), per100: 0.4, byType: o.byType || { agreement: 2 }, style: { score: 6 } },
    mechanical: [{ kind: "informal" }]
  };
}

function session(reports, createdAt) {
  return { createdAt, file: "/x/a.txt", reports };
}

function paths() {
  return enginePaths({ RBI_ENGINE_DATA: h.tempDir() });
}

test("the same answer recorded twice stays one entry with the newer report path", () => {
  const p = paths();
  hist.recordSession(p, session([report({ score: 6 })], "2026-11-01T10:00:00Z"), "/reports/old");
  hist.recordSession(p, session([report({ score: 6.5 })], "2026-11-02T10:00:00Z"), "/reports/new");
  const e = hist.loadHistory(p);
  assert.equal(e.length, 1);
  assert.equal(e[0].reportDir, "/reports/new");
  assert.equal(e[0].score, 6.5);
});

test("different answers to the same question are separate entries", () => {
  const p = paths();
  hist.recordSession(p, session([report({ score: 6, a: "a1" }), report({ score: 7, a: "a2" })], "2026-11-01T10:00:00Z"), "/r");
  assert.equal(hist.loadHistory(p).length, 2);
});

test("progress averages by paper and filters by paper", () => {
  const p = paths();
  hist.recordSession(p, session([report({ score: 6, a: "1" }), report({ score: 9, a: "2" }), report({ score: 20, marks: 40, paper: "English", paperKey: "English", track: "B", a: "3" })], "2026-11-01T10:00:00Z"), "/r");
  const st = hist.progressStats(hist.loadHistory(p), {});
  assert.equal(st.count, 3);
  const esi = st.byPaper.find(x => x.paper === "ESI");
  assert.equal(esi.count, 2);
  assert.equal(esi.average, 50);
  assert.equal(hist.progressStats(hist.loadHistory(p), { paper: "english" }).count, 1);
});

test("the trend is the last 10 percentages in date order", () => {
  const p = paths();
  for (let i = 1; i <= 12; i++) {
    hist.recordSession(p, session([report({ score: i, a: "a" + i })], "2026-11-" + String(i).padStart(2, "0") + "T10:00:00Z"), "/r" + i);
  }
  const st = hist.progressStats(hist.loadHistory(p), {});
  assert.equal(st.trend.length, 10);
  assert.equal(st.trend[0], Math.round(3 / 15 * 1000) / 10);
  assert.equal(st.trend[9], Math.round(12 / 15 * 1000) / 10);
  assert.equal(st.latest.score, 12);
  assert.equal(st.recent.length, 10);
  assert.deepEqual(Object.keys(st.recent[9]).sort(), ["date", "marks", "paper", "percent", "score"]);
  assert.equal(st.recent[9].score, 12);
  assert.equal(st.best.score, 12);
});

test("the weakest parameters are ranked by percent of their maximum", () => {
  const p = paths();
  hist.recordSession(p, session([report({ score: 6, a: "1" }), report({ score: 6, a: "2", params: [{ id: "P1", name: "Scope", max: 3, awarded: 3 }, { id: "P3", name: "Evidence", max: 4, awarded: 2 }] })], "2026-11-01T10:00:00Z"), "/r");
  const st = hist.progressStats(hist.loadHistory(p), {});
  assert.equal(st.weakestParams[0].name, "Evidence");
  assert.equal(st.weakestParams[0].avgPercent, 37.5);
  assert.equal(st.weakestParams[1].avgPercent, 75);
});

test("penalties, language types and word discipline are totalled", () => {
  const p = paths();
  hist.recordSession(p, session([report({ score: 6, a: "1", band: "zero", wordPercent: 60 }), report({ score: 6, a: "2", byType: { agreement: 1, spelling: 4 } })], "2026-11-01T10:00:00Z"), "/r");
  const st = hist.progressStats(hist.loadHistory(p), {});
  assert.deepEqual(st.topPenalties[0], { code: "RP-1", label: "Missing sub-part", count: 2 });
  assert.deepEqual(st.topLanguage.slice(0, 2), [{ type: "spelling", count: 4 }, { type: "agreement", count: 3 }]);
  assert.deepEqual(st.wordDiscipline, { averagePercent: 71.5, outOfBand: 1, total: 2 });
});

test("unmarked and not-attempted answers are kept but left out of the averages", () => {
  const p = paths();
  hist.recordSession(p, session([report({ score: 6, a: "1" }), report({ score: 0, a: "2", notAttempted: true }), report({ a: "3", noMarks: true })], "2026-11-01T10:00:00Z"), "/r");
  const st = hist.progressStats(hist.loadHistory(p), {});
  assert.equal(hist.loadHistory(p).length, 2);
  assert.equal(st.count, 1);
  assert.equal(st.notAttempted, 1);
});

test("a damaged history file is moved aside and a fresh history starts", () => {
  const p = paths();
  fs.mkdirSync(path.dirname(p.history), { recursive: true });
  fs.writeFileSync(p.history, "{broken");
  assert.deepEqual(hist.loadHistory(p), []);
  const moved = fs.readdirSync(path.dirname(p.history)).filter(f => /^history\.corrupt-.*\.json$/.test(f));
  assert.equal(moved.length, 1);
  assert.equal(fs.existsSync(p.history), false);
});
