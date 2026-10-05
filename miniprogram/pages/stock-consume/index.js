"use strict";
/// <reference path="../../types/wechat.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const phase2_form_1 = require("../../utils/phase2-form");
function getPhase2Service() {
    return require('../../services/phase2-ui-service');
}
function itemDisplayName(item) {
    return `${item.name}${item.specification ? ` ${item.specification}` : ''}`;
}
function toPickRow(row) {
    const expiry = row.nearestExpiryDate && row.nearestExpiryDate !== phase2_form_1.UNKNOWN_EXPIRY_DATE ? row.nearestExpiryDate : '无';
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
    },
    onLoad(options) {
        void Promise.all([this.loadCategories(), this.loadItems()]).then(() => {
            if (options.itemId)
                void this.selectItemById(options.itemId);
        });
    },
    async loadCategories() {
        try {
            const { getTaxonomyOptions } = getPhase2Service();
            const options = await getTaxonomyOptions();
            this.setData({ categories: options.categories, categoryNames: ['全部'].concat(options.categories.map((item) => item.name)) });
        }
        catch (error) {
            this.setData({ error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    async loadItems() {
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
        }
        catch (error) {
            this.setData({ loading: false, error: (0, phase2_form_1.mapUserError)(error), emptyRecentItems: true, emptyItems: true });
        }
    },
    onSearchInput(event) {
        this.setData({ search: event.detail.value });
        void this.loadItems();
    },
    onCategoryChange(event) {
        const index = Number(event.detail.value);
        const category = index === 0 ? null : this.data.categories[index - 1];
        this.setData({ selectedCategoryId: category?.id ?? '', selectedCategoryName: category?.name ?? '全部', selectedItemId: '', detail: null, selectedItemName: '', nearestExpiryText: '' });
        void this.loadItems();
    },
    async selectItemById(itemId) {
        this.setData({ selectedItemId: itemId, result: '', error: '' });
        try {
            const { getItemDetail } = getPhase2Service();
            const detail = await getItemDetail(itemId);
            const nearestExpiry = detail.batches.find((batch) => batch.quantity > 0)?.expiryDate;
            const nearestExpiryText = nearestExpiry && nearestExpiry !== phase2_form_1.UNKNOWN_EXPIRY_DATE ? nearestExpiry : '无';
            this.setData({ detail, selectedItemName: itemDisplayName(detail.item), nearestExpiryText });
        }
        catch (error) {
            this.setData({ error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    async selectItem(event) {
        await this.selectItemById(event.currentTarget.dataset.id);
    },
    onFieldInput(event) {
        const field = event.currentTarget.dataset.field;
        this.setData({ [field]: event.detail.value });
    },
    async submit() {
        if (this.data.submitting)
            return;
        this.setData({ submitting: true, error: '', result: '' });
        try {
            if (!this.data.selectedItemId || !this.data.detail)
                throw new Error('请选择要消耗的物品');
            const quantity = (0, phase2_form_1.parsePositiveNumber)(this.data.quantity, '消耗数量');
            if (quantity > this.data.detail.totalQuantity) {
                throw new Error(`当前库存仅剩 ${this.data.detail.totalQuantity}${this.data.detail.item.unit}，无法消耗 ${quantity}${this.data.detail.item.unit}。`);
            }
            const { consumeStock, getItemDetail } = getPhase2Service();
            await consumeStock({
                itemId: this.data.selectedItemId,
                quantity,
                note: this.data.note.trim(),
                operationId: (0, phase2_form_1.createUiOperationId)('consume'),
            });
            const detail = await getItemDetail(this.data.selectedItemId);
            const nearestExpiry = detail.batches.find((batch) => batch.quantity > 0)?.expiryDate;
            const nearestExpiryText = nearestExpiry && nearestExpiry !== phase2_form_1.UNKNOWN_EXPIRY_DATE ? nearestExpiry : '无';
            const message = `消耗成功：已消耗 ${quantity}${detail.item.unit}，剩余 ${detail.totalQuantity}${detail.item.unit}`;
            wx.showToast({ title: '消耗成功', icon: 'success' });
            this.setData({ submitting: false, detail, selectedItemName: itemDisplayName(detail.item), nearestExpiryText, quantity: '', note: '', result: message });
            void this.loadItems();
        }
        catch (error) {
            this.setData({ submitting: false, error: (0, phase2_form_1.mapUserError)(error) });
            wx.showToast({ title: '消耗失败', icon: 'none' });
        }
    },
});
