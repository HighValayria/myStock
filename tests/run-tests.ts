import { createMemoryRepositories } from '../miniprogram/repositories';
import { InventoryService, ReminderService } from '../miniprogram/services';
import type { InventoryMutationClient } from '../miniprogram/services';
import { InventoryError } from '../miniprogram/utils/errors';
import { resetIdSequenceForTests } from '../miniprogram/utils/id';
import { DEFAULT_UNIT, UNKNOWN_EXPIRY_DATE, calculateExpiryDateFromShelfLife, parseNonNegativeNumber, parsePositiveNumber, resolveExpiryDate } from '../miniprogram/utils/phase2-form';
import { expiryStatusLabel, formatRemainingDays, transactionQuantityText, transactionTypeLabel, visibleExpiryDate } from '../miniprogram/utils/phase3-view';
import type { AddStockInput, CreateItemInput } from '../miniprogram/models';

interface TestContext {
  repos: ReturnType<typeof createMemoryRepositories>;
  inventory: InventoryService;
  reminders: ReminderService;
}

const USER_ID = 'test-user';
const TODAY = new Date('2026-10-03T00:00:00.000Z');

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

