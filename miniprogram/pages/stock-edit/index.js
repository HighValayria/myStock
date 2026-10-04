"use strict";
/// <reference path="../../types/wechat.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const phase2_ui_service_1 = require("../../services/phase2-ui-service");
const phase2_form_1 = require("../../utils/phase2-form");
const emptyItemForm = {
    name: '', categoryId: '', brand: '', specification: '', unit: '', defaultLocationId: '', lowStockThreshold: '', expiryWarningDays: '', note: '',
};
function toPickRow(row) {
    return {
        id: row.item._id,
        name: row.label,
        summary: `${row.totalQuantity}${row.item.unit}${row.nearestExpiryDate ? ` · 最近到期 ${row.nearestExpiryDate}` : ''}`,
    };
}
function itemFormFromDetail(detail) {
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
function batchFormFromBatch(batch) {
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
    },
    onLoad() { void this.loadItems(); },
    async loadItems() {
        this.setData({ loading: true, error: '' });
        try {
            const rows = await (0, phase2_ui_service_1.listInventoryRows)({ search: this.data.search });
            this.setData({ loading: false, items: rows.map(toPickRow) });
        }
        catch (error) {
            this.setData({ loading: false, error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    async refreshDetail() {
        if (!this.data.selectedItemId)
            return;
        const detail = await (0, phase2_ui_service_1.getItemDetail)(this.data.selectedItemId);
        this.setData({ detail, itemForm: itemFormFromDetail(detail) });
    },
    onSearchInput(event) {
        this.setData({ search: event.detail.value });
        void this.loadItems();
    },
    async selectItem(event) {
        const itemId = event.currentTarget.dataset.id;
        this.setData({ selectedItemId: itemId, result: '', error: '', batchForm: null, adjustForm: null });
        try {
            await this.refreshDetail();
        }
        catch (error) {
            this.setData({ error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    onItemFieldInput(event) {
        const field = event.currentTarget.dataset.field;
        this.setData({ itemForm: { ...this.data.itemForm, [field]: event.detail.value } });
    },
    onBatchFieldInput(event) {
        if (!this.data.batchForm)
            return;
        const field = event.currentTarget.dataset.field;
        this.setData({ batchForm: { ...this.data.batchForm, [field]: event.detail.value } });
    },
    onBatchShelfLifeUnitChange(event) {
        if (!this.data.batchForm)
            return;
        const units = ['DAY', 'MONTH', 'YEAR'];
        this.setData({ batchForm: { ...this.data.batchForm, shelfLifeUnit: units[Number(event.detail.value)] ?? 'DAY' } });
    },
    onAdjustInput(event) {
        if (!this.data.adjustForm)
            return;
        this.setData({ adjustForm: { ...this.data.adjustForm, actualQuantity: event.detail.value } });
    },
    async saveItem() {
        if (this.data.submitting || !this.data.detail)
            return;
        this.setData({ submitting: true, error: '', result: '' });
        try {
            const form = this.data.itemForm;
            if ((0, phase2_form_1.isBlank)(form.name))
                throw new Error('请填写物品名称');
            if ((0, phase2_form_1.isBlank)(form.unit))
                throw new Error('请填写单位');
            const updated = await (0, phase2_ui_service_1.updateItem)(this.data.detail.item._id, {
                name: form.name.trim(),
                categoryId: form.categoryId.trim() || 'default_category',
                brand: form.brand.trim() || null,
                specification: form.specification.trim() || null,
                unit: form.unit.trim(),
                defaultLocationId: form.defaultLocationId.trim() || null,
                lowStockThreshold: (0, phase2_form_1.parseOptionalNumber)(form.lowStockThreshold, '低库存阈值', { min: 0 }),
                expiryWarningDays: (0, phase2_form_1.parseOptionalNumber)(form.expiryWarningDays, '临期阈值', { integer: true, min: 0 }),
                note: form.note.trim(),
            });
            await this.refreshDetail();
            this.setData({ submitting: false, result: `物品属性已保存：${updated.name}` });
            wx.showToast({ title: '保存成功', icon: 'success' });
        }
        catch (error) {
            this.setData({ submitting: false, error: (0, phase2_form_1.mapUserError)(error) });
            wx.showToast({ title: '保存失败', icon: 'none' });
        }
    },
    editBatch(event) {
        const batch = this.data.detail?.batches.find((item) => item._id === event.currentTarget.dataset.id);
        if (!batch)
            return;
        this.setData({ batchForm: batchFormFromBatch(batch), adjustForm: null, result: '', error: '' });
    },
    adjustBatch(event) {
        const batch = this.data.detail?.batches.find((item) => item._id === event.currentTarget.dataset.id);
        if (!batch)
            return;
        this.setData({ adjustForm: { batchId: batch._id, actualQuantity: String(batch.quantity), systemQuantity: batch.quantity }, batchForm: null, result: '', error: '' });
    },
    async saveBatch() {
        if (this.data.submitting || !this.data.batchForm)
            return;
        this.setData({ submitting: true, error: '', result: '' });
        try {
            const form = this.data.batchForm;
            const shelfLifeValue = (0, phase2_form_1.parseOptionalNumber)(form.shelfLifeValue, '保质期', { integer: true, min: 1 });
            const expiryDate = (0, phase2_form_1.resolveExpiryDate)({
                expiryDate: form.expiryDate,
                productionDate: form.productionDate.trim() || null,
                shelfLifeValue,
                shelfLifeUnit: shelfLifeValue == null ? null : form.shelfLifeUnit,
            });
            await (0, phase2_ui_service_1.updateBatch)(form.batchId, {
                locationId: form.locationId.trim() || 'default_location',
                purchaseDate: form.purchaseDate.trim() || null,
                productionDate: form.productionDate.trim() || null,
                shelfLifeValue,
                shelfLifeUnit: shelfLifeValue == null ? null : form.shelfLifeUnit,
                expiryDate,
                purchasePrice: (0, phase2_form_1.parseOptionalNumber)(form.purchasePrice, '购买价格', { min: 0 }),
                note: form.note.trim(),
            });
            await this.refreshDetail();
            this.setData({ submitting: false, batchForm: null, result: '批次属性已保存，并已重新计算提醒状态' });
            wx.showToast({ title: '保存成功', icon: 'success' });
        }
        catch (error) {
            this.setData({ submitting: false, error: (0, phase2_form_1.mapUserError)(error) });
            wx.showToast({ title: '保存失败', icon: 'none' });
        }
    },
    async submitAdjust() {
        if (this.data.submitting || !this.data.adjustForm)
            return;
        this.setData({ submitting: true, error: '', result: '' });
        try {
            const form = this.data.adjustForm;
            const actualQuantity = (0, phase2_form_1.parseNonNegativeNumber)(form.actualQuantity, '实际数量');
            const result = await (0, phase2_ui_service_1.adjustStock)({
                batchId: form.batchId,
                actualQuantity,
                operationId: (0, phase2_form_1.createUiOperationId)('adjust'),
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
        }
        catch (error) {
            this.setData({ submitting: false, error: (0, phase2_form_1.mapUserError)(error) });
            wx.showToast({ title: '修正失败', icon: 'none' });
        }
    },
});
