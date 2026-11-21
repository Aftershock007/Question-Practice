# TASK PLAN: RBI Descriptive Answer Practice Site

> **Instructions for the AI agent executing this plan (read this first):**
>
> 1. Read this ENTIRE file before writing any code.
> 2. Do the phases **in order**. Do not skip ahead. Do not combine phases.
> 3. At the end of every phase there is a **"✅ Verify"** checklist. Check every item. If an item fails, fix it before going to the next phase.
> 4. Use **only** plain HTML, CSS and vanilla JavaScript. **No** React, Vue, jQuery, Tailwind, npm, build tools, CDNs or backend servers.
> 5. The finished site must work by simply double-clicking `index.html` (opened as `file://`). It must also work on GitHub Pages.
> 6. Use the **exact** file names, element IDs, function names and storage keys written in this plan. Do not rename them.
> 7. Do not invent extra features that are not in this plan. If something is unclear, choose the simplest option.
> 8. Write comments in the code explaining each function in one line.
> 9. When a phase says "copy exactly", copy the text character-for-character.

---

## 0. What we are building (summary)

A personal, offline website for daily practice of **RBI Grade B (Phase 2) descriptive answer writing** (ESI, F&M, English).

The user flow is:

1. **Setup screen** – The user types one or more questions. For each question they enter: the question text, the marks (10 or 15), the word limit (auto-filled: 10 marks → 400 words, 15 marks → 600 words, but editable), the paper/subject, and a **model answer** (reference answer). They also set the **total test time** in minutes.
2. **Exam screen** – A countdown timer starts. The user sees one question at a time with a big typing box (like the real RBI online exam). A live word counter shows `words typed / word limit`. The model answer is **hidden** during the test. The user can move between questions. When the timer reaches 0 the test auto-submits. The user can also submit early.
3. **Result screen** – For each question, the site builds a **plain text (.txt) file** that contains:
   - a detailed **evaluation prompt** (so the user can paste the whole file into Gemini / Claude / ChatGPT and get a score),
   - the question, marks, word limit,
   - the user's written answer + its word count + time spent,
   - the model answer.
   The user can **Download** each file, **Copy** each file to clipboard, or **Download All** as one combined file.
4. **History screen** – Every finished test is saved in the browser (localStorage). The user can later type the score the AI gave, to track improvement day by day.

---

## 1. Final file structure

Create exactly these files in the repository root:

```
RBI-Subjective-Practice/
├── index.html      ← the only HTML page (all screens live here, shown/hidden with JS)
├── style.css       ← all styling
├── app.js          ← all logic
├── prompt.js       ← the evaluation prompt template (one exported constant)
├── README.md       ← how to use (update the existing file)
└── TASK_PLAN.md    ← this file (do not delete)
```

`index.html` must load scripts in this order, at the end of `<body>`:

```html
<script src="prompt.js"></script>
<script src="app.js"></script>
```

Do **not** use `type="module"` (modules do not work from `file://`).

---

## 2. Data model (use exactly this)

### 2.1 Question object

```js
{
  id: "q_1732171234567_ab12",   // string, unique: "q_" + Date.now() + "_" + random 4 chars
  paper: "ESI",                 // one of: "ESI", "F&M", "English", "Other"
  topic: "Inflation targeting", // optional short topic, can be ""
  text: "Discuss the ...",      // the question text (required)
  marks: 10,                    // number: 10 or 15 (allow any positive number if user edits)
  wordLimit: 400,               // number
  modelAnswer: "..."            // reference answer text (can be "" but warn user)
}
```

### 2.2 Test (attempt) object

```js
{
  id: "t_1732171234567",          // "t_" + Date.now()
  date: "2026-11-21T09:30:00.000Z",// new Date().toISOString() at start
  totalMinutes: 30,               // number set by user
  usedSeconds: 1650,              // seconds actually used when submitted
  autoSubmitted: false,           // true if timer hit 0
  questions: [ /* copies of Question objects */ ],
  answers: {                      // key = question id
    "q_...": {
      text: "user typed answer",
      wordCount: 387,
      secondsSpent: 820           // time the user spent while this question was on screen
    }
  },
  scores: {                       // filled later by the user on History screen
    "q_...": null                 // number or null
  }
}
```

### 2.3 localStorage keys (use exactly these)

| Key | Content |
|-----|---------|
| `rbi_question_bank` | JSON array of Question objects saved for reuse |
| `rbi_current_setup` | JSON object `{ totalMinutes, questions: [...] }` – the setup the user is preparing |
| `rbi_active_test` | JSON Test object while a test is running (for crash/refresh recovery) |
| `rbi_history` | JSON array of finished Test objects (newest first) |

Always wrap `localStorage` reads in `try { ... } catch { return default }` and use `JSON.parse` safely.

---

## PHASE 1 – Page skeleton (index.html)

Create `index.html` with:

1. `<!DOCTYPE html>`, `<html lang="en">`, `<meta charset="UTF-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1.0">`, `<title>RBI Descriptive Practice</title>`, link to `style.css`.
2. A top `<header id="app-header">` with:
   - Title text: `RBI Descriptive Practice`
   - A `<nav>` with three buttons: `id="nav-setup"` (text "New Test"), `id="nav-bank"` (text "Question Bank"), `id="nav-history"` (text "History").
3. Four `<section>` elements, each with class `screen`. Only one is visible at a time:
   - `<section id="screen-setup" class="screen">`
   - `<section id="screen-exam" class="screen" hidden>`
   - `<section id="screen-result" class="screen" hidden>`
   - `<section id="screen-history" class="screen" hidden>`
   - `<section id="screen-bank" class="screen" hidden>`

### 1A. Inside `#screen-setup`

```
<h2>Set up today's test</h2>

<form id="question-form">
  <label>Paper
    <select id="q-paper">
      <option value="ESI">ESI (Economic & Social Issues)</option>
      <option value="F&M">F&M (Finance & Management)</option>
      <option value="English">English (Essay / Précis / Comprehension)</option>
      <option value="Other">Other</option>
    </select>
  </label>

  <label>Topic (optional) <input id="q-topic" type="text"></label>

  <label>Question <textarea id="q-text" rows="4" required></textarea></label>

  <label>Marks
    <select id="q-marks">
      <option value="10">10 marks</option>
      <option value="15">15 marks</option>
    </select>
  </label>

  <label>Word limit <input id="q-wordlimit" type="number" min="50" value="400"></label>

  <label>Model answer (reference) <textarea id="q-model" rows="8"></textarea></label>

  <label><input id="q-save-bank" type="checkbox" checked> Also save to Question Bank</label>

  <button type="submit" id="btn-add-question">Add question</button>
  <input type="hidden" id="q-edit-id" value="">
</form>

<h3>Questions in this test (<span id="setup-count">0</span>)</h3>
<ol id="setup-question-list"></ol>

<div id="setup-time-box">
  <label>Total time (minutes) <input id="setup-minutes" type="number" min="1" value="30"></label>
  <p id="setup-suggested-time"></p>
  <label><input id="setup-block-paste" type="checkbox" checked> Block copy-paste in answer box (like real exam)</label>
</div>

<button id="btn-start-test">Start Test</button>
<p id="setup-error" class="error"></p>
```

### 1B. Inside `#screen-exam`

```
<div id="exam-topbar">
  <span id="exam-qpos">Question 1 of 3</span>
  <span id="exam-marks">10 marks · 400 words</span>
  <span id="exam-timer">30:00</span>
</div>

<div id="exam-question-text"></div>

<textarea id="exam-answer" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off"
          placeholder="Type your answer here..."></textarea>

<div id="exam-bottombar">
  <span id="exam-wordcount">0 / 400 words</span>
  <div id="exam-palette"></div>   <!-- small numbered buttons, one per question -->
  <button id="btn-prev">◀ Previous</button>
  <button id="btn-next">Next ▶</button>
  <button id="btn-submit">Submit Test</button>
</div>

<div id="confirm-submit" class="modal" hidden>
  <p>Submit the test now? Unanswered questions will be saved as empty.</p>
  <button id="btn-confirm-yes">Yes, submit</button>
  <button id="btn-confirm-no">Cancel</button>
</div>
```

**Why `spellcheck="false"`:** the real RBI online descriptive test has no spell-check or autocorrect. Practice must be the same.

### 1C. Inside `#screen-result`

```
<h2>Test finished</h2>
<p id="result-summary"></p>

<div id="result-howto" class="info">
  <b>How to get your score:</b> click <b>Copy</b> (or Download) for a question,
  open Gemini or Claude, paste everything, and send. The AI will grade it like an RBI examiner.
</div>

<button id="btn-download-all">Download All (one .txt file)</button>
<button id="btn-copy-all">Copy All</button>

<div id="result-list"></div>   <!-- one card per question, built by JS -->

<button id="btn-go-history">Go to History</button>
```

### 1D. Inside `#screen-history`

```
<h2>Practice History</h2>
<div id="history-stats"></div>
<div id="history-list"></div>
<button id="btn-clear-history" class="danger">Delete all history</button>
```

### 1E. Inside `#screen-bank`

```
<h2>Question Bank</h2>
<input id="bank-search" type="text" placeholder="Search question or topic...">
<select id="bank-filter-paper">
  <option value="">All papers</option>
  <option value="ESI">ESI</option>
  <option value="F&M">F&M</option>
  <option value="English">English</option>
  <option value="Other">Other</option>
</select>
<div id="bank-list"></div>
<button id="btn-bank-export">Export bank (.json)</button>
<label class="file-btn">Import bank (.json) <input id="bank-import" type="file" accept=".json" hidden></label>
```

### ✅ Verify Phase 1
- [ ] Opening `index.html` in a browser shows the header and the Setup form, no console errors (except that app.js/prompt.js may not exist yet).
- [ ] All IDs above exist exactly once (search the file for each ID).
- [ ] The other four screens are not visible (they have `hidden`).

---

## PHASE 2 – Styling (style.css)

Goals: clean, readable, looks a bit like an online exam interface, works on laptop and phone.

1. Use CSS variables at the top:
   ```css
   :root {
     --bg: #f5f7fa; --card: #ffffff; --text: #1f2933; --muted: #616e7c;
     --primary: #1d4ed8; --primary-text: #ffffff; --danger: #b91c1c;
     --ok: #15803d; --warn: #b45309; --border: #d2d6dc;
   }
   ```
2. `body`: font-family `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; background `var(--bg)`; color `var(--text)`; margin 0.
3. `main`/screens: `max-width: 960px; margin: 0 auto; padding: 16px;`.
4. `[hidden] { display: none !important; }` (very important – screens rely on it).
5. Labels in the form: `display: block; margin-bottom: 12px;`. Inputs, selects, textareas: `width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 16px;`. (Exception: checkboxes keep normal width – use `input[type=checkbox] { width: auto; }`.)
6. Buttons: padding `8px 16px`, border-radius 6px, background `var(--primary)`, white text, no border, cursor pointer. `.danger` uses `var(--danger)`. Disabled buttons: opacity 0.5.
7. Exam screen:
   - `#exam-topbar`: flex, `justify-content: space-between`, sticky at top, white background, bottom border, padding 8px.
   - `#exam-timer`: monospace font, font-size 24px, bold. Class `.timer-warning` (last 5 minutes) → color `var(--warn)`. Class `.timer-danger` (last 1 minute) → color `var(--danger)` and a slow blink animation.
   - `#exam-question-text`: white card, padding 12px, `white-space: pre-wrap` (keep the user's line breaks).
   - `#exam-answer`: `height: 55vh; font-size: 16px; line-height: 1.6; font-family: Georgia, serif; resize: vertical;`.
   - `#exam-wordcount`: bold. Class `.over-limit` → `var(--danger)`. Class `.near-limit` (≥ 90% of limit) → `var(--warn)`. Class `.in-range` (≥ 70% and ≤ 110%) → `var(--ok)`.
   - `#exam-palette button`: small square buttons (32×32). Class `.answered` → green background. Class `.current` → thick outline.
8. `.modal`: fixed, centered box with dark semi-transparent overlay behind.
9. Result cards (`.result-card`): white, border, radius 8px, padding 12px, margin-bottom 12px. Inside, a `<pre class="txt-preview">` with `max-height: 250px; overflow: auto; white-space: pre-wrap; background: #f0f2f5; font-size: 13px;`.
10. `.error` → red text. `.info` → light blue box.
11. Mobile: `@media (max-width: 600px)` → buttons full width in `#exam-bottombar`, `#exam-topbar` font smaller.

### ✅ Verify Phase 2
- [ ] Page looks clean on a laptop width and at 400px width (use browser dev tools device mode).
- [ ] Screens with `hidden` are really invisible.

---

## PHASE 3 – Evaluation prompt (prompt.js)

Create `prompt.js` containing ONE global constant `EVAL_PROMPT_TEMPLATE` (use `const` at top level, no export). It is a JavaScript template string with placeholders written like `{{PLACEHOLDER}}`. **Copy the text below exactly** (between the two `=====` lines; do not include the `=====` lines themselves).

```js
const EVAL_PROMPT_TEMPLATE = `...the text below...`;
```

> Note for the agent: inside a JS template string, backticks (`) and `${` must be escaped. The text below contains neither, so you can paste it directly.

=====
################################################################
#  RBI GRADE B – DESCRIPTIVE ANSWER EVALUATION REQUEST
#  (Paste this whole text into Gemini / Claude / ChatGPT)
################################################################

ROLE
You are a strict, experienced examiner for the RBI Grade B Officer Phase 2
descriptive papers (ESI – Economic & Social Issues, F&M – Finance &
Management, and English Writing Skills). You have evaluated thousands of
answer scripts. You grade honestly and do NOT inflate marks. A typical
good candidate scores 50–65% of the maximum marks; above 75% is rare and
only for excellent answers.

TASK
Evaluate the CANDIDATE ANSWER below for the given QUESTION.
The MODEL ANSWER is a reference only: the candidate does NOT need to copy
it. Give credit for any correct, relevant point even if it is not in the
model answer. Do not give credit for points that are wrong, irrelevant
or only vaguely stated.

----------------------------------------------------------------
QUESTION DETAILS
----------------------------------------------------------------
Paper          : {{PAPER}}
Topic          : {{TOPIC}}
Maximum marks  : {{MARKS}}
Word limit     : {{WORD_LIMIT}} words
Candidate words: {{WORD_COUNT}} words ({{WORD_PERCENT}}% of limit)
Time spent     : {{TIME_SPENT}}
Test date      : {{DATE}}

QUESTION:
{{QUESTION}}

----------------------------------------------------------------
CANDIDATE ANSWER (typed under exam conditions, no spell-check)
----------------------------------------------------------------
{{ANSWER}}

----------------------------------------------------------------
MODEL / REFERENCE ANSWER (for the examiner only)
----------------------------------------------------------------
{{MODEL_ANSWER}}

----------------------------------------------------------------
MARKING SCHEME (score each parameter; total = {{MARKS}} marks)
----------------------------------------------------------------
Use these weights (as a percentage of the maximum marks). Convert to
marks and round each parameter to the nearest 0.5.

 1. Understanding & relevance (10%)
    - Did the candidate understand exactly what is asked
      (discuss / analyse / critically examine / suggest measures)?
    - Is every paragraph relevant to the question?
 2. Content, accuracy & depth (35%)
    - Correct concepts, definitions, mechanisms.
    - Depth of analysis, cause–effect, pros and cons.
    - Coverage of the key points expected (compare with model answer,
      but accept other valid points).
 3. Facts, data & current relevance (15%)
    - Use of recent data, RBI/Government policies, committees, schemes,
      reports (Economic Survey, Union Budget, RBI Annual Report,
      Monetary Policy statements, etc.).
    - Facts must be correct. Penalise wrong numbers or wrong names.
 4. Structure & presentation (20%)
    - Clear introduction (definition / context / data hook).
    - Logical body with sub-headings or points where suitable.
    - Balanced conclusion / way forward.
    - Short paragraphs, readable flow.
 5. Language & expression (10%)
    - Grammar, spelling, sentence clarity, formal tone.
    - Precise economic / financial / management terminology.
 6. Word-limit discipline (10%)
    - 90%–110% of limit  : full marks for this parameter.
    - 75%–89% or 111%–120%: half marks for this parameter.
    - Below 75% or above 120%: zero for this parameter, AND mention it
      clearly as a serious exam mistake.
    - If the answer is empty or under 30 words, give 0 total marks.

For an English essay/précis question, read parameter 3 as
"Ideas, arguments & examples" and give extra attention to parameters 4
and 5.

----------------------------------------------------------------
REQUIRED OUTPUT FORMAT (follow exactly, in this order)
----------------------------------------------------------------
1. FINAL SCORE:  X / {{MARKS}}   (also show the percentage)

2. SCORE TABLE
   | Parameter | Max | Given | One-line reason |
   (one row for each of the 6 parameters, then a TOTAL row)

3. WHAT YOU DID WELL (3–5 bullet points, specific, quote your lines)

4. MISSING / WEAK POINTS (bullet list of important points the
   candidate missed or explained poorly – these are what cost marks)

5. ERRORS (factual mistakes, wrong data, grammar/spelling mistakes –
   quote the wrong text and give the correction)

6. STRUCTURE FEEDBACK (how the intro, body and conclusion could be
   better; suggest good sub-headings)

7. IMPROVED MODEL ANSWER
   Rewrite the answer as a top-scoring RBI Grade B answer, strictly
   within {{WORD_LIMIT}} words, with an introduction, sub-headings,
   and a conclusion. Show its word count at the end.

8. 3 ACTION ITEMS FOR TOMORROW'S PRACTICE (short, practical)

9. ONE-LINE SUMMARY in this exact format (so I can log it):
   SCORE_LOG | {{PAPER}} | {{MARKS}} marks | X/{{MARKS}} | {{WORD_COUNT}} words

Be honest and strict. Do not be polite at the cost of accuracy.
################################################################
=====

Also add, below the constant, a second constant for the combined file header:

```js
const COMBINED_HEADER_TEMPLATE = `RBI DESCRIPTIVE PRACTICE – FULL TEST
Date: {{DATE}}
Questions: {{COUNT}} | Total time given: {{TOTAL_MINUTES}} min | Time used: {{USED_TIME}}{{AUTO_NOTE}}

INSTRUCTION TO THE AI: This file contains {{COUNT}} separate evaluation
requests, separated by lines of ====. Evaluate EACH question separately
using its own instructions and output format. At the very end, give a
table: Question no. | Marks obtained | Max marks, and the TOTAL.
`;
```

### ✅ Verify Phase 3
- [ ] Open the browser console and type `EVAL_PROMPT_TEMPLATE.length` → shows a number > 3000.
- [ ] Type `EVAL_PROMPT_TEMPLATE.includes("{{ANSWER}}")` → `true`.
- [ ] No syntax error in the console.

---

## PHASE 4 – Core helpers (app.js, top of file)

Write these helper functions first, exactly with these names. Put `"use strict";` at the very top of `app.js`.

```js
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

// Show one screen, hide all others
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.hidden = true);
  $("screen-" + name).hidden = false;
  window.scrollTo(0, 0);
}

// Download text as a .txt file
function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Copy text to clipboard, with fallback for file:// pages
async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); ta.remove();
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
```

**SECURITY RULE:** Whenever you put user text (question, answer, topic) into the page, use `escapeHTML()` or `textContent`. Never put raw user text into `innerHTML`.

### ✅ Verify Phase 4
In the browser console:
- [ ] `countWords("  The RBI   raised\nrates ")` → `4`
- [ ] `countWords("")` → `0`
- [ ] `formatTime(125)` → `"02:05"`; `formatTime(3725)` → `"1:02:05"`
- [ ] `fillTemplate("Hi {{A}}", {A: "x"})` → `"Hi x"`

---

## PHASE 5 – Setup screen logic

Keep a global state object at the top of app.js (after helpers):

```js
const state = {
  setup: loadJSON("rbi_current_setup", { totalMinutes: 30, questions: [] }),
  test: null,          // active Test object during the exam
  currentIndex: 0,     // which question is on screen
  timerId: null,       // setInterval id
  endTime: 0,          // Date.now() value when time ends
  questionShownAt: 0   // Date.now() when current question was shown
};
```

Implement these functions:

1. **`saveSetup()`** – `saveJSON("rbi_current_setup", state.setup)`.

2. **Marks → word limit auto-fill:** on `change` of `#q-marks`, set `#q-wordlimit` value to `defaultWordLimit(marks)`.

3. **`renderSetupList()`**
   - Clear `#setup-question-list`.
   - For each question in `state.setup.questions`, add an `<li>` showing: `[paper] (marks marks, wordLimit words)` + first 120 characters of the question text + "…" if longer. If `modelAnswer` is empty, add a small orange note "no model answer".
   - Each `<li>` has three small buttons: **Edit**, **Delete**, **▲** (move up). Use `data-id` attributes and one event listener on the list (event delegation).
   - Set `#setup-count` text to the number of questions.
   - Update `#setup-suggested-time` text: `Suggested time (RBI pace ≈ 1 min per 25 words): N minutes`, where N = `Math.ceil(sum of wordLimit / 25)`. Example: 400 words → 16 min, 600 words → 24 min. (Just a suggestion; do not change the user's value.)
   - Set `#setup-minutes` value from `state.setup.totalMinutes`.

4. **Form submit (`#question-form` → `submit`)**
   - `event.preventDefault()`.
   - Read all fields. Trim text. If question text is empty → show error in `#setup-error` and stop.
   - If `#q-edit-id` has a value → update that question in `state.setup.questions` (keep same id). Else → create a new question with `makeId("q")` and push it.
   - If `#q-save-bank` is checked → also add/update it in `rbi_question_bank` (match by id; if new, push).
   - `saveSetup()`, `renderSetupList()`, reset the form (`form.reset()`, set word limit back to 400, clear `#q-edit-id`, change button text back to "Add question"), clear error, focus `#q-text`.

5. **Edit button** – fill the form with that question's values, set `#q-edit-id` to its id, change submit button text to "Update question", scroll to the form.

6. **Delete button** – `confirm("Remove this question from the test?")` then remove from `state.setup.questions`, save, re-render. (This does NOT remove it from the bank.)

7. **Move up button** – swap with previous item, save, re-render.

8. **`#setup-minutes` change** – save the number into `state.setup.totalMinutes` (min 1), `saveSetup()`.

9. **Start Test (`#btn-start-test`)** – validation:
   - At least 1 question, else error "Add at least one question."
   - Minutes ≥ 1, else error.
   - If any question has empty model answer → `confirm("Some questions have no model answer. The AI will grade without a reference. Continue?")`.
   - Then call `startTest()` (Phase 6).

### ✅ Verify Phase 5
- [ ] Add 2 questions (one 10 marks, one 15 marks). Word limit auto-changes 400 ↔ 600 when marks change.
- [ ] Refresh the page → the 2 questions are still listed (localStorage works).
- [ ] Edit a question → changes appear, no duplicate created.
- [ ] Delete and Move up work.
- [ ] Suggested time shows 16 + 24 = 40 minutes for 400 + 600 words.
- [ ] Clicking Start with 0 questions shows the error.
- [ ] Typing `<b>hi</b>` as question text shows the tags as plain text, not bold.

---

## PHASE 6 – Exam screen logic (timer + typing)

### 6.1 `startTest()`
1. Build the Test object (see 2.2): deep copy questions with `JSON.parse(JSON.stringify(state.setup.questions))`. For each question create `answers[id] = { text: "", wordCount: 0, secondsSpent: 0 }` and `scores[id] = null`.
2. `state.test = test; state.currentIndex = 0;`
3. `state.endTime = Date.now() + totalMinutes * 60 * 1000;` Also store `test.endTime = state.endTime` so a refresh can resume.
4. `saveJSON("rbi_active_test", test)`.
5. Build the palette buttons (`renderPalette()`), show question 0 (`showQuestion(0)`), `showScreen("exam")`.
6. Hide the header nav during the exam (set `#app-header nav` hidden = true) so the user cannot leave by accident.
7. Start timer: `state.timerId = setInterval(tick, 500);` and call `tick()` once immediately.
8. Add `window.onbeforeunload = () => "Test in progress";` (warns on closing tab).

### 6.2 `tick()`
- `remaining = Math.round((state.endTime - Date.now()) / 1000)`.
- **Important:** compute remaining from `endTime`, NOT by subtracting 1 each second (setInterval drifts and pauses in background tabs).
- Update `#exam-timer` text with `formatTime(remaining)`.
- If remaining ≤ 300 add class `timer-warning`; if ≤ 60 replace with `timer-danger`.
- If remaining ≤ 0 → `finishTest(true)`.

### 6.3 `showQuestion(index)`
1. First call `storeCurrentAnswer()` (save what is in the textarea for the old question and add time spent: `secondsSpent += (Date.now() - state.questionShownAt) / 1000`). Skip this on the very first call (when `questionShownAt` is 0).
2. Set `state.currentIndex = index; state.questionShownAt = Date.now();`
3. Fill `#exam-qpos` ("Question 2 of 3"), `#exam-marks` ("[ESI] 15 marks · 600 words"), `#exam-question-text` (use `textContent`).
4. Set `#exam-answer` value to the saved answer text; focus it; put cursor at the end.
5. Disable `#btn-prev` on first question, `#btn-next` on last question.
6. `updateWordCount()`, `renderPalette()`.

### 6.4 `storeCurrentAnswer()`
- Save textarea value and `countWords()` into `state.test.answers[currentQuestionId]`.
- Add time spent since `questionShownAt`, then set `questionShownAt = Date.now()`.
- `saveJSON("rbi_active_test", state.test)`.

### 6.5 Typing events on `#exam-answer`
- `input` event → `updateWordCount()`; also save the text into `state.test.answers[...]` and call `saveJSON("rbi_active_test", ...)` **at most once every 2 seconds** (simple throttle: keep a `lastAutoSave` timestamp).
- `updateWordCount()` → set `#exam-wordcount` text to `"{count} / {limit} words"` and set the class:
  - `count > limit` → `over-limit`
  - else `count >= 0.9 * limit` → `near-limit`
  - else `count >= 0.7 * limit` → `in-range`
  - else no class.
  Also mark the palette button as `answered` when count > 0.
- Do **not** stop the user from typing past the limit (the real exam allows it; the grader will penalise it).
- **Block paste (if `#setup-block-paste` was checked at start, store it as `test.blockPaste`):** add listeners for `paste`, `drop` on the textarea that call `event.preventDefault()` and briefly show "Paste is disabled (exam mode)" in `#exam-wordcount`.
- **Tab key:** pressing Tab inside the textarea should insert 4 spaces instead of leaving the box (`keydown`, check `e.key === "Tab"`, preventDefault, insert text at cursor with `setRangeText("    ", start, end, "end")`).

### 6.6 Navigation
- `#btn-prev` → `showQuestion(currentIndex - 1)`; `#btn-next` → `showQuestion(currentIndex + 1)`.
- Palette buttons → `showQuestion(i)`.
- Keyboard shortcut: `Ctrl+Alt+→` / `Ctrl+Alt+←` for next/previous (optional, only if easy).

### 6.7 Submit
- `#btn-submit` → show `#confirm-submit` modal. "Yes" → `finishTest(false)`. "Cancel" → hide modal.

### 6.8 `finishTest(auto)`
1. `clearInterval(state.timerId)`.
2. `storeCurrentAnswer()`.
3. `test.autoSubmitted = auto;` `test.usedSeconds = Math.min(totalMinutes*60, Math.round((Date.now() - new Date(test.date).getTime()) / 1000));`
4. Add the test to the front of `rbi_history` (`unshift`) and save.
5. `localStorage.removeItem("rbi_active_test")`.
6. `window.onbeforeunload = null;` show header nav again.
7. If `auto` → `alert("Time is up! Your test has been submitted.")`.
8. `renderResult(test)` and `showScreen("result")`.

### 6.9 Resume after refresh (on page load)
On `DOMContentLoaded`: if `rbi_active_test` exists:
- If its `endTime` is still in the future → `confirm("You have a test in progress. Resume it?")`. Yes → restore `state.test`, `state.endTime = test.endTime`, render and restart timer (same as steps 5–8 of startTest, but do not rebuild answers). No → finish it as submitted (`finishTest(false)` after restoring state).
- If `endTime` has passed → restore state and call `finishTest(true)`.

### ✅ Verify Phase 6
- [ ] Set time to 1 minute, start. Timer counts down 01:00 → 00:00 smoothly, turns red in the last minute, then auto-submits with the alert.
- [ ] Word count updates while typing; colour changes near/over limit.
- [ ] Type in Q1, go to Q2, come back → Q1 text is still there.
- [ ] Paste is blocked when the option was checked; allowed when unchecked.
- [ ] Refresh the page in the middle of a test → asked to resume → text and remaining time are correct.
- [ ] Switch to another browser tab for 30 seconds and back → timer shows correct remaining time (not paused).
- [ ] Browser spell-check red underlines do NOT appear in the answer box.

---

## PHASE 7 – Result screen + .txt file generation

### 7.1 `buildQuestionText(test, question, index)` → returns a string

Fill `EVAL_PROMPT_TEMPLATE` with `fillTemplate()` using:

| Placeholder | Value |
|---|---|
| `PAPER` | `question.paper` |
| `TOPIC` | `question.topic` or `"Not specified"` |
| `MARKS` | `question.marks` |
| `WORD_LIMIT` | `question.wordLimit` |
| `WORD_COUNT` | `answer.wordCount` |
| `WORD_PERCENT` | `Math.round(wordCount / wordLimit * 100)` |
| `TIME_SPENT` | `formatDuration(answer.secondsSpent)` |
| `DATE` | `new Date(test.date).toLocaleString()` |
| `QUESTION` | `question.text` |
| `ANSWER` | `answer.text.trim()` or `"[NO ANSWER WRITTEN]"` |
| `MODEL_ANSWER` | `question.modelAnswer.trim()` or `"[No model answer provided – evaluate using your own expert knowledge of the topic.]"` |

Then add this line at the very top of the returned string: `"QUESTION " + (index + 1) + " OF " + test.questions.length + "\n"`.

**Important:** Do **not** run `fillTemplate` on the user's answer text after inserting it (if the user's answer contains `{{` it must stay as it is). Since `fillTemplate` replaces in one pass on the template only, this is already safe – just do not call it twice.

### 7.2 `buildCombinedText(test)` → returns a string
- `fillTemplate(COMBINED_HEADER_TEMPLATE, { DATE, COUNT, TOTAL_MINUTES, USED_TIME: formatDuration(test.usedSeconds), AUTO_NOTE: test.autoSubmitted ? " (auto-submitted, time over)" : "" })`
- Then for each question: `"\n\n" + "=".repeat(64) + "\n\n" + buildQuestionText(...)`.

### 7.3 File names
- Per question: `RBI_<YYYY-MM-DD>_Q<n>_<paper>_<marks>m.txt`, e.g. `RBI_2026-11-21_Q1_ESI_10m.txt`. Replace `&` in paper with `and` (`F&M` → `FandM`). Use the local date.
- Combined: `RBI_<YYYY-MM-DD>_FullTest.txt`.

### 7.4 `renderResult(test)`
1. `#result-summary` text: `"Answered X of N questions · Time used: <formatDuration> of <totalMinutes> min"` + `" · Auto-submitted"` if auto.
2. Clear `#result-list`. For each question create a `.result-card` with:
   - Heading: `Q1 · ESI · 10 marks · 387/400 words` (red text if over limit, orange if below 75%).
   - Buttons: **Copy** (calls `copyText(text, button)`), **Download .txt** (calls `downloadText(filename, text)`), **Show model answer** (toggles a `<div>` that shows the model answer next to the user's answer for quick self-check).
   - `<pre class="txt-preview">` containing the full text (set with `textContent`).
3. `#btn-download-all` → `downloadText(combinedFilename, buildCombinedText(test))`.
4. `#btn-copy-all` → `copyText(buildCombinedText(test), button)`.
5. `#btn-go-history` → render history and `showScreen("history")`.
6. Keep the current test available in `state.lastResultTest` so the buttons know which test to use.

### ✅ Verify Phase 7
- [ ] After a test, each question has a card, and the preview shows the full prompt + question + your answer + model answer.
- [ ] No `{{...}}` placeholders are left in the text (search the preview).
- [ ] Download gives a `.txt` with the correct name; it opens fine in Notepad and Hindi/₹ symbols display correctly (UTF-8).
- [ ] Copy → paste into Gemini/Claude → the AI replies with a score in the requested format.
- [ ] Download All gives one file with all questions separated by `====` lines.

---

## PHASE 8 – History screen

### 8.1 `renderHistory()`
1. Load `rbi_history`.
2. If empty → show "No tests yet. Start your first practice!".
3. `#history-stats`: show
   - Total tests taken, total questions answered.
   - **Current daily streak**: number of consecutive days (ending today or yesterday) on which at least one test was taken (compare local dates as `YYYY-MM-DD` strings).
   - Average score % (only from questions where the user entered a score): `sum(score/marks) / count * 100`, rounded to 1 decimal.
   - Average word-limit adherence: average of `wordCount / wordLimit * 100`.
4. `#history-list`: one card per test (newest first) with: date & time, number of questions, time used/total, and a small table:
   `Q# | Paper | Marks | Words | Score (input) | Buttons`
   - The **Score** cell is an `<input type="number" step="0.5" min="0" max="{marks}">` prefilled with the saved score. On `change`, save the number (or `null` if empty) into that test's `scores[qid]` in `rbi_history`, then refresh the stats.
   - Buttons per row: **Copy** and **Download** (same text as on the result screen – reuse `buildQuestionText`).
   - Per test: **Open results** (calls `renderResult(test)` + `showScreen("result")`), **Retake** (puts this test's questions into `state.setup.questions`, saves, goes to setup screen), **Delete** (confirm, remove from history).
5. `#btn-clear-history` → double confirm (`confirm` then type-check: `prompt('Type DELETE to confirm') === 'DELETE'`) then remove `rbi_history`.

**Tip for the user (show as small text under the score input header):** "Paste the AI's `SCORE_LOG` line result here to track progress."

### ✅ Verify Phase 8
- [ ] Finished tests appear newest first.
- [ ] Entering a score and refreshing the page keeps the score.
- [ ] Average score % updates after entering scores.
- [ ] Streak shows 1 after today's test.
- [ ] Retake loads the same questions into Setup.

---

## PHASE 9 – Question Bank screen

### 9.1 `renderBank()`
1. Load `rbi_question_bank`.
2. Filter by `#bank-filter-paper` value (if not empty) and by `#bank-search` text (case-insensitive search in `text` and `topic`). Re-render on `input`/`change` of these controls.
3. For each question show a card: paper, topic, marks/word limit, first 200 chars of the question, and whether a model answer exists.
4. Buttons per card: **Add to today's test** (push a copy into `state.setup.questions` if not already there by id, save, show "Added ✓"), **Edit** (load into the setup form, switch to setup screen), **Delete from bank** (confirm).
5. Add a button at the top: **Add 3 random questions** (picks 3 random questions from the filtered list that are not already in setup).

### 9.2 Export / Import
- **Export** → `downloadText("RBI_question_bank_<date>.json", JSON.stringify(bank, null, 2))`.
- **Import** → read file with `FileReader`, `JSON.parse`, check it is an array and each item has a `text` string. Merge into the bank (skip items whose `id` already exists; give new ids to items with no id; fill missing fields with defaults: paper "Other", marks 10, wordLimit 400, topic "", modelAnswer ""). Show "Imported N questions".
- Wrap everything in try/catch and `alert` a clear error message for a bad file.

### ✅ Verify Phase 9
- [ ] Questions added with "Also save to Question Bank" appear here.
- [ ] Search and paper filter work.
- [ ] Export, then delete one question, then Import → the question returns, no duplicates.
- [ ] "Add 3 random questions" adds 3 different questions to setup.

---

## PHASE 10 – Wiring everything together

At the bottom of `app.js`:

```js
document.addEventListener("DOMContentLoaded", () => {
  // 1. attach all event listeners (setup form, buttons, exam, result, history, bank, nav)
  // 2. nav buttons: nav-setup -> renderSetupList(); showScreen("setup")
  //                 nav-bank -> renderBank(); showScreen("bank")
  //                 nav-history -> renderHistory(); showScreen("history")
  // 3. renderSetupList(); showScreen("setup");
  // 4. check for an active test to resume (Phase 6.9)
});
```

Make sure every listener is attached **once** (not inside render functions – use event delegation on list containers instead).

### ✅ Verify Phase 10 (full end-to-end test)
Do this whole flow without errors in the console:
1. Fresh browser (clear localStorage: `localStorage.clear()` in the console, then refresh).
2. Add Q1: ESI, 10 marks, "Discuss the role of monetary policy transmission in controlling inflation in India." + a short model answer.
3. Add Q2: F&M, 15 marks, "Explain the concept of Expected Credit Loss (ECL) and its significance for Indian banks." + a short model answer.
4. Set time 5 minutes. Start.
5. Type ~50 words in Q1, ~30 in Q2. Check word counts.
6. Submit. Check result cards, Copy, Download, Download All.
7. Paste one file into Gemini → confirm it returns a score table.
8. Go to History, enter a score, refresh, check it stayed.
9. Open Question Bank, both questions are there.
10. Test on a mobile-width screen.

---

## PHASE 11 – README.md

Replace README.md content with a short user guide:

1. **What it is** (2 lines).
2. **How to open**: download/clone → double-click `index.html`. Or enable GitHub Pages (Settings → Pages → Branch: main → / (root)) and open the link on any device.
3. **Daily routine** (recommended):
   - Pick 2–3 questions (mix of 10 and 15 marks; ESI + F&M).
   - Time: about 1 minute per 25 words (400 words ≈ 16 min, 600 words ≈ 24 min) – a little less than comfortable, to build speed.
   - Write without pausing; no spell-check, no paste.
   - Submit → Copy each question → paste into Gemini/Claude → read feedback.
   - Enter the score in History. Re-write the "Improved model answer" in your own words once.
4. **Data storage note**: everything is stored only in this browser (localStorage). Use **Export bank** regularly as a backup. Clearing browser data deletes history.
5. **Privacy**: nothing is sent anywhere; you choose what to paste into the AI.

---

## PHASE 12 – Final checks (do all before saying "done")

- [ ] No external libraries/CDN links anywhere (`grep -n "http" index.html app.js style.css` should show nothing important).
- [ ] No `console.log` left except for real errors.
- [ ] No user text is inserted with `innerHTML` without `escapeHTML`.
- [ ] Works in Chrome and Firefox, opened directly as a file.
- [ ] All Verify checklists from Phases 1–10 pass.
- [ ] Commit with message: `Build RBI descriptive practice site`.

---

## Appendix A – Common mistakes to avoid (for the agent)

1. **Timer drift:** never do `remaining--` in setInterval. Always compute from `endTime`.
2. **Lost answers:** always call `storeCurrentAnswer()` before changing question and before finishing.
3. **Listeners added many times:** don't call `addEventListener` inside a render function for elements that are re-created; use one listener on the parent container + `event.target.closest("button[data-action]")`.
4. **`hidden` not working:** the CSS rule `[hidden]{display:none!important}` is required because other CSS `display` values override `hidden`.
5. **Template literal breaking:** if you edit the prompt and add a backtick (`) or `${`, escape it as \` and \${.
6. **Numbers stored as strings:** convert form values with `Number(...)` for marks, wordLimit, minutes, score.
7. **ES modules:** don't use `import`/`export` – the site must run from `file://`.
8. **Clipboard on file://:** `navigator.clipboard` may fail; the fallback with `execCommand("copy")` is required.

## Appendix B – Example of one generated .txt file (shortened)

```
QUESTION 1 OF 2
################################################################
#  RBI GRADE B – DESCRIPTIVE ANSWER EVALUATION REQUEST
...
Paper          : ESI
Topic          : Monetary policy
Maximum marks  : 10
Word limit     : 400 words
Candidate words: 387 words (97% of limit)
Time spent     : 15 min 40 sec
...
QUESTION:
Discuss the role of monetary policy transmission in controlling inflation in India.
...
CANDIDATE ANSWER (typed under exam conditions, no spell-check)
...
Monetary policy transmission refers to ...
...
MODEL / REFERENCE ANSWER (for the examiner only)
...
REQUIRED OUTPUT FORMAT ...
9. ONE-LINE SUMMARY ...
   SCORE_LOG | ESI | 10 marks | X/10 | 387 words
```
