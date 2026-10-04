"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryService = void 0;
const collections_1 = require("../config/collections");
const date_1 = require("../utils/date");
const errors_1 = require("../utils/errors");
const id_1 = require("../utils/id");
const validation_1 = require("../utils/validation");
const reminder_service_1 = require("./reminder-service");
class InventoryService {
    constructor(repos, options, reminderService) {
        this.repos = repos;
        this.options = options;
        this.now = options.now ?? (() => new Date());
        this.reminderService = reminderService ?? new reminder_service_1.ReminderService(repos, options);
    }
    async createItem(input) {
        this.validateCreateItem(input);
        const now = this.now().getTime();
        const item = {
            _id: (0, id_1.createId)('item'),
            _openid: this.options.userId,
            schemaVersion: collections_1.SCHEMA_VERSION,
            name: input.name.trim(),
            categoryId: input.categoryId,
            brand: input.brand ?? null,
            specification: input.specification ?? null,
            unit: input.unit.trim(),
            defaultLocationId: input.defaultLocationId ?? null,
            lowStockThreshold: input.lowStockThreshold ?? null,
            expiryWarningDays: input.expiryWarningDays ?? null,
            barcode: input.barcode ?? null,
            note: input.note ?? '',
            createdAt: now,
            updatedAt: now,
        };
        return this.repos.items.create(item);
    }
    async addStock(input) {
        if (this.options.mutationClient)
            return this.options.mutationClient.addStock(input);
        this.assertLocalMutationAllowed();
        return this.withWriteBoundary((service) => service.addStockCore(input));
    }
    async consumeStock(input) {
        if (this.options.mutationClient)
            return this.options.mutationClient.consumeStock(input);
        this.assertLocalMutationAllowed();
        return this.withWriteBoundary((service) => service.consumeStockCore(input));
    }
    async adjustStock(input) {
        if (this.options.mutationClient)
            return this.options.mutationClient.adjustStock(input);
        this.assertLocalMutationAllowed();
        return this.withWriteBoundary((service) => service.adjustStockCore(input));
    }
    async updateItem(itemId, patch) {
        await this.requireItem(itemId);
        return this.repos.items.update(this.options.userId, itemId, { ...patch, updatedAt: this.now().getTime() });
    }
    async updateBatch(batchId, patch) {
        return this.withWriteBoundary(async (service) => {
            const batch = await service.requireBatch(batchId);
            const updated = await service.repos.batches.update(service.options.userId, batchId, { ...patch, updatedAt: service.now().getTime() });
            await service.reminderService.recomputeReminders({ itemId: batch.itemId });
            return updated;
        });
    }
    async deleteItem(itemId, options) {
        return this.withWriteBoundary(async (service) => {
            await service.requireItem(itemId);
            if (!options.confirmEmptyItem)
                throw new errors_1.InventoryError('DELETE_NOT_ALLOWED', 'Deleting an item requires confirmation');
            const batches = await service.repos.batches.listByItem(service.options.userId, itemId);
            if (batches.some((batch) => batch.quantity > 0)) {
                throw new errors_1.InventoryError('DELETE_NOT_ALLOWED', 'Item still has stock; adjust or discard stock first');
            }
            await service.repos.items.delete(service.options.userId, itemId);
        });
    }
    async getInventory(query = {}) {
        const items = await this.repos.items.listByUser(this.options.userId);
        const batches = await this.repos.batches.listByUser(this.options.userId);
        const today = this.now();
        const rows = items.map((item) => {
            const itemBatches = batches.filter((batch) => batch.itemId === item._id);
            const positiveBatches = itemBatches.filter((batch) => batch.quantity > 0).sort(date_1.compareByEffectiveExpiryDate);
            const totalQuantity = itemBatches.reduce((sum, batch) => sum + batch.quantity, 0);
            const nearest = positiveBatches[0];
            const warningDays = item.expiryWarningDays ?? this.options.defaultExpiryWarningDays ?? 30;
            const expiryStatus = nearest ? this.reminderService.calculateExpiryStatus(nearest, warningDays, today) : 'NORMAL';
            const stockStatus = this.reminderService.calculateStockStatus(totalQuantity, item.lowStockThreshold);
            const nearestExpiryDate = nearest ? (0, date_1.getEffectiveExpiryDate)(nearest) : null;
            return {
                item,
                totalQuantity,
                nearestExpiryDate,
                nearestRemainingDays: nearestExpiryDate ? (0, date_1.getRemainingDays)(nearestExpiryDate, today) : null,
                expiryStatus,
                stockStatus,
            };
        });
        return rows.filter((row) => {
            if (query.search && !row.item.name.includes(query.search))
                return false;
            if (query.categoryId && row.item.categoryId !== query.categoryId)
                return false;
            if (query.locationId && row.item.defaultLocationId !== query.locationId)
                return false;
            if (query.expiryStatus && row.expiryStatus !== query.expiryStatus)
                return false;
            if (query.stockStatus && row.stockStatus !== query.stockStatus)
                return false;
            return true;
        });
    }
    async getItemDetail(itemId) {
        const item = await this.requireItem(itemId);
        const batches = await this.repos.batches.listByItem(this.options.userId, itemId);
        const transactions = await this.repos.transactions.listByItem(this.options.userId, itemId, 20);
        const reminders = await this.repos.reminders.listByItem(this.options.userId, itemId);
        const restockItem = await this.repos.restockItems.findNeededByItem(this.options.userId, itemId);
        const warningDays = item.expiryWarningDays ?? this.options.defaultExpiryWarningDays ?? 30;
        const totalQuantity = batches.reduce((sum, batch) => sum + batch.quantity, 0);
        return {
            item,
            batches: batches.map((batch) => {
                const effectiveExpiryDate = (0, date_1.getEffectiveExpiryDate)(batch);
                return {
                    ...batch,
                    remainingDays: (0, date_1.getRemainingDays)(effectiveExpiryDate, this.now()),
                    expiryStatus: this.reminderService.calculateExpiryStatus(batch, warningDays, this.now()),
                };
            }),
            recentTransactions: transactions,
            totalQuantity,
            stockStatus: this.reminderService.calculateStockStatus(totalQuantity, item.lowStockThreshold),
            reminders,
            restockItem,
        };
    }
    assertLocalMutationAllowed() {
        if (this.options.requireMutationClientForWrites) {
            throw new errors_1.InventoryError('VALIDATION_ERROR', 'Cloud writes must use inventoryWrite cloud function');
        }
    }
    async addStockCore(input) {
        (0, validation_1.assertPositiveNumber)(input.quantity, 'quantity');
        (0, validation_1.assertNonEmptyString)(input.locationId, 'locationId');
        (0, validation_1.assertNonEmptyString)(input.expiryDate, 'expiryDate');
        const operationId = input.operationId ?? (0, id_1.createOperationId)('add');
        await this.assertOperationIsNew(operationId);
        const item = input.itemId
            ? await this.requireItem(input.itemId)
            : await this.createItem(this.requireNewItem(input));
        const existingBatch = await this.repos.batches.findMergeCandidate(this.options.userId, item._id, input.locationId, input.purchaseDate ?? null, input.expiryDate);
        const now = this.now().getTime();
        let batch;
        let merged = false;
        if (existingBatch) {
            merged = true;
            batch = await this.repos.batches.update(this.options.userId, existingBatch._id, {
                quantity: existingBatch.quantity + input.quantity,
                updatedAt: now,
            });
        }
        else {
            batch = await this.repos.batches.create({
                _id: (0, id_1.createId)('batch'),
                _openid: this.options.userId,
                schemaVersion: collections_1.SCHEMA_VERSION,
                itemId: item._id,
                quantity: input.quantity,
                locationId: input.locationId,
                purchaseDate: input.purchaseDate ?? null,
                productionDate: input.productionDate ?? null,
                shelfLifeValue: input.shelfLifeValue ?? null,
                shelfLifeUnit: input.shelfLifeUnit ?? null,
                expiryDate: input.expiryDate,
                purchasePrice: input.purchasePrice ?? null,
                purchaseChannel: input.purchaseChannel ?? null,
                openedDate: null,
                openedExpiryDate: null,
                note: input.note ?? '',
                createdAt: now,
                updatedAt: now,
            });
        }
        const transaction = await this.createTransaction({
            itemId: item._id,
            batchId: batch._id,
            type: 'ADD',
            quantity: input.quantity,
            reason: 'PURCHASE',
            note: input.note,
            operationId,
        });
        await this.resolveRestockIfNeeded(item._id);
        await this.reminderService.recomputeReminders({ itemId: item._id });
        return { item, batch, transaction, merged };
    }
    async consumeStockCore(input) {
        (0, validation_1.assertNonEmptyString)(input.itemId, 'itemId');
        (0, validation_1.assertPositiveNumber)(input.quantity, 'quantity');
        const operationId = input.operationId ?? (0, id_1.createOperationId)('consume');
        await this.assertOperationIsNew(operationId);
        const item = await this.requireItem(input.itemId);
        const batches = (await this.repos.batches.listPositiveByItem(this.options.userId, item._id)).sort(date_1.compareByEffectiveExpiryDate);
        const total = batches.reduce((sum, batch) => sum + batch.quantity, 0);
        if (total < input.quantity) {
            throw new errors_1.InventoryError('INSUFFICIENT_STOCK', 'Consume quantity exceeds available stock');
        }
        let remaining = input.quantity;
        const transactions = [];
        const affectedBatches = [];
        for (const batch of batches) {
            if (remaining <= 0)
                break;
            const deduct = Math.min(batch.quantity, remaining);
            const now = this.now().getTime();
            const updatedBatch = await this.repos.batches.update(this.options.userId, batch._id, {
                quantity: batch.quantity - deduct,
                updatedAt: now,
            });
            affectedBatches.push(updatedBatch);
            transactions.push(await this.createTransaction({
                itemId: item._id,
                batchId: batch._id,
                type: 'CONSUME',
                quantity: -deduct,
                reason: input.reason ?? 'USED',
                note: input.note,
                operationId,
            }));
            remaining -= deduct;
        }
        await this.reminderService.recomputeReminders({ itemId: item._id });
        return { item, transactions, affectedBatches };
    }
    async adjustStockCore(input) {
        (0, validation_1.assertNonEmptyString)(input.batchId, 'batchId');
        (0, validation_1.assertNonNegativeNumber)(input.actualQuantity, 'actualQuantity');
        const operationId = input.operationId ?? (0, id_1.createOperationId)('adjust');
        const batch = await this.requireBatch(input.batchId);
        const diff = input.actualQuantity - batch.quantity;
        if (diff === 0) {
            return { batch, transaction: null, diff };
        }
        await this.assertOperationIsNew(operationId);
        const now = this.now().getTime();
        const updatedBatch = await this.repos.batches.update(this.options.userId, batch._id, {
            quantity: input.actualQuantity,
            updatedAt: now,
        });
        const transaction = await this.createTransaction({
            itemId: batch.itemId,
            batchId: batch._id,
            type: 'ADJUST',
            quantity: diff,
            reason: input.reason ?? 'MANUAL_CORRECTION',
            note: input.note,
            operationId,
        });
        await this.reminderService.recomputeReminders({ itemId: batch.itemId });
        return { batch: updatedBatch, transaction, diff };
    }
    async withWriteBoundary(handler) {
        if (this.options.disableTransactions || !this.repos.runInTransaction) {
            return handler(this);
        }
        return this.repos.runInTransaction(async (repos) => {
            const txReminderService = new reminder_service_1.ReminderService(repos, this.options);
            const txService = new InventoryService(repos, { ...this.options, disableTransactions: true }, txReminderService);
            return handler(txService);
        });
    }
    async assertOperationIsNew(operationId) {
        const existing = await this.repos.transactions.findByOperationId(this.options.userId, operationId);
        if (existing) {
            throw new errors_1.InventoryError('DUPLICATE_OPERATION', `Operation has already been applied: ${operationId}`);
        }
    }
    async createTransaction(input) {
        return this.repos.transactions.create({
            _id: (0, id_1.createId)('tx'),
            _openid: this.options.userId,
            schemaVersion: collections_1.SCHEMA_VERSION,
            createdAt: this.now().getTime(),
            ...input,
        });
    }
    async resolveRestockIfNeeded(itemId) {
        const restock = await this.repos.restockItems.findNeededByItem(this.options.userId, itemId);
        if (!restock)
            return;
        const now = this.now().getTime();
        await this.repos.restockItems.update(this.options.userId, restock._id, {
            status: 'PURCHASED',
            resolvedAt: now,
            updatedAt: now,
        });
    }
    async requireItem(itemId) {
        const item = await this.repos.items.getById(this.options.userId, itemId);
        if (!item)
            throw new errors_1.InventoryError('NOT_FOUND', `Item not found: ${itemId}`);
        return item;
    }
    async requireBatch(batchId) {
        const batch = await this.repos.batches.getById(this.options.userId, batchId);
        if (!batch)
            throw new errors_1.InventoryError('NOT_FOUND', `Batch not found: ${batchId}`);
        return batch;
    }
    requireNewItem(input) {
        if (!input.item)
            throw new errors_1.InventoryError('VALIDATION_ERROR', 'item or itemId is required');
        return input.item;
    }
    validateCreateItem(input) {
        (0, validation_1.assertNonEmptyString)(input.name, 'name');
        (0, validation_1.assertNonEmptyString)(input.categoryId, 'categoryId');
        (0, validation_1.assertNonEmptyString)(input.unit, 'unit');
        if (input.lowStockThreshold != null)
            (0, validation_1.assertNonNegativeNumber)(input.lowStockThreshold, 'lowStockThreshold');
        if (input.expiryWarningDays != null)
            (0, validation_1.assertNonNegativeNumber)(input.expiryWarningDays, 'expiryWarningDays');
    }
}
exports.InventoryService = InventoryService;
