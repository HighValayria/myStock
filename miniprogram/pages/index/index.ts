/// <reference path="../../types/wechat.d.ts" />

import type { Phase3HomeDashboard } from '../../services/phase2-ui-service';
import { mapUserError } from '../../utils/phase2-form';

interface HomeData {
  loading: boolean;
  error: string;
  summary: Phase3HomeDashboard['summary'];
  alertLines: string[];
  backgroundFacts: Phase3HomeDashboard['backgroundFacts'];
  emptyInventory: boolean;
}

interface HomePage {
  data: HomeData;
  setData(data: Partial<HomeData>): void;
  loadSummary(): Promise<void>;
}

const emptySummary: Phase3HomeDashboard['summary'] = {
  itemCount: 0,
  batchCount: 0,
  expiringCount: 0,
  expiredCount: 0,
  lowStockCount: 0,
  zeroStockCount: 0,
  restockCount: 0,
};

function getPhase2Service(): typeof import('../../services/phase2-ui-service') {
  return require('../../services/phase2-ui-service') as typeof import('../../services/phase2-ui-service');
}

Page({
  data: {
    loading: false,
    error: '',
    summary: { ...emptySummary },
    alertLines: [],
    backgroundFacts: [],
    emptyInventory: false,
  } as HomeData,

  onShow(this: HomePage) {
    void this.loadSummary();
  },

  async loadSummary(this: HomePage) {
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
    } catch (error) {
      this.setData({ loading: false, error: mapUserError(error) });
    }
  },

  openFact(this: HomePage, event: { currentTarget: { dataset: { id: string } } }) {
    const itemId = event.currentTarget.dataset.id;
    if (!itemId) return;
    wx.navigateTo({ url: `/pages/item-detail/index?itemId=${itemId}` });
  },

  goAdd() { wx.navigateTo({ url: '/pages/stock-add/index' }); },
  goConsume() { wx.navigateTo({ url: '/pages/stock-consume/index' }); },
  goEdit() { wx.navigateTo({ url: '/pages/stock-edit/index' }); },
  goInventory() { (wx as any).switchTab ? (wx as any).switchTab({ url: '/pages/inventory/index' }) : wx.navigateTo({ url: '/pages/inventory/index' }); },
});
