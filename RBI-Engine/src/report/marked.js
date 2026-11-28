"use strict";

const AM = require("../answer-marks");
const R = require("../rubric");

const COVER_ORDER = { missing: 0, partial: 1 };

function checkReasons(q, marks, no) {
  const table = R.EXAMINER_CHECKS[q.track] || {};
  return (marks.checks || [])
    .filter(c => c.pass === false && table[c.id] && table[c.id][1] && table[c.id][1][0] === no && c.evidence)
    .map(c => c.label + ": " + c.evidence);
}

function ledgerFor(q, marks) {
  if (!marks) return null;
  const params = (marks.params || []).map((p, i) => {
    const own = (p.lost || []).length ? p.lost : (p.why ? [p.why] : []);
    return { id: p.id, name: p.name, max: p.max, awarded: p.awarded, cap: p.cap, reasons: checkReasons(q, marks, i + 1).concat(own) };
  });
  const missed = (marks.checklist || [])
    .map((k, i) => Object.assign({ order: i }, k))
    .filter(k => k.coverage !== "full")
    .sort((a, b) => (b.weight || 1) - (a.weight || 1) || COVER_ORDER[a.coverage] - COVER_ORDER[b.coverage] || a.order - b.order)
    .map(k => ({ id: k.id, point: k.point, weight: k.weight, coverage: k.coverage }));
  return AM.lossLedger({
    max: q.marks, score: marks.score, rawSum: marks.rawSum, penaltySum: marks.penaltySum, ceiling: marks.ceiling,
    autoFail: marks.autoFail, offTopic: marks.offTopic, notAttempted: marks.notAttempted, track: q.track,
    params, penalties: marks.penalties || [], missed
  });
}

function markedFor(q, language, marks, coach, ledger, qid) {
  const content = (marks && marks.content) || {};
  const refs = (ledger && ledger.penaltyRefs) || [];
  const built = AM.buildMarks(q.answer, {
    lang: language ? language.issues.map(i => ({ start: i.start, end: i.end, wrong: i.wrong, fix: i.fix, why: i.rule, type: i.type, severity: i.severity })) : [],
    facts: (content.factualErrors || []).map(f => ({ quote: f.quote, fix: f.fact, why: f.problem })),
    frames: coach ? (coach.reframe || []).map(f => ({ start: f.start, end: f.end, fix: f.better, why: f.why })) : [],
    adds: coach ? (coach.additions || []).map(a => ({ at: a.at, fix: a.add, why: a.why })) : [],
    cuts: marks ? (marks.penalties || []).map((p, i) => ({ quote: p.quote, deduction: p.deduction, label: p.label + " (" + p.code + ")", ref: refs[i] ? qid + "-" + refs[i] : "" })) : []
  });
  return { marks: built.marks, counts: built.counts, dropped: built.dropped };
}

module.exports = { ledgerFor, markedFor };
