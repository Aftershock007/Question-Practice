"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const h = require("./helpers");
const { finalizeQuestion, fromParts } = require("../src/input");
const { mergeSettings } = require("../src/config");
const { createCache, createSchemeStore, createLimiter, requestKey } = require("../src/cache");
const { analyseQuestion, analyseQuestions } = require("../src/pipeline");
const { AIError } = require("../src/ai");

const LONG = "INTRODUCTION\nIndia adopted inflation targeting in 2016 and the committee sets the repo rate.\n\n" +
  "MERITS AND LIMITS\n" + "Food supply shocks limit monetary policy in India because food has a large weight. ".repeat(34).trim() +
  "\n\nWAY FORWARD\nImprove supply chains and transmission.";

function question(answer = LONG, over = {}) {
  return finalizeQuestion(Object.assign(fromParts({ question: "Critically examine inflation targeting. Suggest measures.", answer, model: "FIT began in 2016." }), { paper: "ESI", marks: 15, wordLimit: 600 }, over), {});
}

function deps(dir, gen, over = {}) {
  return Object.assign({
    settings: mergeSettings({}),
    keys: { gemini: "test-key" },
    env: {},
    cache: createCache(path.join(dir, "cache")),
    schemes: createSchemeStore(path.join(dir, "schemes")),
    limiter: createLimiter(3),
    generate: gen
  }, over);
}

function stable(result) {
  const r = JSON.parse(JSON.stringify(result));
  delete r.status;
  return r;
}

test("the test answer sits in the full word band", () => {
  const q = question();
  assert.ok(q.words >= 492 && q.words <= 624, String(q.words));
});

test("a full analysis makes 7 calls: checklist, language, 3 gradings, coach and summary", async () => {
  const dir = h.tempDir();
  const gen = h.fakeGenerate();
  const r = await analyseQuestion(question(), deps(dir, gen));
  assert.equal(gen.count(), 7);
  assert.deepEqual(["scheme", "language", "score", "coach", "synthesis"].map(p => gen.count(p)), [1, 1, 3, 1, 1]);
  assert.equal(r.marks.consistency.runs.length, 3);
  assert.equal(r.marks.score, 7.5);
  assert.equal(r.language.issues.length, 1);
  assert.equal(r.coach.outlineMatch.length, 3);
  assert.equal(r.coaching.fallback, false);
  assert.equal(r.status.calls, 7);
  assert.deepEqual(r.status.failed, []);
  assert.ok(r.mechanical.length >= 0);
  assert.equal(r.scheme.points.length, 4);
});

test("running the same analysis again makes no calls and gives the same result", async () => {
  const dir = h.tempDir();
  const first = await analyseQuestion(question(), deps(dir, h.fakeGenerate()));
  const gen = h.fakeGenerate();
  const second = await analyseQuestion(question(), deps(dir, gen));
  assert.equal(gen.count(), 0);
  assert.deepEqual(stable(second), stable(first));
  assert.equal(second.status.cached, 7);
});

test("fresh asks the AI again but keeps the saved checklist", async () => {
  const dir = h.tempDir();
  await analyseQuestion(question(), deps(dir, h.fakeGenerate()));
  const gen = h.fakeGenerate();
  await analyseQuestion(question(), deps(dir, gen, { fresh: true }));
  assert.equal(gen.count(), 6);
  assert.equal(gen.count("scheme"), 0);
  const gen2 = h.fakeGenerate();
  await analyseQuestion(question(), deps(dir, gen2, { fresh: true, rebuildChecklist: true }));
  assert.equal(gen2.count(), 7);
});

test("a failing coach pass still gives a report with every other part", async () => {
  const gen = h.fakeGenerate({ fail: { coach: new AIError("overloaded", "busy") } });
  const r = await analyseQuestion(question(), deps(h.tempDir(), gen));
  assert.deepEqual(r.status.failed.map(f => [f.pass, f.kind]), [["coach", "overloaded"]]);
  assert.equal(r.coach, null);
  assert.ok(r.marks && r.language && r.coaching);
  assert.equal(r.status.fatal, null);
});

test("a quota error stops the passes that have not started and says which are missing", async () => {
  const gen = h.fakeGenerate({ fail: { language: new AIError("quota", "daily limit") } });
  const r = await analyseQuestion(question(), deps(h.tempDir(), gen));
  assert.equal(r.status.fatal.kind, "quota");
  assert.ok(r.status.skipped.includes("coach"), JSON.stringify(r.status.skipped));
  assert.ok(r.status.skipped.includes("summary"), JSON.stringify(r.status.skipped));
  assert.equal(r.coaching.fallback, true);
  assert.equal(gen.count("coach"), 0);
  assert.equal(gen.count("synthesis"), 0);
});

test("running again after a quota error finishes only the missing passes", async () => {
  const dir = h.tempDir();
  await analyseQuestion(question(), deps(dir, h.fakeGenerate({ fail: { language: new AIError("quota", "daily limit") } })));
  const gen = h.fakeGenerate();
  const r = await analyseQuestion(question(), deps(dir, gen));
  assert.equal(gen.count("scheme"), 0);
  assert.equal(gen.count("language"), 1);
  assert.equal(r.status.fatal, null);
  assert.equal(r.coaching.fallback, false);
});

test("an empty answer makes no calls and scores zero", async () => {
  const gen = h.fakeGenerate();
  const r = await analyseQuestion(question(""), deps(h.tempDir(), gen));
  assert.equal(gen.count(), 0);
  assert.equal(r.marks.score, 0);
  assert.equal(r.marks.notAttempted, true);
  assert.match(r.coaching.summary, /did not write anything/);
});

test("an answer under 60 words gets one grading, zero marks and full feedback", async () => {
  const gen = h.fakeGenerate();
  const r = await analyseQuestion(question("India adopted inflation targeting in 2016. The committee sets the repo rate."), deps(h.tempDir(), gen));
  assert.equal(gen.count("score"), 1);
  assert.equal(r.marks.score, 0);
  assert.equal(r.marks.autoFail, true);
  assert.equal(gen.count(), 5);
});

test("runs that disagree trigger two more runs and the median is used", async () => {
  const sets = { 1: [0.5, 0.5, 0.5, 0.25, 0.25], 2: [1.25, 1.5, 1.5, 1, 0.75], 3: [2, 2.5, 2.25, 1.5, 0.75] };
  const gen = h.fakeGenerate({ awards: n => sets[n] || sets[2] });
  const r = await analyseQuestion(question(), deps(h.tempDir(), gen));
  assert.equal(gen.count("score"), 5);
  assert.deepEqual(r.marks.consistency.runs, [2, 6, 9, 6, 6]);
  assert.equal(r.marks.score, 6);
  assert.equal(r.marks.consistency.extraRuns, 2);
});

test("quick mode makes a single grading run", async () => {
  const gen = h.fakeGenerate();
  const r = await analyseQuestion(question(), deps(h.tempDir(), gen, { quick: true }));
  assert.equal(gen.count("score"), 1);
  assert.equal(r.marks.consistency.method, "one full grading");
});

test("a missing key stops before any call", async () => {
  const gen = h.fakeGenerate();
  await assert.rejects(analyseQuestion(question(), deps(h.tempDir(), gen, { keys: {} })), err => err.kind === "not_configured");
  assert.equal(gen.count(), 0);
});

test("several questions share one limiter and all finish", async () => {
  const gen = h.fakeGenerate();
  const results = await analyseQuestions([question(), question(LONG + "\nOne more line.")], deps(h.tempDir(), gen));
  assert.equal(results.length, 2);
  assert.equal(gen.count("scheme"), 1);
  assert.equal(gen.count(), 13);
});

test("events report each pass", async () => {
  const events = [];
  await analyseQuestion(question(), deps(h.tempDir(), h.fakeGenerate()), { onEvent: e => events.push(e) });
  const done = events.filter(e => e.status === "done").map(e => e.pass);
  for (const p of ["checklist", "language", "grading 1", "coach", "summary"]) assert.ok(done.includes(p), p + " in " + done.join(","));
});

test("the cache stores and reads replies and ignores a damaged file", () => {
  const dir = h.tempDir();
  const c = createCache(dir);
  const key = requestKey({ a: 1 });
  assert.equal(c.get(key), null);
  c.set(key, { data: { x: 1 } });
  assert.deepEqual(c.get(key), { data: { x: 1 } });
  fs.writeFileSync(path.join(dir, key + ".json"), "{bad");
  assert.equal(c.get(key), null);
  assert.notEqual(requestKey({ a: 1 }), requestKey({ a: 2 }));
});

test("the limiter never runs more than n tasks at once", async () => {
  const limit = createLimiter(2);
  let active = 0;
  let peak = 0;
  await Promise.all(Array.from({ length: 6 }, () => limit(async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(r => setTimeout(r, 5));
    active--;
  })));
  assert.equal(peak, 2);
});
