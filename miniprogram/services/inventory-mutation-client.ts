import type { AddStockInput, AddStockResult, AdjustStockInput, AdjustStockResult, ConsumeStockInput, ConsumeStockResult } from '../models';
import { InventoryError } from '../utils/errors';

export interface InventoryMutationClient {
  addStock(input: AddStockInput): Promise<AddStockResult>;
  consumeStock(input: ConsumeStockInput): Promise<ConsumeStockResult>;
  adjustStock(input: AdjustStockInput): Promise<AdjustStockResult>;
}

interface CloudFunctionResult<T> {
  ok: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
}

async function callInventoryWrite<T>(action: string, payload: unknown): Promise<T> {
  if (typeof wx === 'undefined' || !wx.cloud) {
    throw new InventoryError('VALIDATION_ERROR', 'wx.cloud is not initialized');
  }
  const response = await wx.cloud.callFunction<CloudFunctionResult<T>>({
    name: 'inventoryWrite',
    data: { action, payload },
  });
  const result = response.result;
  if (!result || !result.ok) {
    const code = result?.error?.code ?? 'VALIDATION_ERROR';
    throw new InventoryError(code as never, result?.error?.message ?? `inventoryWrite failed: ${action}`);
  }
  return result.data as T;
}

export class CloudFunctionInventoryMutationClient implements InventoryMutationClient {
  addStock(input: AddStockInput): Promise<AddStockResult> {
    return callInventoryWrite<AddStockResult>('addStock', input);
  }

  consumeStock(input: ConsumeStockInput): Promise<ConsumeStockResult> {
    return callInventoryWrite<ConsumeStockResult>('consumeStock', input);
  }

  adjustStock(input: AdjustStockInput): Promise<AdjustStockResult> {
    return callInventoryWrite<AdjustStockResult>('adjustStock', input);
  }
}
