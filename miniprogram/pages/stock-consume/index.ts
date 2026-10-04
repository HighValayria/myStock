/// <reference path="../../types/wechat.d.ts" />

import type { ItemDetail } from '../../models';
import { consumeStock, getItemDetail, listInventoryRows } from '../../services/phase2-ui-service';
import type { Phase2InventoryRow } from '../../services/phase2-ui-service';
import { createUiOperationId, mapUserError, parsePositiveNumber } from '../../utils/phase2-form';

interface PickRow {
  id: string;
  name: string;
  unit: string;
  totalQuantity: number;
  nearestExpiryDate: string;
  summary: string;
}

interface ConsumeData {
  loading: boolean;
  submitting: boolean;
  search: string;
  items: PickRow[];
  selectedItemId: string;
  quantity: string;
  note: string;
  detail: ItemDetail | null;
  nearestExpiryText: string;
  result: string;
  error: string;
}

interface ConsumePage {
  data: ConsumeData;
  setData(data: Partial<ConsumeData>): void;
  loadItems(): Promise<void>;
}

function toPickRow(row: Phase2InventoryRow): PickRow {
  return {
    id: row.item._id,
    name: row.label,
    unit: row.item.unit,
    totalQuantity: row.totalQuantity,
    nearestExpiryDate: row.nearestExpiryDate ?? '无到期批次',
    summary: `当前库存 ${row.totalQuantity}${row.item.unit} · 最近到期 ${row.nearestExpiryDate ?? '无'}`,
  };
}

Page({
  data: {
    loading: false,
    submitting: false,
    search: '',
    items: [],
    selectedItemId: '',
    quantity: '',
    note: '',
    detail: null,
    nearestExpiryText: '',
    result: '',
    error: '',
  } as ConsumeData,

  onLoad(this: ConsumePage) { void this.loadItems(); },

  async loadItems(this: ConsumePage) {
    this.setData({ loading: true, error: '' });
    try {
      const rows = await listInventoryRows({ search: this.data.search, positiveOnly: true });
      this.setData({ loading: false, items: rows.map(toPickRow) });
    } catch (error) {
      this.setData({ loading: false, error: mapUserError(error) });
    }
  },

  onSearchInput(this: ConsumePage, event: { detail: { value: string } }) {
    this.setData({ search: event.detail.value });
    void this.loadItems();
  },

  async selectItem(this: ConsumePage, event: { currentTarget: { dataset: { id: string } } }) {
    const itemId = event.currentTarget.dataset.id;
    this.setData({ selectedItemId: itemId, result: '', error: '' });
    try {
      const detail = await getItemDetail(itemId);
      const nearestExpiryText = detail.batches.find((batch) => batch.quantity > 0)?.expiryDate ?? '无';
      this.setData({ detail, nearestExpiryText });
    } catch (error) {
      this.setData({ error: mapUserError(error) });
    }
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
      await consumeStock({
        itemId: this.data.selectedItemId,
        quantity,
        note: this.data.note.trim(),
        operationId: createUiOperationId('consume'),
      });
      const detail = await getItemDetail(this.data.selectedItemId);
      const nearestExpiryText = detail.batches.find((batch) => batch.quantity > 0)?.expiryDate ?? '无';
      const message = `消耗成功：已消耗 ${quantity}${detail.item.unit}，剩余 ${detail.totalQuantity}${detail.item.unit}`;
      wx.showToast({ title: '消耗成功', icon: 'success' });
      this.setData({ submitting: false, detail, nearestExpiryText, quantity: '', note: '', result: message });
      void this.loadItems();
    } catch (error) {
      this.setData({ submitting: false, error: mapUserError(error) });
      wx.showToast({ title: '消耗失败', icon: 'none' });
    }
  },
});

