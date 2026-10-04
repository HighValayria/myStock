"use strict";
/// <reference path="../../types/wechat.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const phase2_ui_service_1 = require("../../services/phase2-ui-service");
const phase2_form_1 = require("../../utils/phase2-form");
const defaultForm = {
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
function toPickRow(row) {
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
    },
    onLoad() {
        void this.loadItems();
    },
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
    chooseNew() {
        this.setData({ mode: 'new', selectedItemId: '', selectedItemName: '', result: '', error: '', form: { ...defaultForm } });
    },
    chooseExisting() {
        this.setData({ mode: 'existing', result: '', error: '' });
        void this.loadItems();
    },
    backToChoose() {
        this.setData({ mode: 'choose', result: '', error: '' });
    },
    onSearchInput(event) {
        this.setData({ search: event.detail.value });
        void this.loadItems();
    },
    selectItem(event) {
        const selected = this.data.items.find((item) => item.id === event.currentTarget.dataset.id);
        if (!selected)
            return;
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
    onFieldInput(event) {
        const field = event.currentTarget.dataset.field;
        this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
    },
    onShelfLifeUnitChange(event) {
        const units = ['DAY', 'MONTH', 'YEAR'];
        this.setData({ form: { ...this.data.form, shelfLifeUnit: units[Number(event.detail.value)] ?? 'DAY' } });
    },
    async submit() {
        if (this.data.submitting)
            return;
        this.setData({ submitting: true, error: '', result: '' });
        try {
            const form = this.data.form;
            const quantity = (0, phase2_form_1.parsePositiveNumber)(form.quantity, '数量');
            const shelfLifeValue = (0, phase2_form_1.parseOptionalNumber)(form.shelfLifeValue, '保质期', { integer: true, min: 1 });
            const expiryDate = (0, phase2_form_1.resolveExpiryDate)({
                expiryDate: form.expiryDate,
                productionDate: (0, phase2_form_1.isBlank)(form.productionDate) ? null : form.productionDate,
                shelfLifeValue,
                shelfLifeUnit: shelfLifeValue == null ? null : form.shelfLifeUnit,
            });
            const lowStockThreshold = (0, phase2_form_1.parseOptionalNumber)(form.lowStockThreshold, '低库存阈值', { min: 0 });
            const expiryWarningDays = (0, phase2_form_1.parseOptionalNumber)(form.expiryWarningDays, '临期阈值', { integer: true, min: 0 });
            const purchasePrice = (0, phase2_form_1.parseOptionalNumber)(form.purchasePrice, '购买价格', { min: 0 });
            const locationId = form.locationId.trim() || 'default_location';
            if (this.data.mode === 'new') {
                if ((0, phase2_form_1.isBlank)(form.name))
                    throw new Error('请填写物品名称');
                if ((0, phase2_form_1.isBlank)(form.unit))
                    throw new Error('请填写单位');
            }
            else if (!this.data.selectedItemId) {
                throw new Error('请选择已有物品');
            }
            const result = await (0, phase2_ui_service_1.addStock)({
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
                operationId: (0, phase2_form_1.createUiOperationId)('add'),
            });
            const name = this.data.mode === 'new' ? form.name.trim() : this.data.selectedItemName;
            const message = `增加成功：已加入 ${quantity}${result.item.unit || form.unit} ${name}`;
            wx.showToast({ title: '增加成功', icon: 'success' });
            this.setData({ submitting: false, result: message, error: '' });
            void this.loadItems();
        }
        catch (error) {
            this.setData({ submitting: false, error: (0, phase2_form_1.mapUserError)(error) });
            wx.showToast({ title: '增加失败', icon: 'none' });
        }
    },
});
