# RBI Descriptive Practice

A personal, offline web app designed for daily timed practice of **RBI Grade B (Phase 2)** descriptive answer writing across ESI, F&M, and English papers. It simulates real exam conditions (no spell-check, optional copy-paste disabling, live word counting) and exports structured prompts for strict AI evaluation with models like Gemini, Claude, and ChatGPT.

---

## How to Open

- **Direct local use:** Clone or download this repository, then double-click [`index.html`](file:///workspaces/RBI-Subjective-Practice/index.html) to open it directly in any browser (works out of the box via `file://`).
- **GitHub Pages:** Host it online for access from any device by enabling GitHub Pages (*Settings → Pages → Branch: main → / (root)*).

No backend server, Node.js runtime, build steps, or external dependencies are required.

---

## Recommended Daily Routine

1. **Select Questions:** Pick 2–3 questions combining 10-mark and 15-mark questions across ESI and F&M (or English essays).
2. **Set Strict Timing:** Aim for the standard RBI writing pace of approximately 1 minute per 25 words (≈ 16 minutes for 400 words, ≈ 24 minutes for 600 words) to build writing endurance and exam speed.
3. **Simulate Real Exam Conditions:** Write continuously without pausing, without browser autocorrect or spell-check, and with copy-paste blocked.
4. **Submit & Evaluate with AI:** Click **Copy** (or Download .txt) for each completed question, paste the complete generated prompt into Gemini or Claude, and let the AI grade your response against strict RBI criteria.
5. **Track & Review:** Enter the AI's final score into the History screen to track your daily streak and score trends. Re-read the AI's "Improved Model Answer" and re-write key points in your own words.

---

## Data Storage & Backup

- **Local Storage:** All questions, active tests, and attempt histories are stored strictly inside your browser's `localStorage`.
- **Backup Regularly:** Use the **Export bank (.json)** button on the Question Bank screen to create regular backup files of your question library.
- **Clearing Browser Data:** Clearing your browser cache and cookies will erase locally saved test histories unless exported.

---

## Privacy & Security

Your answers, model references, and test metrics remain 100% on your device. Nothing is sent to any external server or telemetry service. You remain in complete control over what evaluation text you paste into your preferred AI assistant.
