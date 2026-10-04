import { SCHEMA_VERSION } from '../config/collections';
import { initCloud } from '../config/cloud';
import type { AddStockInput, AdjustStockInput, Category, ConsumeStockInput, InventoryListItem, ItemDetail, Location, UpdateBatchInput, UpdateItemInput } from '../models';
import { createRepositories, type InventoryRepositories } from '../repositories/index';
import { createId } from '../utils/id';
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

const DEFAULT_CATEGORIES = ['食品', '护肤品', '日化用品', '其他'];
const DEFAULT_LOCATIONS = ['厨房', '冰箱', '冷藏室', '冷冻室', '浴室柜'];

let cachedContext: Phase2Context | null = null;
let taxonomyEnsured = false;

async function getOpenId(): Promise<string> {
  initCloud();
  if (!wx.cloud) throw new Error('wx.cloud is not initialized');
  const response = await wx.cloud.callFunction<OpenIdResult>({ name: 'getOpenId' });
  const openid = response.result?.openid;
  if (!openid) throw new Error('无法获取当前微信用户身份');
  return openid;
}

function now(): number {
  return Date.now();
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function categoryDoc(userId: string, name: string): Category {
  const time = now();
  return {
    _id: createId('cat'),
    _openid: userId,
    schemaVersion: SCHEMA_VERSION,
    name,
    icon: null,
    expiryWarningDays: null,
    defaultLowStock: null,
    createdAt: time,
    updatedAt: time,
  };
}

function locationDoc(userId: string, name: string): Location {
  const time = now();
  return {
    _id: createId('loc'),
    _openid: userId,
    schemaVersion: SCHEMA_VERSION,
    name,
    parentId: null,
    createdAt: time,
    updatedAt: time,
  };
}

async function ensureDefaultTaxonomy(context: Phase2Context): Promise<void> {
  if (taxonomyEnsured) return;
  const [categories, locations] = await Promise.all([
    context.repos.categories.listByUser(context.userId),
    context.repos.locations.listByUser(context.userId),
  ]);
  const existingCategoryNames = new Set(categories.map((item) => normalizeName(item.name).toLowerCase()));
  const existingLocationNames = new Set(locations.map((item) => normalizeName(item.name).toLowerCase()));
  for (const name of DEFAULT_CATEGORIES) {
    if (!existingCategoryNames.has(name.toLowerCase())) {
      await context.repos.categories.create(categoryDoc(context.userId, name));
    }
  }
  for (const name of DEFAULT_LOCATIONS) {
    if (!existingLocationNames.has(name.toLowerCase())) {
      await context.repos.locations.create(locationDoc(context.userId, name));
    }
  }
  taxonomyEnsured = true;
}

function locationLabel(location: Location, byId: Map<string, Location>): string {
  const names = [location.name];
  let parentId = location.parentId ?? null;
  const seen = new Set<string>([location._id]);
  while (parentId && !seen.has(parentId)) {
    const parent = byId.get(parentId);
    if (!parent) break;
    names.unshift(parent.name);
    seen.add(parent._id);
    parentId = parent.parentId ?? null;
  }
  return names.join(' / ');
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
  taxonomyEnsured = false;
}

export async function getTaxonomyOptions(): Promise<Phase2TaxonomyOptions> {
  const context = await getPhase2Context();
  await ensureDefaultTaxonomy(context);
  const [categories, locations] = await Promise.all([
    context.repos.categories.listByUser(context.userId),
    context.repos.locations.listByUser(context.userId),
  ]);
  const locationById = new Map(locations.map((location) => [location._id, location]));
  return {
    categories: categories
      .map((category) => ({ id: category._id, name: category.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')),
    locations: locations
      .map((location) => ({ id: location._id, name: location.name, parentId: location.parentId, label: locationLabel(location, locationById) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN')),
  };
}

export async function createCategory(name: string): Promise<Phase2CategoryOption> {
  const trimmed = normalizeName(name);
  if (!trimmed) throw new Error('请输入类别名称');
  const context = await getPhase2Context();
  await ensureDefaultTaxonomy(context);
  const existing = (await context.repos.categories.listByUser(context.userId)).find((item) => normalizeName(item.name).toLowerCase() === trimmed.toLowerCase());
  if (existing) return { id: existing._id, name: existing.name };
  const created = await context.repos.categories.create(categoryDoc(context.userId, trimmed));
  return { id: created._id, name: created.name };
}

export async function createLocation(name: string): Promise<Phase2LocationOption> {
  const trimmed = normalizeName(name);
  if (!trimmed) throw new Error('请输入位置名称');
  const context = await getPhase2Context();
  await ensureDefaultTaxonomy(context);
  const existing = (await context.repos.locations.listByUser(context.userId)).find((item) => normalizeName(item.name).toLowerCase() === trimmed.toLowerCase());
  if (existing) return { id: existing._id, name: existing.name, parentId: existing.parentId, label: existing.name };
  const created = await context.repos.locations.create(locationDoc(context.userId, trimmed));
  return { id: created._id, name: created.name, parentId: created.parentId, label: created.name };
}

export async function listInventoryRows(options: { search?: string; positiveOnly?: boolean; categoryId?: string } = {}): Promise<Phase2InventoryRow[]> {
  const context = await getPhase2Context();
  const rows = await context.inventory.getInventory({ search: options.search?.trim() || undefined, categoryId: options.categoryId || undefined });
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