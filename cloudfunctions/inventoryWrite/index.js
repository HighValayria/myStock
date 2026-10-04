"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const SCHEMA_VERSION = 1;
const COLLECTIONS = {
    items: 'items',
    batches: 'batches',
    transactions: 'transactions',
    reminders: 'reminders',
    restockItems: 'restock_items',
};
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function ok(data) {
    return { ok: true, data };
}
function fail(error) {
    const anyError = error;
    return {
        ok: false,
        error: {
            code: anyError.code ?? 'INVENTORY_WRITE_FAILED',
            message: anyError.message ?? String(error),
        },
    };
}
function inventoryError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}
function now() {
    return Date.now();
}
function createId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
function assertString(value, field) {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw inventoryError('VALIDATION_ERROR', `${field} is required`);
}
function assertPositive(value, field) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
        throw inventoryError('VALIDATION_ERROR', `${field} must be positive`);
}
function assertNonNegative(value, field) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
        throw inventoryError('VALIDATION_ERROR', `${field} must be non-negative`);
}
function compactPatch(patch) {
    const output = {};
    for (const key of Object.keys(patch || {})) {
        if (patch[key] !== undefined)
            output[key] = patch[key];
    }
    return output;
}
function dateMs(value) {
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
}
function effectiveExpiry(batch) {
    if (!batch.openedExpiryDate)
        return batch.expiryDate;
    return dateMs(batch.openedExpiryDate) < dateMs(batch.expiryDate) ? batch.openedExpiryDate : batch.expiryDate;
}
function compareBatch(a, b) {
    const expiryDiff = dateMs(effectiveExpiry(a)) - dateMs(effectiveExpiry(b));
    if (expiryDiff !== 0)
        return expiryDiff;
    return a.createdAt - b.createdAt;
}
function remainingDays(expiryDate, today = new Date()) {
    const todayDate = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
    return Math.floor((dateMs(expiryDate) - dateMs(todayDate)) / MS_PER_DAY);
}
function expiryStatus(batch, warningDays) {
    const days = remainingDays(effectiveExpiry(batch));
    if (days < 0)
        return 'EXPIRED';
    if (days <= warningDays)
        return 'EXPIRING';
    return 'NORMAL';
}
function stockStatus(total, threshold) {
    if (total === 0)
        return 'ZERO';
    if (threshold == null)
        return 'NORMAL';
    return total <= threshold ? 'LOW' : 'NORMAL';
}
async function queryOne(collectionName, where) {
    const result = await db.collection(collectionName).where(where).limit(1).get();
    return result.data[0] ?? null;
}
async function queryMany(collectionName, where) {
    const result = await db.collection(collectionName).where(where).get();
    return result.data ?? [];
}
async function txGet(tx, collectionName, id, openid) {
    const result = await tx.collection(collectionName).doc(id).get();
    const doc = result.data;
    if (!doc || doc._openid !== openid)
        throw inventoryError('NOT_FOUND', `${collectionName} not found: ${id}`);
    return doc;
}
async function txAdd(tx, collectionName, doc) {
    await tx.collection(collectionName).add({ data: doc });
}
async function txUpdate(tx, collectionName, id, data) {
    await tx.collection(collectionName).doc(id).update({ data });
}
async function txRemove(tx, collectionName, id) {
    await tx.collection(collectionName).doc(id).remove();
}
async function findOperationTransactions(tx, openid, operationId) {
    const existing = await tx.collection(COLLECTIONS.transactions).where({ _openid: openid, operationId }).get();
    return existing.data ?? [];
}
async function assertOperationIsNew(tx, openid, operationId) {
    const existing = await findOperationTransactions(tx, openid, operationId);
    if (existing.length > 0) {
        throw inventoryError('DUPLICATE_OPERATION', `Operation has already been applied: ${operationId}`);
    }
}
function buildTransaction(openid, input) {
    return {
        _id: createId('tx'),
        _openid: openid,
        schemaVersion: SCHEMA_VERSION,
        createdAt: now(),
        ...input,
    };
}
function buildReminderCycleKey(item, batch, type) {
    if (batch)
        return `${batch._id}:${type}:${effectiveExpiry(batch)}`;
    return `${item._id}:${type}:${item.lowStockThreshold ?? 'none'}`;
}
async function ensureReminder(tx, openid, item, batch, type) {
    const cycleKey = buildReminderCycleKey(item, batch, type);
    const existing = await tx.collection(COLLECTIONS.reminders).where({ _openid: openid, cycleKey }).get();
    const open = existing.data.find((rem) => rem.status === 'ACTIVE' || rem.status === 'READ' || rem.status === 'DISMISSED');
    if (open)
        return;
    const timestamp = now();
    await txAdd(tx, COLLECTIONS.reminders, {
        _id: createId('rem'),
        _openid: openid,
        schemaVersion: SCHEMA_VERSION,
        type,
        itemId: item._id,
        batchId: batch?._id ?? null,
        status: 'ACTIVE',
        cycleKey,
        createdAt: timestamp,
        updatedAt: timestamp,
        readAt: null,
        dismissedAt: null,
        resolvedAt: null,
    });
}
async function resolveOpenReminders(tx, openid, itemId, batchId, types) {
    const existing = await tx.collection(COLLECTIONS.reminders).where({ _openid: openid, itemId }).get();
    const timestamp = now();
    for (const reminder of existing.data) {
        const sameType = types.includes(reminder.type);
        const sameBatch = (reminder.batchId ?? null) === batchId;
        const open = reminder.status === 'ACTIVE' || reminder.status === 'READ' || reminder.status === 'DISMISSED';
        if (sameType && sameBatch && open) {
            await txUpdate(tx, COLLECTIONS.reminders, reminder._id, { status: 'RESOLVED', resolvedAt: timestamp, updatedAt: timestamp });
        }
    }
}
async function recomputeRemindersInTransaction(tx, openid, item, batches) {
    const warningDays = item.expiryWarningDays ?? 30;
    for (const batch of batches) {
        if (batch.quantity <= 0) {
            await resolveOpenReminders(tx, openid, item._id, batch._id, ['EXPIRING', 'EXPIRED']);
            continue;
        }
        const status = expiryStatus(batch, warningDays);
        if (status === 'EXPIRED') {
            await resolveOpenReminders(tx, openid, item._id, batch._id, ['EXPIRING']);
            await ensureReminder(tx, openid, item, batch, 'EXPIRED');
        }
        else if (status === 'EXPIRING') {
            await resolveOpenReminders(tx, openid, item._id, batch._id, ['EXPIRED']);
            await ensureReminder(tx, openid, item, batch, 'EXPIRING');
        }
        else {
            await resolveOpenReminders(tx, openid, item._id, batch._id, ['EXPIRING', 'EXPIRED']);
        }
    }
    const total = batches.reduce((sum, batch) => sum + batch.quantity, 0);
    const status = stockStatus(total, item.lowStockThreshold);
    if (status === 'ZERO') {
        await resolveOpenReminders(tx, openid, item._id, null, ['LOW_STOCK']);
        await ensureReminder(tx, openid, item, null, 'ZERO_STOCK');
    }
    else if (status === 'LOW') {
        await resolveOpenReminders(tx, openid, item._id, null, ['ZERO_STOCK']);
        await ensureReminder(tx, openid, item, null, 'LOW_STOCK');
    }
    else {
        await resolveOpenReminders(tx, openid, item._id, null, ['LOW_STOCK', 'ZERO_STOCK']);
    }
}
async function listBatchesForItemInTransaction(tx, openid, itemId) {
    const result = await tx.collection(COLLECTIONS.batches).where({ _openid: openid, itemId }).get();
    return result.data;
}
async function resolveRestockIfNeeded(tx, openid, itemId) {
    const result = await tx.collection(COLLECTIONS.restockItems).where({ _openid: openid, itemId, status: 'NEEDED' }).get();
    const timestamp = now();
    for (const restock of result.data ?? []) {
        await txUpdate(tx, COLLECTIONS.restockItems, restock._id, { status: 'PURCHASED', resolvedAt: timestamp, updatedAt: timestamp });
    }
}
async function addStock(openid, input) {
    assertPositive(input.quantity, 'quantity');
    assertString(input.locationId, 'locationId');
    assertString(input.expiryDate, 'expiryDate');
    assertString(input.operationId, 'operationId');
    const mergeCandidate = input.itemId
        ? await queryOne(COLLECTIONS.batches, {
            _openid: openid,
            itemId: input.itemId,
            locationId: input.locationId,
            purchaseDate: input.purchaseDate ?? null,
            expiryDate: input.expiryDate,
        })
        : null;
    return db.runTransaction(async (tx) => {
        const existingTransactions = await findOperationTransactions(tx, openid, input.operationId);
        if (existingTransactions.length > 0) {
            const transaction = existingTransactions[0];
            const item = await txGet(tx, COLLECTIONS.items, transaction.itemId, openid);
            const batch = await txGet(tx, COLLECTIONS.batches, transaction.batchId, openid);
            return { item, batch, transaction, merged: false, idempotent: true };
        }
        const timestamp = now();
        let item;
        if (input.itemId) {
            item = await txGet(tx, COLLECTIONS.items, input.itemId, openid);
        }
        else {
            const newItem = input.item;
            if (!newItem)
                throw inventoryError('VALIDATION_ERROR', 'item or itemId is required');
            assertString(newItem.name, 'item.name');
            assertString(newItem.categoryId, 'item.categoryId');
            assertString(newItem.unit, 'item.unit');
            item = {
                _id: createId('item'),
                _openid: openid,
                schemaVersion: SCHEMA_VERSION,
                name: newItem.name.trim(),
                categoryId: newItem.categoryId,
                unit: newItem.unit.trim(),
                brand: newItem.brand ?? null,
                specification: newItem.specification ?? null,
                defaultLocationId: newItem.defaultLocationId ?? null,
                lowStockThreshold: newItem.lowStockThreshold ?? null,
                expiryWarningDays: newItem.expiryWarningDays ?? null,
                barcode: newItem.barcode ?? null,
                note: newItem.note ?? '',
                createdAt: timestamp,
                updatedAt: timestamp,
            };
            await txAdd(tx, COLLECTIONS.items, item);
        }
        let batch;
        let merged = false;
        if (mergeCandidate) {
            const freshCandidate = await txGet(tx, COLLECTIONS.batches, mergeCandidate._id, openid);
            const stillMatches = freshCandidate.itemId === item._id
                && freshCandidate.locationId === input.locationId
                && (freshCandidate.purchaseDate ?? null) === (input.purchaseDate ?? null)
                && freshCandidate.expiryDate === input.expiryDate;
            if (stillMatches) {
                merged = true;
                batch = { ...freshCandidate, quantity: freshCandidate.quantity + input.quantity, updatedAt: timestamp };
                await txUpdate(tx, COLLECTIONS.batches, freshCandidate._id, { quantity: batch.quantity, updatedAt: timestamp });
            }
            else {
                batch = buildNewBatch(openid, item._id, input, timestamp);
                await txAdd(tx, COLLECTIONS.batches, batch);
            }
        }
        else {
            batch = buildNewBatch(openid, item._id, input, timestamp);
            await txAdd(tx, COLLECTIONS.batches, batch);
        }
        const transaction = buildTransaction(openid, {
            itemId: item._id,
            batchId: batch._id,
            type: 'ADD',
            quantity: input.quantity,
            reason: 'PURCHASE',
            note: input.note,
            operationId: input.operationId,
        });
        await txAdd(tx, COLLECTIONS.transactions, transaction);
        await resolveRestockIfNeeded(tx, openid, item._id);
        const batches = await listBatchesForItemInTransaction(tx, openid, item._id);
        await recomputeRemindersInTransaction(tx, openid, item, batches);
        return { item, batch, transaction, merged };
    });
}
function buildNewBatch(openid, itemId, input, timestamp) {
    return {
        _id: createId('batch'),
        _openid: openid,
        schemaVersion: SCHEMA_VERSION,
        itemId,
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
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}
async function consumeStock(openid, input) {
    assertString(input.itemId, 'itemId');
    assertPositive(input.quantity, 'quantity');
    assertString(input.operationId, 'operationId');
    const snapshot = (await queryMany(COLLECTIONS.batches, { _openid: openid, itemId: input.itemId }))
        .filter((batch) => batch.quantity > 0)
        .sort(compareBatch)
        .map((batch) => ({ id: batch._id, quantity: batch.quantity, effectiveExpiryDate: effectiveExpiry(batch) }));
    return db.runTransaction(async (tx) => {
        const existingTransactions = await findOperationTransactions(tx, openid, input.operationId);
        if (existingTransactions.length > 0) {
            const item = await txGet(tx, COLLECTIONS.items, input.itemId, openid);
            const affectedBatches = [];
            const seenBatchIds = new Set();
            for (const transaction of existingTransactions) {
                if (!seenBatchIds.has(transaction.batchId)) {
                    affectedBatches.push(await txGet(tx, COLLECTIONS.batches, transaction.batchId, openid));
                    seenBatchIds.add(transaction.batchId);
                }
            }
            return { item, transactions: existingTransactions, affectedBatches, idempotent: true };
        }
        const item = await txGet(tx, COLLECTIONS.items, input.itemId, openid);
        const freshBatches = [];
        for (const candidate of snapshot) {
            const fresh = await txGet(tx, COLLECTIONS.batches, candidate.id, openid);
            if (fresh.itemId !== input.itemId)
                throw inventoryError('STALE_STOCK_RETRY_REQUIRED', 'Batch item changed; retry consume');
            if (fresh.quantity !== candidate.quantity || effectiveExpiry(fresh) !== candidate.effectiveExpiryDate) {
                throw inventoryError('STALE_STOCK_RETRY_REQUIRED', 'Batch changed before consume; retry with fresh stock');
            }
            if (fresh.quantity > 0)
                freshBatches.push(fresh);
        }
        freshBatches.sort(compareBatch);
        const total = freshBatches.reduce((sum, batch) => sum + batch.quantity, 0);
        if (total < input.quantity)
            throw inventoryError('INSUFFICIENT_STOCK', 'Consume quantity exceeds available stock');
        let remaining = input.quantity;
        const timestamp = now();
        const affectedBatches = [];
        const transactions = [];
        for (const batch of freshBatches) {
            if (remaining <= 0)
                break;
            const deduct = Math.min(batch.quantity, remaining);
            const updated = { ...batch, quantity: batch.quantity - deduct, updatedAt: timestamp };
            await txUpdate(tx, COLLECTIONS.batches, batch._id, { quantity: updated.quantity, updatedAt: timestamp });
            const transaction = buildTransaction(openid, {
                itemId: item._id,
                batchId: batch._id,
                type: 'CONSUME',
                quantity: -deduct,
                reason: input.reason ?? 'USED',
                note: input.note,
                operationId: input.operationId,
            });
            await txAdd(tx, COLLECTIONS.transactions, transaction);
            affectedBatches.push(updated);
            transactions.push(transaction);
            remaining -= deduct;
        }
        const batches = await listBatchesForItemInTransaction(tx, openid, item._id);
        await recomputeRemindersInTransaction(tx, openid, item, batches);
        return { item, transactions, affectedBatches };
    });
}
async function adjustStock(openid, input) {
    assertString(input.batchId, 'batchId');
    assertNonNegative(input.actualQuantity, 'actualQuantity');
    assertString(input.operationId, 'operationId');
    return db.runTransaction(async (tx) => {
        const existingTransactions = await findOperationTransactions(tx, openid, input.operationId);
        if (existingTransactions.length > 0) {
            const transaction = existingTransactions[0];
            const batch = await txGet(tx, COLLECTIONS.batches, transaction.batchId, openid);
            return { batch, transaction, diff: transaction.quantity, idempotent: true };
        }
        const batch = await txGet(tx, COLLECTIONS.batches, input.batchId, openid);
        const diff = input.actualQuantity - batch.quantity;
        if (diff === 0)
            return { batch, transaction: null, diff };
        await assertOperationIsNew(tx, openid, input.operationId);
        const item = await txGet(tx, COLLECTIONS.items, batch.itemId, openid);
        const timestamp = now();
        const updatedBatch = { ...batch, quantity: input.actualQuantity, updatedAt: timestamp };
        await txUpdate(tx, COLLECTIONS.batches, batch._id, { quantity: input.actualQuantity, updatedAt: timestamp });
        const transaction = buildTransaction(openid, {
            itemId: item._id,
            batchId: batch._id,
            type: 'ADJUST',
            quantity: diff,
            reason: 'MANUAL_CORRECTION',
            note: input.note,
            operationId: input.operationId,
        });
        await txAdd(tx, COLLECTIONS.transactions, transaction);
        const batches = await listBatchesForItemInTransaction(tx, openid, item._id);
        await recomputeRemindersInTransaction(tx, openid, item, batches);
        return { batch: updatedBatch, transaction, diff };
    });
}
async function updateItem(openid, input) {
    assertString(input.itemId, 'itemId');
    const patch = input.patch || {};
    if (patch.name !== undefined)
        assertString(patch.name, 'name');
    if (patch.categoryId !== undefined)
        assertString(patch.categoryId, 'categoryId');
    if (patch.unit !== undefined)
        assertString(patch.unit, 'unit');
    if (patch.lowStockThreshold !== undefined && patch.lowStockThreshold !== null)
        assertNonNegative(patch.lowStockThreshold, 'lowStockThreshold');
    if (patch.expiryWarningDays !== undefined && patch.expiryWarningDays !== null)
        assertNonNegative(patch.expiryWarningDays, 'expiryWarningDays');
    return db.runTransaction(async (tx) => {
        const item = await txGet(tx, COLLECTIONS.items, input.itemId, openid);
        const timestamp = now();
        const update = compactPatch({
            name: patch.name === undefined ? undefined : patch.name.trim(),
            categoryId: patch.categoryId,
            brand: patch.brand === undefined ? undefined : patch.brand,
            specification: patch.specification === undefined ? undefined : patch.specification,
            unit: patch.unit === undefined ? undefined : patch.unit.trim(),
            defaultLocationId: patch.defaultLocationId === undefined ? undefined : patch.defaultLocationId,
            lowStockThreshold: patch.lowStockThreshold === undefined ? undefined : patch.lowStockThreshold,
            expiryWarningDays: patch.expiryWarningDays === undefined ? undefined : patch.expiryWarningDays,
            barcode: patch.barcode === undefined ? undefined : patch.barcode,
            note: patch.note === undefined ? undefined : patch.note,
            updatedAt: timestamp,
        });
        await txUpdate(tx, COLLECTIONS.items, item._id, update);
        const updatedItem = { ...item, ...update };
        const batches = await listBatchesForItemInTransaction(tx, openid, item._id);
        await recomputeRemindersInTransaction(tx, openid, updatedItem, batches);
        return updatedItem;
    });
}
async function updateBatch(openid, input) {
    assertString(input.batchId, 'batchId');
    const patch = input.patch || {};
    if (patch.locationId !== undefined)
        assertString(patch.locationId, 'locationId');
    if (patch.expiryDate !== undefined)
        assertString(patch.expiryDate, 'expiryDate');
    if (patch.shelfLifeValue !== undefined && patch.shelfLifeValue !== null)
        assertNonNegative(patch.shelfLifeValue, 'shelfLifeValue');
    if (patch.purchasePrice !== undefined && patch.purchasePrice !== null)
        assertNonNegative(patch.purchasePrice, 'purchasePrice');
    return db.runTransaction(async (tx) => {
        const batch = await txGet(tx, COLLECTIONS.batches, input.batchId, openid);
        const item = await txGet(tx, COLLECTIONS.items, batch.itemId, openid);
        const timestamp = now();
        const update = compactPatch({
            locationId: patch.locationId === undefined ? undefined : patch.locationId,
            purchaseDate: patch.purchaseDate === undefined ? undefined : patch.purchaseDate,
            productionDate: patch.productionDate === undefined ? undefined : patch.productionDate,
            shelfLifeValue: patch.shelfLifeValue === undefined ? undefined : patch.shelfLifeValue,
            shelfLifeUnit: patch.shelfLifeUnit === undefined ? undefined : patch.shelfLifeUnit,
            expiryDate: patch.expiryDate === undefined ? undefined : patch.expiryDate,
            purchasePrice: patch.purchasePrice === undefined ? undefined : patch.purchasePrice,
            purchaseChannel: patch.purchaseChannel === undefined ? undefined : patch.purchaseChannel,
            openedDate: patch.openedDate === undefined ? undefined : patch.openedDate,
            openedExpiryDate: patch.openedExpiryDate === undefined ? undefined : patch.openedExpiryDate,
            note: patch.note === undefined ? undefined : patch.note,
            updatedAt: timestamp,
        });
        await txUpdate(tx, COLLECTIONS.batches, batch._id, update);
        const batches = await listBatchesForItemInTransaction(tx, openid, item._id);
        const updatedBatches = batches.map((current) => current._id === batch._id ? { ...current, ...update } : current);
        await recomputeRemindersInTransaction(tx, openid, item, updatedBatches);
        return { ...batch, ...update };
    });
}
async function cleanupDevItem(openid, input) {
    assertString(input.itemId, 'itemId');
    const item = await queryOne(COLLECTIONS.items, { _id: input.itemId, _openid: openid });
    if (!item || !item.name.startsWith('dev-cloud-item-')) {
        throw inventoryError('DELETE_NOT_ALLOWED', 'Only dev-cloud-item-* records can be cleaned by this diagnostic action');
    }
    const batches = await queryMany(COLLECTIONS.batches, { _openid: openid, itemId: item._id });
    const txs = await queryMany(COLLECTIONS.transactions, { _openid: openid, itemId: item._id });
    const reminders = await queryMany(COLLECTIONS.reminders, { _openid: openid, itemId: item._id });
    const restocks = await queryMany(COLLECTIONS.restockItems, { _openid: openid, itemId: item._id });
    return db.runTransaction(async (tx) => {
        for (const reminder of reminders)
            await txRemove(tx, COLLECTIONS.reminders, reminder._id);
        for (const restock of restocks)
            await txRemove(tx, COLLECTIONS.restockItems, restock._id);
        for (const transaction of txs)
            await txRemove(tx, COLLECTIONS.transactions, transaction._id);
        for (const batch of batches)
            await txRemove(tx, COLLECTIONS.batches, batch._id);
        await txRemove(tx, COLLECTIONS.items, item._id);
        return { itemId: item._id, removed: { batches: batches.length, transactions: txs.length, reminders: reminders.length, restockItems: restocks.length } };
    });
}
async function main(event) {
    try {
        const wxContext = cloud.getWXContext();
        const openid = wxContext.OPENID;
        if (!openid)
            throw inventoryError('UNAUTHENTICATED', 'Missing OPENID');
        if (!event || !event.action)
            throw inventoryError('VALIDATION_ERROR', 'action is required');
        if (event.action === 'addStock')
            return ok(await addStock(openid, event.payload));
        if (event.action === 'consumeStock')
            return ok(await consumeStock(openid, event.payload));
        if (event.action === 'adjustStock')
            return ok(await adjustStock(openid, event.payload));
        if (event.action === 'updateItem')
            return ok(await updateItem(openid, event.payload));
        if (event.action === 'updateBatch')
            return ok(await updateBatch(openid, event.payload));
        if (event.action === 'cleanupDevItem')
            return ok(await cleanupDevItem(openid, event.payload));
        throw inventoryError('VALIDATION_ERROR', `Unsupported action: ${event.action}`);
    }
    catch (error) {
        return fail(error);
    }
}
