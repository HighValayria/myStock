"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const phase2_form_1 = require("../../utils/phase2-form");
function getPhase2Service() {
    return require('../../services/phase2-ui-service');
}
function clampBar(value) {
    return Math.max(8, Math.min(100, value));
}
function viewSlices(rows) {
    return rows
        .filter((row) => row.count > 0)
        .map((row) => ({
        ...row,
        width: clampBar(row.percent),
        percentText: `${row.percent}%`,
    }));
}
function statCards(overview) {
    return [
        { key: 'sku', label: 'SKU', value: overview.summary.skuCount, note: `${overview.summary.positiveSkuCount} 个有库存` },
        { key: 'batch', label: '批次', value: overview.summary.batchCount, note: `${overview.summary.positiveBatchCount} 个有库存` },
        { key: 'expiry', label: '效期风险', value: overview.summary.expiredBatchCount + overview.summary.expiringBatchCount, note: '已过期 + 7天内' },
        { key: 'stock', label: '库存风险', value: overview.summary.lowStockItemCount + overview.summary.zeroStockItemCount, note: '低库存 + 零库存' },
    ];
}
function trendRows(points) {
    const maxStock = Math.max(1, ...points.map((point) => point.stockSkuCount));
    const maxOps = Math.max(1, ...points.map((point) => point.addOperationCount), ...points.map((point) => point.consumeOperationCount));
    return points.map((point) => ({
        ...point,
        stockHeight: clampBar(Math.round((point.stockSkuCount / maxStock) * 100)),
        addHeight: clampBar(Math.round((point.addOperationCount / maxOps) * 100)),
        consumeHeight: clampBar(Math.round((point.consumeOperationCount / maxOps) * 100)),
    }));
}
function emptyData() {
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
    },
    onShow() {
        void this.loadOverview();
    },
    async loadOverview() {
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
        }
        catch (error) {
            this.setData({ loading: false, error: (0, phase2_form_1.mapUserError)(error), ...emptyData() });
        }
    },
    changeRange(event) {
        this.setData({ selectedRange: event.currentTarget.dataset.range || '30d' });
        void this.loadOverview();
    },
});
