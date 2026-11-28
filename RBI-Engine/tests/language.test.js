"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const lang = require("../src/passes/language");
const { splitUnits } = require("../src/text");
const { finalizeQuestion, fromParts } = require("../src/input");

const ANSWER = "INTRODUCTION\nIndia have adopted FIT in 2016. The MPC consist of six members.\nThe programme helped the labour market. It's a inflation target.\nIn india prices rose. Banks lends and NBFCs lends.";

function q() {
  return finalizeQuestion(Object.assign(fromParts({ question: "Explain FIT.", answer: ANSWER }), { paper: "ESI", marks: 10, wordLimit: 400 }), {});
}

const UNITS = splitUnits(ANSWER);

function issue(unit, wrong, fix, type = "grammar") {
  return { unit, wrong, fix, type, rule: "rule", severity: "major" };
}

function reply(issues, over = {}) {
  return Object.assign({
    issues,
    style: { verdict: "Nearly there", score: 6, assessment: "Mostly sober.", issues: ["One contraction"] },
    register: [],
    vocabulary: [],
    sentence_craft: [],
    summary: "Your language is clear but careless."
  }, over);
}

test("the prompt numbers every unit with its kind and states the spelling and track rules", () => {
  const p = lang.build(q(), UNITS);
  assert.match(p.system, /strict English language examiner/);
  assert.ok(p.prompt.includes("[S1] (heading) INTRODUCTION"));
  assert.ok(p.prompt.includes("[S2] (sentence) India have adopted FIT in 2016."));
  assert.match(p.prompt, /programme, labour, organisation/);
  assert.match(p.prompt, /Lead-in:/);
  assert.deepEqual(p.schema.properties.issues.items.properties.type.enum.slice(0, 3), ["grammar", "tense", "agreement"]);
});

test("an issue found in its unit is kept with its position in the answer", () => {
  const out = lang.normalize(reply([issue("S2", "India have adopted", "India adopted", "tense")]), q(), UNITS);
  assert.equal(out.issues.length, 1);
  const i = out.issues[0];
  assert.equal(i.unit, "S2");
  assert.equal(ANSWER.slice(i.start, i.end), "India have adopted");
  assert.equal(i.type, "tense");
});

test("an issue filed under the wrong unit is moved to the unit that has the words", () => {
  const out = lang.normalize(reply([issue("S2", "MPC consist", "MPC consists", "agreement")]), q(), UNITS);
  assert.equal(out.issues[0].unit, "S3");
});

test("an issue quoting words that are not in the answer is dropped and counted", () => {
  const out = lang.normalize(reply([issue("S2", "Banks has", "Banks have")]), q(), UNITS);
  assert.equal(out.issues.length, 0);
  assert.equal(out.dropped, 1);
});

test("British spelling is never corrected", () => {
  const out = lang.normalize(reply([issue("S4", "programme", "program", "spelling"), issue("S4", "labour market", "labor market", "word choice")]), q(), UNITS);
  assert.equal(out.issues.length, 0);
  assert.equal(out.dropped, 2);
});

test("a fix equal to the original is dropped, a capitalisation-only fix is kept", () => {
  const out = lang.normalize(reply([issue("S6", "prices rose", "prices rose"), issue("S6", "india", "India", "Capitalization")]), q(), UNITS);
  assert.deepEqual(out.issues.map(i => [i.wrong, i.fix, i.type]), [["india", "India", "capitalisation"]]);
});

test("overlapping fixes keep the first one", () => {
  const out = lang.normalize(reply([issue("S2", "India have adopted", "India adopted"), issue("S2", "have adopted", "adopted")]), q(), UNITS);
  assert.equal(out.issues.length, 1);
  assert.equal(out.issues[0].fix, "India adopted");
});

test("the same mistake twice in one unit is kept twice", () => {
  const out = lang.normalize(reply([issue("S7", "lends", "lend", "agreement"), issue("S7", "lends", "lend", "agreement")]), q(), UNITS);
  assert.equal(out.issues.length, 2);
  assert.notEqual(out.issues[0].start, out.issues[1].start);
});

test("the corrected answer changes exactly the kept spans and nothing else", () => {
  const out = lang.normalize(reply([
    issue("S2", "India have adopted", "India adopted", "tense"),
    issue("S3", "MPC consist", "MPC consists", "agreement"),
    issue("S5", "a inflation", "an inflation", "article"),
    issue("S6", "india", "India", "capitalisation"),
    issue("S7", "lends", "lend", "agreement"),
    issue("S7", "lends", "lend", "agreement"),
    issue("S4", "programme", "program", "spelling")
  ]), q(), UNITS);
  assert.equal(out.corrected.text, "INTRODUCTION\nIndia adopted FIT in 2016. The MPC consists of six members.\nThe programme helped the labour market. It's an inflation target.\nIn India prices rose. Banks lend and NBFCs lend.");
  const s5 = out.corrected.units.find(u => u.id === "S5");
  assert.deepEqual(s5.segments, [{ t: "same", s: "It's " }, { t: "del", s: "a inflation" }, { t: "ins", s: "an inflation" }, { t: "same", s: " target." }]);
  assert.equal(out.corrected.units.some(u => u.id === "S4"), false);
});

test("counts are grouped by type and severity and given per 100 words", () => {
  const out = lang.normalize(reply([issue("S2", "India have adopted", "India adopted", "tense"), issue("S3", "MPC consist", "MPC consists", "weird-type")]), q(), UNITS);
  assert.deepEqual(out.byType, { tense: 1, grammar: 1 });
  assert.deepEqual(out.bySeverity, { major: 2, minor: 0 });
  assert.equal(out.per100, Math.round(2 / q().words * 1000) / 10);
});

test("the style verdict is one of three values and the score stays within 0-10", () => {
  assert.deepEqual([lang.normalize(reply([], { style: { verdict: "nearly ready", score: 14, assessment: "a", issues: [] } }), q(), UNITS).style.verdict, lang.normalize(reply([], { style: { verdict: "nearly ready", score: 14, assessment: "a", issues: [] } }), q(), UNITS).style.score], ["Nearly there", 10]);
  assert.equal(lang.normalize(reply([], { style: { verdict: "RBI ready", score: 8, assessment: "a", issues: [] } }), q(), UNITS).style.verdict, "RBI-ready");
  assert.equal(lang.normalize(reply([], { style: { verdict: "weak", score: -2, assessment: "a", issues: [] } }), q(), UNITS).style.score, 0);
});

test("vocabulary, register and sentence-craft notes must point at the real answer", () => {
  const out = lang.normalize(reply([], {
    vocabulary: [{ used: "helped", better: "supported", why: "more precise" }, { used: "awesome", better: "remarkable", why: "x" }, { used: "programme", better: "program", why: "US" }],
    register: [{ quote: "It's a inflation target", problem: "contraction", better: "It is an inflation target" }, { quote: "We think so", problem: "first person", better: "x" }],
    sentence_craft: [{ unit: "S7", problem: "choppy", suggestion: "join" }, { unit: "S99", problem: "x", suggestion: "y" }]
  }), q(), UNITS);
  assert.deepEqual(out.vocabulary.map(v => v.used), ["helped"]);
  assert.deepEqual(out.register.map(r => r.quote), ["It's a inflation target"]);
  assert.deepEqual(out.craft.map(c => c.unit), ["S7"]);
});
