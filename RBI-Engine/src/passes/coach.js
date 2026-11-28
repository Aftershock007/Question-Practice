"use strict";

const { str, strList, objList, plainText, quoteInScript } = require("../util");
const { countWords } = require("../text");
const { S, SL, objSchema, listOf, oneOf, clip, questionBlock, metaLine } = require("./common");

const VERSION = "c1";

const SYSTEM = "You are an RBI Grade B Phase-2 answer-writing mentor. You show candidates exactly how to frame their answer better: structure, flow, introduction, conclusion and wording. Reply with exactly one valid JSON object and nothing else.";

const SCHEMA = objSchema({
  framing: S,
  outline_match: listOf({ id: S, status: oneOf(["covered", "weak", "missing"]), comment: S }),
  introduction: objSchema({ assessment: S, rewrite: S }),
  conclusion: objSchema({ assessment: S, rewrite: S }),
  paragraphs: listOf({ id: S, assessment: S, fix: S }),
  headings: objSchema({ assessment: S, suggested: SL }),
  flow: SL,
  value_additions: SL,
  rewrites: listOf({ before: S, after: S, why: S }),
  model_answer: S
});

const MODEL_RULES = {
  A: "a crisp data or definition introduction, ALL CAPS headings, numbered points with \"Lead-in:\" phrasing, one concise ASCII causal chain where natural, 2-3 verified RBI / Government / management citations, and a sharp WAY FORWARD",
  B: "cohesive multi-paragraph prose with no bullets or headings; if the prompt is a quote or metaphor, unpack it in paragraph 1 and close the loop at the end",
  C: "a crisp 3-8 word title, then one third-person paragraph in your own words (95-102% of the limit)",
  D: "crisp, paraphrased, complete-sentence answers, one per sub-question"
};

function structureLines(q, local) {
  const st = local.stats;
  const out = [];
  const limit = Number(q.wordLimit) || 0;
  out.push("- " + q.words + " words" + (limit ? " of " + limit + " (" + Math.round(q.words / limit * 100) + "%)" : "") + ", " + st.paragraphs + " paragraph(s), " + st.headings.length + " heading(s)" + (st.headings.length ? ": " + st.headings.join("; ") : "") + ", " + st.points + " numbered or bulleted point(s).");
  if (st.introShare !== null) out.push("- By paragraphs: introduction about " + st.introShare + "% of the words, body " + st.bodyShare + "%, conclusion " + st.conclusionShare + "%.");
  else out.push("- Introduction, body and conclusion cannot be measured (fewer than three blocks).");
  out.push("- A concluding paragraph (Conclusion / Way forward / In conclusion...) was " + (st.hasConclusion ? "found." : "not found."));
  out.push("- Average sentence length " + st.avgSentenceWords + " words" + (st.longest ? "; longest " + st.longest.words + " words." : "."));
  return out;
}

function build(q, local, scheme) {
  const limit = Number(q.wordLimit) || 0;
  const lines = [
    "Coach this candidate on how to FRAME the answer better for this exact question. Work only from the question, the candidate's script and the reference answer. Be specific: name the paragraph, quote the sentence and show the better version.",
    "",
    "FIXED OUTLINE FOR THIS QUESTION (the engine's ideal structure; the same for every attempt):",
    ...scheme.outline.map(o => o.id + " " + o.section + " (" + o.share + "%" + (o.words ? ", about " + o.words + " words" : "") + "): " + o.covers),
    "",
    "THE CANDIDATE'S STRUCTURE (measured by the engine):",
    ...structureLines(q, local),
    "",
    "Return one JSON object with these keys:",
    "- \"framing\": 2-4 sentences on how well the answer is framed for THIS question and its command words: does it decode the question, answer every part and keep proportion? Write to the candidate as \"you\".",
    "- \"outline_match\": one entry per FIXED OUTLINE section, in order: {\"id\": \"O1\", \"status\": \"covered\" | \"weak\" | \"missing\", \"comment\": what you wrote there and what to add}.",
    "- \"introduction\": {\"assessment\": 1-3 sentences on the introduction, \"rewrite\": a better introduction built from the candidate's own content, in exam format}.",
    "- \"conclusion\": {\"assessment\": 1-3 sentences, \"rewrite\": a better conclusion / way forward in exam format}.",
    "- \"paragraphs\": for each paragraph that needs work: {\"id\": \"P3\", \"assessment\": what is weak, \"fix\": exactly what to change}.",
    "- \"headings\": {\"assessment\": 1-2 sentences on the headings (Track A) or on the paragraphing (Tracks B-D), \"suggested\": the headings the candidate should have typed, in order (Track A only; [] otherwise)}.",
    "- \"flow\": up to 5 problems with logical flow (repetition, ordering, missing links, abrupt jumps), one line each.",
    "- \"value_additions\": up to 6 specific additions that would lift the answer (a data point, an example, a committee or report, an ASCII causal chain such as \"Repo hike -> higher lending rates -> lower demand -> lower inflation\"), one line each. Use only facts you are sure of; mark recent figures you cannot confirm with [VERIFY LATEST FIGURE].",
    "- \"rewrites\": 3-5 of the candidate's weakest sentences: {\"before\": the exact sentence(s), copied character for character, \"after\": the Grade-A upgrade, \"why\": what the upgrade fixes}.",
    "- \"model_answer\": a complete, exam-ready model answer for this question " + (limit ? "within the word limit (90-102% of " + limit + " words)" : "kept concise") + ", plain text in exam-portal format with \\n for line breaks: " + (MODEL_RULES[q.track] || MODEL_RULES.A) + ".",
    "Rules: plain text only (no markdown, no ** markers). Write to the candidate as \"you\". Quote the candidate exactly in \"before\".",
    "",
    metaLine(q, local),
    "",
    questionBlock(q),
    "",
    "CANDIDATE'S SCRIPT (paragraph ids in brackets):",
    ...local.paras.map(p => "[" + p.id + "] " + p.text),
    "",
    q.modelAnswer ? "REFERENCE ANSWER:\n" + clip(q.modelAnswer, "reference answer") : "No reference answer was given."
  ];
  return { system: SYSTEM, prompt: lines.join("\n"), schema: SCHEMA };
}

function unescapeBreaks(s) {
  return String(s || "").replace(/\\n/g, "\n");
}

function paraId(v) {
  const m = String(v || "").toUpperCase().match(/P?\s*(\d+)/);
  return m ? "P" + Number(m[1]) : "";
}

function normalize(obj, q, local, scheme) {
  const o = obj && typeof obj === "object" ? obj : {};
  const script = plainText(q.answer);
  const got = objList(o.outline_match, 12);
  const outlineMatch = scheme.outline.map((s, i) => {
    let hit = got.find(x => String(x.id || "").trim().toUpperCase() === s.id);
    if (!hit && got[i] && !String(got[i].id || "").trim()) hit = got[i];
    const status = hit ? String(hit.status || "").toLowerCase().trim() : "";
    return {
      id: s.id,
      section: s.section,
      share: s.share,
      words: s.words,
      status: ["covered", "weak", "missing"].includes(status) ? status : "unknown",
      comment: hit ? str(hit.comment, 600) : ""
    };
  });
  const paraIds = new Set(local.paras.map(p => p.id));
  const side = v => (v && typeof v === "object" ? v : {});
  const model = unescapeBreaks(str(o.model_answer, 16000)).replace(/\n?[ \t]*\[?\s*EXACT WORD COUNT[^\n]*$/i, "").trim();
  return {
    framing: str(o.framing, 1500),
    outlineMatch,
    introduction: { assessment: str(side(o.introduction).assessment, 800), rewrite: unescapeBreaks(str(side(o.introduction).rewrite, 2000)) },
    conclusion: { assessment: str(side(o.conclusion).assessment, 800), rewrite: unescapeBreaks(str(side(o.conclusion).rewrite, 2000)) },
    paragraphs: objList(o.paragraphs, 20)
      .map(x => ({ id: paraId(x.id), assessment: str(x.assessment, 600), fix: str(x.fix, 800) }))
      .filter(x => paraIds.has(x.id) && (x.assessment || x.fix)),
    headings: { assessment: str(side(o.headings).assessment, 600), suggested: strList(side(o.headings).suggested, 10, 160) },
    flow: strList(o.flow, 5, 300),
    valueAdds: strList(o.value_additions, 6, 400),
    rewrites: objList(o.rewrites, 8)
      .map(x => ({ before: str(x.before, 1200), after: unescapeBreaks(str(x.after, 1600)), why: str(x.why, 500) }))
      .filter(x => x.before && x.after && quoteInScript(x.before, script) && plainText(x.before) !== plainText(x.after))
      .slice(0, 5),
    modelAnswer: { text: model, words: countWords(model) }
  };
}

module.exports = { name: "coach", VERSION, SYSTEM, SCHEMA, build, normalize };
