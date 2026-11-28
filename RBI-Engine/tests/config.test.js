"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { enginePaths } = require("../src/paths");
const cfg = require("../src/config");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rbi-engine-cfg-"));
}

test("RBI_ENGINE_DATA moves data, cache, schemes, history and settings", () => {
  const dir = tempDir();
  const p = enginePaths({ RBI_ENGINE_DATA: dir });
  assert.equal(p.data, dir);
  assert.equal(p.cache, path.join(dir, "cache"));
  assert.equal(p.schemes, path.join(dir, "schemes"));
  assert.equal(p.history, path.join(dir, "history.json"));
  assert.equal(p.settings, path.join(dir, "settings.json"));
});

test("default folders live inside RBI-Engine and the keys file in the home folder", () => {
  const p = enginePaths({});
  const root = path.resolve(__dirname, "..");
  assert.equal(p.root, root);
  assert.equal(p.data, path.join(root, "data"));
  assert.equal(p.reports, path.join(root, "reports"));
  assert.equal(p.answers, path.join(root, "answers"));
  assert.equal(p.keysFile, path.join(os.homedir(), ".rbi-engine", "keys.json"));
});

test("RBI_ENGINE_KEYS, RBI_ENGINE_REPORTS and RBI_ENGINE_ANSWERS move those paths", () => {
  const dir = tempDir();
  const p = enginePaths({
    RBI_ENGINE_KEYS: path.join(dir, "k.json"),
    RBI_ENGINE_REPORTS: path.join(dir, "r"),
    RBI_ENGINE_ANSWERS: path.join(dir, "a")
  });
  assert.equal(p.keysFile, path.join(dir, "k.json"));
  assert.equal(p.reports, path.join(dir, "r"));
  assert.equal(p.answers, path.join(dir, "a"));
});

test("default settings use the same two Gemini engines as the app", () => {
  const s = cfg.loadSettings(enginePaths({ RBI_ENGINE_DATA: tempDir() }));
  assert.deepEqual(s.engines.check, { provider: "gemini", model: "gemini-4-hydrogen", thinking: "low", temperature: null });
  assert.deepEqual(s.engines.grade, { provider: "gemini", model: "gemini-4-neon", thinking: "high", temperature: null });
  assert.deepEqual(s.passes, { scheme: "check", language: "grade", score: "grade", coach: "grade", synthesis: "check" });
  assert.equal(s.runs, 3);
  assert.equal(s.maxRuns, 5);
  assert.equal(s.concurrency, 3);
  assert.equal(s.timeoutSeconds, 420);
  assert.deepEqual(s.baseUrls, {});
});

test("a settings file overrides defaults and invalid values fall back to defaults", () => {
  const dir = tempDir();
  const p = enginePaths({ RBI_ENGINE_DATA: dir });
  fs.writeFileSync(p.settings, JSON.stringify({ runs: 5, concurrency: 99, engines: { grade: { model: "gemini-x", thinking: "extreme" } } }));
  const s = cfg.loadSettings(p);
  assert.equal(s.runs, 5);
  assert.equal(s.concurrency, 3);
  assert.equal(s.engines.grade.model, "gemini-x");
  assert.equal(s.engines.grade.thinking, "high");
  assert.equal(s.engines.grade.provider, "gemini");
});

test("a corrupt settings file gives a clear error naming the file", () => {
  const dir = tempDir();
  const p = enginePaths({ RBI_ENGINE_DATA: dir });
  fs.writeFileSync(p.settings, "{ not json");
  assert.throws(() => cfg.loadSettings(p), err => err.message.includes("settings.json") && /delete it/i.test(err.message));
});

test("saveSettings then loadSettings round-trips", () => {
  const p = enginePaths({ RBI_ENGINE_DATA: path.join(tempDir(), "nested") });
  const s = cfg.setSetting(cfg.loadSettings(p), "runs", "4");
  cfg.saveSettings(p, s);
  assert.equal(cfg.loadSettings(p).runs, 4);
});

test("environment keys beat the keys file", () => {
  const dir = tempDir();
  const p = enginePaths({ RBI_ENGINE_KEYS: path.join(dir, "keys.json") });
  fs.writeFileSync(p.keysFile, JSON.stringify({ gemini: "file-key-123456", openrouter: "sk-or-file" }));
  const keys = cfg.loadKeys(p, { GEMINI_API_KEY: "env-key-123456" });
  assert.equal(keys.gemini, "env-key-123456");
  assert.equal(keys.openrouter, "sk-or-file");
});

test("GOOGLE_API_KEY is used for Gemini when GEMINI_API_KEY is absent", () => {
  const p = enginePaths({ RBI_ENGINE_KEYS: path.join(tempDir(), "none.json") });
  assert.equal(cfg.loadKeys(p, { GOOGLE_API_KEY: "g-key-123456" }).gemini, "g-key-123456");
});

test("placeholder DEMO_ keys and blank keys count as missing", () => {
  const dir = tempDir();
  const p = enginePaths({ RBI_ENGINE_KEYS: path.join(dir, "keys.json") });
  fs.writeFileSync(p.keysFile, JSON.stringify({ gemini: "DEMO_GEMINI_API_KEY", openai: "  " }));
  const keys = cfg.loadKeys(p, { ANTHROPIC_API_KEY: "DEMO_KEY" });
  assert.equal(keys.gemini, undefined);
  assert.equal(keys.openai, undefined);
  assert.equal(keys.anthropic, undefined);
});

test("keySource says where each key came from", () => {
  const dir = tempDir();
  const p = enginePaths({ RBI_ENGINE_KEYS: path.join(dir, "keys.json") });
  fs.writeFileSync(p.keysFile, JSON.stringify({ openrouter: "sk-or-file" }));
  assert.equal(cfg.keySource(p, { GEMINI_API_KEY: "x-123456789" }, "gemini"), "environment variable GEMINI_API_KEY");
  assert.equal(cfg.keySource(p, {}, "openrouter"), "keys file " + p.keysFile);
  assert.equal(cfg.keySource(p, {}, "openai"), "");
});

test("saveKey stores the key and later loads it", () => {
  const dir = tempDir();
  const p = enginePaths({ RBI_ENGINE_KEYS: path.join(dir, "sub", "keys.json") });
  cfg.saveKey(p, "gemini", "AIzaSaved123456");
  assert.equal(cfg.loadKeys(p, {}).gemini, "AIzaSaved123456");
  cfg.saveKey(p, "gemini", "");
  assert.equal(cfg.loadKeys(p, {}).gemini, undefined);
});

test("saveKey makes the keys file readable only by the user", { skip: process.platform === "win32" }, () => {
  const dir = tempDir();
  const p = enginePaths({ RBI_ENGINE_KEYS: path.join(dir, "keys.json") });
  cfg.saveKey(p, "gemini", "AIzaSaved123456");
  assert.equal(fs.statSync(p.keysFile).mode & 0o777, 0o600);
});

test("maskKey shows only the first and last four characters", () => {
  assert.equal(cfg.maskKey("AIzaSyABCDEFG123456"), "AIza...3456");
  assert.equal(cfg.maskKey("short"), "****");
  assert.equal(cfg.maskKey(""), "");
});

test("setSetting changes engine fields, numbers and pass engines", () => {
  const base = cfg.loadSettings(enginePaths({ RBI_ENGINE_DATA: tempDir() }));
  const s1 = cfg.setSetting(base, "grade.model", "gemini-pro-x");
  assert.equal(s1.engines.grade.model, "gemini-pro-x");
  assert.equal(base.engines.grade.model, "gemini-4-neon");
  assert.equal(cfg.setSetting(base, "runs", "4").runs, 4);
  assert.equal(cfg.setSetting(base, "check.temperature", "0.2").engines.check.temperature, 0.2);
  assert.equal(cfg.setSetting(base, "check.temperature", "none").engines.check.temperature, null);
  assert.equal(cfg.setSetting(base, "passes.language", "check").passes.language, "check");
  assert.equal(cfg.setSetting(base, "baseUrls.custom", "http://localhost:1234/v1").baseUrls.custom, "http://localhost:1234/v1");
});

test("setSetting rejects unknown keys and bad values with a helpful message", () => {
  const base = cfg.loadSettings(enginePaths({ RBI_ENGINE_DATA: tempDir() }));
  assert.throws(() => cfg.setSetting(base, "colour", "blue"), /Unknown setting "colour"/);
  assert.throws(() => cfg.setSetting(base, "runs", "9"), /runs/);
  assert.throws(() => cfg.setSetting(base, "grade.thinking", "max"), /low, medium, high/);
  assert.throws(() => cfg.setSetting(base, "passes.score", "fast"), /check or grade/);
});

test("engineForPass maps each pass to engine 1 (check) or engine 2 (grade)", () => {
  const s = cfg.loadSettings(enginePaths({ RBI_ENGINE_DATA: tempDir() }));
  assert.equal(cfg.engineForPass(s, "scheme"), "check");
  assert.equal(cfg.engineForPass(s, "synthesis"), "check");
  assert.equal(cfg.engineForPass(s, "language"), "grade");
  assert.equal(cfg.engineForPass(s, "score"), "grade");
  assert.equal(cfg.engineForPass(s, "coach"), "grade");
});
