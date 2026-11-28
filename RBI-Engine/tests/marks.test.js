"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../src/answer-marks");
const u = require("../src/util");

test("the quote checks live in the shared core and util re-exports the same functions", () => {
  for (const name of ["plainText", "quoteInScript", "isBritishVariant", "onlyBritishChanges", "findSpan", "normChars"]) {
    assert.equal(typeof M[name], "function", name);
    assert.equal(u[name], M[name], name);
  }
});

const TEXT = "India have adopted inflation targeting in 2016. The target is 6% CPI inflation. It are a good framework.\n\nWAY FORWARD\nSupply measures help.";

function at(text, words) {
  const i = text.indexOf(words);
  assert.ok(i >= 0, "fixture text must contain: " + words);
  return { start: i, end: i + words.length };
}

function byId(built, id) {
  return built.marks.find(m => m.id === id);
}

test("language marks keep valid offsets, and quoted ones are found in the text", () => {
  const b = M.buildMarks(TEXT, { lang: [{ start: 6, end: 10, wrong: "have", fix: "has", why: "Agreement." }, { wrong: "It are", fix: "It is", why: "Agreement." }] });
  assert.deepEqual([byId(b, "L1").start, byId(b, "L1").end, byId(b, "L1").inline], [6, 10, true]);
  const p = at(TEXT, "It are");
  assert.deepEqual([byId(b, "L2").start, byId(b, "L2").end, byId(b, "L2").wrong], [p.start, p.end, "It are"]);
  assert.deepEqual(b.counts, { lang: 2, frame: 0, fact: 0, add: 0, cut: 0 });
});

test("an offset that does not match its words is found again by its words", () => {
  const b = M.buildMarks(TEXT, { lang: [{ start: 0, end: 4, wrong: "have", fix: "has" }] });
  assert.equal(byId(b, "L1").start, 6);
});

test("a spelling slip is placed by its context when the word appears twice", () => {
  const text = "The comittee met. A new comittee was formed.";
  const b = M.buildMarks(text, { lang: [{ wrong: "comittee", fix: "committee", context: "A new comittee was" }] });
  assert.equal(byId(b, "L1").start, text.lastIndexOf("comittee"));
});

test("a fact inside a sentence to reframe is nested; a fact across the sentence edge keeps the fact and lists the frame only", () => {
  const sentence = at(TEXT, "The target is 6% CPI inflation.");
  const nested = M.buildMarks(TEXT, { facts: [{ quote: "6% CPI", fix: "4% CPI (band 2-6%)", why: "Wrong target." }], frames: [{ start: sentence.start, end: sentence.end, fix: "India targets 4% CPI inflation within a 2-6% band.", why: "Vague." }] });
  assert.equal(byId(nested, "F1").inline, true);
  assert.equal(byId(nested, "B1").inline, true);
  const across = M.buildMarks(TEXT, { facts: [{ quote: "6% CPI inflation. It are", fix: "x", why: "y" }], frames: [{ start: sentence.start, end: sentence.end, fix: "Better.", why: "z" }] });
  assert.equal(byId(across, "F1").inline, true);
  assert.equal(byId(across, "B1").inline, false);
});

test("a language mark inside a fact or a frame stays in the answer; one across an edge is listed but not shown", () => {
  const sentence = at(TEXT, "It are a good framework.");
  const b = M.buildMarks(TEXT, {
    frames: [{ start: sentence.start, end: sentence.end, fix: "It is a credible framework.", why: "Weak." }],
    lang: [{ wrong: "It are", fix: "It is" }, { wrong: "inflation. It", fix: "inflation; it" }]
  });
  const inside = b.marks.find(m => m.wrong === "It are");
  const across = b.marks.find(m => m.wrong === "inflation. It");
  assert.equal(inside.inline, true);
  assert.equal(across.inline, false);
  assert.equal(inside.id, "L1");
  assert.equal(across.id, "L2");
});

test("ids follow reading order within each kind, and marks not shown come last", () => {
  const b = M.buildMarks(TEXT, { lang: [{ wrong: "It are", fix: "It is" }, { wrong: "not in the answer", fix: "x" }, { wrong: "have", fix: "has" }] });
  assert.deepEqual(b.marks.filter(m => m.kind === "lang").map(m => [m.id, m.wrong, m.inline]), [["L1", "have", true], ["L2", "It are", true], ["L3", "not in the answer", false]]);
});

test("an addition goes to the end of the sentence holding its anchor, after any mark that ends there", () => {
  const sentence = at(TEXT, "The target is 6% CPI inflation.");
  const b = M.buildMarks(TEXT, {
    frames: [{ start: sentence.start, end: sentence.end, fix: "Better.", why: "Weak." }],
    adds: [{ after: "The target is 6%", fix: "The Urjit Patel Committee (2014) recommended it.", why: "Adds a source." }, { at: TEXT.length, fix: "End note.", why: "x" }, { after: "", fix: "At the end too.", why: "y" }]
  });
  assert.equal(byId(b, "A1").start, sentence.end);
  assert.equal(byId(b, "A2").start, TEXT.length);
  assert.equal(byId(b, "A3").start, TEXT.length);
});

test("sentenceEnd stops at the full stop that ends the sentence, not at a decimal point", () => {
  const t = "Inflation was 6.5% in 2022 and fell. Next one.";
  assert.equal(M.sentenceEnd(t, t.indexOf("in 2022")), t.indexOf("fell.") + 5);
  assert.equal(M.sentenceEnd(t, t.indexOf(" Next")), t.indexOf(" Next"));
  assert.equal(M.sentenceEnd("A heading\nText.", 3), 9);
});

test("a deduction tag sits at the end of its quote, moved past a language mark it falls inside", () => {
  const b = M.buildMarks(TEXT, {
    lang: [{ wrong: "a good framework", fix: "a credible framework" }],
    cuts: [{ quote: "It are a good", deduction: 0.25, label: "Platitude / fluff", ref: "q1-loss-2" }]
  });
  const cut = b.marks.find(m => m.kind === "cut");
  assert.equal(cut.id, "D1");
  assert.equal(cut.start, at(TEXT, "a good framework").end);
  assert.equal(cut.ref, "q1-loss-2");
  assert.equal(cut.deduction, 0.25);
});

test("empty or no-change items are dropped and counted", () => {
  const b = M.buildMarks(TEXT, {
    lang: [{ wrong: "have", fix: "have" }, { wrong: "", fix: "x" }],
    frames: [{ quote: "It are a good framework.", fix: "" }],
    facts: [{ quote: "", fix: "x", why: "y" }],
    adds: [{ after: "2016", fix: "  " }]
  });
  assert.equal(b.marks.length, 0);
  assert.equal(b.dropped, 5);
});

test("a deletion (empty fix) is a valid language mark", () => {
  const b = M.buildMarks("It is very very clear.", { lang: [{ wrong: "very very", fix: "very" }, { wrong: " clear", fix: "" }] });
  assert.equal(b.counts.lang, 2);
});

const SHORT = "India have adopted FIT. It is very important.";

function sample() {
  const s = SHORT.indexOf("It is");
  return M.buildMarks(SHORT, {
    lang: [{ wrong: "have", fix: "has", why: "The verb must agree with its subject.", type: "agreement", severity: "major" }],
    frames: [{ start: s, end: SHORT.length, fix: "Price stability anchors expectations.", why: "Vague: say why it matters." }],
    adds: [{ at: SHORT.length, fix: "Cite the Urjit Patel Committee.", why: "Adds a source." }],
    cuts: [{ quote: "very important", deduction: 0.25, label: "Platitude / fluff", ref: "q1-loss-1" }]
  });
}

test("markedHTML writes the answer with nested marks, links and deduction tags", () => {
  assert.equal(M.markedHTML(sample(), { idPrefix: "q1-" }),
    "<div class=\"mk-answer\">India <span class=\"mk mk-lang\" id=\"q1-mk-L1\"><del class=\"mk-old\">have</del><ins class=\"mk-new\">has</ins><a class=\"mk-ref\" href=\"#q1-L1\">L1</a></span> adopted FIT. " +
    "<span class=\"mk mk-frame\" id=\"q1-mk-B1\"><span class=\"mk-old\">It is very important<a class=\"mk-cut\" href=\"#q1-loss-1\" title=\"Platitude / fluff (−0.25)\">−0.25</a>.</span><ins class=\"mk-new\">Price stability anchors expectations.</ins><a class=\"mk-ref\" href=\"#q1-B1\">B1</a></span>" +
    "<ins class=\"mk mk-add\" id=\"q1-mk-A1\"><span class=\"mk-tag\">Add</span> Cite the Urjit Patel Committee.<a class=\"mk-ref\" href=\"#q1-A1\">A1</a></ins></div>");
});

test("the marked answer keeps every character of the original answer, in order", () => {
  const text = "A <b> & \"C\". The target is 6% CPI inflation.\n\nIt are good.";
  const sentence = text.indexOf("The target");
  const b = M.buildMarks(text, {
    facts: [{ quote: "6% CPI", fix: "4% CPI", why: "Wrong." }],
    frames: [{ start: sentence, end: text.indexOf("\n"), fix: "Better.", why: "x" }],
    lang: [{ wrong: "target", fix: "aim" }, { wrong: "It are", fix: "It is" }],
    adds: [{ after: "It are good", fix: "More." }],
    cuts: [{ quote: "6% CPI", deduction: 1.25, label: "Factual error", ref: "q1-loss-4" }]
  });
  const html = M.markedHTML(b, { idPrefix: "q1-" });
  const back = html.replace(/<ins\b[^>]*>[\s\S]*?<\/ins>/g, "").replace(/<a class="mk-(?:ref|cut)"[^>]*>[^<]*<\/a>/g, "").replace(/<[^>]+>/g, "");
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  assert.equal(back, esc(text));
});

test("marksListHTML explains every mark by group, links back to the answer and flags marks it could not place", () => {
  const b = M.buildMarks(SHORT, {
    lang: [{ wrong: "have", fix: "has", why: "The verb must agree with its subject.", type: "agreement", severity: "major" }, { wrong: "not there", fix: "x", why: "y" }],
    facts: [{ quote: "FIT", fix: "flexible inflation targeting (FIT)", why: "Spell out the term once." }]
  });
  const html = M.marksListHTML(b, { idPrefix: "q1-" });
  assert.ok(html.startsWith("<div class=\"mk-lists\">"));
  assert.ok(html.includes("<section class=\"mk-group mk-g-lang\"><h4 class=\"mk-gh\">Language mistakes <span class=\"mk-count\">2</span></h4>"));
  assert.ok(html.includes("<li id=\"q1-L1\"><a class=\"mk-num\" href=\"#q1-mk-L1\">L1</a><div class=\"mk-body\"><p class=\"mk-pair\"><span class=\"mk mk-lang\"><del class=\"mk-old\">have</del><ins class=\"mk-new\">has</ins></span></p><p class=\"mk-why\"><span class=\"mk-meta\">Agreement, major.</span> The verb must agree with its subject.</p></div></li>"));
  assert.ok(html.includes("<li id=\"q1-L2\"><span class=\"mk-num\">L2</span>"));
  assert.ok(html.includes("Not shown in your answer: the exact words were not found."));
  assert.ok(html.indexOf("mk-g-lang") < html.indexOf("mk-g-fact"));
  assert.equal(M.marksListHTML(M.buildMarks("x", {}), {}), "");
  assert.ok(M.marksListHTML(b, { heading: "h6" }).includes("<h6 class=\"mk-gh\">"));
});

test("an addition in the list says where it goes", () => {
  const b = sample();
  const html = M.marksListHTML(b, { idPrefix: "q1-" });
  assert.ok(html.includes("<p class=\"mk-where\">At the end of your answer</p>"));
  const mid = M.buildMarks(SHORT, { adds: [{ after: "adopted FIT", fix: "Since 2016.", why: "Date." }] });
  assert.ok(M.marksListHTML(mid, {}).includes("<p class=\"mk-where\">After “India have adopted FIT.”</p>"));
});

test("legendHTML shows only the kinds of mark that appear", () => {
  const html = M.legendHTML(sample());
  assert.ok(html.includes("Language mistake"));
  assert.ok(html.includes("Sentence to frame better"));
  assert.ok(!html.includes("Wrong fact"));
  assert.ok(html.includes("Something to add"));
  assert.ok(html.includes("Marks deducted"));
  assert.equal(M.legendHTML(M.buildMarks("x", {})), "");
});

test("markedPlain writes a text version with the same marks", () => {
  assert.equal(M.markedPlain(sample()), "India [-have-]{+has+}(L1) adopted FIT. [[B1: It is very important(-0.25). => Price stability anchors expectations.]] {{A1 Add: Cite the Urjit Patel Committee.}}");
  const painted = M.markedPlain(sample(), { paint: (role, s) => "<" + role + ">" + s });
  assert.ok(painted.includes("<lang-old>[-have-]<lang-new>{+has+}<ref>(L1)"));
  assert.ok(painted.includes("<frame-old>It is very important"));
  assert.ok(M.plainLegend(sample()).includes("[-wrong-]{+right+}"));
  assert.ok(!M.plainLegend(sample()).includes("[[F1:"));
});

function ledgerInput(over) {
  return Object.assign({
    max: 15, score: 8.5, rawSum: 9, penaltySum: 0.5, ceiling: 9.5, track: "A",
    params: [
      { id: "P1", name: "Directive compliance & scope", max: 3, awarded: 2, reasons: ["You answered the first part only."] },
      { id: "P2", name: "Conceptual clarity & mechanisms", max: 4, awarded: 2.5, reasons: [], why: "Transmission explained, but no causal chain." },
      { id: "P3", name: "Evidence: reports, committees, data", max: 4, awarded: 1.5, cap: "45% - only one specific source", reasons: ["No CPI data."] },
      { id: "P4", name: "Structure & presentation", max: 2.5, awarded: 2, reasons: ["No way-forward heading."] },
      { id: "P5", name: "Register & word discipline", max: 1.5, awarded: 1, reasons: ["Two informal phrases."] }
    ],
    penalties: [
      { code: "RP-2", label: "Platitude / fluff", trigger: "Generic opening", quote: "Inflation is a big problem", deduction: 0.25 },
      { code: "RP-8", label: "Language / register", trigger: "Repeated agreement errors", quote: "", deduction: 0.25 }
    ],
    missed: [{ id: "K3", point: "Food supply shocks limit monetary policy", weight: 3, coverage: "missing" }]
  }, over || {});
}

test("lossLedger gives one row per lost mark with reasons and a fix, adding up to the marks lost", () => {
  const l = M.lossLedger(ledgerInput());
  assert.deepEqual(l.rows.map(r => [r.kind, r.title, r.lost]), [
    ["param", "P1 Directive compliance & scope", 1], ["param", "P2 Conceptual clarity & mechanisms", 1.5], ["param", "P3 Evidence: reports, committees, data", 2.5],
    ["param", "P4 Structure & presentation", 0.5], ["param", "P5 Register & word discipline", 0.5],
    ["penalty", "Platitude / fluff (RP-2)", 0.25], ["penalty", "Language / register (RP-8)", 0.25]
  ]);
  assert.equal(l.total, 6.5);
  assert.equal(l.rows[2].detail, "1.5 of 4");
  assert.deepEqual(l.rows[2].reasons, ["Capped at 45%: only one specific source.", "No CPI data."]);
  assert.deepEqual(l.rows[1].reasons, ["Transmission explained, but no causal chain."]);
  assert.equal(l.rows[5].quote, "Inflation is a big problem");
  assert.deepEqual(l.rows[5].reasons, ["Generic opening"]);
  assert.match(l.rows[2].fix, /reports, committees, schemes or data points/);
  assert.match(l.rows[5].fix, /specific mechanism/);
  assert.deepEqual(l.rows.map(r => r.ref), ["loss-1", "loss-2", "loss-3", "loss-4", "loss-5", "loss-6", "loss-7"]);
  assert.deepEqual(l.penaltyRefs, ["loss-6", "loss-7"]);
});

test("the hard ceiling and the zero floor get rows of their own", () => {
  const capped = M.lossLedger(ledgerInput({ score: 9.5, rawSum: 11, penaltySum: 0, penalties: [], params: [{ id: "P1", name: "A", max: 15, awarded: 11 }] }));
  assert.deepEqual(capped.rows.map(r => [r.kind, r.lost]), [["param", 4], ["ceiling", 1.5]]);
  assert.equal(capped.total, 5.5);
  const floored = M.lossLedger(ledgerInput({ score: 0, rawSum: 0.5, penaltySum: 1.25, penalties: [{ code: "RP-6", label: "Factual or logic error", trigger: "Wrong year", deduction: 1.25 }], params: [{ id: "P1", name: "A", max: 15, awarded: 0.5 }] }));
  assert.deepEqual(floored.rows.map(r => [r.kind, r.lost]), [["param", 14.5], ["penalty", 1.25], ["floor", -0.75]]);
  assert.equal(floored.total, 15);
});

test("a zero rule, an off-topic answer or no answer is explained by one row", () => {
  assert.deepEqual(M.lossLedger(ledgerInput({ score: 0, autoFail: true })).rows.map(r => [r.kind, r.title, r.lost]), [["zero", "Under 60 words", 15]]);
  assert.deepEqual(M.lossLedger(ledgerInput({ score: 0, offTopic: true })).rows.map(r => [r.kind, r.lost]), [["zero", 15]]);
  const blank = M.lossLedger({ max: 10, score: 0, notAttempted: true, params: [], penalties: [] });
  assert.deepEqual(blank.rows.map(r => [r.kind, r.title, r.lost]), [["zero", "Not attempted", 10]]);
  assert.equal(blank.total, 10);
});

test("a final mark that differs from the breakdown gets an adjustment row with its reason", () => {
  const l = M.lossLedger(ledgerInput({ score: 8, adjustment: { title: "Consistency check", why: "The final mark is the median of 3 independent gradings." } }));
  const last = l.rows[l.rows.length - 1];
  assert.deepEqual([last.kind, last.title, last.lost, last.reasons], ["adjust", "Consistency check", 0.5, ["The final mark is the median of 3 independent gradings."]]);
  assert.equal(l.total, 7);
  const raised = M.lossLedger(ledgerInput({ score: 9, adjustment: { title: "Consistency check", why: "Raised to match the checklist." } }));
  assert.equal(raised.rows[raised.rows.length - 1].lost, -0.5);
  assert.equal(M.lossLedger(ledgerInput()).rows.some(r => r.kind === "adjust"), false);
});

test("ledgerHTML shows the rows, the total and the missed key points", () => {
  const html = M.ledgerHTML(M.lossLedger(ledgerInput()), { idPrefix: "q1-", tableClass: "ai-table" });
  assert.ok(html.includes("<p class=\"mk-ledger-sum\">You lost <strong>6.5</strong> of 15 marks: 15 − 6.5 = <strong>8.5 / 15</strong>.</p>"));
  assert.ok(html.includes("<table class=\"mk-ltable ai-table\">"));
  assert.ok(html.includes("<tr id=\"q1-loss-3\" class=\"mk-r-param\"><td><strong>P3 Evidence: reports, committees, data</strong><span class=\"mk-sub\">1.5 of 4</span></td><td class=\"mk-n\">−2.5</td>"));
  assert.ok(html.includes("<li>Capped at 45%: only one specific source.</li>"));
  assert.ok(html.includes("<p class=\"mk-quote\">Your words: “Inflation is a big problem”</p>"));
  assert.ok(html.includes("<tr class=\"mk-total\"><td>Total lost</td><td class=\"mk-n\">−6.5</td>"));
  assert.ok(html.includes("K3"));
  assert.ok(html.includes("Food supply shocks limit monetary policy"));
  const floor = M.ledgerHTML(M.lossLedger(ledgerInput({ score: 0, rawSum: 0.5, penaltySum: 1.25, penalties: [{ code: "RP-6", label: "x", trigger: "y", deduction: 1.25 }], params: [{ id: "P1", name: "A", max: 15, awarded: 0.5 }] })), {});
  assert.ok(floor.includes("<td class=\"mk-n\">+0.75</td>"));
  assert.ok(M.ledgerHTML(M.lossLedger({ max: 10, score: 0, notAttempted: true, params: [], penalties: [] }), {}).includes("You wrote nothing"));
});

test("the how-to-fix tables cover every track parameter and every penalty code", () => {
  assert.equal(M.HOW_PARAM.A.length, 5);
  assert.equal(M.HOW_PARAM.D.length, 4);
  for (let i = 1; i <= 8; i++) assert.ok(M.HOW_PENALTY["RP-" + i]);
});
