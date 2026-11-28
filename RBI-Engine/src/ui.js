"use strict";

const CODES = { bold: 1, dim: 2, italic: 3, underline: 4, red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, gray: 90 };

function colorEnabled(stream, env = process.env) {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  if (env.TERM === "dumb") return false;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "") return env.FORCE_COLOR !== "0";
  return !!(stream && stream.isTTY);
}

function paint(style, text, on) {
  if (!on) return String(text);
  const codes = String(style).split("+").map(s => CODES[s]).filter(Boolean);
  if (!codes.length) return String(text);
  return "\x1b[" + codes.join(";") + "m" + text + "\x1b[0m";
}

function stripAnsi(s) {
  return String(s).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
}

function visibleLength(s) {
  return stripAnsi(s).length;
}

function wrap(text, width, indent = "", firstIndent) {
  const first = firstIndent === undefined ? indent : firstIndent;
  const out = [];
  let lineNo = 0;
  for (const raw of String(text).split("\n")) {
    const words = raw.split(/ +/).filter(w => w.length);
    let prefix = lineNo === 0 ? first : indent;
    let line = prefix;
    let used = visibleLength(prefix);
    let empty = true;
    const flush = () => { out.push(line.replace(/\s+$/, "")); lineNo++; prefix = indent; line = prefix; used = visibleLength(prefix); empty = true; };
    if (!words.length) { out.push(prefix.replace(/\s+$/, "")); lineNo++; continue; }
    for (let w of words) {
      const avail = Math.max(1, width - visibleLength(prefix));
      while (visibleLength(w) > avail) {
        if (!empty) flush();
        const plain = stripAnsi(w);
        line += plain.slice(0, avail);
        used += avail;
        empty = false;
        flush();
        w = plain.slice(avail);
      }
      if (!w) continue;
      const need = (empty ? 0 : 1) + visibleLength(w);
      if (!empty && used + need > width) flush();
      line += (empty ? "" : " ") + w;
      used += (empty ? 0 : 1) + visibleLength(w);
      empty = false;
    }
    if (!empty) flush();
  }
  return out.join("\n");
}

function table(rows, opts = {}) {
  if (!rows.length) return "";
  const indent = opts.indent || "";
  const cols = Math.max(...rows.map(r => r.length));
  const widths = Array.from({ length: cols }, (_, i) => Math.max(...rows.map(r => visibleLength(r[i] == null ? "" : r[i]))));
  return rows.map(r => indent + r.map((cell, i) => {
    const s = cell == null ? "" : String(cell);
    return i === r.length - 1 ? s : s + " ".repeat(widths[i] - visibleLength(s));
  }).join("  ").replace(/\s+$/, "")).join("\n");
}

const STATUS_WORDS = { running: "started", retrying: "retrying", done: "done", cached: "reused from the cache", failed: "failed", skipped: "skipped" };

function createStatus(stream, on) {
  const live = !!on && !!(stream && stream.isTTY);
  const active = new Map();
  let drawn = 0;
  let timer = null;
  const color = live;
  const clear = () => {
    if (!live || !drawn) return;
    let s = "";
    for (let i = 0; i < drawn; i++) s += "\x1b[1A\x1b[2K";
    stream.write("\r" + s);
    drawn = 0;
  };
  const draw = () => {
    if (!live) return;
    clear();
    const now = Date.now();
    const lines = [];
    for (const [key, it] of active) {
      const secs = Math.round((now - it.since) / 1000);
      const what = it.status === "queued" ? paint("dim", "waiting for a free slot", color) : it.status === "retrying" ? paint("yellow", it.message || "retrying", color) : paint("cyan", "working " + secs + " s", color);
      lines.push("  " + key + "  " + what);
    }
    if (lines.length) stream.write(lines.join("\n") + "\n");
    drawn = lines.length;
  };
  const line = (key, ev) => {
    const word = STATUS_WORDS[ev.status] || ev.status;
    let text = key + ": " + word;
    if (ev.status === "done" && ev.ms) text += " (" + (ev.ms / 1000).toFixed(1) + " s)";
    if ((ev.status === "failed" || ev.status === "retrying" || ev.status === "skipped") && ev.message) text += " - " + ev.message;
    const style = ev.status === "done" ? "green" : ev.status === "failed" ? "red" : ev.status === "cached" ? "dim" : ev.status === "skipped" || ev.status === "retrying" ? "yellow" : "";
    return "  " + (style ? paint(style, text, color) : text);
  };
  return {
    update(ev) {
      const key = "Q" + ev.q + " " + ev.pass;
      if (ev.status === "queued" || ev.status === "running" || ev.status === "retrying") {
        const prev = active.get(key);
        active.set(key, { status: ev.status, message: ev.message, since: prev && ev.status === "retrying" ? prev.since : Date.now() });
        if (live) {
          if (!timer) timer = setInterval(draw, 500);
          draw();
        } else if (ev.status !== "queued") {
          stream.write(line(key, ev) + "\n");
        }
        return;
      }
      active.delete(key);
      if (live) clear();
      stream.write(line(key, ev) + "\n");
      if (live) draw();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      clear();
      active.clear();
    }
  };
}

function ask(rl, question, opts = {}) {
  const hasDefault = opts.default !== undefined && opts.default !== null && String(opts.default) !== "";
  const prompt = question + (hasDefault && !opts.hidden ? " [" + opts.default + "]" : "") + ": ";
  return new Promise(resolve => {
    let restore = null;
    const done = (answer) => {
      if (restore) restore();
      const a = String(answer == null ? "" : answer).trim();
      resolve(a || (hasDefault ? String(opts.default) : ""));
    };
    if (opts.hidden && rl.terminal && rl.output) {
      const orig = rl._writeToOutput;
      rl.output.write(prompt);
      rl._writeToOutput = function (s) {
        if (/[\r\n]/.test(s)) orig.call(rl, s);
        else if (s.length) orig.call(rl, "*".repeat(stripAnsi(s).length));
      };
      restore = () => { rl._writeToOutput = orig; };
      rl.question("", done);
    } else {
      rl.question(prompt, done);
    }
  });
}

async function choose(rl, title, options, opts = {}) {
  const out = rl.output || process.stdout;
  out.write(title + "\n");
  options.forEach((o, i) => out.write("  " + (i + 1) + "  " + o + "\n"));
  for (let tries = 0; tries < 3; tries++) {
    const a = await ask(rl, "Choose 1-" + options.length, { default: opts.default !== undefined ? String(opts.default + 1) : "" });
    const n = Number(a);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) return n - 1;
    out.write("Type a number from 1 to " + options.length + ".\n");
  }
  return opts.default !== undefined ? opts.default : -1;
}

module.exports = { colorEnabled, paint, stripAnsi, visibleLength, wrap, table, createStatus, ask, choose };
