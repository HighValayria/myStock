"use strict";
/// <reference path="../../types/wechat.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const phase2_form_1 = require("../../utils/phase2-form");
const phase3_view_1 = require("../../utils/phase3-view");
function getPhase2Service() {
    return require('../../services/phase2-ui-service');
}
function statusClass(status) {
    if (status === 'EXPIRED' || status === 'ZERO')
        return 'danger';
    if (status === 'EXPIRING' || status === 'LOW')
        return 'warning';
    return 'normal';
}
function toBatchRows(detail) {
    return detail.batches.map((batch) => ({
        id: batch._id,
        quantityText: `${batch.quantity}${detail.item.unit}`,
        locationText: batch.locationLabel || detail.locationLabels?.[batch.locationId] || '未知位置',
        purchaseDateText: batch.purchaseDate || '',
        productionDateText: batch.productionDate || '',
        expiryDateText: (0, phase3_view_1.visibleExpiryDate)(batch.effectiveExpiryDate || batch.expiryDate),
        remainingText: (0, phase3_view_1.formatRemainingDays)(batch.remainingDays),
        statusText: (0, phase3_view_1.expiryStatusLabel)(batch.expiryStatus),
        statusClass: statusClass(batch.expiryStatus),
        hasPurchaseDate: Boolean(batch.purchaseDate),
        hasProductionDate: Boolean(batch.productionDate),
    }));
}
function toTxRows(detail) {
    return detail.recentTransactions.map((tx) => ({
        id: tx._id,
        dateText: (0, phase3_view_1.formatTransactionDate)(tx.createdAt),
        typeText: (0, phase3_view_1.transactionTypeLabel)(tx.type),
        quantityText: (0, phase3_view_1.transactionQuantityText)(tx, detail.item.unit),
        note: tx.note || '',
    }));
}
Page({
    data: {
        itemId: '',
        loading: false,
        error: '',
        detail: null,
        title: '',
        specification: '',
        totalText: '',
        stockStatusText: '',
        stockClass: 'normal',
        categoryText: '',
        defaultLocationText: '',
        batchRows: [],
        txRows: [],
        emptyBatches: false,
        emptyTransactions: false,
    },
    onLoad(options) {
        this.setData({ itemId: options.itemId || '' });
        void this.loadDetail();
    },
    async loadDetail() {
        if (!this.data.itemId) {
            this.setData({ error: '缺少物品信息' });
            return;
        }
        this.setData({ loading: true, error: '' });
        try {
            const { getItemDetail } = getPhase2Service();
            const detail = await getItemDetail(this.data.itemId);
            this.setData({
                loading: false,
                detail,
                title: detail.item.name,
                specification: detail.item.specification || '',
                totalText: `${detail.totalQuantity}${detail.item.unit}`,
                stockStatusText: (0, phase3_view_1.stockStatusLabel)(detail.stockStatus),
                stockClass: statusClass(detail.stockStatus),
                categoryText: detail.categoryName || '未分类',
                defaultLocationText: detail.defaultLocationLabel || '未设置位置',
                batchRows: toBatchRows(detail),
                txRows: toTxRows(detail),
                emptyBatches: detail.batches.length === 0,
                emptyTransactions: detail.recentTransactions.length === 0,
            });
        }
        catch (error) {
            this.setData({ loading: false, error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    goAdd() { wx.navigateTo({ url: `/pages/stock-add/index?itemId=${this.data.itemId}` }); },
    goConsume() { wx.navigateTo({ url: `/pages/stock-consume/index?itemId=${this.data.itemId}` }); },
    goEdit() { wx.navigateTo({ url: `/pages/stock-edit/index?itemId=${this.data.itemId}` }); },
});
