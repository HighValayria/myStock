/// <reference path="../../types/wechat.d.ts" />

import type { Batch, ItemDetail, ShelfLifeUnit } from '../../models';
import { adjustStock, getItemDetail, listInventoryRows, updateBatch, updateItem } from '../../services/phase2-ui-service';
import type { Phase2InventoryRow } from '../../services/phase2-ui-service';
import { createUiOperationId, isBlank, mapUserError, parseNonNegativeNumber, parseOptionalNumber, resolveExpiryDate } from '../../utils/phase2-form';

interface PickRow { id: string; name: string; summary: string }
interface ItemForm {
  name: string;
  categoryId: string;
  brand: string;
  specification: string;
  unit: string;
  defaultLocationId: string;
  lowStockThreshold: string;
  expiryWarningDays: string;
  note: string;
}
interface BatchForm {
  batchId: string;
  locationId: string;
  purchaseDate: string;
  productionDate: string;
  shelfLifeValue: string;
  shelfLifeUnit: ShelfLifeUnit;
  expiryDate: string;
  purchasePrice: string;
  note: string;
}
interface AdjustForm { batchId: string; actualQuantity: string; systemQuantity: number }
interface EditData {
  loading: boolean;
  submitting: boolean;
  search: string;
  items: PickRow[];
  selectedItemId: string;
  detail: ItemDetail | null;
  itemForm: ItemForm;
  batchForm: BatchForm | null;
  adjustForm: AdjustForm | null;
  result: string;
  error: string;
  shelfLifeUnits: ShelfLifeUnit[];
}
interface EditPage {
  data: EditData;
  setData(data: Partial<EditData>): void;
  loadItems(): Promise<void>;
  refreshDetail(): Promise<void>;
}

const emptyItemForm: ItemForm = {
  name: '', categoryId: '', brand: '', specification: '', unit: '', defaultLocationId: '', lowStockThreshold: '', expiryWarningDays: '', note: '',
};

function toPickRow(row: Phase2InventoryRow): PickRow {
  return {
    id: row.item._id,
    name: row.label,
    summary: `${row.totalQuantity}${row.item.unit}${row.nearestExpiryDate ? ` · 最近到期 ${row.nearestExpiryDate}` : ''}`,
  };
}

function itemFormFromDetail(detail: ItemDetail): ItemForm {
  const item = detail.item;
  return {
    name: item.name,
    categoryId: item.categoryId,
    brand: item.brand ?? '',
    specification: item.specification ?? '',
    unit: item.unit,
    defaultLocationId: item.defaultLocationId ?? '',
    lowStockThreshold: item.lowStockThreshold == null ? '' : String(item.lowStockThreshold),
    expiryWarningDays: item.expiryWarningDays == null ? '' : String(item.expiryWarningDays),
    note: item.note ?? '',
  };
}

function batchFormFromBatch(batch: Batch): BatchForm {
  return {
    batchId: batch._id,
    locationId: batch.locationId,
    purchaseDate: batch.purchaseDate ?? '',
    productionDate: batch.productionDate ?? '',
    shelfLifeValue: batch.shelfLifeValue == null ? '' : String(batch.shelfLifeValue),
    shelfLifeUnit: batch.shelfLifeUnit ?? 'DAY',
    expiryDate: batch.expiryDate,
    purchasePrice: batch.purchasePrice == null ? '' : String(batch.purchasePrice),
    note: batch.note ?? '',
  };
}

Page({
  data: {
    loading: false,
    submitting: false,
    search: '',
    items: [],
    selectedItemId: '',
    detail: null,
    itemForm: { ...emptyItemForm },
    batchForm: null,
    adjustForm: null,
    result: '',
    error: '',
    shelfLifeUnits: ['DAY', 'MONTH', 'YEAR'],
  } as EditData,

  onLoad(this: EditPage) { void this.loadItems(); },

  async loadItems(this: EditPage) {
    this.setData({ loading: true, error: '' });
    try {
      const rows = await listInventoryRows({ search: this.data.search });
      this.setData({ loading: false, items: rows.map(toPickRow) });
    } catch (error) {
      this.setData({ loading: false, error: mapUserError(error) });
    }
  },

  async refreshDetail(this: EditPage) {
    if (!this.data.selectedItemId) return;
    const detail = await getItemDetail(this.data.selectedItemId);
    this.setData({ detail, itemForm: itemFormFromDetail(detail) });
  },

  onSearchInput(this: EditPage, event: { detail: { value: string } }) {
    this.setData({ search: event.detail.value });
    void this.loadItems();
  },

  async selectItem(this: EditPage, event: { currentTarget: { dataset: { id: string } } }) {
    const itemId = event.currentTarget.dataset.id;
    this.setData({ selectedItemId: itemId, result: '', error: '', batchForm: null, adjustForm: null });
    try {
      await this.refreshDetail();
    } catch (error) {
      this.setData({ error: mapUserError(error) });
    }
  },

  onItemFieldInput(this: EditPage, event: { currentTarget: { dataset: { field: keyof ItemForm } }; detail: { value: string } }) {
    const field = event.currentTarget.dataset.field;
    this.setData({ itemForm: { ...this.data.itemForm, [field]: event.detail.value } });
  },

  onBatchFieldInput(this: EditPage, event: { currentTarget: { dataset: { field: keyof BatchForm } }; detail: { value: string } }) {
    if (!this.data.batchForm) return;
    const field = event.currentTarget.dataset.field;
    this.setData({ batchForm: { ...this.data.batchForm, [field]: event.detail.value } });
  },

  onBatchShelfLifeUnitChange(this: EditPage, event: { detail: { value: string } }) {
    if (!this.data.batchForm) return;
    const units: ShelfLifeUnit[] = ['DAY', 'MONTH', 'YEAR'];
    this.setData({ batchForm: { ...this.data.batchForm, shelfLifeUnit: units[Number(event.detail.value)] ?? 'DAY' } });
  },

  onAdjustInput(this: EditPage, event: { detail: { value: string } }) {
    if (!this.data.adjustForm) return;
    this.setData({ adjustForm: { ...this.data.adjustForm, actualQuantity: event.detail.value } });
  },

  async saveItem(this: EditPage) {
    if (this.data.submitting || !this.data.detail) return;
    this.setData({ submitting: true, error: '', result: '' });
    try {
      const form = this.data.itemForm;
      if (isBlank(form.name)) throw new Error('请填写物品名称');
      if (isBlank(form.unit)) throw new Error('请填写单位');
      const updated = await updateItem(this.data.detail.item._id, {
        name: form.name.trim(),
        categoryId: form.categoryId.trim() || 'default_category',
        brand: form.brand.trim() || null,
        specification: form.specification.trim() || null,
        unit: form.unit.trim(),
        defaultLocationId: form.defaultLocationId.trim() || null,
        lowStockThreshold: parseOptionalNumber(form.lowStockThreshold, '低库存阈值', { min: 0 }),
        expiryWarningDays: parseOptionalNumber(form.expiryWarningDays, '临期阈值', { integer: true, min: 0 }),
        note: form.note.trim(),
      });
      await this.refreshDetail();
      this.setData({ submitting: false, result: `物品属性已保存：${updated.name}` });
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (error) {
      this.setData({ submitting: false, error: mapUserError(error) });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  editBatch(this: EditPage, event: { currentTarget: { dataset: { id: string } } }) {
    const batch = this.data.detail?.batches.find((item) => item._id === event.currentTarget.dataset.id);
    if (!batch) return;
    this.setData({ batchForm: batchFormFromBatch(batch), adjustForm: null, result: '', error: '' });
  },

  adjustBatch(this: EditPage, event: { currentTarget: { dataset: { id: string } } }) {
    const batch = this.data.detail?.batches.find((item) => item._id === event.currentTarget.dataset.id);
    if (!batch) return;
    this.setData({ adjustForm: { batchId: batch._id, actualQuantity: String(batch.quantity), systemQuantity: batch.quantity }, batchForm: null, result: '', error: '' });
  },

  async saveBatch(this: EditPage) {
    if (this.data.submitting || !this.data.batchForm) return;
    this.setData({ submitting: true, error: '', result: '' });
    try {
      const form = this.data.batchForm;
      const shelfLifeValue = parseOptionalNumber(form.shelfLifeValue, '保质期', { integer: true, min: 1 });
      const expiryDate = resolveExpiryDate({
        expiryDate: form.expiryDate,
        productionDate: form.productionDate.trim() || null,
        shelfLifeValue,
        shelfLifeUnit: shelfLifeValue == null ? null : form.shelfLifeUnit,
      });
      await updateBatch(form.batchId, {
        locationId: form.locationId.trim() || 'default_location',
        purchaseDate: form.purchaseDate.trim() || null,
        productionDate: form.productionDate.trim() || null,
        shelfLifeValue,
        shelfLifeUnit: shelfLifeValue == null ? null : form.shelfLifeUnit,
        expiryDate,
        purchasePrice: parseOptionalNumber(form.purchasePrice, '购买价格', { min: 0 }),
        note: form.note.trim(),
      });
      await this.refreshDetail();
      this.setData({ submitting: false, batchForm: null, result: '批次属性已保存，并已重新计算提醒状态' });
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (error) {
      this.setData({ submitting: false, error: mapUserError(error) });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  async submitAdjust(this: EditPage) {
    if (this.data.submitting || !this.data.adjustForm) return;
    this.setData({ submitting: true, error: '', result: '' });
    try {
      const form = this.data.adjustForm;
      const actualQuantity = parseNonNegativeNumber(form.actualQuantity, '实际数量');
      const result = await adjustStock({
        batchId: form.batchId,
        actualQuantity,
        operationId: createUiOperationId('adjust'),
      });
      await this.refreshDetail();
      this.setData({
        submitting: false,
        adjustForm: null,
        result: result.transaction
          ? `修正成功：库存已由 ${form.systemQuantity} 修正为 ${actualQuantity}，ADJUST ${result.diff}`
          : '数量未变化，无需生成 ADJUST',
      });
      wx.showToast({ title: '修正成功', icon: 'success' });
    } catch (error) {
      this.setData({ submitting: false, error: mapUserError(error) });
      wx.showToast({ title: '修正失败', icon: 'none' });
    }
  },
});

