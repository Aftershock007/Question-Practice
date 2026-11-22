# RBI Grade B Practice Console

Offline, single-page study app for RBI Grade B: Phase-1/Phase-2 objective (MCQ, TCS iON-style console),
Phase-2 subjective (descriptive typing + AI grading), a Calendar/TODO built from a 415-day study plan, and History.

## Hard constraints
- Plain HTML/CSS/vanilla JS only. No frameworks, npm deps, CDNs, build step or backend.
- Must work from `file://` (double-click `index.html`) and on GitHub Pages. So: **no `type="module"`, no `import`/`export`**.
- All scripts are classic `<script>` tags sharing ONE global scope. Load order (index.html:736-742) matters:
  `prompt.js` -> `schedule_data.js` -> `app.js` -> `ai_config.js` -> `ai_key.local.js` (git-ignored, may be missing) -> `ai_eval.js` -> `objective_ai.js` -> `calendar.js` -> `folders.js`.
  `calendar.js` / `objective_ai.js` use helpers from `app.js`; cross-file calls (`AIEval.*`, `mcqStatus`, `calOnTestScored`...) happen only at runtime.
- The repo is **public** (and on GitHub Pages). Never write a real API key into any tracked file (`ai_config.js` keeps `DEMO_` placeholders). The user's real key lives in `ai_key.local.js`, which is in `.gitignore`; it sets `AI_CONFIG.provider/keys` so AI runs without asking. E2E tests that need "AI off" must route `**/ai_key.local.js` to an empty script.
- No emojis anywhere in the UI. Use the CSS tokens in `style.css :root` (`--ink --muted --line --brand --accent --gold`, status colours), not hard-coded colours. Keep TCS iON palette meanings (green answered, red not answered, purple review).
- DOCX/PDF import must reproduce the source word for word (only intended change: `sanitizeDashes`, en/em dash to "-"). Never strip repeated lines from answer bodies.
- MCQ answer keys are matched by (set, question number), never by position. The setup screen never shows answer keys. Only questions with `mcqStatus(q) === "ok"` (local + AI check passed, or approved by the user) go into an exam; "failed" (AI unreachable) and, with AI off, "unchecked" ones only after a confirm. Statuses: ok / unchecked / pending / failed / issue.
- Test-type TODOs (Objective Practice, Subjective Practice, Mix Test, Chapter Test) are never ticked by hand: submitting a test links it to a TODO (`autoCompleteTodoOnExam`); subjective TODOs complete when every answer has a score (`calOnTestScored`). Only Study / Other have checkboxes.

## Saving tokens: how to navigate
- Use the **LSP tool** (typescript-lsp plugin, `jsconfig.json` + `globals.d.ts`) for go-to-definition / find-references instead of reading big files.
- Read with `offset`/`limit` using the line map below. Do not read whole `app.js`, `ai_eval.js`, `style.css`.
- **Never read** `schedule_data.js` in full (3.7k lines of plan rows: `{day, dayType, p2_subject, p2_topic, p1_subject, p1_topic, ca}`); grep it. `vendor/pdfjs/*.min.js` is blocked.
- `TASK_PLAN.md` is the original build spec and is **outdated** (its Question Bank phase was removed). Code is the source of truth.
- `.docx`/`.xlsx` are binary sample inputs; don't Read them.

## File map (line numbers approximate)
**app.js** (~5.5k lines): core app, global `state` object (l.177), `$` = getElementById
- 1-175 helpers: `sanitizeDashes countWords makeId loadJSON saveJSON formatTime escapeHTML getLocalDateString showScreen downloadText copyText defaultWordLimit`
- `richTextHTML questionWithPassage questionPromptText passageBlockHTML renderPassageSlot` (passages / `cell | cell` tables, ~66-140) · `QUESTIONS_PER_PAGE = 20` + `renderPaginationControls` · 262 `setPhase("phase1"|"phase2")`
- 300-573 Phase-2 (subjective) setup list/form · 574-1072 Phase-2 exam (`startTest tick showQuestion finishTest checkResumeActiveTest resumeExam`)
- 1073-1182 result + .txt prompt export (`buildQuestionText buildCombinedText renderResult`) · 1183-1519 Phase-2 history/streak
- 1520-1934 ZIP inflate + DOCX XML to text (`readZipTextEntries docxXmlToText extractDocxText`)
- 1935-2149 PDF via pdf.js (`loadPdfJs pdfItemsToLines pdfRemovePageFurniture pdfLinesToParagraphs extractPdfText`)
- 2150-2560 descriptive parser `parseQuestionsAndAnswers` + `handleDocImport`
- 2570-3210 MCQ parser: `normalizeMCQAnswer formatMCQAnswer isMultiAnswerMCQ` (2578), option styles `mcqFindLabels mcqOptionFamilies mcqSplitOptions` (2602), `parseMCQAnswerKey` (2683), `parseMCQDocument` (2895; returns questions with `number section topic level`, plus `.meta`)
- 3212 `handleP1DocImport` · 3292 `addImportedMCQs` · 3334 `renderP1SetupList` · 3423 `renderP1CheckPanel` (check summary + "Needs attention") · 3536 `handleP1CheckClick startP1EditQuestion`
- 3722 `startP1Exam` · 3827 `askTestType` (test-type dialog) · 3924 `showP1Question selectP1Option` (multi-answer) · 4147 `finishP1Test` · 4230 `renderP1Result renderP1ResultReviewList downloadP1Result` · P1 history after
- XLSX/CSV parsing (`extractZipEntries parseXLSX parseCSV parseScheduleDate`) · 4738-end `DOMContentLoaded`: all event wiring

**ai_eval.js** (~2.45k): one IIFE exposing `window.AIEval = {init, autoEvaluate, renderResultScreen, historyBlockHTML, deleteTestReports, clearAllReports, getReport, openSettings, runJSON, isReady, explain, evaluateTest, _internal}`
- Report contract includes `topic`, `concept_gaps`, `writing_audit` (grammar / spelling / factual errors, style verdict...): `normalizeWriting` (~1035), `runJSON` generic JSON task (~1159), `topicStats topicTableHTML` (~1586), `writingHTML` (~1866). `writeScore` calls `calOnTestScored`.
- 28 `PROVIDERS` · 96-145 constants (keys, timeouts, `MAX_PARALLEL=4`, grades) · 252-345 settings resolution (localStorage overrides `ai_config.js`)
- 347-460 `SYSTEM_INSTRUCTION JSON_CONTRACT REPORT_SCHEMA buildPrompt` · 460-860 HTTP, retries, errors, per-provider `generate`, `listModels`
- 865-1072 `extractJSON normalizeReport gradeAnswer` · 1073-1185 report storage (size-capped) + `writeScore`
- 1186-1340 job queue · 1341-1840 result-screen HTML · 1841 click delegation (`data-ai-action`) · 1933-2168 AI Settings dialog

**calendar.js** (~1.65k): Calendar & TODO. `CAL_KEYS`, `TODO_TYPES` (l.39, `test`/`mode` per type), `cal` state, date helpers `calParse calAddDays calToday`
- 357 `calPlanTodos` · 623 `autoCompleteTodoOnExam calFindTodoById calFindOpenTestTodo calAttachExam` · 701 `calOnTestScored calReconcileLinks calLinkedResult calWriteScore` · 749 `calSuggestTestType`
- 1046 `calTodoItemHTML` (no checkbox for test types) · 1110 `calRenderDayPanel` ("Tests you took" -> `calReviewExam` opens the full result)
- 616-1040 rendering (`calShellHTML calRenderGrid calRenderDayPanel renderCalendar`) · 1063 `calWire` · 1285 `calImportFile` · 1385 TODO modal · 1454 `initCalendar`

**Passages:** MCQ and descriptive questions may carry `q.passage` (shared RC passage, DI table, caselet; set by the parsers via `isPassageIntro` / "Directions (1-5)" / "for Q137 and Q138"). `q.text` is the question only. Exams show it in `#p1-exam-passage` / `#exam-passage`; prompts use `questionPromptText`. PDF data rows with 3+ wide-gap cells become `cell | cell` (`pdfItemsToLines` `isDataRow`; answer-key rows and option rows are excluded).
**folders.js**: `askFileFolder` (dialog on every DOCX/PDF import) -> `q.folder = {subject, kind: chapter|mix, chapter, coverage: full|partial}`; tests store `folder` (`testFolderFromQuestions`); `renderHistoryFolders` draws History as Subject > Chapter tests > chapter > Full/Partial and Subject > Mix tests; `moveHistoryTestToFolder`.
**objective_ai.js** (~520): MCQ import checks (`mcqPrepareImported mcqLocalIssues mcqStatus mcqIssueReasons`, AI check `mcqVerifyQuestions`, batches of 20, 3 parallel) and objective topic analysis (`p1TopicStats p1RunAnalysis p1RenderAnalysis p1WhyNote`).
**prompt.js**: `EVAL_PROMPT_TEMPLATE` and `COMBINED_HEADER_TEMPLATE`, filled via `fillTemplate`. RULES 1-7 (5: scale parameters/penalties to {{MARKS}}, 6: Indian/British spelling is correct, 7: quote verbatim); Section 3 = 3A red-pen log + 3B writing audit. Keep `JSON_CONTRACT` in ai_eval.js in step with it.
**index.html**: all screens as `<section id="screen-*">`: `setup-p1 exam-p1 result-p1 history-p1 setup exam result history calendar`. `showScreen("setup")` picks the `-p1` variant when `state.phase === "phase1"`.
**style.css** (~5.6k): tokens in `:root` at top; sections marked `/* ... */` (grep `^/\* ` for the index). AI result styles from ~3956.

## localStorage keys
`rbi_current_phase rbi_current_setup rbi_active_test rbi_history` (Phase-2) · `rbi_p1_setup rbi_p1_active_test rbi_p1_history` (Phase-1)
`rbi_ai_settings rbi_ai_reports rbi_p1_ai_analysis` (AI) · `rbi_plan_config rbi_plan_custom rbi_todos rbi_plan_todo_state` (has `links`) `rbi_todo_launch rbi_todo_migrated_v1 rbi_todo_keys_v2 rbi_todo_types_v3` (calendar) · legacy: `rbi_study_schedule rbi_calendar_start_date`

## Verify changes
- Syntax / cross-file check: `tsc -p jsconfig.json` (must print nothing). Full type checking is intentionally off (about 1.4k cosmetic warnings).
- In the browser: `python3 -m http.server 8000` (run in background), then use the **Playwright MCP** (`.mcp.json`, headless Chromium) to open `http://localhost:8000/index.html`, click through the affected screens and check console errors. Prefer `browser_snapshot` (text) over screenshots unless the change is visual.
- Import changes: `test-docs/` has 13 layouts (incl. `obj-08-passage-sets`, `subj-05-case-and-passage`; the user's own sample files also live there) as DOCX + PDF with expected results in `test-docs/expected/*.json` (rebuild: `python3 test-docs/make_test_docs.py` then `soffice --headless --convert-to pdf`). Parse each with the app's own `extractDocxText`/`extractPdfText` + `parseMCQDocument`/`parseQuestionsAndAnswers` in Chromium and compare; also CH-1 (192 MCQs incl. multi-answer, two key formats), CH-2 and Spotlight must stay identical. Check PDF versions too (PDFs flatten tables and split table cells).
- AI calls are slow (grading 1-4 min/answer; MCQ check ~1 min per 20 questions) and the free tier has a daily cap: keep live calls few. To test AI code paths without a key, intercept `https://openrouter.ai/api/v1/chat/completions` in Playwright and return canned JSON (set `rbi_ai_settings` = `{provider:"openrouter", keys:{openrouter:"sk-or-mock"}}`).

## Code style
- One-line comment above each function explaining it. `"use strict"` files. Build HTML with template strings + `escapeHTML`.
- Persist through `loadJSON`/`saveJSON`. Keep README.md in sync when features change.
