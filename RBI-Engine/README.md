# RBI-Engine

A command-line tool that analyses your RBI Grade B Phase-2 descriptive answers (ESI, Finance & Management, English) with AI. It runs on your computer and gives a very detailed report:

- **Marks** on the strict RBI rubric used by the practice app, with every parameter, penalty and examiner check explained, and a real-exam projection.
- **Every language mistake** (grammar, tense, agreement, articles, prepositions, punctuation, spelling, word choice), each with the rule, the fix and your answer with only the language corrected.
- **Content**: which parts of the question you answered, which key points you covered, wrong facts, concept gaps and the reports, committees or data to add.
- **How to frame the answer better**: what the question asks, the ideal outline with a word budget, better introduction and conclusion, rewrites of your weakest sentences and a model answer within the word limit.
- **A plan**: top priorities, three drills for tomorrow and a step-by-step plan. History and progress across all your answers.

The same answer always gets the same report (see [How the marks stay consistent](#how-the-marks-stay-consistent)).

## Quick start

You need [Node.js](https://nodejs.org) 18 or newer. Nothing else to install.

```bash
cd RBI-Engine
node rbi.js setup                                  # choose the AI and paste your API key (once)
node rbi.js analyse examples/sample-esi-15m.txt    # try it on the sample answer
```

Or just run `node rbi.js` for a menu. To get a short `rbi` command, run `npm link` once inside `RBI-Engine` (then `rbi analyse ...` works from any folder).

The default AI is Google Gemini with the same two models as the practice app (`gemini-4-hydrogen` with low thinking for the checklist and summary, `gemini-4-neon` with high thinking for marks and feedback). Get a key at https://aistudio.google.com/app/apikey. OpenRouter, OpenAI, Anthropic, Groq, DeepSeek, Mistral and local servers (Ollama, LM Studio) also work: pick one in `setup`.

## Writing an answer

**Option 1 - from the practice app.** Take the test in the app (typing practice, timer, no copy-paste). On the result screen press **Download all prompts (.txt)** (or the download button of one question). Then:

```bash
node rbi.js analyse ~/Downloads/Practice_2026-11-28_FullTest.txt
```

Every question, your answer, the model answer, marks, word limit and time are read from that file. Blank questions score 0 without using the AI.

**Option 2 - an answer file.** `node rbi.js new --paper ESI --marks 15` creates `answers/<date>-esi.txt`. Fill it in and analyse it:

```text
Paper: ESI
Topic: Inflation targeting
Marks: 15
Word limit: 600
Time spent: 22 min

Question:
Critically examine the flexible inflation targeting framework ...

Answer:
(your answer, exactly as you wrote it)

Model answer:
(optional - the marking checklist is built from it)
```

- Put several questions in one file by separating them with a line of `=====`.
- `Passage:` (for a precis, comprehension or case study) can come before or after the question.
- Word files (`.docx`) in the same layout work too. PDF does not: save as `.txt` or `.docx`.
- Missing marks or word limit get sensible defaults, and the report says which ones were assumed.

**Option 3 - separate files.** `node rbi.js analyse --question "Explain CRR." --answer my-answer.txt --marks 10`

## Commands

| Command | What it does |
|---|---|
| `node rbi.js` | Menu |
| `analyse <file> [more files]` | Analyse answers. Options: `--quick` (one grading run), `--runs N`, `--fresh` (ask the AI again), `--rebuild-checklist`, `--open` (open the HTML report), `--full` (print everything), `--json`, `--out DIR`, `--only 1,3`, `--paper`, `--marks`, `--words`, `--topic`, `--track`, `--time`, `--debug` |
| `new` | Create an answer file (`--paper --marks --words --topic --name --open`) |
| `history` | Past analyses (`--limit N --paper P`) |
| `progress` | Average, trend, weakest rubric areas and the mistakes that keep coming back |
| `show [N]` | Show the N-th latest report again (`--open --full`) |
| `setup` | Choose providers and models, save your API key |
| `doctor` | Check Node, folders, keys and the connection (`--offline` skips the connection test) |
| `config` / `config set <key> <value>` | Show or change settings, for example `config set grade.thinking medium` or `config set runs 5` |

Exit codes: 0 done, 1 wrong input, 2 AI not set up (key, model), 3 finished with some parts missing (run again to complete them), 130 stopped with Ctrl+C.

## The report

Each analysis writes a folder in `RBI-Engine/reports/` with:

- `report.html` - the full report to read in a browser (works offline; your answer is shown marked in red and green, with numbered links to every mistake),
- `report.md` - the same report as Markdown,
- `report.json` - all the data.

The terminal shows a short summary: the score, grade, consistency of the gradings, where the marks went, language counts and the three fixes to do first.

## How an answer is analysed

1. **Engine checks (no AI):** word count, sentences, paragraphs, headings, introduction/body/conclusion share, word band, time and words per minute, command words, and mechanical checks (repeated words, spacing, contractions, informal words, first person, rhetorical questions, very long sentences, wall of text, bullets in an essay, more than one paragraph in a precis). These are the same every time.
2. **Marking checklist (AI, engine 1):** the parts of the question, 5-12 weighted key points taken from your model answer, and the ideal outline. Saved per question, so every attempt at the question is marked against the same list.
3. **Grading (AI, engine 2):** the full RBI rubric from the practice app, with the track, parameter maxima, penalty values and your real word count fixed by the engine. Three independent gradings by default.
4. **Language audit (AI, engine 2):** your answer is sent sentence by sentence; every mistake comes back with the exact words, the fix and the rule.
5. **Structure coach (AI, engine 2):** outline match, introduction, each paragraph, conclusion, headings, flow, rewrites and a model answer.
6. **Summary (AI, engine 1):** priorities, drills and a plan, written from the final marks.

About 7 AI calls per answer the first time (6 later, because the checklist is saved; 5 with `--quick`). A 4-question test is about 25 calls and takes a few minutes per answer.

## How the marks stay consistent

- **Same input, same report.** Every AI reply is saved in `data/cache/`. Analysing the same answer again makes no AI calls and gives exactly the same report. Use `--fresh` to ask the AI again.
- **Fixed checklist** per question, saved in `data/schemes/`.
- **The rubric is enforced by the engine, not the AI:** caps for every failed examiner check, source-count caps, word bands and the word-limit penalty from the real word count, penalty values and maximum counts from the table, 0 marks under 60 words or when off-topic, the rubric's hard ceiling and 0.25-mark steps.
- **Several gradings:** the median of each parameter and a majority vote on each check and checklist point. If the gradings differ by more than 12% of the maximum, up to 5 are used. The report shows every grading and the spread.
- **Quotes are checked:** a mistake, rewrite or checklist quote that is not really in your answer is dropped, and British/Indian spellings (programme, labour, organisation) are never marked wrong. The corrected answer changes only the checked mistakes.

The marking is deliberately strict (the practice app's calibration): a mark here usually means 2-3 marks more in the real exam on a 10 or 15-mark question. The report shows that projection.

## Where your files and key are kept

| What | Where |
|---|---|
| API key | Environment variable (`GEMINI_API_KEY` or `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`, `CUSTOM_API_KEY`), or `~/.rbi-engine/keys.json` written by `setup` (readable only by you). Never inside the repo. |
| Settings, cache, checklists, history | `RBI-Engine/data/` (move it with `RBI_ENGINE_DATA`) |
| Reports | `RBI-Engine/reports/` (or `--out`, or `config set reportsDir <folder>`) |
| Answer files from `new` | `RBI-Engine/answers/` |

`data/`, `reports/` and `answers/` are ignored by git, so your answers are not pushed to the public repo.

**What is sent to the AI:** the question, passage, your answer and your model answer, to the provider you chose. Nothing else leaves your computer.

## Troubleshooting

- **"AI is not set up"** - run `node rbi.js setup`, or set `GEMINI_API_KEY`.
- **"Model not available"** - the model name is wrong for your key: `node rbi.js setup` or `node rbi.js config set grade.model <name>`. `doctor` tests both engines.
- **"Quota used up"** - the free daily limit is reached. Finished parts are saved; run the same command tomorrow and only the missing parts are asked again.
- **"No reply in time"** - try again, or lower the thinking level: `node rbi.js config set grade.thinking medium`.
- **A local model (Ollama)** - `setup`, choose `custom`, address `http://localhost:11434/v1`, model `llama3.1` (or any model you pulled). Small local models find far fewer language mistakes than Gemini.

## For developers

- Plain Node.js (18+), CommonJS, no npm packages. Run the tests with `node --test` inside `RBI-Engine/` (about 260 tests; AI calls are faked or sent to a local mock server).
- `src/rubric-text.js` must equal `EVAL_PROMPT_TEMPLATE` in the app's `prompt.js` (`tests/sync.test.js` checks it). The rubric tables in `src/rubric.js` mirror `ai_eval.js`.
- The design and build plan are in [ROADMAP.md](ROADMAP.md).
