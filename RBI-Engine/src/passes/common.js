"use strict";

const S = { type: "string" };
const N = { type: "number" };
const B = { type: "boolean" };
const SL = { type: "array", items: S };

function objSchema(props) {
  return { type: "object", properties: props, required: Object.keys(props) };
}

function listOf(props) {
  return { type: "array", items: objSchema(props) };
}

function oneOf(values) {
  return { type: "string", enum: values };
}

const CLIP_CHARS = 14000;

function clip(text, what) {
  const t = String(text || "");
  if (t.length <= CLIP_CHARS) return t;
  return t.slice(0, CLIP_CHARS) + "\n[... clipped: the " + what + " is longer than 14,000 characters; only the first 14,000 characters were used]";
}

function questionBlock(q) {
  const lines = [];
  if (q.passage) lines.push("PASSAGE / DATA:\n" + clip(q.passage, "passage"));
  lines.push("QUESTION:\n" + clip(q.question, "question"));
  return lines.join("\n\n");
}

function metaLine(q, local) {
  const words = local && local.commandWords && local.commandWords.length ? local.commandWords.map(c => c.word).join(", ") : "none found";
  return "Paper: " + (q.paper || "Other") + " · Track " + q.track + " (" + q.trackLabel + ") · " + q.marks + " marks · word limit " + (q.wordLimit || "not set") + "\nCommand words: " + words;
}

module.exports = { S, N, B, SL, objSchema, listOf, oneOf, clip, questionBlock, metaLine, CLIP_CHARS };
