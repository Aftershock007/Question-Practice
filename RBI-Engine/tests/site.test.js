"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const h = require("./helpers");

const SITE = fs.existsSync(path.join(h.APP_DIR, "ai_eval.js")) && fs.existsSync(path.join(h.APP_DIR, "index.html"));
const skip = { skip: !SITE };
const plain = v => JSON.parse(JSON.stringify(v));

const ANSWER = "INTRODUCTION\nIndia have adopted flexible inflation targeting in 2016. The organisation of the MPC is sound.\n\nANALYSIS\n" +
  "Food prices drive CPI inflation in India because food has a large weight. ".repeat(38).trim() +
  "\nIn my opinion it worked well.\n\nWAY FORWARD\nImprove supply chains.";

function site() {
  const ctx = h.siteContext();
  return { ctx, I: ctx.AIEval._internal, AM: ctx.AnswerMarks };
}

function question() {
  return { id: "q1", paper: "ESI", marks: 15, wordLimit: 600, text: "Critically examine FIT.", modelAnswer: "" };
}

function reply(over) {
  return Object.assign({
    track: "A", checklist: [], subparts: [{ part: "Examine", coverage: "TEXTBOOK ONLY", comment: "x" }], examiner_checks: [], anchor_count: 3, off_topic: false,
    caps_triggered: [], pacing_audit: "", anchors_used: [], bare_name_drops: [], missing_anchors: [], verify_flags: [],
    error_log: [{ quote: "Food prices drive CPI inflation", code: "RP-2", problem: "Generic.", correction: "Name the CPI food weight." }, { quote: "Banks hate inflation", code: "RP-6", problem: "Not in the answer.", correction: "y" }],
    parameters: [
      { name: "P1 Directive compliance & scope", max_marks: 3, cap_applied: "", awarded: 2, justification: "j1", lost: ["Second part not answered."] },
      { name: "P2 Conceptual clarity & mechanisms", max_marks: 4, cap_applied: "", awarded: 2.5, justification: "j2", lost: [] },
      { name: "P3 Evidence: reports, committees, data", max_marks: 4, cap_applied: "", awarded: 2, justification: "j3", lost: ["No data."] },
      { name: "P4 Structure & presentation", max_marks: 2.5, cap_applied: "", awarded: 2, justification: "j4", lost: [] },
      { name: "P5 Register & word discipline", max_marks: 1.5, cap_applied: "", awarded: 1, justification: "j5", lost: [] }
    ],
    penalties: [{ code: "RP-2", trigger: "Opinion without evidence", quote: "In my opinion it worked well", deduction: 0.25 }, { code: "RP-8", trigger: "Slang", quote: "not in the answer at all", deduction: 0.25 }],
    stage1_raw_sum: 9.5, total_penalties: 0.5, final_score: 9, grade: "B", merit_check: "", summary: "Summary.", strengths: [],
    rewrites: [
      { before: "In my opinion it worked well.", after: "FIT has broadly delivered price stability.", why: "Opinion without evidence." },
      { before: "This sentence is not in the answer.", after: "x", why: "y" },
      { before: "Improve supply chains.", after: "Improve supply chains.", why: "No change." }
    ],
    additions: [
      { after: "The organisation of the MPC is sound", add: "The MPC has six members.", why: "Adds a fact." },
      { after: "Words that do not appear", add: "x", why: "y" },
      { after: "", add: "End with the 2021 review of the target.", why: "Recent development." }
    ],
    model_answer: "Model.", action_plan: [], topic: "FIT", concept_gaps: [],
    writing_audit: {
      grammar_errors: [
        { quote: "India have adopted", type: "tense", explanation: "Use the simple past.", correction: "India adopted" },
        { quote: "The organisation of the MPC", type: "grammar", explanation: "x", correction: "The organization of the MPC" }
      ],
      spelling_errors: [],
      factual_errors: [
        { quote: "", problem: "No quote.", correct_fact: "x" },
        { quote: "The MPC was abolished", problem: "Invented.", correct_fact: "y" },
        { quote: "flexible inflation targeting in 2016", problem: "Say how it was adopted.", correct_fact: "FIT was adopted in 2016 by amending the RBI Act, 1934." }
      ],
      style: { verdict: "Nearly there", score: 6, assessment: "Sober.", issues: [] },
      structure: { assessment: "", issues: [] },
      vocabulary: { assessment: "", weak_words: [{ used: "a lot", better: "considerably" }, { used: "organisation", better: "organization" }, { used: "worked well", better: "has delivered" }] },
      sentence_craft: { assessment: "", examples: [] },
      presentation: "", improvement_plan: ["Plan."]
    }
  }, over || {});
}

test("the site uses the shared quote checks from answer-marks.js", skip, () => {
  const { I, AM } = site();
  assert.equal(I.quoteInScript, AM.quoteInScript);
  assert.equal(I.isBritishVariant, AM.isBritishVariant);
  assert.equal(I.isBritishVariant("controled", "controlled"), false);
});

test("the site drops quotes that are not in the answer and British-only corrections, and keeps reasons and penalty quotes", skip, () => {
  const { I } = site();
  const r = I.normalizeReport(reply(), question(), ANSWER);
  assert.deepEqual(r.parameters.map(p => p.lost), [["Second part not answered."], [], ["No data."], [], []]);
  assert.deepEqual(r.penalties.map(p => p.quote), ["In my opinion it worked well", ""]);
  assert.deepEqual(r.rewrites.map(w => w.before), ["In my opinion it worked well."]);
  assert.deepEqual(r.additions.map(a => a.add), ["The MPC has six members.", "End with the 2021 review of the target."]);
  assert.deepEqual(r.writing.facts.map(f => f.quote), ["flexible inflation targeting in 2016"]);
  assert.deepEqual(r.errors.map(e => e.quote), ["Food prices drive CPI inflation"]);
  assert.deepEqual(r.writing.grammar.map(g => g.quote), ["India have adopted"]);
  assert.deepEqual(r.writing.vocabulary.weak.map(x => x.used), ["worked well"]);
  assert.equal(r.score, 9);
});

test("the site applies the hard ceiling, the off-topic zero and the engine's penalty values", skip, () => {
  const { I } = site();
  const full = reply({ parameters: reply().parameters.map(p => Object.assign({}, p, { awarded: p.max_marks })) });
  const capped = I.normalizeReport(full, question(), ANSWER);
  assert.equal(capped.score, 9.5);
  assert.equal(capped.ceilingApplied, true);
  assert.ok(capped.rules.some(x => /hard ceiling of 9\.5/.test(x)));
  const off = I.normalizeReport(reply({ off_topic: true }), question(), ANSWER);
  assert.equal(off.score, 0);
  assert.equal(off.offTopic, true);
  assert.ok(off.rules.some(x => /Off-topic/.test(x)));
  const R = require("../src/rubric");
  assert.equal(I.penaltyValue("RP-7", 10), 0.25);
  assert.equal(I.penaltyValue("RP-7", 15), 0.5);
  for (const marks of [5, 8, 10, 12, 15, 20, 25, 30, 40]) {
    for (let n = 1; n <= 8; n++) assert.equal(I.penaltyValue("RP-" + n, marks), R.penaltyValue("RP-" + n, marks, "C"), "RP-" + n + " at " + marks + " marks");
    for (const track of ["A", "B", "C", "D"]) assert.equal(I.ceilingFor(track, marks), R.ceilingFor(track, marks), track + " ceiling at " + marks);
  }
});

test("a precis of 10 marks keeps its lifting penalty", skip, () => {
  const { I } = site();
  const q = { id: "q2", paper: "English", marks: 10, wordLimit: 100, text: "Write a precis.", passage: "p" };
  const o = reply({ track: "C", parameters: [{ name: "Title", max_marks: 1, awarded: 1 }, { name: "Central idea", max_marks: 3.25, awarded: 2 }, { name: "Paraphrasing", max_marks: 2.25, awarded: 1 }, { name: "One paragraph", max_marks: 1.75, awarded: 1 }, { name: "Word limit", max_marks: 1.75, awarded: 1 }], penalties: [{ code: "RP-7", trigger: "Copied a sentence", quote: "", deduction: 0 }] });
  const r = I.normalizeReport(o, q, "Food prices drive CPI inflation in India because food has a large weight. ".repeat(7).trim());
  assert.deepEqual(r.penalties.map(p => [p.code, p.deduction]), [["RP-7", 0.25]]);
});

test("the cross-check fires for a top-grade mark that covers little of the reference", skip, () => {
  const { I } = site();
  const q = question();
  q.modelAnswer = "Quantum computing.";
  q.scheme = { hash: I.schemeHash(q), points: [{ id: "K1", point: "Quantum computing qubits entanglement", weight: 1 }] };
  const why = I.crossCheckReason({ score: 8, checklist: [{ id: "K1", coverage: "missing", weight: 1 }] }, q, { wordCount: 520, text: ANSWER });
  assert.match(why, /top-grade mark/);
  assert.equal(I.crossCheckReason({ score: 7, checklist: [{ id: "K1", coverage: "missing", weight: 1 }] }, q, { wordCount: 520, text: ANSWER }), "");
});

test("the coverage band is centred on coverage times the hard ceiling and never lifts a mark above it", skip, () => {
  const { I } = site();
  const run = (score, covs) => ({ score, scoreOnly: false, track: "A", usage: null, checklist: covs.map((c, i) => ({ id: "K" + (i + 1), coverage: c, weight: 1 })) });
  const low = I.combineRuns([run(9, ["partial", "missing"])], question(), 15, Date.now(), "");
  assert.equal(low.score, 4.75);
  assert.equal(low.consistency.anchored, "lowered");
  const high = I.combineRuns([run(7, ["full", "full"])], question(), 15, Date.now(), "");
  assert.equal(high.score, 7);
  assert.equal(high.consistency.anchored, "");
});

test("the site builds the same kinds of marks and a ledger that adds up, with a row for the consistency check", skip, () => {
  const { I } = site();
  const r = I.normalizeReport(reply(), question(), ANSWER);
  const ledger = I.siteLedger(r, question());
  assert.equal(ledger.total, 6);
  assert.deepEqual(plain(ledger.rows.map(x => x.title).slice(0, 2)), ["P1 · Directive compliance & scope", "P2 · Conceptual clarity & mechanisms"]);
  const unnamed = I.siteLedger(Object.assign({}, r, { parameters: r.parameters.map(p => Object.assign({}, p, { name: p.name.replace(/^P\d · /, "") })) }), question());
  assert.equal(unnamed.rows[0].title, "P1 Directive compliance & scope");
  const built = I.siteMarks(r, ANSWER, "ai-q1-", ledger);
  assert.deepEqual(plain(built.counts), { lang: 1, frame: 1, fact: 1, add: 2, cut: 1 });
  assert.ok(built.marks.every(m => m.inline));
  const cut = built.marks.find(m => m.kind === "cut");
  assert.equal(cut.ref, "ai-q1-" + ledger.penaltyRefs[0]);
  const combined = Object.assign({}, r, { score: 8.5, consistency: { runs: [9, 8], method: "average of 2 independent gradings", anchored: "" } });
  const l2 = I.siteLedger(combined, question());
  const last = l2.rows[l2.rows.length - 1];
  assert.equal(last.kind, "adjust");
  assert.equal(last.lost, 0.5);
  assert.match(last.reasons[0], /average of 2 independent gradings \(9, 8\)/);
  assert.equal(l2.total, 6.5);
});

test("the site report shows the marked answer and the ledger, and the Markdown export has both", skip, () => {
  const { I } = site();
  const q = question();
  const r = Object.assign(I.normalizeReport(reply(), q, ANSWER), { createdAt: 0, providerLabel: "Google Gemini", model: "m" });
  const t = { id: "t1", questions: [q], answers: { q1: { text: ANSWER, wordCount: 520 } } };
  const html = I.reportHTML(r, q, { test: t });
  assert.ok(html.includes("<div class=\"mk-answer\">"));
  assert.ok(html.includes("<ul class=\"mk-legend\">"));
  assert.ok(html.includes("<table class=\"mk-ltable ai-table\">"));
  assert.ok(html.includes("Why you lost 6 marks"));
  assert.ok(html.includes("<del class=\"mk-old\">India have adopted</del><ins class=\"mk-new\">India adopted</ins>"));
  assert.doesNotMatch(html, /Your sentences, rewritten/);
  const md = I.questionMarkdown(t, q, 0, r);
  assert.ok(md.includes("### Your answer, marked"));
  assert.ok(md.includes("[-India have adopted-]{+India adopted+}(L1)"));
  assert.ok(md.includes("### Why you lost 6 marks"));
});

test("a report saved before this change still renders, and its ledger still adds up", skip, () => {
  const { I } = site();
  const q = question();
  const old = I.normalizeReport(reply({ additions: undefined, off_topic: undefined, parameters: reply().parameters.map(p => Object.assign({}, p, { lost: undefined })), penalties: reply().penalties.map(p => ({ code: p.code, trigger: p.trigger, deduction: p.deduction })) }), q, ANSWER);
  for (const k of ["additions", "ceiling", "ceilingApplied", "offTopic", "autoFail"]) delete old[k];
  old.parameters.forEach(p => { delete p.lost; });
  old.penalties.forEach(p => { delete p.quote; });
  Object.assign(old, { createdAt: 0, providerLabel: "Google Gemini", model: "m" });
  const t = { id: "t1", questions: [q], answers: { q1: { text: ANSWER, wordCount: 520 } } };
  const html = I.reportHTML(old, q, { test: t });
  assert.ok(html.includes("<div class=\"mk-answer\">"));
  assert.ok(html.includes("Why you lost 6 marks"));
  const ledger = I.siteLedger(old, q);
  assert.equal(ledger.total, 6);
  assert.ok(ledger.rows.find(r => r.title.startsWith("P2")).reasons.includes("j2."));
  assert.ok(I.questionMarkdown(t, q, 0, old).includes("### Why you lost 6 marks"));
});

test("a breakdown that does not add up gets a plain adjustment row, not a consistency row", skip, () => {
  const { I } = site();
  const r = I.normalizeReport(reply({ parameters: reply().parameters.map((p, i) => (i === 1 ? Object.assign({}, p, { max_marks: undefined }) : p)) }), question(), ANSWER);
  const l = I.siteLedger(r, question());
  const last = l.rows[l.rows.length - 1];
  assert.equal(last.kind, "adjust");
  assert.equal(last.title, "Final adjustment");
  assert.equal(l.total, Math.round((15 - r.score) * 100) / 100);
});
