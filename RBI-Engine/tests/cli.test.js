"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const h = require("./helpers");
const pkg = require("../package.json");

const RBI = path.join(__dirname, "..", "rbi.js");

function sandbox() {
  const dir = h.tempDir("rbi-engine-cli-");
  return {
    dir,
    env: {
      PATH: process.env.PATH,
      HOME: dir,
      USERPROFILE: dir,
      NO_COLOR: "1",
      RBI_ENGINE_DATA: path.join(dir, "data"),
      RBI_ENGINE_KEYS: path.join(dir, "keys.json"),
      RBI_ENGINE_REPORTS: path.join(dir, "reports"),
      RBI_ENGINE_ANSWERS: path.join(dir, "answers")
    }
  };
}

function run(sb, args) {
  const r = spawnSync(process.execPath, [RBI, ...args], { env: sb.env, encoding: "utf8", timeout: 30000, cwd: sb.dir });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test("--version prints the package version", () => {
  const r = run(sandbox(), ["--version"]);
  assert.equal(r.code, 0);
  assert.equal(r.out.trim(), pkg.version);
});

test("help lists every command", () => {
  const r = run(sandbox(), ["help"]);
  assert.equal(r.code, 0);
  for (const c of ["setup", "doctor", "new", "analyse", "history", "progress", "show", "config"]) assert.match(r.out, new RegExp("\\b" + c + "\\b"), c);
});

test("help for one command shows its options", () => {
  const r = run(sandbox(), ["help", "analyse"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /--quick/);
  assert.match(r.out, /--fresh/);
});

test("new creates an answer file from the template", () => {
  const sb = sandbox();
  const r = run(sb, ["new", "--paper", "FM", "--marks", "10", "--name", "test"]);
  assert.equal(r.code, 0, r.err);
  const files = fs.readdirSync(path.join(sb.dir, "answers"));
  assert.equal(files.length, 1);
  assert.match(files[0], /^\d{4}-\d{2}-\d{2}-test\.txt$/);
  const text = fs.readFileSync(path.join(sb.dir, "answers", files[0]), "utf8");
  assert.match(text, /^Paper: FM$/m);
  assert.match(text, /^Marks: 10$/m);
  assert.match(text, /^Word limit: 400$/m);
  assert.match(r.out, /analyse/);
  const again = run(sb, ["new", "--paper", "FM", "--marks", "10", "--name", "test"]);
  assert.equal(again.code, 0);
  assert.equal(fs.readdirSync(path.join(sb.dir, "answers")).length, 2);
});

test("analyse without an API key stops with setup advice and exit code 2", () => {
  const r = run(sandbox(), ["analyse", path.join(__dirname, "..", "examples", "sample-esi-15m.txt")]);
  assert.equal(r.code, 2);
  assert.match(r.err, /rbi\.js setup/);
});

test("analyse of a missing file names the file and exits 1", () => {
  const r = run(sandbox(), ["analyse", "missing.txt"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /missing\.txt/);
});

test("analyse without a file explains what to give", () => {
  const r = run(sandbox(), ["analyse"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /Give the answer file/);
});

test("config set saves a setting that config then shows", () => {
  const sb = sandbox();
  assert.equal(run(sb, ["config", "set", "runs", "4"]).code, 0);
  const r = run(sb, ["config"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /runs\s+4/);
  assert.match(r.out, /gemini-4-neon/);
});

test("config set rejects a bad value", () => {
  const r = run(sandbox(), ["config", "set", "runs", "9"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /runs must be a whole number from 1 to 5/);
});

test("an unknown option exits 1 with a hint", () => {
  const r = run(sandbox(), ["analyse", "--fast", "x.txt"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /Unknown option --fast/);
  assert.match(r.err, /help analyse/);
});

test("an unknown command exits 1 with a hint", () => {
  const r = run(sandbox(), ["grade", "x.txt"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /Unknown command "grade"/);
});

test("history, progress and show explain that nothing has been analysed yet", () => {
  const sb = sandbox();
  for (const c of ["history", "progress", "show"]) {
    const r = run(sb, [c]);
    assert.equal(r.code, 0, c);
    assert.match(r.out, /No analyses yet/, c);
  }
});

test("doctor --offline reports the missing key and exits 2", () => {
  const r = run(sandbox(), ["doctor", "--offline"]);
  assert.equal(r.code, 2);
  assert.match(r.out, /Node\.js/);
  assert.match(r.out, /no API key/i);
});

test("setup without a terminal explains how to set the key instead", () => {
  const r = run(sandbox(), ["setup"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /GEMINI_API_KEY/);
});
