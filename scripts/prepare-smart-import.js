"use strict";
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const engine = path.join(root, "dist/cloudfunctions/inventoryWrite/index.js");
fs.copyFileSync(engine, path.join(root, "cloudfunctions/dataManage/import/inventory-engine.js"));
for (const relative of ["pages/data-management/index.js", "services/phase2-ui-service.js"]) {
  fs.copyFileSync(path.join(root, "dist/miniprogram", relative), path.join(root, "miniprogram", relative));
}
