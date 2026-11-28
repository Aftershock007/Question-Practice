"use strict";

const XML_NS = "http://www.w3.org/XML/1998/namespace";
const TAG_RE = /<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y;
const ATTR_RE = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function damaged(why) {
  return new Error("The Word document is damaged (its XML could not be read: " + why + ").");
}

function decodeEntities(s) {
  if (s.indexOf("&") < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (m, e) => {
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "amp") return "&";
    if (e === "quot") return "\"";
    if (e === "apos") return "'";
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    try { return String.fromCodePoint(code); } catch (_) { return ""; }
  });
}

function splitName(qname) {
  const i = qname.indexOf(":");
  return i < 0 ? ["", qname] : [qname.slice(0, i), qname.slice(i + 1)];
}

function parseXML(text) {
  const src = String(text || "");
  const root = { type: "element", name: "#document", local: "#document", ns: "", attrs: {}, children: [], nsmap: { xml: XML_NS } };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const addText = (s, raw) => {
    if (!s) return;
    const t = raw ? s : decodeEntities(s);
    const kids = top().children;
    const last = kids[kids.length - 1];
    if (last && last.type === "text") last.text += t;
    else kids.push({ type: "text", text: t });
  };
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) { if (stack.length > 1) addText(src.slice(i)); break; }
    if (lt > i && stack.length > 1) addText(src.slice(i, lt));
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      if (end < 0) throw damaged("unclosed comment");
      i = end + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", lt)) {
      const end = src.indexOf("]]>", lt + 9);
      if (end < 0) throw damaged("unclosed CDATA section");
      addText(src.slice(lt + 9, end), true);
      i = end + 3;
      continue;
    }
    if (src[lt + 1] === "?" || src[lt + 1] === "!") {
      const end = src.indexOf(">", lt + 2);
      if (end < 0) throw damaged("unclosed declaration");
      i = end + 1;
      continue;
    }
    if (src[lt + 1] === "/") {
      const end = src.indexOf(">", lt + 2);
      if (end < 0) throw damaged("unclosed end tag");
      const name = src.slice(lt + 2, end).trim();
      const el = stack.pop();
      if (!el || el === root || el.name !== name) throw damaged("unexpected </" + name + ">");
      i = end + 1;
      continue;
    }
    TAG_RE.lastIndex = lt;
    const m = TAG_RE.exec(src);
    if (!m) throw damaged("unreadable tag near character " + lt);
    const parent = top();
    const attrs = {};
    const nsmap = Object.assign({}, parent.nsmap);
    ATTR_RE.lastIndex = 0;
    let a;
    while ((a = ATTR_RE.exec(m[2]))) {
      const value = decodeEntities(a[2] !== undefined ? a[2] : a[3]);
      attrs[a[1]] = value;
      if (a[1] === "xmlns") nsmap[""] = value;
      else if (a[1].startsWith("xmlns:")) nsmap[a[1].slice(6)] = value;
    }
    const [prefix, local] = splitName(m[1]);
    const el = { type: "element", name: m[1], local, ns: nsmap[prefix] || "", attrs, children: [], nsmap };
    parent.children.push(el);
    if (!m[3]) stack.push(el);
    i = TAG_RE.lastIndex;
  }
  if (stack.length !== 1) throw damaged("<" + top().name + "> is never closed");
  const first = root.children.find(c => c.type === "element");
  if (!first) throw damaged("no root element");
  return first;
}

function textContent(el) {
  if (!el) return "";
  if (el.type === "text") return el.text;
  let s = "";
  for (const c of el.children) s += textContent(c);
  return s;
}

function attrNS(el, ns, local) {
  if (!el) return "";
  for (const [qname, value] of Object.entries(el.attrs)) {
    const [prefix, name] = splitName(qname);
    if (name === local && prefix && el.nsmap[prefix] === ns) return value;
  }
  return "";
}

function descendants(el, ns, local, out = []) {
  for (const c of el.children) {
    if (c.type !== "element") continue;
    if (c.local === local && c.ns === ns) out.push(c);
    descendants(c, ns, local, out);
  }
  return out;
}

module.exports = { parseXML, textContent, attrNS, descendants, decodeEntities };
