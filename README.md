# Descriptive Typing Test Practice

A personal, offline typing test and descriptive answer practice website designed for daily timed writing sessions. It simulates real exam typing conditions (no spell-check or autocorrect, optional copy-paste blocking, live word limits and counters) and automatically exports structured evaluation prompts for AI grading with models like Gemini, Claude, and ChatGPT.

---

## Features

- **Custom Practice Setup:** Add custom questions, specify topics, paper categories, target word limits, and reference model answers.
- **Realistic Typing Interface:** Countdown timer with visual warning thresholds, live word count adherence tracking, Tab indentation support, and optional paste prevention to simulate genuine test conditions.
- **AI Evaluation Prompt Generation:** Instantly exports comprehensive `.txt` evaluation prompts containing your typed answer, word count, time spent, and reference model answer ready to paste directly into AI tools for scoring and feedback.
- **Question Bank:** Save and organize questions by category/topic, search your question library, pick random questions for quick practice, and import/export via JSON.
- **Progress & History Tracking:** Automatically logs test attempts with time used, words typed, daily streak tracking, and score recording to monitor your improvement over time.

---

## How to Open

- **Direct local use:** Clone or download this repository, then double-click `index.html` to open it directly in any browser (works out of the box via `file://`).
- **GitHub Pages:** Host it online for access from any device by enabling GitHub Pages (*Settings → Pages → Branch: main → / (root)*).

No backend server, Node.js runtime, build steps, or external dependencies are required.

---

## Recommended Daily Routine

1. **Select Questions:** Pick 2–3 questions with target word limits (e.g., 400 or 600 words).
2. **Set Strict Timing:** Aim for a focused writing pace (e.g., ~25 words per minute) to build typing speed, focus, and answer structure discipline.
3. **Simulate Real Exam Conditions:** Type continuously without pausing, without browser autocorrect or spell-check, and with copy-paste blocked.
4. **Submit & Evaluate with AI:** Click **Copy** (or Download .txt) for each completed question, paste the complete generated prompt into Gemini or Claude, and let the AI grade your response against standard assessment criteria.
5. **Track & Review:** Enter the score into the History screen to track your daily streak and performance trends.

---

## Data Storage & Backup

- **Local Storage:** All questions, active tests, and attempt histories are stored strictly inside your browser's `localStorage`.
- **Backup Regularly:** Use the **Export bank (.json)** button on the Question Bank screen to create regular backup files of your question library.
- **Clearing Browser Data:** Clearing your browser cache and cookies will erase locally saved test histories unless exported.

---

## Privacy & Security

Your answers, model references, and test metrics remain 100% on your device. Nothing is sent to any external server or telemetry service. You remain in complete control over what evaluation text you paste into your preferred AI assistant.
