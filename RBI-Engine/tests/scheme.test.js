"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const scheme = require("../src/passes/scheme");
const { finalizeQuestion, fromParts } = require("../src/input");
const { AIError } = require("../src/ai");

function question(over = {}) {
  const raw = Object.assign(fromParts({ question: "Critically examine FIT. Suggest measures.", answer: "Some answer.", model: "FIT began in 2016." }), { paper: "ESI", marks: 15, wordLimit: 600 }, over);
  return finalizeQuestion(raw, {});
}

function points(n) {
  return Array.from({ length: n }, (_, i) => ({ point: "Point " + (i + 1), weight: 2, subpart: 1 }));
}

test("the checklist prompt carries the question, reference answer, track, marks and command words", () => {
  const p = scheme.build(question());
  assert.match(p.system, /fixed marking checklist/i);
  assert.match(p.prompt, /Critically examine FIT\. Suggest measures\./);
  assert.match(p.prompt, /REFERENCE ANSWER:\nFIT began in 2016\./);
  assert.match(p.prompt, /Track A \(ESI \/ Finance & Management answer\)/);
  assert.match(p.prompt, /15 marks/);
  assert.match(p.prompt, /word limit 600/);
  assert.match(p.prompt, /critically examine, suggest measures/);
  assert.equal(p.schema.type, "object");
});

test("a missing reference answer changes the instruction", () => {
  const p = scheme.build(question({ modelAnswer: "" }));
  assert.match(p.prompt, /No reference answer was given/);
  assert.doesNotMatch(p.prompt, /REFERENCE ANSWER:/);
});

test("a very long reference answer is clipped with a note saying so", () => {
  const p = scheme.build(question({ modelAnswer: "x".repeat(15000) }));
  assert.match(p.prompt, /only the first 14,000 characters/);
  assert.ok(p.prompt.length < 20000);
});

test("normalize keeps at most 12 points, clamps weights and renumbers ids", () => {
  const raw = {
    subparts: [{ part: "Features", expects: "List them" }, { part: "Record", expects: "Judge it" }],
    points: points(14).map((p, i) => Object.assign(p, { weight: i === 0 ? 0 : i === 1 ? 5 : "3", subpart: i === 2 ? 2 : 9 })),
    outline: [{ section: "INTRODUCTION", covers: "c", share: 30 }, { section: "BODY", covers: "c", share: 30 }, { section: "WAY FORWARD", covers: "c", share: 30 }],
    dimensions: ["Macroeconomic", "Regulatory"]
  };
  const s = scheme.normalize(raw, question());
  assert.equal(s.points.length, 12);
  assert.deepEqual(s.points.slice(0, 3).map(p => [p.id, p.weight, p.subpart]), [["K1", 1, "S1"], ["K2", 3, "S1"], ["K3", 3, "S2"]]);
  assert.deepEqual(s.subparts.map(x => x.id), ["S1", "S2"]);
  assert.deepEqual(s.outline.map(o => o.share), [34, 33, 33]);
  assert.deepEqual(s.outline.map(o => o.words), [204, 198, 198]);
  assert.deepEqual(s.outline.map(o => o.id), ["O1", "O2", "O3"]);
  assert.deepEqual(s.dimensions, ["Macroeconomic", "Regulatory"]);
});

test("a point's sub-part must exist", () => {
  const s = scheme.normalize({ subparts: [{ part: "Only", expects: "x" }], points: [{ point: "a", weight: 2, subpart: 4 }, { point: "b", weight: 1, subpart: 1 }], outline: [], dimensions: [] }, question());
  assert.deepEqual(s.points.map(p => p.subpart), ["S1", "S1"]);
});

test("no sub-parts gives one main-question sub-part", () => {
  const s = scheme.normalize({ subparts: [], points: points(5), outline: [], dimensions: [] }, question());
  assert.deepEqual(s.subparts.map(x => [x.id, x.part]), [["S1", "Main question"]]);
});

test("fewer than two points is a format error", () => {
  assert.throws(() => scheme.normalize({ subparts: [], points: points(1), outline: [], dimensions: [] }, question()), err => err instanceof AIError && err.kind === "format");
});

test("a missing outline falls back to the track's default with word budgets", () => {
  const s = scheme.normalize({ subparts: [], points: points(5), outline: [], dimensions: [] }, question());
  assert.equal(s.outline.reduce((a, o) => a + o.share, 0), 100);
  assert.equal(s.outline.reduce((a, o) => a + o.words, 0), 600);
  assert.equal(s.outline[0].section, "INTRODUCTION");
});

test("every track's default outline adds up to 100", () => {
  for (const t of ["A", "B", "C", "D"]) assert.equal(scheme.defaultOutline(t).reduce((a, o) => a + o.share, 0), 100, t);
});
