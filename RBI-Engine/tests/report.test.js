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
  const order = ["### Verdict", "### Summary and priorities", "### Reading the question", "### Marks breakdown", "### Content", "### Language", "### Structure and framing", "### Model answer", "### Improvement plan", "### Technical details"];
  let pos = -1;
  for (const s of order) {
    const at = md.indexOf(s);
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
  report.language.issues[0].wrong = "a | b\nc";
  const md = renderMarkdown(buildSession([report], {}));
  assert.ok(md.includes("a \\| b c"));
});

test("the corrected answer marks deletions and insertions in plain text", async () => {
  const report = buildReport(await result(question()));
  const md = renderMarkdown(buildSession([report], {}));
  const i = report.language.issues[0];
  assert.ok(md.includes("[-" + i.wrong + "-]{+" + i.fix + "+}"));
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
