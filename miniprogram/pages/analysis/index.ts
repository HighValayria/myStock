/// <reference path="../../types/wechat.d.ts" />

import type { AnalysisCountSlice, AnalysisOverview, AnalysisRange, AnalysisTrendPoint } from '../../services/statistics-service';
import { mapUserError } from '../../utils/phase2-form';

interface RangeOption {
  key: AnalysisRange;
  label: string;
}

interface StatCard {
  key: string;
  label: string;
  value: number;
  note: string;
}

interface ViewSlice extends AnalysisCountSlice {
  width: number;
  percentText: string;
}

interface ViewTrendPoint extends AnalysisTrendPoint {
  stockHeight: number;
  addHeight: number;
  consumeHeight: number;
}

interface AnalysisPageData {
  loading: boolean;
  error: string;
  selectedRange: AnalysisRange;
  rangeOptions: RangeOption[];
  overview: AnalysisOverview | null;
  statCards: StatCard[];
  categoryRows: ViewSlice[];
  expiryRows: ViewSlice[];
  trendRows: ViewTrendPoint[];
  hasCategoryRows: boolean;
  hasExpiryRows: boolean;
  hasTrendRows: boolean;
  valueCoverageText: string;
}

interface AnalysisPage {
  data: AnalysisPageData;
  setData(data: Partial<AnalysisPageData>): void;
  loadOverview(): Promise<void>;
}

function getPhase2Service(): typeof import('../../services/phase2-ui-service') {
  return require('../../services/phase2-ui-service') as typeof import('../../services/phase2-ui-service');
}

function clampBar(value: number): number {
  return Math.max(8, Math.min(100, value));
}

function viewSlices(rows: AnalysisCountSlice[]): ViewSlice[] {
  return rows
    .filter((row) => row.count > 0)
    .map((row) => ({
      ...row,
      width: clampBar(row.percent),
      percentText: `${row.percent}%`,
    }));
}

function statCards(overview: AnalysisOverview): StatCard[] {
  return [
    { key: 'sku', label: 'SKU', value: overview.summary.skuCount, note: `${overview.summary.positiveSkuCount} 个有库存` },
    { key: 'batch', label: '批次', value: overview.summary.batchCount, note: `${overview.summary.positiveBatchCount} 个有库存` },
    { key: 'expiry', label: '效期风险', value: overview.summary.expiredBatchCount + overview.summary.expiringBatchCount, note: '已过期 + 7天内' },
    { key: 'stock', label: '库存风险', value: overview.summary.lowStockItemCount + overview.summary.zeroStockItemCount, note: '低库存 + 零库存' },
  ];
}

function trendRows(points: AnalysisTrendPoint[]): ViewTrendPoint[] {
  const maxStock = Math.max(1, ...points.map((point) => point.stockSkuCount));
  const maxOps = Math.max(1, ...points.map((point) => point.addOperationCount), ...points.map((point) => point.consumeOperationCount));
  return points.map((point) => ({
    ...point,
    stockHeight: clampBar(Math.round((point.stockSkuCount / maxStock) * 100)),
    addHeight: clampBar(Math.round((point.addOperationCount / maxOps) * 100)),
    consumeHeight: clampBar(Math.round((point.consumeOperationCount / maxOps) * 100)),
  }));
}

function emptyData(): Partial<AnalysisPageData> {
  return {
    overview: null,
    statCards: [],
    categoryRows: [],
    expiryRows: [],
    trendRows: [],
    hasCategoryRows: false,
    hasExpiryRows: false,
    hasTrendRows: false,
    valueCoverageText: '0/0 批次',
  };
}

Page({
  data: {
    loading: false,
    error: '',
    selectedRange: '30d',
    rangeOptions: [
      { key: '7d', label: '7天' },
      { key: '30d', label: '30天' },
      { key: '90d', label: '90天' },
      { key: 'all', label: '全部' },
    ],
    ...emptyData(),
  } as AnalysisPageData,

  onShow(this: AnalysisPage) {
    void this.loadOverview();
  },

  async loadOverview(this: AnalysisPage) {
    this.setData({ loading: true, error: '' });
    try {
      const { getAnalysisOverview } = getPhase2Service();
      const overview = await getAnalysisOverview({ range: this.data.selectedRange });
      const categories = viewSlices(overview.categorySkuDistribution);
      const expiry = viewSlices(overview.expiryBatchDistribution);
      const trends = trendRows(overview.stockTrend);
      this.setData({
        loading: false,
        overview,
        statCards: statCards(overview),
        categoryRows: categories,
        expiryRows: expiry,
        trendRows: trends,
        hasCategoryRows: categories.length > 0,
        hasExpiryRows: expiry.length > 0,
        hasTrendRows: trends.length > 0,
        valueCoverageText: `${overview.valueSummary.pricedBatchCount}/${overview.valueSummary.positiveBatchCount} 批次`,
      });
    } catch (error) {
      this.setData({ loading: false, error: mapUserError(error), ...emptyData() });
    }
  },

  changeRange(this: AnalysisPage, event: { currentTarget: { dataset: { range: AnalysisRange } } }) {
    this.setData({ selectedRange: event.currentTarget.dataset.range || '30d' });
    void this.loadOverview();
  },
});
