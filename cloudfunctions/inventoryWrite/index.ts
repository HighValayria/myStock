declare const require: any;

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

type TxType = 'ADD' | 'CONSUME' | 'ADJUST';
type TxReason = 'PURCHASE' | 'USED' | 'EXPIRED' | 'DAMAGED' | 'GIFT' | 'MANUAL_CORRECTION' | 'OTHER';
type ReminderType = 'EXPIRING' | 'EXPIRED' | 'LOW_STOCK' | 'ZERO_STOCK';
type ReminderStatus = 'ACTIVE' | 'READ' | 'DISMISSED' | 'RESOLVED';

type MutationAction =
  | 'addStock'
  | 'consumeStock'
  | 'adjustStock'
  | 'updateItem'
  | 'updateBatch'
  | 'markReminderRead'
  | 'dismissReminder'
  | 'purgeDismissedReminder'
  | 'addToRestock'
  | 'dismissRestock'
  | 'cleanupDevItem';

interface MutationEvent {
  action: MutationAction;
  payload: any;
}

interface ItemDoc {
  _id: string;
  _openid: string;
  schemaVersion: number;
  name: string;
  categoryId: string;
  unit: string;
  brand?: string | null;
  specification?: string | null;
  defaultLocationId?: string | null;
  lowStockThreshold?: number | null;
  expiryWarningDays?: number | null;
  barcode?: string | null;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

interface BatchDoc {
  _id: string;
  _openid: string;
  schemaVersion: number;
  itemId: string;
  quantity: number;
  locationId: string;
  purchaseDate?: string | null;
  productionDate?: string | null;
  shelfLifeValue?: number | null;
  shelfLifeUnit?: 'DAY' | 'MONTH' | 'YEAR' | null;
  expiryDate: string;
  purchasePrice?: number | null;
  purchaseChannel?: string | null;
  openedDate?: string | null;
  openedExpiryDate?: string | null;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

interface TransactionDoc {
  _id: string;
  _openid: string;
  schemaVersion: number;
  itemId: string;
  batchId: string;
  type: TxType;
  quantity: number;
  reason: TxReason;
  createdAt: number;
  note?: string;
  operationId?: string;
}

interface ReminderDoc {
  _id: string;
  _openid: string;
  schemaVersion: number;
  type: ReminderType;
  itemId: string;
  batchId?: string | null;
  status: ReminderStatus;
  cycleKey: string;
  createdAt: number;
  updatedAt: number;
  readAt?: number | null;
  dismissedAt?: number | null;
  resolvedAt?: number | null;
}

interface RestockDoc {
  _id: string;
  _openid: string;
  schemaVersion: number;
  itemId: string;
  status: 'NEEDED' | 'PURCHASED' | 'DISMISSED';
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number | null;
  note?: string;
}

function ok(data: unknown) {
  return { ok: true, data };
}

function fail(error: unknown) {
  const anyError = error as { code?: string; message?: string };
  return {
    ok: false,
    error: {
      code: anyError.code ?? 'INVENTORY_WRITE_FAILED',
      message: anyError.message ?? String(error),
    },
  };
}

function inventoryError(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function now(): number {
  return Date.now();
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw inventoryError('VALIDATION_ERROR', `${field} is required`);
}

function assertPositive(value: unknown, field: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw inventoryError('VALIDATION_ERROR', `${field} must be positive`);
}

function assertNonNegative(value: unknown, field: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw inventoryError('VALIDATION_ERROR', `${field} must be non-negative`);
}

function compactPatch<T extends Record<string, unknown>>(patch: T): Partial<T> {
  const output: Partial<T> = {};
  for (const key of Object.keys(patch) as Array<keyof T>) {
    if (patch[key] !== undefined) output[key] = patch[key];
  }
  return output;
}

function dateMs(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function effectiveExpiry(batch: BatchDoc): string {
  if (!batch.openedExpiryDate) return batch.expiryDate;
  return dateMs(batch.openedExpiryDate) < dateMs(batch.expiryDate) ? batch.openedExpiryDate : batch.expiryDate;
}

function compareBatch(a: BatchDoc, b: BatchDoc): number {
  const expiryDiff = dateMs(effectiveExpiry(a)) - dateMs(effectiveExpiry(b));
  if (expiryDiff !== 0) return expiryDiff;
  return a.createdAt - b.createdAt;
}

function remainingDays(expiryDate: string, today = new Date()): number {
  const todayDate = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
  return Math.floor((dateMs(expiryDate) - dateMs(todayDate)) / MS_PER_DAY);
}

function expiryStatus(batch: BatchDoc, warningDays: number): 'NORMAL' | 'EXPIRING' | 'EXPIRED' {
  const days = remainingDays(effectiveExpiry(batch));
  if (days < 0) return 'EXPIRED';
  if (days <= warningDays) return 'EXPIRING';
  return 'NORMAL';
}

function stockStatus(total: number, threshold?: number | null): 'NORMAL' | 'LOW' | 'ZERO' {
  if (total === 0) return 'ZERO';
  if (threshold == null) return 'NORMAL';
  return total <= threshold ? 'LOW' : 'NORMAL';
}

async function queryOne<T>(collectionName: string, where: Record<string, unknown>): Promise<T | null> {
  const result = await db.collection(collectionName).where(where).limit(1).get();
  return result.data[0] ?? null;
}

async function queryMany<T>(collectionName: string, where: Record<string, unknown>): Promise<T[]> {
  const result = await db.collection(collectionName).where(where).get();
  return result.data ?? [];
}

async function txGet<T>(tx: any, collectionName: string, id: string, openid: string): Promise<T> {
  const result = await tx.collection(collectionName).doc(id).get();
  const doc = result.data as T & { _openid?: string };
  if (!doc || doc._openid !== openid) throw inventoryError('NOT_FOUND', `${collectionName} not found: ${id}`);
  return doc as T;
}

async function txAdd(tx: any, collectionName: string, doc: object): Promise<void> {
  await tx.collection(collectionName).add({ data: doc });
}

async function txUpdate(tx: any, collectionName: string, id: string, data: Record<string, unknown>): Promise<void> {
  await tx.collection(collectionName).doc(id).update({ data });
}

async function txRemove(tx: any, collectionName: string, id: string): Promise<void> {
  await tx.collection(collectionName).doc(id).remove();
}

async function findOperationTransactions(tx: any, openid: string, operationId: string): Promise<TransactionDoc[]> {
  const existing = await tx.collection(COLLECTIONS.transactions).where({ _openid: openid, operationId }).get();
  return existing.data ?? [];
}

async function assertOperationIsNew(tx: any, openid: string, operationId: string): Promise<void> {
  const existing = await findOperationTransactions(tx, openid, operationId);
  if (existing.length > 0) {
    throw inventoryError('DUPLICATE_OPERATION', `Operation has already been applied: ${operationId}`);
  }
}

function buildTransaction(openid: string, input: Omit<TransactionDoc, '_id' | '_openid' | 'schemaVersion' | 'createdAt'>): TransactionDoc {
  return {
    _id: createId('tx'),
    _openid: openid,
    schemaVersion: SCHEMA_VERSION,
    createdAt: now(),
    ...input,
  };
}

function buildReminderCycleKey(item: ItemDoc, batch: BatchDoc | null, type: ReminderType): string {
  if (batch) return `${batch._id}:${type}:${effectiveExpiry(batch)}`;
  return `${item._id}:${type}:${item.lowStockThreshold ?? 'none'}`;
}

async function ensureReminder(tx: any, openid: string, item: ItemDoc, batch: BatchDoc | null, type: ReminderType): Promise<void> {
  const cycleKey = buildReminderCycleKey(item, batch, type);
  const existing = await tx.collection(COLLECTIONS.reminders).where({ _openid: openid, cycleKey }).get();
  const open = (existing.data as ReminderDoc[]).find((rem) => rem.status === 'ACTIVE' || rem.status === 'READ' || rem.status === 'DISMISSED');
  if (open) return;
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

async function resolveOpenReminders(tx: any, openid: string, itemId: string, batchId: string | null, types: ReminderType[]): Promise<void> {
  const existing = await tx.collection(COLLECTIONS.reminders).where({ _openid: openid, itemId }).get();
  const timestamp = now();
  for (const reminder of existing.data as ReminderDoc[]) {
    const sameType = types.includes(reminder.type);
    const sameBatch = (reminder.batchId ?? null) === batchId;
    const open = reminder.status === 'ACTIVE' || reminder.status === 'READ' || reminder.status === 'DISMISSED';
    if (sameType && sameBatch && open) {
      await txUpdate(tx, COLLECTIONS.reminders, reminder._id, { status: 'RESOLVED', resolvedAt: timestamp, updatedAt: timestamp });
    }
  }
}

async function recomputeRemindersInTransaction(tx: any, openid: string, item: ItemDoc, batches: BatchDoc[]): Promise<void> {
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
    } else if (status === 'EXPIRING') {
      await resolveOpenReminders(tx, openid, item._id, batch._id, ['EXPIRED']);
      await ensureReminder(tx, openid, item, batch, 'EXPIRING');
    } else {
      await resolveOpenReminders(tx, openid, item._id, batch._id, ['EXPIRING', 'EXPIRED']);
    }
  }

  const total = batches.reduce((sum, batch) => sum + batch.quantity, 0);
  const status = stockStatus(total, item.lowStockThreshold);
  if (status === 'ZERO') {
    await resolveOpenReminders(tx, openid, item._id, null, ['LOW_STOCK']);
    await ensureReminder(tx, openid, item, null, 'ZERO_STOCK');
  } else if (status === 'LOW') {
    await resolveOpenReminders(tx, openid, item._id, null, ['ZERO_STOCK']);
    await ensureReminder(tx, openid, item, null, 'LOW_STOCK');
  } else {
    await resolveOpenReminders(tx, openid, item._id, null, ['LOW_STOCK', 'ZERO_STOCK']);
  }
}

async function listBatchesForItemInTransaction(tx: any, openid: string, itemId: string): Promise<BatchDoc[]> {
  const result = await tx.collection(COLLECTIONS.batches).where({ _openid: openid, itemId }).get();
  return result.data as BatchDoc[];
}

async function resolveRestockIfNeeded(tx: any, openid: string, itemId: string): Promise<void> {
  const result = await tx.collection(COLLECTIONS.restockItems).where({ _openid: openid, itemId, status: 'NEEDED' }).get();
  const timestamp = now();
  for (const restock of result.data ?? []) {
    await txUpdate(tx, COLLECTIONS.restockItems, restock._id, { status: 'PURCHASED', resolvedAt: timestamp, updatedAt: timestamp });
  }
}

async function addStock(openid: string, input: any) {
  assertPositive(input.quantity, 'quantity');
  assertString(input.locationId, 'locationId');
  assertString(input.expiryDate, 'expiryDate');
  assertString(input.operationId, 'operationId');

  const mergeCandidate = input.itemId
    ? await queryOne<BatchDoc>(COLLECTIONS.batches, {
        _openid: openid,
        itemId: input.itemId,
        locationId: input.locationId,
        purchaseDate: input.purchaseDate ?? null,
        expiryDate: input.expiryDate,
      })
    : null;

  return db.runTransaction(async (tx: any) => {
    const existingTransactions = await findOperationTransactions(tx, openid, input.operationId);
    if (existingTransactions.length > 0) {
      const transaction = existingTransactions[0];
      const item = await txGet<ItemDoc>(tx, COLLECTIONS.items, transaction.itemId, openid);
      const batch = await txGet<BatchDoc>(tx, COLLECTIONS.batches, transaction.batchId, openid);
      return { item, batch, transaction, merged: false, idempotent: true };
    }
    const timestamp = now();
    let item: ItemDoc;

    if (input.itemId) {
      item = await txGet<ItemDoc>(tx, COLLECTIONS.items, input.itemId, openid);
    } else {
      const newItem = input.item;
      if (!newItem) throw inventoryError('VALIDATION_ERROR', 'item or itemId is required');
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

    let batch: BatchDoc;
    let merged = false;
    if (mergeCandidate) {
      const freshCandidate = await txGet<BatchDoc>(tx, COLLECTIONS.batches, mergeCandidate._id, openid);
      const stillMatches = freshCandidate.itemId === item._id
        && freshCandidate.locationId === input.locationId
        && (freshCandidate.purchaseDate ?? null) === (input.purchaseDate ?? null)
        && freshCandidate.expiryDate === input.expiryDate;
      if (stillMatches) {
        merged = true;
        batch = { ...freshCandidate, quantity: freshCandidate.quantity + input.quantity, updatedAt: timestamp };
        await txUpdate(tx, COLLECTIONS.batches, freshCandidate._id, { quantity: batch.quantity, updatedAt: timestamp });
      } else {
        batch = buildNewBatch(openid, item._id, input, timestamp);
        await txAdd(tx, COLLECTIONS.batches, batch);
      }
    } else {
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

function buildNewBatch(openid: string, itemId: string, input: any, timestamp: number): BatchDoc {
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

async function consumeStock(openid: string, input: any) {
  assertString(input.itemId, 'itemId');
  assertPositive(input.quantity, 'quantity');
  assertString(input.operationId, 'operationId');

  const snapshot = (await queryMany<BatchDoc>(COLLECTIONS.batches, { _openid: openid, itemId: input.itemId }))
    .filter((batch) => batch.quantity > 0)
    .sort(compareBatch)
    .map((batch) => ({ id: batch._id, quantity: batch.quantity, effectiveExpiryDate: effectiveExpiry(batch) }));

  return db.runTransaction(async (tx: any) => {
    const existingTransactions = await findOperationTransactions(tx, openid, input.operationId);
    if (existingTransactions.length > 0) {
      const item = await txGet<ItemDoc>(tx, COLLECTIONS.items, input.itemId, openid);
      const affectedBatches: BatchDoc[] = [];
      const seenBatchIds = new Set<string>();
      for (const transaction of existingTransactions) {
        if (!seenBatchIds.has(transaction.batchId)) {
          affectedBatches.push(await txGet<BatchDoc>(tx, COLLECTIONS.batches, transaction.batchId, openid));
          seenBatchIds.add(transaction.batchId);
        }
      }
      return { item, transactions: existingTransactions, affectedBatches, idempotent: true };
    }
    const item = await txGet<ItemDoc>(tx, COLLECTIONS.items, input.itemId, openid);
    const freshBatches: BatchDoc[] = [];
    for (const candidate of snapshot) {
      const fresh = await txGet<BatchDoc>(tx, COLLECTIONS.batches, candidate.id, openid);
      if (fresh.itemId !== input.itemId) throw inventoryError('STALE_STOCK_RETRY_REQUIRED', 'Batch item changed; retry consume');
      if (fresh.quantity !== candidate.quantity || effectiveExpiry(fresh) !== candidate.effectiveExpiryDate) {
        throw inventoryError('STALE_STOCK_RETRY_REQUIRED', 'Batch changed before consume; retry with fresh stock');
      }
      if (fresh.quantity > 0) freshBatches.push(fresh);
    }
    freshBatches.sort(compareBatch);
    const total = freshBatches.reduce((sum, batch) => sum + batch.quantity, 0);
    if (total < input.quantity) throw inventoryError('INSUFFICIENT_STOCK', 'Consume quantity exceeds available stock');

    let remaining = input.quantity;
    const timestamp = now();
    const affectedBatches: BatchDoc[] = [];
    const transactions: TransactionDoc[] = [];
    for (const batch of freshBatches) {
      if (remaining <= 0) break;
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

async function adjustStock(openid: string, input: any) {
  assertString(input.batchId, 'batchId');
  assertNonNegative(input.actualQuantity, 'actualQuantity');
  assertString(input.operationId, 'operationId');

  return db.runTransaction(async (tx: any) => {
    const existingTransactions = await findOperationTransactions(tx, openid, input.operationId);
    if (existingTransactions.length > 0) {
      const transaction = existingTransactions[0];
      const batch = await txGet<BatchDoc>(tx, COLLECTIONS.batches, transaction.batchId, openid);
      return { batch, transaction, diff: transaction.quantity, idempotent: true };
    }
    const batch = await txGet<BatchDoc>(tx, COLLECTIONS.batches, input.batchId, openid);
    const diff = input.actualQuantity - batch.quantity;
    if (diff === 0) return { batch, transaction: null, diff };
    await assertOperationIsNew(tx, openid, input.operationId);
    const item = await txGet<ItemDoc>(tx, COLLECTIONS.items, batch.itemId, openid);
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

async function updateItem(openid: string, input: any) {
  assertString(input.itemId, 'itemId');
  const patch = input.patch || {};
  if (patch.name !== undefined) assertString(patch.name, 'name');
  if (patch.categoryId !== undefined) assertString(patch.categoryId, 'categoryId');
  if (patch.unit !== undefined) assertString(patch.unit, 'unit');
  if (patch.lowStockThreshold !== undefined && patch.lowStockThreshold !== null) assertNonNegative(patch.lowStockThreshold, 'lowStockThreshold');
  if (patch.expiryWarningDays !== undefined && patch.expiryWarningDays !== null) assertNonNegative(patch.expiryWarningDays, 'expiryWarningDays');
  return db.runTransaction(async (tx: any) => {
    const item = await txGet<ItemDoc>(tx, COLLECTIONS.items, input.itemId, openid);
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

async function updateBatch(openid: string, input: any) {
  assertString(input.batchId, 'batchId');
  const patch = input.patch || {};
  if (patch.locationId !== undefined) assertString(patch.locationId, 'locationId');
  if (patch.expiryDate !== undefined) assertString(patch.expiryDate, 'expiryDate');
  if (patch.shelfLifeValue !== undefined && patch.shelfLifeValue !== null) assertNonNegative(patch.shelfLifeValue, 'shelfLifeValue');
  if (patch.purchasePrice !== undefined && patch.purchasePrice !== null) assertNonNegative(patch.purchasePrice, 'purchasePrice');
  return db.runTransaction(async (tx: any) => {
    const batch = await txGet<BatchDoc>(tx, COLLECTIONS.batches, input.batchId, openid);
    const item = await txGet<ItemDoc>(tx, COLLECTIONS.items, batch.itemId, openid);
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

async function markReminderRead(openid: string, input: any) {
  assertString(input.reminderId, 'reminderId');
  return db.runTransaction(async (tx: any) => {
    const reminder = await txGet<ReminderDoc>(tx, COLLECTIONS.reminders, input.reminderId, openid);
    if (reminder.status !== 'ACTIVE') return reminder;
    const timestamp = now();
    await txUpdate(tx, COLLECTIONS.reminders, reminder._id, { status: 'READ', readAt: timestamp, updatedAt: timestamp });
    return { ...reminder, status: 'READ', readAt: timestamp, updatedAt: timestamp };
  });
}

async function dismissReminder(openid: string, input: any) {
  assertString(input.reminderId, 'reminderId');
  return db.runTransaction(async (tx: any) => {
    const reminder = await txGet<ReminderDoc>(tx, COLLECTIONS.reminders, input.reminderId, openid);
    if (reminder.status !== 'ACTIVE' && reminder.status !== 'READ') return reminder;
    const timestamp = now();
    await txUpdate(tx, COLLECTIONS.reminders, reminder._id, { status: 'DISMISSED', dismissedAt: timestamp, updatedAt: timestamp });
    return { ...reminder, status: 'DISMISSED', dismissedAt: timestamp, updatedAt: timestamp };
  });
}

async function purgeDismissedReminder(openid: string, input: any) {
  assertString(input.reminderId, 'reminderId');
  return db.runTransaction(async (tx: any) => {
    const reminder = await txGet<ReminderDoc>(tx, COLLECTIONS.reminders, input.reminderId, openid);
    if (reminder.status !== 'DISMISSED') throw inventoryError('DELETE_NOT_ALLOWED', 'Only dismissed reminders can be purged');
    await txRemove(tx, COLLECTIONS.reminders, reminder._id);
    return { reminderId: reminder._id, purged: true };
  });
}

async function addToRestock(openid: string, input: any) {
  assertString(input.itemId, 'itemId');
  const item = await queryOne<ItemDoc>(COLLECTIONS.items, { _id: input.itemId, _openid: openid });
  if (!item) throw inventoryError('NOT_FOUND', `Item not found: ${input.itemId}`);
  const existing = await queryOne<RestockDoc>(COLLECTIONS.restockItems, { _openid: openid, itemId: input.itemId, status: 'NEEDED' });
  if (existing) return existing;
  const timestamp = now();
  const restock: RestockDoc = {
    _id: createId('restock'),
    _openid: openid,
    schemaVersion: SCHEMA_VERSION,
    itemId: input.itemId,
    status: 'NEEDED',
    createdAt: timestamp,
    updatedAt: timestamp,
    resolvedAt: null,
    note: input.note ?? '',
  };
  await db.collection(COLLECTIONS.restockItems).add({ data: restock });
  return restock;
}

async function dismissRestock(openid: string, input: any) {
  assertString(input.restockId, 'restockId');
  return db.runTransaction(async (tx: any) => {
    const restock = await txGet<RestockDoc>(tx, COLLECTIONS.restockItems, input.restockId, openid);
    if (restock.status !== 'NEEDED') return restock;
    const timestamp = now();
    await txUpdate(tx, COLLECTIONS.restockItems, restock._id, { status: 'DISMISSED', resolvedAt: timestamp, updatedAt: timestamp });
    return { ...restock, status: 'DISMISSED', resolvedAt: timestamp, updatedAt: timestamp };
  });
}

async function cleanupDevItem(openid: string, input: any) {
  assertString(input.itemId, 'itemId');
  const item = await queryOne<ItemDoc>(COLLECTIONS.items, { _id: input.itemId, _openid: openid });
  if (!item || !item.name.startsWith('dev-cloud-item-')) {
    throw inventoryError('DELETE_NOT_ALLOWED', 'Only dev-cloud-item-* records can be cleaned by this diagnostic action');
  }
  const batches = await queryMany<BatchDoc>(COLLECTIONS.batches, { _openid: openid, itemId: item._id });
  const txs = await queryMany<TransactionDoc>(COLLECTIONS.transactions, { _openid: openid, itemId: item._id });
  const reminders = await queryMany<ReminderDoc>(COLLECTIONS.reminders, { _openid: openid, itemId: item._id });
  const restocks = await queryMany<any>(COLLECTIONS.restockItems, { _openid: openid, itemId: item._id });
  return db.runTransaction(async (tx: any) => {
    for (const reminder of reminders) await txRemove(tx, COLLECTIONS.reminders, reminder._id);
    for (const restock of restocks) await txRemove(tx, COLLECTIONS.restockItems, restock._id);
    for (const transaction of txs) await txRemove(tx, COLLECTIONS.transactions, transaction._id);
    for (const batch of batches) await txRemove(tx, COLLECTIONS.batches, batch._id);
    await txRemove(tx, COLLECTIONS.items, item._id);
    return { itemId: item._id, removed: { batches: batches.length, transactions: txs.length, reminders: reminders.length, restockItems: restocks.length } };
  });
}

export async function main(event: MutationEvent) {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    if (!openid) throw inventoryError('UNAUTHENTICATED', 'Missing OPENID');
    if (!event || !event.action) throw inventoryError('VALIDATION_ERROR', 'action is required');
    if (event.action === 'addStock') return ok(await addStock(openid, event.payload));
    if (event.action === 'consumeStock') return ok(await consumeStock(openid, event.payload));
    if (event.action === 'adjustStock') return ok(await adjustStock(openid, event.payload));
    if (event.action === 'updateItem') return ok(await updateItem(openid, event.payload));
    if (event.action === 'updateBatch') return ok(await updateBatch(openid, event.payload));
    if (event.action === 'markReminderRead') return ok(await markReminderRead(openid, event.payload));
    if (event.action === 'dismissReminder') return ok(await dismissReminder(openid, event.payload));
    if (event.action === 'purgeDismissedReminder') return ok(await purgeDismissedReminder(openid, event.payload));
    if (event.action === 'addToRestock') return ok(await addToRestock(openid, event.payload));
    if (event.action === 'dismissRestock') return ok(await dismissRestock(openid, event.payload));
    if (event.action === 'cleanupDevItem') return ok(await cleanupDevItem(openid, event.payload));
    throw inventoryError('VALIDATION_ERROR', `Unsupported action: ${event.action}`);
  } catch (error) {
    return fail(error);
  }
}

