"use strict";
const fs = require("fs");
const path = require("path");
const XLSX = require("../cloudfunctions/dataManage/node_modules/xlsx");
const output = path.resolve(__dirname, "../tests/fixtures/phase6b");
fs.mkdirSync(output, { recursive: true });
const rows = [["物品名称", "数量", "单位", "存放位置", "到期日期"], ["验收牛奶", 6, "盒", "冰箱", "2026-12-20"]];
function save(name, sheets) {
  const book = XLSX.utils.book_new();
  for (const [title, values] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(values), title);
  XLSX.writeFile(book, path.join(output, name + ".xlsx"));
}
save("01-standard", { 库存: rows });
save("02-multi-sheet", { 说明: [["仅食品和日用品是当前库存"]], 食品: rows, 日用品: [["名称", "数量", "单位"], ["验收洗发水", 2, "瓶"]], 统计: [["库存总量", 8]] });
save("03-nonstandard", { 库存: [["东西", "还剩", "计量", "柜子", "啥时候过期"], ["验收牛奶", 6, "盒", "冰箱", "2026-12-20"]] });
save("04-title-before-header", { 库存: [["家庭库存清单"], ["更新时间", "2026-10-10"], ["仅登记实际库存"], ...rows] });
save("05-two-tables", { 库存: [["食品"], ...rows, [], ["日化"], ["名称", "数量", "单位"], ["验收洗发水", 2, "瓶"]] });
save("07-ambiguous", { 混合: [["清单"], ["余量", "日期", "金额"], ["一些", "上个月", "不清楚"], [], ["采购计划"], ["牛奶", "下周"]] });
fs.writeFileSync(path.join(output, "06-text.txt"), "冰箱还有6盒250ml蒙牛牛奶，前天买的，保质期21天。\n冷冻室有10包500g鸡腿，购买日期忘了。\n洗发水大概还有2瓶。\n", "utf8");
console.log("Created seven Phase 6B manual fixtures in " + output);
