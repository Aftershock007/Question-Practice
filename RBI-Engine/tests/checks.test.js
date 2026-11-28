"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { splitUnits, paragraphs } = require("../src/text");
const { mechanicalChecks } = require("../src/checks");

function run(text, track = "A", question = "") {
  return mechanicalChecks({ text, units: splitUnits(text), paras: paragraphs(text), track, question });
}

function of(text, kind, track) {
  return run(text, track).filter(f => f.kind === kind);
}

test("a word typed twice is flagged with the fix, a legitimate 'had had' is not", () => {
  const f = of("Inflation in the the economy fell.", "repeated word");
  assert.equal(f.length, 1);
  assert.equal(f[0].quote, "the the");
  assert.equal(f[0].fix, "the");
  assert.equal(f[0].unit, "S1");
  assert.equal(of("He had had enough of it.", "repeated word").length, 0);
});

test("spacing around punctuation is checked without touching decimals and abbreviations", () => {
  assert.deepEqual(of("Growth fell ,which hurt banks.", "spacing").map(f => [f.quote, f.fix]), [["fell ,", "fell,"]]);
  assert.deepEqual(of("Growth fell,which hurt banks.", "spacing").map(f => [f.quote, f.fix]), [["fell,which", "fell, which"]]);
  assert.deepEqual(of("Growth fell.The RBI cut rates.", "spacing").map(f => [f.quote, f.fix]), [["fell.The", "fell. The"]]);
  assert.equal(of("Repo rose to 6.5% in the U.S. economy, e.g. banks gained 1,000 crore.", "spacing").length, 0);
});

test("a sentence starting in lower case is flagged but a point is not", () => {
  assert.equal(of("inflation fell sharply in 2023.", "capitalisation").length, 1);
  assert.equal(of("- rising NPAs hurt the banks.", "capitalisation").length, 0);
});

test("a lower-case pronoun i is flagged but roman numeral points are not", () => {
  const f = of("Rates will fall, i think.", "capitalisation");
  assert.deepEqual(f.map(x => [x.quote, x.fix]), [["i", "I"]]);
  assert.equal(of("i. Rising NPAs hurt banks.", "capitalisation").length, 0);
});

test("contractions are flagged with the full form", () => {
  const f = of("Banks don't lend enough and it's a problem.", "contraction");
  assert.deepEqual(f.map(x => [x.quote, x.fix]), [["don't", "do not"], ["it's", "it is"]]);
  assert.equal(of("The RBI's policy worked.", "contraction").length, 0);
});

test("informal phrases are flagged with a better phrase", () => {
  const f = of("There are a lot of problems with this stuff.", "informal");
  assert.deepEqual(f.map(x => x.quote), ["a lot of", "stuff"]);
  assert.match(f[0].fix, /large number|considerable/);
});

test("first person is flagged on Track A but not in an essay", () => {
  assert.equal(of("In my opinion the policy worked.", "first person", "A").length, 1);
  assert.equal(of("In my opinion the policy worked.", "first person", "B").length, 0);
  assert.equal(of("We must act now.", "first person", "C").length, 1);
});

test("a lower-case pronoun i is first person too, a roman numeral marker is not", () => {
  assert.equal(of("Rates will fall, i think.", "first person", "A").length, 1);
  assert.equal(of("i. Rising NPAs hurt banks.", "first person", "A").length, 0);
});

test("roman numerals and the United States are not first person", () => {
  assert.equal(of("Basel I norms and Tier I capital matter in the US economy.", "first person", "A").length, 0);
});

test("questions, exclamations and very long sentences are flagged", () => {
  assert.equal(of("Has FIT worked? Partly.", "rhetorical question").length, 1);
  assert.equal(of("This is a crisis!", "exclamation").length, 1);
  const long = "The policy " + "made banks lend more ".repeat(10) + "today.";
  assert.equal(of(long, "long sentence").length, 1);
  assert.equal(of("A short sentence here.", "long sentence").length, 0);
});

test("a Track A answer with no headings or points is a wall of text", () => {
  const wall = ("Inflation targeting has worked in India for many years now. ").repeat(20);
  assert.equal(of(wall, "wall of text", "A").length, 1);
  assert.equal(of("INTRODUCTION\n" + wall, "wall of text", "A").length, 0);
  assert.equal(of(wall, "wall of text", "B").length, 0);
});

test("bullets in an essay and two paragraphs in a precis break the format", () => {
  assert.equal(of("Digital India\n\nPayments grew fast.\n- UPI spread.\n- Banks joined.", "essay format", "B").length, 1);
  assert.equal(of("Digital India\n\nPayments grew fast. Banks joined.", "essay format", "B").length, 0);
  assert.equal(of("Healthy Banks, Healthy Growth\n\nBanks lend savings.\n\nBad loans slow growth.", "precis format", "C").length, 1);
  assert.equal(of("Healthy Banks, Healthy Growth\n\nBanks lend savings. Bad loans slow growth.", "precis format", "C").length, 0);
});

test("a precis with no title is told to add one", () => {
  const f = of("Banks lend savings to farms and factories. Bad loans slow growth.", "precis format", "C");
  assert.equal(f.length, 1);
  assert.match(f[0].message, /title/i);
});

test("unclosed brackets and quotes are flagged", () => {
  assert.equal(of("The policy (adopted in 2016 worked.", "brackets").length, 1);
  assert.equal(of("He said \"rates will fall.", "brackets").length, 1);
  assert.equal(of("The policy (adopted in 2016) worked.", "brackets").length, 0);
});

test("three sentences in a row with the same opening word are flagged once", () => {
  assert.equal(of("The RBI acted. The MPC met. The rate rose.", "repetitive openings").length, 1);
  assert.equal(of("The RBI acted. Banks met. The rate rose.", "repetitive openings").length, 0);
});

test("a filler word used three times is flagged", () => {
  const f = of("It is very big. Rates are very high. Prices are very sticky.", "filler word");
  assert.equal(f.length, 1);
  assert.equal(f[0].quote, "very");
  assert.match(f[0].message, /3 times/);
});

test("British spellings and a clean answer give no findings", () => {
  assert.deepEqual(run("The programme helped labour markets, and the organisation's centre analysed behaviour."), []);
});

test("English-only checks are skipped for a Hindi answer", () => {
  assert.deepEqual(run("मैं सोचता हूँ कि मुद्रास्फीति कम हुई। विकास तेज़ हुआ।"), []);
});

test("findings are numbered M1, M2... in text order", () => {
  const f = run("Banks don't lend. There are a lot of loans.");
  assert.deepEqual(f.map(x => x.id), ["M1", "M2"]);
  assert.deepEqual(f.map(x => x.kind), ["contraction", "informal"]);
});
