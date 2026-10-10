"use strict";

const { parseSource, inspectWorkbook } = require("../parsers/source");
const { labels, mapColumn } = require("./fields");
const schemas = require("../ai/schemas");
const { AIProvider } = require("../ai/provider");
const Ajv = require("ajv");
const ajv = new Ajv({ strict: true });
const nonempty = row => row.some(v => v != null && String(v).trim());
function detectTableCandidates(sheet) {
  const headers = [];
  sheet.rows.forEach((row, headerRow) => {
    const mapping = row.map((header, column) => ({ column, sourceColumn: String(header || ""), ...mapColumn(header, sheet.rows.slice(headerRow + 1, headerRow + 5).map(r => r[column])) }));
    const fields = mapping.map(m => m.targetField);
    if (fields.includes("item.name") && fields.includes("batch.quantity")) headers.push({ headerRow, mapping });
  });
  // Unknown headers remain available for manual mapping when no known header can be found.
  if (!headers.length) {
    const headerRow = sheet.rows.findIndex(row => row.filter(v => v != null && v !== "").length >= 2);
    if (headerRow >= 0) headers.push({ headerRow, mapping: sheet.rows[headerRow].map((header, column) => ({ column, sourceColumn: String(header || ""), ...mapColumn(header) })) });
  }
  return headers.map((header, index) => {
    let endRow = (headers[index + 1]?.headerRow ?? sheet.rows.length) - 1;
    if (headers[index + 1] && sheet.rows[endRow].filter(v => v != null && v !== "").length === 1) endRow--;
    for (let row = header.headerRow + 1; row <= endRow; row++) if (!nonempty(sheet.rows[row])) { endRow = row - 1; break; }
    const preceding = sheet.rows.slice(Math.max(0, header.headerRow - 2), header.headerRow).filter(r => r.filter(v => v).length === 1).pop();
    const title = preceding ? String(preceding.find(v => v)) : sheet.name;
    const categoryPattern = /^(食品|日化|日用品|护肤品|零食)$/;
    const categoryHint = categoryPattern.test(title) ? title : categoryPattern.test(sheet.name) ? sheet.name : null;
    const locationPattern = /^(冰箱|冷冻室|储藏室|浴室柜)(库存)?$/;
    const locationHint = locationPattern.exec(title)?.[1] || locationPattern.exec(sheet.name)?.[1] || null;
    const role = /历史|统计|汇总|采购计划|说明/.test(title) ? "UNKNOWN" : "CURRENT_INVENTORY";
    return { id: `${sheet.index}:${header.headerRow}:0`, sheetIndex: sheet.index, sheet: sheet.name, headerRow: header.headerRow, startColumn: 0, endColumn: header.mapping.length - 1, endRow, selected: role === "CURRENT_INVENTORY" && header.mapping.some(m => m.targetField === "item.name"), role, confidence: header.mapping.some(m => m.targetField === "batch.quantity") ? 1 : 0.3, reason: "规则检测表头/连续区域", categoryHint, locationHint, mapping: header.mapping };
  });
}
function ruleRole(name) {
  if (/工资|身份证|通讯录/.test(name)) return "IGNORE";
  if (/历史|20\d{2}/.test(name)) return "HISTORICAL_DATA";
  if (/说明|指南/.test(name)) return "INSTRUCTIONS";
  if (/统计|汇总|分析/.test(name)) return "ANALYTICS";
  if (/采购|计划|补货/.test(name)) return "REFERENCE";
  return "CURRENT_INVENTORY";
}
async function attempt(provider, task, schema, input, warnings) {
  try {
    const output = await provider.structured(task, schema, input);
    if (!ajv.compile(schema)(output)) throw new Error("AI 输出未通过结构校验");
    return output;
  } catch (error) { warnings.push(error.message); return null; }
}
async function createImportPlan(payload, provider = new AIProvider()) {
  const source = parseSource(payload);
  const plan = { version: 1, sourceType: source.sourceType, sourceFileName: source.fileName, referenceDate: payload.referenceDate || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), sheets: [], tables: [], warnings: [], textCandidates: [] };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.referenceDate)) throw new Error("referenceDate 格式不正确");
  if (source.sourceType === "text") {
    if (source.text.length > 12000) throw new Error("文本超过 12000 字符，请拆分导入");
    const result = payload.allowAI === true ? await attempt(provider, "从文本抽取库存。sourceText 必须逐字引用对应原句；不确定内容警告，购买日期不代表生产日期。", schemas.extraction, { text: source.text, referenceDate: plan.referenceDate }, plan.warnings) : null;
    plan.textCandidates = (result?.candidates || []).map((candidate, index) => {
      if (!candidate.sourceText || !source.text.includes(candidate.sourceText)) throw new Error("抽取结果来源不在原文中");
      const warnings = [...candidate.warnings];
      warnings.push("文本识别结果需人工核对");
      for (const field of ["batch.purchaseDate", "batch.productionDate", "batch.expiryDate"]) {
        const date = candidate.values[field];
        if (!date) continue;
        const relative = /(今天|昨天|前天).*买|买.*(今天|昨天|前天)/.exec(candidate.sourceText);
        if (field === "batch.purchaseDate" && relative) {
          const offset = { 今天: 0, 昨天: 1, 前天: 2 }[relative[1] || relative[2]];
          candidate.values[field] = new Date(Date.parse(plan.referenceDate + "T00:00:00Z") - offset * 86400000).toISOString().slice(0, 10);
        } else if (!candidate.sourceText.replace(/[年/.]/g, "-").replace(/月/g, "-").replace(/日/g, "").includes(date)) {
          candidate.values[field] = null;
          warnings.push(labels[field] + "缺少明确日期依据");
        }
      }
      if (!candidate.values["batch.purchaseDate"]) warnings.push("购买日期缺失");
      return { id: `text:${index}`, values: candidate.values, source: { file: source.fileName, sourceText: candidate.sourceText, sentence: index }, confidence: candidate.confidence, warnings, confirmed: false };
    });
    if (!plan.textCandidates.length) plan.warnings.push("未识别到库存，可启用 AI 或手动添加候选记录");
    return { source, plan, metrics: provider.metrics || [] };
  }
  plan.sheets = source.sheets.map(sheet => ({ index: sheet.index, name: sheet.name, role: ruleRole(sheet.name), selected: ruleRole(sheet.name) === "CURRENT_INVENTORY", confidence: 1, reason: "Sheet 名称规则" }));
  let tables = source.sheets.flatMap(detectTableCandidates);
  const needsAI = source.sheets.length > 1 || tables.length > 1 || tables.some(t => t.confidence < 1 || t.mapping.some(m => m.targetField === "UNKNOWN" || m.method === "HEURISTIC"));
  if (needsAI && payload.allowAI) {
    const summary = inspectWorkbook(source);
    summary.sheets = summary.sheets.filter(s => ruleRole(s.name) !== "IGNORE");
    const classification = await attempt(provider, "分类工作表，仅 CURRENT_INVENTORY 默认导入。", schemas.classifications, summary, plan.warnings);
    for (const item of classification?.sheets || []) {
      const sheet = plan.sheets.find(s => s.index === item.index);
      if (sheet && sheet.role !== "IGNORE") Object.assign(sheet, item, { selected: item.role === "CURRENT_INVENTORY" && item.confidence >= 0.85 });
    }
    for (const sheet of source.sheets) {
      if (!plan.sheets.find(s => s.index === sheet.index)?.selected) continue;
      const sheetTables = tables.filter(t => t.sheetIndex === sheet.index);
      if (sheetTables.length !== 1 || sheetTables[0]?.confidence < 1) {
        const regions = await attempt(provider, "识别表区域。行列为从零开始的原始坐标，不得重叠。", schemas.regions, summary.sheets.find(s => s.index === sheet.index), plan.warnings);
        const validRegions = regions?.tables.every(region => region.headerRow < sheet.rows.length && region.endRow >= region.headerRow && region.endRow < sheet.rows.length && region.startColumn <= region.endColumn && region.endColumn < sheet.columnCount);
        if (regions?.tables.length && validRegions) {
          const proposed = regions.tables.map(region => {
            if (region.headerRow >= sheet.rows.length || region.endRow < region.headerRow || region.endRow >= sheet.rows.length || region.startColumn > region.endColumn || region.endColumn >= sheet.columnCount) throw new Error("AI 表区域越界");
            const mapping = sheet.rows[region.headerRow].slice(region.startColumn, region.endColumn + 1).map((header, offset) => ({ column: region.startColumn + offset, sourceColumn: String(header || ""), ...mapColumn(header) }));
            return { ...region, id: `${sheet.index}:${region.headerRow}:${region.startColumn}`, sheetIndex: sheet.index, sheet: sheet.name, mapping, selected: region.role === "CURRENT_INVENTORY" && region.confidence >= 0.85 };
          });
          const overlaps = proposed.some((a, index) => proposed.slice(index + 1).some(b => a.headerRow <= b.endRow && b.headerRow <= a.endRow && a.startColumn <= b.endColumn && b.startColumn <= a.endColumn));
          if (overlaps) plan.warnings.push("AI 区域重叠，保留规则识别结果");
          else tables = tables.filter(t => t.sheetIndex !== sheet.index).concat(proposed);
        } else if (regions?.tables.length) plan.warnings.push("AI 表区域越界，保留规则识别结果");
      }
      for (const table of tables.filter(t => t.sheetIndex === sheet.index)) {
        if (!table.mapping.some(m => m.targetField === "UNKNOWN" || m.method === "HEURISTIC")) continue;
        const result = await attempt(provider, "映射字段，仅选择允许的 Canonical Fields。无法确定选择 UNKNOWN；无关列 IGNORE。", schemas.mappings, { sheet: sheet.name, categoryHint: table.categoryHint, columns: table.mapping.map(m => ({ column: m.column, header: m.sourceColumn, sample: sheet.rows.slice(table.headerRow + 1, Math.min(table.endRow + 1, table.headerRow + 5)).map(r => r[m.column]) })) }, plan.warnings);
        for (const item of result?.mapping || []) {
          const mapping = table.mapping.find(m => m.column === item.column);
          if (mapping && mapping.method !== "RULE") Object.assign(mapping, item, { method: "AI" });
        }
      }
    }
  }
  plan.tables = tables;
  return { source, plan, metrics: provider.metrics || [] };
}
function applyChanges(job, changes = {}) {
  const plan = JSON.parse(JSON.stringify(job.plan));
  for (const edit of changes.sheets || []) {
    const sheet = plan.sheets.find(s => s.index === edit.index);
    if (!sheet || typeof edit.selected !== "boolean") throw new Error("Sheet 选择不正确");
    sheet.selected = edit.selected;
  }
  for (const edit of changes.tables || []) {
    const table = plan.tables.find(t => t.id === edit.id);
    if (!table) throw new Error("Table 不存在");
    if (edit.headerRow != null || edit.endRow != null || edit.startColumn != null || edit.endColumn != null) {
      const sheet = job.source.sheets.find(s => s.index === table.sheetIndex);
      const headerRow = edit.headerRow ?? table.headerRow;
      const endRow = edit.endRow ?? table.endRow;
      const startColumn = edit.startColumn ?? table.startColumn;
      const endColumn = edit.endColumn ?? table.endColumn;
      if (!Number.isInteger(headerRow) || !Number.isInteger(endRow) || headerRow < 0 || endRow < headerRow || endRow >= sheet.rows.length) throw new Error("表区域行号无效");
      if (!Number.isInteger(startColumn) || !Number.isInteger(endColumn) || startColumn < 0 || endColumn < startColumn || endColumn >= sheet.columnCount) throw new Error("表区域列号无效");
      if (headerRow !== table.headerRow || startColumn !== table.startColumn || endColumn !== table.endColumn) {
        table.mapping = Array.from({ length: endColumn - startColumn + 1 }, (_, offset) => { const column = startColumn + offset; const header = sheet.rows[headerRow][column]; return { column, sourceColumn: String(header || ""), ...mapColumn(header) }; });
      }
      Object.assign(table, { headerRow, endRow, startColumn, endColumn });
    }
    if (typeof edit.selected === "boolean") table.selected = edit.selected;
    for (const field of ["categoryHint", "locationHint"]) if (typeof edit[field] === "string") table[field] = edit[field].trim();
    for (const mappingEdit of edit.mapping || []) {
    if (!Object.prototype.hasOwnProperty.call(labels, mappingEdit.targetField)) throw new Error("字段不在 Canonical Fields 内");
      const mapping = table.mapping.find(m => m.column === mappingEdit.column);
      if (!mapping) throw new Error("列不存在");
      Object.assign(mapping, { targetField: mappingEdit.targetField, method: "USER", confidence: 1, reason: "用户指定" });
    }
  }
  return plan;
}
function generateCandidates(source, plan, edits = []) {
  let candidates = plan.textCandidates || [];
  if (source.sourceType !== "text") {
    candidates = [];
    const selectedTables = plan.tables.filter(t => t.selected && plan.sheets.find(s => s.index === t.sheetIndex)?.selected);
    if (selectedTables.some((a, index) => selectedTables.slice(index + 1).some(b => a.sheetIndex === b.sheetIndex && a.headerRow <= b.endRow && b.headerRow <= a.endRow && a.startColumn <= b.endColumn && b.startColumn <= a.endColumn))) throw new Error("选中的表区域重叠，请修改范围");
    for (const table of plan.tables) {
      if (!table.selected || !plan.sheets.find(s => s.index === table.sheetIndex)?.selected) continue;
      const fields = table.mapping.filter(m => !["IGNORE", "UNKNOWN"].includes(m.targetField));
      if (new Set(fields.map(m => m.targetField)).size !== fields.length) throw new Error("同一张表不能重复映射目标字段");
      const sheet = source.sheets.find(s => s.index === table.sheetIndex);
      for (let index = table.headerRow + 1; index <= table.endRow; index++) {
        const row = sheet.rows[index];
        if (!nonempty(row)) continue;
        const values = Object.fromEntries(fields.map(m => {
          let value = row[m.column] == null ? null : String(row[m.column]).trim();
          if (/Date$/.test(m.targetField) && value && /^\d+(\.\d+)?$/.test(value)) value = new Date((sheet.date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)) + Math.floor(Number(value)) * 86400000).toISOString().slice(0, 10);
          return [m.targetField, value];
        }));
        const warnings = [];
        if (!values["item.category"] && table.categoryHint) { values["item.category"] = table.categoryHint; warnings.push("类别来自表上下文"); }
        if (!values["batch.location"] && table.locationHint) { values["batch.location"] = table.locationHint; warnings.push("位置来自表上下文"); }
        const confidence = Math.min(table.confidence, plan.sheets.find(s => s.index === table.sheetIndex).confidence, ...fields.map(m => m.confidence));
        if (table.mapping.some(m => m.targetField === "UNKNOWN")) warnings.push("存在未指定字段");
        candidates.push({ id: `${table.id}:${index}`, values, source: { file: source.fileName, sheet: sheet.name, row: index + 1, table: table.id, sourceText: row.join(" | ") }, confidence, warnings, confirmed: false });
      }
    }
  }
  candidates = JSON.parse(JSON.stringify(candidates));
  for (const edit of edits) {
    let candidate = candidates.find(c => c.id === edit.id);
    if (!candidate && source.sourceType === "text" && /^manual:[\w-]+$/.test(edit.id)) { candidate = { id: edit.id, values: {}, source: { file: source.fileName, sourceText: source.text }, confidence: 1, warnings: ["用户手动录入"], confirmed: false }; candidates.push(candidate); }
    if (!candidate) {
      if (source.sourceType !== "text") continue;
      throw new Error("候选不存在");
    }
    for (const [field, value] of Object.entries(edit.values || {})) {
      if (!Object.prototype.hasOwnProperty.call(labels, field) || ["UNKNOWN", "IGNORE"].includes(field) || (value !== null && typeof value !== "string")) throw new Error("候选字段无效");
      candidate.values[field] = value;
    }
    if (edit.confirmed === true) candidate.confirmed = true;
  }
  return candidates;
}
function candidateRows(candidates) {
  return candidates.map((c, index) => ({ rowNumber: index + 2, sourceId: c.id, values: Object.fromEntries(Object.entries(c.values).map(([field, value]) => [labels[field], value])) }));
}
module.exports = { createImportPlan, detectTableCandidates, applyChanges, generateCandidates, candidateRows };
