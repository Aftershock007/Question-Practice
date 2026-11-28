"use strict";

const { fmt } = require("../util");
const AM = require("../answer-marks");
const { usageText } = require("../ai");

const IDEAL_SHARES = {
  A: "introduction 10-15%, body 70-75%, conclusion / way forward 10-15%",
  B: "opening 10-15%, body 70-80%, conclusion about 10%",
  C: "one paragraph under a short title",
  D: "one complete-sentence answer per sub-question"
};

const COVERAGE_TEXT = { "DEEP & BALANCED": "Covered well", "TEXTBOOK ONLY": "Textbook only", "SUPERFICIAL": "Superficial", "MISSED": "Missed", "": "Not assessed" };
const CHECKLIST_TEXT = { full: "Covered", partial: "Partly", missing: "Missing" };
const OUTLINE_TEXT = { covered: "Covered", weak: "Weak", missing: "Missing", unknown: "Not assessed" };

function scoreText(r) {
  if (!r.marks) return "not computed";
  return fmt(r.marks.score) + " / " + fmt(r.question.marks);
}

function wordsText(r) {
  const a = r.answer;
  if (!r.question.wordLimit) return a.words + " words (no word limit)";
  return a.words + " / " + r.question.wordLimit + " words (" + a.wordPercent + "%) - " + a.bandLabel;
}

function timeText(r) {
  const a = r.answer;
  const ideal = a.idealMinutes ? " (ideal " + a.idealMinutes[0] + "-" + a.idealMinutes[1] + " min)" : "";
  if (!a.seconds) return "not recorded" + ideal;
  return fmt(a.minutes) + " min, " + a.wpm + " words per minute" + ideal;
}

function verdict(r) {
  const m = r.marks;
  if (!m) return { score: "not computed", percent: "", grade: "", projection: "", words: wordsText(r), time: timeText(r), consistency: "", merit: "" };
  const c = m.consistency || {};
  let consistency = "";
  if (m.notAttempted) consistency = "Not attempted, so no grading was needed.";
  else if (c.runs && c.runs.length) {
    consistency = c.method.charAt(0).toUpperCase() + c.method.slice(1) + ": " + c.runs.map(fmt).join(", ") + " (spread " + fmt(c.spread) + ")." +
      (c.extraRuns ? " " + c.extraRuns + " extra grading" + (c.extraRuns === 1 ? "" : "s") + " because " + (c.reason || "the first gradings disagreed") + "." : "");
  }
  return {
    score: scoreText(r) + (m.notAttempted ? " (not attempted)" : ""),
    percent: fmt(m.percent) + "%",
    grade: m.grade + " - " + m.gradeLabel,
    projection: m.projection ? fmt(m.projection[0]) + " - " + fmt(m.projection[1]) + " / " + fmt(r.question.marks) : "none",
    words: wordsText(r),
    time: timeText(r),
    consistency,
    merit: (m.content && m.content.meritCheck) || ""
  };
}

function arithmetic(r) {
  const m = r.marks;
  if (!m) return "";
  const max = fmt(r.question.marks);
  const start = fmt(m.rawSum) + " - " + fmt(m.penaltySum) + " = ";
  const before = Math.max(0, m.rawSum - m.penaltySum);
  if (m.notAttempted) return "Not attempted: 0 / " + max + ".";
  if (m.autoFail) return start + fmt(before) + ", but the rubric gives 0 under 60 words, so 0 / " + max + ".";
  if (m.offTopic) return start + fmt(before) + ", but the rubric gives 0 for an off-topic answer, so 0 / " + max + ".";
  if (m.ceilingApplied) return start + fmt(before) + ", capped at the rubric's hard ceiling of " + fmt(m.ceiling) + ", so " + fmt(m.score) + " / " + max + ".";
  return start + fmt(m.score) + " / " + max;
}

function paramRows(r) {
  return r.marks ? r.marks.params.map(p => [p.id + " " + p.name, fmt(p.max), fmt(p.awarded), p.cap || "", p.why || ""]) : [];
}

function penaltyRows(r) {
  return r.marks ? r.marks.penalties.map(p => [p.code, p.label, p.trigger, "-" + fmt(p.deduction)]) : [];
}

function checkRows(r) {
  return r.marks ? r.marks.checks.map(c => [String(c.id), c.label, (c.pass === true ? "YES" : c.pass === false ? "NO" : "N/A") + (c.split ? " (split vote)" : ""), c.evidence || ""]) : [];
}

function endSentence(s) {
  const t = String(s || "").trim();
  return !t || /[.!?:]$/.test(t) ? t : t + ".";
}

function rulesInForce(r) {
  const m = r.marks;
  if (!m) return [];
  const out = m.params.filter(p => p.cap).map(p => p.id + " " + p.name + ": capped at " + endSentence(p.cap));
  (m.rules || []).forEach(x => { if (!out.includes(x)) out.push(x); });
  const c = m.consistency || {};
  const model = (c.modelFinals || []).filter(v => typeof v === "number");
  if (model.length && model.length === (c.runs || []).length && model.some((v, i) => Math.abs(v - c.runs[i]) >= 0.125)) {
    out.push("The AI's own totals were " + model.map(fmt).join(", ") + "; the engine recomputed them with the rubric's caps, penalty values and word bands to " + c.runs.map(fmt).join(", ") + ".");
  }
  return out;
}

function built(r) {
  const m = r.marked || {};
  return { text: r.answer.text, marks: m.marks || [], counts: m.counts || {}, dropped: m.dropped || 0 };
}

const COUNT_WORDS = [["lang", "language mistake", "language mistakes"], ["frame", "sentence to frame better", "sentences to frame better"], ["fact", "wrong fact", "wrong facts"], ["add", "addition", "additions"], ["cut", "deduction", "deductions"]];

function markCounts(r) {
  const c = built(r).counts;
  return COUNT_WORDS.filter(([k]) => c[k]).map(([k, one, many]) => c[k] + " " + (c[k] === 1 ? one : many)).join(", ");
}

function signedLoss(v) {
  return v < 0 ? "+" + fmt(-v) : "-" + fmt(v);
}

function ledgerLines(r, n) {
  const rows = (r.ledger ? r.ledger.rows : []).map((x, i) => Object.assign({ order: i }, x)).sort((a, b) => b.lost - a.lost || a.order - b.order);
  return rows.slice(0, n || rows.length).map(x => x.title + " " + signedLoss(x.lost) + (x.reasons.length ? ": " + endSentence(x.reasons[0]) : ""));
}

function lossTitle(r) {
  const t = r.ledger ? r.ledger.total : null;
  if (t === null || t === undefined) return "Why you lost marks";
  return "Why you lost " + fmt(t) + " mark" + (t === 1 ? "" : "s");
}

function notShown(r) {
  return built(r).marks.filter(m => !m.inline && m.kind !== "cut").length;
}

function unitText(r, id) {
  const u = (r.answer.units || []).find(x => x.id === id);
  return u ? u.text : id;
}

function markedAnswer(r, paint) {
  return AM.markedPlain(built(r), paint ? { paint } : {});
}

function languageOverview(r) {
  const l = r.language;
  if (!l) return "";
  const types = Object.entries(l.byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => t + " " + n).join(", ");
  return l.issues.length + " mistake" + (l.issues.length === 1 ? "" : "s") + " found (" + fmt(l.per100) + " per 100 words)" +
    (types ? ": " + types : "") + ". Major: " + l.bySeverity.major + ", minor: " + l.bySeverity.minor + ".";
}

function styleLine(r) {
  const s = r.language && r.language.style;
  if (!s || !s.verdict) return "";
  return "Style: " + s.verdict + (s.score !== null && s.score !== undefined ? " (" + fmt(s.score) + "/10)" : "") + ".";
}

function allocationLine(r) {
  const st = r.structure;
  if (st.introShare === null || st.introShare === undefined) return "Introduction, body and conclusion could not be measured (fewer than three paragraphs or lines).";
  return "Introduction " + st.introShare + "%, body " + st.bodyShare + "%, conclusion " + st.conclusionShare + "% of your words (ideal for this answer type: " + (IDEAL_SHARES[r.question.track] || IDEAL_SHARES.A) + ").";
}

function structureFacts(r) {
  const st = r.structure;
  return [
    st.paragraphs + " paragraph" + (st.paragraphs === 1 ? "" : "s") + ", " + st.lines + " line" + (st.lines === 1 ? "" : "s") + ", " + st.points + " numbered or bulleted point" + (st.points === 1 ? "" : "s") + ".",
    st.headings.length ? "Headings: " + st.headings.join("; ") + "." : "No headings.",
    "Concluding paragraph: " + (st.hasConclusion ? "found." : "not found."),
    "Average sentence: " + fmt(st.avgSentenceWords) + " words" + (st.longest ? "; longest: " + st.longest.words + " words." : ".")
  ];
}

function outlineRows(r) {
  const match = r.coach ? r.coach.outlineMatch : [];
  return r.reading.outline.map(o => {
    const m = match.find(x => x.id === o.id);
    return [o.section, o.share + "%" + (o.words ? " (about " + o.words + " words)" : ""), o.covers, m ? OUTLINE_TEXT[m.status] || m.status : "", m ? m.comment : ""];
  });
}

function technical(r, session) {
  const s = r.status || {};
  const lines = [];
  const models = s.models || {};
  if (models.check) lines.push("Engine 1 (checklist, summary): " + models.check);
  if (models.grade) lines.push("Engine 2 (marks, language, coach): " + models.grade);
  lines.push("AI calls in this run: " + (s.calls || 0) + "; parts reused from the cache: " + (s.cached || 0) + ".");
  if (s.usage) lines.push("Tokens: " + usageText(s.usage) + ".");
  if (s.durationMs) lines.push("Time: " + Math.round(s.durationMs / 1000) + " s.");
  (s.fallbackFrom || []).forEach(f => lines.push("Model fallback: " + f + "."));
  (r.question.warnings || []).forEach(w => lines.push("Note: " + w));
  (s.warnings || []).forEach(w => lines.push("Warning: " + w));
  (s.failed || []).forEach(f => lines.push("Failed: " + f.pass + " (" + f.kind + ": " + f.message + ")."));
  if ((s.skipped || []).length) lines.push("Skipped: " + s.skipped.join(", ") + ". Run the same command again to finish them.");
  if (notShown(r)) lines.push(notShown(r) + " suggestion" + (notShown(r) === 1 ? " is" : "s are") + " listed under Your answer, marked but not shown inside the answer, because the exact place was not found.");
  if (r.language && r.language.dropped) lines.push(r.language.dropped + " language suggestion" + (r.language.dropped === 1 ? " was" : "s were") + " left out because they quoted words that are not in your answer, repeated another fix, or only changed British spelling.");
  if (r.coaching && r.coaching.fallback && !(r.marks && r.marks.notAttempted)) lines.push("The summary was written by the engine itself because the AI summary was not available.");
  lines.push("Report id: " + r.id + (session ? " · " + session.engine : ""));
  return lines;
}

module.exports = {
  IDEAL_SHARES, COVERAGE_TEXT, CHECKLIST_TEXT, OUTLINE_TEXT,
  scoreText, wordsText, timeText, verdict, arithmetic, paramRows, penaltyRows, checkRows, unitText, rulesInForce, endSentence,
  built, markCounts, signedLoss, ledgerLines, lossTitle, notShown,
  markedAnswer, languageOverview, styleLine, allocationLine, structureFacts, outlineRows, technical
};
