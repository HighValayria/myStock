import { initCloud } from '../config/cloud';
import type { AddStockInput, AdjustStockInput, Batch, ConsumeStockInput, ExpiryStatus, InventoryListItem, Item, ItemDetail, Reminder, RestockItem, StockStatus, Transaction, UpdateBatchInput, UpdateItemInput } from '../models';
import { createRepositories, type InventoryRepositories } from '../repositories/index';
import { InventoryService } from './inventory-service';
import { CloudFunctionInventoryMutationClient } from './inventory-mutation-client';
import type { AnalysisOverview, AnalysisRange } from './statistics-service';

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

export interface Phase4ReminderRow {
  id: string;
  reminder: Reminder;
  item: Item | null;
  batch: Batch | null;
  itemId: string;
  batchId: string | null;
  type: Reminder['type'];
  status: Reminder['status'];
  typeText: string;
  statusText: string;
  title: string;
  meta: string;
  remainingDays: number | null;
  priority: number;
  canView: boolean;
  canDismiss: boolean;
  canPurge?: boolean;
  canAddRestock: boolean;
}

export interface Phase4RestockRow {
  id: string;
  restock: RestockItem;
  item: Item | null;
  itemId: string;
  status: RestockItem['status'];
  statusText: string;
  title: string;
  meta: string;
  canRecordPurchase: boolean;
  canDismiss: boolean;
}

export interface Phase4ReminderCenter {
  reminders: Phase4ReminderRow[];
  restocks: Phase4RestockRow[];
  summary: {
    activeCount: number;
    readCount: number;
    dismissedCount: number;
    resolvedCount: number;
    restockCount: number;
  };
}

export interface Phase4ReminderQuery {
  type?: '' | Reminder['type'];
  status?: 'open' | 'all' | Reminder['status'];
  includeClosedRestock?: boolean;
}

export interface Phase5AnalysisQuery {
  range?: AnalysisRange;
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

function isUnsupportedHomeDashboard(error: unknown): boolean {
  const message = String((error as { message?: string }).message || '');
  return /Unsupported action:\s*getHomeDashboard/i.test(message);
}

function buildFallbackHomeDashboard(rows: Phase2InventoryRow[]): Phase3HomeDashboard {
  const expiringCount = rows.filter((row) => row.expiryStatuses?.includes('EXPIRING') || row.expiryStatus === 'EXPIRING').length;
  const expiredCount = rows.filter((row) => row.expiryStatuses?.includes('EXPIRED') || row.expiryStatus === 'EXPIRED').length;
  const lowStockCount = rows.filter((row) => row.stockStatus === 'LOW').length;
  const zeroStockCount = rows.filter((row) => row.stockStatus === 'ZERO').length;
  const restockCount = rows.filter((row) => row.restockNeeded).length;
  const alertLines: string[] = [];
  if (expiredCount) alertLines.push(`${expiredCount} 件物品已过期`);
  if (expiringCount) alertLines.push(`${expiringCount} 件物品近期临期`);
  if (lowStockCount) alertLines.push(`${lowStockCount} 件物品库存不足`);
  if (zeroStockCount) alertLines.push(`${zeroStockCount} 件物品已经归零`);
  if (!alertLines.length) alertLines.push(rows.length ? '当前没有需要立即处理的库存' : '还没有库存，先记录第一件物品');
  const backgroundFacts = rows
    .filter((row) => row.totalQuantity > 0)
    .slice(0, 12)
    .map((row, index) => ({
      itemId: row.item._id,
      text: `${row.label} · ${row.totalQuantity}${row.item.unit}${row.locationSummary ? ` · ${row.locationSummary}` : ''}`,
      lane: index % 3,
    }));
  return {
    summary: {
      itemCount: rows.length,
      batchCount: rows.reduce((sum, row) => sum + (row.batchCount ?? (row.totalQuantity > 0 ? 1 : 0)), 0),
      expiringCount,
      expiredCount,
      lowStockCount,
      zeroStockCount,
      restockCount,
    },
    alertLines,
    backgroundFacts,
  };
}

export async function getHomeDashboard(): Promise<Phase3HomeDashboard> {
  try {
    return await callCloudFunction<Phase3HomeDashboard>('inventoryRead', 'getHomeDashboard');
  } catch (error) {
    if (!isUnsupportedHomeDashboard(error)) throw error;
    const rows = await listInventoryRows();
    return buildFallbackHomeDashboard(rows);
  }
}

export async function getItemDetail(itemId: string): Promise<Phase3ItemDetail> {
  return callCloudFunction<Phase3ItemDetail>('inventoryRead', 'getItemDetail', { itemId });
}

export async function listReminderCenter(options: Phase4ReminderQuery = {}): Promise<Phase4ReminderCenter> {
  return callCloudFunction<Phase4ReminderCenter>('inventoryRead', 'listReminderCenter', {
    type: options.type || '',
    status: options.status || 'open',
    includeClosedRestock: Boolean(options.includeClosedRestock),
  });
}

export async function getAnalysisOverview(options: Phase5AnalysisQuery = {}): Promise<AnalysisOverview> {
  return callCloudFunction<AnalysisOverview>('inventoryRead', 'getAnalysisOverview', {
    range: options.range || '30d',
  });
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

export async function markReminderRead(reminderId: string) {
  return callCloudFunction('inventoryWrite', 'markReminderRead', { reminderId });
}

export async function dismissReminder(reminderId: string) {
  return callCloudFunction('inventoryWrite', 'dismissReminder', { reminderId });
}

export async function purgeDismissedReminder(reminderId: string) {
  return callCloudFunction('inventoryWrite', 'purgeDismissedReminder', { reminderId });
}

export async function addToRestock(itemId: string) {
  return callCloudFunction('inventoryWrite', 'addToRestock', { itemId });
}

export async function dismissRestock(restockId: string) {
  return callCloudFunction('inventoryWrite', 'dismissRestock', { restockId });
}
