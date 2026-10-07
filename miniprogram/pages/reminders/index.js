"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const phase2_form_1 = require("../../utils/phase2-form");
const emptySummary = {
    activeCount: 0,
    readCount: 0,
    dismissedCount: 0,
    resolvedCount: 0,
    restockCount: 0,
};
function getPhase2Service() {
    return require('../../services/phase2-ui-service');
}
Page({
    data: {
        loading: false,
        error: '',
        filterType: '',
        statusFilter: 'open',
        filters: [
            { key: '', label: '全部' },
            { key: 'EXPIRED', label: '已过期' },
            { key: 'EXPIRING', label: '临期' },
            { key: 'LOW_STOCK', label: '低库存' },
            { key: 'ZERO_STOCK', label: '零库存' },
        ],
        reminders: [],
        restocks: [],
        summary: { ...emptySummary },
        emptyReminders: false,
        emptyRestocks: false,
    },
    onShow() {
        void this.loadData();
    },
    async loadData() {
        this.setData({ loading: true, error: '' });
        try {
            const { listReminderCenter } = getPhase2Service();
            const center = await listReminderCenter({ type: this.data.filterType, status: this.data.statusFilter });
            this.setData({
                loading: false,
                reminders: center.reminders,
                restocks: center.restocks,
                summary: center.summary,
                emptyReminders: center.reminders.length === 0,
                emptyRestocks: center.restocks.length === 0,
            });
        }
        catch (error) {
            this.setData({ loading: false, error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    changeType(event) {
        this.setData({ filterType: event.currentTarget.dataset.type || '' });
        void this.loadData();
    },
    changeStatus(event) {
        this.setData({ statusFilter: event.currentTarget.dataset.status || 'open' });
        void this.loadData();
    },
    async viewReminder(event) {
        const { id, itemId } = event.currentTarget.dataset;
        try {
            const { markReminderRead } = getPhase2Service();
            await markReminderRead(id);
        }
        catch (error) {
            wx.showToast({ title: (0, phase2_form_1.mapUserError)(error), icon: 'none' });
            return;
        }
        wx.navigateTo({ url: `/pages/item-detail/index?itemId=${itemId}` });
    },
    async dismissReminder(event) {
        try {
            const { dismissReminder } = getPhase2Service();
            await dismissReminder(event.currentTarget.dataset.id);
            wx.showToast({ title: '已忽略', icon: 'success' });
            await this.loadData();
        }
        catch (error) {
            wx.showToast({ title: (0, phase2_form_1.mapUserError)(error), icon: 'none' });
        }
    },
    async addRestock(event) {
        try {
            const { addToRestock } = getPhase2Service();
            await addToRestock(event.currentTarget.dataset.itemId);
            wx.showToast({ title: '已加入待补货', icon: 'success' });
            await this.loadData();
        }
        catch (error) {
            wx.showToast({ title: (0, phase2_form_1.mapUserError)(error), icon: 'none' });
        }
    },
    recordPurchase(event) {
        wx.navigateTo({ url: `/pages/stock-add/index?itemId=${event.currentTarget.dataset.itemId}` });
    },
    async dismissRestock(event) {
        try {
            const { dismissRestock } = getPhase2Service();
            await dismissRestock(event.currentTarget.dataset.id);
            wx.showToast({ title: '已移除', icon: 'success' });
            await this.loadData();
        }
        catch (error) {
            wx.showToast({ title: (0, phase2_form_1.mapUserError)(error), icon: 'none' });
        }
    },
});
