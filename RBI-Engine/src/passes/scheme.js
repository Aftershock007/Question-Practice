"use strict";

const { str, strList, objList, num, clamp } = require("../util");
const { AIError } = require("../ai");
const { detectCommandWords } = require("../rubric");
const { S, N, SL, objSchema, listOf, clip, questionBlock, metaLine } = require("./common");

const VERSION = "s1";

const SYSTEM = "You write the fixed marking checklist for one RBI Grade B Phase-2 descriptive question, as a senior examiner would. Reply with exactly one valid JSON object and nothing else.";

const SCHEMA = objSchema({
  subparts: listOf({ part: S, expects: S }),
  points: listOf({ point: S, weight: N, subpart: N }),
  outline: listOf({ section: S, covers: S, share: N }),
  dimensions: SL
});

const OUTLINE_RULES = {
  A: "Track A (ESI / FM): ALL CAPS headings that mirror the sub-parts of the question, an INTRODUCTION of 10-15% and a WAY FORWARD / CONCLUSION of 10-15%.",
  B: "Track B (essay): the answer itself has no headings, so give the paragraph plan instead: opening hook and thesis, body paragraphs by dimension, a counter-view, and a conclusion that closes the loop.",
  C: "Track C (precis): the title, then one paragraph; list the core ideas of the passage in order.",
  D: "Track D (comprehension): one section per sub-question, in order."
};

function build(q) {
  const local = { commandWords: detectCommandWords(q.question) };
  const lines = [
    "Build the FIXED marking scheme for this question. It is used for every attempt at this question, so that marks stay consistent between attempts.",
    q.modelAnswer
      ? "Take the key points from the REFERENCE ANSWER below (the candidate's own base answer for this question) and from what the question explicitly asks. Do not add points that are not in the reference answer unless the question clearly demands them."
      : "No reference answer was given: list the points an RBI examiner expects for full marks. Use only facts you are sure of.",
    "",
    "Return one JSON object with these keys:",
    "- \"subparts\": 1-6 items, in the order of the question: {\"part\": short name of an explicit or implicit sub-part, \"expects\": what a full answer must do for it}.",
    "- \"points\": 5-12 items: {\"point\": one concrete, checkable sentence (a concept, cause, effect, figure, example, framework or recommendation), \"weight\": 3 = core to the question, 2 = important, 1 = supporting detail, \"subpart\": the number of the sub-part it belongs to, counting from 1}.",
    "- \"outline\": 3-8 sections in order: {\"section\": the heading exactly as the candidate should type it, \"covers\": what goes in this section, \"share\": percent of the word limit}. The shares add up to 100.",
    "- \"dimensions\": 2-8 angles an examiner expects to see (for example macroeconomic, regulatory, social, technological, global).",
    "",
    "Outline rule for this track: " + OUTLINE_RULES[q.track],
    "",
    metaLine(q, local),
    "",
    questionBlock(q)
  ];
  if (q.modelAnswer) lines.push("", "REFERENCE ANSWER:\n" + clip(q.modelAnswer, "reference answer"));
  return { system: SYSTEM, prompt: lines.join("\n"), schema: SCHEMA };
}

function defaultOutline(track) {
  if (track === "B") {
    return [
      { section: "Opening: hook and thesis", covers: "Unpack the prompt and state a clear thesis.", share: 12 },
      { section: "Body: four or more dimensions with evidence", covers: "Economic, social, governance, technological and global angles, each with an example.", share: 63 },
      { section: "Counter-view and synthesis", covers: "The strongest opposing view and how it is resolved.", share: 13 },
      { section: "Conclusion that closes the loop", covers: "Return to the opening idea with a forward-looking line.", share: 12 }
    ];
  }
  if (track === "C") {
    return [
      { section: "Title (3-8 words)", covers: "The central idea of the passage.", share: 2 },
      { section: "One paragraph in the third person", covers: "The central idea and every core argument in order, in your own words.", share: 98 }
    ];
  }
  if (track === "D") return [{ section: "Answer to each sub-question", covers: "Complete sentences, from the passage, in your own words.", share: 100 }];
  return [
    { section: "INTRODUCTION", covers: "A crisp definition, a recent data point or a policy hook.", share: 12 },
    { section: "MAIN BODY (ONE HEADING PER PART OF THE QUESTION)", covers: "Numbered points with lead-in phrases, mechanisms and specific evidence.", share: 73 },
    { section: "WAY FORWARD AND CONCLUSION", covers: "Specific, feasible institutional measures and a balanced closing line.", share: 15 }
  ];
}

function normalizeShares(list) {
  const valid = list.map(o => (o.share > 0 ? o.share : 0));
  const missing = valid.filter(v => !v).length;
  const known = valid.reduce((a, b) => a + b, 0);
  const fill = missing ? Math.max(1, (100 - Math.min(known, 99)) / missing) : 0;
  const raw = valid.map(v => v || fill);
  const total = raw.reduce((a, b) => a + b, 0);
  const scaled = raw.map(v => v * 100 / total);
  const floors = scaled.map(Math.floor);
  let rest = 100 - floors.reduce((a, b) => a + b, 0);
  const order = scaled.map((v, i) => [v - floors[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    floors[i]++;
    rest--;
  }
  return floors;
}

function withWords(outline, wordLimit) {
  const shares = normalizeShares(outline);
  const limit = Number(wordLimit) || 0;
  return outline.map((o, i) => ({
    id: "O" + (i + 1),
    section: o.section,
    covers: o.covers,
    share: shares[i],
    words: limit ? Math.round(shares[i] / 100 * limit) : 0
  }));
}

function normalize(obj, q) {
  let subparts = objList(obj && obj.subparts, 10)
    .map(s => ({ part: str(s.part || s.name, 200), expects: str(s.expects || s.expectation || s.description, 500) }))
    .filter(s => s.part)
    .slice(0, 6);
  if (!subparts.length) subparts = [{ part: "Main question", expects: "Answer the question exactly as asked." }];
  subparts = subparts.map((s, i) => Object.assign({ id: "S" + (i + 1) }, s));
  const points = objList(obj && (obj.points || obj.key_points), 20)
    .map(p => ({
      point: str(p.point || p.text, 300),
      weight: clamp(Math.round(num(p.weight) || 1), 1, 3),
      subpart: num(p.subpart)
    }))
    .filter(p => p.point)
    .slice(0, 12);
  if (points.length < 2) throw new AIError("format", "The marking checklist had fewer than 2 points.");
  const outlineRaw = objList(obj && obj.outline, 10)
    .map(o => ({ section: str(o.section || o.heading, 160), covers: str(o.covers || o.content, 500), share: num(o.share) || 0 }))
    .filter(o => o.section)
    .slice(0, 8);
  return {
    subparts,
    points: points.map((p, i) => ({
      id: "K" + (i + 1),
      point: p.point,
      weight: p.weight,
      subpart: "S" + (p.subpart >= 1 && p.subpart <= subparts.length ? Math.round(p.subpart) : 1)
    })),
    outline: withWords(outlineRaw.length ? outlineRaw : defaultOutline(q.track), q.wordLimit),
    dimensions: strList(obj && obj.dimensions, 8, 120)
  };
}

module.exports = { name: "scheme", VERSION, SYSTEM, SCHEMA, build, normalize, defaultOutline, withWords };
