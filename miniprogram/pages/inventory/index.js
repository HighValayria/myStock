"use strict";
/// <reference path="../../types/wechat.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const phase2_form_1 = require("../../utils/phase2-form");
const phase3_view_1 = require("../../utils/phase3-view");
const expiryStatusValues = ['', 'NORMAL', 'EXPIRING', 'EXPIRED'];
const stockStatusValues = ['', 'NORMAL', 'LOW', 'ZERO'];
const sortValues = ['nearestExpiry', 'remainingDays', 'quantity', 'recentAdd', 'recentConsume', 'name'];
const sortNames = ['最近到期', '剩余天数', '当前数量', '最近增加', '最近消耗', '名称'];
function getPhase2Service() {
    return require('../../services/phase2-ui-service');
}
function classForExpiry(status) {
    if (status === 'EXPIRED')
        return 'danger';
    if (status === 'EXPIRING')
        return 'warning';
    return 'normal';
}
function classForStock(status) {
    if (status === 'ZERO')
        return 'danger';
    if (status === 'LOW')
        return 'warning';
    return 'normal';
}
function toViewRow(row) {
    const remainingText = row.nearestRemainingDays == null ? '未知' : String(row.nearestRemainingDays);
    return {
        id: row.item._id,
        name: row.item.name,
        specification: row.item.specification || '',
        quantityText: `${row.totalQuantity}${row.item.unit}`,
        unit: row.item.unit,
        locationText: row.locationSummary || '未设置位置',
        expiryText: row.nearestExpiryDate ? (0, phase3_view_1.formatDate)(row.nearestExpiryDate) : '无到期日',
        remainingText,
        expiryStatusText: (0, phase3_view_1.expiryStatusLabel)(row.expiryStatus),
        stockStatusText: (0, phase3_view_1.stockStatusLabel)(row.stockStatus),
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
    },
    onLoad() {
        void this.loadOptions();
    },
    onShow() {
        void this.loadRows();
    },
    onPullDownRefresh() {
        void this.loadRows().finally(() => wx.stopPullDownRefresh());
    },
    async loadOptions() {
        try {
            const { getTaxonomyOptions } = getPhase2Service();
            const options = await getTaxonomyOptions();
            this.setData({
                categories: options.categories,
                locations: options.locations,
                categoryNames: ['全部分类'].concat(options.categories.map((item) => item.name)),
                locationNames: ['全部位置'].concat(options.locations.map((item) => item.label)),
            });
        }
        catch (error) {
            this.setData({ error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    async loadRows() {
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
        }
        catch (error) {
            this.setData({ loading: false, error: (0, phase2_form_1.mapUserError)(error), emptyRows: true });
        }
    },
    onSearchInput(event) {
        this.setData({ search: event.detail.value });
        void this.loadRows();
    },
    onCategoryChange(event) {
        const index = Number(event.detail.value);
        const category = index === 0 ? null : this.data.categories[index - 1];
        this.setData({ selectedCategoryId: category?.id ?? '', selectedCategoryName: category?.name ?? '全部分类' });
        void this.loadRows();
    },
    onLocationChange(event) {
        const index = Number(event.detail.value);
        const location = index === 0 ? null : this.data.locations[index - 1];
        this.setData({ selectedLocationId: location?.id ?? '', selectedLocationName: location?.label ?? '全部位置' });
        void this.loadRows();
    },
    onExpiryStatusChange(event) {
        const index = Number(event.detail.value);
        this.setData({ selectedExpiryStatus: expiryStatusValues[index] || '', selectedExpiryStatusName: this.data.expiryStatusNames[index] || '全部保质期' });
        void this.loadRows();
    },
    onStockStatusChange(event) {
        const index = Number(event.detail.value);
        this.setData({ selectedStockStatus: stockStatusValues[index] || '', selectedStockStatusName: this.data.stockStatusNames[index] || '全部库存' });
        void this.loadRows();
    },
    onSortChange(event) {
        const index = Number(event.detail.value);
        this.setData({ selectedSort: sortValues[index] || 'nearestExpiry', selectedSortName: sortNames[index] || '最近到期' });
        void this.loadRows();
    },
    setListMode() {
        this.setData({ viewMode: 'list' });
    },
    setTableMode() {
        this.setData({ viewMode: 'table' });
    },
    openDetail(event) {
        const itemId = event.currentTarget.dataset.id;
        if (!itemId)
            return;
        wx.navigateTo({ url: `/pages/item-detail/index?itemId=${itemId}` });
    },
    goAdd() { wx.navigateTo({ url: '/pages/stock-add/index' }); },
});
