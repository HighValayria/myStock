"use strict";
/// <reference path="../../types/wechat.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const phase2_form_1 = require("../../utils/phase2-form");
const defaultForm = {
    name: '',
    categoryId: '',
    brand: '',
    specification: '',
    unit: phase2_form_1.DEFAULT_UNIT,
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
function getPhase2Service() {
    return require('../../services/phase2-ui-service');
}
function modeFlags(mode, selectedItemId = '') {
    return {
        isChooseMode: mode === 'choose',
        isNewMode: mode === 'new',
        isExistingMode: mode === 'existing',
        showAddForm: mode === 'new' || Boolean(selectedItemId),
    };
}
function toPickRow(row) {
    return {
        id: row.item._id,
        name: row.label,
        unit: row.item.unit,
        defaultLocationId: row.item.defaultLocationId ?? '',
        totalQuantity: row.totalQuantity,
        summary: `${row.totalQuantity}${row.item.unit}${row.nearestExpiryDate && row.nearestExpiryDate !== phase2_form_1.UNKNOWN_EXPIRY_DATE ? ` · 最近到期 ${row.nearestExpiryDate}` : ''}`,
    };
}
function firstOrEmpty(items) {
    return items[0]?.id ?? '';
}
function shelfLifeUnitLabel(unit) {
    if (unit === 'DAY')
        return '天';
    if (unit === 'YEAR')
        return '年';
    return '个月';
}
function formatExpiryText(expiryDate, directExpiryActive) {
    if (directExpiryActive)
        return '将使用直接填写的到期日期';
    if (!expiryDate)
        return '未填写时将按未知到期处理';
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
        commonUnits: [...phase2_form_1.COMMON_UNITS],
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
    },
    onLoad(options) {
        void Promise.all([this.loadTaxonomy(), this.loadItems()]).then(() => {
            if (options.itemId)
                this.selectItemById(options.itemId);
        });
    },
    async loadTaxonomy() {
        try {
            const { getTaxonomyOptions } = getPhase2Service();
            const options = await getTaxonomyOptions();
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
            this.setData({ loading: false, items: rows.map(toPickRow), emptyItems: rows.length === 0 });
        }
        catch (error) {
            this.setData({ loading: false, error: (0, phase2_form_1.mapUserError)(error), emptyItems: true });
        }
    },
    refreshExpiryPreview() {
        try {
            const form = this.data.form;
            const shelfLifeValue = (0, phase2_form_1.parseOptionalNumber)(form.shelfLifeValue, '保质期', { integer: true, min: 1 });
            const directExpiryActive = !(0, phase2_form_1.isBlank)(form.expiryDate);
            const calculated = (0, phase2_form_1.calculateExpiryDateFromShelfLife)({
                productionDate: form.productionDate,
                shelfLifeValue,
                shelfLifeUnit: shelfLifeValue == null ? null : form.shelfLifeUnit,
            });
            this.setData({ directExpiryActive, expectedExpiryText: formatExpiryText(calculated, directExpiryActive) });
        }
        catch (error) {
            this.setData({ expectedExpiryText: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    chooseNew() {
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
    chooseExisting() {
        this.setData({ mode: 'existing', result: '', error: '', showMore: false, showMoreLabel: '展开', ...modeFlags('existing', this.data.selectedItemId) });
        void this.loadItems();
    },
    backToChoose() {
        this.setData({ mode: 'choose', selectedItemId: '', selectedItemName: '', result: '', error: '', ...modeFlags('choose') });
    },
    toggleMore() {
        const showMore = !this.data.showMore;
        this.setData({ showMore, showMoreLabel: showMore ? '收起' : '展开' });
    },
    onSearchInput(event) {
        this.setData({ search: event.detail.value });
        void this.loadItems();
    },
    selectItemById(itemId) {
        const selected = this.data.items.find((item) => item.id === itemId);
        if (!selected)
            return;
        const locationId = selected.defaultLocationId || this.data.form.locationId;
        const location = this.data.locations.find((item) => item.id === locationId);
        this.setData({
            mode: 'existing',
            selectedItemId: selected.id,
            selectedItemName: selected.name,
            selectedLocationName: location?.label ?? this.data.selectedLocationName,
            ...modeFlags('existing', selected.id),
            form: {
                ...this.data.form,
                unit: selected.unit || phase2_form_1.DEFAULT_UNIT,
                locationId,
            },
        });
    },
    selectItem(event) {
        const selected = this.data.items.find((item) => item.id === event.currentTarget.dataset.id);
        if (!selected)
            return;
        const locationId = selected.defaultLocationId || this.data.form.locationId;
        const location = this.data.locations.find((item) => item.id === locationId);
        this.setData({
            selectedItemId: selected.id,
            selectedItemName: selected.name,
            selectedLocationName: location?.label ?? this.data.selectedLocationName,
            ...modeFlags(this.data.mode, selected.id),
            form: {
                ...this.data.form,
                unit: selected.unit || phase2_form_1.DEFAULT_UNIT,
                locationId,
            },
        });
    },
    onFieldInput(event) {
        const field = event.currentTarget.dataset.field;
        this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
        if (field === 'productionDate' || field === 'shelfLifeValue' || field === 'expiryDate')
            this.refreshExpiryPreview();
    },
    onDatePickerChange(event) {
        const field = event.currentTarget.dataset.field;
        this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
        if (field === 'productionDate' || field === 'expiryDate')
            this.refreshExpiryPreview();
    },
    onShelfLifeUnitChange(event) {
        const unit = this.data.shelfLifeUnits[Number(event.detail.value)] ?? 'MONTH';
        this.setData({ form: { ...this.data.form, shelfLifeUnit: unit } });
        this.refreshExpiryPreview();
    },
    onUnitChange(event) {
        const unit = this.data.commonUnits[Number(event.detail.value)] ?? phase2_form_1.DEFAULT_UNIT;
        this.setData({ form: { ...this.data.form, unit } });
    },
    onCategoryChange(event) {
        const index = Number(event.detail.value);
        if (index >= this.data.categories.length) {
            this.setData({ showNewCategory: true });
            return;
        }
        const category = this.data.categories[index];
        this.setData({ selectedCategoryName: category.name, form: { ...this.data.form, categoryId: category.id }, showNewCategory: false });
    },
    onLocationChange(event) {
        const index = Number(event.detail.value);
        if (index >= this.data.locations.length) {
            this.setData({ showNewLocation: true });
            return;
        }
        const location = this.data.locations[index];
        this.setData({ selectedLocationName: location.label, form: { ...this.data.form, locationId: location.id, defaultLocationId: location.id }, showNewLocation: false });
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
            this.setData({ selectedCategoryName: category.name, form: { ...this.data.form, categoryId: category.id }, showNewCategory: false, newCategoryName: '' });
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
            this.setData({ selectedLocationName: location.label, form: { ...this.data.form, locationId: location.id, defaultLocationId: location.id }, showNewLocation: false, newLocationName: '' });
        }
        catch (error) {
            this.setData({ error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    resetForContinue() {
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
    showSuccessModal(content) {
        wx.showModal({
            title: '添加成功',
            content,
            confirmText: '继续添加',
            cancelText: '回首页',
            success: (res) => {
                if (res.confirm)
                    this.resetForContinue();
                else
                    wx.navigateBack({ delta: 1 });
            },
        });
    },
    async submit() {
        if (this.data.submitting)
            return;
        this.setData({ submitting: true, error: '', result: '' });
        try {
            const form = this.data.form;
            const quantity = (0, phase2_form_1.parsePositiveNumber)(form.quantity, '数量');
            const purchaseDate = (0, phase2_form_1.normalizeDateInput)(form.purchaseDate, '购买日期');
            const productionDate = (0, phase2_form_1.normalizeDateInput)(form.productionDate, '生产日期');
            const shelfLifeValue = (0, phase2_form_1.parseOptionalNumber)(form.shelfLifeValue, '保质期', { integer: true, min: 1 });
            const expiryDate = (0, phase2_form_1.resolveExpiryDate)({
                expiryDate: form.expiryDate,
                productionDate,
                shelfLifeValue,
                shelfLifeUnit: shelfLifeValue == null ? null : form.shelfLifeUnit,
                allowUnknown: true,
            });
            const lowStockThreshold = (0, phase2_form_1.parseOptionalNumber)(form.lowStockThreshold, '低库存阈值', { min: 0 });
            const expiryWarningDays = (0, phase2_form_1.parseOptionalNumber)(form.expiryWarningDays, '临期阈值', { integer: true, min: 0 });
            const purchasePrice = (0, phase2_form_1.parseOptionalNumber)(form.purchasePrice, '购买价格', { min: 0 });
            const locationId = form.locationId || firstOrEmpty(this.data.locations) || 'default_location';
            const categoryId = form.categoryId || firstOrEmpty(this.data.categories) || 'default_category';
            const unit = (form.unit || phase2_form_1.DEFAULT_UNIT).trim() || phase2_form_1.DEFAULT_UNIT;
            if (this.data.mode === 'new' && (0, phase2_form_1.isBlank)(form.name))
                throw new Error('请填写物品名称');
            if (this.data.mode === 'existing' && !this.data.selectedItemId)
                throw new Error('请选择已有物品');
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
                operationId: (0, phase2_form_1.createUiOperationId)('add'),
            });
            const name = this.data.mode === 'new' ? form.name.trim() : this.data.selectedItemName;
            const message = `已增加：${name || result.item.name} ${quantity}${result.item.unit || unit}`;
            wx.showToast({ title: '增加成功', icon: 'success' });
            this.setData({ submitting: false, result: message, error: '' });
            this.showSuccessModal(message);
        }
        catch (error) {
            this.setData({ submitting: false, error: (0, phase2_form_1.mapUserError)(error) });
            wx.showToast({ title: '增加失败', icon: 'none' });
        }
    },
});
