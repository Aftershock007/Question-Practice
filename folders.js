"use strict";
// ============================================================================
// Subject / chapter folders
// ----------------------------------------------------------------------------
// When a DOCX/PDF is uploaded you say which subject it belongs to, whether it is
// a chapter test (which chapter, full or partial) or a mix test, and optionally
// a topic. Every imported question carries that as q.folder; a test takes its
// folder from its questions (test.folder), and History is shown as folders:
//   Subject > Chapter tests > Chapter 1: ... > Full chapter / Partial chapter
//   Subject > Mix tests
// Uses helpers from app.js ($, escapeHTML, loadJSON, saveJSON, sanitizeDashes).
// ============================================================================

const FOLDER_SUBJECTS = ["Economics (ESI)", "Finance", "Management", "English", "General Awareness", "Quantitative Aptitude", "Reasoning"];
const FOLDER_OTHER = "Other";
const FOLDER_UNSORTED = "Not sorted yet";

// Folders come only from your tests: a folder appears with its first test and goes away
// with its last one. (An older version kept empty chapter folders in this key.)
try { localStorage.removeItem("rbi_folder_chapters"); } catch (_) { /* nothing to clean */ }

// "Economics (ESI)" etc. from the subject / paper the parser guessed
function folderSubjectFromGuess(guess) {
  const g = String(guess || "").toLowerCase();
  if (/esi|econom|national income|gdp|inflation|monetary|fiscal/.test(g)) return "Economics (ESI)";
  if (/management|leadership|motivation|organi[sz]ational/.test(g) && !/finance/.test(g)) return "Management";
  if (/finance/.test(g)) return "Finance";
  if (/english/.test(g)) return "English";
  if (/quant/.test(g)) return "Quantitative Aptitude";
  if (/reason/.test(g)) return "Reasoning";
  if (/general awareness|current affairs|spotlight/.test(g)) return "General Awareness";
  return "";
}

// "CH-1-National_Income-Questions.docx" / "Chapter 2: Inflation" -> "Chapter 1: National Income"
function folderChapterFromName(fileName, title) {
  const tidy = s => sanitizeDashes(String(s || ""))
    .replace(/\.(docx|pdf)$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s*-\s*(?:Practice\s*Questions?|Questions?|Answer\s*Writing(?:\s*\d+)?|MCQs?|Objective|Descriptive|Subjective|Test|Quiz|Notes)\b.*$/i, "")
    .replace(/\s*-\s*Google Docs$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const src of [fileName, title]) {
    const m = tidy(src).match(/\b(?:CH|Chapter|Ch\.)\s*[-.:]?\s*(\d{1,2})\s*[-.:]?\s*(.*)$/i);
    if (m) {
      const name = m[2].replace(/^[-:.\s]+/, "").replace(/[-:.\s]+$/, "").replace(/-/g, " ").trim();
      return "Chapter " + Number(m[1]) + (name ? ": " + name : "");
    }
  }
  return "";
}

// Chapter names used by your tests and the questions on New Test (for the chapter suggestions)
function folderKnownChapters(subject) {
  const out = new Set();
  const add = f => { if (f && f.subject === subject && f.chapter) out.add(f.chapter); };
  loadJSON("rbi_p1_history", []).forEach(t => add(testFolderOf(t)));
  loadJSON("rbi_history", []).forEach(t => add(testFolderOf(t)));
  ((state.p1_setup && state.p1_setup.questions) || []).concat((state.setup && state.setup.questions) || []).forEach(q => add(q.folder));
  return [...out].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// Ask which subject / chapter a file (or a test) belongs to. Resolves to
// { subject, kind: "chapter"|"mix", chapter, coverage: "full"|"partial", topic } or null (cancelled).
function askFolder(opts) {
  opts = opts || {};
  return new Promise(resolve => {
    const modal = $("folder-modal");
    const form = $("folder-form");
    if (!modal || !form) { resolve(opts.preset || null); return; }
    const p = Object.assign({ subject: "", kind: "chapter", chapter: "", coverage: "full", topic: "" }, opts.preset || {});
    const isOther = p.subject && !FOLDER_SUBJECTS.includes(p.subject);
    $("folder-title").textContent = opts.title || "Which subject and chapter is this?";
    $("folder-sub").textContent = opts.sub || "";
    form.innerHTML = `
      <label>Subject
        <select id="folder-subject" required>
          <option value="">Choose the subject…</option>
          ${FOLDER_SUBJECTS.map(s => `<option ${s === p.subject ? "selected" : ""}>${escapeHTML(s)}</option>`).join("")}
          <option value="${FOLDER_OTHER}" ${isOther ? "selected" : ""}>Other…</option>
        </select>
      </label>
      <label id="folder-other-wrap" ${isOther ? "" : "hidden"}>Subject name
        <input id="folder-other" type="text" maxlength="60" value="${isOther ? escapeHTML(p.subject) : ""}" placeholder="e.g. Social Issues">
      </label>
      <fieldset class="folder-kind">
        <legend>Type of test</legend>
        <label class="folder-radio"><input type="radio" name="folderKind" value="chapter" ${p.kind !== "mix" ? "checked" : ""}> <span><strong>Chapter test</strong> Questions from one chapter</span></label>
        <label class="folder-radio"><input type="radio" name="folderKind" value="mix" ${p.kind === "mix" ? "checked" : ""}> <span><strong>Mix test</strong> Questions from several chapters</span></label>
      </fieldset>
      <div id="folder-chapter-wrap" ${p.kind === "mix" ? "hidden" : ""}>
        <label>Chapter
          <input id="folder-chapter" type="text" maxlength="90" list="folder-chapter-list" value="${escapeHTML(p.chapter)}" placeholder="e.g. Chapter 1: National Income">
          <datalist id="folder-chapter-list"></datalist>
        </label>
        <fieldset class="folder-kind">
          <legend>How much of the chapter?</legend>
          <label class="folder-radio"><input type="radio" name="folderCoverage" value="full" ${p.coverage !== "partial" ? "checked" : ""}> <span><strong>Full chapter</strong> The whole chapter</span></label>
          <label class="folder-radio"><input type="radio" name="folderCoverage" value="partial" ${p.coverage === "partial" ? "checked" : ""}> <span><strong>Partial chapter</strong> Only some topics of it</span></label>
        </fieldset>
      </div>
      ${opts.askTopic === false ? "" : `<label>Topic (optional)
        <input id="folder-topic" type="text" maxlength="90" value="${escapeHTML(p.topic || "")}" placeholder="Used for questions whose file has no topic heading">
      </label>`}
      <p id="folder-error" class="setup-error" role="alert"></p>
      <div class="todo-modal-actions">
        <button type="button" class="secondary" data-action="cancel">Cancel</button>
        <button type="submit">${escapeHTML(opts.okLabel || "Import")}</button>
      </div>`;
    const subjectOf = () => {
      const v = $("folder-subject").value;
      return v === FOLDER_OTHER ? ($("folder-other").value || "").trim() : v;
    };
    const fillChapters = () => {
      $("folder-chapter-list").innerHTML = folderKnownChapters(subjectOf()).map(c => `<option value="${escapeHTML(c)}"></option>`).join("");
    };
    fillChapters();
    const done = (val) => {
      modal.hidden = true;
      form.onsubmit = null;
      form.onchange = null;
      form.onclick = null;
      modal.onclick = null;
      document.removeEventListener("keydown", onKey);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === "Escape") done(null); };
    form.onchange = (e) => {
      if (e.target.id === "folder-subject") {
        $("folder-other-wrap").hidden = e.target.value !== FOLDER_OTHER;
        fillChapters();
      }
      if (e.target.name === "folderKind") $("folder-chapter-wrap").hidden = e.target.value === "mix";
    };
    form.onclick = (e) => { if (e.target.closest('[data-action="cancel"]')) done(null); };
    modal.onclick = (e) => { if (e.target === modal) done(null); };
    form.onsubmit = (e) => {
      e.preventDefault();
      const subject = subjectOf();
      const kind = (form.querySelector('input[name="folderKind"]:checked') || {}).value || "chapter";
      const chapter = sanitizeDashes(($("folder-chapter").value || "").trim());
      const coverage = (form.querySelector('input[name="folderCoverage"]:checked') || {}).value || "full";
      const topic = $("folder-topic") ? ($("folder-topic").value || "").trim() : "";
      const err = $("folder-error");
      if (!subject) { err.textContent = "Choose the subject."; return; }
      if (kind === "chapter" && !chapter) { err.textContent = "Enter the chapter (or choose Mix test)."; return; }
      done(kind === "mix" ? { subject, kind, chapter: "", coverage: "", topic } : { subject, kind, chapter, coverage, topic });
    };
    document.addEventListener("keydown", onKey);
    modal.hidden = false;
    setTimeout(() => { const el = p.subject ? $("folder-chapter") : $("folder-subject"); if (el && !el.closest("[hidden]")) el.focus(); else $("folder-subject").focus(); }, 0);
  });
}

// Ask for an uploaded file's folder, with guesses from its name and title
function askFileFolder(fileName, rawText, guessSubject, count) {
  const head = String(rawText || "").split("\n", 40).map(l => l.replace(/\*\*/g, "").trim()).filter(Boolean);
  const title = head[0] || "";
  const chapter = folderChapterFromName(fileName, title);
  // a "Subject: Finance" line at the top (files converted with AI_CONVERT_PROMPT.md) names it outright;
  // the file name and title are better clues than the parser's guess (which falls back to General Awareness)
  const subjectLine = (head.slice(0, 12).map(l => l.match(/^Subject\s*:\s*(.+)$/i)).find(Boolean) || [])[1] || "";
  const cleanName = String(fileName || "").replace(/[_]+/g, " ");
  const subject = folderSubjectFromGuess(subjectLine) || folderSubjectFromGuess(cleanName) || folderSubjectFromGuess(title) || folderSubjectFromGuess(guessSubject);
  return askFolder({
    title: "Which subject and chapter is this file?",
    sub: `${fileName}${count ? " · " + count + " question" + (count === 1 ? "" : "s") : ""}`,
    preset: { subject, kind: chapter ? "chapter" : "mix", chapter, coverage: "full" },
    okLabel: "Import"
  });
}

// Tag freshly imported questions with their folder (and the topic where the file gave none)
function applyFolderToQuestions(questions, folder) {
  if (!folder) return;
  const tag = { subject: folder.subject, kind: folder.kind, chapter: folder.chapter || "", coverage: folder.coverage || "" };
  // the subject you chose replaces the guessed one (objective: q.subject, subjective: q.paper)
  const paper = { "Economics (ESI)": "ESI", "Finance": "Finance", "Management": "Management", "English": "English Descriptive" }[folder.subject];
  (questions || []).forEach(q => {
    q.folder = Object.assign({}, tag);
    if ("subject" in q || !("paper" in q)) q.subject = folder.subject;
    if ("paper" in q && paper) q.paper = paper;
    if (folder.topic && !q.topic) q.topic = folder.topic;
  });
}

// A test's folder from its questions: one chapter -> that chapter (partial if any part
// says so); several chapters of one subject -> that subject's mix tests; several subjects -> mixed
function testFolderFromQuestions(questions) {
  const fs = (questions || []).map(q => q && q.folder).filter(f => f && f.subject);
  if (!fs.length) return null;
  const subjects = [...new Set(fs.map(f => f.subject))];
  if (subjects.length > 1) return { subject: "Mixed subjects", kind: "mix", chapter: "", coverage: "" };
  const chapters = [...new Set(fs.map(f => f.kind === "chapter" ? (f.chapter || "").toLowerCase() : "*mix*"))];
  if (chapters.length === 1 && chapters[0] !== "*mix*") {
    return { subject: subjects[0], kind: "chapter", chapter: fs[0].chapter, coverage: fs.some(f => f.coverage === "partial") ? "partial" : "full" };
  }
  return { subject: subjects[0], kind: "mix", chapter: "", coverage: "" };
}

// The folder a saved test belongs to (set when it started, or worked out from its questions)
function testFolderOf(test) {
  if (!test) return null;
  if (test.folder && test.folder.subject) return test.folder;
  return testFolderFromQuestions(test.questions);
}

// One line naming a folder, e.g. "Economics (ESI) › Chapter 1: National Income › Full chapter"
function folderLabel(f) {
  if (!f || !f.subject) return FOLDER_UNSORTED;
  if (f.kind !== "chapter") return f.subject + " › Mix tests";
  return f.subject + " › " + f.chapter + " › " + (f.coverage === "partial" ? "Partial chapter" : "Full chapter");
}

// ---- History as a file explorer -------------------------------------------
// Folders: History > Subject > Chapter tests > Chapter n > Full / Partial chapter
//                            > Mix tests;  plus "Not sorted yet". Tests are the "files".
const FOLDER_ICON = '<svg class="ex-ico" viewBox="0 0 48 40" aria-hidden="true"><path class="ex-ico-back" d="M4 6a4 4 0 0 1 4-4h11l5 5h16a4 4 0 0 1 4 4v23a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path class="ex-ico-front" d="M4 14a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/></svg>';
const ICON_BACK = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_UP = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 15.5V5M5 9.5 10 4.5l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const explorerState = {};   // phaseKey -> { path: [keys], back: [[keys]...] }

// The folder tree of a list of tests: only folders that hold at least one test exist
// (a subject, chapter or Full / Partial folder appears with its first test and is gone
// when its last test is deleted or moved)
function buildHistoryTree(tests) {
  const root = { key: "", name: "History", kind: "root", children: [], tests: [] };
  const child = (parent, key, name, kind) => {
    let c = parent.children.find(x => x.key === key);
    if (!c) { c = { key, name, kind, children: [], tests: [] }; parent.children.push(c); }
    return c;
  };
  const chapterKey = name => "c:" + String(name || "").toLowerCase().replace(/\s+/g, " ").trim();
  tests.forEach(t => {
    const f = testFolderOf(t);
    if (!f) { child(root, "unsorted", FOLDER_UNSORTED, "unsorted").tests.push(t); return; }
    const subject = child(root, "s:" + f.subject, f.subject, "subject");
    if (f.kind !== "chapter") { child(subject, "mix", "Mix tests", "group").tests.push(t); return; }
    const chapters = child(subject, "chapter", "Chapter tests", "group");
    const ch = child(chapters, chapterKey(f.chapter), f.chapter, "chapter");
    child(ch, f.coverage === "partial" ? "partial" : "full", f.coverage === "partial" ? "Partial chapter" : "Full chapter", "coverage").tests.push(t);
  });
  const order = (a, b) => {
    const rank = n => (n.kind === "unsorted" ? 999 : n.kind === "subject" ? (FOLDER_SUBJECTS.indexOf(n.name) < 0 ? 98 : FOLDER_SUBJECTS.indexOf(n.name)) : 0);
    const fixed = { chapter: 0, mix: 1, full: 0, partial: 1 };
    if (a.key in fixed && b.key in fixed) return fixed[a.key] - fixed[b.key];
    return rank(a) - rank(b) || a.name.localeCompare(b.name, undefined, { numeric: true });
  };
  const count = n => { n.children.sort(order); n.total = n.tests.length + n.children.reduce((s, c) => s + count(c), 0); return n.total; };
  count(root);
  return root;
}

function explorerNode(root, path) {
  let node = root;
  const trail = [root];
  for (const k of path) {
    const next = node.children.find(c => c.key === k);
    if (!next) break;
    node = next;
    trail.push(node);
  }
  return { node, trail };
}

// History opens in the folder of the test you just finished
function historyOpenFolderOf(test, phaseKey) {
  const f = testFolderOf(test);
  const path = !f ? ["unsorted"] : f.kind === "chapter"
    ? ["s:" + f.subject, "chapter", "c:" + String(f.chapter || "").toLowerCase().replace(/\s+/g, " ").trim(), f.coverage === "partial" ? "partial" : "full"]
    : ["s:" + f.subject, "mix"];
  explorerState[phaseKey] = { path, back: [], loaded: true };
  try { sessionStorage.setItem("rbi_hist_path_" + phaseKey, JSON.stringify(path)); } catch (_) { /* per-tab convenience */ }
}

// Draw the explorer into listElem. cardFor(test) gives the test's card (element or HTML).
function renderHistoryFolders(listElem, tests, cardFor, phaseKey) {
  const st = explorerState[phaseKey] || (explorerState[phaseKey] = { path: [], back: [] });
  try { if (!st.loaded) { st.path = JSON.parse(sessionStorage.getItem("rbi_hist_path_" + phaseKey) || "[]"); st.loaded = true; } } catch (_) { st.loaded = true; }
  const root = buildHistoryTree(tests);
  const { node, trail } = explorerNode(root, st.path);
  st.path = trail.slice(1).map(n => n.key);
  try { sessionStorage.setItem("rbi_hist_path_" + phaseKey, JSON.stringify(st.path)); } catch (_) { /* per-tab convenience */ }

  const go = (path, remember = true) => {
    if (remember) st.back.push(st.path.slice());
    st.path = path;
    renderHistoryFolders(listElem, tests, cardFor, phaseKey);
  };

  // left: the folder tree (like the navigation pane of a file manager)
  const treeHTML = (n, path, depth) => n.children.map(c => {
    const p = path.concat(c.key);
    const open = st.path.length >= p.length && p.every((k, i) => st.path[i] === k);
    const current = open && st.path.length === p.length;
    return `<li><button type="button" class="ex-tree-item${current ? " is-current" : ""}" data-ex-path="${escapeHTML(JSON.stringify(p))}" style="--depth:${depth}">
        <span class="ex-tree-caret${c.children.length ? (open ? " is-open" : "") : " is-empty"}"></span>${FOLDER_ICON}<span class="ex-tree-name">${escapeHTML(c.name)}</span><span class="ex-tree-count">${c.total}</span></button>
        ${c.children.length && open ? `<ul>${treeHTML(c, p, depth + 1)}</ul>` : ""}</li>`;
  }).join("");

  const crumbs = trail.map((n, i) => {
    const p = trail.slice(1, i + 1).map(x => x.key);
    return i === trail.length - 1
      ? `<span class="ex-crumb is-current" aria-current="page">${escapeHTML(n.name)}</span>`
      : `<button type="button" class="ex-crumb" data-ex-path="${escapeHTML(JSON.stringify(p))}">${escapeHTML(n.name)}</button>`;
  }).join('<span class="ex-crumb-sep" aria-hidden="true">/</span>');

  const tiles = node.children.map(c => `
    <button type="button" class="ex-tile" data-ex-path="${escapeHTML(JSON.stringify(st.path.concat(c.key)))}" title="Open ${escapeHTML(c.name)}">
      ${FOLDER_ICON}
      <span class="ex-tile-name">${escapeHTML(c.name)}</span>
      <span class="ex-tile-meta">${c.total} test${c.total === 1 ? "" : "s"}</span>
    </button>`).join("");

  listElem.innerHTML = `
    <div class="explorer">
      <div class="ex-toolbar">
        <button type="button" class="ex-nav-btn" data-ex-act="back" title="Back" aria-label="Back" ${st.back.length ? "" : "disabled"}>${ICON_BACK}</button>
        <button type="button" class="ex-nav-btn" data-ex-act="up" title="Up one folder" aria-label="Up one folder" ${st.path.length ? "" : "disabled"}>${ICON_UP}</button>
        <nav class="ex-crumbs" aria-label="Folder path">${crumbs}</nav>
        <span class="ex-total">${node.total} test${node.total === 1 ? "" : "s"}</span>
      </div>
      <div class="ex-body">
        <aside class="ex-tree" aria-label="Folders"><ul>
          <li><button type="button" class="ex-tree-item${st.path.length ? "" : " is-current"}" data-ex-path="[]" style="--depth:0"><span class="ex-tree-caret is-open"></span>${FOLDER_ICON}<span class="ex-tree-name">History</span><span class="ex-tree-count">${root.total}</span></button>
          <ul>${treeHTML(root, [], 1)}</ul></li></ul>
        </aside>
        <section class="ex-main ex-enter">
          ${tiles ? `<div class="ex-grid">${tiles}</div>` : ""}
          ${node.kind === "unsorted" ? `<p class="hist-folder-hint">These tests were taken before folders existed, or from questions typed by hand. Use "Move to folder" on a test to sort it.</p>` : ""}
          ${node.tests.length ? `<div class="ex-files-head">${node.tests.length} test${node.tests.length === 1 ? "" : "s"} in this folder</div><div class="ex-files"></div>` : ""}
          ${!tiles && !node.tests.length ? `<p class="ex-empty">${node.kind === "root" ? "No tests yet. Finish a test and its subject and chapter folders appear here by themselves." : "This folder is empty."}</p>` : ""}
        </section>
      </div>
    </div>`;
  const files = listElem.querySelector(".ex-files");
  if (files) node.tests.forEach(t => {
    const c = cardFor(t);
    if (typeof c === "string") files.insertAdjacentHTML("beforeend", c); else if (c) files.appendChild(c);
  });

  listElem.querySelector(".explorer").addEventListener("click", (e) => {
    const nav = e.target.closest("[data-ex-path]");
    if (nav) { go(JSON.parse(nav.dataset.exPath)); return; }
    const act = e.target.closest("[data-ex-act]");
    if (!act) return;
    if (act.dataset.exAct === "back" && st.back.length) go(st.back.pop(), false);
    else if (act.dataset.exAct === "up" && st.path.length) go(st.path.slice(0, -1));
  });
}

// "Move to folder" on a History test
async function moveHistoryTestToFolder(storageKey, testId) {
  const history = loadJSON(storageKey, []);
  const t = history.find(x => x.id === testId);
  if (!t) return;
  const f = testFolderOf(t);
  const picked = await askFolder({
    title: "Move this test to a folder",
    sub: new Date(t.date || t.completedAt).toLocaleString() + " · " + (t.questions || []).length + " questions",
    preset: f || {},
    askTopic: false,
    okLabel: "Move"
  });
  if (!picked) return;
  t.folder = { subject: picked.subject, kind: picked.kind, chapter: picked.chapter, coverage: picked.coverage };
  saveJSON(storageKey, history);
  if (storageKey === "rbi_p1_history") renderP1History(); else renderHistory();
}

// ---- Self-assessment: performance by subject and chapter (bar chart) ------
// Score % = marks scored / marks possible over every test in that folder
// (objective: net score, never below 0; subjective: graded answers only).
function testScoreParts(t, kind) {
  if (kind === "mcq") return { got: Math.max(0, Number(t.score) || 0), max: Number(t.maxScore) || 0 };
  let got = 0;
  let max = 0;
  (t.questions || []).forEach(q => {
    const sc = t.scores ? t.scores[q.id] : null;
    if (sc !== null && sc !== undefined && sc !== "" && !isNaN(sc)) { got += Number(sc); max += Number(q.marks) || 10; }
  });
  return { got, max };
}

function perfBucket() { return { got: 0, max: 0, tests: 0, best: null, last: null, lastAt: 0 }; }
function perfAdd(b, parts, at) {
  if (!parts.max) return;
  const pct = parts.got / parts.max * 100;
  b.got += parts.got;
  b.max += parts.max;
  b.tests++;
  b.best = b.best === null ? pct : Math.max(b.best, pct);
  if (at >= b.lastAt) { b.last = pct; b.lastAt = at; }
}

// Draw the chart into container (history: newest first)
function renderPerformanceChart(container, history, kind) {
  if (!container) return;
  const subjects = new Map();
  let unsorted = perfBucket();
  const all = perfBucket();
  history.forEach(t => {
    const parts = testScoreParts(t, kind);
    const at = new Date(t.date || t.completedAt).getTime() || 0;
    perfAdd(all, parts, at);
    const f = testFolderOf(t);
    if (!f || !f.subject) { perfAdd(unsorted, parts, at); return; }
    if (!subjects.has(f.subject)) subjects.set(f.subject, { total: perfBucket(), chapters: new Map(), mix: perfBucket() });
    const s = subjects.get(f.subject);
    perfAdd(s.total, parts, at);
    if (f.kind === "chapter") {
      const key = String(f.chapter || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (!s.chapters.has(key)) s.chapters.set(key, { name: f.chapter, total: perfBucket(), full: perfBucket(), partial: perfBucket() });
      const c = s.chapters.get(key);
      perfAdd(c.total, parts, at);
      perfAdd(f.coverage === "partial" ? c.partial : c.full, parts, at);
    } else perfAdd(s.mix, parts, at);
  });
  const pctOf = b => (b.max ? b.got / b.max * 100 : null);
  const fmt = v => (Math.round(v * 10) / 10).toString();
  const describe = (name, b) => `${name}: ${Math.round(pctOf(b))}% (${fmt(b.got)} of ${fmt(b.max)} marks) over ${b.tests} test${b.tests === 1 ? "" : "s"} · best ${Math.round(b.best)}% · latest ${Math.round(b.last)}%`;
  // inSummary: the row is the clickable heading of a subject, so the summary itself takes focus
  const bar = (name, b, level, extra, inSummary) => {
    const pct = pctOf(b);
    if (pct === null) return `<div class="perf-row perf-l${level} is-empty"><span class="perf-name">${escapeHTML(name)}</span><span class="perf-track"></span><span class="perf-val">No marks yet</span></div>`;
    return `<div class="perf-row perf-l${level}"${inSummary ? "" : ` tabindex="0" aria-label="${escapeHTML(describe(name, b))}"`} data-tip="${escapeHTML(describe(name, b))}">
      <span class="perf-name">${escapeHTML(name)}${extra || ""}</span>
      <span class="perf-track"><span class="perf-fill" style="width:${Math.max(1.5, Math.min(100, pct))}%"></span></span>
      <span class="perf-val"><strong>${Math.round(pct)}%</strong> <span>${b.tests} test${b.tests === 1 ? "" : "s"}</span></span>
    </div>`;
  };
  const order = (a, b) => {
    const ia = FOLDER_SUBJECTS.indexOf(a), ib = FOLDER_SUBJECTS.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  };
  const rows = [...subjects.keys()].sort(order).map(name => {
    const s = subjects.get(name);
    const chapters = [...s.chapters.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const inner = chapters.map(c => {
      const split = [c.full.tests ? `Full ${Math.round(pctOf(c.full))}%` : "", c.partial.tests ? `Partial ${Math.round(pctOf(c.partial))}%` : ""].filter(Boolean).join(" · ");
      return bar(c.name, c.total, 2, split ? `<em class="perf-split">${escapeHTML(split)}</em>` : "");
    }).join("") + (s.mix.tests ? bar("Mix tests", s.mix, 2) : "");
    return `<details class="perf-subject"><summary aria-label="${escapeHTML(describe(name, s.total) + ". Open for chapters.")}">${bar(name, s.total, 1, "", true)}</summary><div class="perf-children">${inner || '<p class="perf-none">No chapter tests yet.</p>'}</div></details>`;
  }).join("");
  const overall = pctOf(all);
  container.innerHTML = all.tests ? `
    <section class="perf-card" aria-label="Performance by subject and chapter">
      <div class="perf-head">
        <div><h3>Performance by subject</h3><p>Score as a share of the marks possible. Open a subject to see every chapter; hover a bar for best and latest scores.</p></div>
        <div class="perf-kpis">
          <span><strong>${history.length}</strong> test${history.length === 1 ? "" : "s"}</span>
          ${overall !== null ? `<span><strong>${Math.round(overall)}%</strong> overall</span>` : ""}
        </div>
      </div>
      <div class="perf-scale" aria-hidden="true"><span></span><span class="perf-ticks">${[0, 25, 50, 75, 100].map(v => `<i style="left:${v}%">${v}%</i>`).join("")}</span><span></span></div>
      <div class="perf-rows">${rows}${unsorted.tests ? bar(FOLDER_UNSORTED, unsorted, 1) : ""}</div>
    </section>` : "";
  // one tooltip for every bar (pointer and keyboard)
  let tip = document.getElementById("perf-tip");
  if (!tip) { tip = document.createElement("div"); tip.id = "perf-tip"; tip.className = "perf-tip"; tip.setAttribute("role", "tooltip"); document.body.appendChild(tip); }
  const show = (row, x, y) => {
    tip.textContent = row.dataset.tip;
    tip.classList.add("is-visible");
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x + 14)) + "px";
    tip.style.top = Math.max(8, y - r.height - 12) + "px";
  };
  const hide = () => tip.classList.remove("is-visible");
  container.onpointermove = (e) => { const row = e.target.closest(".perf-row[data-tip]"); if (row) show(row, e.clientX, e.clientY); else hide(); };
  container.onpointerleave = hide;
  container.onfocusin = (e) => {
    const row = e.target.closest(".perf-row[data-tip]") || (e.target.matches("summary") ? e.target.querySelector(".perf-row[data-tip]") : null);
    if (row) { const r = row.getBoundingClientRect(); show(row, r.left + r.width / 2, r.top); }
  };
  container.onfocusout = hide;
}
