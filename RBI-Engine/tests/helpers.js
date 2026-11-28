"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const APP_DIR = path.resolve(__dirname, "..", "..");
const FIXTURES = path.join(__dirname, "fixtures");

function tempDir(prefix = "rbi-engine-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function appAvailable() {
  return fs.existsSync(path.join(APP_DIR, "app.js")) && fs.existsSync(path.join(APP_DIR, "prompt.js"));
}

function functionSource(src, name) {
  const start = src.indexOf("\nfunction " + name + "(");
  if (start < 0) throw new Error("app.js has no function " + name);
  const end = src.indexOf("\n}\n", start);
  return src.slice(start + 1, end + 2);
}

function appContext() {
  const promptSrc = fs.readFileSync(path.join(APP_DIR, "prompt.js"), "utf8");
  const appSrc = fs.readFileSync(path.join(APP_DIR, "app.js"), "utf8");
  const ctx = vm.createContext({});
  vm.runInContext(promptSrc, ctx);
  for (const name of ["fillTemplate", "formatDuration", "questionPromptText", "defaultWordLimit", "buildQuestionText", "buildCombinedText"]) {
    vm.runInContext(functionSource(appSrc, name), ctx);
  }
  return ctx;
}

function sampleAppTest() {
  return {
    id: "t_fixture",
    date: "2026-11-28T10:00:00.000Z",
    totalMinutes: 30,
    usedSeconds: 1500,
    autoSubmitted: false,
    questions: [
      {
        id: "q1",
        paper: "ESI",
        topic: "Inflation Targeting",
        marks: 15,
        wordLimit: 600,
        text: "Critically examine the flexible inflation targeting framework adopted by India in 2016. Has it delivered price stability?",
        modelAnswer: "India adopted flexible inflation targeting (FIT) in 2016 by amending the RBI Act, 1934.\nThe target is 4% CPI inflation with a band of 2% to 6%.\nA six-member Monetary Policy Committee sets the repo rate."
      },
      {
        id: "q2",
        paper: "Finance",
        topic: "",
        marks: 10,
        wordLimit: 400,
        passage: "Read the case below and answer the questions that follow.\nCase Study: Shakti Bank\nShakti Bank is a mid-sized private bank.\nYear | Gross NPA (%) | Unsecured share of loans (%)\nFY24 | 3.1 | 22\nFY26 | 6.4 | 35",
        text: "Suggest a plan to restore asset quality.",
        modelAnswer: ""
      }
    ],
    answers: {
      q1: {
        text: "INTRODUCTION\nIndia have adopted flexible inflation targeting in 2016.\n\nThe MPC consist of six members.\nQuestion: why did inflation rise in 2022?\nSame line repeated.\nSame line repeated.\n--------------------\n\nWAY FORWARD\nThe RBI should keep the 4% target.",
        wordCount: 0,
        secondsSpent: 1350
      },
      q2: { text: "", wordCount: 0, secondsSpent: 0 }
    }
  };
}

function appExports() {
  const ctx = appContext();
  const t = sampleAppTest();
  for (const q of t.questions) t.answers[q.id].wordCount = String(t.answers[q.id].text).trim() ? String(t.answers[q.id].text).trim().split(/\s+/).length : 0;
  ctx.__test = t;
  return {
    single: vm.runInContext("buildQuestionText(__test, __test.questions[0], 0)", ctx),
    full: vm.runInContext("buildCombinedText(__test)", ctx),
    test: t
  };
}

function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

module.exports = { APP_DIR, FIXTURES, tempDir, appAvailable, appContext, appExports, sampleAppTest, readFixture, functionSource };

function startMockServer(handler) {
  const http = require("http");
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", async () => {
      let json = null;
      try { json = body ? JSON.parse(body) : null; } catch (_) { json = null; }
      const record = { method: req.method, url: req.url, headers: req.headers, body: json, raw: body };
      requests.push(record);
      let out;
      try {
        out = await handler(record, requests.length);
      } catch (err) {
        out = { status: 500, json: { error: { message: String(err && err.message || err) } } };
      }
      const send = () => {
        if (res.destroyed) return;
        res.writeHead(out.status || 200, { "Content-Type": "application/json" });
        res.end(out.text !== undefined ? out.text : JSON.stringify(out.json || {}));
      };
      if (out.delayMs) setTimeout(send, out.delayMs); else send();
    });
  });
  return new Promise(resolve => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: "http://127.0.0.1:" + port,
        requests,
        close: () => new Promise(r => { server.closeAllConnections && server.closeAllConnections(); server.close(() => r()); })
      });
    });
  });
}

function geminiReply(text, extra) {
  return Object.assign({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 3 } }, extra || {});
}

module.exports.startMockServer = startMockServer;
module.exports.geminiReply = geminiReply;

function detectPass(system) {
  const s = String(system || "");
  if (/fixed marking checklist/i.test(s)) return "scheme";
  if (/grade RBI Grade B/i.test(s)) return "score";
  if (/language examiner/i.test(s)) return "language";
  if (/answer-writing mentor/i.test(s)) return "coach";
  if (/final feedback summary/i.test(s)) return "synthesis";
  return "unknown";
}

function scriptFromScorePrompt(prompt) {
  const m = prompt.match(/no spellcheck\)\n-{80}\n([\s\S]*?)\n\n-{80}\nOFFICIAL REFERENCE/);
  return m ? m[1] : "";
}

function fakeReply(pass, req, options, n) {
  const p = req.prompt;
  if (pass === "scheme") {
    return {
      subparts: [{ part: "Merits and limits", expects: "Both sides with evidence" }, { part: "Measures", expects: "Specific steps" }],
      points: [
        { point: "Inflation targeting adopted in 2016", weight: 3, subpart: 1 },
        { point: "Six-member committee sets the repo rate", weight: 2, subpart: 1 },
        { point: "Food supply shocks limit monetary policy", weight: 2, subpart: 1 },
        { point: "Supply-side and transmission measures", weight: 2, subpart: 2 }
      ],
      outline: [{ section: "INTRODUCTION", covers: "Hook", share: 12 }, { section: "MERITS AND LIMITS", covers: "Both sides", share: 73 }, { section: "WAY FORWARD", covers: "Measures", share: 15 }],
      dimensions: ["Macroeconomic", "Institutional"]
    };
  }
  if (pass === "score") {
    const seen = new Set();
    const maxima = [...p.matchAll(/\b(P\d) = ([\d.]+)/g)].filter(m => !seen.has(m[1]) && seen.add(m[1])).map(m => ({ id: m[1], max: Number(m[2]) }));
    const awards = options.awards ? options.awards(n, maxima) : maxima.map(m => Math.round(m.max * 0.5 * 4) / 4);
    const checkLine = (p.match(/Examiner checks for Track [A-D] \(STAGE 1B\), by id: (.*)/) || ["", ""])[1];
    const checkIds = [...checkLine.matchAll(/(\d+)\. /g)].map(m => m[1]);
    const kIds = [...p.matchAll(/^(K\d+) \(weight/gm)].map(m => m[1]);
    const sIds = [...p.matchAll(/^(S\d+) .* - expects:/gm)].map(m => m[1]);
    const script = scriptFromScorePrompt(p);
    const quote = script.split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
    const sum = awards.reduce((a, b) => a + b, 0);
    const obj = {
      checklist: kIds.map((id, i) => ({ id, coverage: i === 0 ? "full" : "partial", quote: i === 0 ? quote : "" })),
      subparts: sIds.map(id => ({ id, coverage: "TEXTBOOK ONLY", comment: "You covered the basics." })),
      examiner_checks: checkIds.map(id => ({ id, result: "YES", evidence: "evidence" })),
      anchor_count: 3,
      off_topic: false,
      parameters: maxima.map((m, i) => ({ id: m.id, cap_applied: "", awarded: awards[i], justification: "Justification " + m.id, lost: awards[i] < m.max ? ["Reason " + m.id + " lost marks."] : [] })),
      penalties: options.penalties ? options.penalties(quote) : [],
      stage1_raw_sum: sum,
      total_penalties: 0,
      final_score: sum
    };
    if (!/SCORE-ONLY CROSS-CHECK/.test(p)) {
      Object.assign(obj, {
        anchors_used: ["Urjit Patel Committee"], bare_name_drops: [], missing_anchors: ["RBI Monetary Policy Report", "RBI Annual Report", "Financial Stability Report", "MPC minutes", "CPI data from MoSPI"],
        verify_flags: [], factual_errors: [], concept_gaps: ["Transmission lags"], error_log: quote ? [{ quote, code: "RP-2", problem: "Generic opening", correction: "Open with a data point" }] : [],
        caps_triggered: [], merit_check: "Borderline in a high-cutoff year.", pacing_audit: "On pace."
      });
    }
    return obj;
  }
  if (pass === "language") {
    const units = [...p.matchAll(/^\[(S\d+)\] \((\w+)\) (.*)$/gm)].map(m => ({ id: m[1], kind: m[2], text: m[3] }));
    const u = units.find(x => x.kind !== "heading" && x.text.split(/\s+/).length >= 3);
    const first = u ? u.text.split(/\s+/)[0] : "";
    return {
      issues: u ? [{ unit: u.id, wrong: first, fix: first + "s", type: "agreement", rule: "The verb must agree with its subject.", severity: "major" }] : [],
      style: { verdict: "Nearly there", score: 6, assessment: "Mostly sober.", issues: ["Some informal words"] },
      register: [], vocabulary: [], sentence_craft: [], summary: "Your language is mostly clear."
    };
  }
  if (pass === "coach") {
    const outline = [...p.matchAll(/^(O\d+) /gm)].map(m => m[1]);
    const paras = [...p.matchAll(/^\[(P\d+)\]$/gm)].map(m => ({ id: m[1] }));
    const units = [...p.matchAll(/^\[(S\d+)\] (.*)$/gm)].map(m => ({ id: m[1], text: m[2] }));
    const sentence = units.find(u => u.text.split(/\s+/).length >= 4 && /[a-z]/.test(u.text));
    const last = units.length ? units[units.length - 1] : null;
    return {
      framing: "You framed half of the question.",
      outline_match: outline.map(id => ({ id, status: id === "O3" ? "missing" : "covered", comment: "Comment " + id })),
      introduction: { assessment: "Too short.", rewrite: "A better introduction." },
      conclusion: { assessment: "Missing.", rewrite: "A better conclusion." },
      paragraphs: paras.slice(0, 1).map(x => ({ id: x.id, assessment: "Weak.", fix: "Add data." })),
      headings: { assessment: "Generic.", suggested: ["INTRODUCTION", "MERITS", "LIMITS", "WAY FORWARD"] },
      flow: ["Abrupt jump."],
      reframe: sentence ? [{ unit: sentence.id, better: "An upgraded sentence.", why: "More specific." }] : [],
      additions: last ? [{ after: last.id, add: "Add a causal chain: repo hike -> costlier loans -> lower demand.", why: "Shows the mechanism." }] : [],
      model_answer: "INTRODUCTION\\nModel answer text.\\nWAY FORWARD\\nMeasures."
    };
  }
  if (pass === "synthesis") {
    return {
      summary: "You did reasonably well but lost marks on evidence.",
      strengths: ["Clear headings"],
      priorities: [{ title: "Add sources", why: "Cost you marks", how: "Cite two reports" }, { title: "Answer every part", why: "x", how: "y" }, { title: "Fix agreement", why: "x", how: "y" }],
      drills: ["Concept", "Report", "Habit"],
      plan: ["One", "Two", "Three", "Four", "Five"]
    };
  }
  return {};
}

function fakeGenerate(options = {}) {
  const calls = [];
  const fn = async (pc, req) => {
    const pass = detectPass(req.system);
    calls.push({ pass, model: pc.model, req });
    const n = calls.filter(c => c.pass === pass).length;
    if (options.fail && options.fail[pass]) {
      const f = options.fail[pass];
      const err = typeof f === "function" ? f(n) : f;
      if (err) throw err;
    }
    const obj = fakeReply(pass, req, options, n);
    return { text: JSON.stringify(obj), finish: "stop", model: pc.model, modelUsed: "", fallbackFrom: "", usage: { input: 100, cached: 0, output: 50, thinking: 10 } };
  };
  fn.calls = calls;
  fn.count = pass => calls.filter(c => !pass || c.pass === pass).length;
  return fn;
}

module.exports.detectPass = detectPass;
module.exports.fakeReply = fakeReply;
module.exports.fakeGenerate = fakeGenerate;
module.exports.scriptFromScorePrompt = scriptFromScorePrompt;

function makeZip(entries) {
  const zlib = require("zlib");
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const data = Buffer.from(content, "utf8");
    const comp = zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

function docxXml(paragraphs) {
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const body = paragraphs.map(p => (p === "" ? "<w:p/>" : "<w:p><w:r><w:t xml:space=\"preserve\">" + p + "</w:t></w:r></w:p>")).join("");
  return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<w:document xmlns:w=\"" + W + "\"><w:body>" + body + "</w:body></w:document>";
}

module.exports.makeZip = makeZip;
module.exports.docxXml = docxXml;

function siteContext() {
  const store = () => {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
  };
  const nothing = () => null;
  const ctx = vm.createContext({
    console, setTimeout, clearTimeout, localStorage: store(), sessionStorage: store(),
    document: { addEventListener() {}, getElementById: nothing, querySelector: nothing, querySelectorAll: () => [], dispatchEvent() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  });
  ctx.window = ctx;
  ctx.self = ctx;
  vm.runInContext(fs.readFileSync(path.join(APP_DIR, "answer-marks.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(APP_DIR, "ai_eval.js"), "utf8"), ctx);
  return ctx;
}

module.exports.siteContext = siteContext;
