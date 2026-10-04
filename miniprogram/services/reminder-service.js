"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReminderService = void 0;
const collections_1 = require("../config/collections");
const date_1 = require("../utils/date");
const id_1 = require("../utils/id");
class ReminderService {
    constructor(repos, options) {
        this.repos = repos;
        this.options = options;
        this.defaultExpiryWarningDays = options.defaultExpiryWarningDays ?? 30;
        this.now = options.now ?? (() => new Date());
    }
    calculateExpiryStatus(batch, warningDays, today = this.now()) {
        const remainingDays = (0, date_1.getRemainingDays)((0, date_1.getEffectiveExpiryDate)(batch), today);
        if (remainingDays < 0)
            return 'EXPIRED';
        if (remainingDays <= warningDays)
            return 'EXPIRING';
        return 'NORMAL';
    }
    calculateStockStatus(totalQuantity, threshold) {
        if (totalQuantity === 0)
            return 'ZERO';
        if (threshold == null)
            return 'NORMAL';
        if (totalQuantity > 0 && totalQuantity <= threshold)
            return 'LOW';
        return 'NORMAL';
    }
    async recomputeReminders(scope) {
        const item = await this.repos.items.getById(this.options.userId, scope.itemId);
        if (!item)
            return { created: [], updated: [], unchanged: [] };
        const batches = await this.repos.batches.listByItem(this.options.userId, item._id);
        const result = { created: [], updated: [], unchanged: [] };
        const warningDays = item.expiryWarningDays ?? this.defaultExpiryWarningDays;
        for (const batch of batches) {
            if (batch.quantity <= 0) {
                await this.resolveOpen(result, item._id, batch._id, ['EXPIRING', 'EXPIRED']);
                continue;
            }
            const expiryStatus = this.calculateExpiryStatus(batch, warningDays);
            if (expiryStatus === 'EXPIRED') {
                await this.resolveOpen(result, item._id, batch._id, ['EXPIRING']);
                await this.ensureReminder(result, item, batch, 'EXPIRED');
            }
            else if (expiryStatus === 'EXPIRING') {
                await this.resolveOpen(result, item._id, batch._id, ['EXPIRED']);
                await this.ensureReminder(result, item, batch, 'EXPIRING');
            }
            else {
                await this.resolveOpen(result, item._id, batch._id, ['EXPIRING', 'EXPIRED']);
            }
        }
        const totalQuantity = batches.reduce((sum, batch) => sum + batch.quantity, 0);
        const stockStatus = this.calculateStockStatus(totalQuantity, item.lowStockThreshold);
        if (stockStatus === 'ZERO') {
            await this.resolveOpen(result, item._id, null, ['LOW_STOCK']);
            await this.ensureReminder(result, item, null, 'ZERO_STOCK');
        }
        else if (stockStatus === 'LOW') {
            await this.resolveOpen(result, item._id, null, ['ZERO_STOCK']);
            await this.ensureReminder(result, item, null, 'LOW_STOCK');
        }
        else {
            await this.resolveOpen(result, item._id, null, ['LOW_STOCK', 'ZERO_STOCK']);
        }
        return result;
    }
    async dismissReminder(reminderId) {
        return this.repos.reminders.update(this.options.userId, reminderId, {
            status: 'DISMISSED',
            dismissedAt: this.now().getTime(),
            updatedAt: this.now().getTime(),
        });
    }
    async markReminderRead(reminderId) {
        return this.repos.reminders.update(this.options.userId, reminderId, {
            status: 'READ',
            readAt: this.now().getTime(),
            updatedAt: this.now().getTime(),
        });
    }
    async ensureReminder(result, item, batch, type) {
        const cycleKey = this.buildCycleKey(item, batch, type);
        const existing = await this.repos.reminders.listByCycleKey(this.options.userId, cycleKey);
        const openExisting = existing.find((reminder) => reminder.status === 'ACTIVE' || reminder.status === 'READ' || reminder.status === 'DISMISSED');
        if (openExisting) {
            result.unchanged.push(openExisting);
            return;
        }
        const now = this.now().getTime();
        const reminder = {
            _id: (0, id_1.createId)('rem'),
            _openid: this.options.userId,
            schemaVersion: collections_1.SCHEMA_VERSION,
            type,
            itemId: item._id,
            batchId: batch?._id ?? null,
            status: 'ACTIVE',
            cycleKey,
            createdAt: now,
            updatedAt: now,
            readAt: null,
            dismissedAt: null,
            resolvedAt: null,
        };
        result.created.push(await this.repos.reminders.create(reminder));
    }
    async resolveOpen(result, itemId, batchId, types) {
        const open = await this.repos.reminders.listOpenByScope(this.options.userId, { itemId, batchId, types });
        for (const reminder of open) {
            const now = this.now().getTime();
            result.updated.push(await this.repos.reminders.update(this.options.userId, reminder._id, {
                status: 'RESOLVED',
                resolvedAt: now,
                updatedAt: now,
            }));
        }
    }
    buildCycleKey(item, batch, type) {
        if (batch) {
            return `${batch._id}:${type}:${(0, date_1.getEffectiveExpiryDate)(batch)}`;
        }
        const threshold = item.lowStockThreshold ?? 'none';
        return `${item._id}:${type}:${threshold}`;
    }
}
exports.ReminderService = ReminderService;
