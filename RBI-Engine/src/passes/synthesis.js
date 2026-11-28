"use strict";

const { str, strList, objList, round2, fmt } = require("../util");
const { AIError } = require("../ai");
const { PENALTY_LABELS } = require("../rubric");
const { S, SL, objSchema, listOf } = require("./common");

const VERSION = "y1";

const SYSTEM = "You write the final feedback summary for one RBI Grade B Phase-2 practice answer. You are direct, specific and encouraging without flattery. Reply with exactly one valid JSON object and nothing else.";

const SCHEMA = objSchema({
  summary: S,
  strengths: SL,
  priorities: listOf({ title: S, why: S, how: S }),
  drills: SL,
  plan: SL
});

const HOW = {
  A: [
    "Break the question into its parts before writing and give each part its own heading; obey the command word.",
    "Explain each point as a cause-and-effect chain with the correct technical terms.",
    "Add two or three specific reports, committees, schemes or data points, each with what it does.",
    "Use a short introduction, headed numbered points and a specific way forward.",
    "Write within 82-104% of the word limit in a sober third-person voice."
  ],
  B: [
    "Unpack the prompt in the first paragraph and state a clear thesis.",
    "Cover four or more dimensions and answer the strongest counter-view.",
    "Weave in concrete examples, data and recent developments.",
    "Write linked paragraphs with no bullets or headings, and close the loop at the end.",
    "Keep within 90-105% of the word limit in clear, varied sentences."
  ],
  C: [
    "Add a 3-8 word title that states the central idea.",
    "Keep every core argument of the passage and cut examples and repetition.",
    "Rewrite every idea in your own words; never copy five or more words in a row.",
    "Write one third-person paragraph with no opinion of your own.",
    "Stay within 92-105% of the word limit and check grammar."
  ],
  D: [
    "Take every answer from the passage and check each detail.",
    "Answer in your own words instead of copying sentences.",
    "Answer every sub-question in proportion to its weight.",
    "Write complete, grammatical sentences."
  ]
};

const HOW_PENALTY = {
  "RP-1": "Answer every part of the question; list the parts before you start writing.",
  "RP-2": "Replace slogans with a specific mechanism, scheme or institution.",
  "RP-3": "Whenever you name a scheme, report or theory, say what it does in the same sentence.",
  "RP-4": "Fix the format: headings and points for ESI/FM, continuous prose for an essay, one paragraph for a precis.",
  "RP-5": "Plan a word budget per section and stay inside the allowed band.",
  "RP-6": "Check facts, figures, dates and names before you use them, and leave out what you are not sure of.",
  "RP-7": "Paraphrase the passage in your own words and add no outside opinion.",
  "RP-8": "Keep a formal register and fix your repeated grammar patterns."
};

function marksLost(marks) {
  if (!marks) return [];
  const out = [];
  for (const p of marks.params || []) {
    const lost = round2(p.max - p.awarded);
    if (lost > 0) out.push({ kind: "parameter", id: p.id, what: p.name, lost });
  }
  const byCode = {};
  for (const p of marks.penalties || []) byCode[p.code] = round2((byCode[p.code] || 0) + p.deduction);
  for (const [code, total] of Object.entries(byCode)) out.push({ kind: "penalty", id: code, what: (PENALTY_LABELS[code] || code) + " (" + code + ")", lost: total });
  return out.sort((a, b) => b.lost - a.lost || a.id.localeCompare(b.id));
}

function countBy(list, key) {
  const out = {};
  (list || []).forEach(x => { out[x[key]] = (out[x[key]] || 0) + 1; });
  return out;
}

function digestFor(q, local, marks, language, coach, mechanical) {
  const st = (local && local.stats) || {};
  const content = (marks && marks.content) || {};
  return {
    question: str(q.question, 1500),
    paper: q.paper,
    answerType: q.trackLabel,
    maxMarks: q.marks,
    wordLimit: q.wordLimit,
    words: q.words,
    minutes: q.seconds ? Math.round(q.seconds / 6) / 10 : null,
    score: marks ? marks.score : null,
    percent: marks ? marks.percent : null,
    grade: marks ? marks.grade + " (" + marks.gradeLabel + ")" : null,
    realExamProjection: marks && marks.projection ? marks.projection.join(" to ") : null,
    marksLost: marksLost(marks).slice(0, 8).map(l => ({ what: l.what.replace(/\s*\(RP-\d\)$/, ""), lost: l.lost })),
    engineRules: marks ? marks.rules : [],
    failedChecks: marks ? marks.checks.filter(c => c.pass === false).map(c => c.label) : [],
    notFullyCovered: marks ? marks.checklist.filter(c => c.coverage !== "full").map(c => ({ point: c.point, weight: c.weight, coverage: c.coverage })) : [],
    subparts: marks ? marks.subparts.map(s => ({ part: s.part, coverage: s.coverage })) : [],
    conceptGaps: content.conceptGaps || [],
    factualErrors: (content.factualErrors || []).slice(0, 4).map(f => f.problem),
    missingSources: (content.missingAnchors || []).slice(0, 5),
    language: language ? {
      total: language.issues.length,
      per100Words: language.per100,
      byType: language.byType,
      examples: language.issues.filter(i => i.severity === "major").slice(0, 6).map(i => i.wrong + " -> " + i.fix),
      style: language.style ? { verdict: language.style.verdict, score: language.style.score } : null
    } : null,
    mechanical: countBy(mechanical, "kind"),
    structure: coach ? {
      framing: coach.framing,
      weakSections: (coach.outlineMatch || []).filter(o => o.status === "missing" || o.status === "weak").map(o => o.section + " (" + o.status + ")"),
      introShare: st.introShare === undefined ? null : st.introShare,
      conclusionShare: st.conclusionShare === undefined ? null : st.conclusionShare,
      hasConclusion: !!st.hasConclusion
    } : null
  };
}

function build(digest) {
  const prompt = [
    "Below is the engine's complete analysis of one practice answer. The marks are already final. Turn the analysis into the candidate's action plan.",
    "Use only what the analysis says: do not re-grade, do not change any mark, and do not mention rubric codes (no \"RP-3\", no \"P2\", no \"Track A\"). Write to the candidate as \"you\", in plain, short sentences.",
    "",
    "Return one JSON object with these keys:",
    "- \"summary\": 3-4 sentences: what this mark means, the one or two biggest reasons marks were lost, and the single most important fix.",
    "- \"strengths\": 2-4 specific things this answer did well ([] if none).",
    "- \"priorities\": 3-5 fixes ranked by how many marks they would recover, most first: {\"title\": the fix in a few words, \"why\": what it costs now, with the marks if known, \"how\": exactly how to do it in the next answer}.",
    "- \"drills\": exactly 3 drills for tomorrow: (1) a concept to repair, (2) a report, committee, scheme or data point to learn, (3) a structure, pacing or language habit to practise under a timer.",
    "- \"plan\": 5-8 specific steps for the next answers, most important first.",
    "",
    "ANALYSIS (JSON):",
    JSON.stringify(digest, null, 2)
  ].join("\n");
  return { system: SYSTEM, prompt, schema: SCHEMA };
}

function stripCodes(s) {
  return String(s || "")
    .replace(/\s*\((?:RP-\d|P[1-5]|Track [A-D])\)/g, "")
    .replace(/\b(?:RP-\d|P[1-5])\b\s*/g, "")
    .replace(/\bTrack [A-D]\b\s*/g, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalize(obj) {
  const o = obj && typeof obj === "object" ? obj : {};
  const summary = stripCodes(str(o.summary, 1500));
  if (!summary) throw new AIError("format", "The summary was empty.");
  return {
    summary,
    strengths: strList(o.strengths, 4, 400).map(stripCodes),
    priorities: objList(o.priorities, 10)
      .map(x => ({ title: stripCodes(str(x.title, 160)), why: stripCodes(str(x.why, 500)), how: stripCodes(str(x.how, 700)) }))
      .filter(x => x.title)
      .slice(0, 5),
    drills: strList(o.drills, 3, 500).map(stripCodes),
    plan: strList(o.plan, 8, 500).map(stripCodes),
    fallback: false
  };
}

function fallbackCoaching(q, marks, language, coach) {
  const lost = marksLost(marks);
  const how = (l) => (l.kind === "penalty" ? HOW_PENALTY[l.id] : (HOW[q.track] || HOW.A)[Number(l.id.slice(1)) - 1]) || "";
  const summary = marks
    ? "You scored " + fmt(marks.score) + " / " + q.marks + " (" + marks.percent + "%, grade " + marks.grade + " - " + marks.gradeLabel + ")." +
      (lost.length ? " Most marks were lost on " + lost.slice(0, 2).map(l => l.what.toLowerCase().replace(/\s*\(rp-\d\)$/, "") + " (" + fmt(l.lost) + ")").join(" and ") + "." : "") +
      " Work on the priorities below first."
    : "The marks could not be computed this time. The language and structure feedback below still applies.";
  const plan = [];
  if (language && language.issues.length) {
    const top = Object.entries(language.byType).sort((a, b) => b[1] - a[1])[0];
    if (top) plan.push("Your most frequent language error is " + top[0] + " (" + top[1] + " times). Reread every answer once for that error alone.");
  }
  if (coach && coach.outlineMatch) {
    const weak = coach.outlineMatch.filter(o => o.status === "missing" || o.status === "weak").map(o => o.section);
    if (weak.length) plan.push("Plan the answer with these sections before typing: " + weak.join("; ") + ".");
  }
  return {
    summary,
    strengths: [],
    priorities: lost.slice(0, 3).map(l => ({ title: "Improve " + l.what.toLowerCase().replace(/\s*\(rp-\d\)$/, ""), why: "This cost you " + fmt(l.lost) + " mark" + (l.lost === 1 ? "" : "s") + ".", how: how(l) })),
    drills: [],
    plan,
    fallback: true
  };
}

module.exports = { name: "synthesis", VERSION, SYSTEM, SCHEMA, build, normalize, digestFor, marksLost, fallbackCoaching, stripCodes };
