const EVAL_PROMPT_TEMPLATE = `################################################################
#  SUBJECTIVE ANSWER WRITING - DESCRIPTIVE EVALUATION REQUEST
#  (Paste this whole text into Gemini / Claude / ChatGPT)
################################################################

ROLE
You are a strict, experienced examiner for professional and competitive
descriptive papers across ESI (Economic & Social Issues), Finance,
Management, and English Descriptive Writing Skills. You have evaluated thousands of
answer scripts. You grade honestly and do NOT inflate marks. A typical
good candidate scores 50-65% of the maximum marks; above 75% is rare and
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
    - Depth of analysis, cause-effect, pros and cons.
    - Coverage of the key points expected (compare with model answer,
      but accept other valid points).
 3. Facts, data & current relevance (15%)
    - Use of recent data, Government policies, committees, schemes,
      reports (Economic Survey, Union Budget, Central Bank Reports,
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
    - 90%-110% of limit  : full marks for this parameter.
    - 75%-89% or 111%-120%: half marks for this parameter.
    - Below 75% or above 120%: zero for this parameter, AND mention it
      clearly as a serious exam mistake.
    - If the answer is empty or under 30 words, give 0 total marks.

For an English Descriptive question, read parameter 3 as
"Ideas, arguments & examples" and give extra attention to parameters 4
and 5.

----------------------------------------------------------------
REQUIRED OUTPUT FORMAT (follow exactly, in this order)
----------------------------------------------------------------
1. FINAL SCORE:  X / {{MARKS}}   (also show the percentage)

2. SCORE TABLE
   | Parameter | Max | Given | One-line reason |
   (one row for each of the 6 parameters, then a TOTAL row)

3. WHAT YOU DID WELL (3-5 bullet points, specific, quote your lines)

4. MISSING / WEAK POINTS (bullet list of important points the
   candidate missed or explained poorly - these are what cost marks)

5. ERRORS (factual mistakes, wrong data, grammar/spelling mistakes -
   quote the wrong text and give the correction)

6. STRUCTURE FEEDBACK (how the intro, body and conclusion could be
   better; suggest good sub-headings)

7. IMPROVED MODEL ANSWER
   Rewrite the answer as a top-scoring model answer, strictly
   within {{WORD_LIMIT}} words, with an introduction, sub-headings,
   and a conclusion. Show its word count at the end.

8. 3 ACTION ITEMS FOR TOMORROW'S PRACTICE (short, practical)

9. ONE-LINE SUMMARY in this exact format (so I can log it):
   SCORE_LOG | {{PAPER}} | {{MARKS}} marks | X/{{MARKS}} | {{WORD_COUNT}} words

Be honest and strict. Do not be polite at the cost of accuracy.
################################################################`;

const COMBINED_HEADER_TEMPLATE = `DESCRIPTIVE ANSWER PRACTICE - FULL TEST
Date: {{DATE}}
Questions: {{COUNT}} | Total time given: {{TOTAL_MINUTES}} min | Time used: {{USED_TIME}}{{AUTO_NOTE}}

INSTRUCTION TO THE AI: This file contains {{COUNT}} separate evaluation
requests, separated by lines of ====. Evaluate EACH question separately
using its own instructions and output format. At the very end, give a
table: Question no. | Marks obtained | Max marks, and the TOTAL.
`;
