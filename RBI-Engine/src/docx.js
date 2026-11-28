"use strict";

const zlib = require("zlib");
const { parseXML, textContent, attrNS, descendants } = require("./xml");

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const SYMBOL_MAP = { 0xAE: "→", 0xAC: "←", 0xAD: "↑", 0xAF: "↓", 0xDE: "⇒", 0xDC: "⇐", 0xB3: "≥", 0xA3: "≤", 0xB4: "×", 0xB8: "÷", 0xB1: "±", 0xB9: "≠", 0xBB: "≈", 0xB7: "•", 0xB0: "°", 0xA5: "∞", 0xD6: "√", 0x44: "Δ", 0x53: "Σ", 0x70: "π", 0x61: "α", 0x62: "β", 0x6D: "μ" };
const WINGDINGS_MAP = { 0xFC: "✓", 0xFB: "✗", 0xFE: "☑", 0xA7: "▪", 0x6C: "●", 0x6E: "■", 0xD8: "➢", 0xE8: "➔", 0xF0: "⇨", 0x9F: "•" };

function inflateTolerant(raw) {
  try {
    return zlib.inflateRawSync(raw);
  } catch (err) {
    try {
      return zlib.inflateRawSync(raw, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
    } catch (_) {
      throw err;
    }
  }
}

function readZipEntries(buf, wanted) {
  const found = {};
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd >= 0) {
    const total = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    for (let i = 0; i < total && p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50; i++) {
      const method = buf.readUInt16LE(p + 10);
      const compSize = buf.readUInt32LE(p + 20);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      const local = buf.readUInt32LE(p + 42);
      const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
      p += 46 + nameLen + extraLen + commentLen;
      if (!wanted.includes(name) || local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) continue;
      const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      found[name] = { method, compSize, dataStart };
    }
  }
  if (!Object.keys(found).length) {
    let off = 0;
    while (off + 30 <= buf.length) {
      if (buf.readUInt32LE(off) !== 0x04034b50) { off++; continue; }
      const method = buf.readUInt16LE(off + 8);
      let compSize = buf.readUInt32LE(off + 18);
      const nameLen = buf.readUInt16LE(off + 26);
      const extraLen = buf.readUInt16LE(off + 28);
      const name = buf.toString("utf8", off + 30, off + 30 + nameLen);
      const dataStart = off + 30 + nameLen + extraLen;
      if (compSize === 0) {
        let scan = dataStart;
        while (scan + 4 <= buf.length) {
          const s = buf.readUInt32LE(scan);
          if (s === 0x04034b50 || s === 0x08074b50 || s === 0x02014b50) break;
          scan++;
        }
        compSize = scan - dataStart;
      }
      if (wanted.includes(name) && !found[name]) found[name] = { method, compSize, dataStart };
      off = dataStart + Math.max(compSize, 1);
    }
  }
  const out = {};
  for (const [name, e] of Object.entries(found)) {
    const raw = buf.subarray(e.dataStart, Math.min(buf.length, e.dataStart + e.compSize));
    if (e.method === 0) out[name] = raw.toString("utf8");
    else if (e.method === 8) out[name] = inflateTolerant(raw).toString("utf8");
    else throw new Error("Unsupported ZIP compression method " + e.method + " in " + name + ".");
  }
  return out;
}

function kids(el) {
  return el.children.filter(c => c.type === "element");
}

function child(el, local) {
  return el ? kids(el).find(c => c.local === local) || null : null;
}

function attr(el, local) {
  if (!el) return "";
  return attrNS(el, W_NS, local) || el.attrs["w:" + local] || "";
}

function symbolChar(code, font) {
  const c = code >= 0xF000 && code <= 0xF0FF ? code - 0xF000 : code;
  if (/wingdings/i.test(font || "")) return WINGDINGS_MAP[c] || "";
  if (/symbol/i.test(font || "") || code >= 0xF000) return SYMBOL_MAP[c] || "";
  return String.fromCharCode(code);
}

function readLevel(lvl) {
  const val = name => { const e = child(lvl, name); return e ? attr(e, "val") : null; };
  return { fmt: val("numFmt") || "decimal", text: val("lvlText") || "", start: parseInt(val("start") || "1", 10), pStyle: val("pStyle") || "" };
}

function parseNumbering(xml) {
  const result = { abstracts: {}, nums: {} };
  if (!xml) return result;
  const doc = parseXML(xml);
  for (const an of descendants(doc, W_NS, "abstractNum")) {
    const lvls = {};
    for (const lvl of kids(an).filter(k => k.local === "lvl")) lvls[attr(lvl, "ilvl") || "0"] = readLevel(lvl);
    result.abstracts[attr(an, "abstractNumId")] = lvls;
  }
  for (const num of descendants(doc, W_NS, "num")) {
    const overrides = {};
    for (const ov of kids(num).filter(k => k.local === "lvlOverride")) {
      const so = child(ov, "startOverride");
      const lvl = child(ov, "lvl");
      overrides[attr(ov, "ilvl") || "0"] = { start: so ? parseInt(attr(so, "val"), 10) : null, lvl: lvl ? readLevel(lvl) : null };
    }
    result.nums[attr(num, "numId")] = { abs: attr(child(num, "abstractNumId"), "val"), overrides };
  }
  return result;
}

function parseStyles(xml) {
  const styles = {};
  if (!xml) return styles;
  const doc = parseXML(xml);
  for (const st of descendants(doc, W_NS, "style")) {
    const pPr = child(st, "pPr");
    const numPr = pPr && child(pPr, "numPr");
    const numIdEl = numPr && child(numPr, "numId");
    const ilvlEl = numPr && child(numPr, "ilvl");
    styles[attr(st, "styleId")] = {
      basedOn: attr(child(st, "basedOn"), "val"),
      numId: numIdEl ? attr(numIdEl, "val") : null,
      ilvl: ilvlEl ? parseInt(attr(ilvlEl, "val"), 10) : null
    };
  }
  return styles;
}

function toRoman(n) {
  const map = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let out = "";
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}

function formatNumber(n, fmt) {
  switch (fmt) {
    case "lowerLetter": return String.fromCharCode(97 + ((n - 1) % 26)).repeat(Math.floor((n - 1) / 26) + 1);
    case "upperLetter": return String.fromCharCode(65 + ((n - 1) % 26)).repeat(Math.floor((n - 1) / 26) + 1);
    case "lowerRoman": return toRoman(n);
    case "upperRoman": return toRoman(n).toUpperCase();
    case "decimalZero": return n < 10 ? "0" + n : String(n);
    default: return String(n);
  }
}

function xmlToText(documentXml, numberingXml, stylesXml) {
  const doc = parseXML(documentXml);
  const numbering = parseNumbering(numberingXml);
  const styles = parseStyles(stylesXml);
  const counters = {};
  const BULLETS = ["•", "◦", "▪"];

  const levelDef = (numId, ilvl) => {
    const num = numbering.nums[numId];
    if (!num) return null;
    const ov = num.overrides[String(ilvl)];
    if (ov && ov.lvl) return ov.lvl;
    const abs = numbering.abstracts[num.abs];
    return (abs && abs[String(ilvl)]) || null;
  };
  const startOf = (numId, ilvl) => {
    const num = numbering.nums[numId];
    const ov = num && num.overrides[String(ilvl)];
    if (ov && ov.start !== null && !isNaN(ov.start)) return ov.start;
    const def = levelDef(numId, ilvl);
    return def && !isNaN(def.start) ? def.start : 1;
  };
  const styleNumbering = (styleId) => {
    for (let i = 0, s = styles[styleId]; s && i < 20; i++, s = styles[s.basedOn]) {
      if (s.numId !== null) return { numId: s.numId, ilvl: s.ilvl };
    }
    return null;
  };
  const levelForStyle = (numId, styleId) => {
    const num = numbering.nums[numId];
    const abs = num && numbering.abstracts[num.abs];
    if (abs) for (const k of Object.keys(abs)) if (abs[k].pStyle && abs[k].pStyle === styleId) return parseInt(k, 10);
    return 0;
  };
  const nextLabel = (numId, ilvl) => {
    const def = levelDef(numId, ilvl);
    if (!def) return "";
    const c = counters[numId] || (counters[numId] = []);
    c[ilvl] = c[ilvl] === undefined ? startOf(numId, ilvl) : c[ilvl] + 1;
    for (let k = ilvl + 1; k < 9; k++) c[k] = undefined;
    if (def.fmt === "bullet") return BULLETS[Math.min(ilvl, BULLETS.length - 1)];
    if (def.fmt === "none") return "";
    return def.text.replace(/%([1-9])/g, (m, d) => {
      const k = Number(d) - 1;
      const kDef = levelDef(numId, k);
      return formatNumber(c[k] !== undefined ? c[k] : startOf(numId, k), kDef ? kDef.fmt : "decimal");
    }).trim();
  };
  const cleanLine = (s) => s
    .replace(/[   ]/g, " ")
    .replace(/[​‌‍﻿­]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[ \t]+/g, " ")
    .trim();

  function paragraphLines(p) {
    const parts = [];
    const boxes = [];
    (function walk(node) {
      for (const ch of kids(node)) {
        const n = ch.local;
        if (n === "pPr" || n === "rPr" || n === "del" || n === "moveFrom" || n === "delText" || n === "instrText" || n === "rt") continue;
        if (n === "t") { if (ch.ns === W_NS || ch.ns === M_NS) parts.push(textContent(ch)); continue; }
        if (n === "tab" && ch.ns === W_NS) { parts.push("\t"); continue; }
        if ((n === "br" || n === "cr") && ch.ns === W_NS) { parts.push("\n"); continue; }
        if (n === "noBreakHyphen") { parts.push("-"); continue; }
        if (n === "softHyphen") continue;
        if (n === "sym") { parts.push(symbolChar(parseInt(attr(ch, "char") || "0", 16), attr(ch, "font"))); continue; }
        if (n === "txbxContent") { boxes.push(ch); continue; }
        if (n === "AlternateContent") {
          const pick = kids(ch).find(k => k.local === "Choice") || kids(ch).find(k => k.local === "Fallback");
          if (pick) walk(pick);
          continue;
        }
        walk(ch);
      }
    })(p);
    const pPr = child(p, "pPr");
    const styleId = attr(pPr && child(pPr, "pStyle"), "val");
    const numPr = pPr && child(pPr, "numPr");
    let numId = numPr && child(numPr, "numId") ? attr(child(numPr, "numId"), "val") : "";
    let ilvl = numPr && child(numPr, "ilvl") ? parseInt(attr(child(numPr, "ilvl"), "val"), 10) : null;
    if (!numId && styleId) {
      const sn = styleNumbering(styleId);
      if (sn) { numId = sn.numId; if (ilvl === null) ilvl = sn.ilvl; }
    }
    if (ilvl === null || isNaN(ilvl)) ilvl = numId ? levelForStyle(numId, styleId) : 0;
    const label = numId && numId !== "0" ? nextLabel(numId, ilvl) : "";
    const indent = numId && numId !== "0" ? "   ".repeat(Math.max(0, Math.min(ilvl, 8))) : "";
    const lines = [];
    parts.join("").split("\n").forEach((segment) => {
      const text = cleanLine(segment);
      if (!text) return;
      lines.push(indent + (label && !lines.length ? label + " " : "") + text);
    });
    return { lines, boxes };
  }

  function childrenThrough(el, local) {
    const out = [];
    for (const ch of kids(el)) {
      if (ch.local === local) out.push(ch);
      else if (ch.local === "sdt" || ch.local === "sdtContent" || ch.local === "customXml") out.push(...childrenThrough(ch, local));
    }
    return out;
  }

  function blockLines(container, keepBlank) {
    const out = [];
    for (const ch of kids(container)) {
      const n = ch.local;
      if (n === "p") {
        const r = paragraphLines(ch);
        if (!r.lines.length && keepBlank && !r.boxes.length) out.push("");
        out.push(...r.lines);
        for (const box of r.boxes) out.push(...blockLines(box, false));
      } else if (n === "tbl") {
        out.push(...tableLines(ch));
      } else if (n === "sdt") {
        const content = child(ch, "sdtContent");
        if (content) out.push(...blockLines(content, keepBlank));
      } else if (n === "customXml" || n === "ins" || n === "moveTo" || n === "sdtContent") {
        out.push(...blockLines(ch, keepBlank));
      }
    }
    return out;
  }

  function tableLines(tbl) {
    const out = [];
    for (const tr of childrenThrough(tbl, "tr")) {
      const cells = childrenThrough(tr, "tc").map(tc => blockLines(tc, false).map(l => l.trim()));
      const filled = cells.filter(c => c.length);
      if (!filled.length) continue;
      if (cells.length === 1 || filled.length === 1) out.push(...filled[0]);
      else out.push(cells.map(c => c.join(" ")).join(" | "));
    }
    return out;
  }

  const body = descendants(doc, W_NS, "body")[0];
  if (!body) throw new Error("Could not find the document body inside the Word file.");
  return blockLines(body, true).join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "");
}

function extractDocxText(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) throw new Error("This is not a Word .docx file. Save the answer as .docx (Word 2007 or newer) or as .txt.");
  const parts = readZipEntries(buf, ["word/document.xml", "word/numbering.xml", "word/styles.xml"]);
  if (!parts["word/document.xml"]) throw new Error("Could not find the document content (word/document.xml) inside the file. Is it a .docx file?");
  return xmlToText(parts["word/document.xml"], parts["word/numbering.xml"], parts["word/styles.xml"]);
}

module.exports = { extractDocxText, xmlToText, readZipEntries };
