"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsService = void 0;
const collections_1 = require("../config/collections");
const id_1 = require("../utils/id");
class SettingsService {
    constructor(repos, options) {
        this.repos = repos;
        this.options = options;
        this.now = options.now ?? (() => new Date());
    }
    async ensureDefaultSettings() {
        const existing = await this.repos.settings.getByUser(this.options.userId);
        if (existing)
            return existing;
        const now = this.now().getTime();
        return this.repos.settings.upsertForUser({
            _id: (0, id_1.createId)('settings'),
            _openid: this.options.userId,
            schemaVersion: collections_1.SCHEMA_VERSION,
            defaultExpiryWarningDays: 30,
            defaultConsumeStrategy: 'FEFO',
            lowStockReminder: true,
            expiryReminder: true,
            zeroStockReminder: true,
            autoAddRestock: false,
            theme: 'system',
            createdAt: now,
            updatedAt: now,
        });
    }
}
exports.SettingsService = SettingsService;
