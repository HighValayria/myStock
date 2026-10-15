"use strict";
const assert = require("assert/strict");
const path = require("path");
const Module = require("module");
const base = path.resolve(__dirname, "../cloudfunctions/dataManage");
const XLSX = require(base + "/node_modules/xlsx");
const Ajv = require(base + "/node_modules/ajv");
const { parseSource, inspectWorkbook } = require(base + "/parsers/source");
const { createImportPlan, generateCandidates, applyChanges } = require(base + "/import/pipeline");
const { labels } = require(base + "/import/fields");
const schemas = require(base + "/ai/schemas");
const tests = [];
const test = (name, run) => tests.push([name, run]);
function workbook(sheets) {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  return { fileName: "库存.xlsx", fileBase64: XLSX.write(book, { type: "buffer", bookType: "xlsx" }).toString("base64") };
}
const rows = [["物品名称", "数量", "单位"], ["牛奶", 2, "盒"]];
test("T-P6B-A01 all workbook sheets", () => {
  const source = parseSource(workbook({ 说明: [["说明内容"]], 食品: rows, 日化: rows }));
  assert.deepEqual(source.sheets.map(s => s.name), ["说明", "食品", "日化"]);
});
test("T-P6B-A02 inventory on second sheet", async () => {
  const job = await createImportPlan(workbook({ 说明: [["说明"]], 食品: rows }));
  const candidates = generateCandidates(job.source, job.plan);
  assert.equal(candidates.length, 1); assert.equal(candidates[0].source.sheet, "食品");
});
test("T-P6B-A03 header after three title rows", async () => {
  const job = await createImportPlan(workbook({ 库存: [["家庭库存"], ["更新时间", "2026-10-10"], [], ...rows] }));
  assert.equal(job.plan.tables[0].headerRow, 3);
  assert.equal(generateCandidates(job.source, job.plan)[0].source.row, 5);
});
test("T-P6B-A04 multiple table regions", async () => {
  const job = await createImportPlan(workbook({ 库存: [["食品"], ...rows, [], ["日化"], ["名称", "数量", "单位"], ["洗发水", 2, "瓶"]] }));
  assert.equal(job.plan.tables.length, 2);
  assert.equal(generateCandidates(job.source, job.plan).length, 2);
});
test("T-P6B-A05 standard fields do not call AI", async () => {
  let calls = 0;
  await createImportPlan({ ...workbook({ 库存: rows }), allowAI: true }, { metrics: [], structured: async () => { calls++; throw Error("should not call"); } });
  assert.equal(calls, 0);
});
test("T-P6B-A06 alias and heuristic provenance", async () => {
  const job = await createImportPlan({ text: "品名,现存,柜位\n牛奶,2,冰箱" });
  const mapping = job.plan.tables[0].mapping;
  assert.equal(mapping[0].method, "RULE"); assert.equal(mapping[1].method, "HEURISTIC");
  assert.equal(mapping[2].targetField, "batch.location");
});
test("T-P6B-A07 valid structured AI mapping", () => {
  assert(new Ajv().compile(schemas.mappings)({ mapping: [{ column: 1, targetField: "batch.quantity", confidence: 0.97, reason: "numeric count" }] }));
});
test("T-P6B-A08 arbitrary AI fields rejected", () => {
  assert(!new Ajv().compile(schemas.mappings)({ mapping: [{ column: 1, targetField: "randomField", confidence: 0.97, reason: "bad" }] }));
});
test("T-P6B-A09 invalid JSON falls back without losing source", async () => {
  const job = await createImportPlan({ text: "品名,现存,柜位\n牛奶,2,冰箱", allowAI: true }, { metrics: [], structured: async () => JSON.parse("not json") });
  assert(job.plan.warnings.length > 0); assert.equal(generateCandidates(job.source, job.plan).length, 1);
});
function textProvider(values) {
  return { metrics: [], structured: async () => ({ candidates: [{ values: { ...Object.fromEntries(Object.keys(labels).filter(k => !["IGNORE", "UNKNOWN"].includes(k)).map(k => [k, null])), ...values }, sourceText: "冰箱还有6盒牛奶。", confidence: 0.95, warnings: [] }] }) };
}
test("T-P6B-A10 text extraction creates candidates", async () => {
  const job = await createImportPlan({ sourceType: "text", text: "冰箱还有6盒牛奶。", allowAI: true }, textProvider({ "item.name": "牛奶", "batch.quantity": "6", "item.unit": "盒", "batch.location": "冰箱" }));
  const c = generateCandidates(job.source, job.plan)[0]; assert.equal(c.values["batch.quantity"], "6"); assert.equal(c.source.sourceText, "冰箱还有6盒牛奶。");
});
test("T-P6B-A11 missing dates are not fabricated", async () => {
  const job = await createImportPlan({ sourceType: "text", text: "冰箱还有6盒牛奶。", allowAI: true }, textProvider({ "item.name": "牛奶", "batch.quantity": "6", "batch.purchaseDate": "2026-10-01" }));
  const candidate = job.plan.textCandidates[0]; assert.equal(candidate.values["batch.purchaseDate"], null); assert(candidate.warnings.includes("购买日期缺失"));
});
test("T-P6B-A12 manual candidate edits feed validation values", async () => {
  const job = await createImportPlan({ text: "物品名称,数量\n牛奶,2" });
  const id = generateCandidates(job.source, job.plan)[0].id;
  assert.equal(generateCandidates(job.source, job.plan, [{ id, values: { "batch.quantity": "-1" } }])[0].values["batch.quantity"], "-1");
});
test("T-P6B-A13 category hint is visible and requires review", async () => {
  const job = await createImportPlan(workbook({ 食品: rows }));
  const c = generateCandidates(job.source, job.plan)[0]; assert.equal(c.values["item.category"], "食品"); assert(c.warnings.includes("类别来自表上下文"));
});
test("T-P6B-A14 AI timeout retains manual mapping", async () => {
  const job = await createImportPlan({ text: "品名,现存\n牛奶,2", allowAI: true }, { metrics: [], structured: async () => { throw Error("timeout"); } });
  const plan = applyChanges(job, { tables: [{ id: job.plan.tables[0].id, mapping: [{ column: 1, targetField: "batch.quantity" }] }] });
  assert.equal(plan.tables[0].mapping[1].method, "USER"); assert.equal(generateCandidates(job.source, plan).length, 1);
});

// Exercise the deployed cloud code with a serial transaction emulator, not a second import implementation.
function cloudHarness() {
  let data = {};
  let user = "owner";
  let queue = Promise.resolve();
  const clone = value => JSON.parse(JSON.stringify(value));
  function collection(name) {
    data[name] ||= [];
    const query = (where = {}, skip = 0, limit = Infinity) => ({
      where: next => query(next, skip, limit), skip: next => query(where, next, limit), limit: next => query(where, skip, next),
      get: async () => ({ data: clone(data[name].filter(row => Object.entries(where).every(([key, value]) => row[key] === value)).slice(skip, skip + limit)) }),
    });
    return {
      ...query(),
      add: async ({ data: row }) => { if (data[name].some(r => r._id === row._id)) throw Error("duplicate id"); data[name].push(clone(row)); return { _id: row._id }; },
      doc: id => ({ get: async () => ({ data: clone(data[name].find(r => r._id === id) || null) }), update: async ({ data: patch }) => { Object.assign(data[name].find(r => r._id === id), clone(patch)); }, remove: async () => { data[name] = data[name].filter(r => r._id !== id); } }),
    };
  }
  const db = { collection, runTransaction: fn => {
    const run = queue.then(async () => { const before = clone(data); try { return await fn(db); } catch (error) { data = before; throw error; } });
    queue = run.catch(() => {}); return run;
  } };
  const cloud = { init() {}, database: () => db, getWXContext: () => ({ OPENID: user }) };
  const original = Module._load;
  Module._load = function(request, ...args) { return request === "wx-server-sdk" ? cloud : original.call(this, request, ...args); };
  const main = require(base + "/index").main;
  Module._load = original;
  return { main, db, setUser: next => { user = next; } };
}
let harness;
let preview;
test("T-P6B-A15 repeated confirmation remains idempotent", async () => {
  harness = cloudHarness();
  const result = await harness.main({ action: "previewSmartImport", payload: { text: "物品名称,数量,单位,到期日期\n牛奶,2,盒,2020-01-01" } });
  assert(result.ok, JSON.stringify(result)); preview = result.data;
  assert.equal((await harness.db.collection("items").get()).data.length, 0, "preview must not mutate inventory");
  const payload = { jobId: preview.jobId, revision: preview.revision, confirmed: true };
  const first = await harness.main({ action: "commitSmartImport", payload }); assert(first.ok, JSON.stringify(first)); assert.equal(first.data.failedRows.length, 0, JSON.stringify(first));
  const retry = await harness.main({ action: "commitSmartImport", payload }); assert(retry.ok); assert.equal(retry.data.skippedRows, 1);
  assert.equal((await harness.db.collection("batches").get()).data[0].quantity, 2);
});
test("T-P6B-A16 same domain performs merge ADD and Reminder", async () => {
  const next = await harness.main({ action: "previewSmartImport", payload: { text: "物品名称,数量,单位,到期日期\n牛奶,3,盒,2020-01-01" } });
  const result = await harness.main({ action: "commitSmartImport", payload: { jobId: next.data.jobId, revision: next.data.revision, confirmed: true } });
  assert.equal(result.data.mergedBatches, 1); assert.equal((await harness.db.collection("batches").get()).data[0].quantity, 5);
  assert.equal((await harness.db.collection("transactions").get()).data.length, 2);
  assert.equal((await harness.db.collection("reminders").get()).data[0].type, "EXPIRED");
});
test("T-P6B-A17 foreign user cannot read or execute job", async () => {
  harness.setUser("other");
  const result = await harness.main({ action: "commitSmartImport", payload: { jobId: preview.jobId, revision: preview.revision, confirmed: true } });
  assert(!result.ok); harness.setUser("owner");
});
test("T-P6B-A18 negative candidate edit is rejected before writes", async () => {
  const result = await harness.main({ action: "previewSmartImport", payload: { text: "物品名称,数量\n纸巾,1" } });
  const edited = await harness.main({ action: "previewSmartImport", payload: { jobId: result.data.jobId, revision: 1, candidateEdits: [{ id: result.data.candidates[0].id, values: { "batch.quantity": "-1" }, confirmed: true }] } });
  assert(edited.ok); assert.equal(edited.data.errorRows, 1);
  const commit = await harness.main({ action: "commitSmartImport", payload: { jobId: result.data.jobId, revision: 2, confirmed: true } }); assert(!commit.ok);
});
test("T-P6B-A19 samples remain bounded and ignore private unrelated sheets", async () => {
  const payload = workbook({ 工资: [["secret", "private"]], 食品: rows });
  const sent = [];
  await createImportPlan({ ...payload, allowAI: true }, { metrics: [], structured: async (_task, _schema, input) => { sent.push(JSON.stringify(input)); throw Error("timeout"); } });
  assert(sent.every(input => !input.includes("secret")));
  assert(inspectWorkbook(parseSource(payload)).sheets.every(sheet => sheet.sample.length <= 10));
});
test("T-P6B-A20 CSV quoted newline and sparse spreadsheet cells", () => {
  const source = parseSource({ text: '物品名称,数量,备注\n牛奶,2,"第一行\n第二行"' });
  assert.equal(source.sheets[0].rows[1][2], "第一行\n第二行");
  const sparse = parseSource(workbook({ 库存: [["名称", null, "数量"], ["牛奶", null, 2]] })); assert.equal(sparse.sheets[0].rows[1][1], null);
});
test("T-P6B-A21 stale revision cannot commit", async () => {
  const result = await harness.main({ action: "previewSmartImport", payload: { text: "物品名称,数量\n纸巾,1" } });
  const edited = await harness.main({ action: "previewSmartImport", payload: { jobId: result.data.jobId, revision: 1 } }); assert(edited.ok);
  const commit = await harness.main({ action: "commitSmartImport", payload: { jobId: result.data.jobId, revision: 1, confirmed: true } }); assert(!commit.ok);
});
test("T-P6B-A22 low confidence cannot be silently confirmed", async () => {
  const result = await harness.main({ action: "previewSmartImport", payload: { text: "品名,现存\n牛奶,2" } });
  assert.equal(result.data.needsConfirmation, 1);
  const commit = await harness.main({ action: "commitSmartImport", payload: { jobId: result.data.jobId, revision: 1, confirmed: true } }); assert(!commit.ok);
});
test("T-P6B-A23 locked preview cannot be edited", async () => {
  const edit = await harness.main({ action: "previewSmartImport", payload: { jobId: preview.jobId, revision: preview.revision } }); assert(!edit.ok);
});
test("T-P6B-A24 relative dates have a deterministic anchor", async () => {
  const quote = "冰箱还有6盒牛奶，前天买的。";
  const provider = textProvider({ "item.name": "牛奶", "batch.quantity": "6", "batch.purchaseDate": "2026-10-09" });
  const original = provider.structured;
  provider.structured = async (...args) => { const result = await original(...args); result.candidates[0].sourceText = quote; return result; };
  const job = await createImportPlan({ sourceType: "text", text: quote, referenceDate: "2026-10-10", allowAI: true }, provider);
  assert.equal(job.plan.textCandidates[0].values["batch.purchaseDate"], "2026-10-08");
});
test("T-P6B-A25 all chunked rows preserve stable retry IDs", async () => {
  const text = "物品名称,数量,单位\n" + Array.from({ length: 104 }, (_, index) => `分页物品${index},1,个`).join("\n");
  const result = await harness.main({ action: "previewSmartImport", payload: { text } }); assert(result.ok);
  const payload = { jobId: result.data.jobId, revision: 1, confirmed: true };
  let offset = 0;
  let successRows = 0;
  let calls = 0;
  while (offset !== null) {
    const page = await harness.main({ action: "commitSmartImport", payload: { ...payload, offset } });
    assert(page.ok, JSON.stringify(page));
    successRows += page.data.successRows;
    calls += 1;
    assert.equal(page.data.totalRows, 104);
    assert.equal(page.data.processedRows, Math.min(offset + 5, 104));
    offset = page.data.nextOffset;
  }
  assert.equal(successRows, 104);
  assert.equal(calls, 21);
  const retry = await harness.main({ action: "commitSmartImport", payload }); assert.equal(retry.data.skippedRows, 5);
});
test("T-P6B-A26 manual header correction keeps original data", async () => {
  const job = await createImportPlan({ text: "更新时间,2026-10-10\n东西,数量,单位\n纸巾,3,包" });
  const table = job.plan.tables[0];
  const plan = applyChanges(job, { tables: [{ id: table.id, headerRow: 1, endRow: 2, endColumn: 2, selected: true, mapping: [{ column: 0, targetField: "item.name" }] }] });
  const candidates = generateCandidates(job.source, plan); assert.equal(candidates[0].values["item.name"], "纸巾"); assert.equal(candidates[0].source.row, 3);
});
test("T-P6B-A27 family inventory headers map dates and dual shelf-life columns", async () => {
  const headers = ["序号", "细目分类", "物品名称", "规格", "数量", "单位", "存放位置", "购买时间", "生产日期", "保质期(月)", "保质期(天)", "到期时间", "剩余天数", "状态", "备注"];
  const job = await createImportPlan(workbook({ 护肤品: [headers,
    [1, "水乳", "测试乳液", "159ml", 1, "瓶", "浴室柜", new Date(Date.UTC(2024, 9, 22)), new Date(Date.UTC(2024, 9, 1)), 36, null, new Date(Date.UTC(2027, 8, 30)), 362, "正常", null],
    [2, "面膜", "测试面膜", null, 2, "盒", "浴室柜", null, new Date(Date.UTC(2026, 0, 1)), null, 90, new Date(Date.UTC(2026, 3, 1)), 90, "正常", null],
  ] }));
  const table = job.plan.tables[0];
  const mapped = Object.fromEntries(table.mapping.map(mapping => [mapping.sourceColumn, mapping.targetField]));
  assert.equal(mapped["细目分类"], "item.category");
  assert.equal(mapped["购买时间"], "batch.purchaseDate");
  assert.equal(mapped["到期时间"], "batch.expiryDate");
  assert.equal(mapped["剩余天数"], "IGNORE");
  assert.equal(mapped["状态"], "IGNORE");
  const candidates = generateCandidates(job.source, job.plan);
  assert.equal(candidates[0].values["batch.purchaseDate"], "2024-10-22");
  assert.equal(candidates[0].values["batch.productionDate"], "2024-10-01");
  assert.equal(candidates[0].values["batch.shelfLifeValue"], "36");
  assert.equal(candidates[0].values["batch.shelfLifeUnit"], "MONTH");
  assert.equal(candidates[0].values["batch.expiryDate"], "2027-09-30");
  assert.equal(candidates[1].values["batch.shelfLifeValue"], "90");
  assert.equal(candidates[1].values["batch.shelfLifeUnit"], "DAY");
});
test("T-P6B-A28 combined shelf-life text supplies value and unit", async () => {
  const job = await createImportPlan({ text: "物品名称,数量,保质期\n牛奶,2,21天" });
  const candidate = generateCandidates(job.source, job.plan)[0];
  assert.equal(candidate.values["batch.shelfLifeValue"], "21");
  assert.equal(candidate.values["batch.shelfLifeUnit"], "DAY");
});
test("T-P6B-A29 repairable import errors expose structured suggestions", async () => {
  const text = [
    "物品名称,数量,生产日期,保质期数值,保质期单位,到期日期,单位购买价格",
    "零库存,0,,,,,",
    "合并数量,12+5,,,,,",
    "模糊数量,少量,,,,,",
    "日期冲突,1,2026-01-01,30,天,2026-02-01,",
    "无效价格,1,,,,,-2",
  ].join("\n");
  const result = await harness.main({ action: "previewSmartImport", payload: { text } });
  assert(result.ok, JSON.stringify(result));
  const issueTypes = result.data.errors.map(error => error.issueType);
  assert.deepEqual(issueTypes, ["QUANTITY_ZERO", "QUANTITY_SUM", "QUANTITY_DEFAULT_ONE", "EXPIRY_CONFLICT", "OPTIONAL_NUMBER_INVALID"]);
  assert.equal(result.data.errors[1].suggestedValue, "17");
  assert.equal(result.data.errors[4].issueField, "batch.purchasePrice");
});
test("T-P6B-A30 candidate repairs and exclusion are revalidated server-side", async () => {
  const text = [
    "物品名称,数量,生产日期,保质期数值,保质期单位,到期日期,单位购买价格",
    "零库存,0,,,,,",
    "合并数量,12+5,,,,,",
    "模糊数量,少量,,,,,",
    "日期冲突,1,2026-01-01,30,天,2026-02-01,",
    "无效价格,1,,,,,-2",
  ].join("\n");
  const first = await harness.main({ action: "previewSmartImport", payload: { text } });
  const candidates = first.data.candidates;
  const repaired = await harness.main({ action: "previewSmartImport", payload: {
    jobId: first.data.jobId,
    revision: first.data.revision,
    candidateEdits: [
      { id: candidates[0].id, values: {}, excluded: true, confirmed: false },
      { id: candidates[1].id, values: { "batch.quantity": "17" }, confirmed: false },
      { id: candidates[2].id, values: { "batch.quantity": "1" }, confirmed: false },
      { id: candidates[3].id, values: { "batch.expiryDate": "" }, confirmed: false },
      { id: candidates[4].id, values: { "batch.purchasePrice": "" }, confirmed: false },
    ],
  } });
  assert(repaired.ok, JSON.stringify(repaired));
  assert.equal(repaired.data.errorRows, 0);
  assert.equal(repaired.data.validRows, 4);
  assert.equal(repaired.data.candidates[0].excluded, true);
  assert.equal(repaired.data.rows.some(row => row.sourceId === candidates[0].id), false);
  assert.equal(repaired.data.rows.find(row => row.sourceId === candidates[1].id).quantity, 17);
  assert.equal(repaired.data.rows.find(row => row.sourceId === candidates[3].id).expiryDate, "2026-01-31");
  const committed = await harness.main({ action: "commitSmartImport", payload: { jobId: repaired.data.jobId, revision: repaired.data.revision, confirmed: true } });
  assert(committed.ok, JSON.stringify(committed));
  assert.equal(committed.data.successRows, 4);
  assert.equal((await harness.db.collection("items").get()).data.some(item => item.name === "零库存"), false);
});
async function main() {
  for (const [name, run] of tests) { await run(); console.log("ok - " + name); }
  console.log(`${tests.length} Phase 6B tests passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
