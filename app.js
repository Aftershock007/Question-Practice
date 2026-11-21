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
  const target = $("screen-" + name);
  if (target) target.hidden = false;
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
  setup: loadJSON("rbi_current_setup", { totalMinutes: 30, questions: [] }),
  test: null,          // active Test object during the exam
  currentIndex: 0,     // which question is on screen
  timerId: null,       // setInterval id
  endTime: 0,          // Date.now() value when time ends
  questionShownAt: 0,  // Date.now() when current question was shown
  lastAutoSave: 0,     // timestamp of last throttled exam autosave
  lastResultTest: null // test object currently being viewed on the result screen
};

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

// Render the list of configured questions in the setup screen
function renderSetupList() {
  const list = $("setup-question-list");
  if (!list) return;
  list.innerHTML = "";
  const questions = state.setup.questions || [];
  let totalWordLimit = 0;

  questions.forEach((q, index) => {
    totalWordLimit += Number(q.wordLimit) || 0;
    const li = document.createElement("li");
    const snippet = q.text.length > 120 ? q.text.slice(0, 120) + "…" : q.text;
    const modelWarn = (!q.modelAnswer || !q.modelAnswer.trim())
      ? '<span class="no-model-warn">(no model answer)</span>'
      : "";

    li.innerHTML = `
      <div class="q-info">
        <strong>[${escapeHTML(q.paper)}]</strong> (${escapeHTML(q.marks)} marks, ${escapeHTML(q.wordLimit)} words)
        ${modelWarn}
        <div>${escapeHTML(snippet)}</div>
      </div>
      <div class="q-actions">
        <button type="button" class="btn-move-up" data-action="move-up" data-id="${escapeHTML(q.id)}" ${index === 0 ? "disabled" : ""}>▲</button>
        <button type="button" class="btn-edit" data-action="edit" data-id="${escapeHTML(q.id)}">Edit</button>
        <button type="button" class="btn-delete danger" data-action="delete" data-id="${escapeHTML(q.id)}">Delete</button>
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
    scores: scores
  };

  state.test = test;
  state.currentIndex = 0;
  state.endTime = Date.now() + totalMinutes * 60 * 1000;
  test.endTime = state.endTime;

  saveJSON("rbi_active_test", test);

  state.questionShownAt = 0;
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

  const q = state.test.questions[index];
  const totalQ = state.test.questions.length;

  $("exam-qpos").textContent = `Question ${index + 1} of ${totalQ}`;
  $("exam-marks").textContent = `[${q.paper}] ${q.marks} marks · ${q.wordLimit} words`;
  $("exam-question-text").textContent = q.text;

  const ans = state.test.answers[q.id] || { text: "", wordCount: 0, secondsSpent: 0 };
  const textarea = $("exam-answer");
  textarea.value = ans.text || "";
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  $("btn-prev").disabled = (index === 0);
  $("btn-next").disabled = (index === totalQ - 1);

  updateWordCount();
  renderPalette();
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
    wcElem.textContent = `${count} / ${limit} words`;
    wcElem.className = "";
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
    if (count > 0) {
      paletteBtn.classList.add("answered");
    } else {
      paletteBtn.classList.remove("answered");
    }
  }
}

// Render question navigation palette buttons showing answered status
function renderPalette() {
  const palette = $("exam-palette");
  if (!palette || !state.test) return;
  palette.innerHTML = "";
  state.test.questions.forEach((q, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = String(idx + 1);
    btn.dataset.index = String(idx);
    const ans = state.test.answers[q.id];
    if (ans && ans.wordCount > 0) {
      btn.classList.add("answered");
    }
    if (idx === state.currentIndex) {
      btn.classList.add("current");
    }
    palette.appendChild(btn);
  });
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

// Resume an active exam without resetting answers
function resumeExam() {
  state.currentIndex = 0;
  state.questionShownAt = 0;
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

  listElem.innerHTML = "";

  if (filtered.length === 0) {
    listElem.innerHTML = "<p>No questions found matching your filter.</p>";
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
      <div class="bank-card-header">
        <strong>[${escapeHTML(q.paper)}]</strong> ${escapeHTML(q.marks)} marks (${escapeHTML(q.wordLimit)} words)${topicText} · ${modelNote}
      </div>
      <div class="bank-card-text">${escapeHTML(snippet)}</div>
      <div class="bank-card-actions">
        <button type="button" class="btn-bank-add" data-id="${escapeHTML(q.id)}">Add to today's test</button>
        <button type="button" class="btn-bank-edit secondary" data-id="${escapeHTML(q.id)}">Edit</button>
        <button type="button" class="btn-bank-delete danger" data-id="${escapeHTML(q.id)}">Delete from bank</button>
      </div>
    `;

    listElem.appendChild(card);
  });
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
  const rawLines = text.split("\n");

  const qStartRegex = /^(?:Question\s*[\d\.\-\)]*|Q\s*[\d\.\-\)]*|Q\.\s*\d+|\d+\s*[\.\)])\s*[:\.\-]?\s*(.*)/i;
  const aStartRegex = /^(?:(?:Model\s+)?Answer|Ans|Solution|Reference\s+Answer)\s*[:\.\-]?\s*(.*)/i;

  const blocks = [];
  let currentBlock = null;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) {
      if (currentBlock) currentBlock.lines.push("");
      continue;
    }

    const qMatch = line.match(qStartRegex);
    const isExplicitQ = /^(?:Question|Q|Q\.)\s*[\d\.\-\)]*/i.test(line);
    const isNumberedQ = /^\d+[\.\)]\s+/.test(line);

    if (isExplicitQ || (isNumberedQ && (!currentBlock || currentBlock.hasAnswer))) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = {
        headerText: qMatch ? qMatch[1].trim() : line,
        lines: [],
        hasAnswer: false
      };
    } else {
      if (!currentBlock) {
        currentBlock = {
          headerText: line,
          lines: [],
          hasAnswer: false
        };
      } else {
        if (aStartRegex.test(line)) {
          currentBlock.hasAnswer = true;
        }
        currentBlock.lines.push(line);
      }
    }
  }

  if (currentBlock) blocks.push(currentBlock);

  const results = [];

  for (const block of blocks) {
    let paper = "Other";
    let topic = "";
    let marks = 10;
    let wordLimit = 400;
    const questionLines = [];
    const answerLines = [];
    let inAnswer = false;

    if (block.headerText) {
      questionLines.push(block.headerText);
    }

    for (const line of block.lines) {
      if (!line) {
        if (inAnswer && answerLines.length > 0) answerLines.push("");
        else if (!inAnswer && questionLines.length > 0) questionLines.push("");
        continue;
      }

      const aMatch = line.match(aStartRegex);
      if (aMatch) {
        inAnswer = true;
        if (aMatch[1].trim()) answerLines.push(aMatch[1].trim());
        continue;
      }

      if (!inAnswer) {
        const marksMatch = line.match(/^(?:Marks?|Maximum\s+marks?)\s*[:\.\-]?\s*(\d+)/i);
        if (marksMatch) {
          marks = Number(marksMatch[1]);
          wordLimit = (marks === 15) ? 600 : 400;
          continue;
        }

        const wlMatch = line.match(/^(?:Word\s*limit|Words?)\s*[:\.\-]?\s*(\d+)/i);
        if (wlMatch) {
          wordLimit = Number(wlMatch[1]);
          continue;
        }

        const paperMatch = line.match(/^(?:Paper|Subject)\s*[:\.\-]?\s*(.+)/i);
        if (paperMatch) {
          const val = paperMatch[1].trim();
          if (/esi/i.test(val)) paper = "ESI";
          else if (/finance/i.test(val)) paper = "Finance";
          else if (/management/i.test(val)) paper = "Management";
          else if (/english/i.test(val)) paper = "English Descriptive";
          else paper = val || "Other";
          continue;
        }

        const topicMatch = line.match(/^Topic\s*[:\.\-]?\s*(.+)/i);
        if (topicMatch) {
          topic = topicMatch[1].trim();
          continue;
        }

        questionLines.push(line);
      } else {
        answerLines.push(line);
      }
    }

    const qText = questionLines.join("\n").trim();
    const aText = answerLines.join("\n").trim();

    if (qText || aText) {
      results.push({
        paper,
        topic,
        text: qText || "Imported Question",
        marks: marks || 10,
        wordLimit: wordLimit || ((marks === 15) ? 600 : 400),
        modelAnswer: aText
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

// Wire all global DOM event listeners and initialize screen state
document.addEventListener("DOMContentLoaded", () => {
  // Navigation
  const navSetup = $("nav-setup");
  if (navSetup) {
    navSetup.addEventListener("click", () => {
      renderSetupList();
      showScreen("setup");
    });
  }

  const navBank = $("nav-bank");
  if (navBank) {
    navBank.addEventListener("click", () => {
      renderBank();
      showScreen("bank");
    });
  }

  const navHistory = $("nav-history");
  if (navHistory) {
    navHistory.addEventListener("click", () => {
      renderHistory();
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

  const setupQList = $("setup-question-list");
  if (setupQList) {
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
      if (state.currentIndex > 0) showQuestion(state.currentIndex - 1);
    });
  }

  const btnNext = $("btn-next");
  if (btnNext) {
    btnNext.addEventListener("click", () => {
      if (state.test && state.currentIndex < state.test.questions.length - 1) {
        showQuestion(state.currentIndex + 1);
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

  const btnSubmit = $("btn-submit");
  if (btnSubmit) {
    btnSubmit.addEventListener("click", () => {
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

  const bankList = $("bank-list");
  if (bankList) {
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

  // Initial load
  renderSetupList();
  showScreen("setup");
  checkResumeActiveTest();
});
