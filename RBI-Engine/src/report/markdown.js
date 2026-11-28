"use strict";

const V = require("./view");
const AM = require("../answer-marks");
const { fmt } = require("../util");

const NA = "_Not available for this answer._";

function cell(v) {
  return String(v == null ? "" : v).replace(/\|/g, "\\|").replace(/\s*\r?\n\s*/g, " ").trim();
}

function oneLine(v) {
  return String(v == null ? "" : v).replace(/\s*\r?\n\s*/g, " ").trim();
}

function table(headers, rows) {
  if (!rows.length) return "";
  return [
    "| " + headers.map(cell).join(" | ") + " |",
    "|" + headers.map(() => "---").join("|") + "|",
    ...rows.map(r => "| " + r.map(cell).join(" | ") + " |")
  ].join("\n");
}

function bullets(list) {
  return (list || []).filter(Boolean).map(x => "- " + oneLine(x)).join("\n");
}

function numbered(list) {
  return (list || []).filter(Boolean).map((x, i) => (i + 1) + ". " + oneLine(x)).join("\n");
}

function block(text) {
  const t = String(text || "").replace(/```/g, "'''");
  return "```text\n" + t + "\n```";
}

function part(title, body) {
  const b = (Array.isArray(body) ? body.filter(Boolean).join("\n\n") : body) || "";
  return "#### " + title + "\n\n" + (b.trim() ? b : "_None._");
}

function verdictSection(r) {
  const v = V.verdict(r);
  const out = [table(["Score", "Percent", "Grade (strict)", "Real-exam projection", "Words", "Time"], [[v.score, v.percent, v.grade, v.projection, v.words, v.time]])];
  if (v.consistency) out.push("**Consistency:** " + v.consistency);
  if (v.merit) out.push("**Merit-list check:** " + oneLine(v.merit));
  return "### Verdict\n\n" + out.join("\n\n");
}

function summarySection(r) {
  const c = r.coaching || {};
  const out = [c.summary || NA];
  if (c.priorities && c.priorities.length) {
    out.push("**Top priorities**\n\n" + c.priorities.map((p, i) => (i + 1) + ". **" + oneLine(p.title) + "** - " + V.endSentence(oneLine(p.why)) + (p.how ? " How: " + V.endSentence(oneLine(p.how)) : "")).join("\n"));
  }
  return "### Summary and priorities\n\n" + out.join("\n\n");
}

const KIND_TABLES = [
  ["lang", "Language mistakes", ["#", "You wrote", "Correction", "Why"]],
  ["frame", "Sentences to frame better", ["#", "Your sentence", "Better", "Why"]],
  ["fact", "Wrong facts", ["#", "You wrote", "Correct fact", "Why"]],
  ["add", "Add these to lift the answer", ["#", "Where", "Add", "Why"]]
];

function markWhy(m) {
  const meta = m.kind === "lang" && m.type ? m.type.charAt(0).toUpperCase() + m.type.slice(1) + (m.severity ? ", " + m.severity : "") + "." : "";
  return [meta, m.why || "", m.inline ? "" : "(Not shown in your answer: the exact place was not found.)"].filter(Boolean).join(" ");
}

function markRow(m) {
  if (m.kind === "add") return [m.id, m.atEnd ? "At the end" : m.where ? "After: " + m.where : "Wherever it fits best", m.fix, markWhy(m)];
  return [m.id, m.wrong, m.fix || (m.kind === "lang" ? "(delete)" : ""), markWhy(m)];
}

function markedSection(r, paint) {
  const b = V.built(r);
  const title = "### Your answer, marked";
  if (r.marks && r.marks.notAttempted) return title + "\n\n" + NA;
  if (!b.marks.length) return title + "\n\n" + (r.language || r.coach ? "Nothing to mark: no language, framing or fact changes were found." : "The AI parts did not run, so nothing is marked yet.");
  const out = [];
  const legend = AM.plainLegend(b);
  if (legend) out.push("How to read the marks:\n\n" + block(legend));
  out.push(block(V.markedAnswer(r, paint)));
  for (const [kind, name, heads] of KIND_TABLES) {
    const mine = b.marks.filter(m => m.kind === kind);
    if (mine.length) out.push(part(name + " (" + mine.length + ")", table(heads, mine.map(markRow))));
  }
  return title + "\n\n" + out.join("\n\n");
}

function ledgerSection(r) {
  const title = "### " + V.lossTitle(r);
  const l = r.ledger;
  if (!l) return title + "\n\nThe marks could not be computed in this run. Run the same command again to retry the gradings.";
  const max = fmt(l.max);
  const out = [];
  if (l.zero === "notAttempted") out.push("You wrote nothing, so all " + max + " marks were lost.");
  else if (l.zero) out.push("The rubric gives 0 for this answer, so all " + max + " marks were lost.");
  else if (!(l.total > 0)) out.push("You lost no marks.");
  if (l.rows.length) {
    out.push(table(["What cost you marks", "Lost", "Why", "How to earn them next time"], l.rows.map(x => [
      x.title + (x.detail ? " (" + x.detail + ")" : ""), V.signedLoss(x.lost), x.reasons.join(" ") + (x.quote ? " Your words: \"" + x.quote + "\"" : ""), x.fix
    ])));
    out.push("**Total lost: " + fmt(l.total) + "** (" + max + " - " + fmt(l.total) + " = " + fmt(l.score) + " / " + max + ")");
  }
  if (l.missed.length) out.push(part("Key points from the model answer you missed or only partly covered", bullets(l.missed.map(k => k.id + " (weight " + k.weight + ", " + (k.coverage === "partial" ? "only partly covered" : "missing") + "): " + k.point))));
  return title + "\n\n" + out.join("\n\n");
}

function readingSection(r) {
  const rd = r.reading;
  const out = [];
  out.push(part("Command words", rd.commandWords.length ? bullets(rd.commandWords.map(c => "**" + c.word + "**: " + c.demand)) : "No command word was found; answer exactly what the question asks."));
  out.push(part("Parts of the question", rd.subparts.length ? bullets(rd.subparts.map(s => "**" + s.part + "**: " + s.expects)) : NA));
  if (rd.dimensions.length) out.push(part("Angles an examiner expects", rd.dimensions.join(", ") + "."));
  out.push(part("Ideal outline and word budget" + (rd.outlineIsDefault ? " (standard outline for this answer type)" : ""), table(["Section", "Budget", "What goes here", "Your answer", "Comment"], V.outlineRows(r))));
  return "### Reading the question\n\n" + out.join("\n\n");
}

function marksSection(r) {
  const m = r.marks;
  if (!m) return "### Marks breakdown\n\nThe marks could not be computed in this run. Run the same command again to retry the gradings.";
  if (m.notAttempted) return "### Marks breakdown\n\n" + V.arithmetic(r);
  const rows = V.paramRows(r);
  rows.push(["**Raw sum**", fmt(r.question.marks), "**" + fmt(m.rawSum) + "**", "", ""]);
  const pens = V.penaltyRows(r);
  if (pens.length) pens.push(["", "**Total**", "", "**-" + fmt(m.penaltySum) + "**"]);
  const out = [
    table(["Parameter", "Max", "Awarded", "Gate cap", "Why"], rows),
    pens.length ? table(["Code", "Penalty", "Found in your answer", "Deduction"], pens) : "No red-pen penalties.",
    "**Arithmetic:** " + V.arithmetic(r),
    part("Gates and rules in force", bullets(V.rulesInForce(r))),
    part("Examiner checks", table(["#", "Check", "Result", "Evidence"], V.checkRows(r)))
  ];
  return "### Marks breakdown\n\n" + out.join("\n\n");
}

function contentSection(r) {
  const m = r.marks;
  if (!m || m.notAttempted) return "### Content\n\n" + NA;
  const c = m.content || {};
  const out = [
    part("Parts of the question", table(["Part", "Coverage", "Comment"], m.subparts.map(s => [s.part, V.COVERAGE_TEXT[s.coverage] || s.coverage, s.comment]))),
    part("Marking checklist" + (m.coverage !== null && m.coverage !== undefined ? " (you covered " + fmt(m.coverage) + "% of the weighted points)" : ""), table(["#", "Key point", "Weight", "Verdict", "Your words"], m.checklist.map(k => [k.id, k.point, String(k.weight), V.CHECKLIST_TEXT[k.coverage] || k.coverage, k.quote]))),
    part("Concept gaps", bullets(c.conceptGaps)),
    part("Factual errors", (c.factualErrors || []).length ? c.factualErrors.length + " wrong fact" + (c.factualErrors.length === 1 ? " is" : "s are") + " marked in Your answer, marked (F1" + (c.factualErrors.length > 1 ? "-F" + c.factualErrors.length : "") + "), each with the correct fact." : "No provably wrong facts were found."),
    part("Content and logic errors (red-pen log)", table(["You wrote", "Code", "Problem", "Correction"], (c.errorLog || []).map(e => [e.quote, e.code, e.problem, e.correction]))),
    part("Sources you used", bullets(c.anchorsUsed)),
    part("Named without saying what they do", bullets(c.nameDrops)),
    part("Sources to add next time", bullets(c.missingAnchors)),
    part("Figures to verify", bullets(c.verifyFlags))
  ];
  return "### Content\n\n" + out.join("\n\n");
}

function languageSection(r) {
  const l = r.language;
  const mech = r.mechanical || [];
  const out = [];
  if (l) {
    out.push([V.languageOverview(r), V.styleLine(r), l.style.assessment, l.summary].filter(Boolean).join(" "));
    if (l.style.issues.length) out.push(part("Style problems", bullets(l.style.issues)));
    out.push(l.issues.length ? "All " + l.issues.length + " language mistake" + (l.issues.length === 1 ? " is" : "s are") + " marked in Your answer, marked (L1" + (l.issues.length > 1 ? "-L" + l.issues.length : "") + "), each with its rule." : "No language corrections were needed.");
  } else {
    out.push(r.marks && r.marks.notAttempted ? NA : "The AI language audit is not available in this run. The engine's own checks are below.");
  }
  out.push(part("Engine checks (found by the engine itself, the same every time)", table(["Where", "Check", "Text", "Note", "Fix"], mech.map(f => [f.unit || "whole answer", f.kind, f.quote, f.message, f.fix]))));
  if (l) {
    out.push(part("Register and tone", table(["You wrote", "Problem", "Better"], l.register.map(x => [x.quote, x.problem, x.better]))));
    out.push(part("Vocabulary upgrades", table(["You used", "Better", "Why"], l.vocabulary.map(x => [x.used, x.better, x.why]))));
    out.push(part("Sentence craft", table(["Sentence", "Problem", "Suggestion"], l.craft.map(x => [x.unit + ": " + V.unitText(r, x.unit), x.problem, x.suggestion]))));
  }
  return "### Language\n\n" + out.join("\n\n");
}

function structureSection(r) {
  const c = r.coach;
  const out = [V.allocationLine(r) + " " + V.structureFacts(r).join(" ")];
  if (!c) {
    out.push(r.marks && r.marks.notAttempted ? NA : "The AI structure coach is not available in this run.");
    return "### Structure and framing\n\n" + out.join("\n\n");
  }
  if (c.framing) out.push("**How well the answer is framed:** " + oneLine(c.framing));
  out.push(part("Introduction", [c.introduction.assessment, c.introduction.rewrite ? "Better introduction:\n\n" + block(c.introduction.rewrite) : ""]));
  out.push(part("Paragraph by paragraph", table(["Paragraph", "Problem", "Fix"], c.paragraphs.map(p => [p.id, p.assessment, p.fix]))));
  out.push(part("Conclusion", [c.conclusion.assessment, c.conclusion.rewrite ? "Better conclusion:\n\n" + block(c.conclusion.rewrite) : ""]));
  out.push(part("Headings and paragraphing", [c.headings.assessment, c.headings.suggested.length ? "Headings to use: " + c.headings.suggested.join(" / ") : ""]));
  out.push(part("Flow", bullets(c.flow)));
  if (c.reframe.length || c.additions.length) out.push("Sentences to frame better and additions are marked in Your answer, marked (" + [c.reframe.length ? c.reframe.length + " to frame better" : "", c.additions.length ? c.additions.length + " to add" : ""].filter(Boolean).join(", ") + ").");
  return "### Structure and framing\n\n" + out.join("\n\n");
}

function modelSection(r) {
  const out = [];
  const ma = r.coach && r.coach.modelAnswer;
  let title = "### Model answer";
  if (ma && ma.text) {
    title += " (" + ma.words + " words" + (r.question.wordLimit ? ", " + Math.round(ma.words / r.question.wordLimit * 100) + "% of the limit" : "") + ")";
    out.push(block(ma.text));
  } else {
    out.push(NA);
  }
  if (r.question.reference) out.push(part("Your reference answer (from the file)", block(r.question.reference)));
  return title + "\n\n" + out.join("\n\n");
}

function planSection(r) {
  const c = r.coaching || {};
  return "### Improvement plan\n\n" + [
    part("What you did well", bullets(c.strengths)),
    part("Drills for tomorrow", numbered(c.drills)),
    part("Step-by-step plan", numbered(c.plan))
  ].join("\n\n");
}

function questionHeader(r) {
  const q = r.question;
  const head = "## Q" + q.index + ". " + q.paper + " · " + fmt(q.marks) + " marks · " + q.trackLabel + (q.topic ? " · " + q.topic : "");
  const parts = [head];
  if (q.passage) parts.push("**Passage / data:**\n\n" + q.passage.split("\n").map(l => "> " + l).join("\n"));
  parts.push("**Question:** " + oneLine(q.text));
  return parts.join("\n\n");
}

function renderReport(r, session, opts) {
  return [
    questionHeader(r),
    verdictSection(r),
    summarySection(r),
    markedSection(r, opts && opts.paint),
    ledgerSection(r),
    readingSection(r),
    marksSection(r),
    contentSection(r),
    languageSection(r),
    structureSection(r),
    modelSection(r),
    planSection(r),
    "### Technical details\n\n" + bullets(V.technical(r, session))
  ].join("\n\n");
}

function testSummarySection(s) {
  const rows = s.rows.map(x => ["Q" + x.index, x.paper, x.topic, fmt(x.marks), x.score === null ? "-" : fmt(x.score), x.percent === null ? "-" : fmt(x.percent) + "%", x.grade, String(x.words) + (x.wordPercent !== null ? " (" + x.wordPercent + "%)" : ""), x.minutes ? fmt(x.minutes) + " min" : "-"]);
  return "## Test summary\n\n" + [
    "**Total:** " + fmt(s.total) + " / " + fmt(s.max) + " (" + fmt(s.percent) + "%)",
    table(["Q", "Paper", "Topic", "Marks", "Score", "Percent", "Grade", "Words", "Time"], rows),
    part("Cutoff readiness", bullets(s.readiness.map(g => g.group + ": " + fmt(g.total) + " / " + fmt(g.max) + " (" + fmt(g.percent) + "%) - " + g.status + " (" + g.note + ")"))),
    part("Penalties that came back", bullets(s.recurringPenalties.map(p => p.label + " (" + p.code + "): " + p.count + " time" + (p.count === 1 ? "" : "s") + ", -" + fmt(p.total) + " marks"))),
    part("Language mistakes that came back", bullets(s.recurringLanguage.map(x => x.type + ": " + x.count))),
    part("Fatigue check", bullets(s.fatigue))
  ].join("\n\n");
}

function renderMarkdown(session, opts) {
  const when = new Date(session.createdAt);
  const head = "# RBI-Engine report: " + session.name + "\n\n" + [
    isNaN(when) ? "" : when.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    session.engine,
    session.file
  ].filter(Boolean).join(" · ");
  const parts = [head];
  if (session.testSummary) parts.push(testSummarySection(session.testSummary));
  for (const r of session.reports) parts.push(renderReport(r, session, opts));
  return parts.join("\n\n") + "\n";
}

module.exports = { renderMarkdown, cell, table };
