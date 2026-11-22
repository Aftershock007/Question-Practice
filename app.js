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
  let targetId = "screen-" + name;
  if (name === "setup" || name === "exam" || name === "result" || name === "history") {
    targetId = state.phase === "phase1" ? `screen-${name}-p1` : `screen-${name}`;
  }
  const target = $(targetId) || $(name) || $("screen-" + name);
  if (target) target.hidden = false;

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
  p1_resultFilter: "all",
  p1_setup_page: 1     // current page for Phase 1 setup questions list
};

// Render reusable pagination controls (50 items per page; hidden if totalPages <= 1)
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
      <span class="pagination-info">Page ${currentPage} of ${totalPages} (${totalItems} total questions · 50 per page)</span>
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

  const suggestedElem = $("setup-suggested-time");
  if (suggestedElem) {
    const suggestedMin = Math.ceil(totalWordLimit / 25);
    suggestedElem.textContent = `Suggested time (pace ≈ 1 min per 25 words): ${suggestedMin} minutes`;
  }

  const minutesInput = $("setup-minutes");
  if (minutesInput && document.activeElement !== minutesInput) {
    minutesInput.value = state.setup.totalMinutes || 30;
  }
  const pasteBox = $("setup-block-paste");
  if (pasteBox) pasteBox.checked = state.setup.blockPaste !== false;

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

  const PAGE_SIZE = 50;
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
            <span class="q-num">Q${globalIdx + 1}</span>
          </div>
          <div style="margin-top: 4px; white-space: pre-wrap; line-height: 1.5; font-weight: 500;">${escapeHTML(q.text)}</div>
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
  selectValueEnsuringOption("q-marks", q.marks || 10, " marks");
  $("q-wordlimit").value = q.wordLimit || defaultWordLimit(q.marks || 10);
  $("q-model").value = q.modelAnswer || "";
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
    modelAnswer
  };

  if (editId) {
    const idx = state.setup.questions.findIndex(q => q.id === editId);
    if (idx >= 0) {
      state.setup.questions[idx] = questionObj;
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
function handleStartTestClick() {
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

  const hasEmptyModel = state.setup.questions.some(q => !q.modelAnswer || !q.modelAnswer.trim());
  if (hasEmptyModel) {
    if (!confirm("Some questions have no model answer. The AI will grade without a reference. Continue?")) {
      return;
    }
  }

  startTest();
}

// Initialize a new test session and transition to the exam screen
function startTest() {
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

  const blockPasteCheckbox = $("setup-block-paste");
  const blockPaste = blockPasteCheckbox ? blockPasteCheckbox.checked : true;
  state.setup.blockPaste = blockPaste;
  saveSetup();

  const test = {
    id: makeId("t"),
    date: new Date().toISOString(),
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
  $("exam-question-text").textContent = q.text;

  const secName = $("exam-section-name");
  if (secName) {
    secName.textContent = `${q.paper || "Descriptive Test"} (Keyboard Entry)`;
  }

  const candRoll = document.querySelector(".cand-roll");
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

// Intercept paste and drag-and-drop actions when paste restriction is enabled
function handlePasteOrDrop(e) {
  if (state.test && state.test.blockPaste) {
    e.preventDefault();
    const wcElem = $("exam-wordcount");
    if (wcElem) {
      wcElem.textContent = "Paste is disabled (exam mode)";
      setTimeout(() => {
        updateWordCount();
      }, 1500);
    }
  }
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
    QUESTION: question.text,
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

  $("result-summary").textContent = `Answered ${answeredCount} of ${totalQ} questions · Time used: ${formatDuration(test.usedSeconds)} of ${test.totalMinutes} min${autoNote}`;

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
    listElem.innerHTML = `<div class="empty-state">No descriptive tests yet. Finish a test from <strong>New Test</strong> and it will appear here.</div>`;
    return;
  }

  listElem.innerHTML = "";

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
          ${window.AIEval ? AIEval.historyBlockHTML(t, q) : ""}
        </div>
      `;
    });

    const scoreBadge = `<span class="history-score-slot">${historyScoreBadgeHTML(t)}</span>`;

    card.innerHTML = `
      <div class="history-card-header">
        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
          <strong>${escapeHTML(dateStr)}</strong> - ${t.questions.length} question(s) · Time used: ${usedStr} of ${totalMin} min${autoNote}
          ${scoreBadge}
        </div>
        <div class="actions">
          <button type="button" class="btn-toggle-answer-review btn-soft" data-test-id="${escapeHTML(t.id)}">Review answers</button>
          <button type="button" class="btn-open-results" data-test-id="${escapeHTML(t.id)}">Open results</button>
          <button type="button" class="btn-retake btn-soft" data-test-id="${escapeHTML(t.id)}">Retake</button>
          <button type="button" class="btn-delete-test btn-soft btn-soft-danger" data-test-id="${escapeHTML(t.id)}">Delete</button>
        </div>
      </div>
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
      <div class="test-answers-review-container" id="review-container-${escapeHTML(t.id)}" style="display: none;">
        <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #003366; display: flex; align-items: center; justify-content: space-between;">
          <span>Answers and evaluation</span>
          <span style="font-size: 12px; font-weight: normal; color: var(--muted);">${totalWords} total words</span>
        </h4>
        ${reviewCardsHTML}
      </div>
    `;

    listElem.appendChild(card);
  });
}

// Score summary badge of one descriptive test in History
function historyScoreBadgeHTML(t) {
  let total = 0;
  let max = 0;
  let any = false;
  let words = 0;
  (t.questions || []).forEach(q => {
    max += Number(q.marks) || 10;
    const sc = t.scores ? t.scores[q.id] : null;
    if (sc !== null && sc !== undefined && sc !== "" && !isNaN(sc)) {
      total += Number(sc);
      any = true;
    }
    const a = t.answers && t.answers[q.id];
    if (a && a.wordCount) words += a.wordCount;
  });
  return any
    ? `<span class="score-badge">Score ${Number(total.toFixed(2))} / ${max}</span>`
    : `<span class="score-pending">${words} words written · score not entered yet</span>`;
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
        cur = { page: pageNo, x, y, xEnd: visible ? x + width : x, size, text: it.str, sizeChars: {} };
      } else {
        const gap = x - cur.xEnd;
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
  return lines
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
  const rawQuestionStarts = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line || isHeaderOrFooterLine(line, repHeaders)) continue;

    const m = line.match(qNumRegex);
    if (m) {
      const qNum = parseInt(m[1] || m[2], 10);
      rawQuestionStarts.push({ lineIndex: i, qNum, line });
    } else if (/^(?:Question|Q)\s*[:\.\-]/i.test(line)) {
      rawQuestionStarts.push({ lineIndex: i, qNum: null, line });
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

  const results = [];

  for (let k = 0; k < questionStarts.length; k++) {
    const startIdx = questionStarts[k].lineIndex;
    const endIdx = (k + 1 < questionStarts.length) ? questionStarts[k + 1].lineIndex : rawLines.length;
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
    }
  }

  return results;
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
        addImportedMCQs(mcqLike, file.name);
      }
      return;
    }

    const parsedQuestions = parseQuestionsAndAnswers(rawText);
    if (!parsedQuestions || parsedQuestions.length === 0) {
      throw new Error("Could not detect any questions in the file.");
    }

    parsedQuestions.forEach(q => {
      q.id = makeId("q");
      state.setup.questions.push(q);
    });
    saveSetup();
    renderSetupList();

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

// Parse plain text from DOCX or PDF into MCQ objects with options and answer keys
function parseMCQDocument(rawText, defaultSubject = "General Awareness") {
  if (!rawText || !rawText.trim()) return [];

  const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawParagraphs = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  // Section banners and page artefacts ("Practice Set B", "Page 3") are not question text.
  // Running headers/footers never get here (DOCX keeps them apart; the PDF reader drops
  // them by position), so repeated question stems such as "Find the odd one out." stay.
  const paragraphs = rawParagraphs.filter(p => !isHeaderOrFooterLine(p));

  // 1. Locate Answer Key section if present ("Answer Key", "Answers", "Answers & Explanations"...)
  const ANSWER_SECTION_RE = /^(?:answer\s*keys?|answers|solutions|answers?\s*(?:&|and|with)\s*(?:explanations?|solutions?)|answer\s*keys?\s*(?:&|and|with)\s*(?:explanations?|solutions?))\s*:?$/i;
  let ansKeyIdx = -1;
  let ansKeyRest = "";
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const inline = p.match(/^(?:answer\s*keys?|answers)\s*:\s*(.+)$/i);   // "Answers: 1-a, 2-c, ..."
    if (ANSWER_SECTION_RE.test(p) || inline) {
      ansKeyIdx = i;
      ansKeyRest = inline ? inline[1] : "";
      break;
    }
  }

  const qParagraphs = ansKeyIdx !== -1 ? paragraphs.slice(0, ansKeyIdx) : paragraphs;
  const ansParagraphs = ansKeyIdx !== -1 ? (ansKeyRest ? [ansKeyRest] : []).concat(paragraphs.slice(ansKeyIdx + 1)) : [];

  // Parse Answer Key
  const answersMap = {}; // 0-based question index -> { answer: 'a'|'b'|'c'|'d'|'e', explanation: string }
  let currentOffset = 0;
  let lastSeenQNum = 0;
  let currentQIdx = -1;

  for (let i = 0; i < ansParagraphs.length; i++) {
    const p = ansParagraphs[i];

    // Check for section/set header: e.g. "Practice Set B" or "Section B"
    if (/^(?:Practice\s*Set(?:\s*[A-Z0-9]+)?|Section\s*[A-Z0-9]+|Set\s*[A-Z0-9]+)\b/i.test(p)) {
      if (lastSeenQNum > 0) {
        currentOffset += lastSeenQNum;
        lastSeenQNum = 0;
      }
      continue;
    }

    // Answer-key table rows (DOCX tables arrive as "cell | cell | ..." lines)
    if (p.includes("|")) {
      const cells = p.split("|").map(c => c.trim());
      // "1 to 10 | a | e | b | ..."
      const range = cells[0].match(/^(?:Q\.?\s*)?(\d+)\s*(?:to|-)\s*(?:Q\.?\s*)?(\d+)$/i);
      if (range) {
        const startQ = parseInt(range[1], 10);
        cells.slice(1).forEach((c, k) => {
          const m = c.match(/^[\(\[]?([a-eA-E])[\)\]]?$/);
          if (m) answersMap[startQ - 1 + k + currentOffset] = { answer: m[1].toLowerCase(), explanation: "" };
        });
        lastSeenQNum = Math.max(lastSeenQNum, parseInt(range[2], 10));
        continue;
      }
      // Header row: "Questions | 1 | 2 | 3 ..." or "Q. No. | Answer"
      if (/^(?:q(?:uestions?)?\.?\s*(?:no\.?)?|s\.?\s*no\.?|question\s*no\.?)$/i.test(cells[0]) && cells.slice(1).every(c => /^\d+$|^answers?$|^ans\.?$|^options?$/i.test(c))) continue;
      // Pairs: "1 | c" or "1 | (c) | 2 | (a) | ..."
      if (cells.length >= 2 && cells.length % 2 === 0 && cells.every((c, k) => (k % 2 === 0 ? /^(?:Q\.?\s*)?\d+[.)]?$/i.test(c) : /^[\(\[]?[a-eA-E][\)\]]?$/.test(c)))) {
        for (let k = 0; k < cells.length; k += 2) {
          const qNum = parseInt(cells[k].replace(/\D/g, ""), 10);
          if (lastSeenQNum > 0 && qNum === 1 && k === 0 && answersMap[currentOffset]) currentOffset += lastSeenQNum;
          answersMap[qNum - 1 + currentOffset] = { answer: cells[k + 1].replace(/[^a-eA-E]/g, "").toLowerCase(), explanation: [] };
          currentQIdx = qNum - 1 + currentOffset;
          lastSeenQNum = qNum;
        }
        continue;
      }
    }

    // A table row flattened by a PDF: "1 to 10 a e b d d b e c e c"
    const flatRange = p.match(/^(\d+)\s*to\s*(\d+)\s+((?:[a-eA-E](?:\s+|$))+)$/i);
    if (flatRange) {
      const startQ = parseInt(flatRange[1], 10);
      flatRange[3].trim().split(/\s+/).forEach((v, k) => { answersMap[startQ - 1 + k + currentOffset] = { answer: v.toLowerCase(), explanation: "" }; });
      lastSeenQNum = Math.max(lastSeenQNum, parseInt(flatRange[2], 10));
      continue;
    }

    // Check for range match: e.g. "1 to 10"
    const rangeMatch = p.match(/^(\d+)\s+to\s+(\d+)$/i);
    if (rangeMatch) {
      const startQ = parseInt(rangeMatch[1], 10);
      const endQ = parseInt(rangeMatch[2], 10);
      i++;
      let currQNum = startQ;
      while (i < ansParagraphs.length && currQNum <= endQ) {
        const val = ansParagraphs[i].trim().toLowerCase();
        if (/^[a-e]$/.test(val)) {
          answersMap[currQNum - 1] = { answer: val, explanation: "" };
          currQNum++;
          i++;
        } else {
          break;
        }
      }
      i--;
      continue;
    }

    // A line holding only answers: "1. c  2. a  3. b" / "1-a, 2-c, 3-d"
    const pairRe = /(?:^|[\s,;])(?:Q\.?\s*)?(\d+)\s*[\.:\-\)]?\s*[\(\[]?([a-eA-E])[\)\]]?(?=$|[\s,;])/g;
    const pairs = [...p.matchAll(pairRe)];
    if (pairs.length > 1 && !p.replace(pairRe, "").replace(/[\s,;]/g, "")) {
      for (const sm of pairs) {
        const qNum = parseInt(sm[1], 10);
        if (lastSeenQNum > 0 && qNum === 1 && sm === pairs[0] && answersMap[currentOffset]) currentOffset += lastSeenQNum;
        answersMap[(qNum - 1) + currentOffset] = { answer: sm[2].toLowerCase(), explanation: [] };
        currentQIdx = (qNum - 1) + currentOffset;
        lastSeenQNum = qNum;
      }
      continue;
    }

    // Check for question answer line: e.g. "Q.1) [c] Impulsive" or "1. (b) Some text" or "Q1. a"
    const qAnsMatch = p.match(/^(?:(?:Q(?:uestion)?\s*[\.\-]?\s*)?(\d+)[\.:\-\)\s]+)\s*(?:[\(\[]?([a-eA-E])[\)\]]?)(?:\s+(.*))?$/i);
    if (qAnsMatch) {
      const qNum = parseInt(qAnsMatch[1], 10);
      const ans = qAnsMatch[2].toLowerCase();
      const inlineRest = (qAnsMatch[3] || "").trim();

      // If qNum restarted from 1 and we previously had higher qNums, advance offset
      if (lastSeenQNum > 0 && qNum <= lastSeenQNum && qNum === 1) {
        currentOffset += lastSeenQNum;
      }
      lastSeenQNum = qNum;

      currentQIdx = (qNum - 1) + currentOffset;
      answersMap[currentQIdx] = {
        answer: ans,
        explanation: inlineRest ? [inlineRest] : []
      };
      continue;
    }

    // Check for multiple answers in one line: "1. a  2. b  3. c"
    const multiMatches = [...p.matchAll(/(?:(?:^|\s+)(?:Q\.?\s*)?(\d+)[\.:\-\)\s]+(?:[\(\[]?([a-eA-E])[\)\]]?))/g)];
    if (multiMatches.length > 1) {
      for (const sm of multiMatches) {
        const qNum = parseInt(sm[1], 10);
        answersMap[(qNum - 1) + currentOffset] = { answer: sm[2].toLowerCase(), explanation: [] };
        lastSeenQNum = qNum;
      }
      continue;
    }

    // Accumulate explanation lines (including table header rows) for the current answer block
    if (currentQIdx !== -1 && answersMap[currentQIdx] && Array.isArray(answersMap[currentQIdx].explanation)) {
      answersMap[currentQIdx].explanation.push(p);
    }
  }

  // 2. Parse Questions & Options
  const questions = [];
  let currQ = [];
  let currOpts = [];
  let currFirstLine = "";   // the numbered line that started the current question
  let context = null;       // shared passage: "Directions (Q.1 to Q.3): ..." -> { from, to, left, lines }
  let collectingContext = false;
  const optRegex = /(?:\[([a-eA-E])\]|\(([a-eA-E])\)|(?:\b|^)([a-eA-E])[\.\)])/g;
  const NEW_Q_RE = /^(?:Q(?:uestion)?\s*[\.\-]?\s*\d+|\d+[\.\)])(?:\s*[\.\:\)\-]*\s*|\s+)/i;
  const DIRECTIONS_RE = /^Directions?\b[^:\n]{0,40}?(\d+)\s*(?:-|to)\s*(?:Q(?:uestions?)?\.?\s*)?(\d+)/i;
  // Short heading-like line: no sentence punctuation at the end, not a question
  const isTitleLike = (line) => line.length <= 80 && !/[.?:;,]$/.test(line) && !NEW_Q_RE.test(line);
  const questionNumber = (line) => {
    const m = String(line || "").match(/^(?:Q(?:uestion)?\s*[\.\-]?\s*)?(\d+)\s*[\.\):\-]/i);
    return m ? parseInt(m[1], 10) : null;
  };

  function finalizeCurrentQuestion() {
    if (currQ.length > 0 || currOpts.length > 0) {
      let cleanText = cleanMCQPrompt(currQ);
      // A shared passage / directions block belongs to every question of its range
      if (context) {
        const n = questionNumber(currFirstLine);
        const inRange = n !== null ? (n >= context.from && n <= context.to) : context.left > 0;
        if (inRange) cleanText = context.lines.join("\n") + (cleanText ? "\n" + cleanText : "");
        context.left--;
        if ((n !== null && n >= context.to) || context.left <= 0) context = null;
      }
      questions.push({
        id: makeId("mcq"),
        subject: defaultSubject,
        text: cleanText || "Imported Question",
        options: [...currOpts],
        correctAnswer: "",
        explanation: "",
        marks: 1.0,
        negativeMarks: 0.25
      });
      currQ = [];
      currOpts = [];
      currFirstLine = "";
    }
  }

  for (let idxP = 0; idxP < qParagraphs.length; idxP++) {
    const p = qParagraphs[idxP];

    if (idxP < 3 && (p.toLowerCase().includes("question bank") || p.toLowerCase() === "questions")) {
      continue;
    }

    // "Directions (Q.1 to Q.3): Read the passage..." starts a shared passage
    const dir = p.match(DIRECTIONS_RE);
    if (dir) {
      if (currOpts.length > 0) finalizeCurrentQuestion();
      currQ = currQ.filter(l => !isTitleLike(l));
      const from = parseInt(dir[1], 10);
      const to = parseInt(dir[2], 10);
      context = { from, to, left: Math.max(1, to - from + 1), lines: [p] };
      collectingContext = true;
      continue;
    }
    if (collectingContext) {
      const startsQ = NEW_Q_RE.test(p);
      const hasOpt = /\[[a-eA-E]\]|\([a-eA-E]\)/.test(p) || /^[a-eA-E][\.\)]\s/.test(p);
      if (!startsQ && !hasOpt) {
        context.lines.push(p);
        continue;
      }
      collectingContext = false;
      // Un-numbered question: its stem was read as the last line of the passage
      if (!startsQ && currQ.length === 0 && context.lines.length > 1) currQ.push(context.lines.pop());
    }

    // "Answer: (c)" / "Ans. b" - not "Answer each question..."
    const inlineAnsMatch = p.match(/^(?:(?:Correct\s+)?Answer|Ans|Correct\s*Option)\b\s*[:\.\-]?\s*[\(\[]?([a-eA-E])[\)\]]?(?=$|[\s.,;:)])/i);
    if (inlineAnsMatch) {
      if (currOpts.length > 0) finalizeCurrentQuestion();   // the question right above this line
      if (questions.length > 0) {
        questions[questions.length - 1].correctAnswer = inlineAnsMatch[1].toLowerCase();
      }
      continue;
    }

    // "Explanation: ..." / "Exp. ..." / "Note: ..." - not "Experts at..." / "Notes on ..."
    const explMatch = p.match(/^(?:Explanation|Exp|Solution|Notes?)\b\s*(?:[:\.\-]\s*|$)(.*)/i);
    if (explMatch) {
      if (currOpts.length > 0) finalizeCurrentQuestion();
      if (questions.length > 0) {
        questions[questions.length - 1].explanation = explMatch[1] || "";
      }
      continue;
    }

    // Detect if this line starts a new question
    const isNewQ = NEW_Q_RE.test(p);
    if (isNewQ && currOpts.length > 0) {
      finalizeCurrentQuestion();
    }
    // Title lines before the very first question ("Reasoning - Puzzle Practice") are not question text
    if (isNewQ && questions.length === 0 && !currFirstLine && currQ.length) currQ = currQ.filter(l => !isTitleLike(l));
    if (isNewQ && currOpts.length === 0) currFirstLine = p;

    // Find options
    const matches = [];
    let m;
    const re = new RegExp(optRegex);
    while ((m = re.exec(p)) !== null) {
      // Guard against Column A, Column B, Section B, Part B, Table B, etc. (whole words only:
      // "charitable [d]" or "unstable [b]" are real options)
      const prefix = p.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
      if (/\b(?:column|section|part|table|schedule|figure|group|row)\s+$/i.test(prefix)) {
        continue;
      }
      const label = (m[1] || m[2] || m[3]).toLowerCase();
      matches.push({ label, start: m.index, end: m.index + m[0].length });
    }

    if (matches.length > 0 && (currOpts.length > 0 || matches[0].label === "a")) {
      const beforeFirst = p.slice(0, matches[0].start).trim();
      if (beforeFirst) {
        currQ.push(beforeFirst);
      }

      for (let iM = 0; iM < matches.length; iM++) {
        const curM = matches[iM];
        const nextM = matches[iM + 1];
        const optVal = p.slice(curM.end, nextM ? nextM.start : p.length).trim();

        if (currOpts.some(o => o.label === curM.label)) {
          finalizeCurrentQuestion();
        }

        currOpts.push({ label: curM.label, text: optVal });
      }
    } else {
      if (currOpts.length >= 4) {
        finalizeCurrentQuestion();
      }
      currQ.push(p);
    }
  }

  finalizeCurrentQuestion();

  // Assign answers and explanations from answersMap to questions
  for (let qIdx = 0; qIdx < questions.length; qIdx++) {
    if (answersMap[qIdx]) {
      questions[qIdx].correctAnswer = answersMap[qIdx].answer;
      if (Array.isArray(answersMap[qIdx].explanation)) {
        questions[qIdx].explanation = answersMap[qIdx].explanation.join("\n").trim();
      } else if (typeof answersMap[qIdx].explanation === "string") {
        questions[qIdx].explanation = answersMap[qIdx].explanation;
      }
    }
  }

  return questions;
}

// Handle importing DOCX / PDF files for Phase 1
async function handleP1DocImport(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const statusElem = $("setup-p1-doc-status");
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

    // Only real MCQs (with options) are imported
    const parsedQuestions = parseMCQDocument(rawText, inferMCQSubject(rawText)).filter(q => (q.options || []).length >= 2);
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
    addImportedMCQs(parsedQuestions, file.name);
  } catch (err) {
    if (statusElem) {
      statusElem.textContent = "Error: " + err.message;
    }
    alert("File read error: " + err.message);
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

// Add imported MCQs to today's objective test
function addImportedMCQs(parsedQuestions, fileName) {
  const withAns = parsedQuestions.filter(q => q.correctAnswer).length;
  const subject = parsedQuestions[0] ? parsedQuestions[0].subject : "";

  state.p1_setup.questions = state.p1_setup.questions.concat(
    parsedQuestions.filter(q => !state.p1_setup.questions.some(sq => sq.text === q.text))
  );
  saveP1Setup();
  if (state.phase !== "phase1") setPhase("phase1");
  renderP1SetupList();
  showScreen("setup");
  const statusElem = $("setup-p1-doc-status");
  if (statusElem) {
    statusElem.classList.remove("is-error");
    statusElem.textContent = `Imported ${parsedQuestions.length} MCQs (${subject}) from ${fileName}: ${withAns} with answer key.`;
    setTimeout(() => { statusElem.textContent = ""; }, 6000);
  }
}

// Render the Phase-1 setup questions list
function renderP1SetupList() {
  const list = $("setup-p1-question-list");
  const countElem = $("setup-p1-count");
  if (!list) return;

  const questions = state.p1_setup.questions || [];
  if (countElem) countElem.textContent = questions.length;

  // Show the saved test settings (they used to reset to 120 / 1.00 / 0.25 on every load)
  const minEl = $("setup-p1-minutes");
  const posEl = $("setup-p1-positive");
  const negEl = $("setup-p1-negative");
  if (minEl && document.activeElement !== minEl) minEl.value = state.p1_setup.totalMinutes || 120;
  if (posEl && document.activeElement !== posEl) posEl.value = Number(state.p1_setup.positiveMarks ?? 1).toFixed(2);
  if (negEl && document.activeElement !== negEl) negEl.value = Number(state.p1_setup.negativeMarks ?? 0.25).toFixed(2);

  const p1Batch = $("setup-p1-batch-actions");
  if (p1Batch) p1Batch.style.display = questions.length > 0 ? "flex" : "none";

  if (questions.length === 0) {
    list.innerHTML = `<li class="empty-list-placeholder">No MCQs added yet. Upload a document (DOCX/PDF) or add MCQs manually to begin.</li>`;
    renderPaginationControls({
      containerId: "setup-p1-pagination",
      currentPage: 1,
      totalPages: 0,
      totalItems: 0,
      onPageChange: () => {}
    });
    updateP1SetupBatchDeleteState();
    return;
  }

  const PAGE_SIZE = 50;
  const totalItems = questions.length;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
  if (state.p1_setup_page > totalPages) state.p1_setup_page = totalPages;
  if (state.p1_setup_page < 1) state.p1_setup_page = 1;

  const startIndex = (state.p1_setup_page - 1) * PAGE_SIZE;
  const pageQuestions = questions.slice(startIndex, startIndex + PAGE_SIZE);

  list.innerHTML = pageQuestions.map((q, localIdx) => {
    const globalIdx = startIndex + localIdx;
    const optsPreview = (q.options || []).map(o => {
      const isKey = q.correctAnswer && q.correctAnswer.toLowerCase() === o.label.toLowerCase();
      return `<span class="opt-pill ${isKey ? 'is-correct' : ''}"><strong>[${escapeHTML(String(o.label).toUpperCase())}]</strong> ${escapeHTML(o.text || "")}</span>`;
    }).join("");

    return `
      <li>
        <input type="checkbox" class="p1-q-select-check" data-id="${escapeHTML(q.id)}" aria-label="Select MCQ ${globalIdx + 1}" style="margin-top:4px;">
        <div style="flex:1; min-width:0;">
          <div class="p1-q-meta-badges">
            <span class="badge-subject">${escapeHTML(q.subject || "General Awareness")}</span>
            ${q.topic ? `<span style="font-size:11px; color:var(--muted);">${escapeHTML(q.topic)}</span>` : ""}
            ${q.correctAnswer ? `<span class="badge-ans">Key: [${escapeHTML(String(q.correctAnswer).toUpperCase())}]</span>` : ""}
            <span class="q-num">Q${globalIdx + 1}</span>
          </div>
          <div class="p1-question-full-text">${escapeHTML(q.text || "")}</div>
          <div class="p1-opts-preview">${optsPreview}</div>
        </div>
        <div class="q-actions">
          <button type="button" class="q-act btn-p1-move-up" data-index="${globalIdx}" title="Move up" aria-label="Move up" ${globalIdx === 0 ? "disabled" : ""}>▲</button>
          <button type="button" class="q-act btn-p1-move-down" data-index="${globalIdx}" title="Move down" aria-label="Move down" ${globalIdx === questions.length - 1 ? "disabled" : ""}>▼</button>
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
  state.p1_setup.questions = [];
  saveP1Setup();
  renderP1SetupList();
}

// Add a manual MCQ to Phase-1 Setup
function handleP1QuestionFormSubmit(e) {
  e.preventDefault();
  const subject = $("p1-q-subject").value || "General Awareness";
  const topic = ($("p1-q-topic").value || "").trim();
  const text = $("p1-q-text").value.trim();
  const optA = ($("p1-q-opt-a").value || "").trim();
  const optB = ($("p1-q-opt-b").value || "").trim();
  const optC = ($("p1-q-opt-c").value || "").trim();
  const optD = ($("p1-q-opt-d").value || "").trim();
  const optE = ($("p1-q-opt-e").value || "").trim();
  const correct = ($("p1-q-correct").value || "a").toLowerCase();
  const explanation = ($("p1-q-explanation").value || "").trim();


  if (!text) {
    alert("Please enter the question statement.");
    return;
  }
  if (!optA || !optB || !optC || !optD) {
    alert("Please provide at least options A, B, C, and D.");
    return;
  }
  if (correct === "e" && !optE) {
    alert("The correct answer is [E], but option E is empty. Fill option E or choose another answer.");
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

  const newMCQ = {
    id: makeId("mcq"),
    subject,
    topic,
    text,
    options,
    correctAnswer: correct,
    explanation,
    marks: pos,
    negativeMarks: neg
  };

  state.p1_setup.questions.push(newMCQ);
  saveP1Setup();



  $("p1-question-form").reset();
  renderP1SetupList();
  const p1Err = $("setup-p1-error");
  if (p1Err) p1Err.textContent = "";
  const addBtn = $("btn-add-p1-question");
  if (addBtn) {
    addBtn.textContent = "Added";
    setTimeout(() => { addBtn.textContent = "Add MCQ to Test"; }, 1500);
  }
  $("p1-q-text")?.focus();
}

// Start the Phase-1 objective exam
function startP1Exam() {
  const errElem = $("setup-p1-error");
  if (errElem) errElem.textContent = "";

  if (!state.p1_setup.questions || state.p1_setup.questions.length === 0) {
    if (errElem) errElem.textContent = "Please add at least one MCQ before starting the test.";
    return;
  }

  const minutes = readNumberInput("setup-p1-minutes", 0, 0);
  const pos = readNumberInput("setup-p1-positive", 1.0, 0);
  const neg = readNumberInput("setup-p1-negative", 0.25, 0);
  if (!minutes || minutes < 1) {
    if (errElem) errElem.textContent = "Total time must be at least 1 minute.";
    return;
  }
  if (pos <= 0) {
    if (errElem) errElem.textContent = "Marks for a correct answer must be more than 0.";
    return;
  }
  const noKey = state.p1_setup.questions.filter(q => !q.correctAnswer).length;
  if (noKey > 0 && !confirm(`${noKey} MCQ(s) have no answer key, so they cannot be scored. Start anyway?`)) {
    return;
  }

  state.p1_setup.totalMinutes = minutes;
  state.p1_setup.positiveMarks = pos;
  state.p1_setup.negativeMarks = neg;
  saveP1Setup();

  const questions = state.p1_setup.questions.map(q => ({
    ...q,
    marks: pos,
    negativeMarks: neg
  }));

  const test = {
    id: makeId("test_p1"),
    date: Date.now(),
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
  if (qText) qText.textContent = q.text;

  const currentAnswer = state.p1_test.answers[index];
  const optsContainer = $("p1-exam-options-list");
  if (optsContainer) {
    optsContainer.innerHTML = (q.options || []).map(opt => {
      const isSelected = (currentAnswer && currentAnswer.toLowerCase() === opt.label.toLowerCase());
      return `
        <div class="mcq-option-item ${isSelected ? 'selected' : ''}" data-label="${escapeHTML(opt.label)}" role="button" tabindex="0" aria-pressed="${isSelected}">
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
  if (window.innerWidth < 900) {
    const qBox = $("p1-exam-qpos");
    if (qBox && qBox.getBoundingClientRect().top < 0) qBox.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// Select an option for active question
function selectP1Option(optLabel) {
  if (!state.p1_test) return;
  const idx = state.p1_currentIndex;
  state.p1_test.answers[idx] = optLabel.toLowerCase();

  if (state.p1_test.statuses[idx] === "review") {
    state.p1_test.statuses[idx] = "answered-review";
  } else {
    state.p1_test.statuses[idx] = "answered";
  }

  document.querySelectorAll("#p1-exam-options-list .mcq-option-item").forEach(item => {
    const isSel = item.dataset.label.toLowerCase() === optLabel.toLowerCase();
    item.classList.toggle("selected", isSel);
    item.setAttribute("aria-pressed", String(isSel));
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
    const correctAns = (q.correctAnswer || "").toLowerCase().trim();

    if (!ans) {
      unattemptedCount++;
    } else if (ans.toLowerCase().trim() === correctAns) {
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
  if ($("p1-stat-time")) $("p1-stat-time").textContent = formatDuration(test.timeSpent || 0);

  // Filter counts + always start on "All questions"
  const total = (test.questions || []).length;
  if ($("rf-count-all")) $("rf-count-all").textContent = total;
  if ($("rf-count-correct")) $("rf-count-correct").textContent = test.correctCount || 0;
  if ($("rf-count-incorrect")) $("rf-count-incorrect").textContent = test.incorrectCount || 0;
  if ($("rf-count-unattempted")) $("rf-count-unattempted").textContent = test.unattemptedCount || 0;
  state.p1_resultFilter = "all";
  document.querySelectorAll("#screen-result-p1 .rf-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.filter === "all");
  });

  renderP1ResultReviewList();
}

// Render list of question review cards with filters
function renderP1ResultReviewList() {
  const container = $("p1-result-list");
  if (!container || !state.p1_lastResultTest) return;

  const test = state.p1_lastResultTest;
  const filter = state.p1_resultFilter || "all";
  const cardsHtml = [];

  for (let i = 0; i < test.questions.length; i++) {
    const q = test.questions[i];
    const userAns = test.answers[i] ? test.answers[i].toLowerCase().trim() : null;
    const correctAns = q.correctAnswer ? q.correctAnswer.toLowerCase().trim() : "";

    const isUnattempted = !userAns;
    const isCorrect = userAns && correctAns && (userAns === correctAns);
    const isIncorrect = userAns && (!correctAns || userAns !== correctAns);

    if (filter === "correct" && !isCorrect) continue;
    if (filter === "incorrect" && !isIncorrect) continue;
    if (filter === "unattempted" && !isUnattempted) continue;

    const cardStatusClass = isCorrect ? "correct" : isIncorrect ? "incorrect" : "unattempted";
    const statusBadge = isCorrect
      ? `<span style="background:#dcfce7; color:#166534; padding:3px 8px; border-radius:4px; font-weight:700; font-size:12px;">Correct (+${(test.positiveMarks || 1).toFixed(2)})</span>`
      : isIncorrect
      ? `<span style="background:#fee2e2; color:#991b1b; padding:3px 8px; border-radius:4px; font-weight:700; font-size:12px;">Incorrect (-${(test.negativeMarks || 0.25).toFixed(2)})</span>`
      : `<span style="background:#f1f5f9; color:#475569; padding:3px 8px; border-radius:4px; font-weight:700; font-size:12px;">Unattempted (0.00)</span>`;

    const optionsHtml = (q.options || []).map(opt => {
      const optLabel = opt.label.toLowerCase().trim();
      const isChosen = (userAns === optLabel);
      const isActualCorrect = (correctAns === optLabel);

      let optClass = "rev-opt";
      let badge = "";

      if (isChosen && isActualCorrect) {
        optClass += " is-correct-opt";
        badge = `<span style="margin-left:auto; font-size:11px; font-weight:700; color:#15803d;">Your answer · correct</span>`;
      } else if (isChosen && !isActualCorrect) {
        optClass += " chosen-wrong";
        badge = `<span style="margin-left:auto; font-size:11px; font-weight:700; color:#b91c1c;">Your answer · incorrect</span>`;
      } else if (!isChosen && isActualCorrect) {
        optClass += " is-correct-opt";
        badge = `<span style="margin-left:auto; font-size:11px; font-weight:700; color:#15803d;">Correct answer</span>`;
      }

      return `
        <div class="${optClass}">
          <span style="font-weight:700; min-width:24px;">[${escapeHTML(String(opt.label).toUpperCase())}]</span>
          <span>${escapeHTML(opt.text)}</span>
          ${badge}
        </div>
      `;
    }).join("");

    cardsHtml.push(`
      <div class="mcq-review-card ${cardStatusClass}">
        <div class="review-card-header">
          <div>
            <strong>Question ${i + 1}</strong>
            <span style="margin-left:8px; font-size:12px; color:var(--muted);">[${escapeHTML(q.subject || "General Awareness")}]</span>
          </div>
          <div>${statusBadge}</div>
        </div>
        <div class="review-card-prompt">${escapeHTML(q.text)}</div>
        <div class="review-options-list">${optionsHtml}</div>
        ${q.explanation ? `<div class="rev-explanation"><strong>Explanation:</strong> ${escapeHTML(q.explanation)}</div>` : ""}
      </div>
    `);
  }

  if (cardsHtml.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--muted);">No questions match the "${filter}" filter.</div>`;
  } else {
    container.innerHTML = cardsHtml.join("");
  }
}

// Download text file with Phase-1 exam scorecard and questions review
function downloadP1Result(test) {
  if (!test) return;

  const lines = [
    "============================================================",
    "          RBI GRADE B - PHASE 1 OBJECTIVE TEST REPORT        ",
    "============================================================",
    `Date: ${new Date(test.date || test.completedAt).toLocaleString()}`,
    `Total Time Spent: ${formatDuration(test.timeSpent || 0)}`,
    `Total Questions: ${test.questions.length}`,
    `Net Score: ${test.score.toFixed(2)} / ${test.maxScore.toFixed(2)}`,
    `Accuracy: ${test.accuracy}%`,
    `Correct: ${test.correctCount} | Incorrect: ${test.incorrectCount} | Unattempted: ${test.unattemptedCount}`,
    "============================================================\n",
    "--- DETAILED QUESTIONS REVIEW ---\n"
  ];

  test.questions.forEach((q, idx) => {
    const userAns = test.answers[idx] ? test.answers[idx].toUpperCase() : "NONE";
    const correctAns = q.correctAnswer ? q.correctAnswer.toUpperCase() : "N/A";
    const status = !test.answers[idx] ? "UNATTEMPTED" : userAns === correctAns ? "CORRECT" : "INCORRECT";

    lines.push(`Q${idx + 1}: ${q.text}`);
    (q.options || []).forEach(o => {
      lines.push(`   [${o.label.toUpperCase()}] ${o.text}`);
    });
    lines.push(`   Candidate Answer: ${userAns}`);
    lines.push(`   Correct Answer:   ${correctAns}`);
    lines.push(`   Status:           ${status}`);
    if (q.explanation) {
      lines.push(`   Explanation:      ${q.explanation}`);
    }
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
    listElem.innerHTML = `<div class="empty-state">No objective tests yet. Finish a test from <strong>New Test</strong> and it will appear here.</div>`;
    return;
  }

  const totalTests = history.length;
  const avgScore = (history.reduce((acc, t) => acc + (t.score || 0), 0) / totalTests).toFixed(2);
  const avgAccuracy = (history.reduce((acc, t) => acc + (t.accuracy || 0), 0) / totalTests).toFixed(1);
  const totalSolved = history.reduce((acc, t) => acc + ((t.correctCount || 0) + (t.incorrectCount || 0)), 0);

  if (statsElem) {
    statsElem.innerHTML = `
      <div class="stat-pill"><span>Total Tests:</span> <strong>${totalTests}</strong></div>
      <div class="stat-pill"><span>Avg Score:</span> <strong>${avgScore}</strong></div>
      <div class="stat-pill"><span>Avg Accuracy:</span> <strong>${avgAccuracy}%</strong></div>
      <div class="stat-pill"><span>MCQs Solved:</span> <strong>${totalSolved}</strong></div>
    `;
  }

  listElem.innerHTML = history.map(t => {
    const dateStr = new Date(t.date || t.completedAt).toLocaleString();
    return `
      <div class="history-card" style="background:var(--card); border:1px solid var(--border); border-radius:8px; padding:16px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
          <div>
            <strong>${dateStr}</strong>
            <span style="margin-left:8px; font-size:12px; color:var(--muted);">(${t.questions.length} Questions)</span>
          </div>
          <div>
            <span style="font-size:16px; font-weight:700; color:#003366;">${t.score.toFixed(2)} / ${t.maxScore.toFixed(2)}</span>
            <span style="margin-left:8px; font-size:13px; font-weight:600; color:#15803d;">(${t.accuracy}% Acc)</span>
          </div>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px 12px; font-size:13px; color:var(--muted); margin-bottom:10px;">
          <span><i class="dot dot-ok"></i>Correct <strong>${t.correctCount}</strong></span>
          <span><i class="dot dot-bad"></i>Incorrect <strong>${t.incorrectCount}</strong></span>
          <span><i class="dot dot-none"></i>Unattempted <strong>${t.unattemptedCount}</strong></span>
          <span>Time <strong>${formatDuration(t.timeSpent || 0)}</strong></span>
        </div>
        <div style="display:flex; gap:8px;">
          <button type="button" class="btn-p1-history-review" data-id="${t.id}" style="padding:6px 14px; font-size:13px;">Review Test &amp; Questions</button>
          <button type="button" class="danger btn-p1-history-delete" data-id="${t.id}" style="padding:6px 12px; font-size:13px;">Delete</button>
        </div>
      </div>
    `;
  }).join("");
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
  renderP1History();
}

// Clear all Phase-1 History
function clearP1History() {
  const history = loadJSON("rbi_p1_history", []);
  if (history.length === 0) return;
  if (!confirm("Are you sure you want to delete all Phase-1 test history?")) return;
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
    examAnswer.addEventListener("paste", handlePasteOrDrop);
    examAnswer.addEventListener("drop", handlePasteOrDrop);
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

  // Phase-1 Setup Events
  const p1Form = $("p1-question-form");
  if (p1Form) {
    p1Form.addEventListener("submit", handleP1QuestionFormSubmit);
  }

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

      const upBtn = e.target.closest(".btn-p1-move-up");
      if (upBtn) {
        const idx = Number(upBtn.dataset.index);
        if (idx > 0) {
          const temp = state.p1_setup.questions[idx];
          state.p1_setup.questions[idx] = state.p1_setup.questions[idx - 1];
          state.p1_setup.questions[idx - 1] = temp;
          saveP1Setup();
          renderP1SetupList();
        }
        return;
      }

      const downBtn = e.target.closest(".btn-p1-move-down");
      if (downBtn) {
        const idx = Number(downBtn.dataset.index);
        if (idx < state.p1_setup.questions.length - 1) {
          const temp = state.p1_setup.questions[idx];
          state.p1_setup.questions[idx] = state.p1_setup.questions[idx + 1];
          state.p1_setup.questions[idx + 1] = temp;
          saveP1Setup();
          renderP1SetupList();
        }
        return;
      }
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
  checkResumeActiveTest();
});
