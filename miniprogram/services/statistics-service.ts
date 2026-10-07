import type { Batch, Category, Item, RestockItem, Transaction } from '../models';
import type { InventoryRepositories } from '../repositories';
import { dateOnlyToUtcMs, getEffectiveExpiryDate, getRemainingDays, toDateOnly } from '../utils/date';
import { UNKNOWN_EXPIRY_DATE } from '../utils/phase2-form';

export type AnalysisRange = '7d' | '30d' | '90d' | 'all';

export interface AnalysisCountSlice {
  key: string;
  label: string;
  count: number;
  percent: number;
}

export interface AnalysisTrendPoint {
  date: string;
  label: string;
  stockSkuCount: number;
  addOperationCount: number;
  consumeOperationCount: number;
}

export interface AnalysisValueSummary {
  status: 'BLOCKED_PRICE_SEMANTICS';
  label: string;
  message: string;
  pricedBatchCount: number;
  positiveBatchCount: number;
  coveragePercent: number;
}

export interface AnalysisOverview {
  generatedAt: number;
  range: AnalysisRange;
  rangeLabel: string;
  summary: {
    skuCount: number;
    positiveSkuCount: number;
    batchCount: number;
    positiveBatchCount: number;
    expiringBatchCount: number;
    expiredBatchCount: number;
    lowStockItemCount: number;
    zeroStockItemCount: number;
    restockNeededCount: number;
  };
  categorySkuDistribution: AnalysisCountSlice[];
  expiryBatchDistribution: AnalysisCountSlice[];
  stockTrend: AnalysisTrendPoint[];
  transactionTrend: AnalysisTrendPoint[];
  valueSummary: AnalysisValueSummary;
  empty: boolean;
}

interface StatisticsServiceOptions {
  userId: string;
  now?: () => Date;
}

interface InventorySnapshot {
  items: Item[];
  batches: Batch[];
  categories: Category[];
  restocks: RestockItem[];
  transactions: Transaction[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EXPIRY_BUCKETS: Array<{ key: string; label: string }> = [
  { key: 'EXPIRED', label: '已过期' },
  { key: 'DAYS_0_7', label: '7 天内' },
  { key: 'DAYS_8_30', label: '8-30 天' },
  { key: 'DAYS_31_90', label: '31-90 天' },
  { key: 'DAYS_90_PLUS', label: '90 天以上' },
  { key: 'NO_EXPIRY', label: '无到期日' },
];

function addDays(dateText: string, diff: number): string {
  return toDateOnly(new Date(dateOnlyToUtcMs(dateText) + diff * MS_PER_DAY));
}

function dayKeyFromMs(value: number): string {
  return toDateOnly(new Date(value));
}

function endOfDayMs(dateText: string): number {
  return dateOnlyToUtcMs(dateText) + MS_PER_DAY - 1;
}

function safePercent(count: number, total: number): number {
  if (total <= 0 || count <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function rangeLabel(range: AnalysisRange): string {
  if (range === '7d') return '近 7 天';
  if (range === '30d') return '近 30 天';
  if (range === '90d') return '近 90 天';
  return '全部';
}

function normalizeRange(value?: string): AnalysisRange {
  return value === '7d' || value === '30d' || value === '90d' || value === 'all' ? value : '30d';
}

function buildDateRange(range: AnalysisRange, today: string, transactions: Transaction[]): string[] {
  if (range !== 'all') {
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    return Array.from({ length: days }, (_, index) => addDays(today, index - days + 1));
  }
  const firstTxDate = transactions.length
    ? transactions.reduce((first, tx) => Math.min(first, tx.createdAt), transactions[0].createdAt)
    : dateOnlyToUtcMs(today);
  const start = dayKeyFromMs(firstTxDate);
  const dayCount = Math.max(1, Math.floor((dateOnlyToUtcMs(today) - dateOnlyToUtcMs(start)) / MS_PER_DAY) + 1);
  return Array.from({ length: dayCount }, (_, index) => addDays(start, index));
}

function categorySkuDistribution(items: Item[], categories: Category[]): AnalysisCountSlice[] {
  const names = new Map(categories.map((category) => [category._id, category.name]));
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.categoryId || '__uncategorized__';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({
      key,
      label: key === '__uncategorized__' ? '未分类' : names.get(key) || '未分类',
      count,
      percent: safePercent(count, items.length),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-Hans-CN'));
}

function expiryBucket(batch: Batch, today: string): string {
  const expiryDate = getEffectiveExpiryDate(batch);
  if (!expiryDate || expiryDate === UNKNOWN_EXPIRY_DATE) return 'NO_EXPIRY';
  const days = getRemainingDays(expiryDate, today);
  if (days < 0) return 'EXPIRED';
  if (days <= 7) return 'DAYS_0_7';
  if (days <= 30) return 'DAYS_8_30';
  if (days <= 90) return 'DAYS_31_90';
  return 'DAYS_90_PLUS';
}

function expiryBatchDistribution(batches: Batch[], today: string): AnalysisCountSlice[] {
  const positiveBatches = batches.filter((batch) => Number(batch.quantity || 0) > 0);
  const counts = new Map(EXPIRY_BUCKETS.map((bucket) => [bucket.key, 0]));
  for (const batch of positiveBatches) {
    const key = expiryBucket(batch, today);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return EXPIRY_BUCKETS.map((bucket) => {
    const count = counts.get(bucket.key) || 0;
    return { ...bucket, count, percent: safePercent(count, positiveBatches.length) };
  });
}

function totalsByItem(items: Item[], batches: Batch[]): Map<string, number> {
  const totals = new Map(items.map((item) => [item._id, 0]));
  for (const batch of batches) {
    totals.set(batch.itemId, (totals.get(batch.itemId) || 0) + Number(batch.quantity || 0));
  }
  return totals;
}

function stockSkuCountAt(items: Item[], batches: Batch[], transactions: Transaction[], dateText: string): number {
  const totals = totalsByItem(items, batches);
  const pointEnd = endOfDayMs(dateText);
  for (const tx of transactions) {
    if (tx.createdAt <= pointEnd) continue;
    totals.set(tx.itemId, (totals.get(tx.itemId) || 0) - Number(tx.quantity || 0));
  }
  return items.filter((item) => (totals.get(item._id) || 0) > 0).length;
}

function transactionCountsByDay(transactions: Transaction[], dates: string[]): Map<string, { add: number; consume: number }> {
  const dateSet = new Set(dates);
  const counts = new Map(dates.map((date) => [date, { add: 0, consume: 0 }]));
  const seen = new Set<string>();
  for (const tx of transactions) {
    if (tx.type !== 'ADD' && tx.type !== 'CONSUME') continue;
    const date = dayKeyFromMs(tx.createdAt);
    if (!dateSet.has(date)) continue;
    const operationKey = `${tx.type}:${tx.operationId || tx._id}`;
    if (seen.has(operationKey)) continue;
    seen.add(operationKey);
    const bucket = counts.get(date);
    if (!bucket) continue;
    if (tx.type === 'ADD') bucket.add += 1;
    else bucket.consume += 1;
  }
  return counts;
}

function trendLabel(dateText: string): string {
  const [, month, day] = dateText.split('-');
  return `${Number(month)}/${Number(day)}`;
}

function buildTrend(items: Item[], batches: Batch[], transactions: Transaction[], dates: string[]): AnalysisTrendPoint[] {
  const txCounts = transactionCountsByDay(transactions, dates);
  return dates.map((date) => {
    const counts = txCounts.get(date) || { add: 0, consume: 0 };
    return {
      date,
      label: trendLabel(date),
      stockSkuCount: stockSkuCountAt(items, batches, transactions, date),
      addOperationCount: counts.add,
      consumeOperationCount: counts.consume,
    };
  });
}

function valueSummary(batches: Batch[]): AnalysisValueSummary {
  const positiveBatches = batches.filter((batch) => Number(batch.quantity || 0) > 0);
  const pricedBatchCount = positiveBatches.filter((batch) => batch.purchasePrice != null).length;
  return {
    status: 'BLOCKED_PRICE_SEMANTICS',
    label: '暂不计算',
    message: 'purchasePrice 的含义尚未冻结，不能把它当作单价或批次总价计算库存价值。',
    pricedBatchCount,
    positiveBatchCount: positiveBatches.length,
    coveragePercent: safePercent(pricedBatchCount, positiveBatches.length),
  };
}

function buildOverview(snapshot: InventorySnapshot, range: AnalysisRange, today: string, generatedAt: number): AnalysisOverview {
  const totals = totalsByItem(snapshot.items, snapshot.batches);
  const positiveBatches = snapshot.batches.filter((batch) => Number(batch.quantity || 0) > 0);
  const expiringBuckets = expiryBatchDistribution(snapshot.batches, today);
  const dates = buildDateRange(range, today, snapshot.transactions);
  const summary = {
    skuCount: snapshot.items.length,
    positiveSkuCount: snapshot.items.filter((item) => (totals.get(item._id) || 0) > 0).length,
    batchCount: snapshot.batches.length,
    positiveBatchCount: positiveBatches.length,
    expiringBatchCount: expiringBuckets.find((bucket) => bucket.key === 'DAYS_0_7')?.count || 0,
    expiredBatchCount: expiringBuckets.find((bucket) => bucket.key === 'EXPIRED')?.count || 0,
    lowStockItemCount: snapshot.items.filter((item) => {
      const total = totals.get(item._id) || 0;
      return total > 0 && item.lowStockThreshold != null && total <= item.lowStockThreshold;
    }).length,
    zeroStockItemCount: snapshot.items.filter((item) => (totals.get(item._id) || 0) === 0).length,
    restockNeededCount: snapshot.restocks.filter((restock) => restock.status === 'NEEDED').length,
  };
  const trend = buildTrend(snapshot.items, snapshot.batches, snapshot.transactions, dates);
  return {
    generatedAt,
    range,
    rangeLabel: rangeLabel(range),
    summary,
    categorySkuDistribution: categorySkuDistribution(snapshot.items, snapshot.categories),
    expiryBatchDistribution: expiringBuckets,
    stockTrend: trend,
    transactionTrend: trend,
    valueSummary: valueSummary(snapshot.batches),
    empty: snapshot.items.length === 0 && snapshot.batches.length === 0,
  };
}

export class StatisticsService {
  constructor(private readonly repos: InventoryRepositories, private readonly options: StatisticsServiceOptions) {}

  async getAnalysisOverview(input: { range?: AnalysisRange | string } = {}): Promise<AnalysisOverview> {
    const range = normalizeRange(input.range);
    const now = this.options.now ? this.options.now() : new Date();
    const [items, batches, categories, restocks, transactions] = await Promise.all([
      this.repos.items.listByUser(this.options.userId),
      this.repos.batches.listByUser(this.options.userId),
      this.repos.categories.listByUser(this.options.userId),
      this.repos.restockItems.listByUser(this.options.userId),
      this.repos.transactions.listByUser(this.options.userId),
    ]);
    return buildOverview({ items, batches, categories, restocks, transactions }, range, toDateOnly(now), now.getTime());
  }
}
