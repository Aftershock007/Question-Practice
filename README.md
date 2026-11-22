# Descriptive Typing Test Practice

A personal, offline typing test and descriptive answer practice website designed for daily timed writing sessions. It simulates real exam typing conditions (no spell-check or autocorrect, optional copy-paste blocking, live word limits and counters) and automatically exports structured evaluation prompts for AI grading with models like Gemini, Claude, and ChatGPT.

---

## Features

- **Objective (MCQ) / Subjective (Phase-2) switch:** The header switch toggles between the MCQ console (Phase-1 and Phase-2 objective papers) and descriptive answer writing.
- **Phase-1 Objective Practice (Real TCS iON Simulation):**
  - Real exam interface with countdown timer, candidate profile bar, and question options `[A]` through `[E]`.
  - Authentic 5-color TCS iON Question Palette: Answered (Green), Not Answered (Red), Not Visited (Grey), Marked for Review (Purple), and Answered & Marked for Review.
  - **Questions with more than one correct option** (MULTI-CORRECT) are answered by ticking every correct option and score only when the set is exactly right.
  - Immediate net scoring (+1.00 correct, -0.25 negative marking), scorecard, and question-by-question review with filters (20 questions per page, in the result and in History).
  - **Passage, table and caselet sets** (reading comprehension, data interpretation, case studies, puzzles): the shared passage or data table is shown above every question that uses it ("Questions 6 to 9 are based on the table below"), with tables drawn as real tables. It is recognised from lines such as "Directions (1-5): Read the following passage...", "Study the following table carefully and answer the questions that follow", "Case Study: ..." or "Use the table below for Q137 and Q138". The AI check, the analysis and the grading always get the passage too.
  - The question and its passage grow to their full height: there is never a scrollbar inside the question. The page scrolls, and the question palette on the right stays in place.
  - **Topic-wise analysis** after every test: correct / wrong / left, accuracy and net marks per topic, weakest first. With an AI key, the AI also explains every weak topic (what your mistakes show, the concepts, exam facts to remember, traps) and why each wrong answer was wrong.
- **Answer-key check before the exam (objective):**
  - The answer key is never shown on the setup screen. Instead you see how many questions have a key and which ones do not.
  - Every imported question is checked: text and options read completely, answer key found, no duplicate numbers. With an AI key, the AI also solves each question and confirms the key (about 1 minute per 20 questions, 4 minutes for 192).
  - Questions that fail go to a separate **Needs attention** section with the reason, and are kept out of the exam: edit them, use the AI's answer, keep them after checking yourself, or remove them. Question numbers missing from the file and answer keys without a question are listed there too.
  - The check starts by itself after every upload; the **AI Check** button runs it (again) for every question at any time.
  - The exam can start only when the check has finished, and it contains only the questions that passed. If the AI cannot be reached (for example the free daily limit is used up), the affected questions are marked **AI check failed**: press **AI Check** again later, or start with them after a clear warning.
  - A question with fewer options than the rest of the file (a real 4-option question among 5-option ones) waits for the AI to confirm it, instead of being rejected outright.
- **Subject and chapter folders:** every DOCX/PDF upload asks which subject it is (Economics (ESI), Finance, Management, English, General Awareness, Quantitative Aptitude, Reasoning or your own), whether it is a **chapter test** (which chapter, **full** or **partial** chapter) or a **mix test**, and optionally a topic. The subject and chapter are guessed from the file name ("CH-1-National_Income-Questions.docx" = Chapter 1: National Income). **History** is then sorted into folders: *Subject > Chapter tests > Chapter 1: ... > Full chapter / Partial chapter* and *Subject > Mix tests*. Older tests sit in **Not sorted yet**; **Move to folder** on any test changes its folder.
- **Phase-2 Descriptive Typing Practice:**
  - Four dedicated papers: **ESI (Economic & Social Issues)**, **Finance**, **Management**, and **English Descriptive**.
  - Exam conditions simulation: spell-check/autocorrect disabled, live word counts (`Words typed: X / Y`), Tab indentation support, and optional paste prevention.
  - **Built-in AI evaluation:** the moment you submit, every answer is graded by AI with the RBI rubric in `prompt.js` (see [AI evaluation](#ai-evaluation) below), including a line-by-line **writing analysis** (grammar, spelling, factual errors, RBI writing style) and **topic-wise performance**.
  - The full evaluation prompt can still be copied or downloaded for grading in any chatbot (Gemini, Claude, ChatGPT).
- **Calendar & TODO (your daily routine):**
  - One calendar for the whole plan. The built-in plan is `RBI_Study_Schedule.xlsx` (415 days); **Upload Timetable** / **Remove Timetable** in the study plan settings replace or clear it.
  - TODO types: **Objective Practice, Subjective Practice, Mix Test, Chapter Test, Study, Other**.
  - **Test TODOs complete themselves.** When a test starts you choose its type (Objective Practice, Subjective Practice, Chapter Test or Mix Test). Submitting it ticks the matching TODO of the day and shows your marks on it; a subjective test ticks its TODO once every answer is graded. A test without a matching TODO is recorded as a TODO of its own. Test TODOs cannot be ticked by hand; **Study** and **Other** you tick yourself.
  - Every plan day gets 3 exam TODOs: **Phase-2 subjective exam**, **Phase-2 objective exam** and **Phase-1 objective exam** (Chapter Test / Mix Test on test days), plus a current-affairs TODO on days the plan has one.
  - **Test days are always visible:** chapter tests, mix tests and current-affairs objective tests are tagged on the calendar (P2 / P1 / CA), and the next ones are listed under **Upcoming tests**.
  - Click a day to see **the tests you took and your marks**; click a test to open its full result page (objective scorecard, or the subjective result with the AI assessment).
  - Streak, today's 3 exams, month progress and plan progress at the top. A day is complete when all of its TODOs are done.
- **DOCX & PDF File Import:** Upload Word (.docx) or PDF (.pdf) files and the questions, options, answer keys, explanations and model answers are extracted exactly as written:
  - DOCX: Word's automatic numbering and bullets are rebuilt (1., a), •), tables become `cell | cell` rows, tabs and line breaks are kept, page headers/footers and tracked deletions are never imported.
  - PDF: read with Mozilla pdf.js (bundled in `vendor/pdfjs`, works offline and from `file://`). Wrapped lines are joined back into paragraphs and running headers, footers and page numbers are removed by their position on the page. Tables in PDFs keep all their words, but not always their column layout.
  - Answers are matched to questions **by question number** (and set, when numbering restarts), never by position. Answer keys can be a grid ("1 e | 2 c"), a "Q | Answer | Why" table, a "1 to 10 | a | b" table, a "1. c 2. a" line, or "Answer: (c)" under each question; multi-answer keys ("a, e") are supported.
  - Topic headings ("6. Uses, Determinants and Limits of Measurement") become each question's topic. Shared passages and data tables ("Directions (Q.1 to Q.3) ...", "Use the table below for Q137 and Q138") are attached to every question they belong to.
  - An MCQ file dropped on the Subjective screen (or the other way round) is detected and sent to the right place.
- **Included Example Practice Documents:**
  - `Spotlight-Questions-1-6-Nov-2026.docx`: 200 General Awareness Phase-1 MCQs with options and full answer key table.
  - `CH-1-National_Income-Answer-Writing.docx`: ESI Chapter 1 National Income descriptive practice questions with model answers.
  - `test-docs/`: 13 import test files (8 objective, 5 subjective) as DOCX and PDF, each in a different layout, with their expected results in `test-docs/expected/`. `obj-04-quant-di` contains deliberate defects (a wrong key, a missing key, a skipped question number, a key without a question) to show the Needs attention section; `obj-06-edge-cases` and `obj-07-key-table-extra-column` cover options on the question line, "Answer: Option B", notes inside questions and explanations, explanation lines that start with "(a)", and answer tables with extra columns; `obj-08-passage-sets` and `subj-05-case-and-passage` cover RC passages, DI tables, caselets, puzzles and case studies shared by several questions. Rebuild them with `python3 test-docs/make_test_docs.py`.
- **History Tracking:** Comprehensive logs of test scores, accuracy %, time spent, and performance trends for both phases.

---

## How to Open

- **Direct local use:** Clone or download this repository, then double-click `index.html` to open it directly in any browser (works out of the box via `file://`).
- **GitHub Pages:** Host it online for access from any device by enabling GitHub Pages (*Settings → Pages → Branch: main → / (root)*).

No backend server, Node.js runtime, build steps, or external dependencies are required.

---

## AI evaluation

After a subjective test, each answer is sent with the evaluation prompt from `prompt.js` to an AI model. The result screen then shows, for every answer:

- **Score and grade** out of the question's marks, plus the **likely real RBI score**. The grader is deliberately about 2-3 marks stricter per answer than the real panel.
- **In plain words**: a short summary of what the mark means and the most important fix.
- **What worked / where you lost marks / what to fix next.**
- **Writing analysis** (only errors that really occur in your answer are shown, Indian/British spellings such as "programme" or "labour" are never marked wrong, and figures the AI cannot verify are listed separately instead of as errors): every grammar and punctuation error with the rule and the correction, every misspelt word, every wrong or outdated fact with the correct one, a verdict on whether the style is up to RBI standard (score out of 10, with the problems listed), structure, vocabulary (weak words and better ones), sentence construction, presentation, and a step-by-step plan for the next exam.
- **Topic and concept gaps** for each answer, a **topic-wise performance** table for the test, and one across all your subjective tests.
- Expandable details: marks per criterion with the reason for each, red-pen penalties, which parts of the question you covered or missed, line-by-line mistakes with corrections, missing reports/committees/data, **your own sentences rewritten**, and an **exam-format model answer**.
- A **test summary**: total score, biggest mark leaks across the test, a fatigue check and your next drills. Download it all as a `.md` report.

Scores are written into **History** (and the calendar) automatically. You can still edit them there.

### Set up (one time, about 2 minutes)

**Built-in key on your own computer:** put your key in `ai_key.local.js` (next to `index.html`). The file is listed in `.gitignore`, so it is never committed, and the app uses it everywhere without asking: the AI check after every upload, the objective analysis and the subjective grading. The public GitHub Pages copy does not have this file (a key there would be public and is revoked automatically), so in a browser that opens the GitHub Pages site, save the key once in **AI Settings** as below.

```js
// ai_key.local.js
(function () {
  const c = window.AI_CONFIG = window.AI_CONFIG || {};
  c.provider = "openrouter";
  c.keys = Object.assign({}, c.keys, { openrouter: "sk-or-v1-..." });
})();
```

Or, in any browser:

1. Get an API key. The app is set up for **OpenRouter** with the free model **NVIDIA Nemotron 3.5 Super VL** (`nvidia/nemotron-3.5-super-vl:free`): create a key at **[openrouter.ai/settings/keys](https://openrouter.ai/settings/keys)**. Any other provider below works too.
2. Open the app and click **AI Settings** in the top bar, then paste the key, press **Test connection** and **Save**.
3. That's it. Every subjective test is graded automatically when you submit it. Tests you took before can be graded from **History → Open results → Grade all answers**.

The key is stored **only in your browser** (localStorage). It is never written into this repository, so this works on GitHub Pages too. On a new browser or device, paste it once more.

**Alternative: `ai_config.js`.** It holds `DEMO_...` placeholder keys and the default models for every provider. You can replace a placeholder with a real key, but **this repository is public**: a key committed here is visible to everyone and will be revoked by the provider. Only do that in a private, local copy. Keys saved in AI Settings always take priority. While a key is still a `DEMO_` placeholder, nothing is sent anywhere and the app shows **Add API key** instead.

### Providers

| Provider | Default model | Notes |
|---|---|---|
| OpenRouter (default) | `nvidia/nemotron-3.5-super-vl:free` | Free model; OpenRouter caps free requests per day. A reasoning model: about 1-3 minutes per answer, answers are graded in parallel. If you see "blocked by your OpenRouter privacy settings", allow free endpoints at openrouter.ai/settings/privacy. |
| Google Gemini | `gemini-3.8-flash` | Free tier. If a model is retired, the app automatically retries with `gemini-flash-latest`. |
| OpenAI | `gpt-6.2-sol` | Paid API. |
| Anthropic Claude | `claude-opus-5-5` | Paid API. Sonnet / Haiku cost less. |
| Groq | `openai/gpt-oss-120b` | Fast, free tier. |
| DeepSeek | `deepseek-chat` | Low cost. |
| Mistral | `mistral-medium-latest` | Free experiment plan. |
| Custom | `llama3.1` | Any OpenAI-compatible server (Ollama, LM Studio, vLLM). For Ollama set `OLLAMA_ORIGINS=*`. |

Providers rename and retire models often. If grading says *Model not available*, open **AI Settings → Load models** and pick one from the list your key can actually use.

If a request fails, the answer card says why in plain words (invalid key, quota used up, rate limit, provider busy, no internet...) with **Retry** and **AI Settings** buttons. Rate limits and temporary outages are retried automatically.

---

## Recommended Daily Routine

1. **Select Questions:** Pick 2-3 questions with target word limits (e.g., 400 or 600 words) across your focus subjects (**ESI**, **Finance**, **Management**, or **English Descriptive**).
2. **Set Strict Timing:** Aim for a focused writing pace (e.g., ~25 words per minute) to build typing speed, focus, and answer structure discipline.
3. **Simulate Real Exam Conditions:** Type continuously without pausing, without browser autocorrect or spell-check, and with copy-paste blocked.
4. **Submit & read the AI assessment:** Your answers are graded automatically. Start with *In plain words* and *Fix these next*, then compare your sentences with the rewrites and the model answer.
5. **Track & Review:** Scores land in History automatically, so your streak and performance trends stay up to date.

---

## Data Storage & Privacy

- **Local Storage:** All active tests, timetable plans, attempt histories, AI settings, AI reports and objective topic analyses are stored strictly inside your browser's `localStorage`.
- **AI reports:** Detailed AI reports are kept within a fixed storage budget (roughly the last month of tests) so they can never crowd out your test history. When the budget is full, the oldest *detailed* reports are removed first; their scores stay in History. Use **Download report (.md)** for reports you want to keep forever.
- **Clearing Browser Data:** Clearing your browser cache and cookies will erase locally saved test histories, AI settings and reports.

---

## Privacy & Security

Your tests, answers and history stay on your device. There is no backend and no telemetry.

The one exception is AI evaluation, and only when you have added an API key. Then, for each answer being graded, the question, your answer and its reference answer are sent (and, for objective tests, the imported questions with their answer keys for the check, and your wrong answers for the topic analysis) **directly from your browser to the AI provider you chose** (for example Google Gemini) under that provider's API terms. Nothing passes through any other server. Without a key, nothing is sent anywhere. Your API key is stored only in your browser.
