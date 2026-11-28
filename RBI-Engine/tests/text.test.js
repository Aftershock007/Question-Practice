"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const t = require("../src/text");

function texts(s) {
  return t.splitUnits(s).map(u => u.text);
}

test("normalizeText fixes line endings and invisible characters only", () => {
  assert.equal(t.normalizeText("﻿a\r\nb\rc d​e"), "a\nb\nc de");
  assert.equal(t.normalizeText("  keep  spacing \n"), "  keep  spacing \n");
});

test("countWords splits on whitespace like the app", () => {
  assert.equal(t.countWords("  a b\n c "), 3);
  assert.equal(t.countWords(""), 0);
  assert.equal(t.countWords("Repo -> WACR -> credit"), 5);
});

test("a decimal does not end a sentence", () => {
  assert.deepEqual(texts("Repo rate rose to 6.5% in 2023. Inflation fell."), ["Repo rate rose to 6.5% in 2023.", "Inflation fell."]);
});

test("initials do not end a sentence", () => {
  assert.deepEqual(texts("The K.V. Kamath committee met. It reported."), ["The K.V. Kamath committee met.", "It reported."]);
});

test("Rs. and e.g. do not end a sentence", () => {
  assert.deepEqual(texts("Rs. 500 crore was set aside. Banks lent it."), ["Rs. 500 crore was set aside.", "Banks lent it."]);
  assert.deepEqual(texts("e.g. MSMEs gained. Banks too."), ["e.g. MSMEs gained.", "Banks too."]);
});

test("question marks and closing quotes end sentences", () => {
  assert.deepEqual(texts("Has it worked? Yes, partly."), ["Has it worked?", "Yes, partly."]);
  assert.deepEqual(texts("He said \"prices are stable.\" Then rates fell."), ["He said \"prices are stable.\"", "Then rates fell."]);
});

test("a heading line becomes its own heading unit", () => {
  const units = t.splitUnits("INTRODUCTION\nIndia adopted FIT in 2016.");
  assert.deepEqual(units.map(u => [u.kind, u.text]), [["heading", "INTRODUCTION"], ["sentence", "India adopted FIT in 2016."]]);
});

test("title-case and colon headings are headings, a sentence without a full stop is not", () => {
  const kinds = t.splitUnits("Way Forward\nChallenges:\nIndia adopted FIT in 2016").map(u => u.kind);
  assert.deepEqual(kinds, ["heading", "heading", "sentence"]);
});

test("numbered points keep their markers and split into sentences", () => {
  const units = t.splitUnits("1. Lead-in: Credit growth slowed. NPAs rose.\n2. Liquidity eased.");
  assert.deepEqual(units.map(u => [u.kind, u.text]), [
    ["point", "1. Lead-in: Credit growth slowed."],
    ["point", "NPAs rose."],
    ["point", "2. Liquidity eased."]
  ]);
});

test("a numbered all-caps line is a heading", () => {
  assert.equal(t.splitUnits("1. INTRODUCTION")[0].kind, "heading");
});

test("every unit is an exact slice of the source with ids in order", () => {
  const src = "  INTRODUCTION  \n\nIndia adopted FIT in 2016.  The MPC has six members!\n• Repo rose. CPI fell?\n\nConclusion: FIT worked.";
  const units = t.splitUnits(src);
  units.forEach((u, i) => {
    assert.equal(u.text, src.slice(u.start, u.end));
    assert.equal(u.id, "S" + (i + 1));
  });
  assert.deepEqual(units.map(u => u.line), [1, 3, 3, 4, 4, 6]);
  assert.deepEqual(units.map(u => u.para), [1, 2, 2, 2, 2, 3]);
});

test("the Devanagari danda ends a unit", () => {
  assert.equal(t.splitUnits("मुद्रास्फीति कम हुई। विकास तेज़ हुआ।").length, 2);
});

test("blank lines start paragraphs and single line breaks do not", () => {
  const paras = t.paragraphs("Line one.\nLine two.\n\n\nLine three.");
  assert.equal(paras.length, 2);
  assert.equal(paras[0].text, "Line one.\nLine two.");
  assert.equal(paras[0].lines, 2);
  assert.equal(paras[0].words, 4);
  assert.equal(paras[1].id, "P2");
});

test("structure shares add up to 100 and the conclusion is detected", () => {
  const src = "India adopted FIT in 2016 to anchor inflation expectations.\n\n" +
    "The MPC sets the repo rate. Inflation fell after 2016. Food shocks still matter a lot here.\n\n" +
    "Way forward: keep the 4 per cent target and improve transmission.";
  const s = t.structureStats(src, { track: "A", wordLimit: 50, seconds: 120 });
  assert.equal(s.introShare + s.bodyShare + s.conclusionShare, 100);
  assert.ok(s.introShare > 0 && s.bodyShare > s.introShare);
  assert.equal(s.hasConclusion, true);
  assert.equal(s.paragraphs, 3);
  assert.equal(s.words, 37);
  assert.equal(s.wordPercent, 74);
  assert.equal(s.wpm, 19);
  assert.equal(s.minutes, 2);
});

test("hasConclusion accepts the usual closing phrases and rejects others", () => {
  const body = "Intro text here.\n\nBody text here.\n\n";
  for (const start of ["Conclusion", "In conclusion,", "To conclude,", "Going forward,", "Way Forward"]) {
    assert.equal(t.structureStats(body + start + " the plan works.", {}).hasConclusion, true, start);
  }
  assert.equal(t.structureStats(body + "Banks lent more.", {}).hasConclusion, false);
});

test("a heading-only first paragraph is counted with the introduction", () => {
  const src = "INTRODUCTION\n\nFIT began in 2016 with a target.\n\nBody one two three four five six seven eight.\n\nConclusion: it worked.";
  const s = t.structureStats(src, {});
  assert.ok(s.introShare >= 20, "intro share " + s.introShare);
});

test("fewer than three blocks gives no shares", () => {
  const s = t.structureStats("Just one paragraph of text.", {});
  assert.equal(s.introShare, null);
  assert.equal(s.hasConclusion, false);
  assert.equal(s.wordPercent, null);
  assert.equal(s.wpm, null);
});

test("structureStats counts headings, points and the longest sentence", () => {
  const src = "INTRODUCTION\nShort one.\n- Point with five words here.\n- Another point.\nA much longer sentence that has quite a few more words in it.";
  const s = t.structureStats(src, {});
  assert.deepEqual(s.headings, ["INTRODUCTION"]);
  assert.equal(s.points, 2);
  assert.equal(s.longest.words, 13);
  assert.equal(s.sentences, 4);
});

test("latinShare tells English from Hindi", () => {
  assert.equal(t.latinShare("Inflation fell."), 1);
  assert.ok(t.latinShare("मुद्रास्फीति कम हुई") < 0.1);
  assert.equal(t.latinShare("123"), 1);
});
