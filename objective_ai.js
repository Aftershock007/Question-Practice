"use strict";

// ============================================================================
// OBJECTIVE (MCQ) CHECKS & ANALYSIS
// ----------------------------------------------------------------------------
// 1. Import check: every imported MCQ is checked locally (answer key found,
//    options complete...) and then by AI (is the question complete, do the
//    options belong to it, is the answer key right?). Only questions that pass
//    go into the exam; the rest are listed under "Needs attention".
// 2. Topic-wise analysis after an objective test: accuracy per topic (always),
//    plus an AI explanation of the weak topics and of every wrong answer.
// Depends on app.js (state, saveP1Setup, renderP1SetupList, escapeHTML,
// loadJSON, saveJSON, formatMCQAnswer, isMultiAnswerMCQ) and ai_eval.js (AIEval).
// ============================================================================

const MCQ_VERIFY_BATCH = 20;          // questions per AI request
const MCQ_VERIFY_PARALLEL = 3;        // requests at the same time
const P1_ANALYSIS_KEY = "rbi_p1_ai_analysis";
const P1_ANALYSIS_MAX_TESTS = 40;

// Local problems that stop a question from going into the exam
const MCQ_BLOCKING = ["no-key", "key-conflict", "key-not-in-options", "few-options", "options-skipped", "empty-text", "empty-option", "duplicate"];

// ---------------------------------------------------------------------------
// 1a. Local checks (no AI needed)
// ---------------------------------------------------------------------------

// Problems found without AI: missing key, incomplete options, unreadable text...
function mcqLocalIssues(q, ctx) {
  const issues = (q.parseIssues || []).slice();
  const opts = q.options || [];
  const labels = opts.map(o => String(o.label || "").toLowerCase());
  const key = String(q.correctAnswer || "").toLowerCase();
  if (!q.text || !q.text.trim() || q.text === "Imported Question") issues.push({ code: "empty-text", msg: "The question text could not be read." });
  if (opts.length < 2) issues.push({ code: "few-options", msg: "The options could not be read." });
  // fewer options than the rest of the file: a soft problem the AI check can clear (some questions really have 4)
  else if (ctx && ctx.usualOptions && opts.length < ctx.usualOptions) issues.push({ code: "fewer-options", msg: `Only ${opts.length} of ${ctx.usualOptions} options were found.` });
  if (opts.some(o => !String(o.text || "").trim())) issues.push({ code: "empty-option", msg: "One of the options is empty." });
  if (!key) issues.push({ code: "no-key", msg: "No answer key was found for this question." });
  else if (key.split("").some(l => !labels.includes(l))) issues.push({ code: "key-not-in-options", msg: `The answer key points to an option that is not in the question.` });
  if (ctx && q.number != null && ctx.dupes && ctx.dupes.has((q.section || 0) + ":" + q.number)) issues.push({ code: "duplicate", msg: `Question number ${q.number} appears more than once in the file.` });
  // keep one message per code
  const seen = new Set();
  return issues.filter(i => (seen.has(i.code + i.msg) ? false : seen.add(i.code + i.msg)));
}

// Run the local checks on freshly parsed questions and set up q.check
function mcqPrepareImported(questions) {
  const counts = {};
  questions.forEach(q => { const n = (q.options || []).length; if (n >= 2) counts[n] = (counts[n] || 0) + 1; });
  const usualOptions = Number(Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]) || 0;
  const seen = new Map();
  questions.forEach(q => { if (q.number != null) { const k = (q.section || 0) + ":" + q.number; seen.set(k, (seen.get(k) || 0) + 1); } });
  const dupes = new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  const ctx = { usualOptions, dupes };
  questions.forEach(q => {
    q.check = { local: mcqLocalIssues(q, ctx), ai: null, user: "" };
    delete q.parseIssues;
  });
  return questions;
}

// "ok" | "unchecked" | "pending" | "failed" (the AI check could not run) | "issue"
function mcqStatus(q) {
  const c = q.check;
  if (!c) return "ok";                               // added by hand / older data
  if (c.user === "ok") return "ok";
  const local = c.local || [];
  if (local.some(i => MCQ_BLOCKING.includes(i.code))) return "issue";
  const soft = local.some(i => i.code === "fewer-options");
  if (!c.ai) return soft ? "issue" : "unchecked";
  if (c.ai.status === "pending") return "pending";
  if (c.ai.status === "issue") return "issue";
  if (c.ai.status === "error") return soft ? "issue" : "failed";
  return "ok";                                       // the AI confirmed it (also clears "fewer options")
}

// A check interrupted by a page reload leaves questions "pending": make them "not checked" again
function mcqClearStalePending() {
  if (mcqVerify.running) return;
  let changed = false;
  (state.p1_setup.questions || []).forEach(q => {
    if (q.check && q.check.ai && q.check.ai.status === "pending") { q.check.ai = null; changed = true; }
  });
  if (changed) saveP1Setup();
}

// Plain-language reasons why a question needs attention
function mcqIssueReasons(q) {
  const c = q.check || {};
  const aiOk = c.ai && c.ai.status === "ok";
  const out = (c.local || []).filter(i => !(aiOk && i.code === "fewer-options")).map(i => i.msg);
  if (c.ai && c.ai.status === "issue") out.push(...(c.ai.problems || []));
  if (c.ai && c.ai.status === "error") out.push("The AI check could not be completed for this question: " + (c.ai.note || "no reply") + ".");
  return out;
}

// ---------------------------------------------------------------------------
// 1b. AI check of the answer keys
// ---------------------------------------------------------------------------
const mcqVerify = { running: false, total: 0, done: 0, failed: 0, controller: null, message: "", error: "" };

const MCQ_VERIFY_SYSTEM =
  "You are a meticulous RBI Grade B examiner checking an MCQ bank that a practice app extracted automatically from a Word/PDF file. " +
  "Solve every question yourself. Reply with exactly one valid JSON object - no markdown, no text before or after it.";

function mcqVerifyPrompt(batch, topics) {
  const lines = [];
  lines.push("These MCQs were extracted automatically from a DOCX/PDF file. Extraction can go wrong: question text can be cut off, or merged with a heading or with another question; options can be missing, shifted or belong to another question; and the answer key can end up on the wrong question.");
  lines.push("");
  lines.push("For EVERY question below, decide:");
  lines.push("1. text_ok: is the question text complete and readable on its own (not cut off, not merged with another question or a section heading)? A data table, passage or list printed before the question is fine. A question-type tag such as SINGLE CORRECT, ASSERTION or DATA at the start is fine.");
  lines.push("2. options_ok: do the options belong to this question and form a complete, sensible set?");
  lines.push("3. key_correct: solve the question yourself, then say whether the given answer key is correct. Questions marked MULTI-CORRECT, or that say one or more options may be correct, can have several correct options and the key then lists all of them. When an explanation is given, check that the key agrees with it. Mark key_correct false ONLY when you are confident the key is wrong.");
  lines.push("4. topic: the sub-topic the question tests." + (topics.length ? " Use one of these chapter topics when it fits: " + topics.map(t => "\"" + t + "\"").join(", ") + ". Otherwise give a short topic name (2-5 words)." : " Give a broad sub-topic name of 2-5 words, such as \"Data Interpretation\", \"Percentages\", \"Syllogism\" or \"Banking Regulation\" - not a name for a single question. Questions on the same sub-topic MUST get exactly the same name, so the whole file uses only a handful of topics."));
  lines.push("");
  lines.push('Return ONE JSON object: {"results": [{"n": the question\'s n, "text_ok": true or false, "options_ok": true or false, "key_correct": true or false, "your_answer": "the option letter(s) you believe are correct, e.g. \\"c\\" or \\"ae\\"", "confidence": "high" | "medium" | "low", "problem": "one short plain sentence describing what is wrong, or \\"\\" when everything is fine", "topic": "..."}]}');
  lines.push("Include every question exactly once, in the same order.");
  lines.push("");
  lines.push("QUESTIONS");
  batch.forEach((q, i) => {
    lines.push("");
    lines.push(`[n=${i + 1}]${q.number != null ? " (numbered " + q.number + " in the file)" : ""}`);
    lines.push("Question: " + q.text);
    (q.options || []).forEach(o => lines.push(`(${o.label}) ${o.text}`));
    lines.push("Answer key: " + (q.correctAnswer ? formatMCQAnswer(q.correctAnswer) : "MISSING"));
    if (q.explanation) lines.push("Explanation from the file: " + String(q.explanation).slice(0, 1200));
  });
  return lines.join("\n");
}

// Store one AI verdict on the question
function mcqApplyVerdict(q, r, meta) {
  const bool = v => v === true || /^(true|yes|ok)$/i.test(String(v));
  const textOk = r.text_ok === undefined ? true : bool(r.text_ok);
  const optsOk = r.options_ok === undefined ? true : bool(r.options_ok);
  const keyOk = r.key_correct === undefined ? true : bool(r.key_correct);
  const conf = String(r.confidence || "medium").toLowerCase();
  const aiAnswer = normalizeMCQAnswer(String(r.your_answer || "").replace(/^option\s*/i, ""));
  const problems = [];
  if (!textOk) problems.push("The question text looks incomplete or mixed up with other text.");
  if (!optsOk) problems.push("The options look incomplete or do not belong to this question.");
  // ("key wrong" with the AI's own answer equal to the key is a contradiction: trust the key)
  const keyWrong = q.correctAnswer && !keyOk && conf !== "low" && !(aiAnswer && aiAnswer === q.correctAnswer);
  if (keyWrong) problems.push("The answer key does not look right for this question.");
  const note = String(r.problem || "").trim().slice(0, 400);
  q.check.ai = {
    status: problems.length ? "issue" : "ok",
    problems,
    note,
    aiAnswer,
    keyOk,
    confidence: conf,
    topic: String(r.topic || "").trim().slice(0, 80),
    by: meta.model,
    at: Date.now()
  };
  // a re-check keeps the (grouped) topic the question already has
  if (!q.topic && !q.aiTopic && q.check.ai.topic) q.aiTopic = sanitizeDashes(q.check.ai.topic);
}

async function mcqVerifyBatch(batch, topics, signal) {
  const res = await AIEval.runJSON({
    system: MCQ_VERIFY_SYSTEM,
    prompt: mcqVerifyPrompt(batch, topics),
    signal,
    validate: o => Array.isArray(o.results)
  });
  const results = res.data.results;
  const missing = [];
  batch.forEach((q, i) => {
    const r = results.find(x => Number(x && x.n) === i + 1) || (results.length === batch.length ? results[i] : null);
    if (r && typeof r === "object") mcqApplyVerdict(q, r, res);
    else missing.push(q);
  });
  return missing;
}

// Check every question that has no AI verdict yet (or the given ones)
async function mcqVerifyQuestions(only) {
  if (mcqVerify.running) return;
  if (!window.AIEval || !AIEval.isReady()) return;
  const all = state.p1_setup.questions || [];
  // default: every question without an AI verdict, including ones whose check failed earlier
  const todo = (only || all.filter(q => q.check && !q.check.user && (!q.check.ai || q.check.ai.status === "pending" || q.check.ai.status === "error")))
    .filter(q => q.check && !(q.check.local || []).some(i => i.code === "empty-text" || i.code === "few-options"));
  if (!todo.length) return;
  todo.forEach(q => { q.check.ai = { status: "pending" }; });
  saveP1Setup();
  const topics = (state.p1_setup.topics || []).slice(0, 40);
  const batches = [];
  for (let i = 0; i < todo.length; i += MCQ_VERIFY_BATCH) batches.push(todo.slice(i, i + MCQ_VERIFY_BATCH));
  Object.assign(mcqVerify, { running: true, total: todo.length, done: 0, failed: 0, controller: new AbortController(), message: "", error: "" });
  renderP1SetupList();

  let next = 0;
  const worker = async () => {
    while (next < batches.length && !mcqVerify.controller.signal.aborted) {
      const batch = batches[next++];
      try {
        let missing = await mcqVerifyBatch(batch, topics, mcqVerify.controller.signal);
        if (missing.length) missing = await mcqVerifyBatch(missing, topics, mcqVerify.controller.signal);
        missing.forEach(q => { q.check.ai = { status: "error", note: "the AI reply skipped it" }; mcqVerify.failed++; });
      } catch (err) {
        const ex = AIEval.explain(err);
        batch.forEach(q => { if (q.check.ai && q.check.ai.status === "pending") q.check.ai = err.kind === "cancelled" ? null : { status: "error", note: ex.title }; });
        if (err.kind !== "cancelled") { mcqVerify.failed += batch.length; mcqVerify.error = ex.title + ": " + ex.body; }
      }
      mcqVerify.done += batch.length;
      saveP1Setup();
      renderP1SetupList();
    }
  };
  await Promise.all(Array.from({ length: Math.min(MCQ_VERIFY_PARALLEL, batches.length) }, worker));
  // group drifting AI topic names after a whole-file check (not after re-checking a few questions)
  if (!mcqVerify.controller.signal.aborted && todo.length >= MCQ_VERIFY_BATCH) {
    mcqVerify.message = "Grouping topics…";
    try { await mcqConsolidateTopics(mcqVerify.controller.signal); } catch (err) { console.warn("Topic grouping failed:", err && err.message); }
  }
  // a stopped check leaves no question half-checked
  (state.p1_setup.questions || []).forEach(q => { if (q.check && q.check.ai && q.check.ai.status === "pending") q.check.ai = null; });
  mcqVerify.running = false;
  saveP1Setup();
  renderP1SetupList();
}

// Files without topic headings get AI topic names batch by batch, which drift
// ("GDP Limitations" / "Limitations of GDP"). Merge them into a few broad topics.
async function mcqConsolidateTopics(signal) {
  const qs = (state.p1_setup.questions || []).filter(q => !q.topic && q.aiTopic);
  // same name, different case / spacing
  const canon = new Map();
  qs.forEach(q => {
    const k = q.aiTopic.toLowerCase().replace(/\s+/g, " ").trim();
    if (!canon.has(k)) canon.set(k, q.aiTopic.trim());
    q.aiTopic = canon.get(k);
  });
  const names = [...new Set(qs.map(q => q.aiTopic))];
  // a file with topic headings: the AI already picked from those headings, keep them
  if ((state.p1_setup.topics || []).length) return;
  if (names.length <= 10 || !window.AIEval || !AIEval.isReady()) return;
  const chapter = [...new Set(qs.map(q => q.chapter).filter(Boolean))].join(", ");
  const counts = names.map(n => `- ${n} (${qs.filter(q => q.aiTopic === n).length} questions)`).join("\n");
  const res = await AIEval.runJSON({
    system: "You organise an exam question bank. Reply with exactly one valid JSON object - no markdown, no text before or after it.",
    prompt: `These sub-topic labels were given to the MCQs of one chapter${chapter ? ` ("${chapter}")` : ""}. Many overlap or are too narrow.\n${counts}\n\nMerge them into 5-10 broad topics that a student would study as separate parts of this chapter (2-6 words each, Title Case). Every label must map to exactly one broad topic.\nReturn ONE JSON object: {"map": {"<label exactly as given>": "<broad topic>"}}`,
    signal,
    validate: o => o && o.map && typeof o.map === "object"
  });
  const map = res.data.map;
  qs.forEach(q => {
    const t = map[q.aiTopic];
    if (typeof t === "string" && t.trim()) q.aiTopic = sanitizeDashes(t.trim()).slice(0, 80);
  });
}

function mcqStopVerify() {
  if (mcqVerify.controller) mcqVerify.controller.abort();
}

// ---------------------------------------------------------------------------
// 2. Topic-wise analysis of a finished objective test
// ---------------------------------------------------------------------------

// Topic of an MCQ: from the file's headings, else the AI's, else the subject
function mcqTopicOf(q) {
  return String(q.topic || q.aiTopic || (q.check && q.check.ai && q.check.ai.topic) || q.subject || "General").trim();
}

// Is the user's answer correct? (multi-answer questions need the exact set)
function mcqIsCorrect(userAns, correct) {
  const norm = v => String(v || "").toLowerCase().replace(/[^a-e]/g, "").split("").sort().join("");
  return !!userAns && !!correct && norm(userAns) === norm(correct);
}

// [{ topic, total, attempted, correct, wrong, skipped, accuracy, net, max, avgTime, level }] weakest first
function p1TopicStats(test) {
  const by = new Map();
  const pos = test.positiveMarks || 1;
  const neg = test.negativeMarks || 0.25;
  (test.questions || []).forEach((q, i) => {
    const topic = mcqTopicOf(q);
    const k = topic.toLowerCase();
    const t = by.get(k) || { topic, total: 0, attempted: 0, correct: 0, wrong: 0, skipped: 0, net: 0, max: 0, time: 0, idx: [] };
    const ans = test.answers[i];
    t.total++;
    t.max += pos;
    t.time += Number((test.times || [])[i]) || 0;
    t.idx.push(i);
    if (!ans) t.skipped++;
    else if (mcqIsCorrect(ans, q.correctAnswer)) { t.attempted++; t.correct++; t.net += pos; }
    else { t.attempted++; t.wrong++; t.net -= neg; }
    by.set(k, t);
  });
  return Array.from(by.values()).map(t => {
    const accuracy = t.attempted ? Math.round(t.correct / t.attempted * 1000) / 10 : 0;
    const scorePct = t.max ? t.net / t.max * 100 : 0;
    let level = "strong";
    if (t.attempted === 0 || accuracy < 50 || scorePct < 30) level = "weak";
    else if (accuracy < 75 || scorePct < 60) level = "fair";
    return Object.assign(t, { accuracy, net: Math.round(t.net * 100) / 100, scorePct: Math.round(scorePct * 10) / 10, avgTime: t.total ? Math.round(t.time / t.total) : 0, level });
  }).sort((a, b) => (a.scorePct - b.scorePct) || (b.total - a.total));
}

function p1LoadAnalyses() {
  const o = loadJSON(P1_ANALYSIS_KEY, {});
  return o && typeof o === "object" && !Array.isArray(o) ? o : {};
}

function p1SaveAnalysis(testId, analysis) {
  const all = p1LoadAnalyses();
  all[testId] = analysis;
  const ids = Object.keys(all).sort((a, b) => (all[a].at || 0) - (all[b].at || 0));
  while (ids.length > P1_ANALYSIS_MAX_TESTS) delete all[ids.shift()];
  try {
    saveJSON(P1_ANALYSIS_KEY, all);
  } catch (_) {
    // storage full: keep only this one
    try { saveJSON(P1_ANALYSIS_KEY, { [testId]: analysis }); } catch (e) { /* ignore */ }
  }
}

const p1AnalysisJobs = new Map();   // testId -> { status, message, error, startedAt }

const P1_ANALYSIS_SYSTEM =
  "You are an expert RBI Grade B faculty member reviewing a candidate's objective (MCQ) test. " +
  "Explain concepts clearly and accurately for an exam aspirant. Reply with exactly one valid JSON object - no markdown, no text before or after it.";

function p1AnalysisPrompt(test, stats) {
  const L = [];
  const chapter = [...new Set(test.questions.map(q => q.chapter).filter(Boolean))].join(", ");
  const subjects = [...new Set(test.questions.map(q => q.subject).filter(Boolean))].join(", ");
  L.push(`Objective test: ${test.questions.length} MCQs${subjects ? " · " + subjects : ""}${chapter ? " · chapter: " + chapter : ""}.`);
  L.push(`Marking: +${test.positiveMarks || 1} correct, -${test.negativeMarks || 0.25} wrong. Score ${test.score} / ${test.maxScore}, accuracy ${test.accuracy}%.`);
  L.push("");
  L.push("TOPIC-WISE RESULT (weakest first):");
  stats.forEach(t => L.push(`- ${t.topic}: ${t.correct} correct, ${t.wrong} wrong, ${t.skipped} not attempted of ${t.total} (accuracy ${t.accuracy}%, net ${t.net}/${t.max})`));
  L.push("");
  L.push("QUESTIONS THE CANDIDATE GOT WRONG OR LEFT (grouped by topic):");
  let count = 0;
  stats.filter(t => t.wrong + t.skipped > 0).forEach(t => {
    L.push("");
    L.push(`### Topic: ${t.topic}`);
    t.idx.forEach(i => {
      const q = test.questions[i];
      const a = test.answers[i];
      if (mcqIsCorrect(a, q.correctAnswer) || count >= 40) return;
      count++;
      L.push(`[Q${i + 1}] ${String(q.text).slice(0, 900)}`);
      (q.options || []).forEach(o => L.push(`(${o.label}) ${String(o.text).slice(0, 300)}`));
      L.push(`Correct: ${formatMCQAnswer(q.correctAnswer)} · Candidate: ${a ? formatMCQAnswer(a) : "not attempted"}`);
      if (q.explanation) L.push("Key explanation: " + String(q.explanation).slice(0, 600));
    });
  });
  L.push("");
  L.push("Write the analysis the candidate will study before the next test. Return ONE JSON object:");
  L.push('{"overall": "3-5 sentences: what the result shows, the weakest areas and the single most important change",');
  L.push(' "topics": [ one item for EVERY topic above that has a wrong or unattempted question, weakest first: {');
  L.push('   "topic": exact topic name from the list above,');
  L.push('   "diagnosis": "2-3 sentences on what the mistakes show the candidate misunderstands or does not know",');
  L.push('   "explanation": "a clear, accurate teaching explanation of the concepts of this topic that these questions test (8-15 sentences, plain text, \\n between paragraphs)",');
  L.push('   "key_points": ["5-8 exam-ready facts, definitions or formulas to remember"],');
  L.push('   "traps": ["the traps or confusions behind these wrong answers"],');
  L.push('   "questions": [{"q": the question number shown as [Qn], "why": "why the correct option is right and the candidate\'s option (or skipping) was wrong, 2-4 sentences"}],');
  L.push('   "practice": "what to practise next for this topic" } ],');
  L.push(' "strong_topics": ["topics that went well"],');
  L.push(' "next_steps": ["4-6 specific steps for the next test, most important first"],');
  L.push(' "test_strategy": "2-3 sentences on attempt strategy: accuracy vs attempts, negative marking, time per question"}');
  return L.join("\n");
}

function p1NormalizeAnalysis(o, stats, meta) {
  const s = (v, n) => String(v == null ? "" : v).replace(/\r/g, "").trim().slice(0, n || 4000);
  const list = (v, n, m) => (Array.isArray(v) ? v : (v ? [v] : [])).map(x => s(typeof x === "object" ? JSON.stringify(x) : x, m || 600)).filter(Boolean).slice(0, n || 10);
  const topics = (Array.isArray(o.topics) ? o.topics : []).filter(t => t && typeof t === "object").map(t => ({
    topic: s(t.topic, 120),
    diagnosis: s(t.diagnosis, 1200),
    explanation: s(t.explanation, 6000).replace(/\\n/g, "\n"),
    keyPoints: list(t.key_points, 10, 500),
    traps: list(t.traps, 8, 400),
    questions: (Array.isArray(t.questions) ? t.questions : []).map(x => ({ q: parseInt(String(x && (x.q != null ? x.q : x.n)).replace(/\D/g, ""), 10), why: s(x && (x.why || x.explanation), 1200) })).filter(x => x.q && x.why),
    practice: s(t.practice, 800)
  })).filter(t => t.topic && (t.explanation || t.diagnosis));
  return {
    at: Date.now(),
    overall: s(o.overall, 1500),
    topics,
    strong: list(o.strong_topics, 12, 120),
    next: list(o.next_steps, 8, 500),
    strategy: s(o.test_strategy, 1000),
    provider: meta.provider,
    model: meta.model
  };
}

// Ask the AI to explain the weak topics of a test (result saved and shown on the result screen)
async function p1RunAnalysis(test) {
  if (!test || !window.AIEval || !AIEval.isReady()) return;
  const job = p1AnalysisJobs.get(test.id);
  if (job && job.status === "running") return;
  const stats = p1TopicStats(test);
  if (!stats.some(t => t.wrong + t.skipped > 0)) {
    p1SaveAnalysis(test.id, { at: Date.now(), overall: "Every question was answered correctly - no weak topic in this test.", topics: [], strong: stats.map(t => t.topic), next: [], strategy: "", provider: "", model: "" });
    p1RenderAnalysis(test);
    return;
  }
  const j = { status: "running", message: "Analysing your answers…", error: null, startedAt: Date.now(), controller: new AbortController() };
  p1AnalysisJobs.set(test.id, j);
  p1RenderAnalysis(test);
  const timer = setInterval(() => p1RenderAnalysisStatus(test), 1000);
  try {
    const res = await AIEval.runJSON({
      system: P1_ANALYSIS_SYSTEM,
      prompt: p1AnalysisPrompt(test, stats),
      signal: j.controller.signal,
      onStatus: m => { j.message = m; },
      validate: o => Array.isArray(o.topics)
    });
    p1SaveAnalysis(test.id, p1NormalizeAnalysis(res.data, stats, res));
    p1AnalysisJobs.delete(test.id);
  } catch (err) {
    if (err && err.kind === "cancelled") {
      p1AnalysisJobs.delete(test.id);            // stopped by you: back to the "Explain" button
    } else {
      j.status = "error";
      j.error = err;
    }
  } finally {
    clearInterval(timer);
    p1RenderAnalysis(test);
    // the review cards show the AI's "why" for each wrong answer
    if (state.p1_lastResultTest && state.p1_lastResultTest.id === test.id) renderP1ResultReviewList();
  }
}

function p1RenderAnalysisStatus(test) {
  const j = p1AnalysisJobs.get(test.id);
  const el = document.querySelector("#p1-analysis [data-p1-ai-status]");
  if (el && j) el.textContent = j.message + " · " + Math.round((Date.now() - j.startedAt) / 1000) + " s";
}

const P1_LEVEL_LABEL = { weak: "Weak", fair: "Needs work", strong: "Strong" };

// Topic table + AI explanations on the objective result screen
function p1RenderAnalysis(test) {
  const box = $("p1-analysis");
  if (!box || !test) return;
  if (state.p1_lastResultTest && state.p1_lastResultTest.id !== test.id) return;
  const stats = p1TopicStats(test);
  const analysis = p1LoadAnalyses()[test.id] || null;
  const job = p1AnalysisJobs.get(test.id);
  const ready = window.AIEval && AIEval.isReady();
  const weak = stats.filter(t => t.level === "weak");

  const rows = stats.map(t => `
    <tr class="lvl-${t.level}">
      <td><strong>${escapeHTML(t.topic)}</strong> <span class="p1-lvl p1-lvl-${t.level}">${P1_LEVEL_LABEL[t.level]}</span></td>
      <td class="num">${t.correct}</td><td class="num">${t.wrong}</td><td class="num">${t.skipped}</td>
      <td class="num">${t.attempted ? t.accuracy + "%" : "-"}</td>
      <td class="num">${t.net.toFixed(2)} / ${t.max.toFixed(2)}</td>
      <td class="num">${t.avgTime ? t.avgTime + " s" : "-"}</td>
      <td><span class="p1-bar"><i style="width:${Math.max(0, Math.min(100, t.scorePct))}%"></i></span></td>
    </tr>`).join("");

  let ai = "";
  if (job && job.status === "running") {
    ai = `<div class="p1-ai-status"><span class="ai-spinner"></span><div><strong>Explaining your weak topics…</strong><span data-p1-ai-status>${escapeHTML(job.message)}</span></div>
      <button type="button" class="btn-soft" data-p1-action="stop-analysis">Stop</button></div>`;
  } else if (job && job.status === "error") {
    const ex = AIEval.explain(job.error);
    ai = `<div class="ai-error-box"><div class="ai-error-text"><strong>${escapeHTML(ex.title)}</strong><p>${escapeHTML(ex.body)}</p></div>
      <div class="ai-error-actions"><button type="button" class="ai-btn-primary" data-p1-action="run-analysis">Retry</button>${ex.settings ? `<button type="button" class="btn-soft" data-ai-action="open-settings">AI Settings</button>` : ""}</div></div>`;
  } else if (analysis) {
    ai = p1AnalysisHTML(analysis, test);
  } else if (ready) {
    ai = `<div class="p1-ai-cta"><p>Get every weak topic explained: what your mistakes show, the concepts to revise, the traps, and why each wrong answer was wrong.</p>
      <button type="button" class="ai-btn-primary" data-p1-action="run-analysis">Explain my weak topics</button></div>`;
  } else {
    ai = `<div class="p1-ai-cta"><p>Add an AI key to get each weak topic explained, with the reason behind every wrong answer.</p>
      <button type="button" class="btn-soft" data-ai-action="open-settings">Add API key</button></div>`;
  }

  box.innerHTML = `
    <div class="p1-analysis-head">
      <div>
        <h3>Topic-wise analysis</h3>
        <p class="p1-analysis-sub">${(() => {
          const fair = stats.filter(t => t.level === "fair");
          const names = (list) => list.slice(0, 3).map(t => escapeHTML(t.topic)).join(", ") + (list.length > 3 ? ` and ${list.length - 3} more` : "");
          if (weak.length) return `Weakest: ${names(weak)}.`;
          if (fair.length) return `No weak topic. Needs work: ${names(fair)}.`;
          return "Every topic went well.";
        })()} ${stats.length} topic${stats.length === 1 ? "" : "s"} in this test.</p>
      </div>
      ${analysis && ready && !(job && job.status === "running") ? `<button type="button" class="btn-soft" data-p1-action="run-analysis">Analyse again</button>` : ""}
    </div>
    <div class="table-scroll">
      <table class="p1-topic-table">
        <thead><tr><th>Topic</th><th>Correct</th><th>Wrong</th><th>Left</th><th>Accuracy</th><th>Net marks</th><th>Avg time</th><th>Score</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${ai}
  `;
}

function p1AnalysisHTML(a, test) {
  const para = t => escapeHTML(t).split(/\n{1,}/).map(x => x.trim()).filter(Boolean).map(x => `<p>${x}</p>`).join("");
  const list = (items, ordered) => items.length ? `<${ordered ? "ol" : "ul"}>${items.map(x => `<li>${escapeHTML(x)}</li>`).join("")}</${ordered ? "ol" : "ul"}>` : "";
  const topics = a.topics.map((t, k) => {
    const qs = t.questions.map(x => {
      const q = test.questions[x.q - 1];
      return `<li><button type="button" class="ai-link" data-p1-action="goto-q" data-q="${x.q}">Q${x.q}</button>${q ? ` <span class="ai-muted">${escapeHTML(String(q.text).split("\n").pop().slice(0, 110))}</span>` : ""}<p>${escapeHTML(x.why)}</p></li>`;
    }).join("");
    return `
      <details class="p1-topic-explain" ${k < 2 ? "open" : ""}>
        <summary><span>${escapeHTML(t.topic)}</span><span class="ai-sec-meta">${t.questions.length} question${t.questions.length === 1 ? "" : "s"} explained</span></summary>
        <div class="p1-topic-body">
          ${t.diagnosis ? `<h6>What your mistakes show</h6><p>${escapeHTML(t.diagnosis)}</p>` : ""}
          ${t.explanation ? `<h6>The concepts, explained</h6>${para(t.explanation)}` : ""}
          ${t.keyPoints.length ? `<h6>Remember for the exam</h6>${list(t.keyPoints)}` : ""}
          ${t.traps.length ? `<h6>Traps to avoid</h6>${list(t.traps)}` : ""}
          ${qs ? `<h6>Your wrong answers</h6><ul class="p1-why-list">${qs}</ul>` : ""}
          ${t.practice ? `<h6>Practise next</h6><p>${escapeHTML(t.practice)}</p>` : ""}
        </div>
      </details>`;
  }).join("");
  return `
    <div class="p1-ai-result">
      ${a.overall ? `<p class="ai-summary">${escapeHTML(a.overall)}</p>` : ""}
      ${topics}
      <div class="ai-insights">
        ${a.next.length ? `<div class="ai-insight"><h5>Next steps</h5>${list(a.next, true)}</div>` : ""}
        ${a.strategy ? `<div class="ai-insight"><h5>Attempt strategy</h5><p>${escapeHTML(a.strategy)}</p></div>` : ""}
        ${a.strong.length ? `<div class="ai-insight"><h5>Went well</h5>${list(a.strong)}</div>` : ""}
      </div>
      ${a.model ? `<p class="ai-meta">Explained by ${escapeHTML(a.provider)} · ${escapeHTML(a.model)} · ${escapeHTML(new Date(a.at).toLocaleString())}</p>` : ""}
    </div>`;
}

// Remove the stored AI analyses of deleted objective tests
function p1DeleteAnalyses(testIds) {
  const all = p1LoadAnalyses();
  let changed = false;
  (testIds || []).forEach(id => { if (all[id]) { delete all[id]; changed = true; } });
  if (changed) saveJSON(P1_ANALYSIS_KEY, all);
}

// The AI's note on one question of a test (shown in the question review cards)
function p1WhyNote(testId, qIndex) {
  const a = p1LoadAnalyses()[testId];
  if (!a) return "";
  for (const t of a.topics) {
    const x = t.questions.find(y => y.q === qIndex + 1);
    if (x) return x.why;
  }
  return "";
}

// Run right after an objective test is submitted
function p1AutoAnalysis(test) {
  if (!test || !window.AIEval || !AIEval.isReady()) return;
  p1RunAnalysis(test);
}

// Clicks inside the analysis box
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-p1-action]");
  if (!btn) return;
  const test = state.p1_lastResultTest;
  const action = btn.dataset.p1Action;
  if (action === "run-analysis" && test) {
    p1RunAnalysis(test);
  } else if (action === "stop-analysis" && test) {
    const j = p1AnalysisJobs.get(test.id);
    if (j && j.controller) j.controller.abort();
  } else if (action === "goto-q") {
    const card = document.querySelector(`#p1-result-list [data-q-index="${Number(btn.dataset.q) - 1}"]`);
    if (!card) {
      state.p1_resultFilter = "all";
      document.querySelectorAll("#screen-result-p1 .rf-btn").forEach(b => b.classList.toggle("active", b.dataset.filter === "all"));
      renderP1ResultReviewList();
    }
    const el = document.querySelector(`#p1-result-list [data-q-index="${Number(btn.dataset.q) - 1}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});
