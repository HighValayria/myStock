/// <reference path="../../types/wechat.d.ts" />

import type { Phase4ReminderCenter, Phase4ReminderRow, Phase4RestockRow } from '../../services/phase2-ui-service';
import { mapUserError } from '../../utils/phase2-form';

interface FilterOption {
  key: '' | 'EXPIRED' | 'EXPIRING' | 'LOW_STOCK' | 'ZERO_STOCK';
  label: string;
}

interface ReminderPageData {
  loading: boolean;
  error: string;
  filterType: FilterOption['key'];
  statusFilter: 'open' | 'all' | 'ACTIVE' | 'READ' | 'DISMISSED' | 'RESOLVED';
  filters: FilterOption[];
  reminders: Phase4ReminderRow[];
  restocks: Phase4RestockRow[];
  summary: Phase4ReminderCenter['summary'];
  emptyReminders: boolean;
  emptyRestocks: boolean;
}

interface ReminderPage {
  data: ReminderPageData;
  setData(data: Partial<ReminderPageData>): void;
  loadData(): Promise<void>;
}

const emptySummary: Phase4ReminderCenter['summary'] = {
  activeCount: 0,
  readCount: 0,
  dismissedCount: 0,
  resolvedCount: 0,
  restockCount: 0,
};

function getPhase2Service(): typeof import('../../services/phase2-ui-service') {
  return require('../../services/phase2-ui-service') as typeof import('../../services/phase2-ui-service');
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
  } as ReminderPageData,

  onShow(this: ReminderPage) {
    void this.loadData();
  },

  async loadData(this: ReminderPage) {
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
    } catch (error) {
      this.setData({ loading: false, error: mapUserError(error) });
    }
  },

  changeType(this: ReminderPage, event: { currentTarget: { dataset: { type: FilterOption['key'] } } }) {
    this.setData({ filterType: event.currentTarget.dataset.type || '' });
    void this.loadData();
  },

  changeStatus(this: ReminderPage, event: { currentTarget: { dataset: { status: ReminderPageData['statusFilter'] } } }) {
    this.setData({ statusFilter: event.currentTarget.dataset.status || 'open' });
    void this.loadData();
  },

  async viewReminder(this: ReminderPage, event: { currentTarget: { dataset: { id: string; itemId: string } } }) {
    const { id, itemId } = event.currentTarget.dataset;
    try {
      const { markReminderRead } = getPhase2Service();
      await markReminderRead(id);
    } catch (error) {
      wx.showToast({ title: mapUserError(error), icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/item-detail/index?itemId=${itemId}` });
  },

  async dismissReminder(this: ReminderPage, event: { currentTarget: { dataset: { id: string } } }) {
    try {
      const { dismissReminder } = getPhase2Service();
      await dismissReminder(event.currentTarget.dataset.id);
      wx.showToast({ title: '已忽略', icon: 'success' });
      await this.loadData();
    } catch (error) {
      wx.showToast({ title: mapUserError(error), icon: 'none' });
    }
  },

  async addRestock(this: ReminderPage, event: { currentTarget: { dataset: { itemId: string } } }) {
    try {
      const { addToRestock } = getPhase2Service();
      await addToRestock(event.currentTarget.dataset.itemId);
      wx.showToast({ title: '已加入待补货', icon: 'success' });
      await this.loadData();
    } catch (error) {
      wx.showToast({ title: mapUserError(error), icon: 'none' });
    }
  },

  recordPurchase(event: { currentTarget: { dataset: { itemId: string } } }) {
    wx.navigateTo({ url: `/pages/stock-add/index?itemId=${event.currentTarget.dataset.itemId}` });
  },

  async dismissRestock(this: ReminderPage, event: { currentTarget: { dataset: { id: string } } }) {
    try {
      const { dismissRestock } = getPhase2Service();
      await dismissRestock(event.currentTarget.dataset.id);
      wx.showToast({ title: '已移除', icon: 'success' });
      await this.loadData();
    } catch (error) {
      wx.showToast({ title: mapUserError(error), icon: 'none' });
    }
  },
});
