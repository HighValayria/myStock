"use strict";
/// <reference path="../../types/wechat.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const phase2_ui_service_1 = require("../../services/phase2-ui-service");
const phase2_form_1 = require("../../utils/phase2-form");
function toPickRow(row) {
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
    },
    onLoad() { void this.loadItems(); },
    async loadItems() {
        this.setData({ loading: true, error: '' });
        try {
            const rows = await (0, phase2_ui_service_1.listInventoryRows)({ search: this.data.search, positiveOnly: true });
            this.setData({ loading: false, items: rows.map(toPickRow) });
        }
        catch (error) {
            this.setData({ loading: false, error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    onSearchInput(event) {
        this.setData({ search: event.detail.value });
        void this.loadItems();
    },
    async selectItem(event) {
        const itemId = event.currentTarget.dataset.id;
        this.setData({ selectedItemId: itemId, result: '', error: '' });
        try {
            const detail = await (0, phase2_ui_service_1.getItemDetail)(itemId);
            const nearestExpiryText = detail.batches.find((batch) => batch.quantity > 0)?.expiryDate ?? '无';
            this.setData({ detail, nearestExpiryText });
        }
        catch (error) {
            this.setData({ error: (0, phase2_form_1.mapUserError)(error) });
        }
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
            await (0, phase2_ui_service_1.consumeStock)({
                itemId: this.data.selectedItemId,
                quantity,
                note: this.data.note.trim(),
                operationId: (0, phase2_form_1.createUiOperationId)('consume'),
            });
            const detail = await (0, phase2_ui_service_1.getItemDetail)(this.data.selectedItemId);
            const nearestExpiryText = detail.batches.find((batch) => batch.quantity > 0)?.expiryDate ?? '无';
            const message = `消耗成功：已消耗 ${quantity}${detail.item.unit}，剩余 ${detail.totalQuantity}${detail.item.unit}`;
            wx.showToast({ title: '消耗成功', icon: 'success' });
            this.setData({ submitting: false, detail, nearestExpiryText, quantity: '', note: '', result: message });
            void this.loadItems();
        }
        catch (error) {
            this.setData({ submitting: false, error: (0, phase2_form_1.mapUserError)(error) });
            wx.showToast({ title: '消耗失败', icon: 'none' });
        }
    },
});
