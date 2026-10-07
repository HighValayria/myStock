/// <reference path="../../types/wechat.d.ts" />

import type { Phase3ItemDetail } from '../../services/phase2-ui-service';
import { mapUserError } from '../../utils/phase2-form';
import { expiryStatusLabel, formatDate, formatRemainingDays, formatTransactionDate, stockStatusLabel, transactionQuantityText, transactionTypeLabel, visibleExpiryDate } from '../../utils/phase3-view';

interface BatchRow {
  id: string;
  quantityText: string;
  locationText: string;
  purchaseDateText: string;
  productionDateText: string;
  expiryDateText: string;
  remainingText: string;
  statusText: string;
  statusClass: string;
  hasPurchaseDate: boolean;
  hasProductionDate: boolean;
}

interface TxRow { id: string; dateText: string; typeText: string; quantityText: string; note: string }

interface DetailData {
  itemId: string;
  loading: boolean;
  error: string;
  detail: Phase3ItemDetail | null;
  title: string;
  specification: string;
  totalText: string;
  stockStatusText: string;
  stockClass: string;
  categoryText: string;
  defaultLocationText: string;
  batchRows: BatchRow[];
  txRows: TxRow[];
  emptyBatches: boolean;
  emptyTransactions: boolean;
  canAddRestock: boolean;
}

interface DetailPage {
  data: DetailData;
  setData(data: Partial<DetailData>): void;
  loadDetail(): Promise<void>;
}

function getPhase2Service(): typeof import('../../services/phase2-ui-service') {
  return require('../../services/phase2-ui-service') as typeof import('../../services/phase2-ui-service');
}

function statusClass(status: string): string {
  if (status === 'EXPIRED' || status === 'ZERO') return 'danger';
  if (status === 'EXPIRING' || status === 'LOW') return 'warning';
  return 'normal';
}

function toBatchRows(detail: Phase3ItemDetail): BatchRow[] {
  return detail.batches.map((batch) => ({
    id: batch._id,
    quantityText: `${batch.quantity}${detail.item.unit}`,
    locationText: batch.locationLabel || detail.locationLabels?.[batch.locationId] || '未知位置',
    purchaseDateText: batch.purchaseDate || '',
    productionDateText: batch.productionDate || '',
    expiryDateText: visibleExpiryDate(batch.effectiveExpiryDate || batch.expiryDate),
    remainingText: formatRemainingDays(batch.remainingDays),
    statusText: expiryStatusLabel(batch.expiryStatus),
    statusClass: statusClass(batch.expiryStatus),
    hasPurchaseDate: Boolean(batch.purchaseDate),
    hasProductionDate: Boolean(batch.productionDate),
  }));
}

function toTxRows(detail: Phase3ItemDetail): TxRow[] {
  return detail.recentTransactions.map((tx) => ({
    id: tx._id,
    dateText: formatTransactionDate(tx.createdAt),
    typeText: transactionTypeLabel(tx.type),
    quantityText: transactionQuantityText(tx, detail.item.unit),
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
    canAddRestock: false,
  } as DetailData,

  onLoad(this: DetailPage, options: { itemId?: string }) {
    this.setData({ itemId: options.itemId || '' });
    void this.loadDetail();
  },

  async loadDetail(this: DetailPage) {
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
        stockStatusText: stockStatusLabel(detail.stockStatus),
        stockClass: statusClass(detail.stockStatus),
        categoryText: detail.categoryName || '未分类',
        defaultLocationText: detail.defaultLocationLabel || '未设置位置',
        batchRows: toBatchRows(detail),
        txRows: toTxRows(detail),
        emptyBatches: detail.batches.length === 0,
        emptyTransactions: detail.recentTransactions.length === 0,
        canAddRestock: !detail.restockItem,
      });
    } catch (error) {
      this.setData({ loading: false, error: mapUserError(error) });
    }
  },

  goAdd(this: DetailPage) { wx.navigateTo({ url: `/pages/stock-add/index?itemId=${this.data.itemId}` }); },
  goConsume(this: DetailPage) { wx.navigateTo({ url: `/pages/stock-consume/index?itemId=${this.data.itemId}` }); },
  goEdit(this: DetailPage) { wx.navigateTo({ url: `/pages/stock-edit/index?itemId=${this.data.itemId}` }); },
  async addRestock(this: DetailPage) {
    try {
      const { addToRestock } = getPhase2Service();
      await addToRestock(this.data.itemId);
      wx.showToast({ title: '已加入待补货', icon: 'success' });
      await this.loadDetail();
    } catch (error) {
      wx.showToast({ title: mapUserError(error), icon: 'none' });
    }
  },
});
