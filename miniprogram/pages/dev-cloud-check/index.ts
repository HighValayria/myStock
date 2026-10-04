/// <reference path="../../types/wechat.d.ts" />

interface DevCloudCheckData {
  running: boolean;
  output: string;
}

interface DevCloudCheckPage {
  setData(data: Partial<DevCloudCheckData>): void;
}

interface CloudFunctionResult<T> {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

interface AddStockResult {
  item: { _id: string };
  batch: { _id: string; quantity: number };
  transaction: { _id: string };
}

interface ConsumeStockResult {
  affectedBatches: Array<{ _id: string; quantity: number }>;
  transactions: Array<{ _id: string }>;
}

interface AdjustStockResult {
  batch: { _id: string; quantity: number };
  transaction: { _id: string } | null;
  diff: number;
}

interface CleanupResult {
  itemId: string;
  removed: Record<string, number>;
}

function append(lines: string[], line: string): void {
  lines.push(line);
}

function assertCloud(): NonNullable<typeof wx.cloud> {
  if (!wx.cloud) throw new Error('wx.cloud is not available');
  return wx.cloud;
}

async function callInventoryWrite<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const cloud = assertCloud();
  const response = await cloud.callFunction({
    name: 'inventoryWrite',
    data: { action, payload },
  });
  const result = response.result as CloudFunctionResult<T> | undefined;
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

Page({
  data: {
    running: false,
    output: 'Tap Run Cloud Check to verify Cloud Function transaction integration.',
  } as DevCloudCheckData,

  async runCloudCheck(this: DevCloudCheckPage) {
    const lines: string[] = [];
    let itemIdForCleanup = '';
    this.setData({ running: true, output: 'Running...' });

    try {
      const cloud = assertCloud();
      cloud.init({ traceUser: true });
      append(lines, 'Cloud initialized');

      const openIdResponse = await cloud.callFunction({ name: 'getOpenId' });
      const openid = (openIdResponse.result as { openid?: string } | undefined)?.openid;
      if (!openid) throw new Error('getOpenId returned empty openid');
      append(lines, `Current openid: ${openid}`);

      const suffix = Date.now().toString(36);
      const addOperationId = `dev-add-${suffix}`;
      const consumeOperationId = `dev-consume-${suffix}`;
      const adjustOperationId = `dev-adjust-${suffix}`;

      append(lines, `addStock operationId: ${addOperationId}`);
      const addResult = await callInventoryWrite<AddStockResult>('addStock', {
        item: {
          name: `dev-cloud-item-${suffix}`,
          categoryId: 'dev_category',
          unit: 'piece',
          lowStockThreshold: 1,
          expiryWarningDays: 7,
        },
        quantity: 3,
        locationId: 'dev_location',
        purchaseDate: '2026-10-03',
        expiryDate: '2026-10-20',
        operationId: addOperationId,
      });
      itemIdForCleanup = addResult.item._id;
      append(lines, `Item ID: ${addResult.item._id}`);
      append(lines, `Batch after add: ${addResult.batch._id}, quantity=${addResult.batch.quantity}`);
      append(lines, `ADD Transaction: ${addResult.transaction._id}`);

      append(lines, `consumeStock operationId: ${consumeOperationId}`);
      const consumeResult = await callInventoryWrite<ConsumeStockResult>('consumeStock', {
        itemId: addResult.item._id,
        quantity: 1,
        operationId: consumeOperationId,
      });
      append(lines, `Batch after consume: ${consumeResult.affectedBatches.map((batch) => `${batch._id}:${batch.quantity}`).join(', ')}`);
      append(lines, `CONSUME Transactions: ${consumeResult.transactions.map((tx) => tx._id).join(', ')}`);

      const targetBatchId = consumeResult.affectedBatches[0]?._id ?? addResult.batch._id;
      append(lines, `adjustStock operationId: ${adjustOperationId}`);
      const adjustResult = await callInventoryWrite<AdjustStockResult>('adjustStock', {
        batchId: targetBatchId,
        actualQuantity: 1,
        operationId: adjustOperationId,
      });
      append(lines, `Batch after adjust: ${adjustResult.batch._id}, quantity=${adjustResult.batch.quantity}, diff=${adjustResult.diff}`);
      append(lines, `ADJUST Transaction: ${adjustResult.transaction?._id ?? 'none'}`);

      const db = cloud.database();
      const batchQuery = await db.collection('batches').where({ itemId: addResult.item._id }).get();
      const txQuery = await db.collection('transactions').where({ itemId: addResult.item._id }).get();
      append(lines, `Readback batches: ${(batchQuery.data ?? []).length}`);
      append(lines, `Readback transactions: ${(txQuery.data ?? []).length}`);
      append(lines, 'Mini Program -> Cloud Function -> server transaction -> Cloud Database check passed');
      append(lines, await cleanupDevItem(addResult.item._id));
    } catch (error) {
      append(lines, `FAILED: ${error instanceof Error ? error.message : String(error)}`);
      if (itemIdForCleanup) append(lines, await cleanupDevItem(itemIdForCleanup));
    }

    this.setData({ running: false, output: lines.join('\n') });
  },
});
