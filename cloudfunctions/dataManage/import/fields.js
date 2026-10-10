"use strict";

const labels = {
  "item.name": "物品名称", "item.category": "类别", "item.brand": "品牌",
  "item.specification": "规格", "item.unit": "单位", "batch.quantity": "数量",
  "batch.location": "存放位置", "batch.purchaseDate": "购买日期",
  "batch.productionDate": "生产日期", "batch.shelfLifeValue": "保质期数值",
  "batch.shelfLifeUnit": "保质期单位", "batch.expiryDate": "到期日期",
  "batch.purchasePrice": "单位购买价格", "batch.purchaseChannel": "购买渠道",
  "item.lowStockThreshold": "低库存阈值", "item.expiryWarningDays": "临期阈值",
  "batch.note": "备注", IGNORE: "忽略", UNKNOWN: "待指定",
};
const aliases = { 名称: "item.name", 商品名称: "item.name", 品名: "item.name", 库存数量: "batch.quantity", 分类: "item.category", 位置: "batch.location", 单价: "batch.purchasePrice", 购买价格: "batch.purchasePrice" };
for (const [field, label] of Object.entries(labels)) aliases[label] = field;
function mapColumn(header, samples = []) {
  const text = String(header || "").trim();
  if (aliases[text]) return { targetField: aliases[text], confidence: 1, method: "RULE", reason: "标准字段或明确别名" };
  if (/^(现存|剩余|还剩|余量)$/.test(text) && samples.filter(v => v != null && v !== "").every(v => Number.isFinite(Number(v))))
    return { targetField: "batch.quantity", confidence: 0.8, method: "HEURISTIC", reason: "数量标题和数值样本" };
  if (/^(柜位|柜子|放置)$/.test(text)) return { targetField: "batch.location", confidence: 0.8, method: "HEURISTIC", reason: "位置标题；需确认" };
  return { targetField: "UNKNOWN", confidence: 0, method: "UNRESOLVED", reason: "请指定字段" };
}
module.exports = { labels, aliases, mapColumn };
