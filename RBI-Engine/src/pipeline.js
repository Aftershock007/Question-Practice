"use strict";

const ai = require("./ai");
const { engineForPass } = require("./config");
const { requestKey } = require("./cache");
const T = require("./text");
const R = require("./rubric");
const { mechanicalChecks } = require("./checks");
const { median, clamp, fmt } = require("./util");
const { combineRuns, needsMoreRuns, crossCheckReason, spreadOf, RUN_SPREAD } = require("./aggregate");
const schemePass = require("./passes/scheme");
const scorePass = require("./passes/score");
const languagePass = require("./passes/language");
const coachPass = require("./passes/coach");
const synthesisPass = require("./passes/synthesis");

const PASSES = { scheme: schemePass, score: scorePass, language: languagePass, coach: coachPass, synthesis: synthesisPass };
const FATAL = new Set(["quota", "auth", "permission", "not_configured", "cancelled", "privacy"]);

const NOT_ATTEMPTED = "You did not write anything for this question, so it scores 0 - the same as in the real exam. Even a short structured attempt (a one-line definition, three numbered points and a one-line way forward) earns marks, so never leave a question blank.";

function localAnalysis(q) {
  const units = T.splitUnits(q.answer);
  const paras = T.paragraphs(q.answer);
  return {
    units,
    paras,
    stats: T.structureStats(q.answer, { track: q.track, wordLimit: q.wordLimit, seconds: q.seconds }),
    commandWords: R.detectCommandWords(q.question),
    band: R.wordBand(q.track, q.words, q.wordLimit),
    idealMinutes: R.idealMinutes(q.track, q.marks)
  };
}

function notAttemptedMarks(q) {
  const g = R.gradeFor(0);
  return {
    params: R.paramMaxima(q.track, q.marks).map(p => Object.assign({}, p, { awarded: 0, cap: "", why: "" })),
    penalties: [], checks: [], anchorCount: 0, checklist: [], subparts: [], coverage: null,
    rawSum: 0, penaltySum: 0, ceiling: R.ceilingFor(q.track, q.marks), ceilingApplied: false,
    autoFail: false, offTopic: false, notAttempted: true,
    score: 0, percent: 0, grade: g.grade, gradeLabel: g.label, projection: null,
    rules: [], content: null,
    consistency: { runs: [], spread: 0, method: "not attempted", base: -1, extraRuns: 0, reason: "" }
  };
}

function engineLabel(pc) {
  return pc.def.label + " · " + pc.model + (pc.thinking ? " (thinking " + pc.thinking + ")" : "");
}

function fallbackScheme(q) {
  return {
    subparts: [{ id: "S1", part: "Main question", expects: "Answer the question exactly as asked." }],
    points: [],
    outline: schemePass.withWords(schemePass.defaultOutline(q.track), q.wordLimit),
    dimensions: [],
    fallback: true
  };
}

async function analyseQuestion(q, deps, hooks = {}) {
  const state = deps.state || (deps.state = { abort: null, inflight: new Map() });
  const started = Date.now();
  const local = localAnalysis(q);
  const mechanical = mechanicalChecks({ text: q.answer, units: local.units, paras: local.paras, track: q.track, question: q.question });
  const status = { failed: [], skipped: [], warnings: [], cached: 0, calls: 0, usage: null, models: {}, fallbackFrom: [], fatal: null, durationMs: 0 };
  if (deps.debug) status.debug = [];
  const emit = (pass, st, message, ms) => { if (hooks.onEvent) hooks.onEvent({ q: q.index, pass, status: st, message: message || "", ms: ms || 0 }); };

  if (!q.words) {
    status.durationMs = Date.now() - started;
    return { q, local, mechanical, scheme: null, marks: notAttemptedMarks(q), language: null, coach: null, coaching: { summary: NOT_ATTEMPTED, strengths: [], priorities: [], drills: [], plan: [], fallback: true }, status };
  }

  const settings = deps.settings;
  const env = deps.env || process.env;
  const generate = deps.generate || ai.callModel;
  const pcs = {};
  for (const id of ["check", "grade"]) pcs[id] = ai.providerConfig(settings.engines[id], deps.keys || {}, settings, env);
  for (const id of new Set(Object.keys(PASSES).map(p => engineForPass(settings, p)))) {
    if (!pcs[id].ready) throw new ai.AIError("not_configured", "No API key for " + pcs[id].def.label + ".", { pc: pcs[id] });
    status.models[id] = engineLabel(pcs[id]);
  }
  const pcFor = pass => pcs[engineForPass(settings, pass)];
  const timeoutMs = (Number(settings.timeoutSeconds) || 420) * 1000;
  const describe = err => ({ kind: err.kind, message: err.message, detail: err.detail || "" });
  const noteAbort = () => { if (state.abort && !status.fatal) status.fatal = describe(state.abort); };

  function runPass(passName, label, req, extra, normalizeFn, opts = {}) {
    const pc = pcFor(passName);
    const useCache = opts.useCache !== false;
    const key = requestKey({ pass: passName, v: PASSES[passName].VERSION, provider: pc.id, model: pc.model, thinking: pc.thinking, temperature: pc.temperature, system: req.system, prompt: req.prompt, extra: extra || null });
    if (state.inflight.has(key)) {
      return state.inflight.get(key).then(r => { status.cached++; emit(label, "cached"); return r; });
    }
    const p = (async () => {
      if (!deps.fresh && useCache) {
        const hit = deps.cache.get(key);
        if (hit && hit.data) {
          try {
            const out = normalizeFn(hit.data);
            status.cached++;
            emit(label, "cached");
            return { out, meta: hit.meta || {} };
          } catch (_) {}
        }
      }
      emit(label, "queued");
      return deps.limiter(async () => {
        if (state.abort) throw new ai.AIError("skipped", "Skipped: " + state.abort.message);
        emit(label, "running");
        const t0 = Date.now();
        let lastErr = null;
        for (let round = 1; round <= 2; round++) {
          let res;
          try {
            res = await generate(pc, { system: req.system, prompt: req.prompt, json: true, schema: req.schema }, { timeoutMs, signal: deps.signal, onStatus: m => emit(label, "retrying", m) });
          } catch (err) {
            if (round === 1 && err && (err.kind === "bad_response" || err.kind === "truncated")) {
              lastErr = err;
              emit(label, "retrying", "The reply was incomplete - asking again");
              continue;
            }
            if (err && FATAL.has(err.kind) && !state.abort) state.abort = err;
            throw err;
          }
          status.calls++;
          status.usage = ai.addUsage(status.usage, res.usage);
          if (res.fallbackFrom) status.fallbackFrom.push(res.fallbackFrom + " -> " + res.model);
          if (status.debug) status.debug.push({ pass: label, system: req.system, prompt: req.prompt, reply: res.text });
          const obj = ai.extractJSON(res.text);
          if (obj) {
            try {
              const out = normalizeFn(obj);
              const meta = { provider: pc.id, model: res.model || pc.model, modelUsed: res.modelUsed || "", usage: res.usage || null, ms: Date.now() - t0 };
              if (!deps.cache.set(key, { data: obj, meta, createdAt: new Date().toISOString() }) && deps.cache.lastError) {
                status.warnings.push("Could not save to the cache (" + deps.cache.lastError.message + "); the next run will ask the AI again.");
              }
              emit(label, "done", "", meta.ms);
              return { out, meta };
            } catch (err) {
              lastErr = err;
            }
          } else {
            lastErr = new ai.AIError(res.finish === "length" ? "truncated" : "format", "The reply was not valid JSON.");
          }
          if (round === 1) emit(label, "retrying", "The reply was not in the expected format - asking again");
        }
        throw lastErr || new ai.AIError("format", "No usable reply.");
      });
    })();
    state.inflight.set(key, p);
    return p.finally(() => { if (state.inflight.get(key) === p) state.inflight.delete(key); });
  }

  async function attempt(passName, label, req, extra, normalizeFn, opts) {
    try {
      return await runPass(passName, label, req, extra, normalizeFn, opts);
    } catch (err) {
      const kind = (err && err.kind) || "error";
      const message = (err && err.message) || String(err);
      if (kind === "skipped") {
        status.skipped.push(label);
        noteAbort();
        emit(label, "skipped", message);
        return null;
      }
      if (FATAL.has(kind)) {
        if (!state.abort) state.abort = err;
        status.fatal = status.fatal || describe(err);
      }
      status.failed.push({ pass: label, kind, message, detail: (err && err.detail) || "" });
      emit(label, "failed", message);
      return null;
    }
  }

  let scheme = null;
  if (!deps.rebuildChecklist) {
    const rec = deps.schemes.get(q.qhash);
    if (rec && rec.scheme && Array.isArray(rec.scheme.points)) {
      scheme = rec.scheme;
      status.cached++;
      emit("checklist", "cached");
    }
  }
  if (!scheme) {
    const r = await attempt("scheme", "checklist", schemePass.build(q), null, obj => schemePass.normalize(obj, q), { useCache: !deps.rebuildChecklist });
    if (r) {
      scheme = r.out;
      deps.schemes.set(q.qhash, { version: schemePass.VERSION, createdAt: new Date().toISOString(), model: r.meta.model || "", scheme });
    }
  }
  const scoringScheme = scheme && scheme.points.length ? scheme : null;
  const coachScheme = scheme || fallbackScheme(q);

  async function runScoring() {
    const autoFail = (q.track === "A" || q.track === "B") && q.words < 60;
    const N = autoFail || deps.quick ? 1 : clamp(Number(deps.runs) || Number(settings.runs) || 3, 1, 5);
    const maxRuns = autoFail ? 1 : Math.max(N, Number(settings.maxRuns) || 5);
    let next = 1;
    const one = (full) => {
      const idx = next++;
      return attempt("score", "grading " + idx, scorePass.build(q, local, scoringScheme, { full }), { run: (full ? "full-" : "score-") + idx },
        obj => scorePass.normalize(obj, q, local, scoringScheme, { full }))
        .then(r => (r ? Object.assign(r.out, { idx }) : null));
    };
    const initial = [];
    for (let i = 0; i < N; i++) initial.push(one(i === 0));
    let runs = (await Promise.all(initial)).filter(Boolean);
    let extra = 0;
    let reason = "";
    const canMore = () => !state.abort && runs.length < maxRuns;
    const add = async (list) => {
      const got = (await Promise.all(list)).filter(Boolean);
      runs = runs.concat(got);
      extra += got.length;
    };
    if (runs.length && !runs.some(r => r.full) && !autoFail && canMore()) await add([one(true)]);
    if (!runs.length) return null;
    if (N === 1 && !autoFail) {
      if (!state.abort) {
        reason = crossCheckReason(runs[0], scoringScheme, q);
        if (reason && canMore()) await add([one(false)]);
        if (runs.length === 2 && needsMoreRuns(runs, q.marks) && canMore()) await add([one(false)]);
      }
    } else if (needsMoreRuns(runs, q.marks) && canMore()) {
      reason = "the first gradings differed by " + fmt(spreadOf(runs)) + " marks";
      const med = median(runs.map(r => r.final));
      const fullRun = runs.find(r => r.full);
      const outlier = !!fullRun && Math.abs(fullRun.final - med) > RUN_SPREAD * q.marks;
      const count = Math.min(2, maxRuns - runs.length);
      const batch = [];
      for (let k = 0; k < count; k++) batch.push(one(outlier && k === 0));
      await add(batch);
    }
    runs.sort((a, b) => a.idx - b.idx);
    const marks = combineRuns(runs, q, scoringScheme);
    marks.consistency.extraRuns = extra;
    marks.consistency.reason = reason;
    return marks;
  }

  const langP = attempt("language", "language", languagePass.build(q, local.units), null, obj => languagePass.normalize(obj, q, local.units));
  const scoreP = runScoring();
  const coachP = attempt("coach", "coach", coachPass.build(q, local, coachScheme), null, obj => coachPass.normalize(obj, q, local, coachScheme));
  const [langR, marks, coachR] = await Promise.all([langP, scoreP, coachP]);
  const language = langR ? langR.out : null;
  const coach = coachR ? coachR.out : null;

  let coaching;
  if (state.abort) {
    noteAbort();
    status.skipped.push("summary");
    emit("summary", "skipped", "Skipped: " + state.abort.message);
    coaching = synthesisPass.fallbackCoaching(q, marks, language, coach);
  } else {
    const digest = synthesisPass.digestFor(q, local, marks, language, coach, mechanical);
    const r = await attempt("synthesis", "summary", synthesisPass.build(digest), null, obj => synthesisPass.normalize(obj));
    coaching = r ? r.out : synthesisPass.fallbackCoaching(q, marks, language, coach);
  }
  status.durationMs = Date.now() - started;
  return { q, local, mechanical, scheme, marks, language, coach, coaching, status };
}

async function analyseQuestions(questions, deps, hooks = {}) {
  if (!deps.state) deps.state = { abort: null, inflight: new Map() };
  return Promise.all(questions.map(q => analyseQuestion(q, deps, hooks)));
}

module.exports = { analyseQuestion, analyseQuestions, localAnalysis, notAttemptedMarks, FATAL, NOT_ATTEMPTED };
