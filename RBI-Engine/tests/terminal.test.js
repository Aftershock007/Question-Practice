"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const h = require("./helpers");
const ui = require("../src/ui");
const { renderSummary, renderFull } = require("../src/report/terminal");
const { finalizeQuestion, fromParts } = require("../src/input");
const { mergeSettings } = require("../src/config");
const { createCache, createSchemeStore, createLimiter } = require("../src/cache");
const { analyseQuestion } = require("../src/pipeline");
const { buildReport, buildSession } = require("../src/report/build");

const ANSWER = "INTRODUCTION\nIndia adopted inflation targeting in 2016 and the committee sets the repo rate.\n\nMERITS AND LIMITS\n" +
  "Food supply shocks limit monetary policy in India because food has a large weight. ".repeat(34).trim() + "\n\nWAY FORWARD\nImprove supply chains.";

async function session(n = 1) {
  const dir = h.tempDir();
  const deps = { settings: mergeSettings({}), keys: { gemini: "k" }, env: {}, cache: createCache(path.join(dir, "c")), schemes: createSchemeStore(path.join(dir, "s")), limiter: createLimiter(3), generate: h.fakeGenerate() };
  const reports = [];
  for (let i = 1; i <= n; i++) {
    const q = finalizeQuestion(Object.assign(fromParts({ question: "Critically examine inflation targeting.", answer: ANSWER + (i > 1 ? "\nExtra " + i : ""), model: "FIT began in 2016." }), { paper: "ESI", marks: 15, wordLimit: 600, seconds: 1500, index: i }), {});
    reports.push(buildReport(await analyseQuestion(q, deps)));
  }
  return buildSession(reports, { file: "/x/answer.txt" });
}

test("colour follows the terminal, NO_COLOR and FORCE_COLOR", () => {
  assert.equal(ui.colorEnabled({ isTTY: true }, {}), true);
  assert.equal(ui.colorEnabled({ isTTY: true }, { NO_COLOR: "1" }), false);
  assert.equal(ui.colorEnabled({ isTTY: false }, {}), false);
  assert.equal(ui.colorEnabled({ isTTY: false }, { FORCE_COLOR: "1" }), true);
  assert.equal(ui.colorEnabled({ isTTY: true }, { TERM: "dumb" }), false);
});

test("paint adds escape codes only when colour is on", () => {
  assert.equal(ui.paint("bold", "x", false), "x");
  assert.equal(ui.paint("red", "x", true), "\x1b[31mx\x1b[0m");
});

test("labels keep their column and never run into the value", async () => {
  const out = renderSummary(await session(), { color: false, width: 100, paths: {} });
  assert.match(out, /^    Score {10}\S/m);
  assert.match(out, /^    Engine checks  \S/m);
});

test("the summary has no escape codes when colour is off", async () => {
  const out = renderSummary(await session(), { color: false, width: 90, paths: { html: "/r/report.html" } });
  assert.equal(out.includes("\x1b["), false);
});

test("the summary shows the verdict, consistency, losses, language counts, priorities and the report path", async () => {
  const s = await session();
  const r = s.reports[0];
  const out = renderSummary(s, { color: false, width: 100, paths: { html: "/r/report.html", md: "/r/report.md" } });
  assert.ok(out.includes(r.marks.score + " / 15"));
  assert.ok(out.includes("grade " + r.marks.grade));
  assert.ok(out.includes(r.marks.projection[0] + " - " + r.marks.projection[1] + " / 15"));
  assert.match(out, /median of 3 independent gradings/i);
  for (const l of r.lost.slice(0, 3)) assert.ok(out.includes(l.what), l.what);
  assert.match(out, /1 language mistake/);
  for (const p of r.coaching.priorities.slice(0, 3)) assert.ok(out.includes(p.title), p.title);
  assert.ok(out.includes("/r/report.html"));
});

test("a multi-question summary shows the test total", async () => {
  const s = await session(2);
  const out = renderSummary(s, { color: false, width: 100, paths: {} });
  assert.match(out, /Test total/);
  assert.match(out, /Q2/);
});

test("the full view prints the whole report", async () => {
  const out = renderFull(await session(), { color: false });
  assert.match(out, /Marks breakdown/);
  assert.match(out, /Model answer/);
});

test("wrap never goes past the width and keeps the indent", () => {
  const text = "Inflation targeting has anchored expectations in India since 2016 but food shocks still matter a great deal. Supercalifragilisticexpialidociouswordthatistoolongtofit here.";
  const lines = ui.wrap(text, 40, "  ").split("\n");
  assert.ok(lines.length > 2);
  lines.forEach(l => assert.ok(l.length <= 40, JSON.stringify(l)));
  lines.forEach(l => assert.ok(l.startsWith("  ")));
});

test("table lines up its columns, ignoring escape codes", () => {
  const out = ui.table([["a", "bb"], [ui.paint("red", "ccc", true), "d"]]).split("\n");
  const plain = out.map(ui.stripAnsi);
  assert.equal(plain[0].indexOf("bb"), plain[1].indexOf("d"));
});

test("without a terminal the live status prints one plain line per event", () => {
  let buf = "";
  const st = ui.createStatus({ isTTY: false, write: s => { buf += s; } }, false);
  st.update({ q: 1, pass: "language", status: "running", message: "", ms: 0 });
  st.update({ q: 1, pass: "language", status: "done", message: "", ms: 1200 });
  st.update({ q: 1, pass: "coach", status: "failed", message: "busy", ms: 0 });
  st.stop();
  assert.match(buf, /Q1 language: done \(1\.2 s\)/);
  assert.match(buf, /Q1 coach: failed - busy/);
  assert.equal(buf.includes("\x1b["), false);
});
