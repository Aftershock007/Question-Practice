# AI conversion prompt: any question file to the RBI-PRACTICE-V1 layout

Some question files are messy: odd numbering, options side by side, answer keys at the end, passages, coaching banners. This prompt makes an AI (ChatGPT, Gemini, Claude...) rewrite any such DOCX or PDF into one fixed Word layout, the same for every file. The app recognises that layout by its header line `Format: RBI-PRACTICE-V1` and reads it by its labels (`parseCleanFormat` in `app.js`), not by guessing. Both objective (MCQ) and descriptive files are covered.

**How to use**

1. Open an AI chat that can read attached files (best: one that can also create files, such as ChatGPT with file creation).
2. Attach the source file(s): the question DOCX/PDF and, if the answers are in a separate file, that file too.
3. Copy everything inside the box below, paste it as your message and send it.
4. Download the `.docx` file(s) it makes. If it gives plain text instead, paste that text into an empty Word document with **Keep Text Only** and save it as `.docx`.
5. In the app: the `...-Objective.docx` file goes in **Objective > New Test > Browse Document**; the `...-Descriptive.docx` file in **Subjective > New Test > Browse Document**. Then press **AI Check**.

Sample files in this layout: `test-docs/fmt-01-clean-objective.docx`, `test-docs/fmt-02-clean-descriptive.docx`, `test-docs/fmt-03-clean-mixed-pasted.docx` (built by `test-docs/make_clean_format_docs.py`).

## The prompt (copy everything inside the box)

````text
# TASK
You are a meticulous document converter. I have attached one or more files of RBI Grade B practice questions. Convert them into the "RBI-PRACTICE-V1" layout defined below: a fixed Word (.docx) layout that my practice app imports automatically. The app reads the file line by line and recognises every part ONLY by the labels defined here (Q1., (a), Answer:, Topic:, Directions (Q5-Q8):, and so on). Follow this specification exactly and never improvise the layout. Whatever the source looks like, your output must look like the examples in this prompt.

The source can be any DOCX or PDF: objective questions (MCQs with options), descriptive questions (with or without model answers), or both. It may number questions in any style, print options side by side or in tables, give the answer key, explanations or model answers at the end or in a separate file, contain reading passages, data tables, case studies and puzzles, and carry coaching headers, footers and watermarks.

# PART 1. COPY, NEVER REWRITE (the most important rule)
1. Copy every question, statement, option, answer, explanation, passage, table cell and model answer WORD FOR WORD and in the source's order. Keep spelling, grammar, punctuation, capital letters, numbers, units, symbols (₹ % × ÷ ≤ ≥ √ → ² ³), quotation marks, abbreviations and Indian/British spellings exactly as they are, mistakes included.
2. Never summarise, shorten, paraphrase, simplify, correct, "improve", translate, merge, split or reorder questions. Never add questions, options, answers, explanations, facts or model answers of your own, and never solve a question to fill in a missing answer. If something looks wrong (a typo, a doubtful answer key, a missing option), copy it as it is and mention it in your report (Part 10).
3. The ONLY changes allowed are:
   a. adding the labels and header lines of this layout (Q1., (a), Answer:, Level:, Explanation:, Topic:, Directions (Q5-Q8):, the four header lines);
   b. moving answers, explanations and model answers that the source prints elsewhere (an answer key at the end, a solutions section, a separate answer file) under their own question;
   c. moving a passage, table or case that several questions share into a Directions block just above them (Part 5.9);
   d. relabelling options as (a) (b) (c) (d) (e) and putting each option on its own line;
   e. rewriting tables in the table form of Part 3;
   f. deleting page clutter (Part 2);
   g. writing a chart's readable values as a table, or a one-line placeholder for a picture that cannot be written as text (Part 5.10).
4. Every question in the source must be in your output. Count the questions in the source before you start and in your output at the end: the two numbers must match.

# PART 2. DELETE PAGE CLUTTER (it is not content)
Delete: page numbers; running headers and footers; watermarks; coaching institute names, logos, websites and phone numbers; Telegram / WhatsApp / YouTube / app promotions; "Download PDF" or "Click here" lines; copyright lines; tables of contents; repeated document titles; general instructions for candidates (time allowed, maximum marks, "all questions are compulsory"); empty answer spaces and ruled lines; and the answer-key, solutions and model-answer sections themselves once their content has been moved under the questions.
If the source prints every question in both Hindi and English, keep only the English. Do not translate anything.

# PART 3. GENERAL LAYOUT RULES (both kinds of file)
1. Every line shown in this layout is a separate paragraph. Never put two labelled items in one paragraph, and never split one option, label line or table row over two paragraphs.
2. Type every label as plain text at the very start of its paragraph. Never use Word's automatic numbering or bullet lists: type "Q12.", "(a)", "1.", "•" yourself. Use the Normal style for everything; no headings, colours or special fonts are needed (bold or italic inside a sentence is allowed but means nothing to the app).
3. Leave one empty paragraph between two questions (only for readability).
4. Tables (data tables, match-the-following lists, tables inside explanations or model answers): a real Word table with one row per source row, the header row first, plain text in every cell, no merged cells, no nested tables. When you write plain text instead of a .docx, write each row on its own line with the cells separated by " | " (space, vertical bar, space), for example: Year | Repo rate (%) | CPI inflation (%). Never use a table for anything that is not a table in the source (no tables for options, questions or page layout).
5. Points: start a bulleted point with "• " (bullet, space) and a sub-point with "◦ ". Keep the source's own numbering or lettering of points ("1. ", "(i) ", "a) ").
6. No Markdown or code formatting inside the file: no **, ##, >, backticks or emojis. No text boxes, columns, headers or footers, footnotes, comments, hyperlinks, page breaks or images.
7. Formulas: plain text on one line, e.g. Real GDP = Nominal GDP / GDP Deflator x 100. Powers as ² ³ or ^ (10^6). No LaTeX.
8. Reserved line starts. The app reads these at the start of a line as labels, so no line of question text, option, explanation, passage or model answer may start with them:
   - "Q" or "Question", then a number, then ".", ")" or ":" (for example "Q3: GDP grew 6% ...");
   - "Directions" or "Direction" followed by "(" or ":";
   - "Topic:", "Type:" or "Format:".
   Also: in an MCQ only its real Answer, Level and Explanation lines may start with "Answer", "Level:" or "Explanation"; in a descriptive question only its real Answer line may start with "Answer".
   If a source line starts like that, join it to the end of the line before it with one space.

# PART 4. FILE HEADER (the first four lines of every output file)
Line 1, the title:
   - Questions from one chapter: "Chapter <number>: <chapter name>", e.g. Chapter 1: National Income. Take the number and the name from the source's title or file name (CH-1-National_Income-Questions.docx -> Chapter 1: National Income).
   - Otherwise: the source's own title on one line, e.g. Spotlight Question Bank (1-6 Nov, 2026).
Line 2, the subject: "Subject: " followed by exactly one of these seven names:
   Economics (ESI)        Indian economy, national income, inflation, monetary and fiscal policy, growth, social issues, government schemes
   Finance                financial system and markets, banking and RBI regulation, risk management, accounting, corporate finance, derivatives, fintech
   Management             management theories, leadership, motivation, communication, HRM, organisational behaviour, ethics, CSR
   English                grammar, vocabulary, reading comprehension, cloze, error spotting, essay, précis, letter and report writing
   General Awareness      current affairs, banking awareness, static GK
   Quantitative Aptitude  arithmetic, data interpretation, number series, simplification, approximation
   Reasoning              puzzles, seating arrangement, syllogism, inequality, coding-decoding, blood relations
Line 3, the kind: "Type: Objective" for an MCQ file, "Type: Descriptive" for a descriptive file.
Line 4, exactly: Format: RBI-PRACTICE-V1   (this line tells the app that the file uses this layout; without it the file is read wrongly)
Then one empty paragraph, then the questions.

# PART 5. THE OBJECTIVE FILE (MCQs)

5.1 Shape of every MCQ, in this order, each item on its own line:
Q<number>. <question text>
<more question lines, if any>
(a) <option>
(b) <option>
(c) <option>
(d) <option>
(e) <option>
Answer: (<letter>)
Level: <Easy | Moderate | Hard>                  <- only if the source gives a difficulty
Explanation: <first line of the explanation>     <- only if the source explains the answer
<more explanation lines, if any>

5.2 Question number
- "Q", the number, a full stop and one space, then the question text on the same line: "Q1. ", "Q27. ". No other style ("1.", "Q.1)", "Question 1:", "Q-1").
- Keep each question's number from the source, so it still matches the source and any separate answer key. If the source does not number its questions, number them 1, 2, 3 ... in order.
- If the source restarts its numbering for a new set or section (Set A 1-20, Set B 1-20), keep those numbers and start the new set with a Topic line that names it.

5.3 Topic lines
- A line "Topic: <name>" before a group of questions on one topic. It applies to every question below it until the next Topic line.
- Use the source's own section or topic headings, without their numbering: "2. Instruments of Monetary Policy" -> Topic: Instruments of Monetary Policy.
- If the source has no topic headings, add Topic lines yourself: name each group of related questions with a short sub-topic (2-5 words, Title Case), use at most about 10 different names in one file, and spell a repeated topic exactly the same way every time. Never reorder questions to group them; just add a new Topic line where the topic changes.

5.4 Question text
- Everything that belongs to the question goes between the Q line and option (a), one source line per line: statements ("1. ...", "2. ...", "I. ...", "II. ..."), "Assertion (A): ..." and "Reason (R): ..." lines, lists, match-the-following tables (List I | List II), sentences with blanks (keep "______" exactly), the parts of a sentence for error spotting, jumbled sentences (A)-(E), and the closing line ("Which of the statements given above is/are correct?").
- A table, passage or data set that only this question uses also goes here. Material that two or more questions share goes in a Directions block (5.9).
- If a question has no wording of its own (for example one blank of a cloze test), write the reference the source uses, e.g. Q11. Blank (11).

5.5 Options
- Each option on its own line: "(a) ", "(b) ", "(c) ", "(d) ", "(e) " (a lower-case letter in round brackets, then one space), then the option text exactly as in the source.
- Keep the source's order. Source labels A/B/C/D/E, 1/2/3/4/5, i/ii/iii/iv/v, a) / a. / [a] all become (a) (b) (c) (d) (e) in that order.
- Split options that the source prints side by side, in a table, or after the question on the same line.
- Write as many options as the source has (usually 4 or 5). The app uses at most five, (a) to (e): if a question has more, write them all and name the question in your report.
- If the options are only letters that point to parts of the question (error spotting), write each option as the part it points to, e.g. (a) The manager along with his team.

5.6 Answer line (every MCQ has exactly one)
- One correct option: Answer: (b)
- Several correct options: Answer: (a), (c), (d)   (each letter in brackets, separated by a comma and a space). Keep any "more than one option may be correct" wording in the question.
- Take the answer from wherever the source gives it: under the question, an answer-key grid or table, a solutions section, or a separate answer file. Always match it by question number (and set), never by position in a list.
- An answer given as option text or as a number ("Ans: Repo rate", "Ans: 3") becomes the letter of that option.
- No answer in the source: Answer: Not given. Do not solve the question yourself.
- Nothing else on the Answer line. Text that follows the answer in the source ("Ans. (b) because ...") goes on the Explanation line.

5.7 Level line (optional)
- Only when the source gives the question's difficulty: Level: Easy, Level: Moderate or Level: Hard (Medium -> Moderate; Difficult, Tough -> Hard). Otherwise leave the line out.

5.8 Explanation (optional)
- When the source explains the answer (explanation, solution, reason, working, note), write "Explanation: " followed by its first line, then all its other lines, points, formulas and tables below it, exactly as in the source.
- The explanation ends where the next Q line, Topic line or Directions block starts. If the source has no explanation, leave the line out. Never write an explanation yourself.

5.9 Shared passages, data, cases and puzzles: the Directions block
- When a passage, data table, chart, caselet, puzzle, set of conditions or instruction is shared by two or more questions, write it once, directly above the first of those questions:
Directions (Q<first>-Q<last>): <the source's instruction sentence, if it has one>
<the passage's title, if any>
<the passage paragraphs, table rows, conditions ... exactly as in the source>
Q<first>. ...
- <first> and <last> are the numbers of the first and last question that use it, as written in your file, e.g. Directions (Q21-Q25):. Those questions follow straight after it, in order. Never put a Topic line between a Directions block and its questions (put it above the Directions line).
- After the colon, copy the source's own instruction ("Read the following passage carefully and answer the questions given below it."). If the source has no instruction sentence, leave the rest of the line empty.
- A shared instruction without a passage also gets a Directions block ("Directions (Q1-Q5): Choose the word most nearly opposite in meaning to the word given in capitals.").
- If the source prints the passage after its questions, move it above them.

5.10 Charts and pictures
- A chart or graph whose values can be read: write the values as a table (with the chart's title on the line above it) and mention it in your report.
- A picture or chart that cannot be written as text: one line [Figure not reproduced: <what it shows>], and name the question in your report.

5.11 Example of an objective file
----- START OF EXAMPLE: CH-1-National_Income-Objective.docx -----
Chapter 1: National Income
Subject: Economics (ESI)
Type: Objective
Format: RBI-PRACTICE-V1

Topic: Domestic Territory and Residents

Q1. Which of the following is NOT a part of India's domestic (economic) territory?
(a) An Air India aircraft flying between London and New York
(b) The Indian Embassy in Tokyo
(c) A fishing vessel run by an Indian resident in international waters
(d) The World Bank office in New Delhi
(e) An oil rig run by ONGC in India's Exclusive Economic Zone
Answer: (d)
Level: Easy
Explanation: Offices of international organisations such as the World Bank are not part of India's domestic territory, even though they are located in India.

Q2. Consider the following statements:
1. National income is the sum of factor incomes earned by the normal residents of a country.
2. Transfer payments are included in national income.
3. Net factor income from abroad is added to domestic income to get national income.
Which of the statements given above is/are correct?
(a) 1 only
(b) 1 and 3 only
(c) 2 and 3 only
(d) 1, 2 and 3
(e) None of the above
Answer: (b)
Explanation: Transfer payments are not earned through productive work, so they are left out.
NI = NDP at FC + NFIA

Topic: Methods of Measurement

Q3. Match List I with List II:
List I | List II
A. Income method | 1. Sum of final expenditures
B. Expenditure method | 2. Sum of factor incomes
C. Value added method | 3. Sum of value added by all producers
(a) A-2, B-1, C-3
(b) A-1, B-2, C-3
(c) A-3, B-1, C-2
(d) A-2, B-3, C-1
Answer: (a)

Q4. Which of the following are excluded while estimating national income? (More than one option may be correct.)
(a) Sale of second-hand goods
(b) Old-age pensions
(c) Imputed rent of owner-occupied houses
(d) Purchase of shares
(e) Wages of government employees
Answer: (a), (b), (d)
Explanation: Second-hand sales and share purchases are not current production, and pensions are transfer payments.

Directions (Q5-Q6): Study the table below and answer the questions that follow.
Year | Nominal GDP (Rs lakh crore) | Real GDP (Rs lakh crore)
2023-24 | 295 | 173
2024-25 | 324 | 184

Q5. By roughly what percentage did nominal GDP grow from 2023-24 to 2024-25?
(a) 6.5%
(b) 8.2%
(c) 9.8%
(d) 11.4%
(e) 12.6%
Answer: (c)
Level: Moderate
Explanation: (324 - 295) / 295 x 100 = 9.8%

Q6. What was the GDP deflator in 2024-25 (approximately)?
(a) 156
(b) 168
(c) 176
(d) 182
(e) 190
Answer: Not given
----- END OF EXAMPLE -----
(In a .docx file the "|" rows of this example are real Word tables.)

# PART 6. THE DESCRIPTIVE FILE (questions with model answers)

6.1 Shape of every descriptive question, in this order:
Q<number>. (<marks> Marks, <words> Words)
Topic: <topic>
<question text: one or more lines>
Answer:
<model answer: as many lines as needed>

6.2 The Q line
- Only "Q<number>. (<marks> Marks, <words> Words)" on this line, e.g. Q3. (15 Marks, 600 Words). The question text goes below the Topic line.
- Numbers: as in 5.2.
- Marks: as the source gives them; 10 if it gives none.
- Words: the word limit the source gives (in the heading or inside the question, e.g. "in about 250 words"); if it gives none, marks x 40 (10 marks -> 400 words, 15 marks -> 600 words).
- A question that the source splits into separately marked parts ((a) 5 marks, (b) 5 marks) stays ONE question: add up the marks, keep the parts on separate lines of the question text, and put the answers of all parts, in order, under its one Answer line.

6.3 Topic line (required, right under the Q line)
- Topic: <the source's own title or heading for this question> ("Q1. GDP and Welfare" -> Topic: GDP and Welfare). If the source has none, a 2-6 word topic that names what the question is about.

6.4 Question text
- The complete question exactly as in the source, starting on the line under the Topic line, every paragraph on its own line: a quotation, background sentences, sub-parts (a) / (b), and for English questions the whole passage to summarise, the letter or report situation, or the list of essay topics.
- Do not repeat the marks, word limit or topic in the question text unless the source's own question sentence contains them.

6.5 Answer line and model answer
- A line with only "Answer:" after the question text; the model answer starts on the next line.
- Copy the complete model answer exactly as in the source and in its order: introduction, every heading (each on its own line), paragraph, bullet ("• ") and sub-bullet ("◦ "), numbered point, table, formula, example, data source in brackets, and the conclusion. Never shorten it, never drop repeated lines or headings, never add to it.
- Diagrams and flowcharts: as text when they are made of words (e.g. Savings -> Banks -> Loans -> Investment); otherwise one line [Diagram not reproduced: <what it shows>].
- No model answer in the source: Answer: Not given. Never write one yourself.
- Model answers printed elsewhere (a separate section or file): match them to their questions by number.

6.6 Shared case or passage
- A case study, passage or data set used by two or more questions goes once in a Directions block directly above the first of them, exactly as in 5.9 (Directions (Q3-Q4): Read the case below and answer the questions that follow. / the case title / its paragraphs / its table rows / Q3. ...).
- A passage that only one question uses (for example the passage for a précis) stays in that question's text.

6.7 Example of a descriptive file
----- START OF EXAMPLE: CH-1-National_Income-Descriptive.docx -----
Chapter 1: National Income
Subject: Economics (ESI)
Type: Descriptive
Format: RBI-PRACTICE-V1

Q1. (15 Marks, 600 Words)
Topic: GDP and Welfare
"Higher GDP does not always mean higher welfare." Critically examine this statement in the Indian context and suggest better measures of well-being.
Answer:
Gross Domestic Product (GDP) is the market value of all final goods and services produced inside a country in a year. Welfare is broader: it covers income, health, education, safety and a clean environment.
Why Higher GDP May Not Mean Higher Welfare
• Ignores income distribution: GDP is a total and per capita income is only an average.
◦ In India, the top 10% earn about 58% of national income.
• Leaves out unpaid work: unpaid domestic and care work is excluded.
Better Measures of Well-being
Measure | What it adds
HDI | Health and education along with income
Green GDP | Deducts environmental costs
Conclusion
GDP growth is necessary for welfare but not sufficient on its own.

Q2. (10 Marks, 400 Words)
Topic: Fiscal Deficit
India's fiscal deficit fell to 4.8% of GDP in 2024-25.
In this context, discuss:
(a) the quality of fiscal consolidation; and
(b) the risks to the glide path.
Answer:
Fiscal deficit is the excess of total expenditure over total receipts excluding borrowings.
1. Quality of consolidation: capital expenditure was protected while revenue spending was restrained.
2. Risks: slower nominal growth, higher subsidies and state-level deficits.
Conclusion: consolidation that protects capital spending supports growth.

Directions (Q3-Q4): Read the case below and answer the questions that follow.
Case Study: Shakti Bank
Shakti Bank is a mid-sized private bank. Its gross NPA ratio rose from 3.1% to 6.4% in two years, mostly from unsecured personal loans.
Year | Gross NPA (%) | Unsecured share of loans (%)
FY24 | 3.1 | 22
FY26 | 6.4 | 35

Q3. (10 Marks, 400 Words)
Topic: Asset Quality
Identify the main causes of the rise in Shakti Bank's bad loans.
Answer:
The main causes are the fast growth of unsecured loans, weak underwriting and concentration in risky segments.

Q4. (10 Marks, 400 Words)
Topic: Asset Quality
Suggest a plan to restore asset quality.
Answer: Not given
----- END OF EXAMPLE -----

# PART 7. HOW MANY OUTPUT FILES, AND THEIR NAMES
- Only MCQs in the source: one objective file. Only descriptive questions: one descriptive file. Both kinds: two files (an objective file and a descriptive file), each with its own four header lines.
- Questions of several subjects in separate sections (for example a full mock test with English, Quantitative Aptitude, Reasoning and General Awareness): one file per subject (and kind). Keep the source's question numbers.
- A question with options is an MCQ. A question to be answered in writing (including a short answer without options) is descriptive.
- File names: CH-<number>-<Chapter_Name>-Objective.docx and CH-<number>-<Chapter_Name>-Descriptive.docx, with underscores instead of spaces, e.g. CH-1-National_Income-Objective.docx. Without a chapter: <Short_Title>-Objective.docx. Never use & / \ : * ? " < > | in a file name.

# PART 8. HOW TO DELIVER
1. Best: real .docx file(s) for me to download. If you can run code, build them with python-docx: one doc.add_paragraph(...) per line of this layout, Word tables (or " | " lines) for tables, the Normal style for everything, no list styles. If you can, read the source with code as well (paragraphs and tables in document order), so the text is copied rather than retyped; python-docx does not return Word's automatic list numbers and letters, so rebuild those (question numbers, statement numbers, option letters) in order. After saving, open your file again, run every check in Part 9 on it, and fix every problem before you give it to me.
2. If you cannot create files: give each file as plain text in its own code block, starting with its four header lines, and tell me its file name. (I will paste it into Word with "Keep Text Only" and save it as .docx.)
3. Long sources: never stop early, skip questions, write "...", "etc." or "and so on", or summarise. If one reply cannot hold everything, stop after a complete question, write CONTINUED IN NEXT PART, and when I write "continue", go on from the next question without repeating the header or any question.

# PART 9. CHECK EVERYTHING BEFORE YOU DELIVER (fix every "no")
Common mistakes (wrong -> right):
- "1. Which of the following ..." / "Q.1) Which ..." -> "Q1. Which of the following ..."
- "A) Repo rate   B) CRR   C) SLR" on one line -> one line each: "(a) Repo rate", "(b) CRR", "(c) SLR"
- An "Answer Key" table at the end of the file -> "Answer: (c)" under each question, and no key table
- "**Answer:** (b)", "## Topic: ..." -> "Answer: (b)", "Topic: ..." (no Markdown)
- "Answer: (b) because the CRR ..." -> "Answer: (b)" then "Explanation: Because the CRR ..." on the next line
- Descriptive "Q1. Explain ... (15 marks)" -> "Q1. (15 Marks, 600 Words)", "Topic: ...", "Explain ... (15 marks)" only if the source's question sentence has it, then "Answer:"
- A model answer or explanation shortened, merged into one paragraph or reworded -> copied in full, line by line
- A passage repeated above every question of its set -> written once in a "Directions (Q21-Q25):" block above the first one
- The header missing or incomplete -> the four header lines, ending with "Format: RBI-PRACTICE-V1"

Checks:
1. Lines 1-4 of every file: the title; "Subject: " with one of the seven names; "Type: Objective" or "Type: Descriptive"; "Format: RBI-PRACTICE-V1"?
2. The number of questions in each file equals the number of those questions in the source, and every source question number appears exactly once?
3. Objective: every MCQ has its Q line, all its options on separate (a) (b) ... lines, and exactly one Answer line with letter(s) taken from the source and matched by question number (or "Not given")?
4. Descriptive: every question has "Q<n>. (<m> Marks, <w> Words)", a Topic line, the full question text, an "Answer:" line and the complete model answer (or "Answer: Not given")?
5. Every Directions block has the correct range, sits directly above its first question, and its questions follow in order?
6. Text identical to the source? Compare at least ten questions, with their options, answers, explanations and model answers, line by line with the source. Nothing summarised, added, corrected or translated; no clutter; no Hindi duplicates?
7. No Markdown symbols, no automatic Word numbering or bullets, and no content line that starts with a reserved label (Part 3.8)?

# PART 10. YOUR REPLY (outside the file)
Along with the file(s), write a short report in the chat (never inside a file):
- for each file: its name, the number of questions, the first and last question number, how many MCQs have "Answer: Not given" (with their numbers), and how many Directions blocks it has;
- anything you could not reproduce (charts, figures, unreadable text), with question numbers;
- problems you saw in the source and left unchanged: missing or repeated question numbers, answer keys that look wrong, questions with more than five options, incomplete questions.

Now convert the attached file(s).
````
