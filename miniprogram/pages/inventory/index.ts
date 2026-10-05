/// <reference path="../../types/wechat.d.ts" />

import type { ExpiryStatus, StockStatus } from '../../models';
import type { Phase2CategoryOption, Phase2InventoryRow, Phase2LocationOption, Phase3InventoryQuery } from '../../services/phase2-ui-service';
import { mapUserError } from '../../utils/phase2-form';
import { expiryStatusLabel, formatDate, stockStatusLabel } from '../../utils/phase3-view';

interface ViewRow {
  id: string;
  name: string;
  specification: string;
  quantityText: string;
  unit: string;
  locationText: string;
  expiryText: string;
  remainingText: string;
  expiryStatusText: string;
  stockStatusText: string;
  expiryClass: string;
  stockClass: string;
}

interface InventoryData {
  loading: boolean;
  error: string;
  search: string;
  categories: Phase2CategoryOption[];
  locations: Phase2LocationOption[];
  categoryNames: string[];
  locationNames: string[];
  expiryStatusNames: string[];
  stockStatusNames: string[];
  sortNames: string[];
  selectedCategoryId: string;
  selectedLocationId: string;
  selectedExpiryStatus: '' | ExpiryStatus;
  selectedStockStatus: '' | StockStatus;
  selectedSort: Phase3InventoryQuery['sortBy'];
  selectedCategoryName: string;
  selectedLocationName: string;
  selectedExpiryStatusName: string;
  selectedStockStatusName: string;
  selectedSortName: string;
  viewMode: 'list' | 'table';
  rows: ViewRow[];
  emptyRows: boolean;
}

interface InventoryPage {
  data: InventoryData;
  setData(data: Partial<InventoryData>): void;
  loadOptions(): Promise<void>;
  loadRows(): Promise<void>;
}

const expiryStatusValues: Array<'' | ExpiryStatus> = ['', 'NORMAL', 'EXPIRING', 'EXPIRED'];
const stockStatusValues: Array<'' | StockStatus> = ['', 'NORMAL', 'LOW', 'ZERO'];
const sortValues: Array<Phase3InventoryQuery['sortBy']> = ['nearestExpiry', 'remainingDays', 'quantity', 'recentAdd', 'recentConsume', 'name'];
const sortNames = ['最近到期', '剩余天数', '当前数量', '最近增加', '最近消耗', '名称'];

function getPhase2Service(): typeof import('../../services/phase2-ui-service') {
  return require('../../services/phase2-ui-service') as typeof import('../../services/phase2-ui-service');
}

function classForExpiry(status: ExpiryStatus): string {
  if (status === 'EXPIRED') return 'danger';
  if (status === 'EXPIRING') return 'warning';
  return 'normal';
}

function classForStock(status: StockStatus): string {
  if (status === 'ZERO') return 'danger';
  if (status === 'LOW') return 'warning';
  return 'normal';
}

function toViewRow(row: Phase2InventoryRow): ViewRow {
  const remainingText = row.nearestRemainingDays == null ? '未知' : String(row.nearestRemainingDays);
  return {
    id: row.item._id,
    name: row.item.name,
    specification: row.item.specification || '',
    quantityText: `${row.totalQuantity}${row.item.unit}`,
    unit: row.item.unit,
    locationText: row.locationSummary || '未设置位置',
    expiryText: row.nearestExpiryDate ? formatDate(row.nearestExpiryDate) : '无到期日',
    remainingText,
    expiryStatusText: expiryStatusLabel(row.expiryStatus),
    stockStatusText: stockStatusLabel(row.stockStatus),
    expiryClass: classForExpiry(row.expiryStatus),
    stockClass: classForStock(row.stockStatus),
  };
}

Page({
  data: {
    loading: false,
    error: '',
    search: '',
    categories: [],
    locations: [],
    categoryNames: ['全部分类'],
    locationNames: ['全部位置'],
    expiryStatusNames: ['全部保质期', '正常', '临期', '已过期'],
    stockStatusNames: ['全部库存', '正常', '低库存', '零库存'],
    sortNames,
    selectedCategoryId: '',
    selectedLocationId: '',
    selectedExpiryStatus: '',
    selectedStockStatus: '',
    selectedSort: 'nearestExpiry',
    selectedCategoryName: '全部分类',
    selectedLocationName: '全部位置',
    selectedExpiryStatusName: '全部保质期',
    selectedStockStatusName: '全部库存',
    selectedSortName: '最近到期',
    viewMode: 'list',
    rows: [],
    emptyRows: false,
  } as InventoryData,

  onLoad(this: InventoryPage) {
    void this.loadOptions();
    void this.loadRows();
  },

  onPullDownRefresh(this: InventoryPage) {
    void this.loadRows().finally(() => (wx as any).stopPullDownRefresh());
  },

  async loadOptions(this: InventoryPage) {
    try {
      const { getTaxonomyOptions } = getPhase2Service();
      const options = await getTaxonomyOptions();
      this.setData({
        categories: options.categories,
        locations: options.locations,
        categoryNames: ['全部分类'].concat(options.categories.map((item) => item.name)),
        locationNames: ['全部位置'].concat(options.locations.map((item) => item.label)),
      });
    } catch (error) {
      this.setData({ error: mapUserError(error) });
    }
  },

  async loadRows(this: InventoryPage) {
    this.setData({ loading: true, error: '' });
    try {
      const { listInventoryRows } = getPhase2Service();
      const rows = await listInventoryRows({
        search: this.data.search,
        categoryId: this.data.selectedCategoryId,
        locationId: this.data.selectedLocationId,
        expiryStatus: this.data.selectedExpiryStatus,
        stockStatus: this.data.selectedStockStatus,
        sortBy: this.data.selectedSort,
      });
      this.setData({ loading: false, rows: rows.map(toViewRow), emptyRows: rows.length === 0 });
    } catch (error) {
      this.setData({ loading: false, error: mapUserError(error), emptyRows: true });
    }
  },

  onSearchInput(this: InventoryPage, event: { detail: { value: string } }) {
    this.setData({ search: event.detail.value });
    void this.loadRows();
  },

  onCategoryChange(this: InventoryPage, event: { detail: { value: string } }) {
    const index = Number(event.detail.value);
    const category = index === 0 ? null : this.data.categories[index - 1];
    this.setData({ selectedCategoryId: category?.id ?? '', selectedCategoryName: category?.name ?? '全部分类' });
    void this.loadRows();
  },

  onLocationChange(this: InventoryPage, event: { detail: { value: string } }) {
    const index = Number(event.detail.value);
    const location = index === 0 ? null : this.data.locations[index - 1];
    this.setData({ selectedLocationId: location?.id ?? '', selectedLocationName: location?.label ?? '全部位置' });
    void this.loadRows();
  },

  onExpiryStatusChange(this: InventoryPage, event: { detail: { value: string } }) {
    const index = Number(event.detail.value);
    this.setData({ selectedExpiryStatus: expiryStatusValues[index] || '', selectedExpiryStatusName: this.data.expiryStatusNames[index] || '全部保质期' });
    void this.loadRows();
  },

  onStockStatusChange(this: InventoryPage, event: { detail: { value: string } }) {
    const index = Number(event.detail.value);
    this.setData({ selectedStockStatus: stockStatusValues[index] || '', selectedStockStatusName: this.data.stockStatusNames[index] || '全部库存' });
    void this.loadRows();
  },

  onSortChange(this: InventoryPage, event: { detail: { value: string } }) {
    const index = Number(event.detail.value);
    this.setData({ selectedSort: sortValues[index] || 'nearestExpiry', selectedSortName: sortNames[index] || '最近到期' });
    void this.loadRows();
  },

  setListMode(this: InventoryPage) {
    this.setData({ viewMode: 'list' });
  },

  setTableMode(this: InventoryPage) {
    this.setData({ viewMode: 'table' });
  },

  openDetail(this: InventoryPage, event: { currentTarget: { dataset: { id: string } } }) {
    const itemId = event.currentTarget.dataset.id;
    if (!itemId) return;
    wx.navigateTo({ url: `/pages/item-detail/index?itemId=${itemId}` });
  },

  goAdd() { wx.navigateTo({ url: '/pages/stock-add/index' }); },
});
