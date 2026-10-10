"use strict";

const XLSX = require("xlsx");
const { parse } = require("csv-parse/sync");
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_CELLS = 100000;
function parseSource(payload) {
  const fileName = String(payload.fileName || "粘贴内容").slice(0, 200);
  const buffer = payload.fileBase64 ? Buffer.from(payload.fileBase64, "base64") : Buffer.from(payload.text || "", "utf8");
  if (buffer.length > MAX_BYTES) throw new Error("导入文件超过 2MB，请拆分后导入");
  if (payload.sourceType === "text" || /\.txt$/i.test(fileName)) return { sourceType: "text", fileName, text: buffer.toString("utf8") };
  let sheets;
  const spreadsheet = /\.(xlsx|xls)$/i.test(fileName) || (buffer[0] === 80 && buffer[1] === 75);
  if (spreadsheet) {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, cellFormula: false, sheetRows: 5001 });
    sheets = workbook.SheetNames.map((name, index) => {
      const sheet = workbook.Sheets[name];
      const full = sheet["!fullref"] || sheet["!ref"] || "A1";
      const extent = XLSX.utils.decode_range(full);
      if (extent.e.r >= 5000 || extent.e.c >= 100) throw new Error("每张表最多 5000 行、100 列，请拆分文件");
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: true, raw: true, range: 0 })
        .map(row => row.map(value => value instanceof Date ? value.toISOString().slice(0, 10) : value));
      return { name, index, rowCount: rows.length, columnCount: extent.e.c + 1, date1904: Boolean(workbook.Workbook?.WBProps?.date1904), rows };
    });
  } else {
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    if (text.startsWith("PK")) throw new Error("请重新选择 Excel 文件，不要粘贴二进制内容");
    const rows = parse(text, { delimiter: text.includes("\t") ? "\t" : ",", relax_column_count: true, skip_empty_lines: false });
    sheets = [{ name: "数据", index: 0, rows, rowCount: rows.length, columnCount: Math.max(0, ...rows.map(r => r.length)) }];
  }
  if (sheets.reduce((n, sheet) => n + sheet.rowCount * sheet.columnCount, 0) > MAX_CELLS) throw new Error("表格过大，请拆分文件");
  if (Buffer.byteLength(JSON.stringify(sheets)) > 450000) throw new Error("表格内容过大，请拆分文件");
  return { sourceType: spreadsheet ? "spreadsheet" : "delimited", fileName, sheets };
}
function inspectWorkbook(source) {
  return { fileName: source.fileName, sheets: source.sheets.map(sheet => {
    const populated = sheet.rows.map((row, index) => ({ row: index, cells: row.map(v => v == null ? null : String(v).slice(0, 120)).slice(0, 20) })).filter(r => r.cells.some(v => v));
    const sample = [...populated.slice(0, 6), ...populated.slice(Math.floor(populated.length / 2), Math.floor(populated.length / 2) + 2), ...populated.slice(-2)];
    return { index: sheet.index, name: sheet.name, rows: sheet.rowCount, columns: sheet.columnCount, sample };
  }) };
}
module.exports = { parseSource, inspectWorkbook };
