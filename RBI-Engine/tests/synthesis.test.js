"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const syn = require("../src/passes/synthesis");
const { AIError } = require("../src/ai");

const Q = { question: "Critically examine FIT.", paper: "ESI", track: "A", trackLabel: "ESI / Finance & Management answer", marks: 15, wordLimit: 600, words: 400, seconds: 1440 };

const MARKS = {
  params: [
    { id: "P1", name: "Directive compliance & scope", max: 3, awarded: 2 },
    { id: "P2", name: "Conceptual clarity & mechanisms", max: 4, awarded: 2.5 },
    { id: "P3", name: "Evidence: reports, committees, data", max: 4, awarded: 1 },
    { id: "P4", name: "Structure & presentation", max: 2.5, awarded: 2.5 },
    { id: "P5", name: "Register & word discipline", max: 1.5, awarded: 0 }
  ],
  penalties: [{ code: "RP-1", label: "Missing sub-part", deduction: 1.25 }, { code: "RP-2", label: "Platitude / fluff", deduction: 0.25 }, { code: "RP-2", label: "Platitude / fluff", deduction: 0.25 }],
  checks: [{ id: 1, label: "Every sub-part answered", pass: false }, { id: 2, label: "Command word obeyed", pass: true }],
  checklist: [{ point: "FIT adopted in 2016", weight: 3, coverage: "full" }, { point: "MPC structure", weight: 2, coverage: "partial" }],
  subparts: [{ part: "Merits", coverage: "TEXTBOOK ONLY" }],
  score: 6.25, percent: 41.7, grade: "C", gradeLabel: "Borderline / cutoff zone", projection: [8.25, 9.25],
  rules: [], content: { conceptGaps: ["Transmission"], factualErrors: [], missingAnchors: ["MPR"] }
};

test("marksLost lists parameters and penalty codes by marks lost, largest first", () => {
  assert.deepEqual(syn.marksLost(MARKS).map(l => [l.id, l.lost]), [["P3", 3], ["P2", 1.5], ["P5", 1.5], ["RP-1", 1.25], ["P1", 1], ["RP-2", 0.5]]);
  assert.equal(syn.marksLost(MARKS)[0].what, "Evidence: reports, committees, data");
  assert.equal(syn.marksLost(MARKS)[3].what, "Missing sub-part (RP-1)");
});

test("the fallback summary names the score, grade and the two largest losses", () => {
  const c = syn.fallbackCoaching(Q, MARKS, null, null);
  assert.equal(c.fallback, true);
  assert.match(c.summary, /6\.25 \/ 15/);
  assert.match(c.summary, /grade C/);
  assert.match(c.summary, /evidence: reports, committees, data \(3\)/);
  assert.match(c.summary, /conceptual clarity & mechanisms \(1\.5\)/);
  assert.equal(c.priorities.length, 3);
  assert.match(c.priorities[0].how, /reports, committees, schemes or data/);
});

test("the fallback without marks still says something useful", () => {
  assert.match(syn.fallbackCoaching(Q, null, null, null).summary, /could not be computed/);
});

test("normalize keeps at most 5 priorities and 8 plan steps and strips rubric codes", () => {
  const out = syn.normalize({
    summary: "You lost marks on P3 (RP-3) and Track A structure. RP-1 cost you most.",
    strengths: ["Clear headings"],
    priorities: Array.from({ length: 7 }, (_, i) => ({ title: "Fix " + i, why: "w", how: "h" })),
    drills: ["a", "b", "c", "d"],
    plan: Array.from({ length: 10 }, (_, i) => "Step " + i)
  });
  assert.equal(out.priorities.length, 5);
  assert.equal(out.plan.length, 8);
  assert.equal(out.drills.length, 3);
  assert.doesNotMatch(out.summary, /RP-|\bP3\b|Track A/);
  assert.equal(out.fallback, false);
});

test("an empty summary is a format error", () => {
  assert.throws(() => syn.normalize({ summary: "", priorities: [] }), err => err instanceof AIError && err.kind === "format");
});

test("the digest carries the marks, failed checks, missing points and language counts", () => {
  const language = { issues: [{ wrong: "India have", fix: "India has", severity: "major", type: "agreement" }], per100: 0.3, byType: { agreement: 1 }, style: { verdict: "Not yet", score: 4 } };
  const coachOut = { framing: "Half framed.", outlineMatch: [{ section: "WAY FORWARD", status: "missing" }, { section: "INTRO", status: "covered" }] };
  const d = syn.digestFor(Q, { stats: { introShare: 10, conclusionShare: 5, hasConclusion: false } }, MARKS, language, coachOut, [{ kind: "informal" }, { kind: "informal" }]);
  assert.equal(d.score, 6.25);
  assert.deepEqual(d.failedChecks, ["Every sub-part answered"]);
  assert.deepEqual(d.notFullyCovered.map(p => p.point), ["MPC structure"]);
  assert.equal(d.language.total, 1);
  assert.deepEqual(d.language.examples, ["India have -> India has"]);
  assert.deepEqual(d.mechanical, { informal: 2 });
  assert.deepEqual(d.structure.weakSections, ["WAY FORWARD (missing)"]);
  const p = syn.build(d);
  assert.match(p.prompt, /do not mention rubric codes/i);
  assert.ok(p.prompt.includes("\"score\": 6.25"));
});
