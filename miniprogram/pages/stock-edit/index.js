"use strict";
/// <reference path="../../types/wechat.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const phase2_form_1 = require("../../utils/phase2-form");
const emptyItemForm = {
    name: '', categoryId: '', brand: '', specification: '', unit: '', defaultLocationId: '', lowStockThreshold: '', expiryWarningDays: '', note: '',
};
function getPhase2Service() {
    return require('../../services/phase2-ui-service');
}
function expiryText(expiryDate) {
    return expiryDate === phase2_form_1.UNKNOWN_EXPIRY_DATE ? '未知到期' : `到期 ${expiryDate}`;
}
function statusText(status) {
    if (status === 'EXPIRED')
        return '已过期';
    if (status === 'EXPIRING')
        return '临期';
    return '正常';
}
function toPickRow(row, selectedItemId) {
    const nearestExpiry = row.nearestExpiryDate && row.nearestExpiryDate !== phase2_form_1.UNKNOWN_EXPIRY_DATE ? ` · 最近到期 ${row.nearestExpiryDate}` : '';
    return {
        id: row.item._id,
        name: row.label,
        summary: `${row.totalQuantity}${row.item.unit}${nearestExpiry}`,
        selectedClass: row.item._id === selectedItemId ? 'selected' : '',
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
        expiryDate: batch.expiryDate === phase2_form_1.UNKNOWN_EXPIRY_DATE ? '' : batch.expiryDate,
        purchasePrice: batch.purchasePrice == null ? '' : String(batch.purchasePrice),
        note: batch.note ?? '',
    };
}
function firstOrEmpty(items) {
    return items[0]?.id ?? '';
}
function categoryName(categories, id) {
    return categories.find((item) => item.id === id)?.name ?? '未选择类别';
}
function locationName(locations, id) {
    return locations.find((item) => item.id === id)?.label ?? '未选择位置';
}
function buildBatchRows(detail, locations) {
    return detail.batches.map((batch) => ({
        id: batch._id,
        quantityText: `${batch.quantity}${detail.item.unit}`,
        locationText: locationName(locations, batch.locationId),
        expiryText: expiryText(batch.expiryDate),
        statusText: statusText(batch.expiryStatus),
        remainingText: batch.expiryDate === phase2_form_1.UNKNOWN_EXPIRY_DATE ? '剩余天数未知' : `剩余 ${batch.remainingDays} 天`,
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
    },
    onLoad(options) {
        void Promise.all([this.loadTaxonomy(), this.loadItems()]).then(() => {
            if (options.itemId)
                void this.selectItemById(options.itemId);
        });
    },
    async loadTaxonomy() {
        try {
            const { getTaxonomyOptions } = getPhase2Service();
            const options = await getTaxonomyOptions();
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
        }
        catch (error) {
            this.setData({ error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    async loadItems() {
        this.setData({ loading: true, error: '' });
        try {
            const { listInventoryRows } = getPhase2Service();
            const rows = await listInventoryRows({ search: this.data.search });
            this.setData({ loading: false, items: rows.map((row) => toPickRow(row, this.data.selectedItemId)), emptyItems: rows.length === 0 });
        }
        catch (error) {
            this.setData({ loading: false, error: (0, phase2_form_1.mapUserError)(error), emptyItems: true });
        }
    },
    async refreshDetail() {
        if (!this.data.selectedItemId)
            return;
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
    onSearchInput(event) {
        this.setData({ search: event.detail.value });
        void this.loadItems();
    },
    async selectItemById(itemId) {
        this.setData({ selectedItemId: itemId, result: '', error: '', batchForm: null, adjustForm: null });
        this.setData({ items: this.data.items.map((item) => ({ ...item, selectedClass: item.id === itemId ? 'selected' : '' })) });
        try {
            await this.refreshDetail();
        }
        catch (error) {
            this.setData({ error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    async selectItem(event) {
        await this.selectItemById(event.currentTarget.dataset.id);
    },
    onItemFieldInput(event) {
        const field = event.currentTarget.dataset.field;
        this.setData({ itemForm: { ...this.data.itemForm, [field]: event.detail.value } });
    },
    onCategoryChange(event) {
        const index = Number(event.detail.value);
        if (index >= this.data.categories.length) {
            this.setData({ showNewCategory: true });
            return;
        }
        const category = this.data.categories[index];
        this.setData({ itemForm: { ...this.data.itemForm, categoryId: category.id }, selectedCategoryName: category.name, showNewCategory: false });
    },
    onItemLocationChange(event) {
        const index = Number(event.detail.value);
        if (index >= this.data.locations.length) {
            this.setData({ showNewLocation: true });
            return;
        }
        const location = this.data.locations[index];
        this.setData({ itemForm: { ...this.data.itemForm, defaultLocationId: location.id }, selectedItemLocationName: location.label, showNewLocation: false });
    },
    onBatchLocationChange(event) {
        if (!this.data.batchForm)
            return;
        const index = Number(event.detail.value);
        if (index >= this.data.locations.length) {
            this.setData({ showNewLocation: true });
            return;
        }
        const location = this.data.locations[index];
        this.setData({ batchForm: { ...this.data.batchForm, locationId: location.id }, selectedBatchLocationName: location.label, showNewLocation: false });
    },
    onNewCategoryInput(event) {
        this.setData({ newCategoryName: event.detail.value });
    },
    onNewLocationInput(event) {
        this.setData({ newLocationName: event.detail.value });
    },
    async createCategory() {
        try {
            const { createCategory } = getPhase2Service();
            const category = await createCategory(this.data.newCategoryName);
            await this.loadTaxonomy();
            this.setData({ itemForm: { ...this.data.itemForm, categoryId: category.id }, selectedCategoryName: category.name, showNewCategory: false, newCategoryName: '' });
        }
        catch (error) {
            this.setData({ error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    async createLocation() {
        try {
            const { createLocation } = getPhase2Service();
            const location = await createLocation(this.data.newLocationName);
            await this.loadTaxonomy();
            if (this.data.batchForm) {
                this.setData({ batchForm: { ...this.data.batchForm, locationId: location.id }, selectedBatchLocationName: location.label });
            }
            else {
                this.setData({ itemForm: { ...this.data.itemForm, defaultLocationId: location.id }, selectedItemLocationName: location.label });
            }
            this.setData({ showNewLocation: false, newLocationName: '' });
        }
        catch (error) {
            this.setData({ error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    onBatchFieldInput(event) {
        if (!this.data.batchForm)
            return;
        const field = event.currentTarget.dataset.field;
        this.setData({ batchForm: { ...this.data.batchForm, [field]: event.detail.value } });
    },
    onBatchDateChange(event) {
        if (!this.data.batchForm)
            return;
        const field = event.currentTarget.dataset.field;
        this.setData({ batchForm: { ...this.data.batchForm, [field]: event.detail.value } });
    },
    onBatchShelfLifeUnitChange(event) {
        if (!this.data.batchForm)
            return;
        const unit = this.data.shelfLifeUnits[Number(event.detail.value)] ?? 'DAY';
        this.setData({ batchForm: { ...this.data.batchForm, shelfLifeUnit: unit } });
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
            const categoryId = form.categoryId || firstOrEmpty(this.data.categories);
            await getPhase2Service().updateItem(this.data.detail.item._id, {
                name: form.name.trim(),
                categoryId,
                brand: form.brand.trim() || null,
                specification: form.specification.trim() || null,
                unit: form.unit.trim(),
                defaultLocationId: form.defaultLocationId || null,
                lowStockThreshold: (0, phase2_form_1.parseOptionalNumber)(form.lowStockThreshold, '低库存阈值', { min: 0 }),
                expiryWarningDays: (0, phase2_form_1.parseOptionalNumber)(form.expiryWarningDays, '临期阈值', { integer: true, min: 0 }),
                note: form.note.trim(),
            });
            await this.refreshDetail();
            await this.loadItems();
            this.setData({ submitting: false, result: `物品属性已保存：${form.name.trim()}` });
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
        const batchForm = batchFormFromBatch(batch);
        this.setData({ batchForm, selectedBatchLocationName: locationName(this.data.locations, batchForm.locationId), adjustForm: null, result: '', error: '' });
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
            const purchaseDate = (0, phase2_form_1.normalizeDateInput)(form.purchaseDate, '购买日期');
            const productionDate = (0, phase2_form_1.normalizeDateInput)(form.productionDate, '生产日期');
            const expiryDate = (0, phase2_form_1.resolveExpiryDate)({
                expiryDate: form.expiryDate,
                productionDate,
                shelfLifeValue,
                shelfLifeUnit: shelfLifeValue == null ? null : form.shelfLifeUnit,
                allowUnknown: true,
            });
            await getPhase2Service().updateBatch(form.batchId, {
                locationId: form.locationId || firstOrEmpty(this.data.locations),
                purchaseDate,
                productionDate,
                shelfLifeValue,
                shelfLifeUnit: shelfLifeValue == null ? null : form.shelfLifeUnit,
                expiryDate,
                purchasePrice: (0, phase2_form_1.parseOptionalNumber)(form.purchasePrice, '单位购买价格', { min: 0 }),
                note: form.note.trim(),
            });
            await this.refreshDetail();
            await this.loadItems();
            this.setData({ submitting: false, batchForm: null, result: '批次属性已保存，并已重新计算提醒状态' });
            wx.showToast({ title: '保存成功', icon: 'success' });
        }
        catch (error) {
            this.setData({ submitting: false, error: (0, phase2_form_1.mapUserError)(error) });
            wx.showToast({ title: '保存失败', icon: 'none' });
        }
    },
    async submitAdjust() {
        if (this.data.submitting || !this.data.adjustForm || !this.data.detail)
            return;
        this.setData({ submitting: true, error: '', result: '' });
        try {
            const form = this.data.adjustForm;
            const actualQuantity = (0, phase2_form_1.parseNonNegativeNumber)(form.actualQuantity, '实际数量');
            const result = await getPhase2Service().adjustStock({
                batchId: form.batchId,
                actualQuantity,
                operationId: (0, phase2_form_1.createUiOperationId)('adjust'),
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
        }
        catch (error) {
            this.setData({ submitting: false, error: (0, phase2_form_1.mapUserError)(error) });
            wx.showToast({ title: '修正失败', icon: 'none' });
        }
    },
});
