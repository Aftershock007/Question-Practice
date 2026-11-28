"use strict";

const V = require("./view");
const { paint, wrap, table } = require("../ui");
const { renderMarkdown } = require("./markdown");
const { fmt } = require("../util");

const GRADE_COLOR = { A: "green", B: "green", C: "yellow", D: "red", F: "red" };
const MARK_STYLE = { "lang-old": "red", "lang-new": "green", "frame-old": "blue", "frame-new": "cyan", "fact-old": "magenta", "fact-new": "bold+magenta", add: "yellow", cut: "bold+red", ref: "dim" };

function renderSummary(session, opts = {}) {
  const on = !!opts.color;
  const c = (style, t) => paint(style, t, on);
  const width = Math.max(50, Math.min(opts.width || 100, 110));
  const label = 15;
  const out = [];
  const row = (name, value) => {
    out.push(wrap(value, width, "    " + " ".repeat(label), "    " + c("dim", name.padEnd(label))));
  };
  out.push(c("bold", "RBI-Engine analysis: " + session.name));
  if (session.testSummary) {
    const s = session.testSummary;
    out.push("");
    out.push(c("bold", "Test total " + fmt(s.total) + " / " + fmt(s.max) + " (" + fmt(s.percent) + "%)"));
    out.push(table(s.rows.map(x => ["Q" + x.index, x.paper, x.score === null ? "-" : fmt(x.score) + " / " + fmt(x.marks), x.grade ? "grade " + x.grade : "", x.wordPercent !== null ? x.words + " words (" + x.wordPercent + "%)" : x.words + " words"]), { indent: "    " }));
    s.readiness.forEach(g => out.push("    " + g.group + ": " + fmt(g.total) + " / " + fmt(g.max) + " (" + fmt(g.percent) + "%) - " + c(g.status === "MERIT-LIST READY" ? "green" : g.status === "BORDERLINE" ? "yellow" : "red", g.status)));
    if (s.recurringPenalties.length) out.push(wrap("Penalties that came back: " + s.recurringPenalties.slice(0, 3).map(p => p.label + " x" + p.count).join(", "), width, "      ", "    "));
  }
  for (const r of session.reports) {
    const q = r.question;
    const v = V.verdict(r);
    out.push("");
    out.push(c("bold", "Q" + q.index) + "  " + q.paper + ", " + fmt(q.marks) + " marks, " + q.trackLabel + (q.topic ? ", " + q.topic : ""));
    if (r.marks) {
      row("Score", c("bold+" + (GRADE_COLOR[r.marks.grade] || "yellow"), v.score) + " (" + v.percent + "), grade " + v.grade);
      if (r.marks.projection) row("Real exam", v.projection + " (strict marking projects higher in the real exam)");
      if (v.consistency) row("Gradings", v.consistency);
    } else {
      row("Score", c("red", "not computed in this run"));
    }
    row("Words", v.words);
    row("Time", v.time);
    const lost = V.ledgerLines(r, 3);
    if (lost.length) row("Marks lost", lost.join("\n"));
    if (V.markCounts(r)) row("Marked", V.markCounts(r) + " (shown in colour in the HTML report)");
    if (r.language) row("Language", r.language.issues.length + " language mistake" + (r.language.issues.length === 1 ? "" : "s") + " (" + fmt(r.language.per100) + " per 100 words)" + (V.styleLine(r) ? "; " + V.styleLine(r).replace(/\.$/, "") : ""));
    if (r.mechanical.length) row("Engine checks", r.mechanical.length + " found: " + [...new Set(r.mechanical.map(m => m.kind))].slice(0, 5).join(", "));
    const prio = (r.coaching && r.coaching.priorities) || [];
    if (prio.length) {
      out.push("    " + c("dim", "Fix first"));
      prio.slice(0, 3).forEach((p, i) => out.push(wrap((i + 1) + ". " + c("bold", p.title) + " - " + V.endSentence(p.why), width, "         ", "      ")));
    } else if (r.coaching && r.coaching.summary) {
      out.push(wrap(r.coaching.summary, width, "    ", "    "));
    }
    const st = r.status || {};
    if ((st.failed || []).length) row("Failed", st.failed.map(f => f.pass + " (" + f.kind + ")").join(", "));
    if ((st.skipped || []).length) row("Not finished", st.skipped.join(", ") + ". Run the same command again to finish them; finished parts are saved.");
  }
  const p = opts.paths || {};
  if (p.html || p.md) {
    out.push("");
    if (p.html) out.push("Full report: " + c("cyan", p.html));
    if (p.md) out.push(c("dim", "Markdown:    " + p.md));
  }
  return out.join("\n");
}

function renderFull(session, opts = {}) {
  const on = !!opts.color;
  const md = renderMarkdown(session, on ? { paint: (role, text) => paint(MARK_STYLE[role] || "", text, true) } : {});
  return md.split("\n").map(line => {
    const m = line.match(/^(#{1,4}) (.*)$/);
    return m ? paint("bold" + (m[1].length <= 2 ? "+cyan" : ""), m[2], on) : line;
  }).join("\n");
}

module.exports = { renderSummary, renderFull };
