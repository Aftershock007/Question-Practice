"use strict";

const R = require("./rubric");
const { median, snap4, round1, round2 } = require("./util");

const RUN_SPREAD = 0.12;
const COVER_VALUE = { full: 1, partial: 0.5, missing: 0 };
const SUB_RANK = { "DEEP & BALANCED": 3, "TEXTBOOK ONLY": 2, "SUPERFICIAL": 1, "MISSED": 0 };

const LEX_STOP = new Set("that this with from have been were their there which what when where while also into than then them they these those such only more most very much many some other over under about after before between because would could should shall will must each every both either neither does doing done make made using used uses being upon onto your yours itself shows show shown gives given give take taken takes like just even still well same different within without across along among around through during against towards toward".split(" "));

function lexWords(text) {
  return (String(text || "").toLowerCase().match(/[a-z][a-z0-9-]*/g) || [])
    .filter(w => w.length >= 4 && !LEX_STOP.has(w))
    .map(w => (w.length > 5 ? w.replace(/(ational|ations|ation|ities|ity|ings|ing|ments|ment|ness|ies|ied|ed|es|s|ly|al)$/, "") : w.replace(/s$/, "")));
}

function lexicalCoverage(points, answerText) {
  const have = new Set(lexWords(answerText));
  let total = 0;
  let got = 0;
  (points || []).forEach(p => {
    const ws = [...new Set(lexWords(p.point))];
    if (!ws.length) return;
    const hit = ws.filter(w => have.has(w)).length / ws.length;
    total += p.weight || 1;
    got += (p.weight || 1) * (hit >= 0.5 ? 1 : hit >= 0.25 ? 0.5 : 0);
  });
  return total ? got / total : null;
}

function checklistCoverage(checklist, scheme) {
  if (!scheme || !checklist || !checklist.length) return null;
  let total = 0;
  let got = 0;
  scheme.points.forEach((p, i) => {
    const c = checklist[i];
    if (!c) return;
    total += p.weight || 1;
    got += (p.weight || 1) * (COVER_VALUE[c.coverage] || 0);
  });
  return total ? got / total : null;
}

function crossCheckReason(run, scheme, q) {
  const substantial = q.words >= Math.max(60, 0.3 * (q.wordLimit || 400));
  const modelCov = checklistCoverage(run.checklist, scheme);
  const lex = scheme ? lexicalCoverage(scheme.points, q.answer) : null;
  if (scheme && modelCov === null && substantial) return "the marking checklist was missing from the reply";
  if (modelCov !== null && lex !== null && Math.abs(modelCov - lex) >= 0.45) return "its checklist verdict does not match the text of your answer";
  if (run.final === 0 && substantial && (lex === null || lex >= 0.3)) return "a zero for a full, on-topic answer";
  if (run.final >= 0.52 * q.marks && lex !== null && lex < 0.2) return "a top-grade mark for an answer that covers little of the reference";
  return "";
}

function spreadOf(runs) {
  const f = runs.map(r => r.final);
  return f.length ? round2(Math.max(...f) - Math.min(...f)) : 0;
}

function needsMoreRuns(runs, max) {
  return runs.length >= 2 && spreadOf(runs) > RUN_SPREAD * max + 1e-9;
}

function majority(values, rank) {
  const tally = new Map();
  values.forEach(v => tally.set(v, (tally.get(v) || 0) + 1));
  let best = null;
  for (const [v, n] of tally) {
    if (best === null || n > tally.get(best) || (n === tally.get(best) && rank(v) < rank(best))) best = v;
  }
  return best;
}

function baseIndex(runs, target) {
  const fulls = runs.map((r, i) => [r, i]).filter(([r]) => r.full);
  const pool = fulls.length ? fulls : runs.map((r, i) => [r, i]);
  return pool.slice().sort((a, b) => Math.abs(a[0].final - target) - Math.abs(b[0].final - target) || a[1] - b[1])[0][1];
}

function combineRuns(runs, q, scheme) {
  if (!runs || !runs.length) throw new Error("combineRuns needs at least one run.");
  const track = q.track;
  const finals = runs.map(r => r.final);
  const medianFinal = median(finals);
  const bi = baseIndex(runs, medianFinal);
  const base = runs[bi];
  const order = [bi, ...runs.map((_, i) => i).filter(i => i !== bi)];

  const params = R.paramMaxima(track, q.marks).map((p, i) => ({
    id: p.id,
    name: p.name,
    max: p.max,
    awarded: snap4(median(runs.map(r => r.params[i].awarded))),
    why: (base.params[i] && base.params[i].why) || "",
    lost: (base.params[i] && base.params[i].lost) || []
  }));

  const table = R.EXAMINER_CHECKS[track] || {};
  const checks = Object.keys(table).map(Number).map(id => {
    const votes = runs.map(r => (r.checks.find(c => c.id === id) || {}).pass).filter(v => v === true || v === false);
    const yes = votes.filter(Boolean).length;
    const no = votes.length - yes;
    const pass = votes.length ? yes > no : null;
    const from = order.map(i => runs[i].checks.find(c => c.id === id)).find(c => c && c.pass === pass && c.evidence);
    return { id, label: table[id][0], pass, evidence: from ? from.evidence : "", split: yes > 0 && no > 0 };
  });

  const anchors = runs.map(r => r.anchorCount).filter(v => typeof v === "number");
  const anchorCount = track === "A" ? (anchors.length ? Math.floor(median(anchors)) : null) : 0;
  const offVotes = runs.filter(r => r.offTopic).length;
  const offTopic = offVotes * 2 > runs.length;

  const codes = [...new Set(runs.flatMap(r => r.penalties.map(p => p.code)))].sort();
  const penalties = [];
  for (const code of codes) {
    const n = Math.round(median(runs.map(r => r.penalties.filter(p => p.code === code).length)));
    if (!n) continue;
    const seen = new Set();
    const triggers = [];
    for (const i of order) {
      for (const p of runs[i].penalties) {
        if (p.code !== code) continue;
        const key = p.trigger.toLowerCase().trim();
        if (seen.has(key)) continue;
        seen.add(key);
        triggers.push(p);
      }
    }
    for (let k = 0; k < n; k++) penalties.push({ code, trigger: triggers[k] ? triggers[k].trigger : "Found by the gradings (" + code + ").", quote: (triggers[k] && triggers[k].quote) || "" });
  }

  const enforced = R.enforceRubric({ track, marks: q.marks, wordLimit: q.wordLimit, words: q.words, params, checks: checks.map(c => ({ id: c.id, pass: c.pass })), anchorCount, penalties, offTopic });
  const fs = R.finalScore({ track, marks: q.marks, params: enforced.params, penalties: enforced.penalties, autoFail: enforced.autoFail, offTopic });

  const checklist = scheme ? scheme.points.map((p, i) => {
    const coverage = majority(runs.map(r => (r.checklist[i] ? r.checklist[i].coverage : "missing")), v => COVER_VALUE[v]);
    const from = order.map(k => runs[k].checklist[i]).find(c => c && c.coverage === coverage && c.quote);
    return { id: p.id, point: p.point, weight: p.weight, subpart: p.subpart, coverage, quote: from ? from.quote : "" };
  }) : [];
  const subparts = scheme ? scheme.subparts.map((s, i) => {
    const votes = runs.map(r => (r.subparts[i] ? r.subparts[i].coverage : "")).filter(Boolean);
    const coverage = votes.length ? majority(votes, v => SUB_RANK[v]) : "";
    const from = order.map(k => runs[k].subparts[i]).find(c => c && c.comment);
    return { id: s.id, part: s.part, expects: s.expects, coverage, comment: from ? from.comment : "" };
  }) : [];
  const cov = checklistCoverage(checklist, scheme);

  const pick = base.full ? base : null;

  return {
    params: enforced.params.map((p, i) => Object.assign({}, p, { why: params[i].why, lost: params[i].lost })),
    penalties: enforced.penalties,
    checks,
    anchorCount,
    checklist,
    subparts,
    coverage: cov === null ? null : round1(cov * 100),
    rawSum: fs.rawSum,
    penaltySum: fs.penaltySum,
    ceiling: fs.ceiling,
    ceilingApplied: fs.ceilingApplied,
    autoFail: enforced.autoFail,
    offTopic,
    score: fs.score,
    percent: fs.percent,
    grade: fs.grade,
    gradeLabel: fs.gradeLabel,
    projection: fs.projection,
    rules: enforced.rules,
    content: pick ? {
      anchorsUsed: pick.anchorsUsed || [],
      nameDrops: pick.nameDrops || [],
      missingAnchors: pick.missingAnchors || [],
      verifyFlags: pick.verifyFlags || [],
      factualErrors: pick.factualErrors || [],
      conceptGaps: pick.conceptGaps || [],
      errorLog: pick.errorLog || [],
      caps: pick.caps || [],
      meritCheck: pick.meritCheck || "",
      pacingAudit: pick.pacingAudit || ""
    } : null,
    consistency: {
      runs: finals,
      spread: spreadOf(runs),
      method: runs.length === 1 ? "one full grading" : runs.length === 2 ? "average of 2 independent gradings" : "median of " + runs.length + " independent gradings",
      base: bi,
      modelFinals: runs.map(r => r.modelFinal)
    }
  };
}

module.exports = { combineRuns, needsMoreRuns, crossCheckReason, lexicalCoverage, checklistCoverage, spreadOf, RUN_SPREAD };
