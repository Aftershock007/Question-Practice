"use strict";

const fs = require("fs");
const path = require("path");
const { normalizeText, countWords } = require("./text");
const { normalizePaper, detectTrack, parseTrack, defaultMarks, defaultWordLimit, TRACK_LABELS } = require("./rubric");
const { num, sha256 } = require("./util");

class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = "InputError";
  }
}

const HEADER_KEYS = [
  [/^(?:paper|subject)$/i, "paper"],
  [/^topic$/i, "topic"],
  [/^(?:marks?|max(?:imum)?\s+marks|total\s+marks)$/i, "marks"],
  [/^(?:word\s*limit|words|limit|word\s+count\s+limit|prescribed\s+limit)$/i, "wordLimit"],
  [/^(?:time|time\s+spent|time\s+taken|time\s+used|time\s+consumed|duration)$/i, "time"],
  [/^track$/i, "track"],
  [/^(?:date|exam\s+date|examination\s+date)$/i, "date"]
];
const HEADER_LINE = /^\s*([A-Za-z][A-Za-z ]{0,30}?)\s*:\s*(.*)$/;
const LABEL_Q = /^\s*(?:#+\s*)?(?:question|q)\s*\d*\s*(?:\(([^)]*)\))?\s*[:.]\s*(?:\(([^)]*)\))?\s*(.*)$/i;
const LABEL_PASSAGE = /^\s*(?:#+\s*)?passage(?:\s*\/\s*data)?\s*:\s*(.*)$/i;
const LABEL_ANSWER = /^\s*(?:#+\s*)?(?:(?:my|your|candidate'?s?)\s+)?(?:answer|script)\s*:\s*(.*)$/i;
const LABEL_MODEL = /^\s*(?:#+\s*)?(?:model|reference|ideal|sample|benchmark|suggested)\s+answer\s*:\s*(.*)$/i;

function parseDuration(s) {
  const t = String(s || "").trim().toLowerCase();
  if (!t) return 0;
  const clock = t.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (clock) {
    const [a, b, c] = [Number(clock[1]), Number(clock[2]), clock[3] === undefined ? null : Number(clock[3])];
    return c === null ? a * 60 + b : a * 3600 + b * 60 + c;
  }
  const re = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/g;
  let total = 0;
  let any = false;
  let m;
  while ((m = re.exec(t))) {
    any = true;
    const v = Number(m[1]);
    if (/^h/.test(m[2])) total += v * 3600;
    else if (/^m/.test(m[2])) total += v * 60;
    else total += v;
  }
  if (any) return Math.round(total);
  if (/^\d+(?:\.\d+)?$/.test(t)) return Math.round(Number(t) * 60);
  return 0;
}

function tidySection(lines) {
  return lines.join("\n").replace(/^(?:[ \t]*\n)+/, "").trim();
}

function parenInfo(text, out) {
  const s = String(text || "");
  const marks = s.match(/(\d+(?:\.\d+)?)\s*marks?\b/i);
  const words = s.match(/(\d+)\s*words?\b/i);
  if (marks) out.marks = Number(marks[1]);
  if (words) out.wordLimit = Number(words[1]);
}

function emptyRaw(index) {
  return { index, paper: "", topic: "", marks: 0, wordLimit: 0, track: "", seconds: 0, date: "", question: "", passage: "", answer: "", modelAnswer: "" };
}

function parseEngineBlock(block, index, multi) {
  const raw = emptyRaw(index);
  const sections = { question: [], passage: [], answer: [], model: [] };
  const seen = { question: false, answer: false, model: false, passage: false };
  let state = "header";
  const start = (name, first) => {
    state = name;
    seen[name] = true;
    if (first && first.trim()) sections[name].push(first);
  };
  for (const line of block.split("\n")) {
    if (state === "header") {
      if (!line.trim()) continue;
      const q = line.match(LABEL_Q);
      if (q) { parenInfo(q[1], raw); parenInfo(q[2], raw); start("question", q[3]); continue; }
      const p = line.match(LABEL_PASSAGE);
      if (p) { start("passage", p[1]); continue; }
      const a = line.match(LABEL_ANSWER);
      if (a) { start("answer", a[1]); continue; }
      const mo = line.match(LABEL_MODEL);
      if (mo) { start("model", mo[1]); continue; }
      if (/^\s*#/.test(line)) continue;
      const h = line.match(HEADER_LINE);
      const key = h && (HEADER_KEYS.find(([re]) => re.test(h[1].trim())) || [])[1];
      if (key) {
        const v = h[2].trim();
        if (key === "marks" || key === "wordLimit") raw[key] = num(v) || 0;
        else if (key === "time") raw.seconds = parseDuration(v);
        else raw[key] = v;
        continue;
      }
      start("question", line);
      continue;
    }
    if (state === "question" || state === "passage") {
      const p = state === "question" ? line.match(LABEL_PASSAGE) : null;
      const q = state === "passage" ? line.match(LABEL_Q) : null;
      const a = line.match(LABEL_ANSWER);
      const mo = line.match(LABEL_MODEL);
      if (p) { start("passage", p[1]); continue; }
      if (q) { parenInfo(q[1], raw); parenInfo(q[2], raw); start("question", q[3]); continue; }
      if (a) { start("answer", a[1]); continue; }
      if (mo) { start("model", mo[1]); continue; }
      sections[state].push(line);
      continue;
    }
    if (state === "answer") {
      const mo = !seen.model ? line.match(LABEL_MODEL) : null;
      if (mo) { start("model", mo[1]); continue; }
      sections.answer.push(line);
      continue;
    }
    const a = !seen.answer ? line.match(LABEL_ANSWER) : null;
    if (a) { start("answer", a[1]); continue; }
    sections.model.push(line);
  }
  raw.question = tidySection(sections.question);
  raw.passage = tidySection(sections.passage);
  raw.answer = tidySection(sections.answer);
  raw.modelAnswer = tidySection(sections.model);
  const where = multi ? "Question " + index + ": " : "";
  if (!raw.question && !raw.passage) throw new InputError(where + "no question found. Add a line \"Question:\" above the question.");
  if (!seen.answer) throw new InputError(where + "no answer found. Add a line \"Answer:\" above your answer.");
  if (!raw.question) { raw.question = raw.passage; raw.passage = ""; }
  return raw;
}

const APP_HEADER_RE = /^-{20,}\n(SUBMISSION METADATA|CANDIDATE'S SUBMITTED SCRIPT[^\n]*|OFFICIAL REFERENCE \/ BENCHMARK POINTS|STAGE 1: DYNAMIC 4-TRACK RUBRIC[^\n]*)\n-{20,}\n/gm;

function isAppExport(text) {
  return /SUBMISSION METADATA/.test(text) && /CANDIDATE'S SUBMITTED SCRIPT/.test(text);
}

function appBlocks(chunk) {
  const heads = [];
  APP_HEADER_RE.lastIndex = 0;
  let m;
  while ((m = APP_HEADER_RE.exec(chunk))) heads.push({ name: m[1], start: m.index, bodyStart: m.index + m[0].length });
  const out = {};
  heads.forEach((h, i) => {
    const key = /^SUBMISSION/.test(h.name) ? "meta" : /^CANDIDATE/.test(h.name) ? "answer" : /^OFFICIAL/.test(h.name) ? "model" : "rubric";
    if (out[key] === undefined) out[key] = chunk.slice(h.bodyStart, i + 1 < heads.length ? heads[i + 1].start : chunk.length);
  });
  return out;
}

function parseAppChunk(chunk, position) {
  const b = appBlocks(chunk);
  if (b.meta === undefined || b.answer === undefined) throw new InputError("This looks like an app export, but its answer block could not be found. Download it again from the result screen.");
  const field = (name) => {
    const m = b.meta.match(new RegExp("^" + name + "\\s*:\\s*(.*)$", "m"));
    return m ? m[1].trim() : "";
  };
  const qm = b.meta.match(/^QUESTION:\n/m);
  let question = qm ? b.meta.slice(qm.index + qm[0].length).trim() : "";
  let passage = "";
  const PASSAGE_HEAD = "[Passage / data this question is based on]\n";
  const QUESTION_HEAD = "\n\n[Question]\n";
  if (question.startsWith(PASSAGE_HEAD) && question.includes(QUESTION_HEAD)) {
    const rest = question.slice(PASSAGE_HEAD.length);
    const k = rest.indexOf(QUESTION_HEAD);
    passage = rest.slice(0, k).trim();
    question = rest.slice(k + QUESTION_HEAD.length).trim();
  }
  const answer = String(b.answer).trim();
  const model = String(b.model || "").trim();
  const topic = field("Scheduled Topic");
  const idx = chunk.match(/QUESTION (\d+) OF (\d+)/);
  return {
    index: idx ? Number(idx[1]) : position,
    paper: field("Paper"),
    topic: /^not specified$/i.test(topic) ? "" : topic,
    marks: num(field("Maximum Marks")) || 0,
    wordLimit: num(field("Prescribed Limit")) || 0,
    track: "",
    seconds: parseDuration(field("Time Consumed")),
    date: field("Examination Date"),
    question,
    passage,
    answer: answer === "[NO ANSWER WRITTEN]" ? "" : answer,
    modelAnswer: model.startsWith("[No model answer provided") ? "" : model
  };
}

const SEPARATOR_RE = /^[ \t]*={5,}[ \t]*$/;

function splitQuestionBlocks(src) {
  const lines = src.split("\n");
  const answerFollows = (from) => {
    for (let k = from; k < lines.length && !SEPARATOR_RE.test(lines[k]); k++) if (LABEL_ANSWER.test(lines[k])) return true;
    return false;
  };
  const blocks = [];
  let cur = [];
  for (let k = 0; k < lines.length; k++) {
    if (SEPARATOR_RE.test(lines[k])) {
      let j = k;
      while (j + 1 < lines.length && SEPARATOR_RE.test(lines[j + 1])) j++;
      if (answerFollows(j + 1)) {
        blocks.push(cur.join("\n"));
        cur = [];
        k = j;
        continue;
      }
    }
    cur.push(lines[k]);
  }
  blocks.push(cur.join("\n"));
  return blocks;
}

function parseText(text, opts = {}) {
  const src = normalizeText(text);
  if (isAppExport(src)) {
    const chunks = src.split(/^={64}$/m).filter(c => /SUBMISSION METADATA/.test(c));
    return { format: "app", questions: chunks.map((c, i) => parseAppChunk(c, i + 1)), warnings: [] };
  }
  const blocks = splitQuestionBlocks(src).filter(b => b.split("\n").some(l => l.trim() && !/^\s*#/.test(l)));
  if (!blocks.length) throw new InputError((opts.fileName ? opts.fileName + " is empty. " : "The file is empty. ") + "Write the question under \"Question:\" and your answer under \"Answer:\".");
  return { format: "engine", questions: blocks.map((b, i) => parseEngineBlock(b, i + 1, blocks.length > 1)), warnings: [] };
}

function decodeText(buf) {
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return buf.subarray(2).toString("utf16le");
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    const b = Buffer.from(buf.subarray(2, 2 + ((buf.length - 2) & ~1)));
    b.swap16();
    return b.toString("utf16le");
  }
  return buf.toString("utf8");
}

async function readInputFile(file) {
  const ext = path.extname(file).toLowerCase();
  let buf;
  try {
    buf = await fs.promises.readFile(file);
  } catch (err) {
    if (err.code === "ENOENT") throw new InputError("File not found: " + file);
    if (err.code === "EISDIR") throw new InputError(file + " is a folder. Give the path of an answer file.");
    throw new InputError("Could not read " + file + ": " + err.message);
  }
  if (ext === ".pdf") throw new InputError("PDF files are not supported. Save the answer as .txt or .docx and try again.");
  let text;
  if (ext === ".docx") {
    const { extractDocxText } = require("./docx");
    try {
      text = extractDocxText(buf);
    } catch (err) {
      throw new InputError(path.basename(file) + ": " + err.message);
    }
  } else {
    text = decodeText(buf);
  }
  return parseText(text, { fileName: path.basename(file) });
}

function fromParts({ question, answer, model, passage } = {}) {
  const raw = emptyRaw(1);
  raw.question = normalizeText(question || "").trim();
  raw.answer = normalizeText(answer || "").trim();
  raw.modelAnswer = normalizeText(model || "").trim();
  raw.passage = normalizeText(passage || "").trim();
  if (!raw.question) throw new InputError("The question is empty.");
  return raw;
}

function finalizeQuestion(raw, overrides = {}) {
  const o = overrides || {};
  const q = Object.assign({}, raw);
  if (o.paper) q.paper = String(o.paper);
  if (o.topic) q.topic = String(o.topic);
  if (Number(o.marks) > 0) q.marks = Number(o.marks);
  if (Number(o.wordLimit) > 0) q.wordLimit = Number(o.wordLimit);
  if (o.track) q.track = String(o.track);
  if (Number(o.seconds) > 0) q.seconds = Number(o.seconds);
  const warnings = [];
  const paperKey = normalizePaper(q.paper);
  const track = detectTrack({ paper: q.paper, question: q.question, passage: q.passage, track: q.track });
  if (q.track && !parseTrack(q.track)) warnings.push("Track \"" + q.track + "\" is not A, B, C or D, so the engine chose Track " + track + ".");
  let wordLimit = Number(q.wordLimit) > 0 ? Number(q.wordLimit) : 0;
  let marks = Number(q.marks) > 0 ? Number(q.marks) : 0;
  if (!marks) {
    marks = defaultMarks(track, wordLimit);
    warnings.push("Marks not given: assumed " + marks + ". Add \"Marks: " + marks + "\" (or the right number) to the file to change it.");
  }
  if (!wordLimit) {
    wordLimit = defaultWordLimit(track, marks, countWords(q.passage || q.question));
    if (wordLimit) warnings.push("Word limit not given: assumed " + wordLimit + " words. Add \"Word limit: " + wordLimit + "\" to the file to change it.");
  }
  const qhash = sha256(["v1", paperKey, track, marks, wordLimit, q.passage || "", q.question || "", q.modelAnswer || ""].join("\u0001")).slice(0, 16);
  return {
    index: q.index || 1,
    paper: q.paper || "Other",
    paperKey,
    topic: q.topic || "",
    marks,
    wordLimit,
    track,
    trackLabel: TRACK_LABELS[track],
    seconds: Number(q.seconds) || 0,
    date: q.date || "",
    question: q.question || "",
    passage: q.passage || "",
    answer: q.answer || "",
    modelAnswer: q.modelAnswer || "",
    words: countWords(q.answer),
    warnings,
    qhash,
    ahash: sha256(q.answer || "").slice(0, 16)
  };
}

module.exports = { InputError, parseText, readInputFile, fromParts, finalizeQuestion, parseDuration, isAppExport, decodeText };
