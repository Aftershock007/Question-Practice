"use strict";

const { snap4, floor4, round1, round2, sum, clamp, fmt } = require("./util");

const TRACK_LABELS = {
  A: "ESI / Finance & Management answer",
  B: "English essay",
  C: "English precis",
  D: "Reading comprehension"
};

const PARAM_NAMES = {
  A: ["Directive compliance & scope", "Conceptual clarity & mechanisms", "Evidence: reports, committees, data", "Structure & presentation", "Register & word discipline"],
  B: ["Thesis & prompt unpacking", "Multi-dimensional analysis", "Evidence & contemporary anchoring", "Essay architecture & cohesion", "Language & word band"],
  C: ["Title", "Central idea & compression", "Paraphrasing (no lifting)", "One paragraph, third person", "Word limit & grammar"],
  D: ["Passage fidelity & accuracy", "Paraphrasing", "Sub-part completeness", "Grammar & complete sentences"]
};

const PARAM_BASE = {
  A: { 10: [2, 2.5, 2.5, 2, 1], 15: [3, 4, 4, 2.5, 1.5] },
  B: { 40: [8, 10, 8, 8, 6] },
  C: { 30: [3, 10, 7, 5, 5] },
  D: { 30: [12, 7.5, 6, 4.5] }
};

const PARAM_SHARES = {
  A: [0.2, 0.25, 0.25, 0.2, 0.1],
  B: [0.2, 0.25, 0.2, 0.2, 0.15],
  C: [0.1, 1 / 3, 7 / 30, 1 / 6, 1 / 6],
  D: [0.4, 0.25, 0.2, 0.15]
};

const PENALTY_LABELS = {
  "RP-1": "Missing sub-part",
  "RP-2": "Platitude / fluff",
  "RP-3": "Bare name-drop",
  "RP-4": "Structure problem",
  "RP-5": "Word limit / pacing",
  "RP-6": "Factual or logic error",
  "RP-7": "Lifting / outside info",
  "RP-8": "Language / register",
  "TYPO": "Typing slip (no penalty)"
};

const PENALTY_TABLE = {
  "RP-1": { m10: 0.75, m15: 1.25, m30: 2.5, most: 4 },
  "RP-2": { m10: 0.25, m15: 0.25, m30: 0.5, most: 3 },
  "RP-3": { m10: 0.25, m15: 0.25, m30: 0.5, most: 3 },
  "RP-4": { m10: 0.75, m15: 1.25, m30: 2.5, most: 1 },
  "RP-5": { m10: 0.5, m15: 0.75, m30: 1.5, most: 1 },
  "RP-6": { m10: 1.0, m15: 1.25, m30: 2.0, most: 4 },
  "RP-7": { m10: 0, m15: 0, m30: 1.0, most: 4 },
  "RP-8": { m10: 0.25, m15: 0.25, m30: 0.5, most: 3 }
};

const WORD_BANDS = { A: [[82, 104], [72, 112]], B: [[90, 105], [80, 112]], C: [[92, 105], [86, 110]] };

const EXAMINER_CHECKS = {
  A: {
    1: ["Every sub-part answered", [1, 0.45]],
    2: ["Command word obeyed", [1, 0.45]],
    3: ["At least 70% answers this question", [1, 0.45]],
    4: ["Domain terms and cause-effect mechanics", [2, 0.35]],
    5: ["Indian context", [2, 0.55]],
    6: ["Specific sources stated with their function", null],
    7: ["A recent development used correctly", [3, 0.63]],
    8: ["Headings / numbered points, not a wall of text", [4, 0.35]],
    9: ["A specific, feasible way forward", [4, 0.55]],
    10: ["Sober third-person institutional register", null],
    11: ["Calculation: correct formula, working and answer", [2, 0.45]]
  },
  B: {
    1: ["Prompt unpacked into a clear thesis", [1, 0.45]],
    2: ["4+ dimensions with counter-arguments", null],
    3: ["Concrete examples and evidence", null],
    4: ["Continuous prose, no bullets or headings", [4, 0.35]],
    5: ["Opening hook and a closing loop", null],
    6: ["Grammatically sound, clear prose", null]
  },
  C: {
    1: ["A 3-8 word title", [1, 0.33]],
    2: ["Every core idea retained", null],
    3: ["No 5+ word verbatim lifts", [3, 0.35]],
    4: ["One third-person paragraph, no opinion", [4, 0.30]]
  },
  D: {
    1: ["Every sub-question answered", null],
    2: ["Answers from the passage only", null],
    3: ["In the candidate's own words", [2, 0.30]],
    4: ["Complete sentences", null]
  }
};

const GRADES = [
  { grade: "A", min: 52, label: "AIR Top-10 ready" },
  { grade: "B", min: 42, label: "Strong selection zone" },
  { grade: "C", min: 32, label: "Borderline / cutoff zone" },
  { grade: "D", min: 20, label: "Below cutoff" },
  { grade: "F", min: 0, label: "Fail zone" }
];

const COMMANDS = [
  { re: /\bcritically\s+(examine|analy[sz]e|evaluate|discuss|assess|comment)\b/gi, word: m => "critically " + m[1].toLowerCase().replace("analyze", "analyse"), demand: "A balanced answer: drivers or merits (about 40%), risks and trade-offs (about 40%) and a specific way forward (about 20%). A one-sided answer is capped at 45% on scope." },
  { re: /\bexamine\b/gi, word: "examine", demand: "Probe the issue in depth: causes, effects and evidence, ending with a clear judgement." },
  { re: /\banaly[sz]e\b/gi, word: "analyse", demand: "Break the issue into its parts and show how they interact, with evidence." },
  { re: /\bdiscuss\b/gi, word: "discuss", demand: "Cover several dimensions: macroeconomic, institutional or regulatory, social, technological and global." },
  { re: /\belucidate\b/gi, word: "elucidate", demand: "Explain clearly with examples, covering several dimensions." },
  { re: /\bevaluate\b/gi, word: "evaluate", demand: "Give an explicit judgement backed by evidence." },
  { re: /\bassess\b/gi, word: "assess", demand: "Weigh the evidence on both sides and state a clear judgement." },
  { re: /\b(?:suggest|recommend|propose)\b|\bway\s+forward\b|\bmeasures\b|\bremed(?:y|ies)\b/gi, word: "suggest measures", demand: "Concrete RBI, SEBI or Government mechanisms (Master Directions, sandboxes, fiscal rules, supervisory tools), not slogans such as 'create awareness'." },
  { re: /\bexplain\b/gi, word: "explain", demand: "Define the concept and explain the mechanism: cause and effect." },
  { re: /\bdescribe\b/gi, word: "describe", demand: "Describe the main features clearly and in a logical order." },
  { re: /\b(?:distinguish|differentiate|compare|contrast)\b/gi, word: "compare", demand: "A point-by-point comparison on the same parameters, ending with a one-line verdict." },
  { re: /\b(?:comment|justify)\b/gi, word: "comment", demand: "Give a reasoned view backed by evidence." },
  { re: /\b(?:enumerate|list|outline|highlight|identify)\b/gi, word: "outline", demand: "List the main points clearly, each with a one-line explanation." },
  { re: /\bdefine\b|\bwhat\s+(?:is|are|do\s+you\s+(?:mean|understand))\b|\bmeaning\s+of\b|\bconcept\s+of\b/gi, word: "define", demand: "Open with a precise definition before going further." },
  { re: /\bhow\b/gi, word: "how", demand: "Explain the process or mechanism step by step." },
  { re: /\bwhy\b/gi, word: "why", demand: "Give the reasons, each with its cause and effect." },
  { re: /\bessay\b/gi, word: "essay", demand: "Continuous prose: a hook, a thesis, several dimensions with a counter-view, and a conclusion that closes the loop." },
  { re: /\bpr[eé]cis\b/gi, word: "precis", demand: "A 3-8 word title and one third-person paragraph of about one-third of the passage, in your own words." }
];

function normalizePaper(s) {
  const t = String(s || "").trim().toLowerCase();
  if (!t) return "Other";
  if (/\besi\b|economic|social issues|paper\s*(?:1|i)\b/.test(t)) return "ESI";
  if (/\bf\s*&\s*m\b|\bfm\b|finance|management|paper\s*(?:3|iii)\b/.test(t)) return "FM";
  if (/english|\beng\b|paper\s*(?:2|ii)\b/.test(t)) return "English";
  return "Other";
}

function parseTrack(s) {
  const t = String(s || "").trim().toLowerCase();
  if (!t) return "";
  if (/^(?:a|track\s*a|esi|fm|f&m|esi\s*\/\s*fm|structured)$/.test(t)) return "A";
  if (/^(?:b|track\s*b|essay)$/.test(t)) return "B";
  if (/^(?:c|track\s*c|pr[eé]cis)$/.test(t)) return "C";
  if (/^(?:d|track\s*d|rc|comprehension|reading\s+comprehension)$/.test(t)) return "D";
  return "";
}

const RC_RE = /\b(?:comprehension|read the (?:following |given |above )?passage|based on the (?:above |given |following )?passage|according to the passage|from the passage|in the passage|the passage (?:above|below|given))\b/;

function detectTrack({ paper, question, passage, track } = {}) {
  const forced = parseTrack(track);
  if (forced) return forced;
  const key = normalizePaper(paper);
  if (key === "ESI" || key === "FM") return "A";
  const q = (String(question || "") + " " + String(passage || "")).toLowerCase();
  if (/\bpr[eé]cis\b/.test(q)) return "C";
  const rc = RC_RE.test(q);
  if (key === "English") return rc ? "D" : "B";
  if (/\bessay\b/.test(q)) return "B";
  return rc ? "D" : "A";
}

function detectCommandWords(question) {
  const q = String(question || "");
  const hits = [];
  COMMANDS.forEach((c, order) => {
    c.re.lastIndex = 0;
    let m;
    while ((m = c.re.exec(q))) {
      hits.push({ start: m.index, end: m.index + m[0].length, word: typeof c.word === "function" ? c.word(m) : c.word, demand: c.demand, order });
      if (!m[0].length) c.re.lastIndex++;
    }
  });
  hits.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || a.order - b.order);
  const taken = [];
  const out = [];
  for (const h of hits) {
    if (taken.some(t => h.start < t.end && t.start < h.end)) continue;
    taken.push(h);
    if (!out.some(o => o.word === h.word)) out.push({ word: h.word, demand: h.demand });
  }
  return out;
}

function paramMaxima(track, marks) {
  const m = Number(marks);
  const base = PARAM_BASE[track] && PARAM_BASE[track][m];
  const values = base ? base.slice() : PARAM_SHARES[track].map(s => snap4(s * m));
  const diff = round2(m - sum(values));
  if (Math.abs(diff) > 1e-9) {
    const i = values.indexOf(Math.max(...values));
    values[i] = round2(values[i] + diff);
  }
  return values.map((max, i) => ({ id: "P" + (i + 1), name: PARAM_NAMES[track][i], max }));
}

function penaltyValue(code, marks, track) {
  const t = PENALTY_TABLE[code];
  if (!t) return null;
  const m = Number(marks);
  if (code === "RP-7") {
    if (track !== "C" && track !== "D") return 0;
    if (m === 30 || m === 40) return t.m30;
    return Math.max(0.25, snap4(t.m30 * m / 30));
  }
  if (m === 10) return t.m10;
  if (m === 15) return t.m15;
  if (m === 30 || m === 40) return t.m30;
  return Math.max(0.25, snap4(t.m10 * m / 10));
}

function wordBand(track, words, limit) {
  const b = WORD_BANDS[track];
  if (!b || !(limit > 0)) return null;
  const pct = Math.round(words / limit * 100);
  if (pct >= b[0][0] && pct <= b[0][1]) return "full";
  if (pct >= b[1][0] && pct <= b[1][1]) return "half";
  return "zero";
}

function checkList(checks) {
  if (Array.isArray(checks)) return checks;
  if (checks && typeof checks === "object") return Object.keys(checks).map(id => ({ id: Number(id), pass: checks[id] }));
  return [];
}

function enforceRubric(input) {
  const { track, marks, wordLimit, words, anchorCount, offTopic } = input;
  const rules = [];
  const params = (input.params || []).map(p => {
    const awarded = clamp(snap4(Number(p.awarded) || 0), 0, p.max);
    return Object.assign({}, p, { awarded, cap: "" });
  });
  const capParam = (no, share, why) => {
    const p = params[no - 1];
    if (!p || !(p.max > 0)) return;
    const ceiling = floor4(p.max * share);
    const note = Math.round(share * 100) + "% - " + why;
    p.cap = p.cap ? p.cap + "; " + note : note;
    if (p.awarded > ceiling + 1e-9) {
      rules.push("P" + no + " limited to " + fmt(ceiling) + " / " + fmt(p.max) + " (" + Math.round(share * 100) + "% cap): " + why + ".");
      p.awarded = ceiling;
    }
  };
  const table = EXAMINER_CHECKS[track] || {};
  for (const c of checkList(input.checks)) {
    const def = table[Number(c.id)];
    if (def && def[1] && c.pass === false) capParam(def[1][0], def[1][1], "check failed: " + def[0].charAt(0).toLowerCase() + def[0].slice(1));
  }
  if (track === "A" && typeof anchorCount === "number") {
    if (anchorCount <= 0) capParam(3, 0.20, "no specific report, committee, scheme or data");
    else if (anchorCount === 1) capParam(3, 0.45, "only one specific source");
  }
  const band = wordBand(track, words, wordLimit);
  const pct = wordLimit > 0 ? Math.round(words / wordLimit * 100) : 0;
  if (band === "half") capParam(5, 0.5, "word count " + words + " of " + wordLimit + " (" + pct + "%)");
  if (band === "zero") capParam(5, 0, "word count " + words + " of " + wordLimit + " (" + pct + "%)");

  let penalties = (input.penalties || []).map(p => ({ code: p.code, trigger: String(p.trigger || ""), quote: String(p.quote || "") }));
  const hasRp5 = penalties.some(p => p.code === "RP-5");
  if (band === "zero" && !hasRp5) {
    penalties.push({ code: "RP-5", trigger: "Word count " + words + " of " + wordLimit + " (" + pct + "% of the limit)", quote: "" });
    rules.push("RP-5 added: the word count is outside the allowed band.");
  } else if (band && band !== "zero" && hasRp5) {
    penalties = penalties.filter(p => p.code !== "RP-5");
    rules.push("RP-5 removed: " + pct + "% of the word limit is inside the allowed band.");
  } else if (!band && hasRp5 && !(track === "D" && wordLimit > 0)) {
    penalties = penalties.filter(p => p.code !== "RP-5");
    rules.push("RP-5 removed: no word limit applies to this answer.");
  }
  if ((track === "A" || track === "B") && penalties.some(p => p.code === "RP-7")) {
    penalties = penalties.filter(p => p.code !== "RP-7");
    rules.push("RP-7 removed: it applies only to precis and comprehension.");
  }
  const seen = {};
  const kept = [];
  let trimmed = false;
  for (const p of penalties) {
    const v = penaltyValue(p.code, marks, track);
    if (v === null || v === 0) { trimmed = true; continue; }
    seen[p.code] = (seen[p.code] || 0) + 1;
    if (seen[p.code] > PENALTY_TABLE[p.code].most) { trimmed = true; continue; }
    kept.push({ code: p.code, label: PENALTY_LABELS[p.code], trigger: p.trigger, quote: p.quote, deduction: v });
  }
  if (trimmed) rules.push("Penalties limited to the rubric's codes and maximum instances (RP-2, RP-3 and RP-8 count at most 3 times).");

  const autoFail = (track === "A" || track === "B") && words < 60;
  if (autoFail) rules.push("Under 60 words: the rubric gives 0 marks.");
  if (offTopic) rules.push("Off-topic answer: the rubric gives 0 marks.");
  return { params, penalties: kept, rules, autoFail };
}

function ceilingFor(track, marks) {
  const m = Number(marks);
  if (track === "A") return m === 10 ? 6.25 : m === 15 ? 9.5 : floor4(m * 0.63);
  if (track === "B") return m === 40 ? 28.5 : floor4(m * 0.7125);
  return m === 30 ? 22.5 : floor4(m * 0.75);
}

function gradeFor(percent) {
  return GRADES.find(g => percent >= g.min) || GRADES[GRADES.length - 1];
}

function projectionFor(score, max) {
  let lo;
  let hi;
  if (max >= 25) { lo = 3.5; hi = 5.5; }
  else if (max >= 10) { lo = 2; hi = 3; }
  else { lo = 2 * max / 10; hi = 3 * max / 10; }
  return [round2(Math.min(max, score + lo)), round2(Math.min(max, score + hi))];
}

function finalScore({ track, marks, params, penalties, autoFail, offTopic }) {
  const rawSum = round2(sum((params || []).map(p => p.awarded)));
  const penaltySum = round2(sum((penalties || []).map(p => p.deduction)));
  const beforeCeiling = Math.max(0, round2(rawSum - penaltySum));
  const ceiling = ceilingFor(track, marks);
  let score = Math.min(beforeCeiling, ceiling);
  const ceilingApplied = beforeCeiling > ceiling + 1e-9;
  const zero = !!(autoFail || offTopic);
  if (zero) score = 0;
  score = clamp(snap4(score), 0, marks);
  const percent = round1(score / marks * 100);
  const g = gradeFor(percent);
  return {
    rawSum, penaltySum, beforeCeiling, ceiling, ceilingApplied: ceilingApplied && !zero,
    score, percent, grade: g.grade, gradeLabel: g.label,
    projection: zero ? null : projectionFor(score, marks)
  };
}

function defaultMarks(track, wordLimit) {
  if (track === "B") return 40;
  if (track === "C" || track === "D") return 30;
  return Number(wordLimit) >= 500 ? 15 : 10;
}

function defaultWordLimit(track, marks, passageWords) {
  if (track === "A") return Number(marks) === 15 ? 600 : 400;
  if (track === "B") return 600;
  if (track === "C") return Number(passageWords) > 0 ? Math.max(50, Math.round(passageWords / 3 / 10) * 10) : 200;
  return 0;
}

function idealMinutes(track, marks) {
  const m = Number(marks);
  if (track === "B") return [32, 35];
  if (track === "C" || track === "D") return [25, 28];
  if (m === 10) return [15, 17];
  if (m === 15) return [22, 25];
  return [Math.round(m * 1.5), Math.round(m * 1.7)];
}

module.exports = {
  TRACK_LABELS, PARAM_NAMES, PENALTY_LABELS, PENALTY_TABLE, WORD_BANDS, EXAMINER_CHECKS, GRADES,
  normalizePaper, parseTrack, detectTrack, detectCommandWords, paramMaxima, penaltyValue, wordBand,
  enforceRubric, finalScore, ceilingFor, gradeFor, projectionFor, defaultMarks, defaultWordLimit, idealMinutes
};
