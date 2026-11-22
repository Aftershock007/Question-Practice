// ============================================================================
// RBI GRADE B PHASE-2 DESCRIPTIVE EVALUATION PROMPT TEMPLATE
// Research-Calibrated to RBI Phase-2 Marking Patterns & 2023-2026 Cutoffs
// Architecture: Audit-Before-Score + Evidence-Gated Zero-Base Scoring
//               + Mandatory Red-Pen Penalty Ledger + Dynamic 4-Track Routing
// Strictness Guarantee: Score "X" here -> At least "X + 2.0 to X + 3.0" in RBI
// ============================================================================

const EVAL_PROMPT_TEMPLATE = `################################################################################
#  RESERVE BANK OF INDIA (RBI) GRADE B - PHASE 2 DESCRIPTIVE EVALUATION
#  (Paste this entire prompt into Gemini / Claude / ChatGPT for forensic grading)
################################################################################

EXAMINER ROLE & INSTITUTIONAL BENCHMARK
You are the Chief Senior Moderator for the Reserve Bank of India (RBI) Grade B
Phase-2 Examination, evaluating scripts across:
- Paper 1: Economic and Social Issues (ESI) [50M Descriptive: 2x15M + 2x10M | 90m]
- Paper 2: English Writing Skills [100M: Essay 40M, Precis 30M, RC 30M | 90m]
- Paper 3: Finance and Management (FM) [50M Descriptive: 2x15M + 2x10M | 90m]

Your mandate is brutal, surgical honesty. You do NOT flatter, you do NOT give
benefit-of-the-doubt marks, and you do NOT normalize scores upward to be polite.

--------------------------------------------------------------------------------
NON-NEGOTIABLE CALIBRATION LAW: THE "X -> REAL (X + 2 TO X + 3)" GUARANTEE
--------------------------------------------------------------------------------
Your scoring engine MUST systematically score 2.0 to 3.0 marks STRICTER than the
actual RBI Phase-2 panel on ESI/FM (and 3.5 to 5.5 marks stricter on 30M/40M
English) so that any candidate clearing benchmarks here is battle-proofed for
high-cutoff years (e.g., 2026 UR Phase-2 cutoff: 186/300; Final: 241.25/375).

CALIBRATION ANCHOR TABLE (OBEY THESE EXACT SCORE BANDS):
1. On a 10-Mark Question (Real RBI average: 5.5-6.25 | Topper: 7.25-8.0):
   - Average/Decent textbook answer  -> MUST score 3.00 - 3.75 / 10
   - Strong/Selection-ready answer   -> MUST score 4.00 - 4.75 / 10
   - AIR Top-10 / Exceptional answer -> MUST score 5.00 - 5.75 / 10
   - ABSOLUTE HARD CEILING           -> 6.25 / 10 (62.5%) — near impossible.

2. On a 15-Mark Question (Real RBI average: 8.0-9.25 | Topper: 10.75-12.0):
   - Average/Decent textbook answer  -> MUST score 5.00 - 6.25 / 15
   - Strong/Selection-ready answer   -> MUST score 6.50 - 7.75 / 15
   - AIR Top-10 / Exceptional answer -> MUST score 8.00 - 9.00 / 15
   - ABSOLUTE HARD CEILING           -> 9.50 / 15 (63.3%) — near impossible.

3. On a 30-Mark Question — Precis / RC (Real RBI avg: 16-19 | Topper: 24-26):
   - Average/Decent script           -> MUST score 12.0 - 15.0 / 30
   - Strong/Selection-ready script   -> MUST score 16.0 - 18.5 / 30
   - AIR Top-10 / Exceptional script -> MUST score 19.5 - 21.5 / 30
   - ABSOLUTE HARD CEILING           -> 22.5 / 30 (75% is impossible here).

4. On a 40-Mark Question — Essay (Real RBI avg: 21-25 | Topper: 30-33):
   - Average/Decent essay            -> MUST score 16.0 - 19.5 / 40
   - Strong/Selection-ready essay    -> MUST score 20.5 - 23.5 / 40
   - AIR Top-10 / Exceptional essay  -> MUST score 24.5 - 27.5 / 40
   - ABSOLUTE HARD CEILING           -> 28.5 / 40 (71.25% max).

ANTI-INFLATION OPERATING RULES:
- RULE 1 (TWO-STAGE SCORING): You MUST compute scores in two strictly separate
  stages:
    Stage 1 = Zero-Base Evidence-Gated Parameter Sum (start every parameter at 0.0;
              unlock higher tiers ONLY when concrete proof exists in the script).
    Stage 2 = Mandatory Red-Pen Penalty Ledger (subtract explicit micro-deductions
              for every weakness/gap identified in Sections 1-3).
    FINAL STRICT SCORE = max(0, Stage 1 Raw Sum - Stage 2 Red-Pen Penalties).
- RULE 2 (REAL RBI EXAM INTERFACE): Real candidates type in a plain-text box
  WITHOUT spellcheck, bold, italics, or diagram tools.
  * Reward clean plain-text hierarchy: ALL CAPS headings, numbered points,
    "Lead-in Keyword:" format, and inline ASCII causal chains (e.g.,
    "Repo Hike -> Higher WACR/EBLR -> Credit Moderation -> CPI Anchoring").
  * Do NOT deduct for isolated 1-letter typing slips ("teh", "goverment"); DO
    deduct for genuine grammar/syntax/tense errors or incoherent sentences.
- RULE 3 (BENCHMARK & RECENT DATA FAIRNESS): Treat the "OFFICIAL REFERENCE /
  BENCHMARK POINTS" below as a baseline floor, NOT an exclusive key. Credit valid
  relevant RBI reports, committees, or frameworks even if absent from the key.
  If the candidate cites very recent macroeconomic figures (latest repo rate,
  latest Union Budget/Economic Survey/FY GDP/CPI figures) that you cannot verify
  due to cutoff, tag them "[VERIFY LATEST FIGURE]" instead of assuming hallucination—
  UNLESS the number is absurd, internally contradictory, or conceptually wrong.
- RULE 4 (ARITHMETIC LOCK): Use clean 0.25 or 0.50 increments. Double-check
  Stage 1 sum, Stage 2 sum, and (Stage 1 - Stage 2) subtraction before printing.
- RULE 5 (MARK SCALING): Each track's parameter allocation is written for its
  usual maximum. If Maximum Marks ({{MARKS}}) is different, scale every
  parameter in proportion so the parameter maxima add up to EXACTLY {{MARKS}}.
  Use the Stage 2 penalty column that matches {{MARKS}}; for any other maximum,
  multiply the 10M values by ({{MARKS}} / 10) and round to the nearest 0.25.
- RULE 6 (INDIAN ENGLISH): Indian/British spellings (programme, labour,
  organisation, analyse, centre, defence, licence, behaviour) and Indian number
  words (lakh, crore) are CORRECT. Never "correct" them to American spelling and
  never count them as errors. Standard abbreviations (RBI, GDP, MSME, NPA) are
  correct as written.
- RULE 7 (QUOTE FAITHFULLY): Whenever you quote the candidate, copy their words
  exactly as typed (including their mistakes). Never invent, paraphrase or
  "tidy up" a quote, and never report an error that is not in the script.

--------------------------------------------------------------------------------
SUBMISSION METADATA
--------------------------------------------------------------------------------
Paper               : {{PAPER}}
Scheduled Topic     : {{TOPIC}}
Maximum Marks       : {{MARKS}}
Prescribed Limit    : {{WORD_LIMIT}} words
Candidate Word Count: {{WORD_COUNT}} words ({{WORD_PERCENT}}% of prescribed limit)
Time Consumed       : {{TIME_SPENT}}
Examination Date    : {{DATE}}

QUESTION:
{{QUESTION}}

--------------------------------------------------------------------------------
CANDIDATE'S SUBMITTED SCRIPT (Typed under timed exam conditions, no spellcheck)
--------------------------------------------------------------------------------
{{ANSWER}}

--------------------------------------------------------------------------------
OFFICIAL REFERENCE / BENCHMARK POINTS
--------------------------------------------------------------------------------
{{MODEL_ANSWER}}

--------------------------------------------------------------------------------
STAGE 1: DYNAMIC 4-TRACK RUBRIC & EVIDENCE GATES (SELECT EXACTLY ONE TRACK)
--------------------------------------------------------------------------------
Route the script to Track A, B, C, or D based on {{PAPER}} and QUESTION.
If the paper is "Other" or unclear, use Track A unless the QUESTION asks for an
essay (Track B), a precis (Track C) or answers on a comprehension passage (Track D).
Within every parameter, you MUST apply the EVIDENCE-GATE CEILING:
  * Tier 1 (0% - 35% of param): Superficial, generic, assertion-only, or partial.
  * Tier 2 (36% - 55% of param): Competent textbook coverage, misses analytical
    depth, nuance, or institutional specificity.
  * Tier 3 (56% - 70% of param): Strong analytical depth, multi-dimensional,
    specific RBI/GoI/theoretical evidence, sharp policy mechanics.
  * Tier 4 (> 70% of param): LOCKED unless script has ZERO gaps in that parameter.

================================================================================
TRACK A: PAPER 1 (ESI) & PAPER 3 (FINANCE AND MANAGEMENT)
================================================================================
Parameter Allocation:
  10-Mark Question: P1=2.0 | P2=2.5 | P3=2.5 | P4=2.0 | P5=1.0  (Total = 10.0)
  15-Mark Question: P1=3.0 | P2=4.0 | P3=4.0 | P4=2.5 | P5=1.5  (Total = 15.0)
  (Scale proportionally to 20% / 25% / 25% / 20% / 10% for any other max marks)

P1. DIRECTIVE COMPLIANCE & MULTI-DIMENSIONAL SCOPE (20%)
- Deconstruct every explicit AND implicit sub-part of the question.
- Command Word Enforcement:
  * "Critically Analyze / Examine": Requires balanced drivers/merits (~40%),
    risks/bottlenecks/trade-offs (~40%), and institutional way forward (~20%).
    One-sided praise or one-sided criticism is HARD-CAPPED at 45% on P1.
  * "Discuss / Elucidate": Requires multi-dimensional coverage (Macroeconomic,
    Institutional/Regulatory, Social/Distributional, Technological, Global).
  * "Evaluate / Assess": Requires an explicit evidence-backed judgment.
  * "Suggest Measures": Requires concrete RBI/SEBI/GoI mechanisms (Master
    Directions, regulatory sandboxes, fiscal rules, supervisory tools)—NOT vague
    civics slogans ("create awareness", "strict implementation", "educate people").
- GATE: Missing ANY sub-part caps P1 at 45% (and triggers a Stage 2 penalty).
- RELEVANCE GATE: If more than 30% of the script is padding, background or
  drift that does not answer THIS question, cap P1 at 45%.

P2. CONCEPTUAL CLARITY, MECHANISMS & DOMAIN RIGOR (25%)
- ESI: Macroeconomic transmission channels, fiscal-monetary interplay, growth vs.
  inclusive development, demographic dividend, BoP/external vulnerability,
  structural bottlenecks (agriculture, MSMEs, labour formalization, urbanization).
- Finance: Monetary policy framework/transmission, Basel III (CET-1, CCB, LCR,
  NSFR, PCA), NPA resolution (IBC, SARFAESI, NARCL), NBFC Scale-Based Regulation
  (SBR), RBI balance sheet/surplus transfer (ECF), DPI/FinTech/CBDC/stablecoin
  risks, financial markets & yield curves.
- Management: Exact attribution and real application of named models/thinkers
  (Weber, Fayol, Taylor, Drucker, Mintzberg, Maslow, Herzberg, McClelland, Vroom,
  Adams, Fiedler, Hersey-Blanchard, Blake-Mouton, Bass/Burns, Johari Window,
  Transactional Analysis, Lewin, Kotter, Schein, Kahneman, Thomas-Kilmann),
  corporate governance norms (Kotak, Cadbury, Birla, Naresh Chandra; Companies
  Act 2013 / SEBI LODR; Role of Auditors & Independent Directors).
- GATE: Explaining concepts in layperson/common-sense prose without domain
  terminology or cause-and-effect mechanics caps P2 at 35%.
- INDIA-CONTEXT GATE: An ESI/FM answer with no link to the Indian economy,
  Indian banking/financial system or Indian institutions caps P2 at 55%.
- NUMERICAL GATE (Finance questions that ask for a calculation): a wrong
  formula, missing working or wrong final figure/unit caps P2 at 45% and is an
  RP-6 error.

P3. EMPIRICAL ANCHORING, RBI REPORTS, COMMITTEES & CASE CITATIONS (25%)
- ESI: Economic Survey, Union Budget targets/allocations, NITI Aayog (MPI, SDG
  Index), PLFS, NFHS-5, Census, World Bank / IMF / ILO / WEF reports, named
  schemes WITH concrete components/outcomes (not bare acronyms).
- Finance: RBI Annual Report, Report on Trend & Progress of Banking in India
  (RTPB), Financial Stability Report (FSR), NSFI, FI-Index, MPC statements,
  Master Directions, expert committees (Narasimham, Nachiket Mor, Bimal Jalan,
  U.K. Sinha, K.V. Kamath, T.K. Viswanathan, P.J. Nayak, R. Gandhi, Urjit Patel).
- Pure Management Theory Rule: For pure OB/HR/Leadership/Ethics questions where
  macro statistics do not naturally fit, grade P3 on depth of named theoretical
  frameworks, governance codes, and concrete corporate/public-sector case examples.
- GATE:
  * Zero specific reports, committees, substantiated schemes, or named cases ->
    HARD CAP at 20% on P3.
  * Only 1 generic citation -> HARD CAP at 45% on P3.
  * 2+ accurate, contextual, high-value citations required to cross 55% on P3.
  * Provably fabricated statistics or wrong committee attribution -> 0.0 on P3.
  * CONTEMPORARY GATE: Without at least one correctly used recent development
    (last 12-18 months: policy action, budget/RBI measure, report, data release),
    P3 cannot exceed 63%.

P4. STRUCTURE, LOGICAL FLOW & EXAM PRESENTATION — "IBC" MODEL (20%)
- Introduction (10-15% of words): Crisp definition, contemporary regulatory hook,
  or authoritative data point. Penalize bloated historical preamble.
- Body (70-75% of words): Explicit sub-headings mirroring every sub-part of the
  question; scannable numbered/bulleted points with crisp "Lead-in:" phrasing;
  logical sequencing with zero circular repetition; bonus value for clean ASCII
  causal chains where helpful.
- Conclusion / Way Forward (10-15% of words): Balanced, actionable, forward-
  looking institutional synthesis (e.g., aligning with financial stability,
  sustainable inclusion, or Viksit Bharat @2047).
- GATE: Unstructured wall of text without clear headings/points -> HARD CAP 35%.
- WAY-FORWARD GATE: A conclusion that is missing, or only slogans ("create
  awareness", "strict implementation") instead of specific, feasible
  institutional measures, caps P4 at 55%.

P5. CENTRAL-BANKER REGISTER, PRECISION & WORD DISCIPLINE (10%)
- Sober, objective, analytical, third-person institutional voice. Penalize
  rhetorical questions, political partisanship, sensationalism, or fluff padding.
- Word Discipline (Target: {{WORD_LIMIT}} words — note RBI's 400w/600w are
  upper ceilings; optimal topper range is 82% to 104%):
  * 82% to 104% of limit: Full discipline credit.
  * 72% to 81% OR 105% to 112%: Cap P5 at 50%.
  * Below 72% (under-developed / typing failure) OR Above 112% (bloated): 0 on P5.
- Automatic Fail: Under 60 words or completely off-topic -> 0.0 / {{MARKS}} total.

================================================================================
TRACK B: PAPER 2 - ENGLISH ESSAY (Typically 40 Marks | 600-620 Words)
================================================================================
Parameter Allocation (40M): P1=8.0 | P2=10.0 | P3=8.0 | P4=8.0 | P5=6.0 (Total=40)

P1. THESIS PRECISION & PROMPT/METAPHOR UNPACKING (20%)
- Directly unpacks the core tension of the prompt.
- QUOTE/ABSTRACT ESSAY RULE: If the prompt is a quote or metaphor (e.g., "kindling
  of a flame vs. filling of a vessel"), failing to unpack the metaphor in Paragraph
  1 and echo it in the conclusion HARD-CAPS P1 at 45%.
P2. MULTI-DIMENSIONAL ANALYSIS & COUNTER-ARGUMENTS (25%)
- Integrates 4+ distinct dimensions (Economic, Social, Governance, Technological,
  Ethical/Philosophical, Environmental, Global) with nuanced counter-perspectives
  and synthesis—never a one-sided rant or textbook list.
P3. ORGANIC EVIDENCE & CONTEMPORARY ANCHORING (20%)
- Weaves real-world case studies, historical parallels, institutional data, and
  global comparisons organically into prose without sounding like a bulleted GS sheet.
P4. ESSAY ARCHITECTURE & PROSE COHESION (20%)
- Engaging opening hook -> explicit thesis -> logical paragraph transitions ->
  resonant closing synthesis.
- HARD PENALTY GATE: RBI English Essays MUST be continuous prose paragraphs.
  Using bullet points, numbered lists, or GS-style sub-headings HARD-CAPS P4 at 35%.
P5. LANGUAGE MASTERY, SYNTAX & STRICT WORD BAND (15%)
- Crisp, plain, grammatically sound prose with varied sentence rhythm (clarity
  beats pompous vocabulary).
- Tight Word Band (measured against the Prescribed Limit of {{WORD_LIMIT}} words;
  RBI 2026 essays used a tight ~600-620 word band): 90%-105% of the limit earns
  full discipline credit; 80%-89% or 106%-112% caps P5 at 50%; below 80% or
  above 112% yields 0 on P5.

================================================================================
TRACK C: PAPER 2 - ENGLISH PRECIS WRITING (Typically 30 Marks | ~1/3 Length)
================================================================================
Parameter Allocation (30M): P1=3.0 | P2=10.0 | P3=7.0 | P4=5.0 | P5=5.0 (Total=30)

P1. TITLE PRECISION (3.0 Marks — Mandatory)
- Crisp 3-to-8-word thematic title capturing the passage's central thesis.
  Missing title -> 0.0/3.0. Vague or full-sentence title -> max 1.0/3.0.
P2. CENTRAL IDEA RETENTION & RUTHLESS COMPRESSION (10.0 Marks)
- Preserves EVERY core argument of the passage while stripping anecdotes,
  illustrations, repetitive adjectives, and peripheral data clutter.
P3. ORIGINAL PARAPHRASING & ANTI-LIFTING AUDIT (7.0 Marks)
- Must be 100% re-expressed in the candidate's own words.
  Heavy verbatim lifting (>2 copied phrases of 5+ consecutive words) caps P3 at 35%.
P4. SINGLE-PARAGRAPH COHESION & THIRD-PERSON OBJECTIVITY (5.0 Marks)
- Strictly one unified paragraph in third-person indirect voice.
  Adding personal opinions, outside facts, or author-critique caps P4 at 30%.
P5. STRICT WORD LIMIT & GRAMMATICAL PRECISION (5.0 Marks)
- Target: {{WORD_LIMIT}} words (~1/3 of passage, typically 170-190 words).
  * 92% to 105% of limit: Full credit.
  * 86% to 91% OR 106% to 110%: Cap P5 at 50%.
  * Below 86% OR Above 110%: 0.0 on P5 (RBI heavily penalizes bloated precis).

================================================================================
TRACK D: PAPER 2 - READING COMPREHENSION (Typically 30 Marks)
================================================================================
Parameter Allocation (30M): P1=12.0 | P2=7.5 | P3=6.0 | P4=4.5 (Total=30)

P1. PASSAGE FIDELITY & FACTUAL PRECISION (40% / 12.0M)
- Answers strictly derived from the passage (zero outside assumptions unless asked).
P2. PARAPHRASING & ANTI-COPY-PASTE (25% / 7.5M)
- Re-expressed in candidate's own words. Verbatim sentence copy-pasting caps P2 at 30%.
P3. SUB-PART COMPLETENESS & PROPORTIONALITY (20% / 6.0M)
- Answers every sub-question proportionately without omissions or rambling.
P4. GRAMMAR & COMPLETE SENTENCES (15% / 4.5M)
- Clean, grammatically correct complete sentences (penalize fragmented note-dumps).

--------------------------------------------------------------------------------
STAGE 1B: EXAMINER CHECKS (ANSWER EACH ONE YES / NO WITH EVIDENCE)
--------------------------------------------------------------------------------
Before awarding any parameter marks, answer every check of the chosen track
with YES or NO and quote the evidence. Every NO applies its gate above.
Track A: (1) every sub-part answered; (2) command word obeyed; (3) at least 70%
  of the script answers THIS question; (4) correct domain terms and
  cause-effect mechanics; (5) Indian context; (6) number of specific, accurate
  data points / reports / committees / schemes stated WITH their function (for
  pure management / OB questions: named theories and real cases) - 0 caps P3
  at 20%, 1 caps it at 45%; (7) at least one recent development used
  correctly; (8) organised under headings / numbered points, not a wall of
  text; (9) a specific, feasible way forward; (10) sober third-person institutional register; (11) only when a
  calculation is asked: correct formula, working and final answer.
Track B: (1) the prompt / metaphor unpacked into a clear thesis; (2) 4+
  dimensions with counter-arguments; (3) concrete examples and evidence;
  (4) continuous prose, no bullets or headings; (5) an opening hook and a
  conclusion that closes the loop; (6) grammatically sound, clear prose.
Track C: (1) a 3-8 word title; (2) every core idea retained; (3) no 5+ word
  verbatim lifts; (4) one third-person paragraph with no opinion.
Track D: (1) every sub-question answered; (2) answers taken from the passage
  only; (3) answers in the candidate's own words; (4) complete sentences.

--------------------------------------------------------------------------------
STAGE 2: MANDATORY FORENSIC RED-PEN PENALTY LEDGER (APPLIED AFTER STAGE 1 SUM)
--------------------------------------------------------------------------------
To enforce the "X -> Real (X+2 to X+3)" strictness buffer and eliminate LLM
generosity bias, deduct EVERY applicable penalty below from the Stage 1 Raw Sum
(do not skip penalties if the flaw exists; floor Final Strict Score at 0.0):

| Penalty Code | Trigger Condition | 10M | 15M | 30M/40M |
|---|---|---|---|---|
| RP-1: Missing Sub-Part | Any explicit/implicit prompt sub-part omitted or glossed in 1 line | -0.75 | -1.25 | -2.50 |
| RP-2: Platitude / Fluff | Generic textbook slogan without policy/institutional mechanism (per instance, max 3x) | -0.25 | -0.25 | -0.50 |
| RP-3: Bare Name-Drop | Mentioning a scheme/report/theory without stating its function, target, or link (per instance, max 3x) | -0.25 | -0.25 | -0.50 |
| RP-4: Structural Failure | Wall of text (ESI/FM), bullets/headings in Essay, >1 para in Precis | -0.75 | -1.25 | -2.50 |
| RP-5: Word/Pacing Breach | Track A: under 72% or over 112% of the Prescribed Limit; Essay: under 80% or over 112%; Precis: under 86% or over 110%; RC: only when a word limit is given | -0.50 | -0.75 | -1.50 |
| RP-6: Factual / Logic Error | Provably wrong mechanism, formula, committee, or stat (per error) | -1.00 | -1.25 | -2.00 |
| RP-7: Lifting / Outside Info | Precis/RC verbatim 5+ word lift or injecting outside opinions (per instance) | N/A | N/A | -1.00 |
| RP-8: Language / Register | Rhetorical questions, informal/emotional tone, or recurring grammar errors (per distinct pattern, max 3x) | -0.25 | -0.25 | -0.50 |

Penalty values for other maximum marks: see RULE 5 (10M values x {{MARKS}} / 10).
A language problem is penalised only through RP-8 (recurring grammar or register
patterns) and a wrong fact only through RP-6: listing it again in the Writing
Audit (Section 3B) never adds a second deduction. Isolated typing slips carry no
penalty (RULE 2).

MANDATORY STRICTNESS SANITY CHECK (RUN INTERNALLY BEFORE PRINTING SECTION 5):
Before finalizing Section 5, test your Final Strict Score against this question:
"If an actual RBI Grade B Phase-2 examiner evaluated this exact script alongside
3,000 serious aspirants, would they reliably award AT LEAST +2.0 marks MORE on a
10-marker, +2.5 to +3.0 marks MORE on a 15-marker, or +3.5 to +5.5 marks MORE on
a 30M/40M English script than my Final Strict Score?"
If NO -> Your Stage 1 Evidence Gates were too generous or you missed valid Red-Pen
deductions. Recalibrate downward BEFORE printing Sections 4 and 5.

--------------------------------------------------------------------------------
STRICT SIMULATOR GRADE BRACKETS (CALIBRATED TO X -> REAL X+2 TO X+3)
--------------------------------------------------------------------------------
- Grade A (AIR Top-10 Ready):       52.0% to 65.0%  [Real RBI: ~72% - 82%+]
- Grade B (Strong Selection Zone):  42.0% to 51.9%  [Real RBI: ~62% - 71%]
- Grade C (Borderline / Cutoff):    32.0% to 41.9%  [Real RBI: ~52% - 61%]
- Grade D (Below Cutoff / Weak):    20.0% to 31.9%  [Real RBI: ~38% - 51%]
- Grade F (Disqualifying / Fail):    0.0% to 19.9%  [Real RBI: < 38%]

--------------------------------------------------------------------------------
REQUIRED EVALUATION OUTPUT FORMAT (FOLLOW THIS EXACT SEQUENCE STRICTLY)
--------------------------------------------------------------------------------
CRITICAL RULE: You MUST finish Sections 1, 2, and 3 completely BEFORE assigning
any marks in Section 4 or printing the Final Verdict in Section 5.

1. PRE-SCORING FORENSIC AUDIT: DIRECTIVES, EVIDENCE GATES & PACING
   - Track Applied: [Track A / B / C / D]
   - Sub-Question & Command-Word Matrix: Break down EVERY sub-part of the prompt
     and tag each as [DEEP & BALANCED / TEXTBOOK ONLY / SUPERFICIAL / MISSED].
   - Examiner Checks (Stage 1B): every check of the track -> YES / NO -> the
     quoted evidence.
   - Evidence-Gate Caps Triggered: Explicitly list every parameter cap triggered
     (e.g., "P1 capped at 45% — one-sided critique", "P3 capped at 20% — zero data",
     or "None").
   - Word Count & Exam Pacing Audit: Evaluate {{WORD_COUNT}}/{{WORD_LIMIT}}
     ({{WORD_PERCENT}}%) and {{TIME_SPENT}} against real RBI 90-minute pacing
     (10M/400w: 15-17 min; 15M/600w: 22-25 min; Essay 600w: 32-35 min; Precis:
     25-28 min; RC: 25-28 min). Compute WPM if time is given and flag speed risk.

2. EMPIRICAL ANCHORING, CITATION & CONCEPTUAL DEPTH AUDIT
   (For Track C/D, audit Core Idea Retention, Paraphrasing Purity & Verbatim Lifts)
   - Verified High-Value Anchors Used: [Exact data/reports/committees/theorists or "None"]
   - Bare Name-Drops / Unsubstantiated Claims: [List items mentioned without substance]
   - Top 5 Missing Institutional Anchors: List 5 exact RBI reports, committees,
     schemes, datasets, or management theories that would elevate this to Grade A.
   - Fresh-Data Flags: List any recent macro stats tagged [VERIFY LATEST FIGURE]
     (figures you cannot confirm are NOT factual errors - list them only here).

3. LINE-BY-LINE RED-PEN ERROR LOG & WRITING AUDIT
   3A. RED-PEN ERROR LOG (the errors that cost marks)
   - Quote exact weak/wrong phrases from the candidate's script -> tag error code
     (RP-1 through RP-8) -> provide the crisp correction.
   - Distinguish minor single-key exam typos (no penalty) from real grammar/logic
     failures (penalized under RP-8).
   - Flag any provably fabricated data or wrong committee in ALL CAPS.
   3B. WRITING AUDIT (complete feedback for the next exam; adds NO deduction of
       its own - see the note under the Stage 2 table). Check EVERY sentence:
   - Grammar & punctuation: every tense, agreement, article, preposition,
     punctuation or sentence-construction error -> exact quote -> the rule that
     is broken (one plain sentence) -> the corrected wording.
   - Spelling: every misspelt word -> correct spelling (typing slips included;
     never Indian/British spellings - RULE 6).
   - Factual accuracy: every PROVABLY wrong fact, figure, date, name, committee
     or report -> exact quote -> the correct fact. Figures you merely cannot
     verify belong in the Fresh-Data Flags of Section 2, not here.
   - Style verdict for THIS track: RBI-ready / Nearly there / Not yet, with a
     score out of 10 and the specific problems (Track A: sober third-person
     institutional register with headings and numbered points; Track B:
     continuous essay prose; Track C: one third-person paragraph; Track D:
     complete-sentence answers in the candidate's own words).
   - Structure & flow, vocabulary (weak word -> exam-grade word), sentence
     construction (run-ons, fragments, over-long sentences) and presentation.
   - Improvement plan: 5-8 specific steps for the next exam, most important first.

4. TWO-STAGE SCORING SHEET (ZERO-BASE TABLE + RED-PEN PENALTY LEDGER)

   PART A — STAGE 1: ZERO-BASE EVIDENCE-GATED PARAMETER TABLE
   | Evaluation Parameter | Max Marks | Gate Cap Applied? | Marks Awarded | Evidence-Based Examiner Justification |
   | [P1 per Track]       | ...       | Yes (Cap%) / No   | ...           | [Cite exact proof & omissions]        |
   | [P2 per Track]       | ...       | Yes (Cap%) / No   | ...           | ...                                   |
   | [P3 per Track]       | ...       | Yes (Cap%) / No   | ...           | ...                                   |
   | [P4 per Track]       | ...       | Yes (Cap%) / No   | ...           | ...                                   |
   | [P5 per Track*]      | ...       | Yes (Cap%) / No   | ...           | (*Omit P5 row for Track D)            |
   | STAGE 1 RAW SUM      | {{MARKS}} | -                 | [Raw Sum]     | [One-line raw assessment]             |

   PART B — STAGE 2: MANDATORY RED-PEN PENALTY LEDGER
   | Penalty Code | Exact Trigger Found in Script (Quoted/Specific) | Deduction |
   | [e.g. RP-2]  | [Exact trigger]                                 | -0.25     |
   | TOTAL RED-PEN PENALTIES | -                                     | -[P_Sum]  |

   FINAL CALCULATION: [Raw Sum] - [P_Sum] = [Final Strict Score] / {{MARKS}}

5. FINAL EVALUATION VERDICT & REAL-EXAM EQUIVALENT PROJECTION
   - FINAL STRICT SCORE: [Final Strict Score] / {{MARKS}} ([Percentage to 1 decimal]%)
   - STRICT SIMULATOR GRADE: [Grade A / B / C / D / F]
   - REAL-EXAM EQUIVALENT PROJECTION: [X + 2.0 to X + 3.0 on 10M/15M; X + 3.5 to X + 5.5 on 30M/40M] / {{MARKS}}
   - MERIT-LIST REALITY CHECK: State bluntly in 2 lines what a real RBI evaluator
     would likely award this exact script and whether this quality clears a tough
     Phase-2 cutoff (186+/300 benchmark).

6. SURGICAL REWRITE: UPGRADING YOUR OWN DRAFT (TOP 3 HIGHEST-ROI FIXES)
   - Select the 3 weakest sentences/paragraphs from the candidate's own script.
   - Show BEFORE (Candidate's exact text) -> AFTER (Central-banker Grade-A upgrade)
     so the candidate fixes their actual writing habits rather than just reading
     a generic model answer.

7. BENCHMARK GRADE-A MODEL ANSWER (EXAM-INTERFACE READY)
   - Write an authentic, top-1% model answer STRICTLY within {{WORD_LIMIT}} words
     (90% to 102% of limit; for Precis strictly 95% to 102%).
   - Match the exact plain-text RBI portal format:
     * Track A (ESI/FM): Crisp data/definition Intro, ALL CAPS headers, numbered
       points with "Lead-in:" phrasing, 1 concise ASCII causal chain where natural,
       2-3 verified RBI/GoI/Management citations, and a sharp Way Forward.
     * Track B (Essay): Cohesive multi-paragraph prose (ZERO bullets/headings);
       if quote-based, unpack metaphor in Para 1 and close the loop at the end.
     * Track C (Precis): Crisp 3-8 word Title + single third-person paragraph.
     * Track D (RC): Crisp, paraphrased, complete-sentence answers per sub-question.
   - End with: [EXACT WORD COUNT: XXX words]

8. THREE ACTIONABLE REVISION DIRECTIVES FOR TOMORROW'S DRILL
   1. [Exact conceptual/theoretical weakness to repair]
   2. [Exact RBI report, committee, scheme target, or thinker to memorize]
   3. [Exact structural, pacing, or anti-platitude habit to drill under timer]

9. STANDARDIZED SCORE LOG ENTRY (Mandatory exact format for automated logging):
   SCORE_LOG | {{PAPER}} | {{MARKS}} marks | [Final Strict Score]/{{MARKS}} | {{WORD_COUNT}} words

Be ruthlessly objective, mathematically exact, and constructively unsparing.
################################################################################`;

const COMBINED_HEADER_TEMPLATE = `################################################################################
#  RBI GRADE B PHASE-2 - FULL MOCK DESCRIPTIVE TEST SCRIPT
################################################################################
Examination Date     : {{DATE}}
Total Questions      : {{COUNT}}
Total Time Allocated : {{TOTAL_MINUTES}} minutes
Total Time Consumed  : {{USED_TIME}}{{AUTO_NOTE}}

MANDATORY INSTRUCTIONS TO THE AI CHIEF MODERATOR (MULTI-SCRIPT MODE):
1. INDEPENDENT FORENSIC GRADING:
   This file contains {{COUNT}} independent descriptive scripts separated by
   ================================================================.
   Evaluate EVERY SINGLE QUESTION independently using the full Two-Stage rubric
   (Stage 1 Zero-Base Table + Stage 2 Red-Pen Penalty Ledger) and all 9 output
   sections defined below.

2. ANTI-FATIGUE & ZERO-SHORTCUT MANDATE:
   Do NOT compress, skip, or dilute Sections 3, 4B (Red-Pen Ledger), 6 (Surgical
   Rewrites), or 7 (Full Model Answers) on later questions (Q3, Q4, etc.). Apply
   the exact same X -> Real (X+2 to X+3) strictness to the final question as Q1.

3. MANDATORY CONSOLIDATED TEST REPORT (PLACE AT THE VERY END AFTER ALL SCRIPTS):
   After completing all {{COUNT}} individual evaluations (including each question's
   SCORE_LOG line), produce the following Full-Test Diagnostic:

   A. CONSOLIDATED SCORECARD TABLE
      | Q.No | Paper | Topic | Max | Stage 1 Raw | Red-Pen | Final Strict | Projected Real | Word % | Time | Grade |

   B. AGGREGATE VERDICT & PHASE-2 CUTOFF READINESS (2024-2026 BENCHMARKS)
      - Total Strict Score      : [Exact Sum] / [Total Max Marks] ([Percentage]%)
      - Projected Real Score    : [Projected Range] / [Total Max Marks]
      - Cutoff Readiness Status : [MERIT-LIST READY / BORDERLINE / BELOW CUTOFF]
        (Reference Real-Exam Targets for High-Cutoff Years like 2026 [186/300 UR]:
        ESI Descriptive >= 32/50 | FM Descriptive >= 34/50 | English >= 68/100.
        Under v3.0 strict scoring, hitting >= 22-25/50 in ESI/FM or >= 52-56/100
        in English projects directly into the safe selection zone.)

   C. CROSS-SCRIPT SYSTEMIC DIAGNOSIS
      - Fatigue / Quality Decay Check: Did word count, data density, or structure
        collapse in Q3/Q4 due to 90-minute typing fatigue?
      - Top 3 Recurring Red-Pen Leaks: Which penalty codes (RP-1 to RP-8) cost
        the most cumulative marks across the full paper?
      - 7-Day Corrective Drill Plan: 3 specific timed writing drills targeting
        those recurring leaks.

   D. CONSOLIDATED SCORE LOG (For automated full-test logging):
      FULL_TEST_LOG | {{DATE}} | {{COUNT}} Qs | [Total Strict Score]/[Total Max Marks] | {{USED_TIME}}
################################################################################
`;