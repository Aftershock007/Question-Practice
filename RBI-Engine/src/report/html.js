"use strict";

const V = require("./view");
const { escapeHTML: esc, fmt } = require("../util");

const CSS = `
:root {
  --bg: #f5f5f7; --paper: #ffffff; --ink: #1d1d1f; --ink-2: #3a3a3c; --muted: #6e6e73; --line: #e5e5ea; --line-strong: #d2d2d7;
  --fill: #f8f8fa; --brand: #0d2b5e; --accent: #1d5fc4; --accent-soft: #eef4fd; --gold: #9a7128;
  --ok: #1e8e3e; --ok-soft: #ebf6ee; --danger: #c9302c; --danger-soft: #fdefee; --warn: #b0600c; --warn-soft: #fdf4e7;
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --script: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16181d; --paper: #1f2128; --ink: #f2f2f4; --ink-2: #d6d6da; --muted: #a1a1a6; --line: #34363d; --line-strong: #44474f;
    --fill: #262830; --brand: #a9c1ee; --accent: #7aa7f0; --accent-soft: #1f2a3d; --gold: #d8b36a;
    --ok: #63c482; --ok-soft: #1d3325; --danger: #f2847d; --danger-soft: #3a2224; --warn: #eaa95a; --warn-soft: #3a2d1d;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 var(--font); }
.sheet { max-width: 860px; margin: 32px auto; background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 40px 48px 48px; }
header.doc h1 { font-size: 28px; line-height: 1.2; margin: 0 0 6px; color: var(--brand); letter-spacing: -0.01em; }
header.doc p { margin: 0; color: var(--muted); font-size: 14px; }
.toc { margin: 28px 0 8px; padding: 16px 20px; background: var(--fill); border-radius: 10px; }
.toc h2 { font-size: 15px; margin: 0 0 8px; color: var(--ink-2); }
.toc ol { margin: 0; padding-left: 22px; }
.toc li { margin: 3px 0; }
.toc .tmark { color: var(--muted); font-variant-numeric: tabular-nums; }
a { color: var(--accent); }
a:focus-visible, summary:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
section.q { margin-top: 44px; padding-top: 32px; border-top: 1px solid var(--line-strong); }
section.q:first-of-type { border-top: 0; padding-top: 8px; }
.qhead { margin: 0 0 4px; font-size: 14px; color: var(--muted); font-weight: 500; }
.qhead strong { color: var(--brand); font-size: 22px; font-weight: 700; margin-right: 6px; }
.question { font-family: var(--script); font-size: 19px; line-height: 1.6; margin: 10px 0 18px; color: var(--ink); max-width: 70ch; }
.passage { font-family: var(--script); font-size: 16px; line-height: 1.65; white-space: pre-wrap; background: var(--fill); border-radius: 10px; padding: 14px 18px; margin: 10px 0; color: var(--ink-2); }
.verdict { display: grid; grid-template-columns: auto 1fr; gap: 28px; align-items: center; padding: 22px 24px; border: 1px solid var(--line); border-left: 4px solid var(--gold); border-radius: 12px; margin: 18px 0 10px; }
.mark { line-height: 1; white-space: nowrap; font-variant-numeric: tabular-nums; }
.mark .got { font-size: 60px; font-weight: 700; color: var(--brand); letter-spacing: -0.02em; }
.mark .of { font-size: 26px; color: var(--muted); margin-left: 6px; }
.mark .pct { display: block; margin-top: 8px; font-size: 15px; color: var(--muted); }
dl.facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; margin: 0; }
dl.facts dt { font-size: 13px; color: var(--muted); }
dl.facts dd { margin: 2px 0 0; font-size: 15px; color: var(--ink); }
.note { color: var(--ink-2); font-size: 14.5px; margin: 8px 0; }
details.sec { margin-top: 26px; border-top: 1px solid var(--line); padding-top: 14px; }
details.sec > summary { cursor: pointer; list-style: none; display: flex; align-items: baseline; gap: 12px; }
details.sec > summary::-webkit-details-marker { display: none; }
details.sec > summary h3 { margin: 0; font-size: 19px; color: var(--brand); }
details.sec > summary .meta { color: var(--muted); font-size: 14px; }
details.sec > summary::after { content: ""; margin-left: auto; width: 8px; height: 8px; border-right: 2px solid var(--muted); border-bottom: 2px solid var(--muted); transform: rotate(45deg); align-self: center; }
details.sec:not([open]) > summary::after { transform: rotate(-45deg); }
.body h4 { font-size: 15px; margin: 22px 0 8px; color: var(--ink-2); }
.body p { margin: 8px 0; max-width: 72ch; }
.body ul, .body ol { margin: 8px 0; padding-left: 22px; max-width: 72ch; }
.body li { margin: 4px 0; }
.empty { color: var(--muted); font-style: italic; }
.tw { overflow-x: auto; margin: 8px 0; }
table { border-collapse: collapse; width: 100%; font-size: 14.5px; }
th { text-align: left; font-weight: 600; color: var(--muted); font-size: 13px; padding: 8px 10px; border-bottom: 1px solid var(--line-strong); white-space: nowrap; }
td { padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
tr.total td { font-weight: 700; border-bottom: 0; }
td.quote { font-family: var(--script); font-size: 15px; }
.chip { display: inline-block; padding: 1px 9px; border-radius: 999px; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
.chip.full, .chip.good { background: var(--ok-soft); color: var(--ok); }
.chip.partial, .chip.ok { background: var(--warn-soft); color: var(--warn); }
.chip.missing, .chip.bad { background: var(--danger-soft); color: var(--danger); }
.chip.textbook { background: var(--accent-soft); color: var(--accent); }
.chip.unknown { background: var(--fill); color: var(--muted); }
.script { font-family: var(--script); font-size: 16.5px; line-height: 1.75; white-space: pre-wrap; background: var(--fill); border-left: 3px solid var(--line-strong); border-radius: 0 10px 10px 0; padding: 16px 20px; margin: 10px 0; overflow-wrap: anywhere; }
.script.marked { border-left-color: var(--danger); }
.script del { color: var(--danger); background: var(--danger-soft); text-decoration: line-through; text-decoration-thickness: 2px; }
.script ins { color: var(--ok); background: var(--ok-soft); text-decoration: none; border-bottom: 2px solid var(--ok); }
.script del + ins { margin-left: 3px; }
.script sup { font-family: var(--font); font-size: 11px; margin-left: 1px; }
.script sup a { text-decoration: none; font-weight: 700; color: var(--brand); }
.legend { font-size: 13.5px; color: var(--muted); }
.legend del { color: var(--danger); } .legend ins { color: var(--ok); text-decoration: none; border-bottom: 2px solid var(--ok); }
.rewrite { border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; margin: 10px 0; }
.rewrite p { margin: 4px 0; }
.rewrite .before { font-family: var(--script); color: var(--ink-2); text-decoration: line-through; text-decoration-color: var(--danger); }
.rewrite .after { font-family: var(--script); color: var(--ink); }
.rewrite .why { font-size: 14px; color: var(--muted); }
.prio li { margin: 10px 0; }
.prio strong { color: var(--ink); }
.tech { font-size: 13.5px; color: var(--muted); }
tr:target td { background: var(--accent-soft); }
@media (max-width: 720px) {
  .sheet { margin: 0; border-radius: 0; border-left: 0; border-right: 0; padding: 24px 18px 32px; }
  .verdict { grid-template-columns: 1fr; gap: 16px; }
  dl.facts { grid-template-columns: 1fr; }
  .mark .got { font-size: 48px; }
}
@media print {
  body { background: #fff; color: #000; }
  .sheet { border: 0; margin: 0; padding: 0; max-width: none; }
  details.sec > summary::after { display: none; }
  tr, .rewrite, .verdict { break-inside: avoid; }
  a { color: inherit; text-decoration: none; }
}
`;

const SUB_CHIP = { "DEEP & BALANCED": "good", "TEXTBOOK ONLY": "textbook", "SUPERFICIAL": "ok", "MISSED": "bad", "": "unknown" };
const OUTLINE_CHIP = { covered: "good", weak: "ok", missing: "bad", unknown: "unknown" };

function chip(cls, text) {
  return "<span class=\"chip " + cls + "\">" + esc(text) + "</span>";
}

function cellHTML(v) {
  if (v && typeof v === "object" && "html" in v) return v.html;
  return esc(v == null ? "" : v).replace(/\n/g, "<br>");
}

function table(headers, rows, opts = {}) {
  if (!rows.length) return "<p class=\"empty\">None.</p>";
  const num = new Set(opts.num || []);
  const quote = new Set(opts.quote || []);
  const cls = i => (num.has(i) ? " class=\"num\"" : quote.has(i) ? " class=\"quote\"" : "");
  const head = "<tr>" + headers.map((x, i) => "<th" + (num.has(i) ? " class=\"num\"" : "") + " scope=\"col\">" + esc(x) + "</th>").join("") + "</tr>";
  const body = rows.map(r => {
    const attrs = r.attrs || "";
    const cells = Array.isArray(r) ? r : r.cells;
    return "<tr" + attrs + ">" + cells.map((c, i) => "<td" + cls(i) + ">" + cellHTML(c) + "</td>").join("") + "</tr>";
  }).join("");
  return "<div class=\"tw\"><table><thead>" + head + "</thead><tbody>" + body + "</tbody></table></div>";
}

function list(items, ordered, cls) {
  const xs = (items || []).filter(Boolean);
  if (!xs.length) return "<p class=\"empty\">None.</p>";
  const tag = ordered ? "ol" : "ul";
  return "<" + tag + (cls ? " class=\"" + cls + "\"" : "") + ">" + xs.map(x => "<li>" + (x && typeof x === "object" && "html" in x ? x.html : esc(x)) + "</li>").join("") + "</" + tag + ">";
}

function para(text, cls) {
  return text ? "<p" + (cls ? " class=\"" + cls + "\"" : "") + ">" + esc(text) + "</p>" : "";
}

function script(text, cls) {
  return "<div class=\"script" + (cls ? " " + cls : "") + "\">" + esc(text) + "</div>";
}

function sub(title, html) {
  return "<h4>" + esc(title) + "</h4>" + html;
}

function section(id, title, meta, body) {
  return "<details class=\"sec\" id=\"" + id + "\" open><summary><h3>" + esc(title) + "</h3>" + (meta ? "<span class=\"meta\">" + esc(meta) + "</span>" : "") + "</summary><div class=\"body\">" + body + "</div></details>";
}

const NA = "<p class=\"empty\">Not available for this answer.</p>";

function verdictBlock(r) {
  const v = V.verdict(r);
  const m = r.marks;
  const mark = m
    ? "<div class=\"mark\"><span class=\"got\">" + esc(fmt(m.score)) + "</span><span class=\"of\">/ " + esc(fmt(r.question.marks)) + "</span><span class=\"pct\">" + esc(v.percent) + (m.notAttempted ? ", not attempted" : "") + "</span></div>"
    : "<div class=\"mark\"><span class=\"of\">Marks not computed</span></div>";
  const facts = [
    ["Grade (strict)", v.grade || "-"],
    ["Real-exam projection", v.projection || "-"],
    ["Words", v.words],
    ["Time", v.time]
  ].map(([k, val]) => "<div><dt>" + esc(k) + "</dt><dd>" + esc(val) + "</dd></div>").join("");
  return "<div class=\"verdict\">" + mark + "<dl class=\"facts\">" + facts + "</dl></div>" +
    (v.consistency ? para("Consistency: " + v.consistency, "note") : "") +
    (v.merit ? para("Merit-list check: " + v.merit, "note") : "");
}

function summaryBody(r) {
  const c = r.coaching || {};
  const prio = (c.priorities || []).map(p => ({ html: "<strong>" + esc(p.title) + "</strong>. " + esc(V.endSentence(p.why)) + (p.how ? " " + esc(V.endSentence(p.how)) : "") }));
  return (c.summary ? para(c.summary) : NA) + (prio.length ? sub("Top priorities", list(prio, true, "prio")) : "");
}

function readingBody(r) {
  const rd = r.reading;
  const outline = V.outlineRows(r).map((row, i) => {
    const match = r.coach ? r.coach.outlineMatch.find(x => x.id === rd.outline[i].id) : null;
    return [row[0], row[1], row[2], { html: match ? chip(OUTLINE_CHIP[match.status] || "unknown", row[3]) : "" }, row[4]];
  });
  return sub("Command words", rd.commandWords.length ? list(rd.commandWords.map(c => ({ html: "<strong>" + esc(c.word) + "</strong>: " + esc(c.demand) }))) : para("No command word was found; answer exactly what the question asks.")) +
    sub("Parts of the question", rd.subparts.length ? list(rd.subparts.map(s => ({ html: "<strong>" + esc(s.part) + "</strong>: " + esc(s.expects) }))) : NA) +
    (rd.dimensions.length ? sub("Angles an examiner expects", para(rd.dimensions.join(", ") + ".")) : "") +
    sub("Ideal outline and word budget" + (rd.outlineIsDefault ? " (standard outline for this answer type)" : ""), table(["Section", "Budget", "What goes here", "Your answer", "Comment"], outline));
}

function marksBody(r) {
  const m = r.marks;
  if (!m) return para("The marks could not be computed in this run. Run the same command again to retry the gradings.");
  if (m.notAttempted) return para(V.arithmetic(r));
  const rows = V.paramRows(r);
  rows.push({ cells: ["Raw sum", fmt(r.question.marks), fmt(m.rawSum), "", ""], attrs: " class=\"total\"" });
  const pens = V.penaltyRows(r);
  if (pens.length) pens.push({ cells: ["", "Total", "", "-" + fmt(m.penaltySum)], attrs: " class=\"total\"" });
  const checks = V.checkRows(r).map(c => [c[0], c[1], { html: chip(/^YES/.test(c[2]) ? "good" : /^NO/.test(c[2]) ? "bad" : "unknown", c[2]) }, c[3]]);
  return table(["Parameter", "Max", "Awarded", "Gate cap", "Why"], rows, { num: [1, 2] }) +
    sub("Red-pen penalties", pens.length ? table(["Code", "Penalty", "Found in your answer", "Deduction"], pens, { num: [3] }) : para("No red-pen penalties.")) +
    para("Arithmetic: " + V.arithmetic(r), "note") +
    sub("Where your marks went", list(V.lostItems(r))) +
    sub("Gates and rules in force", list(V.rulesInForce(r))) +
    sub("Examiner checks", table(["#", "Check", "Result", "Evidence"], checks));
}

function contentBody(r) {
  const m = r.marks;
  if (!m || m.notAttempted) return NA;
  const c = m.content || {};
  return sub("Parts of the question", table(["Part", "Coverage", "Comment"], m.subparts.map(s => [s.part, { html: chip(SUB_CHIP[s.coverage] || "unknown", V.COVERAGE_TEXT[s.coverage] || s.coverage) }, s.comment]))) +
    sub("Marking checklist" + (m.coverage !== null && m.coverage !== undefined ? " (you covered " + fmt(m.coverage) + "% of the weighted points)" : ""),
      table(["#", "Key point", "Weight", "Verdict", "Your words"], m.checklist.map(k => [k.id, k.point, String(k.weight), { html: chip(k.coverage, V.CHECKLIST_TEXT[k.coverage] || k.coverage) }, k.quote]), { num: [2], quote: [4] })) +
    sub("Concept gaps", list(c.conceptGaps)) +
    sub("Factual errors", table(["You wrote", "Problem", "Correct fact"], (c.factualErrors || []).map(f => [f.quote, f.problem, f.fact]), { quote: [0] })) +
    sub("Content and logic errors (red-pen log)", table(["You wrote", "Code", "Problem", "Correction"], (c.errorLog || []).map(e => [e.quote, e.code, e.problem, e.correction]), { quote: [0] })) +
    sub("Sources you used", list(c.anchorsUsed)) +
    sub("Named without saying what they do", list(c.nameDrops)) +
    sub("Sources to add next time", list(c.missingAnchors)) +
    sub("Figures to verify", list(c.verifyFlags));
}

function markedHTML(r, qid) {
  const text = r.answer.text;
  const issues = (r.language && r.language.issues) || [];
  let out = "";
  let pos = 0;
  issues.forEach((i, n) => {
    if (i.start < pos) return;
    out += esc(text.slice(pos, i.start)) + "<del>" + esc(i.wrong) + "</del>" + (i.fix ? "<ins>" + esc(i.fix) + "</ins>" : "") + "<sup><a href=\"#" + qid + "-m" + (n + 1) + "\">" + (n + 1) + "</a></sup>";
    pos = i.end;
  });
  return "<div class=\"script marked\">" + out + esc(text.slice(pos)) + "</div>";
}

function languageBody(r, qid) {
  const l = r.language;
  const mech = r.mechanical || [];
  let html = "";
  if (l) {
    html += para([V.languageOverview(r), V.styleLine(r)].filter(Boolean).join(" "));
    if (l.style.assessment) html += para(l.style.assessment);
    if (l.summary) html += para(l.summary);
    if (l.style.issues.length) html += sub("Style problems", list(l.style.issues));
    html += sub("Your answer, marked", l.issues.length
      ? "<p class=\"legend\"><del>Struck text</del> is wrong; <ins>underlined text</ins> is the correction. The numbers link to the list below.</p>" + markedHTML(r, qid)
      : para("No language corrections were needed."));
    html += sub("Every mistake", table(["#", "Where", "You wrote", "Correct", "Type", "Rule"], l.issues.map((i, n) => ({
      cells: [String(n + 1), i.unit, i.wrong, i.fix || "(delete)", { html: esc(i.type) + (i.severity === "major" ? " " + chip("bad", "major") : "") }, i.rule],
      attrs: " id=\"" + qid + "-m" + (n + 1) + "\""
    })), { quote: [2, 3] }));
  } else {
    html += r.marks && r.marks.notAttempted ? NA : para("The AI language audit is not available in this run. The engine's own checks are below.");
  }
  html += sub("Engine checks (found by the engine itself, the same every time)", table(["Where", "Check", "Text", "Note", "Fix"], mech.map(f => [f.unit || "whole answer", f.kind, f.quote, f.message, f.fix]), { quote: [2] }));
  if (l) {
    html += sub("Register and tone", table(["You wrote", "Problem", "Better"], l.register.map(x => [x.quote, x.problem, x.better]), { quote: [0, 2] }));
    html += sub("Vocabulary upgrades", table(["You used", "Better", "Why"], l.vocabulary.map(x => [x.used, x.better, x.why])));
    html += sub("Sentence craft", table(["Sentence", "Problem", "Suggestion"], l.craft.map(x => [x.unit + ": " + V.unitText(r, x.unit), x.problem, x.suggestion]), { quote: [0] }));
  }
  return html;
}

function structureBody(r) {
  const c = r.coach;
  let html = para(V.allocationLine(r)) + list(V.structureFacts(r));
  if (!c) return html + (r.marks && r.marks.notAttempted ? NA : para("The AI structure coach is not available in this run."));
  if (c.framing) html += sub("How well the answer is framed", para(c.framing));
  html += sub("Introduction", para(c.introduction.assessment) + (c.introduction.rewrite ? script(c.introduction.rewrite) : ""));
  html += sub("Paragraph by paragraph", table(["Paragraph", "Problem", "Fix"], c.paragraphs.map(p => [p.id, p.assessment, p.fix])));
  html += sub("Conclusion", para(c.conclusion.assessment) + (c.conclusion.rewrite ? script(c.conclusion.rewrite) : ""));
  html += sub("Headings and paragraphing", para(c.headings.assessment) + (c.headings.suggested.length ? list(c.headings.suggested, true) : ""));
  html += sub("Flow", list(c.flow));
  html += sub("What would lift this answer", list(c.valueAdds));
  html += sub("Rewrites of your weakest sentences", c.rewrites.length
    ? c.rewrites.map(w => "<div class=\"rewrite\"><p class=\"before\">" + esc(w.before) + "</p><p class=\"after\">" + esc(w.after) + "</p><p class=\"why\">" + esc(w.why) + "</p></div>").join("")
    : "<p class=\"empty\">None.</p>");
  return html;
}

function modelBody(r) {
  const ma = r.coach && r.coach.modelAnswer;
  let html = ma && ma.text ? script(ma.text) : NA;
  if (r.question.reference) html += sub("Your reference answer (from the file)", script(r.question.reference));
  return html;
}

function planBody(r) {
  const c = r.coaching || {};
  return sub("What you did well", list(c.strengths)) + sub("Drills for tomorrow", list(c.drills, true)) + sub("Step-by-step plan", list(c.plan, true));
}

function renderQuestion(r, session) {
  const q = r.question;
  const qid = "q" + q.index;
  const facts = [q.paper, fmt(q.marks) + " marks", q.trackLabel].concat(q.topic ? ["topic: " + q.topic] : []).join(", ");
  const ma = r.coach && r.coach.modelAnswer;
  const l = r.language;
  return "<section class=\"q\" id=\"" + qid + "\" aria-labelledby=\"" + qid + "-h\">" +
    "<h2 class=\"qhead\" id=\"" + qid + "-h\"><strong>Q" + esc(q.index) + "</strong>" + esc(facts) + "</h2>" +
    (q.passage ? "<div class=\"passage\">" + esc(q.passage) + "</div>" : "") +
    "<p class=\"question\">" + esc(q.text) + "</p>" +
    section(qid + "-verdict", "Verdict", "", verdictBlock(r)) +
    section(qid + "-summary", "Summary and priorities", "", summaryBody(r)) +
    section(qid + "-reading", "Reading the question", "", readingBody(r)) +
    section(qid + "-marks", "Marks breakdown", r.marks && !r.marks.notAttempted ? fmt(r.marks.rawSum) + " raw, -" + fmt(r.marks.penaltySum) + " penalties" : "", marksBody(r)) +
    section(qid + "-content", "Content", r.marks && r.marks.coverage !== null && r.marks.coverage !== undefined ? fmt(r.marks.coverage) + "% of the checklist" : "", contentBody(r)) +
    section(qid + "-language", "Language", l ? l.issues.length + " mistake" + (l.issues.length === 1 ? "" : "s") + ", " + (r.mechanical || []).length + " engine check" + ((r.mechanical || []).length === 1 ? "" : "s") : "", languageBody(r, qid)) +
    section(qid + "-structure", "Structure and framing", "", structureBody(r)) +
    section(qid + "-model", "Model answer", ma && ma.text ? ma.words + " words" : "", modelBody(r)) +
    section(qid + "-plan", "Improvement plan", "", planBody(r)) +
    section(qid + "-tech", "Technical details", "", "<div class=\"tech\">" + list(V.technical(r, session)) + "</div>") +
    "</section>";
}

function testSummaryHTML(s) {
  const rows = s.rows.map(x => ["Q" + x.index, x.paper, x.topic, fmt(x.marks), x.score === null ? "-" : fmt(x.score), x.percent === null ? "-" : fmt(x.percent) + "%", x.grade, String(x.words) + (x.wordPercent !== null ? " (" + x.wordPercent + "%)" : ""), x.minutes ? fmt(x.minutes) + " min" : "-"]);
  rows.push({ cells: ["Total", "", "", fmt(s.max), fmt(s.total), fmt(s.percent) + "%", "", "", ""], attrs: " class=\"total\"" });
  return "<section class=\"q\" id=\"summary\"><h2 class=\"qhead\"><strong>Test summary</strong>" + esc(fmt(s.total) + " / " + fmt(s.max) + " (" + fmt(s.percent) + "%)") + "</h2>" +
    table(["Q", "Paper", "Topic", "Marks", "Score", "Percent", "Grade", "Words", "Time"], rows, { num: [3, 4, 5] }) +
    sub("Cutoff readiness", list(s.readiness.map(g => ({ html: esc(g.group + ": " + fmt(g.total) + " / " + fmt(g.max) + " (" + fmt(g.percent) + "%) ") + chip(g.status === "MERIT-LIST READY" ? "good" : g.status === "BORDERLINE" ? "ok" : "bad", g.status.charAt(0) + g.status.slice(1).toLowerCase()) + " " + esc("(" + g.note + ")") })))) +
    sub("Penalties that came back", list(s.recurringPenalties.map(p => p.label + " (" + p.code + "): " + p.count + " time" + (p.count === 1 ? "" : "s") + ", -" + fmt(p.total) + " marks"))) +
    sub("Language mistakes that came back", list(s.recurringLanguage.map(x => x.type + ": " + x.count))) +
    sub("Fatigue check", list(s.fatigue)) +
    "</section>";
}

function renderHTML(session) {
  const when = new Date(session.createdAt);
  const dateText = isNaN(when) ? "" : when.toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const toc = session.reports.length >= 2
    ? "<nav class=\"toc\" aria-label=\"Questions\"><h2>Questions in this report</h2><ol>" +
      (session.testSummary ? "<li><a href=\"#summary\">Test summary</a> <span class=\"tmark\">" + esc(fmt(session.testSummary.total) + " / " + fmt(session.testSummary.max)) + "</span></li>" : "") +
      session.reports.map(r => "<li><a href=\"#q" + esc(r.index) + "\">Q" + esc(r.index) + ", " + esc(r.question.paper) + (r.question.topic ? ", " + esc(r.question.topic) : "") + "</a> <span class=\"tmark\">" + esc(V.scoreText(r)) + "</span></li>").join("") +
      "</ol></nav>"
    : "";
  return "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<link rel=\"icon\" href=\"data:,\">\n<title>" + esc("RBI-Engine report: " + session.name) + "</title>\n<style>" + CSS + "</style>\n</head>\n<body>\n<main class=\"sheet\">\n" +
    "<header class=\"doc\"><h1>" + esc(session.name) + "</h1><p>" + esc(["Analysed " + dateText, session.engine].filter(x => x && x !== "Analysed ").join(", ")) + "</p></header>\n" +
    toc +
    (session.testSummary ? testSummaryHTML(session.testSummary) : "") +
    session.reports.map(r => renderQuestion(r, session)).join("\n") +
    "\n</main>\n</body>\n</html>\n";
}

module.exports = { renderHTML };
