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
exports.addStock = addStock;
exports.consumeStock = consumeStock;
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
async function getHomeDashboard() {
    return callCloudFunction('inventoryRead', 'getHomeDashboard');
}
async function getItemDetail(itemId) {
    return callCloudFunction('inventoryRead', 'getItemDetail', { itemId });
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
