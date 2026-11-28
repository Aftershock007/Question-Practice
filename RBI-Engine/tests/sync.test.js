"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const h = require("./helpers");
const { EVAL_PROMPT_TEMPLATE, fillTemplate } = require("../src/rubric-text");

const PROMPT_JS = path.join(h.APP_DIR, "prompt.js");

test("the engine's rubric text equals EVAL_PROMPT_TEMPLATE in the app's prompt.js", { skip: !fs.existsSync(PROMPT_JS) }, () => {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(PROMPT_JS, "utf8") + "\n;globalThis.__T = EVAL_PROMPT_TEMPLATE;", ctx);
  assert.equal(EVAL_PROMPT_TEMPLATE, ctx.__T, "prompt.js changed: copy its EVAL_PROMPT_TEMPLATE into RBI-Engine/src/rubric-text.js");
});

test("fillTemplate replaces known keys and leaves unknown ones", () => {
  assert.equal(fillTemplate("{{A}} and {{B}}", { A: 1 }), "1 and {{B}}");
  assert.ok(EVAL_PROMPT_TEMPLATE.includes("{{ANSWER}}"));
});

const SITE_MARKS = path.join(h.APP_DIR, "answer-marks.js");
const ENGINE_MARKS = path.join(__dirname, "..", "src", "answer-marks.js");

test("the site's answer-marks.js is byte-identical to the engine's copy", { skip: !fs.existsSync(path.join(h.APP_DIR, "index.html")) }, () => {
  assert.ok(fs.existsSync(SITE_MARKS), "answer-marks.js is missing from the site folder");
  assert.equal(fs.readFileSync(SITE_MARKS, "utf8"), fs.readFileSync(ENGINE_MARKS, "utf8"), "copy RBI-Engine/src/answer-marks.js to the repo root (or the other way round): the two files must stay identical");
});

test("answer-marks.js runs as a classic browser script and sets window.AnswerMarks", () => {
  const ctx = vm.createContext({ window: {}, self: undefined });
  ctx.self = ctx.window;
  vm.runInContext(fs.readFileSync(ENGINE_MARKS, "utf8"), ctx);
  assert.equal(typeof ctx.window.AnswerMarks.findSpan, "function");
  assert.equal(typeof ctx.window.AnswerMarks.buildMarks, "function");
});
