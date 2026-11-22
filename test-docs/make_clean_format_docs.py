"""Build the clean-format test documents (DOCX) and their expected results (JSON).

These are files in the layout that AI_CONVERT_PROMPT.md asks an AI to produce
("Format: RBI-PRACTICE-V1"). The app reads them by their labels (parseCleanFormat).

Run:  python3 test-docs/make_clean_format_docs.py      (needs python-docx)
Then: soffice --headless --convert-to pdf --outdir test-docs test-docs/fmt-*.docx

fmt-01: objective file as an AI would build it: Word tables (match list, DI data,
        a table inside an explanation), statements, assertion-reason, multi-answer,
        a 4-option question, passages with ranges, explanation lines without a full stop.
fmt-02: descriptive file: Word bullet lists, a table and a "Q2 FY26 ..." line
        inside an answer, a question over several paragraphs with (a)/(b) parts, a
        question that starts with a year, a shared case for Q4-Q5, a topic written above
        its question, a letter with "Subject:" / "Date:" lines, "Answer: Not given".
fmt-03: one file with both kinds, typed as plain paragraphs (as text pasted into Word):
        "|" rows instead of tables, "**Answer:**" left over from Markdown, options on
        one line, the answer letter on the line under "Answer:", "a, c" answers.
"""
import json, os
from docx import Document
from docx.shared import Pt

OUT = os.path.dirname(os.path.abspath(__file__))


def new_doc():
    d = Document()
    d.styles["Normal"].font.size = Pt(11)
    return d


def para(d, text, style=None):
    return d.add_paragraph(text, style=style) if style else d.add_paragraph(text)


def table(d, rows):
    t = d.add_table(rows=len(rows), cols=len(rows[0]))
    t.style = "Table Grid"
    for i, r in enumerate(rows):
        for j, c in enumerate(r):
            t.cell(i, j).text = str(c)


def save(d, name, expected):
    d.save(os.path.join(OUT, name + ".docx"))
    with open(os.path.join(OUT, "expected", name + ".json"), "w") as f:
        json.dump(expected, f, indent=1, ensure_ascii=False)


os.makedirs(os.path.join(OUT, "expected"), exist_ok=True)

# ---------------------------------------------------------------------------
# fmt-01: objective
# ---------------------------------------------------------------------------
d = new_doc()
for line in ["Chapter 1: National Income", "Subject: Economics (ESI)", "Type: Objective", "Format: RBI-PRACTICE-V1"]:
    para(d, line)
exp = []


def mcq(num, stem, opts, ans, expl=None, level=None, topic="", passage="", stem_table=None, expl_table=None, stem_after=None):
    para(d, f"Q{num}. {stem[0]}")
    for s in stem[1:]:
        para(d, s)
    if stem_table:
        table(d, stem_table)
    for s in stem_after or []:
        para(d, s)
    for l, o in zip("abcde", opts):
        para(d, f"({l}) {o}")
    para(d, "Answer: " + ", ".join(f"({a})" for a in ans))
    if level:
        para(d, f"Level: {level}")
    full_expl = []
    if expl:
        para(d, "Explanation: " + expl[0])
        for e in expl[1:]:
            para(d, e)
        full_expl = list(expl)
    if expl_table:
        table(d, expl_table)
        full_expl += [" | ".join(r) for r in expl_table]
    text = list(stem) + ([" | ".join(r) for r in stem_table] if stem_table else []) + list(stem_after or [])
    exp.append({"number": num, "text": "\n".join(text), "options": opts, "answer": "".join(ans),
                "explanation": "\n".join(full_expl), "level": level or "", "topic": topic, "passage": passage})


T1 = "National Income Concepts"
para(d, "Topic: " + T1)
mcq(1, ["Which of the following is NOT a part of India's domestic (economic) territory?"],
    ["An Air India aircraft flying between London and New York", "The Indian Embassy in Tokyo",
     "A fishing vessel run by an Indian resident in international waters", "The World Bank office in New Delhi",
     "An oil rig run by ONGC in India's Exclusive Economic Zone"], "d",
    ["Offices of international organisations such as the World Bank are not part of India's domestic territory, even when they are located inside India."],
    "Easy", T1)
mcq(2, ["Consider the following statements:", "1. National income is the sum of factor incomes earned by normal residents.",
        "2. Transfer payments are included in national income.",
        "3. Net factor income from abroad is added to domestic income to get national income.",
        "Which of the statements given above is/are correct?"],
    ["1 only", "1 and 3 only", "2 and 3 only", "1, 2 and 3", "None of the above"], "b",
    ["Transfer payments are not payments for productive services, so they are excluded.", "NI = NDP at FC + NFIA",
     "Statement 2 is therefore wrong."], "Moderate", T1)
mcq(3, ["Assertion (A): GDP at market price is greater than GDP at factor cost when net indirect taxes are positive.",
        "Reason (R): GDP at MP = GDP at FC + Net Indirect Taxes."],
    ["Both A and R are true and R is the correct explanation of A", "Both A and R are true but R is not the correct explanation of A",
     "A is true but R is false", "A is false but R is true", "Both A and R are false"], "a",
    ["Net indirect taxes (indirect taxes minus subsidies) are the only difference between the two measures."], None, T1)
T2 = "Methods of Measurement"
para(d, "Topic: " + T2)
mcq(4, ["Match List I with List II:"], ["A-2, B-1, C-3", "A-1, B-2, C-3", "A-3, B-1, C-2", "A-2, B-3, C-1"], "a",
    ["Each method measures the same flow at a different stage: income, spending and production."], "Easy", T2,
    stem_table=[["List I", "List II"], ["A. Income method", "1. Sum of final expenditures"],
                ["B. Expenditure method", "2. Sum of factor incomes"], ["C. Value added method", "3. Sum of value added by all producers"]],
    expl_table=[["Method", "Measures"], ["Income", "Factor payments"], ["Expenditure", "Final spending"]])
mcq(5, ["Which of the following are excluded while estimating national income? (More than one option may be correct.)"],
    ["Sale of second-hand goods", "Old-age pensions", "Imputed rent of owner-occupied houses", "Purchase of shares",
     "Wages of government employees"], "abd",
    ["Second-hand sales and share purchases are not current production, and pensions are transfer payments. Imputed rent and government wages are included."],
    None, T2)
mcq(6, ["2011-12 is the base year of the current GDP series. Which organisation compiles it?"],
    ["Reserve Bank of India", "National Statistical Office", "NITI Aayog", "Ministry of Finance", "Finance Commission"], "b", None, None, T2)
P1 = ["Read the following passage carefully and answer the questions given below it.",
      "India's real GDP grew 7.8% in 2025-26, led by services and construction. Private consumption, which accounts for well over half of GDP, grew steadily as rural demand recovered.",
      "Economists caution that headline growth hides uneven gains. Real wages in several informal sectors have barely moved, and household savings in financial assets fell to a multi-year low."]
para(d, "Directions (Q7-Q9): " + P1[0])
for p in P1[1:]:
    para(d, p)
mcq(7, ["According to the passage, which sectors led growth in 2025-26?"],
    ["Agriculture and mining", "Services and construction", "Manufacturing and exports", "Government spending and defence", "Mining and utilities"],
    "b", None, None, T2, "\n".join(P1))
mcq(8, ["What does the passage say about household savings in financial assets?"],
    ["They rose sharply", "They stayed unchanged", "They fell to a multi-year low", "They doubled", "The passage does not say"],
    "c", None, None, T2, "\n".join(P1))
mcq(9, ["Which word is most nearly OPPOSITE in meaning to \"uneven\" as used in the passage?"],
    ["Irregular", "Balanced", "Rough", "Unequal", "Patchy"], "b", ["\"Uneven\" here means unequal; \"balanced\" is its opposite."], None, T2, "\n".join(P1))
DI = [["Year", "Nominal GDP (Rs lakh crore)", "Real GDP (Rs lakh crore)"], ["2023-24", "295", "173"], ["2024-25", "324", "184"]]
para(d, "Directions (Q10-Q11): Study the table below and answer the questions that follow.")
table(d, DI)
P2 = "\n".join(["Study the table below and answer the questions that follow."] + [" | ".join(r) for r in DI])
mcq(10, ["By roughly what percentage did nominal GDP grow from 2023-24 to 2024-25?"], ["6.5%", "8.2%", "9.8%", "11.4%", "12.6%"], "c",
    ["(324 - 295) / 295 x 100 = 9.83%, about 9.8%."], None, T2, P2)
mcq(11, ["What was the GDP deflator in 2024-25 (approximately)?"], ["156", "168", "176", "182", "190"], "c",
    ["GDP deflator = Nominal GDP / Real GDP x 100 = 324 / 184 x 100 = 176.1"], "Hard", T2, P2)
T3 = "Problems in Measurement"
para(d, "Topic: " + T3)
mcq(12, ["Which of the following statements about double counting is correct?"],
    ["It occurs when intermediate goods are counted along with final goods", "It occurs when exports are excluded",
     "It is avoided by adding the value of intermediate goods", "It arises only in the income method", "Both (b) and (c)"], "a",
    ["Counting intermediate goods along with final goods counts the same value twice. The value added method avoids it.",
     "Note: Only final goods enter GDP."], "Easy", T3)
mcq(13, ["Note: Answer on the basis of the System of National Accounts 2008.", "Which of the following is treated as capital formation?"],
    ["Purchase of a car by a household for personal use", "Construction of a new factory building", "Payment of wages to factory workers",
     "Purchase of raw material by a firm for current production"], "b",
    ["Only the factory building adds to the stock of fixed capital. The household car is final consumption."], None, T3)
save(d, "fmt-01-clean-objective", {"kind": "mcq", "chapter": "National Income", "questions": exp})

# ---------------------------------------------------------------------------
# fmt-02: descriptive
# ---------------------------------------------------------------------------
d = new_doc()
for line in ["Chapter 1: National Income", "Subject: Economics (ESI)", "Type: Descriptive", "Format: RBI-PRACTICE-V1"]:
    para(d, line)
exp = []

para(d, "Q1. (15 Marks, 600 Words)")
para(d, "Topic: GDP and Welfare")
q1 = "“Higher GDP does not always mean higher welfare.” Critically examine this statement in the Indian context and suggest better measures of well-being."
para(d, q1)
para(d, "Answer:")
a1 = "Gross Domestic Product (GDP) is the market value of all final goods and services produced inside a country in a year. Welfare is broader: it covers income, health, education, safety and a clean environment."
para(d, a1)
para(d, "Why Higher GDP May Not Mean Higher Welfare")
para(d, "Ignores income distribution: GDP is a total and per capita income is an average.", "List Bullet")
para(d, "In India, the top 10% earn about 58% of national income.", "List Bullet 2")
para(d, "Leaves out unpaid work: unpaid domestic and care work is excluded.", "List Bullet")
para(d, "Ignores environmental damage: resource depletion and pollution are not deducted.", "List Bullet")
para(d, "Better Measures of Well-being")
table(d, [["Measure", "What it adds"], ["HDI", "Health and education with income"], ["Green GDP", "Deducts environmental costs"]])
para(d, "Q2 FY26 data also show that growth and welfare can diverge.")
para(d, "Conclusion")
para(d, "GDP growth is necessary for welfare but not sufficient. India should track a dashboard that pairs GDP with distribution, HDI and environmental indicators.")
exp.append({"number": 1, "topic": "GDP and Welfare", "marks": 15, "wordLimit": 600, "question": q1, "answerStart": a1[:60],
            "answerHas": ["• Ignores income distribution", "In India, the top 10% earn about 58%", "HDI | Health and education with income",
                          "Q2 FY26 data also show", "Conclusion\n\nGDP growth is necessary"], "passage": ""})

para(d, "Q2. (10 Marks, 400 Words)")
para(d, "Topic: Fiscal Deficit")
q2 = ["India's fiscal deficit fell to 4.8% of GDP in 2024-25.", "In this context, discuss:", "(a) the quality of fiscal consolidation; and", "(b) the risks to the glide path."]
for s in q2:
    para(d, s)
para(d, "Answer:")
a2 = ["Fiscal deficit is the excess of total expenditure over total receipts excluding borrowings.",
      "1. Quality of consolidation: capital expenditure was protected while revenue spending was restrained.",
      "2. Risks: lower nominal growth, higher subsidies and state-level deficits.",
      "Conclusion: consolidation that protects capital spending supports growth."]
for s in a2:
    para(d, s)
exp.append({"number": 2, "topic": "Fiscal Deficit", "marks": 10, "wordLimit": 400, "question": "\n".join(q2), "answerStart": a2[0][:60],
            "answerHas": ["1. Quality of consolidation", "\n2. Risks"], "passage": ""})

para(d, "Q3. (15 Marks, 600 Words)")
para(d, "Topic: Base Year Revision")
q3 = "2022-23 was proposed as the new base year for India's GDP series. Examine why base years are revised and how the revision affects growth estimates."
para(d, q3)
para(d, "Answer:")
a3 = "Base years are revised so that the weights of sectors and prices reflect the current structure of the economy."
para(d, a3)
para(d, "• New data sources such as GST and MCA-21 filings improve coverage.")
para(d, "• Revisions can change the level of GDP and the measured growth rate.")
exp.append({"number": 3, "topic": "Base Year Revision", "marks": 15, "wordLimit": 600, "question": q3, "answerStart": a3[:60],
            "answerHas": ["• New data sources"], "passage": ""})

case = ["Read the case below and answer the questions that follow.", "Case Study: Shakti Bank",
        "Shakti Bank is a mid-sized private bank. Its gross NPA ratio rose from 3.1% to 6.4% in two years, mostly from unsecured personal loans."]
case_table = [["Year", "Gross NPA (%)", "Unsecured share of loans (%)"], ["FY24", "3.1", "22"], ["FY26", "6.4", "35"]]
para(d, "Directions (Q4-Q5): " + case[0])
for s in case[1:]:
    para(d, s)
table(d, case_table)
case_text = "\n".join(case + [" | ".join(r) for r in case_table])
para(d, "Q4. (10 Marks, 400 Words)")
para(d, "Topic: Asset Quality")
q4 = "Identify the main causes of the rise in Shakti Bank's bad loans."
para(d, q4)
para(d, "Answer:")
a4 = "The main causes are the fast growth of unsecured loans, weak underwriting and concentration in risky segments."
para(d, a4)
exp.append({"number": 4, "topic": "Asset Quality", "marks": 10, "wordLimit": 400, "question": q4, "answerStart": a4[:60], "answerHas": [], "passage": case_text})
para(d, "Q5. (10 Marks, 400 Words)")
para(d, "Topic: Asset Quality")
q5 = "Suggest a plan to restore asset quality."
para(d, q5)
para(d, "Answer:")
para(d, "Tighten credit appraisal and cap unsecured lending.", "List Bullet")
para(d, "Strengthen recovery through early warning systems.", "List Bullet")
exp.append({"number": 5, "topic": "Asset Quality", "marks": 10, "wordLimit": 400, "question": q5, "answerStart": "• Tighten credit appraisal",
            "answerHas": ["\n• Strengthen recovery"], "passage": case_text})

para(d, "Topic: Precis Writing")
para(d, "Q6. (10 Marks, 100 Words)")
q6 = ["Write a précis of the following passage in about one-third of its length.",
      "Banks are the backbone of an economy because they collect savings and lend them to productive uses. When banks are healthy, credit flows to farms, factories and households. When they are weighed down by bad loans, they become cautious and growth slows."]
for s in q6:
    para(d, s)
para(d, "Answer:")
a6 = "Banks channel savings into productive lending. Healthy banks keep credit flowing, but bad loans make them cautious and slow growth."
para(d, a6)
exp.append({"number": 6, "topic": "Precis Writing", "marks": 10, "wordLimit": 100, "question": "\n".join(q6), "answerStart": a6[:60], "answerHas": [], "passage": ""})

para(d, "Q7. (10 Marks, 250 Words)")
para(d, "Topic: Letter Writing")
q7 = "You are the branch manager of a bank in Pune. Write a letter to the Regional Manager requesting two more cash counters."
para(d, q7)
para(d, "Answer:")
a7 = ["To", "The Regional Manager", "State Bank of India, Pune Region", "Date: 22 November 2026", "Subject: Request for two additional cash counters",
      "Sir,", "Footfall at our branch has risen by about 40% after two new housing societies opened nearby. Customers now wait for over 30 minutes at the cash counters.",
      "Yours faithfully,", "Branch Manager"]
for s in a7:
    para(d, s)
exp.append({"number": 7, "topic": "Letter Writing", "marks": 10, "wordLimit": 250, "question": q7, "answerStart": "To",
            "answerHas": ["Subject: Request for two additional cash counters", "Yours faithfully,"], "passage": ""})

para(d, "Q8. (10 Marks)")
para(d, "Topic: Inflation")
q8 = "What is core inflation? Why does the RBI watch it closely?"
para(d, q8)
para(d, "Answer: Core inflation excludes volatile food and fuel prices.")
para(d, "It shows the underlying trend of prices, which monetary policy can influence.")
exp.append({"number": 8, "topic": "Inflation", "marks": 10, "wordLimit": 400, "question": q8, "answerStart": "Core inflation excludes volatile food and fuel prices.",
            "answerHas": ["It shows the underlying trend"], "passage": ""})

para(d, "Q9. (15 Marks, 600 Words)")
para(d, "Topic: Potential Output")
q9 = "Explain the concept of potential output."
para(d, q9)
para(d, "Answer: Not given")
exp.append({"number": 9, "topic": "Potential Output", "marks": 15, "wordLimit": 600, "question": q9, "answerStart": "", "answerHas": [], "passage": ""})
save(d, "fmt-02-clean-descriptive", {"kind": "desc", "questions": exp})

# ---------------------------------------------------------------------------
# fmt-03: both kinds in one file, typed as plain paragraphs (text pasted into Word)
# ---------------------------------------------------------------------------
d = new_doc()
lines = [
    "Chapter 2: Inflation", "Subject: Economics (ESI)", "Format: RBI-PRACTICE-V1", "Type: Objective",
    "Topic: Measures of Inflation",
    "**Q1.** Which index is used for inflation targeting in India?",
    "(a) WPI", "(b) CPI (Combined)", "(c) CPI-IW", "(d) GDP deflator", "(e) CPI-AL",
    "**Answer:** (b)", "**Explanation:** The target is set on headline CPI (Combined).",
    "Q2. Who sets the inflation target? (a) RBI (b) Central Government in consultation with RBI (c) MPC (d) Finance Commission",
    "Answer:", "(b)",
    "Topic: Types of Inflation",
    "Q3. Which of the following can cause cost-push inflation?",
    "(a) Rise in crude oil prices", "(b) Increase in money supply", "(c) Higher wages not matched by productivity", "(d) Tax cuts",
    "Answer: a, c", "Level: Moderate",
    "Explanation: Cost-push inflation comes from higher costs of production.",
    "Cause | Type", "Oil price rise | Cost-push", "Money supply growth | Demand-pull",
    "Type: Descriptive",
    "Q1. (10 Marks, 400 Words)", "Topic: Inflation Targeting",
    "Has flexible inflation targeting worked in India? Discuss.",
    "**Answer:**",
    "- Average CPI inflation fell after 2016.", "- Supply shocks still dominate food inflation.",
]
for line in lines:
    para(d, line)
save(d, "fmt-03-clean-mixed-pasted", {"kind": "both", "mcq": [
    {"number": 1, "text": "Which index is used for inflation targeting in India?", "answer": "b", "options": 5, "topic": "Measures of Inflation",
     "explanation": "The target is set on headline CPI (Combined)."},
    {"number": 2, "text": "Who sets the inflation target?", "answer": "b", "options": 4, "topic": "Measures of Inflation", "explanation": ""},
    {"number": 3, "text": "Which of the following can cause cost-push inflation?", "answer": "ac", "options": 4, "topic": "Types of Inflation",
     "explanation": "Cost-push inflation comes from higher costs of production.\nCause | Type\nOil price rise | Cost-push\nMoney supply growth | Demand-pull"}],
    "desc": [{"number": 1, "topic": "Inflation Targeting", "marks": 10, "wordLimit": 400, "question": "Has flexible inflation targeting worked in India? Discuss.",
              "answerStart": "- Average CPI inflation fell after 2016.", "answerHas": ["\n- Supply shocks"], "passage": ""}]})
print("wrote fmt-01, fmt-02, fmt-03")
