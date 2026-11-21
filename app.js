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
  if (name === "setup" || name === "exam" || name === "result" || name === "bank" || name === "history" || name === "calendar") {
    targetId = state.phase === "phase1" ? `screen-${name}-p1` : (name === "calendar" ? "screen-calendar-p2" : `screen-${name}`);
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

  if (name === "calendar" || name === "calendar-p1" || name === "calendar-p2") {
    if (state.phase === "phase1") {
      renderP1Calendar();
    } else {
      renderP2Calendar();
    }
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
    button.textContent = "Copied ✓";
    setTimeout(() => button.textContent = old, 1500);
  }
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
  bank_page: 1,        // current page for Phase 2 question bank list

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
  p1_setup_page: 1,    // current page for Phase 1 setup questions list
  p1_bank_page: 1,     // current page for Phase 1 question bank list

  // Calendar & Study Schedule State
  calendar: loadJSON("rbi_study_schedule", null),
  calendar_planStartDate: loadJSON("rbi_calendar_start_date", "2026-11-01"),
  calendar_currentDate: new Date(),
  calendar_selectedDate: getLocalDateString(new Date()),
  calendar_filterPhase: "all",
  calendar_filterStatus: "all",
  calendar_filterDayType: "all",
  calendar_view: "month",
  calendar_day_metadata: {},

  // Phase-1 Dedicated Calendar State
  p1_calendar_currentDate: new Date(),
  p1_calendar_selectedDate: getLocalDateString(new Date()),
  p1_calendar_view: "month",
  p1_calendar_filterDayType: "all",
  p1_calendar_filterStatus: "all",
  p1_calendar_daysFinished: loadJSON("rbi_p1_days_finished", 0),

  // Phase-2 Dedicated Calendar State
  p2_calendar_currentDate: new Date(),
  p2_calendar_selectedDate: getLocalDateString(new Date()),
  p2_calendar_view: "month",
  p2_calendar_filterDayType: "all",
  p2_calendar_filterStatus: "all",
  p2_calendar_daysFinished: loadJSON("rbi_p2_days_finished", 0)
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
        <button type="button" class="pagination-nav-btn prev" ${currentPage === 1 ? 'disabled' : ''}>◀ Prev</button>
        <div class="pagination-pages">${pagesHtml}</div>
        <button type="button" class="pagination-nav-btn next" ${currentPage === totalPages ? 'disabled' : ''}>Next ▶</button>
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

  const navCalendar = $("nav-calendar");
  if (navCalendar) {
    navCalendar.textContent = (state.phase === "phase1") ? "📅 Phase-1 Calendar" : "📅 Phase-2 Calendar";
  }

  // Detect current active screen to stay on the same screen context
  const curScreen = document.querySelector(".screen:not([hidden])");
  let activeScreenType = "setup";
  if (curScreen && curScreen.id) {
    const sid = String(curScreen.id);
    if (sid.includes("calendar")) activeScreenType = "calendar";
    else if (sid.includes("history")) activeScreenType = "history";
    else if (sid.includes("bank")) activeScreenType = "bank";
  }

  if (state.phase === "phase1") {
    if (activeScreenType === "calendar") renderP1Calendar();
    else if (activeScreenType === "history") renderP1History();
    else if (activeScreenType === "bank") renderP1Bank();
    else renderP1SetupList();
  } else {
    if (activeScreenType === "calendar") renderP2Calendar();
    else if (activeScreenType === "history") renderHistory();
    else if (activeScreenType === "bank") renderBank();
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
  $("btn-add-question").textContent = "Add question";
  $("setup-error").textContent = "";
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

// Delete all questions stored in Question Bank after confirmation
function handleClearAllBank() {
  const bank = loadJSON("rbi_question_bank", []);
  if (bank.length === 0) {
    alert("Question bank is already empty.");
    return;
  }
  if (confirm(`Permanently delete all ${bank.length} question(s) from Question Bank? This cannot be undone.`)) {
    saveJSON("rbi_question_bank", []);
    renderBank();
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
  if (minutesInput) {
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
            <span style="font-size:11px; color:var(--muted); margin-left:auto;">Q${globalIdx + 1}</span>
          </div>
          <div style="margin-top: 4px; white-space: pre-wrap; line-height: 1.5; font-weight: 500;">${escapeHTML(q.text)}</div>
        </div>
        <div class="q-actions">
          ${globalIdx > 0 ? `<button type="button" class="btn-move-up" data-action="move-up" data-id="${escapeHTML(q.id)}">▲</button>` : ""}
          ${globalIdx < questions.length - 1 ? `<button type="button" class="btn-move-down" data-action="move-down" data-id="${escapeHTML(q.id)}">▼</button>` : ""}
          <button type="button" class="btn-edit" data-action="edit" data-id="${escapeHTML(q.id)}">Edit</button>
          <button type="button" class="btn-delete danger" data-action="delete" data-id="${escapeHTML(q.id)}">✕</button>
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
  const acc = $("p2-manual-accordion");
  if (acc) acc.open = true;
  $("q-paper").value = q.paper || "ESI";
  $("q-topic").value = q.topic || "";
  $("q-text").value = q.text || "";
  $("q-marks").value = q.marks || 10;
  $("q-wordlimit").value = q.wordLimit || defaultWordLimit(q.marks || 10);
  $("q-model").value = q.modelAnswer || "";
  $("q-edit-id").value = q.id;
  $("btn-add-question").textContent = "Update question";
  $("question-form").scrollIntoView({ behavior: "smooth" });
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
  const wordLimit = Number($("q-wordlimit").value) || defaultWordLimit(marks);
  const modelAnswer = $("q-model").value.trim();
  const editId = $("q-edit-id").value;
  const saveToBank = $("q-save-bank").checked;

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

  if (saveToBank) {
    const bank = loadJSON("rbi_question_bank", []);
    const bankIndex = bank.findIndex(item => item.id === questionObj.id);
    if (bankIndex >= 0) {
      bank[bankIndex] = JSON.parse(JSON.stringify(questionObj));
    } else {
      bank.push(JSON.parse(JSON.stringify(questionObj)));
    }
    saveJSON("rbi_question_bank", bank);
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
  $("exam-marks").textContent = `Marks: ${q.marks}.00 · Word Limit: ${q.wordLimit}`;
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
    btnNext.textContent = (index === totalQ - 1) ? "Save Answer" : "Save & Next ▶";
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

  const legAns = document.querySelector(".legend-badge.answered"); if (legAns) legAns.textContent = answered;
  const legNotAns = document.querySelector(".legend-badge.not-answered"); if (legNotAns) legNotAns.textContent = notAnswered;
  const legNotVis = document.querySelector(".legend-badge.not-visited"); if (legNotVis) legNotVis.textContent = notVisited;
  const legRev = document.querySelector(".legend-badge.review"); if (legRev) legRev.textContent = markedReview;

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

  storeCurrentAnswer();
  if (!state.test) return;

  const test = state.test;
  test.autoSubmitted = !!auto;
  const elapsed = Math.round((Date.now() - new Date(test.date).getTime()) / 1000);
  test.usedSeconds = Math.min(test.totalMinutes * 60, Math.max(0, elapsed));
  test.maxMarks = (test.questions || []).reduce((acc, q) => acc + (Number(q.marks) || 10), 0);
  test.scores = test.scores || {};

  const history = loadJSON("rbi_history", []);
  history.unshift(test);
  saveJSON("rbi_history", history);

  if (typeof autoCompleteDailyQuestOnExam === "function") {
    autoCompleteDailyQuestOnExam("phase2", test);
  }
  if (typeof renderP2Calendar === "function") {
    renderP2Calendar();
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

  if (typeof renderP2Calendar === "function") {
    renderP2Calendar();
  }
}// Check for and resume an interrupted test on page load
function checkResumeActiveTest() {
  const p1Active = loadJSON("rbi_p1_active_test", null);
  const p2Active = loadJSON("rbi_active_test", null);
  const now = Date.now();

  if (p1Active && p1Active.endTime) {
    state.p1_test = p1Active;
    state.p1_endTime = p1Active.endTime;
    if (p1Active.endTime > now) {
      if (confirm("You have a Phase-1 objective test in progress. Resume it?")) {
        setPhase("phase1");
        startP1ExamTimer();
        showP1Question(state.p1_test.currentIndex || 0);
        renderP1Palette();
        updateP1ExamSummary();
        showScreen("exam");
        return;
      } else {
        localStorage.removeItem("rbi_p1_active_test");
        state.p1_test = null;
      }
    } else {
      alert("Your previous Phase-1 test session has expired.");
      setPhase("phase1");
      finishP1Test(true);
      return;
    }
  }

  if (p2Active && p2Active.endTime) {
    state.test = p2Active;
    state.endTime = p2Active.endTime;
    if (p2Active.endTime > now) {
      if (confirm("You have a Phase-2 descriptive test in progress. Resume it?")) {
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
        <h3 class="${headingClass}">Q${idx + 1} · ${escapeHTML(q.paper)} · ${escapeHTML(q.marks)} marks · ${wc}/${limit} words</h3>
        <div class="actions">
          <button type="button" class="btn-copy-card" data-idx="${idx}">Copy</button>
          <button type="button" class="btn-download-card" data-idx="${idx}">Download .txt</button>
          <button type="button" class="btn-toggle-model secondary" data-idx="${idx}">Show model answer</button>
        </div>
      </div>
      <div class="model-comparison-box" hidden id="model-box-${idx}">
        <strong>Model Answer:</strong>
        <p>${escapeHTML(q.modelAnswer ? q.modelAnswer.trim() : "No model answer provided.")}</p>
        <strong>Your Answer:</strong>
        <p>${escapeHTML(ans.text ? ans.text.trim() : "[No answer written]")}</p>
      </div>
      <pre class="txt-preview"></pre>
    `;

    card.querySelector(".txt-preview").textContent = fullPromptText;
    list.appendChild(card);
  });
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
      <div class="stat-label">Daily Streak</div>
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

  if (history.length === 0) {
    listElem.innerHTML = "<p>No tests yet. Start your first practice!</p>";
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
            <button type="button" class="btn-copy-history" data-test-id="${escapeHTML(t.id)}" data-idx="${idx}">Copy</button>
            <button type="button" class="btn-download-history" data-test-id="${escapeHTML(t.id)}" data-idx="${idx}">Download</button>
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
              <span>✍️ My Written Answer (${ans.wordCount || 0} words)</span>
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
        </div>
      `;
    });

    const scoreBadge = hasAnyScore
      ? `<span class="popover-type-badge normal-day" style="font-size:12px; font-weight:700; margin-left:6px;">🏆 Score: ${totalScore.toFixed(1)} / ${totalMax} Marks</span>`
      : `<span style="font-size:11.5px; color:var(--muted); margin-left:6px;">(${totalWords} words written · Pending score)</span>`;

    card.innerHTML = `
      <div class="history-card-header">
        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
          <strong>${escapeHTML(dateStr)}</strong> - ${t.questions.length} question(s) · Time used: ${usedStr} of ${totalMin} min${autoNote}
          ${scoreBadge}
        </div>
        <div class="actions">
          <button type="button" class="btn-toggle-answer-review" data-test-id="${escapeHTML(t.id)}">📖 Review Answers &amp; Marks</button>
          <button type="button" class="btn-open-results" data-test-id="${escapeHTML(t.id)}">Open results</button>
          <button type="button" class="btn-retake secondary" data-test-id="${escapeHTML(t.id)}">Retake</button>
          <button type="button" class="btn-delete-test danger" data-test-id="${escapeHTML(t.id)}">Delete</button>
        </div>
      </div>
      <table class="history-table">
        <thead>
          <tr>
            <th>Q#</th>
            <th>Paper</th>
            <th>Marks</th>
            <th>Words</th>
            <th>Score (input)<br><small style="font-weight:normal;color:var(--muted);">Paste AI's SCORE_LOG</small></th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>
      <div class="test-answers-review-container" id="review-container-${escapeHTML(t.id)}" style="display: none;">
        <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #003366; display: flex; align-items: center; justify-content: space-between;">
          <span>📝 Candidate Written Answers &amp; Evaluation</span>
          <span style="font-size: 12px; font-weight: normal; color: var(--muted);">${totalWords} total words</span>
        </h4>
        ${reviewCardsHTML}
      </div>
    `;

    listElem.appendChild(card);
  });
}

// Update and persist a candidate score assigned to a specific historical question
function handleScoreChange(testId, qid, newScoreVal) {
  const history = loadJSON("rbi_history", []);
  const test = history.find(t => t.id === testId);
  if (!test) return;

  if (!test.scores) test.scores = {};
  if (newScoreVal === "" || newScoreVal === null || isNaN(newScoreVal)) {
    test.scores[qid] = null;
  } else {
    test.scores[qid] = Math.max(0, Number(newScoreVal));
  }

  test.totalScore = Object.values(test.scores).reduce((a, b) => a + (Number(b) || 0), 0);
  saveJSON("rbi_history", history);
  renderHistoryStats(history);

  // Sync inputs with same testId and qid (table and expanded review)
  document.querySelectorAll(`.score-input[data-test-id="${testId}"][data-qid="${qid}"]`).forEach(inp => {
    inp.value = (test.scores[qid] !== null && test.scores[qid] !== undefined) ? test.scores[qid] : "";
  });

  // Re-render Phase-2 calendar to reflect updated marks badge immediately!
  if (state.phase === "phase2") {
    renderP2Calendar();
  }
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
    renderHistory();
    if (typeof renderP2Calendar === "function") renderP2Calendar();
  }
}

// Permanently delete all test history after two-step verification
function clearAllHistory() {
  if (confirm("Are you sure you want to delete all practice history? This cannot be undone.")) {
    const confirmation = prompt("Type DELETE to confirm");
    if (confirmation === "DELETE") {
      localStorage.removeItem("rbi_history");
      renderHistory();
      if (typeof renderP2Calendar === "function") renderP2Calendar();
    }
  }
}

// Update the visibility and count of the bank batch delete and add buttons based on checkbox selection
function updateBankBatchState() {
  const checkboxes = document.querySelectorAll("#bank-list .bank-select-check");
  const checked = document.querySelectorAll("#bank-list .bank-select-check:checked");
  const count = checked.length;

  const countElem = $("bank-selected-count");
  if (countElem) countElem.textContent = count;

  const addCountElem = $("bank-add-selected-count");
  if (addCountElem) addCountElem.textContent = count;

  const btnDeleteSelected = $("btn-bank-delete-selected");
  if (btnDeleteSelected) {
    btnDeleteSelected.style.display = count > 0 ? "inline-block" : "none";
  }

  const btnAddSelected = $("btn-bank-add-selected");
  if (btnAddSelected) {
    btnAddSelected.style.display = count > 0 ? "inline-block" : "none";
  }

  const selectAll = $("bank-select-all");
  if (selectAll) {
    selectAll.checked = checkboxes.length > 0 && count === checkboxes.length;
    selectAll.indeterminate = count > 0 && count < checkboxes.length;
  }
}

// Toggle selection of all question checkboxes in the bank list
function handleSelectAllBank(event) {
  const checked = event.target.checked;
  const checkboxes = document.querySelectorAll("#bank-list .bank-select-check");
  checkboxes.forEach(cb => { cb.checked = checked; });
  updateBankBatchState();
}

// Delete all questions currently checked in the question bank list
function handleDeleteSelectedBank() {
  const checked = document.querySelectorAll("#bank-list .bank-select-check:checked");
  const idsToDelete = new Set(Array.from(checked).map(cb => cb.dataset.id));
  if (idsToDelete.size === 0) return;

  if (confirm(`Permanently delete ${idsToDelete.size} selected question(s) from Question Bank? This cannot be undone.`)) {
    let bank = loadJSON("rbi_question_bank", []);
    bank = bank.filter(q => !idsToDelete.has(q.id));
    saveJSON("rbi_question_bank", bank);
    renderBank();
  }
}

// Add all questions currently checked in the question bank into today's test setup
function handleAddSelectedBank() {
  const checked = document.querySelectorAll("#bank-list .bank-select-check:checked");
  const idsToAdd = new Set(Array.from(checked).map(cb => cb.dataset.id));
  if (idsToAdd.size === 0) return;

  const bank = loadJSON("rbi_question_bank", []);
  let addedCount = 0;
  bank.forEach(q => {
    if (idsToAdd.has(q.id)) {
      if (!state.setup.questions.some(sq => sq.id === q.id)) {
        state.setup.questions.push(JSON.parse(JSON.stringify(q)));
        addedCount++;
      }
    }
  });

  if (addedCount > 0) {
    saveSetup();
    renderSetupList();
    alert(`Added ${addedCount} question(s) to today's test.`);
  } else {
    alert("All selected questions are already in today's test.");
  }
  updateBankBatchState();
}

// Render the questions stored in the question bank based on search and paper filters
function renderBank() {
  const bank = loadJSON("rbi_question_bank", []);
  const listElem = $("bank-list");
  if (!listElem) return;

  const paperFilter = $("bank-filter-paper") ? $("bank-filter-paper").value : "";
  const searchText = $("bank-search") ? $("bank-search").value.trim().toLowerCase() : "";

  const filtered = bank.filter(q => {
    if (paperFilter && q.paper !== paperFilter) return false;
    if (searchText) {
      const matchText = (q.text || "").toLowerCase().includes(searchText);
      const matchTopic = (q.topic || "").toLowerCase().includes(searchText);
      if (!matchText && !matchTopic) return false;
    }
    return true;
  });

  const batchActions = $("bank-batch-actions");
  if (batchActions) {
    batchActions.style.display = filtered.length > 0 ? "flex" : "none";
  }

  const bankTotalInfo = $("bank-total-info");
  if (bankTotalInfo) {
    bankTotalInfo.textContent = filtered.length === bank.length
      ? `${bank.length} questions`
      : `Showing ${filtered.length} of ${bank.length} questions`;
  }

  listElem.innerHTML = "";

  if (filtered.length === 0) {
    listElem.innerHTML = "<p>No questions found matching your filter.</p>";
    renderPaginationControls({
      containerId: "bank-pagination",
      currentPage: 1,
      totalPages: 0,
      totalItems: 0,
      onPageChange: () => {}
    });
    updateBankBatchState();
    return;
  }

  const PAGE_SIZE = 50;
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
  if (state.bank_page > totalPages) state.bank_page = totalPages;
  if (state.bank_page < 1) state.bank_page = 1;

  const startIndex = (state.bank_page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  pageItems.forEach((q, localIdx) => {
    const globalIdx = startIndex + localIdx;
    const card = document.createElement("div");
    card.className = "bank-card";

    const modelNote = (q.modelAnswer && q.modelAnswer.trim())
      ? "<span style='color:var(--ok);font-weight:500;'>Has model answer</span>"
      : "<span class='no-model-warn'>No model answer</span>";
    const topicText = q.topic ? ` · Topic: ${escapeHTML(q.topic)}` : "";

    card.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 10px;">
        <input type="checkbox" class="bank-select-check" data-id="${escapeHTML(q.id)}" aria-label="Select question" style="margin-top: 4px; transform: scale(1.15); cursor: pointer;">
        <div style="flex: 1; min-width: 0;">
          <div class="bank-card-header">
            <strong>[${escapeHTML(q.paper)}]</strong> ${escapeHTML(q.marks)} marks (${escapeHTML(q.wordLimit)} words)${topicText} · ${modelNote}
            <span style="font-size:11px; color:var(--muted); margin-left:6px;">Q${globalIdx + 1}</span>
          </div>
          <div class="bank-card-text" style="white-space: pre-wrap; line-height: 1.5; margin: 6px 0 10px 0;">${escapeHTML(q.text)}</div>
          <div class="bank-card-actions">
            <button type="button" class="btn-bank-add" data-id="${escapeHTML(q.id)}">Add to today's test</button>
            <button type="button" class="btn-bank-edit secondary" data-id="${escapeHTML(q.id)}">Edit</button>
            <button type="button" class="btn-bank-delete danger" data-id="${escapeHTML(q.id)}">Delete from bank</button>
          </div>
        </div>
      </div>
    `;

    listElem.appendChild(card);
  });

  renderPaginationControls({
    containerId: "bank-pagination",
    currentPage: state.bank_page,
    totalPages: totalPages,
    totalItems: totalItems,
    onPageChange: (newPage) => {
      state.bank_page = newPage;
      renderBank();
      $("bank-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  updateBankBatchState();
}

// Add a single question from the Question Bank into today's setup list
function addQuestionFromBank(id, buttonElem) {
  const bank = loadJSON("rbi_question_bank", []);
  const question = bank.find(q => q.id === id);
  if (!question) return;

  const alreadyAdded = state.setup.questions.some(q => q.id === id);
  if (!alreadyAdded) {
    state.setup.questions.push(JSON.parse(JSON.stringify(question)));
    saveSetup();
    renderSetupList();
  }

  if (buttonElem) {
    const old = buttonElem.textContent;
    buttonElem.textContent = "Added ✓";
    setTimeout(() => buttonElem.textContent = old, 1500);
  }
}

// Load a bank question into the setup form for modification
function editBankQuestion(id) {
  const bank = loadJSON("rbi_question_bank", []);
  const q = bank.find(item => item.id === id);
  if (!q) return;

  const acc = $("p2-manual-accordion");
  if (acc) acc.open = true;

  $("q-paper").value = q.paper || "ESI";
  $("q-topic").value = q.topic || "";
  $("q-text").value = q.text || "";
  $("q-marks").value = q.marks || 10;
  $("q-wordlimit").value = q.wordLimit || defaultWordLimit(q.marks || 10);
  $("q-model").value = q.modelAnswer || "";
  $("q-edit-id").value = q.id;
  $("btn-add-question").textContent = "Update question";

  renderSetupList();
  showScreen("setup");
  $("question-form").scrollIntoView({ behavior: "smooth" });
  $("q-text").focus();
}

// Remove a question from the question bank permanently
function deleteBankQuestion(id) {
  if (confirm("Delete this question from Question Bank?")) {
    let bank = loadJSON("rbi_question_bank", []);
    bank = bank.filter(q => q.id !== id);
    saveJSON("rbi_question_bank", bank);
    renderBank();
  }
}

// Select and add up to 3 random questions from the filtered bank into today's test
function handleAddRandomQuestions() {
  const bank = loadJSON("rbi_question_bank", []);
  if (bank.length === 0) {
    alert("The Question Bank is empty. Add questions to the bank first.");
    return;
  }

  const paperFilter = $("bank-filter-paper") ? $("bank-filter-paper").value : "";
  const searchText = $("bank-search") ? $("bank-search").value.trim().toLowerCase() : "";

  const filtered = bank.filter(q => {
    if (paperFilter && q.paper !== paperFilter) return false;
    if (searchText) {
      const matchText = (q.text || "").toLowerCase().includes(searchText);
      const matchTopic = (q.topic || "").toLowerCase().includes(searchText);
      if (!matchText && !matchTopic) return false;
    }
    return true;
  });

  const available = filtered.filter(bq => !state.setup.questions.some(sq => sq.id === bq.id));
  if (available.length === 0) {
    alert("All matching questions are already in today's test.");
    return;
  }

  const shuffled = available.slice().sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, 3);

  picked.forEach(q => {
    state.setup.questions.push(JSON.parse(JSON.stringify(q)));
  });

  saveSetup();
  renderSetupList();
  alert(`Added ${picked.length} question(s) to today's test.`);
  renderBank();
}

// Export the entire Question Bank as a downloadable JSON file
function handleBankExport() {
  const bank = loadJSON("rbi_question_bank", []);
  const dateStr = getLocalDateString();
  downloadText(`Question_bank_${dateStr}.json`, JSON.stringify(bank, null, 2));
}

// Read and merge an imported JSON question file into the question bank
function handleBankImport(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  // Process imported file content once read as text
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) {
        throw new Error("File content is not a valid JSON array.");
      }
      const bank = loadJSON("rbi_question_bank", []);
      let importedCount = 0;

      data.forEach(item => {
        if (!item || typeof item.text !== "string" || !item.text.trim()) {
          return;
        }
        if (item.id && bank.some(b => b.id === item.id)) {
          return;
        }
        const newQuestion = {
          id: item.id || makeId("q"),
          paper: item.paper || "Other",
          topic: item.topic || "",
          text: item.text.trim(),
          marks: Number(item.marks) || 10,
          wordLimit: Number(item.wordLimit) || defaultWordLimit(item.marks || 10),
          modelAnswer: item.modelAnswer || ""
        };
        bank.push(newQuestion);
        importedCount++;
      });

      saveJSON("rbi_question_bank", bank);
      renderBank();
      alert(`Imported ${importedCount} questions.`);
    } catch (err) {
      alert("Failed to import Question Bank: " + err.message);
    } finally {
      $("bank-import").value = "";
    }
  };
  reader.readAsText(file);
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

// Extract plain text paragraphs from a DOCX file buffer by decompressing word/document.xml
async function extractDocxText(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  let targetEntry = null;

  // 1. Scan Central Directory first (authoritative in ZIP specification, guarantees valid compSize even when data descriptors are used)
  let offset = 0;
  while (offset + 46 < bytes.length) {
    const sig = view.getUint32(offset, true);
    if (sig === 0x02014b50) {
      const compMethod = view.getUint16(offset + 10, true);
      const compSize = view.getUint32(offset + 20, true);
      const nameLen = view.getUint16(offset + 28, true);
      const extraLen = view.getUint16(offset + 30, true);
      const commentLen = view.getUint16(offset + 32, true);
      const localHeaderOffset = view.getUint32(offset + 42, true);
      const filename = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLen));

      if (filename === "word/document.xml") {
        if (localHeaderOffset + 30 <= bytes.length) {
          const lhNameLen = view.getUint16(localHeaderOffset + 26, true);
          const lhExtraLen = view.getUint16(localHeaderOffset + 28, true);
          const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
          targetEntry = { compMethod, compSize, dataStart };
          break;
        }
      }
      offset += 46 + nameLen + extraLen + commentLen;
    } else {
      offset++;
    }
  }

  // 2. Fallback to Local File Header (if central directory is missing or compSize is 0)
  if (!targetEntry || targetEntry.compSize === 0) {
    offset = 0;
    while (offset + 30 < bytes.length) {
      const sig = view.getUint32(offset, true);
      if (sig === 0x04034b50) {
        const compMethod = view.getUint16(offset + 8, true);
        const compSize = view.getUint32(offset + 18, true);
        const nameLen = view.getUint16(offset + 26, true);
        const extraLen = view.getUint16(offset + 28, true);
        const filename = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLen));
        const dataStart = offset + 30 + nameLen + extraLen;

        if (filename === "word/document.xml") {
          let effectiveCompSize = compSize;
          if (effectiveCompSize === 0) {
            let scan = dataStart;
            while (scan + 4 <= bytes.length) {
              const s = view.getUint32(scan, true);
              if (s === 0x04034b50 || s === 0x08074b50 || s === 0x02014b50) {
                break;
              }
              scan++;
            }
            effectiveCompSize = scan - dataStart;
          }
          targetEntry = { compMethod, compSize: effectiveCompSize, dataStart };
          break;
        }
        offset = dataStart + (compSize > 0 ? compSize : 1);
      } else {
        offset++;
      }
    }
  }

  if (!targetEntry || targetEntry.compSize === 0) {
    throw new Error("Could not find document content (word/document.xml) inside the DOCX file.");
  }

  const compressedData = bytes.slice(targetEntry.dataStart, targetEntry.dataStart + targetEntry.compSize);
  let xmlString = "";

  if (targetEntry.compMethod === 0) {
    xmlString = new TextDecoder("utf-8").decode(compressedData);
  } else if (targetEntry.compMethod === 8) {
    try {
      const full = await decompressBuffer(compressedData, "deflate-raw");
      xmlString = new TextDecoder("utf-8").decode(full);
    } catch (e1) {
      const ds = new DecompressionStream("deflate-raw");
      const resp = new Response(new Response(compressedData).body.pipeThrough(ds));
      const blob = await resp.blob();
      xmlString = await blob.text();
    }
  } else {
    throw new Error("Unsupported ZIP compression method: " + targetEntry.compMethod);
  }

  const paragraphs = [];
  const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let pMatch;
  while ((pMatch = pRegex.exec(xmlString)) !== null) {
    const pContent = pMatch[1];
    const normalized = pContent.replace(/<w:tab\/>/g, "    ").replace(/<w:br\/>/g, "\n");
    const tRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
    let tMatch;
    let text = "";
    while ((tMatch = tRegex.exec(normalized)) !== null) {
      text += tMatch[1];
    }
    text = text.replace(/&amp;/g, "&")
               .replace(/&lt;/g, "<")
               .replace(/&gt;/g, ">")
               .replace(/&quot;/g, '"')
               .replace(/&apos;/g, "'")
               .replace(/[\u2013\u2014]/g, "-");
    if (text.trim()) {
      paragraphs.push(text.trim());
    }
  }

  return paragraphs.join("\n");
}

// Extract text from content streams in a PDF file buffer with support for compressed streams
async function extractPdfText(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const textDecoder = new TextDecoder("latin1");
  const str = textDecoder.decode(bytes);

  const objStreamRegex = /<<([^>]*)>>\s*stream\r?\n/g;
  let objMatch;
  const streamPositions = [];
  while ((objMatch = objStreamRegex.exec(str)) !== null) {
    const dict = objMatch[1];
    const isFlate = dict.includes("/FlateDecode");
    const streamStart = objMatch.index + objMatch[0].length;
    const endstreamIdx = str.indexOf("endstream", streamStart);
    if (endstreamIdx !== -1) {
      streamPositions.push({ isFlate, start: streamStart, end: endstreamIdx });
    }
  }

  if (streamPositions.length === 0) {
    const basicStream = /stream\r?\n/g;
    let sMatch;
    while ((sMatch = basicStream.exec(str)) !== null) {
      const start = sMatch.index + sMatch[0].length;
      const end = str.indexOf("endstream", start);
      if (end !== -1) {
        streamPositions.push({ isFlate: false, start, end });
      }
    }
  }

  const allExtracted = [];

  for (const pos of streamPositions) {
    let streamText = "";
    let actualEnd = pos.end;
    while (actualEnd > pos.start && (bytes[actualEnd - 1] === 10 || bytes[actualEnd - 1] === 13)) {
      actualEnd--;
    }
    const rawChunk = bytes.slice(pos.start, actualEnd);

    if (pos.isFlate) {
      try {
        const out = await decompressBuffer(rawChunk, "deflate");
        streamText = new TextDecoder("latin1").decode(out);
      } catch (e) {
        try {
          const out = await decompressBuffer(rawChunk, "deflate-raw");
          streamText = new TextDecoder("latin1").decode(out);
        } catch (e2) {
          streamText = textDecoder.decode(rawChunk);
        }
      }
    } else {
      streamText = textDecoder.decode(rawChunk);
    }

    const btRegex = /BT([\s\S]*?)ET/g;
    let btMatch;
    while ((btMatch = btRegex.exec(streamText)) !== null) {
      const block = btMatch[1];
      const tokenRegex = /(?:\(([^()]*?(?:\\.[^()]*?)*)\)\s*(?:Tj|'|")|\[([\s\S]*?)\]\s*TJ|T\*|(?:-?[\d\.]+)\s+(?:-?[\d\.]+)\s+T[dD])/g;
      let tokMatch;
      const blockLines = [];
      let currentLine = "";

      while ((tokMatch = tokenRegex.exec(block)) !== null) {
        const fullTok = tokMatch[0];
        if (tokMatch[1] !== undefined) {
          const unescaped = tokMatch[1].replace(/\\([()\\])/g, "$1").replace(/\\r/g, "\r").replace(/\\n/g, "\n");
          currentLine += unescaped;
        } else if (tokMatch[2] !== undefined) {
          const arrContent = tokMatch[2];
          const innerStrRegex = /\(([^()]*?(?:\\.[^()]*?)*)\)/g;
          let isMatch;
          while ((isMatch = innerStrRegex.exec(arrContent)) !== null) {
            currentLine += isMatch[1].replace(/\\([()\\])/g, "$1");
          }
        } else if (fullTok.includes("T*") || fullTok.endsWith("Td") || fullTok.endsWith("TD")) {
          if (currentLine.trim()) blockLines.push(currentLine.trim());
          currentLine = "";
        }
      }
      if (currentLine.trim()) blockLines.push(currentLine.trim());
      if (blockLines.length > 0) allExtracted.push(blockLines.join("\n"));
    }
  }

  if (allExtracted.length === 0) {
    const rawLiteralRegex = /\(([^()]{3,})\)\s*(?:Tj|'|TJ)/g;
    let rMatch;
    const lines = [];
    while ((rMatch = rawLiteralRegex.exec(str)) !== null) {
      lines.push(rMatch[1].replace(/\\([()\\])/g, "$1"));
    }
    if (lines.length > 0) allExtracted.push(lines.join("\n"));
  }

  const combined = allExtracted.join("\n").replace(/[\u2013\u2014]/g, "-");
  const rawPdfLines = combined.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  const repPdfHeaders = findRepetitiveHeaders(rawPdfLines);
  const cleanPdfLines = rawPdfLines.filter(l => !isHeaderOrFooterLine(l, repPdfHeaders));
  return cleanPdfLines.join("\n");
}

// Detect repetitive running headers and footers across document lines
function findRepetitiveHeaders(lines) {
  const counts = {};
  for (const l of lines) {
    const trimmed = (l || "").trim().toLowerCase();
    if (
      trimmed.length >= 4 &&
      trimmed.length <= 90 &&
      !/(?:\[[a-e]\]|\([a-e]\)|\b[a-e]\b[\.\)])/i.test(trimmed) &&
      !/\?$/.test(trimmed) &&
      !/\b(?:statement|statements|following|which\s+of|correct|incorrect|option|options|true|false)\b/i.test(trimmed) &&
      !/^(?:(?:model\s+)?answer|ans|solution|explanation|q\s*\d+|\d+[\.\)])/i.test(trimmed)
    ) {
      counts[trimmed] = (counts[trimmed] || 0) + 1;
    }
  }
  const repetitive = new Set();
  for (const [text, count] of Object.entries(counts)) {
    if (count >= 2) repetitive.add(text);
  }
  return repetitive;
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

// Parse raw document text into structured question objects with paper, marks, and model answers
function parseQuestionsAndAnswers(rawText) {
  if (!rawText || !rawText.trim()) return [];

  const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = text.split("\n").map(l => l.trim());
  const repHeaders = findRepetitiveHeaders(rawLines);

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

  // Fallback to numbered list e.g. "1. ..." if no Q1/Question headers found
  if (questionStarts.length === 0) {
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (isHeaderOrFooterLine(line, repHeaders)) continue;
      if (/^\d+[\.\)]\s+/.test(line)) {
        questionStarts.push({ lineIndex: i, qNum: parseInt(line, 10), line });
      }
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
    const blockLines = rawLines.slice(startIdx, endIdx).filter(l => l.length > 0 && !isHeaderOrFooterLine(l, repHeaders));

    if (blockLines.length === 0) continue;

    let paper = docDefaultPaper;
    let topic = docDefaultTopic;
    let marks = 10;
    let wordLimit = 400;

    const qLines = [];
    const aLines = [];
    let inAnswer = false;

    // Check if there is an explicit Answer: / Ans: marker in this question block
    const hasExplicitAnswer = blockLines.some(l => /^(?:(?:Model\s+)?Answer|Ans|Solution|Reference\s+Answer)\s*[:\.\-]/i.test(l));

    for (let i = 0; i < blockLines.length; i++) {
      const line = blockLines[i];

      // Check for inline metadata e.g. "QUESTION 1     15 MARKS     600 WORDS"
      if (/QUESTION\s*\d+/i.test(line) && /MARKS/i.test(line)) {
        const mMarks = line.match(/(\d+)\s*MARKS/i);
        if (mMarks) marks = Number(mMarks[1]);
        const mWords = line.match(/(\d+)\s*WORDS/i);
        if (mWords) wordLimit = Number(mWords[1]);
        else wordLimit = (marks === 15) ? 600 : 400;
        continue;
      }

      // Check for topic header e.g. "Q1. GDP and Welfare"
      const topicHeaderMatch = line.match(/^Q\d+[\.\)]\s*(.+)/i);
      if (topicHeaderMatch && qLines.length === 0 && !inAnswer) {
        topic = topicHeaderMatch[1].trim();
        continue;
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
      const ansMatch = line.match(/^(?:(?:Model\s+)?Answer|Ans|Solution|Reference\s+Answer)\s*[:\.\-]?\s*(.*)/i);
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
          aLines.push(line);
        }
      } else {
        // No explicit Answer marker in document: first non-metadata paragraph is Question prompt, rest is Model Answer
        if (qLines.length === 0) {
          const cleanQ = line.replace(/^(?:\(\d+\)|\[\d+\]|(?:Question|Q)\s*[\.\-]?\s*\d+|\d+)\s*[\.\:\)\-\]]*\s*/i, "").replace(/^[\.\:\)\-\]\s]+/, "");
          if (cleanQ) qLines.push(cleanQ);
        } else {
          aLines.push(line);
        }
      }
    }

    const cleaned = cleanDescriptiveQuestion(qLines, topic);
    const questionText = cleaned.text;
    topic = cleaned.topic;
    const modelAnswer = aLines.filter(l => !isHeaderOrFooterLine(l, repHeaders)).join("\n\n").trim();

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
async function handleDocImport(event, targetScreen) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const statusElem = $("setup-doc-status");
  if (statusElem && targetScreen === "setup") {
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

    const parsedQuestions = parseQuestionsAndAnswers(rawText);
    if (!parsedQuestions || parsedQuestions.length === 0) {
      throw new Error("Could not detect any questions in the file.");
    }

    const saveToBank = $("q-save-bank") ? $("q-save-bank").checked : true;
    const bank = loadJSON("rbi_question_bank", []);

    parsedQuestions.forEach(q => {
      q.id = makeId("q");
      if (saveToBank) {
        bank.push(JSON.parse(JSON.stringify(q)));
      }
    });

    if (saveToBank) {
      saveJSON("rbi_question_bank", bank);
    }

    if (targetScreen === "setup") {
      parsedQuestions.forEach(q => {
        state.setup.questions.push(q);
      });
      saveSetup();
      renderSetupList();

      if (parsedQuestions.length === 1) {
        const first = parsedQuestions[0];
        $("q-paper").value = first.paper || "ESI";
        $("q-topic").value = first.topic || "";
        $("q-text").value = first.text || "";
        $("q-marks").value = first.marks || 10;
        $("q-wordlimit").value = first.wordLimit || defaultWordLimit(first.marks || 10);
        $("q-model").value = first.modelAnswer || "";
        $("q-edit-id").value = first.id;
        $("btn-add-question").textContent = "Update question";
      }

      if (statusElem) {
        statusElem.textContent = `✓ Fetched ${parsedQuestions.length} question(s) from ${file.name}`;
        setTimeout(() => { statusElem.textContent = ""; }, 4000);
      }
      alert(`Successfully fetched and added ${parsedQuestions.length} question(s) from "${file.name}"!`);
    } else if (targetScreen === "bank") {
      renderBank();
      alert(`Successfully imported ${parsedQuestions.length} question(s) from "${file.name}" into Question Bank!`);
    }
  } catch (err) {
    if (statusElem && targetScreen === "setup") {
      statusElem.textContent = "Error: " + err.message;
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
  const repHeaders = findRepetitiveHeaders(rawParagraphs);
  const paragraphs = rawParagraphs.filter(p => !isHeaderOrFooterLine(p, repHeaders));

  // 1. Locate Answer Key section if present
  let ansKeyIdx = -1;
  for (let i = 0; i < paragraphs.length; i++) {
    const pLower = paragraphs[i].toLowerCase();
    if (pLower === "answer key" || pLower === "answers" || pLower.startsWith("answer key:") || pLower === "answer keys" || pLower.startsWith("answers:")) {
      ansKeyIdx = i;
      break;
    }
  }

  const qParagraphs = ansKeyIdx !== -1 ? paragraphs.slice(0, ansKeyIdx) : paragraphs;
  const ansParagraphs = ansKeyIdx !== -1 ? paragraphs.slice(ansKeyIdx + 1) : [];

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

    // Accumulate explanation lines for the current answer block
    if (currentQIdx !== -1 && answersMap[currentQIdx] && Array.isArray(answersMap[currentQIdx].explanation)) {
      if (!/^(?:word\s+meaning\s+opposite|word|meaning|opposite)$/i.test(p)) {
        answersMap[currentQIdx].explanation.push(p);
      }
    }
  }

  // 2. Parse Questions & Options
  const questions = [];
  let currQ = [];
  let currOpts = [];
  const optRegex = /(?:\[([a-eA-E])\]|\(([a-eA-E])\)|(?:\b|^)([a-eA-E])[\.\)])/g;

  function finalizeCurrentQuestion() {
    if (currQ.length > 0 || currOpts.length > 0) {
      const cleanText = cleanMCQPrompt(currQ);
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
    }
  }

  for (let idxP = 0; idxP < qParagraphs.length; idxP++) {
    const p = qParagraphs[idxP];

    if (idxP < 3 && (p.toLowerCase().includes("question bank") || p.toLowerCase() === "questions")) {
      continue;
    }

    const inlineAnsMatch = p.match(/^(?:(?:Correct\s+)?Answer|Ans|Correct\s*Option)\s*[:\.\-]?\s*\(?([a-eA-E])\)?/i);
    if (inlineAnsMatch) {
      if (questions.length > 0) {
        questions[questions.length - 1].correctAnswer = inlineAnsMatch[1].toLowerCase();
      }
      continue;
    }

    const explMatch = p.match(/^(?:Explanation|Exp|Solution|Notes?)\s*[:\.\-]?\s*(.*)/i);
    if (explMatch) {
      if (questions.length > 0) {
        questions[questions.length - 1].explanation = explMatch[1] || "";
      }
      continue;
    }

    // Detect if this line starts a new question
    const isNewQ = /^(?:Q(?:uestion)?\s*[\.\-]?\s*\d+|\d+[\.\)])(?:\s*[\.\:\)\-]*\s*|\s+)/i.test(p);
    if (isNewQ && currOpts.length > 0) {
      finalizeCurrentQuestion();
    }

    // Find options
    const matches = [];
    let m;
    const re = new RegExp(optRegex);
    while ((m = re.exec(p)) !== null) {
      // Guard against Column A, Column B, Section B, Part B, Table B, etc.
      const prefix = p.slice(Math.max(0, m.index - 10), m.index).toLowerCase();
      if (/(?:column|section|part|table|schedule|figure|group|row)\s+$/i.test(prefix)) {
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
async function handleP1DocImport(event, targetScreen = "setup") {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const statusElem = $("setup-p1-doc-status");
  if (statusElem && targetScreen === "setup") {
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

    const parsedQuestions = parseMCQDocument(rawText, "General Awareness");
    if (!parsedQuestions || parsedQuestions.length === 0) {
      throw new Error("Could not detect any MCQs with options in the file.");
    }

    if (targetScreen === "setup") {
      state.p1_setup.questions = state.p1_setup.questions.concat(parsedQuestions);
      saveP1Setup();
      renderP1SetupList();

      const bank = loadJSON("rbi_p1_bank", []);
      parsedQuestions.forEach(q => {
        if (!bank.some(b => b.text === q.text)) {
          bank.push({ ...q });
        }
      });
      saveJSON("rbi_p1_bank", bank);

      const withAns = parsedQuestions.filter(q => q.correctAnswer).length;
      if (statusElem) {
        statusElem.textContent = `Imported ${parsedQuestions.length} MCQs (${withAns} with Answer Key)!`;
      }
      alert(`Imported ${parsedQuestions.length} MCQs successfully!`);
    } else if (targetScreen === "bank") {
      const bank = loadJSON("rbi_p1_bank", []);
      let added = 0;
      parsedQuestions.forEach(q => {
        if (!bank.some(b => b.text === q.text)) {
          bank.push({ ...q });
          added++;
        }
      });
      saveJSON("rbi_p1_bank", bank);
      renderP1Bank();
      alert(`Imported ${parsedQuestions.length} MCQs (${added} new added to Bank).`);
    }
  } catch (err) {
    if (statusElem && targetScreen === "setup") {
      statusElem.textContent = "Error: " + err.message;
    }
    alert("File read error: " + err.message);
  } finally {
    event.target.value = "";
  }
}

// Render the Phase-1 setup questions list
function renderP1SetupList() {
  const list = $("setup-p1-question-list");
  const countElem = $("setup-p1-count");
  if (!list) return;

  const questions = state.p1_setup.questions || [];
  if (countElem) countElem.textContent = questions.length;

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
      return `<span class="opt-pill ${isKey ? 'is-correct' : ''}"><strong>[${o.label.toUpperCase()}]</strong> ${escapeHTML(o.text || "")}</span>`;
    }).join("");

    return `
      <li>
        <input type="checkbox" class="p1-q-select-check" data-id="${q.id}" style="margin-top:4px;">
        <div style="flex:1;">
          <div class="p1-q-meta-badges">
            <span class="badge-subject">${escapeHTML(q.subject || "General Awareness")}</span>
            ${q.topic ? `<span style="font-size:11px; color:var(--muted);">${escapeHTML(q.topic)}</span>` : ""}
            ${q.correctAnswer ? `<span class="badge-ans">Key: [${q.correctAnswer.toUpperCase()}]</span>` : ""}
            <span style="font-size:11px; color:var(--muted);">Q${globalIdx + 1}</span>
          </div>
          <div class="p1-question-full-text">${escapeHTML(q.text || "")}</div>
          <div class="p1-opts-preview">${optsPreview}</div>
        </div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          ${globalIdx > 0 ? `<button type="button" class="btn-p1-move-up" data-index="${globalIdx}" style="padding:2px 6px; font-size:11px;">▲</button>` : `<span style="display:inline-block; width:20px; height:18px;"></span>`}
          ${globalIdx < questions.length - 1 ? `<button type="button" class="btn-p1-move-down" data-index="${globalIdx}" style="padding:2px 6px; font-size:11px;">▼</button>` : `<span style="display:inline-block; width:20px; height:18px;"></span>`}
          <button type="button" class="danger btn-p1-delete-q" data-id="${q.id}" style="padding:2px 6px; font-size:11px;">✕</button>
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
  const saveToBank = $("p1-q-save-bank") ? $("p1-q-save-bank").checked : true;

  if (!text) {
    alert("Please enter the question statement.");
    return;
  }
  if (!optA || !optB || !optC || !optD) {
    alert("Please provide at least options A, B, C, and D.");
    return;
  }

  const options = [
    { label: "a", text: optA },
    { label: "b", text: optB },
    { label: "c", text: optC },
    { label: "d", text: optD }
  ];
  if (optE) options.push({ label: "e", text: optE });

  const pos = Number($("setup-p1-positive")?.value) || 1.0;
  const neg = Number($("setup-p1-negative")?.value) || 0.25;

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

  if (saveToBank) {
    const bank = loadJSON("rbi_p1_bank", []);
    bank.push({ ...newMCQ });
    saveJSON("rbi_p1_bank", bank);
  }

  $("p1-question-form").reset();
  renderP1SetupList();
}

// Start the Phase-1 objective exam
function startP1Exam() {
  const errElem = $("setup-p1-error");
  if (errElem) errElem.textContent = "";

  if (!state.p1_setup.questions || state.p1_setup.questions.length === 0) {
    if (errElem) errElem.textContent = "Please add at least one MCQ before starting the test.";
    return;
  }

  const minutes = Number($("setup-p1-minutes")?.value) || 120;
  const pos = Number($("setup-p1-positive")?.value) || 1.0;
  const neg = Number($("setup-p1-negative")?.value) || 0.25;

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

  state.p1_timerId = setInterval(() => {
    if (!state.p1_test) {
      clearInterval(state.p1_timerId);
      return;
    }

    const now = Date.now();
    const remainingMs = state.p1_endTime - now;
    const remainingSec = Math.max(0, Math.floor(remainingMs / 1000));

    const timerElem = $("p1-exam-timer");
    if (timerElem) timerElem.textContent = formatTime(remainingSec);

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
  const elapsed = Math.round((Date.now() - state.p1_questionShownAt) / 1000);
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
        <div class="mcq-option-item ${isSelected ? 'selected' : ''}" data-label="${opt.label}">
          <span class="opt-badge">${opt.label.toUpperCase()}</span>
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
    if (item.dataset.label.toLowerCase() === optLabel.toLowerCase()) {
      item.classList.add("selected");
    } else {
      item.classList.remove("selected");
    }
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
    if (st === "answered" || st === "answered-review") answered++;
    else if (st === "not-answered") notAnswered++;
    else if (st === "review") marked++;
    else notVisited++;
  });

  const total = state.p1_test.questions.length;

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
  test.timeSpent = test.timeSpent || Math.max(0, totalSec - (test.remainingSeconds || 0));
  test.durationSeconds = test.timeSpent;

  const history = loadJSON("rbi_p1_history", []);
  history.unshift(test);
  saveJSON("rbi_p1_history", history);

  if (typeof autoCompleteDailyQuestOnExam === "function") {
    autoCompleteDailyQuestOnExam("phase1", test);
  }

  if (typeof renderP1Calendar === "function") {
    renderP1Calendar();
  }

  if (state.p1_timerId) {
    clearInterval(state.p1_timerId);
    state.p1_timerId = null;
  }

  localStorage.removeItem("rbi_p1_active_test");

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
      ? `<span style="background:#dcfce7; color:#166534; padding:3px 8px; border-radius:4px; font-weight:700; font-size:12px;">🟩 Correct (+${(test.positiveMarks || 1).toFixed(2)})</span>`
      : isIncorrect
      ? `<span style="background:#fee2e2; color:#991b1b; padding:3px 8px; border-radius:4px; font-weight:700; font-size:12px;">🟥 Incorrect (-${(test.negativeMarks || 0.25).toFixed(2)})</span>`
      : `<span style="background:#f1f5f9; color:#475569; padding:3px 8px; border-radius:4px; font-weight:700; font-size:12px;">⬜ Unattempted (0.00)</span>`;

    const optionsHtml = (q.options || []).map(opt => {
      const optLabel = opt.label.toLowerCase().trim();
      const isChosen = (userAns === optLabel);
      const isActualCorrect = (correctAns === optLabel);

      let optClass = "rev-opt";
      let badge = "";

      if (isChosen && isActualCorrect) {
        optClass += " is-correct-opt";
        badge = `<span style="margin-left:auto; font-size:11px; font-weight:700; color:#15803d;">✓ Your Answer (Correct)</span>`;
      } else if (isChosen && !isActualCorrect) {
        optClass += " chosen-wrong";
        badge = `<span style="margin-left:auto; font-size:11px; font-weight:700; color:#b91c1c;">✗ Your Answer (Incorrect)</span>`;
      } else if (!isChosen && isActualCorrect) {
        optClass += " is-correct-opt";
        badge = `<span style="margin-left:auto; font-size:11px; font-weight:700; color:#15803d;">✓ Correct Answer</span>`;
      }

      return `
        <div class="${optClass}">
          <span style="font-weight:700; min-width:24px;">[${opt.label.toUpperCase()}]</span>
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

// Render Objective Question Bank
function renderP1Bank() {
  const container = $("p1-bank-list");
  if (!container) return;

  const bank = loadJSON("rbi_p1_bank", []);
  const searchQuery = ($("p1-bank-search")?.value || "").toLowerCase().trim();
  const subjectFilter = $("p1-bank-filter-subject")?.value || "All";

  const filtered = bank.filter(q => {
    if (subjectFilter !== "All" && q.subject !== subjectFilter) return false;
    if (searchQuery) {
      const textMatch = (q.text || "").toLowerCase().includes(searchQuery);
      const topicMatch = (q.topic || "").toLowerCase().includes(searchQuery);
      const optsMatch = (q.options || []).some(o => (o.text || "").toLowerCase().includes(searchQuery));
      return textMatch || topicMatch || optsMatch;
    }
    return true;
  });

  const totalInfo = $("p1-bank-total-info");
  if (totalInfo) {
    totalInfo.textContent = `Showing ${filtered.length} of ${bank.length} MCQs`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--muted);">No MCQs found matching your criteria.</div>`;
    renderPaginationControls({
      containerId: "p1-bank-pagination",
      currentPage: 1,
      totalPages: 0,
      totalItems: 0,
      onPageChange: () => {}
    });
    updateP1BankBatchState();
    return;
  }

  const PAGE_SIZE = 50;
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
  if (state.p1_bank_page > totalPages) state.p1_bank_page = totalPages;
  if (state.p1_bank_page < 1) state.p1_bank_page = 1;

  const startIndex = (state.p1_bank_page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  container.innerHTML = pageItems.map((q, localIdx) => {
    const globalIdx = startIndex + localIdx;
    const optsPreview = (q.options || []).map(o => {
      const isKey = q.correctAnswer && q.correctAnswer.toLowerCase() === o.label.toLowerCase();
      return `<span class="opt-pill ${isKey ? 'is-correct' : ''}"><strong>[${o.label.toUpperCase()}]</strong> ${escapeHTML(o.text || "")}</span>`;
    }).join("");

    return `
      <div class="mcq-bank-card">
        <input type="checkbox" class="p1-bank-select-check" data-id="${q.id}" style="margin-top:4px;">
        <div class="mcq-bank-body">
          <div class="p1-q-meta-badges">
            <span class="badge-subject">${escapeHTML(q.subject || "General Awareness")}</span>
            ${q.topic ? `<span style="font-size:11px; color:var(--muted);">${escapeHTML(q.topic)}</span>` : ""}
            ${q.correctAnswer ? `<span class="badge-ans">Key: [${q.correctAnswer.toUpperCase()}]</span>` : ""}
            <span style="font-size:11px; color:var(--muted);">Q${globalIdx + 1}</span>
          </div>
          <div class="mcq-bank-prompt" style="font-size:14px; font-weight:600; color:var(--text); line-height:1.5; white-space:pre-wrap; margin:6px 0 10px 0;">${escapeHTML(q.text)}</div>
          <div class="p1-opts-preview">${optsPreview}</div>
          <div class="mcq-bank-actions">
            <button type="button" class="btn-p1-bank-add" data-id="${q.id}" style="background:#059669; color:white;">+ Add to Test</button>
            <button type="button" class="danger btn-p1-bank-delete" data-id="${q.id}">Delete</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  renderPaginationControls({
    containerId: "p1-bank-pagination",
    currentPage: state.p1_bank_page,
    totalPages: totalPages,
    totalItems: totalItems,
    onPageChange: (newPage) => {
      state.p1_bank_page = newPage;
      renderP1Bank();
      $("p1-bank-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  updateP1BankBatchState();
}

// Update batch selection state in Phase-1 Bank
function updateP1BankBatchState() {
  const checkboxes = document.querySelectorAll("#p1-bank-list .p1-bank-select-check");
  const checked = document.querySelectorAll("#p1-bank-list .p1-bank-select-check:checked");
  const count = checked.length;

  const countDel = $("p1-bank-selected-count");
  if (countDel) countDel.textContent = count;

  const countAdd = $("p1-bank-add-selected-count");
  if (countAdd) countAdd.textContent = count;

  const btnDel = $("btn-p1-bank-delete-selected");
  if (btnDel) btnDel.style.display = count > 0 ? "inline-block" : "none";

  const btnAdd = $("btn-p1-bank-add-selected");
  if (btnAdd) btnAdd.style.display = count > 0 ? "inline-block" : "none";

  const selectAll = $("p1-bank-select-all");
  if (selectAll) {
    selectAll.checked = checkboxes.length > 0 && count === checkboxes.length;
    selectAll.indeterminate = count > 0 && count < checkboxes.length;
  }
}

// Select/deselect all questions in Phase-1 Bank
function handleP1BankSelectAll(e) {
  const checked = e.target.checked;
  document.querySelectorAll("#p1-bank-list .p1-bank-select-check").forEach(cb => cb.checked = checked);
  updateP1BankBatchState();
}

// Delete selected questions from Phase-1 Bank
function handleP1BankDeleteSelected() {
  const checked = document.querySelectorAll("#p1-bank-list .p1-bank-select-check:checked");
  if (checked.length === 0) return;
  if (!confirm(`Delete ${checked.length} selected MCQ(s) from the Bank?`)) return;

  const ids = new Set(Array.from(checked).map(cb => cb.dataset.id));
  let bank = loadJSON("rbi_p1_bank", []);
  bank = bank.filter(q => !ids.has(q.id));
  saveJSON("rbi_p1_bank", bank);
  renderP1Bank();
}

// Add selected questions from Bank to Today's Test
function handleP1BankAddSelected() {
  const checked = document.querySelectorAll("#p1-bank-list .p1-bank-select-check:checked");
  if (checked.length === 0) return;

  const ids = new Set(Array.from(checked).map(cb => cb.dataset.id));
  const bank = loadJSON("rbi_p1_bank", []);
  const selectedQuestions = bank.filter(q => ids.has(q.id));

  let added = 0;
  selectedQuestions.forEach(q => {
    if (!state.p1_setup.questions.some(sq => sq.id === q.id || sq.text === q.text)) {
      state.p1_setup.questions.push({ ...q });
      added++;
    }
  });

  saveP1Setup();
  alert(`Added ${added} MCQ(s) to today's test!`);
}

// Add random questions from Bank
function addP1RandomQuestions(count) {
  const bank = loadJSON("rbi_p1_bank", []);
  if (bank.length === 0) {
    alert("Question bank is empty. Import MCQs first.");
    return;
  }

  const shuffled = [...bank].sort(() => 0.5 - Math.random());
  const picked = shuffled.slice(0, count);

  let added = 0;
  picked.forEach(q => {
    if (!state.p1_setup.questions.some(sq => sq.id === q.id || sq.text === q.text)) {
      state.p1_setup.questions.push({ ...q });
      added++;
    }
  });

  saveP1Setup();
  renderP1SetupList();
  alert(`Added ${added} random MCQ(s) to today's test!`);
  showScreen("setup");
}

// Export Phase-1 Bank to JSON
function exportP1Bank() {
  const bank = loadJSON("rbi_p1_bank", []);
  if (bank.length === 0) {
    alert("Question bank is empty.");
    return;
  }
  const jsonStr = JSON.stringify(bank, null, 2);
  downloadText("RBI_Phase1_MCQs_Bank.json", jsonStr);
}

// Import Phase-1 Bank from JSON
function importP1Bank(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = JSON.parse(evt.target.result);
      if (!Array.isArray(data)) throw new Error("JSON must be an array of questions.");

      const bank = loadJSON("rbi_p1_bank", []);
      let imported = 0;
      data.forEach(item => {
        if (!bank.some(b => b.text === item.text)) {
          bank.push({
            id: item.id || makeId("mcq"),
            subject: item.subject || "General Awareness",
            topic: item.topic || "",
            text: item.text,
            options: item.options || [],
            correctAnswer: item.correctAnswer || "",
            explanation: item.explanation || "",
            marks: item.marks || 1.0,
            negativeMarks: item.negativeMarks || 0.25
          });
          imported++;
        }
      });

      saveJSON("rbi_p1_bank", bank);
      renderP1Bank();
      alert(`Imported ${imported} new MCQs into bank.`);
    } catch (err) {
      alert("Failed to import MCQs: " + err.message);
    } finally {
      e.target.value = "";
    }
  };
  reader.readAsText(file);
}

// Clear all questions in Phase-1 Bank
function clearP1Bank() {
  const bank = loadJSON("rbi_p1_bank", []);
  if (bank.length === 0) return;
  if (!confirm(`Are you sure you want to delete all ${bank.length} MCQs in the Question Bank? This cannot be undone.`)) return;
  saveJSON("rbi_p1_bank", []);
  renderP1Bank();
}

// Render Phase-1 History
function renderP1History() {
  const statsElem = $("p1-history-stats");
  const listElem = $("p1-history-list");
  if (!listElem) return;

  const history = loadJSON("rbi_p1_history", []);

  if (history.length === 0) {
    if (statsElem) statsElem.innerHTML = `<div style="text-align:center; color:var(--muted); padding:10px;">No tests taken yet.</div>`;
    listElem.innerHTML = `<div style="text-align:center; padding:30px; color:var(--muted);">Your completed Phase-1 tests will appear here.</div>`;
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
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div>
            <strong>${dateStr}</strong>
            <span style="margin-left:8px; font-size:12px; color:var(--muted);">(${t.questions.length} Questions)</span>
          </div>
          <div>
            <span style="font-size:16px; font-weight:700; color:#003366;">${t.score.toFixed(2)} / ${t.maxScore.toFixed(2)}</span>
            <span style="margin-left:8px; font-size:13px; font-weight:600; color:#15803d;">(${t.accuracy}% Acc)</span>
          </div>
        </div>
        <div style="display:flex; gap:12px; font-size:13px; color:var(--muted); margin-bottom:10px;">
          <span>🟩 Correct: <strong>${t.correctCount}</strong></span>
          <span>🟥 Incorrect: <strong>${t.incorrectCount}</strong></span>
          <span>⬜ Unattempted: <strong>${t.unattemptedCount}</strong></span>
          <span>⏱ Time: <strong>${formatDuration(t.timeSpent || 0)}</strong></span>
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
  if (typeof renderP1Calendar === "function") renderP1Calendar();
}

// Clear all Phase-1 History
function clearP1History() {
  const history = loadJSON("rbi_p1_history", []);
  if (history.length === 0) return;
  if (!confirm("Are you sure you want to delete all Phase-1 test history?")) return;
  saveJSON("rbi_p1_history", []);
  renderP1History();
  if (typeof renderP1Calendar === "function") renderP1Calendar();
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

// Classifies a day into: "chapter-test", "mix-test", "buffer-day", or "normal-day"
function classifyDayType(p2Topic = "", p1Topic = "", ca = "") {
  const combined = `${p2Topic || ""} ${p1Topic || ""} ${ca || ""}`.toLowerCase();
  if (combined.includes("mix test")) return "mix-test";
  if (combined.includes("chapter test")) return "chapter-test";
  if (combined.includes("buffer day") || combined.includes("buffer")) return "buffer-day";
  return "normal-day";
}

// Get metadata for a specific date (dayNum, dayType, p2 details, p1 details, ca)
function getDayMetadata(dateStr) {
  if (!state.calendar_day_metadata) {
    state.calendar_day_metadata = {};
  }
  if (state.calendar_day_metadata[dateStr]) {
    return state.calendar_day_metadata[dateStr];
  }

  // Look in existing calendar tasks for this date
  const tasks = (state.calendar || []).filter(t => t.date === dateStr);
  if (tasks.length > 0) {
    const firstWithMeta = tasks.find(t => t.p2_topic || t.p1_topic || t.dayType || t.dayNum);
    const p2Task = tasks.find(t => t.phase === "Phase-2");
    const p1Task = tasks.find(t => t.phase === "Phase-1");
    const caTask = tasks.find(t => (t.subject && t.subject.includes("Current Affairs")) || t.phase === "General");

    const p2Sub = p2Task ? p2Task.subject : (firstWithMeta ? firstWithMeta.p2_subject : "");
    const p2Top = p2Task ? p2Task.topic : (firstWithMeta ? firstWithMeta.p2_topic : "");
    const p1Sub = p1Task ? p1Task.subject : (firstWithMeta ? firstWithMeta.p1_subject : "");
    const p1Top = p1Task ? p1Task.topic : (firstWithMeta ? firstWithMeta.p1_topic : "");
    const caTop = caTask ? caTask.topic : (firstWithMeta ? firstWithMeta.ca : "");

    const dayType = (firstWithMeta && firstWithMeta.dayType) || classifyDayType(p2Top, p1Top, caTop);
    const dayNum = (firstWithMeta && firstWithMeta.dayNum) || null;

    const meta = {
      dayNum,
      dayType,
      p2_subject: sanitizeDashes(p2Sub || ""),
      p2_topic: sanitizeDashes(p2Top || ""),
      p1_subject: sanitizeDashes(p1Sub || ""),
      p1_topic: sanitizeDashes(p1Top || ""),
      ca: sanitizeDashes(caTop || "")
    };
    state.calendar_day_metadata[dateStr] = meta;
    return meta;
  }

  return null;
}

// Rebuild day metadata from official schedule data or calendar tasks
function rebuildCalendarMetadata() {
  state.calendar_day_metadata = {};
  const startStr = state.calendar_planStartDate || "2026-11-01";
  const [sYear, sMonth, sDay] = startStr.split("-").map(Number);

  // Base: official schedule data
  if (typeof RBI_OFFICIAL_SCHEDULE_DATA !== "undefined" && Array.isArray(RBI_OFFICIAL_SCHEDULE_DATA)) {
    for (const item of RBI_OFFICIAL_SCHEDULE_DATA) {
      const targetDate = new Date(sYear, sMonth - 1, sDay + (item.day - 1));
      const dateStr = getLocalDateString(targetDate);
      state.calendar_day_metadata[dateStr] = {
        dayNum: item.day,
        dayType: item.dayType || classifyDayType(item.p2_topic, item.p1_topic, item.ca),
        p2_subject: sanitizeDashes(item.p2_subject || ""),
        p2_topic: sanitizeDashes(item.p2_topic || ""),
        p1_subject: sanitizeDashes(item.p1_subject || ""),
        p1_topic: sanitizeDashes(item.p1_topic || ""),
        ca: sanitizeDashes(item.ca || "")
      };
    }
  }

  // Overlay tasks from state.calendar so custom spreadsheet imports take full precedence
  for (const t of (state.calendar || [])) {
    if (!state.calendar_day_metadata[t.date]) {
      state.calendar_day_metadata[t.date] = {
        dayNum: t.dayNum || null,
        dayType: t.dayType || "normal-day",
        p2_subject: t.phase === "Phase-2" ? sanitizeDashes(t.subject) : (t.p2_subject || ""),
        p2_topic: t.phase === "Phase-2" ? sanitizeDashes(t.topic) : (t.p2_topic || ""),
        p1_subject: t.phase === "Phase-1" ? sanitizeDashes(t.subject) : (t.p1_subject || ""),
        p1_topic: t.phase === "Phase-1" ? sanitizeDashes(t.topic) : (t.p1_topic || ""),
        ca: t.phase === "General" ? sanitizeDashes(t.topic) : (t.ca || "")
      };
    } else {
      const m = state.calendar_day_metadata[t.date];
      if (t.dayType) m.dayType = t.dayType;
      if (t.dayNum) m.dayNum = t.dayNum;
      if (t.phase === "Phase-2") {
        m.p2_subject = sanitizeDashes(t.subject || m.p2_subject);
        m.p2_topic = sanitizeDashes(t.topic || m.p2_topic);
      } else if (t.phase === "Phase-1") {
        m.p1_subject = sanitizeDashes(t.subject || m.p1_subject);
        m.p1_topic = sanitizeDashes(t.topic || m.p1_topic);
      } else if (t.phase === "General") {
        m.ca = sanitizeDashes(t.topic || m.ca);
      }
    }
  }
}

// Convert 2D spreadsheet rows into structured task objects
function mapScheduleRowsToTasks(rows, startStr = null, daysFinished = 0) {
  if (!rows || rows.length < 2) return [];

  const headers = rows[0].map(h => String(h || "").trim().toLowerCase());
  const findCol = (keywords) => headers.findIndex(h => keywords.some(k => h.includes(k)));

  const planStart = startStr || state.calendar_planStartDate || "2026-11-01";
  state.calendar_planStartDate = planStart;
  saveJSON("rbi_calendar_start_date", planStart);
  const [sYear, sMonth, sDay] = planStart.split("-").map(Number);
  const numFinished = parseInt(daysFinished, 10) || 0;

  // Check if this is the multi-phase RBI Study Schedule format
  const isMultiPhase = headers.some(h => h.includes("phase-2") || h.includes("phase 2") || h.includes("phase-1") || h.includes("phase 1"));

  if (isMultiPhase) {
    const dayCol = findCol(["day", "day no", "date", "timeline"]);
    const p2SubCol = findCol(["subject (phase-2)", "phase-2 subject", "subject p2", "p2 subject"]);
    const p2TopCol = findCol(["topic (phase-2)", "phase-2 topic", "topic p2", "p2 topic"]);
    const p1SubCol = findCol(["subject (phase-1)", "phase-1 subject", "subject p1", "p1 subject"]);
    const p1TopCol = findCol(["topic (phase-1)", "phase-1 topic", "topic p1", "p1 topic"]);
    const caCol = findCol(["current affairs", "ca", "general awareness", "spotlight"]);

    const tasks = [];
    state.calendar_day_metadata = state.calendar_day_metadata || {};

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0 || !r.some(cell => String(cell).trim().length > 0)) continue;

      const rawDay = dayCol !== -1 ? String(r[dayCol] || "").trim() : String(i);
      const dayNum = parseInt(rawDay, 10) || i;

      const targetDate = new Date(sYear, sMonth - 1, sDay + (dayNum - 1));
      const dateStr = getLocalDateString(targetDate);

      const p2Subject = sanitizeDashes(p2SubCol !== -1 ? String(r[p2SubCol] || "").trim() : "");
      const p2Topic = sanitizeDashes(p2TopCol !== -1 ? String(r[p2TopCol] || "").trim() : "");
      const p1Subject = sanitizeDashes(p1SubCol !== -1 ? String(r[p1SubCol] || "").trim() : "");
      const p1Topic = sanitizeDashes(p1TopCol !== -1 ? String(r[p1TopCol] || "").trim() : "");
      const caTopic = sanitizeDashes(caCol !== -1 ? String(r[caCol] || "").trim() : "");

      const dayType = classifyDayType(p2Topic, p1Topic, caTopic);
      const isCompleted = (numFinished > 0 && dayNum <= numFinished);

      // Save day metadata
      state.calendar_day_metadata[dateStr] = {
        dayNum,
        dayType,
        p2_subject: p2Subject,
        p2_topic: p2Topic,
        p1_subject: p1Subject,
        p1_topic: p1Topic,
        ca: caTopic
      };

      if (p2Topic) {
        tasks.push({
          id: `task-d${dayNum}-p2-${i}`,
          date: dateStr,
          dayNum: dayNum,
          dayType: dayType,
          phase: "Phase-2",
          subject: p2Subject || "Phase-2",
          topic: p2Topic,
          type: dayType === "mix-test" ? "Mix Test" : (dayType === "chapter-test" ? "Chapter Test" : (dayType === "buffer-day" ? "Revision" : "Descriptive Writing")),
          time: "10:00 AM",
          status: isCompleted ? "completed" : "pending",
          p2_subject: p2Subject,
          p2_topic: p2Topic,
          p1_subject: p1Subject,
          p1_topic: p1Topic,
          ca: caTopic
        });
      }

      if (p1Topic) {
        tasks.push({
          id: `task-d${dayNum}-p1-${i}`,
          date: dateStr,
          dayNum: dayNum,
          dayType: dayType,
          phase: "Phase-1",
          subject: p1Subject || "Phase-1",
          topic: p1Topic,
          type: dayType === "mix-test" ? "Mix Test" : (dayType === "chapter-test" ? "Chapter Test" : (dayType === "buffer-day" ? "Revision" : "MCQ Practice")),
          time: "02:00 PM",
          status: isCompleted ? "completed" : "pending",
          p2_subject: p2Subject,
          p2_topic: p2Topic,
          p1_subject: p1Subject,
          p1_topic: p1Topic,
          ca: caTopic
        });
      }

      if (caTopic) {
        tasks.push({
          id: `task-d${dayNum}-ca-${i}`,
          date: dateStr,
          dayNum: dayNum,
          dayType: dayType,
          phase: "General",
          subject: "Current Affairs & Reports",
          topic: caTopic,
          type: "Current Affairs",
          time: "06:00 PM",
          status: isCompleted ? "completed" : "pending",
          p2_subject: p2Subject,
          p2_topic: p2Topic,
          p1_subject: p1Subject,
          p1_topic: p1Topic,
          ca: caTopic
        });
      }
    }

    return tasks;
  }

  // Generic single-phase spreadsheet format
  const dateCol = findCol(["date", "day", "when", "scheduled", "timeline"]);
  const phaseCol = findCol(["phase", "tier", "stage", "part"]);
  const subjectCol = findCol(["subject", "paper", "section", "module", "course"]);
  const topicCol = findCol(["topic", "title", "task", "chapter", "unit", "description", "details", "content"]);
  const typeCol = findCol(["type", "mode", "category", "activity", "format"]);
  const timeCol = findCol(["time", "duration", "hours", "slot", "timing"]);
  const statusCol = findCol(["status", "completed", "done", "state"]);

  const tasks = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0 || !r.some(cell => String(cell).trim().length > 0)) continue;

    const rawDate = dateCol !== -1 ? r[dateCol] : "";
    const rawPhase = phaseCol !== -1 ? String(r[phaseCol] || "").trim() : "";
    const rawSubject = sanitizeDashes(subjectCol !== -1 ? String(r[subjectCol] || "").trim() : "");
    const rawTopic = sanitizeDashes(topicCol !== -1 ? String(r[topicCol] || "").trim() : (r[0] || "Study Session"));
    const rawType = sanitizeDashes(typeCol !== -1 ? String(r[typeCol] || "").trim() : "");
    const rawTime = timeCol !== -1 ? String(r[timeCol] || "").trim() : "";
    const rawStatus = statusCol !== -1 ? String(r[statusCol] || "").trim().toLowerCase() : "";

    let phase = "General";
    const phaseLower = rawPhase.toLowerCase();
    if (phaseLower.includes("1") || phaseLower.includes("p1") || phaseLower.includes("objective") || phaseLower.includes("mcq")) {
      phase = "Phase-1";
    } else if (phaseLower.includes("2") || phaseLower.includes("p2") || phaseLower.includes("descriptive") || phaseLower.includes("writing")) {
      phase = "Phase-2";
    }

    const dayType = classifyDayType(rawTopic, rawSubject, rawType);

    let taskType = "Study Task";
    if (dayType === "mix-test") taskType = "Mix Test";
    else if (dayType === "chapter-test") taskType = "Chapter Test";
    else if (dayType === "buffer-day") taskType = "Revision";
    else {
      const typeLower = (rawType + " " + rawTopic).toLowerCase();
      if (typeLower.includes("mcq") || typeLower.includes("objective") || typeLower.includes("spotlight")) {
        taskType = "MCQ Practice";
      } else if (typeLower.includes("descriptive") || typeLower.includes("writing") || typeLower.includes("essay") || typeLower.includes("precis")) {
        taskType = "Descriptive Writing";
      } else if (typeLower.includes("mock") || typeLower.includes("test") || typeLower.includes("full length")) {
        taskType = "Mock Test";
      } else if (typeLower.includes("revision") || typeLower.includes("review")) {
        taskType = "Revision";
      } else if (typeLower.includes("reading") || typeLower.includes("notes") || typeLower.includes("chapter")) {
        taskType = "Reading / Notes";
      }
    }

    const isCompleted = (numFinished > 0 && i <= numFinished) || ["completed", "done", "yes", "true", "1", "finished"].includes(rawStatus);
    const dateStr = parseScheduleDate(rawDate);

    tasks.push({
      id: makeId("task"),
      date: dateStr,
      dayNum: i,
      phase: phase,
      subject: rawSubject || (phase === "Phase-1" ? "General Awareness" : "ESI"),
      topic: rawTopic || "Scheduled Preparation Task",
      type: taskType,
      dayType: dayType,
      time: rawTime || "",
      status: isCompleted ? "completed" : "pending"
    });
  }

  return tasks;
}

// Generate RBI Grade B Exam Study Plan (loads 415-Day Official Schedule if available)
function generateDefaultSchedule(startDateStr = null, daysFinished = 0) {
  const startStr = startDateStr || state.calendar_planStartDate || "2026-11-01";
  state.calendar_planStartDate = startStr;
  saveJSON("rbi_calendar_start_date", startStr);

  const numFinished = parseInt(daysFinished, 10) || 0;
  const [sYear, sMonth, sDay] = startStr.split("-").map(Number);

  // If official 415-day schedule data is present
  if (typeof RBI_OFFICIAL_SCHEDULE_DATA !== "undefined" && Array.isArray(RBI_OFFICIAL_SCHEDULE_DATA) && RBI_OFFICIAL_SCHEDULE_DATA.length > 0) {
    const tasks = [];
    state.calendar_day_metadata = {};

    for (const item of RBI_OFFICIAL_SCHEDULE_DATA) {
      const dayNum = item.day;
      const targetDate = new Date(sYear, sMonth - 1, sDay + (dayNum - 1));
      const dateStr = getLocalDateString(targetDate);
      const dayType = item.dayType || classifyDayType(item.p2_topic, item.p1_topic, item.ca);

      state.calendar_day_metadata[dateStr] = {
        dayNum: dayNum,
        dayType: dayType,
        p2_subject: sanitizeDashes(item.p2_subject || ""),
        p2_topic: sanitizeDashes(item.p2_topic || ""),
        p1_subject: sanitizeDashes(item.p1_subject || ""),
        p1_topic: sanitizeDashes(item.p1_topic || ""),
        ca: sanitizeDashes(item.ca || "")
      };

      const isCompleted = (numFinished > 0 && dayNum <= numFinished);

      if (item.p2_topic) {
        tasks.push({
          id: `task-d${dayNum}-p2`,
          date: dateStr,
          dayNum: dayNum,
          dayType: dayType,
          phase: "Phase-2",
          subject: sanitizeDashes(item.p2_subject || "Phase-2"),
          topic: sanitizeDashes(item.p2_topic),
          type: dayType === "mix-test" ? "Mix Test" : (dayType === "chapter-test" ? "Chapter Test" : (dayType === "buffer-day" ? "Revision" : "Descriptive Writing")),
          time: "10:00 AM",
          status: isCompleted ? "completed" : "pending",
          p2_subject: sanitizeDashes(item.p2_subject),
          p2_topic: sanitizeDashes(item.p2_topic),
          p1_subject: sanitizeDashes(item.p1_subject),
          p1_topic: sanitizeDashes(item.p1_topic),
          ca: sanitizeDashes(item.ca)
        });
      }

      if (item.p1_topic) {
        tasks.push({
          id: `task-d${dayNum}-p1`,
          date: dateStr,
          dayNum: dayNum,
          dayType: dayType,
          phase: "Phase-1",
          subject: sanitizeDashes(item.p1_subject || "Phase-1"),
          topic: sanitizeDashes(item.p1_topic),
          type: dayType === "mix-test" ? "Mix Test" : (dayType === "chapter-test" ? "Chapter Test" : (dayType === "buffer-day" ? "Revision" : "MCQ Practice")),
          time: "02:00 PM",
          status: isCompleted ? "completed" : "pending",
          p2_subject: sanitizeDashes(item.p2_subject),
          p2_topic: sanitizeDashes(item.p2_topic),
          p1_subject: sanitizeDashes(item.p1_subject),
          p1_topic: sanitizeDashes(item.p1_topic),
          ca: sanitizeDashes(item.ca)
        });
      }

      if (item.ca) {
        tasks.push({
          id: `task-d${dayNum}-ca`,
          date: dateStr,
          dayNum: dayNum,
          dayType: dayType,
          phase: "General",
          subject: "Current Affairs & Reports",
          topic: sanitizeDashes(item.ca),
          type: "Current Affairs",
          time: "06:00 PM",
          status: isCompleted ? "completed" : "pending",
          p2_subject: sanitizeDashes(item.p2_subject),
          p2_topic: sanitizeDashes(item.p2_topic),
          p1_subject: sanitizeDashes(item.p1_subject),
          p1_topic: sanitizeDashes(item.p1_topic),
          ca: sanitizeDashes(item.ca)
        });
      }
    }

    return tasks;
  }

  // Fallback 30-Day Plan if schedule data not loaded
  const plan = [];
  const today = new Date();
  const defaultTopics = [
    { phase: "Phase-1", subject: "General Awareness", topic: "Spotlight Nov 1-6 Current Affairs (Part 1 - 50 MCQs)", type: "MCQ Practice", time: "10:00 AM" },
    { phase: "Phase-2", subject: "ESI", topic: "Chapter 1: National Income - Concepts & Measurement", type: "Descriptive Writing", time: "11:00 AM" },
    { phase: "Phase-1", subject: "Reasoning Ability", topic: "Puzzles & Seating Arrangement (Circular & Floor)", type: "MCQ Practice", time: "02:00 PM" },
    { phase: "Phase-2", subject: "Finance", topic: "Financial System in India - Structure & RBI Functions", type: "Descriptive Writing", time: "10:00 AM" },
    { phase: "Phase-1", subject: "Quantitative Aptitude", topic: "Data Interpretation (Bar & Pie) + Percentage/Ratio", type: "MCQ Practice", time: "03:00 PM" },
    { phase: "Phase-2", subject: "Management", topic: "Leadership Theories - Transformational vs Transactional", type: "Descriptive Writing", time: "11:00 AM" },
    { phase: "General", subject: "Weekly Revision", topic: "Spotlight GA Week 1 & 2 Rapid Revision + Formula Review", type: "Revision", time: "04:00 PM" }
  ];

  for (let i = 0; i < 30; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const item = defaultTopics[i % defaultTopics.length];
    const dayNum = i + 1;
    const isCompleted = (numFinished > 0 && dayNum <= numFinished);
    plan.push({
      id: makeId("task"),
      date: getLocalDateString(d),
      dayNum: dayNum,
      dayType: i % 7 === 4 ? "chapter-test" : (i % 7 === 6 ? "buffer-day" : "normal-day"),
      phase: item.phase,
      subject: sanitizeDashes(item.subject),
      topic: sanitizeDashes(item.topic),
      type: item.type,
      time: item.time,
      status: isCompleted ? "completed" : "pending"
    });
  }

  return plan;
}

// Retrieve dictionary of Phase-1 exams mapped by YYYY-MM-DD
function getPhase1ExamsByDate() {
  const history = loadJSON("rbi_p1_history", []);
  const map = {};
  for (const item of history) {
    const raw = item.completedAt || item.date;
    if (!raw) continue;
    const dStr = getLocalDateString(new Date(raw));
    if (!map[dStr]) map[dStr] = [];
    map[dStr].push(item);
  }
  return map;
}

// Retrieve dictionary of Phase-2 written tests mapped by YYYY-MM-DD
function getPhase2ExamsByDate() {
  const history = loadJSON("rbi_history", []);
  const map = {};
  for (const item of history) {
    if (!item.date) continue;
    const dStr = getLocalDateString(new Date(item.date));
    if (!map[dStr]) map[dStr] = [];
    map[dStr].push(item);
  }
  return map;
}

// Generic routing function: routes to active phase calendar
function renderCalendar() {
  if (state.phase === "phase1") {
    renderP1Calendar();
  } else {
    renderP2Calendar();
  }
}

// Save calendar tasks into localStorage
function saveCalendarSchedule() {
  saveJSON("rbi_study_schedule", state.calendar || []);
}

// ============================================================
// PHASE 1 CALENDAR: OBJECTIVE DRILLS & EXAM MARKS
// ============================================================

// ============================================================
// CALENDAR & STREAK ENGINE (LEETCODE MINIMAL STYLE & DAILY QUESTS)
// ============================================================

// Check if a given date is finished (all tasks completed or exam logged)
function isDayFinished(dateStr, phaseType) {
  const p1ExamsMap = getPhase1ExamsByDate();
  const p2ExamsMap = getPhase2ExamsByDate();
  const dayExams = phaseType === "phase1" ? (p1ExamsMap[dateStr] || []) : (p2ExamsMap[dateStr] || []);

  const tasks = (state.calendar || []).filter(t => {
    if (t.date !== dateStr) return false;
    if (phaseType === "phase1") {
      return t.phase === "Phase-1" || t.phase === "General";
    } else {
      return t.phase === "Phase-2";
    }
  });

  // A day is finished if:
  // 1. It has tasks, and ALL of them are marked completed
  // 2. OR it has logged exams taken on that day
  if (tasks.length > 0) {
    const allCompleted = tasks.every(t => t.status === "completed");
    if (allCompleted) return true;
  }
  if (dayExams.length > 0) {
    return true;
  }
  return false;
}

// Compute streak metrics: currentStreak, maxStreak, totalActiveDays, finishedDates, isTodayFinished
// Rule: If one day is missed, streak is broken (0), and restarts from 1 on the next finished day.
function getCalendarStreak(phaseType) {
  const today = new Date();
  const todayStr = getLocalDateString(today);

  const allDatesSet = new Set();
  (state.calendar || []).forEach(t => {
    if (t.date) allDatesSet.add(t.date);
  });
  const examsMap = phaseType === "phase1" ? getPhase1ExamsByDate() : getPhase2ExamsByDate();
  Object.keys(examsMap).forEach(d => allDatesSet.add(d));

  const finishedDatesSet = new Set();
  for (const d of allDatesSet) {
    if (isDayFinished(d, phaseType)) {
      finishedDatesSet.add(d);
    }
  }

  const isTodayFinished = finishedDatesSet.has(todayStr);

  // Current Streak Calculation:
  let currentStreak = 0;
  if (isTodayFinished) {
    currentStreak = 1;
    let checkDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    while (true) {
      const dStr = getLocalDateString(checkDate);
      if (finishedDatesSet.has(dStr)) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
  } else {
    // Today not finished yet. Check yesterday:
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const yStr = getLocalDateString(yesterday);
    if (finishedDatesSet.has(yStr)) {
      currentStreak = 1;
      let checkDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate() - 1);
      while (true) {
        const dStr = getLocalDateString(checkDate);
        if (finishedDatesSet.has(dStr)) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    } else {
      // Yesterday was missed! Streak is broken (0)
      currentStreak = 0;
    }
  }

  // Max Streak Calculation across all history
  const sortedDates = Array.from(finishedDatesSet).sort();
  let maxStreak = 0;
  let tempStreak = 0;
  let prevDate = null;

  for (const dStr of sortedDates) {
    const curDate = new Date(dStr + "T00:00:00");
    if (prevDate) {
      const diffDays = Math.round((curDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    } else {
      tempStreak = 1;
    }
    prevDate = curDate;
    if (tempStreak > maxStreak) {
      maxStreak = tempStreak;
    }
  }

  if (currentStreak > maxStreak) {
    maxStreak = currentStreak;
  }

  return {
    currentStreak,
    maxStreak,
    totalActiveDays: finishedDatesSet.size,
    finishedDates: finishedDatesSet,
    isTodayFinished
  };
}

// Auto-populate 3 default quests for a date if it has no tasks yet or has legacy single task
function ensureDailyQuestsForDate(dateStr, phaseType) {
  if (!state.calendar) state.calendar = [];
  const meta = getDayMetadata(dateStr);

  if (phaseType === "phase2") {
    const existing = state.calendar.filter(t => t.date === dateStr && t.phase === "Phase-2");
    if (existing.length === 0 && meta && (meta.p2_topic || meta.p2_subject)) {
      const ch = meta.p2_topic || meta.p2_subject || "Phase-2 Chapter Focus";
      const sub = meta.p2_subject || "Phase-2";
      const dNum = meta.dayNum || null;
      const dType = meta.dayType || "normal-day";

      state.calendar.push(
        {
          id: `quest-p2-obj-${dateStr}-${Date.now()}-1`,
          date: dateStr,
          dayNum: dNum,
          dayType: dType,
          phase: "Phase-2",
          subject: sub,
          topic: `Objective Exam: ${ch}`,
          type: "Objective Exam",
          time: "10:00 AM",
          status: "pending",
          autoGenerated: true
        },
        {
          id: `quest-p2-sub-${dateStr}-${Date.now()}-2`,
          date: dateStr,
          dayNum: dNum,
          dayType: dType,
          phase: "Phase-2",
          subject: sub,
          topic: `Subjective Writing: ${ch}`,
          type: "Subjective Exam",
          time: "02:00 PM",
          status: "pending",
          autoGenerated: true
        },
        {
          id: `quest-p2-std-${dateStr}-${Date.now()}-3`,
          date: dateStr,
          dayNum: dNum,
          dayType: dType,
          phase: "Phase-2",
          subject: sub,
          topic: `Chapter Study & Notes: ${ch}`,
          type: "Study / Reading",
          time: "05:00 PM",
          status: "pending",
          autoGenerated: true
        }
      );
      saveCalendarSchedule();
    } else if (existing.length === 1 && existing[0].id.startsWith("task-d") && existing[0].id.endsWith("-p2")) {
      const orig = existing[0];
      const wasDone = orig.status === "completed";
      const ch = orig.topic;
      const sub = orig.subject || "Phase-2";
      const dNum = orig.dayNum;
      const dType = orig.dayType || "normal-day";

      state.calendar = state.calendar.filter(t => t.id !== orig.id);
      state.calendar.push(
        {
          id: `quest-p2-obj-${dateStr}-${Date.now()}-1`,
          date: dateStr,
          dayNum: dNum,
          dayType: dType,
          phase: "Phase-2",
          subject: sub,
          topic: `Objective Exam: ${ch}`,
          type: "Objective Exam",
          time: "10:00 AM",
          status: wasDone ? "completed" : "pending",
          autoGenerated: true
        },
        {
          id: `quest-p2-sub-${dateStr}-${Date.now()}-2`,
          date: dateStr,
          dayNum: dNum,
          dayType: dType,
          phase: "Phase-2",
          subject: sub,
          topic: `Subjective Writing: ${ch}`,
          type: "Subjective Exam",
          time: "02:00 PM",
          status: wasDone ? "completed" : "pending",
          autoGenerated: true
        },
        {
          id: `quest-p2-std-${dateStr}-${Date.now()}-3`,
          date: dateStr,
          dayNum: dNum,
          dayType: dType,
          phase: "Phase-2",
          subject: sub,
          topic: `Chapter Study & Notes: ${ch}`,
          type: "Study / Reading",
          time: "05:00 PM",
          status: wasDone ? "completed" : "pending",
          autoGenerated: true
        }
      );
      saveCalendarSchedule();
    }
  } else {
    // Phase 1
    const existing = state.calendar.filter(t => t.date === dateStr && (t.phase === "Phase-1" || t.phase === "General"));
    if (existing.length === 0 && meta && (meta.p1_topic || meta.ca)) {
      const p1Top = meta.p1_topic || "Objective Speed Drill";
      const p1Sub = meta.p1_subject || "Phase-1";
      const caTop = meta.ca || "Spotlight Current Affairs Drill";
      const dNum = meta.dayNum || null;
      const dType = meta.dayType || "normal-day";

      state.calendar.push(
        {
          id: `quest-p1-obj-${dateStr}-${Date.now()}-1`,
          date: dateStr,
          dayNum: dNum,
          dayType: dType,
          phase: "Phase-1",
          subject: p1Sub,
          topic: `Objective Speed Drill: ${p1Top}`,
          type: "Objective Exam",
          time: "10:00 AM",
          status: "pending",
          autoGenerated: true
        },
        {
          id: `quest-p1-ca-${dateStr}-${Date.now()}-2`,
          date: dateStr,
          dayNum: dNum,
          dayType: dType,
          phase: "General",
          subject: "Current Affairs & Reports",
          topic: `Daily Spotlight GA Drill: ${caTop}`,
          type: "Current Affairs",
          time: "02:00 PM",
          status: "pending",
          autoGenerated: true
        },
        {
          id: `quest-p1-rev-${dateStr}-${Date.now()}-3`,
          date: dateStr,
          dayNum: dNum,
          dayType: dType,
          phase: "Phase-1",
          subject: p1Sub,
          topic: `Formula & Concepts Revision: ${p1Top}`,
          type: "Study / Reading",
          time: "06:00 PM",
          status: "pending",
          autoGenerated: true
        }
      );
      saveCalendarSchedule();
    }
  }
}

// Add user-created dynamic quest / TODO item to the currently selected day
function addQuickQuest(phaseType) {
  const prefix = phaseType === "phase1" ? "p1" : "p2";
  const titleInput = $(`${prefix}-input-quick-quest-title`);
  const typeSelect = $(`${prefix}-select-quick-quest-type`);
  if (!titleInput) return;
  const title = (titleInput.value || "").trim();
  if (!title) return;

  const questType = typeSelect ? typeSelect.value : (phaseType === "phase1" ? "Objective Exam" : "Subjective Exam");
  const selDateStr = phaseType === "phase1" ? state.p1_calendar_selectedDate : state.p2_calendar_selectedDate;
  const dayMeta = getDayMetadata(selDateStr);
  const subjectName = phaseType === "phase1" ? (dayMeta?.p1_subject || "Phase-1") : (dayMeta?.p2_subject || "Phase-2");

  const newQuest = {
    id: `quest-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    date: selDateStr,
    dayNum: dayMeta?.dayNum || null,
    dayType: dayMeta?.dayType || "normal-day",
    phase: phaseType === "phase1" ? (questType === "Current Affairs" ? "General" : "Phase-1") : "Phase-2",
    subject: subjectName,
    topic: sanitizeDashes(title),
    type: questType,
    time: "10:00 AM",
    status: "pending",
    createdManually: true
  };

  if (!state.calendar) state.calendar = [];
  state.calendar.push(newQuest);
  saveCalendarSchedule();

  titleInput.value = "";

  if (phaseType === "phase1") {
    renderP1Calendar();
  } else {
    renderP2Calendar();
  }
}

// Auto-complete matching daily quest when an exam finishes
function autoCompleteDailyQuestOnExam(phaseType, test) {
  const todayStr = getLocalDateString(new Date());
  ensureDailyQuestsForDate(todayStr, phaseType);

  const tasks = state.calendar || [];
  let found = false;

  for (const t of tasks) {
    if (t.date === todayStr && t.status !== "completed") {
      if (phaseType === "phase1" && (t.phase === "Phase-1" || t.phase === "General") && (t.type === "Objective Exam" || t.type === "MCQ Practice")) {
        t.status = "completed";
        found = true;
        break;
      } else if (phaseType === "phase2" && t.phase === "Phase-2" && (t.type === "Subjective Exam" || t.type === "Descriptive Writing")) {
        t.status = "completed";
        found = true;
        break;
      }
    }
  }

  if (found) {
    saveCalendarSchedule();
  }
}

// Render single LeetCode calendar day cell
function renderLeetCodeDayCell(dayNum, dateStr, isOtherMonth, todayStr, selectedStr, isFinished, dayMeta, exams) {
  const isToday = dateStr === todayStr;
  const isSelected = dateStr === selectedStr;
  const dayType = dayMeta?.dayType || "normal-day";

  let dotHtml = "";
  if (dayType === "chapter-test") {
    dotHtml = `<span class="lc-type-dot ch-test" title="Chapter Test"></span>`;
  } else if (dayType === "mix-test") {
    dotHtml = `<span class="lc-type-dot mix-test" title="Mix Test"></span>`;
  } else if (dayType === "buffer-day") {
    dotHtml = `<span class="lc-type-dot buffer" title="Buffer Day"></span>`;
  }

  let tickHtml = "";
  if (isFinished) {
    tickHtml = `<span class="lc-tick-badge" title="Completed!">✓</span>`;
  }

  const classes = [
    "lc-day-cell",
    `day-type-${dayType}`,
    isFinished ? "is-finished" : "",
    isToday ? "is-today" : "",
    isSelected ? "is-selected" : "",
    isOtherMonth ? "is-other-month" : ""
  ].filter(Boolean).join(" ");

  return `
    <div class="${classes}" data-date="${dateStr}" data-day-type="${dayType}">
      <span class="lc-day-num">${dayNum}</span>
      ${tickHtml}
      ${dotHtml}
    </div>
  `;
}

// Render LeetCode monthly summary statistics below calendar
function renderLeetCodeMonthlyStats(phaseType, streakData) {
  const prefix = phaseType === "phase1" ? "p1" : "p2";
  const container = $(`${prefix}-leetcode-monthly-stats`);
  if (!container) return;

  const curDate = phaseType === "phase1" ? state.p1_calendar_currentDate : state.p2_calendar_currentDate;
  const year = curDate.getFullYear();
  const month = curDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let finishedInMonth = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (streakData.finishedDates && streakData.finishedDates.has(dStr)) {
      finishedInMonth++;
    }
  }
  const pct = Math.round((finishedInMonth / daysInMonth) * 100);

  container.innerHTML = `
    <div>
      <span style="font-weight:700; color:#1e293b;">${finishedInMonth} / ${daysInMonth} Days</span>
      <span style="color:#64748b; font-size:11px;"> finished (${pct}%)</span>
    </div>
    <div style="font-weight:600; color:#10b981;">
      ${streakData.currentStreak > 0 ? `🔥 ${streakData.currentStreak} d streak` : `⚡ Start streak`}
    </div>
  `;
}

// ============================================================
// PHASE 1 CALENDAR: OBJECTIVE DRILLS & EXAM MARKS
// ============================================================

function renderP1Calendar() {
  if (!state.calendar || state.calendar.length < 30) {
    state.calendar = generateDefaultSchedule();
    saveCalendarSchedule();
  }

  rebuildCalendarMetadata();
  renderP1CalendarSummary();

  const heading = $("p1-cal-month-year-display");
  if (heading) {
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const year = state.p1_calendar_currentDate.getFullYear();
    const month = state.p1_calendar_currentDate.getMonth();
    heading.textContent = `${monthNames[month]} ${year}`;
  }

  const planStartInput = $("p1-cal-upload-start-date");
  if (planStartInput && state.calendar_planStartDate) {
    planStartInput.value = state.calendar_planStartDate;
  }

  // Calculate streak & finished days
  const streakData = getCalendarStreak("phase1");

  // Update streak hero card
  const daysCount = $("p1-streak-days-count");
  if (daysCount) daysCount.textContent = streakData.currentStreak;
  const maxCount = $("p1-streak-max-count");
  if (maxCount) maxCount.textContent = streakData.maxStreak;
  const totalActive = $("p1-streak-total-active");
  if (totalActive) totalActive.textContent = streakData.totalActiveDays;

  const statusPill = $("p1-streak-status-pill");
  if (statusPill) {
    if (streakData.currentStreak > 0) {
      if (streakData.isTodayFinished) {
        statusPill.textContent = "🔥 Streak Active";
        statusPill.className = "streak-status-pill active";
      } else {
        statusPill.textContent = "⏳ Due Today";
        statusPill.className = "streak-status-pill pending";
      }
    } else {
      statusPill.textContent = "⚡ Start Streak";
      statusPill.className = "streak-status-pill";
    }
  }

  // Render minimal LeetCode calendar grid
  renderP1MonthGrid(streakData);

  // Render monthly stats
  renderLeetCodeMonthlyStats("phase1", streakData);

  // Render selected day's quests
  renderP1SelectedDayTasks();
}

function renderP1CalendarSummary() {
  const container = $("p1-calendar-progress-bar");
  if (!container) return;

  const tasks = (state.calendar || []).filter(t => t.phase === "Phase-1" || t.phase === "General");
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === "completed").length;
  const pending = total - completed;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const p1History = loadJSON("rbi_p1_history", []);
  const examsCount = p1History.length;
  const avgAcc = examsCount > 0 ? (p1History.reduce((a, b) => a + (Number(b.accuracy) || 0), 0) / examsCount).toFixed(1) : "0.0";

  container.innerHTML = `
    <div class="summary-stat-card">
      <div class="val">${total}</div>
      <div class="lbl">Phase-1 Scheduled Tasks</div>
    </div>
    <div class="summary-stat-card">
      <div class="val" style="color:#16a34a;">${completed} <span style="font-size:13px; font-weight:normal;">(${pct}%)</span></div>
      <div class="lbl">Tasks Completed</div>
    </div>
    <div class="summary-stat-card">
      <div class="val" style="color:#d97706;">${pending}</div>
      <div class="lbl">Tasks Pending</div>
    </div>
    <div class="summary-stat-card">
      <div class="val" style="color:#003366;">${examsCount} <span style="font-size:13px; font-weight:normal;">(${avgAcc}% Acc)</span></div>
      <div class="lbl">Objective Exams Logged</div>
    </div>
  `;
}

function renderP1MonthGrid(streakData) {
  const grid = $("p1-calendar-days-grid");
  if (!grid) return;

  const cur = state.p1_calendar_currentDate;
  const year = cur.getFullYear();
  const month = cur.getMonth();

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const todayStr = getLocalDateString(new Date());
  const selectedStr = state.p1_calendar_selectedDate;

  const p1ExamsMap = getPhase1ExamsByDate();
  const finishedDates = streakData ? streakData.finishedDates : new Set();

  let html = "";

  // 1. Preceding days from previous month
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    const prevDate = new Date(year, month - 1, dayNum);
    const dateStr = getLocalDateString(prevDate);
    const isFinished = finishedDates.has(dateStr);
    const dayMeta = getDayMetadata(dateStr);
    const dayExams = p1ExamsMap[dateStr] || [];
    html += renderLeetCodeDayCell(dayNum, dateStr, true, todayStr, selectedStr, isFinished, dayMeta, dayExams);
  }

  // 2. Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isFinished = finishedDates.has(dateStr);
    const dayMeta = getDayMetadata(dateStr);
    const dayExams = p1ExamsMap[dateStr] || [];
    html += renderLeetCodeDayCell(d, dateStr, false, todayStr, selectedStr, isFinished, dayMeta, dayExams);
  }

  // 3. Trailing days from next month
  const totalCells = firstDayOfWeek + daysInMonth;
  const remainder = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let d = 1; d <= remainder; d++) {
    const nextDate = new Date(year, month + 1, d);
    const dateStr = getLocalDateString(nextDate);
    const isFinished = finishedDates.has(dateStr);
    const dayMeta = getDayMetadata(dateStr);
    const dayExams = p1ExamsMap[dateStr] || [];
    html += renderLeetCodeDayCell(d, dateStr, true, todayStr, selectedStr, isFinished, dayMeta, dayExams);
  }

  grid.innerHTML = html;
}

function renderP1SelectedDayTasks() {
  const selDateStr = state.p1_calendar_selectedDate;
  ensureDailyQuestsForDate(selDateStr, "phase1");

  const heading = $("p1-cal-selected-date-heading");
  const dayNumBadge = $("p1-quest-daynum-badge");
  const dayTypeBadge = $("p1-quest-daytype-badge");
  const progressText = $("p1-quest-progress-text");
  const progressBarFill = $("p1-quest-progress-bar-fill");
  const chapterBanner = $("p1-quest-chapter-banner");
  const sub = $("p1-cal-selected-date-sub");
  const list = $("p1-cal-selected-day-tasks");

  const dateObj = new Date(selDateStr + "T00:00:00");
  const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  const humanDate = dateObj.toLocaleDateString(undefined, options);

  const dayMeta = getDayMetadata(selDateStr);
  const dayType = dayMeta?.dayType || "normal-day";

  let typeName = "📘 Normal Class";
  if (dayType === "chapter-test") typeName = "📝 Chapter Test";
  if (dayType === "mix-test") typeName = "🔥 Mix Test";
  if (dayType === "buffer-day") typeName = "⏳ Buffer Day";

  if (heading) heading.textContent = humanDate;
  if (dayNumBadge) dayNumBadge.textContent = dayMeta?.dayNum ? `Day ${dayMeta.dayNum} of 415` : "Custom Day";
  if (dayTypeBadge) {
    dayTypeBadge.className = `popover-type-badge ${dayType}`;
    dayTypeBadge.textContent = typeName;
  }

  // Chapter Banner
  if (chapterBanner) {
    if (dayMeta && (dayMeta.p1_topic || dayMeta.ca)) {
      chapterBanner.innerHTML = `
        <span class="banner-icon">🎯</span>
        <span class="banner-text">
          <strong>Today's Focus:</strong> ${escapeHTML(dayMeta.p1_topic || "Objective Speed Drill")}
          ${dayMeta.ca ? ` · <em>${escapeHTML(dayMeta.ca)}</em>` : ""}
        </span>
      `;
      chapterBanner.style.display = "flex";
    } else {
      chapterBanner.style.display = "none";
    }
  }

  const tasks = (state.calendar || []).filter(t => t.date === selDateStr && (t.phase === "Phase-1" || t.phase === "General"));
  const p1ExamsMap = getPhase1ExamsByDate();
  const dayExams = p1ExamsMap[selDateStr] || [];

  const total = tasks.length;
  const completed = tasks.filter(t => t.status === "completed").length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : (dayExams.length > 0 ? 100 : 0);

  if (progressText) progressText.textContent = `${completed} / ${total} Completed (${pct}%)`;
  if (progressBarFill) progressBarFill.style.width = `${pct}%`;
  if (sub) sub.textContent = `${total} quest(s) scheduled · ${dayExams.length} exam(s) taken`;

  if (!list) return;

  // Exam Score Cards
  let examCardsHTML = "";
  if (dayExams.length > 0) {
    examCardsHTML = dayExams.map(ex => {
      const scoreVal = Number(ex.score || 0).toFixed(1);
      const maxVal = Number(ex.maxScore || ex.totalQuestions || 50).toFixed(0);
      const pctVal = ex.percentage || Math.round((Number(ex.score || 0) / Number(maxVal)) * 100);
      return `
        <div class="daily-quest-card exam-score-card" style="border-left: 3.5px solid #10b981; background: #f0fdf4; margin-bottom: 10px;">
          <div style="font-size: 20px;">🏆</div>
          <div class="quest-card-content">
            <div class="quest-meta-row">
              <span class="quest-type-pill" style="background:#10b981; color:#fff;">Phase-1 Exam Taken</span>
              <span style="font-size:11.5px; font-weight:700; color:#047857;">${ex.accuracy}% Accuracy</span>
            </div>
            <div class="quest-title-text" style="color:#065f46; font-size:14.5px; font-weight:700;">
              Score: ${scoreVal} / ${maxVal} Marks (${pctVal}%)
            </div>
            <div style="font-size:11.5px; color:#047857; margin-top:2px;">
              🟩 ${ex.correctCount || 0} Correct · 🟥 ${ex.incorrectCount || 0} Incorrect · ⬜ ${ex.unattemptedCount || 0} Skipped · ⏱️ ${formatDuration(ex.durationSeconds || ex.timeSpent || 0)}
            </div>
          </div>
          <div class="quest-actions-row">
            <button type="button" class="btn-minimal-primary p1-review-exam-btn" data-id="${escapeHTML(ex.id)}" style="font-size:11px; padding:4px 10px;">📊 View History</button>
          </div>
        </div>
      `;
    }).join("");
  }

  if (tasks.length === 0 && dayExams.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; padding: 32px 16px; color: var(--muted); background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 8px;">
        <span style="font-size: 22px; display: block; margin-bottom: 6px;">🎯</span>
        <strong style="color: #334155; font-size: 13.5px; display: block;">No Quests for this day</strong>
        <p style="font-size: 12px; margin: 4px 0 0 0;">Add custom quests above to track your daily progress!</p>
      </div>
    `;
    return;
  }

  const questCardsHTML = tasks.map(t => {
    const isDone = t.status === "completed";
    let typeIcon = "📌";
    let typePillClass = "tag-general";
    if (t.type === "Objective Exam") { typeIcon = "🎯"; typePillClass = "tag-obj"; }
    else if (t.type === "Current Affairs") { typeIcon = "📰"; typePillClass = "tag-ca"; }
    else if (t.type === "Study / Reading") { typeIcon = "📖"; typePillClass = "tag-study"; }
    else if (t.type === "Revision") { typeIcon = "🔄"; typePillClass = "tag-rev"; }

    const practiceBtn = `<button type="button" class="btn-quest-action btn-quest-practice" data-action="practice-obj" data-phase="${t.phase}" data-topic="${escapeHTML(t.topic)}">▶ Practice</button>`;

    return `
      <div class="daily-quest-card ${isDone ? 'is-completed' : ''}" data-id="${t.id}">
        <label class="quest-checkbox-label">
          <input type="checkbox" class="quest-status-check" ${isDone ? 'checked' : ''} data-id="${t.id}">
          <span class="quest-custom-checkbox"></span>
        </label>
        <div class="quest-card-content">
          <div class="quest-meta-row">
            <span class="quest-type-pill ${typePillClass}">${typeIcon} ${escapeHTML(t.type || "Quest")}</span>
            ${t.subject ? `<span class="quest-subject-pill">${escapeHTML(t.subject)}</span>` : ""}
            ${t.time ? `<span class="quest-time-pill">⏱️ ${escapeHTML(t.time)}</span>` : ""}
          </div>
          <div class="quest-title-text">${escapeHTML(t.topic)}</div>
        </div>
        <div class="quest-actions-row">
          ${practiceBtn}
          <button type="button" class="btn-quest-action btn-quest-delete" data-action="delete" data-id="${t.id}" title="Delete Quest">✕</button>
        </div>
      </div>
    `;
  }).join("");

  list.innerHTML = examCardsHTML + questCardsHTML;
}

function buildP1PopoverHTML(dateStr, dayMeta, exams) {
  const dateObj = new Date(dateStr + "T00:00:00");
  const options = { weekday: "short", month: "short", day: "numeric", year: "numeric" };
  const formattedDate = dateObj.toLocaleDateString(undefined, options);

  const dayType = dayMeta?.dayType || "normal-day";
  let badgeLabel = "📘 Normal Class";
  if (dayType === "chapter-test") badgeLabel = "📝 Chapter Test";
  if (dayType === "mix-test") badgeLabel = "🔥 Mix Test";
  if (dayType === "buffer-day") badgeLabel = "⏳ Buffer Day";

  const dayTitle = dayMeta?.dayNum ? `Day ${dayMeta.dayNum} · ${formattedDate}` : formattedDate;
  const p1Topic = dayMeta?.p1_topic || "";
  const p1Sub = dayMeta?.p1_subject || "";
  const caTopic = dayMeta?.ca || "";

  let examSectionHTML = "";
  if (exams && exams.length > 0) {
    const latest = exams[0];
    const scoreVal = Number(latest.score || 0).toFixed(1);
    const maxVal = Number(latest.maxScore || latest.totalQuestions || 50).toFixed(0);
    const pctVal = latest.percentage || Math.round((Number(latest.score || 0) / Number(maxVal)) * 100);
    examSectionHTML = `
      <div class="popover-sec marks-sec">
        <div class="popover-sec-label" style="color:#065f46;">
          <span>🏆</span>
          <span>PHASE-1 EXAM SCORE</span>
        </div>
        <div class="popover-marks-row">
          <span class="marks-val">${scoreVal} / ${maxVal} Marks</span>
          <span style="font-size:12.5px; font-weight:700; color:#047857;">(${pctVal}%)</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="popover-header">
      <span class="popover-day-title">${escapeHTML(dayTitle)}</span>
      <span class="popover-type-badge ${dayType}">${escapeHTML(badgeLabel)}</span>
    </div>
    ${examSectionHTML}
    <div class="popover-sec p1">
      <div class="popover-sec-label">
        <span>🎯</span>
        <span>OBJECTIVE FOCUS</span>
        ${p1Sub ? `<span style="font-weight:normal; opacity:0.85;">· ${escapeHTML(p1Sub)}</span>` : ""}
      </div>
      <div class="popover-topic-text">${escapeHTML(p1Topic || "General Speed Drills")}</div>
    </div>
    ${caTopic ? `
    <div class="popover-sec ca">
      <div class="popover-sec-label">
        <span>📰</span>
        <span>CURRENT AFFAIRS</span>
      </div>
      <div class="popover-topic-text">${escapeHTML(caTopic)}</div>
    </div>
    ` : ""}
    <div class="popover-hint">Click day to view or edit daily quests</div>
  `;
}

function showP1CalendarHoverPopover(e, cell) {
  const popover = $("p1-calendar-hover-popover");
  if (!popover) return;
  const dateStr = cell.dataset.date;
  if (!dateStr) return;

  const dayMeta = getDayMetadata(dateStr);
  const p1ExamsMap = getPhase1ExamsByDate();
  const dayExams = p1ExamsMap[dateStr] || [];

  popover.innerHTML = buildP1PopoverHTML(dateStr, dayMeta, dayExams);
  popover.style.display = "block";
  popover.style.opacity = "1";
  positionCalendarPopover(e.clientX, e.clientY, popover);
}

function hideP1CalendarHoverPopover() {
  const popover = $("p1-calendar-hover-popover");
  if (popover) popover.style.display = "none";
}

// ============================================================
// PHASE 2 CALENDAR: DESCRIPTIVE WRITING & EXAM MARKS
// ============================================================

function renderP2Calendar() {
  if (!state.calendar || state.calendar.length < 30) {
    state.calendar = generateDefaultSchedule();
    saveCalendarSchedule();
  }

  rebuildCalendarMetadata();
  renderP2CalendarSummary();

  const heading = $("p2-cal-month-year-display");
  if (heading) {
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const year = state.p2_calendar_currentDate.getFullYear();
    const month = state.p2_calendar_currentDate.getMonth();
    heading.textContent = `${monthNames[month]} ${year}`;
  }

  const planStartInput = $("p2-cal-upload-start-date");
  if (planStartInput && state.calendar_planStartDate) {
    planStartInput.value = state.calendar_planStartDate;
  }

  // Calculate streak & finished days
  const streakData = getCalendarStreak("phase2");

  // Update streak hero card
  const daysCount = $("p2-streak-days-count");
  if (daysCount) daysCount.textContent = streakData.currentStreak;
  const maxCount = $("p2-streak-max-count");
  if (maxCount) maxCount.textContent = streakData.maxStreak;
  const totalActive = $("p2-streak-total-active");
  if (totalActive) totalActive.textContent = streakData.totalActiveDays;

  const statusPill = $("p2-streak-status-pill");
  if (statusPill) {
    if (streakData.currentStreak > 0) {
      if (streakData.isTodayFinished) {
        statusPill.textContent = "🔥 Streak Active";
        statusPill.className = "streak-status-pill active";
      } else {
        statusPill.textContent = "⏳ Due Today";
        statusPill.className = "streak-status-pill pending";
      }
    } else {
      statusPill.textContent = "⚡ Start Streak";
      statusPill.className = "streak-status-pill";
    }
  }

  // Render minimal LeetCode calendar grid
  renderP2MonthGrid(streakData);

  // Render monthly stats
  renderLeetCodeMonthlyStats("phase2", streakData);

  // Render selected day's quests
  renderP2SelectedDayTasks();
}

function renderP2CalendarSummary() {
  const container = $("p2-calendar-progress-bar");
  if (!container) return;

  const tasks = (state.calendar || []).filter(t => t.phase === "Phase-2");
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === "completed").length;
  const pending = total - completed;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const p2History = loadJSON("rbi_history", []);
  const testsCount = p2History.length;
  const scoredCount = p2History.filter(t => t.totalScore !== undefined && t.totalScore !== null && !isNaN(t.totalScore) && Number(t.totalScore) > 0).length;

  container.innerHTML = `
    <div class="summary-stat-card">
      <div class="val">${total}</div>
      <div class="lbl">Phase-2 Scheduled Tasks</div>
    </div>
    <div class="summary-stat-card">
      <div class="val" style="color:#16a34a;">${completed} <span style="font-size:13px; font-weight:normal;">(${pct}%)</span></div>
      <div class="lbl">Tasks Completed</div>
    </div>
    <div class="summary-stat-card">
      <div class="val" style="color:#d97706;">${pending}</div>
      <div class="lbl">Tasks Pending</div>
    </div>
    <div class="summary-stat-card">
      <div class="val" style="color:#7e22ce;">${testsCount} <span style="font-size:13px; font-weight:normal;">(${scoredCount} Scored)</span></div>
      <div class="lbl">Descriptive Tests Written</div>
    </div>
  `;
}

function renderP2MonthGrid(streakData) {
  const grid = $("p2-calendar-days-grid");
  if (!grid) return;

  const cur = state.p2_calendar_currentDate;
  const year = cur.getFullYear();
  const month = cur.getMonth();

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const todayStr = getLocalDateString(new Date());
  const selectedStr = state.p2_calendar_selectedDate;

  const p2ExamsMap = getPhase2ExamsByDate();
  const finishedDates = streakData ? streakData.finishedDates : new Set();

  let html = "";

  // 1. Preceding days from previous month
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    const prevDate = new Date(year, month - 1, dayNum);
    const dateStr = getLocalDateString(prevDate);
    const isFinished = finishedDates.has(dateStr);
    const dayMeta = getDayMetadata(dateStr);
    const dayExams = p2ExamsMap[dateStr] || [];
    html += renderLeetCodeDayCell(dayNum, dateStr, true, todayStr, selectedStr, isFinished, dayMeta, dayExams);
  }

  // 2. Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isFinished = finishedDates.has(dateStr);
    const dayMeta = getDayMetadata(dateStr);
    const dayExams = p2ExamsMap[dateStr] || [];
    html += renderLeetCodeDayCell(d, dateStr, false, todayStr, selectedStr, isFinished, dayMeta, dayExams);
  }

  // 3. Trailing days from next month
  const totalCells = firstDayOfWeek + daysInMonth;
  const remainder = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let d = 1; d <= remainder; d++) {
    const nextDate = new Date(year, month + 1, d);
    const dateStr = getLocalDateString(nextDate);
    const isFinished = finishedDates.has(dateStr);
    const dayMeta = getDayMetadata(dateStr);
    const dayExams = p2ExamsMap[dateStr] || [];
    html += renderLeetCodeDayCell(d, dateStr, true, todayStr, selectedStr, isFinished, dayMeta, dayExams);
  }

  grid.innerHTML = html;
}

function renderP2SelectedDayTasks() {
  const selDateStr = state.p2_calendar_selectedDate;
  ensureDailyQuestsForDate(selDateStr, "phase2");

  const heading = $("p2-cal-selected-date-heading");
  const dayNumBadge = $("p2-quest-daynum-badge");
  const dayTypeBadge = $("p2-quest-daytype-badge");
  const progressText = $("p2-quest-progress-text");
  const progressBarFill = $("p2-quest-progress-bar-fill");
  const chapterBanner = $("p2-quest-chapter-banner");
  const sub = $("p2-cal-selected-date-sub");
  const list = $("p2-cal-selected-day-tasks");

  const dateObj = new Date(selDateStr + "T00:00:00");
  const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  const humanDate = dateObj.toLocaleDateString(undefined, options);

  const dayMeta = getDayMetadata(selDateStr);
  const dayType = dayMeta?.dayType || "normal-day";

  let typeName = "📘 Normal Class";
  if (dayType === "chapter-test") typeName = "📝 Chapter Test";
  if (dayType === "mix-test") typeName = "🔥 Mix Test";
  if (dayType === "buffer-day") typeName = "⏳ Buffer Day";

  if (heading) heading.textContent = humanDate;
  if (dayNumBadge) dayNumBadge.textContent = dayMeta?.dayNum ? `Day ${dayMeta.dayNum} of 415` : "Custom Day";
  if (dayTypeBadge) {
    dayTypeBadge.className = `popover-type-badge ${dayType}`;
    dayTypeBadge.textContent = typeName;
  }

  // Chapter Banner
  if (chapterBanner) {
    if (dayMeta && (dayMeta.p2_topic || dayMeta.p2_subject)) {
      chapterBanner.innerHTML = `
        <span class="banner-icon">📖</span>
        <span class="banner-text">
          <strong>Today's Focus:</strong> ${escapeHTML(dayMeta.p2_topic || "Phase-2 Focus")}
          ${dayMeta.p2_subject ? ` · <em>${escapeHTML(dayMeta.p2_subject)}</em>` : ""}
        </span>
      `;
      chapterBanner.style.display = "flex";
    } else {
      chapterBanner.style.display = "none";
    }
  }

  const tasks = (state.calendar || []).filter(t => t.date === selDateStr && t.phase === "Phase-2");
  const p2ExamsMap = getPhase2ExamsByDate();
  const dayExams = p2ExamsMap[selDateStr] || [];

  const total = tasks.length;
  const completed = tasks.filter(t => t.status === "completed").length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : (dayExams.length > 0 ? 100 : 0);

  if (progressText) progressText.textContent = `${completed} / ${total} Completed (${pct}%)`;
  if (progressBarFill) progressBarFill.style.width = `${pct}%`;
  if (sub) sub.textContent = `${total} quest(s) scheduled · ${dayExams.length} written test(s)`;

  if (!list) return;

  // Exam Score Cards
  let examCardsHTML = "";
  if (dayExams.length > 0) {
    examCardsHTML = dayExams.map(test => {
      const hasScore = test.totalScore !== undefined && test.totalScore !== null && !isNaN(test.totalScore) && Number(test.totalScore) > 0;
      const totalWords = Object.values(test.answers || {}).reduce((acc, a) => acc + (a.wordCount || 0), 0);
      const scoreLabel = hasScore ? `Score: ${Number(test.totalScore).toFixed(1)} / ${Number(test.maxMarks || 25).toFixed(0)} Marks` : "Score Pending Evaluation";

      return `
        <div class="daily-quest-card exam-score-card" style="border-left: 3.5px solid #9333ea; background: #faf5ff; margin-bottom: 10px;">
          <div style="font-size: 20px;">🏆</div>
          <div class="quest-card-content">
            <div class="quest-meta-row">
              <span class="quest-type-pill" style="background:#9333ea; color:#fff;">Phase-2 Submission</span>
              <span style="font-size:11.5px; font-weight:700; color:#7e22ce;">${totalWords} Words Written</span>
            </div>
            <div class="quest-title-text" style="color:#581c87; font-size:14.5px; font-weight:700;">
              ${escapeHTML(scoreLabel)}
            </div>
            <div style="font-size:11.5px; color:#6b21a8; margin-top:2px;">
              ${(test.questions || []).length} Question(s) · Time used: ${formatDuration(test.usedSeconds || 0)} of ${test.totalMinutes || 30} min${test.autoSubmitted ? ' (auto-submitted)' : ''}
            </div>
          </div>
          <div class="quest-actions-row">
            <button type="button" class="btn-minimal-primary p2-review-exam-btn" data-test-id="${escapeHTML(test.id)}" style="font-size:11px; padding:4px 10px;">📖 Review Answers</button>
          </div>
        </div>
      `;
    }).join("");
  }

  if (tasks.length === 0 && dayExams.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; padding: 32px 16px; color: var(--muted); background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 8px;">
        <span style="font-size: 22px; display: block; margin-bottom: 6px;">✍️</span>
        <strong style="color: #334155; font-size: 13.5px; display: block;">No Quests for this day</strong>
        <p style="font-size: 12px; margin: 4px 0 0 0;">Add custom quests above to track your daily progress!</p>
      </div>
    `;
    return;
  }

  const questCardsHTML = tasks.map(t => {
    const isDone = t.status === "completed";
    let typeIcon = "📌";
    let typePillClass = "tag-general";
    let practiceBtn = "";

    if (t.type === "Objective Exam") {
      typeIcon = "🎯";
      typePillClass = "tag-obj";
      practiceBtn = `<button type="button" class="btn-quest-action btn-quest-practice" data-action="practice-obj" data-phase="Phase-2" data-topic="${escapeHTML(t.topic)}">▶ Quiz</button>`;
    } else if (t.type === "Subjective Exam" || t.type === "Descriptive Writing") {
      typeIcon = "✍️";
      typePillClass = "tag-sub";
      practiceBtn = `<button type="button" class="btn-quest-action btn-quest-practice" data-action="practice-p2-sub" data-topic="${escapeHTML(t.topic)}" data-subject="${escapeHTML(t.subject || '')}">▶ Write Answer</button>`;
    } else if (t.type === "Study / Reading") {
      typeIcon = "📖";
      typePillClass = "tag-study";
    } else if (t.type === "Revision") {
      typeIcon = "🔄";
      typePillClass = "tag-rev";
    }

    return `
      <div class="daily-quest-card ${isDone ? 'is-completed' : ''}" data-id="${t.id}">
        <label class="quest-checkbox-label">
          <input type="checkbox" class="quest-status-check" ${isDone ? 'checked' : ''} data-id="${t.id}">
          <span class="quest-custom-checkbox"></span>
        </label>
        <div class="quest-card-content">
          <div class="quest-meta-row">
            <span class="quest-type-pill ${typePillClass}">${typeIcon} ${escapeHTML(t.type || "Quest")}</span>
            ${t.subject ? `<span class="quest-subject-pill">${escapeHTML(t.subject)}</span>` : ""}
            ${t.time ? `<span class="quest-time-pill">⏱️ ${escapeHTML(t.time)}</span>` : ""}
          </div>
          <div class="quest-title-text">${escapeHTML(t.topic)}</div>
        </div>
        <div class="quest-actions-row">
          ${practiceBtn}
          <button type="button" class="btn-quest-action btn-quest-delete" data-action="delete" data-id="${t.id}" title="Delete Quest">✕</button>
        </div>
      </div>
    `;
  }).join("");

  list.innerHTML = examCardsHTML + questCardsHTML;
}

function buildP2PopoverHTML(dateStr, dayMeta, exams) {
  const dateObj = new Date(dateStr + "T00:00:00");
  const options = { weekday: "short", month: "short", day: "numeric", year: "numeric" };
  const formattedDate = dateObj.toLocaleDateString(undefined, options);

  const dayType = dayMeta?.dayType || "normal-day";
  let badgeLabel = "📘 Normal Class";
  if (dayType === "chapter-test") badgeLabel = "📝 Chapter Test";
  if (dayType === "mix-test") badgeLabel = "🔥 Mix Test";
  if (dayType === "buffer-day") badgeLabel = "⏳ Buffer Day";

  const dayTitle = dayMeta?.dayNum ? `Day ${dayMeta.dayNum} · ${formattedDate}` : formattedDate;
  const p2Topic = dayMeta?.p2_topic || "";
  const p2Sub = dayMeta?.p2_subject || "";

  let examSectionHTML = "";
  if (exams && exams.length > 0) {
    const test = exams[0];
    const hasScore = test.totalScore !== undefined && test.totalScore !== null && !isNaN(test.totalScore) && Number(test.totalScore) > 0;
    const totalWords = Object.values(test.answers || {}).reduce((acc, a) => acc + (a.wordCount || 0), 0);
    const scoreVal = hasScore ? `${Number(test.totalScore).toFixed(1)} / ${Number(test.maxMarks || 25).toFixed(0)} Marks` : "Written (Score Pending)";

    examSectionHTML = `
      <div class="popover-sec marks-sec p2">
        <div class="popover-sec-label" style="color:#6b21a8;">
          <span>🏆</span>
          <span>PHASE-2 WRITING LOG</span>
        </div>
        <div class="popover-marks-row">
          <span class="marks-val">${scoreVal}</span>
          <span style="font-size:12px; color:#6b21a8;">· ${totalWords} words</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="popover-header">
      <span class="popover-day-title">${escapeHTML(dayTitle)}</span>
      <span class="popover-type-badge ${dayType}">${escapeHTML(badgeLabel)}</span>
    </div>
    ${examSectionHTML}
    <div class="popover-sec p2">
      <div class="popover-sec-label">
        <span>📖</span>
        <span>DESCRIPTIVE FOCUS</span>
        ${p2Sub ? `<span style="font-weight:normal; opacity:0.85;">· ${escapeHTML(p2Sub)}</span>` : ""}
      </div>
      <div class="popover-topic-text">${escapeHTML(p2Topic || "Phase-2 Descriptive Writing")}</div>
    </div>
    <div class="popover-hint">Click day to view or edit daily quests</div>
  `;
}

function showP2CalendarHoverPopover(e, cell) {
  const popover = $("p2-calendar-hover-popover");
  if (!popover) return;
  const dateStr = cell.dataset.date;
  if (!dateStr) return;

  const dayMeta = getDayMetadata(dateStr);
  const p2ExamsMap = getPhase2ExamsByDate();
  const dayExams = p2ExamsMap[dateStr] || [];

  popover.innerHTML = buildP2PopoverHTML(dateStr, dayMeta, dayExams);
  popover.style.display = "block";
  popover.style.opacity = "1";
  positionCalendarPopover(e.clientX, e.clientY, popover);
}

function hideP2CalendarHoverPopover() {
  const popover = $("p2-calendar-hover-popover");
  if (popover) popover.style.display = "none";
}


// Dynamically position hover popover keeping it inside viewport
function positionCalendarPopover(mouseX, mouseY, popover) {
  const pad = 14;
  const popRect = popover.getBoundingClientRect();
  const popW = popRect.width || 350;
  const popH = popRect.height || 220;

  let left = mouseX + pad;
  let top = mouseY + pad;

  if (left + popW > window.innerWidth - 12) {
    left = mouseX - popW - pad;
  }
  if (left < 10) left = 10;

  if (top + popH > window.innerHeight - 12) {
    top = mouseY - popH - pad;
  }
  if (top < 10) top = 10;

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

// ============================================================
// CALENDAR ACTIONS: UPLOAD, APPLY CONFIG, EXPORT, TEMPLATE
// ============================================================

// Dynamic Excel / CSV Import with start date and days finished config
async function handleCalendarExcelImport(event, phaseType = null) {
  const pType = phaseType || (state.phase === "phase1" ? "phase1" : "phase2");
  const prefix = pType === "phase1" ? "p1" : "p2";
  const statusElem = $(`${prefix}-calendar-import-status`);
  const file = event.target && event.target.files && event.target.files[0];
  if (!file) return;

  if (statusElem) {
    statusElem.textContent = `Reading ${file.name}...`;
    statusElem.style.color = "var(--primary)";
  }

  try {
    let rows = [];
    const isXLSX = /\.xlsx$/i.test(file.name) || /\.xls$/i.test(file.name);

    if (isXLSX) {
      const buffer = await file.arrayBuffer();
      try {
        rows = await parseXLSX(buffer);
      } catch (xlsxErr) {
        const text = await file.text();
        rows = parseCSV(text);
      }
    } else {
      const text = await file.text();
      rows = parseCSV(text);
    }

    if (!rows || rows.length < 2) {
      throw new Error("Spreadsheet contains no data rows or could not be parsed.");
    }

    const startDateInput = $(`${prefix}-cal-upload-start-date`);
    const daysFinishedInput = $(`${prefix}-cal-upload-days-finished`);
    const startStr = (startDateInput && startDateInput.value) || state.calendar_planStartDate || "2026-11-01";
    const daysFinished = (daysFinishedInput && parseInt(daysFinishedInput.value, 10)) || 0;

    const importedTasks = mapScheduleRowsToTasks(rows, startStr, daysFinished);
    if (importedTasks.length === 0) {
      throw new Error("No tasks could be mapped. Please ensure columns include Day/Date, Topic, and Subject.");
    }

    // Merge or replace
    const existing = state.calendar || [];
    let merged = [];
    if (existing.length > 0 && confirm(`Imported ${importedTasks.length} task(s) from "${file.name}". Do you want to REPLACE your existing schedule? (Click Cancel to MERGE with current schedule)`)) {
      merged = importedTasks;
    } else {
      merged = existing.concat(importedTasks);
    }

    state.calendar = merged;
    saveCalendarSchedule();

    if (statusElem) {
      statusElem.textContent = `✓ Successfully imported ${importedTasks.length} task(s) starting ${startStr} (first ${daysFinished} days marked completed)!`;
      setTimeout(() => { statusElem.textContent = ""; }, 5000);
    }

    event.target.value = "";

    if (pType === "phase1") {
      renderP1Calendar();
    } else {
      renderP2Calendar();
    }
  } catch (err) {
    console.error("Calendar import error:", err);
    if (statusElem) {
      statusElem.textContent = `Import error: ${err.message}`;
      statusElem.style.color = "var(--danger)";
    }
  }
}

// Apply Starting Date and Finished Days configuration to schedule
function applyCalendarConfig(phaseType = null) {
  const pType = phaseType || (state.phase === "phase1" ? "phase1" : "phase2");
  const prefix = pType === "phase1" ? "p1" : "p2";

  const startDateInput = $(`${prefix}-cal-upload-start-date`);
  const daysFinishedInput = $(`${prefix}-cal-upload-days-finished`);
  const startStr = (startDateInput && startDateInput.value) || state.calendar_planStartDate || "2026-11-01";
  const daysFinished = (daysFinishedInput && parseInt(daysFinishedInput.value, 10)) || 0;

  state.calendar_planStartDate = startStr;
  saveJSON("rbi_calendar_start_date", startStr);
  if (pType === "phase1") {
    state.p1_calendar_daysFinished = daysFinished;
    saveJSON("rbi_p1_days_finished", daysFinished);
  } else {
    state.p2_calendar_daysFinished = daysFinished;
    saveJSON("rbi_p2_days_finished", daysFinished);
  }

  // Reschedule official or existing schedule from new starting date
  state.calendar = generateDefaultSchedule(startStr, daysFinished);
  saveCalendarSchedule();

  const statusElem = $(`${prefix}-calendar-import-status`);
  if (statusElem) {
    statusElem.textContent = `✓ Plan rescheduled starting from ${startStr} (Days 1-${daysFinished} marked completed)!`;
    statusElem.style.color = "#059669";
    setTimeout(() => { statusElem.textContent = ""; }, 5000);
  }

  // Sync inputs on both screens
  const p1Start = $("p1-cal-upload-start-date");
  const p2Start = $("p2-cal-upload-start-date");
  if (p1Start) p1Start.value = startStr;
  if (p2Start) p2Start.value = startStr;

  if (pType === "phase1") {
    renderP1Calendar();
  } else {
    renderP2Calendar();
  }
}

// Load official 415-Day Schedule
function loadOfficialSchedule(phaseType = null) {
  const pType = phaseType || (state.phase === "phase1" ? "phase1" : "phase2");
  const prefix = pType === "phase1" ? "p1" : "p2";

  if (state.calendar && state.calendar.length > 0) {
    if (!confirm("Load the official 415-Day RBI Grade B Preparation Schedule? This will update your calendar schedule.")) return;
  }

  const startDateInput = $(`${prefix}-cal-upload-start-date`);
  const daysFinishedInput = $(`${prefix}-cal-upload-days-finished`);
  const startStr = (startDateInput && startDateInput.value) || state.calendar_planStartDate || "2026-11-01";
  const daysFinished = (daysFinishedInput && parseInt(daysFinishedInput.value, 10)) || 0;

  state.calendar_planStartDate = startStr;
  saveJSON("rbi_calendar_start_date", startStr);
  state.calendar = generateDefaultSchedule(startStr, daysFinished);
  saveCalendarSchedule();

  if (pType === "phase1") {
    renderP1Calendar();
  } else {
    renderP2Calendar();
  }

  const statusElem = $(`${prefix}-calendar-import-status`);
  if (statusElem) {
    statusElem.textContent = `✓ Loaded Official 415-Day RBI Schedule starting ${startStr} (88 Chapter Tests, 30 Mix Tests, 23 Buffer Days)!`;
    setTimeout(() => { statusElem.textContent = ""; }, 5000);
  }
}

// Download ready-to-use spreadsheet CSV template
function downloadScheduleTemplate() {
  const csvContent =
`Day,Subject (Phase-2),Topic (Phase-2),Status,Subject (Phase-1),Topic (Phase-1),Status,Current Affairs,Status
1,Economics,National Income - Class 1,completed,English Objective,Basics of Grammar - Class 1,completed,,
2,Economics,National Income - Class 2,completed,English Objective,Basics of Grammar - Class 2,completed,,
3,Economics,National Income - Class 3,pending,English Objective,Basics of Grammar - Class 3,pending,Spotlight Nov 1-6 Current Affairs (50 MCQs),pending
4,Economics,National Income - Class 4,pending,English Objective,Subject Verb Agreement - Class 1,pending,,
5,Economics,National Income Chapter Test 1,pending,English Objective,Subject Verb Agreement - Class 2,pending,,
6,Economics,National Income Chapter Test 2,pending,Reasoning Ability,Puzzles & Circular Seating,pending,Spotlight Nov 7-12 Current Affairs,pending
7,Buffer Day,Buffer Day (Economics & English Revision),pending,Buffer Day,Buffer Day (GA Drills & Vocabulary),pending,,
8,Finance,Financial System in India - Structure & RBI Functions,pending,Quantitative Aptitude,Percentage & Ratio Proportion,pending,,
9,Finance,Financial System in India - Banking Structure,pending,Quantitative Aptitude,Data Interpretation Basics,pending,,
10,Phase-2 Mix,Economics & Finance Mix Test 1,pending,Phase-1 Mix,Reasoning & Quant Mix Speed Test 1,pending,Spotlight Nov 13-18 Current Affairs,pending`;

  downloadText("RBI_Grade_B_Schedule_Template.csv", csvContent);
}

// Export current schedule as CSV
function exportScheduleCSV() {
  const tasks = state.calendar || [];
  if (tasks.length === 0) {
    alert("No tasks currently scheduled to export.");
    return;
  }

  let csv = "Date,DayNum,Phase,Subject,Topic,Type,Time,Status\n";
  for (const t of tasks) {
    const escapeCsv = (str) => `"${String(str || "").replace(/"/g, '""')}"`;
    csv += `${escapeCsv(t.date)},${t.dayNum || ""},${escapeCsv(t.phase)},${escapeCsv(t.subject)},${escapeCsv(t.topic)},${escapeCsv(t.type)},${escapeCsv(t.time)},${escapeCsv(t.status)}\n`;
  }

  downloadText(`RBI_Study_Schedule_${getLocalDateString(new Date())}.csv`, csv);
}

// Clear all scheduled tasks
function clearSchedule(phaseType = null) {
  if (!confirm("Are you sure you want to clear your study schedule?")) return;
  state.calendar = [];
  saveCalendarSchedule();

  if (phaseType === "phase1" || state.phase === "phase1") {
    renderP1Calendar();
  } else {
    renderP2Calendar();
  }
}

// Toggle completion state of a task
function toggleTaskComplete(id, phaseType = null) {
  const tasks = state.calendar || [];
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.status = task.status === "completed" ? "pending" : "completed";
  saveCalendarSchedule();

  if (phaseType === "phase1" || state.phase === "phase1") {
    renderP1Calendar();
  } else {
    renderP2Calendar();
  }
}

// Delete a single task
function deleteTask(id, phaseType = null) {
  if (!confirm("Delete this scheduled task?")) return;
  state.calendar = (state.calendar || []).filter(t => t.id !== id);
  saveCalendarSchedule();

  if (phaseType === "phase1" || state.phase === "phase1") {
    renderP1Calendar();
  } else {
    renderP2Calendar();
  }
}

// Open modal to add or edit task
function openTaskModal(taskToEdit = null, phaseType = null) {
  const modal = $("modal-task");
  if (!modal) return;

  const dateInput = $("task-input-date");
  const phaseInput = $("task-input-phase");
  const typeInput = $("task-input-type");
  const subjectInput = $("task-input-subject");
  const timeInput = $("task-input-time");
  const topicInput = $("task-input-topic");
  const editIdInput = $("task-input-edit-id");
  const title = $("modal-task-title");

  const defaultPhase = phaseType || (state.phase === "phase1" ? "Phase-1" : "Phase-2");

  if (taskToEdit) {
    title.textContent = "Edit Scheduled Task";
    dateInput.value = taskToEdit.date || (defaultPhase === "Phase-1" ? state.p1_calendar_selectedDate : state.p2_calendar_selectedDate);
    phaseInput.value = taskToEdit.phase || defaultPhase;
    typeInput.value = taskToEdit.type || (defaultPhase === "Phase-1" ? "MCQ Practice" : "Descriptive Writing");
    subjectInput.value = taskToEdit.subject || "";
    timeInput.value = taskToEdit.time || "";
    topicInput.value = taskToEdit.topic || "";
    editIdInput.value = taskToEdit.id;
  } else {
    title.textContent = "Add Scheduled Task";
    dateInput.value = (defaultPhase === "Phase-1" ? state.p1_calendar_selectedDate : state.p2_calendar_selectedDate) || getLocalDateString(new Date());
    phaseInput.value = defaultPhase;
    typeInput.value = defaultPhase === "Phase-1" ? "MCQ Practice" : "Descriptive Writing";
    subjectInput.value = defaultPhase === "Phase-1" ? "General Awareness" : "ESI";
    timeInput.value = defaultPhase === "Phase-1" ? "02:00 PM" : "10:00 AM";
    topicInput.value = "";
    editIdInput.value = "";
  }

  modal.style.display = "flex";
}

// Close task modal
function closeTaskModal() {
  const modal = $("modal-task");
  if (modal) modal.style.display = "none";
}

// Save task from modal form
function handleTaskFormSubmit(e) {
  e.preventDefault();
  const date = $("task-input-date").value;
  const phase = $("task-input-phase").value;
  const type = $("task-input-type").value;
  const subject = sanitizeDashes($("task-input-subject").value.trim());
  const time = $("task-input-time").value.trim();
  const topic = sanitizeDashes($("task-input-topic").value.trim());
  const editId = $("task-input-edit-id").value;

  if (!date || !topic || !subject) {
    alert("Please fill in Date, Subject, and Topic.");
    return;
  }

  const tasks = state.calendar || [];
  if (editId) {
    const idx = tasks.findIndex(t => t.id === editId);
    if (idx !== -1) {
      tasks[idx].date = date;
      tasks[idx].phase = phase;
      tasks[idx].type = type;
      tasks[idx].subject = subject;
      tasks[idx].time = time;
      tasks[idx].topic = topic;
    }
  } else {
    tasks.push({
      id: makeId("task"),
      date: date,
      phase: phase,
      type: type,
      subject: subject,
      time: time,
      topic: topic,
      status: "pending"
    });
    if (phase === "Phase-1") {
      state.p1_calendar_selectedDate = date;
    } else {
      state.p2_calendar_selectedDate = date;
    }
  }

  state.calendar = tasks;
  saveCalendarSchedule();
  closeTaskModal();

  if (phase === "Phase-1" || state.phase === "phase1") {
    renderP1Calendar();
  } else {
    renderP2Calendar();
  }
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

  const navBank = $("nav-bank");
  if (navBank) {
    navBank.addEventListener("click", () => {
      if (state.phase === "phase1") {
        renderP1Bank();
      } else {
        renderBank();
      }
      showScreen("bank");
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
          toggleRevBtn.textContent = isHidden ? "📖 Hide Answers & Marks" : "📖 Review Answers & Marks";
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

  // Question Bank Screen
  const bankSearch = $("bank-search");
  if (bankSearch) {
    bankSearch.addEventListener("input", () => {
      state.bank_page = 1;
      renderBank();
    });
  }

  const bankFilter = $("bank-filter-paper");
  if (bankFilter) {
    bankFilter.addEventListener("change", () => {
      state.bank_page = 1;
      renderBank();
    });
  }

  const btnBankRandom = $("btn-bank-random");
  if (btnBankRandom) {
    btnBankRandom.addEventListener("click", handleAddRandomQuestions);
  }

  const bankSelectAll = $("bank-select-all");
  if (bankSelectAll) {
    bankSelectAll.addEventListener("change", handleSelectAllBank);
  }

  const btnBankDeleteSelected = $("btn-bank-delete-selected");
  if (btnBankDeleteSelected) {
    btnBankDeleteSelected.addEventListener("click", handleDeleteSelectedBank);
  }

  const btnBankAddSelected = $("btn-bank-add-selected");
  if (btnBankAddSelected) {
    btnBankAddSelected.addEventListener("click", handleAddSelectedBank);
  }

  const bankList = $("bank-list");
  if (bankList) {
    bankList.addEventListener("change", (e) => {
      if (e.target && e.target.classList.contains("bank-select-check")) {
        updateBankBatchState();
      }
    });

    bankList.addEventListener("click", (e) => {
      const addBtn = e.target.closest(".btn-bank-add");
      if (addBtn) {
        addQuestionFromBank(addBtn.dataset.id, addBtn);
        return;
      }
      const editBtn = e.target.closest(".btn-bank-edit");
      if (editBtn) {
        editBankQuestion(editBtn.dataset.id);
        return;
      }
      const delBtn = e.target.closest(".btn-bank-delete");
      if (delBtn) {
        deleteBankQuestion(delBtn.dataset.id);
        return;
      }
    });
  }

  const btnBankExport = $("btn-bank-export");
  if (btnBankExport) {
    btnBankExport.addEventListener("click", handleBankExport);
  }

  const bankImport = $("bank-import");
  if (bankImport) {
    bankImport.addEventListener("change", handleBankImport);
  }

  const bankDocImport = $("bank-doc-import");
  if (bankDocImport) {
    bankDocImport.addEventListener("change", (e) => handleDocImport(e, "bank"));
  }

  const btnBankClearAll = $("btn-bank-clear-all");
  if (btnBankClearAll) {
    btnBankClearAll.addEventListener("click", handleClearAllBank);
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
  document.querySelectorAll(".p1-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".p1-filter-btn").forEach(b => b.classList.remove("active"));
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

  // Phase-1 Bank Events
  const btnP1Random20 = $("btn-p1-bank-random-20");
  if (btnP1Random20) {
    btnP1Random20.addEventListener("click", () => addP1RandomQuestions(20));
  }

  const btnP1Random50 = $("btn-p1-bank-random-50");
  if (btnP1Random50) {
    btnP1Random50.addEventListener("click", () => addP1RandomQuestions(50));
  }

  const p1BankSearch = $("p1-bank-search");
  if (p1BankSearch) {
    p1BankSearch.addEventListener("input", () => {
      state.p1_bank_page = 1;
      renderP1Bank();
    });
  }

  const p1BankFilter = $("p1-bank-filter-subject");
  if (p1BankFilter) {
    p1BankFilter.addEventListener("change", () => {
      state.p1_bank_page = 1;
      renderP1Bank();
    });
  }

  const p1BankSelectAll = $("p1-bank-select-all");
  if (p1BankSelectAll) {
    p1BankSelectAll.addEventListener("change", handleP1BankSelectAll);
  }

  const btnP1BankDeleteSelected = $("btn-p1-bank-delete-selected");
  if (btnP1BankDeleteSelected) {
    btnP1BankDeleteSelected.addEventListener("click", handleP1BankDeleteSelected);
  }

  const btnP1BankAddSelected = $("btn-p1-bank-add-selected");
  if (btnP1BankAddSelected) {
    btnP1BankAddSelected.addEventListener("click", handleP1BankAddSelected);
  }

  const p1BankList = $("p1-bank-list");
  if (p1BankList) {
    p1BankList.addEventListener("change", (e) => {
      if (e.target && e.target.classList.contains("p1-bank-select-check")) {
        updateP1BankBatchState();
      }
    });

    p1BankList.addEventListener("click", (e) => {
      const addBtn = e.target.closest(".btn-p1-bank-add");
      if (addBtn) {
        const id = addBtn.dataset.id;
        const bank = loadJSON("rbi_p1_bank", []);
        const q = bank.find(x => x.id === id);
        if (q) {
          if (!state.p1_setup.questions.some(sq => sq.id === q.id || sq.text === q.text)) {
            state.p1_setup.questions.push({ ...q });
            saveP1Setup();
            renderP1SetupList();
            addBtn.textContent = "Added ✓";
            setTimeout(() => { addBtn.textContent = "+ Add to Test"; }, 1500);
          } else {
            alert("This MCQ is already in today's test!");
          }
        }
        return;
      }

      const delBtn = e.target.closest(".btn-p1-bank-delete");
      if (delBtn) {
        const id = delBtn.dataset.id;
        let bank = loadJSON("rbi_p1_bank", []);
        bank = bank.filter(x => x.id !== id);
        saveJSON("rbi_p1_bank", bank);
        renderP1Bank();
        return;
      }
    });
  }

  const btnP1BankExport = $("btn-p1-bank-export");
  if (btnP1BankExport) {
    btnP1BankExport.addEventListener("click", exportP1Bank);
  }

  const p1BankImport = $("p1-bank-import");
  if (p1BankImport) {
    p1BankImport.addEventListener("change", importP1Bank);
  }

  const p1BankDocImport = $("p1-bank-doc-import");
  if (p1BankDocImport) {
    p1BankDocImport.addEventListener("change", (e) => handleP1DocImport(e, "bank"));
  }

  const btnP1BankClearAll = $("btn-p1-bank-clear-all");
  if (btnP1BankClearAll) {
    btnP1BankClearAll.addEventListener("click", clearP1Bank);
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

  // ==========================================
// ==========================================
  // PHASE-1 CALENDAR EVENTS
  // ==========================================
  const p1CalExcelImport = $("p1-calendar-excel-import");
  if (p1CalExcelImport) {
    p1CalExcelImport.addEventListener("change", (e) => handleCalendarExcelImport(e, "phase1"));
  }

  const btnP1LoadOfficial = $("btn-p1-load-official-schedule");
  if (btnP1LoadOfficial) {
    btnP1LoadOfficial.addEventListener("click", () => loadOfficialSchedule("phase1"));
  }

  const btnP1ApplyConfig = $("btn-p1-apply-config");
  if (btnP1ApplyConfig) {
    btnP1ApplyConfig.addEventListener("click", () => applyCalendarConfig("phase1"));
  }

  const btnP1DownloadTemplate = $("btn-p1-download-template");
  if (btnP1DownloadTemplate) {
    btnP1DownloadTemplate.addEventListener("click", downloadScheduleTemplate);
  }

  const btnP1ExportCSV = $("btn-p1-export-csv");
  if (btnP1ExportCSV) {
    btnP1ExportCSV.addEventListener("click", exportScheduleCSV);
  }

  const btnP1ClearSchedule = $("btn-p1-clear-schedule");
  if (btnP1ClearSchedule) {
    btnP1ClearSchedule.addEventListener("click", () => clearSchedule("phase1"));
  }

  const p1CalBtnPrevMonth = $("p1-cal-btn-prev-month");
  if (p1CalBtnPrevMonth) {
    p1CalBtnPrevMonth.addEventListener("click", () => {
      const cur = state.p1_calendar_currentDate;
      state.p1_calendar_currentDate = new Date(cur.getFullYear(), cur.getMonth() - 1, 1);
      renderP1Calendar();
    });
  }

  const p1CalBtnNextMonth = $("p1-cal-btn-next-month");
  if (p1CalBtnNextMonth) {
    p1CalBtnNextMonth.addEventListener("click", () => {
      const cur = state.p1_calendar_currentDate;
      state.p1_calendar_currentDate = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      renderP1Calendar();
    });
  }

  const p1CalBtnToday = $("p1-cal-btn-today");
  if (p1CalBtnToday) {
    p1CalBtnToday.addEventListener("click", () => {
      state.p1_calendar_currentDate = new Date();
      state.p1_calendar_selectedDate = getLocalDateString(new Date());
      renderP1Calendar();
    });
  }

  // Phase-1 Quick Add Quest Form
  const p1FormQuickAdd = $("p1-form-quick-add-quest");
  if (p1FormQuickAdd) {
    p1FormQuickAdd.addEventListener("submit", (e) => {
      e.preventDefault();
      addQuickQuest("phase1");
    });
  }

  // Phase-1 LeetCode Days Grid
  const p1DaysGrid = $("p1-calendar-days-grid");
  if (p1DaysGrid) {
    p1DaysGrid.addEventListener("mousemove", (e) => {
      const cell = e.target.closest(".lc-day-cell");
      if (cell) {
        showP1CalendarHoverPopover(e, cell);
      } else {
        hideP1CalendarHoverPopover();
      }
    });

    p1DaysGrid.addEventListener("mouseleave", () => {
      hideP1CalendarHoverPopover();
    });

    p1DaysGrid.addEventListener("click", (e) => {
      hideP1CalendarHoverPopover();
      const cell = e.target.closest(".lc-day-cell");
      if (cell && cell.dataset.date) {
        state.p1_calendar_selectedDate = cell.dataset.date;
        renderP1Calendar();
      }
    });
  }

  // Phase-1 Daily Quests List
  const p1DayTasksList = $("p1-cal-selected-day-tasks");
  if (p1DayTasksList) {
    p1DayTasksList.addEventListener("change", (e) => {
      if (e.target && (e.target.classList.contains("quest-status-check") || e.target.classList.contains("task-status-check"))) {
        const id = e.target.dataset.id;
        toggleTaskComplete(id, "phase1");
      }
    });

    p1DayTasksList.addEventListener("click", (e) => {
      const reviewExamBtn = e.target.closest(".p1-review-exam-btn");
      if (reviewExamBtn) {
        reviewP1HistoricalTest(reviewExamBtn.dataset.id);
        return;
      }

      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === "practice-obj" || action === "practice") {
        setPhase("phase1");
        renderP1SetupList();
        showScreen("setup");
      } else if (action === "edit") {
        const t = (state.calendar || []).find(x => x.id === id);
        if (t) openTaskModal(t, "Phase-1");
      } else if (action === "delete") {
        deleteTask(id, "phase1");
      }
    });
  }

  const btnP1OpenAddTask = $("p1-btn-open-add-task-modal");
  if (btnP1OpenAddTask) {
    btnP1OpenAddTask.addEventListener("click", () => openTaskModal(null, "Phase-1"));
  }

  const p1CalUploadCard = document.querySelector("#screen-calendar-p1 .calendar-upload-card");
  if (p1CalUploadCard) {
    p1CalUploadCard.addEventListener("dragover", (e) => {
      e.preventDefault();
      p1CalUploadCard.classList.add("drag-over");
    });
    p1CalUploadCard.addEventListener("dragleave", () => {
      p1CalUploadCard.classList.remove("drag-over");
    });
    p1CalUploadCard.addEventListener("drop", (e) => {
      e.preventDefault();
      p1CalUploadCard.classList.remove("drag-over");
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleCalendarExcelImport({ target: { files: e.dataTransfer.files } }, "phase1");
      }
    });
  }



  // ==========================================
  // PHASE-2 CALENDAR EVENTS & DAILY QUESTS
  // ==========================================
  const p2CalExcelImport = $("p2-calendar-excel-import");
  if (p2CalExcelImport) {
    p2CalExcelImport.addEventListener("change", (e) => handleCalendarExcelImport(e, "phase2"));
  }

  const btnP2LoadOfficial = $("btn-p2-load-official-schedule");
  if (btnP2LoadOfficial) {
    btnP2LoadOfficial.addEventListener("click", () => loadOfficialSchedule("phase2"));
  }

  const btnP2ApplyConfig = $("btn-p2-apply-config");
  if (btnP2ApplyConfig) {
    btnP2ApplyConfig.addEventListener("click", () => applyCalendarConfig("phase2"));
  }

  const btnP2DownloadTemplate = $("btn-p2-download-template");
  if (btnP2DownloadTemplate) {
    btnP2DownloadTemplate.addEventListener("click", downloadScheduleTemplate);
  }

  const btnP2ExportCSV = $("btn-p2-export-csv");
  if (btnP2ExportCSV) {
    btnP2ExportCSV.addEventListener("click", exportScheduleCSV);
  }

  const btnP2ClearSchedule = $("btn-p2-clear-schedule");
  if (btnP2ClearSchedule) {
    btnP2ClearSchedule.addEventListener("click", () => clearSchedule("phase2"));
  }

  const p2CalBtnPrevMonth = $("p2-cal-btn-prev-month");
  if (p2CalBtnPrevMonth) {
    p2CalBtnPrevMonth.addEventListener("click", () => {
      const cur = state.p2_calendar_currentDate;
      state.p2_calendar_currentDate = new Date(cur.getFullYear(), cur.getMonth() - 1, 1);
      renderP2Calendar();
    });
  }

  const p2CalBtnNextMonth = $("p2-cal-btn-next-month");
  if (p2CalBtnNextMonth) {
    p2CalBtnNextMonth.addEventListener("click", () => {
      const cur = state.p2_calendar_currentDate;
      state.p2_calendar_currentDate = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      renderP2Calendar();
    });
  }

  const p2CalBtnToday = $("p2-cal-btn-today");
  if (p2CalBtnToday) {
    p2CalBtnToday.addEventListener("click", () => {
      state.p2_calendar_currentDate = new Date();
      state.p2_calendar_selectedDate = getLocalDateString(new Date());
      renderP2Calendar();
    });
  }

  // Phase-2 Quick Add Quest Form
  const p2FormQuickAdd = $("p2-form-quick-add-quest");
  if (p2FormQuickAdd) {
    p2FormQuickAdd.addEventListener("submit", (e) => {
      e.preventDefault();
      addQuickQuest("phase2");
    });
  }

  // Phase-2 LeetCode Days Grid
  const p2DaysGrid = $("p2-calendar-days-grid");
  if (p2DaysGrid) {
    p2DaysGrid.addEventListener("mousemove", (e) => {
      const cell = e.target.closest(".lc-day-cell");
      if (cell) {
        showP2CalendarHoverPopover(e, cell);
      } else {
        hideP2CalendarHoverPopover();
      }
    });

    p2DaysGrid.addEventListener("mouseleave", () => {
      hideP2CalendarHoverPopover();
    });

    p2DaysGrid.addEventListener("click", (e) => {
      hideP2CalendarHoverPopover();
      const cell = e.target.closest(".lc-day-cell");
      if (cell && cell.dataset.date) {
        state.p2_calendar_selectedDate = cell.dataset.date;
        renderP2Calendar();
      }
    });
  }

  // Phase-2 Daily Quests List
  const p2DayTasksList = $("p2-cal-selected-day-tasks");
  if (p2DayTasksList) {
    p2DayTasksList.addEventListener("change", (e) => {
      if (e.target && (e.target.classList.contains("quest-status-check") || e.target.classList.contains("task-status-check"))) {
        const id = e.target.dataset.id;
        toggleTaskComplete(id, "phase2");
      }
    });

    p2DayTasksList.addEventListener("click", (e) => {
      const reviewExamBtn = e.target.closest(".p2-review-exam-btn");
      if (reviewExamBtn) {
        const testId = reviewExamBtn.dataset.testId;
        setPhase("phase2");
        renderHistory();
        showScreen("history");
        setTimeout(() => {
          const revContainer = $(`review-container-${testId}`);
          if (revContainer) {
            revContainer.style.display = "block";
            const btn = document.querySelector(`.btn-toggle-answer-review[data-test-id="${testId}"]`);
            if (btn) btn.textContent = "📖 Hide Answers & Marks";
            revContainer.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 150);
        return;
      }

      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === "practice-p2-sub" || action === "practice") {
        setPhase("phase2");
        renderSetupList();
        showScreen("setup");
      } else if (action === "practice-obj") {
        setPhase("phase2");
        renderSetupList();
        showScreen("setup");
      } else if (action === "edit") {
        const t = (state.calendar || []).find(x => x.id === id);
        if (t) openTaskModal(t, "Phase-2");
      } else if (action === "delete") {
        deleteTask(id, "phase2");
      }
    });
  }

  const btnP2OpenAddTask = $("p2-btn-open-add-task-modal");
  if (btnP2OpenAddTask) {
    btnP2OpenAddTask.addEventListener("click", () => openTaskModal(null, "Phase-2"));
  }

  const p2CalUploadCard = document.querySelector("#screen-calendar-p2 .calendar-upload-card");
  if (p2CalUploadCard) {
    p2CalUploadCard.addEventListener("dragover", (e) => {
      e.preventDefault();
      p2CalUploadCard.classList.add("drag-over");
    });
    p2CalUploadCard.addEventListener("dragleave", () => {
      p2CalUploadCard.classList.remove("drag-over");
    });
    p2CalUploadCard.addEventListener("drop", (e) => {
      e.preventDefault();
      p2CalUploadCard.classList.remove("drag-over");
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleCalendarExcelImport({ target: { files: e.dataTransfer.files } }, "phase2");
      }
    });
  }


  window.addEventListener("scroll", () => {
    hideP1CalendarHoverPopover();
    hideP2CalendarHoverPopover();
  }, { passive: true });

  const btnCloseTaskModal = $("btn-close-task-modal");
  if (btnCloseTaskModal) {
    btnCloseTaskModal.addEventListener("click", closeTaskModal);
  }

  const btnCancelTask = $("btn-cancel-task");
  if (btnCancelTask) {
    btnCancelTask.addEventListener("click", closeTaskModal);
  }

  const formTaskModal = $("form-task-modal");
  if (formTaskModal) {
    formTaskModal.addEventListener("submit", handleTaskFormSubmit);
  }

    // Initial load
  setPhase(state.phase);
  checkResumeActiveTest();
});
