import { initCloud } from '../config/cloud';
import type { AddStockInput, AdjustStockInput, Batch, ConsumeStockInput, ExpiryStatus, InventoryListItem, ItemDetail, StockStatus, Transaction, UpdateBatchInput, UpdateItemInput } from '../models';
import { createRepositories, type InventoryRepositories } from '../repositories/index';
import { InventoryService } from './inventory-service';
import { CloudFunctionInventoryMutationClient } from './inventory-mutation-client';

interface OpenIdResult {
  openid?: string;
}

interface CloudFunctionResult<T> {
  ok?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
}

export interface Phase2Context {
  userId: string;
  repos: InventoryRepositories;
  inventory: InventoryService;
}

export interface Phase2InventoryRow extends InventoryListItem {
  recentAt: number;
  recentAddAt?: number;
  recentConsumeAt?: number;
  label: string;
  expiryStatuses?: ExpiryStatus[];
  batchCount?: number;
  positiveBatchCount?: number;
  locationIds?: string[];
  locationSummary?: string;
  activeReminderTypes?: string[];
  restockNeeded?: boolean;
}

export interface Phase2CategoryOption {
  id: string;
  name: string;
}

export interface Phase2LocationOption {
  id: string;
  name: string;
  parentId?: string | null;
  label: string;
}

export interface Phase2TaxonomyOptions {
  categories: Phase2CategoryOption[];
  locations: Phase2LocationOption[];
}

export interface Phase3InventoryQuery {
  search?: string;
  positiveOnly?: boolean;
  categoryId?: string;
  locationId?: string;
  expiryStatus?: '' | ExpiryStatus;
  stockStatus?: '' | StockStatus;
  sortBy?: 'nearestExpiry' | 'remainingDays' | 'quantity' | 'recentAdd' | 'recentConsume' | 'name';
  limit?: number;
  offset?: number;
}

export interface Phase3HomeDashboard {
  summary: {
    itemCount: number;
    batchCount: number;
    expiringCount: number;
    expiredCount: number;
    lowStockCount: number;
    zeroStockCount: number;
    restockCount: number;
  };
  alertLines: string[];
  backgroundFacts: Array<{ itemId: string; text: string; lane: number }>;
}

export interface Phase3Batch extends Batch {
  effectiveExpiryDate?: string;
  remainingDays: number;
  expiryStatus: ExpiryStatus;
  locationLabel?: string;
}

export interface Phase3ItemDetail extends Omit<ItemDetail, 'batches' | 'recentTransactions'> {
  categoryName?: string;
  defaultLocationLabel?: string;
  batches: Phase3Batch[];
  recentTransactions: Transaction[];
  locationLabels?: Record<string, string>;
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

async function callCloudFunction<T>(name: string, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  initCloud();
  if (!wx.cloud) throw new Error('wx.cloud is not initialized');
  const response = await wx.cloud.callFunction<CloudFunctionResult<T>>({ name, data: { action, payload } });
  const result = response.result;
  if (!result?.ok) {
    const error = new Error(result?.error?.message || '云服务调用失败') as Error & { code?: string };
    error.code = result?.error?.code;
    throw error;
  }
  return result.data as T;
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

export async function getTaxonomyOptions(): Promise<Phase2TaxonomyOptions> {
  return callCloudFunction<Phase2TaxonomyOptions>('taxonomyManage', 'getOptions');
}

export async function createCategory(name: string): Promise<Phase2CategoryOption> {
  return callCloudFunction<Phase2CategoryOption>('taxonomyManage', 'createCategory', { name });
}

export async function createLocation(name: string): Promise<Phase2LocationOption> {
  return callCloudFunction<Phase2LocationOption>('taxonomyManage', 'createLocation', { name });
}

export async function listInventoryRows(options: Phase3InventoryQuery = {}): Promise<Phase2InventoryRow[]> {
  return callCloudFunction<Phase2InventoryRow[]>('inventoryRead', 'listInventoryRows', {
    search: options.search?.trim() || '',
    positiveOnly: Boolean(options.positiveOnly),
    categoryId: options.categoryId || '',
    locationId: options.locationId || '',
    expiryStatus: options.expiryStatus || '',
    stockStatus: options.stockStatus || '',
    sortBy: options.sortBy || 'nearestExpiry',
    limit: options.limit,
    offset: options.offset || 0,
  });
}

export async function getHomeDashboard(): Promise<Phase3HomeDashboard> {
  return callCloudFunction<Phase3HomeDashboard>('inventoryRead', 'getHomeDashboard');
}

export async function getItemDetail(itemId: string): Promise<Phase3ItemDetail> {
  return callCloudFunction<Phase3ItemDetail>('inventoryRead', 'getItemDetail', { itemId });
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
  return callCloudFunction('inventoryWrite', 'updateItem', { itemId, patch });
}

export async function updateBatch(batchId: string, patch: UpdateBatchInput) {
  return callCloudFunction('inventoryWrite', 'updateBatch', { batchId, patch });
}
