import { createMemoryRepositories } from '../miniprogram/repositories';
import { ImportExportService, InventoryService, ReminderService, StatisticsService } from '../miniprogram/services';
import type { InventoryMutationClient } from '../miniprogram/services';
import { InventoryError } from '../miniprogram/utils/errors';
import { resetIdSequenceForTests } from '../miniprogram/utils/id';
import { DEFAULT_UNIT, UNKNOWN_EXPIRY_DATE, calculateExpiryDateFromShelfLife, parseNonNegativeNumber, parsePositiveNumber, resolveExpiryDate } from '../miniprogram/utils/phase2-form';
import { expiryStatusLabel, formatRemainingDays, transactionQuantityText, transactionTypeLabel, visibleExpiryDate } from '../miniprogram/utils/phase3-view';
import type { AddStockInput, Batch, Category, CreateItemInput, Item, RestockItem, Transaction } from '../miniprogram/models';

interface TestContext {
  repos: ReturnType<typeof createMemoryRepositories>;
  inventory: InventoryService;
  reminders: ReminderService;
}

const USER_ID = 'test-user';
const TODAY = new Date('2026-10-03T00:00:00.000Z');
const TEST_SCHEMA_VERSION = 1;

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

async function assertRejects(fn: () => Promise<unknown>, code: string, message: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof InventoryError, `${message}: expected InventoryError`);
    const inventoryError = error as InventoryError;
    assertEqual(inventoryError.code, code, message);
    return;
  }
  throw new Error(`${message}: expected rejection`);
}
function createContext(today: Date = TODAY): TestContext {
  resetIdSequenceForTests();
  const repos = createMemoryRepositories();
  const reminders = new ReminderService(repos, { userId: USER_ID, defaultExpiryWarningDays: 7, now: () => today });
  const inventory = new InventoryService(repos, { userId: USER_ID, defaultExpiryWarningDays: 7, now: () => today }, reminders);
  return { repos, inventory, reminders };
}

function milkItem(overrides: Partial<CreateItemInput> = {}): CreateItemInput {
  return {
    name: 'Milk',
    categoryId: 'cat_food',
    unit: 'box',
    lowStockThreshold: 2,
    expiryWarningDays: 7,
    ...overrides,
  };
}

function stockInput(overrides: Partial<AddStockInput> = {}): AddStockInput {
  return {
    item: milkItem(),
    quantity: 5,
    locationId: 'loc_fridge',
    purchaseDate: '2026-10-01',
    expiryDate: '2026-10-20',
    ...overrides,
  };
}

type MemoryRepos = ReturnType<typeof createMemoryRepositories>;

async function seedCategory(repos: MemoryRepos, id: string, name: string): Promise<Category> {
  const now = TODAY.getTime();
  return repos.categories.create({
    _id: id,
    _openid: USER_ID,
    schemaVersion: TEST_SCHEMA_VERSION,
    name,
    createdAt: now,
    updatedAt: now,
  });
}

async function seedItem(repos: MemoryRepos, id: string, overrides: Partial<Item> = {}): Promise<Item> {
  const now = TODAY.getTime();
  return repos.items.create({
    _id: id,
    _openid: USER_ID,
    schemaVersion: TEST_SCHEMA_VERSION,
    name: id,
    categoryId: 'cat_food',
    unit: 'box',
    brand: null,
    specification: null,
    defaultLocationId: null,
    lowStockThreshold: null,
    expiryWarningDays: 7,
    barcode: null,
    note: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

async function seedBatch(repos: MemoryRepos, id: string, itemId: string, overrides: Partial<Batch> = {}): Promise<Batch> {
  const now = TODAY.getTime();
  return repos.batches.create({
    _id: id,
    _openid: USER_ID,
    schemaVersion: TEST_SCHEMA_VERSION,
    itemId,
    quantity: 1,
    locationId: 'loc_default',
    purchaseDate: '2026-10-01',
    productionDate: null,
    shelfLifeValue: null,
    shelfLifeUnit: null,
    expiryDate: '2026-10-20',
    purchasePrice: null,
    purchaseChannel: null,
    openedDate: null,
    openedExpiryDate: null,
    note: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

async function seedTransaction(repos: MemoryRepos, id: string, itemId: string, overrides: Partial<Transaction> = {}): Promise<Transaction> {
  return repos.transactions.create({
    _id: id,
    _openid: USER_ID,
    schemaVersion: TEST_SCHEMA_VERSION,
    itemId,
    batchId: overrides.batchId || 'batch_default',
    type: 'ADD',
    quantity: 1,
    reason: 'PURCHASE',
    operationId: id,
    createdAt: TODAY.getTime(),
    ...overrides,
  });
}

async function seedRestock(repos: MemoryRepos, id: string, itemId: string, overrides: Partial<RestockItem> = {}): Promise<RestockItem> {
  const now = TODAY.getTime();
  return repos.restockItems.create({
    _id: id,
    _openid: USER_ID,
    schemaVersion: TEST_SCHEMA_VERSION,
    itemId,
    status: 'NEEDED',
    resolvedAt: null,
    note: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function statistics(repos: MemoryRepos): StatisticsService {
  return new StatisticsService(repos, { userId: USER_ID, now: () => TODAY });
}

function importExport(repos: MemoryRepos): ImportExportService {
  return new ImportExportService(repos, { userId: USER_ID, now: () => TODAY });
}

function excelText(rows: string[][]): string {
  return [
    '物品名称\t类别\t品牌\t规格\t数量\t单位\t存放位置\t购买日期\t生产日期\t保质期数值\t保质期单位\t到期日期\t单位购买价格\t购买渠道\t低库存阈值\t临期阈值\t备注',
    ...rows.map((row) => row.join('\t')),
  ].join('\n');
}

function sumTrend(points: Array<{ addOperationCount: number; consumeOperationCount: number }>, key: 'addOperationCount' | 'consumeOperationCount'): number {
  return points.reduce((sum, point) => sum + point[key], 0);
}

const tests: Array<[string, () => Promise<void>]> = [
  ['single batch add creates item, batch, ADD transaction', async () => {
    const { repos, inventory } = createContext();
    const result = await inventory.addStock(stockInput({ quantity: 6 }));
    assertEqual(result.batch.quantity, 6, 'batch quantity');
    assertEqual(result.transaction.type, 'ADD', 'transaction type');
    assertEqual(result.transaction.quantity, 6, 'transaction quantity');
    assertEqual((await repos.items.listByUser(USER_ID)).length, 1, 'item count');
    assertEqual((await repos.batches.listByUser(USER_ID)).length, 1, 'batch count');
  }],

  ['same batch is conservatively merged', async () => {
    const { repos, inventory } = createContext();
    const first = await inventory.addStock(stockInput({ quantity: 5 }));
    const second = await inventory.addStock(stockInput({ itemId: first.item._id, item: undefined, quantity: 3 }));
    assert(second.merged, 'second add should merge');
    assertEqual((await repos.batches.listByUser(USER_ID)).length, 1, 'batch count');
    assertEqual(second.batch.quantity, 8, 'merged quantity');
    assertEqual((await repos.transactions.listByUser(USER_ID)).length, 2, 'transaction count');
  }],

  ['different expiry date does not merge', async () => {
    const { repos, inventory } = createContext();
    const first = await inventory.addStock(stockInput({ quantity: 5, expiryDate: '2026-10-10' }));
    const second = await inventory.addStock(stockInput({ itemId: first.item._id, item: undefined, quantity: 3, expiryDate: '2026-10-20' }));
    assert(!second.merged, 'different expiry must not merge');
    assertEqual((await repos.batches.listByUser(USER_ID)).length, 2, 'batch count');
  }],

  ['single batch consume creates CONSUME transaction', async () => {
    const { repos, inventory } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 5 }));
    const consumed = await inventory.consumeStock({ itemId: added.item._id, quantity: 2 });
    assertEqual(consumed.affectedBatches[0].quantity, 3, 'remaining quantity');
    assertEqual(consumed.transactions[0].type, 'CONSUME', 'transaction type');
    assertEqual(consumed.transactions[0].quantity, -2, 'consume tx quantity');
    assertEqual((await repos.transactions.listByUser(USER_ID)).length, 2, 'transaction count');
  }],

  ['multi batch consume follows FEFO', async () => {
    const { repos, inventory } = createContext();
    const first = await inventory.addStock(stockInput({ quantity: 2, expiryDate: '2026-10-05' }));
    await inventory.addStock(stockInput({ itemId: first.item._id, item: undefined, quantity: 5, purchaseDate: '2026-10-02', expiryDate: '2026-10-20' }));
    const consumed = await inventory.consumeStock({ itemId: first.item._id, quantity: 3 });
    const batches = (await repos.batches.listByItem(USER_ID, first.item._id)).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    assertEqual(batches[0].quantity, 0, 'earliest batch consumed first');
    assertEqual(batches[1].quantity, 4, 'later batch consumed second');
    assertEqual(consumed.transactions.length, 2, 'one transaction per affected batch');
    assertEqual(consumed.transactions[0].quantity, -2, 'first tx quantity');
    assertEqual(consumed.transactions[1].quantity, -1, 'second tx quantity');
  }],

  ['consume quantity over stock fails before writes', async () => {
    const { repos, inventory } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 2 }));
    await assertRejects(() => inventory.consumeStock({ itemId: added.item._id, quantity: 3 }), 'INSUFFICIENT_STOCK', 'over consume');
    const batches = await repos.batches.listByItem(USER_ID, added.item._id);
    assertEqual(batches[0].quantity, 2, 'quantity remains unchanged');
    assertEqual((await repos.transactions.listByUser(USER_ID)).length, 1, 'no consume transaction written');
  }],

  ['quantity correction creates ADJUST transaction', async () => {
    const { repos, inventory } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 5 }));
    const adjusted = await inventory.adjustStock({ batchId: added.batch._id, actualQuantity: 4 });
    assertEqual(adjusted.diff, -1, 'adjust diff');
    assert(adjusted.transaction !== null, 'adjust transaction exists');
    assertEqual(adjusted.transaction?.type, 'ADJUST', 'adjust tx type');
    assertEqual(adjusted.transaction?.quantity, -1, 'adjust tx quantity');
    assertEqual((await repos.batches.getById(USER_ID, added.batch._id))?.quantity, 4, 'batch quantity updated');
  }],

  ['low stock reminder is created when stock drops below threshold', async () => {
    const { repos, inventory } = createContext();
    const added = await inventory.addStock(stockInput({ item: milkItem({ lowStockThreshold: 5 }), quantity: 10, expiryDate: '2026-11-20' }));
    await inventory.consumeStock({ itemId: added.item._id, quantity: 6 });
    const reminders = await repos.reminders.listByItem(USER_ID, added.item._id);
    assert(reminders.some((reminder) => reminder.type === 'LOW_STOCK' && reminder.status === 'ACTIVE'), 'LOW_STOCK active');
  }],

  ['zero stock reminder is created when stock reaches zero', async () => {
    const { repos, inventory } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 2, expiryDate: '2026-11-20' }));
    await inventory.consumeStock({ itemId: added.item._id, quantity: 2 });
    const reminders = await repos.reminders.listByItem(USER_ID, added.item._id);
    assert(reminders.some((reminder) => reminder.type === 'ZERO_STOCK' && reminder.status === 'ACTIVE'), 'ZERO_STOCK active');
    assert(!reminders.some((reminder) => reminder.type === 'LOW_STOCK' && reminder.status === 'ACTIVE'), 'LOW_STOCK not active at zero');
  }],

  ['expiring reminder is created inside warning window', async () => {
    const { repos, inventory } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 2, expiryDate: '2026-10-08' }));
    const reminders = await repos.reminders.listByItem(USER_ID, added.item._id);
    assert(reminders.some((reminder) => reminder.type === 'EXPIRING' && reminder.status === 'ACTIVE'), 'EXPIRING active');
  }],

  ['expired reminder is created and stock remains', async () => {
    const { repos, inventory } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 2, expiryDate: '2026-10-01' }));
    const reminders = await repos.reminders.listByItem(USER_ID, added.item._id);
    assert(reminders.some((reminder) => reminder.type === 'EXPIRED' && reminder.status === 'ACTIVE'), 'EXPIRED active');
    assertEqual((await repos.batches.getById(USER_ID, added.batch._id))?.quantity, 2, 'expired stock remains');
  }],

  ['dismissed reminder does not duplicate in same cycle', async () => {
    const { repos, inventory, reminders } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 2, expiryDate: '2026-10-08' }));
    const active = (await repos.reminders.listByItem(USER_ID, added.item._id)).find((reminder) => reminder.type === 'EXPIRING');
    assert(active, 'active expiring exists');
    await reminders.dismissReminder(active!._id);
    await reminders.recomputeReminders({ itemId: added.item._id });
    const expiring = (await repos.reminders.listByItem(USER_ID, added.item._id)).filter((reminder) => reminder.type === 'EXPIRING');
    assertEqual(expiring.length, 1, 'no duplicate expiring reminder');
    assertEqual(expiring[0].status, 'DISMISSED', 'dismissed remains dismissed');
  }],

  ['reminder resolves when condition is cleared', async () => {
    const { repos, inventory, reminders } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 2, expiryDate: '2026-10-08' }));
    await inventory.updateBatch(added.batch._id, { expiryDate: '2026-12-01' });
    await reminders.recomputeReminders({ itemId: added.item._id });
    const expiring = (await repos.reminders.listByItem(USER_ID, added.item._id)).filter((reminder) => reminder.type === 'EXPIRING');
    assert(expiring.some((reminder) => reminder.status === 'RESOLVED'), 'expiring resolved');
  }],
  ['duplicate operationId is rejected before double write', async () => {
    const { repos, inventory } = createContext();
    const operationId = 'op-add-duplicate';
    await inventory.addStock(stockInput({ quantity: 2, operationId }));
    await assertRejects(() => inventory.addStock(stockInput({ quantity: 2, operationId })), 'DUPLICATE_OPERATION', 'duplicate add operation');
    assertEqual((await repos.batches.listByUser(USER_ID)).length, 1, 'duplicate add did not create extra batch');
    assertEqual((await repos.transactions.listByUser(USER_ID)).length, 1, 'duplicate add did not create extra transaction');
  }],

  ['cloud-mode write operations delegate to mutation client', async () => {
    const { repos } = createContext();
    const calls: string[] = [];
    const mutationClient: InventoryMutationClient = {
      async addStock(input) {
        calls.push(`add:${input.operationId}`);
        return {
          item: { _id: 'cloud-item' },
          batch: { _id: 'cloud-batch' },
          transaction: { _id: 'cloud-add-tx' },
          merged: false,
        } as never;
      },
      async consumeStock(input) {
        calls.push(`consume:${input.operationId}`);
        return {
          affectedBatches: [{ _id: 'cloud-batch', quantity: 2 }],
          transactions: [{ _id: 'cloud-consume-tx' }],
        } as never;
      },
      async adjustStock(input) {
        calls.push(`adjust:${input.operationId}`);
        return {
          batch: { _id: input.batchId, quantity: input.actualQuantity },
          transaction: { _id: 'cloud-adjust-tx' },
          diff: 1,
        } as never;
      },
    };
    const inventory = new InventoryService(
      repos,
      {
        userId: USER_ID,
        defaultExpiryWarningDays: 7,
        now: () => TODAY,
        mutationClient,
        requireMutationClientForWrites: true,
      },
    );

    await inventory.addStock(stockInput({ operationId: 'op-cloud-add' }));
    await inventory.consumeStock({ itemId: 'cloud-item', quantity: 1, operationId: 'op-cloud-consume' });
    await inventory.adjustStock({ batchId: 'cloud-batch', actualQuantity: 3, operationId: 'op-cloud-adjust' });

    assertEqual(calls.join(','), 'add:op-cloud-add,consume:op-cloud-consume,adjust:op-cloud-adjust', 'mutation client calls');
    assertEqual((await repos.transactions.listByUser(USER_ID)).length, 0, 'delegated writes do not mutate local repositories');
  }],
  ['repository user isolation prevents known id read and update', async () => {
    const { repos, inventory } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 2 }));
    const otherUser = 'other-user';
    const readByOther = await repos.items.getById(otherUser, added.item._id);
    assertEqual(readByOther, null, 'other user cannot read known item id');
    await assertRejects(() => repos.items.update(otherUser, added.item._id, { note: 'hacked' }), 'NOT_FOUND', 'other user cannot update known item id');
  }],
  ['phase 3 view helpers keep derived states display-only and localized', async () => {
    assertEqual(expiryStatusLabel('EXPIRING'), '临期', 'expiry status label');
    assertEqual(formatRemainingDays(null), '未知', 'unknown remaining days');
    assertEqual(formatRemainingDays(-2), '已过期 2 天', 'expired remaining days');
    assertEqual(visibleExpiryDate(UNKNOWN_EXPIRY_DATE), '无到期日', 'unknown expiry is hidden from users');
    assertEqual(transactionTypeLabel('ADJUST'), '库存修正', 'transaction type label');
    assertEqual(transactionQuantityText({ quantity: -2 } as never, '盒'), '-2盒', 'transaction quantity text');
  }],

  ['phase 2 form helpers validate expiry and adjustment inputs', async () => {
    assertEqual(resolveExpiryDate({ expiryDate: '2026-10-20' }), '2026-10-20', 'direct expiry date');
    assertEqual(
      resolveExpiryDate({ productionDate: '2026-10-01', shelfLifeValue: 7, shelfLifeUnit: 'DAY' }),
      '2026-10-08',
      'production date plus shelf life',
    );
    await assertRejects(
      async () => resolveExpiryDate({ expiryDate: '2026-09-30', productionDate: '2026-10-01' }),
      'VALIDATION_ERROR',
      'expiry date before production date',
    );
    await assertRejects(async () => parsePositiveNumber('0', '数量'), 'VALIDATION_ERROR', 'positive number rejects zero');
    assertEqual(parseNonNegativeNumber('0', '实际数量'), 0, 'adjust actual quantity allows zero');
    await assertRejects(async () => parseNonNegativeNumber('-1', '实际数量'), 'VALIDATION_ERROR', 'adjust actual quantity rejects negative');
    assertEqual(DEFAULT_UNIT, '个', 'phase 2 default unit');
    assertEqual(resolveExpiryDate({ allowUnknown: true }), UNKNOWN_EXPIRY_DATE, 'unknown expiry compatibility value');
    assertEqual(resolveExpiryDate({ expiryDate: '', allowUnknown: true }), UNKNOWN_EXPIRY_DATE, 'cleared expiry can preserve unknown compatibility value');
    assertEqual(
      calculateExpiryDateFromShelfLife({ productionDate: '2026-10-04', shelfLifeValue: 6, shelfLifeUnit: 'MONTH' }),
      '2027-04-04',
      'month shelf life calculates expected expiry',
    );
    await assertRejects(async () => resolveExpiryDate({ expiryDate: '2026-02-30' }), 'VALIDATION_ERROR', 'invalid date is rejected');
  }],

  ['T-P4-A01 first expiring reminder is created once', async () => {
    const { repos, inventory, reminders } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 2, expiryDate: '2026-10-10' }));
    await reminders.recomputeReminders({ itemId: added.item._id });
    const expiring = (await repos.reminders.listByItem(USER_ID, added.item._id)).filter((reminder) => reminder.type === 'EXPIRING');
    assertEqual(expiring.length, 1, 'one expiring reminder');
    assertEqual(expiring[0].status, 'ACTIVE', 'expiring active');
  }],

  ['T-P4-A02 repeated recompute does not duplicate same expiring cycle', async () => {
    const { repos, inventory, reminders } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 2, expiryDate: '2026-10-10' }));
    await reminders.recomputeReminders({ itemId: added.item._id });
    await reminders.recomputeReminders({ itemId: added.item._id });
    const expiring = (await repos.reminders.listByItem(USER_ID, added.item._id)).filter((reminder) => reminder.type === 'EXPIRING');
    assertEqual(expiring.length, 1, 'still one expiring reminder');
  }],

  ['T-P4-A03 dismissed expiring reminder remains dismissed in same cycle', async () => {
    const { repos, inventory, reminders } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 2, expiryDate: '2026-10-10' }));
    const reminder = (await repos.reminders.listByItem(USER_ID, added.item._id)).find((item) => item.type === 'EXPIRING');
    assert(reminder, 'expiring reminder exists');
    await reminders.dismissReminder(reminder!._id);
    await reminders.recomputeReminders({ itemId: added.item._id });
    const expiring = (await repos.reminders.listByItem(USER_ID, added.item._id)).filter((item) => item.type === 'EXPIRING');
    assertEqual(expiring.length, 1, 'no duplicate after dismiss');
    assertEqual(expiring[0].status, 'DISMISSED', 'dismissed status kept');
  }],

  ['T-P4-A04 expiring reminder resolves when batch becomes safe', async () => {
    const { repos, inventory } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 2, expiryDate: '2026-10-10' }));
    await inventory.updateBatch(added.batch._id, { expiryDate: '2026-12-01' });
    const expiring = (await repos.reminders.listByItem(USER_ID, added.item._id)).filter((reminder) => reminder.type === 'EXPIRING');
    assert(expiring.some((reminder) => reminder.status === 'RESOLVED'), 'expiring resolved');
  }],

  ['T-P4-A05 expiring reminder can enter a new cycle after resolved', async () => {
    const { repos, inventory } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 2, expiryDate: '2026-10-10' }));
    await inventory.updateBatch(added.batch._id, { expiryDate: '2026-12-01' });
    await inventory.updateBatch(added.batch._id, { expiryDate: '2026-10-09' });
    const expiring = (await repos.reminders.listByItem(USER_ID, added.item._id)).filter((reminder) => reminder.type === 'EXPIRING');
    assertEqual(expiring.length, 2, 'new expiring reminder created after resolved');
    assert(expiring.some((reminder) => reminder.status === 'ACTIVE'), 'new active expiring exists');
  }],

  ['T-P4-A06 expiring transitions to expired without deleting stock', async () => {
    const { repos, inventory } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 2, expiryDate: '2026-10-03' }));
    const laterReminders = new ReminderService(repos, { userId: USER_ID, defaultExpiryWarningDays: 7, now: () => new Date('2026-10-05T00:00:00.000Z') });
    await laterReminders.recomputeReminders({ itemId: added.item._id });
    const reminders = await repos.reminders.listByItem(USER_ID, added.item._id);
    assert(reminders.some((reminder) => reminder.type === 'EXPIRING' && reminder.status === 'RESOLVED'), 'expiring resolved');
    assert(reminders.some((reminder) => reminder.type === 'EXPIRED' && reminder.status === 'ACTIVE'), 'expired active');
    assertEqual((await repos.batches.getById(USER_ID, added.batch._id))?.quantity, 2, 'expired stock remains');
  }],

  ['T-P4-A07 expired reminder does not auto-delete or zero inventory', async () => {
    const { repos, inventory } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 3, expiryDate: '2026-10-01' }));
    const item = await repos.items.getById(USER_ID, added.item._id);
    const batch = await repos.batches.getById(USER_ID, added.batch._id);
    assert(item, 'expired item remains');
    assertEqual(batch?.quantity, 3, 'expired batch quantity remains');
  }],

  ['T-P4-A08 low stock reminder is created on first threshold crossing', async () => {
    const { repos, inventory } = createContext();
    const added = await inventory.addStock(stockInput({ item: milkItem({ lowStockThreshold: 2 }), quantity: 3, expiryDate: '2026-12-01' }));
    await inventory.consumeStock({ itemId: added.item._id, quantity: 1 });
    const reminders = await repos.reminders.listByItem(USER_ID, added.item._id);
    assert(reminders.some((reminder) => reminder.type === 'LOW_STOCK' && reminder.status === 'ACTIVE'), 'low stock active');
  }],

  ['T-P4-A09 dismissed low stock reminder does not duplicate while still low', async () => {
    const { repos, inventory, reminders } = createContext();
    const added = await inventory.addStock(stockInput({ item: milkItem({ lowStockThreshold: 2 }), quantity: 3, expiryDate: '2026-12-01' }));
    await inventory.consumeStock({ itemId: added.item._id, quantity: 1 });
    const low = (await repos.reminders.listByItem(USER_ID, added.item._id)).find((reminder) => reminder.type === 'LOW_STOCK');
    assert(low, 'low stock reminder exists');
    await reminders.dismissReminder(low!._id);
    await inventory.consumeStock({ itemId: added.item._id, quantity: 1 });
    const lows = (await repos.reminders.listByItem(USER_ID, added.item._id)).filter((reminder) => reminder.type === 'LOW_STOCK');
    assertEqual(lows.length, 1, 'low stock not duplicated in same cycle');
    assertEqual(lows[0].status, 'DISMISSED', 'dismissed low stock kept');
  }],

  ['T-P4-A10 low stock resolves after stock recovers', async () => {
    const { repos, inventory } = createContext();
    const added = await inventory.addStock(stockInput({ item: milkItem({ lowStockThreshold: 2 }), quantity: 3, expiryDate: '2026-12-01' }));
    await inventory.consumeStock({ itemId: added.item._id, quantity: 1 });
    await inventory.addStock(stockInput({ itemId: added.item._id, item: undefined, quantity: 3, expiryDate: '2026-12-01' }));
    const lows = (await repos.reminders.listByItem(USER_ID, added.item._id)).filter((reminder) => reminder.type === 'LOW_STOCK');
    assert(lows.some((reminder) => reminder.status === 'RESOLVED'), 'low stock resolved');
  }],

  ['T-P4-A11 low stock creates a new reminder after recovery and later drop', async () => {
    const { repos, inventory } = createContext();
    const added = await inventory.addStock(stockInput({ item: milkItem({ lowStockThreshold: 2 }), quantity: 3, expiryDate: '2026-12-01' }));
    await inventory.consumeStock({ itemId: added.item._id, quantity: 1 });
    await inventory.addStock(stockInput({ itemId: added.item._id, item: undefined, quantity: 3, expiryDate: '2026-12-01' }));
    await inventory.consumeStock({ itemId: added.item._id, quantity: 3 });
    const lows = (await repos.reminders.listByItem(USER_ID, added.item._id)).filter((reminder) => reminder.type === 'LOW_STOCK');
    assertEqual(lows.length, 2, 'second low stock cycle created');
    assert(lows.some((reminder) => reminder.status === 'ACTIVE'), 'new low stock active');
  }],

  ['T-P4-A12 zero stock reminder is separate from restock item', async () => {
    const { repos, inventory } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 1, expiryDate: '2026-12-01' }));
    await inventory.consumeStock({ itemId: added.item._id, quantity: 1 });
    const reminders = await repos.reminders.listByItem(USER_ID, added.item._id);
    assert(reminders.some((reminder) => reminder.type === 'ZERO_STOCK' && reminder.status === 'ACTIVE'), 'zero stock active');
    assertEqual((await repos.restockItems.listByUser(USER_ID)).length, 0, 'restock not automatic without user choice');
  }],

  ['T-P4-A13 manual restock creates NEEDED restock item', async () => {
    const { repos, inventory, reminders } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 1, expiryDate: '2026-12-01' }));
    await inventory.consumeStock({ itemId: added.item._id, quantity: 1 });
    const restock = await reminders.addToRestock(added.item._id);
    assertEqual(restock.status, 'NEEDED', 'restock needed');
    const zero = (await repos.reminders.listByItem(USER_ID, added.item._id)).find((reminder) => reminder.type === 'ZERO_STOCK');
    assert(zero, 'zero stock reminder remains separate');
  }],

  ['T-P4-A14 addToRestock is idempotent for same item while needed', async () => {
    const { repos, inventory, reminders } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 1, expiryDate: '2026-12-01' }));
    await inventory.consumeStock({ itemId: added.item._id, quantity: 1 });
    const first = await reminders.addToRestock(added.item._id);
    const second = await reminders.addToRestock(added.item._id);
    assertEqual(first._id, second._id, 'same needed restock returned');
    assertEqual((await repos.restockItems.listByUser(USER_ID)).filter((item) => item.status === 'NEEDED').length, 1, 'one needed restock');
  }],

  ['T-P4-A15 addStock completes needed restock and resolves zero stock', async () => {
    const { repos, inventory, reminders } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 1, expiryDate: '2026-12-01' }));
    await inventory.consumeStock({ itemId: added.item._id, quantity: 1 });
    await reminders.addToRestock(added.item._id);
    await inventory.addStock(stockInput({ itemId: added.item._id, item: undefined, quantity: 2, expiryDate: '2026-12-01' }));
    const zero = (await repos.reminders.listByItem(USER_ID, added.item._id)).filter((reminder) => reminder.type === 'ZERO_STOCK');
    assert(zero.some((reminder) => reminder.status === 'RESOLVED'), 'zero stock resolved');
    const restocks = await repos.restockItems.listByUser(USER_ID);
    assert(restocks.some((item) => item.status === 'PURCHASED'), 'restock purchased');
  }],

  ['T-P4-A16 dismissRestock removes item from needed restock list', async () => {
    const { repos, inventory, reminders } = createContext();
    const added = await inventory.addStock(stockInput({ quantity: 1, expiryDate: '2026-12-01' }));
    await inventory.consumeStock({ itemId: added.item._id, quantity: 1 });
    const restock = await reminders.addToRestock(added.item._id);
    await reminders.dismissRestock(restock._id);
    const needed = await repos.restockItems.findNeededByItem(USER_ID, added.item._id);
    assertEqual(needed, null, 'no needed restock after dismiss');
    const all = await repos.restockItems.listByUser(USER_ID);
    assert(all.some((item) => item.status === 'DISMISSED'), 'dismissed restock retained as history');
  }],

  ['T-P5-A01 category share counts SKUs instead of quantities', async () => {
    const { repos } = createContext();
    await seedCategory(repos, 'cat_food', '食品');
    await seedCategory(repos, 'cat_tool', '工具');
    await seedItem(repos, 'item_milk', { categoryId: 'cat_food', unit: 'box' });
    await seedItem(repos, 'item_rice', { categoryId: 'cat_food', unit: 'kg' });
    await seedItem(repos, 'item_tool', { categoryId: 'cat_tool', unit: 'piece' });
    await seedBatch(repos, 'batch_milk', 'item_milk', { quantity: 2 });
    await seedBatch(repos, 'batch_rice', 'item_rice', { quantity: 1000 });
    await seedBatch(repos, 'batch_tool', 'item_tool', { quantity: 1 });
    const overview = await statistics(repos).getAnalysisOverview();
    const food = overview.categorySkuDistribution.find((row) => row.key === 'cat_food');
    assertEqual(food?.count, 2, 'food SKU count');
    assertEqual(food?.percent, 66.7, 'food SKU percent');
  }],

  ['T-P5-A02 expiry distribution counts positive batches only', async () => {
    const { repos } = createContext();
    await seedItem(repos, 'item_expiry');
    await seedBatch(repos, 'batch_expired', 'item_expiry', { quantity: 1, expiryDate: '2026-10-01' });
    await seedBatch(repos, 'batch_week', 'item_expiry', { quantity: 1, expiryDate: '2026-10-05' });
    await seedBatch(repos, 'batch_unknown', 'item_expiry', { quantity: 1, expiryDate: UNKNOWN_EXPIRY_DATE });
    await seedBatch(repos, 'batch_empty', 'item_expiry', { quantity: 0, expiryDate: '2026-10-01' });
    const overview = await statistics(repos).getAnalysisOverview();
    assertEqual(overview.expiryBatchDistribution.find((row) => row.key === 'EXPIRED')?.count, 1, 'expired batch count');
    assertEqual(overview.expiryBatchDistribution.find((row) => row.key === 'DAYS_0_7')?.count, 1, '7 day batch count');
    assertEqual(overview.expiryBatchDistribution.find((row) => row.key === 'NO_EXPIRY')?.count, 1, 'unknown expiry batch count');
    assertEqual(overview.summary.positiveBatchCount, 3, 'positive batch count excludes zero');
  }],

  ['T-P5-A03 stock trend uses positive SKU count, not mixed quantity sum', async () => {
    const { repos } = createContext();
    await seedItem(repos, 'item_milk', { unit: 'box' });
    await seedItem(repos, 'item_rice', { unit: 'kg' });
    await seedBatch(repos, 'batch_milk', 'item_milk', { quantity: 1 });
    await seedBatch(repos, 'batch_rice', 'item_rice', { quantity: 1000 });
    const overview = await statistics(repos).getAnalysisOverview({ range: '7d' });
    assertEqual(overview.summary.positiveSkuCount, 2, 'positive SKU count');
    assertEqual(overview.stockTrend[overview.stockTrend.length - 1].stockSkuCount, 2, 'latest stock trend SKU count');
  }],

  ['T-P5-A04 transaction trend counts operations and deduplicates multi-batch consume', async () => {
    const { repos } = createContext();
    await seedItem(repos, 'item_milk');
    await seedBatch(repos, 'batch_a', 'item_milk', { quantity: 1 });
    await seedBatch(repos, 'batch_b', 'item_milk', { quantity: 1 });
    await seedTransaction(repos, 'tx_add', 'item_milk', { batchId: 'batch_a', type: 'ADD', quantity: 2, operationId: 'op_add' });
    await seedTransaction(repos, 'tx_consume_a', 'item_milk', { batchId: 'batch_a', type: 'CONSUME', quantity: -1, reason: 'USED', operationId: 'op_consume' });
    await seedTransaction(repos, 'tx_consume_b', 'item_milk', { batchId: 'batch_b', type: 'CONSUME', quantity: -1, reason: 'USED', operationId: 'op_consume' });
    const overview = await statistics(repos).getAnalysisOverview({ range: '7d' });
    const todayPoint = overview.transactionTrend.find((point) => point.date === '2026-10-03');
    assertEqual(todayPoint?.addOperationCount, 1, 'one add operation');
    assertEqual(todayPoint?.consumeOperationCount, 1, 'one consume operation after dedupe');
  }],

  ['T-P5-A05 time range excludes operations outside selected window', async () => {
    const { repos } = createContext();
    await seedItem(repos, 'item_milk');
    await seedBatch(repos, 'batch_milk', 'item_milk', { quantity: 2 });
    await seedTransaction(repos, 'tx_old', 'item_milk', { createdAt: Date.UTC(2026, 8, 25), operationId: 'op_old' });
    await seedTransaction(repos, 'tx_today', 'item_milk', { createdAt: Date.UTC(2026, 9, 3), operationId: 'op_today' });
    const week = await statistics(repos).getAnalysisOverview({ range: '7d' });
    const month = await statistics(repos).getAnalysisOverview({ range: '30d' });
    assertEqual(sumTrend(week.transactionTrend, 'addOperationCount'), 1, '7 day trend excludes old add');
    assertEqual(sumTrend(month.transactionTrend, 'addOperationCount'), 2, '30 day trend includes old add');
  }],

  ['T-P5-A06 empty analysis has stable zero values and no NaN percent', async () => {
    const { repos } = createContext();
    const overview = await statistics(repos).getAnalysisOverview({ range: '7d' });
    assert(overview.empty, 'overview is empty');
    assertEqual(overview.summary.skuCount, 0, 'empty SKU count');
    assert(overview.expiryBatchDistribution.every((row) => row.percent === 0), 'empty percentages are zero');
  }],

  ['T-P5-A07 no-expiry batches are grouped separately', async () => {
    const { repos } = createContext();
    await seedItem(repos, 'item_no_expiry');
    await seedBatch(repos, 'batch_no_expiry', 'item_no_expiry', { expiryDate: UNKNOWN_EXPIRY_DATE, quantity: 1 });
    const overview = await statistics(repos).getAnalysisOverview();
    assertEqual(overview.expiryBatchDistribution.find((row) => row.key === 'NO_EXPIRY')?.count, 1, 'no expiry count');
  }],

  ['T-P5-A08 single category share renders as 100 percent', async () => {
    const { repos } = createContext();
    await seedCategory(repos, 'cat_food', '食品');
    await seedItem(repos, 'item_only', { categoryId: 'cat_food' });
    const overview = await statistics(repos).getAnalysisOverview();
    assertEqual(overview.categorySkuDistribution[0].percent, 100, 'single category percent');
  }],

  ['T-P5-A09 inventory value uses purchasePrice as unit price', async () => {
    const { repos } = createContext();
    await seedItem(repos, 'item_priced');
    await seedBatch(repos, 'batch_priced', 'item_priced', { quantity: 2, purchasePrice: 12.5 });
    const overview = await statistics(repos).getAnalysisOverview();
    assertEqual(overview.valueSummary.status, 'CALCULATED', 'value summary status');
    assertEqual(overview.valueSummary.totalValue, 25, 'unit price value');
    assertEqual(overview.valueSummary.pricedBatchCount, 1, 'priced batch coverage count');
  }],

  ['T-P5-A10 summary separates low stock, zero stock, and restock counts', async () => {
    const { repos } = createContext();
    await seedItem(repos, 'item_low', { lowStockThreshold: 2 });
    await seedItem(repos, 'item_zero');
    await seedBatch(repos, 'batch_low', 'item_low', { quantity: 1 });
    await seedBatch(repos, 'batch_zero', 'item_zero', { quantity: 0 });
    await seedRestock(repos, 'restock_zero', 'item_zero');
    const overview = await statistics(repos).getAnalysisOverview();
    assertEqual(overview.summary.lowStockItemCount, 1, 'low stock item count');
    assertEqual(overview.summary.zeroStockItemCount, 1, 'zero stock item count');
    assertEqual(overview.summary.restockNeededCount, 1, 'restock needed count');
  }],

  ['T-P6-A01 standard Excel valid row parses', async () => {
    const { repos } = createContext();
    const preview = await importExport(repos).previewExcelImport({ text: excelText([['牛奶', '食品', '', '', '6', '盒', '冷藏室', '', '', '', '', '', '', '', '', '', '']]) });
    assertEqual(preview.validRows, 1, 'valid import rows');
    assertEqual(preview.rows[0].quantity, 6, 'parsed quantity');
  }],

  ['T-P6-A02 missing item name is invalid', async () => {
    const { repos } = createContext();
    const preview = await importExport(repos).previewExcelImport({ text: excelText([['', '食品', '', '', '6', '盒', '冷藏室', '', '', '', '', '', '', '', '', '', '']]) });
    assertEqual(preview.errorRows, 1, 'missing name error count');
  }],

  ['T-P6-A03 missing unit defaults to 个', async () => {
    const { repos } = createContext();
    const preview = await importExport(repos).previewExcelImport({ text: excelText([['牛奶', '食品', '', '', '6', '', '冷藏室', '', '', '', '', '', '', '', '', '', '']]) });
    assertEqual(preview.rows[0].item?.unit, '个', 'default unit');
  }],

  ['T-P6-A04 invalid quantities fail', async () => {
    const { repos } = createContext();
    const preview = await importExport(repos).previewExcelImport({
      text: excelText([
        ['零', '食品', '', '', '0', '盒', '冷藏室', '', '', '', '', '', '', '', '', '', ''],
        ['负数', '食品', '', '', '-1', '盒', '冷藏室', '', '', '', '', '', '', '', '', '', ''],
        ['文本', '食品', '', '', 'abc', '盒', '冷藏室', '', '', '', '', '', '', '', '', '', ''],
      ]),
    });
    assertEqual(preview.errorRows, 3, 'invalid quantity rows');
  }],

  ['T-P6-A05 date parsing keeps string dates stable', async () => {
    const { repos } = createContext();
    const preview = await importExport(repos).previewExcelImport({ text: excelText([['牛奶', '食品', '', '', '6', '盒', '冷藏室', '2026-10-10', '', '', '', '2026-10-20', '', '', '', '', '']]) });
    assertEqual(preview.rows[0].purchaseDate, '2026-10-10', 'purchase date');
    assertEqual(preview.rows[0].expiryDate, '2026-10-20', 'expiry date');
  }],

  ['T-P6-A06 conflicting production shelf life and expiry date is invalid', async () => {
    const { repos } = createContext();
    const preview = await importExport(repos).previewExcelImport({ text: excelText([['牛奶', '食品', '', '', '6', '盒', '冷藏室', '', '2026-10-01', '7', 'DAY', '2026-10-20', '', '', '', '', '']]) });
    assertEqual(preview.errorRows, 1, 'date conflict row');
  }],

  ['T-P6-A07 existing category is reused', async () => {
    const { repos } = createContext();
    await seedCategory(repos, 'cat_food', '食品');
    const preview = await importExport(repos).previewExcelImport({ text: excelText([['牛奶', '食品', '', '', '6', '盒', '冷藏室', '', '', '', '', '', '', '', '', '', '']]) });
    assertEqual(preview.creates.categoryNames.includes('食品'), false, 'existing category not created');
  }],

  ['T-P6-A08 new category is surfaced and created', async () => {
    const { repos } = createContext();
    const service = importExport(repos);
    const preview = await service.previewExcelImport({ importOperationId: 'import-cat', text: excelText([['猫粮', '宠物用品', '', '', '2', '袋', '柜子', '', '', '', '', '', '', '', '', '', '']]) });
    assert(preview.creates.categoryNames.includes('宠物用品'), 'new category surfaced');
    await service.commitExcelImport(preview);
    assert((await repos.categories.listByUser(USER_ID)).some((category) => category.name === '宠物用品'), 'new category created');
  }],

  ['T-P6-A09 item matching does not merge same name with different specification', async () => {
    const { repos } = createContext();
    await seedCategory(repos, 'cat_food', '食品');
    await seedItem(repos, 'item_coke_330', { name: '可乐', specification: '330ml', unit: '瓶' });
    const preview = await importExport(repos).previewExcelImport({ text: excelText([['可乐', '食品', '', '2L', '1', '瓶', '冷藏室', '', '', '', '', '', '', '', '', '', '']]) });
    assertEqual(preview.creates.itemCount, 1, 'same name different spec creates new item');
  }],

  ['T-P6-A10 batch merge reuses addStock merge rule', async () => {
    const { repos } = createContext();
    const service = importExport(repos);
    const first = await service.previewExcelImport({ importOperationId: 'import-merge-1', text: excelText([['牛奶', '食品', '', '', '2', '盒', '冷藏室', '2026-10-01', '', '', '', '2026-10-20', '', '', '', '', '']]) });
    await service.commitExcelImport(first);
    const second = await service.previewExcelImport({ importOperationId: 'import-merge-2', text: excelText([['牛奶', '食品', '', '', '3', '盒', '冷藏室', '2026-10-01', '', '', '', '2026-10-20', '', '', '', '', '']]) });
    const result = await service.commitExcelImport(second);
    const batches = await repos.batches.listByUser(USER_ID);
    assertEqual(batches.length, 1, 'same batch key merged');
    assertEqual(batches[0].quantity, 5, 'merged quantity');
    assertEqual(result.mergedBatches, 1, 'merged batch report');
  }],

  ['T-P6-A11 Excel import creates ADD transaction', async () => {
    const { repos } = createContext();
    const service = importExport(repos);
    const preview = await service.previewExcelImport({ importOperationId: 'import-add-tx', text: excelText([['牛奶', '食品', '', '', '2', '盒', '冷藏室', '', '', '', '', '', '', '', '', '', '']]) });
    await service.commitExcelImport(preview);
    const txs = await repos.transactions.listByUser(USER_ID);
    assert(txs.some((tx) => tx.type === 'ADD' && tx.note?.includes('Excel导入')), 'ADD import transaction');
  }],

  ['T-P6-A12 duplicate importOperationId is idempotent', async () => {
    const { repos } = createContext();
    const service = importExport(repos);
    const preview = await service.previewExcelImport({ importOperationId: 'import-idempotent', text: excelText([['牛奶', '食品', '', '', '2', '盒', '冷藏室', '', '', '', '', '', '', '', '', '', '']]) });
    await service.commitExcelImport(preview);
    await service.commitExcelImport(preview);
    const batches = await repos.batches.listByUser(USER_ID);
    const txs = await repos.transactions.listByUser(USER_ID);
    assertEqual(batches[0].quantity, 2, 'idempotent quantity');
    assertEqual(txs.length, 1, 'idempotent transaction count');
  }],

  ['T-P6-A13 JSON export includes core collections', async () => {
    const { repos } = createContext();
    await seedCategory(repos, 'cat_food', '食品');
    await seedItem(repos, 'item_milk');
    await seedBatch(repos, 'batch_milk', 'item_milk');
    await seedTransaction(repos, 'tx_milk', 'item_milk', { batchId: 'batch_milk' });
    const backup = await importExport(repos).exportBackup();
    assertEqual(backup.schemaVersion, 1, 'schema version');
    assertEqual(backup.items.length, 1, 'backup items');
    assertEqual(backup.batches.length, 1, 'backup batches');
    assertEqual(backup.transactions.length, 1, 'backup transactions');
  }],

  ['T-P6-A14 JSON restore replaces current data', async () => {
    const { repos } = createContext();
    await seedCategory(repos, 'cat_food', '食品');
    await seedItem(repos, 'item_a', { name: 'A' });
    const service = importExport(repos);
    const backup = await service.exportBackup();
    await seedItem(repos, 'item_b', { name: 'B' });
    await service.restoreBackup(backup);
    const items = await repos.items.listByUser(USER_ID);
    assert(items.some((item) => item._id === 'item_a'), 'restored item A');
    assert(!items.some((item) => item._id === 'item_b'), 'current item B replaced');
  }],

  ['T-P6-A15 newer backup version is rejected', async () => {
    const { repos } = createContext();
    const backup = await importExport(repos).exportBackup();
    const validation = importExport(repos).validateBackup({ ...backup, schemaVersion: 999 });
    assert(!validation.valid, 'new version invalid');
  }],

  ['T-P6-A16 damaged JSON is rejected before restore', async () => {
    const { repos } = createContext();
    const validation = importExport(repos).validateBackup({ schemaVersion: 1, items: 'bad' });
    assert(!validation.valid, 'damaged backup invalid');
  }],

  ['T-P6-A17 backup reference integrity is checked', async () => {
    const { repos } = createContext();
    const backup = await importExport(repos).exportBackup();
    const validation = importExport(repos).validateBackup({ ...backup, batches: [{ _id: 'batch_bad', itemId: 'missing', locationId: '', quantity: 1 }] });
    assert(!validation.valid, 'bad reference invalid');
  }],

  ['T-P6-A18 failed restore validation leaves current data unchanged', async () => {
    const { repos } = createContext();
    await seedItem(repos, 'item_current', { name: 'Current' });
    const backup = await importExport(repos).exportBackup();
    await assertRejects(() => importExport(repos).restoreBackup({ ...backup, schemaVersion: 999 }), 'VALIDATION_ERROR', 'restore should reject bad version');
    assertEqual((await repos.items.listByUser(USER_ID)).length, 1, 'current data unchanged');
  }],
];

async function main(): Promise<void> {
  for (const [name, test] of tests) {
    await test();
    console.log(`ok - ${name}`);
  }
  console.log(`${tests.length} tests passed`);
}

void main().catch((error) => {
  console.error(error);
  throw error;
});

