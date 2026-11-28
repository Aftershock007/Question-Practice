"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const u = require("../src/util");

test("snap4 rounds to the nearest quarter mark", () => {
  assert.equal(u.snap4(1.13), 1.25);
  assert.equal(u.snap4(1.12), 1);
  assert.equal(u.snap4(2.375), 2.5);
  assert.equal(u.snap4(0), 0);
});

test("median of odd and even lists", () => {
  assert.equal(u.median([3, 1, 2]), 2);
  assert.equal(u.median([1, 2]), 1.5);
  assert.equal(u.median([]), null);
  assert.equal(u.median([7]), 7);
});

test("findSpan finds exact text", () => {
  assert.deepEqual(u.findSpan("India have adopted FIT", "have adopted"), { start: 6, end: 18 });
});

test("findSpan matches straight quotes against curly quotes in the source", () => {
  assert.deepEqual(u.findSpan("It’s a inflation", "It's a"), { start: 0, end: 6 });
});

test("findSpan ignores case differences", () => {
  assert.deepEqual(u.findSpan("The Repo rate rose", "the repo"), { start: 0, end: 8 });
});

test("findSpan tolerates collapsed whitespace", () => {
  assert.deepEqual(u.findSpan("growth  rate fell", "growth rate"), { start: 0, end: 12 });
});

test("findSpan returns null when the text is absent or empty", () => {
  assert.equal(u.findSpan("growth rate", "inflation"), null);
  assert.equal(u.findSpan("growth rate", ""), null);
});

test("isBritishVariant accepts British and American pairs in both directions", () => {
  assert.equal(u.isBritishVariant("organisation", "organization"), true);
  assert.equal(u.isBritishVariant("labour", "labor"), true);
  assert.equal(u.isBritishVariant("programme", "program"), true);
  assert.equal(u.isBritishVariant("centre", "center"), true);
  assert.equal(u.isBritishVariant("analyse", "analyze"), true);
  assert.equal(u.isBritishVariant("defence", "defense"), true);
  assert.equal(u.isBritishVariant("travelled", "traveled"), true);
  assert.equal(u.isBritishVariant("modeling", "modelling"), true);
  assert.equal(u.isBritishVariant("judgement", "judgment"), true);
});

test("isBritishVariant rejects real spelling corrections", () => {
  assert.equal(u.isBritishVariant("goverment", "government"), false);
  assert.equal(u.isBritishVariant("controled", "controlled"), false);
  assert.equal(u.isBritishVariant("recieve", "receive"), false);
  assert.equal(u.isBritishVariant("labour", "labour"), false);
});

test("onlyBritishChanges spots a fix that only changes British spelling", () => {
  assert.equal(u.onlyBritishChanges("the labour market", "the labor market"), true);
  assert.equal(u.onlyBritishChanges("Organisations,", "Organizations,"), true);
  assert.equal(u.onlyBritishChanges("the labour markets is", "the labor market is"), false);
  assert.equal(u.onlyBritishChanges("a inflation", "an inflation"), false);
  assert.equal(u.onlyBritishChanges("same text", "same text"), false);
});

test("quoteInScript accepts exact and near-exact quotes only", () => {
  const script = u.plainText("The MPC has six members, three from the RBI.");
  assert.equal(u.quoteInScript("The MPC has six members", script), true);
  assert.equal(u.quoteInScript("the MPC has six members - three", script), true);
  assert.equal(u.quoteInScript("The Monetary Policy Committee was abolished", script), false);
  assert.equal(u.quoteInScript("", script), false);
});

test("slug makes a short safe folder name", () => {
  assert.equal(u.slug("Practice_2026-11-28_Q1_ESI_15m"), "practice-2026-11-28-q1-esi-15m");
  assert.equal(u.slug("  !!!  "), "answer");
  assert.ok(u.slug("a".repeat(100)).length <= 40);
});

test("sha256 is stable hex", () => {
  assert.equal(u.sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("formatDuration matches the app's export format", () => {
  assert.equal(u.formatDuration(1350), "22 min 30 sec");
  assert.equal(u.formatDuration(0), "0 min 0 sec");
});
