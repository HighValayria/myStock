/// <reference path="../../types/wechat.d.ts" />

import type { ItemDetail } from '../../models';
import type { Phase2CategoryOption, Phase2InventoryRow } from '../../services/phase2-ui-service';
import { createUiOperationId, mapUserError, parsePositiveNumber, UNKNOWN_EXPIRY_DATE } from '../../utils/phase2-form';

interface PickRow {
  id: string;
  name: string;
  unit: string;
  categoryId: string;
  totalQuantity: number;
  nearestExpiryDate: string;
  summary: string;
}

interface ConsumeData {
  loading: boolean;
  submitting: boolean;
  search: string;
  categories: Phase2CategoryOption[];
  categoryNames: string[];
  selectedCategoryId: string;
  selectedCategoryName: string;
  items: PickRow[];
  recentItems: PickRow[];
  emptyRecentItems: boolean;
  emptyItems: boolean;
  selectedItemId: string;
  quantity: string;
  note: string;
  detail: ItemDetail | null;
  selectedItemName: string;
  nearestExpiryText: string;
  result: string;
  error: string;
}

interface ConsumePage {
  data: ConsumeData;
  setData(data: Partial<ConsumeData>): void;
  loadItems(): Promise<void>;
  loadCategories(): Promise<void>;
  selectItemById(itemId: string): Promise<void>;
}

function getPhase2Service(): typeof import('../../services/phase2-ui-service') {
  return require('../../services/phase2-ui-service') as typeof import('../../services/phase2-ui-service');
}

function itemDisplayName(item: { name: string; specification?: string | null }): string {
  return `${item.name}${item.specification ? ` ${item.specification}` : ''}`;
}

function toPickRow(row: Phase2InventoryRow): PickRow {
  const expiry = row.nearestExpiryDate && row.nearestExpiryDate !== UNKNOWN_EXPIRY_DATE ? row.nearestExpiryDate : '无';
  return {
    id: row.item._id,
    name: row.label,
    unit: row.item.unit,
    categoryId: row.item.categoryId,
    totalQuantity: row.totalQuantity,
    nearestExpiryDate: expiry,
    summary: `${row.totalQuantity}${row.item.unit} · 最近到期 ${expiry}`,
  };
}

Page({
  data: {
    loading: false,
    submitting: false,
    search: '',
    categories: [],
    categoryNames: ['全部'],
    selectedCategoryId: '',
    selectedCategoryName: '全部',
    items: [],
    recentItems: [],
    emptyRecentItems: true,
    emptyItems: false,
    selectedItemId: '',
    quantity: '',
    note: '',
    detail: null,
    selectedItemName: '',
    nearestExpiryText: '',
    result: '',
    error: '',
  } as ConsumeData,

  onLoad(this: ConsumePage, options: { itemId?: string }) {
    void Promise.all([this.loadCategories(), this.loadItems()]).then(() => {
      if (options.itemId) void this.selectItemById(options.itemId);
    });
  },

  async loadCategories(this: ConsumePage) {
    try {
      const { getTaxonomyOptions } = getPhase2Service();
      const options = await getTaxonomyOptions();
      this.setData({ categories: options.categories, categoryNames: ['全部'].concat(options.categories.map((item) => item.name)) });
    } catch (error) {
      this.setData({ error: mapUserError(error) });
    }
  },

  async loadItems(this: ConsumePage) {
    this.setData({ loading: true, error: '' });
    try {
      const { listInventoryRows } = getPhase2Service();
      const rows = await listInventoryRows({
        search: this.data.search,
        positiveOnly: true,
        categoryId: this.data.selectedCategoryId || undefined,
      });
      const items = rows.map(toPickRow);
      this.setData({ loading: false, items, recentItems: items.slice(0, 5), emptyRecentItems: items.length === 0, emptyItems: items.length === 0 });
    } catch (error) {
      this.setData({ loading: false, error: mapUserError(error), emptyRecentItems: true, emptyItems: true });
    }
  },

  onSearchInput(this: ConsumePage, event: { detail: { value: string } }) {
    this.setData({ search: event.detail.value });
    void this.loadItems();
  },

  onCategoryChange(this: ConsumePage, event: { detail: { value: string } }) {
    const index = Number(event.detail.value);
    const category = index === 0 ? null : this.data.categories[index - 1];
    this.setData({ selectedCategoryId: category?.id ?? '', selectedCategoryName: category?.name ?? '全部', selectedItemId: '', detail: null, selectedItemName: '', nearestExpiryText: '' });
    void this.loadItems();
  },

  async selectItemById(this: ConsumePage, itemId: string) {
    this.setData({ selectedItemId: itemId, result: '', error: '' });
    try {
      const { getItemDetail } = getPhase2Service();
      const detail = await getItemDetail(itemId);
      const nearestExpiry = detail.batches.find((batch) => batch.quantity > 0)?.expiryDate;
      const nearestExpiryText = nearestExpiry && nearestExpiry !== UNKNOWN_EXPIRY_DATE ? nearestExpiry : '无';
      this.setData({ detail, selectedItemName: itemDisplayName(detail.item), nearestExpiryText });
    } catch (error) {
      this.setData({ error: mapUserError(error) });
    }
  },

  async selectItem(this: ConsumePage, event: { currentTarget: { dataset: { id: string } } }) {
    await this.selectItemById(event.currentTarget.dataset.id);
  },

  onFieldInput(this: ConsumePage, event: { currentTarget: { dataset: { field: 'quantity' | 'note' } }; detail: { value: string } }) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value } as Partial<ConsumeData>);
  },

  async submit(this: ConsumePage) {
    if (this.data.submitting) return;
    this.setData({ submitting: true, error: '', result: '' });
    try {
      if (!this.data.selectedItemId || !this.data.detail) throw new Error('请选择要消耗的物品');
      const quantity = parsePositiveNumber(this.data.quantity, '消耗数量');
      if (quantity > this.data.detail.totalQuantity) {
        throw new Error(`当前库存仅剩 ${this.data.detail.totalQuantity}${this.data.detail.item.unit}，无法消耗 ${quantity}${this.data.detail.item.unit}。`);
      }
      const { consumeStock, getItemDetail } = getPhase2Service();
      await consumeStock({
        itemId: this.data.selectedItemId,
        quantity,
        note: this.data.note.trim(),
        operationId: createUiOperationId('consume'),
      });
      const detail = await getItemDetail(this.data.selectedItemId);
      const nearestExpiry = detail.batches.find((batch) => batch.quantity > 0)?.expiryDate;
      const nearestExpiryText = nearestExpiry && nearestExpiry !== UNKNOWN_EXPIRY_DATE ? nearestExpiry : '无';
      const message = `消耗成功：已消耗 ${quantity}${detail.item.unit}，剩余 ${detail.totalQuantity}${detail.item.unit}`;
      wx.showToast({ title: '消耗成功', icon: 'success' });
      this.setData({ submitting: false, detail, selectedItemName: itemDisplayName(detail.item), nearestExpiryText, quantity: '', note: '', result: message });
      void this.loadItems();
    } catch (error) {
      this.setData({ submitting: false, error: mapUserError(error) });
      wx.showToast({ title: '消耗失败', icon: 'none' });
    }
  },
});