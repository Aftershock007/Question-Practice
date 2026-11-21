"use strict";

// Shortcut for document.getElementById
function $(id) { return document.getElementById(id); }

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
  if (name === "setup" || name === "exam" || name === "result" || name === "bank" || name === "history") {
    targetId = state.phase === "phase1" ? `screen-${name}-p1` : `screen-${name}`;
  }
  const target = $(targetId) || $(name) || $("screen-" + name);
  if (target) target.hidden = false;

  const header = $("app-header");
  if (header) {
    const isExam = (name === "exam" || name === "exam-p1" || targetId === "screen-exam" || targetId === "screen-exam-p1");
    header.style.display = isExam ? "none" : "";
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
  p1_resultFilter: "all"
};

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

  if (state.phase === "phase1") {
    renderP1SetupList();
  } else {
    renderSetupList();
  }
  showScreen("setup");
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

  questions.forEach((q, index) => {
    totalWordLimit += Number(q.wordLimit) || 0;
    const li = document.createElement("li");
    const snippet = q.text.length > 120 ? q.text.slice(0, 120) + "…" : q.text;
    const modelWarn = (!q.modelAnswer || !q.modelAnswer.trim())
      ? '<span class="no-model-warn">(no model answer)</span>'
      : "";
    const topicText = q.topic ? ` · <em>${escapeHTML(q.topic)}</em>` : "";

    li.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 8px; width: 100%;">
        <input type="checkbox" class="q-select-check" data-id="${escapeHTML(q.id)}" aria-label="Select question ${index + 1}">
        <div class="q-info" style="flex: 1;">
          <strong>[${escapeHTML(q.paper)}]</strong> (${escapeHTML(q.marks)} marks, ${escapeHTML(q.wordLimit)} words)${topicText}
          ${modelWarn}
          <div>${escapeHTML(snippet)}</div>
        </div>
        <div class="q-actions">
          <button type="button" class="btn-move-up" data-action="move-up" data-id="${escapeHTML(q.id)}" ${index === 0 ? "disabled" : ""}>▲</button>
          <button type="button" class="btn-edit" data-action="edit" data-id="${escapeHTML(q.id)}">Edit</button>
          <button type="button" class="btn-delete danger" data-action="delete" data-id="${escapeHTML(q.id)}">Delete</button>
        </div>
      </div>
    `;
    list.appendChild(li);
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

  updateSetupBatchDeleteState();
}

// Populate the setup form with an existing question for editing
function editSetupQuestion(id) {
  const q = state.setup.questions.find(item => item.id === id);
  if (!q) return;
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

  const history = loadJSON("rbi_history", []);
  history.unshift(test);
  saveJSON("rbi_history", history);

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
}

// Check for and resume an interrupted test on page load
function checkResumeActiveTest() {
  if (state.phase === "phase1") {
    const active = loadJSON("rbi_p1_active_test", null);
    if (!active || !active.endTime) return;
    const now = Date.now();
    state.p1_test = active;
    state.p1_endTime = active.endTime;
    if (active.endTime > now) {
      if (confirm("You have a Phase-1 objective test in progress. Resume it?")) {
        startP1ExamTimer();
        showP1Question(state.p1_test.currentIndex || 0);
        renderP1Palette();
        updateP1ExamSummary();
        showScreen("exam");
      } else {
        localStorage.removeItem("rbi_p1_active_test");
        state.p1_test = null;
      }
    } else {
      alert("Your previous Phase-1 test session has expired.");
      finishP1Test(true);
    }
  } else {
    const active = loadJSON("rbi_active_test", null);
    if (!active || !active.endTime) return;

    const now = Date.now();
    state.test = active;
    state.endTime = active.endTime;

    if (active.endTime > now) {
      if (confirm("You have a test in progress. Resume it?")) {
        resumeExam();
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
    MODEL_ANSWER: modelText || "[No model answer provided – evaluate using your own expert knowledge of the topic.]"
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

    const dateStr = new Date(t.date).toLocaleString();
    const usedStr = formatDuration(t.usedSeconds || 0);
    const totalMin = t.totalMinutes || 30;
    const autoNote = t.autoSubmitted ? " (auto-submitted)" : "";

    let rowsHTML = "";
    (t.questions || []).forEach((q, idx) => {
      const ans = (t.answers && t.answers[q.id]) || { wordCount: 0 };
      const currentScore = (t.scores && t.scores[q.id] !== null && t.scores[q.id] !== undefined)
        ? t.scores[q.id]
        : "";

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
    });

    card.innerHTML = `
      <div class="history-card-header">
        <div>
          <strong>${escapeHTML(dateStr)}</strong> – ${t.questions.length} question(s) · Time used: ${usedStr} of ${totalMin} min${autoNote}
        </div>
        <div class="actions">
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

  saveJSON("rbi_history", history);
  renderHistoryStats(history);
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
  }
}

// Permanently delete all test history after two-step verification
function clearAllHistory() {
  if (confirm("Are you sure you want to delete all practice history? This cannot be undone.")) {
    const confirmation = prompt("Type DELETE to confirm");
    if (confirmation === "DELETE") {
      localStorage.removeItem("rbi_history");
      renderHistory();
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
    updateBankBatchState();
    return;
  }

  filtered.forEach(q => {
    const card = document.createElement("div");
    card.className = "bank-card";

    const snippet = (q.text || "").length > 200 ? q.text.slice(0, 200) + "…" : q.text;
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
          </div>
          <div class="bank-card-text">${escapeHTML(snippet)}</div>
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

// Extract plain text paragraphs from a DOCX file buffer by decompressing word/document.xml
async function extractDocxText(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  let offset = 0;
  let targetEntry = null;

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
        targetEntry = { compMethod, compSize, dataStart };
        break;
      }
      offset = dataStart + compSize;
    } else {
      offset++;
    }
  }

  if (!targetEntry) {
    offset = 0;
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
          const lhNameLen = view.getUint16(localHeaderOffset + 26, true);
          const lhExtraLen = view.getUint16(localHeaderOffset + 28, true);
          const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
          targetEntry = { compMethod, compSize, dataStart };
          break;
        }
        offset += 46 + nameLen + extraLen + commentLen;
      } else {
        offset++;
      }
    }
  }

  if (!targetEntry) {
    throw new Error("Could not find document content (word/document.xml) inside the DOCX file.");
  }

  const compressedData = bytes.slice(targetEntry.dataStart, targetEntry.dataStart + targetEntry.compSize);
  let xmlString = "";

  if (targetEntry.compMethod === 0) {
    xmlString = new TextDecoder("utf-8").decode(compressedData);
  } else if (targetEntry.compMethod === 8) {
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    writer.write(compressedData);
    writer.close();
    const reader = ds.readable.getReader();
    const chunks = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((acc, c) => acc + c.length, 0);
    const full = new Uint8Array(total);
    let pos = 0;
    for (const c of chunks) {
      full.set(c, pos);
      pos += c.length;
    }
    xmlString = new TextDecoder("utf-8").decode(full);
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
    const rawChunk = bytes.slice(pos.start, pos.end);

    if (pos.isFlate) {
      try {
        const ds = new DecompressionStream("deflate");
        const writer = ds.writable.getWriter();
        writer.write(rawChunk);
        writer.close();
        const reader = ds.readable.getReader();
        const chunks = [];
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const total = chunks.reduce((a, b) => a + b.length, 0);
        const out = new Uint8Array(total);
        let p = 0;
        for (const c of chunks) { out.set(c, p); p += c.length; }
        streamText = new TextDecoder("latin1").decode(out);
      } catch (e) {
        try {
          const ds = new DecompressionStream("deflate-raw");
          const writer = ds.writable.getWriter();
          writer.write(rawChunk);
          writer.close();
          const reader = ds.readable.getReader();
          const chunks = [];
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          const total = chunks.reduce((a, b) => a + b.length, 0);
          const out = new Uint8Array(total);
          let p = 0;
          for (const c of chunks) { out.set(c, p); p += c.length; }
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

  return allExtracted.join("\n");
}

// Parse raw document text into structured question objects with paper, marks, and model answers
function parseQuestionsAndAnswers(rawText) {
  if (!rawText || !rawText.trim()) return [];

  const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = text.split("\n").map(l => l.trim());

  // Check document-level metadata from the first few lines
  let docDefaultPaper = "Other";
  let docDefaultTopic = "";
  const headerPreview = rawLines.slice(0, 15).join(" ");
  if (/\bESI\b/i.test(headerPreview)) docDefaultPaper = "ESI";
  else if (/\bFinance\b/i.test(headerPreview)) docDefaultPaper = "Finance";
  else if (/\bManagement\b/i.test(headerPreview)) docDefaultPaper = "Management";
  else if (/\bEnglish(?:\s+Descriptive)?\b/i.test(headerPreview)) docDefaultPaper = "English Descriptive";

  if (rawLines[0] && !/^(?:Question|Q\d|\d+[\.\)])/i.test(rawLines[0])) {
    const titleMatch = rawLines[0].match(/^([^:\(\)\|]+)/);
    if (titleMatch) docDefaultTopic = titleMatch[1].trim();
  }

  const qNumRegex = /^(?:Question\s*(\d+)|Q\s*(\d+)[\.:\)]?)/i;
  const rawQuestionStarts = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line) continue;

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
      if (/^\d+[\.\)]\s+/.test(line)) {
        questionStarts.push({ lineIndex: i, qNum: parseInt(line, 10), line });
      }
    }
  }

  // Fallback for single question with explicit Answer: marker
  if (questionStarts.length === 0) {
    questionStarts.push({ lineIndex: 0, qNum: 1, line: rawLines[0] });
  }

  const results = [];

  for (let k = 0; k < questionStarts.length; k++) {
    const startIdx = questionStarts[k].lineIndex;
    const endIdx = (k + 1 < questionStarts.length) ? questionStarts[k + 1].lineIndex : rawLines.length;
    const blockLines = rawLines.slice(startIdx, endIdx).filter(l => l.length > 0);

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
          const cleanQ = line.replace(/^(?:Question\s*\d+|Q\s*\d+|Q\.\s*\d+|\d+\s*[\.\)])\s*[:\.\-]?\s*/i, "");
          if (cleanQ) qLines.push(cleanQ);
        } else {
          aLines.push(line);
        }
      } else {
        // No explicit Answer marker in document: first non-metadata paragraph is Question prompt, rest is Model Answer
        if (qLines.length === 0) {
          const cleanQ = line.replace(/^(?:Question\s*\d+|Q\s*\d+|Q\.\s*\d+|\d+\s*[\.\)])\s*[:\.\-]?\s*/i, "");
          if (cleanQ) qLines.push(cleanQ);
        } else {
          aLines.push(line);
        }
      }
    }

    const questionText = qLines.join("\n").trim();
    const modelAnswer = aLines.join("\n\n").trim();

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
  const paragraphs = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  // 1. Locate Answer Key section if present
  let ansKeyIdx = -1;
  for (let i = 0; i < paragraphs.length; i++) {
    const pLower = paragraphs[i].toLowerCase();
    if (pLower === "answer key" || pLower === "answers" || pLower.startsWith("answer key:") || pLower === "answer keys") {
      ansKeyIdx = i;
      break;
    }
  }

  const qParagraphs = ansKeyIdx !== -1 ? paragraphs.slice(0, ansKeyIdx) : paragraphs;
  const ansParagraphs = ansKeyIdx !== -1 ? paragraphs.slice(ansKeyIdx) : [];

  // Parse Answer Key
  const answersMap = {}; // questionIndex (1-based) -> 'a' | 'b' | 'c' | 'd' | 'e'

  if (ansParagraphs.length > 0) {
    let i = 0;
    while (i < ansParagraphs.length) {
      const p = ansParagraphs[i].trim();
      const rangeMatch = p.match(/^(\d+)\s+to\s+(\d+)$/i);
      if (rangeMatch) {
        const startQ = parseInt(rangeMatch[1], 10);
        const endQ = parseInt(rangeMatch[2], 10);
        i++;
        let currQ = startQ;
        while (i < ansParagraphs.length && currQ <= endQ) {
          const val = ansParagraphs[i].trim().toLowerCase();
          if (/^[a-e]$/.test(val)) {
            answersMap[currQ] = val;
            currQ++;
            i++;
          } else {
            break;
          }
        }
      } else {
        const singleMatches = [...p.matchAll(/(?:(?:^|\s+)(?:Q\.?\s*)?(\d+)[\.:\-\)\s]+(?:\(?([a-eA-E])\)?))/g)];
        if (singleMatches.length > 0) {
          for (const sm of singleMatches) {
            answersMap[parseInt(sm[1], 10)] = sm[2].toLowerCase();
          }
        }
        i++;
      }
    }
  }

  // 2. Parse Questions & Options
  const questions = [];
  let currQ = [];
  let currOpts = [];
  const optRegex = /(?:\[([a-eA-E])\]|\(([a-eA-E])\)|(?:\b|^)([a-eA-E])[\.\)])/g;

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

    const matches = [];
    let m;
    const re = new RegExp(optRegex);
    while ((m = re.exec(p)) !== null) {
      const label = (m[1] || m[2] || m[3]).toLowerCase();
      matches.push({ label, start: m.index, end: m.index + m[0].length });
    }

    if (matches.length > 0) {
      const beforeFirst = p.slice(0, matches[0].start).trim();
      if (beforeFirst) {
        currQ.push(beforeFirst);
      }

      for (let iM = 0; iM < matches.length; iM++) {
        const curM = matches[iM];
        const nextM = matches[iM + 1];
        const optVal = p.slice(curM.end, nextM ? nextM.start : p.length).trim();

        if (currOpts.some(o => o.label === curM.label)) {
          if (currQ.length > 0 || currOpts.length > 0) {
            questions.push({
              id: makeId("mcq"),
              subject: defaultSubject,
              text: currQ.join("\n").trim(),
              options: currOpts,
              correctAnswer: "",
              explanation: "",
              marks: 1.0,
              negativeMarks: 0.25
            });
            currQ = [];
            currOpts = [];
          }
        }

        currOpts.push({ label: curM.label, text: optVal });
      }
    } else {
      if (currOpts.length >= 4) {
        questions.push({
          id: makeId("mcq"),
          subject: defaultSubject,
          text: currQ.join("\n").trim(),
          options: currOpts,
          correctAnswer: "",
          explanation: "",
          marks: 1.0,
          negativeMarks: 0.25
        });
        currQ = [];
        currOpts = [];
      }
      currQ.push(p);
    }
  }

  if (currQ.length > 0 || currOpts.length > 0) {
    questions.push({
      id: makeId("mcq"),
      subject: defaultSubject,
      text: currQ.join("\n").trim(),
      options: currOpts,
      correctAnswer: "",
      explanation: "",
      marks: 1.0,
      negativeMarks: 0.25
    });
  }

  // Assign answers from answersMap to questions
  for (let qIdx = 0; qIdx < questions.length; qIdx++) {
    const qNum = qIdx + 1;
    if (answersMap[qNum]) {
      questions[qIdx].correctAnswer = answersMap[qNum];
    }
  }

  return questions;
}

// One-click loader for the included Spotlight DOCX file
async function loadSpotlightSample() {
  const statusElem = $("setup-p1-doc-status");
  if (statusElem) statusElem.textContent = "Loading Spotlight-Questions-1-6-Nov-2026.docx...";
  try {
    const resp = await fetch("Spotlight-Questions-1-6-Nov-2026.docx");
    if (!resp.ok) {
      throw new Error("Could not fetch file: " + resp.statusText);
    }
    const arrayBuffer = await resp.arrayBuffer();
    const rawText = await extractDocxText(arrayBuffer);
    const parsed = parseMCQDocument(rawText, "General Awareness");
    if (!parsed || parsed.length === 0) {
      throw new Error("No MCQs parsed from document.");
    }

    state.p1_setup.questions = parsed;
    saveP1Setup();
    renderP1SetupList();

    const bank = loadJSON("rbi_p1_bank", []);
    let bankAdded = 0;
    parsed.forEach(q => {
      if (!bank.some(b => b.text === q.text)) {
        bank.push({ ...q });
        bankAdded++;
      }
    });
    saveJSON("rbi_p1_bank", bank);

    const withAns = parsed.filter(q => q.correctAnswer).length;
    if (statusElem) {
      statusElem.textContent = `✅ Successfully loaded all ${parsed.length} MCQs (${withAns} with Answer Key)! Bank updated (+${bankAdded}).`;
    }
  } catch (err) {
    if (statusElem) {
      statusElem.textContent = `File load note: ${err.message}. (You can also click 'Import DOCX / PDF' to select the file directly).`;
    }
    const fileInput = $("setup-p1-doc-import");
    if (fileInput) fileInput.click();
  }
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
    list.innerHTML = `<li style="display:block; text-align:center; color:var(--muted); padding:20px;">No MCQs added yet. Import Spotlight DOCX/PDF or use the form above.</li>`;
    updateP1SetupBatchDeleteState();
    return;
  }

  list.innerHTML = questions.map((q, idx) => {
    const snippet = escapeHTML(q.text.length > 120 ? q.text.slice(0, 120) + "..." : q.text);
    const optsPreview = (q.options || []).map(o =>
      `<span class="opt-pill">${o.label.toUpperCase()}: ${escapeHTML(o.text.length > 25 ? o.text.slice(0, 25) + '...' : o.text)}</span>`
    ).join("");

    return `
      <li>
        <input type="checkbox" class="p1-q-select-check" data-id="${q.id}" style="margin-top:4px;">
        <div style="flex:1;">
          <div class="p1-q-meta-badges">
            <span class="badge-subject">${escapeHTML(q.subject || "General Awareness")}</span>
            ${q.topic ? `<span style="font-size:11px; color:var(--muted);">${escapeHTML(q.topic)}</span>` : ""}
            ${q.correctAnswer ? `<span class="badge-ans">Key: [${q.correctAnswer.toUpperCase()}]</span>` : ""}
            <span style="font-size:11px; color:var(--muted);">Q${idx + 1}</span>
          </div>
          <div style="font-size:14px; font-weight:600; color:var(--text);">${snippet}</div>
          <div class="p1-opts-preview">${optsPreview}</div>
        </div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          ${idx > 0 ? `<button type="button" class="btn-p1-move-up" data-index="${idx}" style="padding:2px 6px; font-size:11px;">▲</button>` : ""}
          ${idx < questions.length - 1 ? `<button type="button" class="btn-p1-move-down" data-index="${idx}" style="padding:2px 6px; font-size:11px;">▼</button>` : ""}
          <button type="button" class="danger btn-p1-delete-q" data-id="${q.id}" style="padding:2px 6px; font-size:11px;">✕</button>
        </div>
      </li>
    `;
  }).join("");

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

  const history = loadJSON("rbi_p1_history", []);
  history.unshift(test);
  saveJSON("rbi_p1_history", history);

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
    updateP1BankBatchState();
    return;
  }

  container.innerHTML = filtered.map(q => {
    const optsPreview = (q.options || []).map(o =>
      `<span class="opt-pill">${o.label.toUpperCase()}: ${escapeHTML(o.text.length > 30 ? o.text.slice(0, 30) + '...' : o.text)}</span>`
    ).join("");

    return `
      <div class="mcq-bank-card">
        <input type="checkbox" class="p1-bank-select-check" data-id="${q.id}" style="margin-top:4px;">
        <div class="mcq-bank-body">
          <div class="p1-q-meta-badges">
            <span class="badge-subject">${escapeHTML(q.subject || "General Awareness")}</span>
            ${q.topic ? `<span style="font-size:11px; color:var(--muted);">${escapeHTML(q.topic)}</span>` : ""}
            ${q.correctAnswer ? `<span class="badge-ans">Key: [${q.correctAnswer.toUpperCase()}]</span>` : ""}
          </div>
          <div class="mcq-bank-prompt">${escapeHTML(q.text)}</div>
          <div class="p1-opts-preview">${optsPreview}</div>
          <div class="mcq-bank-actions">
            <button type="button" class="btn-p1-bank-add" data-id="${q.id}" style="background:#059669; color:white;">+ Add to Test</button>
            <button type="button" class="danger btn-p1-bank-delete" data-id="${q.id}">Delete</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

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
}

// Clear all Phase-1 History
function clearP1History() {
  const history = loadJSON("rbi_p1_history", []);
  if (history.length === 0) return;
  if (!confirm("Are you sure you want to delete all Phase-1 test history?")) return;
  saveJSON("rbi_p1_history", []);
  renderP1History();
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

    historyList.addEventListener("click", (e) => {
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
    bankSearch.addEventListener("input", renderBank);
  }

  const bankFilter = $("bank-filter-paper");
  if (bankFilter) {
    bankFilter.addEventListener("change", renderBank);
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

  const btnLoadSpotlight = $("btn-load-spotlight-sample");
  if (btnLoadSpotlight) {
    btnLoadSpotlight.addEventListener("click", loadSpotlightSample);
  }

  const p1DocImport = $("setup-p1-doc-import");
  if (p1DocImport) {
    p1DocImport.addEventListener("change", (e) => handleP1DocImport(e, "setup"));
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
    p1BankSearch.addEventListener("input", renderP1Bank);
  }

  const p1BankFilter = $("p1-bank-filter-subject");
  if (p1BankFilter) {
    p1BankFilter.addEventListener("change", renderP1Bank);
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

  // Initial load
  setPhase(state.phase);
  checkResumeActiveTest();
});
