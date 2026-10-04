/// <reference path="../../types/wechat.d.ts" />

import type { Batch, ItemDetail, ShelfLifeUnit } from '../../models';
import type { Phase2CategoryOption, Phase2InventoryRow, Phase2LocationOption, Phase2TaxonomyOptions } from '../../services/phase2-ui-service';
import { createUiOperationId, isBlank, mapUserError, normalizeDateInput, parseNonNegativeNumber, parseOptionalNumber, resolveExpiryDate, UNKNOWN_EXPIRY_DATE } from '../../utils/phase2-form';

interface PickRow { id: string; name: string; summary: string; selectedClass: string }
interface BatchRow { id: string; quantityText: string; locationText: string; expiryText: string; statusText: string; remainingText: string }
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
  batchRows: BatchRow[];
  itemForm: ItemForm;
  batchForm: BatchForm | null;
  adjustForm: AdjustForm | null;
  result: string;
  error: string;
  shelfLifeUnits: ShelfLifeUnit[];
  shelfLifeUnitLabels: string[];
  categories: Phase2CategoryOption[];
  categoryNames: string[];
  selectedCategoryName: string;
  locations: Phase2LocationOption[];
  locationNames: string[];
  selectedItemLocationName: string;
  selectedBatchLocationName: string;
  showNewCategory: boolean;
  newCategoryName: string;
  showNewLocation: boolean;
  newLocationName: string;
  emptyItems: boolean;
  emptyBatches: boolean;
}
interface EditPage {
  data: EditData;
  setData(data: Partial<EditData>): void;
  loadItems(): Promise<void>;
  loadTaxonomy(): Promise<void>;
  refreshDetail(): Promise<void>;
}

const emptyItemForm: ItemForm = {
  name: '', categoryId: '', brand: '', specification: '', unit: '', defaultLocationId: '', lowStockThreshold: '', expiryWarningDays: '', note: '',
};

function getPhase2Service(): typeof import('../../services/phase2-ui-service') {
  return require('../../services/phase2-ui-service') as typeof import('../../services/phase2-ui-service');
}

function expiryText(expiryDate: string): string {
  return expiryDate === UNKNOWN_EXPIRY_DATE ? '未知到期' : `到期 ${expiryDate}`;
}

function statusText(status: string): string {
  if (status === 'EXPIRED') return '已过期';
  if (status === 'EXPIRING') return '临期';
  return '正常';
}

function toPickRow(row: Phase2InventoryRow, selectedItemId: string): PickRow {
  const nearestExpiry = row.nearestExpiryDate && row.nearestExpiryDate !== UNKNOWN_EXPIRY_DATE ? ` · 最近到期 ${row.nearestExpiryDate}` : '';
  return {
    id: row.item._id,
    name: row.label,
    summary: `${row.totalQuantity}${row.item.unit}${nearestExpiry}`,
    selectedClass: row.item._id === selectedItemId ? 'selected' : '',
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
    expiryDate: batch.expiryDate === UNKNOWN_EXPIRY_DATE ? '' : batch.expiryDate,
    purchasePrice: batch.purchasePrice == null ? '' : String(batch.purchasePrice),
    note: batch.note ?? '',
  };
}

function firstOrEmpty<T extends { id: string }>(items: T[]): string {
  return items[0]?.id ?? '';
}

function categoryName(categories: Phase2CategoryOption[], id: string): string {
  return categories.find((item) => item.id === id)?.name ?? '未选择类别';
}

function locationName(locations: Phase2LocationOption[], id: string): string {
  return locations.find((item) => item.id === id)?.label ?? '未选择位置';
}

function buildBatchRows(detail: ItemDetail, locations: Phase2LocationOption[]): BatchRow[] {
  return detail.batches.map((batch) => ({
    id: batch._id,
    quantityText: `${batch.quantity}${detail.item.unit}`,
    locationText: locationName(locations, batch.locationId),
    expiryText: expiryText(batch.expiryDate),
    statusText: statusText(batch.expiryStatus),
    remainingText: batch.expiryDate === UNKNOWN_EXPIRY_DATE ? '剩余天数未知' : `剩余 ${batch.remainingDays} 天`,
  }));
}

Page({
  data: {
    loading: false,
    submitting: false,
    search: '',
    items: [],
    selectedItemId: '',
    detail: null,
    batchRows: [],
    itemForm: { ...emptyItemForm },
    batchForm: null,
    adjustForm: null,
    result: '',
    error: '',
    shelfLifeUnits: ['DAY', 'MONTH', 'YEAR'],
    shelfLifeUnitLabels: ['天', '个月', '年'],
    categories: [],
    categoryNames: [],
    selectedCategoryName: '未选择类别',
    locations: [],
    locationNames: [],
    selectedItemLocationName: '未选择位置',
    selectedBatchLocationName: '未选择位置',
    showNewCategory: false,
    newCategoryName: '',
    showNewLocation: false,
    newLocationName: '',
    emptyItems: false,
    emptyBatches: false,
  } as EditData,

  onLoad(this: EditPage) {
    void this.loadTaxonomy();
    void this.loadItems();
  },

  async loadTaxonomy(this: EditPage) {
    try {
      const { getTaxonomyOptions } = getPhase2Service();
      const options: Phase2TaxonomyOptions = await getTaxonomyOptions();
      const selectedCategoryName = categoryName(options.categories, this.data.itemForm.categoryId);
      const selectedItemLocationName = locationName(options.locations, this.data.itemForm.defaultLocationId);
      const selectedBatchLocationName = this.data.batchForm ? locationName(options.locations, this.data.batchForm.locationId) : '未选择位置';
      this.setData({
        categories: options.categories,
        categoryNames: options.categories.map((item) => item.name).concat('＋ 新建类别'),
        locations: options.locations,
        locationNames: options.locations.map((item) => item.label).concat('＋ 新建位置'),
        selectedCategoryName,
        selectedItemLocationName,
        selectedBatchLocationName,
      });
      if (this.data.detail) {
        this.setData({ batchRows: buildBatchRows(this.data.detail, options.locations), emptyBatches: this.data.detail.batches.length === 0 });
      }
    } catch (error) {
      this.setData({ error: mapUserError(error) });
    }
  },

  async loadItems(this: EditPage) {
    this.setData({ loading: true, error: '' });
    try {
      const { listInventoryRows } = getPhase2Service();
      const rows = await listInventoryRows({ search: this.data.search });
      this.setData({ loading: false, items: rows.map((row) => toPickRow(row, this.data.selectedItemId)), emptyItems: rows.length === 0 });
    } catch (error) {
      this.setData({ loading: false, error: mapUserError(error), emptyItems: true });
    }
  },

  async refreshDetail(this: EditPage) {
    if (!this.data.selectedItemId) return;
    const { getItemDetail } = getPhase2Service();
    const detail = await getItemDetail(this.data.selectedItemId);
    const itemForm = itemFormFromDetail(detail);
    this.setData({
      detail,
      itemForm,
      batchRows: buildBatchRows(detail, this.data.locations),
      emptyBatches: detail.batches.length === 0,
      selectedCategoryName: categoryName(this.data.categories, itemForm.categoryId),
      selectedItemLocationName: locationName(this.data.locations, itemForm.defaultLocationId),
    });
  },

  onSearchInput(this: EditPage, event: { detail: { value: string } }) {
    this.setData({ search: event.detail.value });
    void this.loadItems();
  },

  async selectItem(this: EditPage, event: { currentTarget: { dataset: { id: string } } }) {
    const itemId = event.currentTarget.dataset.id;
    this.setData({ selectedItemId: itemId, result: '', error: '', batchForm: null, adjustForm: null });
    this.setData({ items: this.data.items.map((item) => ({ ...item, selectedClass: item.id === itemId ? 'selected' : '' })) });
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

  onCategoryChange(this: EditPage, event: { detail: { value: string } }) {
    const index = Number(event.detail.value);
    if (index >= this.data.categories.length) {
      this.setData({ showNewCategory: true });
      return;
    }
    const category = this.data.categories[index];
    this.setData({ itemForm: { ...this.data.itemForm, categoryId: category.id }, selectedCategoryName: category.name, showNewCategory: false });
  },

  onItemLocationChange(this: EditPage, event: { detail: { value: string } }) {
    const index = Number(event.detail.value);
    if (index >= this.data.locations.length) {
      this.setData({ showNewLocation: true });
      return;
    }
    const location = this.data.locations[index];
    this.setData({ itemForm: { ...this.data.itemForm, defaultLocationId: location.id }, selectedItemLocationName: location.label, showNewLocation: false });
  },

  onBatchLocationChange(this: EditPage, event: { detail: { value: string } }) {
    if (!this.data.batchForm) return;
    const index = Number(event.detail.value);
    if (index >= this.data.locations.length) {
      this.setData({ showNewLocation: true });
      return;
    }
    const location = this.data.locations[index];
    this.setData({ batchForm: { ...this.data.batchForm, locationId: location.id }, selectedBatchLocationName: location.label, showNewLocation: false });
  },

  onNewCategoryInput(this: EditPage, event: { detail: { value: string } }) {
    this.setData({ newCategoryName: event.detail.value });
  },

  onNewLocationInput(this: EditPage, event: { detail: { value: string } }) {
    this.setData({ newLocationName: event.detail.value });
  },

  async createCategory(this: EditPage) {
    try {
      const { createCategory } = getPhase2Service();
      const category = await createCategory(this.data.newCategoryName);
      await this.loadTaxonomy();
      this.setData({ itemForm: { ...this.data.itemForm, categoryId: category.id }, selectedCategoryName: category.name, showNewCategory: false, newCategoryName: '' });
    } catch (error) {
      this.setData({ error: mapUserError(error) });
    }
  },

  async createLocation(this: EditPage) {
    try {
      const { createLocation } = getPhase2Service();
      const location = await createLocation(this.data.newLocationName);
      await this.loadTaxonomy();
      if (this.data.batchForm) {
        this.setData({ batchForm: { ...this.data.batchForm, locationId: location.id }, selectedBatchLocationName: location.label });
      } else {
        this.setData({ itemForm: { ...this.data.itemForm, defaultLocationId: location.id }, selectedItemLocationName: location.label });
      }
      this.setData({ showNewLocation: false, newLocationName: '' });
    } catch (error) {
      this.setData({ error: mapUserError(error) });
    }
  },

  onBatchFieldInput(this: EditPage, event: { currentTarget: { dataset: { field: keyof BatchForm } }; detail: { value: string } }) {
    if (!this.data.batchForm) return;
    const field = event.currentTarget.dataset.field;
    this.setData({ batchForm: { ...this.data.batchForm, [field]: event.detail.value } });
  },

  onBatchDateChange(this: EditPage, event: { currentTarget: { dataset: { field: keyof BatchForm } }; detail: { value: string } }) {
    if (!this.data.batchForm) return;
    const field = event.currentTarget.dataset.field;
    this.setData({ batchForm: { ...this.data.batchForm, [field]: event.detail.value } });
  },

  onBatchShelfLifeUnitChange(this: EditPage, event: { detail: { value: string } }) {
    if (!this.data.batchForm) return;
    const unit = this.data.shelfLifeUnits[Number(event.detail.value)] ?? 'DAY';
    this.setData({ batchForm: { ...this.data.batchForm, shelfLifeUnit: unit } });
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
      const categoryId = form.categoryId || firstOrEmpty(this.data.categories);
      await getPhase2Service().updateItem(this.data.detail.item._id, {
        name: form.name.trim(),
        categoryId,
        brand: form.brand.trim() || null,
        specification: form.specification.trim() || null,
        unit: form.unit.trim(),
        defaultLocationId: form.defaultLocationId || null,
        lowStockThreshold: parseOptionalNumber(form.lowStockThreshold, '低库存阈值', { min: 0 }),
        expiryWarningDays: parseOptionalNumber(form.expiryWarningDays, '临期阈值', { integer: true, min: 0 }),
        note: form.note.trim(),
      });
      await this.refreshDetail();
      await this.loadItems();
      this.setData({ submitting: false, result: `物品属性已保存：${form.name.trim()}` });
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (error) {
      this.setData({ submitting: false, error: mapUserError(error) });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  editBatch(this: EditPage, event: { currentTarget: { dataset: { id: string } } }) {
    const batch = this.data.detail?.batches.find((item) => item._id === event.currentTarget.dataset.id);
    if (!batch) return;
    const batchForm = batchFormFromBatch(batch);
    this.setData({ batchForm, selectedBatchLocationName: locationName(this.data.locations, batchForm.locationId), adjustForm: null, result: '', error: '' });
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
      const purchaseDate = normalizeDateInput(form.purchaseDate, '购买日期');
      const productionDate = normalizeDateInput(form.productionDate, '生产日期');
      const expiryDate = resolveExpiryDate({
        expiryDate: form.expiryDate,
        productionDate,
        shelfLifeValue,
        shelfLifeUnit: shelfLifeValue == null ? null : form.shelfLifeUnit,
      });
      await getPhase2Service().updateBatch(form.batchId, {
        locationId: form.locationId || firstOrEmpty(this.data.locations),
        purchaseDate,
        productionDate,
        shelfLifeValue,
        shelfLifeUnit: shelfLifeValue == null ? null : form.shelfLifeUnit,
        expiryDate,
        purchasePrice: parseOptionalNumber(form.purchasePrice, '购买价格', { min: 0 }),
        note: form.note.trim(),
      });
      await this.refreshDetail();
      await this.loadItems();
      this.setData({ submitting: false, batchForm: null, result: '批次属性已保存，并已重新计算提醒状态' });
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (error) {
      this.setData({ submitting: false, error: mapUserError(error) });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  async submitAdjust(this: EditPage) {
    if (this.data.submitting || !this.data.adjustForm || !this.data.detail) return;
    this.setData({ submitting: true, error: '', result: '' });
    try {
      const form = this.data.adjustForm;
      const actualQuantity = parseNonNegativeNumber(form.actualQuantity, '实际数量');
      const result = await getPhase2Service().adjustStock({
        batchId: form.batchId,
        actualQuantity,
        operationId: createUiOperationId('adjust'),
      });
      await this.refreshDetail();
      await this.loadItems();
      this.setData({
        submitting: false,
        adjustForm: null,
        result: result.transaction
          ? `修正成功：库存已由 ${form.systemQuantity}${this.data.detail.item.unit} 修正为 ${actualQuantity}${this.data.detail.item.unit}，ADJUST ${result.diff}`
          : '数量未变化，无需生成 ADJUST',
      });
      wx.showToast({ title: '修正成功', icon: 'success' });
    } catch (error) {
      this.setData({ submitting: false, error: mapUserError(error) });
      wx.showToast({ title: '修正失败', icon: 'none' });
    }
  },
});
