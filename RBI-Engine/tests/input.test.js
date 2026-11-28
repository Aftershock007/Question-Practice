"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const h = require("./helpers");
const inp = require("../src/input");

const Q = "Critically examine the flexible inflation targeting framework adopted by India in 2016. Has it delivered price stability?";
const A = "INTRODUCTION\nIndia have adopted flexible inflation targeting in 2016.\n\nQuestion: why did inflation rise in 2022?\nPaper: FM\nSame line repeated.\nSame line repeated.";
const M = "India adopted FIT in 2016. The target is 4% CPI inflation within a band of 2% to 6%.";

function engineFile(parts = {}) {
  return [
    "# notes at the top are ignored",
    "Paper: ESI",
    "Topic: Inflation targeting",
    "Marks: 15",
    "Word limit: 600",
    "Time spent: 22 min 30 sec",
    "",
    "Question:",
    parts.q === undefined ? Q : parts.q,
    "",
    "Answer:",
    parts.a === undefined ? A : parts.a,
    "",
    "Model answer:",
    parts.m === undefined ? M : parts.m,
    ""
  ].join("\n");
}

test("an engine answer file gives the header, question, answer and model answer exactly", () => {
  const r = inp.parseText(engineFile(), { fileName: "a.txt" });
  assert.equal(r.format, "engine");
  assert.equal(r.questions.length, 1);
  const q = r.questions[0];
  assert.equal(q.paper, "ESI");
  assert.equal(q.topic, "Inflation targeting");
  assert.equal(q.marks, 15);
  assert.equal(q.wordLimit, 600);
  assert.equal(q.seconds, 1350);
  assert.equal(q.question, Q);
  assert.equal(q.answer, A);
  assert.equal(q.modelAnswer, M);
  assert.equal(q.passage, "");
});

test("the fixture file reads the same way from disk", async () => {
  const r = await inp.readInputFile(path.join(h.FIXTURES, "answer-esi.txt"));
  assert.equal(r.questions[0].answer, A);
  assert.equal(r.questions[0].modelAnswer, M);
});

test("CRLF line endings give the same result", () => {
  const lf = inp.parseText(engineFile(), {});
  const crlf = inp.parseText(engineFile().replace(/\n/g, "\r\n"), {});
  assert.deepEqual(crlf, lf);
});

test("two questions in one file are split by a line of equals signs", () => {
  const two = engineFile() + "\n=====\n" + engineFile({ q: "Explain the repo rate.", a: "The repo rate is the rate at which the RBI lends.", m: "" });
  const r = inp.parseText(two, {});
  assert.equal(r.questions.length, 2);
  assert.equal(r.questions[1].question, "Explain the repo rate.");
  assert.equal(r.questions[1].modelAnswer, "");
  assert.deepEqual(r.questions.map(q => q.index), [1, 2]);
});

test("a line of equals signs inside an answer (a heading underline) does not split the file", () => {
  const answer = "INTRODUCTION\n============\nIndia adopted FIT in 2016.\n\n=====\nWAY FORWARD\nKeep the target.";
  const r = inp.parseText(engineFile({ a: answer }), {});
  assert.equal(r.questions.length, 1);
  assert.equal(r.questions[0].answer, answer);
});

test("a file without an Answer line explains how to fix it", () => {
  assert.throws(() => inp.parseText("Question:\nExplain the repo rate.\n", {}), err => err instanceof inp.InputError && /Add a line "Answer:"/.test(err.message));
});

test("in a file with several questions the error names the question", () => {
  const two = "Question:\nExplain CRR.\n\n=====\n" + engineFile();
  assert.throws(() => inp.parseText(two, {}), err => /^Question 1: no answer found/.test(err.message));
});

test("a file without a question explains how to fix it", () => {
  assert.throws(() => inp.parseText("Paper: ESI\n\nAnswer:\nSome text.\n", {}), err => err instanceof inp.InputError && /Add a line "Question:"/.test(err.message));
});

test("text before Answer without a Question label is the question", () => {
  const q = inp.parseText("Paper: FM\nMarks: 10\nWhat is working capital?\nDistinguish gross and net.\n\nAnswer:\nWorking capital is...", {}).questions[0];
  assert.equal(q.question, "What is working capital?\nDistinguish gross and net.");
  assert.equal(q.marks, 10);
});

test("labels can carry text on the same line", () => {
  const q = inp.parseText("Question: What is fiscal deficit?\nAnswer: Fiscal deficit is the gap.\nModel answer: It is the excess of expenditure.", {}).questions[0];
  assert.equal(q.question, "What is fiscal deficit?");
  assert.equal(q.answer, "Fiscal deficit is the gap.");
  assert.equal(q.modelAnswer, "It is the excess of expenditure.");
});

test("a clean-format question line gives marks and word limit", () => {
  const q = inp.parseText("Q1. (15 Marks, 600 Words) Explain Maslow's hierarchy.\n\nAnswer:\nMaslow proposed...", {}).questions[0];
  assert.equal(q.question, "Explain Maslow's hierarchy.");
  assert.equal(q.marks, 15);
  assert.equal(q.wordLimit, 600);
});

test("a passage section is kept apart from the question", () => {
  const q = inp.parseText("Passage:\nBanks are the backbone of an economy.\n\nQuestion:\nWrite a precis.\n\nAnswer:\nBanks matter.", {}).questions[0];
  assert.equal(q.passage, "Banks are the backbone of an economy.");
  assert.equal(q.question, "Write a precis.");
});

test("the model answer may come before the candidate's answer", () => {
  const q = inp.parseText("Question:\nExplain CRR.\n\nModel answer:\nCRR is a reserve.\n\nAnswer:\nCRR is cash kept with the RBI.", {}).questions[0];
  assert.equal(q.modelAnswer, "CRR is a reserve.");
  assert.equal(q.answer, "CRR is cash kept with the RBI.");
});

test("an app single-question export parses with the exact answer", () => {
  const t = h.sampleAppTest();
  const r = inp.parseText(h.readFixture("app-single.txt"), { fileName: "Practice_2026-11-28_Q1_ESI_15m.txt" });
  assert.equal(r.format, "app");
  assert.equal(r.questions.length, 1);
  const q = r.questions[0];
  assert.equal(q.paper, "ESI");
  assert.equal(q.topic, "Inflation Targeting");
  assert.equal(q.marks, 15);
  assert.equal(q.wordLimit, 600);
  assert.equal(q.seconds, 1350);
  assert.equal(q.question, t.questions[0].text);
  assert.equal(q.passage, "");
  assert.equal(q.answer, t.answers.q1.text);
  assert.equal(q.modelAnswer, t.questions[0].modelAnswer);
  assert.equal(q.index, 1);
});

test("an app FullTest export gives every question in order, with passage, blank answer and no model answer", () => {
  const t = h.sampleAppTest();
  const r = inp.parseText(h.readFixture("app-full.txt"), {});
  assert.equal(r.questions.length, 2);
  const [q1, q2] = r.questions;
  assert.equal(q1.answer, t.answers.q1.text);
  assert.equal(q2.index, 2);
  assert.equal(q2.paper, "Finance");
  assert.equal(q2.topic, "");
  assert.equal(q2.marks, 10);
  assert.equal(q2.passage, t.questions[1].passage);
  assert.equal(q2.question, t.questions[1].text);
  assert.equal(q2.answer, "");
  assert.equal(q2.modelAnswer, "");
  assert.equal(q2.seconds, 0);
});

test("an app export saved with Windows line endings parses the same", () => {
  const lf = inp.parseText(h.readFixture("app-full.txt"), {});
  const crlf = inp.parseText(h.readFixture("app-full.txt").replace(/\n/g, "\r\n"), {});
  assert.deepEqual(crlf, lf);
});

test("a fresh export from the real app parses like the saved fixture", { skip: !h.appAvailable() }, () => {
  const fresh = h.appExports();
  const strip = r => r.questions.map(q => Object.assign({}, q, { date: "" }));
  assert.deepEqual(strip(inp.parseText(fresh.full, {})), strip(inp.parseText(h.readFixture("app-full.txt"), {})));
  assert.deepEqual(strip(inp.parseText(fresh.single, {})), strip(inp.parseText(h.readFixture("app-single.txt"), {})));
});

test("finalizeQuestion fills defaults with warnings", () => {
  const raw = inp.parseText("Question:\nExplain the repo rate.\n\nAnswer:\nThe repo rate is the rate at which the RBI lends to banks.", {}).questions[0];
  const q = inp.finalizeQuestion(raw, {});
  assert.equal(q.paperKey, "Other");
  assert.equal(q.track, "A");
  assert.equal(q.marks, 10);
  assert.equal(q.wordLimit, 400);
  assert.equal(q.words, 13);
  assert.ok(q.warnings.some(w => /Marks not given/.test(w)));
  assert.ok(q.warnings.some(w => /Word limit not given/.test(w)));
  const q15 = inp.finalizeQuestion(Object.assign({}, raw, { wordLimit: 600 }), {});
  assert.equal(q15.marks, 15);
});

test("overrides beat the file and the precis limit comes from the passage", () => {
  const raw = inp.parseText(engineFile(), {}).questions[0];
  assert.equal(inp.finalizeQuestion(raw, { marks: 10 }).marks, 10);
  assert.equal(inp.finalizeQuestion(raw, { track: "B" }).track, "B");
  const passage = ("word ").repeat(300).trim();
  const precis = inp.finalizeQuestion(inp.parseText("Paper: English\nPassage:\n" + passage + "\n\nQuestion:\nWrite a precis.\n\nAnswer:\nShort.", {}).questions[0], {});
  assert.equal(precis.track, "C");
  assert.equal(precis.wordLimit, 100);
  assert.equal(precis.marks, 30);
});

test("question hashes follow the question and model answer, answer hashes follow the answer", () => {
  const a = inp.finalizeQuestion(inp.parseText(engineFile(), {}).questions[0], {});
  const b = inp.finalizeQuestion(inp.parseText(engineFile({ a: "A different answer." }), {}).questions[0], {});
  const c = inp.finalizeQuestion(inp.parseText(engineFile({ m: "A different model answer." }), {}).questions[0], {});
  assert.equal(a.qhash, b.qhash);
  assert.notEqual(a.ahash, b.ahash);
  assert.notEqual(a.qhash, c.qhash);
  assert.match(a.qhash, /^[0-9a-f]{16}$/);
});

test("parseDuration reads the usual ways of writing time", () => {
  assert.equal(inp.parseDuration("22 min"), 1320);
  assert.equal(inp.parseDuration("22 min 30 sec"), 1350);
  assert.equal(inp.parseDuration("22m 30s"), 1350);
  assert.equal(inp.parseDuration("22:30"), 1350);
  assert.equal(inp.parseDuration("1:05:00"), 3900);
  assert.equal(inp.parseDuration("1350 sec"), 1350);
  assert.equal(inp.parseDuration("1 h 5 min"), 3900);
  assert.equal(inp.parseDuration("25"), 1500);
  assert.equal(inp.parseDuration(""), 0);
  assert.equal(inp.parseDuration("soon"), 0);
});

test("readInputFile explains missing files and PDFs, and reads UTF-16 files from Notepad", async () => {
  const dir = h.tempDir();
  await assert.rejects(inp.readInputFile(path.join(dir, "missing.txt")), err => err instanceof inp.InputError && /File not found/.test(err.message));
  fs.writeFileSync(path.join(dir, "a.pdf"), "%PDF-1.4");
  await assert.rejects(inp.readInputFile(path.join(dir, "a.pdf")), err => /\.txt or \.docx/.test(err.message));
  const utf16 = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(engineFile(), "utf16le")]);
  fs.writeFileSync(path.join(dir, "u.txt"), utf16);
  assert.equal((await inp.readInputFile(path.join(dir, "u.txt"))).questions[0].answer, A);
});

test("fromParts builds a question from separate texts", () => {
  const raw = inp.fromParts({ question: "  Explain CRR.\n", answer: "CRR is a reserve.\n", model: "", passage: "" });
  assert.equal(raw.question, "Explain CRR.");
  assert.equal(raw.answer, "CRR is a reserve.");
  assert.equal(raw.index, 1);
});
