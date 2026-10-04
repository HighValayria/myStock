import { initCloud } from '../config/cloud';
import type { AddStockInput, AdjustStockInput, ConsumeStockInput, InventoryListItem, ItemDetail, UpdateBatchInput, UpdateItemInput } from '../models';
import { createRepositories, type InventoryRepositories } from '../repositories/index';
import { InventoryService } from './inventory-service';
import { CloudFunctionInventoryMutationClient } from './inventory-mutation-client';

interface OpenIdResult {
  openid?: string;
}

export interface Phase2Context {
  userId: string;
  repos: InventoryRepositories;
  inventory: InventoryService;
}

export interface Phase2InventoryRow extends InventoryListItem {
  recentAt: number;
  label: string;
}

let cachedContext: Phase2Context | null = null;

async function getOpenId(): Promise<string> {
  initCloud();
  if (!wx.cloud) throw new Error('wx.cloud is not initialized');
  const response = await wx.cloud.callFunction<OpenIdResult>({ name: 'getOpenId' });
  const openid = response.result?.openid;
  if (!openid) throw new Error('无法获取当前微信用户身份');
  return openid;
}

export async function getPhase2Context(): Promise<Phase2Context> {
  if (cachedContext) return cachedContext;
  const userId = await getOpenId();
  const repos = createRepositories('cloud');
  const inventory = new InventoryService(repos, {
    userId,
    defaultExpiryWarningDays: 7,
    mutationClient: new CloudFunctionInventoryMutationClient(),
    requireMutationClientForWrites: true,
  });
  cachedContext = { userId, repos, inventory };
  return cachedContext;
}

export function resetPhase2ContextForTests(): void {
  cachedContext = null;
}

export async function listInventoryRows(options: { search?: string; positiveOnly?: boolean } = {}): Promise<Phase2InventoryRow[]> {
  const context = await getPhase2Context();
  const rows = await context.inventory.getInventory({ search: options.search?.trim() || undefined });
  const transactions = await context.repos.transactions.listByUser(context.userId);
  const recentAtByItem = new Map<string, number>();
  for (const transaction of transactions) {
    const current = recentAtByItem.get(transaction.itemId) ?? 0;
    if (transaction.createdAt > current) recentAtByItem.set(transaction.itemId, transaction.createdAt);
  }
  return rows
    .filter((row) => !options.positiveOnly || row.totalQuantity > 0)
    .map((row) => ({
      ...row,
      recentAt: recentAtByItem.get(row.item._id) ?? 0,
      label: `${row.item.name}${row.item.specification ? ` ${row.item.specification}` : ''}`,
    }))
    .sort((a, b) => {
      if (b.recentAt !== a.recentAt) return b.recentAt - a.recentAt;
      return a.label.localeCompare(b.label, 'zh-Hans-CN');
    });
}

export async function getItemDetail(itemId: string): Promise<ItemDetail> {
  const context = await getPhase2Context();
  return context.inventory.getItemDetail(itemId);
}

export async function addStock(input: AddStockInput) {
  const context = await getPhase2Context();
  return context.inventory.addStock(input);
}

export async function consumeStock(input: ConsumeStockInput) {
  const context = await getPhase2Context();
  return context.inventory.consumeStock(input);
}

export async function adjustStock(input: AdjustStockInput) {
  const context = await getPhase2Context();
  return context.inventory.adjustStock(input);
}

export async function updateItem(itemId: string, patch: UpdateItemInput) {
  const context = await getPhase2Context();
  return context.inventory.updateItem(itemId, patch);
}

export async function updateBatch(batchId: string, patch: UpdateBatchInput) {
  const context = await getPhase2Context();
  return context.inventory.updateBatch(batchId, patch);
}
