"use strict";

const { str, strList, objList, num, clamp, round1, plainText, quoteInScript, isBritishVariant, onlyBritishChanges, findSpan } = require("../util");
const { S, N, SL, objSchema, listOf, oneOf } = require("./common");

const VERSION = "l1";

const TYPES = ["grammar", "tense", "agreement", "article", "preposition", "punctuation", "spelling", "capitalisation", "word choice", "word order", "sentence structure", "redundancy", "register"];

const SYSTEM = "You are a strict English language examiner for RBI Grade B Phase-2 descriptive scripts. You audit grammar, spelling, punctuation and style unit by unit and quote the candidate exactly. Reply with exactly one valid JSON object and nothing else.";

const SCHEMA = objSchema({
  issues: listOf({ unit: S, wrong: S, fix: S, type: oneOf(TYPES), rule: S, severity: oneOf(["major", "minor"]) }),
  style: objSchema({ verdict: oneOf(["RBI-ready", "Nearly there", "Not yet"]), score: N, assessment: S, issues: SL }),
  register: listOf({ quote: S, problem: S, better: S }),
  vocabulary: listOf({ used: S, better: S, why: S }),
  sentence_craft: listOf({ unit: S, problem: S, suggestion: S }),
  summary: S
});

const TRACK_RULE = {
  A: "Track A (ESI / FM): headings, numbered points and \"Lead-in:\" phrases may be fragments - do not report them as fragments (still check their spelling and grammar). The register must be sober, third-person and institutional.",
  B: "Track B (essay): the essay must be continuous prose, so report a fragment as a sentence-structure error. A measured first person is acceptable in an essay.",
  C: "Track C (precis): one paragraph in the third person; report first person and opinion as register errors.",
  D: "Track D (comprehension): answers must be complete sentences; report fragments as sentence-structure errors."
};

function build(q, units) {
  const lines = [
    "Audit the language of this candidate's script, unit by unit. The script is split into numbered units below ([S1], [S2] ...); the word in brackets after the id says whether the unit is a heading, a point or a sentence.",
    "",
    "Check EVERY unit for: grammar, tense, subject-verb agreement, articles, prepositions, punctuation, spelling, capitalisation, word choice and collocation, word order, sentence structure (run-on, fragment, faulty parallelism, dangling modifier), redundancy, and register (informal, emotional, or first person where this track does not allow it).",
    "",
    "RULES",
    "1. Quote exactly: \"wrong\" is copied character for character from that unit - the smallest span that contains the error (usually 1-8 words), with enough neighbouring words that it appears only once in the unit (for example \"a inflation\", not just \"a\"). Never quote text that is not in the unit.",
    "2. \"fix\" replaces exactly that span so the unit becomes correct. Keep the candidate's own words and meaning otherwise (a minimal edit). Style advice goes in \"vocabulary\", \"register\" or \"sentence_craft\", not in \"fix\".",
    "3. Indian/British spelling is correct (programme, labour, organisation, analyse, centre, defence, licence, behaviour, travelled, judgement), and so are lakh and crore. Never change them to American spelling.",
    "4. Standard abbreviations (RBI, GDP, CPI, MSME, NPA, CRR, SLR, MPC, FY24, Rs, per cent, %) are correct as written.",
    "5. " + (TRACK_RULE[q.track] || TRACK_RULE.A),
    "6. Report language only: no content, facts or marks.",
    "7. Never invent an error, and leave out units that are correct. Do not skip a real error, however small; list each occurrence separately even when the same mistake repeats.",
    "8. \"severity\": \"major\" when an examiner would notice it or it changes the meaning; \"minor\" for a small slip.",
    "",
    "Return one JSON object with these keys:",
    "- \"issues\": [{\"unit\": \"S2\", \"wrong\": the exact words, \"fix\": the replacement, \"type\": one of " + TYPES.join(", ") + ", \"rule\": the rule that is broken, in one plain sentence, \"severity\": \"major\" | \"minor\"}].",
    "- \"style\": {\"verdict\": \"RBI-ready\" | \"Nearly there\" | \"Not yet\", \"score\": 0-10 for how close the style is to a top RBI Grade B Phase-2 script of this track, \"assessment\": 3-5 sentences on tone, register, objectivity, clarity and analytical voice, \"issues\": each style problem in one line}.",
    "- \"register\": [{\"quote\": the exact words, \"problem\": why the tone or register is wrong, \"better\": exam-grade wording}].",
    "- \"vocabulary\": [{\"used\": the exact weak, vague or informal word or phrase, \"better\": an exam-grade replacement, \"why\": one short reason}] (up to 12).",
    "- \"sentence_craft\": [{\"unit\": \"S7\", \"problem\": for example too long, run-on, unclear, choppy, weak connector or needless passive, \"suggestion\": how to rewrite it, in one or two sentences}] (up to 8).",
    "- \"summary\": 2-3 sentences on the overall language quality, written to the candidate as \"you\".",
    "",
    "Paper: " + (q.paper || "Other") + " · Track " + q.track + " (" + q.trackLabel + ")",
    "",
    "SCRIPT UNITS:",
    ...units.map(u => "[" + u.id + "] (" + u.kind + ") " + u.text)
  ];
  return { system: SYSTEM, prompt: lines.join("\n"), schema: SCHEMA };
}

function normType(v) {
  const s = String(v || "").toLowerCase().trim();
  if (TYPES.includes(s)) return s;
  if (/capitali[sz]/.test(s)) return "capitalisation";
  if (/agree/.test(s)) return "agreement";
  if (/tense/.test(s)) return "tense";
  if (/article/.test(s)) return "article";
  if (/preposition/.test(s)) return "preposition";
  if (/punctu|comma|apostrophe|hyphen/.test(s)) return "punctuation";
  if (/spell|typo/.test(s)) return "spelling";
  if (/order/.test(s)) return "word order";
  if (/choice|colloc|usage|vocab|diction/.test(s)) return "word choice";
  if (/struct|syntax|run-on|fragment|parallel|modifier/.test(s)) return "sentence structure";
  if (/redund|repet|wordy/.test(s)) return "redundancy";
  if (/register|tone|style|informal|formal/.test(s)) return "register";
  return "grammar";
}

function normVerdict(v) {
  const s = str(v, 40);
  if (/ready|yes|meets|good/i.test(s) && !/not|near/i.test(s)) return "RBI-ready";
  if (/near|close|almost|partly|partial/i.test(s)) return "Nearly there";
  return s ? "Not yet" : "";
}

function unitId(v) {
  const m = String(v || "").toUpperCase().match(/S?\s*(\d+)/);
  return m ? "S" + Number(m[1]) : "";
}

function locate(units, byId, idHint, wrong, taken) {
  const tryUnit = (u) => {
    let from = 0;
    for (let guard = 0; guard < 20; guard++) {
      const span = findSpan(u.text, wrong, from);
      if (!span) return null;
      const abs = { start: u.start + span.start, end: u.start + span.end };
      if (!taken.some(t => t.start === abs.start && t.end === abs.end)) return { unit: u, span, abs };
      from = span.end;
    }
    return null;
  };
  const hinted = byId.get(idHint);
  return (hinted && tryUnit(hinted)) || units.reduce((hit, u) => hit || (u === hinted ? null : tryUnit(u)), null);
}

function normalize(obj, q, units) {
  const byId = new Map(units.map(u => [u.id, u]));
  const script = plainText(q.answer);
  const kept = [];
  let dropped = 0;
  for (const x of objList(obj && obj.issues, 300)) {
    const wrong = typeof x.wrong === "string" ? x.wrong.replace(/\r\n?/g, "\n").trim() : str(x.quote, 600);
    const fix = typeof x.fix === "string" ? x.fix.replace(/\r\n?/g, "\n").trim() : str(x.correction, 600);
    if (!wrong) { dropped++; continue; }
    const hit = locate(units, byId, unitId(x.unit), wrong, kept);
    if (!hit) { dropped++; continue; }
    const actual = hit.unit.text.slice(hit.span.start, hit.span.end);
    const type = normType(x.type);
    if (fix === actual || (type === "spelling" && isBritishVariant(actual, fix)) || onlyBritishChanges(actual, fix)) { dropped++; continue; }
    if (kept.some(k => hit.abs.start < k.end && k.start < hit.abs.end)) { dropped++; continue; }
    kept.push({
      unit: hit.unit.id,
      wrong: actual,
      fix,
      type,
      rule: str(x.rule || x.explanation, 500),
      severity: /^major$/i.test(String(x.severity || "").trim()) ? "major" : "minor",
      start: hit.abs.start,
      end: hit.abs.end
    });
  }
  kept.sort((a, b) => a.start - b.start);

  const unitsOut = [];
  for (const u of units) {
    const mine = kept.filter(k => k.unit === u.id);
    if (!mine.length) continue;
    const segments = [];
    let pos = u.start;
    for (const k of mine) {
      if (k.start > pos) segments.push({ t: "same", s: q.answer.slice(pos, k.start) });
      segments.push({ t: "del", s: k.wrong });
      if (k.fix) segments.push({ t: "ins", s: k.fix });
      pos = k.end;
    }
    if (pos < u.end) segments.push({ t: "same", s: q.answer.slice(pos, u.end) });
    unitsOut.push({ id: u.id, segments });
  }
  let text = q.answer;
  for (const k of kept.slice().reverse()) text = text.slice(0, k.start) + k.fix + text.slice(k.end);

  const byType = {};
  kept.forEach(k => { byType[k.type] = (byType[k.type] || 0) + 1; });
  const style = obj && obj.style && typeof obj.style === "object" ? obj.style : {};
  const score = num(style.score);
  return {
    issues: kept,
    byType,
    bySeverity: { major: kept.filter(k => k.severity === "major").length, minor: kept.filter(k => k.severity === "minor").length },
    per100: q.words ? round1(kept.length / q.words * 100) : 0,
    style: { verdict: normVerdict(style.verdict), score: score === null ? null : clamp(round1(score), 0, 10), assessment: str(style.assessment, 1500), issues: strList(style.issues, 10, 300) },
    register: objList(obj && obj.register, 12)
      .map(x => ({ quote: str(x.quote, 500), problem: str(x.problem, 500), better: str(x.better, 500) }))
      .filter(x => x.quote && quoteInScript(x.quote, script)),
    vocabulary: objList(obj && obj.vocabulary, 16)
      .map(x => ({ used: str(x.used, 120), better: str(x.better, 160), why: str(x.why, 300) }))
      .filter(x => x.used && x.better && quoteInScript(x.used, script) && !onlyBritishChanges(x.used, x.better) && !isBritishVariant(x.used, x.better))
      .slice(0, 12),
    craft: objList(obj && obj.sentence_craft, 12)
      .map(x => ({ unit: unitId(x.unit), problem: str(x.problem, 200), suggestion: str(x.suggestion, 600) }))
      .filter(x => byId.has(x.unit) && (x.problem || x.suggestion))
      .slice(0, 8),
    summary: str(obj && obj.summary, 1000),
    corrected: { text, units: unitsOut },
    dropped
  };
}

module.exports = { name: "language", VERSION, SYSTEM, SCHEMA, TYPES, build, normalize, normType };
