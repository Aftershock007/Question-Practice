"use strict";

const CAL_KEYS = {
  config: "rbi_plan_config",
  customPlan: "rbi_plan_custom",
  todos: "rbi_todos",
  planState: "rbi_plan_todo_state",
  migrated: "rbi_todo_migrated_v1",
  keysV2: "rbi_todo_keys_v2",
  typesV3: "rbi_todo_types_v3",
  launch: "rbi_todo_launch"
};

const TODO_TYPES = [
  { value: "Objective Practice", kind: "obj", test: true, mode: "mcq" },
  { value: "Subjective Practice", kind: "subj", test: true, mode: "write" },
  { value: "Mix Test", kind: "mix", test: true, mode: "" },
  { value: "Chapter Test", kind: "chapter", test: true, mode: "" },
  { value: "Study", kind: "study", test: false, mode: "" },
  { value: "Other", kind: "other", test: false, mode: "" }
];

const CAL_LEGACY_TYPES = {
  "Descriptive writing": "Subjective Practice", "MCQ practice": "Objective Practice", "Mock test": "Mix Test",
  "Study": "Study", "Revision": "Study", "Current affairs": "Study", "Other": "Other"
};

function calTypeDef(type) {
  return TODO_TYPES.find(t => t.value === type) || TODO_TYPES[TODO_TYPES.length - 1];
}

function calIsTestType(type) {
  return !!calTypeDef(type).test;
}

const CAL_ROUTINE = [
  { key: "p2sub", chip: "P2 Subj", tag: "P2" },
  { key: "p2obj", chip: "P2 Obj", tag: "P2" },
  { key: "p1obj", chip: "P1 Obj", tag: "P1" },
  { key: "ca", chip: "CA", tag: "CA" }
];

const CAL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CAL_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const cal = {
  loaded: false,
  built: false,
  config: { startDate: "2026-11-01", source: "official" },
  customPlan: [],
  todos: [],
  planState: { done: {}, hidden: {} },
  planIndex: null,
  view: null,
  editing: null
};

function calParse(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function calAddDays(dateStr, n) {
  const d = calParse(dateStr);
  d.setDate(d.getDate() + n);
  return getLocalDateString(d);
}

function calDiffDays(fromStr, toStr) {
  return Math.round((calParse(toStr) - calParse(fromStr)) / 86400000);
}

function calToday() {
  return getLocalDateString(new Date());
}

function calFirstOfMonth(dateStr) {
  const d = calParse(dateStr);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function calIsValidDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(str || ""))) return false;
  const d = calParse(str);
  return !isNaN(d.getTime()) && getLocalDateString(d) === str;
}

function calShortDate(dateStr) {
  return calParse(dateStr).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function calTypeIcon(type) {
  const t = TODO_TYPES.find(x => x.value === type);
  return `<i class="type-dot type-${t ? t.kind : "other"}" aria-hidden="true"></i>`;
}

function calPracticeForType(type) {
  return calTypeDef(type).mode || "";
}

function calSaveConfig() { saveJSON(CAL_KEYS.config, cal.config); }
function calSaveTodos() { saveJSON(CAL_KEYS.todos, cal.todos); }
function calSavePlanState() { saveJSON(CAL_KEYS.planState, cal.planState); }

function calEnsureLoaded() {
  if (cal.loaded) return;
  const savedConfig = loadJSON(CAL_KEYS.config, null);
  cal.config = Object.assign({ startDate: "2026-11-01", source: "official" }, savedConfig || {});
  if (!calIsValidDate(cal.config.startDate)) cal.config.startDate = "2026-11-01";
  if (!["official", "custom", "none"].includes(cal.config.source)) cal.config.source = "official";
  cal.customPlan = loadJSON(CAL_KEYS.customPlan, []);
  if (!Array.isArray(cal.customPlan)) cal.customPlan = [];
  cal.todos = loadJSON(CAL_KEYS.todos, []);
  if (!Array.isArray(cal.todos)) cal.todos = [];
  cal.todos = cal.todos.filter(t => t && t.id && calIsValidDate(t.date));
  const ps = loadJSON(CAL_KEYS.planState, {}) || {};
  cal.planState = { done: ps.done || {}, hidden: ps.hidden || {}, links: ps.links || {} };

  if (!loadJSON(CAL_KEYS.migrated, false)) calMigrateLegacy(!savedConfig);
  if (!loadJSON(CAL_KEYS.keysV2, false)) calMigrateKeysV2();
  if (!loadJSON(CAL_KEYS.typesV3, false)) calMigrateTypesV3();

  const today = calToday();
  cal.view = { month: calFirstOfMonth(today), selected: today, lastType: "Study" };
  cal.loaded = true;
}

function calMigrateTypesV3() {
  cal.todos.forEach(t => {
    if (!TODO_TYPES.some(x => x.value === t.type)) t.type = CAL_LEGACY_TYPES[t.type] || "Other";
  });
  calSaveTodos();
  saveJSON(CAL_KEYS.typesV3, true);
}

function calMigrateLegacy(useLegacyStart) {
  const legacyStart = loadJSON("rbi_calendar_start_date", null);
  if (useLegacyStart && calIsValidDate(legacyStart)) cal.config.startDate = legacyStart;

  const old = loadJSON("rbi_study_schedule", null);
  if (Array.isArray(old) && old.length > 0) {
    const now = Date.now();
    const customRows = {};
    const markDone = (day, keys) => keys.forEach(k => { cal.planState.done[`d${day}-${k}`] = now; });
    const markPart = (day, part) => {
      if (part === "p2") markDone(day, ["p2sub", "p2obj"]);
      else if (part === "p1") markDone(day, ["p1obj"]);
      else markDone(day, ["ca"]);
    };
    const legacyTypeMap = {
      "Objective Exam": "MCQ practice", "MCQ Practice": "MCQ practice", "Subjective Exam": "Descriptive writing",
      "Descriptive Writing": "Descriptive writing", "Study / Reading": "Study", "Reading / Notes": "Study",
      "Revision": "Revision", "Current Affairs": "Current affairs", "Mock Test": "Mock test",
      "Chapter Test": "Mock test", "Mix Test": "Mock test"
    };

    for (const t of old) {
      if (!t || !t.date) continue;
      const id = String(t.id || "");
      const done = t.status === "completed";
      let m;
      if ((m = /^task-d(\d+)-(p1|p2|ca)-\d+$/.exec(id))) {
        const day = Number(m[1]);
        const row = customRows[day] || (customRows[day] = { day, p2_subject: "", p2_topic: "", p1_subject: "", p1_topic: "", ca: "" });
        ["p2_subject", "p2_topic", "p1_subject", "p1_topic", "ca"].forEach(k => { if (t[k]) row[k] = sanitizeDashes(t[k]); });
        if (done) markPart(day, m[2]);
      } else if ((m = /^task-d(\d+)-(p1|p2|ca)$/.exec(id))) {
        if (done) markPart(Number(m[1]), m[2]);
      } else if (/^quest-p[12]-(obj|sub|std|ca|rev)-/.test(id) && t.autoGenerated) {
        if (done && t.dayNum) {
          const k = /^quest-(p[12])-(\w+)-/.exec(id);
          const map = { "p2-obj": ["p2obj"], "p2-sub": ["p2sub"], "p1-obj": ["p1obj"], "p1-ca": ["ca"] }[`${k[1]}-${k[2]}`];
          if (map) markDone(t.dayNum, map);
        }
      } else {
        cal.todos.push({
          id: makeId("todo"),
          date: calIsValidDate(t.date) ? t.date : calToday(),
          title: sanitizeDashes(t.topic || "TODO").slice(0, 300),
          type: legacyTypeMap[t.type] || "Other",
          note: sanitizeDashes(t.subject || ""),
          done,
          createdAt: now
        });
      }
    }

    const rows = Object.values(customRows).sort((a, b) => a.day - b.day);
    if (rows.length > 0) {
      cal.customPlan = rows;
      cal.config.source = "custom";
      saveJSON(CAL_KEYS.customPlan, rows);
    }
  }

  calSaveConfig();
  calSaveTodos();
  calSavePlanState();
  saveJSON(CAL_KEYS.migrated, true);
}

function calMigrateKeysV2() {
  const map = { "p2:write": "p2sub", "p2:quiz": "p2obj", "p1:practice": "p1obj", "p1:test": "p1obj", "p1:ca": "ca" };
  ["done", "hidden"].forEach(bucket => {
    const src = cal.planState[bucket];
    Object.keys(src).forEach(id => {
      const m = /^(p[12])-d(\d+)-(\w+)$/.exec(id);
      if (!m) return;
      const key = map[`${m[1]}:${m[3]}`];
      if (key) src[`d${m[2]}-${key}`] = src[id];
      delete src[id];
    });
  });
  cal.todos.forEach(t => { delete t.phase; });
  calSavePlanState();
  calSaveTodos();
  saveJSON(CAL_KEYS.keysV2, true);
}

function calPlanRows() {
  if (cal.config.source === "none") return [];
  if (cal.config.source === "custom" && cal.customPlan.length > 0) return cal.customPlan;
  return (typeof RBI_OFFICIAL_SCHEDULE_DATA !== "undefined" && Array.isArray(RBI_OFFICIAL_SCHEDULE_DATA))
    ? RBI_OFFICIAL_SCHEDULE_DATA
    : [];
}

function calPlanIndex() {
  if (cal.planIndex) return cal.planIndex;
  const byDate = new Map();
  let totalDays = 0;
  let lastDate = null;
  for (const r of calPlanRows()) {
    const day = Number(r.day) || 0;
    if (day < 1) continue;
    const date = calAddDays(cal.config.startDate, day - 1);
    byDate.set(date, r);
    if (day > totalDays) {
      totalDays = day;
      lastDate = date;
    }
  }
  cal.planIndex = { byDate, totalDays, lastDate };
  return cal.planIndex;
}

function calInvalidatePlan() {
  cal.planIndex = null;
}

function parsePlanTopic(text) {
  const raw = sanitizeDashes(String(text || "")).replace(/\s+/g, " ").trim();
  if (!raw) return null;
  let m;
  if ((m = /^(chapter test|mix test)\s*(\([^)]*\))?\s*:?\s*(.*)$/i.exec(raw))) {
    const isMix = /^mix/i.test(m[1]);
    const label = (isMix ? "Mix Test" : "Chapter Test") + (m[2] ? " " + m[2] : "");
    const rest = m[3] || "";
    const focus = rest.replace(/^(objective test\s*(\+\s*subjective test)?|subjective test)\s*-?\s*/i, "").trim();
    return { kind: isMix ? "mix-test" : "chapter-test", label, focus: focus || label, hasSubjective: /subjective test/i.test(rest) };
  }
  if ((m = /^buffer day\s*(\([^)]*\))?\s*-?\s*(.*)$/i.exec(raw))) {
    return { kind: "buffer", label: "Buffer Day" + (m[1] ? " " + m[1] : ""), focus: m[2] || "Revision" };
  }
  if ((m = /^objective practice\s*-\s*(.+)$/i.exec(raw))) {
    return { kind: "practice", label: "Practice", focus: m[1] };
  }
  if ((m = /^(.+?)\s*-\s*class\s*(\d+)\s*(\(.*\))?$/i.exec(raw))) {
    return { kind: "class", label: "Class " + m[2], focus: m[1] + (m[3] ? " " + m[3] : "") };
  }
  if ((m = /^(.+?)\s*-\s*(descriptive class|descriptive|practice)$/i.exec(raw))) {
    const isPractice = /practice/i.test(m[2]);
    return { kind: isPractice ? "practice" : "descriptive", label: isPractice ? "Practice" : "Descriptive", focus: m[1] };
  }
  return { kind: "topic", label: "", focus: raw };
}

function parsePlanCA(text) {
  const raw = sanitizeDashes(String(text || "")).replace(/\s+/g, " ").trim();
  if (!raw) return null;
  if (/^objective tests?\b/i.test(raw)) {
    return { kind: "ca-test", label: "CA Objective Test", focus: raw.replace(/^objective tests?\s*-\s*/i, "") };
  }
  return { kind: "ca-read", label: "CA Reading", focus: raw.replace(/\s*\(reading\)/i, "") };
}

function calIsTestKind(kind) {
  return kind === "chapter-test" || kind === "mix-test" || kind === "ca-test";
}

function calShortTestLabel(kind, label) {
  const m = /\(ch\s*([^)]*)\)/i.exec(label || "");
  const range = m ? m[1].trim() : "";
  if (kind === "chapter-test") return range ? `Ch ${range} test` : "Chapter test";
  if (kind === "mix-test") return range ? `Mix ${range} test` : "Mix test";
  if (kind === "ca-test") return "test";
  if (kind === "buffer") return range ? `Buffer ${range}` : "Buffer";
  return label || "";
}

function calTestShortName(kind, label) {
  const m = /\(ch\s*([^)]*)\)/i.exec(label || "");
  if (!m) return label || "";
  return (kind === "mix-test" ? "Mix Ch " : "Ch ") + m[1].trim();
}

function calPlanTodos(date, row) {
  if (!row) return [];
  const day = Number(row.day);
  const p2 = parsePlanTopic(row.p2_topic);
  const p1 = parsePlanTopic(row.p1_topic);
  const ca = parsePlanCA(row.ca);
  const p2Sub = sanitizeDashes(row.p2_subject || "");
  const p1Sub = sanitizeDashes(row.p1_subject || "");
  const list = [];
  const add = (key, title, type, detail, subject, practice, test, testLabel) => {
    const id = `d${day}-${key}`;
    if (cal.planState.hidden[id]) return;
    const routine = CAL_ROUTINE.find(r => r.key === key);
    list.push({
      id, source: "plan", key, date, title, type,
      detail: detail || "", subject: subject || "", practice: practice || "", mode: practice || "",
      test: test || "", testLabel: testLabel || "", tag: routine ? routine.tag : "",
      done: !!cal.planState.done[id],
      link: cal.planState.links[id] || null
    });
  };
  const describe = (t) => (t.label ? `${t.focus} · ${t.label}` : t.focus);
  const testType = (t) => (t.kind === "mix-test" ? "Mix Test" : "Chapter Test");

  const p2IsTest = p2 && (p2.kind === "chapter-test" || p2.kind === "mix-test");
  const p2Short = p2IsTest ? calTestShortName(p2.kind, p2.label) : "";
  const p2Detail = p2 ? (p2IsTest ? p2.focus : describe(p2)) : "No Phase-2 topic today: revise previous chapters";
  const p2SubIsTest = p2IsTest && p2.hasSubjective;
  add("p2sub",
    p2SubIsTest ? `Subjective test · ${p2Short}` : "Phase-2 subjective exam",
    p2SubIsTest ? testType(p2) : "Subjective Practice", p2Detail, p2Sub || "Phase-2", "write",
    p2SubIsTest ? p2.kind : "", p2SubIsTest ? p2.label : "");
  add("p2obj",
    p2IsTest ? `Objective test · ${p2Short}` : "Phase-2 objective exam",
    p2IsTest ? testType(p2) : "Objective Practice", p2Detail, p2Sub || "Phase-2", "mcq",
    p2IsTest ? p2.kind : "", p2IsTest ? p2.label : "");

  const p1IsTest = p1 && (p1.kind === "chapter-test" || p1.kind === "mix-test");
  if (p1) {
    add("p1obj", p1IsTest ? `Objective test · ${calTestShortName(p1.kind, p1.label)}` : "Phase-1 objective exam",
      p1IsTest ? testType(p1) : "Objective Practice", p1IsTest ? p1.focus : describe(p1), p1Sub || "Phase-1", "mcq",
      p1IsTest ? p1.kind : "", p1IsTest ? p1.label : "");
  } else if (ca && ca.kind === "ca-test") {
    add("p1obj", "Current affairs objective test", "Objective Practice", ca.focus, "Current Affairs", "mcq", "ca-test", ca.label);
  } else {
    add("p1obj", "Phase-1 objective exam", "Objective Practice", "No Phase-1 topic today: mixed revision MCQs", "Phase-1", "mcq");
  }

  if (ca && ca.kind === "ca-read") {
    add("ca", "Read current affairs", "Study", ca.focus, "Current Affairs", "");
  } else if (ca && p1) {
    add("ca", "Current affairs objective test", "Objective Practice", ca.focus, "Current Affairs", "mcq", "ca-test", ca.label);
  }
  return list;
}

function calPlanTests(row) {
  if (!row) return [];
  const tests = [];
  const p2 = parsePlanTopic(row.p2_topic);
  const p1 = parsePlanTopic(row.p1_topic);
  const ca = parsePlanCA(row.ca);
  if (p2 && calIsTestKind(p2.kind)) tests.push({ tag: "P2", kind: p2.kind, label: p2.label, focus: p2.focus, subject: sanitizeDashes(row.p2_subject || "") });
  if (p1 && calIsTestKind(p1.kind)) tests.push({ tag: "P1", kind: p1.kind, label: p1.label, focus: p1.focus, subject: sanitizeDashes(row.p1_subject || "") });
  if (ca && ca.kind === "ca-test") tests.push({ tag: "CA", kind: "ca-test", label: ca.label, focus: ca.focus, subject: "Current Affairs" });
  return tests;
}

let calHistCache = null;
function calHistory(kind) {
  if (!calHistCache) calHistCache = {};
  if (!calHistCache[kind]) {
    const list = loadJSON(kind === "mcq" ? "rbi_p1_history" : "rbi_history", []);
    calHistCache[kind] = Array.isArray(list) ? list : [];
  }
  return calHistCache[kind];
}

function calExamsByDate() {
  const map = {};
  const push = (raw, item) => {
    if (!raw) return;
    const d = getLocalDateString(new Date(raw));
    (map[d] = map[d] || []).push(item);
  };
  calHistory("mcq").forEach(t => push(t.completedAt || t.date, { kind: "mcq", test: t }));
  calHistory("write").forEach(t => push(t.date, { kind: "write", test: t }));
  return map;
}

function calContext() {
  calHistCache = null;
  const manualByDate = new Map();
  for (const t of cal.todos) {
    const item = {
      id: t.id, source: "manual", date: t.date, title: t.title, type: t.type || "Other",
      detail: t.note || "", subject: "", practice: t.mode || calPracticeForType(t.type), mode: t.mode || calPracticeForType(t.type),
      done: !!t.done, link: t.link || null, auto: !!t.auto,
      test: "", tag: "", createdAt: t.createdAt || 0
    };
    if (!manualByDate.has(t.date)) manualByDate.set(t.date, []);
    manualByDate.get(t.date).push(item);
  }
  manualByDate.forEach(list => list.sort((a, b) => a.createdAt - b.createdAt));
  return { today: calToday(), plan: calPlanIndex(), manualByDate, exams: calExamsByDate(), dayCache: new Map() };
}

function calDayInfo(date, ctx) {
  if (ctx.dayCache.has(date)) return ctx.dayCache.get(date);
  const row = ctx.plan.byDate.get(date) || null;
  const planTodos = calPlanTodos(date, row);
  const todos = planTodos.concat(ctx.manualByDate.get(date) || []);
  const done = todos.filter(t => t.done).length;
  const exams = ctx.exams[date] || [];
  const tests = calPlanTests(row);
  const p2 = row ? parsePlanTopic(row.p2_topic) : null;
  const p1 = row ? parsePlanTopic(row.p1_topic) : null;
  const ca = row ? parsePlanCA(row.ca) : null;
  const hiddenCount = row
    ? CAL_ROUTINE.filter(r => cal.planState.hidden[`d${Number(row.day)}-${r.key}`]).length
    : 0;
  let category = "";
  if (tests.some(t => t.kind === "mix-test")) category = "mix";
  else if (tests.some(t => t.kind === "chapter-test")) category = "chapter";
  else if (tests.some(t => t.kind === "ca-test")) category = "ca";
  else if ((p2 && p2.kind === "buffer") || (p1 && p1.kind === "buffer")) category = "buffer";
  const finished = todos.length > 0 ? done === todos.length : exams.length > 0;
  const info = {
    date, row, todos, done, exams, tests, p2, p1, ca, category, finished, hiddenCount,
    dayNum: row ? Number(row.day) : null,
    total: todos.length,
    missed: date < ctx.today && todos.length > 0 && !finished
  };
  ctx.dayCache.set(date, info);
  return info;
}

function calStreak(ctx) {
  const dates = new Set();
  ctx.plan.byDate.forEach((_, d) => { if (d <= ctx.today) dates.add(d); });
  ctx.manualByDate.forEach((_, d) => { if (d <= ctx.today) dates.add(d); });
  Object.keys(ctx.exams).forEach(d => { if (d <= ctx.today) dates.add(d); });

  const finished = new Set();
  let examsTotal = 0;
  let examsDone = 0;
  dates.forEach(d => {
    const info = calDayInfo(d, ctx);
    if (info.finished) finished.add(d);
    info.todos.forEach(t => {
      if (t.source === "plan" && t.key !== "ca") {
        examsTotal++;
        if (t.done) examsDone++;
      }
    });
  });

  let current = 0;
  let d = finished.has(ctx.today) ? ctx.today : calAddDays(ctx.today, -1);
  while (finished.has(d)) {
    current++;
    d = calAddDays(d, -1);
  }

  let best = 0;
  let run = 0;
  let prev = null;
  [...finished].sort().forEach(x => {
    run = (prev && calDiffDays(prev, x) === 1) ? run + 1 : 1;
    best = Math.max(best, run);
    prev = x;
  });

  return { current, best: Math.max(best, current), todayDone: finished.has(ctx.today), examsTotal, examsDone };
}

function calUpcomingTests(ctx, limit) {
  const list = [];
  if (ctx.plan.totalDays === 0) return list;
  let d = ctx.today < cal.config.startDate ? cal.config.startDate : ctx.today;
  for (let i = 0; i < 120 && list.length < limit; i++) {
    if (ctx.plan.lastDate && d > ctx.plan.lastDate) break;
    const row = ctx.plan.byDate.get(d);
    calPlanTests(row).forEach(t => list.push(Object.assign({ date: d, dayNum: Number(row.day) }, t)));
    d = calAddDays(d, 1);
  }
  return list.slice(0, limit);
}

function calFindManual(id) {
  return cal.todos.find(t => t.id === id) || null;
}

function calSetTodoDone(id, checked) {
  const manual = calFindManual(id);
  if (manual) {
    manual.done = !!checked;
    manual.doneAt = checked ? Date.now() : null;
    calSaveTodos();
  } else {
    if (checked) cal.planState.done[id] = Date.now();
    else delete cal.planState.done[id];
    calSavePlanState();
  }
}

function calAddTodo({ title, type, date, note, mode, auto }) {
  const clean = sanitizeDashes(String(title || "")).trim();
  if (!clean) return null;
  const todo = {
    id: makeId("todo"),
    date: calIsValidDate(date) ? date : calToday(),
    title: clean.slice(0, 300),
    type: TODO_TYPES.some(t => t.value === type) ? type : "Other",
    note: sanitizeDashes(String(note || "")).trim(),
    done: false,
    createdAt: Date.now()
  };
  if (mode) todo.mode = mode;
  if (auto) todo.auto = true;
  cal.todos.push(todo);
  calSaveTodos();
  return todo;
}

function calDeleteTodo(id) {
  const manual = calFindManual(id);
  if (manual) {
    if (!confirm(`Delete the TODO "${manual.title}"?`)) return false;
    cal.todos = cal.todos.filter(t => t.id !== id);
    calSaveTodos();
    return true;
  }
  if (!confirm("Hide this plan TODO for this day? You can restore it from the day panel.")) return false;
  cal.planState.hidden[id] = 1;
  calSavePlanState();
  return true;
}

function calRestoreHidden(dayNum) {
  CAL_ROUTINE.forEach(r => { delete cal.planState.hidden[`d${dayNum}-${r.key}`]; });
  calSavePlanState();
}

function calRememberLaunch(id, target) {
  if (id) saveJSON(CAL_KEYS.launch, { id, target, ts: Date.now() });
  else localStorage.removeItem(CAL_KEYS.launch);
}

function calIsPhase2McqTest(test) {
  const qs = (test && test.questions) || [];
  return qs.length > 0 && qs.every(q => /\b(ESI|Economic|Finance|Management|Phase-2)\b/i.test(String(q.subject || "")));
}

function autoCompleteTodoOnExam(kind, test) {
  calEnsureLoaded();
  if (!test) return;
  const type = test.testType || (kind === "write" ? "Subjective Practice" : "Objective Practice");
  let todo = calTodoForTest(kind, type, test);
  const launch = loadJSON(CAL_KEYS.launch, null);
  if (launch && (launch.target === kind || Date.now() - (launch.ts || 0) >= 24 * 3600 * 1000)) localStorage.removeItem(CAL_KEYS.launch);
  if (!todo) {
    const n = (test.questions || []).length;
    const created = calAddTodo({
      title: `${type} · ${n} ${kind === "mcq" ? "MCQ" : "question"}${n === 1 ? "" : "s"}`,
      type, date: calToday(), mode: kind, auto: true
    });
    todo = created ? { id: created.id, source: "manual" } : null;
  }
  if (todo) calAttachExam(todo, kind, test);
  refreshCalendars();
}

function calActiveLaunch(kind) {
  const launch = loadJSON(CAL_KEYS.launch, null);
  return launch && launch.target === kind && Date.now() - (launch.ts || 0) < 24 * 3600 * 1000 ? launch : null;
}

function calTodoForTest(kind, type, test) {
  const launch = calActiveLaunch(kind);
  if (launch) {
    const t = calFindTodoById(launch.id);
    if (t && !t.link && !t.done && t.type === type && (!t.mode || t.mode === kind)) return t;
  }
  return calFindOpenTestTodo(calToday(), type, kind, test);
}

function calPreviewTodo(kind, type, questions) {
  calEnsureLoaded();
  const t = calTodoForTest(kind, type, { questions: questions || [] });
  return t ? t.title : "";
}

function calFindTodoById(id) {
  if (!id) return null;
  const manual = calFindManual(id);
  if (manual) {
    return { id: manual.id, source: "manual", type: manual.type, mode: manual.mode || calPracticeForType(manual.type), title: manual.title, link: manual.link || null, done: !!manual.done };
  }
  const m = /^d(\d+)-(\w+)$/.exec(id);
  if (!m) return null;
  const date = calAddDays(cal.config.startDate, Number(m[1]) - 1);
  const row = calPlanIndex().byDate.get(date);
  return calPlanTodos(date, row).find(t => t.id === id) || null;
}

function calFindOpenTestTodo(date, type, kind, test) {
  const ctx = calContext();
  const open = calDayInfo(date, ctx).todos.filter(t => !t.done && !t.link && t.type === type && (!t.mode || t.mode === kind));
  if (!open.length) return null;
  if (kind === "mcq" && open.length > 1) {
    const prefer = calIsPhase2McqTest(test) ? ["p2obj", "p1obj", "ca"] : ["p1obj", "ca", "p2obj"];
    for (const key of prefer) {
      const t = open.find(x => x.source === "plan" && x.key === key);
      if (t) return t;
    }
  }
  return open.find(t => t.source === "plan") || open[0];
}

function calAttachExam(todo, kind, test) {
  const link = { kind, testId: test.id, at: Date.now() };
  const finished = kind === "mcq" || calTestFullyScored(test);
  const manual = calFindManual(todo.id);
  if (manual) {
    manual.link = link;
    if (finished) { manual.done = true; manual.doneAt = Date.now(); }
    calSaveTodos();
  } else {
    cal.planState.links[todo.id] = link;
    if (finished) cal.planState.done[todo.id] = Date.now();
    calSavePlanState();
  }
}

function calTestFullyScored(test) {
  const qs = (test && test.questions) || [];
  const scores = (test && test.scores) || {};
  return qs.length > 0 && qs.every(q => scores[q.id] !== null && scores[q.id] !== undefined && scores[q.id] !== "" && !isNaN(scores[q.id]));
}

function calOnTestScored(kind, testId) {
  calEnsureLoaded();
  if (calReconcileLinks(testId)) refreshCalendars();
}

function calReconcileLinks(onlyTestId) {
  const history = loadJSON("rbi_history", []);
  const byId = new Map((Array.isArray(history) ? history : []).map(t => [t.id, t]));
  let changed = false;
  const ready = (link) => link && link.kind === "write" && (!onlyTestId || link.testId === onlyTestId) && byId.has(link.testId) && calTestFullyScored(byId.get(link.testId));
  Object.entries(cal.planState.links).forEach(([id, link]) => {
    if (!cal.planState.done[id] && ready(link)) { cal.planState.done[id] = Date.now(); changed = true; }
  });
  cal.todos.forEach(t => {
    if (!t.done && ready(t.link)) { t.done = true; t.doneAt = Date.now(); changed = true; }
  });
  if (changed) { calSavePlanState(); calSaveTodos(); }
  return changed;
}

function calLinkedResult(link) {
  if (!link) return null;
  const test = calHistory(link.kind === "mcq" ? "mcq" : "write").find(t => t && t.id === link.testId) || null;
  if (!test) return { kind: link.kind, test: null, scoreText: "test deleted from History", pending: false, missing: true };
  if (link.kind === "mcq") {
    return { kind: "mcq", test, scoreText: `${Number(test.score || 0).toFixed(2)} / ${Number(test.maxScore || 0).toFixed(2)} · ${test.accuracy || 0}% accuracy`, pending: false };
  }
  const r = calWriteScore(test);
  return { kind: "write", test, scoreText: r.text, pending: !r.complete };
}

function calWriteScore(test) {
  const qs = test.questions || [];
  const scores = test.scores || {};
  const graded = qs.filter(q => scores[q.id] !== null && scores[q.id] !== undefined && scores[q.id] !== "" && !isNaN(scores[q.id]));
  const total = graded.reduce((a, q) => a + Number(scores[q.id]), 0);
  const max = test.maxMarks || qs.reduce((a, q) => a + (Number(q.marks) || 0), 0);
  const complete = qs.length > 0 && graded.length === qs.length;
  const fmt = (n) => String(Math.round(n * 100) / 100);
  if (complete) return { complete, text: `${fmt(total)} / ${fmt(max)} marks`, total, max };
  return { complete, text: graded.length ? `waiting for grades (${graded.length} of ${qs.length} graded, ${fmt(total)} so far)` : "not graded yet: press AI Analysis on the result", total, max };
}

function calSuggestTestType(mode) {
  calEnsureLoaded();
  const launch = calActiveLaunch(mode);
  if (launch) {
    const t = calFindTodoById(launch.id);
    if (t && calIsTestType(t.type) && !t.link && !t.done) return { type: t.type, title: t.title };
  }
  const ctx = calContext();
  const open = calDayInfo(ctx.today, ctx).todos.filter(t => !t.done && !t.link && calIsTestType(t.type) && (!t.mode || t.mode === mode));
  const test = open.find(t => t.type === "Chapter Test" || t.type === "Mix Test");
  if (test) return { type: test.type, title: test.title };
  const practice = open.find(t => t.type === (mode === "mcq" ? "Objective Practice" : "Subjective Practice"));
  return practice ? { type: practice.type, title: practice.title } : null;
}

function calRoot() {
  return $("screen-calendar");
}

function calTypeOptions(selected) {
  return TODO_TYPES.map(t =>
    `<option value="${escapeHTML(t.value)}" ${t.value === selected ? "selected" : ""}>${escapeHTML(t.value)}</option>`
  ).join("");
}

function calShellHTML() {
  return `
    <div class="setup-header cal-page-head">
      <div class="setup-title-group">
        <h2>Calendar &amp; TODO</h2>
        <p class="setup-subtitle">Daily routine from your study plan: 1 Phase-2 subjective exam, 1 Phase-2 objective exam and 1 Phase-1 objective exam. Test days are tagged on the calendar.</p>
      </div>
    </div>

    <div class="cal-stats" data-role="stats"></div>
    <section class="cal-upcoming" data-role="upcoming" aria-label="Upcoming tests"></section>

    <div class="cal-layout">
      <section class="cal-card" aria-label="Month calendar">
        <div class="cal-toolbar">
          <div class="cal-nav">
            <button type="button" class="cal-nav-btn" data-action="prev" aria-label="Previous month">‹</button>
            <h3 class="cal-month" data-role="month"></h3>
            <button type="button" class="cal-nav-btn" data-action="next" aria-label="Next month">›</button>
          </div>
          <button type="button" class="cal-today-btn" data-action="today">Today</button>
        </div>
        <div class="cal-weekdays">${CAL_WEEKDAYS.map(d => `<span>${d}</span>`).join("")}</div>
        <div class="cal-grid" data-role="grid"></div>
        <div class="cal-legend">
          <span><i class="lg lg-done"></i>All done</span>
          <span><i class="lg lg-partial"></i>In progress</span>
          <span><i class="lg lg-missed"></i>Missed</span>
          <span><i class="lg lg-chapter"></i>Chapter test</span>
          <span><i class="lg lg-mix"></i>Mix test</span>
          <span><i class="lg lg-ca"></i>CA test</span>
          <span><i class="lg lg-buffer"></i>Buffer day</span>
        </div>
      </section>

      <aside class="day-panel" data-role="day" aria-live="polite"></aside>
    </div>

    <details class="cal-settings">
      <summary>
        <span class="cal-settings-title">Study plan settings</span>
        <span class="cal-settings-sub" data-role="plan-summary"></span>
      </summary>
      <div class="cal-settings-body">
        <p class="cal-settings-note">Your timetable gives every day its 3 exam TODOs automatically (the built-in plan has 415 days). Uploading a timetable replaces the current one; removing it clears the plan TODOs. Your own TODOs and test history are never touched.</p>
        <div class="cal-settings-grid">
          <label>Plan start date (Day 1)
            <input type="date" data-role="start-date">
          </label>
          <label>Days already finished
            <input type="number" min="0" step="1" value="0" data-role="days-finished">
          </label>
          <button type="button" data-action="apply-config">Apply</button>
        </div>
        <div class="cal-settings-actions cal-timetable-actions">
          <label class="cal-btn-primary" title="Use your own timetable (.xlsx or .csv) as the study plan">Upload Timetable<input type="file" accept=".xlsx,.csv" data-role="import" hidden></label>
          <button type="button" class="btn-soft btn-soft-danger" data-action="clear-plan" data-role="remove-timetable">Remove Timetable</button>
        </div>
        <details class="cal-more-actions">
          <summary>More options</summary>
          <div class="cal-settings-actions">
            <button type="button" class="btn-soft" data-action="load-official">Use built-in 415-day plan</button>
            <button type="button" class="btn-soft" data-action="template">Download template (.csv)</button>
            <button type="button" class="btn-soft" data-action="export-plan">Export plan (.csv)</button>
            <button type="button" class="btn-soft" data-action="export-todos">Export my TODOs (.csv)</button>
          </div>
        </details>
        <p class="cal-settings-status" data-role="status" aria-live="polite"></p>
      </div>
    </details>
  `;
}

function calRenderStats(root, ctx) {
  const box = root.querySelector('[data-role="stats"]');
  if (!box) return;
  const streak = calStreak(ctx);
  const today = calDayInfo(ctx.today, ctx);

  const y = cal.view.month.getFullYear();
  const mo = cal.view.month.getMonth();
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  let monthDays = 0;
  let monthFinished = 0;
  let monthExams = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = getLocalDateString(new Date(y, mo, d));
    if (ds > ctx.today) break;
    const info = calDayInfo(ds, ctx);
    if (info.total > 0 || info.exams.length > 0) monthDays++;
    if (info.finished) monthFinished++;
    monthExams += info.exams.length;
  }
  const isCurrentMonth = y === new Date().getFullYear() && mo === new Date().getMonth();
  const planPct = streak.examsTotal > 0 ? Math.round((streak.examsDone / streak.examsTotal) * 100) : 0;
  const totalDays = ctx.plan.totalDays;
  const todayExams = today.todos.filter(t => t.source === "plan" && t.key !== "ca");
  const todayExamsDone = todayExams.filter(t => t.done).length;
  let streakNote;
  if (streak.current === 0) streakNote = "Finish all of today's TODOs to start";
  else streakNote = streak.todayDone ? "Today is done" : "Finish today to keep it";

  box.innerHTML = `
    <div class="cal-stat cal-stat-streak">
      <div class="cal-stat-label">Streak</div>
      <div class="cal-stat-value">${streak.current} <small>day${streak.current === 1 ? "" : "s"}</small></div>
      <div class="cal-stat-sub">Best ${streak.best} · ${escapeHTML(streakNote)}</div>
    </div>
    <div class="cal-stat">
      <div class="cal-stat-label">Today's 3 exams</div>
      <div class="cal-stat-value">${todayExamsDone}<small> / ${todayExams.length} done</small></div>
      <div class="cal-progress"><span style="width:${todayExams.length ? Math.round(todayExamsDone / todayExams.length * 100) : 0}%"></span></div>
    </div>
    <div class="cal-stat">
      <div class="cal-stat-label">${CAL_MONTHS[mo]}${isCurrentMonth ? " so far" : ""}</div>
      <div class="cal-stat-value">${monthFinished}<small> / ${monthDays} days complete</small></div>
      <div class="cal-stat-sub">${monthExams} test${monthExams === 1 ? "" : "s"} submitted</div>
    </div>
    <div class="cal-stat">
      <div class="cal-stat-label">Plan exams done</div>
      <div class="cal-stat-value">${planPct}<small>%</small></div>
      <div class="cal-stat-sub">${totalDays ? (today.dayNum ? `Today is Day ${today.dayNum} of ${totalDays}` : (ctx.today < cal.config.startDate ? `Plan starts ${calShortDate(cal.config.startDate)}` : `${totalDays}-day plan finished`)) : "No study plan loaded"}</div>
    </div>
  `;
}

function calTestPill(t, withFocus) {
  return `<span class="cal-test-pill kind-${t.kind}"><b>${t.tag}</b> ${escapeHTML(calShortTestLabel(t.kind, t.label))}${withFocus ? ` · ${escapeHTML(t.focus)}` : ""}</span>`;
}

function calRenderUpcoming(root, ctx) {
  const box = root.querySelector('[data-role="upcoming"]');
  if (!box) return;
  const tests = calUpcomingTests(ctx, 6);
  if (tests.length === 0) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.innerHTML = `
    <div class="cal-upcoming-head">
      <h3>Upcoming tests</h3>
      <span>From your study plan</span>
    </div>
    <div class="cal-upcoming-list">
      ${tests.map(t => {
        const diff = calDiffDays(ctx.today, t.date);
        const when = diff === 0 ? "Today" : (diff === 1 ? "Tomorrow" : `In ${diff} days`);
        return `
          <button type="button" class="cal-up-item kind-${t.kind} ${diff === 0 ? "is-today" : ""}" data-action="goto" data-date="${t.date}">
            <span class="cal-up-when">${escapeHTML(when)} · ${escapeHTML(calShortDate(t.date))}</span>
            <span class="cal-up-title"><b>${t.tag}</b> ${escapeHTML(t.label)}</span>
            <span class="cal-up-focus">${escapeHTML(t.focus)}</span>
          </button>`;
      }).join("")}
    </div>
  `;
}

function calCellHTML(date, ctx, monthIndex) {
  const info = calDayInfo(date, ctx);
  const d = calParse(date);
  const isOther = d.getMonth() !== monthIndex;
  const classes = ["cal-cell"];
  if (isOther) classes.push("is-other");
  if (date === ctx.today) classes.push("is-today");
  if (date === cal.view.selected) classes.push("is-selected");
  if (info.category) classes.push(`cat-${info.category}`);
  if (info.finished) classes.push("is-finished");
  else if (info.missed) classes.push("is-missed");
  else if (info.done > 0) classes.push("is-partial");

  const testPills = info.tests.map(t => calTestPill(t, false)).join("");
  const bufferTag = !info.tests.length && info.category === "buffer" ? `<span class="cal-test-pill kind-buffer">Buffer day</span>` : "";
  const focusLines = [];
  if (info.p2) focusLines.push(`<span class="cal-focus"><b>P2</b> ${escapeHTML(info.p2.focus)}</span>`);
  if (info.p1) focusLines.push(`<span class="cal-focus"><b>P1</b> ${escapeHTML(info.p1.focus)}</span>`);
  const chips = info.todos.filter(t => t.source === "plan").map(t => {
    const r = CAL_ROUTINE.find(x => x.key === t.key);
    return `<span class="cal-chip ${t.done ? "done" : ""}">${escapeHTML(r ? r.chip : "TODO")}</span>`;
  }).join("");
  const manualTodos = info.todos.filter(t => t.source === "manual");
  const maxManual = 2;
  const manualLines = manualTodos.slice(0, maxManual).map(t =>
    `<span class="cal-mine ${t.done ? "done" : ""}">${escapeHTML(t.title)}</span>`
  ).join("");
  const more = manualTodos.length > maxManual ? `<span class="cal-more">+${manualTodos.length - maxManual} more</span>` : "";
  const dots = info.todos.slice(0, 6).map(t => `<i class="${t.done ? "done" : ""}"></i>`).join("");
  const examHTML = info.exams.length > 0
    ? `<span class="cal-exam">${info.exams.length} test${info.exams.length === 1 ? "" : "s"} taken</span>`
    : "";
  const pct = info.total > 0 ? Math.round((info.done / info.total) * 100) : 0;
  const testsText = info.tests.length ? `, tests: ${info.tests.map(t => `${t.tag} ${t.label}`).join(", ")}` : "";
  const label = `${d.toDateString()}${info.total ? `, ${info.done} of ${info.total} TODOs done` : ""}${testsText}`;

  return `
    <button type="button" class="${classes.join(" ")}" data-date="${date}" aria-label="${escapeHTML(label)}" aria-pressed="${date === cal.view.selected}">
      <span class="cal-cell-head">
        <span class="cal-daynum">${d.getDate()}</span>
        ${info.dayNum ? `<span class="cal-planday">D${info.dayNum}</span>` : ""}
        ${info.total ? `<span class="cal-count">${info.done}/${info.total}</span>` : ""}
      </span>
      ${testPills || bufferTag ? `<span class="cal-tests">${testPills}${bufferTag}</span>` : ""}
      ${focusLines.join("")}
      ${chips ? `<span class="cal-chips">${chips}</span>` : ""}
      ${manualLines ? `<span class="cal-mine-list">${manualLines}${more}</span>` : ""}
      ${examHTML}
      ${dots ? `<span class="cal-dots">${dots}</span>` : ""}
      ${info.total ? `<span class="cal-cell-bar"><span style="width:${pct}%"></span></span>` : ""}
    </button>
  `;
}

function calRenderGrid(root, ctx) {
  const y = cal.view.month.getFullYear();
  const mo = cal.view.month.getMonth();
  const monthEl = root.querySelector('[data-role="month"]');
  if (monthEl) monthEl.textContent = `${CAL_MONTHS[mo]} ${y}`;

  const first = new Date(y, mo, 1);
  const start = getLocalDateString(new Date(y, mo, 1 - first.getDay()));
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const cells = Math.ceil((first.getDay() + daysInMonth) / 7) * 7;

  let html = "";
  for (let i = 0; i < cells; i++) {
    html += calCellHTML(calAddDays(start, i), ctx, mo);
  }
  const grid = root.querySelector('[data-role="grid"]');
  if (grid) grid.innerHTML = html;
}

function calExamCardHTML(item) {
  const exam = item.test;
  const type = exam.testType || (item.kind === "mcq" ? "Objective test" : "Subjective test");
  const time = new Date(item.kind === "mcq" ? (exam.completedAt || exam.date) : exam.date).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (item.kind === "mcq") {
    const score = Number(exam.score || 0).toFixed(2);
    const max = Number(exam.maxScore || (exam.questions || []).length || 0).toFixed(2);
    return `
      <button type="button" class="dp-exam" data-action="review-exam" data-kind="mcq" data-id="${escapeHTML(exam.id)}" title="Open the full result">
        <span class="dp-exam-main">
          <span class="dp-exam-type">${escapeHTML(type)} · objective · ${escapeHTML(time)}</span>
          <strong>${score} / ${max}</strong>
          <span>${exam.accuracy || 0}% accuracy · ${exam.correctCount || 0} correct · ${exam.incorrectCount || 0} wrong · ${exam.unattemptedCount || 0} left · time ${formatHM(exam.timeSpent || 0)}</span>
        </span>
        <span class="dp-exam-open" aria-hidden="true">Open result ›</span>
      </button>`;
  }
  const r = calWriteScore(exam);
  const words = Object.values(exam.answers || {}).reduce((a, x) => a + (x.wordCount || 0), 0);
  return `
    <button type="button" class="dp-exam write" data-action="review-exam" data-kind="write" data-id="${escapeHTML(exam.id)}" title="Open the full result and AI assessment">
      <span class="dp-exam-main">
        <span class="dp-exam-type">${escapeHTML(type)} · subjective · ${escapeHTML(time)}</span>
        <strong>${r.complete ? escapeHTML(r.text) : `<span class="dp-pending">${escapeHTML(r.text)}</span>`}</strong>
        <span>${(exam.questions || []).length} question(s) · ${words} words · time ${formatHM(exam.usedSeconds || 0)}</span>
      </span>
      <span class="dp-exam-open" aria-hidden="true">Open result ›</span>
    </button>`;
}

function calExamTime(item) {
  const t = item.test || {};
  return new Date(item.kind === "mcq" ? (t.completedAt || t.date) : t.date).getTime() || 0;
}

function calTodoItemHTML(t) {
  const isTest = calIsTestType(t.type);
  const res = t.link ? calLinkedResult(t.link) : null;
  let practiceBtn = "";
  if (!t.done && !t.link && isTest) {
    const target = t.mode || "";
    if (target !== "write") practiceBtn += `<button type="button" class="todo-go" data-action="practice" data-target="mcq" data-id="${escapeHTML(t.id)}" title="Open the objective (MCQ) test setup">Start objective</button>`;
    if (target !== "mcq") practiceBtn += `<button type="button" class="todo-go" data-action="practice" data-target="write" data-id="${escapeHTML(t.id)}" title="Open the descriptive (subjective) test setup">Start subjective</button>`;
  }
  const meta = [
    t.tag ? `<span class="todo-tag tag-${t.tag.toLowerCase()}">${t.tag}</span>` : "",
    `<span class="todo-type">${calTypeIcon(t.type)} ${escapeHTML(t.type)}</span>`,
    t.subject ? `<span class="todo-subject">${escapeHTML(t.subject)}</span>` : "",
    t.source === "manual" ? `<span class="todo-src mine">${t.auto ? "From your test" : "My TODO"}</span>` : ""
  ].join("");
  const check = isTest
    ? `<span class="todo-auto ${t.done ? "done" : (t.link ? "pending" : "")}" title="${t.done ? "Done: completed by your test" : (t.link ? "Waiting for the AI grades of your test" : "Ticks itself when you submit this test")}" aria-label="${t.done ? "Done" : "Not done yet"}">${t.done ? '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ""}</span>`
    : `<label class="todo-check" title="${t.done ? "Mark as not done" : "Mark as done"}">
        <input type="checkbox" class="todo-checkbox" data-id="${escapeHTML(t.id)}" ${t.done ? "checked" : ""} aria-label="${escapeHTML(t.title)}">
        <span class="todo-box" aria-hidden="true"></span>
      </label>`;
  let resultHTML = "";
  if (res) {
    resultHTML = res.missing
      ? `<div class="todo-result muted">Linked test was deleted from History.</div>`
      : `<button type="button" class="todo-result ${res.pending ? "pending" : ""}" data-action="review-exam" data-kind="${res.kind}" data-id="${escapeHTML(res.test.id)}"><span>${res.pending ? "Submitted" : "Score"}: <strong>${escapeHTML(res.scoreText)}</strong></span><span class="todo-result-open">Open result ›</span></button>`;
  } else if (isTest && !t.done) {
    const which = t.mode === "write" ? "subjective test" : t.mode === "mcq" ? "objective test" : "test";
    resultHTML = `<div class="todo-hint">Ticks itself when you submit a ${which} marked “${escapeHTML(t.type)}”${t.mode === "mcq" ? "" : " (a subjective test counts once it is graded)"}.</div>`;
  }
  return `
    <li class="todo-item ${t.done ? "is-done" : ""} ${isTest ? "is-test-type" : ""} ${t.test ? `is-test test-${t.test}` : ""}" data-id="${escapeHTML(t.id)}">
      ${check}
      <div class="todo-body">
        <div class="todo-title">${escapeHTML(t.title)}</div>
        ${t.detail ? `<div class="todo-detail">${escapeHTML(t.detail)}</div>` : ""}
        <div class="todo-meta">${meta}</div>
        ${resultHTML}
        ${practiceBtn ? `<div class="todo-go-row">${practiceBtn}</div>` : ""}
      </div>
      <div class="todo-actions">
        <button type="button" class="todo-icon-btn" data-action="edit" data-id="${escapeHTML(t.id)}" title="Edit TODO" aria-label="Edit TODO"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M11.3 2.3a1.5 1.5 0 0 1 2.1 2.1L5.6 12.2 2.5 13l.8-3.1 8-7.6z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg></button>
        <button type="button" class="todo-icon-btn danger-icon" data-action="delete" data-id="${escapeHTML(t.id)}" title="${t.source === "plan" ? "Hide plan TODO" : "Delete TODO"}" aria-label="${t.source === "plan" ? "Hide plan TODO" : "Delete TODO"}"><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
      </div>
    </li>`;
}

function calFocusRow(tag, subject, topic) {
  if (!topic) return "";
  const isTest = calIsTestKind(topic.kind);
  const pill = isTest
    ? `<span class="cal-test-pill kind-${topic.kind}">${escapeHTML(topic.label)}</span>`
    : (topic.label ? `<span class="dp-focus-kind">${escapeHTML(topic.label)}</span>` : "");
  return `
    <div class="dp-focus-row ${isTest ? `is-test kind-${topic.kind}` : ""}">
      <span class="todo-tag tag-${tag.toLowerCase()}">${tag}</span>
      <div>
        <div class="dp-focus-label">${escapeHTML(subject || tag)} ${pill}</div>
        <div class="dp-focus-text">${escapeHTML(topic.focus)}</div>
      </div>
    </div>`;
}

function calRenderDayPanel(root, ctx) {
  const panel = root.querySelector('[data-role="day"]');
  if (!panel) return;
  const date = cal.view.selected;
  const info = calDayInfo(date, ctx);
  const d = calParse(date);
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" });
  const longDate = d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  const diff = calDiffDays(ctx.today, date);
  const rel = diff === 0 ? `Today · ${weekday}` : (diff === 1 ? `Tomorrow · ${weekday}` : (diff === -1 ? `Yesterday · ${weekday}` : weekday));

  const badges = [];
  if (info.dayNum) badges.push(`<span class="dp-badge">Day ${info.dayNum} of ${ctx.plan.totalDays}</span>`);
  info.tests.forEach(t => badges.push(calTestPill(t, false)));
  if (!info.tests.length && info.category === "buffer") badges.push(`<span class="cal-test-pill kind-buffer">Buffer day</span>`);
  if (info.finished) badges.push(`<span class="dp-badge done">Day complete</span>`);
  else if (info.missed) badges.push(`<span class="dp-badge missed">Missed</span>`);

  let focusHTML = "";
  if (info.row) {
    const rows = [
      calFocusRow("P2", sanitizeDashes(info.row.p2_subject || ""), info.p2),
      calFocusRow("P1", sanitizeDashes(info.row.p1_subject || ""), info.p1),
      info.ca ? calFocusRow("CA", "Current affairs", { kind: info.ca.kind, label: info.ca.kind === "ca-test" ? "CA Objective Test" : "Reading", focus: info.ca.focus }) : ""
    ].join("");
    focusHTML = `<div class="dp-focus">${rows}</div>`;
  } else if (ctx.plan.totalDays > 0) {
    focusHTML = `<div class="dp-focus muted">This day is outside your study plan. Add your own TODOs below.</div>`;
  } else {
    focusHTML = `<div class="dp-focus muted">No timetable loaded. Open “Study plan settings” below and press Upload Timetable.</div>`;
  }

  const pct = info.total ? Math.round((info.done / info.total) * 100) : 0;
  const examsHTML = info.exams.slice().sort((a, b) => calExamTime(a) - calExamTime(b)).map(calExamCardHTML).join("");
  const listHTML = info.todos.length > 0
    ? `<ul class="todo-list">${info.todos.map(calTodoItemHTML).join("")}</ul>`
    : `<div class="todo-empty">No TODOs for this day yet.<br>Add one below.</div>`;
  const hiddenHTML = info.hiddenCount > 0
    ? `<button type="button" class="todo-restore" data-action="restore-hidden" data-day="${info.dayNum}">${info.hiddenCount} hidden plan TODO${info.hiddenCount === 1 ? "" : "s"} · Restore</button>`
    : "";

  panel.innerHTML = `
    <div class="dp-head">
      <div>
        <div class="dp-weekday">${escapeHTML(rel)}</div>
        <h3 class="dp-date">${escapeHTML(longDate)}</h3>
      </div>
      ${date !== ctx.today ? `<button type="button" class="cal-today-btn" data-action="today">Go to today</button>` : ""}
    </div>
    ${badges.length ? `<div class="dp-badges">${badges.join("")}</div>` : ""}
    ${focusHTML}
    ${examsHTML ? `<div class="dp-section-head"><h4>Tests you took</h4><span>${info.exams.length} · click one to open its result</span></div><div class="dp-exams">${examsHTML}</div>` : ""}
    <div class="dp-section-head">
      <h4>TODO</h4>
      <span>${info.done} of ${info.total} done</span>
    </div>
    <div class="cal-progress"><span style="width:${pct}%"></span></div>
    ${listHTML}
    ${hiddenHTML}
    <form class="todo-add" data-role="add-form" autocomplete="off">
      <label class="todo-add-label">Add your own TODO
        <input type="text" name="title" placeholder="e.g. Revise repo rate notes" maxlength="300" required>
      </label>
      <div class="todo-add-row">
        <select name="type" aria-label="TODO type">${calTypeOptions(cal.view.lastType)}</select>
        <input type="date" name="date" value="${date}" aria-label="TODO date" required>
        <button type="submit">+ Add TODO</button>
      </div>
      <p class="todo-add-note">Objective Practice, Subjective Practice, Mix Test and Chapter Test TODOs tick themselves when you submit that test. Study and Other you tick yourself.</p>
    </form>
  `;
}

function calRenderSettings(root, ctx) {
  const startInput = root.querySelector('[data-role="start-date"]');
  if (startInput && document.activeElement !== startInput) startInput.value = cal.config.startDate;
  const removeBtn = root.querySelector('[data-role="remove-timetable"]');
  if (removeBtn) removeBtn.disabled = cal.config.source === "none" || ctx.plan.totalDays === 0;
  const summary = root.querySelector('[data-role="plan-summary"]');
  if (summary) {
    summary.textContent = (cal.config.source === "none" || ctx.plan.totalDays === 0)
      ? "No timetable loaded"
      : `${cal.config.source === "custom" ? "Uploaded" : "Built-in"} ${ctx.plan.totalDays}-day timetable · Day 1 = ${calParse(cal.config.startDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
  }
}

function renderCalendar() {
  calEnsureLoaded();
  const root = calRoot();
  if (!root) return;
  if (!cal.built) {
    root.innerHTML = calShellHTML();
    cal.built = true;
    calWire(root);
  }
  calReconcileLinks();
  const ctx = calContext();
  calRenderStats(root, ctx);
  calRenderUpcoming(root, ctx);
  calRenderGrid(root, ctx);
  calRenderDayPanel(root, ctx);
  calRenderSettings(root, ctx);
}

function refreshCalendars() {
  const root = calRoot();
  if (root && !root.hidden && cal.built) renderCalendar();
}

function calSetStatus(root, text, isError) {
  const el = root.querySelector('[data-role="status"]');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("is-error", !!isError);
  clearTimeout(el._timer);
  if (text) el._timer = setTimeout(() => { el.textContent = ""; }, 8000);
}

function calSelectDate(date) {
  cal.view.selected = date;
  const d = calParse(date);
  if (d.getFullYear() !== cal.view.month.getFullYear() || d.getMonth() !== cal.view.month.getMonth()) {
    cal.view.month = new Date(d.getFullYear(), d.getMonth(), 1);
  }
}

function calWire(root) {
  root.addEventListener("click", (e) => {
    const cell = e.target.closest(".cal-cell");
    if (cell && cell.dataset.date) {
      calSelectDate(cell.dataset.date);
      renderCalendar();
      if (window.matchMedia("(max-width: 960px)").matches) {
        const panel = root.querySelector('[data-role="day"]');
        if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }

    const btn = e.target.closest("[data-action]");
    if (!btn || !root.contains(btn)) return;
    const action = btn.dataset.action;

    if (action === "prev" || action === "next") {
      const m = cal.view.month;
      cal.view.month = new Date(m.getFullYear(), m.getMonth() + (action === "prev" ? -1 : 1), 1);
      renderCalendar();
    } else if (action === "today") {
      calSelectDate(calToday());
      renderCalendar();
    } else if (action === "goto") {
      calSelectDate(btn.dataset.date);
      renderCalendar();
      const panel = root.querySelector('[data-role="day"]');
      if (panel && window.matchMedia("(max-width: 960px)").matches) panel.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (action === "edit") {
      openTodoModal(btn.dataset.id);
    } else if (action === "delete") {
      if (calDeleteTodo(btn.dataset.id)) renderCalendar();
    } else if (action === "restore-hidden") {
      calRestoreHidden(btn.dataset.day);
      renderCalendar();
    } else if (action === "practice") {
      calGoPractice(btn.dataset.target, btn.dataset.id);
    } else if (action === "review-exam") {
      calReviewExam(btn.dataset.kind, btn.dataset.id);
    } else if (action === "apply-config") {
      calApplyConfig(root);
    } else if (action === "load-official") {
      calLoadOfficial(root);
    } else if (action === "template") {
      calDownloadTemplate();
    } else if (action === "export-plan") {
      calExportPlan(root);
    } else if (action === "export-todos") {
      calExportTodos(root);
    } else if (action === "clear-plan") {
      calClearPlan(root);
    }
  });

  root.addEventListener("change", (e) => {
    if (e.target.classList.contains("todo-checkbox")) {
      const t = calFindTodoById(e.target.dataset.id);
      if (t && calIsTestType(t.type)) { renderCalendar(); return; }
      calSetTodoDone(e.target.dataset.id, e.target.checked);
      renderCalendar();
    } else if (e.target.matches('[data-role="import"]')) {
      calImportFile(root, e.target);
    } else if (e.target.matches('.todo-add select[name="type"]')) {
      cal.view.lastType = e.target.value;
    }
  });

  root.addEventListener("submit", (e) => {
    const form = e.target.closest('[data-role="add-form"]');
    if (!form) return;
    e.preventDefault();
    const title = form.elements.title.value;
    const type = form.elements.type.value;
    const date = calIsValidDate(form.elements.date.value) ? form.elements.date.value : cal.view.selected;
    if (!sanitizeDashes(title).trim()) return;
    cal.view.lastType = type;
    calAddTodo({ title, type, date });
    calSelectDate(date);
    renderCalendar();
    const input = root.querySelector('[data-role="add-form"] input[name="title"]');
    if (input) input.focus();
  });
}

function calGoPractice(target, todoId) {
  calRememberLaunch(todoId, target);
  if (target === "mcq") {
    setPhase("phase1");
    renderP1SetupList();
  } else {
    setPhase("phase2");
    renderSetupList();
  }
  showScreen("setup");
}

function calReviewExam(kind, id) {
  if (kind === "mcq") {
    setPhase("phase1");
    state.returnTo = "calendar";
    reviewP1HistoricalTest(id);
    return;
  }
  const history = loadJSON("rbi_history", []);
  const test = (Array.isArray(history) ? history : []).find(t => t && t.id === id);
  if (!test) return;
  setPhase("phase2");
  state.returnTo = "calendar";
  renderResult(test);
  showScreen("result");
}

function calReadConfigInputs(root) {
  const startInput = root.querySelector('[data-role="start-date"]');
  const daysInput = root.querySelector('[data-role="days-finished"]');
  const start = startInput && calIsValidDate(startInput.value) ? startInput.value : cal.config.startDate;
  const days = Math.max(0, parseInt(daysInput ? daysInput.value : "0", 10) || 0);
  return { start, days };
}

function calMarkDaysFinished(days) {
  if (days <= 0) return 0;
  let count = 0;
  calPlanIndex().byDate.forEach((row, date) => {
    if (Number(row.day) > days) return;
    calPlanTodos(date, row).forEach(t => {
      if (!cal.planState.done[t.id]) {
        cal.planState.done[t.id] = Date.now();
        count++;
      }
    });
  });
  calSavePlanState();
  return count;
}

function calApplyConfig(root) {
  const { start, days } = calReadConfigInputs(root);
  cal.config.startDate = start;
  if (cal.config.source === "none") cal.config.source = cal.customPlan.length ? "custom" : "official";
  calSaveConfig();
  calInvalidatePlan();
  const marked = calMarkDaysFinished(days);
  calSelectDate(calToday());
  renderCalendar();
  calSetStatus(root, `Day 1 of the plan is ${start}.${days > 0 ? ` Days 1-${days} marked done (${marked} TODOs).` : ""}`);
}

function calLoadOfficial(root) {
  if (typeof RBI_OFFICIAL_SCHEDULE_DATA === "undefined") {
    calSetStatus(root, "The built-in plan file (schedule_data.js) is missing.", true);
    return;
  }
  if (cal.config.source === "custom" && !confirm("Replace your imported plan with the built-in 415-day plan? Your own TODOs are kept.")) return;
  const { start, days } = calReadConfigInputs(root);
  cal.config.source = "official";
  cal.config.startDate = start;
  calSaveConfig();
  calInvalidatePlan();
  calMarkDaysFinished(days);
  renderCalendar();
  calSetStatus(root, `Built-in ${RBI_OFFICIAL_SCHEDULE_DATA.length}-day plan loaded, Day 1 = ${start}.`);
}

function calClearPlan(root) {
  if (cal.config.source === "none") {
    calSetStatus(root, "No timetable is loaded.", true);
    return;
  }
  if (!confirm("Remove the timetable? Its exam TODOs disappear from the calendar; your own TODOs and test history stay. You can upload a timetable again any time.")) return;
  cal.config.source = "none";
  calSaveConfig();
  calInvalidatePlan();
  renderCalendar();
  calSetStatus(root, "Timetable removed. Use Upload Timetable (or More options > Use built-in 415-day plan) to load one again.");
}

function calCsvCell(v) {
  return `"${String(v === undefined || v === null ? "" : v).replace(/"/g, '""')}"`;
}

function calDownloadTemplate() {
  const csv = [
    "Day,Subject (Phase-2),Topic (Phase-2),Subject (Phase-1),Topic (Phase-1),Current Affairs",
    "1,Economics,National Income - Class 1,English Objective,Basics of Grammar - Class 1,",
    "2,Economics,National Income - Class 2,English Objective,Basics of Grammar - Class 2,Weekly Spotlight + Weekly PIB (Reading) - Week 1",
    "3,Economics,National Income - Practice,English Objective,Objective Practice - Basics of Grammar,",
    "4,Economics,Chapter Test (Ch 1): Objective Test + Subjective Test - National Income,English Objective,Chapter Test (Ch 1): Objective Test - Basics of Grammar,",
    "5,Economics,Buffer Day (Ch 1) - Revision,English Objective,Buffer Day (Ch 1) - Revision,Objective Tests - Weekly Spotlight & Weekly PIB (Week 1)"
  ].join("\n");
  downloadText("RBI_Study_Plan_Template.csv", csv);
}

function calExportPlan(root) {
  const rows = calPlanRows();
  if (rows.length === 0) {
    calSetStatus(root, "No plan loaded, nothing to export.", true);
    return;
  }
  const lines = ["Day,Date,Subject (Phase-2),Topic (Phase-2),Subject (Phase-1),Topic (Phase-1),Current Affairs"];
  rows.forEach(r => {
    lines.push([r.day, calAddDays(cal.config.startDate, Number(r.day) - 1), r.p2_subject, r.p2_topic, r.p1_subject, r.p1_topic, r.ca].map(calCsvCell).join(","));
  });
  downloadText(`RBI_Study_Plan_${calToday()}.csv`, lines.join("\n"));
}

function calExportTodos(root) {
  if (cal.todos.length === 0) {
    calSetStatus(root, "You have not added any TODOs of your own yet.", true);
    return;
  }
  const lines = ["Date,Type,Task,Note,Status"];
  [...cal.todos].sort((a, b) => a.date.localeCompare(b.date)).forEach(t => {
    lines.push([t.date, t.type, t.title, t.note || "", t.done ? "done" : "pending"].map(calCsvCell).join(","));
  });
  downloadText(`RBI_My_TODOs_${calToday()}.csv`, lines.join("\n"));
}

async function calImportFile(root, input) {
  const file = input.files && input.files[0];
  if (!file) return;
  calSetStatus(root, `Reading ${file.name}…`);
  try {
    let rows;
    if (/\.xlsx$/i.test(file.name)) {
      try {
        rows = await parseXLSX(await file.arrayBuffer());
      } catch (xlsxErr) {
        throw new Error("Could not read this Excel file. Save it as .xlsx or .csv and try again.");
      }
    } else if (/\.csv$/i.test(file.name)) {
      rows = parseCSV(await file.text());
    } else {
      throw new Error("Please choose an .xlsx or .csv file.");
    }
    if (!rows || rows.length < 2) throw new Error("The sheet has no data rows.");

    const headers = rows[0].map(h => String(h || "").trim().toLowerCase());
    const col = (...keys) => headers.findIndex(h => keys.some(k => h.includes(k)));
    const isPhaseCol = (h, n) => new RegExp(`phase[\\s-]?${n}\\b|\\bp${n}\\b`).test(h);
    const isPlan = headers.some(h => isPhaseCol(h, 1) || isPhaseCol(h, 2)) && col("topic") !== -1;

    if (isPlan) {
      const dayCol = col("day");
      const p2Sub = headers.findIndex(h => h.includes("subject") && isPhaseCol(h, 2));
      const p2Top = headers.findIndex(h => h.includes("topic") && isPhaseCol(h, 2));
      const p1Sub = headers.findIndex(h => h.includes("subject") && isPhaseCol(h, 1));
      const p1Top = headers.findIndex(h => h.includes("topic") && isPhaseCol(h, 1));
      const caCol = col("current affairs", "spotlight");
      const get = (r, i) => (i >= 0 ? sanitizeDashes(String(r[i] === undefined ? "" : r[i]).trim()) : "");
      const plan = [];
      const seen = new Set();
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r.some(c => String(c === undefined ? "" : c).trim())) continue;
        const day = parseInt(get(r, dayCol), 10) || plan.length + 1;
        if (seen.has(day)) continue;
        seen.add(day);
        plan.push({ day, p2_subject: get(r, p2Sub), p2_topic: get(r, p2Top), p1_subject: get(r, p1Sub), p1_topic: get(r, p1Top), ca: get(r, caCol) });
      }
      if (plan.length === 0) throw new Error("No plan rows found.");
      if (!confirm(`Use "${file.name}" (${plan.length} days) as your study plan? It replaces the current plan. Your own TODOs and ticks are kept.`)) {
        calSetStatus(root, "Import cancelled.");
        return;
      }
      const { start, days } = calReadConfigInputs(root);
      cal.customPlan = plan.sort((a, b) => a.day - b.day);
      saveJSON(CAL_KEYS.customPlan, cal.customPlan);
      cal.config.source = "custom";
      cal.config.startDate = start;
      calSaveConfig();
      calInvalidatePlan();
      calMarkDaysFinished(days);
      renderCalendar();
      const tests = plan.reduce((n, r) => n + calPlanTests(r).length, 0);
      calSetStatus(root, `Imported a ${plan.length}-day plan (${tests} tests), Day 1 = ${start}.`);
      return;
    }

    const dateCol = col("date", "when");
    const taskCol = col("task", "topic", "title", "todo", "description", "chapter");
    if (dateCol === -1 || taskCol === -1) throw new Error("Need a Date column and a Task/Topic column (or use the plan template).");
    const typeCol = col("type", "category");
    const noteCol = col("note", "subject", "paper");
    const statusCol = col("status", "done", "completed");
    let added = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const title = sanitizeDashes(String(r[taskCol] || "").trim());
      if (!title) continue;
      const typeText = typeCol >= 0 ? String(r[typeCol] || "").trim().toLowerCase() : "";
      const legacy = Object.keys(CAL_LEGACY_TYPES).find(k => k.toLowerCase() === typeText);
      const type = TODO_TYPES.find(t => t.value.toLowerCase() === typeText) || (legacy ? { value: CAL_LEGACY_TYPES[legacy] } : null);
      const todo = calAddTodo({
        title,
        type: type ? type.value : "Other",
        date: parseScheduleDate(r[dateCol]),
        note: noteCol >= 0 ? String(r[noteCol] || "") : ""
      });
      if (todo && statusCol >= 0 && /^(done|completed|yes|true|1|finished)$/i.test(String(r[statusCol] || "").trim())) {
        todo.done = true;
      }
      if (todo) added++;
    }
    calSaveTodos();
    renderCalendar();
    calSetStatus(root, added > 0 ? `Added ${added} TODO(s) from ${file.name}.` : "No TODO rows found in the file.", added === 0);
  } catch (err) {
    console.error("Calendar import error:", err);
    calSetStatus(root, `Import failed: ${err.message}`, true);
  } finally {
    input.value = "";
  }
}

function openTodoModal(id) {
  const modal = $("todo-modal");
  const form = $("todo-modal-form");
  if (!modal || !form) return;
  let todo = calFindManual(id);
  let source = "manual";
  if (!todo) {
    const info = calDayInfo(cal.view.selected, calContext());
    todo = info.todos.find(t => t.id === id);
    source = "plan";
  }
  if (!todo) return;
  cal.editing = { id, source };
  form.elements.title.value = todo.title || "";
  form.elements.type.innerHTML = calTypeOptions(todo.type);
  form.elements.date.value = todo.date;
  form.elements.note.value = source === "plan" ? (todo.detail || "") : (todo.note || "");
  const hint = $("todo-modal-hint");
  if (hint) {
    hint.textContent = source === "plan"
      ? "This TODO comes from the study plan. Saving turns it into your own TODO (the plan copy is hidden, and can be restored from the day panel)."
      : "";
  }
  modal.hidden = false;
  setTimeout(() => form.elements.title.focus(), 0);
}

function closeTodoModal() {
  const modal = $("todo-modal");
  if (modal) modal.hidden = true;
  cal.editing = null;
}

function saveTodoModal(e) {
  e.preventDefault();
  const form = $("todo-modal-form");
  const ed = cal.editing;
  if (!form || !ed) return;
  const title = sanitizeDashes(form.elements.title.value).trim();
  const date = form.elements.date.value;
  if (!title || !calIsValidDate(date)) return;
  const type = form.elements.type.value;
  const note = form.elements.note.value;

  if (ed.source === "manual") {
    const todo = calFindManual(ed.id);
    if (todo) {
      todo.title = title.slice(0, 300);
      todo.type = type;
      todo.date = date;
      todo.note = sanitizeDashes(note).trim();
      calSaveTodos();
    }
  } else {
    const wasDone = !!cal.planState.done[ed.id];
    const original = calFindTodoById(ed.id);
    const link = cal.planState.links[ed.id] || null;
    cal.planState.hidden[ed.id] = 1;
    calSavePlanState();
    const todo = calAddTodo({ title, type, date, note, mode: original && original.mode });
    if (todo && (wasDone || link)) {
      todo.done = wasDone;
      if (link) todo.link = link;
      calSaveTodos();
    }
  }
  calSelectDate(date);
  closeTodoModal();
  renderCalendar();
}

function initCalendar() {
  calEnsureLoaded();
  const form = $("todo-modal-form");
  if (form) {
    form.addEventListener("submit", saveTodoModal);
    form.addEventListener("click", (e) => {
      if (e.target.closest('[data-action="cancel"]')) closeTodoModal();
    });
  }
  const modal = $("todo-modal");
  if (modal) {
    modal.addEventListener("click", (e) => { if (e.target === modal) closeTodoModal(); });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && !modal.hidden) closeTodoModal();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshCalendars();
  });
}
