"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const h = require("./helpers");
const { finalizeQuestion, fromParts } = require("../src/input");
const { mergeSettings } = require("../src/config");
const { createCache, createSchemeStore, createLimiter } = require("../src/cache");
const { analyseQuestion } = require("../src/pipeline");
const { buildReport, buildSession, writeSession } = require("../src/report/build");
const { renderHTML } = require("../src/report/html");

const EVIL = "<script>alert(1)</script>";
const ANSWER = "INTRODUCTION\nIndia adopted inflation targeting in 2016 " + EVIL + " and the committee sets the repo rate.\n\nMERITS AND LIMITS\n" +
  "Food supply shocks limit monetary policy in India because food has a large weight. ".repeat(34).trim() + "\n\nWAY FORWARD\nImprove supply chains.";

async function session(answers) {
  const dir = h.tempDir();
  const deps = { settings: mergeSettings({}), keys: { gemini: "k" }, env: {}, cache: createCache(path.join(dir, "c")), schemes: createSchemeStore(path.join(dir, "s")), limiter: createLimiter(3), generate: h.fakeGenerate() };
  const reports = [];
  for (let i = 0; i < answers.length; i++) {
    const q = finalizeQuestion(Object.assign(fromParts({ question: "Critically examine inflation targeting " + EVIL + ".", answer: answers[i], model: "FIT began in 2016." }), { paper: "ESI", marks: 15, wordLimit: 600, index: i + 1 }), {});
    reports.push(buildReport(await analyseQuestion(q, deps)));
  }
  return buildSession(reports, { file: "/x/answer.txt", createdAt: "2026-11-28T10:00:00.000Z" });
}

test("user text is escaped everywhere", async () => {
  const html = renderHTML(await session([ANSWER]));
  assert.equal(html.includes(EVIL), false);
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});

test("the page is self-contained: no remote scripts, styles or fonts", async () => {
  const html = renderHTML(await session([ANSWER]));
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<link[^>]+href="(?!data:)/i);
  assert.doesNotMatch(html, /@import|url\(\s*['"]?https?:/i);
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<meta name="viewport"/);
});

test("every section of the Markdown report is in the page", async () => {
  const html = renderHTML(await session([ANSWER]));
  for (const s of ["Verdict", "Summary and priorities", "Your answer, marked", "Why you lost", "Reading the question", "Marks breakdown", "Content", "Language", "Structure and framing", "Model answer", "Improvement plan", "Technical details"]) {
    assert.ok(html.includes(">" + s + "<") || html.includes(">" + s + " "), s);
  }
});

test("checklist verdicts are coloured chips with the classes full, partial and missing", async () => {
  const s = await session([ANSWER]);
  ["full", "partial", "missing"].forEach((c, i) => { s.reports[0].marks.checklist[i].coverage = c; });
  const html = renderHTML(s);
  assert.match(html, /class="chip full"/);
  assert.match(html, /class="chip partial"/);
  assert.match(html, /class="chip missing"/);
});

test("the marked answer shows each kind of mark, links it to its explanation and the ledger explains the marks lost", async () => {
  const s = await session([ANSWER]);
  const html = renderHTML(s);
  const i = s.reports[0].language.issues[0];
  assert.ok(html.includes("<del class=\"mk-old\">" + i.wrong + "</del><ins class=\"mk-new\">" + i.fix + "</ins><a class=\"mk-ref\" href=\"#q1-L1\">L1</a>"));
  assert.ok(html.includes("<li id=\"q1-L1\">"));
  assert.ok(html.includes("class=\"mk mk-frame\""));
  assert.ok(html.includes("class=\"mk mk-add\""));
  assert.ok(html.includes("<ul class=\"mk-legend\">"));
  assert.ok(html.includes("<table class=\"mk-ltable\">"));
  assert.ok(html.includes("id=\"q1-loss-1\""));
  assert.match(html, /\.mk-frame > \.mk-old \{/);
  assert.match(html, /print-color-adjust: exact/);
  assert.doesNotMatch(html, /Rewrites of your weakest sentences|What would lift this answer/);
});

test("a two-question session lists the questions with their marks at the top", async () => {
  const html = renderHTML(await session([ANSWER, ANSWER + "\nOne more line."]));
  assert.match(html, /<nav class="toc"/);
  assert.match(html, /href="#q2"/);
  assert.match(html, /Test summary/);
});

test("writeSession writes the HTML, Markdown and JSON files", async () => {
  const s = await session([ANSWER]);
  const out = writeSession(s, h.tempDir());
  for (const f of [out.html, out.md, out.json]) assert.ok(fs.existsSync(f), f);
  assert.equal(path.dirname(out.html), out.dir);
  assert.deepEqual(JSON.parse(fs.readFileSync(out.json, "utf8")), JSON.parse(JSON.stringify(s)));
  assert.match(fs.readFileSync(out.md, "utf8"), /^# RBI-Engine report/);
});
