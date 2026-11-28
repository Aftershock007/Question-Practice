"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const agg = require("../src/aggregate");
const scheme = require("../src/passes/scheme");
const { finalizeQuestion, fromParts } = require("../src/input");
const R = require("../src/rubric");

const ANSWER = "Inflation targeting began in 2016 and the committee sets rates. " + "word ".repeat(490).trim();

function q(over = {}) {
  return finalizeQuestion(Object.assign(fromParts({ question: "Critically examine FIT.", answer: over.answer || ANSWER, model: "m" }), { paper: "ESI", marks: 15, wordLimit: 600 }), {});
}

const SCHEME = scheme.normalize({
  subparts: [{ part: "Merits", expects: "x" }, { part: "Limits", expects: "y" }],
  points: [
    { point: "Inflation targeting began in 2016", weight: 3, subpart: 1 },
    { point: "The committee sets the policy rate", weight: 2, subpart: 1 },
    { point: "Food shocks limit monetary policy", weight: 1, subpart: 2 }
  ],
  outline: [],
  dimensions: []
}, q());

function run(o = {}) {
  const maxima = R.paramMaxima("A", 15);
  const awarded = o.awarded || [2, 2.5, 2, 1.5, 1];
  const checks = Object.keys(R.EXAMINER_CHECKS.A).map(Number).map(id => ({ id, pass: o.checks && id in o.checks ? o.checks[id] : true, evidence: "e" + id }));
  const penalties = (o.penalties || []).map(code => ({ code, trigger: code + " trigger " + Math.random().toString(36).slice(2, 6) }));
  return {
    full: !!o.full,
    params: maxima.map((p, i) => ({ id: p.id, name: p.name, max: p.max, awarded: awarded[i], cap: "", why: "why " + p.id + (o.tag || "") })),
    checks,
    anchorCount: o.anchor === undefined ? 3 : o.anchor,
    offTopic: !!o.offTopic,
    penalties,
    checklist: (o.checklist || ["full", "full", "partial"]).map((c, i) => ({ id: "K" + (i + 1), coverage: c, quote: c === "full" ? "Inflation targeting began in 2016" : "" })),
    subparts: (o.subparts || ["TEXTBOOK ONLY", "SUPERFICIAL"]).map((c, i) => ({ id: "S" + (i + 1), coverage: c, comment: "comment " + (i + 1) + (o.tag || "") })),
    final: o.final === undefined ? 7 : o.final,
    modelFinal: null,
    rules: []
  };
}

test("each parameter takes the median of the runs", () => {
  const m = agg.combineRuns([run({ awarded: [2, 2, 2, 1.5, 1] }), run({ awarded: [2.5, 3, 2, 1.5, 1] }), run({ awarded: [3, 4, 2, 1.5, 1] })], q(), SCHEME);
  assert.deepEqual(m.params.map(p => p.awarded), [2.5, 3, 2, 1.5, 1]);
});

test("a check failed by most runs fails, and its cap is applied after the median", () => {
  const runs = [run({ awarded: [2.5, 2.5, 2, 1.5, 1] }), run({ awarded: [2.5, 2.5, 2, 1.5, 1], checks: { 1: false } }), run({ awarded: [2.5, 2.5, 2, 1.5, 1], checks: { 1: false } })];
  const m = agg.combineRuns(runs, q(), SCHEME);
  const c1 = m.checks.find(c => c.id === 1);
  assert.equal(c1.pass, false);
  assert.equal(c1.split, true);
  assert.equal(m.params[0].awarded, 1.25);
});

test("a tied check vote counts as failed", () => {
  const m = agg.combineRuns([run({ checks: { 2: true } }), run({ checks: { 2: false } })], q(), SCHEME);
  assert.equal(m.checks.find(c => c.id === 2).pass, false);
});

test("checklist and sub-part verdicts follow the majority, ties go to the lower verdict", () => {
  const m = agg.combineRuns([
    run({ checklist: ["full", "full", "missing"], subparts: ["DEEP & BALANCED", "MISSED"] }),
    run({ checklist: ["partial", "missing", "missing"], subparts: ["TEXTBOOK ONLY", "SUPERFICIAL"] }),
    run({ checklist: ["partial", "full", "partial"], subparts: ["TEXTBOOK ONLY", "TEXTBOOK ONLY"] })
  ], q(), SCHEME);
  assert.deepEqual(m.checklist.map(c => c.coverage), ["partial", "full", "missing"]);
  assert.deepEqual(m.subparts.map(s => s.coverage), ["TEXTBOOK ONLY", "MISSED"]);
  assert.equal(m.checklist[1].point, "The committee sets the policy rate");
  assert.equal(m.checklist[1].weight, 2);
  assert.equal(m.coverage, 58.3);
});

test("penalty counts take the median count per code", () => {
  const m = agg.combineRuns([run({ penalties: ["RP-2"] }), run({ penalties: ["RP-2", "RP-2"] }), run({ penalties: ["RP-2", "RP-2", "RP-1"] })], q(), SCHEME);
  assert.deepEqual(m.penalties.map(p => [p.code, p.deduction]), [["RP-2", 0.25], ["RP-2", 0.25]]);
  assert.notEqual(m.penalties[0].trigger, m.penalties[1].trigger);
});

test("the table adds up to the final mark", () => {
  const m = agg.combineRuns([run({ penalties: ["RP-1"] }), run({ penalties: ["RP-1"] }), run()], q(), SCHEME);
  assert.equal(m.rawSum, 9);
  assert.equal(m.penaltySum, 1.25);
  assert.equal(m.score, m.rawSum - m.penaltySum);
  assert.equal(m.score, 7.75);
  assert.equal(m.grade, "B");
  assert.deepEqual(m.projection, [9.75, 10.75]);
  assert.equal(m.ceilingApplied, false);
});

test("a high raw sum is capped at the rubric ceiling", () => {
  const m = agg.combineRuns([run({ awarded: [3, 4, 4, 2.5, 1.5] })], q(), SCHEME);
  assert.equal(m.rawSum, 15);
  assert.equal(m.score, 9.5);
  assert.equal(m.ceilingApplied, true);
});

test("the consistency record shows the runs, spread and method", () => {
  const m = agg.combineRuns([run({ full: true, final: 6 }), run({ final: 7 }), run({ final: 7.5 })], q(), SCHEME);
  assert.deepEqual(m.consistency.runs, [6, 7, 7.5]);
  assert.equal(m.consistency.spread, 1.5);
  assert.equal(m.consistency.method, "median of 3 independent gradings");
  const one = agg.combineRuns([run({ full: true })], q(), SCHEME);
  assert.equal(one.consistency.method, "one full grading");
  assert.equal(one.consistency.spread, 0);
});

test("feedback comes from the full run closest to the median", () => {
  const runs = [run({ full: true, final: 9, tag: "-a" }), run({ final: 7.5 }), run({ full: true, final: 7.25, tag: "-b" })];
  const m = agg.combineRuns(runs, q(), SCHEME);
  assert.equal(m.consistency.base, 2);
  assert.equal(m.params[0].why, "why P1-b");
  assert.equal(m.subparts[0].comment, "comment 1-b");
});

test("the source count for P3 takes the median", () => {
  assert.equal(agg.combineRuns([run({ anchor: 0 }), run({ anchor: 2 }), run({ anchor: 3 })], q(), SCHEME).params[2].awarded, 2);
  assert.equal(agg.combineRuns([run({ anchor: 0 }), run({ anchor: 0 }), run({ anchor: 3 })], q(), SCHEME).params[2].awarded, 0.75);
});

test("a majority off-topic verdict gives zero", () => {
  const m = agg.combineRuns([run({ offTopic: true }), run({ offTopic: true }), run()], q(), SCHEME);
  assert.equal(m.offTopic, true);
  assert.equal(m.score, 0);
});

test("needsMoreRuns fires when runs differ by more than 12% of the maximum", () => {
  assert.equal(agg.needsMoreRuns([run({ final: 2 }), run({ final: 6 }), run({ final: 9 })], 15), true);
  assert.equal(agg.needsMoreRuns([run({ final: 6 }), run({ final: 6.5 }), run({ final: 7.75 })], 15), false);
});

test("lexicalCoverage measures how much of the checklist wording appears", () => {
  assert.equal(agg.lexicalCoverage(SCHEME.points, "Inflation targeting began in 2016. The committee sets the policy rate. Food shocks limit monetary policy."), 1);
  assert.equal(agg.lexicalCoverage(SCHEME.points, "Something else entirely."), 0);
});

test("crossCheckReason explains when one grading looks unreliable", () => {
  const onTopic = q({ answer: "Inflation targeting began in 2016 and the committee sets the policy rate while food shocks limit monetary policy. " + "more words here ".repeat(60) });
  assert.match(agg.crossCheckReason(run({ final: 0 }), SCHEME, onTopic), /zero for a full, on-topic answer/);
  const offWords = q({ answer: "Completely unrelated text about cricket and films. ".repeat(10) });
  assert.match(agg.crossCheckReason(run({ checklist: ["full", "full", "full"] }), SCHEME, offWords), /does not match/);
  assert.equal(agg.crossCheckReason(run({ final: 6, checklist: ["full", "full", "full"] }), SCHEME, onTopic), "");
});
