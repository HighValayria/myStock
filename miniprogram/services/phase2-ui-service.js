"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPhase2Context = getPhase2Context;
exports.resetPhase2ContextForTests = resetPhase2ContextForTests;
exports.getTaxonomyOptions = getTaxonomyOptions;
exports.createCategory = createCategory;
exports.createLocation = createLocation;
exports.listInventoryRows = listInventoryRows;
exports.getItemDetail = getItemDetail;
exports.addStock = addStock;
exports.consumeStock = consumeStock;
exports.adjustStock = adjustStock;
exports.updateItem = updateItem;
exports.updateBatch = updateBatch;
const collections_1 = require("../config/collections");
const cloud_1 = require("../config/cloud");
const index_1 = require("../repositories/index");
const id_1 = require("../utils/id");
const inventory_service_1 = require("./inventory-service");
const inventory_mutation_client_1 = require("./inventory-mutation-client");
const DEFAULT_CATEGORIES = ['食品', '护肤品', '日化用品', '其他'];
const DEFAULT_LOCATIONS = ['厨房', '冰箱', '冷藏室', '冷冻室', '浴室柜'];
let cachedContext = null;
let taxonomyEnsured = false;
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
function now() {
    return Date.now();
}
function normalizeName(name) {
    return name.trim().replace(/\s+/g, ' ');
}
function categoryDoc(userId, name) {
    const time = now();
    return {
        _id: (0, id_1.createId)('cat'),
        _openid: userId,
        schemaVersion: collections_1.SCHEMA_VERSION,
        name,
        icon: null,
        expiryWarningDays: null,
        defaultLowStock: null,
        createdAt: time,
        updatedAt: time,
    };
}
function locationDoc(userId, name) {
    const time = now();
    return {
        _id: (0, id_1.createId)('loc'),
        _openid: userId,
        schemaVersion: collections_1.SCHEMA_VERSION,
        name,
        parentId: null,
        createdAt: time,
        updatedAt: time,
    };
}
async function ensureDefaultTaxonomy(context) {
    if (taxonomyEnsured)
        return;
    const [categories, locations] = await Promise.all([
        context.repos.categories.listByUser(context.userId),
        context.repos.locations.listByUser(context.userId),
    ]);
    const existingCategoryNames = new Set(categories.map((item) => normalizeName(item.name).toLowerCase()));
    const existingLocationNames = new Set(locations.map((item) => normalizeName(item.name).toLowerCase()));
    for (const name of DEFAULT_CATEGORIES) {
        if (!existingCategoryNames.has(name.toLowerCase())) {
            await context.repos.categories.create(categoryDoc(context.userId, name));
        }
    }
    for (const name of DEFAULT_LOCATIONS) {
        if (!existingLocationNames.has(name.toLowerCase())) {
            await context.repos.locations.create(locationDoc(context.userId, name));
        }
    }
    taxonomyEnsured = true;
}
function locationLabel(location, byId) {
    const names = [location.name];
    let parentId = location.parentId ?? null;
    const seen = new Set([location._id]);
    while (parentId && !seen.has(parentId)) {
        const parent = byId.get(parentId);
        if (!parent)
            break;
        names.unshift(parent.name);
        seen.add(parent._id);
        parentId = parent.parentId ?? null;
    }
    return names.join(' / ');
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
    taxonomyEnsured = false;
}
async function getTaxonomyOptions() {
    const context = await getPhase2Context();
    await ensureDefaultTaxonomy(context);
    const [categories, locations] = await Promise.all([
        context.repos.categories.listByUser(context.userId),
        context.repos.locations.listByUser(context.userId),
    ]);
    const locationById = new Map(locations.map((location) => [location._id, location]));
    return {
        categories: categories
            .map((category) => ({ id: category._id, name: category.name }))
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')),
        locations: locations
            .map((location) => ({ id: location._id, name: location.name, parentId: location.parentId, label: locationLabel(location, locationById) }))
            .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN')),
    };
}
async function createCategory(name) {
    const trimmed = normalizeName(name);
    if (!trimmed)
        throw new Error('请输入类别名称');
    const context = await getPhase2Context();
    await ensureDefaultTaxonomy(context);
    const existing = (await context.repos.categories.listByUser(context.userId)).find((item) => normalizeName(item.name).toLowerCase() === trimmed.toLowerCase());
    if (existing)
        return { id: existing._id, name: existing.name };
    const created = await context.repos.categories.create(categoryDoc(context.userId, trimmed));
    return { id: created._id, name: created.name };
}
async function createLocation(name) {
    const trimmed = normalizeName(name);
    if (!trimmed)
        throw new Error('请输入位置名称');
    const context = await getPhase2Context();
    await ensureDefaultTaxonomy(context);
    const existing = (await context.repos.locations.listByUser(context.userId)).find((item) => normalizeName(item.name).toLowerCase() === trimmed.toLowerCase());
    if (existing)
        return { id: existing._id, name: existing.name, parentId: existing.parentId, label: existing.name };
    const created = await context.repos.locations.create(locationDoc(context.userId, trimmed));
    return { id: created._id, name: created.name, parentId: created.parentId, label: created.name };
}
async function listInventoryRows(options = {}) {
    const context = await getPhase2Context();
    const rows = await context.inventory.getInventory({ search: options.search?.trim() || undefined, categoryId: options.categoryId || undefined });
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
