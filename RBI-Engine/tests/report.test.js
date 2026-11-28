"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const h = require("./helpers");
const { finalizeQuestion, fromParts } = require("../src/input");
const { mergeSettings } = require("../src/config");
const { createCache, createSchemeStore, createLimiter } = require("../src/cache");
const { analyseQuestion } = require("../src/pipeline");
const { buildReport, buildSession, reportDirName, testSummary } = require("../src/report/build");
const { renderMarkdown } = require("../src/report/markdown");

const ANSWER = "INTRODUCTION\nIndia adopted inflation targeting in 2016 and the committee sets the repo rate.\n\nMERITS AND LIMITS\n" +
  "Food supply shocks limit monetary policy in India because food has a large weight. ".repeat(34).trim() +
  "\nA table row | with a pipe.\n\nWAY FORWARD\nImprove supply chains and transmission.";

function question(answer = ANSWER, over = {}) {
  return finalizeQuestion(Object.assign(fromParts({ question: "Critically examine inflation targeting. Suggest measures.", answer, model: "FIT began in 2016." }), { paper: "ESI", marks: 15, wordLimit: 600, seconds: 1440, index: over.index || 1 }, over), {});
}

async function result(q, gen) {
  const dir = h.tempDir();
  return analyseQuestion(q, {
    settings: mergeSettings({}), keys: { gemini: "k" }, env: {},
    cache: createCache(path.join(dir, "c")), schemes: createSchemeStore(path.join(dir, "s")), limiter: createLimiter(3),
    generate: gen || h.fakeGenerate()
  });
}

test("the Markdown report has every section in order", async () => {
  const report = buildReport(await result(question()));
  const md = renderMarkdown(buildSession([report], { file: "/x/sample-esi.txt", createdAt: "2026-11-28T10:00:00.000Z" }));
  const order = ["### Verdict", "### Summary and priorities", "### Your answer, marked", "### Why you lost", "### Reading the question", "### Marks breakdown", "### Content", "### Language", "### Structure and framing", "### Model answer", "### Improvement plan", "### Technical details"];
  const lines = md.split("\n");
  let pos = -1;
  for (const s of order) {
    const at = lines.findIndex(l => l === s || l.startsWith(s + " "));
    assert.ok(at > pos, s + " missing or out of order");
    pos = at;
  }
  assert.match(md, /^# RBI-Engine report: sample-esi/m);
});

test("the parameter table total equals the raw sum and the arithmetic line adds up", async () => {
  const report = buildReport(await result(question()));
  const md = renderMarkdown(buildSession([report], {}));
  assert.ok(md.includes("| **Raw sum** | 15 | **" + report.marks.rawSum + "** |"), "raw sum row");
  assert.ok(md.includes(report.marks.rawSum + " - " + report.marks.penaltySum + " = " + report.marks.score + " / 15"), "arithmetic line");
});

test("table cells escape pipes and line breaks", async () => {
  const report = buildReport(await result(question()));
  report.marked.marks.find(m => m.kind === "lang").wrong = "a | b\nc";
  const md = renderMarkdown(buildSession([report], {}));
  assert.ok(md.includes("a \\| b c"));
});

test("the marked answer in Markdown uses the text notation with ids and a legend", async () => {
  const report = buildReport(await result(question()));
  const md = renderMarkdown(buildSession([report], {}));
  const i = report.language.issues[0];
  assert.ok(md.includes("[-" + i.wrong + "-]{+" + i.fix + "+}(L1)"));
  assert.ok(md.includes("[[B1: "));
  assert.ok(md.includes("{{A1 Add: "));
  assert.ok(md.includes("[-wrong-]{+right+}(L1)   language mistake, then the correction"));
  assert.ok(md.includes("| L1 | " + i.wrong + " | " + i.fix + " |"));
});

test("the report carries placed marks and a ledger that adds up to the marks lost", async () => {
  const gen = h.fakeGenerate({ penalties: quote => [{ code: "RP-2", trigger: "Generic opening", quote }] });
  const report = buildReport(await result(question(), gen));
  const kinds = new Set(report.marked.marks.map(m => m.kind));
  for (const k of ["lang", "frame", "add", "cut"]) assert.ok(kinds.has(k), k);
  assert.equal(report.marked.counts.lang, report.language.issues.length);
  assert.equal(report.marked.marks.find(m => m.kind === "frame").fix, "An upgraded sentence.");
  assert.equal(report.ledger.total, Math.round((15 - report.marks.score) * 100) / 100);
  const pen = report.ledger.rows.find(r => r.kind === "penalty");
  assert.equal(pen.title, "Platitude / fluff (RP-2)");
  assert.equal(report.marked.marks.find(m => m.kind === "cut").ref, "q1-" + pen.ref);
  const params = report.ledger.rows.filter(r => r.kind === "param");
  assert.ok(params.length > 0 && params.every(r => r.reasons.some(x => /^Reason P\d lost marks\.$/.test(x))));
  const md = renderMarkdown(buildSession([report], {}));
  assert.ok(md.includes("| What cost you marks | Lost | Why | How to earn them next time |"));
  assert.ok(md.includes("**Total lost: " + report.ledger.total + "** (15 - " + report.ledger.total + " = " + report.marks.score + " / 15)"));
});

test("a not-attempted question renders without AI sections failing", async () => {
  const report = buildReport(await result(question("")));
  const md = renderMarkdown(buildSession([report], {}));
  assert.match(md, /0 \/ 15/);
  assert.match(md, /did not write anything/);
  assert.match(md, /Not available for this answer/);
});

test("the test summary adds up the questions and judges readiness on the strict targets", async () => {
  const r1 = buildReport(await result(question(ANSWER, { index: 1 })));
  const r2 = buildReport(await result(question(ANSWER + "\nMore.", { index: 2, marks: 10, wordLimit: 400 })));
  const s = testSummary([r1, r2]);
  assert.equal(s.total, r1.marks.score + r2.marks.score);
  assert.equal(s.max, 25);
  assert.equal(s.rows.length, 2);
  const fake = (score, marks, paper) => ({ index: 1, question: { paper, paperKey: paper === "English" ? "English" : "ESI", marks, topic: "" }, answer: { words: 1, wordPercent: 90, minutes: 1 }, marks: { score, percent: score / marks * 100, grade: "C", penalties: [] }, language: null });
  assert.equal(testSummary([fake(25, 50, "ESI")]).readiness[0].status, "MERIT-LIST READY");
  assert.equal(testSummary([fake(22, 50, "ESI")]).readiness[0].status, "BORDERLINE");
  assert.equal(testSummary([fake(21, 50, "ESI")]).readiness[0].status, "BELOW CUTOFF");
  assert.equal(testSummary([fake(52, 100, "English")]).readiness[0].status, "BORDERLINE");
});

test("a two-question session gets a test summary section in Markdown", async () => {
  const r1 = buildReport(await result(question(ANSWER, { index: 1 })));
  const r2 = buildReport(await result(question(ANSWER + "\nMore.", { index: 2 })));
  const md = renderMarkdown(buildSession([r1, r2], {}));
  assert.match(md, /## Test summary/);
  assert.match(md, /## Q2\./);
});

test("the report folder name has the date, file name and a short hash", async () => {
  const report = buildReport(await result(question()));
  const name = reportDirName(buildSession([report], { file: "/a/Practice_2026-11-28_FullTest.txt", createdAt: "2026-11-28T10:00:00.000Z" }));
  assert.match(name, /^\d{4}-\d{2}-\d{2}_practice-2026-11-28-fulltest_[0-9a-f]{6}$/);
});

test("the report keeps no debug prompts", async () => {
  const dir = h.tempDir();
  const r = await analyseQuestion(question(), {
    settings: mergeSettings({}), keys: { gemini: "k" }, env: {}, debug: true,
    cache: createCache(path.join(dir, "c")), schemes: createSchemeStore(path.join(dir, "s")), limiter: createLimiter(3), generate: h.fakeGenerate()
  });
  assert.ok(r.status.debug.length > 0);
  assert.equal(buildReport(r).status.debug, undefined);
});

test("the gates in force list every capped parameter, the engine's changes and the AI's own totals", () => {
  const V = require("../src/report/view");
  const r = {
    question: { marks: 15 },
    marks: {
      params: [{ id: "P1", name: "Scope", max: 3, awarded: 1.25, cap: "45% - check failed: every sub-part answered" }, { id: "P5", name: "Register", max: 1.5, awarded: 0, cap: "0% - word count 400 of 600 (67%)" }, { id: "P2", name: "Mechanisms", max: 4, awarded: 2, cap: "" }],
      rules: ["Under 60 words: the rubric gives 0 marks."],
      consistency: { runs: [6, 6.5, 7], modelFinals: [6.75, 7.5, 7] }
    }
  };
  const lines = V.rulesInForce(r);
  assert.deepEqual(lines.slice(0, 3), [
    "P1 Scope: capped at 45% - check failed: every sub-part answered.",
    "P5 Register: capped at 0% - word count 400 of 600 (67%).",
    "Under 60 words: the rubric gives 0 marks."
  ]);
  assert.match(lines[3], /The AI's own totals were 6\.75, 7\.5, 7; the engine recomputed them/);
});

test("a priority's reason ends with a full stop before the advice", async () => {
  const report = buildReport(await result(question()));
  report.coaching.priorities = [{ title: "Add sources", why: "Cost you marks", how: "Cite two reports" }];
  assert.ok(renderMarkdown(buildSession([report], {})).includes("**Add sources** - Cost you marks. How: Cite two reports"));
});

test("ledger rows explain caps with the failed check's evidence and list missed key points by weight", () => {
  const { ledgerFor } = require("../src/report/marked");
  const marks = {
    score: 5, rawSum: 5.5, penaltySum: 0.5, ceiling: 9.5, autoFail: false, offTopic: false,
    params: [
      { id: "P1", name: "Directive compliance & scope", max: 3, awarded: 1.25, cap: "45% - check failed: every sub-part answered", lost: [], why: "Only part one." },
      { id: "P2", name: "Conceptual clarity & mechanisms", max: 4, awarded: 2, cap: "", lost: ["No transmission chain."], why: "x" },
      { id: "P3", name: "Evidence: reports, committees, data", max: 4, awarded: 1, cap: "", lost: [], why: "" },
      { id: "P4", name: "Structure & presentation", max: 2.5, awarded: 1, cap: "", lost: [], why: "" },
      { id: "P5", name: "Register & word discipline", max: 1.5, awarded: 0.25, cap: "", lost: [], why: "" }
    ],
    checks: [{ id: 1, label: "Every sub-part answered", pass: false, evidence: "Measures are missing." }, { id: 4, label: "Domain terms and cause-effect mechanics", pass: true, evidence: "ok" }],
    penalties: [{ code: "RP-2", label: "Platitude / fluff", trigger: "slogan", quote: "", deduction: 0.25 }, { code: "RP-8", label: "Language / register", trigger: "slang", quote: "", deduction: 0.25 }],
    checklist: [{ id: "K1", point: "a", weight: 1, coverage: "partial" }, { id: "K2", point: "b", weight: 3, coverage: "missing" }, { id: "K3", point: "c", weight: 2, coverage: "full" }]
  };
  const l = ledgerFor({ marks: 15, track: "A" }, marks);
  assert.deepEqual(l.rows[0].reasons, ["Capped at 45%: check failed: every sub-part answered.", "Every sub-part answered: Measures are missing.", "Only part one."]);
  assert.deepEqual(l.rows[1].reasons, ["No transmission chain."]);
  assert.deepEqual(l.missed.map(k => k.id), ["K2", "K1"]);
  assert.equal(l.total, 10);
});
