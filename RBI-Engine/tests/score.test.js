"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const score = require("../src/passes/score");
const scheme = require("../src/passes/scheme");
const { finalizeQuestion, fromParts } = require("../src/input");
const { AIError } = require("../src/ai");

const ANSWER = "INTRODUCTION\nIndia adopted flexible inflation targeting in 2016 after the Urjit Patel committee. " +
  "The MPC has six members and sets the repo rate. " + "Food prices drive CPI inflation in India. ".repeat(40) +
  "\nWAY FORWARD\nImprove supply chains and transmission.";

function q(over = {}) {
  return finalizeQuestion(Object.assign(fromParts({ question: "Critically examine FIT. Suggest measures.", answer: ANSWER, model: "FIT began in 2016." }), { paper: "ESI", marks: 15, wordLimit: 600 }, over), {});
}

const SCHEME = scheme.normalize({
  subparts: [{ part: "Critical examination", expects: "Merits and limits" }, { part: "Measures", expects: "Specific steps" }],
  points: [
    { point: "FIT adopted in 2016 on the Urjit Patel committee's advice", weight: 3, subpart: 1 },
    { point: "Six-member MPC sets the repo rate", weight: 2, subpart: 1 },
    { point: "Supply-side measures for food inflation", weight: 2, subpart: 2 }
  ],
  outline: [],
  dimensions: []
}, q());

function reply(over = {}) {
  return Object.assign({
    checklist: [
      { id: "K1", coverage: "full", quote: "India adopted flexible inflation targeting in 2016 after the Urjit Patel committee" },
      { id: "K2", coverage: "full", quote: "The MPC has six members and sets the repo rate" },
      { id: "K3", coverage: "full", quote: "" }
    ],
    subparts: [{ id: "S1", coverage: "TEXTBOOK ONLY", comment: "You listed features only." }, { id: "S2", coverage: "superficial", comment: "Vague." }],
    examiner_checks: [{ id: "1", result: "YES", evidence: "both parts" }, { id: "2", result: "YES", evidence: "x" }],
    anchor_count: 2,
    off_topic: false,
    anchors_used: ["Urjit Patel Committee"],
    bare_name_drops: [],
    missing_anchors: ["RBI Monetary Policy Report", "a", "b", "c", "d"],
    verify_flags: [],
    factual_errors: [
      { quote: "The MPC has six members", problem: "fine", correct_fact: "fine" },
      { quote: "The MPC was abolished in 2019", problem: "invented", correct_fact: "x" }
    ],
    concept_gaps: ["Transmission lags"],
    error_log: [
      { quote: "Food prices drive CPI inflation in India", code: "rp 2", problem: "generic", correction: "Name the CPI food weight" },
      { quote: "Banks hate inflation", code: "RP-6", problem: "not in the script", correction: "x" }
    ],
    caps_triggered: ["None"],
    parameters: [
      { id: "P1", cap_applied: "", awarded: 2, justification: "Both parts addressed." },
      { id: "P2", cap_applied: "", awarded: 2.5, justification: "Mechanisms named." },
      { id: "P3", cap_applied: "", awarded: 2, justification: "Two sources." },
      { id: "P4", cap_applied: "", awarded: 1.5, justification: "Headings used." },
      { id: "P5", cap_applied: "", awarded: 1, justification: "Sober register." }
    ],
    penalties: [{ code: "RP-2", trigger: "Food prices drive CPI inflation" }],
    stage1_raw_sum: 9, total_penalties: 0.25, final_score: 8.75,
    merit_check: "Borderline.", pacing_audit: "On pace."
  }, over);
}

test("the scoring prompt fixes the track, maxima, penalty values, word count, sub-parts and checklist", () => {
  const p = score.build(q(), null, SCHEME, { full: true });
  assert.match(p.system, /grade RBI Grade B Phase-2 descriptive answers/);
  assert.match(p.prompt, /Track: A \(ESI \/ Finance & Management answer\)/);
  assert.match(p.prompt, /P1 = 3, P2 = 4, P3 = 4, P4 = 2\.5, P5 = 1\.5/);
  assert.match(p.prompt, /RP-1 = 1\.25 \(at most 4\)/);
  assert.match(p.prompt, new RegExp("Word count measured by the engine: " + q().words + " of 600"));
  assert.match(p.prompt, /critically examine, suggest measures/);
  for (const id of ["K1", "K2", "K3", "S1", "S2"]) assert.ok(p.prompt.includes(id + " "), id);
  assert.ok(p.prompt.includes(ANSWER));
  assert.doesNotMatch(p.prompt, /\{\{[A-Z_]+\}\}/);
  assert.match(p.prompt, /Examination Date\s+: Not recorded/);
  assert.match(p.prompt, /"merit_check"/);
});

test("the score-only prompt asks for marks only", () => {
  const p = score.build(q(), null, SCHEME, { full: false });
  assert.match(p.prompt, /SCORE-ONLY CROSS-CHECK/);
  assert.doesNotMatch(p.prompt, /"merit_check"/);
  assert.equal("merit_check" in p.schema.properties, false);
});

test("normalize maps parameters by id and gives the enforced final mark", () => {
  const run = score.normalize(reply(), q(), null, SCHEME, { full: true });
  assert.deepEqual(run.params.map(p => p.awarded), [2, 2.5, 2, 1.5, 0]);
  assert.equal(run.params[0].name, "Directive compliance & scope");
  assert.equal(run.params[0].why, "Both parts addressed.");
  assert.equal(run.final, 8 - 0.25 - 0.75);
  assert.equal(run.modelFinal, 8.75);
  assert.equal(run.full, true);
});

test("parameters can be matched by a P-number name or by order", () => {
  const byName = reply({ parameters: reply().parameters.map((p, i) => ({ name: "P" + (i + 1) + " Something", awarded: p.awarded, justification: "" })) });
  assert.deepEqual(score.normalize(byName, q(), null, SCHEME, { full: true }).params.map(p => p.awarded), [2, 2.5, 2, 1.5, 0]);
  const byOrder = reply({ parameters: reply().parameters.map(p => ({ awarded: p.awarded })) });
  assert.deepEqual(score.normalize(byOrder, q(), null, SCHEME, { full: true }).params.map(p => p.awarded), [2, 2.5, 2, 1.5, 0]);
});

test("a missing parameter is a format error", () => {
  const bad = reply({ parameters: reply().parameters.slice(0, 4) });
  assert.throws(() => score.normalize(bad, q(), null, SCHEME, { full: true }), err => err instanceof AIError && err.kind === "format");
});

test("awarded marks are clamped to the maximum and snapped to quarter marks", () => {
  const r = reply({ parameters: reply().parameters.map((p, i) => Object.assign({}, p, { awarded: i === 0 ? 3.6 : i === 1 ? 1.13 : p.awarded })) });
  const run = score.normalize(r, q({ words: undefined }), null, SCHEME, { full: true });
  assert.equal(run.params[0].awarded, 3);
  assert.equal(run.params[1].awarded, 1.25);
});

test("a full checklist verdict needs a quote that is really in the answer", () => {
  const run = score.normalize(reply(), q(), null, SCHEME, { full: true });
  assert.deepEqual(run.checklist.map(c => c.coverage), ["full", "full", "partial"]);
  assert.deepEqual(run.subparts.map(s => s.coverage), ["TEXTBOOK ONLY", "SUPERFICIAL"]);
});

test("factual errors and error-log items that quote words not in the answer are dropped", () => {
  const run = score.normalize(reply(), q(), null, SCHEME, { full: true });
  assert.deepEqual(run.factualErrors.map(f => f.quote), ["The MPC has six members"]);
  assert.deepEqual(run.errorLog.map(e => [e.code, e.quote]), [["RP-2", "Food prices drive CPI inflation in India"]]);
  assert.deepEqual(run.caps, []);
  assert.equal(run.missingAnchors.length, 5);
});

test("a failed examiner check lowers the run's final mark", () => {
  const r = reply({ examiner_checks: [{ id: "1", result: "NO", evidence: "measures missing" }] });
  const run = score.normalize(r, q(), null, SCHEME, { full: true });
  assert.equal(run.params[0].awarded, 1.25);
  assert.equal(run.checks[0].pass, false);
  assert.equal(run.final, 7.25 - 0.25 - 0.75);
});

test("a score-only run keeps marks but no feedback lists", () => {
  const run = score.normalize(reply(), q(), null, SCHEME, { full: false });
  assert.equal(run.full, false);
  assert.equal(run.errorLog, undefined);
  assert.equal(run.params.length, 5);
});

test("off-topic replies give zero", () => {
  const run = score.normalize(reply({ off_topic: true }), q(), null, SCHEME, { full: false });
  assert.equal(run.offTopic, true);
  assert.equal(run.final, 0);
});
