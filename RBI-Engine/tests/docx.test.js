"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const h = require("./helpers");
const { parseXML, textContent } = require("../src/xml");
const { extractDocxText } = require("../src/docx");
const { parseText, readInputFile } = require("../src/input");

const FMT02 = path.join(h.APP_DIR, "test-docs", "fmt-02-clean-descriptive.docx");
const FMT02_EXPECTED = path.join(h.APP_DIR, "test-docs", "expected", "fmt-02-clean-descriptive.json");

test("parseXML resolves namespaces, decodes entities and keeps CDATA", () => {
  const root = parseXML("<?xml version=\"1.0\"?><!-- c --><a xmlns=\"urn:x\" xmlns:w=\"urn:w\"><w:b w:val=\"1\">R&amp;D &#8377;5 &#x41;</w:b><c><![CDATA[<raw>]]></c></a>");
  assert.equal(root.local, "a");
  assert.equal(root.ns, "urn:x");
  const b = root.children[0];
  assert.equal(b.local, "b");
  assert.equal(b.ns, "urn:w");
  assert.equal(b.attrs["w:val"], "1");
  assert.equal(textContent(b), "R&D ₹5 A");
  assert.equal(textContent(root.children[1]), "<raw>");
});

test("parseXML rejects broken XML", () => {
  assert.throws(() => parseXML("<a><b></a>"), /damaged/);
  assert.throws(() => parseXML("<a>"), /damaged/);
});

test("a DOCX built in the test reads back as an answer file", () => {
  const zip = h.makeZip({ "word/document.xml": h.docxXml(["Paper: ESI", "Marks: 10", "Question:", "Explain CRR &amp; SLR.", "", "Answer:", "CRR is cash kept with the RBI.", "", "It costs &#8377;0 in interest."]) });
  const text = extractDocxText(zip);
  assert.equal(text, "Paper: ESI\nMarks: 10\nQuestion:\nExplain CRR & SLR.\n\nAnswer:\nCRR is cash kept with the RBI.\n\nIt costs ₹0 in interest.");
  const q = parseText(text, {}).questions[0];
  assert.equal(q.question, "Explain CRR & SLR.");
  assert.equal(q.answer, "CRR is cash kept with the RBI.\n\nIt costs ₹0 in interest.");
});

test("readInputFile reads a .docx answer file", async () => {
  const dir = h.tempDir();
  const file = path.join(dir, "answer.docx");
  fs.writeFileSync(file, h.makeZip({ "word/document.xml": h.docxXml(["Question:", "What is repo?", "Answer:", "The rate at which the RBI lends."]) }));
  const r = await readInputFile(file);
  assert.equal(r.questions[0].answer, "The rate at which the RBI lends.");
});

test("a file that is not a Word document gets a clear message", () => {
  assert.throws(() => extractDocxText(Buffer.from("just some text, not a zip")), /not a Word \.docx file/);
});

test("a Word file with broken XML is reported as damaged", () => {
  const zip = h.makeZip({ "word/document.xml": "<w:document xmlns:w=\"x\"><w:body><w:p></w:body>" });
  assert.throws(() => extractDocxText(zip), /The Word document is damaged/);
});

test("the repo's clean-format DOCX gives every expected answer line", { skip: !fs.existsSync(FMT02) }, () => {
  const text = extractDocxText(fs.readFileSync(FMT02));
  const flat = text.replace(/\s+/g, " ");
  const expected = JSON.parse(fs.readFileSync(FMT02_EXPECTED, "utf8"));
  let checked = 0;
  for (const q of expected.questions) {
    assert.ok(flat.includes(q.answerStart.replace(/\s+/g, " ").trim()), q.answerStart);
    for (const line of q.answerHas || []) {
      assert.ok(flat.includes(line.replace(/\s+/g, " ").trim()), line);
      checked++;
    }
  }
  assert.ok(checked >= 5);
});
