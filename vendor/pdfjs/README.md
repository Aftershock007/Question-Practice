# pdf.js (vendored)

Mozilla pdf.js **3.11.174** (`pdfjs-dist`), Apache License 2.0 - see `LICENSE`.
Source: https://github.com/mozilla/pdf.js · npm package `pdfjs-dist@3.11.174`.

Used only by the DOCX/PDF question import (`extractPdfText` in `app.js`) and loaded on
demand the first time a PDF is imported. 3.11.174 is the last pdf.js release published as
classic scripts, which is what lets the app keep working when `index.html` is opened
directly from disk (`file://`). It is always called with `isEvalSupported: false`, which
disables the code path affected by CVE-2024-4367.
