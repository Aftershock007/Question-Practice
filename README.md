# Descriptive Typing Test Practice

A personal, offline typing test and descriptive answer practice website designed for daily timed writing sessions. It simulates real exam typing conditions (no spell-check or autocorrect, optional copy-paste blocking, live word limits and counters) and automatically exports structured evaluation prompts for AI grading with models like Gemini, Claude, and ChatGPT.

---

## Features

- **Objective (MCQ) / Subjective (Phase-2) switch:** The header switch toggles between the MCQ console (Phase-1 and Phase-2 objective papers) and descriptive answer writing.
- **Phase-1 Objective Practice (Real TCS iON Simulation):**
  - Real exam interface with countdown timer, candidate profile bar, and question options `[A]` through `[E]`.
  - Authentic 5-color TCS iON Question Palette: Answered (Green), Not Answered (Red), Not Visited (Grey), Marked for Review (Purple), and Answered & Marked for Review.
  - Automatic answer key matching, immediate net scoring (+1.00 correct, -0.25 negative marking), scorecard, and question-by-question review with filters.
- **Phase-2 Descriptive Typing Practice:**
  - Four dedicated papers: **ESI (Economic & Social Issues)**, **Finance**, **Management**, and **English Descriptive**.
  - Exam conditions simulation: spell-check/autocorrect disabled, live word counts (`Words typed: X / Y`), Tab indentation support, and optional paste prevention.
  - Automatic AI evaluation prompt generation (ready for Gemini, Claude, and ChatGPT).
- **Calendar & TODO (your daily routine):**
  - One calendar for the whole plan. The built-in plan is `RBI_Study_Schedule.xlsx` (415 days); you can also upload your own timetable.
  - Every plan day gets 3 exam TODOs: **Phase-2 subjective exam**, **Phase-2 objective exam** and **Phase-1 objective exam**, plus a current-affairs TODO on days the plan has one.
  - **Test days are always visible:** chapter tests, mix tests and current-affairs objective tests are tagged on the calendar (P2 / P1 / CA), and the next ones are listed under **Upcoming tests**.
  - Click a day to see its plan focus and TODOs. Tick TODOs, add your own TODO for any date, edit / move a TODO, or hide a plan TODO (restorable).
  - **▶ Start subjective / ▶ Start objective** on a TODO opens the right test; submitting that test ticks the TODO automatically.
  - Streak, today's 3 exams, month progress and plan progress at the top. A day is complete when all of its TODOs are ticked.
  - Plan settings: Day 1 date, "days already finished", built-in plan, upload timetable (.xlsx / .csv), template, export plan / your TODOs, remove plan.
- **DOCX & PDF File Import:** Directly upload Word (.docx) or PDF (.pdf) documents with robust decompression handling (including ZIP data descriptors) to extract questions, options, answer keys, and model answers.
- **Included Example Practice Documents:**
  - `Spotlight-Questions-1-6-Nov-2026.docx`: 200 General Awareness Phase-1 MCQs with options and full answer key table.
  - `CH-1-National_Income-Answer-Writing.docx`: ESI Chapter 1 National Income descriptive practice questions with model answers.
- **History Tracking:** Comprehensive logs of test scores, accuracy %, time spent, and performance trends for both phases.

---

## How to Open

- **Direct local use:** Clone or download this repository, then double-click `index.html` to open it directly in any browser (works out of the box via `file://`).
- **GitHub Pages:** Host it online for access from any device by enabling GitHub Pages (*Settings → Pages → Branch: main → / (root)*).

No backend server, Node.js runtime, build steps, or external dependencies are required.

---

## Recommended Daily Routine

1. **Select Questions:** Pick 2-3 questions with target word limits (e.g., 400 or 600 words) across your focus subjects (**ESI**, **Finance**, **Management**, or **English Descriptive**).
2. **Set Strict Timing:** Aim for a focused writing pace (e.g., ~25 words per minute) to build typing speed, focus, and answer structure discipline.
3. **Simulate Real Exam Conditions:** Type continuously without pausing, without browser autocorrect or spell-check, and with copy-paste blocked.
4. **Submit & Evaluate with AI:** Click **Copy** (or Download .txt) for each completed question, paste the complete generated prompt into Gemini or Claude, and let the AI grade your response against standard assessment criteria.
5. **Track & Review:** Enter the score into the History screen to track your daily streak and performance trends.

---

## Data Storage & Privacy

- **Local Storage:** All active tests, timetable plans, and attempt histories are stored strictly inside your browser's `localStorage`.
- **Clearing Browser Data:** Clearing your browser cache and cookies will erase locally saved test histories.

---

## Privacy & Security

Your answers, model references, and test metrics remain 100% on your device. Nothing is sent to any external server or telemetry service. You remain in complete control over what evaluation text you paste into your preferred AI assistant.
