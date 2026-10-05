"use strict";
/// <reference path="../../types/wechat.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const phase2_form_1 = require("../../utils/phase2-form");
const emptySummary = {
    itemCount: 0,
    batchCount: 0,
    expiringCount: 0,
    expiredCount: 0,
    lowStockCount: 0,
    zeroStockCount: 0,
    restockCount: 0,
};
function getPhase2Service() {
    return require('../../services/phase2-ui-service');
}
Page({
    data: {
        loading: false,
        error: '',
        summary: { ...emptySummary },
        alertLines: [],
        backgroundFacts: [],
        emptyInventory: false,
    },
    onShow() {
        void this.loadSummary();
    },
    async loadSummary() {
        this.setData({ loading: true, error: '' });
        try {
            const { getHomeDashboard } = getPhase2Service();
            const dashboard = await getHomeDashboard();
            this.setData({
                loading: false,
                summary: dashboard.summary,
                alertLines: dashboard.alertLines,
                backgroundFacts: dashboard.backgroundFacts,
                emptyInventory: dashboard.summary.itemCount === 0,
            });
        }
        catch (error) {
            this.setData({ loading: false, error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    openFact(event) {
        const itemId = event.currentTarget.dataset.id;
        if (!itemId)
            return;
        wx.navigateTo({ url: `/pages/item-detail/index?itemId=${itemId}` });
    },
    goAdd() { wx.navigateTo({ url: '/pages/stock-add/index' }); },
    goConsume() { wx.navigateTo({ url: '/pages/stock-consume/index' }); },
    goEdit() { wx.navigateTo({ url: '/pages/stock-edit/index' }); },
    goInventory() { wx.switchTab ? wx.switchTab({ url: '/pages/inventory/index' }) : wx.navigateTo({ url: '/pages/inventory/index' }); },
});
