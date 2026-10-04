/// <reference path="../../types/wechat.d.ts" />

import type { ShelfLifeUnit } from '../../models';
import { addStock, listInventoryRows } from '../../services/phase2-ui-service';
import type { Phase2InventoryRow } from '../../services/phase2-ui-service';
import { createUiOperationId, isBlank, mapUserError, parseOptionalNumber, parsePositiveNumber, resolveExpiryDate } from '../../utils/phase2-form';

interface AddForm {
  name: string;
  categoryId: string;
  brand: string;
  specification: string;
  unit: string;
  defaultLocationId: string;
  locationId: string;
  quantity: string;
  purchaseDate: string;
  productionDate: string;
  shelfLifeValue: string;
  shelfLifeUnit: ShelfLifeUnit;
  expiryDate: string;
  lowStockThreshold: string;
  expiryWarningDays: string;
  purchasePrice: string;
  note: string;
}

interface PickRow {
  id: string;
  name: string;
  unit: string;
  defaultLocationId: string;
  totalQuantity: number;
  summary: string;
}

interface AddData {
  mode: 'choose' | 'new' | 'existing';
  loading: boolean;
  submitting: boolean;
  search: string;
  items: PickRow[];
  selectedItemId: string;
  selectedItemName: string;
  result: string;
  error: string;
  form: AddForm;
  shelfLifeUnits: ShelfLifeUnit[];
}

interface AddPage {
  data: AddData;
  setData(data: Partial<AddData>): void;
  loadItems(): Promise<void>;
}

const defaultForm: AddForm = {
  name: '',
  categoryId: 'default_category',
  brand: '',
  specification: '',
  unit: '',
  defaultLocationId: 'default_location',
  locationId: 'default_location',
  quantity: '',
  purchaseDate: '',
  productionDate: '',
  shelfLifeValue: '',
  shelfLifeUnit: 'DAY',
  expiryDate: '',
  lowStockThreshold: '',
  expiryWarningDays: '7',
  purchasePrice: '',
  note: '',
};

function toPickRow(row: Phase2InventoryRow): PickRow {
  return {
    id: row.item._id,
    name: row.label,
    unit: row.item.unit,
    defaultLocationId: row.item.defaultLocationId ?? 'default_location',
    totalQuantity: row.totalQuantity,
    summary: `${row.totalQuantity}${row.item.unit}${row.nearestExpiryDate ? ` · 最近到期 ${row.nearestExpiryDate}` : ''}`,
  };
}

Page({
  data: {
    mode: 'choose',
    loading: false,
    submitting: false,
    search: '',
    items: [],
    selectedItemId: '',
    selectedItemName: '',
    result: '',
    error: '',
    form: { ...defaultForm },
    shelfLifeUnits: ['DAY', 'MONTH', 'YEAR'],
  } as AddData,

  onLoad(this: AddPage) {
    void this.loadItems();
  },

  async loadItems(this: AddPage) {
    this.setData({ loading: true, error: '' });
    try {
      const rows = await listInventoryRows({ search: this.data.search });
      this.setData({ loading: false, items: rows.map(toPickRow) });
    } catch (error) {
      this.setData({ loading: false, error: mapUserError(error) });
    }
  },

  chooseNew(this: AddPage) {
    this.setData({ mode: 'new', selectedItemId: '', selectedItemName: '', result: '', error: '', form: { ...defaultForm } });
  },

  chooseExisting(this: AddPage) {
    this.setData({ mode: 'existing', result: '', error: '' });
    void this.loadItems();
  },

  backToChoose(this: AddPage) {
    this.setData({ mode: 'choose', result: '', error: '' });
  },

  onSearchInput(this: AddPage, event: { detail: { value: string } }) {
    this.setData({ search: event.detail.value });
    void this.loadItems();
  },

  selectItem(this: AddPage, event: { currentTarget: { dataset: { id: string } } }) {
    const selected = this.data.items.find((item) => item.id === event.currentTarget.dataset.id);
    if (!selected) return;
    this.setData({
      selectedItemId: selected.id,
      selectedItemName: selected.name,
      form: {
        ...this.data.form,
        unit: selected.unit,
        locationId: selected.defaultLocationId || 'default_location',
      },
    });
  },

  onFieldInput(this: AddPage, event: { currentTarget: { dataset: { field: keyof AddForm } }; detail: { value: string } }) {
    const field = event.currentTarget.dataset.field;
    this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
  },

  onShelfLifeUnitChange(this: AddPage, event: { detail: { value: string } }) {
    const units: ShelfLifeUnit[] = ['DAY', 'MONTH', 'YEAR'];
    this.setData({ form: { ...this.data.form, shelfLifeUnit: units[Number(event.detail.value)] ?? 'DAY' } });
  },

  async submit(this: AddPage) {
    if (this.data.submitting) return;
    this.setData({ submitting: true, error: '', result: '' });
    try {
      const form = this.data.form;
      const quantity = parsePositiveNumber(form.quantity, '数量');
      const shelfLifeValue = parseOptionalNumber(form.shelfLifeValue, '保质期', { integer: true, min: 1 });
      const expiryDate = resolveExpiryDate({
        expiryDate: form.expiryDate,
        productionDate: isBlank(form.productionDate) ? null : form.productionDate,
        shelfLifeValue,
        shelfLifeUnit: shelfLifeValue == null ? null : form.shelfLifeUnit,
      });
      const lowStockThreshold = parseOptionalNumber(form.lowStockThreshold, '低库存阈值', { min: 0 });
      const expiryWarningDays = parseOptionalNumber(form.expiryWarningDays, '临期阈值', { integer: true, min: 0 });
      const purchasePrice = parseOptionalNumber(form.purchasePrice, '购买价格', { min: 0 });
      const locationId = form.locationId.trim() || 'default_location';

      if (this.data.mode === 'new') {
        if (isBlank(form.name)) throw new Error('请填写物品名称');
        if (isBlank(form.unit)) throw new Error('请填写单位');
      } else if (!this.data.selectedItemId) {
        throw new Error('请选择已有物品');
      }

      const result = await addStock({
        itemId: this.data.mode === 'existing' ? this.data.selectedItemId : undefined,
        item: this.data.mode === 'new'
          ? {
              name: form.name.trim(),
              categoryId: form.categoryId.trim() || 'default_category',
              brand: form.brand.trim() || null,
              specification: form.specification.trim() || null,
              unit: form.unit.trim(),
              defaultLocationId: form.defaultLocationId.trim() || locationId,
              lowStockThreshold,
              expiryWarningDays,
              note: form.note.trim(),
            }
          : undefined,
        quantity,
        locationId,
        purchaseDate: form.purchaseDate.trim() || null,
        productionDate: form.productionDate.trim() || null,
        shelfLifeValue,
        shelfLifeUnit: shelfLifeValue == null ? null : form.shelfLifeUnit,
        expiryDate,
        purchasePrice,
        note: form.note.trim(),
        operationId: createUiOperationId('add'),
      });

      const name = this.data.mode === 'new' ? form.name.trim() : this.data.selectedItemName;
      const message = `增加成功：已加入 ${quantity}${result.item.unit || form.unit} ${name}`;
      wx.showToast({ title: '增加成功', icon: 'success' });
      this.setData({ submitting: false, result: message, error: '' });
      void this.loadItems();
    } catch (error) {
      this.setData({ submitting: false, error: mapUserError(error) });
      wx.showToast({ title: '增加失败', icon: 'none' });
    }
  },
});
