"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const r = require("../src/rubric");

function params(track, marks, awarded) {
  return r.paramMaxima(track, marks).map((p, i) => Object.assign({}, p, { awarded: awarded[i] }));
}

function enforce(over) {
  return r.enforceRubric(Object.assign({
    track: "A", marks: 15, wordLimit: 600, words: 520,
    params: params("A", 15, [2, 2, 2, 1.5, 1]),
    checks: [], anchorCount: 3, penalties: [], offTopic: false
  }, over));
}

test("ESI and FM questions always use Track A", () => {
  assert.equal(r.detectTrack({ paper: "ESI", question: "Write an essay-type answer on inflation." }), "A");
  assert.equal(r.detectTrack({ paper: "F&M", question: "Discuss Maslow." }), "A");
});

test("English questions route to precis, comprehension or essay", () => {
  assert.equal(r.detectTrack({ paper: "English", question: "Write a precis of the passage below." }), "C");
  assert.equal(r.detectTrack({ paper: "English", question: "Write a précis of the following passage." }), "C");
  assert.equal(r.detectTrack({ paper: "English", question: "Read the passage and answer the questions that follow." }), "D");
  assert.equal(r.detectTrack({ paper: "English", question: "Digital payments and financial inclusion." }), "B");
});

test("Other papers use Track A unless the question asks for an essay", () => {
  assert.equal(r.detectTrack({ paper: "Other", question: "Write an essay on cooperative banks." }), "B");
  assert.equal(r.detectTrack({ paper: "", question: "Explain the repo rate." }), "A");
});

test("a track given in the file wins over detection", () => {
  assert.equal(r.detectTrack({ paper: "ESI", question: "x", track: "essay" }), "B");
  assert.equal(r.parseTrack("Track C"), "C");
  assert.equal(r.parseTrack("rc"), "D");
  assert.equal(r.parseTrack("esi"), "A");
  assert.equal(r.parseTrack("weird"), "");
});

test("paper names are normalised", () => {
  assert.equal(r.normalizePaper("Economic and Social Issues"), "ESI");
  assert.equal(r.normalizePaper("Paper 1"), "ESI");
  assert.equal(r.normalizePaper("Finance & Management"), "FM");
  assert.equal(r.normalizePaper("F&M"), "FM");
  assert.equal(r.normalizePaper("Paper III"), "FM");
  assert.equal(r.normalizePaper("english"), "English");
  assert.equal(r.normalizePaper("Paper II"), "English");
  assert.equal(r.normalizePaper(""), "Other");
});

test("command words are found in order without double-counting", () => {
  const words = r.detectCommandWords("Critically examine the flexible inflation targeting framework. Suggest measures to improve it.").map(c => c.word);
  assert.deepEqual(words, ["critically examine", "suggest measures"]);
  assert.deepEqual(r.detectCommandWords("What is fiscal deficit? Discuss its implications.").map(c => c.word), ["define", "discuss"]);
  assert.ok(r.detectCommandWords("Critically analyze X")[0].demand.includes("40%"));
  assert.deepEqual(r.detectCommandWords("Banks and growth."), []);
});

test("parameter maxima follow the rubric tables and add up exactly", () => {
  assert.deepEqual(r.paramMaxima("A", 15).map(p => p.max), [3, 4, 4, 2.5, 1.5]);
  assert.deepEqual(r.paramMaxima("A", 10).map(p => p.max), [2, 2.5, 2.5, 2, 1]);
  assert.deepEqual(r.paramMaxima("B", 40).map(p => p.max), [8, 10, 8, 8, 6]);
  assert.deepEqual(r.paramMaxima("C", 30).map(p => p.max), [3, 10, 7, 5, 5]);
  assert.deepEqual(r.paramMaxima("D", 30).map(p => p.max), [12, 7.5, 6, 4.5]);
  for (const [track, marks] of [["A", 12], ["A", 20], ["B", 10], ["C", 10], ["D", 15], ["A", 5]]) {
    const ps = r.paramMaxima(track, marks);
    assert.equal(ps.reduce((s, p) => s + p.max, 0), marks, track + marks);
    ps.forEach(p => assert.equal(p.max * 4, Math.round(p.max * 4)));
  }
  assert.deepEqual(r.paramMaxima("A", 15).map(p => p.id), ["P1", "P2", "P3", "P4", "P5"]);
});

test("penalty values come from the table and scale for other marks", () => {
  assert.equal(r.penaltyValue("RP-1", 15, "A"), 1.25);
  assert.equal(r.penaltyValue("RP-1", 10, "A"), 0.75);
  assert.equal(r.penaltyValue("RP-6", 40, "B"), 2);
  assert.equal(r.penaltyValue("RP-1", 12, "A"), 1);
  assert.equal(r.penaltyValue("RP-2", 5, "A"), 0.25);
  assert.equal(r.penaltyValue("RP-7", 30, "C"), 1);
  assert.equal(r.penaltyValue("RP-7", 10, "C"), 0.25);
  assert.equal(r.penaltyValue("RP-7", 15, "A"), 0);
  assert.equal(r.penaltyValue("RP-9", 15, "A"), null);
});

test("word bands use the rubric percentages", () => {
  assert.equal(r.wordBand("A", 500, 600), "full");
  assert.equal(r.wordBand("A", 450, 600), "half");
  assert.equal(r.wordBand("A", 300, 600), "zero");
  assert.equal(r.wordBand("A", 680, 600), "zero");
  assert.equal(r.wordBand("B", 530, 600), "half");
  assert.equal(r.wordBand("C", 95, 100), "full");
  assert.equal(r.wordBand("D", 100, 100), null);
  assert.equal(r.wordBand("A", 100, 0), null);
});

test("a failed examiner check caps its parameter", () => {
  const out = enforce({ params: params("A", 15, [2.5, 2, 2, 1.5, 1]), checks: [{ id: 1, pass: false }] });
  assert.equal(out.params[0].awarded, 1.25);
  assert.match(out.params[0].cap, /45%/);
  assert.equal(out.rules.length, 1);
});

test("Track A source count caps P3", () => {
  assert.equal(enforce({ params: params("A", 15, [2, 2, 3, 1.5, 1]), anchorCount: 0 }).params[2].awarded, 0.75);
  assert.equal(enforce({ params: params("A", 15, [2, 2, 3, 1.5, 1]), anchorCount: 1 }).params[2].awarded, 1.75);
  assert.equal(enforce({ params: params("A", 15, [2, 2, 3, 1.5, 1]), anchorCount: 2 }).params[2].awarded, 3);
});

test("an out-of-band word count zeroes P5 and adds RP-5", () => {
  const out = enforce({ words: 300 });
  assert.equal(out.params[4].awarded, 0);
  assert.deepEqual(out.penalties.map(p => [p.code, p.deduction]), [["RP-5", 0.75]]);
  assert.match(out.penalties[0].trigger, /300 of 600/);
});

test("a half-band word count caps P5 at half", () => {
  assert.equal(enforce({ words: 450, params: params("A", 15, [2, 2, 2, 1.5, 1.5]) }).params[4].awarded, 0.75);
});

test("RP-5 from the model is removed when the word count is in band", () => {
  const out = enforce({ penalties: [{ code: "RP-5", trigger: "too short" }] });
  assert.deepEqual(out.penalties, []);
  assert.ok(out.rules.some(x => /RP-5 removed/.test(x)));
});

test("RP-7 is removed on Track A and kept on Track C", () => {
  assert.deepEqual(enforce({ penalties: [{ code: "RP-7", trigger: "lift" }] }).penalties, []);
  const c = r.enforceRubric({ track: "C", marks: 30, wordLimit: 200, words: 195, params: params("C", 30, [2, 6, 4, 3, 3]), checks: [], anchorCount: 0, penalties: [{ code: "RP-7", trigger: "lift" }], offTopic: false });
  assert.deepEqual(c.penalties.map(p => [p.code, p.deduction]), [["RP-7", 1]]);
});

test("penalties use table values, keep at most the allowed instances and drop unknown codes", () => {
  const out = enforce({
    penalties: [1, 2, 3, 4, 5].map(i => ({ code: "RP-2", trigger: "slogan " + i })).concat([{ code: "RP-9", trigger: "x" }, { code: "RP-1", trigger: "missed part" }])
  });
  assert.deepEqual(out.penalties.map(p => p.code), ["RP-2", "RP-2", "RP-2", "RP-1"]);
  assert.deepEqual(out.penalties.map(p => p.deduction), [0.25, 0.25, 0.25, 1.25]);
  assert.equal(out.penalties[3].label, "Missing sub-part");
});

test("under 60 words on Track A or B is an automatic fail", () => {
  assert.equal(enforce({ words: 59 }).autoFail, true);
  assert.equal(enforce({ words: 60 }).autoFail, false);
  const c = r.enforceRubric({ track: "C", marks: 30, wordLimit: 60, words: 50, params: params("C", 30, [1, 1, 1, 1, 1]), checks: [], anchorCount: 0, penalties: [], offTopic: false });
  assert.equal(c.autoFail, false);
});

test("finalScore subtracts penalties and applies the hard ceiling", () => {
  const ceil = r.finalScore({ track: "A", marks: 15, params: params("A", 15, [3, 3, 2, 1, 1]), penalties: [], autoFail: false, offTopic: false });
  assert.equal(ceil.rawSum, 10);
  assert.equal(ceil.score, 9.5);
  assert.equal(ceil.ceilingApplied, true);
  const normal = r.finalScore({ track: "A", marks: 15, params: params("A", 15, [2, 2, 2, 1.5, 1]), penalties: [{ deduction: 1.25 }, { deduction: 0.25 }], autoFail: false, offTopic: false });
  assert.equal(normal.rawSum, 8.5);
  assert.equal(normal.penaltySum, 1.5);
  assert.equal(normal.score, 7);
  assert.equal(normal.percent, 46.7);
  assert.equal(normal.grade, "B");
  assert.deepEqual(normal.projection, [9, 10]);
  const zero = r.finalScore({ track: "A", marks: 15, params: params("A", 15, [2, 2, 2, 1.5, 1]), penalties: [], autoFail: true, offTopic: false });
  assert.equal(zero.score, 0);
  assert.equal(zero.projection, null);
  assert.equal(r.finalScore({ track: "A", marks: 10, params: params("A", 10, [0, 0, 0, 0, 0]), penalties: [{ deduction: 0.75 }], autoFail: false, offTopic: false }).score, 0);
});

test("ceilings, grades and projections", () => {
  assert.equal(r.ceilingFor("A", 10), 6.25);
  assert.equal(r.ceilingFor("A", 15), 9.5);
  assert.equal(r.ceilingFor("B", 40), 28.5);
  assert.equal(r.ceilingFor("C", 30), 22.5);
  assert.equal(r.ceilingFor("A", 20), 12.5);
  assert.equal(r.gradeFor(45).grade, "B");
  assert.equal(r.gradeFor(52).grade, "A");
  assert.equal(r.gradeFor(19.9).grade, "F");
  assert.deepEqual(r.projectionFor(6, 15), [8, 9]);
  assert.deepEqual(r.projectionFor(20, 30), [23.5, 25.5]);
  assert.deepEqual(r.projectionFor(14, 15), [15, 15]);
  assert.deepEqual(r.projectionFor(3, 5), [4, 4.5]);
});

test("defaults for missing marks and word limits", () => {
  assert.equal(r.defaultMarks("A", 600), 15);
  assert.equal(r.defaultMarks("A", 400), 10);
  assert.equal(r.defaultMarks("A", 0), 10);
  assert.equal(r.defaultMarks("B", 0), 40);
  assert.equal(r.defaultMarks("C", 0), 30);
  assert.equal(r.defaultWordLimit("A", 15, 0), 600);
  assert.equal(r.defaultWordLimit("A", 10, 0), 400);
  assert.equal(r.defaultWordLimit("B", 40, 0), 600);
  assert.equal(r.defaultWordLimit("C", 30, 600), 200);
  assert.equal(r.defaultWordLimit("D", 30, 600), 0);
});

test("ideal minutes follow the rubric's pacing guide", () => {
  assert.deepEqual(r.idealMinutes("A", 10), [15, 17]);
  assert.deepEqual(r.idealMinutes("A", 15), [22, 25]);
  assert.deepEqual(r.idealMinutes("B", 40), [32, 35]);
  assert.deepEqual(r.idealMinutes("C", 30), [25, 28]);
});
