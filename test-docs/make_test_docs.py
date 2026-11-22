"""Build the import test documents (DOCX) and their expected results (JSON).

Run:  python3 test-docs/make_test_docs.py      (needs python-docx)
Then: soffice --headless --convert-to pdf --outdir test-docs test-docs/*.docx

Every objective file uses a different layout, so the importer is tested on
numbering styles, option styles, answer-key formats, shared passages / tables,
multi-answer questions and deliberate defects (wrong key, missing key,
skipped question number, key without a question).
"""
import json, os
from docx import Document
from docx.shared import Pt

OUT = os.path.dirname(os.path.abspath(__file__))


def doc_new(title, subtitle=None):
    d = Document()
    d.styles["Normal"].font.size = Pt(11)
    d.add_heading(title, 0)
    if subtitle:
        d.add_paragraph(subtitle)
    return d


def table(d, rows):
    t = d.add_table(rows=len(rows), cols=len(rows[0]))
    t.style = "Table Grid"
    for i, r in enumerate(rows):
        for j, c in enumerate(r):
            t.cell(i, j).text = str(c)
    return t


def save(d, name, expected):
    d.save(os.path.join(OUT, name + ".docx"))
    with open(os.path.join(OUT, "expected", name + ".json"), "w") as f:
        json.dump(expected, f, indent=1, ensure_ascii=False)


os.makedirs(os.path.join(OUT, "expected"), exist_ok=True)

# ---------------------------------------------------------------------------
# obj-01: "Q.1)" numbering, topic headings, (a) options one per line,
# statements, assertion-reason, match list, shared data table, multi-correct,
# answer key = Quick Check grid + "Q | Answer | Why" table
# ---------------------------------------------------------------------------
Q1 = [
    ("1. Monetary Policy Framework", [
        (["Under the amended RBI Act, 1934, the inflation target for India is set by:"],
         ["the Reserve Bank of India", "the Central Government in consultation with the RBI", "the Monetary Policy Committee", "the Finance Commission", "NITI Aayog"], "b",
         "Section 45ZA of the RBI Act lets the Central Government, in consultation with the RBI, set the inflation target once every five years."),
        (["Consider the following statements about the Monetary Policy Committee (MPC):", "1.\tIt has six members.", "2.\tThe RBI Governor has a casting vote in case of a tie.", "3.\tThree members are appointed by the Central Government.", "Which of the statements given above is/are correct?"],
         ["1 only", "1 and 2 only", "2 and 3 only", "1, 2 and 3", "None of the above"], "d",
         "The MPC has six members: three from the RBI and three external members appointed by the Central Government. The Governor has a casting vote."),
        (["The tolerance band around India's 4% CPI inflation target is:"],
         ["plus or minus 1 percentage point", "plus or minus 2 percentage points", "plus or minus 3 percentage points", "plus or minus 1.5 percentage points", "there is no tolerance band"], "b",
         "The target is 4% CPI inflation with an upper limit of 6% and a lower limit of 2%."),
        (["ASSERTION Assertion (A): A rise in the repo rate tends to reduce aggregate demand.", "Reason (R): A higher policy rate raises the cost of borrowing for banks, which they pass on to borrowers."],
         ["Both A and R are true and R is the correct explanation of A", "Both A and R are true but R is not the correct explanation of A", "A is true but R is false", "A is false but R is true", "Both A and R are false"], "a",
         "Costlier credit reduces consumption and investment spending, which is exactly why demand falls."),
    ]),
    ("2. Instruments of Monetary Policy", [
        (["Which of the following is a quantitative (general) instrument of monetary policy?"],
         ["Moral suasion", "Margin requirements", "Cash Reserve Ratio", "Selective credit control", "Direct action"], "c",
         "CRR affects the overall volume of credit. The other options are qualitative or selective tools."),
        (["Match List I with List II:", "List I\tList II", "A. Repo rate\t1. Rate at which RBI absorbs liquidity without collateral", "B. SDF rate\t2. Rate at which RBI lends to banks against government securities", "C. MSF rate\t3. Rate for overnight emergency borrowing above the repo rate", "D. Bank rate\t4. Rate for long-term lending and penalties, aligned with the MSF rate"],
         ["A-2 B-1 C-3 D-4", "A-1 B-2 C-3 D-4", "A-2 B-3 C-1 D-4", "A-4 B-1 C-3 D-2", "A-3 B-1 C-2 D-4"], "a",
         "Repo lends against securities, SDF absorbs without collateral, MSF is the emergency window and the Bank Rate is aligned with MSF."),
        (["MULTI-CORRECT Which of the following absorb liquidity from the banking system?"],
         ["An increase in the Cash Reserve Ratio", "An open market sale of government securities by the RBI", "A purchase of foreign currency by the RBI", "A variable rate reverse repo auction", "A long-term repo operation"], "abd",
         "Raising CRR, selling securities and reverse repo auctions drain liquidity. Buying foreign currency and LTROs inject it."),
    ]),
    ("3. Policy Rates and Real Interest Rates", [
        (["DATA By how many basis points did the repo rate fall from Year 1 to Year 3?"],
         ["50", "100", "150", "75", "125"], "b",
         "6.50% to 5.50% is a fall of 1 percentage point, which is 100 basis points."),
        (["DATA In which year was the real repo rate (repo rate minus CPI inflation) the highest?"],
         ["Year 1", "Year 2", "Year 3", "It was equal in all three years", "It cannot be determined"], "c",
         "Real rates: Year 1 1.1%, Year 2 1.4%, Year 3 1.7%."),
    ]),
    ("4. Inflation", [
        (["Which index does the RBI use as the nominal anchor for inflation targeting?"],
         ["Wholesale Price Index", "CPI for Industrial Workers", "CPI (Combined)", "GDP deflator", "CPI for Agricultural Labourers"], "c",
         "The target is defined on headline CPI (Combined) inflation published by the NSO."),
        (["Cost-push inflation is most likely to be caused by:"],
         ["an increase in money supply", "a sharp rise in crude oil prices", "higher government spending", "a rise in exports", "a cut in income tax"], "b",
         "A supply-side cost shock raises production costs. The other options raise demand."),
        (["NUMERICAL If the nominal interest rate is 7% and expected inflation is 4.5%, the approximate real interest rate is:"],
         ["11.5%", "2.5%", "1.5%", "3.5%", "4.5%"], "b",
         "Real rate = nominal rate - expected inflation = 7 - 4.5 = 2.5% (Fisher approximation)."),
    ]),
]
d = doc_new("Monetary Policy Question Bank", "RBI Grade B | ESI | Practice MCQs")
d.add_heading("Part A  Topic-wise MCQs", 1)
exp = []
n = 0
for topic, qs in Q1:
    d.add_heading(topic, 2)
    for stem, opts, ans, why in qs:
        n += 1
        if n == 8:
            d.add_paragraph("Use the table below for Q.8 and Q.9.")
            table(d, [["Year", "Repo rate at year end (%)", "CPI inflation (%)"], ["Year 1", "6.50", "5.4"], ["Year 2", "6.00", "4.6"], ["Year 3", "5.50", "3.8"]])
        d.add_paragraph(f"Q.{n})\t{stem[0]}")
        for s in stem[1:]:
            d.add_paragraph(s)
        for l, o in zip("abcde", opts):
            d.add_paragraph(f"({l})\t{o}")
        exp.append({"number": n, "stem": stem[0].replace("\t", " "), "options": opts, "answer": ans, "explanation": why, "topic": topic.split(". ", 1)[1]})
d.add_heading("Answer Key", 1)
d.add_heading("Quick Check", 2)
cells = [f"{e['number']} {e['answer']}" for e in exp]
table(d, [cells[:6], cells[6:]])
d.add_heading("Answers with Reasons", 2)
table(d, [["Q", "Answer", "Why"]] + [[str(e["number"]), ", ".join(e["answer"]), e["explanation"]] for e in exp])
save(d, "obj-01-monetary-policy", {"kind": "mcq", "questions": exp})

# ---------------------------------------------------------------------------
# obj-02: "1." numbering, options inline "A) ... E)", "Answer: (C)" and a
# multi-paragraph "Explanation:" under each question, a shared Directions passage
# ---------------------------------------------------------------------------
Q2 = [
    ("Which of the following is NOT a function of a commercial bank?", ["Accepting deposits", "Granting loans", "Issuing currency notes", "Agency services", "Remittance of funds"], "c",
     ["Only the Reserve Bank of India issues currency notes (one-rupee notes and coins are issued by the Government).", "Commercial banks accept deposits, lend and provide agency and remittance services."]),
    ("Statutory Liquidity Ratio (SLR) is maintained by banks in the form of:", ["cash balances with the RBI only", "liquid assets such as cash, gold and approved securities", "fixed deposits with other banks", "loans to the priority sector", "foreign currency deposits"], "b",
     ["SLR assets are cash, gold and unencumbered approved securities, mainly government securities."]),
    ("A loan account becomes a Non-Performing Asset when interest or principal remains overdue for more than:", ["30 days", "60 days", "90 days", "120 days", "180 days"], "c",
     ["Under the RBI's prudential norms an asset becomes non-performing after 90 days of overdue payment."]),
    ("Which of the following is a payments bank NOT allowed to do?", ["Accept demand deposits", "Issue debit cards", "Lend to its customers", "Offer internet banking", "Distribute mutual fund products"], "c",
     ["Payments banks cannot undertake lending activities."]),
    ("What amount must the bank keep as its CRR balance with the RBI?", ["Rs 40 crore", "Rs 400 crore", "Rs 1,800 crore", "Rs 4,000 crore", "Rs 180 crore"], "b",
     ["CRR = 4% of Rs 10,000 crore = Rs 400 crore."]),
    ("What is the bank's minimum SLR holding?", ["Rs 180 crore", "Rs 1,800 crore", "Rs 400 crore", "Rs 2,200 crore", "Rs 18,000 crore"], "b",
     ["SLR = 18% of Rs 10,000 crore = Rs 1,800 crore."]),
    ("Together, CRR and SLR pre-empt what share of the bank's NDTL?", ["14%", "18%", "22%", "26%", "4%"], "c",
     ["4% + 18% = 22% of NDTL."]),
    ("The priority sector lending target for domestic scheduled commercial banks is what percentage of ANBC or CEOBE, whichever is higher?", ["18%", "32%", "40%", "75%", "10%"], "c",
     ["Domestic scheduled commercial banks must lend 40% of ANBC or CEOBE, whichever is higher, to the priority sector."]),
]
d = doc_new("Banking Awareness Practice Set", "Phase-1 | General Awareness")
exp = []
for i, (stem, opts, ans, expl) in enumerate(Q2, 1):
    if i == 5:
        d.add_paragraph("Directions (Q.5 to Q.7): Read the information below and answer the questions that follow.")
        d.add_paragraph("A bank has net demand and time liabilities (NDTL) of Rs 10,000 crore. The CRR is 4% and the SLR is 18%. The bank has lent Rs 6,500 crore.")
    d.add_paragraph(f"{i}. {stem}")
    d.add_paragraph("  ".join(f"{l.upper()}) {o}" for l, o in zip("abcde", opts)))
    d.add_paragraph(f"Answer: ({ans.upper()})")
    d.add_paragraph("Explanation: " + expl[0])
    for e in expl[1:]:
        d.add_paragraph(e)
    exp.append({"number": i, "stem": stem, "options": opts, "answer": ans, "explanation": "\n".join(expl), "shared": "Directions" if 5 <= i <= 7 else ""})
save(d, "obj-02-banking-awareness", {"kind": "mcq", "questions": exp})

# ---------------------------------------------------------------------------
# obj-03: two sets with numbering restarting at 1, "[a]" options on one line,
# answers as "1. b  2. d ..." lines under "Set A" / "Set B"
# ---------------------------------------------------------------------------
SET_A = [
    ("Choose the word most similar in meaning to ABUNDANT.", ["Scarce", "Plentiful", "Rare", "Meagre", "Sparse"], "b"),
    ("Choose the word most opposite in meaning to TRANSPARENT.", ["Clear", "Lucid", "Evident", "Opaque", "Visible"], "d"),
    ("Fill in the blank: The committee ______ its report to the Governor yesterday.", ["submitted", "submits", "has submit", "submitting", "will submit"], "a"),
    ("Choose the correctly spelt word.", ["Accomodate", "Acommodate", "Accommodate", "Acomodate", "Accommodatte"], "c"),
    ("Choose the word most similar in meaning to PRUDENT.", ["Reckless", "Hasty", "Careless", "Rash", "Judicious"], "e"),
]
SET_B = [
    ("Find the part of the sentence that contains an error.", ["Neither of the two banks", "have reported", "a loss in", "the last quarter.", "No error"], "b"),
    ("Find the part of the sentence that contains an error.", ["The RBI, along with", "the government,", "are working", "to control inflation.", "No error"], "c"),
    ("Find the part of the sentence that contains an error.", ["He is one of those officers", "who has always", "supported the", "new policy.", "No error"], "b"),
    ("Find the part of the sentence that contains an error.", ["The data collected", "by the survey team", "were analysed", "carefully.", "No error"], "e"),
    ("Find the part of the sentence that contains an error.", ["Each of the candidates", "were given", "a separate", "answer sheet.", "No error"], "b"),
]
d = doc_new("English Language Practice: Vocabulary and Error Spotting")
exp = []
for si, (name, qs) in enumerate([("Set A: Vocabulary", SET_A), ("Set B: Error Spotting", SET_B)]):
    d.add_heading(name, 1)
    for i, (stem, opts, ans) in enumerate(qs, 1):
        d.add_paragraph(f"{i}. {stem}")
        d.add_paragraph("   ".join(f"[{l}] {o}" for l, o in zip("abcde", opts)))
        exp.append({"number": i, "section": si, "stem": stem, "options": opts, "answer": ans})
d.add_heading("Answers", 1)
d.add_paragraph("Set A")
d.add_paragraph("  ".join(f"{i}. {q[2]}" for i, q in enumerate(SET_A, 1)))
d.add_paragraph("Set B")
d.add_paragraph("  ".join(f"{i}. {q[2]}" for i, q in enumerate(SET_B, 1)))
save(d, "obj-03-english-sets", {"kind": "mcq", "questions": exp})

# ---------------------------------------------------------------------------
# obj-04: "Question 1:" numbering, "a." options one per line, a DI table
# shared by Questions 1 to 4, and DELIBERATE DEFECTS: Q6 has a wrong key,
# Q7 is missing from the file, Q9 has no key, the key lists a Q11 that does not exist
# ---------------------------------------------------------------------------
Q4 = [
    (1, "What is the credit-deposit ratio of Bank R?", ["75%", "80%", "85%", "90%", "70%"], "c"),
    (2, "What are the total advances of the four banks (Rs crore)?", ["3,830", "3,930", "4,030", "3,980", "3,880"], "b"),
    (3, "Which bank has the lowest credit-deposit ratio?", ["Bank P", "Bank Q", "Bank R", "Bank S", "Banks P and Q equally"], "d"),
    (4, "By what percentage do the deposits of Bank S exceed those of Bank Q?", ["25%", "30%", "33.33%", "50%", "20%"], "c"),
    (5, "What is the compound interest on Rs 12,000 at 10% per annum for 2 years, compounded annually?", ["Rs 2,400", "Rs 2,520", "Rs 2,420", "Rs 2,500", "Rs 2,640"], "b"),
    (6, "What is 15% of 240?", ["24", "30", "32", "36", "40"], "d"),
    (8, "A train 150 m long passes a pole in 10 seconds. What is its speed in km/h?", ["45", "50", "54", "60", "72"], "c"),
    (9, "The average of 5 numbers is 18. When one number is excluded, the average of the rest is 16. What is the excluded number?", ["20", "22", "24", "26", "28"], "d"),
    (10, "If A : B = 3 : 5 and B : C = 2 : 3, then A : B : C is:", ["3 : 5 : 6", "6 : 10 : 15", "6 : 10 : 9", "3 : 10 : 15", "2 : 5 : 3"], "b"),
]
KEY4 = {1: "c", 2: "b", 3: "d", 4: "c", 5: "b", 6: "b", 8: "c", 10: "b", 11: "a"}   # 6 wrong on purpose, 9 missing, 11 orphan
d = doc_new("Quantitative Aptitude: Data Interpretation and Arithmetic", "Practice Test 4")
d.add_paragraph("Study the table below and answer Questions 1 to 4.")
table(d, [["Bank", "Deposits (Rs crore)", "Advances (Rs crore)"], ["Bank P", "1,200", "900"], ["Bank Q", "1,500", "1,050"], ["Bank R", "800", "680"], ["Bank S", "2,000", "1,300"]])
exp = []
for num, stem, opts, true_ans in Q4:
    d.add_paragraph(f"Question {num}: {stem}")
    for l, o in zip("abcde", opts):
        d.add_paragraph(f"{l}. {o}")
    exp.append({"number": num, "stem": stem, "options": opts, "answer": KEY4.get(num, ""), "true_answer": true_ans,
                "defect": {6: "wrong-key", 9: "no-key"}.get(num, "")})
d.add_heading("Answer Key", 1)
table(d, [["Q.No.", "Answer"]] + [[str(k), v] for k, v in KEY4.items()])
save(d, "obj-04-quant-di", {"kind": "mcq", "questions": exp, "missingNumbers": [7], "orphanKeys": [11]})

# ---------------------------------------------------------------------------
# obj-05: "Q1." numbering, "(A)" upper-case options, syllogism with I. / II.,
# answer key as a range table "1 to 8 | d | d | ..."
# ---------------------------------------------------------------------------
Q5 = [
    (["Find the odd one out."], ["27", "64", "125", "144", "216"], "d"),
    (["Statements: All banks are institutions. Some institutions are regulators.", "Conclusions:", "I. Some banks are regulators.", "II. All institutions are banks."],
     ["Only conclusion I follows", "Only conclusion II follows", "Either I or II follows", "Neither I nor II follows", "Both I and II follow"], "d"),
    (["In a certain code LOAN is written as MPBO. How is DEBT written in that code?"], ["EFCU", "EFDU", "DFCU", "EGCU", "FECU"], "a"),
    (["Pointing to a man, Riya says, \"He is the son of my mother's only brother.\" How is the man related to Riya?"], ["Brother", "Nephew", "Cousin", "Uncle", "Son"], "c"),
    (["What comes next in the series: 3, 6, 11, 18, 27, ?"], ["36", "38", "40", "37", "39"], "b"),
    (["In a row of 40 students, Arun is 12th from the left end. What is his position from the right end?"], ["28th", "29th", "30th", "27th", "31st"], "b"),
    (["Which number comes next: 2, 6, 12, 20, 30, ?"], ["40", "42", "44", "36", "48"], "b"),
    (["A is taller than B. C is shorter than B. D is taller than A. Who is the shortest?"], ["A", "B", "C", "D", "Cannot be determined"], "c"),
]
d = doc_new("Reasoning Ability Practice")
exp = []
for i, (stem, opts, ans) in enumerate(Q5, 1):
    d.add_paragraph(f"Q{i}. {stem[0]}")
    for s in stem[1:]:
        d.add_paragraph(s)
    for l, o in zip("ABCDE", opts):
        d.add_paragraph(f"({l}) {o}")
    exp.append({"number": i, "stem": stem[0], "options": opts, "answer": ans})
d.add_heading("Answer Key", 1)
table(d, [["Questions"] + [str(i) for i in range(1, 9)], ["1 to 8"] + [q[2] for q in Q5]])
save(d, "obj-05-reasoning", {"kind": "mcq", "questions": exp})

# ---------------------------------------------------------------------------
# obj-06: EDGE CASES - options on the question line, "Answer: Option B",
# "Note:" lines inside a question and an explanation, explanation lines that
# start with "(a)" / "(e)", "One or more options may be correct", and a real
# 4-option question in a 5-option file (flagged until the AI confirms it)
# ---------------------------------------------------------------------------
d = doc_new("Banking Edge Cases Practice")
exp = []
d.add_paragraph("1. Which of the following is the central bank of India? (a) SBI (b) RBI (c) NABARD (d) SIDBI (e) EXIM Bank")
d.add_paragraph("Answer: Option B")
d.add_paragraph("Explanation: The Reserve Bank of India is the central bank of the country.")
d.add_paragraph("Note: It started operations on 1 April 1935.")
exp.append({"number": 1, "stem": "Which of the following is the central bank of India?", "options": ["SBI", "RBI", "NABARD", "SIDBI", "EXIM Bank"], "answer": "b",
            "explanation": "The Reserve Bank of India is the central bank of the country.\nNote: It started operations on 1 April 1935."})
d.add_paragraph("2. Consider the following statements:")
d.add_paragraph("1. The repo rate is the rate at which the RBI lends to banks.")
d.add_paragraph("2. The Standing Deposit Facility absorbs liquidity.")
d.add_paragraph("Which of the statements given above is/are correct?")
for l, o in zip("abcd", ["1 only", "2 only", "Both 1 and 2", "Neither 1 nor 2"]):
    d.add_paragraph(f"({l}) {o}")
d.add_paragraph("(e) None of the above")
d.add_paragraph("Answer: (c)")
d.add_paragraph("Explanation: Both statements are correct.")
d.add_paragraph("(a) is wrong because statement 2 is also correct.")
d.add_paragraph("(e) is wrong because one option above is correct.")
exp.append({"number": 2, "stem": "Consider the following statements:", "options": ["1 only", "2 only", "Both 1 and 2", "Neither 1 nor 2", "None of the above"], "answer": "c",
            "explanation": "Both statements are correct.\n(a) is wrong because statement 2 is also correct.\n(e) is wrong because one option above is correct."})
d.add_paragraph("3. Which of the following are money market instruments? One or more options may be correct.")
for l, o in zip("abcde", ["Treasury bills", "Commercial paper", "Equity shares", "Certificates of deposit", "Debentures"]):
    d.add_paragraph(f"({l}) {o}")
d.add_paragraph("Answer: (a), (b), (d)")
exp.append({"number": 3, "stem": "Which of the following are money market instruments? One or more options may be correct.", "options": ["Treasury bills", "Commercial paper", "Equity shares", "Certificates of deposit", "Debentures"], "answer": "abd", "multi": True})
d.add_paragraph("4. Under the RBI Act, the Monetary Policy Committee must meet at least how many times a year?")
for l, o in zip("abcd", ["2", "4", "6", "12"]):
    d.add_paragraph(f"({l}) {o}")
d.add_paragraph("Answer: (b)")
exp.append({"number": 4, "stem": "Under the RBI Act, the Monetary Policy Committee must meet at least how many times a year?", "options": ["2", "4", "6", "12"], "answer": "b", "defect": "fewer-options"})
d.add_paragraph("5. How many members form the quorum for a meeting of the Monetary Policy Committee?")
d.add_paragraph("Note: Answer on the basis of the RBI Act, 1934.")
for l, o in zip("abcde", ["2", "3", "4", "5", "6"]):
    d.add_paragraph(f"({l}) {o}")
d.add_paragraph("Answer: (c)")
exp.append({"number": 5, "stem": "How many members form the quorum for a meeting of the Monetary Policy Committee?\nNote: Answer on the basis of the RBI Act, 1934.", "options": ["2", "3", "4", "5", "6"], "answer": "c"})
d.add_paragraph("6. In which year was the Reserve Bank of India nationalised?")
for l, o in zip("abcde", ["1935", "1947", "1949", "1969", "1991"]):
    d.add_paragraph(f"({l}) {o}")
d.add_paragraph("Answer: (c)")
exp.append({"number": 6, "stem": "In which year was the Reserve Bank of India nationalised?", "options": ["1935", "1947", "1949", "1969", "1991"], "answer": "c"})
save(d, "obj-06-edge-cases", {"kind": "mcq", "questions": exp})

# ---------------------------------------------------------------------------
# obj-07: "Q1." numbering, "a)" options two per line, answer table with an
# extra column ("Q.No. | Answer | Marks | Explanation")
# ---------------------------------------------------------------------------
Q7 = [
    ("Which reserve must banks keep as cash balances with the RBI?", ["SLR", "CRR", "LCR", "NSFR", "LTV"], "b", "CRR is kept as cash balances with the RBI; SLR is kept in liquid assets by the bank itself."),
    ("Which Basel III ratio measures liquid assets against 30-day net cash outflows?", ["NSFR", "Leverage ratio", "LCR", "CET1", "CRAR"], "c", "The Liquidity Coverage Ratio compares high-quality liquid assets with net cash outflows over 30 days."),
    ("Which body regulates the capital markets in India?", ["RBI", "IRDAI", "PFRDA", "SEBI", "NABARD"], "d", "SEBI regulates the securities and capital markets."),
]
d = doc_new("Financial System Practice MCQs")
exp = []
for i, (stem, opts, ans, why) in enumerate(Q7, 1):
    d.add_paragraph(f"Q{i}. {stem}")
    d.add_paragraph(f"a) {opts[0]}    b) {opts[1]}")
    d.add_paragraph(f"c) {opts[2]}    d) {opts[3]}    e) {opts[4]}")
    exp.append({"number": i, "stem": stem, "options": opts, "answer": ans, "explanation": why})
d.add_heading("Answer Key", 1)
table(d, [["Q.No.", "Answer", "Marks", "Explanation"]] + [[str(i), q[2], "1", q[3]] for i, q in enumerate(Q7, 1)])
save(d, "obj-07-key-table-extra-column", {"kind": "mcq", "questions": exp})

# ---------------------------------------------------------------------------
# Subjective files
# ---------------------------------------------------------------------------
def bullets(d, items):
    for it in items:
        d.add_paragraph(it, style="List Bullet")


ESI = [
    ("Inflation Targeting", 10, 400,
     "Critically examine the flexible inflation targeting framework adopted by India in 2016. Has it delivered price stability?",
     ["India adopted flexible inflation targeting (FIT) in 2016 by amending the RBI Act, 1934. The Central Government sets a 4% CPI target with a band of 2-6%, and a six-member Monetary Policy Committee (MPC) sets the repo rate to meet it.",
      ("Achievements", ["Average CPI inflation fell from about 9.5% (2009-14) to about 5% after 2016.", "Inflation expectations became better anchored, as RBI household surveys show.", "Transparency improved: MPC minutes, a Monetary Policy Report every six months and accountability letters when the target is missed."]),
      ("Concerns", ["Food and fuel shocks dominate CPI and are not controlled by interest rates.", "The target was missed for three straight quarters in 2022, needing a report to the government.", "Transmission to lending rates is slow, especially for older loans."]),
      ("Conclusion", ["FIT has improved credibility and lowered inflation, but supply-side reforms in food management are needed alongside it."])]),
    ("Fiscal Deficit", 15, 600,
     "What is fiscal deficit? Discuss its implications for the Indian economy and suggest measures for fiscal consolidation.",
     ["Fiscal deficit is the excess of total expenditure over total receipts excluding borrowings. It shows the government's total borrowing requirement for the year.",
      ("Implications", ["High deficits can crowd out private investment by raising interest rates.", "Rising debt raises interest payments, which already take about a quarter of central revenue receipts.", "Deficits financed by money creation can fuel inflation.", "Well-used deficits that fund capital expenditure can raise growth."]),
      ("Measures for consolidation", ["Follow the FRBM path and the glide path to a 4.5% deficit target.", "Widen the tax base through GST compliance and data analytics.", "Rationalise subsidies through direct benefit transfer.", "Monetise assets and disinvest to fund capital spending."]),
      ("Conclusion", ["Fiscal consolidation should improve the quality of spending, not only cut its size."])]),
]
d = doc_new("ESI: Answer Writing Practice", "RBI Grade B (Phase 2, ESI) | Model answers")
exp = []
for i, (topic, marks, words, q, ans) in enumerate(ESI, 1):
    d.add_heading(f"Q{i}. {topic}", 2)
    d.add_paragraph(f"QUESTION {i} {marks} MARKS {words} WORDS")
    d.add_paragraph(q)
    d.add_paragraph(ans[0])
    for head, pts in ans[1:]:
        d.add_heading(head, 3)
        if head == "Conclusion":
            d.add_paragraph(pts[0])
        else:
            bullets(d, pts)
    exp.append({"topic": topic, "marks": marks, "wordLimit": words, "question": q, "answerStart": ans[0][:60]})
save(d, "subj-01-esi", {"kind": "desc", "questions": exp})

FM = [
    (15, "Explain Maslow's hierarchy of needs. How can a bank manager use it to motivate employees?",
     ["Abraham Maslow (1943) proposed that human needs form a hierarchy, and a higher need motivates only after lower needs are largely met.",
      "1. Physiological needs: basic pay and working conditions.", "2. Safety needs: job security, pension and a safe workplace.", "3. Social needs: belonging, teamwork and good relations with colleagues.", "4. Esteem needs: recognition, promotion and status.", "5. Self-actualisation: growth, creativity and challenging work.",
      "A bank manager can offer fair pay and secure tenure first, then build team spirit through branch meetings, recognise good work in public, and give high performers stretch assignments such as leading a digital adoption drive.",
      "Conclusion: the model reminds managers that one incentive does not suit everyone; motivation must match the need that is currently unmet."]),
    (10, "What is working capital? Distinguish between gross and net working capital.",
     ["Working capital is the money a business needs for its day-to-day operations, such as buying raw materials, paying wages and meeting short-term obligations.",
      "Gross working capital is the total of current assets (cash, receivables, inventory and short-term investments).",
      "Net working capital is current assets minus current liabilities. A positive figure shows that short-term obligations are covered by short-term assets.",
      "Conclusion: gross working capital shows the size of investment in current assets, while net working capital shows liquidity and the margin of safety for short-term creditors."]),
]
d = doc_new("Finance & Management Descriptive Practice")
exp = []
for i, (marks, q, ans) in enumerate(FM, 1):
    d.add_paragraph(f"Question {i}: {q} ({marks} marks)")
    d.add_paragraph("Model Answer:")
    for a in ans:
        d.add_paragraph(a)
    exp.append({"marks": marks, "question": q, "answerStart": ans[0][:60]})
save(d, "subj-02-fm", {"kind": "desc", "questions": exp})

ENG = [
    ("Write an essay of about 400 words on: Digital payments and financial inclusion in India.",
     ["Digital payments have changed how India saves, spends and borrows. The Unified Payments Interface (UPI), launched in 2016, now processes billions of transactions every month and has made instant payments free for ordinary users.",
      "Financial inclusion has moved forward alongside. Jan Dhan accounts gave hundreds of millions of people a bank account, Aadhaar made identity checks cheap, and mobile phones carried banking into villages. This combination, often called the JAM trinity, allows subsidies to reach beneficiaries directly.",
      "Challenges remain. Digital literacy is low among older and rural citizens, cyber fraud is rising, and many small merchants still prefer cash. Women are less likely to own a smartphone, which widens the gender gap in access.",
      "The way forward lies in grievance redress that works in local languages, stronger fraud monitoring and simple interfaces. If these gaps are closed, digital payments can become a true ladder of opportunity for every citizen."]),
    ("Write a precis of the following passage in about one-third of its length: Banks are the backbone of an economy because they collect savings and lend them to productive uses. When banks are healthy, credit flows to farms, factories and households. When they are weighed down by bad loans, they become cautious and growth slows.",
     ["Banks channel savings into productive lending. Healthy banks keep credit flowing, but bad loans make them cautious and slow growth."]),
]
d = doc_new("English Descriptive Practice", "Essay and Precis")
exp = []
for i, (q, ans) in enumerate(ENG, 1):
    d.add_paragraph(f"Q{i}. {q}")
    d.add_paragraph("Answer:")
    for a in ans:
        d.add_paragraph(a)
    exp.append({"question": q[:80], "answerStart": ans[0][:60]})
save(d, "subj-03-english", {"kind": "desc", "questions": exp})
# ---------------------------------------------------------------------------
# subj-04: "Q1. Topic" + "Question (15 Marks, 600 Words): ..." is ONE question;
# an answer that ends with a table row before an un-numbered question
# ---------------------------------------------------------------------------
d = doc_new("ESI Answer Writing: Mixed Formats")
exp = []
d.add_paragraph("Q1. Monetary Transmission")
d.add_paragraph("Question (15 Marks, 600 Words): Explain monetary policy transmission in India and the role of the external benchmark regime.")
ans1 = ["Monetary transmission is the process by which changes in the policy repo rate pass through to market interest rates, credit and ultimately inflation and output.",
        "Since October 2019, banks link new floating-rate retail and MSME loans to an external benchmark such as the repo rate, which has made transmission faster and more transparent."]
for a in ans1:
    d.add_paragraph(a)
table(d, [["Channel", "Effect"], ["Interest rate", "Changes the cost of credit"], ["Exchange rate", "Changes import prices"]])
exp.append({"topic": "Monetary Transmission", "marks": 15, "wordLimit": 600, "question": "Explain monetary policy transmission in India and the role of the external benchmark regime.", "answerStart": ans1[0][:60]})
d.add_heading("Financial Inclusion", 1)
d.add_paragraph("Question (10 Marks): What is financial inclusion? Discuss two recent measures that promote it.")
ans2 = ["Financial inclusion means access to affordable financial services for all sections of society, especially the poor and the unbanked.",
        "Two recent measures are the expansion of Jan Dhan accounts and the growth of UPI-based payments in rural areas."]
for a in ans2:
    d.add_paragraph(a)
exp.append({"topic": "Financial Inclusion", "marks": 10, "wordLimit": 400, "question": "What is financial inclusion? Discuss two recent measures that promote it.", "answerStart": ans2[0][:60]})
save(d, "subj-04-mixed-formats", {"kind": "desc", "questions": exp})
print("done")
