"use strict";

// Shortcut for document.getElementById
function $(id) { return document.getElementById(id); }

// Remove all en-dashes and em-dashes across strings
function sanitizeDashes(str) {
  if (!str) return "";
  return String(str).replace(/[\u2013\u2014\u2012\u2015]/g, "-");
}

// Count words: split on any whitespace, ignore empty pieces
function countWords(text) {
  const t = (text || "").trim();
  if (t === "") return 0;
  return t.split(/\s+/).length;
}

// Make a unique id with a prefix
function makeId(prefix) {
  return prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
}

// Safe localStorage read
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}

// Safe localStorage write
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { alert("Could not save data (storage full or blocked)."); }
}

// Seconds -> "MM:SS" (or "H:MM:SS" if >= 1 hour)
function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = n => String(n).padStart(2, "0");
  return h > 0 ? h + ":" + pad(m) + ":" + pad(sec) : pad(m) + ":" + pad(sec);
}

// Seconds -> "12 min 30 sec"
// 754 s -> "00:12" (hh:mm)
function formatHM(totalSeconds) {
  const m = Math.max(0, Math.round((Number(totalSeconds) || 0) / 60));
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}

// A date as "22 Nov 2026 · 09:04"
function formatDateHM(d) {
  const x = new Date(d);
  if (isNaN(x)) return "";
  return x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) + " · " +
    String(x.getHours()).padStart(2, "0") + ":" + String(x.getMinutes()).padStart(2, "0");
}

// The round score dial of a History test card (pct null = not scored yet)
function scoreRingHTML(pct, caption) {
  const tone = pct === null ? "none" : pct >= 60 ? "good" : pct >= 40 ? "mid" : "low";
  return `<div class="tcard-ring tone-${tone}" style="--pct:${pct === null ? 0 : Math.max(0, Math.min(100, pct))}"><span>${pct === null ? "–" : Math.round(pct) + "%"}</span></div>` +
    (caption ? `<div class="tcard-ring-caption">${caption}</div>` : "");
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return Math.floor(s / 60) + " min " + (s % 60) + " sec";
}

// Replace every {{KEY}} in template with values[KEY]
function fillTemplate(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    values[key] !== undefined ? String(values[key]) : match);
}

// Escape text before putting it into innerHTML
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Text that may hold a data table: runs of "cell | cell" lines (how DOCX and PDF tables are
// read) become an HTML table, every other line stays exactly as written. No whitespace
// between tags, because question boxes use white-space: pre-wrap.
function richTextHTML(text) {
  const lines = String(text || "").split("\n");
  const isRow = l => /\s\|\s/.test(l) || /^\s*\|.+\|\s*$/.test(l);
  const cells = l => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
  let html = "";
  let buf = [];
  let rows = [];
  const flushText = () => {
    if (buf.length) html += `<div class="rt-text">${escapeHTML(buf.join("\n"))}</div>`;
    buf = [];
  };
  const flushTable = () => {
    if (rows.length === 1) buf.push(rows[0].join(" | "));
    else if (rows.length) {
      const width = Math.max(...rows.map(r => r.length));
      const cellsHTML = (r, tag) => Array.from({ length: width }, (_, k) => `<${tag}>${escapeHTML(r[k] || "")}</${tag}>`).join("");
      // the first row is a header unless it already holds figures ("A | 4,000 | 3,000")
      const head = !rows[0].slice(1).some(c => /^[-−+(]?[\d₹$]/.test(c));
      const body = head ? rows.slice(1) : rows;
      html += `<div class="rt-table-wrap"><table class="rt-table">${head ? `<thead><tr>${cellsHTML(rows[0], "th")}</tr></thead>` : ""}<tbody>${body.map(r => `<tr>${cellsHTML(r, "td")}</tr>`).join("")}</tbody></table></div>`;
    }
    rows = [];
  };
  for (const l of lines) {
    if (isRow(l)) {
      flushText();
      rows.push(cells(l));
    } else {
      flushTable();
      buf.push(l);
    }
  }
  flushTable();
  flushText();
  return html;
}

// A question's full text for prompts, exports and duplicate checks: its passage / table first
function questionWithPassage(q) {
  return (q && q.passage ? q.passage + "\n\n" : "") + String((q && q.text) || "");
}

// The question as an AI prompt sees it: the passage / data it is based on, then the question
function questionPromptText(q) {
  if (!q || !q.passage) return String((q && q.text) || "");
  return "[Passage / data this question is based on]\n" + q.passage + "\n\n[Question]\n" + String(q.text || "");
}

// After you edit a question's passage, questions that shared the old text get the new one
function syncSharedPassage(list, edited, oldPassage) {
  if (!oldPassage || oldPassage === (edited.passage || "")) return 0;
  let n = 0;
  list.forEach(q => {
    if (q !== edited && q.passage === oldPassage) {
      if (edited.passage) q.passage = edited.passage; else delete q.passage;
      n++;
    }
  });
  return n;
}

// "passage", "case", "table" or "passage and table": what a shared block holds
function passageKind(passage) {
  const lines = String(passage || "").split("\n").filter(l => l.trim());
  const rows = lines.filter(l => /\s\|\s/.test(l)).length;
  if (/^(?:Case\s*Study|Case\s*let|Caselet)\b/i.test(lines[0] || "")) return "case";
  if (rows >= 2) return lines.length - rows > 2 ? "passage and table" : "table";
  return "passage";
}

// The passage / table above question i, with which questions of the list share it
function passageBlockHTML(questions, i) {
  const q = questions[i];
  if (!q || !q.passage) return "";
  let a = i;
  let b = i;
  while (a > 0 && questions[a - 1].passage === q.passage) a--;
  while (b < questions.length - 1 && questions[b + 1].passage === q.passage) b++;
  const kind = passageKind(q.passage);
  const head = a === b ? `Read the ${kind} below to answer this question.` : `Questions ${a + 1} ${b === a + 1 ? "and" : "to"} ${b + 1} are based on the ${kind} below.`;
  return `<div class="q-passage-head">${escapeHTML(head)}</div><div class="q-passage-body">${richTextHTML(q.passage)}</div>`;
}

// Show (or hide) the passage slot of an exam screen for question i
function renderPassageSlot(slotId, questions, i) {
  const slot = $(slotId);
  if (!slot) return;
  const html = passageBlockHTML(questions, i);
  // the same passage as the previous question stays as it is (and keeps its scroll position)
  if (html && slot._passageHtml === html && !slot.hidden) return;
  slot._passageHtml = html;
  slot.hidden = !html;
  slot.innerHTML = html;
  slot.scrollTop = 0;
}

// Format local date as YYYY-MM-DD
function getLocalDateString(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Generate file name for an individual question evaluation file
function getQuestionFilename(test, question, index) {
  const dateStr = getLocalDateString(test.date);
  const paperClean = (question.paper || "General").replace(/&/g, "and").replace(/[^a-zA-Z0-9]/g, "");
  return `Practice_${dateStr}_Q${index + 1}_${paperClean}_${question.marks}m.txt`;
}

// Generate file name for the combined test evaluation file
function getCombinedFilename(test) {
  const dateStr = getLocalDateString(test.date);
  return `Practice_${dateStr}_FullTest.txt`;
}

// Show one screen, hide all others
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.hidden = true);
  // "Back to calendar" only on a result opened from the calendar
  if (name !== "result") state.returnTo = "";
  document.querySelectorAll(".btn-back-calendar").forEach(b => { b.hidden = !(name === "result" && state.returnTo === "calendar"); });
  let targetId = "screen-" + name;
  if (name === "setup" || name === "exam" || name === "result" || name === "history") {
    targetId = state.phase === "phase1" ? `screen-${name}-p1` : `screen-${name}`;
  }
  const target = $(targetId) || $(name) || $("screen-" + name);
  if (target) {
    target.hidden = false;
    // a short fade-in instead of an abrupt jump
    target.classList.remove("screen-enter");
    void target.offsetWidth;
    target.classList.add("screen-enter");
  }

  const header = $("app-header");
  if (header) {
    const isExam = (name === "exam" || name === "exam-p1" || targetId === "screen-exam" || targetId === "screen-exam-p1");
    header.style.display = isExam ? "none" : "";
  }

  // Update navigation button active class
  document.querySelectorAll("#app-header nav button").forEach(btn => btn.classList.remove("active"));
  const activeNavBtn = $("nav-" + name);
  if (activeNavBtn) activeNavBtn.classList.add("active");

  if (name === "calendar") {
    renderCalendar();
  }

  window.scrollTo(0, 0);
}

// Download text as a .txt file
function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Copy text to clipboard, with fallback for file:// pages
async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  if (button) {
    const old = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => button.textContent = old, 1500);
  }
}

// Read a number input; empty / invalid / negative -> fallback (0 is a valid value)
function readNumberInput(id, fallback, min = 0) {
  const el = $(id);
  if (!el || String(el.value).trim() === "") return fallback;
  const n = Number(el.value);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

// Make sure a <select> offers the given value (e.g. 12 marks from an imported file), then select it
function selectValueEnsuringOption(selectId, value, labelSuffix = "") {
  const sel = $(selectId);
  if (!sel || value === undefined || value === null || value === "") return;
  const v = String(value);
  if (!Array.from(sel.options).some(o => o.value === v)) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v + labelSuffix;
    sel.appendChild(opt);
  }
  sel.value = v;
}

// Default word limit for given marks
function defaultWordLimit(marks) {
  return Number(marks) === 15 ? 600 : 400;
}

// Global application state
const state = {
  phase: loadJSON("rbi_current_phase", "phase1"),
  setup: loadJSON("rbi_current_setup", { totalMinutes: 30, questions: [] }),
  test: null,          // active Test object during the Phase 2 exam
  currentIndex: 0,     // which question is on screen
  timerId: null,       // setInterval id
  endTime: 0,          // Date.now() value when time ends
  questionShownAt: 0,  // Date.now() when current question was shown
  lastAutoSave: 0,     // timestamp of last throttled exam autosave
  lastResultTest: null, // test object currently being viewed on Phase 2 result screen
  setup_page: 1,       // current page for Phase 2 setup questions list

  // Phase 1 (Objective / MCQs) state
  p1_setup: loadJSON("rbi_p1_setup", {
    totalMinutes: 120,
    positiveMarks: 1.0,
    negativeMarks: 0.25,
    questions: []
  }),
  p1_test: null,
  p1_currentIndex: 0,
  p1_timerId: null,
  p1_endTime: 0,
  p1_questionShownAt: 0,
  p1_lastAutoSave: 0,
  p1_lastResultTest: null,
  wantAICheck: "",        // "p1" / "p2": AI Check was pressed before a key was set
  p1_resultFilter: "all",
  p1_resultPage: 1,      // page of the result / history question review
  p1_setup_page: 1     // current page for Phase 1 setup questions list
};

// Questions per page on the setup lists and in result / history reviews
const QUESTIONS_PER_PAGE = 20;

// Render reusable pagination controls (20 items per page; hidden if totalPages <= 1)
function renderPaginationControls({ containerId, currentPage, totalPages, totalItems, onPageChange }) {
  const container = $(containerId);
  if (!container) return;

  if (totalPages <= 1) {
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }

  container.style.display = "flex";

  let pagesHtml = "";
  for (let p = 1; p <= totalPages; p++) {
    pagesHtml += `<button type="button" class="pagination-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
  }

  container.innerHTML = `
    <div class="pagination-bar">
      <span class="pagination-info">Page ${currentPage} of ${totalPages} (${totalItems} questions · ${QUESTIONS_PER_PAGE} per page)</span>
      <div class="pagination-actions">
        <button type="button" class="pagination-nav-btn prev" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>
        <div class="pagination-pages">${pagesHtml}</div>
        <button type="button" class="pagination-nav-btn next" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>
      </div>
    </div>
  `;

  container.onclick = (e) => {
    const pageBtn = e.target.closest(".pagination-btn");
    if (pageBtn) {
      const p = Number(pageBtn.dataset.page);
      if (p && p !== currentPage) {
        onPageChange(p);
      }
      return;
    }
    const prevBtn = e.target.closest(".pagination-nav-btn.prev");
    if (prevBtn && currentPage > 1) {
      onPageChange(currentPage - 1);
      return;
    }
    const nextBtn = e.target.closest(".pagination-nav-btn.next");
    if (nextBtn && currentPage < totalPages) {
      onPageChange(currentPage + 1);
      return;
    }
  };
}

function saveP1Setup() {
  saveJSON("rbi_p1_setup", state.p1_setup);
}

function setPhase(phase) {
  state.phase = (phase === "phase2") ? "phase2" : "phase1";
  saveJSON("rbi_current_phase", state.phase);

  const btnP1 = $("phase-btn-p1");
  const btnP2 = $("phase-btn-p2");
  if (btnP1 && btnP2) {
    if (state.phase === "phase1") {
      btnP1.classList.add("active");
      btnP2.classList.remove("active");
    } else {
      btnP2.classList.add("active");
      btnP1.classList.remove("active");
    }
  }

  // Detect current active screen to stay on the same screen context
  const curScreen = document.querySelector(".screen:not([hidden])");
  let activeScreenType = "setup";
  if (curScreen && curScreen.id) {
    const sid = String(curScreen.id);
    if (sid.includes("calendar")) activeScreenType = "calendar";
    else if (sid.includes("history")) activeScreenType = "history";
  }

  if (state.phase === "phase1") {
    if (activeScreenType === "history") renderP1History();
    else renderP1SetupList();
  } else {
    if (activeScreenType === "history") renderHistory();
    else renderSetupList();
  }

  showScreen(activeScreenType);
}


// Persist the current setup into localStorage
function saveSetup() {
  saveJSON("rbi_current_setup", state.setup);
}

// Reset the question input form to its initial blank state
function resetQuestionForm() {
  $("question-form").reset();
  if ($("q-model")) $("q-model").style.height = "";
  $("q-wordlimit").value = 400;
  $("q-edit-id").value = "";
  delete $("q-edit-id").dataset.origin;
  $("btn-add-question").textContent = "Add question";
  $("setup-error").textContent = "";
  const cancel = $("btn-cancel-edit");
  if (cancel) cancel.hidden = true;
}

// Update the visibility and count of the batch delete button based on checkbox selection
function updateSetupBatchDeleteState() {
  const checkboxes = document.querySelectorAll("#setup-question-list .q-select-check");
  const checked = document.querySelectorAll("#setup-question-list .q-select-check:checked");
  const count = checked.length;
  const countElem = $("selected-count");
  if (countElem) countElem.textContent = count;

  const btnDeleteSelected = $("btn-delete-selected");
  if (btnDeleteSelected) {
    btnDeleteSelected.style.display = count > 0 ? "inline-block" : "none";
  }

  const selectAll = $("setup-select-all");
  if (selectAll) {
    selectAll.checked = checkboxes.length > 0 && count === checkboxes.length;
    selectAll.indeterminate = count > 0 && count < checkboxes.length;
  }
}

// Toggle selection of all question checkboxes in the setup screen
function handleSelectAllSetup(event) {
  const checked = event.target.checked;
  const checkboxes = document.querySelectorAll("#setup-question-list .q-select-check");
  checkboxes.forEach(cb => { cb.checked = checked; });
  updateSetupBatchDeleteState();
}

// Delete all questions currently checked in the setup list
function handleDeleteSelectedSetup() {
  const checked = document.querySelectorAll("#setup-question-list .q-select-check:checked");
  const idsToDelete = new Set(Array.from(checked).map(cb => cb.dataset.id));
  if (idsToDelete.size === 0) return;

  if (confirm(`Remove ${idsToDelete.size} selected question(s) from this test?`)) {
    state.setup.questions = state.setup.questions.filter(q => !idsToDelete.has(q.id));
    saveSetup();
    renderSetupList();
  }
}

// Remove all questions from the current test setup after confirmation
function handleDeleteAllSetup() {
  if (!state.setup.questions || state.setup.questions.length === 0) return;
  if (confirm(`Remove all ${state.setup.questions.length} question(s) from this test?`)) {
    state.setup.questions = [];
    saveSetup();
    renderSetupList();
  }
}

// Render the list of configured questions in the setup screen
function renderSetupList() {
  const list = $("setup-question-list");
  if (!list) return;
  list.innerHTML = "";
  const questions = state.setup.questions || [];
  let totalWordLimit = 0;

  const batchActions = $("setup-batch-actions");
  if (batchActions) {
    batchActions.style.display = questions.length > 0 ? "flex" : "none";
  }

  questions.forEach(q => {
    totalWordLimit += Number(q.wordLimit) || 0;
  });

  const countElem = $("setup-count");
  if (countElem) countElem.textContent = questions.length;
  if (typeof renderDescCheckPanel === "function") renderDescCheckPanel();

  const suggestedElem = $("setup-suggested-time");
  if (suggestedElem) {
    const suggestedMin = Math.ceil(totalWordLimit / 25);
    suggestedElem.textContent = `Suggested time (pace ≈ 1 min per 25 words): ${suggestedMin} minutes`;
  }

  const minutesInput = $("setup-minutes");
  if (minutesInput && document.activeElement !== minutesInput) {
    minutesInput.value = state.setup.totalMinutes || 30;
  }


  if (questions.length === 0) {
    list.innerHTML = `<li class="empty-list-placeholder">No questions added yet. Upload a document (DOCX/PDF) or add questions manually to begin.</li>`;
    renderPaginationControls({
      containerId: "setup-pagination",
      currentPage: 1,
      totalPages: 0,
      totalItems: 0,
      onPageChange: () => {}
    });
    updateSetupBatchDeleteState();
    return;
  }

  const PAGE_SIZE = QUESTIONS_PER_PAGE;
  const totalItems = questions.length;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
  if (state.setup_page > totalPages) state.setup_page = totalPages;
  if (state.setup_page < 1) state.setup_page = 1;

  const startIndex = (state.setup_page - 1) * PAGE_SIZE;
  const pageQuestions = questions.slice(startIndex, startIndex + PAGE_SIZE);

  pageQuestions.forEach((q, localIdx) => {
    const globalIdx = startIndex + localIdx;
    const li = document.createElement("li");
    const modelWarn = (!q.modelAnswer || !q.modelAnswer.trim())
      ? '<span class="no-model-warn">(no model answer)</span>'
      : "";
    const topicText = q.topic ? ` · <em>${escapeHTML(q.topic)}</em>` : "";

    li.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 10px; width: 100%;">
        <input type="checkbox" class="q-select-check" data-id="${escapeHTML(q.id)}" aria-label="Select question ${globalIdx + 1}" style="margin-top:3px;">
        <div class="q-info" style="flex: 1; min-width: 0;">
          <div class="p1-q-meta-badges">
            <span class="badge-subject">${escapeHTML(q.paper)}</span>
            <span class="badge-topic">${escapeHTML(q.marks)} marks · ${escapeHTML(q.wordLimit)} words</span>
            ${q.topic ? `<span style="font-size:11px; color:var(--muted);">${escapeHTML(q.topic)}</span>` : ""}
            ${modelWarn}
            ${typeof descStatusPill === "function" ? descStatusPill(q) : ""}
            <span class="q-num">Q${globalIdx + 1}</span>
          </div>
          ${q.passage ? `<details class="q-passage-peek"><summary>Based on a ${escapeHTML(passageKind(q.passage))}</summary><div class="q-passage-body">${richTextHTML(q.passage)}</div></details>` : ""}
          <div style="margin-top: 4px; white-space: pre-wrap; line-height: 1.5; font-weight: 500;">${escapeHTML(q.text)}</div>
          ${typeof descNotesHTML === "function" ? descNotesHTML(q) : ""}
        </div>
        <div class="q-actions">
          <button type="button" class="q-act" data-action="move-up" data-id="${escapeHTML(q.id)}" title="Move up" aria-label="Move up" ${globalIdx === 0 ? "disabled" : ""}>▲</button>
          <button type="button" class="q-act" data-action="move-down" data-id="${escapeHTML(q.id)}" title="Move down" aria-label="Move down" ${globalIdx === questions.length - 1 ? "disabled" : ""}>▼</button>
          <button type="button" class="q-act" data-action="edit" data-id="${escapeHTML(q.id)}" title="Edit question">Edit</button>
          <button type="button" class="q-act q-act-danger" data-action="delete" data-id="${escapeHTML(q.id)}" title="Remove from this test" aria-label="Remove from this test">Remove</button>
        </div>
      </div>
    `;
    list.appendChild(li);
  });

  renderPaginationControls({
    containerId: "setup-pagination",
    currentPage: state.setup_page,
    totalPages: totalPages,
    totalItems: totalItems,
    onPageChange: (newPage) => {
      state.setup_page = newPage;
      renderSetupList();
      $("setup-question-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  updateSetupBatchDeleteState();
}

// Populate the setup form with an existing question for editing
function editSetupQuestion(id) {
  const q = state.setup.questions.find(item => item.id === id);
  if (!q) return;
  fillQuestionForm(q);
}

// Load a descriptive question into the manual form for editing
function fillQuestionForm(q) {
  const acc = $("p2-manual-accordion");
  if (acc) acc.open = true;
  selectValueEnsuringOption("q-paper", q.paper || "ESI");
  $("q-topic").value = q.topic || "";
  $("q-text").value = q.text || "";
  $("q-passage").value = q.passage || "";
  selectValueEnsuringOption("q-marks", q.marks || 10, " marks");
  $("q-wordlimit").value = q.wordLimit || defaultWordLimit(q.marks || 10);
  $("q-model").value = q.modelAnswer || "";
  autoGrowTextarea($("q-model"));
  $("q-edit-id").value = q.id;
  $("btn-add-question").textContent = "Update question";
  const cancel = $("btn-cancel-edit");
  if (cancel) cancel.hidden = false;
  $("question-form").scrollIntoView({ behavior: "smooth", block: "start" });
  $("q-text").focus();
}

// Remove a question from the current test setup after confirmation
function deleteSetupQuestion(id) {
  if (confirm("Remove this question from the test?")) {
    state.setup.questions = state.setup.questions.filter(item => item.id !== id);
    saveSetup();
    renderSetupList();
  }
}

// Move a question up one position in the test sequence
function moveUpSetupQuestion(id) {
  const idx = state.setup.questions.findIndex(item => item.id === id);
  if (idx > 0) {
    const temp = state.setup.questions[idx];
    state.setup.questions[idx] = state.setup.questions[idx - 1];
    state.setup.questions[idx - 1] = temp;
    saveSetup();
    renderSetupList();
  }
}

// Move a question down one position in the test sequence
function moveDownSetupQuestion(id) {
  const idx = state.setup.questions.findIndex(item => item.id === id);
  if (idx >= 0 && idx < state.setup.questions.length - 1) {
    const temp = state.setup.questions[idx];
    state.setup.questions[idx] = state.setup.questions[idx + 1];
    state.setup.questions[idx + 1] = temp;
    saveSetup();
    renderSetupList();
  }
}

// Handle adding or updating a question from the setup form
function handleQuestionFormSubmit(event) {
  event.preventDefault();
  const errorElem = $("setup-error");
  errorElem.textContent = "";

  const paper = $("q-paper").value;
  const topic = $("q-topic").value.trim();
  const text = $("q-text").value.trim();
  const passage = ($("q-passage").value || "").trim();
  const marks = Number($("q-marks").value) || 10;
  const wordLimit = Math.max(50, Number($("q-wordlimit").value) || defaultWordLimit(marks));
  const modelAnswer = $("q-model").value.trim();
  const editId = $("q-edit-id").value;

  if (!text) {
    errorElem.textContent = "Please enter the question text.";
    return;
  }

  const questionObj = {
    id: editId || makeId("q"),
    paper,
    topic,
    text,
    marks,
    wordLimit,
    modelAnswer,
    check: { ai: null, user: "ok" }     // typed or corrected by you
  };
  if (passage) questionObj.passage = passage;

  if (editId) {
    const idx = state.setup.questions.findIndex(q => q.id === editId);
    if (idx >= 0) {
      const prev = state.setup.questions[idx];
      const old = prev.passage || "";
      // keep what the form does not show: the subject / chapter folder and the marking checklist
      if (prev.folder) questionObj.folder = prev.folder;
      if (prev.scheme) questionObj.scheme = prev.scheme;
      state.setup.questions[idx] = questionObj;
      syncSharedPassage(state.setup.questions, questionObj, old);
    } else {
      state.setup.questions.push(questionObj);
    }
  } else {
    state.setup.questions.push(questionObj);
  }

  saveSetup();
  renderSetupList();
  resetQuestionForm();
  $("q-text").focus();
}

// Validate setup inputs and begin the exam
async function handleStartTestClick() {
  const errorElem = $("setup-error");
  errorElem.textContent = "";

  if (!state.setup.questions || state.setup.questions.length === 0) {
    errorElem.textContent = "Add at least one question.";
    return;
  }

  const minutes = Number($("setup-minutes").value);
  if (!minutes || minutes < 1) {
    errorElem.textContent = "Total time must be at least 1 minute.";
    return;
  }

  state.setup.totalMinutes = minutes;
  saveSetup();

  if (typeof descVerify !== "undefined" && descVerify.running) return;
  if (typeof descConfirmStart === "function" && !descConfirmStart()) return;
  const hasEmptyModel = state.setup.questions.some(q => !q.modelAnswer || !q.modelAnswer.trim());
  if (hasEmptyModel) {
    if (!confirm("Some questions have no model answer. The AI will grade without a reference. Continue?")) {
      return;
    }
  }

  const testType = await askTestType("write", { count: state.setup.questions.length, questions: state.setup.questions });
  if (!testType) return;
  startTest(testType);
}

// Initialize a new test session and transition to the exam screen
function startTest(testType) {
  const totalMinutes = state.setup.totalMinutes || 30;
  const questionsCopy = JSON.parse(JSON.stringify(state.setup.questions));
  const answers = {};
  const scores = {};

  questionsCopy.forEach(q => {
    answers[q.id] = {
      text: "",
      wordCount: 0,
      secondsSpent: 0
    };
    scores[q.id] = null;
  });

  const blockPaste = true;       // copy and paste are always blocked in the answer box
  saveSetup();

  const test = {
    id: makeId("t"),
    date: new Date().toISOString(),
    testType: testType || "Subjective Practice",
    folder: typeof testFolderFromQuestions === "function" ? testFolderFromQuestions(questionsCopy) : null,
    totalMinutes: totalMinutes,
    usedSeconds: 0,
    autoSubmitted: false,
    blockPaste: blockPaste,
    questions: questionsCopy,
    answers: answers,
    scores: scores,
    visitedQuestions: [0],
    markedForReview: []
  };

  state.test = test;
  state.currentIndex = 0;
  state.visitedQuestions = new Set([0]);
  state.markedForReview = new Set();
  state.endTime = Date.now() + totalMinutes * 60 * 1000;
  test.endTime = state.endTime;

  saveJSON("rbi_active_test", test);

  state.questionShownAt = 0;
  renderPalette();
  showQuestion(0);
  showScreen("exam");

  const header = $("app-header");
  if (header) header.style.display = "none";

  const nav = document.querySelector("#app-header nav");
  if (nav) nav.hidden = true;

  if (state.timerId) clearInterval(state.timerId);
  state.timerId = setInterval(tick, 500);
  tick();

  window.onbeforeunload = () => "Test in progress";
}

// Countdown timer loop checking remaining test time against the target timestamp
function tick() {
  if (!state.test) return;
  const remaining = Math.round((state.endTime - Date.now()) / 1000);
  const timerElem = $("exam-timer");

  if (timerElem) {
    timerElem.textContent = formatTime(remaining);
    timerElem.classList.remove("timer-warning", "timer-danger");
    if (remaining <= 60) {
      timerElem.classList.add("timer-danger");
    } else if (remaining <= 300) {
      timerElem.classList.add("timer-warning");
    }
  }

  if (remaining <= 0) {
    finishTest(true);
  }
}

// Display a specific question during the exam and load its saved answer
function showQuestion(index) {
  if (!state.test || !state.test.questions[index]) return;

  if (state.questionShownAt > 0) {
    storeCurrentAnswer();
  }

  state.currentIndex = index;
  state.questionShownAt = Date.now();

  state.visitedQuestions = state.visitedQuestions || new Set([0]);
  state.visitedQuestions.add(index);

  const q = state.test.questions[index];
  const totalQ = state.test.questions.length;

  $("exam-qpos").textContent = `Question No. ${index + 1}`;
  $("exam-marks").textContent = `Marks: ${Number(q.marks || 0).toFixed(2)} · Word Limit: ${q.wordLimit}`;
  renderPassageSlot("exam-passage", state.test.questions, index);
  $("exam-question-text").innerHTML = richTextHTML(q.text);
  const qTop = $("exam-qpos");
  if (qTop && qTop.getBoundingClientRect().top < 0) qTop.scrollIntoView({ behavior: "smooth", block: "start" });

  const secName = $("exam-section-name");
  if (secName) {
    secName.textContent = `${q.paper || "Descriptive Test"} (Keyboard Entry)`;
  }

  const candRoll = document.querySelector("#screen-exam .cand-roll");
  if (candRoll) {
    candRoll.innerHTML = `Roll No: <strong>RBI-2026-P2</strong> | Paper: <strong>${escapeHTML(q.paper || "General")}</strong>`;
  }

  const ans = state.test.answers[q.id] || { text: "", wordCount: 0, secondsSpent: 0 };
  const textarea = $("exam-answer");
  textarea.value = ans.text || "";
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  $("btn-prev").disabled = (index === 0);
  const btnNext = $("btn-next");
  if (btnNext) {
    btnNext.textContent = (index === totalQ - 1) ? "Save Answer" : "Save & Next";
    btnNext.disabled = false;
  }

  updateWordCount();
  renderPalette();
  updateExamSummary();
}

// Persist the current answer text and accumulate elapsed time for active question
function storeCurrentAnswer() {
  if (!state.test || state.currentIndex < 0 || state.currentIndex >= state.test.questions.length) return;
  const currentQ = state.test.questions[state.currentIndex];
  if (!currentQ) return;

  const textarea = $("exam-answer");
  const text = textarea ? textarea.value : "";
  const count = countWords(text);

  if (!state.test.answers[currentQ.id]) {
    state.test.answers[currentQ.id] = { text: "", wordCount: 0, secondsSpent: 0 };
  }

  const ans = state.test.answers[currentQ.id];
  ans.text = text;
  ans.wordCount = count;

  if (state.questionShownAt > 0) {
    const now = Date.now();
    const elapsed = (now - state.questionShownAt) / 1000;
    ans.secondsSpent = (ans.secondsSpent || 0) + elapsed;
    state.questionShownAt = now;
  }

  state.test.visitedQuestions = Array.from(state.visitedQuestions || [0]);
  state.test.markedForReview = Array.from(state.markedForReview || []);

  saveJSON("rbi_active_test", state.test);
}

// Handle typing input in the exam textarea with throttled autosave
function handleAnswerInput() {
  if (!state.test) return;
  const currentQ = state.test.questions[state.currentIndex];
  if (!currentQ) return;

  const textarea = $("exam-answer");
  const text = textarea ? textarea.value : "";
  const count = countWords(text);

  if (!state.test.answers[currentQ.id]) {
    state.test.answers[currentQ.id] = { text: "", wordCount: 0, secondsSpent: 0 };
  }

  const ans = state.test.answers[currentQ.id];
  ans.text = text;
  ans.wordCount = count;

  updateWordCount();

  const now = Date.now();
  if (now - state.lastAutoSave >= 2000) {
    state.lastAutoSave = now;
    if (state.questionShownAt > 0) {
      const elapsed = (now - state.questionShownAt) / 1000;
      ans.secondsSpent = (ans.secondsSpent || 0) + elapsed;
      state.questionShownAt = now;
    }
    saveJSON("rbi_active_test", state.test);
  }
}

// Update the live word counter and apply visual threshold warning styles
function updateWordCount() {
  if (!state.test) return;
  const currentQ = state.test.questions[state.currentIndex];
  if (!currentQ) return;

  const textarea = $("exam-answer");
  const count = countWords(textarea ? textarea.value : "");
  const limit = currentQ.wordLimit || defaultWordLimit(currentQ.marks);

  const wcElem = $("exam-wordcount");
  if (wcElem) {
    wcElem.innerHTML = `Words typed: <strong>${count}</strong> / ${limit} words`;
    wcElem.className = "rbi-wc-indicator";
    if (count > limit) {
      wcElem.classList.add("over-limit");
    } else if (count >= 0.9 * limit) {
      wcElem.classList.add("near-limit");
    } else if (count >= 0.7 * limit) {
      wcElem.classList.add("in-range");
    }
  }

  const paletteBtn = document.querySelector(`#exam-palette button[data-index="${state.currentIndex}"]`);
  if (paletteBtn) {
    const qWcSpan = paletteBtn.querySelector(".palette-wc");
    if (qWcSpan) {
      qWcSpan.textContent = count === 1 ? "1 word" : `${count} words`;
    }
    const isMarked = state.markedForReview && state.markedForReview.has(currentQ.id);
    paletteBtn.classList.remove("answered", "not-answered", "review", "answered-review", "not-visited");
    if (isMarked && count > 0) {
      paletteBtn.classList.add("answered-review");
    } else if (isMarked) {
      paletteBtn.classList.add("review");
    } else if (count > 0) {
      paletteBtn.classList.add("answered");
    } else {
      paletteBtn.classList.add("not-answered");
    }
  }

  updateExamSummary();
}

// Render question navigation palette buttons showing answered status and words typed
function renderPalette() {
  const palette = $("exam-palette");
  if (!palette || !state.test) return;
  palette.innerHTML = "";

  state.visitedQuestions = state.visitedQuestions || new Set([0]);
  state.markedForReview = state.markedForReview || new Set();

  state.test.questions.forEach((q, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.index = String(idx);
    btn.className = "exam-palette-btn";

    const ans = state.test.answers[q.id];
    const wc = ans ? (ans.wordCount || 0) : 0;
    const isAnswered = wc > 0;
    const isMarked = state.markedForReview.has(q.id);
    const isVisited = state.visitedQuestions.has(idx);

    if (isMarked && isAnswered) {
      btn.classList.add("answered-review");
    } else if (isMarked) {
      btn.classList.add("review");
    } else if (isAnswered) {
      btn.classList.add("answered");
    } else if (isVisited) {
      btn.classList.add("not-answered");
    } else {
      btn.classList.add("not-visited");
    }

    if (idx === state.currentIndex) {
      btn.classList.add("current");
    }

    const wcText = wc === 1 ? "1 word" : `${wc} words`;
    btn.innerHTML = `<span class="palette-qnum">${idx + 1}</span><span class="palette-wc">${wcText}</span>`;
    palette.appendChild(btn);
  });

  updateExamSummary();
}

// Update status counts across legend, sidebar summary, and submit confirmation modal
function updateExamSummary() {
  if (!state.test) return;
  const questions = state.test.questions;
  const total = questions.length;
  let answered = 0;
  let notAnswered = 0;
  let markedReview = 0;
  let notVisited = 0;

  state.visitedQuestions = state.visitedQuestions || new Set([0]);
  state.markedForReview = state.markedForReview || new Set();

  questions.forEach((q, idx) => {
    const ans = state.test.answers[q.id];
    const isAnswered = ans && ans.wordCount > 0;
    const isMarked = state.markedForReview.has(q.id);
    const isVisited = state.visitedQuestions.has(idx);

    if (isMarked) {
      markedReview++;
    }
    if (isAnswered) {
      answered++;
    } else if (isVisited) {
      notAnswered++;
    } else {
      notVisited++;
    }
  });

  const sumTotal = $("summary-total"); if (sumTotal) sumTotal.textContent = total;
  const sumAns = $("summary-answered"); if (sumAns) sumAns.textContent = answered;
  const sumNotAns = $("summary-not-answered"); if (sumNotAns) sumNotAns.textContent = notAnswered;
  const sumRev = $("summary-review"); if (sumRev) sumRev.textContent = markedReview;
  const sumNotVis = $("summary-not-visited"); if (sumNotVis) sumNotVis.textContent = notVisited;

  const legAns = document.querySelector("#screen-exam .legend-badge.answered"); if (legAns) legAns.textContent = answered;
  const legNotAns = document.querySelector("#screen-exam .legend-badge.not-answered"); if (legNotAns) legNotAns.textContent = notAnswered;
  const legNotVis = document.querySelector("#screen-exam .legend-badge.not-visited"); if (legNotVis) legNotVis.textContent = notVisited;
  const legRev = document.querySelector("#screen-exam .legend-badge.review"); if (legRev) legRev.textContent = markedReview;

  const modTotal = $("modal-sum-total"); if (modTotal) modTotal.textContent = total;
  const modAns = $("modal-sum-answered"); if (modAns) modAns.textContent = answered;
  const modNotAns = $("modal-sum-not-answered"); if (modNotAns) modNotAns.textContent = notAnswered;
  const modRev = $("modal-sum-marked"); if (modRev) modRev.textContent = markedReview;
}

// A short warning that slides in at the top of the screen and fades out by itself
function showExamWarning(message) {
  let toast = $("exam-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "exam-toast";
    toast.className = "exam-toast";
    toast.setAttribute("role", "alert");
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.remove("is-visible");
  void toast.offsetWidth;            // restart the animation for a repeated warning
  toast.classList.add("is-visible");
  clearTimeout(showExamWarning.timer);
  showExamWarning.timer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

// Copy, cut, paste and drag-and-drop are never allowed in the answer box (as in the real exam)
function handlePasteOrDrop(e) {
  if (!state.test) return;
  e.preventDefault();
  const copying = e.type === "copy" || e.type === "cut";
  showExamWarning(copying
    ? "Copying is not allowed in the exam. Your answer stays only in this box."
    : "Pasting is not allowed in the exam. Type your answer yourself.");
}

// After an exam the New Test page starts empty (the questions live on in History),
// and History opens in the folder this test belongs to
function clearSetupAfterExam(kind, test) {
  if (kind === "mcq") {
    state.p1_setup.questions = [];
    state.p1_setup.importNotes = [];
    state.p1_setup_page = 1;
    saveP1Setup();
  } else {
    state.setup.questions = [];
    state.setup_page = 1;
    saveSetup();
  }
  if (typeof historyOpenFolderOf === "function") historyOpenFolderOf(test, kind === "mcq" ? "p1" : "p2");
}

// Finalize the test, calculate time spent, and archive the attempt to history
function finishTest(auto) {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }

  if (!state.test) return;
  // Only read the textarea when the exam screen is actually live (not when finishing a
  // test restored from storage after a reload, where the textarea is still empty).
  if (state.questionShownAt > 0) storeCurrentAnswer();

  const test = state.test;
  test.autoSubmitted = !!auto;
  const elapsed = Math.round((Date.now() - new Date(test.date).getTime()) / 1000);
  test.usedSeconds = Math.min(test.totalMinutes * 60, Math.max(0, elapsed));
  test.maxMarks = (test.questions || []).reduce((acc, q) => acc + (Number(q.marks) || 10), 0);
  test.scores = test.scores || {};

  const history = loadJSON("rbi_history", []);
  history.unshift(test);
  saveJSON("rbi_history", history);
  clearSetupAfterExam("write", test);

  if (typeof autoCompleteTodoOnExam === "function") {
    autoCompleteTodoOnExam("write", test);
  }

  localStorage.removeItem("rbi_active_test");
  window.onbeforeunload = null;

  const nav = document.querySelector("#app-header nav");
  if (nav) nav.hidden = false;

  const header = $("app-header");
  if (header) header.style.display = "";

  const modal = $("confirm-submit");
  if (modal) modal.hidden = true;

  state.test = null;
  state.questionShownAt = 0;

  if (auto) {
    alert("Time is up! Your test has been submitted.");
  }

  renderResult(test);
  showScreen("result");

  // Grade the answers with AI straight away (only when an API key is set up - see ai_eval.js)
  if (window.AIEval) AIEval.autoEvaluate(test);
}

// Check for and resume an interrupted test on page load
function checkResumeActiveTest() {
  const p1Active = loadJSON("rbi_p1_active_test", null);
  const p2Active = loadJSON("rbi_active_test", null);
  const now = Date.now();

  if (p1Active && p1Active.endTime) {
    state.p1_test = p1Active;
    state.p1_endTime = p1Active.endTime;
    state.p1_questionShownAt = 0;
    if (p1Active.endTime > now) {
      if (confirm("You have an objective (MCQ) test in progress. Resume it?\n\nOK = resume, Cancel = submit it now with the answers saved so far.")) {
        setPhase("phase1");
        startP1ExamTimer();
        showP1Question(state.p1_test.currentIndex || 0);
        renderP1Palette();
        updateP1ExamSummary();
        showScreen("exam");
        return;
      }
      setPhase("phase1");
      finishP1Test(false);
    } else {
      setPhase("phase1");
      finishP1Test(true);
    }
    if (!(p2Active && p2Active.endTime)) return;
  }

  if (p2Active && p2Active.endTime) {
    state.test = p2Active;
    state.endTime = p2Active.endTime;
    if (p2Active.endTime > now) {
      if (confirm("You have a descriptive (subjective) test in progress. Resume it?\n\nOK = resume, Cancel = submit it now with the answers saved so far.")) {
        setPhase("phase2");
        resumeExam();
        return;
      } else {
        finishTest(false);
      }
    } else {
      finishTest(true);
    }
  }
}

// Resume an active exam without resetting answers
function resumeExam() {
  state.currentIndex = 0;
  state.questionShownAt = 0;
  state.visitedQuestions = new Set(state.test.visitedQuestions || [0]);
  state.markedForReview = new Set(state.test.markedForReview || []);

  const header = $("app-header");
  if (header) header.style.display = "none";

  renderPalette();
  showQuestion(0);
  showScreen("exam");

  const nav = document.querySelector("#app-header nav");
  if (nav) nav.hidden = true;

  if (state.timerId) clearInterval(state.timerId);
  state.timerId = setInterval(tick, 500);
  tick();

  window.onbeforeunload = () => "Test in progress";
}

// Generate the complete evaluation prompt text for an individual question
function buildQuestionText(test, question, index) {
  const ans = (test.answers && test.answers[question.id]) || { text: "", wordCount: 0, secondsSpent: 0 };
  const wordCount = ans.wordCount || 0;
  const wordLimit = question.wordLimit || defaultWordLimit(question.marks);
  const wordPercent = wordLimit > 0 ? Math.round((wordCount / wordLimit) * 100) : 0;
  const answerText = (ans.text || "").trim();
  const modelText = (question.modelAnswer || "").trim();

  const values = {
    PAPER: question.paper,
    TOPIC: question.topic && question.topic.trim() ? question.topic.trim() : "Not specified",
    MARKS: question.marks,
    WORD_LIMIT: wordLimit,
    WORD_COUNT: wordCount,
    WORD_PERCENT: wordPercent,
    TIME_SPENT: formatDuration(ans.secondsSpent || 0),
    DATE: new Date(test.date).toLocaleString(),
    QUESTION: questionPromptText(question),
    ANSWER: answerText || "[NO ANSWER WRITTEN]",
    MODEL_ANSWER: modelText || "[No model answer provided - evaluate using your own expert knowledge of the topic.]"
  };

  const filled = fillTemplate(EVAL_PROMPT_TEMPLATE, values);
  return "QUESTION " + (index + 1) + " OF " + test.questions.length + "\n" + filled;
}

// Assemble the combined evaluation text containing all questions in the test
function buildCombinedText(test) {
  const values = {
    DATE: new Date(test.date).toLocaleString(),
    COUNT: test.questions.length,
    TOTAL_MINUTES: test.totalMinutes,
    USED_TIME: formatDuration(test.usedSeconds),
    AUTO_NOTE: test.autoSubmitted ? " (auto-submitted, time over)" : ""
  };
  const header = fillTemplate(COMBINED_HEADER_TEMPLATE, values);
  const parts = [header];

  test.questions.forEach((q, idx) => {
    parts.push("=".repeat(64) + "\n\n" + buildQuestionText(test, q, idx));
  });

  return parts.join("\n\n");
}

// Render test results, evaluation prompt previews, and download/copy options
function renderResult(test) {
  state.lastResultTest = test;

  const answeredCount = test.questions.filter(q => {
    const ans = test.answers[q.id];
    return ans && ans.wordCount > 0;
  }).length;
  const totalQ = test.questions.length;
  const autoNote = test.autoSubmitted ? " · Auto-submitted" : "";

  $("result-summary").textContent = `Answered ${answeredCount} of ${totalQ} questions · Time used: ${formatHM(test.usedSeconds)} of ${formatHM((test.totalMinutes || 0) * 60)} (hh:mm)${autoNote}`;

  const list = $("result-list");
  list.innerHTML = "";

  test.questions.forEach((q, idx) => {
    const ans = test.answers[q.id] || { text: "", wordCount: 0, secondsSpent: 0 };
    const wc = ans.wordCount || 0;
    const limit = q.wordLimit || defaultWordLimit(q.marks);
    const pct = limit > 0 ? (wc / limit) : 0;

    let headingClass = "";
    if (wc > limit) {
      headingClass = "over-limit";
    } else if (pct < 0.75) {
      headingClass = "near-limit";
    }

    const card = document.createElement("div");
    card.className = "result-card";

    const fullPromptText = buildQuestionText(test, q, idx);

    card.innerHTML = `
      <div class="result-card-header">
        <h3>Q${idx + 1} · ${escapeHTML(q.paper)} · ${escapeHTML(q.marks)} marks <span class="wc-pill ${headingClass}">${wc} / ${limit} words</span></h3>
        <div class="actions">
          <button type="button" class="btn-copy-card btn-soft" data-idx="${idx}">Copy prompt</button>
          <button type="button" class="btn-download-card btn-soft" data-idx="${idx}">Download prompt</button>
          <button type="button" class="btn-toggle-model btn-soft" data-idx="${idx}">Show model answer</button>
        </div>
      </div>
      <div class="model-comparison-box" hidden id="model-box-${idx}">
        <strong>Model Answer:</strong>
        <p>${escapeHTML(q.modelAnswer ? q.modelAnswer.trim() : "No model answer provided.")}</p>
        <strong>Your Answer:</strong>
        <p>${escapeHTML(ans.text ? ans.text.trim() : "[No answer written]")}</p>
      </div>
      <div class="ai-slot" data-qid="${escapeHTML(q.id)}"></div>
      <details class="prompt-preview">
        <summary>Evaluation prompt (for grading in another chatbot)</summary>
        <pre class="txt-preview"></pre>
      </details>
    `;

    card.querySelector(".txt-preview").textContent = fullPromptText;
    list.appendChild(card);
  });

  // AI assessment panel + one assessment per question (ai_eval.js)
  if (window.AIEval) AIEval.renderResultScreen(test);
}

// Calculate the number of consecutive practice days ending today or yesterday
function calculateStreak(history) {
  if (!history || history.length === 0) return 0;

  const dateSet = new Set();
  history.forEach(t => {
    if (t.date) {
      dateSet.add(getLocalDateString(t.date));
    }
  });

  const today = new Date();
  const todayStr = getLocalDateString(today);

  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);

  let checkDate = null;
  if (dateSet.has(todayStr)) {
    checkDate = new Date(today);
  } else if (dateSet.has(yesterdayStr)) {
    checkDate = new Date(yesterday);
  } else {
    return 0;
  }

  let streak = 0;
  while (true) {
    const dStr = getLocalDateString(checkDate);
    if (dateSet.has(dStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

// Render historical metrics summary cards including streak, tests, and averages
function renderHistoryStats(history) {
  const statsElem = $("history-stats");
  if (!statsElem) return;
  // subject- and chapter-wise bars instead of averages
  if (typeof renderPerformanceChart === "function") { renderPerformanceChart(statsElem, history, "write"); return; }

  const totalTests = history.length;
  let totalQuestionsAnswered = 0;
  let totalScoreRatioSum = 0;
  let scoredCount = 0;
  let totalWcRatioSum = 0;
  let totalAnsweredCount = 0;

  history.forEach(t => {
    if (t.questions) {
      t.questions.forEach(q => {
        const ans = t.answers ? t.answers[q.id] : null;
        const limit = Number(q.wordLimit) || defaultWordLimit(q.marks);
        if (ans && ans.wordCount > 0) {
          totalQuestionsAnswered++;
          if (limit > 0) {
            totalWcRatioSum += (ans.wordCount / limit) * 100;
            totalAnsweredCount++;
          }
        }

        const score = t.scores ? t.scores[q.id] : null;
        if (score !== null && score !== undefined && score !== "" && !isNaN(score)) {
          const numScore = Number(score);
          const marks = Number(q.marks) || 10;
          if (marks > 0) {
            totalScoreRatioSum += numScore / marks;
            scoredCount++;
          }
        }
      });
    }
  });

  const streak = calculateStreak(history);
  const avgScorePct = scoredCount > 0
    ? ((totalScoreRatioSum / scoredCount) * 100).toFixed(1) + "%"
    : "N/A";
  const avgAdherence = totalAnsweredCount > 0
    ? Math.round(totalWcRatioSum / totalAnsweredCount) + "%"
    : "N/A";

  statsElem.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Tests Taken</div>
      <div class="stat-value">${totalTests}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Questions Answered</div>
      <div class="stat-value">${totalQuestionsAnswered}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Test-day streak</div>
      <div class="stat-value">${streak} ${streak === 1 ? "day" : "days"}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Average Score</div>
      <div class="stat-value">${avgScorePct}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Word Adherence</div>
      <div class="stat-value">${avgAdherence}</div>
    </div>
  `;
}

// Render the complete history screen with summary statistics and past tests
function renderHistory() {
  const history = loadJSON("rbi_history", []);
  const listElem = $("history-list");
  if (!listElem) return;

  renderHistoryStats(history);

  const clearBtn = $("btn-clear-history");
  if (clearBtn) clearBtn.hidden = history.length === 0;

  if (history.length === 0) {
    if (typeof renderHistoryFolders === "function") renderHistoryFolders(listElem, [], () => "", "p2");
    else listElem.innerHTML = `<div class="empty-state">No descriptive tests yet. Finish a test from <strong>New Test</strong> and it will appear here.</div>`;
    return;
  }

  const cardsById = new Map();

  history.forEach(t => {
    const card = document.createElement("div");
    card.className = "history-card";
    card.id = `history-card-${t.id}`;

    const dateStr = new Date(t.date).toLocaleString();
    const usedStr = formatDuration(t.usedSeconds || 0);
    const totalMin = t.totalMinutes || 30;
    const autoNote = t.autoSubmitted ? " (auto-submitted)" : "";

    let totalScore = 0;
    let hasAnyScore = false;
    let totalMax = 0;
    let totalWords = 0;

    let rowsHTML = "";
    let reviewCardsHTML = "";

    (t.questions || []).forEach((q, idx) => {
      totalMax += Number(q.marks) || 10;
      const ans = (t.answers && t.answers[q.id]) || { text: "", wordCount: 0 };
      if (ans.wordCount) totalWords += ans.wordCount;

      const currentScore = (t.scores && t.scores[q.id] !== null && t.scores[q.id] !== undefined)
        ? t.scores[q.id]
        : "";

      if (currentScore !== "" && !isNaN(currentScore)) {
        totalScore += Number(currentScore);
        hasAnyScore = true;
      }

      rowsHTML += `
        <tr>
          <td>Q${idx + 1}</td>
          <td>${escapeHTML(q.paper)}</td>
          <td>${escapeHTML(q.marks)}</td>
          <td>${ans.wordCount || 0} / ${escapeHTML(q.wordLimit)}</td>
          <td>
            <input type="number" class="score-input" step="0.5" min="0" max="${escapeHTML(q.marks)}"
                   data-test-id="${escapeHTML(t.id)}" data-qid="${escapeHTML(q.id)}" value="${currentScore}">
          </td>
          <td>
            <button type="button" class="btn-copy-history btn-soft" data-test-id="${escapeHTML(t.id)}" data-idx="${idx}">Copy prompt</button>
            <button type="button" class="btn-download-history btn-soft" data-test-id="${escapeHTML(t.id)}" data-idx="${idx}">Download</button>
          </td>
        </tr>
      `;

      reviewCardsHTML += `
        <div class="question-review-card">
          <div class="q-review-header">
            <span class="q-review-badge">Q${idx + 1} · ${escapeHTML(q.paper)}</span>
            <span class="q-review-marks-tag">${escapeHTML(q.marks)} Marks · Target: ${escapeHTML(q.wordLimit)} Words</span>
          </div>
          ${q.passage ? `<details class="q-passage-peek"><summary>The ${escapeHTML(passageKind(q.passage))} this question is based on</summary><div class="q-passage-body">${richTextHTML(q.passage)}</div></details>` : ""}
          <div class="q-review-prompt">${escapeHTML(q.text)}</div>
          <div class="q-review-answer-box">
            <div class="q-review-answer-title">
              <span>Your answer · ${ans.wordCount || 0} words</span>
              <button type="button" class="btn-copy-ans-mini" data-test-id="${escapeHTML(t.id)}" data-idx="${idx}">Copy Answer</button>
            </div>
            <div class="q-review-answer-text">${escapeHTML(ans.text || "(No answer recorded for this question)")}</div>
          </div>
          <div class="q-review-score-row">
            <label>
              <strong>Marks Scored:</strong>
              <input type="number" step="0.5" min="0" max="${escapeHTML(q.marks)}" class="score-input score-input-inline"
                     data-test-id="${escapeHTML(t.id)}" data-qid="${escapeHTML(q.id)}" value="${currentScore}">
              <span>/ ${escapeHTML(q.marks)} Marks</span>
            </label>
            ${q.modelAnswer ? `<button type="button" class="btn-toggle-model-mini" data-test-id="${escapeHTML(t.id)}" data-idx="${idx}">Toggle Model Answer</button>` : ""}
          </div>
          ${q.modelAnswer ? `<div class="q-review-model-box" id="model-${escapeHTML(t.id)}-${idx}" style="display:none;"><strong>Model Answer:</strong><br>${escapeHTML(q.modelAnswer)}</div>` : ""}
          <div data-ai-hist-slot="${escapeHTML(t.id + "::" + q.id)}">${window.AIEval ? AIEval.historyBlockHTML(t, q) : ""}</div>
        </div>
      `;
    });

    const fld = typeof testFolderOf === "function" ? testFolderOf(t) : null;
    card.classList.add("tcard-host");
    card.innerHTML = `
      <div class="tcard">
        <div class="tcard-left history-score-slot">${historyScoreBadgeHTML(t)}</div>
        <div class="tcard-main">
          <div class="tcard-top">
            <span class="tcard-type">${escapeHTML(t.testType || "Subjective Practice")}</span>
            <span class="tcard-date">${escapeHTML(formatDateHM(t.date))}</span>
          </div>
          <div class="tcard-title">${escapeHTML(fld && fld.subject ? (fld.kind === "chapter" ? fld.chapter : fld.subject + " · Mix test") : (t.questions[0] && t.questions[0].paper) || "Descriptive test")}</div>
          <div class="tcard-chips">
            <span class="tcard-chip">${t.questions.length} question${t.questions.length === 1 ? "" : "s"}</span>
            <span class="tcard-chip">${totalWords} words</span>
            <span class="tcard-chip" title="Time used of the time allowed">Time ${formatHM(t.usedSeconds || 0)} / ${formatHM(totalMin * 60)}</span>
            ${t.autoSubmitted ? `<span class="tcard-chip tcard-chip-warn">Auto-submitted</span>` : ""}
          </div>
        </div>
        <div class="tcard-actions">
          <button type="button" class="btn-open-results ai-btn-primary tcard-primary" data-test-id="${escapeHTML(t.id)}">Open results</button>
          <button type="button" class="btn-toggle-answer-review btn-soft" data-test-id="${escapeHTML(t.id)}">Review answers</button>
          <button type="button" class="btn-retake btn-soft" data-test-id="${escapeHTML(t.id)}">Retake</button>
          <button type="button" class="btn-soft btn-move-folder" data-store="rbi_history" data-test-id="${escapeHTML(t.id)}">Move to folder</button>
          <button type="button" class="btn-delete-test btn-soft btn-soft-danger" data-test-id="${escapeHTML(t.id)}">Delete</button>
        </div>
      </div>
      <details class="tcard-more"><summary>Marks per question</summary>
      <div class="table-scroll">
      <table class="history-table">
        <thead>
          <tr>
            <th>Q#</th>
            <th>Paper</th>
            <th>Marks</th>
            <th>Words</th>
            <th>Score (input)<br><small style="font-weight:normal;color:var(--muted);">Filled by AI grading, or paste a SCORE_LOG</small></th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>
      </div>
      </details>
      <div class="test-answers-review-container" id="review-container-${escapeHTML(t.id)}" style="display: none;">
        <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #003366; display: flex; align-items: center; justify-content: space-between;">
          <span>Answers and evaluation</span>
          <span style="font-size: 12px; font-weight: normal; color: var(--muted);">${totalWords} total words</span>
        </h4>
        ${reviewCardsHTML}
      </div>
    `;

    cardsById.set(t.id, card);
  });
  // Subject > Chapter tests > chapter > Full / Partial chapter, and Subject > Mix tests
  if (typeof renderHistoryFolders === "function") renderHistoryFolders(listElem, history, t => cardsById.get(t.id), "p2");
  else { listElem.innerHTML = ""; history.forEach(t => listElem.appendChild(cardsById.get(t.id))); }
}

// ---- AI work in the background ---------------------------------------------
// Grading, the objective analysis and the AI Checks keep running while you use other screens.
// A pill in the header shows what is running; History and the calendar update as soon as a
// mark is written; a notice says when the work is finished.
let aiBgTimer = null;

function aiBackgroundWork() {
  const items = [];
  (window.AIEval && AIEval.activity ? AIEval.activity() : []).forEach(g =>
    items.push({ kind: "grading", testId: g.testId, text: `AI grading: ${g.done} of ${g.total} answer${g.total === 1 ? "" : "s"} done` }));
  if (typeof p1AnalysisJobs !== "undefined") p1AnalysisJobs.forEach((j, id) => { if (j.status === "running") items.push({ kind: "analysis", testId: id, text: "AI analysing your objective test" }); });
  if (typeof mcqVerify !== "undefined" && mcqVerify.running) items.push({ kind: "mcq-check", testId: "", text: `AI Check: ${mcqVerify.done} of ${mcqVerify.total} questions` });
  if (typeof descVerify !== "undefined" && descVerify.running) items.push({ kind: "desc-check", testId: "", text: `AI Check: ${descVerify.done} of ${descVerify.total} questions` });
  return items;
}

// The header pill (shown on every screen while AI works in the background)
function updateAIBackgroundStatus() {
  const el = $("ai-bg-status");
  if (!el) return;
  const items = aiBackgroundWork();
  el.hidden = !items.length;
  if (items.length) {
    el.innerHTML = `<span class="ai-spinner" aria-hidden="true"></span><span>${escapeHTML(items[0].text)}${items.length > 1 ? ` · +${items.length - 1} more` : ""}</span>`;
    el.dataset.kind = items[0].kind;
    el.dataset.testId = items[0].testId || "";
    el.title = items.map(i => i.text).join("\n") + "\nClick to open";
    if (!aiBgTimer) aiBgTimer = setInterval(updateAIBackgroundStatus, 1000);
  } else if (aiBgTimer) {
    clearInterval(aiBgTimer);
    aiBgTimer = null;
  }
}

// Open the screen that belongs to a piece of AI work
function openAIWork(kind, testId) {
  if (kind === "grading" || kind === "result") {
    const t = loadJSON("rbi_history", []).find(x => x.id === testId);
    if (!t) return;
    setPhase("phase2");
    renderResult(t);
    showScreen("result");
  } else if (kind === "analysis") {
    setPhase("phase1");
    reviewP1HistoricalTest(testId);
  } else if (kind === "mcq-check") {
    setPhase("phase1");
    showScreen("setup");
  } else if (kind === "desc-check") {
    setPhase("phase2");
    showScreen("setup");
  }
}

// A notice in the corner with an optional "Open" button (never shown during an exam)
function showAINotice(text, kind, testId) {
  const inExam = !($("screen-exam") || {}).hidden || !($("screen-exam-p1") || {}).hidden;
  if (inExam) return;
  let box = $("ai-done-toast");
  if (!box) {
    box = document.createElement("div");
    box.id = "ai-done-toast";
    box.className = "ai-done-toast";
    box.setAttribute("role", "status");
    document.body.appendChild(box);
    box.addEventListener("click", (e) => {
      const open = e.target.closest("[data-ai-open]");
      if (open) openAIWork(open.dataset.aiOpen, open.dataset.testId || "");
      if (open || e.target.closest("[data-ai-dismiss]")) box.classList.remove("is-visible");
    });
  }
  box.innerHTML = `<span class="ai-done-text">${escapeHTML(text)}</span>` +
    (kind ? `<button type="button" class="ai-btn-primary" data-ai-open="${escapeHTML(kind)}" data-test-id="${escapeHTML(testId || "")}">Open</button>` : "") +
    `<button type="button" class="ai-done-close" data-ai-dismiss aria-label="Dismiss">&times;</button>`;
  box.classList.remove("is-visible");
  void box.offsetWidth;
  box.classList.add("is-visible");
  clearTimeout(showAINotice.timer);
  showAINotice.timer = setTimeout(() => box.classList.remove("is-visible"), 15000);
}

// A mark was written in the background: refresh History and the calendar if they are on screen
function refreshAfterGrade(testId) {
  const hist = $("screen-history");
  if (hist && !hist.hidden) {
    const history = loadJSON("rbi_history", []);
    const t = history.find(x => x.id === testId);
    if (t) {
      const slot = document.querySelector(`#history-card-${CSS.escape(testId)} .history-score-slot`);
      if (slot) slot.innerHTML = historyScoreBadgeHTML(t);
      (t.questions || []).forEach(q => {
        const v = t.scores && t.scores[q.id] != null ? t.scores[q.id] : "";
        document.querySelectorAll(`.score-input[data-test-id="${CSS.escape(testId)}"][data-qid="${CSS.escape(q.id)}"]`).forEach(inp => { if (document.activeElement !== inp) inp.value = v; });
        const box = document.querySelector(`[data-ai-hist-slot="${CSS.escape(testId + "::" + q.id)}"]`);
        if (box && window.AIEval) box.innerHTML = AIEval.historyBlockHTML(t, q);
      });
    }
    renderHistoryStats(history);
  }
  const calScreen = $("screen-calendar");
  if (calScreen && !calScreen.hidden && typeof renderCalendar === "function") renderCalendar();
}

function wireAIBackground() {
  document.addEventListener("ai:activity", updateAIBackgroundStatus);
  document.addEventListener("ai:graded", (e) => { refreshAfterGrade(e.detail.testId); updateAIBackgroundStatus(); });
  document.addEventListener("ai:run-done", (e) => {
    updateAIBackgroundStatus();
    const { testId, failed } = e.detail || {};
    const onIt = !($("screen-result") || {}).hidden && state.lastResultTest && state.lastResultTest.id === testId;
    if (onIt) return;
    const t = loadJSON("rbi_history", []).find(x => x.id === testId);
    if (!t) return;
    const qs = t.questions || [];
    const graded = qs.filter(q => t.scores && t.scores[q.id] != null && t.scores[q.id] !== "");
    const got = graded.reduce((a, q) => a + Number(t.scores[q.id] || 0), 0);
    const max = graded.reduce((a, q) => a + (Number(q.marks) || 10), 0);
    showAINotice(`AI Analysis finished (${formatDateHM(t.date)}): ${Number(got.toFixed(2))} / ${max} marks` + (failed ? ` · ${failed} answer${failed === 1 ? "" : "s"} could not be graded` : ""), "result", testId);
  });
  document.addEventListener("ai:analysis-done", (e) => {
    updateAIBackgroundStatus();
    const { testId, ok } = e.detail || {};
    const onIt = !($("screen-result-p1") || {}).hidden && state.p1_lastResultTest && state.p1_lastResultTest.id === testId;
    if (!onIt) showAINotice(ok ? "The topic-wise AI analysis of your objective test is ready." : "The AI analysis of your objective test could not finish.", "analysis", testId);
  });
  document.addEventListener("ai:check-done", (e) => {
    updateAIBackgroundStatus();
    const d = e.detail || {};
    const screen = d.kind === "mcq" ? $("screen-setup-p1") : $("screen-setup");
    if (screen && !screen.hidden) return;
    showAINotice(`AI Check finished: ${d.passed} passed` + (d.issues ? `, ${d.issues} need attention` : "") + (d.failed ? `, ${d.failed} could not be checked` : "") + ".", d.kind === "mcq" ? "mcq-check" : "desc-check", "");
  });
  document.addEventListener("ai:resumed", (e) => {
    updateAIBackgroundStatus();
    showAINotice(`Grading of ${e.detail.count} answer${e.detail.count === 1 ? "" : "s"} was interrupted by a page reload and has started again.`, "", "");
  });
  const pill = $("ai-bg-status");
  if (pill) pill.addEventListener("click", () => openAIWork(pill.dataset.kind, pill.dataset.testId));
}

// Score summary badge of one descriptive test in History
function historyScoreBadgeHTML(t) {
  // marks over the answers that have a score (the same basis as "Performance by subject")
  let total = 0;
  let max = 0;
  let graded = 0;
  let words = 0;
  const n = (t.questions || []).length;
  (t.questions || []).forEach(q => {
    const sc = t.scores ? t.scores[q.id] : null;
    if (sc !== null && sc !== undefined && sc !== "" && !isNaN(sc)) {
      total += Number(sc);
      max += Number(q.marks) || 10;
      graded++;
    }
    const a = t.answers && t.answers[q.id];
    if (a && a.wordCount) words += a.wordCount;
  });
  return graded
    ? scoreRingHTML(max ? total / max * 100 : 0, `<strong>${Number(total.toFixed(2))}</strong> / ${max}` + (graded < n ? `<br>${graded} of ${n} graded` : ""))
    : scoreRingHTML(null, `${words} words<br>not graded yet`);
}

// Update and persist a candidate score assigned to a specific historical question
function handleScoreChange(testId, qid, newScoreVal) {
  const history = loadJSON("rbi_history", []);
  const test = history.find(t => t.id === testId);
  if (!test) return;

  if (!test.scores) test.scores = {};
  const question = (test.questions || []).find(q => q.id === qid);
  const maxMarks = question ? Number(question.marks) || Infinity : Infinity;
  if (newScoreVal === "" || newScoreVal === null || isNaN(newScoreVal)) {
    test.scores[qid] = null;
  } else {
    test.scores[qid] = Math.min(maxMarks, Math.max(0, Number(newScoreVal)));
  }

  test.totalScore = Object.values(test.scores).reduce((a, b) => a + (Number(b) || 0), 0);
  saveJSON("rbi_history", history);
  renderHistoryStats(history);

  // Sync inputs with same testId and qid (table and expanded review)
  document.querySelectorAll(`.score-input[data-test-id="${testId}"][data-qid="${qid}"]`).forEach(inp => {
    inp.value = (test.scores[qid] !== null && test.scores[qid] !== undefined) ? test.scores[qid] : "";
  });
  const badge = document.querySelector(`#history-card-${CSS.escape(testId)} .history-score-slot`);
  if (badge) badge.innerHTML = historyScoreBadgeHTML(test);
  // All answers scored: the calendar ticks this test's TODO and shows its marks
  if (typeof calOnTestScored === "function") calOnTestScored("write", testId);
}

// Load questions from an old test into the setup screen for re-practice
function retakeTest(testId) {
  const history = loadJSON("rbi_history", []);
  const test = history.find(t => t.id === testId);
  if (!test) return;

  state.setup.questions = JSON.parse(JSON.stringify(test.questions));
  state.setup.totalMinutes = test.totalMinutes || 30;
  saveSetup();
  renderSetupList();
  showScreen("setup");
}

// Delete a single practice test from history after confirmation
function deleteTest(testId) {
  if (confirm("Delete this practice test from history?")) {
    let history = loadJSON("rbi_history", []);
    history = history.filter(t => t.id !== testId);
    saveJSON("rbi_history", history);
    if (window.AIEval) AIEval.deleteTestReports(testId);
    renderHistory();
  }
}

// Permanently delete all test history after two-step verification
function clearAllHistory() {
  if (confirm("Are you sure you want to delete all practice history? This cannot be undone.")) {
    const confirmation = prompt("Type DELETE to confirm");
    if (confirmation === "DELETE") {
      localStorage.removeItem("rbi_history");
      if (window.AIEval) AIEval.clearAllReports();
      renderHistory();
    }
  }
}

// Safe concurrent stream decompression helper preventing WHATWG stream backpressure deadlocks
async function decompressBuffer(data, format = "deflate-raw") {
  const ds = new DecompressionStream(format);
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  const writePromise = (async () => {
    try {
      await writer.write(data);
      await writer.close();
    } catch (err) {
      try { await writer.abort(err); } catch (_) {}
      throw err;
    }
  })();

  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } catch (err) {
    try { await reader.cancel(err); } catch (_) {}
    throw err;
  }

  await writePromise;

  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// DOCX import: the document body as clean text lines
// ---------------------------------------------------------------------------
// - Page headers/footers live in separate parts of the file and are never read.
// - Word's automatic numbering and bullets are rebuilt ("1.", "a)", "•"); nested
//   list levels are indented with 3 spaces per level.
// - Tables become one line per row ("cell | cell"); a single-cell "box" keeps its
//   paragraphs as separate lines.
// - Tabs and line breaks inside a paragraph are kept; tracked deletions, field
//   codes and duplicate fallback copies of text boxes are skipped.

const DOCX_W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const DOCX_M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";

// Read selected entries of a ZIP archive as UTF-8 text
async function readZipTextEntries(arrayBuffer, wantedNames) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder("utf-8");
  const found = {};

  // 1. Central directory (authoritative: sizes are right even when data descriptors are used)
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd >= 0) {
    const total = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    for (let i = 0; i < total && p + 46 <= bytes.length && view.getUint32(p, true) === 0x02014b50; i++) {
      const method = view.getUint16(p + 10, true);
      const compSize = view.getUint32(p + 20, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const local = view.getUint32(p + 42, true);
      const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (!wantedNames.includes(name) || local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) continue;
      const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      found[name] = { method, compSize, dataStart };
    }
  }

  // 2. Damaged central directory: scan the local file headers instead
  if (!Object.keys(found).length) {
    let off = 0;
    while (off + 30 <= bytes.length) {
      if (view.getUint32(off, true) !== 0x04034b50) { off++; continue; }
      const method = view.getUint16(off + 8, true);
      let compSize = view.getUint32(off + 18, true);
      const nameLen = view.getUint16(off + 26, true);
      const extraLen = view.getUint16(off + 28, true);
      const name = decoder.decode(bytes.subarray(off + 30, off + 30 + nameLen));
      const dataStart = off + 30 + nameLen + extraLen;
      if (compSize === 0) {
        let scan = dataStart;
        while (scan + 4 <= bytes.length) {
          const s = view.getUint32(scan, true);
          if (s === 0x04034b50 || s === 0x08074b50 || s === 0x02014b50) break;
          scan++;
        }
        compSize = scan - dataStart;
      }
      if (wantedNames.includes(name) && !found[name]) found[name] = { method, compSize, dataStart };
      off = dataStart + Math.max(compSize, 1);
    }
  }

  const out = {};
  for (const name of Object.keys(found)) {
    const e = found[name];
    const raw = bytes.subarray(e.dataStart, Math.min(bytes.length, e.dataStart + e.compSize));
    if (e.method === 0) {
      out[name] = decoder.decode(raw);
    } else if (e.method === 8) {
      out[name] = decoder.decode(await inflateTolerant(raw));
    } else {
      throw new Error("Unsupported ZIP compression method " + e.method + " in " + name + ".");
    }
  }
  return out;
}

// Inflate raw DEFLATE data; if the stream ends with stray bytes, keep everything decoded so far
async function inflateTolerant(raw) {
  try {
    return await decompressBuffer(raw, "deflate-raw");
  } catch (err) {
    const reader = new Response(raw).body.pipeThrough(new DecompressionStream("deflate-raw")).getReader();
    const chunks = [];
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } catch (_) { /* keep the decoded part */ }
    if (!chunks.length) throw err;
    const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let pos = 0;
    for (const c of chunks) { out.set(c, pos); pos += c.length; }
    return out;
  }
}

function docxParseXml(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("The Word document is damaged (its XML could not be read).");
  return doc;
}

function docxKids(el) {
  const out = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n);
  return out;
}

function docxChild(el, localName) {
  for (let n = el && el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && n.localName === localName) return n;
  return null;
}

function docxAttr(el, localName) {
  if (!el) return "";
  return el.getAttributeNS(DOCX_W_NS, localName) || el.getAttribute("w:" + localName) || "";
}

// Symbol / Wingdings characters (w:sym and private-use bullet glyphs)
const DOCX_SYMBOL_MAP = { 0xAE: "→", 0xAC: "←", 0xAD: "↑", 0xAF: "↓", 0xDE: "⇒", 0xDC: "⇐", 0xB3: "≥", 0xA3: "≤", 0xB4: "×", 0xB8: "÷", 0xB1: "±", 0xB9: "≠", 0xBB: "≈", 0xB7: "•", 0xB0: "°", 0xA5: "∞", 0xD6: "√", 0x44: "Δ", 0x53: "Σ", 0x70: "π", 0x61: "α", 0x62: "β", 0x6D: "μ" };
const DOCX_WINGDINGS_MAP = { 0xFC: "✓", 0xFB: "✗", 0xFE: "☑", 0xA7: "▪", 0x6C: "●", 0x6E: "■", 0xD8: "➢", 0xE8: "➔", 0xF0: "⇨", 0x9F: "•" };

function docxSymbolChar(code, font) {
  const c = code >= 0xF000 && code <= 0xF0FF ? code - 0xF000 : code;
  if (/wingdings/i.test(font || "")) return DOCX_WINGDINGS_MAP[c] || "";
  if (/symbol/i.test(font || "") || code >= 0xF000) return DOCX_SYMBOL_MAP[c] || "";
  return String.fromCharCode(code);
}

function docxReadLevel(lvl) {
  const val = (name) => { const e = docxChild(lvl, name); return e ? docxAttr(e, "val") : null; };
  return {
    fmt: val("numFmt") || "decimal",
    text: val("lvlText") || "",
    start: parseInt(val("start") || "1", 10),
    pStyle: val("pStyle") || ""
  };
}

function docxParseNumbering(xml) {
  const result = { abstracts: {}, nums: {} };
  if (!xml) return result;
  const doc = docxParseXml(xml);
  for (const an of Array.from(doc.getElementsByTagNameNS(DOCX_W_NS, "abstractNum"))) {
    const lvls = {};
    for (const lvl of docxKids(an).filter(k => k.localName === "lvl")) lvls[docxAttr(lvl, "ilvl") || "0"] = docxReadLevel(lvl);
    result.abstracts[docxAttr(an, "abstractNumId")] = lvls;
  }
  for (const num of Array.from(doc.getElementsByTagNameNS(DOCX_W_NS, "num"))) {
    const overrides = {};
    for (const ov of docxKids(num).filter(k => k.localName === "lvlOverride")) {
      const so = docxChild(ov, "startOverride");
      const lvl = docxChild(ov, "lvl");
      overrides[docxAttr(ov, "ilvl") || "0"] = { start: so ? parseInt(docxAttr(so, "val"), 10) : null, lvl: lvl ? docxReadLevel(lvl) : null };
    }
    result.nums[docxAttr(num, "numId")] = { abs: docxAttr(docxChild(num, "abstractNumId"), "val"), overrides };
  }
  return result;
}

function docxParseStyles(xml) {
  const styles = {};
  if (!xml) return styles;
  const doc = docxParseXml(xml);
  for (const st of Array.from(doc.getElementsByTagNameNS(DOCX_W_NS, "style"))) {
    const pPr = docxChild(st, "pPr");
    const numPr = pPr && docxChild(pPr, "numPr");
    const numIdEl = numPr && docxChild(numPr, "numId");
    const ilvlEl = numPr && docxChild(numPr, "ilvl");
    styles[docxAttr(st, "styleId")] = {
      basedOn: docxAttr(docxChild(st, "basedOn"), "val"),
      numId: numIdEl ? docxAttr(numIdEl, "val") : null,
      ilvl: ilvlEl ? parseInt(docxAttr(ilvlEl, "val"), 10) : null
    };
  }
  return styles;
}

function docxToRoman(n) {
  const map = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let out = "";
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}

function docxFormatNumber(n, fmt) {
  switch (fmt) {
    case "lowerLetter": return String.fromCharCode(97 + ((n - 1) % 26)).repeat(Math.floor((n - 1) / 26) + 1);
    case "upperLetter": return String.fromCharCode(65 + ((n - 1) % 26)).repeat(Math.floor((n - 1) / 26) + 1);
    case "lowerRoman": return docxToRoman(n);
    case "upperRoman": return docxToRoman(n).toUpperCase();
    case "decimalZero": return n < 10 ? "0" + n : String(n);
    default: return String(n);
  }
}

// Convert word/document.xml (+ numbering and styles) into plain text lines
function docxXmlToText(documentXml, numberingXml, stylesXml) {
  const doc = docxParseXml(documentXml);
  const numbering = docxParseNumbering(numberingXml);
  const styles = docxParseStyles(stylesXml);
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
      return docxFormatNumber(c[k] !== undefined ? c[k] : startOf(numId, k), kDef ? kDef.fmt : "decimal");
    }).trim();
  };
  const cleanLine = (s) => s
    .replace(/[   ]/g, " ")
    .replace(/[​‌‍﻿­]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[ \t]+/g, " ")
    .trim();

  // Text of one paragraph, plus any text boxes found inside it
  function paragraphLines(p) {
    const parts = [];
    const boxes = [];
    (function walk(node) {
      for (const ch of docxKids(node)) {
        const n = ch.localName;
        if (n === "pPr" || n === "rPr" || n === "del" || n === "moveFrom" || n === "delText" || n === "instrText" || n === "rt") continue;
        if (n === "t") { if (ch.namespaceURI === DOCX_W_NS || ch.namespaceURI === DOCX_M_NS) parts.push(ch.textContent); continue; }
        if (n === "tab" && ch.namespaceURI === DOCX_W_NS) { parts.push("\t"); continue; }
        if ((n === "br" || n === "cr") && ch.namespaceURI === DOCX_W_NS) { parts.push("\n"); continue; }
        if (n === "noBreakHyphen") { parts.push("-"); continue; }
        if (n === "softHyphen") continue;
        if (n === "sym") { parts.push(docxSymbolChar(parseInt(docxAttr(ch, "char") || "0", 16), docxAttr(ch, "font"))); continue; }
        if (n === "txbxContent") { boxes.push(ch); continue; }
        if (n === "AlternateContent") {
          // Text boxes are stored twice (modern + legacy copy): read only one of them
          const pick = docxKids(ch).find(k => k.localName === "Choice") || docxKids(ch).find(k => k.localName === "Fallback");
          if (pick) walk(pick);
          continue;
        }
        walk(ch);
      }
    })(p);

    // Numbering: on the paragraph itself, or inherited from its style (e.g. "List Bullet")
    const pPr = docxChild(p, "pPr");
    const styleId = docxAttr(pPr && docxChild(pPr, "pStyle"), "val");
    const numPr = pPr && docxChild(pPr, "numPr");
    let numId = numPr && docxChild(numPr, "numId") ? docxAttr(docxChild(numPr, "numId"), "val") : "";
    let ilvl = numPr && docxChild(numPr, "ilvl") ? parseInt(docxAttr(docxChild(numPr, "ilvl"), "val"), 10) : null;
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

  function blockLines(container) {
    const out = [];
    for (const ch of docxKids(container)) {
      const n = ch.localName;
      if (n === "p") {
        const r = paragraphLines(ch);
        out.push(...r.lines);
        for (const box of r.boxes) out.push(...blockLines(box));
      } else if (n === "tbl") {
        out.push(...tableLines(ch));
      } else if (n === "sdt") {
        const content = docxChild(ch, "sdtContent");
        if (content) out.push(...blockLines(content));
      } else if (n === "customXml" || n === "ins" || n === "moveTo" || n === "sdtContent") {
        out.push(...blockLines(ch));
      }
    }
    return out;
  }

  // Elements with a given local name, looking through wrapper elements (content controls)
  function childrenThrough(el, localName) {
    const out = [];
    for (const ch of docxKids(el)) {
      if (ch.localName === localName) out.push(ch);
      else if (ch.localName === "sdt" || ch.localName === "sdtContent" || ch.localName === "customXml") out.push(...childrenThrough(ch, localName));
    }
    return out;
  }

  function tableLines(tbl) {
    const out = [];
    for (const tr of childrenThrough(tbl, "tr")) {
      const cells = childrenThrough(tr, "tc").map(tc => blockLines(tc).map(l => l.trim()));
      const filled = cells.filter(c => c.length);
      if (!filled.length) continue;
      if (cells.length === 1 || filled.length === 1) out.push(...filled[0]);   // a text "box"
      else out.push(cells.map(c => c.join(" ")).join(" | "));
    }
    return out;
  }

  const body = doc.getElementsByTagNameNS(DOCX_W_NS, "body")[0];
  if (!body) throw new Error("Could not find the document body inside the DOCX file.");
  return blockLines(body).join("\n");
}

// Extract the document body of a DOCX file as plain text lines
async function extractDocxText(arrayBuffer) {
  const parts = await readZipTextEntries(arrayBuffer, ["word/document.xml", "word/numbering.xml", "word/styles.xml"]);
  if (!parts["word/document.xml"]) {
    throw new Error("Could not find document content (word/document.xml) inside the DOCX file.");
  }
  return docxXmlToText(parts["word/document.xml"], parts["word/numbering.xml"], parts["word/styles.xml"]);
}

// ---------------------------------------------------------------------------
// PDF import (Mozilla pdf.js, vendored in vendor/pdfjs and loaded on first use)
// ---------------------------------------------------------------------------
// Text is read through each font's character map (so Word / LibreOffice / Chrome
// PDFs come out as real text), lines are rebuilt from text positions, wrapped lines
// are joined back into paragraphs, and running headers, footers and page numbers
// are removed by their position on the page (top/bottom band, repeated on most pages).

let pdfJsLoading = null;

function loadPdfJs() {
  if (pdfJsLoading) return pdfJsLoading;
  const base = "vendor/pdfjs/";
  pdfJsLoading = new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
    const s = document.createElement("script");
    s.src = base + "pdf.min.js";
    s.onload = () => (window.pdfjsLib ? resolve(window.pdfjsLib) : reject(new Error("The PDF reader did not start.")));
    s.onerror = () => reject(new Error("The PDF reader (vendor/pdfjs/pdf.min.js) could not be loaded."));
    document.head.appendChild(s);
  }).then((lib) => {
    // Runs in a Web Worker when the site is served over http(s); on a file:// page
    // browsers block workers and pdf.js reads the PDF on the page itself.
    lib.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.js";
    return lib;
  }).catch((err) => {
    pdfJsLoading = null;
    throw err;
  });
  return pdfJsLoading;
}

// Group pdf.js text items of one page into visual lines (reading order kept)
function pdfItemsToLines(items, pageNo) {
  const lines = [];
  let cur = null;
  for (const it of items) {
    if (typeof it.str !== "string") continue;
    const tr = it.transform || [1, 0, 0, 1, 0, 0];
    const x = tr[4];
    const y = tr[5];
    const size = Math.abs(it.height) || Math.hypot(tr[2], tr[3]) || 10;
    const width = Math.abs(it.width) || 0;
    if (it.str !== "") {
      const sameLine = cur && Math.abs(y - cur.y) <= Math.max(cur.size, size) * 0.45 && x >= cur.xEnd - Math.max(cur.size, size) * 0.9;
      const visible = it.str.trim() !== "";
      if (!sameLine) {
        if (cur) lines.push(cur);
        cur = { page: pageNo, x, y, xEnd: visible ? x + width : x, size, text: it.str, sizeChars: {}, pieces: [{ x, xEnd: visible ? x + width : x, text: it.str }] };
      } else {
        const gap = x - cur.xEnd;
        // a wide gap inside a line may be a table column ("2023-24      40,000      1,200")
        const piece = cur.pieces[cur.pieces.length - 1];
        if (visible && gap > Math.max(cur.size, size) * 2.5) cur.pieces.push({ x, xEnd: x + width, text: it.str });
        else { piece.text += (gap > size * 0.15 && !/\s$/.test(piece.text) && !/^\s/.test(it.str) ? " " : "") + it.str; if (visible) piece.xEnd = Math.max(piece.xEnd, x + width); }
        // A word gap - or a narrower one after a label such as "100." / "[a]" (the tab after it shrinks)
        const needsSpace = gap > size * 0.15 || (gap > size * 0.05 && /[.):\]]$/.test(cur.text));
        if (needsSpace && !/\s$/.test(cur.text) && !/^\s/.test(it.str)) cur.text += " ";
        cur.text += it.str;
        if (visible) cur.xEnd = Math.max(cur.xEnd, x + width);
      }
      const sk = size.toFixed(1);
      cur.sizeChars[sk] = (cur.sizeChars[sk] || 0) + it.str.trim().length;
    }
    if (it.hasEOL && cur) {
      lines.push(cur);
      cur = null;
    }
  }
  if (cur) lines.push(cur);
  const clean = t => t.replace(/[●•]/g, "•").replace(/[   ]/g, " ").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  // A data row ("2023-24 | 40,000 | 1,200 | 72%"): three or more cells split by wide gaps.
  // Not answer-key rows ("1   c   Moderate"), number grids ("1  2  3  4") or a label
  // followed by its tab ("1.   It has six members", "(a)   ...  (b)   ...").
  const isDataRow = ps => {
    const cells = ps.map(p => clean(p.text)).filter(Boolean);
    if (cells.length < 3 || cells.length !== ps.length) return false;
    // a lone answer letter after the first cell ("1 | c | Moderate"); "A | 4,000 | 3,000" is a row label
    if (cells.slice(1).some(c => /^[\(\[]?[a-eA-E](?:\s*,\s*[a-eA-E])*[\)\]]?(?:\s|$)/.test(c)) || cells.some(c => /^[\(\[]?[a-eA-E][\)\].]\s/.test(c))) return false;
    // "12 | ... | a long explanation": an answer-key row, not data
    if (/^\d{1,3}$/.test(cells[0]) && cells.some(c => c.length > 60)) return false;
    if (cells.every(c => /^\d{1,3}$/.test(c))) return false;
    if (/^(?:[\(\[]?(?:[a-zA-Z]|\d{1,3}|[ivxIVX]{1,4})[\)\].:]|Q(?:uestion)?\s*\.?\s*\d{1,4}\s*[.):\-]?|•)$/.test(cells[0])) return false;
    return cells.some(c => /\d/.test(c));
  };
  const out = [];
  lines.forEach(l => {
    if (l.pieces && l.pieces.length >= 3 && isDataRow(l.pieces)) {
      l.pieces.forEach(p => out.push(Object.assign({}, l, { x: p.x, xEnd: p.xEnd, text: p.text, pieces: null })));
    } else out.push(l);
  });
  return out
    .map(l => Object.assign(l, {
      size: Number(Object.keys(l.sizeChars).sort((a, b) => l.sizeChars[b] - l.sizeChars[a])[0] || l.size),
      text: l.text
        .replace(/[●•]/g, "•")
        .replace(/[   ]/g, " ")
        .replace(/[–—]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
    }))
    .filter(l => l.text);
}

// Merge consecutive pieces that share a baseline into one row, so table cells drawn
// one after another become "cell | cell" like DOCX tables. Drawing order is kept:
// re-sorting by position would interleave the lines of cells that wrap.
function pdfMergeRows(lines) {
  const rows = [];
  for (const l of lines) {
    const row = rows[rows.length - 1];
    if (row && row.page === l.page && Math.abs(row.y - l.y) <= Math.min(row.size, l.size) * 0.35 && l.x >= row.xEnd - 1) {
      const gap = l.x - row.xEnd;
      row.text += (gap > Math.max(row.size, l.size) ? " | " : " ") + l.text;
      row.xEnd = Math.max(row.xEnd, l.xEnd);
    } else {
      rows.push(Object.assign({}, l));
    }
  }
  return rows;
}

// Remove running headers/footers and page numbers: lines in the top or bottom band of a
// page whose text (digits ignored) repeats on many pages, plus bare page numbers there.
function pdfRemovePageFurniture(pages) {
  const BAND = 0.1;
  const PAGE_NO = /^(?:-\s*)?(?:page\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?(?:\s*-)?$|^\d{1,4}\s*\|\s*page$|^page\s*\|\s*\d{1,4}$/i;
  const key = l => l.text.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
  const inBand = (l, p) => l.y >= p.top - (p.top - p.bottom) * BAND || l.y <= p.bottom + (p.top - p.bottom) * BAND;
  const counts = {};
  pages.forEach(p => {
    const seen = new Set();
    p.lines.forEach(l => { if (inBand(l, p)) seen.add(key(l)); });
    seen.forEach(k => { counts[k] = (counts[k] || 0) + 1; });
  });
  const minPages = Math.max(2, Math.ceil(pages.length * 0.3));
  // "... - Page 3" / "Page 3 of 10" at the end of a header or footer line
  const ENDS_WITH_PAGE = /(?:^|[\s\-|–])page\s*\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?\s*$/i;
  pages.forEach(p => {
    p.lines = p.lines.filter(l => !(inBand(l, p) && (PAGE_NO.test(l.text) || ENDS_WITH_PAGE.test(l.text) || (pages.length >= 2 && counts[key(l)] >= minPages))));
  });
  // A one-page PDF has nothing to compare with: a header/footer is the top-most / bottom-most
  // line, sitting in the margin band and set apart from the body by a clear gap.
  if (pages.length === 1) {
    const p = pages[0];
    const byY = p.lines.slice().sort((a, b) => b.y - a.y);
    const drop = new Set();
    if (byY.length > 2) {
      const [top, next] = byY;
      if (inBand(top, p) && top.y - next.y >= top.size * 2.2 && top.text.length <= 100) drop.add(top);
      const [bottom, prev] = [byY[byY.length - 1], byY[byY.length - 2]];
      if (inBand(bottom, p) && prev.y - bottom.y >= bottom.size * 2.2 && bottom.text.length <= 100) drop.add(bottom);
    }
    p.lines = p.lines.filter(l => !drop.has(l));
  }
}

// Join wrapped lines back into paragraphs. A line continues the previous one when the
// previous line stopped only because this line's first word did not fit before the
// right margin (how word processors wrap). Bullets, options, statements ("I.") and
// new questions always start a new line; so does a heading (larger than body text).
function pdfLinesToParagraphs(pages) {
  const NEW_BLOCK = /^(?:[•◦▪‣\-*–]\s|\(?\d{1,3}[.)](?:\s|(?=[A-Z“"‘(]))|\(?[a-zA-Z][.)]\s|\[[a-eA-E]\]|\([a-eA-E]\)|Q\s*[.\-]?\s*\d+|Question\s+\d+|[IVX]{1,4}\.\s|(?:Model\s+)?Answer\s*[:.\-]|Ans\s*[:.\-]|Explanation\s*[:.\-]|Directions?\s*(?:\(|:|for\b))/;
  const LIST_START = /^(?:[•◦▪‣\-*–]\s|\(?\d{1,3}[.)]\s|\(?[a-zA-Z][.)]\s|\[[a-eA-E]\]|\([a-eA-E]\)|[IVX]{1,4}\.\s)/;
  // "...by 2029." + "Which of the statements..." is a new paragraph, not a wrapped line
  const SENTENCE_END = /[.?!]["”’)\]]*$/;
  const STARTS_SENTENCE = /^["“‘(]?[A-Z0-9]/;
  const all = pages.flatMap(p => p.lines);
  if (!all.length) return [];
  // Body text size and the right edge of the text column, measured across the document
  const sizes = all.map(l => l.size).sort((a, b) => a - b);
  const bodySize = sizes[Math.floor(sizes.length / 2)];
  const ends = all.filter(l => Math.abs(l.size - bodySize) <= 2).map(l => l.xEnd).sort((a, b) => a - b);
  const right = ends[Math.min(ends.length - 1, Math.floor(ends.length * 0.98))];
  const left = Math.min(...all.map(l => l.x));
  const isHeadingSize = (l) => l.size > bodySize + 0.4;

  const out = [];
  let prev = null;
  let paraStart = null;   // first line of the paragraph being built
  pages.forEach(p => {
    p.lines.forEach((l, i) => {
      let join = false;
      if (prev && !NEW_BLOCK.test(l.text) && !/ \| /.test(prev.text) && !/ \| /.test(l.text) &&
          (!(isHeadingSize(prev) || isHeadingSize(l)) || Math.abs(prev.size - l.size) <= 0.3)) {
        const charW = (l.xEnd - l.x) / Math.max(1, l.text.length);
        const firstWord = l.text.split(" ")[0];
        const wrapped = prev.xEnd + charW * (firstWord.length + 1) >= right - charW * 1.5;
        const nextLine = prev.page === l.page
          ? prev.y - l.y > 0 && prev.y - l.y <= Math.max(prev.size, l.size) * 1.9
          : i === 0;   // a paragraph running over onto the next page
        // A line at the hanging indent of a bullet/numbered item continues that item
        const hanging = paraStart && LIST_START.test(paraStart.text) && l.x >= paraStart.x + 4;
        const newSentence = SENTENCE_END.test(prev.text) && STARTS_SENTENCE.test(l.text);
        join = wrapped && nextLine && (!newSentence || hanging);
      }
      if (join) {
        const last = out.length - 1;
        // "3,500-" + "5,000 km": the line broke after a hyphen inside a word - no space
        out[last] += /\S-$/.test(out[last]) && /^[\w₹$]/.test(l.text) ? l.text : " " + l.text;
      } else {
        // Nested bullet/numbered items keep a visible indent (3 spaces per level)
        const isListItem = /^(?:[•◦▪‣\-*–]\s|\(?\d{1,3}[.)]\s|\(?[a-z][.)]\s)/.test(l.text);
        const level = Math.max(0, Math.min(3, Math.round((l.x - left) / 18) - 1));
        out.push((isListItem && level > 0 ? "   ".repeat(level) : "") + l.text);
        paraStart = l;
      }
      prev = l;
    });
  });
  return out;
}

// Extract the text of a PDF file as plain lines (one paragraph per line)
async function extractPdfText(arrayBuffer) {
  const pdfjsLib = await loadPdfJs();
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      isEvalSupported: false,   // never compile font code (CVE-2024-4367)
      disableFontFace: true,
      useSystemFonts: false,
      stopAtErrors: false,
      verbosity: 0
    }).promise;
  } catch (err) {
    if (err && err.name === "PasswordException") throw new Error("This PDF is password-protected. Save a copy without a password and import that.");
    throw new Error("This file could not be opened as a PDF (" + ((err && err.message) || err) + ").");
  }
  try {
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const view = page.view || [0, 0, 612, 792];
      pages.push({ top: view[3], bottom: view[1], lines: pdfMergeRows(pdfItemsToLines(content.items, n)) });
      page.cleanup();
    }
    if (!pages.some(p => p.lines.length)) {
      throw new Error("This PDF has no selectable text - it is probably a scanned image. Use the DOCX file, or a PDF exported from Word.");
    }
    pdfRemovePageFurniture(pages);
    return pdfLinesToParagraphs(pages).join("\n");
  } finally {
    pdf.destroy();
  }
}

// Determine if a line is a running header, footer, page number, watermark, or metadata banner
function isHeaderOrFooterLine(line, repetitiveSet = null) {
  if (!line || !line.trim()) return true;
  const trimmed = line.trim();

  // 1. Repetitive running header or footer
  if (repetitiveSet && repetitiveSet.has(trimmed.toLowerCase())) return true;

  // 2. Page numbers and pagination markers
  if (/^(?:page\s*\-*\s*\d+(?:\s*(?:of|\/)\s*\d+)?|\d+\s*(?:of|\/)\s*\d+|\-*\s*\d+\s*\-*|\[\s*\d+\s*\]|p\s*[\.\-]?\s*\d+)$/i.test(trimmed)) return true;
  if (/^page\s*\d+$/i.test(trimmed) || /^\d+\s*\|\s*page$/i.test(trimmed) || /^page\s*\|\s*\d+$/i.test(trimmed)) return true;
  if (/^\d{1,3}$/.test(trimmed)) return true;

  // 3. Web URLs and coaching watermarks
  if (/^(?:https?:\/\/|www\.)\S+$/i.test(trimmed)) return true;
  if (/\b(?:www\.[a-z0-9\-]+\.[a-z]{2,}|[a-z0-9\-]+\.(?:com|in|org|co\.in))\b/i.test(trimmed) && trimmed.length < 80) return true;

  // 4. Section banners and exam headers
  if (/^(?:RBI\s*Grade\s*B(?:\s*\d{4})?|Reserve\s*Bank\s*of\s*India|Phase\s*[\-:]?[I|1|2|II\d]+)(?:\s*[\-:]\s*.*)?$/i.test(trimmed) && !/\?$/.test(trimmed)) return true;
  if (/^(?:Mock\s*Test(?:\s*[A-Z0-9]+)?|Test\s*Series|Practice\s*Set(?:\s*[A-Z0-9]+)?|Practice\s*Paper(?:\s*[A-Z0-9]+)?|Sample\s*Paper(?:\s*[A-Z0-9]+)?|Exercise(?:\s*[A-Z0-9]+)?|Set\s*[\-:]?\s*[A-Z0-9]+|Section\s*[\-:]?\s*[A-Z0-9]+|Paper\s*[\-:]?\s*[I|1|2|II\d]+|Part\s*[\-:]?\s*[A-Z0-9]+)(?:\s*[\-:]\s*.*)?$/i.test(trimmed) && !/\?$/.test(trimmed) && trimmed.length < 100) return true;
  if (/^(?:Chapter\s*[\-:]?\s*\d+|Ch\s*[\-:]?\s*\d+|Unit\s*[\-:]?\s*\d+)(?:\s*[\-:]\s*.*)?$/i.test(trimmed) && !/\?$/.test(trimmed) && trimmed.length < 100) return true;
  if (/^(?:Economic\s*(?:&|and)\s*Social\s*Issues(?:\s*\(ESI\))?|Finance\s*(?:&|and)\s*Management(?:\s*\(F&M\))?|English\s*Descriptive|General\s*Awareness|Quantitative\s*Aptitude|Reasoning\s*Ability|English\s*Language)(?:\s*[\-:]\s*.*)?$/i.test(trimmed) && !/\?$/.test(trimmed) && trimmed.length < 100) return true;

  // 5. Exam instructions and metadata banner lines
  if (/^(?:Time\s*Allowed|Maximum\s*Marks|Total\s*Marks|Total\s*Time|Duration|Instructions?|Note|Important\s*Instructions?)\s*[:\.\-]/i.test(trimmed) && trimmed.length < 80) return true;
  if (/^(?:All\s*questions\s*are\s*compulsory|Read\s*the\s*following\s*instructions\s*carefully)/i.test(trimmed)) return true;

  return false;
}

// Chapter / unit / section / practice-set headings and exam banners (never "Note: ..." content)
function isSectionBannerLine(line) {
  const t = String(line || "").trim();
  if (!t || /\?$/.test(t) || t.length > 100) return false;
  if (/^(?:page\s*\-*\s*\d+(?:\s*(?:of|\/)\s*\d+)?|\d{1,3})$/i.test(t)) return true;
  return /^(?:RBI\s*Grade\s*B(?:\s*\d{4})?|Reserve\s*Bank\s*of\s*India|Phase\s*[\-:]?\s*(?:I{1,2}|[12]))(?:\s*[\-:|]\s*.*)?$/i.test(t) ||
    /^(?:Chapter|Ch|Unit|Section|Part|Practice\s*Set|Practice\s*Paper|Mock\s*Test|Test\s*Series|Sample\s*Paper|Exercise|Paper)\s*[\-:]?\s*[A-Z0-9]+(?:\s*[\-:]\s*.*)?$/i.test(t);
}

// Clean descriptive question lines and strip extraneous title/banner lines
function cleanDescriptiveQuestion(lines, currentTopic = "") {
  if (!lines || lines.length === 0) return { text: "", topic: currentTopic };
  let topic = currentTopic;
  const filtered = lines.filter(l => l.trim().length > 0 && !isHeaderOrFooterLine(l));
  if (filtered.length === 0) return { text: "", topic };

  // If first line is a title or header banner rather than a question prompt:
  if (filtered.length > 1) {
    const first = filtered[0].trim();
    const isDirectiveOrQuestion = /^(?:discuss|explain|analyze|critically|evaluate|what|how|why|which|elaborate|describe|write|elucidate|highlight|examine)\b/i.test(first) || /\?$/.test(first);
    if (!isDirectiveOrQuestion && first.length < 80) {
      if (!topic) topic = first;
      filtered.shift();
    }
  }

  for (let idx = 0; idx < filtered.length; idx++) {
    if (/^(?:Q(?:uestion)?\s*[\.\-]?\s*\d+|\(\d+\)|\[\d+\]|\d+[\.\)])/i.test(filtered[idx])) {
      filtered[idx] = filtered[idx].replace(/^(?:\(\d+\)|\[\d+\]|(?:Question|Q)\s*[\.\-]?\s*\d+|\d+)\s*[\.\:\)\-\]]*\s*/i, "").trim();
      filtered[idx] = filtered[idx].replace(/^[\.\:\)\-\]\s]+/, "").trim();
      break;
    }
  }

  return { text: filtered.join("\n").trim(), topic };
}

// Clean MCQ prompt lines and strip extraneous section headers or page banners
function cleanMCQPrompt(lines) {
  if (!lines || lines.length === 0) return "";
  let clean = lines.filter(l => l.trim().length > 0 && !isHeaderOrFooterLine(l));
  if (clean.length === 0) return "";

  for (let idx = 0; idx < clean.length; idx++) {
    if (/^(?:Q(?:uestion)?\s*[\.\-]?\s*\d+|\(\d+\)|\[\d+\]|\d+[\.\)])/i.test(clean[idx])) {
      clean[idx] = clean[idx].replace(/^(?:\(\d+\)|\[\d+\]|(?:Question|Q)\s*[\.\-]?\s*\d+|\d+)\s*[\.\:\)\-\]]*\s*/i, "").trim();
      clean[idx] = clean[idx].replace(/^[\.\:\)\-\]\s]+/, "").trim();
      break;
    }
  }

  return clean.filter(l => l.trim().length > 0).join("\n").trim();
}

// Does a line read like a question (rather than a point inside an answer)?
function looksLikeQuestionLine(line) {
  const t = String(line || "").replace(/^\s*(?:Q(?:uestion)?\s*[\.\-]?\s*)?\d+\s*[\.\):\-]\s*/i, "");
  if (/\?\s*(?:\(?\s*\d+\s*marks?\s*\)?)?\s*$/i.test(t)) return true;
  if (/\b\d+\s*marks?\b|\b\d+\s*words\b/i.test(t)) return true;
  if (/["”’]\s*(?:critically|discuss|examine|comment|analy[sz]e|evaluate|explain|elucidate)\b/i.test(t)) return true;
  return /^(?:["“'‘(]\s*)?(?:discuss|explain|analy[sz]e|critically|examine|evaluate|assess|describe|elucidate|elaborate|comment|write|highlight|enumerate|suggest|what|why|how|which|who|when|where|identify|outline|state|define|compare|differentiate|distinguish|justify|illustrate|bring\s+out|trace|give|list|mention|in\s+the\s+(?:light|context)|do\s+you|to\s+what\s+extent)\b/i.test(t);
}

// Join model-answer lines: list items and table rows stay on consecutive lines,
// other paragraphs are separated by a blank line.
function joinAnswerLines(lines) {
  const isItem = l => /^\s*(?:[•◦▪‣\-*]|\(?\d{1,3}[.)]|\(?[a-z][.)]|\(?[ivx]{1,5}[.)])\s/i.test(l) || / \| /.test(l);
  let out = "";
  lines.forEach((l, i) => {
    out += i === 0 ? l : (isItem(l) && isItem(lines[i - 1]) ? "\n" : "\n\n") + l;
  });
  return out.replace(/^\n+/, "").replace(/\s+$/, "");
}

// Parse raw document text into structured question objects with paper, marks, and model answers
// The line that opens a shared passage, case or data table for several questions:
// "Read the following passage carefully and answer the questions given below",
// "Study the table below and answer Questions 6 to 10", "Case Study 2: ...", "Passage 1".
// A lone "Consider the following statements and answer the question" is not one.
const PASSAGE_HEADING_RE = /^(?:Case\s*Study|Caselet|Case\s*let|Passage|Reading\s+Comprehension|Comprehension|Data\s+Interpretation\s+Set|DI\s+Set)\s*(?:[-#]?\s*(?:\d{1,2}|[IVX]{1,4}|[A-H]))?\s*(?:[:.\-]\s*.{0,120})?$/i;
// "Directions: choose the correct answer for each question" names no passage, so it is not one
const PASSAGE_LEAD_RE = /^(?:Directions?\b.{0,120}?\b(?:passage|paragraph|extract|excerpt|case|caselet|table|data|graph|chart|information|report|text|article|arrangement|puzzle)s?\b|(?:Read|Study|Go\s+through|Refer\s+to|Look\s+at|Examine|Analy[sz]e|Based\s+on|On\s+the\s+basis\s+of|Use|Consider)\b.{0,90}?\b(?:passage|paragraph|extract|excerpt|case|caselet|table|data|graph|chart|information|report|text|article)s?\b)/i;
// An explicit instruction to answer questions on a passage ("answer the questions that follow", "Questions 3 and 4")
const PASSAGE_INSTRUCTION_RE = /\b(?:answer|attempt)\b.{0,60}\bquestions?\b|\bquestions?\b.{0,40}\b(?:that\s+follow|follows?|given\s+below|below|based\s+on)\b|\bQ(?:s|uestions?)?\.?\s*\d{1,3}\s*(?:-|to|and|&)\s*(?:Q\.?\s*)?\d{1,3}/i;
const PASSAGE_MANY_RE = /\bquestions\b|\bQ(?:s|uestions)?\.?\s*(?:No\.?\s*)?\d{1,4}\s*(?:-|to|and|&)\s*\d{1,4}|\(\s*\d{1,4}\s*(?:-|to)\s*\d{1,4}\s*\)/i;
function isPassageIntro(line) {
  const l = String(line || "").trim();
  if (!l || l.length > 400) return false;
  return PASSAGE_HEADING_RE.test(l) || (PASSAGE_LEAD_RE.test(l) && PASSAGE_MANY_RE.test(l));
}

function parseQuestionsAndAnswers(rawText) {
  if (!rawText || !rawText.trim()) return [];

  const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // origLines keep leading spaces (indentation of nested bullets) for model answers;
  // rawLines are trimmed and used for detection.
  const origLines = text.split("\n").map(l => l.replace(/\s+$/, ""));
  const rawLines = origLines.map(l => l.trim());
  // "Answer:", "Ans.", "Model Answer -" or the word alone on a line - but not "Answering..." / "Solutions include..."
  const ANSWER_RE = /^(?:(?:Model\s+)?Answer|Ans|Solution|Reference\s+Answer)\b\s*(?:[:\.\-]\s*|$)(.*)$/i;
  // Running headers/footers are never in this text: DOCX keeps them in separate parts and
  // the PDF reader removes them by position. So nothing that repeats (e.g. a "Conclusion"
  // heading in every answer) is thrown away here.
  const repHeaders = null;

  // Check document-level metadata from the first few lines
  let docDefaultPaper = "Other";
  let docDefaultTopic = "";
  const headerPreview = rawLines.slice(0, 15).join(" ");
  if (/\bESI\b/i.test(headerPreview)) docDefaultPaper = "ESI";
  else if (/\bFinance\b/i.test(headerPreview)) docDefaultPaper = "Finance";
  else if (/\bManagement\b/i.test(headerPreview)) docDefaultPaper = "Management";
  else if (/\bEnglish(?:\s+Descriptive)?\b/i.test(headerPreview)) docDefaultPaper = "English Descriptive";
  // An economics title ("National Income: Answer Writing") - the title lines only, not question text
  else if (/\b(?:national income|GDP|GVA|inflation|fiscal|monetary policy|economy|economic growth)\b/i.test(rawLines.filter(Boolean).slice(0, 2).join(" "))) docDefaultPaper = "ESI";

  for (let i = 0; i < Math.min(5, rawLines.length); i++) {
    const line = rawLines[i];
    if (!line) continue;
    const chMatch = line.match(/^(?:Chapter\s*[\-:]?\s*\d+|Ch\s*[\-:]?\s*\d+)\s*[:\.\-]\s*(.+)/i);
    if (chMatch) {
      docDefaultTopic = chMatch[1].replace(/questions?|test|practice/gi, "").trim();
      break;
    }
    if (!docDefaultTopic && !isHeaderOrFooterLine(line, repHeaders) && !/^(?:Question|Q\d|\d+[\.\)])/i.test(line)) {
      const titleMatch = line.match(/^([^:\(\)\|]+)/);
      if (titleMatch) {
        docDefaultTopic = titleMatch[1].trim();
        break;
      }
    }
  }

  const qNumRegex = /^(?:Question\s*(\d+)|Q\s*[\.\-]?\s*(\d+))\s*[\.\:\)\-]?/i;
  // "Question (15 Marks, 600 Words): Explain ..." - marks / words in brackets, no number
  const UNNUMBERED_Q_RE = /^Question\s*[\(\[]\s*(\d{1,2})\s*marks?\s*(?:[,;|\/\-]\s*(\d{2,4})\s*words?\s*)?[\)\]]\s*[:.\-]?\s*(.*)$/i;
  const rawQuestionStarts = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line || isHeaderOrFooterLine(line, repHeaders)) continue;

    const m = line.match(qNumRegex);
    if (m) {
      const qNum = parseInt(m[1] || m[2], 10);
      rawQuestionStarts.push({ lineIndex: i, qNum, line });
    } else if (/^(?:Question|Q)\s*[:\.\-]/i.test(line) || UNNUMBERED_Q_RE.test(line)) {
      let j = i - 1;
      while (j >= 0 && (!rawLines[j] || isHeaderOrFooterLine(rawLines[j], repHeaders))) j--;
      // "Q1. GDP and Welfare" + "Question (15 Marks, 600 Words): ..." is ONE question: the second line is its metadata
      const prevStart = rawQuestionStarts[rawQuestionStarts.length - 1];
      if (UNNUMBERED_Q_RE.test(line) && prevStart && prevStart.lineIndex === j) continue;
      // "Question (15 Marks, 600 Words): ..." under a topic heading: the heading starts the question
      // (not a bullet, a numbered point or a table row that ends the previous answer)
      let start = i;
      if (UNNUMBERED_Q_RE.test(line) && j >= 0 && rawLines[j].length <= 120 && !/[.?:;,]$/.test(rawLines[j]) &&
          !/^(?:[•◦▪‣\-*]|\d+[.)])\s/.test(rawLines[j]) && !rawLines[j].includes(" | ")) start = j;
      rawQuestionStarts.push({ lineIndex: start, qNum: null, line });
    }
  }

  // Deduplicate consecutive starts with the same question number (e.g. "Q1." followed by "QUESTION 1")
  const questionStarts = [];
  for (const qs of rawQuestionStarts) {
    const last = questionStarts[questionStarts.length - 1];
    if (last && qs.qNum !== null && last.qNum === qs.qNum) {
      continue;
    }
    questionStarts.push(qs);
  }

  // Fallback: questions numbered only "1.", "2." ... (typed, or Word auto-numbering).
  // Numbered points inside an answer restart at 1 - after such a restart, the next
  // number only starts a question if the line reads like one. Indented (nested)
  // items are never questions.
  if (questionStarts.length === 0) {
    let expected = null;
    let restarted = false;
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const m = line.match(/^(\d+)[\.\)]\s+\S/);
      if (!m || /^\s/.test(origLines[i]) || isHeaderOrFooterLine(line, repHeaders)) continue;
      const n = parseInt(m[1], 10);
      if (expected !== null && n !== expected) {
        if (n < expected) restarted = true;
        continue;
      }
      if (restarted && !looksLikeQuestionLine(line)) continue;
      questionStarts.push({ lineIndex: i, qNum: n, line });
      expected = n + 1;
      restarted = false;
    }
  }

  // Fallback for single question with explicit Answer: marker or directive verb
  if (questionStarts.length === 0) {
    let firstContentIdx = 0;
    while (firstContentIdx < rawLines.length && (!rawLines[firstContentIdx] || isHeaderOrFooterLine(rawLines[firstContentIdx], repHeaders))) {
      firstContentIdx++;
    }
    if (firstContentIdx < rawLines.length) {
      questionStarts.push({ lineIndex: firstContentIdx, qNum: 1, line: rawLines[firstContentIdx] });
    }
  }

  // Shared passages / case studies / data tables ("Read the case below and answer Questions
  // 3 to 5"): from the intro line to the next question. They are cut out of the previous
  // answer and shown above every question they cover (the range in the intro, otherwise
  // the following questions up to the next passage or section banner).
  const passages = [];
  for (let i = 0; i < rawLines.length; i++) {
    if (!isPassageIntro(rawLines[i]) || ANSWER_RE.test(rawLines[i])) continue;
    const nextK = questionStarts.findIndex(st => st.lineIndex > i);
    if (nextK < 0 || questionStarts.some(st => st.lineIndex === i)) continue;
    // right under a question's own number it is that question's text ("Q1. (15 marks)" / "Read the case ...")
    const owner = nextK > 0 ? questionStarts[nextK - 1] : null;
    if (owner && rawLines.slice(owner.lineIndex + 1, i).filter(Boolean).length === 0) continue;
    const end = questionStarts[nextK].lineIndex;
    const idx = [];
    for (let j = i; j < end; j++) if (rawLines[j]) idx.push(j);
    while (idx.length > 1 && isSectionBannerLine(rawLines[idx[idx.length - 1]])) idx.pop();
    // a passage block never holds an answer: then the line was part of an answer
    if (idx.length < 2 || idx.some(j => ANSWER_RE.test(rawLines[j]))) continue;
    // after a question (inside its answer), "Case Study: ..." is a section of that answer unless
    // the block tells you to answer questions on it
    if (owner && !idx.some(j => PASSAGE_INSTRUCTION_RE.test(rawLines[j]))) continue;
    const r = rawLines[i].match(/\b(?:Q(?:s|uestions?)?\.?\s*(?:No\.?\s*)?)(\d{1,3})\s*(?:-|to|and|&)\s*(?:Q\.?\s*)?(\d{1,3})\b/i) || rawLines[i].match(/\(\s*(\d{1,3})\s*(?:-|to)\s*(\d{1,3})\s*\)/);
    passages.push({ start: i, end, firstK: nextK, text: idx.map(j => rawLines[j]).join("\n"), from: r ? Number(r[1]) : null, to: r ? Number(r[2]) : null });
    i = end - 1;
  }
  // which passage (if any) each question uses
  const passageFor = questionStarts.map(() => "");
  passages.forEach((ps, n) => {
    const stop = n + 1 < passages.length ? passages[n + 1].firstK : questionStarts.length;
    for (let k = ps.firstK; k < stop; k++) {
      const num = questionStarts[k].qNum;
      if (ps.from !== null && num !== null && num !== undefined) {
        if (num < ps.from || num > ps.to) { if (num > ps.to) break; continue; }
      } else if (k > ps.firstK) {
        // no range given: stop at a section banner between the questions
        const gap = rawLines.slice(questionStarts[k - 1].lineIndex, questionStarts[k].lineIndex);
        if (gap.some(l => l && isSectionBannerLine(l))) break;
      }
      passageFor[k] = ps.text;
    }
  });

  const results = [];

  for (let k = 0; k < questionStarts.length; k++) {
    const startIdx = questionStarts[k].lineIndex;
    let endIdx = (k + 1 < questionStarts.length) ? questionStarts[k + 1].lineIndex : rawLines.length;
    const cut = passages.find(ps => ps.start > startIdx && ps.start < endIdx);
    if (cut) endIdx = cut.start;
    const blockIdx = [];
    for (let i = startIdx; i < endIdx; i++) if (rawLines[i]) blockIdx.push(i);
    // A section banner between two questions ("Chapter 2", "Practice Set B") is not part of the answer
    while (blockIdx.length > 1 && isSectionBannerLine(rawLines[blockIdx[blockIdx.length - 1]])) blockIdx.pop();
    const blockLines = blockIdx.map(i => rawLines[i]);

    if (blockLines.length === 0) continue;

    let paper = docDefaultPaper;
    let topic = docDefaultTopic;
    let marks = 10;
    let wordLimit = 400;

    const qLines = [];
    const aLines = [];
    let inAnswer = false;

    // Check if there is an explicit Answer: / Ans: marker in this question block
    const hasExplicitAnswer = blockLines.some(l => ANSWER_RE.test(l));

    for (let i = 0; i < blockLines.length; i++) {
      const line = blockLines[i];
      const answerLine = origLines[blockIdx[i]]; // keeps nested-bullet indentation

      // A topic heading right above "Question (15 Marks, 600 Words): ..."
      if (i === 0 && qLines.length === 0 && !inAnswer && blockLines[1] && UNNUMBERED_Q_RE.test(blockLines[1]) && !UNNUMBERED_Q_RE.test(line)) {
        topic = line.replace(/^(?:Q(?:uestion)?\s*[.\-]?\s*\d+\s*[.):\-]\s*)/i, "").trim() || line;
        continue;
      }
      // "Question (15 Marks, 600 Words): Explain ..."
      const unq = !inAnswer && qLines.length === 0 ? line.match(UNNUMBERED_Q_RE) : null;
      if (unq) {
        marks = Number(unq[1]);
        wordLimit = unq[2] ? Number(unq[2]) : (marks === 15 ? 600 : 400);
        if (unq[3].trim()) qLines.push(unq[3].trim());
        continue;
      }

      // Check for inline metadata e.g. "QUESTION 1     15 MARKS     600 WORDS"
      if (/^Q(?:uestion)?\s*\.?\s*\d+\s*[:.\-]?\s*[\(\[]?\s*\d+\s*marks?\s*[\)\]]?\s*(?:[|,\-·•]?\s*[\(\[]?\s*\d+\s*words?\s*[\)\]]?)?\s*$/i.test(line)) {
        const mMarks = line.match(/(\d+)\s*MARKS/i);
        if (mMarks) marks = Number(mMarks[1]);
        const mWords = line.match(/(\d+)\s*WORDS/i);
        if (mWords) wordLimit = Number(mWords[1]);
        else wordLimit = (marks === 15) ? 600 : 400;
        continue;
      }

      // Topic header e.g. "Q1. GDP and Welfare" - but "Q1. Discuss the role of RBI..." is the question itself
      const topicHeaderMatch = line.match(/^(?:Q(?:uestion)?\s*[\.\-]?\s*)\d+\s*[\.\):\-]\s*(.+)/i);
      if (topicHeaderMatch && qLines.length === 0 && !inAnswer) {
        const rest = topicHeaderMatch[1].trim();
        const next = blockLines[i + 1] || "";
        if (rest.length <= 80 && !looksLikeQuestionLine(rest) && next && !ANSWER_RE.test(next)) {
          topic = rest;
          continue;
        }
      }

      // Check standard metadata lines: "Marks: 10", "Paper: Finance", "Topic: ...", "Word limit: 400"
      const marksMatch = line.match(/^(?:Marks?|Maximum\s+marks?)\s*[:\.\-]?\s*(\d+)/i);
      if (marksMatch && !inAnswer) {
        marks = Number(marksMatch[1]);
        wordLimit = (marks === 15) ? 600 : 400;
        continue;
      }

      const wlMatch = line.match(/^(?:Word\s*limit|Words?)\s*[:\.\-]?\s*(\d+)/i);
      if (wlMatch && !inAnswer) {
        wordLimit = Number(wlMatch[1]);
        continue;
      }

      const paperMatch = line.match(/^(?:Paper|Subject)\s*[:\.\-]?\s*(.+)/i);
      if (paperMatch && !inAnswer) {
        const val = paperMatch[1].trim();
        if (/esi/i.test(val)) paper = "ESI";
        else if (/finance/i.test(val)) paper = "Finance";
        else if (/management/i.test(val)) paper = "Management";
        else if (/english/i.test(val)) paper = "English Descriptive";
        else paper = val || docDefaultPaper;
        continue;
      }

      const topicMatch = line.match(/^Topic\s*[:\.\-]?\s*(.+)/i);
      if (topicMatch && !inAnswer) {
        topic = topicMatch[1].trim();
        continue;
      }

      // Check for explicit Answer start
      const ansMatch = line.match(ANSWER_RE);
      if (ansMatch) {
        inAnswer = true;
        if (ansMatch[1].trim()) aLines.push(ansMatch[1].trim());
        continue;
      }

      if (hasExplicitAnswer) {
        if (!inAnswer) {
          const cleanQ = line.replace(/^(?:\(\d+\)|\[\d+\]|(?:Question|Q)\s*[\.\-]?\s*\d+|\d+)\s*[\.\:\)\-\]]*\s*/i, "").replace(/^[\.\:\)\-\]\s]+/, "");
          if (cleanQ) qLines.push(cleanQ);
        } else {
          aLines.push(answerLine);
        }
      } else {
        // No explicit Answer marker in document: first non-metadata paragraph is Question prompt, rest is Model Answer
        if (qLines.length === 0) {
          const cleanQ = line.replace(/^(?:\(\d+\)|\[\d+\]|(?:Question|Q)\s*[\.\-]?\s*\d+|\d+)\s*[\.\:\)\-\]]*\s*/i, "").replace(/^[\.\:\)\-\]\s]+/, "");
          if (cleanQ) qLines.push(cleanQ);
        } else {
          aLines.push(answerLine);
        }
      }
    }

    const cleaned = cleanDescriptiveQuestion(qLines, topic);
    // Marks written inside the question: "... (15 marks)" / "[10 Marks]" (the text itself is kept)
    const inlineMarks = cleaned.text.match(/[\(\[]\s*(\d{1,2})\s*marks?\s*[\)\]]/i);
    if (inlineMarks && marks === 10 && wordLimit === 400) {
      marks = Number(inlineMarks[1]);
      wordLimit = marks === 15 ? 600 : 400;
    }
    const questionText = cleaned.text;
    topic = cleaned.topic;
    // The model answer exactly as written in the file (headings, bullets, table rows, order)
    const modelAnswer = joinAnswerLines(aLines);

    if (questionText || modelAnswer) {
      results.push({
        paper,
        topic,
        text: questionText || "Imported Question",
        marks: marks || 10,
        wordLimit: wordLimit || ((marks === 15) ? 600 : 400),
        modelAnswer
      });
      if (passageFor[k]) results[results.length - 1].passage = passageFor[k];
    }
  }

  return results;
}

// A textarea that grows to show all of its text, so a long model answer never needs its own scrollbar
function autoGrowTextarea(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = (el.scrollHeight + 4) + "px";
}

// The app's own extraction check, before any AI: is the question and its model answer word for
// word in the file, and what follows the answer there (normally the next question)? The AI
// Check uses this to tell a faithful extraction (whose text simply ends where the file's does)
// from a broken one (cut off or merged with another question).
function descMarkSource(questions, rawText) {
  const norm = v => String(v || "").replace(/\s+/g, " ").trim();
  const R = norm(rawText);
  let from = 0;
  (questions || []).forEach(q => {
    const qt = norm(q.text);
    const ma = norm(q.modelAnswer);
    let qi = qt ? R.indexOf(qt, from) : -1;
    if (qi < 0 && qt) qi = R.indexOf(qt);
    const ai = ma ? R.indexOf(ma, Math.max(0, qi)) : -1;
    const end = ma ? (ai >= 0 ? ai + ma.length : -1) : (qi >= 0 ? qi + qt.length : -1);
    if (end > 0) from = end;
    q.src = { verbatim: qi >= 0 && (!ma || ai >= 0), after: end >= 0 ? R.slice(end, end + 160).trim() : "" };
  });
}

// Read an uploaded DOCX or PDF file, extract its questions, and insert them into the target list
async function handleDocImport(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const statusElem = $("setup-doc-status");
  if (statusElem) {
    statusElem.textContent = "Reading " + file.name + "...";
  }

  try {
    const arrayBuffer = file.arrayBuffer ? await file.arrayBuffer() : await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsArrayBuffer(file);
    });

    const fileName = file.name.toLowerCase();
    let rawText = "";

    if (fileName.endsWith(".docx")) {
      rawText = await extractDocxText(arrayBuffer);
    } else if (fileName.endsWith(".pdf")) {
      rawText = await extractPdfText(arrayBuffer);
    } else {
      throw new Error("Unsupported format. Please upload a .docx or .pdf file.");
    }

    if (!rawText || !rawText.trim()) {
      throw new Error("No readable text found in the document.");
    }

    // An MCQ file (options [a]-[e]) must not be imported as descriptive questions.
    // Descriptive files parse to 0 MCQs, so 3 is a safe threshold.
    const mcqLike = parseMCQDocument(rawText, inferMCQSubject(rawText)).filter(q => (q.options || []).length >= 4);
    if (mcqLike.length >= 3) {
      if (statusElem) statusElem.textContent = "";
      if (confirm(`"${file.name}" is an objective (MCQ) file with ${mcqLike.length} MCQs, not descriptive questions.\n\nOK = add them to the Objective (MCQ) test instead\nCancel = do not import`)) {
        const folder = typeof askFileFolder === "function" ? await askFileFolder(file.name, rawText, inferMCQSubject(rawText), mcqLike.length) : {};
        if (!folder) return;
        applyFolderToQuestions(mcqLike, folder);
        addImportedMCQs(mcqLike, file.name);
      }
      return;
    }

    const parsedQuestions = parseQuestionsAndAnswers(rawText);
    if (!parsedQuestions || parsedQuestions.length === 0) {
      throw new Error("Could not detect any questions in the file.");
    }

    // before any AI looks at them: is each question and model answer word for word in the file?
    descMarkSource(parsedQuestions, rawText);

    // which subject / chapter the file belongs to (History is sorted into these folders)
    if (typeof askFileFolder === "function") {
      if (statusElem) statusElem.textContent = "";
      const folder = await askFileFolder(file.name, rawText, parsedQuestions[0].paper, parsedQuestions.length);
      if (!folder) {
        if (statusElem) statusElem.textContent = "Import cancelled.";
        return;
      }
      applyFolderToQuestions(parsedQuestions, folder);
    }

    parsedQuestions.forEach(q => {
      q.id = makeId("q");
      q.check = { ai: null, user: "" };
      state.setup.questions.push(q);
    });
    saveSetup();
    renderSetupList();
    // the AI Check runs only when you press "AI Check"

    if (statusElem) {
      statusElem.textContent = `Added ${parsedQuestions.length} question(s) from ${file.name}.`;
      setTimeout(() => { statusElem.textContent = ""; }, 6000);
    }
  } catch (err) {
    if (statusElem) {
      statusElem.textContent = "Could not import: " + err.message;
      statusElem.classList.add("is-error");
      setTimeout(() => { statusElem.classList.remove("is-error"); }, 6000);
    }
    alert("File read error: " + err.message);
  } finally {
    event.target.value = "";
  }
}

// ==========================================
// PHASE 1: OBJECTIVE / MCQ TEST FUNCTIONS
// ==========================================

// ---- MCQ document parser --------------------------------------------------
// Every question keeps its own number (and set), and the answer key is matched
// by that number - never by position - so one unreadable question can no longer
// shift every later answer onto the wrong question.

// "c", "(c)", "[C]", "a, e", "(a) and (d)", "ade" -> "c" / "ae" / "ad" / "ade" ("" if not an answer)
function normalizeMCQAnswer(raw) {
  const s = String(raw || "").trim().replace(/[.;]$/, "");
  if (!s) return "";
  const one = s.match(/^[\(\[]?([a-eA-E])[\)\]]?$/);
  if (one) return one[1].toLowerCase();
  const sep = /^[\(\[]?[a-eA-E][\)\]]?(?:\s*(?:,|&|\/|\+|\band\b|\s)\s*[\(\[]?[a-eA-E][\)\]]?)+$/i;
  const packed = /^[a-eA-E]{2,5}$/;
  if (!sep.test(s) && !packed.test(s)) return "";
  const letters = s.toLowerCase().replace(/\band\b/g, " ").match(/[a-e]/g) || [];
  if (packed.test(s) && new Set(letters).size !== letters.length) return "";   // "dead", "add" are words
  return [...new Set(letters)].sort().join("");
}

// "ae" -> "A, E" (for display)
function formatMCQAnswer(ans) {
  return String(ans || "").toUpperCase().split("").join(", ");
}

// Does this MCQ expect more than one option?
function isMultiAnswerMCQ(q) {
  const text = String((q && q.text) || "");
  return String((q && q.correctAnswer) || "").length > 1 ||
    /\bMULTI(?:PLE)?[\s-]*(?:CORRECT|ANSWER|RESPONSE|SELECT)/i.test(text) ||
    /\b(?:one or more|more than one|all (?:the )?(?:correct|applicable)) (?:options?|answers?|statements?)\b.{0,20}\b(?:may|can|could|are|is) be (?:correct|right|true)|select all that apply/i.test(text);
}

// Option labels in a line: (a) [a] a) a. - each style ("family") and case counted separately
function mcqFindLabels(line, allowed) {
  const defs = {
    paren: /\(([a-eA-E])\)/g,
    bracket: /\[([a-eA-E])\]/g,
    close: /(^|\s)([a-eA-E])\)/g,
    dot: /(^|\s)([a-eA-E])\.(?=\s)/g
  };
  const out = [];
  for (const id of Object.keys(defs)) {
    const re = new RegExp(defs[id].source, "g");
    let m;
    while ((m = re.exec(line)) !== null) {
      const spaced = id === "close" || id === "dot";
      const ch = spaced ? m[2] : m[1];
      const fam = id + (ch === ch.toLowerCase() ? "-l" : "-u");
      if (allowed && !allowed.has(fam)) continue;
      const start = m.index + (spaced ? m[1].length : 0);
      // "Column B", "Part A)", "List II (A)" are not options
      // (capitalised words only: "[d] list [e] withdraw" are real options)
      if (/\b(?:Column|Section|Part|Table|Schedule|Figure|Group|Row|List|Statement|Type|Set)\s*$/.test(line.slice(Math.max(0, start - 12), start))) continue;
      out.push({ label: ch.toLowerCase(), start, end: m.index + m[0].length, fam });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// Which option styles does this document use? (so "A. Simon Kuznets" in a match-list
// is not read as option A in a paper whose options are written "(a)")
function mcqOptionFamilies(lines) {
  const score = {};
  for (const line of lines) {
    const labels = mcqFindLabels(line, null);
    if (!labels.length) continue;
    if (labels[0].start === 0 && labels[0].label === "a") score[labels[0].fam] = (score[labels[0].fam] || 0) + 2;
    // a chain a -> b -> c of one style on one line
    for (const fam of new Set(labels.map(l => l.fam))) {
      const seq = labels.filter(l => l.fam === fam).map(l => l.label).join("");
      if (seq.includes("abc")) score[fam] = (score[fam] || 0) + 1;
    }
  }
  const max = Math.max(0, ...Object.values(score));
  if (max === 0) return null;                       // nothing found: allow every style
  return new Set(Object.keys(score).filter(f => score[f] >= Math.max(2, max * 0.25)));
}

// Split a line into question text + options. expected = the next option letter of the question.
function mcqSplitOptions(line, allowed, expected) {
  const labels = mcqFindLabels(line, allowed);
  if (!labels.length) return null;
  const chainFrom = (i) => {
    const chain = [labels[i]];
    for (let j = i + 1; j < labels.length; j++) {
      const prev = chain[chain.length - 1];
      if (labels[j].fam === prev.fam && labels[j].start >= prev.end &&
          labels[j].label.charCodeAt(0) === prev.label.charCodeAt(0) + 1) chain.push(labels[j]);
    }
    return chain;
  };
  const toOpts = (chain) => chain.map((l, k) => ({
    label: l.label,
    text: line.slice(l.end, k + 1 < chain.length ? chain[k + 1].start : line.length).trim()
  }));

  const first = labels[0];
  if (first.start === 0) {
    const ok = first.label === "a" || first.label === expected || (expected && first.label > expected);
    if (!ok) return null;
    return { stem: "", opts: toOpts(chainFrom(0)) };
  }
  // Options written after the question on the same line: "Who ...? (a) X (b) Y (c) Z (d) W"
  if (expected === "a") {
    for (let i = 0; i < labels.length; i++) {
      if (labels[i].label !== "a") continue;
      const chain = chainFrom(i);
      if (chain.length >= 3) return { stem: line.slice(0, labels[i].start).trim(), opts: toOpts(chain) };
    }
  }
  return null;
}

// Parse the answer-key part of an MCQ document into entries keyed by "set:number"
// Split a document's lines into the questions and its answer-key section ("Answer Key",
// "Answers", "Answers & Explanations"...). keyOnly: a file that is only an answer key.
function mcqSplitKeySection(allLines, keyOnly) {
  const NOTE_RE = /^(?:Note|N\.\s?B\.|Hint)\s*[:.\-]/i;
  const ANSWER_SECTION_RE = /^(?:answer\s*keys?|answers|solutions|answers?\s*(?:&|and|with)\s*(?:explanations?|solutions?|reasons?)|answer\s*keys?\s*(?:&|and|with)\s*(?:explanations?|solutions?|reasons?))\s*:?$/i;
  let ansKeyIdx = -1;
  let ansKeyRest = "";
  for (let i = 0; i < allLines.length; i++) {
    const inline = allLines[i].match(/^(?:answer\s*keys?|answers)\s*:\s*(.+)$/i);   // "Answers: 1-a, 2-c, ..."
    if (ANSWER_SECTION_RE.test(allLines[i]) || inline) {
      ansKeyIdx = i;
      ansKeyRest = inline ? inline[1] : "";
      break;
    }
  }
  // an answer-key file without such a heading is all key
  const qLines = ansKeyIdx !== -1 ? allLines.slice(0, ansKeyIdx) : (keyOnly ? [] : allLines);
  const keyPart = ansKeyIdx !== -1 ? (ansKeyRest ? [ansKeyRest] : []).concat(allLines.slice(ansKeyIdx + 1)) : (keyOnly ? allLines : []);
  const aLines = keyPart
    // a bare number is a page number - unless an answer follows it ("158" / "a, b, d, e" from a wrapped table cell)
    .filter((l, i, arr) => !isHeaderOrFooterLine(l) || /^(?:practice\s*set|set|section|part|exercise)\b/i.test(l) || NOTE_RE.test(l) ||
      (/^\d{1,4}$/.test(l) && /^[\(\[]?[a-eA-E][\)\]]?(?:[\s,&\/]+[\(\[]?[a-eA-E][\)\]]?)*,?$|^[a-e]{2,5}$/.test(arr[i + 1] || "")));
  return { qLines, aLines };
}

// A separate answer-key file ("Answer Key" grid and / or "Answers with Explanations"):
// the key of every question number it lists, as parseMCQAnswerKey returns it
function parseAnswerKeyFile(rawText) {
  const allLines = String(rawText || "").replace(/\r\n?/g, "\n").split("\n").map(l => l.trim()).filter(Boolean);
  const { aLines } = mcqSplitKeySection(allLines, true);
  return parseMCQAnswerKey(aLines, false);
}

function parseMCQAnswerKey(lines, multiSection) {
  lines = lines.slice();   // a flattened header line is split in place below
  const entries = new Map();
  const order = [];
  let aSection = 0;
  let setHeaders = 0;
  let maxSeen = 0;
  let cur = null;        // entry that receives the explanation lines that follow it
  let header = null;     // column roles from a "Q | Answer | Level | Why" header row
  let sawLevel = false;  // the key has a difficulty-level column
  let flatHead = null;   // columns of a header a PDF flattened into text: { after: ["skip" | "level" | "expl"...] }
  const FLAT_HEAD_WORD = /^(?:Q\.?|Q\.?No\.?|No\.?|S\.?No\.?|Questions?|Answers?|Ans\.?|Key|Level|Difficulty|Marks?|Topic|Why|Reasons?|Explanations?|Solutions?|Remarks?)$/i;
  const flatRole = (w) => (/^(?:Q\.?|Q\.?No\.?|No\.?|S\.?No\.?|Questions?)$/i.test(w) ? "q" : /^(?:Answers?|Ans\.?|Key)$/i.test(w) ? "ans"
    : /^(?:Level|Difficulty)$/i.test(w) ? "level" : /^(?:Why|Reasons?|Explanations?|Solutions?|Remarks?)$/i.test(w) ? "expl" : "skip");
  const NUM = /^(?:Q(?:uestion)?\s*\.?\s*(?:No\.?)?\s*)?(\d{1,4})\s*[.)]?$/i;
  const LEVEL = /^(?:easy|moderate|medium|hard|difficult|tough|very\s+hard)$/i;
  const HEAD = {
    q: /^(?:q(?:uestion)?s?\.?\s*(?:no\.?|number|#)?|s\.?\s*no\.?|#|no\.?)$/i,
    ans: /^(?:answers?|ans\.?|key|correct(?:\s*(?:answer|option))?|options?)$/i,
    level: /^(?:level|difficulty)$/i,
    expl: /^(?:why|reasons?|reasoning|explanation|explanations|solution|solutions|remarks?|notes?|rationale)$/i,
    topic: /^(?:topic|concept|chapter)$/i
  };
  const SET_RE = /^(?:practice\s*set|set|section|part|exercise)\s*[\-:]?\s*(?:[A-Z]|\d{1,2}|[IVX]{1,4})\b/i;

  const put = (num, ans, extra) => {
    if (!ans || !num) return null;
    // Without set headers, numbering that restarts at 1 means the next set (only when the
    // questions themselves come in several sets - CH-1 lists one set twice: grid + table)
    if (multiSection && !setHeaders && num === 1 && maxSeen > 1 && entries.has(aSection + ":1")) {
      aSection++;
      maxSeen = 0;
    }
    maxSeen = Math.max(maxSeen, num);
    const key = aSection + ":" + num;
    let e = entries.get(key);
    if (!e) {
      e = { section: aSection, number: num, answer: ans, explanation: [], level: "", topic: "", conflict: [] };
      entries.set(key, e);
      order.push(e);
    } else if (e.answer !== ans && !e.conflict.includes(ans)) {
      e.conflict.push(ans);
    }
    if (extra) {
      if (extra.explanation && !e.explanation.length) e.explanation.push(extra.explanation);
      if (extra.level) sawLevel = true;
      if (extra.level && !e.level) e.level = extra.level;
      if (extra.topic && !e.topic) e.topic = extra.topic;
    }
    return e;
  };
  // "1. c 2. a 3. b", "1-a, 2-c", a PDF-flattened grid "1 b 2 d 7 abd" (multi-answer keys are
  // packed letters) or a flattened table that still starts with its header "Q.No. Answer 1 c 2 b"
  const pairsIn = (p) => {
    const line = p.replace(/^(?:Q(?:uestion)?s?\.?\s*(?:No\.?)?|S\.?\s*No\.?)\s*(?:Answers?|Ans\.?|Key)\s+(?=\d)/i, "");
    const re = /(?:^|[\s,;])(?:Q\.?\s*)?(\d{1,4})\s*[.:\-)]?\s*[\(\[]?([a-e](?:,\s?[a-e]){1,4}|[a-eA-E]|[a-e]{2,5})[\)\]]?(?=$|[\s;]|,\s)/g;
    const pairs = [...line.matchAll(re)].filter(m => normalizeMCQAnswer(m[2]));
    return pairs.length > 1 && !line.replace(re, "").replace(/[\s,;]/g, "") ? pairs.map(m => [m[0], m[1], normalizeMCQAnswer(m[2])]) : null;
  };
  const cellPair = (c) => {
    const m = c.match(/^(?:Q\.?\s*)?(\d{1,4})\s*[.):\-]?\s*(.+)$/i);
    if (!m) return null;
    const ans = normalizeMCQAnswer(m[2]);
    return ans ? { num: parseInt(m[1], 10), ans } : null;
  };
  // "Q.1) [c] Impulsive", "1. (b) Because ...", "Q12 Answer: (a), (d)", "5 - c"
  const singleLine = (p) => {
    const m = p.match(/^(?:Q(?:uestion)?\s*[.\-]?\s*)?(\d{1,4})\s*[.:\-)\]]*\s*(?:(?:Ans(?:wer)?|Correct(?:\s*(?:answer|option))?|Key)\s*[:.\-]?\s*)?(?:Option\s*)?((?:[\(\[][a-eA-E][\)\]]|\b[a-eA-E]\b)(?:\s*(?:,|&|and|\/)\s*(?:[\(\[][a-eA-E][\)\]]|\b[a-eA-E]\b))*)(?:\s*[.:\-)]\s*|\s+|$)(.*)$/);
    if (!m) return null;
    const token = m[2];
    const rest = (m[3] || "").trim();
    // "2. A tax on ..." is a numbered explanation line, not "Q2 = (a)"
    if (/^[A-E]$/.test(token) && /^[a-z]/.test(rest)) return null;
    const ans = normalizeMCQAnswer(token);
    return ans ? { num: parseInt(m[1], 10), ans, rest } : null;
  };
  const startsEntry = (p) => !!p && (p.includes("|") || pairsIn(p) || singleLine(p) || /^\d+\s*(?:to|-)\s*\d+\b/i.test(p));

  for (let i = 0; i < lines.length; i++) {
    const p = lines[i];

    // A multi-answer cell wrapped by a PDF: "112 a, b," + "d, e"
    if (/^(?:Q\.?\s*)?\d{1,4}\s+[\(\[]?[a-e][\)\]]?(?:\s*,\s*[\(\[]?[a-e][\)\]]?)*\s*,$/.test(p)) {
      let joined = p;
      while (i + 1 < lines.length && /^[\(\[]?[a-e][\)\]]?(?:\s*,\s*[\(\[]?[a-e][\)\]]?)*\s*,?$/.test(lines[i + 1].trim()) && /,$/.test(joined)) joined += " " + lines[++i].trim();
      const one = singleLine(joined.replace(/,$/, ""));
      if (one) { cur = put(one.num, one.ans); continue; }
    }
    // "Hard 2 holds if ..." - the level column, then the explanation, on one line
    if (cur && sawLevel && !cur.level && !cur.explanation.length) {
      const lm = p.match(/^(Easy|Moderate|Medium|Hard|Difficult|Tough)\s+(.+)$/);
      if (lm) { cur.level = lm[1]; cur.explanation.push(lm[2]); continue; }
    }

    // A table flattened by a PDF repeats its header in pieces on every page: "Q", "Answe", "r", "Level Why"
    if (!p.includes("|") && p.length <= 24 && /^(?:q|q\.?\s*no\.?|s\.?\s*no\.?|answe?|r|answers?|ans\.?|level|why|explanations?|(?:answer\s+)?level\s+(?:why|reasons?|explanations?|solutions?))$/i.test(p)) continue;
    // A narrow table column splits the level word: "Moderat" + "e"
    if (cur && !cur.level && !cur.explanation.length) {
      const joined = (p + (lines[i + 1] || "")).trim();
      if (LEVEL.test(p)) { cur.level = p; sawLevel = true; continue; }
      if (p.length < 10 && LEVEL.test(joined)) { cur.level = joined; sawLevel = true; i++; continue; }
    }
    // A cell wrapped by a PDF: "154" then "ade", or "158" then "a, b," then "d, e"
    if (/^\d{1,4}$/.test(p)) {
      let k = 1;
      let ans = "";
      for (; k <= 3 && i + k < lines.length; k++) {
        ans = normalizeMCQAnswer(lines.slice(i + 1, i + k + 1).join(" ").replace(/,\s*$/, ""));
        if (ans && !/,\s*$/.test(lines[i + k])) break;
        if (!/^[\(\[]?[a-eA-E][\)\]]?(?:\s*[,&\/]\s*[\(\[]?[a-eA-E][\)\]]?)*\s*,?$/.test(lines[i + k].trim())) { ans = ""; break; }
      }
      if (ans) {
        cur = put(parseInt(p, 10), ans);
        i += k;
        continue;
      }
    }

    // "Q.No. Answer Marks Explanation 1 b 1 CRR is ..." - a table header flattened by a PDF, with
    // (part of) the first row on the same line: remember the columns and read the rest of the line again
    if (!p.includes("|")) {
      const words = p.split(/\s+/);
      let n = 0;
      while (n < words.length && FLAT_HEAD_WORD.test(words[n])) n++;
      const roles = words.slice(0, n).map(flatRole);
      if (n >= 2 && roles[0] === "q" && roles.includes("ans")) {
        flatHead = { after: roles.slice(roles.indexOf("ans") + 1) };
        cur = null;
        if (n < words.length) { lines[i] = words.slice(n).join(" "); i--; }
        continue;
      }
    }

    // Set headers ("Practice Set B") start the answers of the next set
    if (SET_RE.test(p) && p.length < 100 && !/[.?]$/.test(p)) {
      if (setHeaders > 0 || entries.size > 0) aSection = multiSection ? aSection + (entries.size ? 1 : 0) : 0;
      if (!multiSection) aSection = 0;
      setHeaders++;
      maxSeen = 0;
      cur = null;
      header = null;
      continue;
    }

    if (p.includes("|")) {
      const cells = p.split("|").map(c => c.trim());
      // Header row naming the columns
      const roles = cells.map(c => Object.keys(HEAD).find(k => HEAD[k].test(c)) || "");
      if (roles.includes("ans") && roles.includes("q") && !cells.some(c => /^\d+$/.test(c)) &&
          roles.filter(Boolean).length >= Math.max(2, Math.ceil(cells.length / 2))) {
        header = { q: roles.indexOf("q"), ans: roles.indexOf("ans"), level: roles.indexOf("level"), topic: roles.indexOf("topic"), expl: roles.map((r, k) => (r === "expl" ? k : -1)).filter(k => k >= 0) };
        cur = null;
        continue;
      }
      // "Questions | 1 | 2 | 3 ..." header of a range table
      if (HEAD.q.test(cells[0]) && cells.slice(1).every(c => /^\d+$/.test(c) || !c)) continue;
      // "1 to 10 | a | e | b | ..."
      const range = cells[0].match(/^(?:Q\.?\s*)?(\d+)\s*(?:to|-)\s*(?:Q\.?\s*)?(\d+)$/i);
      if (range) {
        const startQ = parseInt(range[1], 10);
        cells.slice(1).forEach((c, k) => { const a = normalizeMCQAnswer(c); if (a) put(startQ + k, a); });
        cur = null;
        continue;
      }
      // Grid of "1 e | 2 c | 3 a ..." (empty trailing cells allowed)
      const filled = cells.filter(Boolean);
      if (filled.length >= 2 && filled.every(c => cellPair(c))) {
        filled.forEach(c => { const cp = cellPair(c); put(cp.num, cp.ans); });
        cur = null;
        continue;
      }
      // Pairs in separate cells: "1 | c | 2 | a"
      if (filled.length >= 2 && filled.length % 2 === 0 && filled.every((c, k) => (k % 2 === 0 ? NUM.test(c) : normalizeMCQAnswer(c)))) {
        for (let k = 0; k < filled.length; k += 2) put(parseInt(filled[k].replace(/\D/g, ""), 10), normalizeMCQAnswer(filled[k + 1]));
        cur = null;
        continue;
      }
      // A row of a "Q | Answer | Level | Why" table
      if (header && NUM.test(cells[header.q] || "") && normalizeMCQAnswer(cells[header.ans] || "")) {
        const expl = header.expl.map(k => cells[k] || "").filter(Boolean).join(" | ");
        cur = put(parseInt(cells[header.q].replace(/\D/g, ""), 10), normalizeMCQAnswer(cells[header.ans]), {
          explanation: expl,
          level: header.level >= 0 ? cells[header.level] : "",
          topic: header.topic >= 0 ? cells[header.topic] : ""
        });
        continue;
      }
      // Same row without a header: "1 | e | Easy | Why ..."
      if (NUM.test(cells[0]) && cells.length >= 2 && normalizeMCQAnswer(cells[1])) {
        const rest = cells.slice(2);
        const level = rest.find(c => LEVEL.test(c)) || "";
        cur = put(parseInt(cells[0].replace(/\D/g, ""), 10), normalizeMCQAnswer(cells[1]), {
          explanation: rest.filter(c => c && c !== level).join(" | "),
          level
        });
        continue;
      }
      // Any other table row belongs to the current explanation ("Word | Meaning | Opposite")
      if (cur) cur.explanation.push(p);
      continue;
    }

    // A range table flattened by a PDF: "1 to 10 a e b d d b e c e c"
    const flat = p.match(/^(\d+)\s*to\s*(\d+)\s+((?:[a-eA-E](?:\s+|$))+)$/i);
    if (flat) {
      const startQ = parseInt(flat[1], 10);
      flat[3].trim().split(/\s+/).forEach((v, k) => put(startQ + k, v.toLowerCase()));
      cur = null;
      continue;
    }
    // "1 to 10" followed by one answer letter per line
    const rangeOnly = p.match(/^(\d+)\s+to\s+(\d+)$/i);
    if (rangeOnly) {
      let n = parseInt(rangeOnly[1], 10);
      const end = parseInt(rangeOnly[2], 10);
      while (i + 1 < lines.length && n <= end && /^[a-eA-E]$/.test(lines[i + 1].trim())) {
        put(n++, lines[++i].trim().toLowerCase());
      }
      cur = null;
      continue;
    }
    // A line holding only answers: "1. c  2. a  3. b" / "1-a, 2-c" / a flattened grid "1 e 2 c"
    const pairs = pairsIn(p);
    if (pairs) {
      pairs.forEach(m => put(parseInt(m[1], 10), m[2]));
      cur = null;
      continue;
    }
    // One answer per line, possibly followed by its explanation
    const one = singleLine(p);
    if (one && flatHead) {
      // a row under a flattened header: drop the extra columns (marks...) before the explanation
      let rest = one.rest;
      let level = "";
      for (const role of flatHead.after) {
        if (role === "expl") break;
        const m = rest.match(/^(\S+)\s*(.*)$/);
        if (!m) break;
        if (role === "level") { if (LEVEL.test(m[1])) { level = m[1]; rest = m[2]; } }
        else if (/^[\d.]+$/.test(m[1]) || m[1].length <= 3) rest = m[2];
      }
      cur = put(one.num, one.ans, { level, explanation: rest });
      continue;
    }
    if (one) {
      // "1 e Easy" / "1 e Easy Indian embassies ...": a flattened "Q | Answer | Level | Why" row
      const lv = one.rest.match(/^(Easy|Moderate|Medium|Hard|Difficult|Tough)(?:\s+(?=[A-Z0-9(“"‘])|$)(.*)$/);
      // "1 c Moderat" + "e": the level word split by a narrow PDF column
      if (!lv && one.rest && one.rest.length < 10 && LEVEL.test(one.rest + (lines[i + 1] || "").trim())) {
        cur = put(one.num, one.ans, { level: one.rest + lines[i + 1].trim() });
        sawLevel = true;
        i++;
        continue;
      }
      cur = put(one.num, one.ans, lv ? { level: lv[1], explanation: lv[2] } : (one.rest ? { explanation: one.rest } : null));
      continue;
    }
    // Headings between key formats ("Quick Check", "Answers with Reasons") are not explanations;
    // a short explanation line without a full stop ("Real GDP = Nominal GDP / Deflator") still is
    const KEY_HEADING = /^(?:quick\s*check|answers?(?:\s+(?:with|and|&)\s+\w+)?|answer\s*keys?|(?:detailed\s+)?(?:explanations?|solutions?)|reasons?|level\s+split\b.*)$/i;
    if (p.length <= 80 && !/[.?:;,)]$/.test(p) && (!cur || KEY_HEADING.test(p)) && (i + 1 >= lines.length || startsEntry(lines[i + 1]))) {
      cur = null;
      continue;
    }
    if (cur) cur.explanation.push(p);
  }
  return { entries, order };
}

// Parse plain text from DOCX or PDF into MCQ objects with options and answer keys.
// The returned array also carries .meta: { topics, missingNumbers, orphanKeys, sections }.
function parseMCQDocument(rawText, defaultSubject = "General Awareness") {
  if (!rawText || !rawText.trim()) return [];

  const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const allLines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  // "Note: ..." inside a question or an explanation is content (only before the first question is it a paper banner)
  const NOTE_RE = /^(?:Note|N\.\s?B\.|Hint)\s*[:.\-]/i;

  // 1. The answer key section ("Answer Key", "Answers", "Answers & Explanations"...)
  const { qLines, aLines } = mcqSplitKeySection(allLines);

  // 2. How questions are numbered: "Q1" / "Q.1)" / "Question 1:" or plain "1." / "1)"
  // (a PDF can drop the tab after the number: "Q100India's GDP ...")
  const Q_RE = /^Q(?:uestion)?\s*[.\-]?\s*(\d{1,4})(?:\s*[.):\-\]]+\s*|\s+|(?=[A-Z“"‘(\[]))(?=\S)/i;
  const N_RE = /^(\d{1,4})\s*[.)](?:\s+|(?=[A-Z“"‘(\[]))/;
  const qCount = qLines.filter(l => Q_RE.test(l)).length;
  const nCount = qLines.filter(l => N_RE.test(l)).length;
  const useQ = qCount >= 3 && qCount >= nCount * 0.3;
  const allowed = mcqOptionFamilies(qLines);

  const DIRECTIONS_RE = /^Directions?\b[^:\n]{0,40}?(\d+)\s*(?:-|to)\s*(?:Q(?:uestions?)?\.?\s*)?(\d+)/i;
  const SECTION_RE = /^(?:part|section|set|practice\s*set|exercise|paper)\s*[\-:]?\s*(?:[A-Z]|\d{1,2}|[IVX]{1,4})\b/i;
  const CHAPTER_RE = /^(?:chapter|ch|unit)\s*[\-:.]?\s*\d+\s*[\-:.]?\s*(.*)$/i;
  const INLINE_ANS_RE = /^(?:(?:Correct\s+)?Answer|Ans|Correct\s*Option)\b\s*(?:is\s+)?[:.\-]?\s*(?:Option\s*)?((?:[\(\[]?[a-eA-E][\)\]]?)(?:\s*(?:,|&|and|\/)\s*[\(\[]?[a-eA-E][\)\]]?)*)(?=$|[\s.,;:)])\s*[.,;:)-]?\s*(.*)$/i;
  const EXPL_RE = /^(?:Explanation|Exp|Solution|Notes?)\b\s*(?:[:.\-]\s*|$)(.*)/i;
  const titleLike = (l) => l.length <= 120 && !/[.?:;,]$/.test(l);
  const isSectionLine = (l) => l.length < 100 && !/[.?]$/.test(l) && SECTION_RE.test(l);
  const headingTopic = (l) => sanitizeDashes(l.replace(/^(?:topic\s*\d*\s*[:.\-]\s*|\d{1,2}(?:\.\d{1,2})*\s*[.)]?\s+)/i, "").trim());
  const stripNumber = (l) => l
    .replace(/^(?:\(\d+\)|\[\d+\]|(?:Question|Q)\s*[\.\-]?\s*\d+|\d+)\s*[\.\:\)\-\]]*\s*/i, "")
    .replace(/^[\.\:\)\-\]\s]+/, "").trim();

  const questions = [];
  const topics = [];
  let cur = null;
  let pending = [];          // lines after a question's options: headings, or the text of an un-numbered question
  let topic = "";
  let chapter = "";
  let section = 0;
  let lastNum = 0;
  let context = null;        // shared passage: "Directions (Q.1 to Q.3): ..." -> { from, to, left, lines }
  let collectingContext = false;
  let inExpl = false;

  const setTopic = (t) => {
    topic = t;
    if (t && !topics.includes(t)) topics.push(t);
  };
  // Generic titles ("Questions", "Spotlight Question Bank ...") are not topics
  const isGenericTitle = (l) => /^(?:questions?|mcqs?|objective questions|practice questions|questions?\s*(?:&|and)\s*answers)$/i.test(l) || /question\s*bank/i.test(l) || l === allLines[0];
  const isHeading = (l) => titleLike(l) && !l.includes("|") && !/^[\(\[]?[a-eA-E][\)\].]\s/.test(l);
  // Lines read after a question's options and before the next numbered question:
  // headings set the topic, other text (a data table, "Use the table below for Q137
  // and Q138") is a preface for the next question(s). Returns the preface lines.
  const takePending = () => {
    const preface = [];
    for (const l of pending) {
      if (isSectionLine(l)) { setTopic(""); preface.length = 0; closeOpenPassage(); continue; }
      if (isHeading(l) && !preface.length && !isPassageIntro(l)) {
        // before the first question only a numbered / "Topic:" heading names a topic (not the file's title lines)
        if (!isGenericTitle(l) && (questions.length || cur || /^(?:topic\b|\d{1,2}(?:\.\d{1,2})*\s*[.)]?\s+\S)/i.test(l))) { setTopic(headingTopic(l)); closeOpenPassage(); }
        continue;
      }
      preface.push(l);
    }
    pending = [];
    return preface;
  };
  // Pending lines inside an option list / explanation simply continue it
  const continuePending = () => {
    for (const l of pending) {
      if (!cur || !cur.opts.length) continue;
      if (inExpl) cur.explanation.push(l);
      else cur.opts[cur.opts.length - 1].text += "\n" + l;
    }
    pending = [];
  };
  // A passage without a question range ("Read the passage and answer the questions") lasts
  // until the next passage, set, topic heading or a question with its own preface
  // (a heading read before the last question of the set is finalized ends it after that question)
  const closeOpenPassage = (now) => {
    if (context && context.open) {
      if (now) context = null; else context.closing = true;
    }
  };
  const RANGE_FOR_RE = /\b(?:for|in|answer)\s+(?:the\s+)?(?:following\s+)?(?:Q(?:uestions?|s)?\.?\s*(?:No\.?\s*)?)?(\d{1,4})\s*(?:-|to|and|&)\s*(?:Q\.?\s*)?(\d{1,4})\b/i;
  const finalize = () => {
    if (!cur) return;
    const lines = cur.lines.slice();
    if (cur.number !== null && lines.length) lines[0] = stripNumber(lines[0]);
    const keep = l => l.trim().length > 0 && (!isHeaderOrFooterLine(l) || NOTE_RE.test(l));
    const cleanText = lines.filter(keep).join("\n").trim();
    // the shared passage / data table (and this question's own preface) are kept apart from
    // the question, so the exam can show them above every question that uses them
    let passageLines = [];
    if (context) {
      const n = cur.number;
      const inRange = n !== null ? (n >= context.from && n <= context.to) : context.left > 0;
      if (inRange) passageLines = context.lines.slice();
      context.left--;
      if ((n !== null && n >= context.to) || context.left <= 0 || context.closing) context = null;
    }
    const passage = passageLines.concat(cur.preface || []).filter(keep).join("\n").trim();
    questions.push({
      id: makeId("mcq"),
      subject: defaultSubject,
      topic: cur.topic,
      chapter,
      number: cur.number,
      section: cur.section,
      text: cleanText || "Imported Question",
      options: cur.opts.map(o => ({ label: o.label, text: o.text.trim() })),
      correctAnswer: cur.inlineAnswer,
      explanation: cur.explanation.join("\n").trim(),
      marks: 1.0,
      negativeMarks: 0.25,
      _skipped: cur.skipped
    });
    if (passage) questions[questions.length - 1].passage = passage;
    cur = null;
    inExpl = false;
  };
  const begin = (num, firstLine) => {
    const preface = takePending();
    finalize();
    if (num !== null) {
      if (num === 1 && lastNum > 1) { section++; closeOpenPassage(true); }        // numbering restarts: the next set
      lastNum = num;
    }
    cur = { number: num, section, topic, lines: firstLine ? [firstLine] : [], opts: [], explanation: [], inlineAnswer: "", skipped: [], preface: [] };
    // "Directions: Answer the following questions." with no real passage under it (no table and
    // under ~60 characters of text) is just this question's preface, not shared by every question
    const openBody = context && context.open ? context.lines.slice(1) : [];
    if (context && context.open && context.left === Infinity && (openBody.length === 0 || (openBody.join(" ").length < 60 && !openBody.some(l => / \| /.test(l))))) {
      cur.preface = context.lines;
      context = null;
    }
    if (preface.length) {
      // "Use the table below for Q137 and Q138": the preface belongs to every question of the range
      const r = preface.map(l => l.match(RANGE_FOR_RE)).find(Boolean);
      const from = r ? parseInt(r[1], 10) : NaN;
      const to = r ? parseInt(r[2], 10) : NaN;
      if (r && num !== null && from === num && to > from && to - from < 15) {
        context = { from, to, left: to - from + 1, lines: preface };
      } else {
        closeOpenPassage(true);
        cur.preface = cur.preface.concat(preface);
      }
    }
  };
  const target = () => (cur && cur.opts.length ? cur : null);
  const isQuestionStart = (l) => {
    const m = l.match(useQ ? Q_RE : N_RE);
    if (!m) return null;
    const num = parseInt(m[1], 10);
    if (!cur) return num;
    if (cur.opts.length >= 2) {
      if (useQ) return num;
      // plain numbering: the next number, a small gap, or a restart at 1
      return (num > (cur.number || 0) && num <= (cur.number || 0) + 5) || num === 1 ? num : null;
    }
    // no options yet: only the very next number, and not inside a "1. ... 2. ..." statement list
    if (num !== (cur.number || 0) + 1) return null;
    if (!useQ && cur.lines.some((x, k) => k > 0 && /^1\s*[.)]\s/.test(x))) return null;
    if (!useQ && /:$/.test(cur.lines[cur.lines.length - 1] || "")) return null;
    return num;
  };

  for (let idx = 0; idx < qLines.length; idx++) {
    let p = qLines[idx];

    // A PDF can glue the number to a figure: "Q1432022-23 was chosen ..." is Q143 + "2022-23 ..."
    if (useQ && cur && cur.number !== null && cur.opts.length >= 2 && !Q_RE.test(p)) {
      const glued = p.match(/^Q(?:uestion)?\s*[.\-]?\s*(\d{2,8})(.*)$/i);
      const next = String(cur.number + 1);
      if (glued && glued[1].length > next.length && glued[1].startsWith(next)) p = "Q" + next + " " + glued[1].slice(next.length) + glued[2];
    }

    // Running banners / page artefacts are never content (set & part banners start a new topic)
    if (isHeaderOrFooterLine(p) && !(NOTE_RE.test(p) && (cur || questions.length))) {
      if (!cur || cur.opts.length) {
        if (isSectionLine(p)) { takePending(); setTopic(""); }
        // a set / part / subject banner ("General Awareness") ends a passage that had no range
        if (isSectionLine(p) || /^(?:Economic\s*(?:&|and)\s*Social\s*Issues|Finance\s*(?:&|and)\s*Management|English\s*(?:Descriptive|Language)|General\s*Awareness|Quantitative\s*Aptitude|Reasoning(?:\s*Ability)?|Section|Part|Set)\b/i.test(p)) closeOpenPassage();
        const ch = p.match(CHAPTER_RE);
        if (ch && !chapter) chapter = sanitizeDashes(ch[1] || p);
      }
      continue;
    }

    // "Directions (Q.1 to Q.3): Read the passage..." starts a shared passage
    const dir = p.match(DIRECTIONS_RE);
    if (dir) {
      takePending();
      finalize();
      context = { from: parseInt(dir[1], 10), to: parseInt(dir[2], 10), left: 0, lines: [p] };
      context.left = Math.max(1, context.to - context.from + 1);
      collectingContext = true;
      continue;
    }
    // "Read the following passage and answer the questions (6 to 10)", "Case Study 2",
    // "Study the table below ...": a shared passage / table for the questions that follow
    if (!collectingContext && (!cur || cur.opts.length >= 2) && isPassageIntro(p) && !(inExpl && !PASSAGE_INSTRUCTION_RE.test(p))) {
      takePending();
      finalize();
      const r = p.match(RANGE_FOR_RE) || p.match(/\(\s*(?:Q(?:s|uestions?)?\.?\s*)?(\d{1,4})\s*(?:-|to)\s*(?:Q\.?\s*)?(\d{1,4})\s*\)/i);
      const from = r ? parseInt(r[1], 10) : NaN;
      const to = r ? parseInt(r[2], 10) : NaN;
      context = r && to > from && to - from < 30
        ? { from, to, left: to - from + 1, lines: [p] }
        : { from: 0, to: Infinity, left: Infinity, open: true, lines: [p] };
      collectingContext = true;
      continue;
    }
    if (collectingContext) {
      const startsQ = (useQ ? Q_RE : N_RE).test(p);
      const opt = mcqSplitOptions(p, allowed, "a");
      if (!startsQ && !opt) {
        context.lines.push(p);
        continue;
      }
      collectingContext = false;
      // Un-numbered question: its stem was read as the last line of the passage
      if (!startsQ && context.lines.length > 1 && !(opt && opt.stem)) {
        begin(null, context.lines.pop());
      }
    }

    // "Answer: (c)" / "Ans. b" under a question - not "Answer each question..."
    const ia = p.match(INLINE_ANS_RE);
    const iaAns = ia ? normalizeMCQAnswer(ia[1]) : "";
    if (iaAns && (target() || (!cur && questions.length))) {
      continuePending();
      const t = target();
      if (t) {
        t.inlineAnswer = iaAns;
        if (ia[2]) t.explanation.push(ia[2]);
      } else {
        questions[questions.length - 1].correctAnswer = iaAns;
      }
      inExpl = true;
      continue;
    }
    // "Explanation: ..." / "Solution: ..." under a question
    const ex = p.match(EXPL_RE);
    if (ex && (target() || (!cur && questions.length))) {
      continuePending();
      const t = target();
      const text = /^notes?\b/i.test(p) ? p : (ex[1] || "");      // "Note: ..." keeps its label
      if (t) t.explanation.push(text);
      else {
        const last = questions[questions.length - 1];
        last.explanation = /^notes?\b/i.test(p) && last.explanation ? last.explanation + "\n" + text : text;
      }
      inExpl = !!t;
      continue;
    }

    // A new numbered question
    const num = isQuestionStart(p);
    if (num !== null) {
      begin(num, p);
      // "1. Who ...? (a) X (b) Y (c) Z (d) W": the options are on the question line
      const sp = mcqSplitOptions(p, allowed, "a");
      if (sp && sp.stem && sp.opts.length) {
        cur.lines = [sp.stem];
        sp.opts.forEach(o => cur.opts.push(o));
      }
      continue;
    }

    // Options (one per line, or several on one line)
    const expected = cur ? String.fromCharCode(97 + (cur.opts.length ? cur.opts[cur.opts.length - 1].label.charCodeAt(0) - 96 : 0)) : "a";
    const split = mcqSplitOptions(p, allowed, cur && cur.opts.length ? expected : "a");
    if (split && split.opts.length && cur && cur.opts.length && inExpl && !(split.opts[0].label === "a" && pending.length)) {
      // options never follow the answer / explanation of the same question: this is explanation text
      continuePending();
      cur.explanation.push(p);
      continue;
    }
    if (split && split.opts.length) {
      const restart = split.opts[0].label === "a";
      if (!cur || (restart && cur.opts.length)) {
        // An un-numbered question: the lines read since the last option are its text
        const stem = pending.filter(l => !isSectionLine(l));
        const firstEver = !cur && questions.length === 0;
        pending = [];
        if (cur) finalize();
        cur = { number: null, section, topic, lines: firstEver ? stem.filter(l => !titleLike(l) || stem.length === 1) : stem, opts: [], explanation: [], inlineAnswer: "", skipped: [], preface: [] };
        if (firstEver && cur.lines.length === 0 && stem.length) cur.lines = stem.slice(-1);
      } else {
        continuePending();
      }
      if (split.stem) cur.lines.push(split.stem);
      for (const o of split.opts) {
        if (cur.opts.some(x => x.label === o.label)) continue;
        const last = cur.opts.length ? cur.opts[cur.opts.length - 1].label : "`";
        for (let c = last.charCodeAt(0) + 1; c < o.label.charCodeAt(0); c++) cur.skipped.push(String.fromCharCode(c));
        cur.opts.push(o);
      }
      inExpl = false;
      continue;
    }

    // Anything else: question text, explanation text, a heading, or text after the options
    if (cur && cur.opts.length === 0) {
      cur.lines.push(p);
    } else if (cur && inExpl && !titleLike(p)) {
      cur.explanation.push(p);
    } else {
      pending.push(p);
    }
  }
  takePending();
  finalize();

  // 3. The answer key, matched by set + question number
  const numbered = questions.filter(q => q.number !== null);
  if (numbered.length === 0) questions.forEach((q, i) => { q.number = i + 1; });
  const sections = new Set(questions.map(q => q.section)).size;
  const key = parseMCQAnswerKey(aLines, sections > 1);
  const used = new Set();
  questions.forEach(q => {
    q.parseIssues = [];
    const k = (sections > 1 ? q.section : 0) + ":" + q.number;
    const e = key.entries.get(k);
    if (e) {
      used.add(k);
      if (q.correctAnswer && q.correctAnswer !== e.answer) {
        q.parseIssues.push({ code: "key-conflict", msg: `The document gives two answers for this question (${formatMCQAnswer(q.correctAnswer)} under the question, ${formatMCQAnswer(e.answer)} in the answer key).` });
      }
      if (e.conflict.length) {
        q.parseIssues.push({ code: "key-conflict", msg: `The answer key lists this question more than once with different answers (${[e.answer].concat(e.conflict).map(formatMCQAnswer).join(" / ")}).` });
      }
      if (!q.correctAnswer) q.correctAnswer = e.answer;
      const expl = e.explanation.join("\n").trim();
      if (expl && !q.explanation) q.explanation = expl;
      if (e.level) q.level = e.level;
      if (e.topic && !q.topic) q.topic = sanitizeDashes(e.topic);
    }
    if (q._skipped && q._skipped.length) {
      q.parseIssues.push({ code: "options-skipped", msg: `Option ${q._skipped.map(s => "(" + s + ")").join(", ")} could not be found.` });
    }
    delete q._skipped;
  });

  // Questions the numbering says should exist but were not found, and keys without a question
  const missingNumbers = [];
  for (let s = 0; s < sections; s++) {
    const nums = questions.filter(q => q.section === s && q.number !== null).map(q => q.number);
    if (!nums.length) continue;
    const have = new Set(nums);
    // a file that starts in the middle (Q22 to Q36) is a slice: count from its first question
    const first = Math.min(...nums);
    for (let n = first <= 3 ? 1 : first; n <= Math.max(...nums); n++) if (!have.has(n)) missingNumbers.push({ section: s, number: n });
  }
  // keys for numbers outside a slice belong to questions that are not in this file: drop them quietly
  const sliceRange = (sec) => {
    const nums = questions.filter(q => q.section === sec && q.number !== null).map(q => q.number);
    return nums.length ? [Math.min(...nums) <= 3 ? 1 : Math.min(...nums), Math.max(...nums)] : null;
  };
  const orphanKeys = key.order.filter(e => !used.has(e.section + ":" + e.number) && (sections > 1 || e.section === 0))
    .filter(e => { const r = sliceRange(sections > 1 ? e.section : 0); return !r || r[0] === 1 || (e.number >= r[0] && e.number <= r[1]); })
    .map(e => ({ section: e.section, number: e.number, answer: e.answer }));

  Object.defineProperty(questions, "meta", {
    value: { topics, missingNumbers, orphanKeys, sections, chapter, keyEntries: key.entries.size },
    enumerable: false
  });
  return questions;
}

// Handle importing DOCX / PDF files for Phase 1
async function handleP1DocImport(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const statusElem = $("setup-p1-doc-status");
  if (statusElem) {
    statusElem.classList.remove("is-error");
    statusElem.textContent = "Reading " + file.name + "...";
  }

  try {
    const arrayBuffer = file.arrayBuffer ? await file.arrayBuffer() : await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsArrayBuffer(file);
    });

    const fileName = file.name.toLowerCase();
    let rawText = "";

    if (fileName.endsWith(".docx")) {
      rawText = await extractDocxText(arrayBuffer);
    } else if (fileName.endsWith(".pdf")) {
      rawText = await extractPdfText(arrayBuffer);
    } else {
      throw new Error("Unsupported format. Please upload a .docx or .pdf file.");
    }

    if (!rawText || !rawText.trim()) {
      throw new Error("No readable text found in the document.");
    }

    const parsedAll = parseMCQDocument(rawText, inferMCQSubject(rawText));
    const meta = parsedAll.meta || {};
    const parsedQuestions = parsedAll.filter(q => (q.options || []).length >= 2);
    if (parsedQuestions.length < 3) {
      const descriptive = parseQuestionsAndAnswers(rawText).filter(q => (q.modelAnswer || "").length > 0);
      if (descriptive.length >= 1 && parsedQuestions.length === 0 || descriptive.filter(q => q.modelAnswer.length > 200).length >= 2) {
        if (statusElem) statusElem.textContent = "";
        alert(`"${file.name}" contains descriptive (subjective) questions with model answers, not MCQs.\n\nSwitch to "Subjective" and upload it on that New Test screen.`);
        return;
      }
    }
    if (!parsedQuestions || parsedQuestions.length === 0) {
      throw new Error("Could not detect any MCQs with options in the file.");
    }
    // Numbered questions whose options could not be read are kept, so they show up
    // under "Needs attention" instead of silently disappearing
    const broken = parsedAll.filter(q => (q.options || []).length < 2 && q.number !== null && parsedQuestions.length >= 3);
    const keep = parsedAll.filter(q => parsedQuestions.includes(q) || broken.includes(q));
    const docTitle = rawText.split("\n").map(l => l.trim()).find(Boolean) || "";
    keep.forEach(q => { if (!q.chapter) q.chapter = sanitizeDashes(docTitle).slice(0, 120); });
    // which subject / chapter the file belongs to (History is sorted into these folders)
    if (typeof askFileFolder === "function") {
      if (statusElem) statusElem.textContent = "";
      const folder = await askFileFolder(file.name, rawText, inferMCQSubject(rawText), keep.length);
      if (!folder) {
        if (statusElem) statusElem.textContent = "Import cancelled.";
        return;
      }
      applyFolderToQuestions(keep, folder);
    }
    addImportedMCQs(keep, file.name, meta);
  } catch (err) {
    if (statusElem) {
      statusElem.classList.add("is-error");
      statusElem.textContent = "Error: " + err.message;
    }
    alert("File read error: " + err.message);
  } finally {
    event.target.value = "";
  }
}

// Read a DOCX / PDF file into plain text lines (same readers as the question import)
async function readDocumentText(file) {
  const arrayBuffer = file.arrayBuffer ? await file.arrayBuffer() : await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsArrayBuffer(file);
  });
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) return extractDocxText(arrayBuffer);
  if (name.endsWith(".pdf")) return extractPdfText(arrayBuffer);
  throw new Error("Unsupported format. Please upload a .docx or .pdf file.");
}

// "Upload answer key & explanations": a separate key file (e.g. the answers of all 100 questions)
// fills in the answer, explanation and level of only the questions in this test, matched by the
// question's number in its file (Q22...). Every other entry of the key file is ignored.
async function handleP1KeyImport(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const statusElem = $("setup-p1-doc-status");
  const setStatus = (text, isError) => {
    if (!statusElem) return;
    statusElem.classList.toggle("is-error", !!isError);
    statusElem.textContent = text;
  };
  try {
    const questions = state.p1_setup.questions || [];
    if (!questions.length) throw new Error("Upload the questions first, then their answer key.");
    setStatus("Reading " + file.name + "...");
    const rawText = await readDocumentText(file);
    const key = parseAnswerKeyFile(rawText);
    if (!key.entries.size) throw new Error("No answer key was found in " + file.name + ". It needs lines such as \"22 d\" or a Q / Answer table.");
    let matched = 0, filledKeys = 0, filledExpl = 0, conflicts = 0;
    const used = new Set();
    questions.forEach(q => {
      if (q.number == null) return;
      const e = key.entries.get("0:" + q.number);
      if (!e || !e.answer) return;
      matched++;
      used.add(q.number);
      q.check = q.check || { local: [], ai: null, user: "" };
      const old = q.check.local || [];
      const extra = [];
      if (!q.correctAnswer) { q.correctAnswer = e.answer; filledKeys++; }
      else if (q.correctAnswer !== e.answer) {
        conflicts++;
        extra.push({ code: "key-conflict", msg: `The question file says ${formatMCQAnswer(q.correctAnswer)}, the answer-key file says ${formatMCQAnswer(e.answer)}.` });
      }
      const expl = (e.explanation || []).join("\n").trim();
      if (expl && !q.explanation) { q.explanation = expl; filledExpl++; }
      if (e.level && !q.level) q.level = e.level;
      if (e.topic && !q.topic) q.topic = sanitizeDashes(e.topic);
      // redo the checks that depend on the key; keep the others (duplicate number, skipped option...)
      const keyCodes = ["no-key", "key-not-in-options", "empty-text", "few-options", "empty-option"];
      const fresh = mcqLocalIssues(Object.assign({}, q, { parseIssues: [] }), null);
      const seen = new Set();
      q.check.local = old.filter(i => !keyCodes.includes(i.code)).concat(fresh, extra)
        .filter(i => (seen.has(i.code + i.msg) ? false : seen.add(i.code + i.msg)));
      // the AI checks the question again, now with its key
      if (q.check.user !== "ok") q.check.ai = null;
    });
    const stillMissing = questions.filter(q => !q.correctAnswer).length;
    const ignored = key.entries.size - used.size;
    saveP1Setup();
    renderP1SetupList();
    if (!matched) throw new Error("None of the question numbers in " + file.name + " match the questions in this test.");
    setStatus(`${file.name}: answers for ${matched} question${matched === 1 ? "" : "s"} (${filledKeys} filled, ${filledExpl} explanation${filledExpl === 1 ? "" : "s"})` +
      (conflicts ? `, ${conflicts} disagree with the question file` : "") + (stillMissing ? `, ${stillMissing} still without a key` : "") +
      (ignored > 0 ? `. ${ignored} other entr${ignored === 1 ? "y" : "ies"} ignored.` : "."));
  } catch (err) {
    setStatus("Error: " + err.message, true);
    alert(err.message);
  } finally {
    event.target.value = "";
  }
}

// Guess the MCQ subject from the document heading (e.g. "Ch-2: Antonyms & Synonyms" -> English)
function inferMCQSubject(rawText) {
  // Only the title lines: question / option text must not influence the subject
  const head = String(rawText || "").split("\n").map(l => l.trim()).filter(Boolean).slice(0, 2).join(" ").toLowerCase();
  const has = (re) => re.test(head);
  if (has(/\b(spotlight|current affairs|general awareness|pib|monthly|weekly|news)\b/)) return "General Awareness";
  if (has(/\b(antonyms?|synonyms?|grammar|error detection|cloze|para ?jumble|reading comprehension|idioms?|vocabulary|english|fillers|sentence)\b/)) return "English Language";
  if (has(/\b(puzzles?|seating|syllogism|coding|blood relations?|inequalit(y|ies)|directions?|reasoning|alphanumeric|ranking)\b/)) return "Reasoning Ability";
  if (has(/\b(data interpretation|percentage|ratio|profit|interest|time and work|quant|quantitative|simplification|approximation|number series|mensuration|average|mixture)\b/)) return "Quantitative Aptitude";
  if (has(/\b(esi|economic|economics|inflation|monetary|national income|gdp|fiscal)\b/)) return "ESI (Phase-2)";
  if (has(/\b(finance|management|leadership|motivation|organisational|organizational)\b/)) return "Finance & Management (Phase-2)";
  return "General Awareness";
}

// Add imported MCQs to today's objective test, run the local checks and start the AI check
function addImportedMCQs(parsedQuestions, fileName, meta) {
  meta = meta || {};
  mcqPrepareImported(parsedQuestions);
  const fresh = parsedQuestions.filter(q => !state.p1_setup.questions.some(sq => questionWithPassage(sq) === questionWithPassage(q) && JSON.stringify(sq.options) === JSON.stringify(q.options)));
  fresh.forEach(q => { q.sourceFile = fileName; });
  state.p1_setup.questions = state.p1_setup.questions.concat(fresh);
  // Topics found in the file (used by the AI check to label "mixed" questions)
  const topics = new Set(state.p1_setup.topics || []);
  (meta.topics || []).forEach(t => t && topics.add(t));
  state.p1_setup.topics = [...topics];
  // What could not be matched: question numbers missing in the file, answer keys without a question
  const sets = meta.sections || 1;
  const label = (x) => (sets > 1 ? `Set ${x.section + 1} Q${x.number}` : `Q${x.number}`);
  const notes = (state.p1_setup.importNotes || []).filter(n => n.file !== fileName);
  if ((meta.missingNumbers || []).length || (meta.orphanKeys || []).length) {
    notes.push({
      file: fileName,
      missing: (meta.missingNumbers || []).map(label),
      orphan: (meta.orphanKeys || []).map(label)
    });
  }
  state.p1_setup.importNotes = notes;
  saveP1Setup();
  if (state.phase !== "phase1") setPhase("phase1");
  state.p1_setup_page = 1;
  renderP1SetupList();
  showScreen("setup");

  const withAns = fresh.filter(q => q.correctAnswer).length;
  const subject = fresh[0] ? fresh[0].subject : (parsedQuestions[0] ? parsedQuestions[0].subject : "");
  const statusElem = $("setup-p1-doc-status");
  if (statusElem) {
    statusElem.classList.remove("is-error");
    const skipped = parsedQuestions.length - fresh.length;
    statusElem.textContent = `Imported ${fresh.length} MCQs (${subject}) from ${fileName}: ${withAns} with an answer key${skipped ? `, ${skipped} already in this test` : ""}.`;
    setTimeout(() => { statusElem.textContent = ""; }, 8000);
  }
  // Check the answer keys with AI straight away
  // the AI Check runs only when you press "AI Check" (no automatic check on import)
}

// Render the Phase-1 setup: check summary, "Needs attention" and the questions that are ready
function renderP1SetupList() {
  const list = $("setup-p1-question-list");
  const countElem = $("setup-p1-count");
  if (!list) return;

  if (typeof mcqClearStalePending === "function") mcqClearStalePending();
  const questions = state.p1_setup.questions || [];
  const ready = questions.filter(q => mcqStatus(q) !== "issue");
  if (countElem) countElem.textContent = ready.length;

  // Show the saved test settings (they used to reset to 120 / 1.00 / 0.25 on every load)
  const minEl = $("setup-p1-minutes");
  const posEl = $("setup-p1-positive");
  const negEl = $("setup-p1-negative");
  if (minEl && document.activeElement !== minEl) minEl.value = state.p1_setup.totalMinutes || 120;
  if (posEl && document.activeElement !== posEl) posEl.value = Number(state.p1_setup.positiveMarks ?? 1).toFixed(2);
  if (negEl && document.activeElement !== negEl) negEl.value = Number(state.p1_setup.negativeMarks ?? 0.25).toFixed(2);

  const p1Batch = $("setup-p1-batch-actions");
  if (p1Batch) p1Batch.style.display = questions.length > 0 ? "flex" : "none";

  renderP1CheckPanel();
  updateP1StartButton();

  if (ready.length === 0) {
    list.innerHTML = `<li class="empty-list-placeholder">${questions.length ? "No question is ready yet. Fix the questions under Needs attention, or upload another file." : "No MCQs added yet. Upload a document (DOCX/PDF) or add MCQs manually to begin."}</li>`;
    renderPaginationControls({ containerId: "setup-p1-pagination", currentPage: 1, totalPages: 0, totalItems: 0, onPageChange: () => {} });
    updateP1SetupBatchDeleteState();
    return;
  }

  const PAGE_SIZE = QUESTIONS_PER_PAGE;
  const totalItems = ready.length;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
  if (state.p1_setup_page > totalPages) state.p1_setup_page = totalPages;
  if (state.p1_setup_page < 1) state.p1_setup_page = 1;

  const startIndex = (state.p1_setup_page - 1) * PAGE_SIZE;
  const pageQuestions = ready.slice(startIndex, startIndex + PAGE_SIZE);
  const statusPill = {
    ok: q => (q.check && q.check.ai && q.check.ai.status === "ok") ? `<span class="p1-chk p1-chk-ok">AI checked</span>` : (q.check && q.check.user === "ok" ? `<span class="p1-chk p1-chk-ok">Checked by you</span>` : ""),
    pending: () => `<span class="p1-chk p1-chk-pending">Checking…</span>`,
    unchecked: () => `<span class="p1-chk">Not AI-checked</span>`,
    failed: () => `<span class="p1-chk p1-chk-failed">AI check failed</span>`
  };

  list.innerHTML = pageQuestions.map((q, localIdx) => {
    const pos = startIndex + localIdx;
    const st = mcqStatus(q);
    // No answer key here: the key stays hidden until the result screen
    const optsPreview = (q.options || []).map(o =>
      `<span class="opt-pill"><strong>[${escapeHTML(String(o.label).toUpperCase())}]</strong> ${escapeHTML(o.text || "")}</span>`).join("");
    return `
      <li>
        <input type="checkbox" class="p1-q-select-check" data-id="${escapeHTML(q.id)}" aria-label="Select MCQ ${pos + 1}" style="margin-top:4px;">
        <div style="flex:1; min-width:0;">
          <div class="p1-q-meta-badges">
            <span class="badge-subject">${escapeHTML(q.subject || "General Awareness")}</span>
            ${mcqTopicOf(q) !== (q.subject || "General") ? `<span class="p1-q-topic">${escapeHTML(mcqTopicOf(q))}</span>` : ""}
            ${isMultiAnswerMCQ(q) ? `<span class="p1-chk">More than one answer</span>` : ""}
            ${(statusPill[st] || statusPill.ok)(q)}
            <span class="q-num">Q${pos + 1}${q.number != null && q.number !== pos + 1 ? ` · file Q${q.number}` : ""}</span>
          </div>
          ${q.passage ? `<details class="q-passage-peek"><summary>Based on a ${escapeHTML(passageKind(q.passage))}</summary><div class="q-passage-body">${richTextHTML(q.passage)}</div></details>` : ""}<div class="p1-question-full-text">${escapeHTML(q.text || "")}</div>
          <div class="p1-opts-preview">${optsPreview}</div>
        </div>
        <div class="q-actions">
          <button type="button" class="q-act btn-p1-move-up" data-id="${escapeHTML(q.id)}" title="Move up" aria-label="Move up" ${pos === 0 ? "disabled" : ""}>▲</button>
          <button type="button" class="q-act btn-p1-move-down" data-id="${escapeHTML(q.id)}" title="Move down" aria-label="Move down" ${pos === ready.length - 1 ? "disabled" : ""}>▼</button>
          <button type="button" class="q-act q-act-danger btn-p1-delete-q" data-id="${escapeHTML(q.id)}" title="Remove from this test" aria-label="Remove from this test">Remove</button>
        </div>
      </li>
    `;
  }).join("");

  renderPaginationControls({
    containerId: "setup-p1-pagination",
    currentPage: state.p1_setup_page,
    totalPages: totalPages,
    totalItems: totalItems,
    onPageChange: (newPage) => {
      state.p1_setup_page = newPage;
      renderP1SetupList();
      $("setup-p1-question-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  updateP1SetupBatchDeleteState();
}

// Answer-key summary, AI check status and the "Needs attention" list
function renderP1CheckPanel() {
  const box = $("setup-p1-check");
  if (!box) return;
  const questions = state.p1_setup.questions || [];
  const notes = state.p1_setup.importNotes || [];
  if (!questions.length && !notes.length) {
    box.innerHTML = "";
    box.hidden = true;
    return;
  }
  box.hidden = false;
  // the question's place in this test, plus its number in the file when that differs (Q1 = file Q22)
  const label = q => { const pos = questions.indexOf(q) + 1; return q.number != null && q.number !== pos ? `Q${pos} (file Q${q.number})` : `Q${pos}`; };
  const noKey = questions.filter(q => !q.correctAnswer);
  const issues = questions.filter(q => mcqStatus(q) === "issue");
  const pending = questions.filter(q => mcqStatus(q) === "pending");
  const unchecked = questions.filter(q => mcqStatus(q) === "unchecked");
  const failed = questions.filter(q => mcqStatus(q) === "failed");
  const ready = window.AIEval && AIEval.isReady();

  let ai;
  if (mcqVerify.running) {
    const pct = mcqVerify.total ? Math.round(mcqVerify.done / mcqVerify.total * 100) : 0;
    ai = `<div class="p1-check-row"><span class="ai-spinner"></span><div class="p1-check-grow"><strong>Checking every question and answer key with AI…</strong>
        <span class="ai-muted">${mcqVerify.done} of ${mcqVerify.total} checked. The exam can start when the check is finished.</span>
        <div class="ai-progress-track"><div class="ai-progress-fill" style="width:${Math.max(4, pct)}%"></div></div></div>
        <button type="button" class="btn-soft" data-p1-check="stop">Stop</button></div>`;
  } else if (!ready) {
    ai = `<div class="p1-check-row"><div class="p1-check-grow"><strong>Not checked by AI.</strong> <span class="ai-muted">Press AI Check to have the AI verify every question and answer key (an API key is needed).</span></div>
        <button type="button" class="ai-btn-primary" data-ai-action="open-settings" data-engine="check" data-want-check="p1">AI Check</button></div>`;
  } else if (unchecked.length) {
    ai = `<div class="p1-check-row"><div class="p1-check-grow"><strong>${unchecked.length + failed.length} question${unchecked.length + failed.length === 1 ? " is" : "s are"} not checked by AI yet.</strong> <span class="ai-muted">The AI solves each question and confirms the answer key.</span></div>
        <button type="button" class="ai-btn-primary" data-p1-check="run">AI Check</button></div>`;
  } else if (failed.length) {
    const why = failed[0].check.ai && failed[0].check.ai.note;
    ai = `<div class="p1-check-row"><div class="p1-check-grow"><span><strong class="p1-warn">The AI check could not finish for ${failed.length} question${failed.length === 1 ? "" : "s"}</strong>${why ? ` (${escapeHTML(why)})` : ""}.</span>
        <span class="ai-muted">Their answer keys are not verified yet. Run the check again (for example after a rate limit or the daily free limit resets).</span></div>
        <button type="button" class="ai-btn-primary" data-p1-check="retry-failed">AI Check</button></div>`;
  } else {
    const passed = questions.filter(q => mcqStatus(q) === "ok").length;
    const again = questions.some(q => q.check && !q.check.user && (q.options || []).length >= 2);
    ai = `<div class="p1-check-row"><div class="p1-check-grow"><span><strong>AI check finished:</strong> ${passed} question${passed === 1 ? "" : "s"} passed${issues.length ? ` · <span class="p1-warn">${issues.length} need${issues.length === 1 ? "s" : ""} attention</span>` : ""}.</span>${mcqVerify.usage && AIEval.tokensText ? ` <span class="ai-muted">Tokens: ${escapeHTML(AIEval.tokensText(mcqVerify.usage))}</span>` : ""}</div>
        ${again ? `<button type="button" class="btn-soft" data-p1-check="run-all" title="Check every question and answer key again">AI Check again</button>` : ""}</div>`;
  }
  if (mcqVerify.error && !mcqVerify.running) ai += `<p class="ai-warning">${escapeHTML(mcqVerify.error)}</p>`;

  const keyLine = noKey.length
    ? `<span class="p1-warn">Answer key missing for ${noKey.length}: ${noKey.slice(0, 30).map(label).join(", ")}${noKey.length > 30 ? "…" : ""}.</span> <span class="ai-muted">If the answers are in another file, use <strong>Upload answer key &amp; explanations</strong> above.</span>`
    : `<span class="p1-good">Every question has an answer key.</span>`;

  const noteHTML = notes.map(n => [
    n.missing.length ? `<li><strong>Not found in ${escapeHTML(n.file)}:</strong> ${n.missing.slice(0, 40).join(", ")}${n.missing.length > 40 ? "…" : ""} <span class="ai-muted">(the numbering skips these, so the questions could not be read)</span></li>` : "",
    n.orphan.length ? `<li><strong>Answer key without a question in ${escapeHTML(n.file)}:</strong> ${n.orphan.slice(0, 40).join(", ")}${n.orphan.length > 40 ? "…" : ""}</li>` : ""
  ].join("")).join("");

  const cards = issues.map(q => {
    const reasons = mcqIssueReasons(q);
    const ai = q.check && q.check.ai;
    const suggest = ai && ai.aiAnswer && ai.aiAnswer !== q.correctAnswer && (q.options || []).length ? ai.aiAnswer : "";
    return `
      <li class="p1-issue" data-id="${escapeHTML(q.id)}">
        <div class="p1-issue-head"><strong>${label(q)}</strong>${q.sourceFile ? `<span class="ai-muted">${escapeHTML(q.sourceFile)}</span>` : ""}</div>
        <ul class="p1-issue-reasons">${reasons.map(r => `<li>${escapeHTML(r)}</li>`).join("")}</ul>
        ${q.passage ? `<details class="q-passage-peek"><summary>Based on a ${escapeHTML(passageKind(q.passage))}</summary><div class="q-passage-body">${richTextHTML(q.passage)}</div></details>` : ""}<div class="p1-question-full-text">${escapeHTML(q.text || "")}</div>
        <div class="p1-opts-preview">${(q.options || []).map(o => `<span class="opt-pill"><strong>[${escapeHTML(String(o.label).toUpperCase())}]</strong> ${escapeHTML(o.text || "")}</span>`).join("") || `<span class="ai-muted">No options were read.</span>`}</div>
        <details class="p1-issue-key"><summary>Show the answer key${ai && (ai.note || ai.aiAnswer) ? " and the AI's note" : ""}</summary>
          <p>Answer key in the file: <strong>${q.correctAnswer ? formatMCQAnswer(q.correctAnswer) : "missing"}</strong>${ai && ai.aiAnswer ? ` · AI's answer: <strong>${formatMCQAnswer(ai.aiAnswer)}</strong>` : ""}</p>
          ${ai && ai.note ? `<p>${escapeHTML(ai.note)}</p>` : ""}
          ${q.explanation ? `<p class="ai-muted">${escapeHTML(q.explanation.slice(0, 600))}</p>` : ""}
        </details>
        <div class="p1-issue-actions">
          <button type="button" class="btn-soft" data-p1-fix="edit" data-id="${escapeHTML(q.id)}">Edit question</button>
          ${suggest ? `<button type="button" class="btn-soft" data-p1-fix="use-ai" data-id="${escapeHTML(q.id)}">Use the AI's answer (${formatMCQAnswer(suggest)})</button>` : ""}
          ${q.correctAnswer && (q.options || []).length >= 2 ? `<button type="button" class="btn-soft" data-p1-fix="keep" data-id="${escapeHTML(q.id)}" title="You checked it yourself: add it to the exam as it is">It is correct, keep it</button>` : ""}
          ${ready && (q.options || []).length >= 2 && !mcqVerify.running ? `<button type="button" class="btn-soft" data-p1-fix="recheck" data-id="${escapeHTML(q.id)}">Check again with AI</button>` : ""}
          <button type="button" class="btn-soft btn-soft-danger" data-p1-fix="remove" data-id="${escapeHTML(q.id)}">Remove</button>
        </div>
      </li>`;
  }).join("");

  box.innerHTML = `
    <div class="p1-check-card">
      <div class="p1-check-summary">
        <span><strong>${questions.length}</strong> imported</span>
        <span><strong>${questions.filter(q => mcqStatus(q) === "ok" || mcqStatus(q) === "unchecked").length}</strong> ready for the exam</span>
        ${pending.length ? `<span><strong>${pending.length}</strong> being checked</span>` : ""}
        ${failed.length ? `<span class="p1-warn"><strong>${failed.length}</strong> not verified</span>` : ""}
        ${issues.length ? `<span class="p1-warn"><strong>${issues.length}</strong> need attention</span>` : ""}
      </div>
      <p class="p1-check-keys">${keyLine}</p>
      ${ai}
    </div>
    ${issues.length || noteHTML ? `
    <section class="p1-attention" aria-label="Questions that need attention">
      <div class="p1-attention-head">
        <h3>Needs attention <span class="count-badge">${issues.length}</span></h3>
        <p>These are kept out of the exam: their text, options or answer key could not be read correctly. Fix, keep or remove each one.</p>
        ${notes.length ? `<button type="button" class="btn-soft" data-p1-check="clear-notes">Dismiss file notes</button>` : ""}
      </div>
      ${noteHTML ? `<ul class="p1-notes">${noteHTML}</ul>` : ""}
      ${cards ? `<ol class="p1-issue-list">${cards}</ol>` : ""}
    </section>` : ""}
  `;
}

// Start button: disabled while the AI is checking; shows how many questions go into the exam
function updateP1StartButton() {
  const btn = $("btn-start-p1-test");
  if (!btn) return;
  const questions = state.p1_setup.questions || [];
  // questions not checked by AI (the check is optional) and failed checks can join after a warning
  const n = questions.filter(q => { const st = mcqStatus(q); return st === "ok" || st === "failed" || st === "unchecked"; }).length;
  btn.disabled = mcqVerify.running || questions.some(q => mcqStatus(q) === "pending");
  btn.textContent = mcqVerify.running ? "Checking questions with AI…" : (n ? `Start Objective Test (${n} question${n === 1 ? "" : "s"})` : "Start Objective Test");
}

// Called by ai_eval.js after API keys are saved
function onAISettingsSaved() {
  const setup = $("screen-setup-p1");
  if (setup && !setup.hidden) renderP1SetupList();
  const setup2 = $("screen-setup");
  if (setup2 && !setup2.hidden) renderSetupList();
  // "AI Check" was pressed before a key was set: run that check now
  if (window.AIEval && AIEval.isReady("check") && state.wantAICheck) {
    const which = state.wantAICheck;
    state.wantAICheck = "";
    if (which === "p1") mcqVerifyQuestions();
    else if (which === "p2" && typeof descVerifyQuestions === "function") descVerifyQuestions();
  }
  if (state.p1_lastResultTest && typeof p1RenderAnalysis === "function") {
    if (!(typeof p1AnalysisAfterKeySaved === "function" && p1AnalysisAfterKeySaved())) p1RenderAnalysis(state.p1_lastResultTest);
  }
}

// Buttons of the check panel and of "Needs attention"
function handleP1CheckClick(e) {
  const run = e.target.closest("[data-p1-check]");
  if (run) {
    const a = run.dataset.p1Check;
    if (a === "run") mcqVerifyQuestions();
    else if (a === "retry-failed") mcqVerifyQuestions((state.p1_setup.questions || []).filter(q => mcqStatus(q) === "failed"));
    else if (a === "run-all") {
      // check everything again (questions you approved or fixed yourself keep your decision)
      const all = (state.p1_setup.questions || []).filter(q => q.check && !q.check.user);
      if (all.length > 40 && !confirm(`Check all ${all.length} questions with AI again? This takes about ${Math.max(1, Math.round(all.length / 20 / 3))} minute(s) and uses part of the daily free AI limit.`)) return;
      mcqVerifyQuestions(all);
    }
    else if (a === "stop") mcqStopVerify();
    else if (a === "clear-notes") { state.p1_setup.importNotes = []; saveP1Setup(); renderP1SetupList(); }
    return;
  }
  const fix = e.target.closest("[data-p1-fix]");
  if (!fix) return;
  const q = (state.p1_setup.questions || []).find(x => x.id === fix.dataset.id);
  if (!q) return;
  const a = fix.dataset.p1Fix;
  if (a === "remove") {
    state.p1_setup.questions = state.p1_setup.questions.filter(x => x.id !== q.id);
  } else if (a === "keep") {
    q.check = Object.assign(q.check || {}, { user: "ok" });
  } else if (a === "use-ai") {
    q.correctAnswer = q.check.ai.aiAnswer;
    q.check.local = (q.check.local || []).filter(i => !["no-key", "key-conflict", "key-not-in-options"].includes(i.code));
    q.check.user = "ok";
  } else if (a === "recheck") {
    saveP1Setup();
    mcqVerifyQuestions([q]);
    return;
  } else if (a === "edit") {
    startP1EditQuestion(q);
    return;
  }
  saveP1Setup();
  renderP1SetupList();
}

// Load a question into the manual form for correction
function startP1EditQuestion(q) {
  state.p1_editingId = q.id;
  const set = (id, v) => { const el = $(id); if (el) el.value = v == null ? "" : v; };
  const subj = $("p1-q-subject");
  if (subj && ![...subj.options].some(o => o.value === q.subject)) subj.insertAdjacentHTML("beforeend", `<option value="${escapeHTML(q.subject)}">${escapeHTML(q.subject)}</option>`);
  set("p1-q-subject", q.subject || "General Awareness");
  set("p1-q-topic", q.topic || q.aiTopic || "");
  set("p1-q-text", q.text || "");
  set("p1-q-passage", q.passage || "");
  ["a", "b", "c", "d", "e"].forEach(l => {
    const o = (q.options || []).find(x => x.label === l);
    set("p1-q-opt-" + l, o ? o.text : "");
  });
  const correct = $("p1-q-correct");
  const key = String(q.correctAnswer || "a");
  if (correct && key.length > 1 && ![...correct.options].some(o => o.value === key)) correct.insertAdjacentHTML("beforeend", `<option value="${escapeHTML(key)}">${escapeHTML(formatMCQAnswer(key))}</option>`);
  set("p1-q-correct", key);
  set("p1-q-explanation", q.explanation || "");
  const acc = $("p1-manual-accordion");
  if (acc) acc.open = true;
  const addBtn = $("btn-add-p1-question");
  if (addBtn) addBtn.textContent = "Save corrected question";
  $("p1-question-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Update the batch delete button count and visibility in Phase-1 Setup
function updateP1SetupBatchDeleteState() {
  const checkboxes = document.querySelectorAll("#setup-p1-question-list .p1-q-select-check");
  const checked = document.querySelectorAll("#setup-p1-question-list .p1-q-select-check:checked");
  const count = checked.length;
  const countElem = $("p1-selected-count");
  if (countElem) countElem.textContent = count;

  const btnDeleteSelected = $("btn-p1-delete-selected");
  if (btnDeleteSelected) {
    btnDeleteSelected.style.display = count > 0 ? "inline-block" : "none";
  }

  const selectAll = $("setup-p1-select-all");
  if (selectAll) {
    selectAll.checked = checkboxes.length > 0 && count === checkboxes.length;
    selectAll.indeterminate = count > 0 && count < checkboxes.length;
  }
}

// Select/deselect all questions in Phase-1 Setup
function handleP1SelectAllSetup(e) {
  const checked = e.target.checked;
  document.querySelectorAll("#setup-p1-question-list .p1-q-select-check").forEach(cb => {
    cb.checked = checked;
  });
  updateP1SetupBatchDeleteState();
}

// Delete checked questions from Phase-1 Setup
function handleP1DeleteSelectedSetup() {
  const checked = document.querySelectorAll("#setup-p1-question-list .p1-q-select-check:checked");
  if (checked.length === 0) return;

  if (!confirm(`Delete ${checked.length} selected MCQ(s) from this test?`)) return;

  const idsToDelete = new Set(Array.from(checked).map(cb => cb.dataset.id));
  state.p1_setup.questions = state.p1_setup.questions.filter(q => !idsToDelete.has(q.id));
  saveP1Setup();
  renderP1SetupList();
}

// Delete all questions from Phase-1 Setup
function handleP1DeleteAllSetup() {
  if (state.p1_setup.questions.length === 0) return;
  if (!confirm("Are you sure you want to remove all questions from this test?")) return;
  if (typeof mcqStopVerify === "function") mcqStopVerify();
  state.p1_setup.questions = [];
  state.p1_setup.importNotes = [];
  state.p1_setup.topics = [];
  saveP1Setup();
  renderP1SetupList();
}

// Add a manual MCQ to Phase-1 Setup (or save a corrected one from "Needs attention")
function handleP1QuestionFormSubmit(e) {
  e.preventDefault();
  const subject = $("p1-q-subject").value || "General Awareness";
  const topic = ($("p1-q-topic").value || "").trim();
  const text = $("p1-q-text").value.trim();
  const passage = ($("p1-q-passage") ? $("p1-q-passage").value : "").trim();
  const optA = ($("p1-q-opt-a").value || "").trim();
  const optB = ($("p1-q-opt-b").value || "").trim();
  const optC = ($("p1-q-opt-c").value || "").trim();
  const optD = ($("p1-q-opt-d").value || "").trim();
  const optE = ($("p1-q-opt-e").value || "").trim();
  const correct = normalizeMCQAnswer($("p1-q-correct").value || "a") || "a";
  const explanation = ($("p1-q-explanation").value || "").trim();

  if (!text) {
    alert("Please enter the question statement.");
    return;
  }
  if (!optA || !optB || !optC || !optD) {
    alert("Please provide at least options A, B, C, and D.");
    return;
  }
  if (correct.includes("e") && !optE) {
    alert("The correct answer includes [E], but option E is empty. Fill option E or choose another answer.");
    return;
  }

  const options = [
    { label: "a", text: optA },
    { label: "b", text: optB },
    { label: "c", text: optC },
    { label: "d", text: optD }
  ];
  if (optE) options.push({ label: "e", text: optE });

  const pos = readNumberInput("setup-p1-positive", 1.0, 0);
  const neg = readNumberInput("setup-p1-negative", 0.25, 0);
  const editing = state.p1_editingId ? state.p1_setup.questions.find(q => q.id === state.p1_editingId) : null;

  if (editing) {
    // You corrected it yourself, so it counts as checked
    const oldPassage = editing.passage || "";
    Object.assign(editing, { subject, topic, text, options, correctAnswer: correct, explanation });
    if (passage) editing.passage = passage; else delete editing.passage;
    editing.check = { local: [], ai: null, user: "ok" };
    syncSharedPassage(state.p1_setup.questions, editing, oldPassage);
  } else {
    const q = {
      id: makeId("mcq"),
      subject,
      topic,
      text,
      options,
      correctAnswer: correct,
      explanation,
      marks: pos,
      negativeMarks: neg,
      check: { local: [], ai: null, user: "ok" }
    };
    if (passage) q.passage = passage;
    state.p1_setup.questions.push(q);
  }
  state.p1_editingId = null;
  saveP1Setup();

  $("p1-question-form").reset();
  renderP1SetupList();
  const p1Err = $("setup-p1-error");
  if (p1Err) p1Err.textContent = "";
  const addBtn = $("btn-add-p1-question");
  if (addBtn) {
    addBtn.textContent = editing ? "Saved" : "Added";
    setTimeout(() => { addBtn.textContent = "Add MCQ to Test"; }, 1500);
  }
  if (!editing) $("p1-q-text")?.focus();
}

// Start the Phase-1 objective exam (only questions that passed the checks go in)
async function startP1Exam() {
  const errElem = $("setup-p1-error");
  if (errElem) errElem.textContent = "";
  const say = (t) => { if (errElem) errElem.textContent = t; };

  const all = state.p1_setup.questions || [];
  if (all.length === 0) {
    say("Please add at least one MCQ before starting the test.");
    return;
  }

  const minutes = readNumberInput("setup-p1-minutes", 0, 0);
  const pos = readNumberInput("setup-p1-positive", 1.0, 0);
  const neg = readNumberInput("setup-p1-negative", 0.25, 0);
  if (!minutes || minutes < 1) {
    say("Total time must be at least 1 minute.");
    return;
  }
  if (pos <= 0) {
    say("Marks for a correct answer must be more than 0.");
    return;
  }

  if (mcqVerify.running || all.some(q => mcqStatus(q) === "pending")) {
    say("The AI is still checking the questions. The exam can start when the check is finished.");
    return;
  }
  const unchecked = all.filter(q => mcqStatus(q) === "unchecked");
  const failed = all.filter(q => mcqStatus(q) === "failed");
  const issues = all.filter(q => mcqStatus(q) === "issue");
  const allow = new Set(["ok"]);
  if (unchecked.length) {
    if (!confirm(`${unchecked.length} question(s) were not checked by AI, so only a missing answer key and missing options were checked - not whether the key is right.\n\nOK: start the exam with them.\nCancel: go back and press "AI Check" first.`)) return;
    allow.add("unchecked");
  }
  if (failed.length) {
    if (!confirm(`The AI check could not finish for ${failed.length} question(s), so their answer keys are not verified.\n\nOK: start the exam with them anyway.\nCancel: go back and press "Check them again".`)) return;
    allow.add("failed");
  }
  const use = all.filter(q => allow.has(mcqStatus(q)));
  if (!use.length) {
    say("No question is ready for the exam. Fix or keep the questions under Needs attention first.");
    return;
  }

  const testType = await askTestType("mcq", { count: use.length, left: issues.length, questions: use });
  if (!testType) return;

  state.p1_setup.totalMinutes = minutes;
  state.p1_setup.positiveMarks = pos;
  state.p1_setup.negativeMarks = neg;
  saveP1Setup();

  const questions = use.map(q => {
    const copy = { ...q, marks: pos, negativeMarks: neg };
    if (!copy.topic && q.aiTopic) copy.topic = q.aiTopic;
    delete copy.check;
    return copy;
  });

  const test = {
    id: makeId("test_p1"),
    date: Date.now(),
    testType,
    folder: typeof testFolderFromQuestions === "function" ? testFolderFromQuestions(questions) : null,
    totalMinutes: minutes,
    positiveMarks: pos,
    negativeMarks: neg,
    questions: questions,
    answers: new Array(questions.length).fill(null),
    statuses: new Array(questions.length).fill("not-visited"),
    times: new Array(questions.length).fill(0),
    timeSpent: 0
  };

  test.statuses[0] = "not-answered";

  state.p1_test = test;
  state.p1_currentIndex = 0;
  state.p1_endTime = Date.now() + minutes * 60 * 1000;
  state.p1_test.endTime = state.p1_endTime;
  state.p1_questionShownAt = Date.now();

  saveJSON("rbi_p1_active_test", state.p1_test);

  startP1ExamTimer();
  showP1Question(0);
  renderP1Palette();
  updateP1ExamSummary();
  showScreen("exam");
}

// Test types you pick when a test starts (they decide which TODO the test completes)
const TEST_TYPE_CHOICES = {
  mcq: [
    { value: "Objective Practice", hint: "Your daily objective (MCQ) exam" },
    { value: "Chapter Test", hint: "The test at the end of a chapter" },
    { value: "Mix Test", hint: "A test that mixes several chapters" }
  ],
  write: [
    { value: "Subjective Practice", hint: "Your daily descriptive (subjective) exam" },
    { value: "Chapter Test", hint: "The test at the end of a chapter" },
    { value: "Mix Test", hint: "A test that mixes several chapters" }
  ]
};

// Ask which kind of test this is. Resolves to the type, or null if cancelled.
// info: { count, left, questions } - the line under the title says which TODO the chosen type will complete.
function askTestType(mode, info) {
  return new Promise(resolve => {
    const modal = $("test-type-modal");
    const form = $("test-type-form");
    if (!modal || !form) { resolve(mode === "mcq" ? "Objective Practice" : "Subjective Practice"); return; }
    const questions = (info && info.questions) || [];
    const suggestion = typeof calSuggestTestType === "function" ? calSuggestTestType(mode) : null;
    const choices = TEST_TYPE_CHOICES[mode] || TEST_TYPE_CHOICES.mcq;
    const preset = suggestion && choices.some(c => c.value === suggestion.type) ? suggestion.type : choices[0].value;
    const sub = $("test-type-sub");
    const describe = (type) => {
      const parts = [];
      if (info && info.count) parts.push(`${info.count} question${info.count === 1 ? "" : "s"}`);
      if (info && info.left) parts.push(`${info.left} left out (Needs attention)`);
      const todo = typeof calPreviewTodo === "function" ? calPreviewTodo(mode, type, questions) : "";
      parts.push(todo ? `Will complete: ${todo}` : `Will be added to today's TODOs as a ${type}`);
      return parts.join(" · ");
    };
    $("test-type-options").innerHTML = choices.map(c => `
      <label class="tt-option">
        <input type="radio" name="testType" value="${escapeHTML(c.value)}" ${c.value === preset ? "checked" : ""}>
        <span class="tt-card"><strong>${escapeHTML(c.value)}</strong><span>${escapeHTML(c.hint)}</span></span>
      </label>`).join("");
    if (sub) sub.textContent = describe(preset);
    const done = (val) => {
      modal.hidden = true;
      form.onsubmit = null;
      form.onclick = null;
      form.onchange = null;
      modal.onclick = null;
      document.removeEventListener("keydown", onKey);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === "Escape") done(null); };
    form.onsubmit = (e) => {
      e.preventDefault();
      const picked = form.querySelector('input[name="testType"]:checked');
      done(picked ? picked.value : null);
    };
    form.onchange = (e) => { if (e.target.name === "testType" && sub) sub.textContent = describe(e.target.value); };
    form.onclick = (e) => { if (e.target.closest('[data-action="cancel"]')) done(null); };
    modal.onclick = (e) => { if (e.target === modal) done(null); };
    document.addEventListener("keydown", onKey);
    modal.hidden = false;
    setTimeout(() => { const r = form.querySelector('input[name="testType"]:checked'); if (r) r.focus(); }, 0);
  });
}

// Start countdown timer for Phase-1
function startP1ExamTimer() {
  if (state.p1_timerId) clearInterval(state.p1_timerId);

  window.onbeforeunload = () => "Test in progress";
  const tickNow = () => {
    const el = $("p1-exam-timer");
    if (el && state.p1_test) el.textContent = formatTime(Math.max(0, Math.floor((state.p1_endTime - Date.now()) / 1000)));
  };
  tickNow();
  state.p1_timerId = setInterval(() => {
    if (!state.p1_test) {
      clearInterval(state.p1_timerId);
      return;
    }

    const now = Date.now();
    const remainingMs = state.p1_endTime - now;
    const remainingSec = Math.max(0, Math.floor(remainingMs / 1000));

    const timerElem = $("p1-exam-timer");
    if (timerElem) {
      timerElem.textContent = formatTime(remainingSec);
      timerElem.classList.toggle("timer-danger", remainingSec <= 60);
      timerElem.classList.toggle("timer-warning", remainingSec > 60 && remainingSec <= 300);
    }

    if (now - state.p1_lastAutoSave > 5000) {
      saveCurrentP1QuestionTime();
      state.p1_lastAutoSave = now;
    }

    if (remainingSec <= 0) {
      clearInterval(state.p1_timerId);
      finishP1Test(true);
    }
  }, 1000);
}

// Accumulate elapsed seconds for active question
function saveCurrentP1QuestionTime() {
  if (!state.p1_test || state.p1_questionShownAt <= 0) return;
  // Keep fractions of a second; rounding every save to whole seconds lost most of the time
  const elapsed = (Date.now() - state.p1_questionShownAt) / 1000;
  const idx = state.p1_currentIndex;
  if (state.p1_test.times && state.p1_test.times[idx] !== undefined) {
    state.p1_test.times[idx] += elapsed;
  }
  state.p1_test.timeSpent = (state.p1_test.timeSpent || 0) + elapsed;
  state.p1_questionShownAt = Date.now();
  saveJSON("rbi_p1_active_test", state.p1_test);
}

// Display question on Phase-1 console
function showP1Question(index) {
  if (!state.p1_test || !state.p1_test.questions[index]) return;

  state.p1_currentIndex = index;
  state.p1_test.currentIndex = index;
  const q = state.p1_test.questions[index];
  const total = state.p1_test.questions.length;

  if (state.p1_test.statuses[index] === "not-visited") {
    state.p1_test.statuses[index] = "not-answered";
  }

  const secName = $("p1-exam-section-name");
  if (secName) secName.textContent = q.subject || "General Awareness";

  const qPos = $("p1-exam-qpos");
  if (qPos) qPos.textContent = `Question No. ${index + 1} of ${total}`;

  const qMarks = $("p1-exam-marks");
  if (qMarks) qMarks.textContent = `Marks: +${(q.marks || 1.0).toFixed(2)}`;

  const qNeg = $("p1-exam-neg");
  if (qNeg) qNeg.textContent = `Negative: -${(q.negativeMarks || 0.25).toFixed(2)}`;

  const qText = $("p1-exam-question-text");
  renderPassageSlot("p1-exam-passage", state.p1_test.questions, index);
  if (qText) qText.innerHTML = richTextHTML(q.text);

  const currentAnswer = String(state.p1_test.answers[index] || "").toLowerCase();
  const multi = isMultiAnswerMCQ(q);
  const optsContainer = $("p1-exam-options-list");
  if (optsContainer) {
    optsContainer.classList.toggle("is-multi", multi);
    optsContainer.innerHTML = (multi ? `<p class="mcq-multi-hint">More than one option can be correct: select every correct option.</p>` : "") +
      (q.options || []).map(opt => {
        const isSelected = currentAnswer.includes(String(opt.label).toLowerCase());
        return `
        <div class="mcq-option-item ${isSelected ? 'selected' : ''}" data-label="${escapeHTML(opt.label)}" role="${multi ? "checkbox" : "button"}" tabindex="0" ${multi ? `aria-checked="${isSelected}"` : `aria-pressed="${isSelected}"`}>
          <span class="opt-badge">${escapeHTML(String(opt.label).toUpperCase())}</span>
          <span class="opt-text">${escapeHTML(opt.text)}</span>
        </div>
      `;
      }).join("");
  }

  const prevBtn = $("p1-btn-prev");
  if (prevBtn) prevBtn.disabled = (index === 0);

  state.p1_questionShownAt = Date.now();
  renderP1Palette();
  updateP1ExamSummary();
  // a long question / passage scrolls the page: bring the next question's top back into view
  const qBox = $("p1-exam-qpos");
  if (qBox && qBox.getBoundingClientRect().top < 0) qBox.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Select an option for active question
function selectP1Option(optLabel) {
  if (!state.p1_test) return;
  const idx = state.p1_currentIndex;
  const q = state.p1_test.questions[idx];
  const label = optLabel.toLowerCase();
  if (isMultiAnswerMCQ(q)) {
    // Multi-answer question: each click toggles one option
    const set = new Set(String(state.p1_test.answers[idx] || "").split("").filter(Boolean));
    if (set.has(label)) set.delete(label); else set.add(label);
    state.p1_test.answers[idx] = set.size ? [...set].sort().join("") : null;
  } else {
    state.p1_test.answers[idx] = label;
  }
  const answer = state.p1_test.answers[idx] || "";

  const isReview = state.p1_test.statuses[idx] === "review" || state.p1_test.statuses[idx] === "answered-review";
  if (!answer) state.p1_test.statuses[idx] = isReview ? "review" : "not-answered";
  else state.p1_test.statuses[idx] = isReview ? "answered-review" : "answered";

  document.querySelectorAll("#p1-exam-options-list .mcq-option-item").forEach(item => {
    const isSel = answer.includes(item.dataset.label.toLowerCase());
    item.classList.toggle("selected", isSel);
    item.setAttribute(item.getAttribute("role") === "checkbox" ? "aria-checked" : "aria-pressed", String(isSel));
  });

  renderP1Palette();
  updateP1ExamSummary();
  saveJSON("rbi_p1_active_test", state.p1_test);
}

// Clear selected option
function clearP1Option() {
  if (!state.p1_test) return;
  const idx = state.p1_currentIndex;
  state.p1_test.answers[idx] = null;
  state.p1_test.statuses[idx] = "not-answered";

  document.querySelectorAll("#p1-exam-options-list .mcq-option-item").forEach(item => {
    item.classList.remove("selected");
    item.setAttribute("aria-pressed", "false");
  });

  renderP1Palette();
  updateP1ExamSummary();
  saveJSON("rbi_p1_active_test", state.p1_test);
}

// Mark for Review & Next
function markP1ForReview() {
  if (!state.p1_test) return;
  saveCurrentP1QuestionTime();
  const idx = state.p1_currentIndex;

  if (state.p1_test.answers[idx]) {
    state.p1_test.statuses[idx] = "answered-review";
  } else {
    state.p1_test.statuses[idx] = "review";
  }

  if (idx < state.p1_test.questions.length - 1) {
    showP1Question(idx + 1);
  } else {
    renderP1Palette();
    updateP1ExamSummary();
  }
}

// Save & Next
function saveAndNextP1() {
  if (!state.p1_test) return;
  saveCurrentP1QuestionTime();
  const idx = state.p1_currentIndex;

  if (state.p1_test.answers[idx]) {
    state.p1_test.statuses[idx] = "answered";
  } else {
    state.p1_test.statuses[idx] = "not-answered";
  }

  if (idx < state.p1_test.questions.length - 1) {
    showP1Question(idx + 1);
  } else {
    renderP1Palette();
    updateP1ExamSummary();
  }
}

// Navigate to previous question
function prevP1Question() {
  if (!state.p1_test || state.p1_currentIndex <= 0) return;
  saveCurrentP1QuestionTime();
  showP1Question(state.p1_currentIndex - 1);
}

// Render TCS iON 5-color Question Palette
function renderP1Palette() {
  const palette = $("p1-exam-palette");
  if (!palette || !state.p1_test) return;

  const total = state.p1_test.questions.length;
  const buttonsHtml = [];

  for (let i = 0; i < total; i++) {
    const status = state.p1_test.statuses[i] || "not-visited";
    const isCurrent = (i === state.p1_currentIndex);
    buttonsHtml.push(
      `<button type="button" class="${status} ${isCurrent ? 'current' : ''}" data-index="${i}">
        <span class="palette-qnum">${i + 1}</span>
      </button>`
    );
  }

  palette.innerHTML = buttonsHtml.join("");
}

// Update exam summary counters
function updateP1ExamSummary() {
  if (!state.p1_test) return;

  let answered = 0;
  let notAnswered = 0;
  let marked = 0;
  let notVisited = 0;

  state.p1_test.statuses.forEach(st => {
    if (st === "answered") answered++;
    else if (st === "answered-review") { answered++; marked++; }
    else if (st === "not-answered") notAnswered++;
    else if (st === "review") { notAnswered++; marked++; }
    else notVisited++;
  });

  const total = state.p1_test.questions.length;
  const setLeg = (cls, v) => { const el = document.querySelector(`#screen-exam-p1 .legend-badge.${cls}`); if (el) el.textContent = v; };
  setLeg("answered", answered);
  setLeg("not-answered", notAnswered);
  setLeg("not-visited", notVisited);
  setLeg("review", marked);

  if ($("p1-summary-total")) $("p1-summary-total").textContent = total;
  if ($("p1-summary-answered")) $("p1-summary-answered").textContent = answered;
  if ($("p1-summary-not-answered")) $("p1-summary-not-answered").textContent = notAnswered;
  if ($("p1-summary-review")) $("p1-summary-review").textContent = marked;
  if ($("p1-summary-not-visited")) $("p1-summary-not-visited").textContent = notVisited;

  if ($("p1-modal-total")) $("p1-modal-total").textContent = total;
  if ($("p1-modal-answered")) $("p1-modal-answered").textContent = answered;
  if ($("p1-modal-not-answered")) $("p1-modal-not-answered").textContent = notAnswered;
  if ($("p1-modal-marked")) $("p1-modal-marked").textContent = marked;
}

// Open submission confirmation modal
function openP1SubmitModal() {
  saveCurrentP1QuestionTime();
  updateP1ExamSummary();
  const modal = $("p1-confirm-submit");
  if (modal) modal.hidden = false;
}

// Close submission confirmation modal
function closeP1SubmitModal() {
  const modal = $("p1-confirm-submit");
  if (modal) modal.hidden = true;
}

// Calculate scores and finalize Phase-1 exam
function finishP1Test(auto = false) {
  if (!state.p1_test) return;

  if (state.p1_timerId) {
    clearInterval(state.p1_timerId);
    state.p1_timerId = null;
  }

  saveCurrentP1QuestionTime();
  closeP1SubmitModal();

  const test = state.p1_test;
  const pos = test.positiveMarks || 1.0;
  const neg = test.negativeMarks || 0.25;

  let correctCount = 0;
  let incorrectCount = 0;
  let unattemptedCount = 0;
  let score = 0;

  for (let i = 0; i < test.questions.length; i++) {
    const q = test.questions[i];
    const ans = test.answers[i];
    if (!ans) {
      unattemptedCount++;
    } else if (mcqIsCorrect(ans, q.correctAnswer)) {
      correctCount++;
      score += pos;
    } else {
      incorrectCount++;
      score -= neg;
    }
  }

  const attemptedCount = correctCount + incorrectCount;
  const accuracy = attemptedCount > 0 ? ((correctCount / attemptedCount) * 100).toFixed(1) : "0.0";
  const maxScore = (test.questions.length * pos).toFixed(2);
  const finalScore = score.toFixed(2);

  test.correctCount = correctCount;
  test.incorrectCount = incorrectCount;
  test.unattemptedCount = unattemptedCount;
  test.score = Number(finalScore);
  test.maxScore = Number(maxScore);
  test.accuracy = Number(accuracy);
  test.completedAt = Date.now();
  const totalSec = (test.totalMinutes || 25) * 60;
  // Real time used = from start until submit (capped at the time limit)
  const started = Number(test.date) || test.completedAt;
  test.timeSpent = Math.max(0, Math.min(totalSec, Math.round((test.completedAt - started) / 1000)));
  test.durationSeconds = test.timeSpent;
  test.times = (test.times || []).map(t => Math.round(t));

  const history = loadJSON("rbi_p1_history", []);
  history.unshift(test);
  saveJSON("rbi_p1_history", history);
  clearSetupAfterExam("mcq", test);

  if (typeof autoCompleteTodoOnExam === "function") {
    autoCompleteTodoOnExam("mcq", test);
  }

  if (state.p1_timerId) {
    clearInterval(state.p1_timerId);
    state.p1_timerId = null;
  }

  localStorage.removeItem("rbi_p1_active_test");
  window.onbeforeunload = null;

  state.p1_lastResultTest = test;
  state.p1_test = null;

  if (auto) {
    alert("Time is up! Your objective test has been automatically submitted.");
  }

  renderP1Result(test);
  showScreen("result");
  // Explain the weak topics with AI straight away (only when an API key is set up)
  if (typeof p1AutoAnalysis === "function") p1AutoAnalysis(test);
}

// Render Phase-1 Result Scorecard and review
function renderP1Result(test) {
  if (!test) return;

  if ($("p1-score-val")) $("p1-score-val").textContent = test.score.toFixed(2);
  if ($("p1-score-max")) $("p1-score-max").textContent = test.maxScore.toFixed(2);
  if ($("p1-score-pct")) $("p1-score-pct").textContent = test.accuracy + "%";
  if ($("p1-stat-correct")) $("p1-stat-correct").textContent = test.correctCount;
  if ($("p1-stat-incorrect")) $("p1-stat-incorrect").textContent = test.incorrectCount;
  if ($("p1-stat-unattempted")) $("p1-stat-unattempted").textContent = test.unattemptedCount;
  if ($("p1-stat-time")) $("p1-stat-time").textContent = formatHM(test.timeSpent || 0);

  // Filter counts + always start on "All questions"
  const total = (test.questions || []).length;
  if ($("rf-count-all")) $("rf-count-all").textContent = total;
  if ($("rf-count-correct")) $("rf-count-correct").textContent = test.correctCount || 0;
  if ($("rf-count-incorrect")) $("rf-count-incorrect").textContent = test.incorrectCount || 0;
  if ($("rf-count-unattempted")) $("rf-count-unattempted").textContent = test.unattemptedCount || 0;
  state.p1_resultFilter = "all";
  state.p1_resultPage = 1;
  document.querySelectorAll("#screen-result-p1 .rf-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.filter === "all");
  });

  if ($("p1-result-type")) $("p1-result-type").textContent = test.testType ? test.testType + " · " : "";
  renderP1ResultReviewList();
  if (typeof p1RenderAnalysis === "function") p1RenderAnalysis(test);
}

// Render list of question review cards with filters
function renderP1ResultReviewList() {
  const container = $("p1-result-list");
  if (!container || !state.p1_lastResultTest) return;

  const test = state.p1_lastResultTest;
  const filter = state.p1_resultFilter || "all";
  const cardsHtml = [];
  // questions that match the filter, 20 per page
  const matches = [];
  test.questions.forEach((q, i) => {
    const ua = test.answers[i] ? String(test.answers[i]).toLowerCase().trim() : null;
    const ok = mcqIsCorrect(ua, q.correctAnswer ? String(q.correctAnswer).toLowerCase().trim() : "");
    if ((filter === "correct" && !ok) || (filter === "incorrect" && !(ua && !ok)) || (filter === "unattempted" && ua)) return;
    matches.push(i);
  });
  const totalPages = Math.max(1, Math.ceil(matches.length / QUESTIONS_PER_PAGE));
  state.p1_resultPage = Math.min(Math.max(1, state.p1_resultPage || 1), totalPages);
  const pageIdx = matches.slice((state.p1_resultPage - 1) * QUESTIONS_PER_PAGE, state.p1_resultPage * QUESTIONS_PER_PAGE);
  renderPaginationControls({
    containerId: "p1-result-pagination",
    currentPage: state.p1_resultPage,
    totalPages,
    totalItems: matches.length,
    onPageChange: (pg) => {
      state.p1_resultPage = pg;
      renderP1ResultReviewList();
      const top = $("p1-result-list");
      if (top) top.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  for (const i of pageIdx) {
    const q = test.questions[i];
    const userAns = test.answers[i] ? String(test.answers[i]).toLowerCase().trim() : null;
    const correctAns = q.correctAnswer ? String(q.correctAnswer).toLowerCase().trim() : "";

    const isUnattempted = !userAns;
    const isCorrect = mcqIsCorrect(userAns, correctAns);
    const isIncorrect = !!userAns && !isCorrect;

    const cardStatusClass = isCorrect ? "correct" : isIncorrect ? "incorrect" : "unattempted";
    const statusBadge = isCorrect
      ? `<span class="rev-badge rev-badge-ok">Correct (+${(test.positiveMarks || 1).toFixed(2)})</span>`
      : isIncorrect
      ? `<span class="rev-badge rev-badge-bad">Incorrect (-${(test.negativeMarks || 0.25).toFixed(2)})</span>`
      : `<span class="rev-badge">Unattempted (0.00)</span>`;

    const optionsHtml = (q.options || []).map(opt => {
      const optLabel = opt.label.toLowerCase().trim();
      const isChosen = !!userAns && userAns.includes(optLabel);
      const isActualCorrect = correctAns.includes(optLabel);

      let optClass = "rev-opt";
      let badge = "";
      if (isChosen && isActualCorrect) {
        optClass += " is-correct-opt";
        badge = `<span class="rev-opt-tag ok">Your answer · correct</span>`;
      } else if (isChosen && !isActualCorrect) {
        optClass += " chosen-wrong";
        badge = `<span class="rev-opt-tag bad">Your answer · incorrect</span>`;
      } else if (!isChosen && isActualCorrect) {
        optClass += " is-correct-opt";
        badge = `<span class="rev-opt-tag ok">Correct answer</span>`;
      }

      return `
        <div class="${optClass}">
          <span style="font-weight:700; min-width:24px;">[${escapeHTML(String(opt.label).toUpperCase())}]</span>
          <span>${escapeHTML(opt.text)}</span>
          ${badge}
        </div>
      `;
    }).join("");
    const why = (isIncorrect || isUnattempted) && typeof p1WhyNote === "function" ? p1WhyNote(test.id, i) : "";
    const topic = typeof mcqTopicOf === "function" ? mcqTopicOf(q) : (q.topic || "");

    cardsHtml.push(`
      <div class="mcq-review-card ${cardStatusClass}" data-q-index="${i}">
        <div class="review-card-header">
          <div>
            <strong>Question ${i + 1}</strong>
            <span class="rev-meta">${escapeHTML(q.subject || "General Awareness")}${topic && topic !== q.subject ? " · " + escapeHTML(topic) : ""}${q.level ? " · " + escapeHTML(q.level) : ""}</span>
          </div>
          <div>${statusBadge}</div>
        </div>
        ${q.passage ? `<details class="q-passage-peek"><summary>The ${escapeHTML(passageKind(q.passage))} this question is based on</summary><div class="q-passage-body">${richTextHTML(q.passage)}</div></details>` : ""}
        <div class="review-card-prompt">${escapeHTML(q.text)}</div>
        <div class="review-options-list">${optionsHtml}</div>
        ${correctAns.length > 1 ? `<div class="rev-explanation"><strong>Correct options:</strong> ${escapeHTML(formatMCQAnswer(correctAns))}${userAns ? ` · <strong>You chose:</strong> ${escapeHTML(formatMCQAnswer(userAns))}` : ""}</div>` : ""}
        ${q.explanation ? `<div class="rev-explanation"><strong>Explanation:</strong> ${escapeHTML(q.explanation)}</div>` : ""}
        ${why ? `<div class="rev-explanation rev-ai-why"><strong>Why (AI):</strong> ${escapeHTML(why)}</div>` : ""}
      </div>
    `);
  }

  if (cardsHtml.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--muted);">No questions match the "${filter}" filter.</div>`;
  } else {
    container.innerHTML = cardsHtml.join("");
  }
}

// Download text file with Phase-1 exam scorecard, topic-wise analysis and questions review
function downloadP1Result(test) {
  if (!test) return;

  const lines = [
    "============================================================",
    "          RBI GRADE B - OBJECTIVE TEST REPORT                ",
    "============================================================",
    `Date: ${new Date(test.date || test.completedAt).toLocaleString()}`,
    test.testType ? `Test type: ${test.testType}` : "",
    `Total Time Spent: ${formatDuration(test.timeSpent || 0)}`,
    `Total Questions: ${test.questions.length}`,
    `Net Score: ${test.score.toFixed(2)} / ${test.maxScore.toFixed(2)}`,
    `Accuracy: ${test.accuracy}%`,
    `Correct: ${test.correctCount} | Incorrect: ${test.incorrectCount} | Unattempted: ${test.unattemptedCount}`,
    "============================================================\n"
  ].filter(l => l !== "");

  if (typeof p1TopicStats === "function") {
    lines.push("--- TOPIC-WISE ANALYSIS (weakest first) ---\n");
    p1TopicStats(test).forEach(t => lines.push(`${t.topic}: ${t.correct} correct, ${t.wrong} wrong, ${t.skipped} left of ${t.total} · accuracy ${t.attempted ? t.accuracy + "%" : "-"} · net ${t.net.toFixed(2)}/${t.max.toFixed(2)} · ${t.level}`));
    const a = p1LoadAnalyses()[test.id];
    if (a) {
      lines.push("", "--- AI EXPLANATION OF WEAK TOPICS ---", "");
      if (a.overall) lines.push(a.overall, "");
      a.topics.forEach(t => {
        lines.push(`## ${t.topic}`);
        if (t.diagnosis) lines.push("What your mistakes show: " + t.diagnosis);
        if (t.explanation) lines.push("", t.explanation);
        if (t.keyPoints.length) lines.push("", "Remember:", ...t.keyPoints.map(x => " - " + x));
        if (t.traps.length) lines.push("", "Traps:", ...t.traps.map(x => " - " + x));
        if (t.practice) lines.push("", "Practise next: " + t.practice);
        lines.push("");
      });
      if (a.next.length) lines.push("Next steps:", ...a.next.map((x, i) => ` ${i + 1}. ${x}`), "");
    }
    lines.push("");
  }
  lines.push("--- DETAILED QUESTIONS REVIEW ---\n");

  test.questions.forEach((q, idx) => {
    const userAns = test.answers[idx] ? formatMCQAnswer(test.answers[idx]) : "NONE";
    const correctAns = q.correctAnswer ? formatMCQAnswer(q.correctAnswer) : "N/A";
    const status = !test.answers[idx] ? "UNATTEMPTED" : mcqIsCorrect(test.answers[idx], q.correctAnswer) ? "CORRECT" : "INCORRECT";

    if (q.passage && (idx === 0 || test.questions[idx - 1].passage !== q.passage)) lines.push(`[Passage / data for the next question(s)]\n${q.passage}\n`);
    lines.push(`Q${idx + 1}: ${q.text}`);
    (q.options || []).forEach(o => {
      lines.push(`   [${o.label.toUpperCase()}] ${o.text}`);
    });
    lines.push(`   Topic:            ${mcqTopicOf(q)}`);
    lines.push(`   Candidate Answer: ${userAns}`);
    lines.push(`   Correct Answer:   ${correctAns}`);
    lines.push(`   Status:           ${status}`);
    if (q.explanation) {
      lines.push(`   Explanation:      ${q.explanation}`);
    }
    const why = p1WhyNote(test.id, idx);
    if (why && status !== "CORRECT") lines.push(`   Why (AI):         ${why}`);
    lines.push("");
  });

  const filename = `RBI_Phase1_Scorecard_${getLocalDateString(test.date)}.txt`;
  downloadText(filename, lines.join("\n"));
}

// Render Phase-1 History
function renderP1History() {
  const statsElem = $("p1-history-stats");
  const listElem = $("p1-history-list");
  if (!listElem) return;

  const history = loadJSON("rbi_p1_history", []);

  const clearBtn = $("btn-clear-p1-history");
  if (clearBtn) clearBtn.hidden = history.length === 0;

  if (history.length === 0) {
    if (statsElem) statsElem.innerHTML = "";
    // the subject / chapter folders are there even before the first test
    if (typeof renderHistoryFolders === "function") renderHistoryFolders(listElem, [], () => "", "p1");
    else listElem.innerHTML = `<div class="empty-state">No objective tests yet. Finish a test from <strong>New Test</strong> and it will appear here.</div>`;
    return;
  }

  const totalTests = history.length;
  const avgScore = (history.reduce((acc, t) => acc + (t.score || 0), 0) / totalTests).toFixed(2);
  const avgAccuracy = (history.reduce((acc, t) => acc + (t.accuracy || 0), 0) / totalTests).toFixed(1);
  const totalSolved = history.reduce((acc, t) => acc + ((t.correctCount || 0) + (t.incorrectCount || 0)), 0);

  if (statsElem && typeof renderPerformanceChart === "function") {
    statsElem.classList.remove("history-stats-bar");
    renderPerformanceChart(statsElem, history, "mcq");
  } else if (statsElem) {
    statsElem.innerHTML = `
      <div class="stat-pill"><span>Total Tests:</span> <strong>${totalTests}</strong></div>
      <div class="stat-pill"><span>Avg Score:</span> <strong>${avgScore}</strong></div>
      <div class="stat-pill"><span>Avg Accuracy:</span> <strong>${avgAccuracy}%</strong></div>
      <div class="stat-pill"><span>MCQs Solved:</span> <strong>${totalSolved}</strong></div>
    `;
  }

  const cardHTML = t => {
    const fld = typeof testFolderOf === "function" ? testFolderOf(t) : null;
    const pct = t.maxScore ? Math.max(0, t.score) / t.maxScore * 100 : 0;
    const n = t.questions.length || 1;
    const seg = (cls, v, label) => v ? `<span class="tbar-${cls}" style="flex:${v}" title="${label}: ${v}"></span>` : "";
    return `
      <article class="history-card tcard-host">
        <div class="tcard">
          <div class="tcard-left">${scoreRingHTML(pct, `<strong>${t.score.toFixed(2)}</strong> / ${t.maxScore.toFixed(0)}`)}</div>
          <div class="tcard-main">
            <div class="tcard-top">
              <span class="tcard-type">${escapeHTML(t.testType || "Objective Practice")}</span>
              <span class="tcard-date">${escapeHTML(formatDateHM(t.date || t.completedAt))}</span>
            </div>
            <div class="tcard-title">${escapeHTML(fld && fld.subject ? (fld.kind === "chapter" ? fld.chapter : fld.subject + " · Mix test") : (t.questions[0] && t.questions[0].subject) || "Objective test")}</div>
            <div class="tcard-bar" role="img" aria-label="${t.correctCount} correct, ${t.incorrectCount} incorrect, ${t.unattemptedCount} not attempted of ${n}">
              ${seg("ok", t.correctCount, "Correct")}${seg("bad", t.incorrectCount, "Incorrect")}${seg("none", t.unattemptedCount, "Not attempted")}
            </div>
            <div class="tcard-chips">
              <span class="tcard-chip"><i class="dot dot-ok"></i>${t.correctCount} correct</span>
              <span class="tcard-chip"><i class="dot dot-bad"></i>${t.incorrectCount} wrong</span>
              <span class="tcard-chip"><i class="dot dot-none"></i>${t.unattemptedCount} left</span>
              <span class="tcard-chip">Accuracy ${t.accuracy}%</span>
              <span class="tcard-chip">Time ${formatHM(t.timeSpent || 0)}</span>
            </div>
          </div>
          <div class="tcard-actions">
            <button type="button" class="btn-p1-history-review ai-btn-primary tcard-primary" data-id="${t.id}">Review test</button>
            <button type="button" class="btn-soft btn-move-folder" data-store="rbi_p1_history" data-test-id="${escapeHTML(t.id)}">Move to folder</button>
            <button type="button" class="btn-soft btn-soft-danger btn-p1-history-delete" data-id="${t.id}">Delete</button>
          </div>
        </div>
      </article>
    `;
  };
  // Subject > Chapter tests > chapter > Full / Partial chapter, and Subject > Mix tests
  if (typeof renderHistoryFolders === "function") renderHistoryFolders(listElem, history, cardHTML, "p1");
  else listElem.innerHTML = history.map(cardHTML).join("");
}

// Review a test attempt from Phase-1 History
function reviewP1HistoricalTest(id) {
  const history = loadJSON("rbi_p1_history", []);
  const test = history.find(t => t.id === id);
  if (!test) return;
  state.p1_lastResultTest = test;
  renderP1Result(test);
  showScreen("result");
}

// Delete an item from Phase-1 History
function deleteP1HistoryItem(id) {
  if (!confirm("Delete this test attempt from history?")) return;
  let history = loadJSON("rbi_p1_history", []);
  history = history.filter(t => t.id !== id);
  saveJSON("rbi_p1_history", history);
  if (typeof p1DeleteAnalyses === "function") p1DeleteAnalyses([id]);
  renderP1History();
}

// Clear all Phase-1 History
function clearP1History() {
  const history = loadJSON("rbi_p1_history", []);
  if (history.length === 0) return;
  if (!confirm("Are you sure you want to delete all Phase-1 test history?")) return;
  if (typeof p1DeleteAnalyses === "function") p1DeleteAnalyses(history.map(t => t.id));
  saveJSON("rbi_p1_history", []);
  renderP1History();
}

// ============================================================
// STUDY PLAN & CALENDAR INFRASTRUCTURE (EXCEL / CSV IMPORT)
// ============================================================

// ============================================================
// STUDY PLAN & CALENDAR INFRASTRUCTURE (EXCEL / CSV IMPORT)
// ============================================================

// Extract all files from a standard PKZIP archive (DOCX or XLSX)
async function extractZipEntries(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocdOffset = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65536); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error("Invalid archive file format (end-of-central-directory signature not found).");
  }

  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const cdEntries = view.getUint16(eocdOffset + 8, true);

  const entries = {};
  let p = cdOffset;

  for (let i = 0; i < cdEntries; i++) {
    if (p + 46 > buf.byteLength || view.getUint32(p, true) !== 0x02014b50) break;

    const compression = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const fileNameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localHeaderOffset = view.getUint32(p + 42, true);

    const fileNameBytes = buf.subarray(p + 46, p + 46 + fileNameLen);
    const fileName = new TextDecoder("utf-8").decode(fileNameBytes);

    p += 46 + fileNameLen + extraLen + commentLen;

    // Read local file header to locate exact compressed payload
    if (localHeaderOffset + 30 > buf.byteLength) continue;
    const localView = new DataView(buf.buffer, buf.byteOffset + localHeaderOffset, 30);
    if (localView.getUint32(0, true) !== 0x04034b50) continue;

    const localNameLen = localView.getUint16(26, true);
    const localExtraLen = localView.getUint16(28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > buf.byteLength) continue;
    const compressedData = buf.subarray(dataStart, dataEnd);

    if (compression === 0) {
      entries[fileName] = new TextDecoder("utf-8").decode(compressedData);
    } else if (compression === 8) {
      try {
        const merged = await decompressBuffer(compressedData, "deflate-raw");
        entries[fileName] = new TextDecoder("utf-8").decode(merged);
      } catch (e) {
        // Continue if a single zip entry fails decompression
      }
    }
  }

  return entries;
}

// Convert Excel column letters (A, B, ..., Z, AA, AB) to 0-based index
function colLettersToIndex(letters) {
  let col = 0;
  const str = String(letters).toUpperCase();
  for (let i = 0; i < str.length; i++) {
    col = col * 26 + (str.charCodeAt(i) - 64);
  }
  return col - 1;
}

// Native client-side parser for modern XLSX files (without external dependencies)
async function parseXLSX(arrayBuffer) {
  const buf = new Uint8Array(arrayBuffer);
  const entries = await extractZipEntries(buf);

  // 1. Parse shared strings table (xl/sharedStrings.xml)
  const sharedStrings = [];
  const sstXml = entries["xl/sharedStrings.xml"] || entries["xl/SharedStrings.xml"] || "";
  if (sstXml) {
    const siRegex = /<si\b[^>]*>(.*?)<\/si>/gs;
    let match;
    while ((match = siRegex.exec(sstXml)) !== null) {
      const tRegex = /<t\b[^>]*>(.*?)<\/t>/gs;
      let tMatch;
      let text = "";
      while ((tMatch = tRegex.exec(match[1])) !== null) {
        text += tMatch[1];
      }
      sharedStrings.push(
        text.replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
      );
    }
  }

  // 2. Locate first sheet XML
  let sheetXmlKey = Object.keys(entries).find(k => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k));
  if (!sheetXmlKey) sheetXmlKey = Object.keys(entries).find(k => /^xl\/worksheets\/.*\.xml$/i.test(k));
  if (!sheetXmlKey) throw new Error("No worksheets found in this Excel spreadsheet.");

  const sheetXml = entries[sheetXmlKey];
  const rowRegex = /<row\b[^>]*>(.*?)<\/row>/gs;
  const rows = [];
  let rowMatch;

  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const rowContent = rowMatch[1];
    const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cMatch;
    const row = [];

    while ((cMatch = cellRegex.exec(rowContent)) !== null) {
      const attrs = cMatch[1];
      const inner = cMatch[2] || "";
      const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
      const tMatch = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(inner);
      const val = vMatch ? vMatch[1].trim() : "";
      const isVal = tMatch ? tMatch[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").trim() : "";

      // derive column index from r="A1"
      const rAttrMatch = /r="([A-Z]+)(\d+)"/.exec(attrs);
      let colIdx = row.length;
      if (rAttrMatch) {
        colIdx = colLettersToIndex(rAttrMatch[1]);
      }

      // pad any skipped empty cells
      while (row.length < colIdx) {
        row.push("");
      }

      const isString = /t="s"/.test(attrs);
      const isInline = /t="inlineStr"/.test(attrs);

      let cellValue = "";
      if (isString) {
        cellValue = sharedStrings[Number(val)] || "";
      } else if (isInline || isVal) {
        cellValue = isVal || val;
      } else {
        cellValue = val;
      }

      row[colIdx] = sanitizeDashes(String(cellValue).trim());
    }

    if (row.length > 0 && row.some(cell => String(cell).trim().length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

// Parse RFC-compliant CSV or TSV string respecting quotes
function parseCSV(text) {
  const rows = [];
  let row = [];
  let curr = "";
  let insideQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '"') {
      if (insideQuotes && next === '"') {
        curr += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if ((c === ',' || c === '\t') && !insideQuotes) {
      row.push(sanitizeDashes(curr.trim()));
      curr = "";
    } else if ((c === '\r' || c === '\n') && !insideQuotes) {
      if (c === '\r' && next === '\n') i++;
      row.push(sanitizeDashes(curr.trim()));
      if (row.length > 0 && row.some(cell => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      curr = "";
    } else {
      curr += c;
    }
  }
  if (curr.length > 0 || row.length > 0) {
    row.push(sanitizeDashes(curr.trim()));
    if (row.some(cell => cell.length > 0)) rows.push(row);
  }
  return rows;
}

// Parse various spreadsheet date formats into "YYYY-MM-DD"
function parseScheduleDate(raw) {
  if (!raw) return getLocalDateString(new Date());
  const str = String(raw).trim();

  // Excel serial number (e.g. 46347)
  const num = Number(str);
  if (!isNaN(num) && num > 25000 && num < 75000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(num));
    const year = epoch.getUTCFullYear();
    const month = String(epoch.getUTCMonth() + 1).padStart(2, "0");
    const day = String(epoch.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // ISO "YYYY-MM-DD"
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(str)) {
    const parts = str.split("-");
    return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/.exec(str);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
  }

  // Standard Date parsing fallback
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return getLocalDateString(parsed);
  }

  return getLocalDateString(new Date());
}

// Wire all global DOM event listeners and initialize screen state
document.addEventListener("DOMContentLoaded", () => {
  // Navigation
  const navSetup = $("nav-setup");
  if (navSetup) {
    navSetup.addEventListener("click", () => {
      if (state.phase === "phase1") {
        renderP1SetupList();
      } else {
        renderSetupList();
      }
      showScreen("setup");
    });
  }

  const navHistory = $("nav-history");
  if (navHistory) {
    navHistory.addEventListener("click", () => {
      if (state.phase === "phase1") {
        renderP1History();
      } else {
        renderHistory();
      }
      showScreen("history");
    });
  }

  const navCalendar = $("nav-calendar");
  if (navCalendar) {
    navCalendar.addEventListener("click", () => {
      showScreen("calendar");
    });
  }

  // Setup Screen
  const qForm = $("question-form");
  if (qForm) {
    qForm.addEventListener("submit", handleQuestionFormSubmit);
  }

  const btnCancelEdit = $("btn-cancel-edit");
  if (btnCancelEdit) {
    btnCancelEdit.addEventListener("click", () => {
      resetQuestionForm();
    });
  }

  // Phase-1 test settings are saved as soon as they change
  [["setup-p1-minutes", "totalMinutes", 1], ["setup-p1-positive", "positiveMarks", 0], ["setup-p1-negative", "negativeMarks", 0]].forEach(([id, key, min]) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("change", () => {
      const v = readNumberInput(id, null, min);
      if (v === null) {
        renderP1SetupList();
        return;
      }
      state.p1_setup[key] = v;
      saveP1Setup();
    });
  });

  const qMarks = $("q-marks");
  if (qMarks) {
    qMarks.addEventListener("change", (e) => {
      $("q-wordlimit").value = defaultWordLimit(e.target.value);
    });
  }

  const setupDocImport = $("setup-doc-import");
  if (setupDocImport) {
    setupDocImport.addEventListener("change", (e) => handleDocImport(e, "setup"));
  }

  const p2UploadCard = document.querySelector("#screen-setup .minimal-upload-card");
  if (p2UploadCard) {
    p2UploadCard.addEventListener("dragover", (e) => {
      e.preventDefault();
      p2UploadCard.classList.add("drag-over");
    });
    p2UploadCard.addEventListener("dragleave", () => {
      p2UploadCard.classList.remove("drag-over");
    });
    p2UploadCard.addEventListener("drop", (e) => {
      e.preventDefault();
      p2UploadCard.classList.remove("drag-over");
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleDocImport({ target: { files: e.dataTransfer.files } }, "setup");
      }
    });
  }

  const setupSelectAll = $("setup-select-all");
  if (setupSelectAll) {
    setupSelectAll.addEventListener("change", handleSelectAllSetup);
  }

  const btnDeleteSelected = $("btn-delete-selected");
  if (btnDeleteSelected) {
    btnDeleteSelected.addEventListener("click", handleDeleteSelectedSetup);
  }

  const btnDeleteAllSetup = $("btn-delete-all-setup");
  if (btnDeleteAllSetup) {
    btnDeleteAllSetup.addEventListener("click", handleDeleteAllSetup);
  }

  const setupQList = $("setup-question-list");
  if (setupQList) {
    setupQList.addEventListener("change", (e) => {
      if (e.target && e.target.classList.contains("q-select-check")) {
        updateSetupBatchDeleteState();
      }
    });

    setupQList.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === "edit") {
        editSetupQuestion(id);
      } else if (action === "delete") {
        deleteSetupQuestion(id);
      } else if (action === "move-up") {
        moveUpSetupQuestion(id);
      } else if (action === "move-down") {
        moveDownSetupQuestion(id);
      }
    });
  }

  const setupMinutes = $("setup-minutes");
  if (setupMinutes) {
    setupMinutes.addEventListener("change", (e) => {
      const min = Math.max(1, Number(e.target.value) || 1);
      state.setup.totalMinutes = min;
      saveSetup();
    });
  }

  const btnStart = $("btn-start-test");
  if (btnStart) {
    btnStart.addEventListener("click", handleStartTestClick);
  }

  // Exam Screen
  const examAnswer = $("exam-answer");
  if (examAnswer) {
    examAnswer.addEventListener("input", handleAnswerInput);
    examAnswer.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const start = examAnswer.selectionStart;
        const end = examAnswer.selectionEnd;
        examAnswer.setRangeText("    ", start, end, "end");
        handleAnswerInput();
      }
    });
    ["paste", "drop", "copy", "cut"].forEach(t => examAnswer.addEventListener(t, handlePasteOrDrop));
    examAnswer.addEventListener("dragstart", (e) => e.preventDefault());
  }

  const btnPrev = $("btn-prev");
  if (btnPrev) {
    btnPrev.addEventListener("click", () => {
      if (state.currentIndex > 0) {
        storeCurrentAnswer();
        showQuestion(state.currentIndex - 1);
      }
    });
  }

  const btnNext = $("btn-next");
  if (btnNext) {
    btnNext.addEventListener("click", () => {
      if (state.test) {
        storeCurrentAnswer();
        if (state.currentIndex < state.test.questions.length - 1) {
          showQuestion(state.currentIndex + 1);
        } else {
          renderPalette();
          updateExamSummary();
        }
      }
    });
  }

  const btnClearAnswer = $("btn-clear-answer");
  if (btnClearAnswer) {
    btnClearAnswer.addEventListener("click", () => {
      if (!state.test) return;
      const currentQ = state.test.questions[state.currentIndex];
      if (!currentQ) return;
      const textarea = $("exam-answer");
      if (textarea && textarea.value.trim().length > 0) {
        if (confirm("Are you sure you want to clear your response for this question?")) {
          textarea.value = "";
          if (state.test.answers[currentQ.id]) {
            state.test.answers[currentQ.id].text = "";
            state.test.answers[currentQ.id].wordCount = 0;
          }
          if (state.markedForReview) {
            state.markedForReview.delete(currentQ.id);
          }
          saveJSON("rbi_active_test", state.test);
          updateWordCount();
          renderPalette();
          updateExamSummary();
        }
      }
    });
  }

  const btnMarkReview = $("btn-mark-review");
  if (btnMarkReview) {
    btnMarkReview.addEventListener("click", () => {
      if (!state.test) return;
      const currentQ = state.test.questions[state.currentIndex];
      if (!currentQ) return;
      storeCurrentAnswer();
      state.markedForReview = state.markedForReview || new Set();
      if (state.markedForReview.has(currentQ.id)) {
        state.markedForReview.delete(currentQ.id);
      } else {
        state.markedForReview.add(currentQ.id);
      }
      if (state.currentIndex < state.test.questions.length - 1) {
        showQuestion(state.currentIndex + 1);
      } else {
        renderPalette();
        updateExamSummary();
      }
    });
  }

  const examPalette = $("exam-palette");
  if (examPalette) {
    examPalette.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-index]");
      if (btn) {
        showQuestion(Number(btn.dataset.index));
      }
    });
  }

  // Exam keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if (!state.test) return;
    if (e.ctrlKey && e.altKey) {
      if (e.key === "ArrowRight" && state.currentIndex < state.test.questions.length - 1) {
        e.preventDefault();
        showQuestion(state.currentIndex + 1);
      } else if (e.key === "ArrowLeft" && state.currentIndex > 0) {
        e.preventDefault();
        showQuestion(state.currentIndex - 1);
      }
    }
  });

  // Context menu prevention during exam
  window.addEventListener("contextmenu", (e) => {
    if (state.test) {
      e.preventDefault();
    }
  });

  const btnSubmit = $("btn-submit");
  if (btnSubmit) {
    btnSubmit.addEventListener("click", () => {
      storeCurrentAnswer();
      updateExamSummary();
      const modal = $("confirm-submit");
      if (modal) modal.hidden = false;
    });
  }

  const btnConfirmYes = $("btn-confirm-yes");
  if (btnConfirmYes) {
    btnConfirmYes.addEventListener("click", () => {
      const modal = $("confirm-submit");
      if (modal) modal.hidden = true;
      finishTest(false);
    });
  }

  const btnConfirmNo = $("btn-confirm-no");
  if (btnConfirmNo) {
    btnConfirmNo.addEventListener("click", () => {
      const modal = $("confirm-submit");
      if (modal) modal.hidden = true;
    });
  }

  // Result Screen
  const resultList = $("result-list");
  if (resultList) {
    resultList.addEventListener("click", (e) => {
      const copyBtn = e.target.closest(".btn-copy-card");
      if (copyBtn && state.lastResultTest) {
        const idx = Number(copyBtn.dataset.idx);
        const q = state.lastResultTest.questions[idx];
        copyText(buildQuestionText(state.lastResultTest, q, idx), copyBtn);
        return;
      }

      const downloadBtn = e.target.closest(".btn-download-card");
      if (downloadBtn && state.lastResultTest) {
        const idx = Number(downloadBtn.dataset.idx);
        const q = state.lastResultTest.questions[idx];
        downloadText(getQuestionFilename(state.lastResultTest, q, idx), buildQuestionText(state.lastResultTest, q, idx));
        return;
      }

      const toggleBtn = e.target.closest(".btn-toggle-model");
      if (toggleBtn) {
        const idx = toggleBtn.dataset.idx;
        const box = $("model-box-" + idx);
        if (box) {
          box.hidden = !box.hidden;
          toggleBtn.textContent = box.hidden ? "Show model answer" : "Hide model answer";
        }
      }
    });
  }

  const btnDownloadAll = $("btn-download-all");
  if (btnDownloadAll) {
    btnDownloadAll.addEventListener("click", () => {
      if (state.lastResultTest) {
        downloadText(getCombinedFilename(state.lastResultTest), buildCombinedText(state.lastResultTest));
      }
    });
  }

  const btnCopyAll = $("btn-copy-all");
  if (btnCopyAll) {
    btnCopyAll.addEventListener("click", (e) => {
      if (state.lastResultTest) {
        copyText(buildCombinedText(state.lastResultTest), e.target);
      }
    });
  }

  const btnGoHistory = $("btn-go-history");
  if (btnGoHistory) {
    btnGoHistory.addEventListener("click", () => {
      renderHistory();
      showScreen("history");
    });
  }

  // History Screen
  const historyList = $("history-list");
  if (historyList) {
    historyList.addEventListener("change", (e) => {
      if (e.target.classList.contains("score-input")) {
        const tid = e.target.dataset.testId;
        const qid = e.target.dataset.qid;
        handleScoreChange(tid, qid, e.target.value);
      }
    });

    historyList.addEventListener("paste", (e) => {
      if (e.target.classList.contains("score-input")) {
        const pasted = (e.clipboardData || window.clipboardData)?.getData("text") || "";
        const m = pasted.match(/SCORE_LOG.*?\|\s*([\d\.]+)\s*\/\s*\d+/i) || pasted.match(/([\d\.]+)\s*\/\s*\d+/) || pasted.match(/([\d\.]+)/);
        if (m) {
          e.preventDefault();
          const val = parseFloat(m[1]);
          e.target.value = isNaN(val) ? "" : val;
          handleScoreChange(e.target.dataset.testId, e.target.dataset.qid, e.target.value);
        }
      }
    });

    historyList.addEventListener("click", (e) => {
      const moveBtn = e.target.closest(".btn-move-folder");
      if (moveBtn) {
        moveHistoryTestToFolder(moveBtn.dataset.store, moveBtn.dataset.testId);
        return;
      }
      const toggleRevBtn = e.target.closest(".btn-toggle-answer-review");
      if (toggleRevBtn) {
        const tid = toggleRevBtn.dataset.testId;
        const container = $(`review-container-${tid}`);
        if (container) {
          const isHidden = container.style.display === "none";
          container.style.display = isHidden ? "block" : "none";
          toggleRevBtn.textContent = isHidden ? "Hide answers" : "Review answers";
        }
        return;
      }

      const copyAnsBtn = e.target.closest(".btn-copy-ans-mini");
      if (copyAnsBtn) {
        const history = loadJSON("rbi_history", []);
        const test = history.find(t => t.id === copyAnsBtn.dataset.testId);
        if (test) {
          const idx = Number(copyAnsBtn.dataset.idx);
          const q = test.questions[idx];
          const ans = (test.answers && test.answers[q.id]) || { text: "" };
          copyText(ans.text || "(No answer recorded)", copyAnsBtn);
        }
        return;
      }

      const toggleModelBtn = e.target.closest(".btn-toggle-model-mini");
      if (toggleModelBtn) {
        const tid = toggleModelBtn.dataset.testId;
        const idx = toggleModelBtn.dataset.idx;
        const box = $(`model-${tid}-${idx}`);
        if (box) {
          box.style.display = box.style.display === "none" ? "block" : "none";
        }
        return;
      }
      const openBtn = e.target.closest(".btn-open-results");
      if (openBtn) {
        const history = loadJSON("rbi_history", []);
        const test = history.find(t => t.id === openBtn.dataset.testId);
        if (test) {
          renderResult(test);
          showScreen("result");
        }
        return;
      }

      const retakeBtn = e.target.closest(".btn-retake");
      if (retakeBtn) {
        retakeTest(retakeBtn.dataset.testId);
        return;
      }

      const delBtn = e.target.closest(".btn-delete-test");
      if (delBtn) {
        deleteTest(delBtn.dataset.testId);
        return;
      }

      const copyQBtn = e.target.closest(".btn-copy-history");
      if (copyQBtn) {
        const history = loadJSON("rbi_history", []);
        const test = history.find(t => t.id === copyQBtn.dataset.testId);
        if (test) {
          const idx = Number(copyQBtn.dataset.idx);
          const q = test.questions[idx];
          copyText(buildQuestionText(test, q, idx), copyQBtn);
        }
        return;
      }

      const downQBtn = e.target.closest(".btn-download-history");
      if (downQBtn) {
        const history = loadJSON("rbi_history", []);
        const test = history.find(t => t.id === downQBtn.dataset.testId);
        if (test) {
          const idx = Number(downQBtn.dataset.idx);
          const q = test.questions[idx];
          downloadText(getQuestionFilename(test, q, idx), buildQuestionText(test, q, idx));
        }
        return;
      }
    });
  }

  const btnClearHistory = $("btn-clear-history");
  if (btnClearHistory) {
    btnClearHistory.addEventListener("click", clearAllHistory);
  }

  // ==========================================
  // PHASE 1: EVENT LISTENERS
  // ==========================================

  // Phase switchers in header
  const phaseBtnP1 = $("phase-btn-p1");
  if (phaseBtnP1) {
    phaseBtnP1.addEventListener("click", () => setPhase("phase1"));
  }

  const phaseBtnP2 = $("phase-btn-p2");
  if (phaseBtnP2) {
    phaseBtnP2.addEventListener("click", () => setPhase("phase2"));
  }

  // "Back to calendar" on a result opened from the calendar
  document.querySelectorAll(".btn-back-calendar").forEach(b => b.addEventListener("click", () => showScreen("calendar")));

  // Phase-1 Setup Events
  const p1Form = $("p1-question-form");
  if (p1Form) {
    p1Form.addEventListener("submit", handleP1QuestionFormSubmit);
  }

  // the model answer box grows with the text you type or paste
  const qModel = $("q-model");
  if (qModel) qModel.addEventListener("input", () => autoGrowTextarea(qModel));

  // AI Check pressed without a key: remember it, so it runs once the key is saved
  document.addEventListener("click", (e) => {
    const want = e.target.closest("[data-want-check]");
    if (want) state.wantAICheck = want.dataset.wantCheck;
  });

  const p1KeyImport = $("setup-p1-key-import");
  if (p1KeyImport) p1KeyImport.addEventListener("change", handleP1KeyImport);

  const p1DocImport = $("setup-p1-doc-import");
  if (p1DocImport) {
    p1DocImport.addEventListener("change", (e) => handleP1DocImport(e, "setup"));
  }

  const p1UploadCard = document.querySelector("#screen-setup-p1 .minimal-upload-card");
  if (p1UploadCard) {
    p1UploadCard.addEventListener("dragover", (e) => {
      e.preventDefault();
      p1UploadCard.classList.add("drag-over");
    });
    p1UploadCard.addEventListener("dragleave", () => {
      p1UploadCard.classList.remove("drag-over");
    });
    p1UploadCard.addEventListener("drop", (e) => {
      e.preventDefault();
      p1UploadCard.classList.remove("drag-over");
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleP1DocImport({ target: { files: e.dataTransfer.files } }, "setup");
      }
    });
  }

  const p1SelectAll = $("setup-p1-select-all");
  if (p1SelectAll) {
    p1SelectAll.addEventListener("change", handleP1SelectAllSetup);
  }

  const btnP1DeleteSelected = $("btn-p1-delete-selected");
  if (btnP1DeleteSelected) {
    btnP1DeleteSelected.addEventListener("click", handleP1DeleteSelectedSetup);
  }

  const btnP1DeleteAllSetup = $("btn-p1-delete-all-setup");
  if (btnP1DeleteAllSetup) {
    btnP1DeleteAllSetup.addEventListener("click", handleP1DeleteAllSetup);
  }

  const setupP1QList = $("setup-p1-question-list");
  if (setupP1QList) {
    setupP1QList.addEventListener("change", (e) => {
      if (e.target && e.target.classList.contains("p1-q-select-check")) {
        updateP1SetupBatchDeleteState();
      }
    });

    setupP1QList.addEventListener("click", (e) => {
      const delBtn = e.target.closest(".btn-p1-delete-q");
      if (delBtn) {
        const id = delBtn.dataset.id;
        state.p1_setup.questions = state.p1_setup.questions.filter(q => q.id !== id);
        saveP1Setup();
        renderP1SetupList();
        return;
      }

      // Move within the list of ready questions (questions under "Needs attention" stay where they are)
      const moveBtn = e.target.closest(".btn-p1-move-up, .btn-p1-move-down");
      if (moveBtn) {
        const qs = state.p1_setup.questions;
        const ready = qs.filter(q => mcqStatus(q) !== "issue");
        const r = ready.findIndex(q => q.id === moveBtn.dataset.id);
        const other = ready[r + (moveBtn.classList.contains("btn-p1-move-up") ? -1 : 1)];
        if (r >= 0 && other) {
          const a = qs.indexOf(ready[r]);
          const b = qs.indexOf(other);
          [qs[a], qs[b]] = [qs[b], qs[a]];
          saveP1Setup();
          renderP1SetupList();
        }
        return;
      }
    });
  }

  const setupP1Check = $("setup-p1-check");
  if (setupP1Check) setupP1Check.addEventListener("click", handleP1CheckClick);

  const p1FormReset = $("p1-question-form");
  if (p1FormReset) {
    p1FormReset.addEventListener("reset", () => {
      // Cancelling a correction: the next submit adds a new MCQ again
      setTimeout(() => {
        if (!state.p1_editingId) return;
        state.p1_editingId = null;
        const addBtn = $("btn-add-p1-question");
        if (addBtn) addBtn.textContent = "Add MCQ to Test";
      }, 0);
    });
  }

  const btnStartP1Test = $("btn-start-p1-test");
  if (btnStartP1Test) {
    btnStartP1Test.addEventListener("click", startP1Exam);
  }

  // Phase-1 Exam Screen Events
  const p1OptionsList = $("p1-exam-options-list");
  if (p1OptionsList) {
    p1OptionsList.addEventListener("click", (e) => {
      const item = e.target.closest(".mcq-option-item");
      if (item && item.dataset.label) {
        selectP1Option(item.dataset.label);
      }
    });
    p1OptionsList.addEventListener("keydown", (e) => {
      const item = e.target.closest(".mcq-option-item");
      if (item && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        selectP1Option(item.dataset.label);
        const again = p1OptionsList.querySelector(`.mcq-option-item[data-label="${CSS.escape(item.dataset.label)}"]`);
        if (again) again.focus();
      }
    });
  }

  const p1BtnClear = $("p1-btn-clear");
  if (p1BtnClear) {
    p1BtnClear.addEventListener("click", clearP1Option);
  }

  const p1BtnReview = $("p1-btn-review");
  if (p1BtnReview) {
    p1BtnReview.addEventListener("click", markP1ForReview);
  }

  const p1BtnNext = $("p1-btn-next");
  if (p1BtnNext) {
    p1BtnNext.addEventListener("click", saveAndNextP1);
  }

  const p1BtnPrev = $("p1-btn-prev");
  if (p1BtnPrev) {
    p1BtnPrev.addEventListener("click", prevP1Question);
  }

  const p1Palette = $("p1-exam-palette");
  if (p1Palette) {
    p1Palette.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-index]");
      if (btn) {
        saveCurrentP1QuestionTime();
        showP1Question(Number(btn.dataset.index));
      }
    });
  }

  const p1BtnSubmit = $("p1-btn-submit");
  if (p1BtnSubmit) {
    p1BtnSubmit.addEventListener("click", openP1SubmitModal);
  }

  const p1BtnConfirmYes = $("p1-btn-confirm-yes");
  if (p1BtnConfirmYes) {
    p1BtnConfirmYes.addEventListener("click", () => finishP1Test(false));
  }

  const p1BtnConfirmNo = $("p1-btn-confirm-no");
  if (p1BtnConfirmNo) {
    p1BtnConfirmNo.addEventListener("click", closeP1SubmitModal);
  }

  // Phase-1 Result Screen Events
  document.querySelectorAll("#screen-result-p1 .rf-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#screen-result-p1 .rf-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.p1_resultFilter = btn.dataset.filter || "all";
      state.p1_resultPage = 1;
      renderP1ResultReviewList();
    });
  });

  const p1BtnDownload = $("p1-btn-download-results");
  if (p1BtnDownload) {
    p1BtnDownload.addEventListener("click", () => downloadP1Result(state.p1_lastResultTest));
  }

  const p1BtnRetake = $("p1-btn-retake");
  if (p1BtnRetake) {
    p1BtnRetake.addEventListener("click", () => {
      if (state.p1_lastResultTest && state.p1_lastResultTest.questions) {
        state.p1_setup.questions = state.p1_lastResultTest.questions.map(q => ({ ...q }));
        saveP1Setup();
        renderP1SetupList();
      }
      showScreen("setup");
    });
  }

  const p1BtnGoHistory = $("p1-btn-go-history");
  if (p1BtnGoHistory) {
    p1BtnGoHistory.addEventListener("click", () => {
      renderP1History();
      showScreen("history");
    });
  }

  // Phase-1 History Events
  const p1HistoryList = $("p1-history-list");
  if (p1HistoryList) {
    p1HistoryList.addEventListener("click", (e) => {
      const moveBtn = e.target.closest(".btn-move-folder");
      if (moveBtn) {
        moveHistoryTestToFolder(moveBtn.dataset.store, moveBtn.dataset.testId);
        return;
      }
      const revBtn = e.target.closest(".btn-p1-history-review");
      if (revBtn) {
        reviewP1HistoricalTest(revBtn.dataset.id);
        return;
      }

      const delBtn = e.target.closest(".btn-p1-history-delete");
      if (delBtn) {
        deleteP1HistoryItem(delBtn.dataset.id);
        return;
      }
    });
  }

  const btnClearP1History = $("btn-clear-p1-history");
  if (btnClearP1History) {
    btnClearP1History.addEventListener("click", clearP1History);
  }

  // Calendar & TODO screens (see calendar.js)
  initCalendar();

  // AI evaluation: settings dialog, result & history assessments (see ai_eval.js)
  if (window.AIEval) AIEval.init();

  // Initial load
  setPhase(state.phase);
  // AI work keeps running in the background; the header shows it on every screen
  wireAIBackground();
  // after sign-in (auth.js): "resume your test?", then AI work a page reload interrupted
  const afterSignIn = () => {
    checkResumeActiveTest();
    if (window.AIEval && AIEval.resumePending) AIEval.resumePending();
    if (typeof p1ResumeAnalysis === "function") p1ResumeAnalysis();
    updateAIBackgroundStatus();
  };
  if (typeof window.whenSignedIn === "function") window.whenSignedIn(afterSignIn);
  else afterSignIn();
});
