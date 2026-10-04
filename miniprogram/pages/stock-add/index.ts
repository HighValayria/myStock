/// <reference path="../../types/wechat.d.ts" />

import type { ShelfLifeUnit } from '../../models';
import type { Phase2CategoryOption, Phase2InventoryRow, Phase2LocationOption, Phase2TaxonomyOptions } from '../../services/phase2-ui-service';
import {
  COMMON_UNITS,
  DEFAULT_UNIT,
  UNKNOWN_EXPIRY_DATE,
  calculateExpiryDateFromShelfLife,
  createUiOperationId,
  isBlank,
  mapUserError,
  normalizeDateInput,
  parseOptionalNumber,
  parsePositiveNumber,
  resolveExpiryDate,
} from '../../utils/phase2-form';

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
  purchaseChannel: string;
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
  isChooseMode: boolean;
  isNewMode: boolean;
  isExistingMode: boolean;
  showAddForm: boolean;
  showMore: boolean;
  showMoreLabel: string;
  loading: boolean;
  submitting: boolean;
  search: string;
  items: PickRow[];
  emptyItems: boolean;
  selectedItemId: string;
  selectedItemName: string;
  result: string;
  error: string;
  form: AddForm;
  shelfLifeUnits: ShelfLifeUnit[];
  shelfLifeUnitLabels: string[];
  commonUnits: string[];
  categories: Phase2CategoryOption[];
  categoryNames: string[];
  selectedCategoryName: string;
  locations: Phase2LocationOption[];
  locationNames: string[];
  selectedLocationName: string;
  newCategoryName: string;
  showNewCategory: boolean;
  newLocationName: string;
  showNewLocation: boolean;
  expectedExpiryText: string;
  directExpiryActive: boolean;
}

interface AddPage {
  data: AddData;
  setData(data: Partial<AddData>): void;
  loadItems(): Promise<void>;
  loadTaxonomy(): Promise<void>;
  refreshExpiryPreview(): void;
  resetForContinue(): void;
  showSuccessModal(content: string): void;
}

const defaultForm: AddForm = {
  name: '',
  categoryId: '',
  brand: '',
  specification: '',
  unit: DEFAULT_UNIT,
  defaultLocationId: '',
  locationId: '',
  quantity: '',
  purchaseDate: '',
  productionDate: '',
  shelfLifeValue: '',
  shelfLifeUnit: 'MONTH',
  expiryDate: '',
  lowStockThreshold: '',
  expiryWarningDays: '',
  purchasePrice: '',
  purchaseChannel: '',
  note: '',
};

function getPhase2Service(): typeof import('../../services/phase2-ui-service') {
  return require('../../services/phase2-ui-service') as typeof import('../../services/phase2-ui-service');
}

function modeFlags(mode: AddData['mode'], selectedItemId = ''): Pick<AddData, 'isChooseMode' | 'isNewMode' | 'isExistingMode' | 'showAddForm'> {
  return {
    isChooseMode: mode === 'choose',
    isNewMode: mode === 'new',
    isExistingMode: mode === 'existing',
    showAddForm: mode === 'new' || Boolean(selectedItemId),
  };
}

function toPickRow(row: Phase2InventoryRow): PickRow {
  return {
    id: row.item._id,
    name: row.label,
    unit: row.item.unit,
    defaultLocationId: row.item.defaultLocationId ?? '',
    totalQuantity: row.totalQuantity,
    summary: `${row.totalQuantity}${row.item.unit}${row.nearestExpiryDate && row.nearestExpiryDate !== UNKNOWN_EXPIRY_DATE ? ` · 最近到期 ${row.nearestExpiryDate}` : ''}`,
  };
}

function firstOrEmpty<T extends { id: string }>(items: T[]): string {
  return items[0]?.id ?? '';
}

function shelfLifeUnitLabel(unit: ShelfLifeUnit): string {
  if (unit === 'DAY') return '天';
  if (unit === 'YEAR') return '年';
  return '个月';
}

function formatExpiryText(expiryDate: string | null, directExpiryActive: boolean): string {
  if (directExpiryActive) return '将使用直接填写的到期日期';
  if (!expiryDate) return '未填写时将按未知到期处理';
  return `预计到期：${expiryDate}`;
}

Page({
  data: {
    mode: 'choose',
    ...modeFlags('choose'),
    showMore: false,
    showMoreLabel: '展开',
    loading: false,
    submitting: false,
    search: '',
    items: [],
    emptyItems: false,
    selectedItemId: '',
    selectedItemName: '',
    result: '',
    error: '',
    form: { ...defaultForm },
    shelfLifeUnits: ['DAY', 'MONTH', 'YEAR'],
    shelfLifeUnitLabels: ['天', '个月', '年'],
    commonUnits: [...COMMON_UNITS],
    categories: [],
    categoryNames: [],
    selectedCategoryName: '默认类别',
    locations: [],
    locationNames: [],
    selectedLocationName: '默认位置',
    newCategoryName: '',
    showNewCategory: false,
    newLocationName: '',
    showNewLocation: false,
    expectedExpiryText: '未填写时将按未知到期处理',
    directExpiryActive: false,
  } as AddData,

  onLoad(this: AddPage) {
    void this.loadTaxonomy();
    void this.loadItems();
  },

  async loadTaxonomy(this: AddPage) {
    try {
      const { getTaxonomyOptions } = getPhase2Service();
      const options: Phase2TaxonomyOptions = await getTaxonomyOptions();
      const categoryId = this.data.form.categoryId || firstOrEmpty(options.categories);
      const locationId = this.data.form.locationId || firstOrEmpty(options.locations);
      const category = options.categories.find((item) => item.id === categoryId);
      const location = options.locations.find((item) => item.id === locationId);
      this.setData({
        categories: options.categories,
        categoryNames: options.categories.map((item) => item.name).concat('＋ 新建类别'),
        selectedCategoryName: category?.name ?? '默认类别',
        locations: options.locations,
        locationNames: options.locations.map((item) => item.label).concat('＋ 新建位置'),
        selectedLocationName: location?.label ?? '默认位置',
        form: { ...this.data.form, categoryId, locationId, defaultLocationId: locationId },
      });
    } catch (error) {
      this.setData({ error: mapUserError(error) });
    }
  },

  async loadItems(this: AddPage) {
    this.setData({ loading: true, error: '' });
    try {
      const { listInventoryRows } = getPhase2Service();
      const rows = await listInventoryRows({ search: this.data.search });
      this.setData({ loading: false, items: rows.map(toPickRow), emptyItems: rows.length === 0 });
    } catch (error) {
      this.setData({ loading: false, error: mapUserError(error), emptyItems: true });
    }
  },

  refreshExpiryPreview(this: AddPage) {
    try {
      const form = this.data.form;
      const shelfLifeValue = parseOptionalNumber(form.shelfLifeValue, '保质期', { integer: true, min: 1 });
      const directExpiryActive = !isBlank(form.expiryDate);
      const calculated = calculateExpiryDateFromShelfLife({
        productionDate: form.productionDate,
        shelfLifeValue,
        shelfLifeUnit: shelfLifeValue == null ? null : form.shelfLifeUnit,
      });
      this.setData({ directExpiryActive, expectedExpiryText: formatExpiryText(calculated, directExpiryActive) });
    } catch (error) {
      this.setData({ expectedExpiryText: mapUserError(error) });
    }
  },

  chooseNew(this: AddPage) {
    const form = {
      ...defaultForm,
      categoryId: this.data.form.categoryId,
      locationId: this.data.form.locationId,
      defaultLocationId: this.data.form.locationId,
      purchaseDate: this.data.form.purchaseDate,
    };
    this.setData({ mode: 'new', selectedItemId: '', selectedItemName: '', result: '', error: '', showMore: false, showMoreLabel: '展开', form, ...modeFlags('new') });
    this.refreshExpiryPreview();
  },

  chooseExisting(this: AddPage) {
    this.setData({ mode: 'existing', result: '', error: '', showMore: false, showMoreLabel: '展开', ...modeFlags('existing', this.data.selectedItemId) });
    void this.loadItems();
  },

  backToChoose(this: AddPage) {
    this.setData({ mode: 'choose', selectedItemId: '', selectedItemName: '', result: '', error: '', ...modeFlags('choose') });
  },

  toggleMore(this: AddPage) {
    const showMore = !this.data.showMore;
    this.setData({ showMore, showMoreLabel: showMore ? '收起' : '展开' });
  },

  onSearchInput(this: AddPage, event: { detail: { value: string } }) {
    this.setData({ search: event.detail.value });
    void this.loadItems();
  },

  selectItem(this: AddPage, event: { currentTarget: { dataset: { id: string } } }) {
    const selected = this.data.items.find((item) => item.id === event.currentTarget.dataset.id);
    if (!selected) return;
    const locationId = selected.defaultLocationId || this.data.form.locationId;
    const location = this.data.locations.find((item) => item.id === locationId);
    this.setData({
      selectedItemId: selected.id,
      selectedItemName: selected.name,
      selectedLocationName: location?.label ?? this.data.selectedLocationName,
      ...modeFlags(this.data.mode, selected.id),
      form: {
        ...this.data.form,
        unit: selected.unit || DEFAULT_UNIT,
        locationId,
      },
    });
  },

  onFieldInput(this: AddPage, event: { currentTarget: { dataset: { field: keyof AddForm } }; detail: { value: string } }) {
    const field = event.currentTarget.dataset.field;
    this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
    if (field === 'productionDate' || field === 'shelfLifeValue' || field === 'expiryDate') this.refreshExpiryPreview();
  },

  onDatePickerChange(this: AddPage, event: { currentTarget: { dataset: { field: keyof AddForm } }; detail: { value: string } }) {
    const field = event.currentTarget.dataset.field;
    this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
    if (field === 'productionDate' || field === 'expiryDate') this.refreshExpiryPreview();
  },

  onShelfLifeUnitChange(this: AddPage, event: { detail: { value: string } }) {
    const unit = this.data.shelfLifeUnits[Number(event.detail.value)] ?? 'MONTH';
    this.setData({ form: { ...this.data.form, shelfLifeUnit: unit } });
    this.refreshExpiryPreview();
  },

  onUnitChange(this: AddPage, event: { detail: { value: string } }) {
    const unit = this.data.commonUnits[Number(event.detail.value)] ?? DEFAULT_UNIT;
    this.setData({ form: { ...this.data.form, unit } });
  },

  onCategoryChange(this: AddPage, event: { detail: { value: string } }) {
    const index = Number(event.detail.value);
    if (index >= this.data.categories.length) {
      this.setData({ showNewCategory: true });
      return;
    }
    const category = this.data.categories[index];
    this.setData({ selectedCategoryName: category.name, form: { ...this.data.form, categoryId: category.id }, showNewCategory: false });
  },

  onLocationChange(this: AddPage, event: { detail: { value: string } }) {
    const index = Number(event.detail.value);
    if (index >= this.data.locations.length) {
      this.setData({ showNewLocation: true });
      return;
    }
    const location = this.data.locations[index];
    this.setData({ selectedLocationName: location.label, form: { ...this.data.form, locationId: location.id, defaultLocationId: location.id }, showNewLocation: false });
  },

  onNewCategoryInput(this: AddPage, event: { detail: { value: string } }) {
    this.setData({ newCategoryName: event.detail.value });
  },

  onNewLocationInput(this: AddPage, event: { detail: { value: string } }) {
    this.setData({ newLocationName: event.detail.value });
  },

  async createCategory(this: AddPage) {
    try {
      const { createCategory } = getPhase2Service();
      const category = await createCategory(this.data.newCategoryName);
      await this.loadTaxonomy();
      this.setData({ selectedCategoryName: category.name, form: { ...this.data.form, categoryId: category.id }, showNewCategory: false, newCategoryName: '' });
    } catch (error) {
      this.setData({ error: mapUserError(error) });
    }
  },

  async createLocation(this: AddPage) {
    try {
      const { createLocation } = getPhase2Service();
      const location = await createLocation(this.data.newLocationName);
      await this.loadTaxonomy();
      this.setData({ selectedLocationName: location.label, form: { ...this.data.form, locationId: location.id, defaultLocationId: location.id }, showNewLocation: false, newLocationName: '' });
    } catch (error) {
      this.setData({ error: mapUserError(error) });
    }
  },

  resetForContinue(this: AddPage) {
    const form = {
      ...defaultForm,
      categoryId: this.data.form.categoryId,
      locationId: this.data.form.locationId,
      defaultLocationId: this.data.form.locationId,
      purchaseDate: this.data.form.purchaseDate,
    };
    this.setData({ mode: 'choose', selectedItemId: '', selectedItemName: '', result: '', error: '', showMore: false, showMoreLabel: '展开', form, ...modeFlags('choose') });
    this.refreshExpiryPreview();
    void this.loadItems();
  },

  showSuccessModal(this: AddPage, content: string) {
    wx.showModal({
      title: '添加成功',
      content,
      confirmText: '继续添加',
      cancelText: '回首页',
      success: (res) => {
        if (res.confirm) this.resetForContinue();
        else wx.navigateBack({ delta: 1 });
      },
    });
  },

  async submit(this: AddPage) {
    if (this.data.submitting) return;
    this.setData({ submitting: true, error: '', result: '' });
    try {
      const form = this.data.form;
      const quantity = parsePositiveNumber(form.quantity, '数量');
      const purchaseDate = normalizeDateInput(form.purchaseDate, '购买日期');
      const productionDate = normalizeDateInput(form.productionDate, '生产日期');
      const shelfLifeValue = parseOptionalNumber(form.shelfLifeValue, '保质期', { integer: true, min: 1 });
      const expiryDate = resolveExpiryDate({
        expiryDate: form.expiryDate,
        productionDate,
        shelfLifeValue,
        shelfLifeUnit: shelfLifeValue == null ? null : form.shelfLifeUnit,
        allowUnknown: true,
      });
      const lowStockThreshold = parseOptionalNumber(form.lowStockThreshold, '低库存阈值', { min: 0 });
      const expiryWarningDays = parseOptionalNumber(form.expiryWarningDays, '临期阈值', { integer: true, min: 0 });
      const purchasePrice = parseOptionalNumber(form.purchasePrice, '购买价格', { min: 0 });
      const locationId = form.locationId || firstOrEmpty(this.data.locations) || 'default_location';
      const categoryId = form.categoryId || firstOrEmpty(this.data.categories) || 'default_category';
      const unit = (form.unit || DEFAULT_UNIT).trim() || DEFAULT_UNIT;

      if (this.data.mode === 'new' && isBlank(form.name)) throw new Error('请填写物品名称');
      if (this.data.mode === 'existing' && !this.data.selectedItemId) throw new Error('请选择已有物品');

      const { addStock } = getPhase2Service();
      const result = await addStock({
        itemId: this.data.mode === 'existing' ? this.data.selectedItemId : undefined,
        item: this.data.mode === 'new'
          ? {
              name: form.name.trim(),
              categoryId,
              brand: form.brand.trim() || null,
              specification: form.specification.trim() || null,
              unit,
              defaultLocationId: form.defaultLocationId || locationId,
              lowStockThreshold,
              expiryWarningDays,
              note: form.note.trim(),
            }
          : undefined,
        quantity,
        locationId,
        purchaseDate,
        productionDate,
        shelfLifeValue,
        shelfLifeUnit: shelfLifeValue == null ? null : form.shelfLifeUnit,
        expiryDate,
        purchasePrice,
        purchaseChannel: form.purchaseChannel.trim() || null,
        note: form.note.trim(),
        operationId: createUiOperationId('add'),
      });

      const name = this.data.mode === 'new' ? form.name.trim() : this.data.selectedItemName;
      const message = `已增加：${name || result.item.name} ${quantity}${result.item.unit || unit}`;
      wx.showToast({ title: '增加成功', icon: 'success' });
      this.setData({ submitting: false, result: message, error: '' });
      this.showSuccessModal(message);
    } catch (error) {
      this.setData({ submitting: false, error: mapUserError(error) });
      wx.showToast({ title: '增加失败', icon: 'none' });
    }
  },
});