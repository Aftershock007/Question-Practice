# RBI-Engine Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local command-line engine that analyses RBI Grade B Phase-2 descriptive answers with AI and gives a very detailed, repeatable report: marks, every language mistake, content gaps, structure and framing advice, a model answer and an improvement plan.

**Architecture:** Node.js CLI with no npm packages. Each answer goes through deterministic local analysis, then several focused AI passes (marking checklist, scoring x3, language audit, structure coach, synthesis). Code, not the AI, enforces the rubric, checks every quote and combines the scoring runs. Every AI reply is cached, so the same input always gives the same report.

**Tech Stack:** Node.js 18+ (global `fetch`, `node:test`, `zlib`, `readline`, `crypto`), CommonJS, plain HTML/CSS for the report file.

**Spec:** the Design part of this file (Part 1). The user asked for the engine on 2026-11-28 and chose "start implementing it end to end".

## Global Constraints

- Everything lives in `RBI-Engine/` at the repo root. No npm dependencies, no build step. `node rbi.js` must work on Windows, macOS and Linux with Node 18 or newer.
- No emojis anywhere in output (terminal, Markdown, HTML). Plain, short English sentences.
- No code comments in engine source files (repo convention). `"use strict"` in every file.
- API keys are never written inside the repo. They come from environment variables or `~/.rbi-engine/keys.json` (mode 0600). `RBI-Engine/.gitignore` ignores `data/`, `reports/` and `answers/`.
- The candidate's answer is used word for word. Nothing strips, merges or reorders its lines.
- Indian/British spellings (programme, labour, organisation, analyse, centre, defence, licence, behaviour, lakh, crore) are never flagged as errors.
- Rubric tables (parameter shares, penalty table, word bands, examiner checks, grade brackets) are the ones in `prompt.js` and `ai_eval.js` of the app. The engine's copy of the rubric text must equal `EVAL_PROMPT_TEMPLATE` in `../prompt.js` (sync test).
- Defaults match the app: engine 1 `gemini` / `gemini-4-hydrogen` / thinking `low`; engine 2 `gemini` / `gemini-4-neon` / thinking `high`.

## Review Focus

1. App exports downloaded on Windows (CRLF line endings), with a passage block, with `[NO ANSWER WRITTEN]`, or a FullTest file with 4 questions: every question parses with the exact answer text. Tests in Task 5.
2. The AI quotes words that are not in the answer, or "corrects" British spelling: those items are dropped, and the corrected answer changes only verified spans. Tests in Tasks 8 and 10.
3. Free-tier rate limit or daily quota hit halfway through: finished passes stay cached, the report says what is missing, and running the same command again continues. Tests in Task 13.
4. Answers with headings, numbered points, abbreviations and decimals ("K.V. Kamath", "6.5%", "e.g.", "Rs. 500"): sentence units are not cut in the wrong place. Tests in Task 2.
5. A file with no marks, word limit or paper: sensible defaults are used and a visible warning says so, with no crash. Tests in Task 5.

---

# Part 1 - Design

## What it is for

The user practises RBI Grade B Phase-2 descriptive answers (ESI, Finance & Management, English). The app in this repo already has a typing console and an in-browser AI Analysis. The engine is a separate, local tool that goes deeper and is steadier:

- It tells the candidate **what they did wrong** in content (missed sub-parts, missing checklist points, wrong facts, missing reports and data).
- It lists **every grammar, spelling and punctuation mistake** with the rule and the correction, and shows the whole answer with only the language fixed.
- It explains **how to frame the answer better**: how to read the question (command words, sub-parts), the ideal outline with a word budget per section, a better introduction and conclusion, rewrites of the weakest sentences, and a model answer within the word limit.
- It gives **strict RBI-calibrated marks** with the full breakdown, and the same answer gets the same marks every time.

## How an answer is analysed

```
answer file ──> parse ──> local analysis (no AI) ──┐
                                                   v
                     marking checklist (AI, cached per question, same for every attempt)
                                                   v
        ┌──────────────────┬───────────────────────┼──────────────────────┐
        v                  v                       v                      v
  scoring run 1      scoring runs 2-3        language audit        structure coach
  (full feedback)    (marks only)            (sentence by          (outline, intro,
        │                  │                  sentence)             rewrites, model answer)
        └────────┬─────────┘                       │                      │
                 v                                 │                      │
   combine runs in code (median per parameter,     │                      │
   majority vote on checks, rubric enforced)       │                      │
                 └──────────────────┬──────────────┴──────────────────────┘
                                    v
                    synthesis (AI): summary, top priorities, plan
                                    v
              report: terminal summary + HTML + Markdown + JSON, history
```

1. **Local analysis (deterministic):** word count (whitespace split, same as the app), sentence units, paragraphs, headings and points, intro/body/conclusion share, word band, time and words per minute, track and command words, and mechanical checks (repeated words, spacing around punctuation, contractions, informal words, first person, rhetorical questions, very long sentences, wall of text, bullets in an essay, more than one paragraph in a precis).
2. **Marking checklist (AI, engine 1):** sub-parts of the question, 5-12 weighted key points taken from the model answer, the dimensions an examiner expects and an ideal outline with word shares. Stored per question in `data/schemes/`, so every attempt at the same question is marked against the same list.
3. **Scoring (AI, engine 2):** the app's full RBI rubric (`prompt.js`) plus engine settings fixed by code: the track, the parameter maxima, the penalty values, the measured word count and band, the fixed sub-parts and checklist. Run 1 returns full feedback; runs 2-3 return marks only. More runs are added when they disagree.
4. **Language audit (AI, engine 2):** the answer is sent as numbered units (`[S1]`, `[S2]`...). The AI returns each error with the exact wrong words, the fix, the type, the rule and the severity, plus style, register, vocabulary and sentence-craft notes.
5. **Structure coach (AI, engine 2):** compares the answer with the fixed outline, critiques the introduction, each paragraph and the conclusion, writes a better introduction and conclusion from the candidate's own content, rewrites the 3-5 weakest sentences and writes a model answer within the word limit.
6. **Synthesis (AI, engine 1):** reads the final combined result and writes the summary, strengths, top priorities ranked by marks lost, three drills for tomorrow and a 5-8 step plan. If it fails, a deterministic summary is used.

## How consistency is guaranteed

1. **Same input, same report.** Every AI reply is cached under a hash of the exact request (pass, prompt version, provider, model, thinking level, full prompt, run number). Re-running the same file makes no AI calls and rebuilds the identical report. `--fresh` asks the AI again.
2. **Fixed marking checklist** per question (cached by question content, not by model).
3. **Rubric enforced in code:** track chosen by code, parameter maxima scaled by code, caps for every failed examiner check, P3 caps by source count, word band and RP-5 from the real word count, penalty values and maximum instances from the table, RP-7 only for precis/RC, 0 marks under 60 words (essay and ESI/FM) or when off-topic, the rubric's hard ceiling, all marks in 0.25 steps.
4. **Several independent scoring runs** (default 3): median per parameter, majority vote per examiner check, checklist point and sub-part (ties go to the stricter verdict), median count per penalty code. If runs differ by more than 12% of the maximum, up to 5 runs are used. The final table always adds up to the final mark.
5. **Quote verification:** every quoted error, rewrite and checklist quote must exist in the answer; otherwise it is dropped. British/Indian spellings are never reported. The corrected answer changes only verified spans.
6. **Versioned prompts:** reports record the engine version, prompt versions and models used.

## Inputs

1. **Engine answer file** (`.txt`, `.md` or `.docx`), labelled:

   ```
   Paper: ESI
   Topic: Inflation targeting
   Marks: 15
   Word limit: 600
   Time spent: 22 min

   Question:
   Critically examine ...

   Answer:
   (your answer, exactly as you wrote it)

   Model answer:
   (optional reference answer; the checklist is built from it)
   ```

   Several questions in one file are separated by a line of five or more `=`. `Passage:` may come before or after the question. Header keys are read only before `Question:`. Once `Answer:` starts, only `Model answer:` (or `Reference answer:`) ends it.
2. **App exports:** the `Practice_<date>_Q1_ESI_15m.txt` and `Practice_<date>_FullTest.txt` files from the app's result screen. Paper, topic, marks, word limit, time, date, passage, question, answer and model answer are read from the template's labelled blocks.
3. **Separate files:** `rbi analyse --question q.txt --answer a.txt [--model m.txt] --paper FM --marks 10`.

Missing values get defaults (marks by track and word limit, word limit by marks like the app: 15 -> 600, otherwise 400; essay 600; precis one-third of the passage; RC no limit), each with a warning in the report.

## Outputs

- **Terminal summary:** score, grade, projection, consistency, where the marks went, language counts, top 3 fixes and the report path.
- **Report folder** `reports/<YYYY-MM-DD>_<name>_<hash6>/` with `report.html` (self-contained, no internet needed), `report.md` and `report.json`.
- Report sections: verdict; summary and priorities; reading the question (command words, sub-parts, ideal outline with word budgets); marks breakdown (parameters, penalties, arithmetic, rules applied by the engine, examiner checks, consistency); content (sub-parts, checklist coverage with quotes, factual errors, concept gaps, sources used, bare name-drops, missing sources, figures to verify); language (statistics, every error, mechanical checks, style, register, vocabulary, sentence craft, corrected answer); structure and framing (word allocation, outline match, introduction, paragraphs, conclusion, headings, flow, rewrites, value additions); model answer with its real word count; improvement plan and drills; technical details (models, calls, cached passes, tokens, time).
- **Multi-question files:** a test summary (total, per-question table, readiness against the strict targets, recurring penalties and language patterns, fatigue check).
- **History** in `data/history.json` and `rbi progress` (averages by paper, trend, weakest parameters, most frequent penalties and language error types, word discipline).

## Commands

| Command | What it does |
|---|---|
| `rbi` | Menu: analyse, new answer file, history, progress, setup, doctor |
| `rbi setup` | Choose providers and models, save the API key outside the repo, optional connection test |
| `rbi doctor [--offline]` | Check Node, folders, keys and (unless offline) one tiny request per engine |
| `rbi new [--paper --marks --words --topic --name --open]` | Create an answer file in `answers/` |
| `rbi analyse <files...>` | Analyse; options `--quick --runs N --fresh --rebuild-checklist --open --full --json --out DIR --only 1,3 --paper --marks --words --track --topic --time --question --answer --model --debug` |
| `rbi history [--limit N --paper P]` | Past analyses |
| `rbi progress [--paper P]` | Trends and recurring problems |
| `rbi show [N] [--open --full]` | Show the N-th latest report again |
| `rbi config [set <key> <value>]` | Show or change settings (keys masked) |
| `rbi help [command]`, `--version` | Help |

`node rbi.js <command>` works without installing; `npm link` inside `RBI-Engine/` adds a global `rbi` command.

## Where files live

| What | Where |
|---|---|
| API keys | environment variables (`GEMINI_API_KEY` or `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`, `CUSTOM_API_KEY`), else `~/.rbi-engine/keys.json` |
| Settings | `RBI-Engine/data/settings.json` (override with `RBI_ENGINE_DATA`) |
| Cache, checklists, history | `RBI-Engine/data/cache/`, `data/schemes/`, `data/history.json` |
| Reports | `RBI-Engine/reports/` (or `--out`, or setting `reportsDir`) |
| Answer files | `RBI-Engine/answers/` |

## Approaches considered

- **Node.js, no packages (chosen):** the app's grading logic is JavaScript and moves over almost unchanged; no install step; matches the repo's no-dependency rule.
- **Python:** good AI tooling, but every rubric rule and parser would be rewritten and kept in step in two languages, and the user would need pip packages.
- **Browser page instead of CLI:** the app already is one; the user asked for a local CLI.

## Non-goals

- PDF input (save the answer as `.txt` or `.docx` instead).
- Changing the browser app.
- Offline grammar checking without AI (the mechanical checks are a supplement, not a replacement).

---

# Part 2 - Build plan

Run all tests with `cd RBI-Engine && node --test`. Each task: write the tests first, run them and see them fail, implement, run them and see them pass.

## File structure

```
RBI-Engine/
  rbi.js                 CLI entry (#!/usr/bin/env node) -> src/cli.js main()
  package.json           name rbi-engine, bin {rbi, rbi-engine}, scripts.test "node --test", engines node >=18
  README.md  ROADMAP.md  .gitignore
  examples/answer-template.txt  examples/sample-esi-15m.txt
  src/
    util.js              str num clamp snap4 round2 median sha256 slug plainText quoteInScript isBritishVariant onlyBritishChanges findSpan
    paths.js             enginePaths(env)
    config.js            settings and keys
    text.js              words, units, paragraphs, structure statistics, pacing
    checks.js            mechanical checks
    rubric.js            tracks, command words, tables, enforcement, final arithmetic, grades
    rubric-text.js       EVAL_PROMPT_TEMPLATE (exact copy of ../prompt.js)
    input.js             engine format, app exports, separate files, defaults
    xml.js  docx.js      DOCX reading
    ai.js                providers, HTTP, errors, retries, JSON extraction, usage
    passes/scheme.js  passes/score.js  passes/language.js  passes/coach.js  passes/synthesis.js
    aggregate.js         combining scoring runs
    cache.js             reply cache and checklist store
    pipeline.js          orchestration, concurrency, extra runs, partial failures
    report/build.js  report/markdown.js  report/html.js  report/terminal.js
    history.js           history and progress statistics
    ui.js                colours, wrapping, tables, live status, prompts
    cli.js               commands and menu
  tests/                 *.test.js, helpers.js, fixtures/
```

## Task 1: Scaffold, paths, settings and keys

**Files:** Create `package.json`, `rbi.js`, `.gitignore`, `src/paths.js`, `src/config.js`, `src/util.js`, `tests/config.test.js`, `tests/util.test.js`

**Interfaces:**
- Produces: `enginePaths(env) -> {root, data, cache, schemes, reports, answers, history, settings, keysFile}`; `DEFAULT_SETTINGS`; `loadSettings(paths) -> settings`; `saveSettings(paths, settings)`; `setSetting(settings, dottedKey, value) -> settings`; `loadKeys(paths, env) -> {provider: key}`; `saveKey(paths, provider, key)`; `maskKey(key) -> string`; `engineForPass(settings, pass) -> "check"|"grade"`.
- `util.js`: `str(v, max)`, `num(v)`, `clamp`, `snap4(n)` (nearest 0.25), `round2`, `median(list)`, `sha256(text)`, `slug(text, max)`, `plainText`, `quoteInScript(quote, script)` (as in ai_eval.js: exact or 80% of words), `isBritishVariant(a, b)`, `onlyBritishChanges(wrong, fix)`, `findSpan(haystack, needle) -> {start, end}|null` (exact, then 1:1 quote/dash-normalised, then case-insensitive, then whitespace-flexible).

- [ ] Tests: `RBI_ENGINE_DATA` moves `data`, `cache`, `schemes`, `history`, `settings`; `RBI_ENGINE_KEYS` moves the keys file; defaults are engine `check` = gemini/gemini-4-hydrogen/low and `grade` = gemini/gemini-4-neon/high, passes `{scheme: check, language: grade, score: grade, coach: grade, synthesis: check}`, `runs 3`, `maxRuns 5`, `concurrency 3`, `timeoutSeconds 420`; `GEMINI_API_KEY` beats the keys file; `GOOGLE_API_KEY` is used for gemini when `GEMINI_API_KEY` is absent; keys starting `DEMO_` count as missing; `saveKey` writes mode 0600 (POSIX only); `maskKey("AIzaSyABCDEFG123456")` is `"AIza...3456"`; `setSetting(s, "grade.model", "x")` sets `s.engines.grade.model`; `setSetting(s, "runs", "4")` stores the number 4; unknown keys throw.
- [ ] Tests for util: `snap4(1.13) === 1.25`, `median([3,1,2]) === 2`, `median([1,2]) === 1.5`; `findSpan("It’s a inflation", "It's a") ` finds 0-6; `findSpan("growth  rate", "growth rate")` finds 0-12; `isBritishVariant("organisation", "organization") === true`; `onlyBritishChanges("the labour market", "the labor market") === true`.
- [ ] Implement; tests pass.

## Task 2: Text analysis

**Files:** Create `src/text.js`, `tests/text.test.js`

**Interfaces:**
- Produces: `normalizeText(s)` (CRLF to LF, BOM, NBSP to space, zero-width removed, nothing else); `countWords(s)` (trim + `/\s+/` split, like the app); `splitUnits(text) -> Unit[]` with `Unit = {id: "S1", text, start, end, line, para, kind: "heading"|"point"|"sentence"}` where `text === source.slice(start, end)`; `paragraphs(text) -> {id: "P1", text, start, end, words, lines}[]`; `structureStats(text, {track, wordLimit, seconds}) -> {words, sentences, paragraphs, lines, headings: string[], points, avgSentenceWords, longest: {id, words}, introShare, bodyShare, conclusionShare, hasConclusion, wordPercent, wpm, minutes}`; `latinShare(text)`.

- [ ] Tests: `"Repo rate rose to 6.5% in 2023. Inflation fell."` gives 2 units; `"The K.V. Kamath committee met. It reported."` gives 2; `"Rs. 500 crore was set aside. Banks lent it."` gives 2; `"e.g. MSMEs gained. Banks too."` gives 2; `"INTRODUCTION\nIndia adopted FIT in 2016."` gives a `heading` unit then a `sentence` unit; `"1. Lead-in: Credit growth slowed. NPAs rose.\n2. Liquidity eased."` gives `point` units with the markers kept; every unit satisfies `text === source.slice(start, end)`; Devanagari danda `।` ends a unit; blank lines start new paragraphs and lines inside a paragraph do not; `countWords("  a b\n c ")` is 3; intro, body and conclusion shares add up to 100 when there are 3+ paragraphs; `hasConclusion` is true when the last paragraph starts with "Conclusion", "Way forward", "In conclusion", "To conclude" or "Going forward".
- [ ] Implement: headings are lines of at most 10 words with no final `.?!` that are mostly upper case, end with `:`, or are at most 8 words in title case; points start with `- * • · ▪ ◦ ➢ →`, `1.`, `1)`, `(a)`, `a)`, `iv.`; a sentence ends at `.!?।` plus closing quotes/brackets, then whitespace, then a capital, digit or opening quote, except after an abbreviation (`e.g i.e etc vs viz cf mr mrs ms dr prof st no nos rs govt dept co ltd inc approx est fig art sec ch vol pp jan feb mar apr jun jul aug sep sept oct nov dec al ed shri smt` and dotted forms like `U.S`) or a single letter.
- [ ] Tests pass.

## Task 3: Rubric rules

**Files:** Create `src/rubric.js`, `tests/rubric.test.js`

**Interfaces:**
- Produces: `TRACK_LABELS`, `PARAMS`, `PENALTY_TABLE`, `PENALTY_LABELS`, `WORD_BANDS`, `EXAMINER_CHECKS`, `GRADES`; `normalizePaper(s) -> "ESI"|"FM"|"English"|"Other"`; `detectTrack({paper, question, passage, track}) -> "A"|"B"|"C"|"D"`; `parseTrack(s) -> track|""`; `detectCommandWords(question) -> {word, demand}[]`; `paramMaxima(track, marks) -> {id, name, max}[]`; `penaltyValue(code, marks, track) -> number`; `wordBand(track, words, limit) -> "full"|"half"|"zero"|null`; `enforceRubric({track, marks, wordLimit, words, params, checks, anchorCount, penalties, offTopic}) -> {params, penalties, rules, autoFail}`; `finalScore({track, marks, params, penalties, autoFail, offTopic}) -> {rawSum, penaltySum, beforeCeiling, ceiling, ceilingApplied, score, percent, grade, gradeLabel, projection}`; `ceilingFor(track, marks)`; `gradeFor(percent)`; `projectionFor(score, max)`; `defaultMarks(track, wordLimit)`; `defaultWordLimit(track, marks, passageWords)`; `idealMinutes(track, marks)`.
- Values: Track A maxima 10M `[2, 2.5, 2.5, 2, 1]`, 15M `[3, 4, 4, 2.5, 1.5]`, otherwise shares 20/25/25/20/10; B 40M `[8, 10, 8, 8, 6]`, otherwise 20/25/20/20/15; C 30M `[3, 10, 7, 5, 5]`, otherwise proportional; D 30M `[12, 7.5, 6, 4.5]`, otherwise 40/25/20/15. Maxima are 0.25 steps and add up exactly to the marks (rounding residue goes to the largest parameter). Penalty table, labels, word bands and examiner checks are copied from `ai_eval.js:83-143`. Penalty values: 10M column for 10, 15M for 15, 30M/40M column for 30 and 40, otherwise the 10M value times marks/10, snapped to 0.25 with a minimum of 0.25; RP-7 applies only to tracks C and D and is 1.0 x marks/30 for marks other than 30/40. Ceilings: A 6.25/10, 9.5/15, otherwise 63%; B 28.5/40, otherwise 71.25%; C and D 22.5/30, otherwise 75% (all rounded down to 0.25). Grades: A >= 52%, B >= 42%, C >= 32%, D >= 20%, else F. Projection: +2.0 to +3.0 for 10-24 marks, +3.5 to +5.5 for 25+, proportional below 10, never above the maximum.

- [ ] Tests: `detectTrack({paper: "ESI"})` is A even when the question says "essay"; `{paper: "English", question: "Write a precis..."}` is C; `"précis"` is C; English + "Read the passage and answer" is D; English otherwise is B; Other + "essay" is B; Other otherwise is A; `detectCommandWords("Critically examine ... Suggest measures.")` gives `critically examine` then `suggest measures` and no plain `examine`; `paramMaxima("A", 15)` is `[3, 4, 4, 2.5, 1.5]`; `paramMaxima("A", 12)` adds up to 12; `penaltyValue("RP-1", 15, "A") === 1.25`; `penaltyValue("RP-7", 10, "C") === 0.25`... (1.0 x 10/30 = 0.33 snapped to 0.25); `wordBand("A", 500, 600) === "full"` (83%); `wordBand("A", 450, 600) === "half"` (75%); `wordBand("A", 300, 600) === "zero"`; enforcement: a NO on Track A check 1 caps P1 at 45% (P1 max 3 -> 1.25); anchor count 0 caps P3 at 20%; band zero adds RP-5 and sets P5 to 0; band full removes a model RP-5; RP-7 removed on track A; RP-2 kept at most 3 times; 59 words on track A sets `autoFail`; `finalScore` with raw 10 on 15M track A gives `score 9.5`, `ceilingApplied true`; `gradeFor(45)` is B; `projectionFor(6, 15)` is `[8, 9]`.
- [ ] Implement; tests pass.

## Task 4: Mechanical checks

**Files:** Create `src/checks.js`, `tests/checks.test.js`

**Interfaces:**
- Consumes: `splitUnits`, `paragraphs` (Task 2).
- Produces: `mechanicalChecks({text, units, paras, track, question}) -> {id: "M1", unit: "S3"|null, kind, quote, message, fix}[]`. Kinds: `repeated word`, `spacing`, `capitalisation`, `contraction`, `informal`, `first person`, `rhetorical question`, `exclamation`, `long sentence`, `wall of text`, `essay format`, `precis format`, `brackets`, `repetitive openings`, `filler word`. English-only kinds are skipped when `latinShare(text) < 0.5`.

- [ ] Tests: "the the" is a repeated word; "growth ,which" has a space before a comma; "growth.The" lacks a space (but "6.5%" and "U.S." do not); a sentence starting in lower case is flagged, a point is not; " i think" is flagged; "don't" is a contraction; "a lot of" is informal with a suggestion; "In my opinion" is first person on track A but not on track B; a sentence ending in "?" is flagged; a 45-word sentence is long; track A with one 200-word paragraph and no headings is a wall of text; track B with bullet points gets `essay format`; track C with two paragraphs gets `precis format`; "programme" and "labour" are never flagged; "(unclosed" gives `brackets`; "very" used 3 times gives `filler word`.
- [ ] Implement; tests pass.

## Task 5: Input files

**Files:** Create `src/input.js`, `tests/input.test.js`, `tests/fixtures/answer-esi.txt`, `tests/fixtures/app-single.txt`, `tests/fixtures/app-full.txt`, `examples/answer-template.txt`, `examples/sample-esi-15m.txt`

**Interfaces:**
- Consumes: `normalizeText`, `countWords`, `detectTrack`, `parseTrack`, `normalizePaper`, `defaultMarks`, `defaultWordLimit`.
- Produces: `parseText(text, {fileName}) -> {format: "engine"|"app", questions: RawQuestion[], warnings: string[]}`; `readInputFile(file) -> Promise<same>` (`.docx` via Task 19); `fromParts({question, answer, model, passage}) -> RawQuestion`; `finalizeQuestion(raw, overrides) -> Question`. `RawQuestion = {index, paper, topic, marks, wordLimit, track, seconds, date, question, passage, answer, modelAnswer}`; `Question` adds `{paperKey, trackLabel, words, warnings: string[], qhash, ahash}` with every field filled. `parseDuration(s)` reads "22 min", "22 min 30 sec", "22:30", "1350 sec", "1 h 5 min".
- App export markers: `SUBMISSION METADATA`, `CANDIDATE'S SUBMITTED SCRIPT`, `OFFICIAL REFERENCE / BENCHMARK POINTS`, `STAGE 1: DYNAMIC 4-TRACK RUBRIC` between dashed rules; `[NO ANSWER WRITTEN]` means empty; `[No model answer provided ...]` means none; topic `Not specified` means none; the question block may start with `[Passage / data this question is based on]` and contain `[Question]`; FullTest chunks are split on lines of 64 `=`.
- Fixtures `app-single.txt` and `app-full.txt` are produced by running the real `buildQuestionText` / `buildCombinedText` from `../app.js` with `../prompt.js` in a `vm` sandbox (`tests/helpers.js: appExport(test)`), then saved, so tests also run when the app is absent.

- [ ] Tests: the engine fixture gives paper ESI, marks 15, limit 600, 1350 seconds, question, answer and model answer exactly; an answer containing the line "Question: why?" stays inside the answer; repeated identical lines in the answer are kept; CRLF input gives the same result as LF; two questions split by `=====`; a file with no `Answer:` throws an error naming the fix ("Add a line 'Answer:' above your answer"); no marks gives 10 with a warning, "Word limit: 600" and no marks gives 15; the app single export gives the exact answer, the passage separately, seconds from "22 min 30 sec"; `[NO ANSWER WRITTEN]` gives an empty answer; the FullTest fixture gives 2 questions in order; overrides `{marks: 10}` beat the file; `qhash` changes when the model answer changes but not when the answer changes.
- [ ] Implement; tests pass.

## Task 6: AI providers

**Files:** Create `src/ai.js`, `tests/ai.test.js` (local `node:http` mock server)

**Interfaces:**
- Produces: `class AIError(kind, message, extra)`; `PROVIDERS` (gemini, openai, anthropic, groq, openrouter, deepseek, mistral, custom; ported from `ai_eval.js:8-72` without browser notes); `providerConfig(engine, keys, settings, env) -> pc {id, def, apiKey, model, thinking, temperature, baseUrl, ready}`; `generate(pc, {system, prompt, json, schema, maxTokens}, {timeoutMs, signal}) -> {text, finish, modelUsed, usage}`; `withRetries(fn, {signal, onStatus, sleep})`; `extractJSON(text)`; `explainError(err, pc) -> {title, body}` (hints say `rbi setup` / `rbi doctor`); `addUsage`, `usageText`; `listModels(pc)`.
- Base URLs overridable for tests: env `RBI_GEMINI_BASE`, `RBI_ANTHROPIC_BASE`, and `settings.baseUrls[provider]` for OpenAI-style providers.
- Gemini body: `contents`, `systemInstruction`, `generationConfig.responseMimeType = "application/json"`, `responseJsonSchema`, `thinkingConfig.thinkingLevel`, `temperature` only when set; header `x-goog-api-key`. Fallbacks as in the app: schema -> mime -> plain on schema errors, drop thinking when rejected, `gemini-flash-latest` when the model is not found.
- Retries: rate 4, overloaded 4, network 3 attempts; waits 3 s, 8 s, 20 s or the server's `retryDelay` plus 0.5 s; give up when the wait would exceed 65 s.

- [ ] Tests against the mock server: Gemini request has the header, schema and thinking level; a 429 with `retryDelay: "0.01s"` is retried and then succeeds; a 429 whose violation says per day is `quota` and is not retried; 401 is `auth`; 404 on Gemini falls back to `gemini-flash-latest`; a 400 mentioning `responseJsonSchema` retries without the schema; 500 twice then 200 succeeds; a slow server gives `timeout`; OpenAI-style request sends `response_format: {type: "json_object"}` and the bearer key; Anthropic request sends `x-api-key` and `anthropic-version: 2023-06-01`; `extractJSON` reads fenced JSON and strips `<think>` blocks; usage is read for all three kinds.
- [ ] Implement; tests pass.

## Task 7: Rubric text and marking checklist pass

**Files:** Create `src/rubric-text.js`, `src/passes/scheme.js`, `tests/scheme.test.js`, `tests/sync.test.js`

**Interfaces:**
- Produces: `EVAL_PROMPT_TEMPLATE`, `fillTemplate(t, values)`; scheme pass `{name: "scheme", VERSION: "s1", build(q, local) -> {system, prompt, schema}, normalize(obj, q) -> Scheme}`. `Scheme = {subparts: {id: "S1", part, expects}[], points: {id: "K1", point, weight 1-3, subpart}[], outline: {id: "O1", section, covers, share, words}[], dimensions: string[]}`; `defaultOutline(track)`.
- The prompt sends the full question, passage and model answer; text beyond 14,000 characters is clipped with a note saying so.

- [ ] Tests: `sync.test.js` evaluates `../prompt.js` in `vm` (skipped when absent) and asserts its `EVAL_PROMPT_TEMPLATE` equals the engine copy; normalize keeps 5-12 points, clamps weights to 1-3, renumbers ids, makes outline shares add up to 100 and computes `words` from the word limit; an empty subpart list becomes one "Main question" subpart; fewer than 2 points throws `AIError("format")`.
- [ ] Implement; tests pass.

## Task 8: Scoring pass

**Files:** Create `src/passes/score.js`, `tests/score.test.js`

**Interfaces:**
- Consumes: Tasks 3, 6, 7.
- Produces: `{name: "score", VERSION: "g1", build(q, local, scheme, {full}) -> {system, prompt, schema}, normalize(obj, q, local, scheme, {full}) -> Run}`. `Run = {full, params: {id, awarded, cap, why}[], checks: {id, pass, evidence}[], anchorCount, offTopic, penalties: {code, trigger}[], checklist: {id, coverage, quote}[], subparts: {id, coverage, comment}[], final}` plus, for full runs, `{anchorsUsed, nameDrops, missingAnchors, verifyFlags, factualErrors, conceptGaps, errorLog, caps, meritCheck, pacingAudit}`. `final` is the run's own `finalScore` after `enforceRubric`.
- The prompt is the filled template + an "ENGINE SETTINGS" block (track, maxima, penalty values, measured words and band, command words, fixed sub-parts, fixed checklist and its rules) + the full or score-only contract. The contract tells the model to skip the writing audit, rewrites, model answer and plan (other passes do them).

- [ ] Tests: the prompt contains `Track: A`, `P1 = 3`, `RP-1 = 1.25`, every `K` and `S` id, and the measured word count; normalize maps parameters by id, then by `P1` prefix, then by order; a missing parameter throws `format`; awarded marks are clamped and snapped; a `full` checklist verdict without a quote found in the answer becomes `partial`; factual errors and error-log items whose quote is not in the answer are dropped; `final` follows the enforcement rules (Task 3).
- [ ] Implement; tests pass.

## Task 9: Combining scoring runs

**Files:** Create `src/aggregate.js`, `tests/aggregate.test.js`

**Interfaces:**
- Consumes: `Run` (Task 8), `enforceRubric`, `finalScore`, `penaltyValue`.
- Produces: `combineRuns(runs, q, scheme) -> Marks` with `Marks = {params: {id, name, max, awarded, cap, why}[], penalties: {code, label, trigger, deduction}[], checks: {id, label, pass, evidence, split}[], anchorCount, checklist: {id, point, weight, coverage, quote}[], subparts: {id, part, coverage, comment}[], coverage, rawSum, penaltySum, ceiling, ceilingApplied, autoFail, offTopic, score, percent, grade, gradeLabel, projection, rules, consistency: {runs, spread, method, base}}`; `needsMoreRuns(runs, max) -> boolean` (spread > 12% of max); `crossCheckReason(run, scheme, q)` (ported from `ai_eval.js:1583`); `lexicalCoverage(points, text)`.

- [ ] Tests: medians per parameter `[2, 2.5, 3] -> 2.5`; a check with votes YES, NO, NO is NO; a 1-1 tie is NO; checklist votes full, partial, partial give partial; RP-2 counts 1, 2, 2 give two RP-2 entries; caps are applied again after the median; `rawSum - penaltySum` equals `score` unless the ceiling or a zero rule applied; spread and `method` ("median of 3 independent gradings"); `base` is the full run closest to the median.
- [ ] Implement; tests pass.

## Task 10: Language audit pass

**Files:** Create `src/passes/language.js`, `tests/language.test.js`

**Interfaces:**
- Consumes: `splitUnits` (Task 2), `findSpan`, `onlyBritishChanges` (Task 1).
- Produces: `{name: "language", VERSION: "l1", build(q, units) -> {system, prompt, schema}, normalize(obj, q, units) -> Language}`. `Language = {issues: {unit, wrong, fix, type, rule, severity, start, end}[], byType, bySeverity, per100, style: {verdict, score, assessment, issues}, register: {quote, problem, better}[], vocabulary: {used, better, why}[], craft: {unit, problem, suggestion}[], summary, corrected: {text, units: {id, segments: {t: "same"|"del"|"ins", s}[]}[]}, dropped}`. Types: grammar, tense, agreement, article, preposition, punctuation, spelling, capitalisation, word choice, word order, sentence structure, redundancy, register.

- [ ] Tests: an issue whose `wrong` is in its unit is kept with offsets; one in another unit is moved to that unit; one found nowhere is dropped and counted in `dropped`; "organisation" -> "organization" is dropped; `wrong === fix` is dropped but a capitalisation-only fix is kept; overlapping fixes keep the first; `corrected.text` equals the original with exactly the kept fixes applied and nothing else changed; `per100` uses the word count; unknown types become `grammar`; style verdict is one of three values and the score is clamped to 0-10.
- [ ] Implement; tests pass.

## Task 11: Structure coach pass

**Files:** Create `src/passes/coach.js`, `tests/coach.test.js`

**Interfaces:**
- Consumes: `paragraphs`, `structureStats` (Task 2), `Scheme` (Task 7).
- Produces: `{name: "coach", VERSION: "c1", build(q, local, scheme) -> {system, prompt, schema}, normalize(obj, q, local, scheme) -> Coach}`. `Coach = {framing, outlineMatch: {id, section, status: "covered"|"weak"|"missing", comment}[], introduction: {assessment, rewrite}, conclusion: {assessment, rewrite}, paragraphs: {id, assessment, fix}[], headings: {assessment, suggested}, flow: string[], valueAdds: string[], rewrites: {before, after, why}[], modelAnswer: {text, words}}`.

- [ ] Tests: rewrites whose `before` is not in the answer are dropped; outline ids that do not exist are dropped and missing ones are added as "missing"; paragraph ids that do not exist are dropped; a trailing `[EXACT WORD COUNT: ...]` line is removed and `words` is counted by the engine; `\n` escapes in the model answer become line breaks.
- [ ] Implement; tests pass.

## Task 12: Synthesis pass

**Files:** Create `src/passes/synthesis.js`, `tests/synthesis.test.js`

**Interfaces:**
- Produces: `{name: "synthesis", VERSION: "y1", build(digest) -> {system, prompt, schema}, normalize(obj) -> Coaching}`; `digestFor(q, local, marks, language, coach, checks) -> object` (compact input); `marksLost(marks) -> {what, lost}[]` sorted by marks lost; `fallbackCoaching(q, marks, language, coach) -> Coaching`. `Coaching = {summary, strengths: string[], priorities: {title, why, how}[], drills: string[], plan: string[], fallback: boolean}`.

- [ ] Tests: `marksLost` lists parameters by `max - awarded` and penalty codes by their total, largest first; the fallback summary names the score, grade and the two largest losses; normalize keeps 3-5 priorities and 5-8 plan steps and strips rubric codes such as "RP-3" and "P2" from the summary.
- [ ] Implement; tests pass.

## Task 13: Pipeline and cache

**Files:** Create `src/cache.js`, `src/pipeline.js`, `tests/pipeline.test.js`, `tests/helpers.js`

**Interfaces:**
- Consumes: Tasks 2-12.
- Produces: `createCache(dir) -> {get(key), set(key, value)}`; `requestKey(parts) -> sha256`; `createSchemeStore(dir) -> {get(qhash), set(qhash, scheme)}`; `createLimiter(n) -> fn => Promise`; `analyseQuestion(q, deps, hooks) -> Promise<Report>`; `analyseQuestions(questions, deps, hooks) -> Promise<Report[]>`. `deps = {settings, keys, paths, cache, schemes, generate, limiter, signal, runs, quick, fresh, rebuildChecklist}`; `hooks.onEvent({q, pass, status: "queued"|"running"|"retrying"|"done"|"cached"|"failed"|"skipped", message, ms})`.
- Rules: empty answer makes no AI calls; under 60 words (tracks A/B) runs one scoring run, language, coach and synthesis, and the mark is 0; `quick` means one scoring run plus cross-checks only when `crossCheckReason` fires; extra runs when `needsMoreRuns`; one more full run when the full run is more than 12% from the median; errors of kind `quota`, `auth`, `permission`, `not_configured` stop all remaining passes; other failures mark that pass as failed and the report is still built.
- `tests/helpers.js` provides `fakeGenerate()` that answers each pass from its prompt (using real unit ids, sub-part ids and checklist ids) and counts calls.

- [ ] Tests: a full analysis with the fake AI makes 7 calls (scheme, language, 3 scoring, coach, synthesis); running it again makes 0 calls and gives an identical report JSON; `fresh` makes 6 calls (the checklist is kept); `rebuildChecklist` with `fresh` makes 7; a failing coach pass gives a report with `status.failed` containing `coach` and all other sections; a quota error stops the rest and the report says which passes are missing; an empty answer makes 0 calls and scores 0; disagreeing runs (2, 6, 9 of 15) trigger 2 more runs.
- [ ] Implement; tests pass.

## Task 14: Report model, Markdown and JSON

**Files:** Create `src/report/build.js`, `src/report/markdown.js`, `tests/report.test.js`

**Interfaces:**
- Produces: `buildReport({q, local, mechanical, scheme, marks, language, coach, coaching, status}) -> Report`; `buildSession(reports, {file, createdAt}) -> Session` with `testSummary` when there are 2+ questions (`{total, max, percent, rows, readiness, recurringPenalties, recurringLanguage, fatigue}`); `renderMarkdown(session) -> string`; `reportDirName(session) -> string`; `writeSession(session, outDir) -> {dir, html, md, json}`.

- [ ] Tests: Markdown has the sections in the order of Part 1 "Outputs"; table cells escape `|` and line breaks; the parameter table total equals `rawSum`; the test summary total equals the sum of question scores; readiness uses ESI/FM >= 22/50 and English >= 52/100 strict targets (from `prompt.js` COMBINED_HEADER_TEMPLATE); `writeSession` writes three files and the JSON parses back to the same session.
- [ ] Implement; tests pass.

## Task 15: HTML report

**Files:** Create `src/report/html.js`, `tests/html.test.js`

**Interfaces:**
- Produces: `renderHTML(session) -> string` (one self-contained file: inline CSS using the app's tokens from `style.css :root`, system font stack, `<details>` sections, print styles, a contents list for multi-question sessions, `<del>`/`<ins>` in the corrected answer).

- [ ] Tests: an answer containing `<script>alert(1)</script>` appears only escaped; the page has no `http` links to scripts or fonts; every section heading from the Markdown is present; coverage chips use classes `full partial missing`.
- [ ] Implement; tests pass.

## Task 16: Terminal output

**Files:** Create `src/ui.js`, `src/report/terminal.js`, `tests/terminal.test.js`

**Interfaces:**
- Produces: `ui.colorEnabled(stream, env)`; `ui.paint(color, text, on)`; `ui.wrap(text, width, indent)`; `ui.table(rows, opts)`; `ui.createStatus(stream, on)` (redraws one line per running pass on a TTY, prints plain lines otherwise); `ui.ask(rl, question, {default, hidden})`; `ui.choose(rl, title, options)`; `renderSummary(session, {color, width}) -> string`; `renderFull(session, opts) -> string`.

- [ ] Tests: with colour off there are no ANSI escapes; `NO_COLOR` turns colour off; the summary shows score, grade, projection, consistency, the top 3 losses, language counts, top 3 priorities and the report path; wrapping never exceeds the width.
- [ ] Implement; tests pass.

## Task 17: History and progress

**Files:** Create `src/history.js`, `tests/history.test.js`

**Interfaces:**
- Produces: `loadHistory(paths) -> Entry[]`; `recordSession(paths, session, dir)` (upsert by `qhash + ahash`); `progressStats(entries, {paper}) -> {count, average, byPaper, trend, weakestParams, topPenalties, topLanguage, wordDiscipline, latest, best}`.

- [ ] Tests: the same answer recorded twice stays one entry with the newer report path; stats average by paper; the trend is the last 10 percentages in date order; weakest parameters use percent of their maximum; a corrupt history file is moved aside to `history.corrupt-<time>.json` and an empty history is used.
- [ ] Implement; tests pass.

## Task 18: CLI commands and menu

**Files:** Create `src/cli.js`, modify `rbi.js`, `tests/cli.test.js`

**Interfaces:**
- Consumes: everything above.
- Produces: `main(argv, {stdin, stdout, stderr, env}) -> Promise<exitCode>`; exit codes 0 ok, 1 usage or input error, 2 AI setup problem, 3 analysis finished with failed passes, 130 stopped with Ctrl+C.
- `parseArgs(argv, spec) -> {command, positionals, flags}` supports `--flag value`, `--flag=value`, boolean flags and `-h`.
- Ctrl+C aborts requests and prints "Stopped. Finished parts are saved; run the same command again to continue."

- [ ] Tests (spawn `node rbi.js` with `RBI_ENGINE_DATA`, `RBI_ENGINE_KEYS` and a temp reports dir): `--version` prints `package.json` version; `help` lists every command; `new --paper FM --marks 10 --name test` creates `answers/<date>-test.txt` from the template with `Paper: FM`; `analyse` with no key exits 2 and says "rbi setup"; `analyse missing.txt` exits 1 naming the file; `config set runs 4` then `config` shows 4; an unknown flag exits 1 with a hint.
- [ ] Implement; tests pass.

## Task 19: Word (.docx) input

**Files:** Create `src/xml.js`, `src/docx.js`, `tests/docx.test.js`

**Interfaces:**
- Produces: `parseXML(text) -> {name, local, ns, attrs, children, text}` (namespaces resolved, entities decoded, CDATA, comments and processing instructions skipped); `extractDocxText(buffer) -> string` (ZIP central directory read with `zlib.inflateRawSync`, numbering and styles as in `app.js:1830-2169`, tables as `cell | cell`, empty paragraphs kept as blank lines so paragraph breaks survive).

- [ ] Tests: `../test-docs/fmt-02-clean-descriptive.docx` (skipped when absent) gives text containing every `answerHas` line of `../test-docs/expected/fmt-02-clean-descriptive.json`; a DOCX built in the test with `zlib.deflateRawSync` round-trips; `&amp;` and `&#8377;` decode; a damaged file throws "The Word document is damaged".
- [ ] Implement; tests pass.

## Task 20: End-to-end check and documentation

**Files:** Create `tests/e2e.test.js`, `README.md`; modify root `README.md`, root `CLAUDE.md`

- [ ] `e2e.test.js`: start a mock Gemini server, set `RBI_GEMINI_BASE` and `GEMINI_API_KEY=test`, run `node rbi.js analyse examples/sample-esi-15m.txt --out <tmp>`; expect exit 0, a report folder with three files, the terminal summary, and a second run that makes no requests; run on `tests/fixtures/app-full.txt` and expect a test summary with 2 questions.
- [ ] Run the whole suite: `node --test` from `RBI-Engine/` passes; `node --check` passes for every file.
- [ ] README: quick start in 3 steps, every command, the answer file format, the app export workflow, how consistency works, where files live, what is sent to the AI, quota notes and troubleshooting.
- [ ] Root `README.md`: one line pointing to `RBI-Engine/`. Root `CLAUDE.md`: a short RBI-Engine section (file map, test command, keep `rubric-text.js` equal to `prompt.js`).

---

# Part 3 - After the build

- First live run needs the user's key: `node rbi.js setup`, then `node rbi.js doctor`, then `node rbi.js analyse examples/sample-esi-15m.txt`.
- Each answer costs about 7 AI calls the first time (6 after the checklist is saved), 5 with `--quick`. A 4-question test is about 25 calls.

# Part 4 - Decisions made during the build

Built on 2026-11-28 with all 20 tasks test-first (265 tests). Decisions taken where the plan was silent or wrong, with the cost if a decision is wrong:

1. Nothing committed and no branch created (commits only on request). Cost: you commit the folder yourself.
2. The final mark is **not** clamped to checklist coverage as the app's AI Analysis does: with full coverage that clamp pushes a 15-mark answer to 11.25, above the rubric's own 9.5 hard ceiling. Coverage is used to trigger extra cross-check gradings instead. Cost: marks follow the checklist slightly less tightly.
3. The rubric's hard ceiling (6.25/10, 9.5/15, 22.5/30, 28.5/40) is enforced in code; the app leaves it to the AI. Cost: none; the report says when it applied.
4. RP-7 (lifting / outside info) applies to precis and comprehension of any mark (1.0 x marks/30); the app's table drops it for 10 and 15 marks. Cost: none.
5. The "very high mark, little coverage" cross-check uses 52% of the maximum (Grade A) because the app's 80% is unreachable under the ceilings. Cost: rarely, one extra grading call.
6. Factual errors, error-log items, rewrites and checklist quotes must quote words that really are in the answer; otherwise they are dropped. Cost: a real error the AI did not quote exactly is not shown.
7. The prompt's exam date is the date from the file or "Not recorded", never today's date, so the reply cache stays valid. Cost: none.
8. When gradings disagree and the full-feedback run is the outlier, the first extra run is a new full run (inside the 5-run limit). Cost: none.
9. Identical requests in flight are shared (two questions with the same checklist make one checklist call). Cost: none.
10. A fatal error (quota, bad key) stops queued parts immediately; finished parts stay cached so the next run continues. Cost: none.
11. An outline section the AI did not assess shows as "Not assessed", not "Missing". Cost: none.
12. "Rules the engine applied" became "Gates and rules in force": every active cap, the engine's own changes, and the AI's raw totals beside the recomputed ones. Cost: none.
13. Exit code 2 also covers a wrong model name and OpenRouter privacy blocks (setup problems). Cost: none.
14. A run stopped with Ctrl+C writes no report or history entry; other partial runs write a report that lists what is missing. Cost: none.
15. Empty Word paragraphs become one blank line; all other Word text matches the app's importer exactly (checked on all 22 test-docs DOCX files in Chromium). Cost: none.
16. A line of five or more "=" separates questions only when an "Answer:" line follows it, so heading underlines inside answers are safe (found in the final review). Cost: none.
17. Internal structure: shared pass helpers in `src/passes/common.js`, shared report wording in `src/report/view.js`, `callModel` (retries plus the Gemini model fallback) in `src/ai.js`, `writeSession` in `src/report/build.js`, `rbi.js` created with the CLI, extra path overrides `RBI_ENGINE_REPORTS` / `RBI_ENGINE_ANSWERS`, `keySource()` for doctor, `recent` added to progress statistics, and an unref'd exit timer in `rbi.js` so idle network sockets cannot keep the terminal waiting. Cost: none.

Small issues left for later:

- The "Where" column of the mistakes tables shows sentence ids (S3) rather than "sentence 3".
- `--json` with several input files prints one JSON document per file, not one array.
- `new` prints a stack trace if `examples/answer-template.txt` has been deleted.

Review: the whole build was self-reviewed by its author (no independent reviewer was run), which is weaker than a fresh review.

# Part 5 - Colour-marked answer, reasons for every lost mark, same checks on the site

Requested on 2026-11-28: mark the answer itself in colour, explain every lost mark, place suggested additions inside the answer, and give the practice site the same checks and marking as the engine.

## What the candidate sees

In the HTML report (engine) and in the AI Analysis result (site), a section **Your answer, marked** shows the answer with:

| Mark | Original text | Then | Source |
|---|---|---|---|
| Language mistake | red, struck through | the correction in green | engine: language pass; site: grammar and spelling audit |
| Weak framing | the sentence in deep blue | the better sentence in light blue | engine: coach `reframe`; site: `rewrites` |
| Wrong fact | the words in deep purple | the correct fact in light purple | grading run `factual_errors` |
| Something to add | - | an "Add" note in gold where it belongs | engine: coach `additions`; site: `additions` |
| Deduction | - | a small "-0.25" tag after the words that cost marks | grading run `penalties[].quote` |

Every mark carries a number (L1, B1, F1, A1) that links to the list under the answer, which gives the original words, the fix and the reason. Marks nest: a language mistake inside a weak sentence shows red/green inside the blue sentence. A mark that cannot be placed exactly (or crosses another mark) is still listed, marked "not shown in the answer".

A section **Why you lost N marks** lists every lost mark: one row per parameter below its maximum (with the engine's gate caps, failed examiner checks and the AI's specific reasons), one row per penalty (with the words that triggered it and how to avoid it), and rows for the hard ceiling, the 0-mark rules and, on the site, the consistency adjustment. The rows add up exactly to maximum minus score; key checklist points that were missed are listed under the table.

## Design

- **One shared core, two identical copies.** `answer-marks.js` (repo root, a classic script that sets `window.AnswerMarks`) and `RBI-Engine/src/answer-marks.js` (CommonJS) are byte-identical (UMD wrapper); `tests/sync.test.js` checks it. The core holds the quote checks (`normChars`, `plainText`, `quoteInScript`, `findSpan`, `isBritishVariant`, `onlyBritishChanges`), `buildMarks`, `markedHTML`, `marksListHTML`, `legendHTML`, `markedPlain`, `lossLedger`, `ledgerHTML` and the "how to fix" tables `HOW_PARAM` / `HOW_PENALTY`. `src/util.js` re-exports the quote checks so existing engine code is unchanged; `ai_eval.js` uses the global instead of its own older copies.
- **`buildMarks(text, {lang, facts, frames, adds, cuts})`**: items with offsets are checked against the text; items with quotes are located with `findSpan` (spelling via its context). Facts are placed first, then frames (a fact may sit inside a frame, never across its edge), then language marks (inside or outside a fact or frame, never across an edge, never overlapping each other). Additions go at a sentence end (moved past a mark that ends there); deduction tags go at the end of their quote. Ids are numbered per kind in reading order. Output: `{marks, counts, dropped}`; renderers walk the same nesting.
- **`lossLedger({max, score, rawSum, penaltySum, ceiling, ceilingApplied, autoFail, offTopic, notAttempted, track, params, penalties, adjustment})`** returns `{rows, total}` with `total === max - score` (to 0.01).
- **Engine passes.** Grading (full run, `g2`): each parameter adds `lost` (the specific reasons it is below its maximum) and each penalty adds `quote`; `enforceRubric` and `combineRuns` carry both. Coach (`c2`): sees the answer as numbered sentences inside numbered paragraphs and returns `reframe` (every sentence that needs better framing, up to 10, by sentence id or id range) and `additions` (up to 6, each after a sentence id) instead of `rewrites` and `value_additions`.
- **Site grading contract.** Parameters add `lost`, penalties add `quote`, new `off_topic` and `additions`, `rewrites` become every sentence that needs better framing (up to 8), grammar corrections must replace exactly the quoted words. `normalizeReport` drops quotes that are not in the answer (rewrites, additions, facts, error log, vocabulary, penalty quotes), drops grammar fixes that only change British spelling, and applies the same rules as the engine: hard ceiling, 0 when off-topic, RP-7 for precis and comprehension of any mark, penalty values for other marks snapped to 0.25 (at least 0.25), the 52% "high mark, little coverage" cross-check. The coverage clamp stays (the site grades once by default) but is centred on coverage x the hard ceiling and never goes above the ceiling, so it no longer conflicts with the rubric.
- **Reports.** Engine HTML/Markdown: new sections after "Summary and priorities"; the old "Factual errors" table, "Every mistake" table, "Rewrites" and "What would lift this answer" lists move into the marked-answer lists (no duplicates). Terminal summary: a "Marked" line with the counts and the main reason beside each lost mark. Site: the two new sections open by default; the duplicate grammar/spelling/fact lists and "Your sentences, rewritten" are replaced; the Markdown export gets both sections. `style.css` and the engine's CSS style the shared `mk-*` classes with their own tokens (print keeps the colours).

## Tasks (each test-first)

1. Core: move the quote checks into `src/answer-marks.js`, re-export from `util.js` (util tests unchanged), copy to the root, sync test.
2. Core: `buildMarks` with placement, nesting and numbering tests.
3. Core: `markedHTML`, `marksListHTML`, `legendHTML`, `markedPlain` (escaping, ids, links, nesting).
4. Core: `lossLedger` + `ledgerHTML`; `HOW_*` tables move from `synthesis.js`.
5. Engine grading `g2`: `lost` and `quote` through normalize, `enforceRubric`, `combineRuns`.
6. Engine coach `c2`: sentence ids, `reframe`, `additions`.
7. Engine report: `report.marked`, `report.ledger`; HTML, Markdown and terminal sections; fake replies and e2e updated.
8. Site: load `answer-marks.js`, contract and schemas, `normalizeReport` checks and rules, combine clamp, `tests/site.test.js` (vm) for the site's rules and for identical marks from identical input.
9. Site UI: result sections, CSS, Markdown export; check in Chromium with a mocked AI reply.
10. Docs: READMEs, CLAUDE.md (load order, shared core), this roadmap's decisions.

## Decisions made during Part 5

Built on 2026-11-28, test-first (308 tests, including 10 that load the site's `ai_eval.js` in a sandbox), checked in Chromium on the engine report (light and dark) and on the site (AI Analysis with mocked AI replies, no console errors). Decisions, with the cost if wrong:

1. Wrong facts are deep purple then light purple; additions are gold; a small "-0.25" tag marks the words that cost marks (not requested, added so every deduction is visible in place). Cost: none; the legend explains each colour.
2. One shared file, `answer-marks.js`, kept byte-identical in the site and the engine (sync test), instead of two implementations. Cost: a change must be copied to both places, or the tests fail.
3. Overlaps: wrong facts are placed first, then sentences to reframe, then language marks; marks nest inside each other but never cross. A mark that would cross an edge, or whose exact words are not found, is listed and labelled "not shown in your answer". Cost: rarely, a mark appears only in the list.
4. The site keeps its coverage band (it grades once by default) but centres it on coverage x the hard ceiling and never goes above the ceiling; the engine still has no band. Cost: on the site, a mid-coverage answer that the AI marked high can be lowered more than before, and a weak one is raised less.
5. The site now applies the engine's rules: hard ceiling, 0 when off-topic, RP-7 for precis and comprehension at any marks, penalty values snapped to 0.25, the 52% cross-check, and quotes that must be in the answer (facts, error log, rewrites, additions, vocabulary, penalty quotes). Cost: an AI quote that is not exact is dropped.
6. The site still makes one grading call; it now also asks for the reasons behind each lost mark, the words behind each penalty, up to 8 reframed sentences and up to 5 placed additions. Cost: somewhat longer AI replies.
7. Reports saved on the site before this change still open: marks are built when the report is shown, missing reasons fall back to the justification, and a balancing row keeps the table adding up. Cost: none.
8. The site's balancing row is "Consistency check" when the final mark came from several gradings or the coverage band, otherwise "Final adjustment". Cost: none.
9. The engine coach now answers by sentence id (`c2`) and the grading pass gives reasons and quotes (`g2`), so cached replies from before are not reused: the first re-run of an old answer makes new coach and grading calls. Cost: one-time AI calls.
10. Lists that the marked answer now holds were removed elsewhere (engine: "Every mistake", "Factual errors", "Rewrites", "What would lift this answer", "Where your marks went"; site: grammar, spelling and fact lists, "Your sentences, rewritten", the penalty list in the Markdown export). Cost: none; each section points to the marked answer.

Review: self-review by the author (no independent reviewer), which is weaker than a fresh review.
