"use strict";
// ============================================================================
// AI check of imported DESCRIPTIVE (subjective) questions
// ----------------------------------------------------------------------------
// After a DOCX/PDF upload, when you press "AI Check", model 1 ("check" engine) reads
// every subjective question with its model answer and confirms that the
// question is complete, the model answer belongs to it and is complete, and
// that the model answer has no clear factual error. Problems are listed under
// "Needs attention" on the setup screen. Uses helpers from app.js
// ($, escapeHTML, state, saveSetup, renderSetupList, startQuestionEdit...).
// ============================================================================

const DESC_VERIFY_BATCH = 4;
const DESC_VERIFY_PARALLEL = 2;
const descVerify = { running: false, total: 0, done: 0, controller: null, error: "" };

// "ok" | "unchecked" | "pending" | "failed" | "issue" for one descriptive question
function descStatus(q) {
  const c = q && q.check;
  if (!c) return "unchecked";
  if (c.user === "ok") return "ok";
  if (!c.ai) return "unchecked";
  if (c.ai.status === "pending") return "pending";
  if (c.ai.status === "error") return "failed";
  return c.ai.status === "issue" ? "issue" : "ok";
}

const DESC_VERIFY_SYSTEM =
  "You are a meticulous RBI Grade B Phase-2 examiner (ESI, Finance & Management, English) checking a bank of descriptive questions that a practice app extracted automatically from a Word/PDF file. " +
  "Reply with exactly one valid JSON object - no markdown, no text before or after it.";

// Long texts are sent in full; only beyond these sizes is a text shortened (and the AI is told so)
const DESC_MAX_ANSWER = 14000;
const DESC_MAX_PASSAGE = 8000;
function descClip(text, max) {
  const t = String(text || "");
  return t.length <= max ? t : t.slice(0, max) + "\n[... shortened by the app for this check only; the full text is in the file]";
}

// The prompt for one batch of descriptive questions
function descVerifyPrompt(batch) {
  const L = [];
  L.push("These descriptive questions and their model answers were extracted automatically from a DOCX/PDF file. Extraction can go wrong: a question can be cut off or merged with a heading, with the previous answer or with the next question; a model answer can be cut off, belong to another question or contain the next question; marks and word limits can be read wrongly.");
  L.push("Each question shows the app's own extraction check: whether the text was found word for word in the file, and what the file contains right after the model answer (normally the next question).");
  L.push("");
  L.push("For EVERY question below decide:");
  L.push("1. question_ok: the question text is complete and readable on its own. If it refers to a passage, case or table, that passage must be given (it is shown as \"Passage / data\").");
  L.push("2. answer_ok: the model answer belongs to this question and the extraction did not cut it off or merge it with another question. Judge this against the file: when the text was found word for word and the file continues with the next question (or ends), the extraction is complete, so answer_ok is true even if the answer itself ends abruptly in the file (say that in \"note\"). If no model answer is given, answer_ok is true.");
  L.push("3. facts_ok: false ONLY for a clear, certain error in a long-established fact (a wrong law, institution, definition or historical figure). The model answers can contain recent figures, reports, base-year revisions and events (2024-2026) that are newer than your knowledge: never mark those as errors. When in doubt, facts_ok is true.");
  L.push("4. marks_ok: the marks and word limit are plausible for an RBI Grade B Phase-2 question of this kind (usually 10 or 15 marks, about 30-40 words per mark).");
  L.push("5. topic: the sub-topic in 2-5 words (e.g. \"Monetary Policy Transmission\", \"Working Capital\", \"Precis Writing\").");
  L.push("6. problem: only when question_ok or answer_ok is false: one or two short plain sentences on what exactly is wrong with the extraction; otherwise \"\".");
  L.push("7. note: only when facts_ok or marks_ok is false (or the answer ends abruptly in the file): one short plain sentence (quote the doubtful fact and give the correct one); otherwise \"\".");
  L.push("8. key_points: the FIXED marking checklist used to grade every attempt at this question. 5-10 concrete, checkable points (a concept, cause, effect, figure, example, framework or recommendation) taken from the model answer and from what the question explicitly asks; without a model answer, the points an RBI examiner expects for full marks. weight: 3 = core, 2 = important, 1 = supporting.");
  L.push("");
  L.push('Return ONE JSON object: {"results": [{"n": the question\'s n, "question_ok": true or false, "answer_ok": true or false, "facts_ok": true or false, "marks_ok": true or false, "problem": "...", "note": "...", "topic": "...", "key_points": [{"point": "...", "weight": 1 | 2 | 3}]}]}');
  L.push("Include every question exactly once, in the same order.");
  L.push("");
  L.push("QUESTIONS");
  batch.forEach((q, i) => {
    L.push("");
    L.push(`[n=${i + 1}] Paper: ${q.paper || "Other"} · ${q.marks} marks · word limit ${q.wordLimit}`);
    if (q.passage) L.push("Passage / data:\n" + descClip(q.passage, DESC_MAX_PASSAGE));
    L.push("Question: " + q.text);
    L.push("Model answer: " + (q.modelAnswer ? descClip(q.modelAnswer, DESC_MAX_ANSWER) : "(none given)"));
    if (q.src) {
      L.push("App's extraction check: " + (q.src.verbatim ? "question and model answer found word for word in the file." : "the text could NOT be found word for word in the file."));
      L.push("In the file, right after the model answer: " + (q.src.after ? "\u201c" + q.src.after + "\u201d" : "the end of the file."));
    }
  });
  return L.join("\n");
}

// Ask the AI about one batch; returns the questions it skipped
async function descVerifyBatch(batch, signal) {
  const res = await AIEval.runJSON({
    role: "check",
    system: DESC_VERIFY_SYSTEM,
    prompt: descVerifyPrompt(batch),
    signal,
    validate: o => Array.isArray(o && o.results)
  });
  const results = res.data.results;
  if (res.usage && typeof mcqAddUsage === "function") descVerify.usage = mcqAddUsage(descVerify.usage, res.usage);
  const missing = [];
  batch.forEach((q, i) => {
    const r = results.find(x => Number(x && x.n) === i + 1) || (results.length === batch.length ? results[i] : null);
    if (!r || typeof r !== "object") { missing.push(q); return; }
    const txt = v => (typeof v === "string" ? v.trim().slice(0, 600) : "");
    let problem = txt(r.problem);
    const note = txt(r.note);
    // "Needs attention" is for a broken extraction (question / answer cut or merged) only
    const bad = [];
    if (r.question_ok === false) bad.push("question");
    if (r.answer_ok === false) bad.push("answer");
    const notes = [];
    // the text is word for word in the file and the file goes on with the next question: an
    // answer that "ends abruptly" ends that way in your file, the extraction is not at fault
    const endsInFile = q.src && q.src.verbatim &&
      (!q.src.after || /^(?:Q(?:uestion)?\s*[.\-]?\s*\d|Question\b|\d{1,3}\s*[.)]|Case\s*Study|Passage|Directions?|Read\s+the|Section|Part|Chapter)/i.test(q.src.after));
    if (bad.includes("answer") && endsInFile && /cut\s*off|mid-?\s*(?:sentence|word)|truncat|incomplete|ends?\s+abrupt|unfinished|ends\s+mid/i.test(problem + " " + note)) {
      bad.splice(bad.indexOf("answer"), 1);
      notes.push("The model answer in your file seems to end abruptly" + (problem ? ": " + problem : "."));
      if (!bad.length) problem = "";
    }
    if (r.facts_ok === false) notes.push(note || "The AI doubts a fact in the model answer.");
    if (r.marks_ok === false) notes.push("The marks or word limit look unusual for this question" + (note && r.facts_ok !== false ? ": " + note : "."));
    if (!notes.length && note && !bad.length) notes.push(note);
    const topic = typeof r.topic === "string" ? r.topic.trim().slice(0, 60) : "";
    q.check.ai = {
      status: bad.length ? "issue" : "ok",
      bad,
      note: bad.length ? problem : "",
      notes,
      topic,
      model: res.model
    };
    // the AI's sub-topic replaces none, or a document title the parser used as the topic
    if (topic && (!q.topic || /practice|descriptive|questions?\b|answer\s*writing|mock|test\b/i.test(q.topic))) q.topic = topic;
    // the reference checklist for consistent marks, built from the answer you uploaded
    if (AIEval.storeScheme && Array.isArray(r.key_points)) AIEval.storeScheme(q, { points: r.key_points });
  });
  return missing;
}

// Check every subjective question that has no AI verdict yet (or the given ones)
async function descVerifyQuestions(only) {
  if (descVerify.running || !window.AIEval || !AIEval.isReady("check")) return;
  const all = state.setup.questions || [];
  all.forEach(q => { if (!q.check) q.check = { ai: null, user: "" }; });
  const todo = (only || all.filter(q => !q.check.user && (!q.check.ai || q.check.ai.status === "pending" || q.check.ai.status === "error")))
    .filter(q => q.text && q.text.trim());
  if (!todo.length) return;
  todo.forEach(q => { q.check.ai = { status: "pending" }; });
  saveSetup();
  const batches = [];
  for (let i = 0; i < todo.length; i += DESC_VERIFY_BATCH) batches.push(todo.slice(i, i + DESC_VERIFY_BATCH));
  Object.assign(descVerify, { running: true, total: todo.length, done: 0, controller: new AbortController(), error: "", usage: null });
  renderSetupList();
  let next = 0;
  const worker = async () => {
    while (next < batches.length && !descVerify.controller.signal.aborted) {
      const batch = batches[next++];
      try {
        let missing = await descVerifyBatch(batch, descVerify.controller.signal);
        if (missing.length) missing = await descVerifyBatch(missing, descVerify.controller.signal);
        missing.forEach(q => { q.check.ai = { status: "error", note: "the AI reply skipped it" }; });
      } catch (err) {
        const ex = AIEval.explain(err, "check");
        batch.forEach(q => { if (q.check.ai && q.check.ai.status === "pending") q.check.ai = err.kind === "cancelled" ? null : { status: "error", note: ex.title }; });
        if (err.kind !== "cancelled") descVerify.error = ex.title + ": " + ex.body;
      }
      descVerify.done += batch.length;
      saveSetup();
      renderSetupList();
    }
  };
  await Promise.all(Array.from({ length: Math.min(DESC_VERIFY_PARALLEL, batches.length) }, worker));
  (state.setup.questions || []).forEach(q => { if (q.check && q.check.ai && q.check.ai.status === "pending") q.check.ai = null; });
  descVerify.running = false;
  saveSetup();
  renderSetupList();
}

// A check left "pending" by a reload can never finish: it is simply not checked yet
function descClearStalePending() {
  if (descVerify.running) return;
  (state.setup.questions || []).forEach(q => { if (q.check && q.check.ai && q.check.ai.status === "pending") q.check.ai = null; });
}

// Plain reasons for "Needs attention"
function descIssueReasons(q) {
  const ai = (q.check && q.check.ai) || {};
  const names = { question: "The question text looks incomplete or mixed with other text.", answer: "The model answer looks cut off or mixed with another question.", facts: "The model answer seems to contain a factual error.", marks: "The marks or word limit look wrong." };
  const out = (ai.bad || []).map(b => names[b]).filter(Boolean);
  if (ai.note) out.push("AI: " + ai.note);
  return out.length ? out : ["The AI flagged this question."];
}

// The small status pill shown on each question of the setup list
function descStatusPill(q) {
  const st = descStatus(q);
  if (st === "ok") {
    if (q.check && q.check.user === "ok") return `<span class="p1-chk p1-chk-ok">Checked by you</span>`;
    const notes = (q.check && q.check.ai && q.check.ai.notes) || [];
    return `<span class="p1-chk p1-chk-ok">AI checked</span>` + (notes.length ? `<span class="p1-chk p1-chk-note" title="${escapeHTML(notes.join(" "))}">AI note</span>` : "");
  }
  if (st === "pending") return `<span class="p1-chk p1-chk-pending">Checking…</span>`;
  if (st === "failed") return `<span class="p1-chk p1-chk-failed">AI check failed</span>`;
  if (st === "issue") return `<span class="p1-chk p1-chk-failed">Needs attention</span>`;
  return window.AIEval && AIEval.isReady("check") ? `<span class="p1-chk">Not AI-checked</span>` : "";
}

// The AI's notes on a question that passed (a doubtful fact, unusual marks): shown, never blocking
function descNotesHTML(q) {
  const notes = (q && q.check && q.check.ai && q.check.ai.status === "ok" && !q.check.user && q.check.ai.notes) || [];
  return notes.length ? `<ul class="desc-ai-notes">${notes.map(n => `<li>${escapeHTML(n)}</li>`).join("")}</ul>` : "";
}

// Summary, "AI Check" button and the "Needs attention" list above the subjective question list
function renderDescCheckPanel() {
  const box = $("setup-check");
  if (!box) return;
  descClearStalePending();
  const qs = state.setup.questions || [];
  const start = $("btn-start-test");
  if (start) {
    start.disabled = descVerify.running;
    start.textContent = descVerify.running ? "Checking questions with AI…" : "Start Subjective Test";
  }
  if (!qs.length) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  const ready = window.AIEval && AIEval.isReady("check");
  const count = st => qs.filter(q => descStatus(q) === st).length;
  const issues = qs.filter(q => descStatus(q) === "issue");
  const notChecked = count("unchecked") + count("failed");
  let row;
  if (descVerify.running) {
    const pct = descVerify.total ? Math.round(descVerify.done / descVerify.total * 100) : 0;
    row = `<div class="p1-check-row"><span class="ai-spinner"></span><div class="p1-check-grow"><strong>Checking every question and model answer with AI…</strong>
      <span class="ai-muted">${descVerify.done} of ${descVerify.total} checked.</span>
      <div class="ai-progress-track"><div class="ai-progress-fill" style="width:${Math.max(4, pct)}%"></div></div></div>
      <button type="button" class="btn-soft" data-desc-check="stop">Stop</button></div>`;
  } else if (!ready) {
    row = `<div class="p1-check-row"><div class="p1-check-grow"><strong>Not checked by AI.</strong> <span class="ai-muted">Press AI Check to have the AI verify every question and model answer (an API key is needed).</span></div>
      <button type="button" class="ai-btn-primary" data-ai-action="open-settings" data-engine="check" data-want-check="p2">AI Check</button></div>`;
  } else if (notChecked) {
    row = `<div class="p1-check-row"><div class="p1-check-grow"><strong>${notChecked} question${notChecked === 1 ? " is" : "s are"} not checked by AI yet.</strong> <span class="ai-muted">The AI confirms each question is complete and its model answer belongs to it and is correct.</span></div>
      <button type="button" class="ai-btn-primary" data-desc-check="run">AI Check</button></div>`;
  } else {
    const noted = qs.filter(q => descStatus(q) === "ok" && q.check && q.check.ai && (q.check.ai.notes || []).length && !q.check.user).length;
    row = `<div class="p1-check-row"><div class="p1-check-grow"><span><strong>AI check finished:</strong> ${count("ok")} question${count("ok") === 1 ? "" : "s"} passed${noted ? ` (${noted} with an AI note)` : ""}${issues.length ? ` · <span class="p1-warn">${issues.length} need${issues.length === 1 ? "s" : ""} attention</span>` : ""}.</span>${descVerify.usage && AIEval.tokensText ? ` <span class="ai-muted">Tokens: ${escapeHTML(AIEval.tokensText(descVerify.usage))}</span>` : ""}</div>
      ${qs.some(q => !(q.check && q.check.user)) ? `<button type="button" class="btn-soft" data-desc-check="run-all">AI Check again</button>` : ""}</div>`;
  }
  if (descVerify.error && !descVerify.running) row += `<p class="ai-warning">${escapeHTML(descVerify.error)}</p>`;
  const cards = issues.map(q => `
      <li class="p1-issue" data-id="${escapeHTML(q.id)}">
        <div class="p1-issue-head"><strong>Q${qs.indexOf(q) + 1}</strong><span class="ai-muted">${escapeHTML(q.paper || "")} · ${escapeHTML(q.marks)} marks</span></div>
        <ul class="p1-issue-reasons">${descIssueReasons(q).map(r => `<li>${escapeHTML(r)}</li>`).join("")}</ul>
        <div class="p1-question-full-text">${escapeHTML(q.text || "")}</div>
        <div class="p1-issue-actions">
          <button type="button" class="btn-soft" data-desc-fix="edit" data-id="${escapeHTML(q.id)}">Edit question</button>
          <button type="button" class="btn-soft" data-desc-fix="keep" data-id="${escapeHTML(q.id)}">It is correct, keep it</button>
          ${ready && !descVerify.running ? `<button type="button" class="btn-soft" data-desc-fix="recheck" data-id="${escapeHTML(q.id)}">Check again with AI</button>` : ""}
          <button type="button" class="btn-soft btn-soft-danger" data-desc-fix="remove" data-id="${escapeHTML(q.id)}">Remove</button>
        </div>
      </li>`).join("");
  box.innerHTML = `
    <div class="p1-check-card">
      <div class="p1-check-summary">
        <span><strong>${qs.length}</strong> question${qs.length === 1 ? "" : "s"}</span>
        <span><strong>${count("ok")}</strong> checked</span>
        ${count("pending") ? `<span><strong>${count("pending")}</strong> being checked</span>` : ""}
        ${issues.length ? `<span class="p1-warn"><strong>${issues.length}</strong> need attention</span>` : ""}
      </div>
      ${row}
    </div>
    ${issues.length ? `<section class="p1-attention" aria-label="Questions that need attention">
      <div class="p1-attention-head"><h3>Needs attention <span class="count-badge">${issues.length}</span></h3>
      <p>The AI found a problem in these questions or their model answers. Fix, keep or remove each one; you can still start the test with them.</p></div>
      <ol class="p1-issue-list">${cards}</ol></section>` : ""}`;
}

// Buttons of the descriptive check panel
function handleDescCheckClick(e) {
  const run = e.target.closest("[data-desc-check]");
  if (run) {
    const a = run.dataset.descCheck;
    if (a === "run") descVerifyQuestions();
    else if (a === "stop" && descVerify.controller) descVerify.controller.abort();
    else if (a === "run-all") descVerifyQuestions((state.setup.questions || []).filter(q => !(q.check && q.check.user)).map(q => { q.check = q.check || { ai: null, user: "" }; return q; }));
    return;
  }
  const fix = e.target.closest("[data-desc-fix]");
  if (!fix) return;
  const q = (state.setup.questions || []).find(x => x.id === fix.dataset.id);
  if (!q) return;
  const a = fix.dataset.descFix;
  if (a === "remove") {
    if (!confirm("Remove this question from the test?")) return;
    state.setup.questions = state.setup.questions.filter(x => x.id !== q.id);
  } else if (a === "keep") {
    q.check = Object.assign(q.check || {}, { user: "ok" });
  } else if (a === "recheck") {
    saveSetup();
    descVerifyQuestions([q]);
    return;
  } else if (a === "edit") {
    if (typeof fillQuestionForm === "function") fillQuestionForm(q);
    return;
  }
  saveSetup();
  renderSetupList();
}

// Before a subjective test starts: questions that need attention are allowed after a confirm
function descConfirmStart() {
  const issues = (state.setup.questions || []).filter(q => descStatus(q) === "issue");
  if (!issues.length) return true;
  return confirm(`${issues.length} question${issues.length === 1 ? "" : "s"} still need${issues.length === 1 ? "s" : ""} attention (the AI found a problem in the question or its model answer).\n\nOK = start the test anyway\nCancel = go back and fix ${issues.length === 1 ? "it" : "them"}`);
}

document.addEventListener("DOMContentLoaded", () => {
  const box = $("setup-check");
  if (box) box.addEventListener("click", handleDescCheckClick);
});
