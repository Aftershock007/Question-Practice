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
const FOLDER_CLOSED_KEY = "rbi_history_folders_closed";

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
    .replace(/\s*-\s*(?:Practice\s*Questions?|Questions?|Answer\s*Writing(?:\s*\d+)?|MCQs?|Test|Quiz|Notes)\b.*$/i, "")
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

// Chapter names already used for a subject (for the chapter suggestions)
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
  const title = String(rawText || "").split("\n").map(l => l.trim()).find(Boolean) || "";
  const chapter = folderChapterFromName(fileName, title);
  const subject = folderSubjectFromGuess(guessSubject) || folderSubjectFromGuess(title) || folderSubjectFromGuess(fileName);
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
  (questions || []).forEach(q => {
    q.folder = Object.assign({}, tag);
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

function folderClosedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(FOLDER_CLOSED_KEY) || "[]")); } catch (_) { return new Set(); }
}
function folderSaveClosed(set) {
  try { localStorage.setItem(FOLDER_CLOSED_KEY, JSON.stringify([...set].slice(-300))); } catch (_) { /* per-browser convenience only */ }
}

// Build the folder tree of History into listElem. cardFor(test) returns the test's card (an
// element or an HTML string); tests keep their order (newest first) inside each folder.
function renderHistoryFolders(listElem, tests, cardFor, phaseKey) {
  const closed = folderClosedSet();
  const tree = new Map();   // subject -> { chapters: Map(chapterKey -> {name, full: [], partial: []}), mix: [] }
  const unsorted = [];
  tests.forEach(t => {
    const f = testFolderOf(t);
    if (!f) { unsorted.push(t); return; }
    if (!tree.has(f.subject)) tree.set(f.subject, { chapters: new Map(), mix: [] });
    const node = tree.get(f.subject);
    if (f.kind !== "chapter") { node.mix.push(t); return; }
    const key = String(f.chapter || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!node.chapters.has(key)) node.chapters.set(key, { name: f.chapter, full: [], partial: [] });
    node.chapters.get(key)[f.coverage === "partial" ? "partial" : "full"].push(t);
  });
  const order = (a, b) => {
    const ia = FOLDER_SUBJECTS.indexOf(a), ib = FOLDER_SUBJECTS.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  };
  listElem.innerHTML = "";
  const folder = (parent, key, title, count, level) => {
    const d = document.createElement("details");
    d.className = "hist-folder hist-folder-l" + level;
    d.dataset.folderKey = phaseKey + "|" + key;
    d.open = !closed.has(d.dataset.folderKey);
    d.innerHTML = `<summary><span class="hist-folder-name">${escapeHTML(title)}</span><span class="count-badge">${count} test${count === 1 ? "" : "s"}</span></summary><div class="hist-folder-body"></div>`;
    d.addEventListener("toggle", () => {
      const set = folderClosedSet();
      if (d.open) set.delete(d.dataset.folderKey); else set.add(d.dataset.folderKey);
      folderSaveClosed(set);
    });
    parent.appendChild(d);
    return d.querySelector(".hist-folder-body");
  };
  const put = (body, list) => list.forEach(t => {
    const c = cardFor(t);
    if (typeof c === "string") body.insertAdjacentHTML("beforeend", c); else if (c) body.appendChild(c);
  });
  const countOf = node => node.mix.length + [...node.chapters.values()].reduce((n, c) => n + c.full.length + c.partial.length, 0);
  [...tree.keys()].sort(order).forEach(subject => {
    const node = tree.get(subject);
    const sBody = folder(listElem, subject, subject, countOf(node), 1);
    if (node.chapters.size) {
      const chCount = [...node.chapters.values()].reduce((n, c) => n + c.full.length + c.partial.length, 0);
      const cBody = folder(sBody, subject + "|chapter", "Chapter tests", chCount, 2);
      [...node.chapters.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, undefined, { numeric: true })).forEach(([key, ch]) => {
        const body = folder(cBody, subject + "|chapter|" + key, ch.name, ch.full.length + ch.partial.length, 3);
        if (ch.full.length) put(folder(body, subject + "|chapter|" + key + "|full", "Full chapter", ch.full.length, 4), ch.full);
        if (ch.partial.length) put(folder(body, subject + "|chapter|" + key + "|partial", "Partial chapter", ch.partial.length, 4), ch.partial);
      });
    }
    if (node.mix.length) put(folder(sBody, subject + "|mix", "Mix tests", node.mix.length, 2), node.mix);
  });
  if (unsorted.length) {
    const body = folder(listElem, "unsorted", FOLDER_UNSORTED, unsorted.length, 1);
    body.insertAdjacentHTML("afterbegin", `<p class="hist-folder-hint">These tests were taken before folders existed, or from questions typed by hand. Use "Move to folder" on a test to sort it.</p>`);
    put(body, unsorted);
  }
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
