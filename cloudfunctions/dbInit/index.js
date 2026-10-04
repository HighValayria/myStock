"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
async function main() {
    return {
        ok: true,
        schemaVersion: 1,
        collections: [
            'categories',
            'items',
            'batches',
            'transactions',
            'locations',
            'reminders',
            'restock_items',
            'settings',
        ],
        recommendedIndexes: {
            categories: ['_openid + name', '_openid + updatedAt'],
            items: ['_openid + name', '_openid + categoryId', '_openid + defaultLocationId', '_openid + updatedAt', '_openid + barcode'],
            batches: ['_openid + itemId', '_openid + itemId + quantity', '_openid + expiryDate', '_openid + locationId', '_openid + purchaseDate', '_openid + itemId + locationId + purchaseDate + expiryDate'],
            transactions: ['_openid + itemId + createdAt', '_openid + batchId + createdAt', '_openid + type + createdAt', '_openid + operationId'],
            locations: ['_openid + parentId', '_openid + name'],
            reminders: ['_openid + status + type', '_openid + itemId + status', '_openid + batchId + status', '_openid + cycleKey'],
            restock_items: ['_openid + status + createdAt', '_openid + itemId + status'],
            settings: ['_openid'],
        },
        note: 'Create collections and indexes in CloudBase console according to docs/CLOUDBASE_SETUP.md. This function is intentionally non-destructive.',
    };
}
