"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudSettingsRepository = exports.CloudRestockRepository = exports.CloudReminderRepository = exports.CloudLocationRepository = exports.CloudTransactionRepository = exports.CloudBatchRepository = exports.CloudItemRepository = exports.CloudCategoryRepository = void 0;
exports.createCloudRepositories = createCloudRepositories;
const collections_1 = require("../config/collections");
const errors_1 = require("../utils/errors");
const interfaces_1 = require("./interfaces");
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
function getCloudDatabase() {
    if (typeof wx === 'undefined' || !wx.cloud) {
        throw new errors_1.InventoryError('VALIDATION_ERROR', 'wx.cloud is not initialized');
    }
    return wx.cloud.database();
}
async function first(query) {
    const result = await query;
    return result.data[0] ? clone(result.data[0]) : null;
}
class CloudCollectionRepository {
    constructor(db, collectionName) {
        this.db = db;
        this.collectionName = collectionName;
    }
    collection() {
        return this.db.collection(this.collectionName);
    }
    async create(doc) {
        await this.collection().add({ data: clone(doc) });
        return clone(doc);
    }
    async getById(userId, id) {
        return first(this.collection().where({ _id: id, _openid: userId }).limit(1).get());
    }
    async update(userId, id, patch) {
        const existing = await this.getById(userId, id);
        if (!existing)
            throw new errors_1.InventoryError('NOT_FOUND', `Document not found: ${id}`);
        await this.collection().where({ _id: id, _openid: userId }).update({ data: clone(patch) });
        const updated = await this.getById(userId, id);
        if (!updated)
            throw new errors_1.InventoryError('NOT_FOUND', `Document not found after update: ${id}`);
        return updated;
    }
    async delete(userId, id) {
        const existing = await this.getById(userId, id);
        if (!existing)
            throw new errors_1.InventoryError('NOT_FOUND', `Document not found: ${id}`);
        await this.collection().where({ _id: id, _openid: userId }).remove();
    }
    async listByUser(userId) {
        const result = await this.collection().where({ _openid: userId }).get();
        return result.data.map(clone);
    }
}
class CloudCategoryRepository {
    constructor(db) { this.base = new CloudCollectionRepository(db, collections_1.COLLECTIONS.categories); }
    create(doc) { return this.base.create(doc); }
    getById(userId, id) { return this.base.getById(userId, id); }
    update(userId, id, patch) { return this.base.update(userId, id, patch); }
    listByUser(userId) { return this.base.listByUser(userId); }
}
exports.CloudCategoryRepository = CloudCategoryRepository;
class CloudItemRepository {
    constructor(db) { this.base = new CloudCollectionRepository(db, collections_1.COLLECTIONS.items); }
    create(doc) { return this.base.create(doc); }
    getById(userId, id) { return this.base.getById(userId, id); }
    update(userId, id, patch) { return this.base.update(userId, id, patch); }
    delete(userId, id) { return this.base.delete(userId, id); }
    listByUser(userId) { return this.base.listByUser(userId); }
}
exports.CloudItemRepository = CloudItemRepository;
class CloudBatchRepository {
    constructor(db) {
        this.db = db;
        this.base = new CloudCollectionRepository(db, collections_1.COLLECTIONS.batches);
    }
    create(doc) { return this.base.create(doc); }
    getById(userId, id) { return this.base.getById(userId, id); }
    update(userId, id, patch) { return this.base.update(userId, id, patch); }
    listByUser(userId) { return this.base.listByUser(userId); }
    async listByItem(userId, itemId) {
        const result = await this.db.collection(collections_1.COLLECTIONS.batches).where({ _openid: userId, itemId }).get();
        return result.data.map(clone);
    }
    async listPositiveByItem(userId, itemId) {
        return (await this.listByItem(userId, itemId)).filter((batch) => batch.quantity > 0);
    }
    async findMergeCandidate(userId, itemId, locationId, purchaseDate, expiryDate) {
        return first(this.db.collection(collections_1.COLLECTIONS.batches).where({
            _openid: userId,
            itemId,
            locationId,
            purchaseDate: purchaseDate ?? null,
            expiryDate,
        }).limit(1).get());
    }
}
exports.CloudBatchRepository = CloudBatchRepository;
class CloudTransactionRepository {
    constructor(db) {
        this.db = db;
        this.base = new CloudCollectionRepository(db, collections_1.COLLECTIONS.transactions);
    }
    create(doc) { return this.base.create(doc); }
    getById(userId, id) { return this.base.getById(userId, id); }
    async findByOperationId(userId, operationId) {
        return first(this.db.collection(collections_1.COLLECTIONS.transactions).where({ _openid: userId, operationId }).limit(1).get());
    }
    listByUser(userId) { return this.base.listByUser(userId); }
    async listByItem(userId, itemId, limit = 20) {
        const result = await this.db.collection(collections_1.COLLECTIONS.transactions).where({ _openid: userId, itemId }).orderBy('createdAt', 'desc').limit(limit).get();
        return result.data.map(clone);
    }
}
exports.CloudTransactionRepository = CloudTransactionRepository;
class CloudLocationRepository {
    constructor(db) { this.base = new CloudCollectionRepository(db, collections_1.COLLECTIONS.locations); }
    create(doc) { return this.base.create(doc); }
    getById(userId, id) { return this.base.getById(userId, id); }
    update(userId, id, patch) { return this.base.update(userId, id, patch); }
    listByUser(userId) { return this.base.listByUser(userId); }
}
exports.CloudLocationRepository = CloudLocationRepository;
class CloudReminderRepository {
    constructor(db) {
        this.db = db;
        this.base = new CloudCollectionRepository(db, collections_1.COLLECTIONS.reminders);
    }
    create(doc) { return this.base.create(doc); }
    getById(userId, id) { return this.base.getById(userId, id); }
    update(userId, id, patch) { return this.base.update(userId, id, patch); }
    listByUser(userId) { return this.base.listByUser(userId); }
    async listByItem(userId, itemId) {
        const result = await this.db.collection(collections_1.COLLECTIONS.reminders).where({ _openid: userId, itemId }).get();
        return result.data.map(clone);
    }
    async listByCycleKey(userId, cycleKey) {
        const result = await this.db.collection(collections_1.COLLECTIONS.reminders).where({ _openid: userId, cycleKey }).get();
        return result.data.map(clone);
    }
    async listOpenByScope(userId, scope) {
        return (await this.listByItem(userId, scope.itemId)).filter((reminder) => {
            const typeMatches = !scope.types || scope.types.includes(reminder.type);
            const batchMatches = scope.batchId === undefined || (reminder.batchId ?? null) === (scope.batchId ?? null);
            return typeMatches && batchMatches && interfaces_1.OPEN_REMINDER_STATUSES.includes(reminder.status);
        });
    }
}
exports.CloudReminderRepository = CloudReminderRepository;
class CloudRestockRepository {
    constructor(db) {
        this.db = db;
        this.base = new CloudCollectionRepository(db, collections_1.COLLECTIONS.restockItems);
    }
    create(doc) { return this.base.create(doc); }
    update(userId, id, patch) { return this.base.update(userId, id, patch); }
    listByUser(userId) { return this.base.listByUser(userId); }
    async findNeededByItem(userId, itemId) {
        return first(this.db.collection(collections_1.COLLECTIONS.restockItems).where({ _openid: userId, itemId, status: 'NEEDED' }).limit(1).get());
    }
}
exports.CloudRestockRepository = CloudRestockRepository;
class CloudSettingsRepository {
    constructor(db) {
        this.db = db;
    }
    async getByUser(userId) {
        return first(this.db.collection(collections_1.COLLECTIONS.settings).where({ _openid: userId }).limit(1).get());
    }
    async upsertForUser(doc) {
        const existing = await this.getByUser(doc._openid);
        if (!existing) {
            await this.db.collection(collections_1.COLLECTIONS.settings).add({ data: clone(doc) });
            return clone(doc);
        }
        await this.db.collection(collections_1.COLLECTIONS.settings).where({ _id: existing._id, _openid: doc._openid }).update({ data: clone(doc) });
        return (await this.getByUser(doc._openid)) ?? clone(doc);
    }
}
exports.CloudSettingsRepository = CloudSettingsRepository;
function createCloudRepositoriesForDb(db) {
    const repos = {
        categories: new CloudCategoryRepository(db),
        items: new CloudItemRepository(db),
        batches: new CloudBatchRepository(db),
        transactions: new CloudTransactionRepository(db),
        locations: new CloudLocationRepository(db),
        reminders: new CloudReminderRepository(db),
        restockItems: new CloudRestockRepository(db),
        settings: new CloudSettingsRepository(db),
    };
    return repos;
}
function createCloudRepositories(db = getCloudDatabase()) {
    return createCloudRepositoriesForDb(db);
}
