"use strict";

const V = require("./view");
const AM = require("../answer-marks");
const { escapeHTML: esc, fmt } = require("../util");

const CSS = `
:root {
  --bg: #f5f5f7; --paper: #ffffff; --ink: #1d1d1f; --ink-2: #3a3a3c; --muted: #6e6e73; --line: #e5e5ea; --line-strong: #d2d2d7;
  --fill: #f8f8fa; --brand: #0d2b5e; --accent: #1d5fc4; --accent-soft: #eef4fd; --gold: #9a7128;
  --ok: #1e8e3e; --ok-soft: #ebf6ee; --danger: #c9302c; --danger-soft: #fdefee; --warn: #b0600c; --warn-soft: #fdf4e7;
  --mk-red: #c62828; --mk-green-soft: #c9efd4; --mk-green-ink: #0b5126;
  --mk-blue: #1e3a8a; --mk-blue-soft: #dbe8ff; --mk-blue-ink: #10316b;
  --mk-purple: #5b21b6; --mk-purple-soft: #ede4ff; --mk-purple-ink: #3f1d70;
  --mk-gold: #b7791f; --mk-gold-soft: #fdf0c8; --mk-gold-ink: #5a4000;
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --script: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16181d; --paper: #1f2128; --ink: #f2f2f4; --ink-2: #d6d6da; --muted: #a1a1a6; --line: #34363d; --line-strong: #44474f;
    --fill: #262830; --brand: #a9c1ee; --accent: #7aa7f0; --accent-soft: #1f2a3d; --gold: #d8b36a;
    --ok: #63c482; --ok-soft: #1d3325; --danger: #f2847d; --danger-soft: #3a2224; --warn: #eaa95a; --warn-soft: #3a2d1d;
    --mk-red: #d64541; --mk-green-soft: #1d4a2c; --mk-green-ink: #b8f0c8;
    --mk-blue: #3557c4; --mk-blue-soft: #1d2d50; --mk-blue-ink: #c6d7ff;
    --mk-purple: #7c4ddb; --mk-purple-soft: #2f2245; --mk-purple-ink: #dccbff;
    --mk-gold: #d8a743; --mk-gold-soft: #3b3014; --mk-gold-ink: #f3d892;
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
details.sec > summary h3 { margin: 0; font-size: 19px; color: var(--brand); flex: none; }
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
.mk-answer { font-family: var(--script); font-size: 16.5px; line-height: 2.05; white-space: pre-wrap; background: var(--fill); border-left: 3px solid var(--line-strong); border-radius: 0 10px 10px 0; padding: 16px 20px; margin: 12px 0; overflow-wrap: anywhere; }
.mk-old, .mk-new, .mk-add { -webkit-box-decoration-break: clone; box-decoration-break: clone; border-radius: 3px; padding: 1px 3px; }
.mk-new { margin-left: 3px; text-decoration: none; }
.mk-lang > .mk-old { background: var(--mk-red); color: #fff; text-decoration: line-through; text-decoration-color: rgba(255, 255, 255, 0.85); text-decoration-thickness: 2px; }
.mk-lang > .mk-new { background: var(--mk-green-soft); color: var(--mk-green-ink); font-weight: 600; }
.mk-frame > .mk-old { background: var(--mk-blue); color: #fff; }
.mk-frame > .mk-new { background: var(--mk-blue-soft); color: var(--mk-blue-ink); }
.mk-fact > .mk-old { background: var(--mk-purple); color: #fff; }
.mk-fact > .mk-new { background: var(--mk-purple-soft); color: var(--mk-purple-ink); }
.mk-add { background: var(--mk-gold-soft); color: var(--mk-gold-ink); text-decoration: none; border-left: 3px solid var(--mk-gold); margin-left: 4px; padding: 1px 6px; }
.mk-tag { font-family: var(--font); font-size: 11px; font-weight: 700; margin-right: 2px; }
.mk-ref { font-family: var(--font); font-size: 10.5px; font-weight: 700; vertical-align: super; line-height: 0; margin-left: 2px; text-decoration: none; color: var(--brand); }
.mk-frame > .mk-old .mk-ref, .mk-fact > .mk-old .mk-ref { color: #fff; }
.mk-cut { font-family: var(--font); font-size: 11px; font-weight: 700; vertical-align: super; line-height: 0; margin-left: 2px; padding: 0 5px; border: 1px solid var(--ink); border-radius: 999px; color: var(--ink); background: var(--paper); text-decoration: none; white-space: nowrap; }
.mk-legend { list-style: none; padding: 0; margin: 10px 0 4px; display: flex; flex-wrap: wrap; gap: 8px 20px; font-size: 13.5px; color: var(--ink-2); max-width: none; }
.mk-legend li { margin: 0; }
.mk-legend .mk, .mk-legend .mk-add { font-family: var(--script); font-size: 14px; }
.mk-legend .mk-cut { vertical-align: baseline; line-height: 1.4; }
.mk-group { margin-top: 20px; }
.body .mk-gh { display: flex; align-items: center; gap: 8px; font-size: 15px; margin: 0 0 4px; color: var(--ink); }
.mk-gh::before { content: ""; flex: none; width: 10px; height: 10px; border-radius: 3px; background: var(--mk-sw, var(--muted)); }
.mk-g-lang { --mk-sw: var(--mk-red); } .mk-g-frame { --mk-sw: var(--mk-blue); } .mk-g-fact { --mk-sw: var(--mk-purple); } .mk-g-add { --mk-sw: var(--mk-gold); }
.mk-count { color: var(--muted); font-weight: 500; }
.body .mk-list { list-style: none; padding: 0; margin: 0; max-width: none; }
.body .mk-list > li { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 10px; padding: 10px 0; margin: 0; border-top: 1px solid var(--line); }
.mk-num { font-weight: 700; font-size: 13px; color: var(--brand); text-decoration: none; padding-top: 3px; font-variant-numeric: tabular-nums; }
.body .mk-body p { margin: 2px 0; }
.body .mk-pair { font-family: var(--script); font-size: 15.5px; line-height: 1.95; }
.body .mk-why { font-size: 14px; color: var(--ink-2); }
.mk-meta { font-weight: 600; color: var(--ink); }
.body .mk-where { font-size: 13px; color: var(--muted); }
.mk-note { font-size: 13px; color: var(--warn); }
.mk-hint { font-size: 13px; color: var(--muted); }
.mk-list > li:target { background: var(--accent-soft); }
.body .mk-ledger-sum { font-size: 15.5px; margin: 6px 0 10px; }
.mk-tw { overflow-x: auto; margin: 8px 0; }
th.mk-n, td.mk-n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.mk-ltable td:first-child { min-width: 170px; }
.mk-sub { display: block; color: var(--muted); font-size: 13px; font-weight: 400; }
.body .mk-reasons { margin: 0; padding-left: 18px; }
.body .mk-reasons li { margin: 2px 0; }
.mk-ltable p { margin: 0 0 4px; }
.mk-quote { font-family: var(--script); color: var(--ink-2); }
.mk-r-param td.mk-n, .mk-r-penalty td.mk-n, .mk-r-ceiling td.mk-n, .mk-r-zero td.mk-n, .mk-r-adjust td.mk-n { color: var(--danger); font-weight: 700; }
.mk-r-floor td.mk-n { color: var(--ok); font-weight: 700; }
tr.mk-total td { font-weight: 700; border-bottom: 0; }
.mk-missed { margin-top: 16px; }
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
  tr, .verdict, .mk-list > li { break-inside: avoid; }
  .mk-answer, .mk-legend, .mk-lists, .mk-ledger { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
    sub("Factual errors", para((c.factualErrors || []).length ? c.factualErrors.length + " wrong fact" + (c.factualErrors.length === 1 ? " is" : "s are") + " marked in purple in Your answer, marked (F1" + (c.factualErrors.length > 1 ? "-F" + c.factualErrors.length : "") + "), each with the correct fact." : "No provably wrong facts were found.")) +
    sub("Content and logic errors (red-pen log)", table(["You wrote", "Code", "Problem", "Correction"], (c.errorLog || []).map(e => [e.quote, e.code, e.problem, e.correction]), { quote: [0] })) +
    sub("Sources you used", list(c.anchorsUsed)) +
    sub("Named without saying what they do", list(c.nameDrops)) +
    sub("Sources to add next time", list(c.missingAnchors)) +
    sub("Figures to verify", list(c.verifyFlags));
}

function markedBody(r, qid) {
  const b = V.built(r);
  if (r.marks && r.marks.notAttempted) return NA;
  if (!b.marks.length) return para(r.language || r.coach ? "Nothing to mark: no language, framing or fact changes were found." : "The AI parts did not run, so nothing is marked yet.") + script(r.answer.text);
  const opts = { idPrefix: qid + "-", heading: "h4" };
  return AM.legendHTML(b) + AM.markedHTML(b, opts) + AM.marksListHTML(b, opts);
}

function ledgerBody(r, qid) {
  if (!r.ledger) return para("The marks could not be computed in this run. Run the same command again to retry the gradings.");
  return AM.ledgerHTML(r.ledger, { idPrefix: qid + "-", heading: "h4" });
}

function languageBody(r) {
  const l = r.language;
  const mech = r.mechanical || [];
  let html = "";
  if (l) {
    html += para([V.languageOverview(r), V.styleLine(r)].filter(Boolean).join(" "));
    if (l.style.assessment) html += para(l.style.assessment);
    if (l.summary) html += para(l.summary);
    if (l.style.issues.length) html += sub("Style problems", list(l.style.issues));
    html += para(l.issues.length ? "All " + l.issues.length + " language mistake" + (l.issues.length === 1 ? " is" : "s are") + " marked in red and green in Your answer, marked (L1" + (l.issues.length > 1 ? "-L" + l.issues.length : "") + "), each with its rule." : "No language corrections were needed.");
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
  if (c.reframe.length || c.additions.length) html += para("Sentences to frame better (blue) and additions (gold) are marked in Your answer, marked (" + [c.reframe.length ? c.reframe.length + " to frame better" : "", c.additions.length ? c.additions.length + " to add" : ""].filter(Boolean).join(", ") + ").");
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
    section(qid + "-marked", "Your answer, marked", V.markCounts(r), markedBody(r, qid)) +
    section(qid + "-lost", V.lossTitle(r), "", ledgerBody(r, qid)) +
    section(qid + "-reading", "Reading the question", "", readingBody(r)) +
    section(qid + "-marks", "Marks breakdown", r.marks && !r.marks.notAttempted ? fmt(r.marks.rawSum) + " raw, -" + fmt(r.marks.penaltySum) + " penalties" : "", marksBody(r)) +
    section(qid + "-content", "Content", r.marks && r.marks.coverage !== null && r.marks.coverage !== undefined ? fmt(r.marks.coverage) + "% of the checklist" : "", contentBody(r)) +
    section(qid + "-language", "Language", l ? l.issues.length + " mistake" + (l.issues.length === 1 ? "" : "s") + ", " + (r.mechanical || []).length + " engine check" + ((r.mechanical || []).length === 1 ? "" : "s") : "", languageBody(r)) +
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
