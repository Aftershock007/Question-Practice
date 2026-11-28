"use strict";

const { str, strList, objList, num, clamp, snap4, plainText, quoteInScript, formatDuration, fmt } = require("../util");
const { AIError } = require("../ai");
const R = require("../rubric");
const { EVAL_PROMPT_TEMPLATE, fillTemplate } = require("../rubric-text");
const { S, N, B, SL, objSchema, listOf, oneOf } = require("./common");

const VERSION = "g2";

const SYSTEM = "You grade RBI Grade B Phase-2 descriptive answers for a candidate's practice engine. Apply the rubric, gates, penalties and calibration exactly as written, together with the fixed engine settings. Reply with exactly one valid JSON object containing the keys listed in the OUTPUT CONTRACT - no markdown, no code fences, no text before or after the JSON.";

const COVERAGE = ["DEEP & BALANCED", "TEXTBOOK ONLY", "SUPERFICIAL", "MISSED"];
const CHECK = listOf({ id: S, result: oneOf(["YES", "NO", "N/A"]), evidence: S });
const CHECKLIST = listOf({ id: S, coverage: oneOf(["full", "partial", "missing"]), quote: S });

const FULL_SCHEMA = objSchema({
  checklist: CHECKLIST,
  subparts: listOf({ id: S, coverage: oneOf(COVERAGE), comment: S }),
  examiner_checks: CHECK,
  anchor_count: N,
  off_topic: B,
  anchors_used: SL,
  bare_name_drops: SL,
  missing_anchors: SL,
  verify_flags: SL,
  factual_errors: listOf({ quote: S, problem: S, correct_fact: S }),
  concept_gaps: SL,
  error_log: listOf({ quote: S, code: S, problem: S, correction: S }),
  caps_triggered: SL,
  parameters: listOf({ id: S, cap_applied: S, awarded: N, justification: S, lost: SL }),
  penalties: listOf({ code: S, trigger: S, quote: S }),
  stage1_raw_sum: N,
  total_penalties: N,
  final_score: N,
  merit_check: S,
  pacing_audit: S
});

const SCORE_SCHEMA = objSchema({
  checklist: CHECKLIST,
  subparts: listOf({ id: S, coverage: oneOf(COVERAGE) }),
  examiner_checks: CHECK,
  anchor_count: N,
  off_topic: B,
  parameters: listOf({ id: S, awarded: N, justification: S }),
  penalties: listOf({ code: S, trigger: S }),
  stage1_raw_sum: N,
  total_penalties: N,
  final_score: N
});

const RULE = "################################################################################";

function questionPromptText(q) {
  if (!q.passage) return q.question;
  return "[Passage / data this question is based on]\n" + q.passage + "\n\n[Question]\n" + q.question;
}

function templateValues(q) {
  const limit = Number(q.wordLimit) || 0;
  return {
    PAPER: q.paper || "Other",
    TOPIC: q.topic || "Not specified",
    MARKS: q.marks,
    WORD_LIMIT: limit || "Not specified",
    WORD_COUNT: q.words,
    WORD_PERCENT: limit ? Math.round(q.words / limit * 100) : "n/a",
    TIME_SPENT: q.seconds > 0 ? formatDuration(q.seconds) : "Not recorded",
    DATE: q.date || "Not recorded",
    QUESTION: questionPromptText(q),
    ANSWER: q.answer || "[NO ANSWER WRITTEN]",
    MODEL_ANSWER: q.modelAnswer || "[No model answer provided - evaluate using your own expert knowledge of the topic.]"
  };
}

function bandText(track, words, limit) {
  const band = R.wordBand(track, words, limit);
  if (band === "full") return "inside the full-credit band";
  if (band === "half") return "inside the half-credit band (P5 is capped at 50%)";
  if (band === "zero") return "outside the allowed band (P5 is 0 and RP-5 applies)";
  return "no word band applies";
}

function engineBlock(q, scheme, commandWords) {
  const params = R.paramMaxima(q.track, q.marks);
  const codes = Object.keys(R.PENALTY_TABLE).filter(c => R.penaltyValue(c, q.marks, q.track) > 0);
  const notApplicable = Object.keys(R.PENALTY_TABLE).filter(c => !codes.includes(c));
  const checks = R.EXAMINER_CHECKS[q.track];
  const limit = Number(q.wordLimit) || 0;
  const lines = [
    RULE,
    "#  ENGINE SETTINGS FOR THIS SCRIPT (fixed by the engine - they replace the routing and scaling steps above)",
    RULE,
    "- Track: " + q.track + " (" + q.trackLabel + "). Use this track only; do not route the script to another track.",
    "- Parameter maxima for " + q.marks + " marks (already scaled; RULE 5 is done): " + params.map(p => p.id + " = " + fmt(p.max)).join(", ") + " (total " + fmt(q.marks) + ").",
    "  " + params.map(p => p.id + " = " + p.name).join("; ") + ".",
    "- Penalty value per instance for " + q.marks + " marks (the engine applies these values itself): " +
      codes.map(c => c + " = " + fmt(R.penaltyValue(c, q.marks, q.track)) + " (at most " + R.PENALTY_TABLE[c].most + ")").join(", ") +
      (notApplicable.length ? ". Not applicable on this track: " + notApplicable.join(", ") : "") + ".",
    "- Word count measured by the engine: " + q.words + " of " + (limit || "no limit") + (limit ? " words (" + Math.round(q.words / limit * 100) + "%)" : "") + ". Word band: " + bandText(q.track, q.words, limit) + ". The engine applies the word band to P5 and RP-5 itself.",
    "- Command words found in the question: " + (commandWords.length ? commandWords.map(c => c.word).join(", ") : "none found") + ".",
    "- Examiner checks for Track " + q.track + " (STAGE 1B), by id: " + Object.keys(checks).map(id => id + ". " + checks[id][0]).join("; ") + "."
  ];
  if (scheme) {
    lines.push(
      "",
      "FIXED SUB-PARTS OF THE QUESTION (report every one in \"subparts\", by id):",
      ...scheme.subparts.map(s => s.id + " " + s.part + " - expects: " + s.expects),
      "",
      "FIXED MARKING CHECKLIST (consistency anchor - the same for every attempt at this question):",
      ...scheme.points.map(p => p.id + " (weight " + p.weight + ", " + p.subpart + ") " + p.point),
      "",
      "Rules for the checklist:",
      "- Report every point in \"checklist\": \"full\" = made correctly and specifically (in any words); \"partial\" = mentioned but vague, incomplete or without the figure or example; \"missing\" = absent or wrong.",
      "- Judge by meaning, not wording. Never mark a point \"full\" unless you can quote the script.",
      "- The content marks (P1-P3) MUST follow the checklist: an answer that covers more of the weighted points gets more content marks than one that covers fewer. Correct, relevant points beyond the list can earn some credit, but never make up for missing weight-3 points.",
      "- Apply the rubric, caps and penalties exactly as usual on top of this."
    );
  }
  return lines.join("\n");
}

function fullContract(q) {
  const ids = R.paramMaxima(q.track, q.marks).map(p => p.id).join(", ");
  return [
    RULE,
    "#  OUTPUT CONTRACT - SCORING PASS (overrides the presentation format above)",
    RULE,
    "This evaluation is read by the candidate's practice engine, not pasted into a chat. Carry out the audit and scoring steps of the REQUIRED EVALUATION OUTPUT FORMAT above in the same order (audit first, marks after), using the fixed engine settings. Other passes of the engine write the writing audit (Section 3B), the surgical rewrites (Section 6), the model answer (Section 7) and the drills (Section 8): skip them here. Return ONE JSON object and nothing else, with these keys in this order:",
    "- \"checklist\": one entry per FIXED MARKING CHECKLIST point, in order: {\"id\": \"K1\", \"coverage\": \"full\" | \"partial\" | \"missing\", \"quote\": the candidate's exact words that cover it, or \"\"}.",
    "- \"subparts\": one entry per FIXED SUB-PART, in order: {\"id\": \"S1\", \"coverage\": \"DEEP & BALANCED\" | \"TEXTBOOK ONLY\" | \"SUPERFICIAL\" | \"MISSED\", \"comment\": one line on how you handled it}.",
    "- \"examiner_checks\": every STAGE 1B check of Track " + q.track + ", in order: {\"id\": the check number as a string, \"result\": \"YES\" | \"NO\" | \"N/A\" (N/A only for Track A check 11 when no calculation is asked), \"evidence\": the candidate's exact words, or why the check fails}. The engine applies the gate of every NO to the marks, so judge each check strictly.",
    "- \"anchor_count\": Track A check 6 as a number - specific, ACCURATE data points, reports, committees or schemes (for pure management / OB questions: named theories and real cases) stated WITH their function; bare name-drops and wrong facts do not count. 0 for Tracks B, C and D.",
    "- \"off_topic\": true only if the script does not answer this question at all.",
    "- \"anchors_used\": the high-value data, reports, committees or theorists actually used.",
    "- \"bare_name_drops\": items mentioned without their function, target or link.",
    "- \"missing_anchors\": exactly 5 specific reports, committees, schemes, datasets or theories that would lift this answer. Name only ones you are sure exist.",
    "- \"verify_flags\": recent figures you tagged [VERIFY LATEST FIGURE]. A figure you merely cannot confirm goes ONLY here, never in factual_errors.",
    "- \"factual_errors\": every PROVABLY wrong fact, figure, date, name, committee or report: {\"quote\": the candidate's exact words, \"problem\": what is wrong, \"correct_fact\": the correct fact}.",
    "- \"concept_gaps\": up to 5 concepts of this topic you got wrong, confused or left out, one short line each. Missing reports or committees belong in missing_anchors instead.",
    "- \"error_log\": up to 10 mark-relevant errors (content, logic, structure and recurring language patterns): {\"quote\": the candidate's exact words, \"code\": \"RP-1\" to \"RP-8\" (or \"TYPO\" for a no-penalty slip), \"problem\": what is wrong, \"correction\": the corrected wording or fact}.",
    "- \"caps_triggered\": the evidence-gate caps you applied, e.g. \"P3 capped at 20% - no data\" ([] if none).",
    "- \"parameters\": one item per parameter, in order (" + ids + "): {\"id\": \"P1\", \"cap_applied\": \"\" or e.g. \"45% - sub-part missed\", \"awarded\": marks in 0.25 steps, never above that parameter's maximum, \"justification\": the evidence for the mark, \"lost\": the specific reasons the mark is below that parameter's maximum, one short line each, naming what was missing or wrong and what would have earned the mark ([] when awarded equals the maximum)}.",
    "- \"penalties\": every Stage-2 deduction: {\"code\": \"RP-1\" to \"RP-8\", \"trigger\": the exact trigger found in the script, \"quote\": the candidate's exact words that triggered it, copied character for character (\"\" when the trigger is not a passage, such as the word count)}. The engine sets the deduction values from the table.",
    "- \"stage1_raw_sum\", \"total_penalties\", \"final_score\": numbers, where final_score = max(0, stage1_raw_sum - total_penalties).",
    "- \"merit_check\": the blunt two-line merit-list reality check (Section 5).",
    "- \"pacing_audit\": word count %, time used, words per minute and any speed risk (1-3 sentences).",
    "Rules: marks are JSON numbers in 0.25 steps. Strings are plain text (no markdown, no ** markers). Write comments and justifications to the candidate as \"you\". Quote the candidate character for character (RULE 7). Never invent errors, but do not skip real ones.",
    RULE
  ].join("\n");
}

function scoreContract(q) {
  const ids = R.paramMaxima(q.track, q.marks).map(p => p.id).join(", ");
  return [
    RULE,
    "#  OUTPUT CONTRACT - SCORE-ONLY CROSS-CHECK (overrides the presentation format above)",
    RULE,
    "This is an independent cross-check of the marks only; the feedback is written separately. Carry out the full evaluation exactly as written above (fixed engine settings, evidence gates, caps, red-pen penalties, calibration bands, arithmetic lock), then return ONE JSON object with ONLY these keys:",
    "- \"checklist\": one entry per FIXED MARKING CHECKLIST point, in order: {\"id\": \"K1\", \"coverage\": \"full\" | \"partial\" | \"missing\", \"quote\": the candidate's exact words that cover it (at most 12 words), or \"\"}.",
    "- \"subparts\": one entry per FIXED SUB-PART, in order: {\"id\": \"S1\", \"coverage\": \"DEEP & BALANCED\" | \"TEXTBOOK ONLY\" | \"SUPERFICIAL\" | \"MISSED\"}.",
    "- \"examiner_checks\": every STAGE 1B check of Track " + q.track + ", in order: {\"id\": the check number as a string, \"result\": \"YES\" | \"NO\" | \"N/A\", \"evidence\": at most 10 words}. The engine applies the gate of every NO, so judge each check strictly.",
    "- \"anchor_count\": Track A check 6 as a number (specific, accurate sources stated with their function); 0 for Tracks B, C and D.",
    "- \"off_topic\": true only if the script does not answer this question at all.",
    "- \"parameters\": one item per parameter, in order (" + ids + "): {\"id\": \"P1\", \"awarded\": marks in 0.25 steps, never above the maximum, \"justification\": at most 12 words}.",
    "- \"penalties\": every Stage-2 deduction: {\"code\": \"RP-1\" to \"RP-8\", \"trigger\": at most 10 words}.",
    "- \"stage1_raw_sum\", \"total_penalties\", \"final_score\": numbers, where final_score = max(0, stage1_raw_sum - total_penalties).",
    "All marks are JSON numbers in 0.25 steps. No other keys, no prose, no markdown.",
    RULE
  ].join("\n");
}

function build(q, local, scheme, opts = {}) {
  const commandWords = (local && local.commandWords) || R.detectCommandWords(q.question);
  const filled = fillTemplate(EVAL_PROMPT_TEMPLATE, templateValues(q));
  const prompt = [filled, "", engineBlock(q, scheme, commandWords), "", opts.full ? fullContract(q) : scoreContract(q)].join("\n");
  return { system: SYSTEM, prompt, schema: opts.full ? FULL_SCHEMA : SCORE_SCHEMA };
}

function normCode(code) {
  const s = String(code || "").toUpperCase();
  const m = s.match(/RP\s*-?\s*([1-8])/);
  if (m) return "RP-" + m[1];
  if (/TYPO/.test(s)) return "TYPO";
  return s.trim().slice(0, 12);
}

function normCoverage(v) {
  const s = String(v || "").toUpperCase();
  if (/DEEP|BALANCED|WELL/.test(s)) return "DEEP & BALANCED";
  if (/TEXTBOOK/.test(s)) return "TEXTBOOK ONLY";
  if (/SUPERFICIAL|PARTIAL|SHALLOW|WEAK/.test(s)) return "SUPERFICIAL";
  if (/MISS|ABSENT|NOT/.test(s)) return "MISSED";
  return "";
}

function normChecklistCoverage(v) {
  const s = String(v || "").toLowerCase().trim();
  return s === "full" || s === "partial" || s === "missing" ? s : "missing";
}

function pickParams(list, expected) {
  const out = [];
  expected.forEach((p, i) => {
    let hit = list.find(x => String(x.id || "").trim().toUpperCase() === p.id);
    if (!hit) hit = list.find(x => new RegExp("^" + p.id + "\\b", "i").test(String(x.name || x.parameter || x.id || "").trim()));
    if (!hit && list.length === expected.length && !list.some(x => /^P\d/i.test(String(x.id || x.name || "")))) hit = list[i];
    if (!hit) throw new AIError("format", "The reply had no mark for " + p.id + ".");
    const awarded = num(hit.awarded != null ? hit.awarded : (hit.marks_awarded != null ? hit.marks_awarded : hit.score));
    if (awarded === null) throw new AIError("format", "The reply had no mark for " + p.id + ".");
    out.push({ id: p.id, name: p.name, max: p.max, awarded: clamp(snap4(awarded), 0, p.max), modelCap: str(hit.cap_applied || hit.cap, 300), why: str(hit.justification || hit.reason || hit.comment, 1500), lost: strList(hit.lost, 6, 400) });
  });
  return out;
}

function normalize(obj, q, local, scheme, opts = {}) {
  if (!obj || typeof obj !== "object") throw new AIError("format", "The reply was not a JSON object.");
  const track = q.track;
  const script = plainText(q.answer);
  const params = pickParams(objList(obj.parameters, 12), R.paramMaxima(track, q.marks));
  const table = R.EXAMINER_CHECKS[track] || {};
  const checks = objList(obj.examiner_checks, 16).map(c => {
    const res = String(c.result != null ? c.result : c.pass).trim().toUpperCase();
    return {
      id: Number(String(c.id || "").replace(/[^0-9]/g, "")) || 0,
      pass: /^(YES|TRUE|PASS)/.test(res) ? true : /^(NO|FALSE|FAIL)/.test(res) ? false : null,
      evidence: str(c.evidence || c.reason, 600)
    };
  }).filter(c => table[c.id]);
  const rawAnchor = num(obj.anchor_count);
  const anchorCount = track === "A" ? (rawAnchor === null ? null : Math.max(0, Math.round(rawAnchor))) : 0;
  const offTopic = obj.off_topic === true || /^(?:true|yes)$/i.test(String(obj.off_topic || "").trim());
  const penalties = objList(obj.penalties, 20)
    .map(p => ({ code: normCode(p.code), trigger: str(p.trigger || p.reason || p.detail, 600), quote: (q => (q && quoteInScript(q, script) ? q : ""))(str(p.quote, 400)) }))
    .filter(p => /^RP-[1-8]$/.test(p.code));
  const gotChecklist = objList(obj.checklist, 20);
  const checklist = scheme ? scheme.points.map((p, i) => {
    const c = gotChecklist.find(x => String(x.id || "").trim().toUpperCase() === p.id) || gotChecklist[i] || {};
    const quote = str(c.quote, 400);
    let coverage = normChecklistCoverage(c.coverage);
    if (coverage === "full" && (!quote || !quoteInScript(quote, script))) coverage = "partial";
    return { id: p.id, coverage, quote };
  }) : [];
  const gotSubparts = objList(obj.subparts, 12);
  const subparts = scheme ? scheme.subparts.map((s, i) => {
    const c = gotSubparts.find(x => String(x.id || "").trim().toUpperCase() === s.id) || gotSubparts[i] || {};
    return { id: s.id, coverage: normCoverage(c.coverage), comment: str(c.comment || c.note, 600) };
  }) : [];
  const enforced = R.enforceRubric({ track, marks: q.marks, wordLimit: q.wordLimit, words: q.words, params, checks, anchorCount, penalties, offTopic });
  const fs = R.finalScore({ track, marks: q.marks, params: enforced.params, penalties: enforced.penalties, autoFail: enforced.autoFail, offTopic });
  const run = {
    full: !!opts.full,
    params: enforced.params.map((p, i) => Object.assign({}, p, { why: params[i].why, modelCap: params[i].modelCap, lost: params[i].lost })),
    checks,
    anchorCount,
    offTopic,
    penalties: enforced.penalties,
    checklist,
    subparts,
    final: fs.score,
    modelFinal: num(obj.final_score),
    rules: enforced.rules
  };
  if (opts.full) {
    const inScript = quote => !!quote && quoteInScript(quote, script);
    Object.assign(run, {
      anchorsUsed: strList(obj.anchors_used, 12, 300),
      nameDrops: strList(obj.bare_name_drops, 12, 300),
      missingAnchors: strList(obj.missing_anchors, 8, 400),
      verifyFlags: strList(obj.verify_flags, 8, 300),
      factualErrors: objList(obj.factual_errors, 12)
        .map(x => ({ quote: str(x.quote, 500), problem: str(x.problem || x.issue, 600), fact: str(x.correct_fact || x.correction, 600) }))
        .filter(x => inScript(x.quote) && (x.problem || x.fact)),
      conceptGaps: strList(obj.concept_gaps, 6, 400),
      errorLog: objList(obj.error_log, 14)
        .map(x => ({ quote: str(x.quote, 600), code: normCode(x.code), problem: str(x.problem || x.issue, 600), correction: str(x.correction || x.fix, 800) }))
        .filter(x => inScript(x.quote) && (x.problem || x.correction)),
      caps: strList(obj.caps_triggered, 8, 300),
      meritCheck: str(obj.merit_check, 800),
      pacingAudit: str(obj.pacing_audit, 1200)
    });
  }
  return run;
}

module.exports = { name: "score", VERSION, SYSTEM, FULL_SCHEMA, SCORE_SCHEMA, build, normalize, normCode, normCoverage, templateValues, questionPromptText };
