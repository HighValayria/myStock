"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPhase2Context = getPhase2Context;
exports.resetPhase2ContextForTests = resetPhase2ContextForTests;
exports.listInventoryRows = listInventoryRows;
exports.getItemDetail = getItemDetail;
exports.addStock = addStock;
exports.consumeStock = consumeStock;
exports.adjustStock = adjustStock;
exports.updateItem = updateItem;
exports.updateBatch = updateBatch;
const cloud_1 = require("../config/cloud");
const repositories_1 = require("../repositories");
const index_1 = require("./index");
let cachedContext = null;
async function getOpenId() {
    (0, cloud_1.initCloud)();
    if (!wx.cloud)
        throw new Error('wx.cloud is not initialized');
    const response = await wx.cloud.callFunction({ name: 'getOpenId' });
    const openid = response.result?.openid;
    if (!openid)
        throw new Error('无法获取当前微信用户身份');
    return openid;
}
async function getPhase2Context() {
    if (cachedContext)
        return cachedContext;
    const userId = await getOpenId();
    const repos = (0, repositories_1.createRepositories)('cloud');
    const inventory = new index_1.InventoryService(repos, {
        userId,
        defaultExpiryWarningDays: 7,
        mutationClient: new index_1.CloudFunctionInventoryMutationClient(),
        requireMutationClientForWrites: true,
    });
    cachedContext = { userId, repos, inventory };
    return cachedContext;
}
function resetPhase2ContextForTests() {
    cachedContext = null;
}
async function listInventoryRows(options = {}) {
    const context = await getPhase2Context();
    const rows = await context.inventory.getInventory({ search: options.search?.trim() || undefined });
    const transactions = await context.repos.transactions.listByUser(context.userId);
    const recentAtByItem = new Map();
    for (const transaction of transactions) {
        const current = recentAtByItem.get(transaction.itemId) ?? 0;
        if (transaction.createdAt > current)
            recentAtByItem.set(transaction.itemId, transaction.createdAt);
    }
    return rows
        .filter((row) => !options.positiveOnly || row.totalQuantity > 0)
        .map((row) => ({
        ...row,
        recentAt: recentAtByItem.get(row.item._id) ?? 0,
        label: `${row.item.name}${row.item.specification ? ` ${row.item.specification}` : ''}`,
    }))
        .sort((a, b) => {
        if (b.recentAt !== a.recentAt)
            return b.recentAt - a.recentAt;
        return a.label.localeCompare(b.label, 'zh-Hans-CN');
    });
}
async function getItemDetail(itemId) {
    const context = await getPhase2Context();
    return context.inventory.getItemDetail(itemId);
}
async function addStock(input) {
    const context = await getPhase2Context();
    return context.inventory.addStock(input);
}
async function consumeStock(input) {
    const context = await getPhase2Context();
    return context.inventory.consumeStock(input);
}
async function adjustStock(input) {
    const context = await getPhase2Context();
    return context.inventory.adjustStock(input);
}
async function updateItem(itemId, patch) {
    const context = await getPhase2Context();
    return context.inventory.updateItem(itemId, patch);
}
async function updateBatch(batchId, patch) {
    const context = await getPhase2Context();
    return context.inventory.updateBatch(batchId, patch);
}
