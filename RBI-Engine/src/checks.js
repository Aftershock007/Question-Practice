"use strict";

const { countWords, latinShare, POINT_RE } = require("./text");

const INFORMAL = [
  [/\ba lot of\b/gi, "a large number of / considerable"],
  [/\blots of\b/gi, "many / considerable"],
  [/\bstuff\b/gi, "a precise noun (measures, material, issues)"],
  [/\bgonna\b/gi, "going to"],
  [/\bwanna\b/gi, "want to"],
  [/\bgotta\b/gi, "have to"],
  [/\bokay\b/gi, "acceptable"],
  [/\bOK\b/g, "acceptable"],
  [/\bawesome\b/gi, "remarkable"],
  [/\bsuper\s+(?:important|big|high|low|fast|good|bad|useful)\b/gi, m => "extremely " + m.split(/\s+/)[1]],
  [/\bvery very\b/gi, "extremely"],
  [/\breally really\b/gi, "very"],
  [/\betc\.?\s+etc\b\.?/gi, "etc."],
  [/(?<=\s)&(?=\s)/g, "and"],
  [/\b(?:bcoz|bcz|coz|cuz)\b/gi, "because"],
  [/\bpl[sz]\b/gi, "please"],
  [/\bthru\b/gi, "through"],
  [/\bgovt\b\.?/gi, "Government"],
  [/\bw\.?r\.?t\b\.?/gi, "with respect to"],
  [/\bb\/w\b/gi, "between"]
];

const FILLERS = ["very", "really", "basically", "actually", "literally", "quite", "things", "just", "totally", "simply", "obviously", "definitely"];

const CONTRACTION_RE = /\b[A-Za-z]+n['’]t\b|\b(?:i|you|we|they|he|she|it|that|there|here|what|who|let)['’](?:re|ve|ll|d|m|s)\b/gi;

function expandContraction(word) {
  const w = word.replace(/’/g, "'");
  const low = w.toLowerCase();
  const keepCase = (s) => (w[0] === w[0].toUpperCase() ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  if (low === "can't") return keepCase("cannot");
  if (low === "won't") return keepCase("will not");
  if (low === "shan't") return keepCase("shall not");
  if (low === "ain't") return keepCase("is not");
  if (/n't$/.test(low)) return w.slice(0, -3) + " not";
  if (low === "let's") return w.slice(0, -2) + " us";
  const [base, tail] = w.split("'");
  const full = { re: "are", ve: "have", ll: "will", d: "would", m: "am", s: "is" }[tail.toLowerCase()];
  return (base.toLowerCase() === "i" ? "I" : base) + " " + full;
}

function mechanicalChecks({ text, units, paras, track }) {
  const src = String(text || "");
  const found = [];
  const english = latinShare(src) >= 0.5;
  const unitAt = (offset) => {
    let best = null;
    for (const u of units) {
      if (offset >= u.start && offset < u.end) return u.id;
      if (u.start <= offset) best = u.id;
    }
    return best;
  };
  const add = (start, kind, quote, message, fix) => found.push({ start, unit: unitAt(start), kind, quote, message, fix: fix || "" });
  const scan = (re, fn) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      fn(m);
      if (!m[0].length) re.lastIndex++;
    }
  };
  const bodyUnits = units.filter(u => u.kind !== "heading");

  if (english) {
    scan(/\b([A-Za-z]+)\s+\1\b/gi, m => {
      if (/^(?:had|that)$/i.test(m[1])) return;
      add(m.index, "repeated word", m[0], "The word \"" + m[1] + "\" is typed twice.", m[1]);
    });
  }

  scan(/(\S+) +([,;:!?]|\.(?![.\d]))/g, m => add(m.index, "spacing", m[0], "Remove the space before \"" + m[2] + "\".", m[1] + m[2]));
  scan(/([A-Za-z]+)([,;:])([A-Za-z]+)/g, m => add(m.index, "spacing", m[0], "Add a space after \"" + m[2] + "\".", m[1] + m[2] + " " + m[3]));
  scan(/([a-z]{2,})\.([A-Z][a-z]+)/g, m => add(m.index, "spacing", m[0], "Add a space after the full stop.", m[1] + ". " + m[2]));

  if (english) {
    const pronounAt = new Set();
    scan(/(^|[\s(“"'])i(?=[\s,;:!?’']|$)/gm, m => {
      const at = m.index + m[1].length;
      pronounAt.add(at);
      add(at, "capitalisation", "i", "The pronoun \"I\" is always a capital letter.", "I");
    });
    for (const u of bodyUnits) {
      if (u.kind !== "sentence") continue;
      const lead = u.text.match(/^[^A-Za-z]*/)[0].length;
      const first = (u.text.slice(lead).match(/^\S+/) || [""])[0];
      if (!/^[a-z]/.test(first) || countWords(u.text) < 3) continue;
      if (/^(?:e\.g|i\.e|etc|vs|viz|cf)\b/i.test(first) || /[A-Z]/.test(first) || /^[a-z]-/.test(first)) continue;
      if (pronounAt.has(u.start + lead)) continue;
      add(u.start + lead, "capitalisation", first, "A sentence starts with a capital letter.", first.charAt(0).toUpperCase() + first.slice(1));
    }

    scan(CONTRACTION_RE, m => add(m.index, "contraction", m[0], "Contractions are informal in an RBI answer. Write the words in full.", expandContraction(m[0])));

    for (const [re, fix] of INFORMAL) {
      scan(re, m => add(m.index, "informal", m[0], "\"" + m[0] + "\" is too informal for an RBI answer.", typeof fix === "function" ? fix(m[0]) : fix));
    }

    if (track === "A" || track === "C") {
      for (const u of bodyUnits) {
        let hit = null;
        const re = /\bI\b|\b(?:me|my|myself|we|our|ours|ourselves)\b|\bus\b/gi;
        let m;
        while ((m = re.exec(u.text))) {
          const w = m[0];
          if (w === "US" || w === "Us" || (w.toLowerCase() === "us" && w !== "us")) continue;
          if (w === "i" && /^[.)]/.test(u.text.slice(m.index + 1))) continue;
          if (w === "I") {
            const before = u.text.slice(0, m.index);
            if (/-$/.test(before)) continue;
            const prev = (before.match(/(\S+)\s*$/) || ["", ""])[1];
            if (/^[A-Z]/.test(prev)) continue;
          }
          hit = m;
          break;
        }
        if (!hit) continue;
        add(u.start + hit.index, "first person", hit[0],
          track === "C" ? "A precis is written in the third person, without the writer's own voice." : "First person (\"" + hit[0] + "\") is not the sober third-person institutional voice RBI examiners expect.",
          track === "C" ? "Report the author's ideas in the third person." : "Rewrite in the third person, for example \"It is evident that...\" or \"India needs...\".");
      }
    }
  }

  for (const u of bodyUnits) {
    const end = u.text.replace(/["'”’)\]]+$/, "");
    if (/\?$/.test(end)) add(u.start, "rhetorical question", u.text, track === "B" ? "Rhetorical questions weaken an RBI essay. Use one at most, if any." : "Avoid rhetorical questions in an RBI answer. State the point instead.", "State the point as a direct sentence.");
    else if (/!$/.test(end)) add(u.start, "exclamation", u.text, "Exclamation marks are too emotional for an RBI answer.", "End with a full stop.");
    const n = countWords(u.text);
    if (n > 40) add(u.start, "long sentence", u.text, "This sentence has " + n + " words. Split it into two or three shorter sentences.", "");
  }

  const lines = src.split("\n").map(l => l.trim()).filter(Boolean);
  const pointLines = lines.filter(l => POINT_RE.test(l));
  const headings = units.filter(u => u.kind === "heading");
  const words = countWords(src);

  if (track === "A" && words >= 150 && !headings.length && !pointLines.length) {
    add(0, "wall of text", "", "The answer has no headings or numbered points. RBI ESI and FM answers score better with clear headings and numbered points.", "Add short headings (INTRODUCTION, the parts the question asks for, WAY FORWARD) and numbered points.");
  }
  if (track === "B") {
    const extraHeadings = headings.filter(h => h !== units[0]);
    if (pointLines.length || extraHeadings.length) {
      const first = units.find(u => u.kind === "point") || extraHeadings[0];
      add(first ? first.start : 0, "essay format", first ? first.text : "",
        "An RBI essay must be continuous prose. Found " + pointLines.length + " bullet or numbered point(s) and " + extraHeadings.length + " heading(s).",
        "Turn the points into linked paragraphs.");
    }
  }
  if (track === "C") {
    const hasTitle = !!units[0] && units[0].kind === "heading";
    const bodyParas = paras.length - (hasTitle && paras[0] && paras[0].headingOnly ? 1 : 0);
    if (!hasTitle) add(0, "precis format", "", "A precis needs a 3-8 word title above it.", "Add a short title that states the central idea.");
    if (bodyParas > 1) add(paras[1] ? paras[1].start : 0, "precis format", "", "A precis must be one paragraph (plus its title). Found " + bodyParas + " paragraphs.", "Merge the paragraphs into one.");
  }

  const stack = [];
  const pairs = { ")": "(", "]": "[" };
  let unmatched = null;
  for (let i = 0; i < src.length && unmatched === null; i++) {
    const c = src[i];
    if (c === "(" || c === "[") stack.push(i);
    else if (c === ")" || c === "]") {
      if (stack.length && src[stack[stack.length - 1]] === pairs[c]) stack.pop();
      else if (!/^\s*(?:\(?[a-zA-Z0-9]{1,3}\))/.test(src.slice(src.lastIndexOf("\n", i) + 1, i + 1))) unmatched = i;
    }
  }
  if (unmatched === null && stack.length) unmatched = stack[0];
  if (unmatched !== null) add(unmatched, "brackets", src.slice(unmatched, unmatched + 30).split("\n")[0], "A bracket is opened or closed without its pair.", "Close the bracket.");
  const straight = (src.match(/"/g) || []).length;
  const openCurly = (src.match(/“/g) || []).length;
  const closeCurly = (src.match(/”/g) || []).length;
  if (straight % 2 || openCurly !== closeCurly) {
    const at = straight % 2 ? src.lastIndexOf("\"") : src.indexOf(openCurly > closeCurly ? "“" : "”");
    add(Math.max(0, at), "brackets", src.slice(Math.max(0, at), Math.max(0, at) + 30).split("\n")[0], "A quotation mark is opened or closed without its pair.", "Close the quotation.");
  }

  if (english) {
    const sentences = units.filter(u => u.kind === "sentence");
    const opener = u => (u.text.match(/[A-Za-z']+/) || [""])[0].toLowerCase();
    for (let i = 0; i + 2 < sentences.length;) {
      const w = opener(sentences[i]);
      let j = i + 1;
      while (j < sentences.length && w && opener(sentences[j]) === w) j++;
      if (j - i >= 3) {
        add(sentences[i].start, "repetitive openings", sentences[i].text, (j - i) + " sentences in a row start with \"" + sentences[i].text.match(/[A-Za-z']+/)[0] + "\". Vary the openings.", "Start with the subject, a connector (However, Consequently) or a phrase.");
        i = j;
      } else {
        i++;
      }
    }
    for (const w of FILLERS) {
      const re = new RegExp("\\b" + w + "\\b", "gi");
      const hits = [];
      let m;
      while ((m = re.exec(src))) hits.push(m.index);
      if (hits.length >= 3) add(hits[0], "filler word", w, "\"" + w + "\" is used " + hits.length + " times. Cut it or use a precise word.", w === "very" ? "\"very important\" -> \"critical\"; \"very big\" -> \"substantial\"" : "");
    }
  }

  const seen = new Set();
  return found
    .filter(f => {
      const key = f.kind + "|" + f.start + "|" + f.quote;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.start - b.start)
    .map((f, i) => ({ id: "M" + (i + 1), unit: f.unit, kind: f.kind, quote: f.quote, message: f.message, fix: f.fix, start: f.start }));
}

module.exports = { mechanicalChecks, expandContraction };
