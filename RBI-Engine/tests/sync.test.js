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
