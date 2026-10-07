"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adjustStock = adjustStock;
exports.updateItem = updateItem;
exports.updateBatch = updateBatch;
exports.getPhase2Context = getPhase2Context;
exports.resetPhase2ContextForTests = resetPhase2ContextForTests;
exports.getTaxonomyOptions = getTaxonomyOptions;
exports.createCategory = createCategory;
exports.createLocation = createLocation;
exports.listInventoryRows = listInventoryRows;
exports.getHomeDashboard = getHomeDashboard;
exports.getItemDetail = getItemDetail;
exports.listReminderCenter = listReminderCenter;
exports.getAnalysisOverview = getAnalysisOverview;
exports.addStock = addStock;
exports.consumeStock = consumeStock;
exports.markReminderRead = markReminderRead;
exports.dismissReminder = dismissReminder;
exports.purgeDismissedReminder = purgeDismissedReminder;
exports.addToRestock = addToRestock;
exports.dismissRestock = dismissRestock;
const cloud_1 = require("../config/cloud");
const index_1 = require("../repositories/index");
const inventory_service_1 = require("./inventory-service");
const inventory_mutation_client_1 = require("./inventory-mutation-client");
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
async function callCloudFunction(name, action, payload = {}) {
    (0, cloud_1.initCloud)();
    if (!wx.cloud)
        throw new Error('wx.cloud is not initialized');
    const response = await wx.cloud.callFunction({ name, data: { action, payload } });
    const result = response.result;
    if (!result?.ok) {
        const error = new Error(result?.error?.message || '云服务调用失败');
        error.code = result?.error?.code;
        throw error;
    }
    return result.data;
}
async function getPhase2Context() {
    if (cachedContext)
        return cachedContext;
    const userId = await getOpenId();
    const repos = (0, index_1.createRepositories)('cloud');
    const inventory = new inventory_service_1.InventoryService(repos, {
        userId,
        defaultExpiryWarningDays: 7,
        mutationClient: new inventory_mutation_client_1.CloudFunctionInventoryMutationClient(),
        requireMutationClientForWrites: true,
    });
    cachedContext = { userId, repos, inventory };
    return cachedContext;
}
function resetPhase2ContextForTests() {
    cachedContext = null;
}
async function getTaxonomyOptions() {
    return callCloudFunction('taxonomyManage', 'getOptions');
}
async function createCategory(name) {
    return callCloudFunction('taxonomyManage', 'createCategory', { name });
}
async function createLocation(name) {
    return callCloudFunction('taxonomyManage', 'createLocation', { name });
}
async function listInventoryRows(options = {}) {
    return callCloudFunction('inventoryRead', 'listInventoryRows', {
        search: options.search?.trim() || '',
        positiveOnly: Boolean(options.positiveOnly),
        categoryId: options.categoryId || '',
        locationId: options.locationId || '',
        expiryStatus: options.expiryStatus || '',
        stockStatus: options.stockStatus || '',
        sortBy: options.sortBy || 'nearestExpiry',
        limit: options.limit,
        offset: options.offset || 0,
    });
}
function isUnsupportedHomeDashboard(error) {
    const message = String(error.message || '');
    return /Unsupported action:\s*getHomeDashboard/i.test(message);
}
function buildFallbackHomeDashboard(rows) {
    const expiringCount = rows.filter((row) => row.expiryStatuses?.includes('EXPIRING') || row.expiryStatus === 'EXPIRING').length;
    const expiredCount = rows.filter((row) => row.expiryStatuses?.includes('EXPIRED') || row.expiryStatus === 'EXPIRED').length;
    const lowStockCount = rows.filter((row) => row.stockStatus === 'LOW').length;
    const zeroStockCount = rows.filter((row) => row.stockStatus === 'ZERO').length;
    const restockCount = rows.filter((row) => row.restockNeeded).length;
    const alertLines = [];
    if (expiredCount)
        alertLines.push(`${expiredCount} 件物品已过期`);
    if (expiringCount)
        alertLines.push(`${expiringCount} 件物品近期临期`);
    if (lowStockCount)
        alertLines.push(`${lowStockCount} 件物品库存不足`);
    if (zeroStockCount)
        alertLines.push(`${zeroStockCount} 件物品已经归零`);
    if (!alertLines.length)
        alertLines.push(rows.length ? '当前没有需要立即处理的库存' : '还没有库存，先记录第一件物品');
    const backgroundFacts = rows
        .filter((row) => row.totalQuantity > 0)
        .slice(0, 12)
        .map((row, index) => ({
        itemId: row.item._id,
        text: `${row.label} · ${row.totalQuantity}${row.item.unit}${row.locationSummary ? ` · ${row.locationSummary}` : ''}`,
        lane: index % 3,
    }));
    return {
        summary: {
            itemCount: rows.length,
            batchCount: rows.reduce((sum, row) => sum + (row.batchCount ?? (row.totalQuantity > 0 ? 1 : 0)), 0),
            expiringCount,
            expiredCount,
            lowStockCount,
            zeroStockCount,
            restockCount,
        },
        alertLines,
        backgroundFacts,
    };
}
async function getHomeDashboard() {
    try {
        return await callCloudFunction('inventoryRead', 'getHomeDashboard');
    }
    catch (error) {
        if (!isUnsupportedHomeDashboard(error))
            throw error;
        const rows = await listInventoryRows();
        return buildFallbackHomeDashboard(rows);
    }
}
async function getItemDetail(itemId) {
    return callCloudFunction('inventoryRead', 'getItemDetail', { itemId });
}
async function listReminderCenter(options = {}) {
    return callCloudFunction('inventoryRead', 'listReminderCenter', {
        type: options.type || '',
        status: options.status || 'open',
        includeClosedRestock: Boolean(options.includeClosedRestock),
    });
}
async function getAnalysisOverview(options = {}) {
    return callCloudFunction('inventoryRead', 'getAnalysisOverview', {
        range: options.range || '30d',
    });
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
    return callCloudFunction('inventoryWrite', 'updateItem', { itemId, patch });
}
async function updateBatch(batchId, patch) {
    return callCloudFunction('inventoryWrite', 'updateBatch', { batchId, patch });
}
async function markReminderRead(reminderId) {
    return callCloudFunction('inventoryWrite', 'markReminderRead', { reminderId });
}
async function dismissReminder(reminderId) {
    return callCloudFunction('inventoryWrite', 'dismissReminder', { reminderId });
}
async function purgeDismissedReminder(reminderId) {
    return callCloudFunction('inventoryWrite', 'purgeDismissedReminder', { reminderId });
}
async function addToRestock(itemId) {
    return callCloudFunction('inventoryWrite', 'addToRestock', { itemId });
}
async function dismissRestock(restockId) {
    return callCloudFunction('inventoryWrite', 'dismissRestock', { restockId });
}
