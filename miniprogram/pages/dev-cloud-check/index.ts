/// <reference path="../../types/wechat.d.ts" />

interface DevCloudCheckData {
  running: boolean;
  output: string;
  knownItemId: string;
  lastCreatedItemId: string;
}

interface DevCloudCheckPage {
  data: DevCloudCheckData;
  setData(data: Partial<DevCloudCheckData>): void;
}

interface CloudFunctionResult<T> {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

interface AddStockResult {
  item: { _id: string };
  batch: { _id: string; quantity: number; expiryDate?: string };
  transaction: { _id: string };
  merged?: boolean;
  idempotent?: boolean;
}

interface ConsumeStockResult {
  affectedBatches: Array<{ _id: string; quantity: number }>;
  transactions: Array<{ _id: string }>;
  idempotent?: boolean;
}

interface AdjustStockResult {
  batch: { _id: string; quantity: number };
  transaction: { _id: string } | null;
  diff: number;
  idempotent?: boolean;
}

interface CleanupResult {
  itemId: string;
  removed: Record<string, number>;
}

interface BatchDoc {
  _id: string;
  itemId: string;
  quantity: number;
  expiryDate: string;
  purchaseDate?: string | null;
}

interface TransactionDoc {
  _id: string;
  itemId: string;
  batchId: string;
  type: string;
  quantity: number;
  operationId?: string;
}

function append(lines: string[], line: string): void {
  lines.push(line);
}

function pass(lines: string[], message: string): void {
  append(lines, `PASS ${message}`);
}

function assertCheck(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertCloud(): NonNullable<typeof wx.cloud> {
  if (!wx.cloud) throw new Error('wx.cloud is not available');
  return wx.cloud;
}

function db() {
  return assertCloud().database();
}

async function callInventoryWriteRaw<T>(action: string, payload: Record<string, unknown>): Promise<CloudFunctionResult<T>> {
  const cloud = assertCloud();
  const response = await cloud.callFunction({
    name: 'inventoryWrite',
    data: { action, payload },
  });
  return response.result as CloudFunctionResult<T>;
}

async function callInventoryWrite<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const result = await callInventoryWriteRaw<T>(action, payload);
  if (!result?.ok) {
    throw new Error(result?.error?.message ?? `inventoryWrite failed: ${action}`);
  }
  return result.data as T;
}

async function cleanupDevItem(itemId: string): Promise<string> {
  try {
    const result = await callInventoryWrite<CleanupResult>('cleanupDevItem', { itemId });
    return `cleanup ok: ${JSON.stringify(result.removed)}`;
  } catch (error) {
    return `cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function getOpenId(): Promise<string> {
  const cloud = assertCloud();
  const response = await cloud.callFunction({ name: 'getOpenId' });
  const openid = (response.result as { openid?: string } | undefined)?.openid;
  if (!openid) throw new Error('getOpenId returned empty openid');
  return openid;
}

async function queryBatches(itemId: string): Promise<BatchDoc[]> {
  const result = await db().collection('batches').where({ itemId }).get();
  return (result.data ?? []) as BatchDoc[];
}

async function queryTransactions(itemId: string): Promise<TransactionDoc[]> {
  const result = await db().collection('transactions').where({ itemId }).get();
  return (result.data ?? []) as TransactionDoc[];
}

async function queryItemById(itemId: string): Promise<unknown[]> {
  const result = await db().collection('items').where({ _id: itemId }).get();
  return result.data ?? [];
}

function devItem(suffix: string, threshold = 1): Record<string, unknown> {
  return {
    name: `dev-cloud-item-${suffix}`,
    categoryId: 'dev_category',
    unit: 'piece',
    lowStockThreshold: threshold,
    expiryWarningDays: 7,
  };
}

async function createBaseStock(suffix: string, quantity = 3, expiryDate = '2026-10-20'): Promise<AddStockResult> {
  return callInventoryWrite<AddStockResult>('addStock', {
    item: devItem(suffix),
    quantity,
    locationId: 'dev_location',
    purchaseDate: '2026-10-03',
    expiryDate,
    operationId: `dev-add-${suffix}`,
  });
}

async function runWithOutput(page: DevCloudCheckPage, title: string, runner: (lines: string[]) => Promise<void>): Promise<void> {
  const lines = [`== ${title} ==`];
  page.setData({ running: true, output: 'Running...' });
  try {
    const cloud = assertCloud();
    cloud.init({ traceUser: true });
    append(lines, 'Cloud initialized');
    append(lines, `Current openid: ${await getOpenId()}`);
    await runner(lines);
  } catch (error) {
    append(lines, `FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
  page.setData({ running: false, output: lines.join('\n') });
}

Page({
  data: {
    running: false,
    output: 'Use these buttons to verify Phase 0 / Phase 1 CloudBase behavior.',
    knownItemId: '',
    lastCreatedItemId: '',
  } as DevCloudCheckData,

  onKnownItemInput(this: DevCloudCheckPage, event: { detail?: { value?: string } }) {
    this.setData({ knownItemId: event.detail?.value ?? '' });
  },

  async runCloudCheck(this: DevCloudCheckPage) {
    await runWithOutput(this, 'Main Chain', async (lines) => {
      let itemIdForCleanup = '';
      try {
        const suffix = Date.now().toString(36);
        const addResult = await createBaseStock(suffix, 3);
        itemIdForCleanup = addResult.item._id;
        append(lines, `Item ID: ${addResult.item._id}`);
        append(lines, `Batch after add: ${addResult.batch._id}, quantity=${addResult.batch.quantity}`);
        append(lines, `ADD Transaction: ${addResult.transaction._id}`);

        const consumeResult = await callInventoryWrite<ConsumeStockResult>('consumeStock', {
          itemId: addResult.item._id,
          quantity: 1,
          operationId: `dev-consume-${suffix}`,
        });
        append(lines, `Batch after consume: ${consumeResult.affectedBatches.map((batch) => `${batch._id}:${batch.quantity}`).join(', ')}`);
        append(lines, `CONSUME Transactions: ${consumeResult.transactions.map((tx) => tx._id).join(', ')}`);

        const targetBatchId = consumeResult.affectedBatches[0]?._id ?? addResult.batch._id;
        const adjustResult = await callInventoryWrite<AdjustStockResult>('adjustStock', {
          batchId: targetBatchId,
          actualQuantity: 1,
          operationId: `dev-adjust-${suffix}`,
        });
        append(lines, `Batch after adjust: ${adjustResult.batch._id}, quantity=${adjustResult.batch.quantity}, diff=${adjustResult.diff}`);
        append(lines, `ADJUST Transaction: ${adjustResult.transaction?._id ?? 'none'}`);

        const batches = await queryBatches(addResult.item._id);
        const transactions = await queryTransactions(addResult.item._id);
        append(lines, `Readback batches: ${batches.length}`);
        append(lines, `Readback transactions: ${transactions.length}`);
        assertCheck(batches.length === 1, 'expected 1 batch');
        assertCheck(transactions.length === 3, 'expected 3 transactions');
        pass(lines, 'main chain is consistent');
      } finally {
        if (itemIdForCleanup) append(lines, await cleanupDevItem(itemIdForCleanup));
      }
    });
  },

  async runIdempotencyTest(this: DevCloudCheckPage) {
    await runWithOutput(this, 'Duplicate operationId', async (lines) => {
      let itemIdForCleanup = '';
      try {
        const suffix = `idem-${Date.now().toString(36)}`;
        const operationId = `dev-add-${suffix}`;
        const payload = {
          item: devItem(suffix),
          quantity: 2,
          locationId: 'dev_location',
          purchaseDate: '2026-10-03',
          expiryDate: '2026-10-20',
          operationId,
        };
        const first = await callInventoryWrite<AddStockResult>('addStock', payload);
        itemIdForCleanup = first.item._id;
        const second = await callInventoryWrite<AddStockResult>('addStock', payload);
        const batches = await queryBatches(first.item._id);
        const transactions = await queryTransactions(first.item._id);
        append(lines, `First batch: ${first.batch._id}, quantity=${first.batch.quantity}`);
        append(lines, `Second response idempotent: ${second.idempotent === true}`);
        append(lines, `Readback batches: ${batches.length}`);
        append(lines, `Readback transactions: ${transactions.length}`);
        assertCheck(batches.length === 1, 'duplicate add should keep 1 batch');
        assertCheck(batches[0].quantity === 2, 'duplicate add should not increase quantity twice');
        assertCheck(transactions.length === 1, 'duplicate add should keep 1 transaction');
        pass(lines, 'same operationId does not double-write');
      } finally {
        if (itemIdForCleanup) append(lines, await cleanupDevItem(itemIdForCleanup));
      }
    });
  },

  async runOverConsumeTest(this: DevCloudCheckPage) {
    await runWithOutput(this, 'Over Consume Failure', async (lines) => {
      let itemIdForCleanup = '';
      try {
        const suffix = `over-${Date.now().toString(36)}`;
        const added = await createBaseStock(suffix, 1);
        itemIdForCleanup = added.item._id;
        const consumeResult = await callInventoryWriteRaw<ConsumeStockResult>('consumeStock', {
          itemId: added.item._id,
          quantity: 99,
          operationId: `dev-consume-${suffix}`,
        });
        append(lines, `consume ok: ${consumeResult.ok}`);
        append(lines, `consume error: ${consumeResult.error?.code ?? consumeResult.error?.message ?? 'none'}`);
        const batches = await queryBatches(added.item._id);
        const transactions = await queryTransactions(added.item._id);
        append(lines, `Batch quantity after failed consume: ${batches[0]?.quantity}`);
        append(lines, `Readback transactions: ${transactions.length}`);
        assertCheck(!consumeResult.ok, 'over consume should fail');
        assertCheck(batches.length === 1 && batches[0].quantity === 1, 'batch quantity should remain unchanged');
        assertCheck(transactions.length === 1, 'failed consume should not create transaction');
        pass(lines, 'over consume fails without half write');
      } finally {
        if (itemIdForCleanup) append(lines, await cleanupDevItem(itemIdForCleanup));
      }
    });
  },

  async runFefoTest(this: DevCloudCheckPage) {
    await runWithOutput(this, 'FEFO Multi Batch', async (lines) => {
      let itemIdForCleanup = '';
      try {
        const suffix = `fefo-${Date.now().toString(36)}`;
        const early = await createBaseStock(suffix, 2, '2026-10-05');
        itemIdForCleanup = early.item._id;
        await callInventoryWrite<AddStockResult>('addStock', {
          itemId: early.item._id,
          quantity: 5,
          locationId: 'dev_location',
          purchaseDate: '2026-10-04',
          expiryDate: '2026-10-20',
          operationId: `dev-add-late-${suffix}`,
        });
        const consumed = await callInventoryWrite<ConsumeStockResult>('consumeStock', {
          itemId: early.item._id,
          quantity: 3,
          operationId: `dev-consume-${suffix}`,
        });
        const batches = (await queryBatches(early.item._id)).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
        append(lines, `Consume transactions: ${consumed.transactions.length}`);
        append(lines, `Batch states: ${batches.map((batch) => `${batch.expiryDate}:${batch.quantity}`).join(', ')}`);
        assertCheck(consumed.transactions.length === 2, 'FEFO consume should create one transaction per affected batch');
        assertCheck(batches.length === 2, 'expected 2 batches');
        assertCheck(batches[0].quantity === 0, 'earliest expiry batch should be consumed first');
        assertCheck(batches[1].quantity === 4, 'later batch should be partially consumed');
        pass(lines, 'FEFO consumes earliest expiry first');
      } finally {
        if (itemIdForCleanup) append(lines, await cleanupDevItem(itemIdForCleanup));
      }
    });
  },

  async runBatchMergeTest(this: DevCloudCheckPage) {
    await runWithOutput(this, 'Batch Merge Rules', async (lines) => {
      let itemIdForCleanup = '';
      try {
        const suffix = `merge-${Date.now().toString(36)}`;
        const first = await createBaseStock(suffix, 2, '2026-10-20');
        itemIdForCleanup = first.item._id;
        const second = await callInventoryWrite<AddStockResult>('addStock', {
          itemId: first.item._id,
          quantity: 3,
          locationId: 'dev_location',
          purchaseDate: '2026-10-03',
          expiryDate: '2026-10-20',
          operationId: `dev-add-same-${suffix}`,
        });
        let batches = await queryBatches(first.item._id);
        append(lines, `Second add merged: ${second.merged === true}`);
        append(lines, `Batches after same expiry add: ${batches.length}, quantity=${batches[0]?.quantity}`);
        assertCheck(batches.length === 1, 'same batch key should merge');
        assertCheck(batches[0].quantity === 5, 'merged batch quantity should be 5');

        await callInventoryWrite<AddStockResult>('addStock', {
          itemId: first.item._id,
          quantity: 1,
          locationId: 'dev_location',
          purchaseDate: '2026-10-03',
          expiryDate: '2026-11-01',
          operationId: `dev-add-different-expiry-${suffix}`,
        });
        batches = await queryBatches(first.item._id);
        append(lines, `Batches after different expiry add: ${batches.length}`);
        assertCheck(batches.length === 2, 'different expiry should create a separate batch');
        pass(lines, 'merge and no-merge rules work in cloud');
      } finally {
        if (itemIdForCleanup) append(lines, await cleanupDevItem(itemIdForCleanup));
      }
    });
  },

  async createIsolationData(this: DevCloudCheckPage) {
    await runWithOutput(this, 'Create Isolation Data', async (lines) => {
      const suffix = `iso-${Date.now().toString(36)}`;
      const added = await createBaseStock(suffix, 1, '2026-10-20');
      this.setData({ lastCreatedItemId: added.item._id, knownItemId: added.item._id });
      append(lines, `Created Item ID: ${added.item._id}`);
      append(lines, 'Use another WeChat account to read this Item ID. Expected result: 0 records.');
      append(lines, 'Return to the owner account and tap Cleanup Known Item when done.');
    });
  },

  async readKnownItem(this: DevCloudCheckPage) {
    await runWithOutput(this, 'Read Known Item', async (lines) => {
      const itemId = this.data.knownItemId.trim();
      if (!itemId) throw new Error('knownItemId is empty');
      const items = await queryItemById(itemId);
      const batches = await queryBatches(itemId);
      const transactions = await queryTransactions(itemId);
      append(lines, `Known Item ID: ${itemId}`);
      append(lines, `Readable items: ${items.length}`);
      append(lines, `Readable batches: ${batches.length}`);
      append(lines, `Readable transactions: ${transactions.length}`);
      append(lines, 'For another WeChat account, expected readable items/batches/transactions are all 0.');
    });
  },

  async cleanupKnownItem(this: DevCloudCheckPage) {
    await runWithOutput(this, 'Cleanup Known Item', async (lines) => {
      const itemId = this.data.knownItemId.trim() || this.data.lastCreatedItemId.trim();
      if (!itemId) throw new Error('knownItemId is empty');
      append(lines, `Known Item ID: ${itemId}`);
      append(lines, await cleanupDevItem(itemId));
    });
  },
});