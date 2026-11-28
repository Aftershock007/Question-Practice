# Descriptive Typing Test Practice

An offline practice website for RBI Grade B: objective MCQ tests in a TCS iON-style console, timed descriptive answer writing, AI grading and a study calendar.

- **Run it:** open `index.html` in a browser (or use the GitHub Pages site) and sign in (username `😊`, password `🙂`).
- **Objective:** import MCQs from DOCX/PDF, check the answer key (optionally with AI), take a timed test with +1 / -0.25 scoring and a topic-wise analysis.
- **Subjective:** type answers with word limits (copy and paste blocked); press **AI Analysis** to get marks and a detailed report. The report shows your answer marked in colour (language mistakes red with the correction in green, sentences to frame better deep blue then light blue, wrong facts deep purple then light purple, additions in gold at the right place, "-0.25" tags where marks were deducted) and a table of every lost mark with its reason and how to earn it next time.
- **Calendar & History:** a 415-day study plan with daily TODOs, and past tests sorted into subject and chapter folders.
- **AI keys:** add your own key with the **API keys** button; it is kept only for the browser session and never saved in the repo.
- **Messy question files:** convert them first with the prompt in [`AI_CONVERT_PROMPT.md`](AI_CONVERT_PROMPT.md).
- **RBI-Engine (command line):** [`RBI-Engine/`](RBI-Engine/README.md) analyses answers in more depth on your computer: strict marks with every rule explained, every language mistake with its fix, structure and framing advice, a model answer, and progress over time. The same answer always gets the same report.
