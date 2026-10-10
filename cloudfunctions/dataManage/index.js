"use strict";

const cloud = require("wx-server-sdk");
const { parseSource } = require("./parsers/source");
const { createImportPlan, applyChanges, generateCandidates, candidateRows } = require("./import/pipeline");
const { addStock } = require("./import/inventory-engine");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const SCHEMA_VERSION = 1;
const APP_VERSION = "0.1";
const UNKNOWN_EXPIRY_DATE = "9999-12-31";
const DEFAULT_UNIT = "个";
const COLLECTIONS = {
  categories: "categories",
  items: "items",
  batches: "batches",
  transactions: "transactions",
  reminders: "reminders",
  restockItems: "restock_items",
  locations: "locations",
  settings: "settings",
};
const EXCEL_HEADERS = ["物品名称", "类别", "品牌", "规格", "数量", "单位", "存放位置", "购买日期", "生产日期", "保质期数值", "保质期单位", "到期日期", "单位购买价格", "购买渠道", "低库存阈值", "临期阈值", "备注"];
const EXCEL_EXPORT_HEADERS = [...EXCEL_HEADERS, "剩余天数", "保质期状态", "库存状态"];
const FIELD_ALIASES = { 名称: "物品名称", 库存数量: "数量", 单价: "单位购买价格", 购买价格: "单位购买价格", 位置: "存放位置" };
const PAGE_SIZE = 100;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function ok(data) { return { ok: true, data }; }
function fail(error) {
  return { ok: false, error: { code: error.code || "DATA_MANAGE_FAILED", message: error.message || String(error) } };
}
function dataError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
function now() { return Date.now(); }
function createId(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`; }
function normalizeText(value) { return String(value == null ? "" : value).trim(); }
function normalizeHeader(value) { const text = normalizeText(value); return FIELD_ALIASES[text] || text; }
function assertPositive(value, label) {
  const numeric = Number(normalizeText(value));
  if (!Number.isFinite(numeric) || numeric <= 0) throw dataError("VALIDATION_ERROR", `${label}必须大于0`);
  return numeric;
}
function optionalNumber(value, label, options = {}) {
  if (normalizeText(value) === "") return null;
  const numeric = Number(normalizeText(value));
  if (!Number.isFinite(numeric)) throw dataError("VALIDATION_ERROR", `${label}必须是数字`);
  if (options.min != null && numeric < options.min) throw dataError("VALIDATION_ERROR", `${label}不能小于${options.min}`);
  return options.integer ? Math.trunc(numeric) : numeric;
}
function normalizeDate(value, label) {
  const raw = normalizeText(value);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw dataError("VALIDATION_ERROR", `${label}格式应为 YYYY-MM-DD`);
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw dataError("VALIDATION_ERROR", `${label}不是有效日期`);
  return raw;
}
function dateMs(value) {
  const [year, month, day] = String(value || UNKNOWN_EXPIRY_DATE).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}
function todayText(today = new Date()) {
  return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
}
function remainingDays(expiryDate, today = new Date()) {
  return Math.floor((dateMs(expiryDate) - dateMs(todayText(today))) / MS_PER_DAY);
}
function effectiveExpiry(batch) {
  if (!batch.openedExpiryDate) return batch.expiryDate;
  return dateMs(batch.openedExpiryDate) < dateMs(batch.expiryDate) ? batch.openedExpiryDate : batch.expiryDate;
}
function expiryStatus(batch, warningDays) {
  const expiry = effectiveExpiry(batch);
  if (expiry === UNKNOWN_EXPIRY_DATE) return "NORMAL";
  const days = remainingDays(expiry);
  if (days < 0) return "EXPIRED";
  if (days <= warningDays) return "EXPIRING";
  return "NORMAL";
}
function stockStatus(total, threshold) {
  if (total === 0) return "ZERO";
  if (threshold == null) return "NORMAL";
  return total <= threshold ? "LOW" : "NORMAL";
}
function shelfLifeUnit(value) {
  const raw = normalizeText(value).toUpperCase();
  if (!raw) return null;
  if (raw === "DAY" || raw === "天") return "DAY";
  if (raw === "MONTH" || raw === "月" || raw === "个月") return "MONTH";
  if (raw === "YEAR" || raw === "年") return "YEAR";
  throw dataError("VALIDATION_ERROR", "保质期单位不合法");
}
function calculateExpiry(productionDate, shelfLifeValue, unit) {
  if (!productionDate || shelfLifeValue == null || !unit) return null;
  const date = new Date(`${productionDate}T00:00:00.000Z`);
  if (unit === "DAY") date.setUTCDate(date.getUTCDate() + shelfLifeValue);
  if (unit === "MONTH") date.setUTCMonth(date.getUTCMonth() + shelfLifeValue);
  if (unit === "YEAR") date.setUTCFullYear(date.getUTCFullYear() + shelfLifeValue);
  return todayText(date);
}
function resolveExpiry(values) {
  const productionDate = normalizeDate(values["生产日期"], "生产日期");
  const shelfLifeValue = optionalNumber(values["保质期数值"], "保质期数值", { integer: true, min: 1 });
  const unit = shelfLifeUnit(values["保质期单位"]);
  const manual = normalizeDate(values["到期日期"], "到期日期");
  const calculated = calculateExpiry(productionDate, shelfLifeValue, shelfLifeValue == null ? null : unit);
  if (manual && calculated && manual !== calculated) throw dataError("VALIDATION_ERROR", "生产日期 + 保质期与到期日期冲突");
  if (manual) return { productionDate, shelfLifeValue, shelfLifeUnit: shelfLifeValue == null ? null : unit, expiryDate: manual };
  if (calculated) return { productionDate, shelfLifeValue, shelfLifeUnit: unit, expiryDate: calculated };
  return { productionDate, shelfLifeValue, shelfLifeUnit: shelfLifeValue == null ? null : unit, expiryDate: UNKNOWN_EXPIRY_DATE };
}
function itemKey(input) {
  return [input.name, input.specification || "", input.brand || "", input.unit].map((part) => normalizeText(part).toLowerCase()).join("|");
}
function splitLine(line) {
  if (line.includes("\t")) return line.split("\t").map((cell) => cell.trim());
  const out = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      out.push(current.trim());
      current = "";
    } else current += char;
  }
  out.push(current.trim());
  return out;
}
function parseTable(text) {
  const lines = String(text || "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { rows: [], unknownFields: [] };
  const headers = splitLine(lines[0]).map(normalizeHeader);
  const known = new Set(EXCEL_HEADERS);
  const unknownFields = headers.filter((header) => !known.has(header));
  const rows = lines.slice(1).map((line, index) => {
    const cells = splitLine(line);
    const values = {};
    headers.forEach((header, cellIndex) => { if (known.has(header)) values[header] = cells[cellIndex] || ""; });
    return { rowNumber: index + 2, values };
  });
  return { rows, unknownFields };
}
function excelSerialDate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return String(value || "");
  const date = new Date(Date.UTC(1899, 11, 30) + Math.round(numeric) * MS_PER_DAY);
  return todayText(date);
}
function normalizeSheetDateCell(header, value) {
  if (!["购买日期", "生产日期", "到期日期"].includes(header)) return value;
  const text = normalizeText(value);
  return /^\d+(\.\d+)?$/.test(text) ? excelSerialDate(text) : text;
}
function parseSheetTable(sheetRows) {
  const firstRowIndex = sheetRows.findIndex((row) => row.some((cell) => normalizeText(cell)));
  if (firstRowIndex < 0) return { rows: [], unknownFields: [] };
  const headers = sheetRows[firstRowIndex].map(normalizeHeader);
  const known = new Set(EXCEL_HEADERS);
  const unknownFields = headers.filter((header) => header && !known.has(header));
  const rows = sheetRows.slice(firstRowIndex + 1)
    .map((cells, index) => {
      const values = {};
      headers.forEach((header, cellIndex) => {
        if (known.has(header)) values[header] = normalizeSheetDateCell(header, cells[cellIndex] || "");
      });
      return { rowNumber: firstRowIndex + index + 2, values };
    })
    .filter((row) => Object.values(row.values).some((value) => normalizeText(value)));
  return { rows, unknownFields };
}
function parseExcelPayload(payload) {
  if (payload.fileBase64) {
    const buffer = Buffer.from(String(payload.fileBase64), "base64");
    if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) return parseSheetTable(parseSource(payload).sheets[0].rows);
    return parseTable(buffer.toString("utf8"));
  }
  const text = payload.text || "";
  if (String(text).startsWith("PK")) throw dataError("XLSX 文件不能按文本读取，请重新选择 .xlsx 文件后预览。");
  return parseTable(text);
}
async function queryAll(collectionName, where) {
  const collection = db.collection(collectionName).where(where);
  const output = [];
  let offset = 0;
  while (true) {
    const result = await collection.skip(offset).limit(PAGE_SIZE).get();
    const data = result.data || [];
    output.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return output;
}
async function queryOne(collectionName, where) {
  const result = await db.collection(collectionName).where(where).limit(1).get();
  return (result.data || [])[0] || null;
}
async function allUserData(openid) {
  const [categories, items, batches, transactions, locations, reminders, restockItems, settingsRows] = await Promise.all([
    queryAll(COLLECTIONS.categories, { _openid: openid }),
    queryAll(COLLECTIONS.items, { _openid: openid }),
    queryAll(COLLECTIONS.batches, { _openid: openid }),
    queryAll(COLLECTIONS.transactions, { _openid: openid }),
    queryAll(COLLECTIONS.locations, { _openid: openid }),
    queryAll(COLLECTIONS.reminders, { _openid: openid }),
    queryAll(COLLECTIONS.restockItems, { _openid: openid }),
    queryAll(COLLECTIONS.settings, { _openid: openid }),
  ]);
  return { categories, items, batches, transactions, locations, reminders, restockItems, settings: settingsRows[0] || null };
}
function previewRows(rows, unknownFields, snapshot, importOperationId) {
  const itemByKey = new Map(snapshot.items.map((item) => [itemKey(item), item]));
  const categoryNames = new Set(snapshot.categories.map((item) => normalizeText(item.name).toLowerCase()));
  const locationNames = new Set(snapshot.locations.map((item) => normalizeText(item.name).toLowerCase()));
  const parsedRows = [];
  const errors = [];
  const newCategoryNames = new Set();
  const newLocationNames = new Set();
  const newItemKeys = new Set();
  for (const row of rows) {
    try {
      const v = row.values;
      const name = normalizeText(v["物品名称"]);
      if (!name) throw dataError("VALIDATION_ERROR", "物品名称必填");
      const quantity = assertPositive(v["数量"], "数量");
      const unit = normalizeText(v["单位"]) || DEFAULT_UNIT;
      const categoryName = normalizeText(v["类别"]) || "其他";
      const locationName = normalizeText(v["存放位置"]) || "默认位置";
      const brand = normalizeText(v["品牌"]);
      const specification = normalizeText(v["规格"]);
      const purchaseDate = normalizeDate(v["购买日期"], "购买日期");
      const expiry = resolveExpiry(v);
      const purchasePrice = optionalNumber(v["单位购买价格"], "单位购买价格", { min: 0 });
      const lowStockThreshold = optionalNumber(v["低库存阈值"], "低库存阈值", { min: 0 });
      const expiryWarningDays = optionalNumber(v["临期阈值"], "临期阈值", { integer: true, min: 0 });
      const key = itemKey({ name, brand, specification, unit });
      const existingItem = itemByKey.get(key);
      if (!existingItem) newItemKeys.add(key);
      if (!categoryNames.has(categoryName.toLowerCase())) newCategoryNames.add(categoryName);
      if (!locationNames.has(locationName.toLowerCase())) newLocationNames.add(locationName);
      parsedRows.push({
        rowNumber: row.rowNumber,
        itemKey: key,
        itemId: existingItem && existingItem._id,
        item: existingItem ? null : { name, categoryId: "", brand: brand || null, specification: specification || null, unit, defaultLocationId: "", lowStockThreshold, expiryWarningDays, note: normalizeText(v["备注"]) },
        quantity,
        categoryName,
        locationName,
        purchaseDate,
        productionDate: expiry.productionDate,
        shelfLifeValue: expiry.shelfLifeValue,
        shelfLifeUnit: expiry.shelfLifeUnit,
        expiryDate: expiry.expiryDate,
        purchasePrice,
        purchaseChannel: normalizeText(v["购买渠道"]) || null,
        note: normalizeText(v["备注"]),
      });
    } catch (error) {
      errors.push({ rowNumber: row.rowNumber, message: error.message || String(error) });
    }
  }
  return {
    importOperationId: importOperationId || `excel_${now().toString(36)}`,
    totalRows: rows.length,
    validRows: parsedRows.length,
    errorRows: errors.length,
    errors,
    unknownFields,
    rows: parsedRows,
    creates: { itemCount: newItemKeys.size, batchCount: parsedRows.length, categoryNames: [...newCategoryNames], locationNames: [...newLocationNames] },
  };
}
async function previewExcelImport(openid, payload) {
  const parsed = parseExcelPayload(payload || {});
  const snapshot = await allUserData(openid);
  return previewRows(parsed.rows, parsed.unknownFields, snapshot, payload.importOperationId);
}
async function ensureCategory(openid, name) {
  const existing = await queryOne(COLLECTIONS.categories, { _openid: openid, name });
  if (existing) return existing;
  const timestamp = now();
  const doc = { _id: createId("cat"), _openid: openid, schemaVersion: SCHEMA_VERSION, name, icon: null, expiryWarningDays: null, defaultLowStock: null, createdAt: timestamp, updatedAt: timestamp };
  await db.collection(COLLECTIONS.categories).add({ data: doc });
  return doc;
}
async function ensureLocation(openid, name) {
  const existing = await queryOne(COLLECTIONS.locations, { _openid: openid, name });
  if (existing) return existing;
  const timestamp = now();
  const doc = { _id: createId("loc"), _openid: openid, schemaVersion: SCHEMA_VERSION, name, parentId: null, createdAt: timestamp, updatedAt: timestamp };
  await db.collection(COLLECTIONS.locations).add({ data: doc });
  return doc;
}
async function txAdd(tx, collectionName, doc) { await tx.collection(collectionName).add({ data: doc }); }
async function txRemove(tx, collectionName, id) { await tx.collection(collectionName).doc(id).remove(); }
async function commitExcelImport(openid, payload) {
  const preview = await previewExcelImport(openid, payload);
  if (preview.errors.length) throw dataError("VALIDATION_ERROR", "存在错误行，请修正后再导入");
  let successRows = 0;
  let skippedRows = 0;
  let createdItems = 0;
  let addedBatches = 0;
  let mergedBatches = 0;
  const failedRows = [];
  for (const row of preview.rows) {
    try {
      const result = await executeCandidateRow(openid, row, preview.importOperationId);
      if (result.skipped) skippedRows += 1;
      else {
        successRows += 1;
        if (result.itemCreated) createdItems += 1;
        if (result.merged) mergedBatches += 1;
        else addedBatches += 1;
      }
    } catch (error) {
      failedRows.push({ rowNumber: row.rowNumber, message: error.message || String(error) });
    }
  }
  return { importOperationId: preview.importOperationId, successRows, skippedRows, failedRows, createdItems, addedBatches, mergedBatches };
}
async function executeCandidateRow(openid, row, importOperationId) {
  const operationId = `${importOperationId}:row:${row.sourceId || row.rowNumber}`;
  const category = await ensureCategory(openid, row.categoryName);
  const location = await ensureLocation(openid, row.locationName);
  // Refresh matching after preceding rows: several candidates can share a new Item.
  const items = await queryAll(COLLECTIONS.items, { _openid: openid });
  const existing = items.find(item => itemKey(item) === row.itemKey);
  const result = await addStock(openid, {
    itemId: existing?._id,
    item: existing ? undefined : { ...row.item, categoryId: category._id, defaultLocationId: location._id },
    quantity: row.quantity, locationId: location._id, purchaseDate: row.purchaseDate,
    productionDate: row.productionDate, shelfLifeValue: row.shelfLifeValue, shelfLifeUnit: row.shelfLifeUnit,
    expiryDate: row.expiryDate, purchasePrice: row.purchasePrice, purchaseChannel: row.purchaseChannel,
    note: `${row.note || ""}；导入来源：${row.provenance || row.sourceId || row.rowNumber}`, operationId,
  });
  return { skipped: Boolean(result.idempotent), merged: result.merged, itemCreated: !existing && !result.idempotent };
}
async function loadImportJob(openid, jobId) {
  const job = await queryOne("import_jobs", { _openid: openid, _id: jobId });
  if (!job) throw dataError("NOT_FOUND", "导入预览不存在");
  if (job.expiresAt < now()) throw dataError("VALIDATION_ERROR", "导入预览已过期，请重新识别");
  return job;
}
async function previewSmartImport(openid, payload) {
  let job;
  if (payload.jobId) {
    job = await loadImportJob(openid, payload.jobId);
    if (job.locked) throw dataError("VALIDATION_ERROR", "导入已确认，不能修改；可继续重试同一导入");
    if (payload.revision !== job.revision) throw dataError("VALIDATION_ERROR", "预览版本已变化，请重新识别");
    job.plan = applyChanges(job, payload.changes);
    job.edits = payload.candidateEdits || [];
    job.revision += 1;
  } else {
    const parsed = await createImportPlan(payload);
    job = { _id: createId("import"), _openid: openid, ...parsed, edits: [], revision: 1, locked: false, createdAt: now(), expiresAt: now() + 24 * 3600000 };
  }
  const candidates = generateCandidates(job.source, job.plan, job.edits);
  for (const candidate of candidates) {
    const previous = job.preview?.candidates.find(c => c.id === candidate.id);
    if (previous?.confirmed && JSON.stringify(previous.values) !== JSON.stringify(candidate.values)) candidate.confirmed = false;
  }
  const rows = candidateRows(candidates);
  const preview = previewRows(rows, [], await allUserData(openid), job._id);
  preview.rows.forEach(row => {
    const candidate = candidates[row.rowNumber - 2];
    row.sourceId = candidate.id;
    row.provenance = [candidate.source.file, candidate.source.sheet, candidate.source.row ? `第${candidate.source.row}行` : candidate.source.sourceText].filter(Boolean).join(" / ");
  });
  const needsConfirmation = candidates.filter(c => !c.confirmed && (c.confidence < 0.85 || c.warnings.length)).length;
  job.preview = { ...preview, candidates, needsConfirmation };
  if (Buffer.byteLength(JSON.stringify(job)) > 900000) throw dataError("VALIDATION_ERROR", "导入预览过大，请拆分文件");
  if (payload.jobId) {
    const { _id, ...data } = job;
    await db.runTransaction(async tx => {
      const current = (await tx.collection("import_jobs").doc(_id).get()).data;
      if (current._openid !== openid || current.locked || current.revision !== payload.revision) throw dataError("VALIDATION_ERROR", "预览已变化或已确认");
      await tx.collection("import_jobs").doc(_id).update({ data });
    });
  }
  else await db.collection("import_jobs").add({ data: job });
  return { ...job.preview, jobId: job._id, revision: job.revision, plan: job.plan, metrics: job.metrics };
}
async function commitSmartImport(openid, payload) {
  let job = await loadImportJob(openid, payload.jobId);
  if (job.revision !== payload.revision) throw dataError("VALIDATION_ERROR", "预览版本不一致，请重新校验");
  if (!payload.confirmed || job.preview.errorRows || job.preview.needsConfirmation || !job.preview.validRows) throw dataError("VALIDATION_ERROR", "请先修正错误并确认待核对候选");
  // Freeze the reviewed revision atomically before any inventory writes.
  await db.runTransaction(async tx => {
    const current = (await tx.collection("import_jobs").doc(job._id).get()).data;
    if (current._openid !== openid || current.revision !== payload.revision) throw dataError("VALIDATION_ERROR", "预览已变化");
    await tx.collection("import_jobs").doc(job._id).update({ data: { locked: true } });
  });
  job = await loadImportJob(openid, job._id);
  const result = { importOperationId: job._id, successRows: 0, skippedRows: 0, createdItems: 0, addedBatches: 0, mergedBatches: 0, failedRows: [] };
  const offset = payload.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset > job.preview.rows.length) throw dataError("VALIDATION_ERROR", "导入分页无效");
  for (const row of job.preview.rows.slice(offset, offset + 20)) {
    try {
      const done = await executeCandidateRow(openid, row, job._id);
      if (done.skipped) result.skippedRows++;
      else { result.successRows++; if (done.itemCreated) result.createdItems++; if (done.merged) result.mergedBatches++; else result.addedBatches++; }
    } catch (error) { result.failedRows.push({ rowNumber: row.rowNumber, message: error.message }); }
  }
  return { ...result, nextOffset: offset + 20 < job.preview.rows.length ? offset + 20 : null };
}
async function exportBackup(openid) {
  const snapshot = await allUserData(openid);
  return { schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), ...snapshot };
}
function validateBackup(data) {
  const errors = [];
  if (!data || typeof data !== "object") errors.push("备份文件不是有效对象");
  if (data.schemaVersion == null) errors.push("缺少 schemaVersion");
  else if (data.schemaVersion > SCHEMA_VERSION) errors.push("该备份来自更新版本的有备录，当前版本无法安全恢复。");
  else if (data.schemaVersion !== SCHEMA_VERSION) errors.push("缺少可用的备份迁移路径");
  for (const field of ["categories", "items", "batches", "transactions", "locations", "reminders", "restockItems"]) if (!Array.isArray(data[field])) errors.push(`${field} 必须是数组`);
  const items = new Set(Array.isArray(data.items) ? data.items.map((item) => item._id) : []);
  const batches = new Set(Array.isArray(data.batches) ? data.batches.map((batch) => batch._id) : []);
  const categories = new Set(Array.isArray(data.categories) ? data.categories.map((category) => category._id) : []);
  const locations = new Set(Array.isArray(data.locations) ? data.locations.map((location) => location._id) : []);
  for (const item of Array.isArray(data.items) ? data.items : []) if (item.categoryId && !categories.has(item.categoryId)) errors.push(`Item 引用不存在的 Category: ${item._id}`);
  for (const batch of Array.isArray(data.batches) ? data.batches : []) {
    if (!items.has(batch.itemId)) errors.push(`Batch 引用不存在的 Item: ${batch._id}`);
    if (batch.locationId && !locations.has(batch.locationId)) errors.push(`Batch 引用不存在的 Location: ${batch._id}`);
  }
  for (const tx of Array.isArray(data.transactions) ? data.transactions : []) {
    if (!items.has(tx.itemId)) errors.push(`Transaction 引用不存在的 Item: ${tx._id}`);
    if (!batches.has(tx.batchId)) errors.push(`Transaction 引用不存在的 Batch: ${tx._id}`);
  }
  return { valid: errors.length === 0, errors, summary: { categories: data.categories?.length || 0, items: data.items?.length || 0, batches: data.batches?.length || 0, transactions: data.transactions?.length || 0, locations: data.locations?.length || 0, reminders: data.reminders?.length || 0, restockItems: data.restockItems?.length || 0, hasSettings: Boolean(data.settings) } };
}
async function restoreBackup(openid, payload) {
  const backup = payload.backup;
  const validation = validateBackup(backup);
  if (!validation.valid) throw dataError("VALIDATION_ERROR", validation.errors.join("；"));
  const current = await allUserData(openid);
  await db.runTransaction(async (tx) => {
    for (const txDoc of current.transactions) await tx.collection(COLLECTIONS.transactions).doc(txDoc._id).remove();
    for (const rem of current.reminders) await tx.collection(COLLECTIONS.reminders).doc(rem._id).remove();
    for (const restock of current.restockItems) await tx.collection(COLLECTIONS.restockItems).doc(restock._id).remove();
    for (const batch of current.batches) await tx.collection(COLLECTIONS.batches).doc(batch._id).remove();
    for (const item of current.items) await tx.collection(COLLECTIONS.items).doc(item._id).remove();
    for (const category of current.categories) await tx.collection(COLLECTIONS.categories).doc(category._id).remove();
    for (const location of current.locations) await tx.collection(COLLECTIONS.locations).doc(location._id).remove();
    if (current.settings) await txRemove(tx, COLLECTIONS.settings, current.settings._id);
    for (const category of backup.categories) await txAdd(tx, COLLECTIONS.categories, { ...category, _openid: openid });
    for (const location of backup.locations) await txAdd(tx, COLLECTIONS.locations, { ...location, _openid: openid });
    for (const item of backup.items) await txAdd(tx, COLLECTIONS.items, { ...item, _openid: openid });
    for (const batch of backup.batches) await txAdd(tx, COLLECTIONS.batches, { ...batch, _openid: openid });
    for (const transaction of backup.transactions) await txAdd(tx, COLLECTIONS.transactions, { ...transaction, _openid: openid });
    for (const reminder of backup.reminders) await txAdd(tx, COLLECTIONS.reminders, { ...reminder, _openid: openid });
    for (const restock of backup.restockItems) await txAdd(tx, COLLECTIONS.restockItems, { ...restock, _openid: openid });
    if (backup.settings) await txAdd(tx, COLLECTIONS.settings, { ...backup.settings, _openid: openid });
  });
  return validation;
}
async function exportExcelText(openid) {
  const snapshot = await allUserData(openid);
  const categoryById = new Map(snapshot.categories.map((category) => [category._id, category.name]));
  const locationById = new Map(snapshot.locations.map((location) => [location._id, location.name]));
  const itemById = new Map(snapshot.items.map((item) => [item._id, item]));
  const totalByItemId = new Map();
  for (const batch of snapshot.batches) totalByItemId.set(batch.itemId, (totalByItemId.get(batch.itemId) || 0) + Number(batch.quantity || 0));
  const rows = [EXCEL_EXPORT_HEADERS.join("\t")];
  for (const batch of snapshot.batches) {
    const item = itemById.get(batch.itemId);
    if (!item) continue;
    const expiry = effectiveExpiry(batch);
    const days = expiry === UNKNOWN_EXPIRY_DATE ? "" : remainingDays(expiry);
    const itemStockStatus = stockStatus(totalByItemId.get(item._id) || 0, item.lowStockThreshold);
    rows.push([
      item.name,
      categoryById.get(item.categoryId) || "",
      item.brand || "",
      item.specification || "",
      batch.quantity,
      item.unit,
      locationById.get(batch.locationId) || "",
      batch.purchaseDate || "",
      batch.productionDate || "",
      batch.shelfLifeValue || "",
      batch.shelfLifeUnit || "",
      batch.expiryDate === UNKNOWN_EXPIRY_DATE ? "" : batch.expiryDate,
      batch.purchasePrice == null ? "" : batch.purchasePrice,
      batch.purchaseChannel || "",
      item.lowStockThreshold == null ? "" : item.lowStockThreshold,
      item.expiryWarningDays == null ? "" : item.expiryWarningDays,
      batch.note || item.note || "",
      days,
      expiryStatus(batch, item.expiryWarningDays ?? 30),
      itemStockStatus,
    ].map((value) => String(value).replace(/\t/g, " ")).join("\t"));
  }
  return { fileName: `youbeilu_inventory_${todayText()}.tsv`, text: rows.join("\n") };
}
exports.main = async function main(event) {
  try {
    const openid = cloud.getWXContext().OPENID;
    if (!openid) throw dataError("UNAUTHENTICATED", "Missing OPENID");
    if (!event || !event.action) throw dataError("VALIDATION_ERROR", "action is required");
    if (event.action === "previewExcelImport") return ok(await previewExcelImport(openid, event.payload || {}));
    if (event.action === "previewSmartImport") return ok(await previewSmartImport(openid, event.payload || {}));
    if (event.action === "commitSmartImport") return ok(await commitSmartImport(openid, event.payload || {}));
    if (event.action === "commitExcelImport") return ok(await commitExcelImport(openid, event.payload || {}));
    if (event.action === "exportExcelText") return ok(await exportExcelText(openid));
    if (event.action === "exportBackup") return ok(await exportBackup(openid));
    if (event.action === "previewRestore") return ok(validateBackup((event.payload || {}).backup));
    if (event.action === "restoreBackup") return ok(await restoreBackup(openid, event.payload || {}));
    throw dataError("VALIDATION_ERROR", `Unsupported action: ${event.action}`);
  } catch (error) {
    return fail(error);
  }
};
