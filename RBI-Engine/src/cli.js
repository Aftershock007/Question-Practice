"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");
const pkg = require("../package.json");
const { enginePaths } = require("./paths");
const cfg = require("./config");
const ai = require("./ai");
const ui = require("./ui");
const R = require("./rubric");
const { readInputFile, finalizeQuestion, fromParts, parseDuration, decodeText, InputError } = require("./input");
const { createCache, createSchemeStore, createLimiter, writeAtomic } = require("./cache");
const { analyseQuestions } = require("./pipeline");
const { buildReport, buildSession, writeSession, localDate } = require("./report/build");
const { renderSummary, renderFull } = require("./report/terminal");
const hist = require("./history");
const { slug, fmt } = require("./util");

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

class FriendlyError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "FriendlyError";
    this.code = code || 1;
  }
}

const SETUP_KINDS = new Set(["not_configured", "auth", "permission", "privacy", "model"]);
const COMMON_FLAGS = { help: "boolean", "no-color": "boolean", color: "boolean" };

const ANALYSE_FLAGS = {
  quick: "boolean", runs: "number", fresh: "boolean", "rebuild-checklist": "boolean", open: "boolean", full: "boolean", json: "boolean",
  out: "string", only: "string", paper: "string", marks: "number", words: "number", track: "string", topic: "string", time: "string",
  question: "string", answer: "string", model: "string", passage: "string", debug: "boolean"
};

const HELP = {
  analyse: {
    usage: "node rbi.js analyse <answer file> [more files] [options]",
    about: "Analyse answers with AI: marks, every mistake, structure advice, a model answer and a plan. Reads engine answer files (.txt, .md, .docx) and the Practice_*.txt files the app downloads.",
    options: [
      ["--quick", "One grading run instead of three (fewer AI calls, less consistency)."],
      ["--runs N", "Number of grading runs, 1 to 5 (default 3)."],
      ["--fresh", "Ask the AI again instead of reusing saved replies (the marking checklist is kept)."],
      ["--rebuild-checklist", "Also rebuild the marking checklist for the question."],
      ["--open", "Open the HTML report when done."],
      ["--full", "Print the whole report in the terminal."],
      ["--json", "Print the report as JSON (for other programs)."],
      ["--out DIR", "Write the report folder here instead of RBI-Engine/reports."],
      ["--only 1,3", "Analyse only these questions of a multi-question file."],
      ["--paper, --marks, --words, --topic, --track, --time", "Override what the file says (for example --marks 15 --words 600 --time \"22 min\")."],
      ["--question Q --answer FILE [--model FILE] [--passage FILE]", "Analyse separate files instead of one answer file. --question may be a file or the question text."],
      ["--debug", "Save the prompts and raw AI replies in the report folder."]
    ]
  },
  new: {
    usage: "node rbi.js new [--paper ESI] [--marks 15] [--words 600] [--topic \"...\"] [--name my-answer] [--open]",
    about: "Create an answer file in RBI-Engine/answers from the template. Write the question and your answer in it, then analyse it.",
    options: [["--paper", "ESI, Finance, Management, English or Other (default ESI)."], ["--marks", "Maximum marks (default 15)."], ["--words", "Word limit (default from the marks)."], ["--topic", "Topic, optional."], ["--name", "Part of the file name."], ["--open", "Open the file in your editor."]]
  },
  setup: { usage: "node rbi.js setup", about: "Choose the AI provider and models and save your API key outside the repo (in your home folder).", options: [] },
  doctor: { usage: "node rbi.js doctor [--offline]", about: "Check Node.js, folders, API keys and (unless --offline) send one tiny request to each AI engine.", options: [["--offline", "Skip the connection test."]] },
  history: { usage: "node rbi.js history [--limit 20] [--paper ESI]", about: "List past analyses, newest first.", options: [["--limit N", "How many to show."], ["--paper P", "Only this paper."]] },
  progress: { usage: "node rbi.js progress [--paper ESI]", about: "Show your average, trend, weakest rubric areas and the mistakes that keep coming back.", options: [["--paper P", "Only this paper."]] },
  show: { usage: "node rbi.js show [N] [--open] [--full]", about: "Show the N-th latest report again (1 = latest).", options: [["--open", "Open the HTML report."], ["--full", "Print the whole report."]] },
  config: { usage: "node rbi.js config [set <key> <value>]", about: "Show the settings, keys (masked) and folders, or change a setting.", options: [["set <key> <value>", "For example: config set grade.model gemini-4-neon, config set runs 3, config set grade.thinking medium."]] }
};

function out(ctx, text) {
  ctx.stdout.write(text + "\n");
}

function err(ctx, text) {
  ctx.stderr.write(text + "\n");
}

function parseArgs(argv, spec) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") { positionals.push(...argv.slice(i + 1)); break; }
    if (a === "-h") { flags.help = true; continue; }
    if (a.startsWith("--") && a.length > 2) {
      const eq = a.indexOf("=");
      const name = (eq > 0 ? a.slice(2, eq) : a.slice(2)).toLowerCase();
      const type = spec[name];
      if (!type) throw new UsageError("Unknown option --" + name + ".");
      if (type === "boolean") {
        if (eq > 0) throw new UsageError("--" + name + " does not take a value.");
        flags[name] = true;
        continue;
      }
      let value = eq > 0 ? a.slice(eq + 1) : argv[++i];
      if (value === undefined) throw new UsageError("--" + name + " needs a value.");
      if (type === "number") {
        const n = Number(value);
        if (!Number.isFinite(n)) throw new UsageError("--" + name + " needs a number, not \"" + value + "\".");
        value = n;
      }
      flags[name] = value;
      continue;
    }
    positionals.push(a);
  }
  return { flags, positionals };
}

function loadSettings(ctx) {
  try {
    return cfg.loadSettings(ctx.paths);
  } catch (e) {
    throw new FriendlyError(e.message, 1);
  }
}

function engineIdsInUse(settings) {
  return [...new Set(cfg.PASS_IDS.map(p => cfg.engineForPass(settings, p)))].sort();
}

function engineText(pc) {
  return pc.def.label + ", " + pc.model + (pc.thinking ? " (thinking " + pc.thinking + ")" : "");
}

function stripQuotes(s) {
  return String(s || "").trim().replace(/^(['"])(.*)\1$/, "$2");
}

function openFile(ctx, file) {
  try {
    const opts = { detached: true, stdio: "ignore" };
    const child = process.platform === "win32" ? spawn("cmd", ["/c", "start", "", file], opts)
      : process.platform === "darwin" ? spawn("open", [file], opts) : spawn("xdg-open", [file], opts);
    child.on("error", () => err(ctx, "Could not open it automatically. Open this file yourself: " + file));
    child.unref();
  } catch (_) {
    err(ctx, "Could not open it automatically. Open this file yourself: " + file);
  }
}

function readTextArg(value, mustBeFile) {
  const v = stripQuotes(value);
  if (fs.existsSync(v) && fs.statSync(v).isFile()) return decodeText(fs.readFileSync(v));
  if (mustBeFile) throw new InputError("File not found: " + v);
  return v;
}

function parseOnly(text) {
  const set = new Set();
  for (const part of String(text).split(",")) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw new UsageError("--only takes question numbers such as 1,3 or 2-4.");
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) set.add(i);
  }
  return set;
}

function exitCodeFor(results) {
  let code = 0;
  for (const r of results) {
    const st = r.status || {};
    if (st.fatal) {
      if (st.fatal.kind === "cancelled") return 130;
      if (SETUP_KINDS.has(st.fatal.kind)) code = Math.max(code, 2);
      else code = Math.max(code, 3);
    } else if ((st.failed || []).length || (st.skipped || []).length) {
      code = Math.max(code, 3);
    }
  }
  return code;
}

function writeDebug(dir, results) {
  const d = path.join(dir, "debug");
  results.forEach(r => (r.status.debug || []).forEach((x, i) => {
    const base = "q" + r.q.index + "-" + String(i + 1).padStart(2, "0") + "-" + slug(x.pass, 30);
    writeAtomic(path.join(d, base + ".prompt.txt"), "SYSTEM:\n" + x.system + "\n\nPROMPT:\n" + x.prompt + "\n");
    writeAtomic(path.join(d, base + ".reply.txt"), x.reply + "\n");
  }));
  return d;
}

async function cmdAnalyse(ctx, { flags, positionals }) {
  const settings = loadSettings(ctx);
  const keys = cfg.loadKeys(ctx.paths, ctx.env);
  const seconds = flags.time ? parseDuration(flags.time) : 0;
  if (flags.time && !seconds) throw new UsageError("--time needs a duration such as \"22 min\" or \"22:30\".");
  if (flags.track && !R.parseTrack(flags.track)) throw new UsageError("--track must be A, B, C or D (or esi, essay, precis, rc).");
  if (flags.runs !== undefined && !(Number.isInteger(flags.runs) && flags.runs >= 1 && flags.runs <= 5)) throw new UsageError("--runs must be a whole number from 1 to 5.");
  for (const k of ["marks", "words"]) if (flags[k] !== undefined && !(flags[k] > 0)) throw new UsageError("--" + k + " must be more than 0.");
  const overrides = { paper: flags.paper, topic: flags.topic, marks: flags.marks, wordLimit: flags.words, track: flags.track, seconds };
  const only = flags.only ? parseOnly(flags.only) : null;
  const jobs = [];
  if (flags.answer || flags.question) {
    if (!flags.answer || !flags.question) throw new UsageError("Use --question and --answer together.");
    const raw = fromParts({
      question: readTextArg(flags.question, false),
      answer: readTextArg(flags.answer, true),
      model: flags.model ? readTextArg(flags.model, true) : "",
      passage: flags.passage ? readTextArg(flags.passage, true) : ""
    });
    jobs.push({ file: path.resolve(stripQuotes(flags.answer)), format: "parts", questions: [finalizeQuestion(raw, overrides)] });
  } else {
    if (!positionals.length) throw new UsageError("Give the answer file to analyse, for example: node rbi.js analyse answers/my-answer.txt");
    for (const f of positionals) {
      const file = path.resolve(stripQuotes(f));
      const parsed = await readInputFile(file);
      let qs = parsed.questions;
      if (only) {
        qs = qs.filter(q => only.has(q.index));
        if (!qs.length) throw new UsageError("--only " + flags.only + " matches no question in " + path.basename(file) + " (it has " + parsed.questions.map(q => "Q" + q.index).join(", ") + ").");
      }
      jobs.push({ file, format: parsed.format, questions: qs.map(q => finalizeQuestion(q, overrides)) });
    }
  }

  const needAI = jobs.some(j => j.questions.some(q => q.words > 0));
  const pcs = {};
  for (const id of engineIdsInUse(settings)) {
    pcs[id] = ai.providerConfig(settings.engines[id], keys, settings, ctx.env);
    if (needAI && !pcs[id].ready) throw new ai.AIError("not_configured", "No API key for " + pcs[id].def.label + ".", { pc: pcs[id] });
  }

  const errColor = !ctx.noColor && ui.colorEnabled(ctx.stderr, ctx.env);
  const total = jobs.reduce((n, j) => n + j.questions.length, 0);
  err(ctx, ui.paint("bold", "Analysing " + total + " answer" + (total === 1 ? "" : "s") + " from " + jobs.map(j => path.basename(j.file)).join(", "), errColor));
  if (needAI) err(ctx, "Engines: " + Object.values(pcs).map(engineText).join(" / ") + ". Each answer takes a few minutes; finished parts are saved as they arrive.");
  jobs.forEach(j => j.questions.forEach(q => q.warnings.forEach(w => err(ctx, ui.paint("yellow", "Q" + q.index + ": " + w, errColor)))));

  const controller = new AbortController();
  let stopping = false;
  const onSigint = () => {
    if (stopping) process.exit(130);
    stopping = true;
    err(ctx, "\nStopping. Press Ctrl+C again to quit at once.");
    controller.abort();
  };
  process.on("SIGINT", onSigint);
  const status = ui.createStatus(ctx.stderr, errColor);
  const deps = {
    settings, keys, env: ctx.env,
    cache: createCache(ctx.paths.cache),
    schemes: createSchemeStore(ctx.paths.schemes),
    limiter: createLimiter(settings.concurrency),
    signal: controller.signal,
    runs: flags.runs, quick: !!flags.quick, fresh: !!flags.fresh, rebuildChecklist: !!flags["rebuild-checklist"], debug: !!flags.debug,
    state: { abort: null, inflight: new Map() }
  };
  const allResults = [];
  try {
    const reportsDir = flags.out ? path.resolve(flags.out) : settings.reportsDir ? path.resolve(settings.reportsDir) : ctx.paths.reports;
    for (const job of jobs) {
      const results = await analyseQuestions(job.questions, deps, { onEvent: e => status.update(e) });
      allResults.push(...results);
      if (deps.state.abort && deps.state.abort.kind === "cancelled") break;
      status.stop();
      const session = buildSession(results.map(buildReport), { file: job.file, format: job.format });
      const written = writeSession(session, reportsDir);
      if (flags.debug) err(ctx, "Prompts and raw replies: " + writeDebug(written.dir, results));
      hist.recordSession(ctx.paths, session, written.dir);
      ctx.lastReport = written;
      if (flags.json) out(ctx, JSON.stringify(session, null, 2));
      else {
        out(ctx, "");
        out(ctx, renderSummary(session, { color: ctx.color, width: ctx.stdout.columns || 100, paths: written }));
        if (flags.full) out(ctx, "\n" + renderFull(session, { color: ctx.color }));
      }
      if (flags.open) openFile(ctx, written.html);
    }
  } finally {
    status.stop();
    process.removeListener("SIGINT", onSigint);
  }
  const code = exitCodeFor(allResults);
  const fatal = deps.state.abort;
  if (code === 130) {
    err(ctx, "Stopped. Finished parts are saved; run the same command again to continue.");
  } else if (fatal) {
    const e = ai.explainError(fatal, fatal.pc || Object.values(pcs)[0]);
    err(ctx, "");
    err(ctx, ui.paint("red", e.title, errColor) + ": " + e.body);
  } else if (code === 3) {
    err(ctx, "Some parts failed (see \"Failed\" above). Run the same command again to retry them; finished parts are reused.");
  }
  return code;
}

function uniqueFile(dir, base, ext) {
  let file = path.join(dir, base + ext);
  for (let n = 2; fs.existsSync(file); n++) file = path.join(dir, base + "-" + n + ext);
  return file;
}

function cmdNew(ctx, { flags }) {
  const paper = String(flags.paper || "ESI").trim();
  const marks = flags.marks || 15;
  if (!(marks > 0)) throw new UsageError("--marks must be more than 0.");
  const track = R.detectTrack({ paper, question: "" });
  const words = flags.words || R.defaultWordLimit(track, marks, 0);
  const template = fs.readFileSync(path.join(ctx.paths.examples, "answer-template.txt"), "utf8");
  const text = template
    .replace(/^Paper:.*$/m, "Paper: " + paper)
    .replace(/^Topic:.*$/m, "Topic:" + (flags.topic ? " " + flags.topic : ""))
    .replace(/^Marks:.*$/m, "Marks: " + marks)
    .replace(/^Word limit:.*$/m, "Word limit:" + (words ? " " + words : ""));
  fs.mkdirSync(ctx.paths.answers, { recursive: true });
  const file = uniqueFile(ctx.paths.answers, localDate(new Date().toISOString()) + "-" + slug(flags.name || flags.topic || paper, 40), ".txt");
  fs.writeFileSync(file, text);
  ctx.lastNew = file;
  out(ctx, "Created " + file);
  out(ctx, "Write the question under \"Question:\" and your answer under \"Answer:\", save the file, then run:");
  out(ctx, "  node rbi.js analyse \"" + file + "\"");
  if (flags.open) openFile(ctx, file);
  return 0;
}

function sortedEntries(ctx, paper) {
  const want = String(paper || "").trim().toLowerCase();
  return hist.loadHistory(ctx.paths)
    .filter(e => !want || String(e.paperKey || "").toLowerCase() === want || String(e.paper || "").toLowerCase().includes(want))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

const NOTHING_YET = "No analyses yet. Try: node rbi.js analyse examples/sample-esi-15m.txt";

function when(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return localDate(iso) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function cmdHistory(ctx, { flags }) {
  const entries = sortedEntries(ctx, flags.paper);
  if (!entries.length) { out(ctx, NOTHING_YET); return 0; }
  const limit = flags.limit > 0 ? flags.limit : 20;
  const rows = [["#", "Date", "Paper", "Topic", "Score", "Grade", "Words"]].concat(entries.slice(0, limit).map((e, i) => [
    String(i + 1), when(e.date), e.paper, String(e.topic || e.question || "").slice(0, 30), e.notAttempted ? "not attempted" : fmt(e.score) + " / " + fmt(e.marks), e.grade || "", e.wordLimit ? e.words + "/" + e.wordLimit : String(e.words)
  ]));
  out(ctx, ui.table(rows));
  out(ctx, "");
  out(ctx, "Show one again: node rbi.js show <#>    Trends: node rbi.js progress");
  return 0;
}

function bar(percent, width) {
  const n = Math.max(0, Math.min(width, Math.round(percent / 100 * width)));
  return "#".repeat(n) + ".".repeat(width - n);
}

function cmdProgress(ctx, { flags }) {
  const st = hist.progressStats(hist.loadHistory(ctx.paths), { paper: flags.paper });
  if (!st.count) { out(ctx, st.notAttempted ? "Only unanswered questions so far. " + NOTHING_YET : NOTHING_YET); return 0; }
  const b = (t) => ui.paint("bold", t, ctx.color);
  out(ctx, b("Answers marked: " + st.count + ", average " + fmt(st.average) + "% of the maximum (strict marking)") + (st.notAttempted ? " - " + st.notAttempted + " left blank" : ""));
  out(ctx, "By paper: " + st.byPaper.map(p => p.paper + " " + p.count + " answer" + (p.count === 1 ? "" : "s") + ", average " + fmt(p.average) + "%").join("; "));
  out(ctx, "");
  out(ctx, b("Last " + st.recent.length + " answers (oldest first)"));
  out(ctx, ui.table(st.recent.map(e => ["  " + localDate(e.date), e.paper, bar(e.percent, 30), fmt(e.score) + " / " + fmt(e.marks), fmt(e.percent) + "%"])));
  if (st.weakestParams.length) {
    out(ctx, "");
    out(ctx, b("Weakest rubric areas (average share of the maximum)"));
    st.weakestParams.slice(0, 4).forEach(p => out(ctx, "  " + p.name + ": " + fmt(p.avgPercent) + "% over " + p.count + " answer" + (p.count === 1 ? "" : "s")));
  }
  if (st.topPenalties.length) {
    out(ctx, "");
    out(ctx, b("Penalties that keep coming back"));
    st.topPenalties.slice(0, 4).forEach(p => out(ctx, "  " + p.label + " (" + p.code + "): " + p.count + " time" + (p.count === 1 ? "" : "s")));
  }
  if (st.topLanguage.length) {
    out(ctx, "");
    out(ctx, b("Language mistakes that keep coming back"));
    out(ctx, "  " + st.topLanguage.slice(0, 6).map(x => x.type + " " + x.count).join(", "));
  }
  if (st.wordDiscipline.total) {
    out(ctx, "");
    out(ctx, b("Word discipline") + ": average " + fmt(st.wordDiscipline.averagePercent) + "% of the word limit; " + st.wordDiscipline.outOfBand + " of " + st.count + " answers outside the allowed band.");
  }
  if (st.best) out(ctx, "Best: " + fmt(st.best.score) + " / " + fmt(st.best.marks) + " (" + fmt(st.best.percent) + "%) on " + localDate(st.best.date) + (st.best.topic ? ", " + st.best.topic : "") + ".");
  return 0;
}

function cmdShow(ctx, { flags, positionals }) {
  const entries = sortedEntries(ctx, "");
  if (!entries.length) { out(ctx, NOTHING_YET); return 0; }
  const n = positionals[0] === undefined ? 1 : Number(positionals[0]);
  if (!Number.isInteger(n) || n < 1 || n > entries.length) throw new UsageError("Give a number from 1 to " + entries.length + " (1 is the latest).");
  const e = entries[n - 1];
  const json = path.join(e.reportDir, "report.json");
  if (!fs.existsSync(json)) throw new FriendlyError("The report folder was moved or deleted: " + e.reportDir + ". Analyse the answer again to rebuild it.", 1);
  const session = JSON.parse(fs.readFileSync(json, "utf8"));
  const paths = { html: path.join(e.reportDir, "report.html"), md: path.join(e.reportDir, "report.md") };
  out(ctx, renderSummary(session, { color: ctx.color, width: ctx.stdout.columns || 100, paths }));
  if (flags.full) out(ctx, "\n" + renderFull(session, { color: ctx.color }));
  if (flags.open) openFile(ctx, paths.html);
  return 0;
}

function cmdConfig(ctx, { positionals }) {
  if (positionals[0] === "set") {
    if (positionals.length < 3) throw new UsageError("Use: node rbi.js config set <key> <value>.");
    let next;
    try {
      next = cfg.setSetting(loadSettings(ctx), positionals[1], positionals.slice(2).join(" "));
    } catch (e) {
      if (e instanceof FriendlyError) throw e;
      throw new FriendlyError(e.message, 1);
    }
    cfg.saveSettings(ctx.paths, next);
    out(ctx, "Saved " + positionals[1] + " = " + positionals.slice(2).join(" ") + " in " + ctx.paths.settings);
    return 0;
  }
  if (positionals.length) throw new UsageError("Unknown config action \"" + positionals[0] + "\".");
  const s = loadSettings(ctx);
  const rows = [];
  for (const id of cfg.ENGINE_IDS) {
    const e = s.engines[id];
    rows.push([id + ".provider", e.provider], [id + ".model", e.model], [id + ".thinking", e.thinking || "none"], [id + ".temperature", e.temperature === null ? "provider default" : String(e.temperature)]);
  }
  cfg.PASS_IDS.forEach(p => rows.push(["passes." + p, s.passes[p]]));
  ["runs", "maxRuns", "concurrency", "timeoutSeconds"].forEach(k => rows.push([k, String(s[k])]));
  rows.push(["reportsDir", s.reportsDir || "(default) " + ctx.paths.reports]);
  Object.entries(s.baseUrls).forEach(([k, v]) => rows.push(["baseUrls." + k, v]));
  out(ctx, ui.paint("bold", "Settings", ctx.color) + " (" + ctx.paths.settings + ")");
  out(ctx, ui.table(rows, { indent: "  " }));
  out(ctx, "");
  out(ctx, ui.paint("bold", "API keys", ctx.color));
  const keys = cfg.loadKeys(ctx.paths, ctx.env);
  const providers = [...new Set(cfg.ENGINE_IDS.map(id => s.engines[id].provider).concat(Object.keys(keys)))];
  out(ctx, ui.table(providers.map(p => [p, keys[p] ? "set (" + cfg.maskKey(keys[p]) + "), from " + cfg.keySource(ctx.paths, ctx.env, p) : "not set"]), { indent: "  " }));
  out(ctx, "");
  out(ctx, ui.paint("bold", "Folders", ctx.color));
  out(ctx, ui.table([["data", ctx.paths.data], ["reports", s.reportsDir || ctx.paths.reports], ["answers", ctx.paths.answers], ["keys file", ctx.paths.keysFile]], { indent: "  " }));
  out(ctx, "");
  out(ctx, "Change a setting: node rbi.js config set grade.model <model>   (keys: " + cfg.settingKeys().join(", ") + ")");
  return 0;
}

function writableDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, ".write-test-" + process.pid);
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return true;
  } catch (_) {
    return false;
  }
}

async function cmdDoctor(ctx, { flags }) {
  let ok = true;
  const rows = [];
  const mark = (good, text) => { if (!good) ok = false; return ui.paint(good ? "green" : "red", good ? "ok" : text || "problem", ctx.color); };
  const major = Number(process.versions.node.split(".")[0]);
  rows.push(["Node.js", process.version + " (needs 18 or newer)", mark(major >= 18)]);
  rows.push(["Data folder", ctx.paths.data, mark(writableDir(ctx.paths.data), "not writable")]);
  let settings;
  try {
    settings = cfg.loadSettings(ctx.paths);
    rows.push(["Settings", ctx.paths.settings, mark(true)]);
  } catch (e) {
    rows.push(["Settings", e.message, mark(false)]);
    settings = cfg.mergeSettings({});
  }
  const reportsDir = settings.reportsDir ? path.resolve(settings.reportsDir) : ctx.paths.reports;
  rows.push(["Reports folder", reportsDir, mark(writableDir(reportsDir), "not writable")]);
  const keys = cfg.loadKeys(ctx.paths, ctx.env);
  const pcs = {};
  for (const id of engineIdsInUse(settings)) {
    const name = id === "check" ? "Engine 1" : "Engine 2";
    let pc;
    try {
      pc = ai.providerConfig(settings.engines[id], keys, settings, ctx.env);
    } catch (e) {
      rows.push([name, e.message, mark(false)]);
      continue;
    }
    pcs[id] = pc;
    const source = cfg.keySource(ctx.paths, ctx.env, pc.id);
    const keyText = pc.apiKey ? "key " + cfg.maskKey(pc.apiKey) + " from " + source : pc.def.keyOptional ? "no key needed" : "no API key";
    rows.push([name, engineText(pc) + "; " + keyText, mark(pc.ready, "no API key")]);
  }
  out(ctx, ui.paint("bold", "RBI-Engine " + pkg.version + " doctor", ctx.color));
  out(ctx, ui.table(rows, { indent: "  " }));
  if (!flags.offline) {
    const ready = Object.entries(pcs).filter(([, pc]) => pc.ready);
    if (ready.length) out(ctx, "");
    for (const [id, pc] of ready) {
      const name = id === "check" ? "Engine 1" : "Engine 2";
      try {
        const r = await ai.testConnection(pc);
        out(ctx, "  " + name + ": replied in " + (r.ms / 1000).toFixed(1) + " s (" + r.modelUsed + ")" + (r.fallbackFrom ? " - \"" + r.fallbackFrom + "\" is not available, so " + r.model + " was used; change it with node rbi.js setup" : "") + " " + mark(!r.fallbackFrom, "check the model name"));
      } catch (e) {
        const x = ai.explainError(e, pc);
        out(ctx, "  " + name + ": " + mark(false, x.title) + " - " + x.body);
      }
    }
  }
  out(ctx, "");
  if (ok) out(ctx, "All checks passed." + (flags.offline ? " (Connection not tested: run without --offline to test it.)" : ""));
  else out(ctx, "Some checks failed. To set the AI provider and key run: node rbi.js setup");
  return ok ? 0 : 2;
}

async function cmdSetup(ctx) {
  if (!ctx.stdin.isTTY) {
    throw new FriendlyError("Setup needs an interactive terminal. Instead, set your key in an environment variable (for Gemini: GEMINI_API_KEY) and change models with: node rbi.js config set grade.model <model>.", 1);
  }
  const rl = readline.createInterface({ input: ctx.stdin, output: ctx.stdout, terminal: true });
  try {
    const s = loadSettings(ctx);
    const b = t => ui.paint("bold", t, ctx.color);
    out(ctx, b("RBI-Engine setup"));
    out(ctx, "Engine 1 builds the marking checklist and writes the final summary.");
    out(ctx, "Engine 2 gives the marks and writes the language and structure feedback.");
    out(ctx, "");
    const ids = Object.keys(ai.PROVIDERS);
    const pick = async (label, current) => {
      const i = await ui.choose(rl, label, ids.map(id => id + " - " + ai.PROVIDERS[id].label), { default: Math.max(0, ids.indexOf(current)) });
      return ids[i < 0 ? 0 : i];
    };
    const same = /^y/i.test(await ui.ask(rl, "Use the same provider for both engines? (y/n)", { default: "y" }));
    let next = s;
    const providers = {};
    providers.check = await pick("Provider for engine 1", s.engines.check.provider);
    providers.grade = same ? providers.check : await pick("Provider for engine 2", s.engines.grade.provider);
    for (const id of ["check", "grade"]) {
      const name = id === "check" ? "Engine 1" : "Engine 2";
      const p = providers[id];
      next = cfg.setSetting(next, id + ".provider", p);
      const currentModel = s.engines[id].provider === p ? s.engines[id].model : ai.PROVIDERS[p].defaultModel;
      next = cfg.setSetting(next, id + ".model", await ui.ask(rl, name + " model", { default: currentModel }));
      if (ai.PROVIDERS[p].kind === "gemini") {
        const t = await ui.ask(rl, name + " thinking level (low, medium, high, none)", { default: s.engines[id].thinking || (id === "check" ? "low" : "high") });
        try { next = cfg.setSetting(next, id + ".thinking", t); } catch (e) { out(ctx, e.message + " Keeping " + (next.engines[id].thinking || "none") + "."); }
      }
    }
    for (const p of new Set(Object.values(providers))) {
      const def = ai.PROVIDERS[p];
      if (def.customBaseUrl) next = cfg.setSetting(next, "baseUrls." + p, await ui.ask(rl, "Server address for " + def.label, { default: next.baseUrls[p] || def.baseUrl }));
      const envName = (cfg.ENV_KEYS[p] || []).find(n => ctx.env[n] && !cfg.isPlaceholderKey(ctx.env[n]));
      if (envName) {
        out(ctx, envName + " is set in your environment, so that key is used for " + def.label + ".");
        continue;
      }
      if (def.keyUrl) out(ctx, "Get a " + def.label + " key at " + def.keyUrl + (def.keyHint ? " (it " + def.keyHint + ")" : "") + ".");
      const current = cfg.loadKeys(ctx.paths, {})[p];
      const key = await ui.ask(rl, "API key for " + def.label + (current ? " (Enter keeps " + cfg.maskKey(current) + ")" : def.keyOptional ? " (optional)" : ""), { hidden: true });
      if (key) {
        cfg.saveKey(ctx.paths, p, key);
        out(ctx, "Saved the key to " + ctx.paths.keysFile + " (only your user can read it; it is never stored in the repo).");
      }
    }
    cfg.saveSettings(ctx.paths, next);
    out(ctx, "Settings saved to " + ctx.paths.settings + ".");
    const test = /^y/i.test(await ui.ask(rl, "Test the connection now? This sends one tiny request to each engine. (y/n)", { default: "y" }));
    rl.close();
    if (test) {
      const code = await cmdDoctor(ctx, { flags: {} });
      if (code) return code;
    }
    out(ctx, "Setup done. Try: node rbi.js analyse examples/sample-esi-15m.txt");
    return 0;
  } finally {
    rl.close();
  }
}

function help(ctx, topic) {
  const b = t => ui.paint("bold", t, ctx.color);
  const cmd = topic ? (topic === "analyze" || topic === "a" ? "analyse" : topic) : "";
  if (cmd && HELP[cmd]) {
    const h = HELP[cmd];
    out(ctx, b(h.usage));
    out(ctx, ui.wrap(h.about, 90));
    if (h.options.length) {
      out(ctx, "");
      h.options.forEach(([o, d]) => out(ctx, ui.wrap(d, 90, "      ", "  " + o + "\n      ")));
    }
    return 0;
  }
  out(ctx, b("RBI-Engine " + pkg.version) + " - analyse RBI Grade B Phase-2 descriptive answers with AI");
  out(ctx, "");
  out(ctx, "Usage: node rbi.js <command> [options]   (or just: node rbi.js  for the menu)");
  out(ctx, "");
  out(ctx, ui.table([
    ["analyse <file>", "Marks, every mistake, structure advice, model answer and a plan"],
    ["new", "Create an answer file to fill in"],
    ["history", "Past analyses"],
    ["progress", "Trends and the mistakes that keep coming back"],
    ["show [N]", "Show a past report again"],
    ["setup", "Choose the AI provider and save your API key"],
    ["doctor", "Check that everything works"],
    ["config", "Show or change settings"],
    ["help <command>", "Help for one command"]
  ], { indent: "  " }));
  out(ctx, "");
  out(ctx, "First time: node rbi.js setup, then node rbi.js analyse examples/sample-esi-15m.txt");
  return 0;
}

function candidateFiles(ctx) {
  const seen = new Set();
  const found = [];
  const add = (dir, test) => {
    let names = [];
    try { names = fs.readdirSync(dir); } catch (_) { return; }
    for (const n of names) {
      const file = path.join(dir, n);
      if (!test(n) || seen.has(file)) continue;
      try {
        const st = fs.statSync(file);
        if (!st.isFile()) continue;
        seen.add(file);
        found.push({ file, mtime: st.mtimeMs });
      } catch (_) {}
    }
  };
  add(ctx.paths.answers, n => /\.(txt|md|docx)$/i.test(n));
  add(path.join(os.homedir(), "Downloads"), n => /^Practice_.*\.txt$/i.test(n));
  add(process.cwd(), n => /^Practice_.*\.txt$/i.test(n));
  return found.sort((a, b) => b.mtime - a.mtime).slice(0, 12).map(x => x.file);
}

async function menuAnalyse(ctx) {
  const rl = readline.createInterface({ input: ctx.stdin, output: ctx.stdout, terminal: true });
  let file;
  let quick;
  try {
    const files = candidateFiles(ctx);
    const sample = path.join(ctx.paths.examples, "sample-esi-15m.txt");
    const options = files.map(f => path.basename(f) + "  (" + path.dirname(f) + ")").concat(["Type the path of a file", "The sample answer (" + path.relative(process.cwd(), sample) + ")"]);
    const i = await ui.choose(rl, "Which answer file?", options, { default: files.length ? 0 : options.length - 1 });
    if (i < 0) return 1;
    if (i < files.length) file = files[i];
    else if (i === files.length) file = stripQuotes(await ui.ask(rl, "Path (you can drag the file into this window)"));
    else file = sample;
    if (!file) return 1;
    quick = /^y/i.test(await ui.ask(rl, "Quick analysis with fewer AI calls? (y/n)", { default: "n" }));
  } finally {
    rl.close();
  }
  const code = await run(ctx, "analyse", { flags: { quick }, positionals: [file] });
  if (ctx.lastReport && code !== 130) {
    const rl2 = readline.createInterface({ input: ctx.stdin, output: ctx.stdout, terminal: true });
    try {
      if (/^y/i.test(await ui.ask(rl2, "Open the full report in your browser? (y/n)", { default: "y" }))) openFile(ctx, ctx.lastReport.html);
    } finally {
      rl2.close();
    }
  }
  return code;
}

async function menuNew(ctx) {
  const rl = readline.createInterface({ input: ctx.stdin, output: ctx.stdout, terminal: true });
  try {
    const papers = ["ESI", "Finance", "Management", "English", "Other"];
    const p = await ui.choose(rl, "Which paper?", papers, { default: 0 });
    const paper = papers[p < 0 ? 0 : p];
    const marks = Number(await ui.ask(rl, "Maximum marks", { default: paper === "English" ? "40" : "15" })) || 15;
    const topic = await ui.ask(rl, "Topic (optional)", { default: "" });
    rl.close();
    const code = cmdNew(ctx, { flags: { paper, marks, topic } });
    const rl2 = readline.createInterface({ input: ctx.stdin, output: ctx.stdout, terminal: true });
    try {
      if (/^y/i.test(await ui.ask(rl2, "Open the file now? (y/n)", { default: "y" }))) openFile(ctx, ctx.lastNew);
    } finally {
      rl2.close();
    }
    return code;
  } finally {
    rl.close();
  }
}

async function menu(ctx) {
  for (;;) {
    out(ctx, "");
    out(ctx, ui.paint("bold", "RBI-Engine", ctx.color) + " - analyse RBI Grade B Phase-2 descriptive answers");
    const rl = readline.createInterface({ input: ctx.stdin, output: ctx.stdout, terminal: true });
    let choice;
    try {
      choice = await ui.choose(rl, "", ["Analyse an answer file", "Create a new answer file", "History", "Progress", "Setup (AI provider and key)", "Check the setup", "Help", "Exit"], { default: 0 });
    } finally {
      rl.close();
    }
    if (choice < 0 || choice === 7) return 0;
    if (choice === 0) await guarded(ctx, () => menuAnalyse(ctx));
    else if (choice === 1) await guarded(ctx, () => menuNew(ctx));
    else if (choice === 2) await run(ctx, "history", { flags: {}, positionals: [] });
    else if (choice === 3) await run(ctx, "progress", { flags: {}, positionals: [] });
    else if (choice === 4) await run(ctx, "setup", { flags: {}, positionals: [] });
    else if (choice === 5) await run(ctx, "doctor", { flags: {}, positionals: [] });
    else help(ctx);
  }
}

const COMMANDS = {
  analyse: { flags: ANALYSE_FLAGS, run: cmdAnalyse },
  new: { flags: { paper: "string", marks: "number", words: "number", topic: "string", name: "string", open: "boolean" }, run: cmdNew },
  history: { flags: { limit: "number", paper: "string" }, run: cmdHistory },
  progress: { flags: { paper: "string" }, run: cmdProgress },
  show: { flags: { open: "boolean", full: "boolean" }, run: cmdShow },
  config: { flags: {}, run: cmdConfig },
  doctor: { flags: { offline: "boolean" }, run: cmdDoctor },
  setup: { flags: {}, run: cmdSetup }
};
const ALIASES = { analyze: "analyse", a: "analyse" };

function report(ctx, e, cmd) {
  if (e instanceof UsageError) {
    err(ctx, e.message + " Run: node rbi.js help" + (cmd ? " " + cmd : ""));
    return 1;
  }
  if (e instanceof InputError || e instanceof FriendlyError) {
    err(ctx, e.message);
    return e.code && e instanceof FriendlyError ? e.code : 1;
  }
  if (e instanceof ai.AIError) {
    const x = ai.explainError(e, e.pc);
    err(ctx, x.title + ": " + x.body);
    return SETUP_KINDS.has(e.kind) ? 2 : 3;
  }
  err(ctx, "Unexpected error: " + ((e && e.stack) || e));
  return 1;
}

async function run(ctx, cmd, args) {
  try {
    return await COMMANDS[cmd].run(ctx, args);
  } catch (e) {
    return report(ctx, e, cmd);
  }
}

async function guarded(ctx, fn) {
  try {
    return await fn();
  } catch (e) {
    return report(ctx, e, "");
  }
}

async function main(argv, io = {}) {
  const ctx = {
    stdout: io.stdout || process.stdout,
    stderr: io.stderr || process.stderr,
    stdin: io.stdin || process.stdin,
    env: io.env || process.env
  };
  ctx.paths = enginePaths(ctx.env);
  ctx.color = ui.colorEnabled(ctx.stdout, ctx.env);
  const [first, ...rest] = argv;
  let cmd = "";
  try {
    if (!first) {
      if (ctx.stdin.isTTY && ctx.stdout.isTTY) return await menu(ctx);
      return help(ctx);
    }
    if (first === "--version" || first === "-v" || first === "version") { out(ctx, pkg.version); return 0; }
    if (first === "--help" || first === "-h" || first === "help") return help(ctx, rest[0]);
    cmd = ALIASES[first] || first;
    if (!COMMANDS[cmd]) { cmd = ""; throw new UsageError("Unknown command \"" + first + "\"."); }
    const args = parseArgs(rest, Object.assign({}, COMMON_FLAGS, COMMANDS[cmd].flags));
    if (args.flags.help) return help(ctx, cmd);
    if (args.flags["no-color"]) { ctx.color = false; ctx.noColor = true; }
    else if (args.flags.color) ctx.color = true;
    return await COMMANDS[cmd].run(ctx, args);
  } catch (e) {
    return report(ctx, e, cmd);
  }
}

module.exports = { main, parseArgs, UsageError, exitCodeFor, parseOnly };
