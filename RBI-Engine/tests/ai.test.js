"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");
const ai = require("../src/ai");

const SCHEMA = { type: "object", properties: { a: { type: "number" } }, required: ["a"] };

function gemini(url, over) {
  return ai.providerConfig(Object.assign({ provider: "gemini", model: "gemini-x", thinking: "high", temperature: null }, over), { gemini: "k-123" }, { baseUrls: { gemini: url } }, {});
}

const noSleep = { sleep: async () => {}, onStatus: () => {} };

test("a Gemini request carries the key, schema, system text and thinking level", async () => {
  const s = await h.startMockServer(() => ({ json: h.geminiReply("{\"a\":1}", { modelVersion: "gemini-x-001" }) }));
  try {
    const res = await ai.generate(gemini(s.url), { system: "sys", prompt: "prompt", json: true, schema: SCHEMA }, { timeoutMs: 5000 });
    const r = s.requests[0];
    assert.equal(r.url, "/models/gemini-x:generateContent");
    assert.equal(r.headers["x-goog-api-key"], "k-123");
    assert.deepEqual(r.body.generationConfig.responseJsonSchema, SCHEMA);
    assert.equal(r.body.generationConfig.responseMimeType, "application/json");
    assert.equal(r.body.generationConfig.thinkingConfig.thinkingLevel, "high");
    assert.equal("temperature" in r.body.generationConfig, false);
    assert.equal(r.body.systemInstruction.parts[0].text, "sys");
    assert.equal(r.body.contents[0].parts[0].text, "prompt");
    assert.equal(res.text, "{\"a\":1}");
    assert.equal(res.modelUsed, "gemini-x-001");
    assert.deepEqual(res.usage, { input: 10, cached: 0, output: 5, thinking: 3 });
  } finally { await s.close(); }
});

test("a temperature setting is sent when it is set", async () => {
  const s = await h.startMockServer(() => ({ json: h.geminiReply("{\"a\":1}") }));
  try {
    await ai.generate(gemini(s.url, { temperature: 0.2 }), { system: "", prompt: "p", json: true, schema: SCHEMA }, { timeoutMs: 5000 });
    assert.equal(s.requests[0].body.generationConfig.temperature, 0.2);
  } finally { await s.close(); }
});

test("a 429 with a retry delay is retried after that delay", async () => {
  const s = await h.startMockServer((r, n) => n === 1
    ? { status: 429, json: { error: { code: 429, message: "Resource exhausted", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "0.01s" }] } } }
    : { json: h.geminiReply("{\"a\":2}") });
  const waits = [];
  try {
    const pc = gemini(s.url);
    const res = await ai.withRetries(() => ai.generate(pc, { prompt: "p", json: true, schema: SCHEMA }, { timeoutMs: 5000 }), { sleep: async ms => { waits.push(ms); }, onStatus: () => {} });
    assert.equal(res.text, "{\"a\":2}");
    assert.equal(s.requests.length, 2);
    assert.equal(waits.reduce((a, b) => a + b, 0), 1000);
  } finally { await s.close(); }
});

test("a daily quota error is not retried", async () => {
  const s = await h.startMockServer(() => ({ status: 429, json: { error: { code: 429, message: "Quota exceeded", details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] } } }));
  try {
    await assert.rejects(ai.withRetries(() => ai.generate(gemini(s.url), { prompt: "p", json: true, schema: SCHEMA }, { timeoutMs: 5000 }), noSleep), err => err.kind === "quota");
    assert.equal(s.requests.length, 1);
  } finally { await s.close(); }
});

test("a rejected key is an auth error", async () => {
  const s = await h.startMockServer(() => ({ status: 400, json: { error: { code: 400, message: "API key not valid. Please pass a valid API key.", details: [{ reason: "API_KEY_INVALID" }] } } }));
  try {
    await assert.rejects(ai.generate(gemini(s.url), { prompt: "p", json: true, schema: SCHEMA }, { timeoutMs: 5000 }), err => err.kind === "auth");
  } finally { await s.close(); }
});

test("an unknown Gemini model falls back to gemini-flash-latest", async () => {
  const s = await h.startMockServer(r => /gemini-x:/.test(r.url)
    ? { status: 404, json: { error: { code: 404, message: "models/gemini-x is not found for API version v1beta", status: "NOT_FOUND" } } }
    : { json: h.geminiReply("{\"a\":3}") });
  try {
    const res = await ai.callModel(gemini(s.url), { prompt: "p", json: true, schema: SCHEMA }, Object.assign({ timeoutMs: 5000 }, noSleep));
    assert.equal(res.text, "{\"a\":3}");
    assert.equal(res.fallbackFrom, "gemini-x");
    assert.equal(res.model, "gemini-flash-latest");
    assert.equal(s.requests[1].url, "/models/gemini-flash-latest:generateContent");
  } finally { await s.close(); }
});

test("a schema the API rejects is retried as plain JSON mode", async () => {
  const s = await h.startMockServer((r, n) => n === 1
    ? { status: 400, json: { error: { code: 400, message: "Invalid JSON payload received. Unknown name \"responseJsonSchema\" at 'generation_config'" } } }
    : { json: h.geminiReply("{\"a\":4}") });
  try {
    const res = await ai.generate(gemini(s.url), { prompt: "p", json: true, schema: SCHEMA }, { timeoutMs: 5000 });
    assert.equal(res.text, "{\"a\":4}");
    assert.equal(s.requests[1].body.generationConfig.responseMimeType, "application/json");
    assert.equal("responseJsonSchema" in s.requests[1].body.generationConfig, false);
  } finally { await s.close(); }
});

test("a busy server is retried until it answers", async () => {
  const s = await h.startMockServer((r, n) => n < 3 ? { status: 503, json: { error: { code: 503, message: "The model is overloaded." } } } : { json: h.geminiReply("{\"a\":5}") });
  try {
    const res = await ai.withRetries(() => ai.generate(gemini(s.url), { prompt: "p", json: true, schema: SCHEMA }, { timeoutMs: 5000 }), noSleep);
    assert.equal(res.text, "{\"a\":5}");
    assert.equal(s.requests.length, 3);
  } finally { await s.close(); }
});

test("a server that is too slow gives a timeout error", async () => {
  const s = await h.startMockServer(() => ({ json: h.geminiReply("{}"), delayMs: 400 }));
  try {
    await assert.rejects(ai.generate(gemini(s.url), { prompt: "p", json: true, schema: SCHEMA }, { timeoutMs: 60 }), err => err.kind === "timeout");
  } finally { await s.close(); }
});

test("a server that cannot be reached gives a network error", async () => {
  const s = await h.startMockServer(() => ({ json: {} }));
  const url = s.url;
  await s.close();
  await assert.rejects(ai.generate(gemini(url), { prompt: "p", json: true, schema: SCHEMA }, { timeoutMs: 2000 }), err => err.kind === "network");
});

test("an OpenAI-style request uses the bearer key and JSON mode", async () => {
  const s = await h.startMockServer(() => ({ json: { choices: [{ message: { content: "{\"b\":2}" }, finish_reason: "stop" }], model: "m-1", usage: { prompt_tokens: 7, completion_tokens: 4, completion_tokens_details: { reasoning_tokens: 1 } } } }));
  try {
    const pc = ai.providerConfig({ provider: "openrouter", model: "x/y" }, { openrouter: "sk-or-1" }, { baseUrls: { openrouter: s.url } }, {});
    const res = await ai.generate(pc, { system: "sys", prompt: "p", json: true }, { timeoutMs: 5000 });
    const r = s.requests[0];
    assert.equal(r.url, "/chat/completions");
    assert.equal(r.headers.authorization, "Bearer sk-or-1");
    assert.deepEqual(r.body.response_format, { type: "json_object" });
    assert.deepEqual(r.body.messages.map(m => m.role), ["system", "user"]);
    assert.equal(r.body.model, "x/y");
    assert.equal(res.text, "{\"b\":2}");
    assert.deepEqual(res.usage, { input: 7, cached: 0, output: 3, thinking: 1 });
  } finally { await s.close(); }
});

test("an Anthropic request sends the key, version and token budget", async () => {
  const s = await h.startMockServer(() => ({ json: { content: [{ type: "text", text: "{\"c\":3}" }], stop_reason: "end_turn", model: "claude-x", usage: { input_tokens: 5, output_tokens: 2 } } }));
  try {
    const pc = ai.providerConfig({ provider: "anthropic", model: "claude-x" }, { anthropic: "sk-ant-1" }, { baseUrls: { anthropic: s.url } }, {});
    const res = await ai.generate(pc, { system: "sys", prompt: "p", json: true }, { timeoutMs: 5000 });
    const r = s.requests[0];
    assert.equal(r.url, "/messages");
    assert.equal(r.headers["x-api-key"], "sk-ant-1");
    assert.equal(r.headers["anthropic-version"], "2023-06-01");
    assert.equal(r.body.system, "sys");
    assert.equal(r.body.max_tokens, 16000);
    assert.equal(res.text, "{\"c\":3}");
    assert.deepEqual(res.usage, { input: 5, cached: 0, output: 2, thinking: 0 });
  } finally { await s.close(); }
});

test("extractJSON reads fenced JSON, strips think blocks and rejects arrays", () => {
  assert.deepEqual(ai.extractJSON("Here:\n```json\n{\"x\":1}\n```"), { x: 1 });
  assert.deepEqual(ai.extractJSON("<think>hmm {no}</think>{\"x\":2}"), { x: 2 });
  assert.deepEqual(ai.extractJSON("text before {\"x\":3} after"), { x: 3 });
  assert.equal(ai.extractJSON("[1,2]"), null);
  assert.equal(ai.extractJSON("not json"), null);
});

test("providerConfig knows when a provider is ready", () => {
  assert.equal(ai.providerConfig({ provider: "gemini", model: "m" }, {}, {}, {}).ready, false);
  assert.equal(ai.providerConfig({ provider: "custom", model: "llama" }, {}, {}, {}).ready, true);
  assert.equal(ai.providerConfig({ provider: "gemini", model: "m" }, {}, {}, { RBI_GEMINI_BASE: "http://x/v1beta" }).baseUrl, "http://x/v1beta");
  assert.equal(ai.providerConfig({ provider: "gemini", model: "models/gemini-y" }, { gemini: "k" }, {}, {}).model, "gemini-y");
  assert.throws(() => ai.providerConfig({ provider: "nope", model: "m" }, {}, {}, {}), /Unknown provider "nope"/);
});

test("explainError points to the CLI commands that fix the problem", () => {
  const pc = ai.providerConfig({ provider: "gemini", model: "gemini-x" }, {}, {}, {});
  assert.match(ai.explainError(new ai.AIError("not_configured", "No key"), pc).body, /rbi\.js setup/);
  assert.match(ai.explainError(new ai.AIError("model", "gone", { detail: "not found" }), pc).body, /gemini-x/);
  assert.match(ai.explainError(new ai.AIError("quota", "used"), pc).body, /run the same command again/i);
  assert.equal(ai.explainError(new Error("boom"), pc).title, "Something went wrong");
});

test("usage adds up and prints compactly", () => {
  const u = ai.addUsage({ input: 1200, cached: 0, output: 300, thinking: 0 }, { input: 800, cached: 100, output: 200, thinking: 50 });
  assert.deepEqual(u, { input: 2000, cached: 100, output: 500, thinking: 50 });
  assert.equal(ai.usageText(u), "2k in (100 cached) · 500 out · 50 thinking");
});
