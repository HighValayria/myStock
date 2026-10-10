"use strict";

const zlib = require("zlib");

function dataError(message) {
  const error = new Error(message);
  error.code = "VALIDATION_ERROR";
  return error;
}

function decodeXml(text) {
  return String(text || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, value) => String.fromCharCode(Number(value)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, value) => String.fromCharCode(parseInt(value, 16)));
}

function readZipEntries(buffer) {
  const eocdSignature = 0x06054b50;
  let eocd = -1;
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === eocdSignature) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw dataError("无法识别 XLSX 文件结构");
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw dataError("XLSX 目录结构不完整");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw dataError("XLSX 文件内容不完整");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = compressed;
    else if (method === 8) data = zlib.inflateRawSync(compressed);
    else throw dataError("暂不支持该 XLSX 压缩方式");
    entries.set(name.replace(/\\/g, "/"), data.toString("utf8"));
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const output = [];
  const siPattern = /<si\b[\s\S]*?<\/si>/g;
  let match;
  while ((match = siPattern.exec(xml))) {
    const segment = match[0];
    const parts = [];
    const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let textMatch;
    while ((textMatch = textPattern.exec(segment))) parts.push(decodeXml(textMatch[1]));
    output.push(parts.join(""));
  }
  return output;
}

function attr(segment, name) {
  const match = new RegExp(`${name}="([^"]*)"`).exec(segment);
  return match ? decodeXml(match[1]) : "";
}

function columnIndex(cellRef) {
  const letters = String(cellRef || "").replace(/[^A-Z]/gi, "").toUpperCase();
  if (!letters) return -1;
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function cellValue(cellXml, sharedStrings) {
  const type = attr(cellXml, "t");
  if (type === "inlineStr") {
    const inline = /<is\b[\s\S]*?<\/is>/.exec(cellXml)?.[0] || "";
    const parts = [];
    const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let match;
    while ((match = textPattern.exec(inline))) parts.push(decodeXml(match[1]));
    return parts.join("");
  }
  const value = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cellXml)?.[1];
  if (value == null) return "";
  const decoded = decodeXml(value);
  if (type === "s") return sharedStrings[Number(decoded)] || "";
  return decoded;
}

function findFirstSheetPath(entries) {
  if (entries.has("xl/worksheets/sheet1.xml")) return "xl/worksheets/sheet1.xml";
  const workbook = entries.get("xl/workbook.xml");
  const rels = entries.get("xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) return "";
  const firstSheet = /<sheet\b[^>]*r:id="([^"]+)"/.exec(workbook);
  if (!firstSheet) return "";
  const relId = firstSheet[1];
  const relPattern = new RegExp(`<Relationship\\b[^>]*Id="${relId}"[^>]*Target="([^"]+)"`);
  const target = relPattern.exec(rels)?.[1];
  if (!target) return "";
  if (target.startsWith("/")) return target.slice(1);
  if (target.startsWith("worksheets/")) return `xl/${target}`;
  return target.startsWith("xl/") ? target : `xl/${target}`;
}

function parseSheetRows(sheetXml, sharedStrings) {
  const rows = [];
  const rowPattern = /<row\b[^>]*>[\s\S]*?<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(sheetXml))) {
    const rowXml = rowMatch[0];
    const cells = [];
    let nextIndex = 0;
    const cellPattern = /<c\b[^>]*>[\s\S]*?<\/c>/g;
    let cellMatch;
    while ((cellMatch = cellPattern.exec(rowXml))) {
      const cellXml = cellMatch[0];
      const refIndex = columnIndex(attr(cellXml, "r"));
      const index = refIndex >= 0 ? refIndex : nextIndex;
      cells[index] = cellValue(cellXml, sharedStrings);
      nextIndex = index + 1;
    }
    rows.push(cells.map((value) => value == null ? "" : String(value).trim()));
  }
  return rows;
}

function parseXlsxBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw dataError("请选择有效的 .xlsx 文件");
  }
  const entries = readZipEntries(buffer);
  const sheetPath = findFirstSheetPath(entries);
  const sheetXml = sheetPath ? entries.get(sheetPath) : "";
  if (!sheetXml) throw dataError("XLSX 中没有可读取的工作表");
  return parseSheetRows(sheetXml, parseSharedStrings(entries.get("xl/sharedStrings.xml")));
}

module.exports = { parseXlsxBuffer };
