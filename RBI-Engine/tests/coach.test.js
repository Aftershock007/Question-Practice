"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const coach = require("../src/passes/coach");
const scheme = require("../src/passes/scheme");
const { splitUnits, paragraphs, structureStats } = require("../src/text");
const { finalizeQuestion, fromParts } = require("../src/input");

const ANSWER = "INTRODUCTION\nIndia adopted FIT in 2016.\n\nBODY\nThe MPC sets rates. Food prices matter a lot.\n\nCONCLUSION\nFIT worked.";

function q() {
  return finalizeQuestion(Object.assign(fromParts({ question: "Critically examine FIT.", answer: ANSWER, model: "Reference text." }), { paper: "ESI", marks: 15, wordLimit: 600 }), {});
}

function local() {
  const qq = q();
  return { units: splitUnits(qq.answer), paras: paragraphs(qq.answer), stats: structureStats(qq.answer, { track: "A", wordLimit: 600 }), commandWords: [{ word: "critically examine", demand: "balanced" }] };
}

const SCHEME = scheme.normalize({
  subparts: [{ part: "Examine", expects: "both sides" }],
  points: [{ point: "a", weight: 3, subpart: 1 }, { point: "b", weight: 1, subpart: 1 }],
  outline: [{ section: "INTRODUCTION", covers: "hook", share: 15 }, { section: "MERITS AND LIMITS", covers: "both sides", share: 70 }, { section: "WAY FORWARD", covers: "measures", share: 15 }],
  dimensions: []
}, q());

function reply(over = {}) {
  return Object.assign({
    framing: "You answered only half of the question.",
    outline_match: [{ id: "O1", status: "covered", comment: "Fine." }, { id: "O2", status: "weak", comment: "Add limits." }, { id: "O9", status: "covered", comment: "x" }],
    introduction: { assessment: "Too short.", rewrite: "India adopted flexible inflation targeting in 2016.\\nThe target is 4%." },
    conclusion: { assessment: "Bare.", rewrite: "FIT has anchored expectations." },
    paragraphs: [{ id: "P2", assessment: "No mechanism.", fix: "Explain transmission." }, { id: "P7", assessment: "x", fix: "y" }],
    headings: { assessment: "Generic headings.", suggested: ["INTRODUCTION", "ACHIEVEMENTS", "LIMITATIONS", "WAY FORWARD"] },
    flow: ["Jumps from MPC to food prices."],
    value_additions: ["Add the 2022 breach and the report to the Government."],
    rewrites: [
      { before: "Food prices matter a lot.", after: "Food carries about 46% weight in the CPI basket.", why: "Specific." },
      { before: "Inflation was always zero.", after: "x", why: "y" },
      { before: "FIT worked.", after: "FIT worked.", why: "same" }
    ],
    model_answer: "INTRODUCTION\\nIndia adopted FIT in 2016.\\nWAY FORWARD\\nStrengthen transmission.\n[EXACT WORD COUNT: 999 words]"
  }, over);
}

test("the coach prompt carries the fixed outline with word budgets, paragraph ids and the reference answer", () => {
  const p = coach.build(q(), local(), SCHEME);
  assert.match(p.system, /answer-writing mentor/);
  assert.ok(p.prompt.includes("O1 INTRODUCTION (15%, about 90 words)"));
  assert.ok(p.prompt.includes("O2 MERITS AND LIMITS (70%, about 420 words)"));
  assert.ok(p.prompt.includes("[P2] BODY\nThe MPC sets rates. Food prices matter a lot."));
  assert.match(p.prompt, /REFERENCE ANSWER:\nReference text\./);
  assert.match(p.prompt, /ALL CAPS headings/);
  assert.match(p.prompt, /within the word limit \(90-102% of 600 words\)/);
  assert.equal(p.schema.type, "object");
});

test("rewrites must quote the answer and actually change it", () => {
  const c = coach.normalize(reply(), q(), local(), SCHEME);
  assert.deepEqual(c.rewrites.map(r => r.before), ["Food prices matter a lot."]);
});

test("outline verdicts follow the fixed outline; unknown ids are dropped and unreported sections are marked not assessed", () => {
  const c = coach.normalize(reply(), q(), local(), SCHEME);
  assert.deepEqual(c.outlineMatch.map(o => [o.id, o.section, o.status]), [["O1", "INTRODUCTION", "covered"], ["O2", "MERITS AND LIMITS", "weak"], ["O3", "WAY FORWARD", "unknown"]]);
});

test("paragraph notes must name a real paragraph", () => {
  const c = coach.normalize(reply(), q(), local(), SCHEME);
  assert.deepEqual(c.paragraphs.map(p => p.id), ["P2"]);
});

test("the model answer loses the word-count line, gets real line breaks and an engine word count", () => {
  const c = coach.normalize(reply(), q(), local(), SCHEME);
  assert.equal(c.modelAnswer.text, "INTRODUCTION\nIndia adopted FIT in 2016.\nWAY FORWARD\nStrengthen transmission.");
  assert.equal(c.modelAnswer.words, 10);
  assert.equal(c.introduction.rewrite, "India adopted flexible inflation targeting in 2016.\nThe target is 4%.");
});

test("lists are kept and trimmed", () => {
  const c = coach.normalize(reply(), q(), local(), SCHEME);
  assert.equal(c.framing, "You answered only half of the question.");
  assert.deepEqual(c.headings.suggested, ["INTRODUCTION", "ACHIEVEMENTS", "LIMITATIONS", "WAY FORWARD"]);
  assert.equal(c.flow.length, 1);
  assert.equal(c.valueAdds.length, 1);
});
