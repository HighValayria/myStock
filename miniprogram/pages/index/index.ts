/// <reference path="../../types/wechat.d.ts" />

import type { Phase2InventoryRow } from '../../services/phase2-ui-service';
import { mapUserError } from '../../utils/phase2-form';

interface HomeData {
  loading: boolean;
  itemCount: number;
  batchHint: string;
  error: string;
  recentRows: Array<{ id: string; name: string; summary: string }>;
}

interface HomePage {
  setData(data: Partial<HomeData>): void;
  loadSummary(): Promise<void>;
}

function getPhase2Service(): typeof import('../../services/phase2-ui-service') {
  return require('../../services/phase2-ui-service') as typeof import('../../services/phase2-ui-service');
}

Page({
  data: {
    loading: false,
    itemCount: 0,
    batchHint: '打开后可增加、消耗、编辑库存',
    error: '',
    recentRows: [],
  } as HomeData,

  onShow(this: HomePage) {
    void this.loadSummary();
  },

  async loadSummary(this: HomePage) {
    this.setData({ loading: true, error: '' });
    try {
      const { listInventoryRows } = getPhase2Service();
      const rows = await listInventoryRows();
      const recentRows = rows.slice(0, 5).map((row: Phase2InventoryRow) => ({
        id: row.item._id,
        name: `${row.item.name}${row.item.specification ? ` ${row.item.specification}` : ''}`,
        summary: `${row.totalQuantity}${row.item.unit}${row.nearestExpiryDate ? ` · 最近到期 ${row.nearestExpiryDate}` : ''}`,
      }));
      this.setData({
        loading: false,
        itemCount: rows.length,
        batchHint: rows.length ? '最近操作物品会优先出现在选择列表' : '还没有库存，先增加一个物品',
        recentRows,
      });
    } catch (error) {
      this.setData({ loading: false, error: mapUserError(error) });
    }
  },

  goAdd() { wx.navigateTo({ url: '/pages/stock-add/index' }); },
  goConsume() { wx.navigateTo({ url: '/pages/stock-consume/index' }); },
  goEdit() { wx.navigateTo({ url: '/pages/stock-edit/index' }); },
});
