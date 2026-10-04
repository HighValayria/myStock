"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemorySettingsRepository = exports.MemoryRestockRepository = exports.MemoryReminderRepository = exports.MemoryLocationRepository = exports.MemoryTransactionRepository = exports.MemoryBatchRepository = exports.MemoryItemRepository = exports.MemoryCategoryRepository = void 0;
exports.createMemoryRepositories = createMemoryRepositories;
const errors_1 = require("../utils/errors");
const interfaces_1 = require("./interfaces");
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
class MemoryCollection {
    constructor() {
        this.docs = new Map();
    }
    async create(doc) {
        this.docs.set(doc._id, clone(doc));
        return clone(doc);
    }
    async getById(userId, id) {
        const doc = this.docs.get(id);
        if (!doc || doc._openid !== userId)
            return null;
        return clone(doc);
    }
    async update(userId, id, patch) {
        const existing = await this.getById(userId, id);
        if (!existing)
            throw new errors_1.InventoryError('NOT_FOUND', `Document not found: ${id}`);
        const next = { ...existing, ...patch };
        this.docs.set(id, clone(next));
        return clone(next);
    }
    async delete(userId, id) {
        const existing = await this.getById(userId, id);
        if (!existing)
            throw new errors_1.InventoryError('NOT_FOUND', `Document not found: ${id}`);
        this.docs.delete(id);
    }
    async listByUser(userId) {
        return [...this.docs.values()].filter((doc) => doc._openid === userId).map(clone);
    }
}
class MemoryCategoryRepository {
    constructor() {
        this.collection = new MemoryCollection();
    }
    create(doc) { return this.collection.create(doc); }
    getById(userId, id) { return this.collection.getById(userId, id); }
    update(userId, id, patch) { return this.collection.update(userId, id, patch); }
    listByUser(userId) { return this.collection.listByUser(userId); }
}
exports.MemoryCategoryRepository = MemoryCategoryRepository;
class MemoryItemRepository {
    constructor() {
        this.collection = new MemoryCollection();
    }
    create(doc) { return this.collection.create(doc); }
    getById(userId, id) { return this.collection.getById(userId, id); }
    update(userId, id, patch) { return this.collection.update(userId, id, patch); }
    delete(userId, id) { return this.collection.delete(userId, id); }
    listByUser(userId) { return this.collection.listByUser(userId); }
}
exports.MemoryItemRepository = MemoryItemRepository;
class MemoryBatchRepository {
    constructor() {
        this.collection = new MemoryCollection();
    }
    create(doc) { return this.collection.create(doc); }
    getById(userId, id) { return this.collection.getById(userId, id); }
    update(userId, id, patch) { return this.collection.update(userId, id, patch); }
    listByUser(userId) { return this.collection.listByUser(userId); }
    async listByItem(userId, itemId) {
        return (await this.listByUser(userId)).filter((batch) => batch.itemId === itemId);
    }
    async listPositiveByItem(userId, itemId) {
        return (await this.listByItem(userId, itemId)).filter((batch) => batch.quantity > 0);
    }
    async findMergeCandidate(userId, itemId, locationId, purchaseDate, expiryDate) {
        const normalizedPurchaseDate = purchaseDate ?? null;
        return (await this.listByItem(userId, itemId)).find((batch) => batch.locationId === locationId &&
            (batch.purchaseDate ?? null) === normalizedPurchaseDate &&
            batch.expiryDate === expiryDate) ?? null;
    }
}
exports.MemoryBatchRepository = MemoryBatchRepository;
class MemoryTransactionRepository {
    constructor() {
        this.collection = new MemoryCollection();
    }
    create(doc) { return this.collection.create(doc); }
    getById(userId, id) { return this.collection.getById(userId, id); }
    listByUser(userId) { return this.collection.listByUser(userId); }
    async findByOperationId(userId, operationId) {
        return (await this.listByUser(userId)).find((tx) => tx.operationId === operationId) ?? null;
    }
    async listByItem(userId, itemId, limit = 20) {
        return (await this.listByUser(userId))
            .filter((tx) => tx.itemId === itemId)
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, limit);
    }
}
exports.MemoryTransactionRepository = MemoryTransactionRepository;
class MemoryLocationRepository {
    constructor() {
        this.collection = new MemoryCollection();
    }
    create(doc) { return this.collection.create(doc); }
    getById(userId, id) { return this.collection.getById(userId, id); }
    update(userId, id, patch) { return this.collection.update(userId, id, patch); }
    listByUser(userId) { return this.collection.listByUser(userId); }
}
exports.MemoryLocationRepository = MemoryLocationRepository;
class MemoryReminderRepository {
    constructor() {
        this.collection = new MemoryCollection();
    }
    create(doc) { return this.collection.create(doc); }
    getById(userId, id) { return this.collection.getById(userId, id); }
    update(userId, id, patch) { return this.collection.update(userId, id, patch); }
    listByUser(userId) { return this.collection.listByUser(userId); }
    async listByItem(userId, itemId) {
        return (await this.listByUser(userId)).filter((reminder) => reminder.itemId === itemId);
    }
    async listByCycleKey(userId, cycleKey) {
        return (await this.listByUser(userId)).filter((reminder) => reminder.cycleKey === cycleKey);
    }
    async listOpenByScope(userId, scope) {
        return (await this.listByItem(userId, scope.itemId)).filter((reminder) => {
            const typeMatches = !scope.types || scope.types.includes(reminder.type);
            const batchMatches = scope.batchId === undefined || (reminder.batchId ?? null) === (scope.batchId ?? null);
            return typeMatches && batchMatches && interfaces_1.OPEN_REMINDER_STATUSES.includes(reminder.status);
        });
    }
}
exports.MemoryReminderRepository = MemoryReminderRepository;
class MemoryRestockRepository {
    constructor() {
        this.collection = new MemoryCollection();
    }
    create(doc) { return this.collection.create(doc); }
    update(userId, id, patch) { return this.collection.update(userId, id, patch); }
    listByUser(userId) { return this.collection.listByUser(userId); }
    async findNeededByItem(userId, itemId) {
        return (await this.listByUser(userId)).find((item) => item.itemId === itemId && item.status === 'NEEDED') ?? null;
    }
}
exports.MemoryRestockRepository = MemoryRestockRepository;
class MemorySettingsRepository {
    constructor() {
        this.collection = new MemoryCollection();
    }
    async getByUser(userId) {
        return (await this.collection.listByUser(userId))[0] ?? null;
    }
    async upsertForUser(doc) {
        const existing = await this.getByUser(doc._openid);
        if (!existing)
            return this.collection.create(doc);
        return this.collection.update(doc._openid, existing._id, doc);
    }
}
exports.MemorySettingsRepository = MemorySettingsRepository;
function createMemoryRepositories() {
    const repos = {
        categories: new MemoryCategoryRepository(),
        items: new MemoryItemRepository(),
        batches: new MemoryBatchRepository(),
        transactions: new MemoryTransactionRepository(),
        locations: new MemoryLocationRepository(),
        reminders: new MemoryReminderRepository(),
        restockItems: new MemoryRestockRepository(),
        settings: new MemorySettingsRepository(),
    };
    repos.runInTransaction = async (handler) => handler(repos);
    return repos;
}
