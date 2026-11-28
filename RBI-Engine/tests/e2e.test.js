"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const h = require("./helpers");

const ROOT = path.join(__dirname, "..");
const RBI = path.join(ROOT, "rbi.js");
const SAMPLE = path.join(ROOT, "examples", "sample-esi-15m.txt");

function geminiMock() {
  let n = 0;
  return h.startMockServer(rec => {
    n++;
    const system = rec.body && rec.body.systemInstruction ? rec.body.systemInstruction.parts[0].text : "";
    const prompt = rec.body && rec.body.contents ? rec.body.contents[0].parts[0].text : "";
    const pass = h.detectPass(system);
    const count = rec.passCounts || 0;
    const obj = h.fakeReply(pass, { system, prompt }, {}, count + n);
    return { json: h.geminiReply(JSON.stringify(obj), { modelVersion: "mock-1" }) };
  });
}

function sandbox(mockUrl) {
  const dir = h.tempDir("rbi-engine-e2e-");
  return {
    dir,
    env: {
      PATH: process.env.PATH,
      HOME: dir,
      USERPROFILE: dir,
      NO_COLOR: "1",
      GEMINI_API_KEY: "test-key-123456",
      RBI_GEMINI_BASE: mockUrl,
      RBI_ENGINE_DATA: path.join(dir, "data"),
      RBI_ENGINE_KEYS: path.join(dir, "keys.json"),
      RBI_ENGINE_REPORTS: path.join(dir, "reports"),
      RBI_ENGINE_ANSWERS: path.join(dir, "answers")
    }
  };
}

function run(sb, args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [RBI, ...args], { env: sb.env, cwd: sb.dir });
    let out = "";
    let err = "";
    child.stdout.on("data", d => { out += d; });
    child.stderr.on("data", d => { err += d; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 60000);
    child.on("close", code => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

function reportDirs(sb) {
  const dir = path.join(sb.dir, "reports");
  return fs.existsSync(dir) ? fs.readdirSync(dir).map(d => path.join(dir, d)) : [];
}

test("analysing the sample through a mock Gemini writes the report, and a second run reuses every reply", async () => {
  const server = await geminiMock();
  try {
    const sb = sandbox(server.url);
    const first = await run(sb, ["analyse", SAMPLE]);
    assert.equal(first.code, 0, first.err);
    assert.match(first.out, /RBI-Engine analysis: sample-esi-15m/);
    assert.match(first.out, /Full report: .*report\.html/);
    assert.match(first.err, /Q1 checklist: done/);
    assert.equal(server.requests.length, 7);
    assert.equal(server.requests[0].headers["x-goog-api-key"], "test-key-123456");
    assert.match(server.requests[0].url, /^\/models\/gemini-4-hydrogen:generateContent$/);
    assert.ok(server.requests.some(r => /gemini-4-neon/.test(r.url)));
    const dirs = reportDirs(sb);
    assert.equal(dirs.length, 1);
    for (const f of ["report.html", "report.md", "report.json"]) assert.ok(fs.existsSync(path.join(dirs[0], f)), f);
    const session = JSON.parse(fs.readFileSync(path.join(dirs[0], "report.json"), "utf8"));
    assert.equal(session.reports.length, 1);
    assert.equal(session.reports[0].question.marks, 15);
    assert.equal(session.reports[0].answer.words, 400);

    const second = await run(sb, ["analyse", SAMPLE]);
    assert.equal(second.code, 0, second.err);
    assert.equal(server.requests.length, 7);
    assert.match(second.err, /reused from the cache/);
    const session2 = JSON.parse(fs.readFileSync(path.join(reportDirs(sb)[0], "report.json"), "utf8"));
    assert.deepEqual(session2.reports[0].marks, session.reports[0].marks);

    const history = JSON.parse(fs.readFileSync(path.join(sb.dir, "data", "history.json"), "utf8"));
    assert.equal(history.entries.length, 1);
    const hist = await run(sb, ["history"]);
    assert.match(hist.out, /ESI/);
    const show = await run(sb, ["show", "1"]);
    assert.equal(show.code, 0);
    assert.match(show.out, /RBI-Engine analysis/);
  } finally {
    await server.close();
  }
});

test("an app FullTest export gives a two-question report with a test summary and a blank question at zero", async () => {
  const server = await geminiMock();
  try {
    const sb = sandbox(server.url);
    const r = await run(sb, ["analyse", path.join(__dirname, "fixtures", "app-full.txt"), "--json"]);
    assert.equal(r.code, 0, r.err);
    const session = JSON.parse(r.out);
    assert.equal(session.reports.length, 2);
    assert.ok(session.testSummary);
    assert.equal(session.reports[1].marks.notAttempted, true);
    assert.equal(session.reports[1].marks.score, 0);
    assert.equal(session.reports[0].question.paper, "ESI");
    assert.ok(session.reports[0].answer.words < 60);
    assert.equal(session.reports[0].marks.autoFail, true);
    assert.equal(session.reports[0].marks.score, 0);
    assert.equal(server.requests.length, 5);
  } finally {
    await server.close();
  }
});

test("a daily quota error saves what finished, explains the problem and exits 3", async () => {
  const server = await h.startMockServer(rec => {
    const system = rec.body && rec.body.systemInstruction ? rec.body.systemInstruction.parts[0].text : "";
    const pass = h.detectPass(system);
    if (pass === "language") return { status: 429, json: { error: { code: 429, message: "Quota exceeded for requests per day", details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] } } };
    const prompt = rec.body.contents[0].parts[0].text;
    return { json: h.geminiReply(JSON.stringify(h.fakeReply(pass, { system, prompt }, {}, 1))) };
  });
  try {
    const sb = sandbox(server.url);
    const r = await run(sb, ["analyse", SAMPLE]);
    assert.equal(r.code, 3, r.err);
    assert.match(r.err, /Quota used up/);
    assert.match(r.err, /run the same command again/i);
    assert.equal(reportDirs(sb).length, 1);
    assert.match(r.out, /Not finished/);
  } finally {
    await server.close();
  }
});
