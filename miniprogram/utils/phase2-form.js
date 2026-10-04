"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBlank = isBlank;
exports.parsePositiveNumber = parsePositiveNumber;
exports.parseNonNegativeNumber = parseNonNegativeNumber;
exports.parseOptionalNumber = parseOptionalNumber;
exports.assertDateOrder = assertDateOrder;
exports.resolveExpiryDate = resolveExpiryDate;
exports.createUiOperationId = createUiOperationId;
exports.mapUserError = mapUserError;
const errors_1 = require("./errors");
function isBlank(value) {
    return value == null || String(value).trim() === '';
}
function parsePositiveNumber(value, label) {
    const numeric = Number(String(value ?? '').trim());
    if (!Number.isFinite(numeric) || numeric <= 0) {
        throw new errors_1.InventoryError('VALIDATION_ERROR', `${label}必须大于0`);
    }
    return numeric;
}
function parseNonNegativeNumber(value, label) {
    const numeric = Number(String(value ?? '').trim());
    if (!Number.isFinite(numeric) || numeric < 0) {
        throw new errors_1.InventoryError('VALIDATION_ERROR', `${label}不能小于0`);
    }
    return numeric;
}
function parseOptionalNumber(value, label, options = {}) {
    if (isBlank(value))
        return null;
    const numeric = Number(String(value).trim());
    if (!Number.isFinite(numeric))
        throw new errors_1.InventoryError('VALIDATION_ERROR', `${label}必须是数字`);
    if (options.min != null && numeric < options.min)
        throw new errors_1.InventoryError('VALIDATION_ERROR', `${label}不能小于${options.min}`);
    return options.integer ? Math.trunc(numeric) : numeric;
}
function assertDateOrder(productionDate, expiryDate) {
    if (productionDate && expiryDate < productionDate) {
        throw new errors_1.InventoryError('VALIDATION_ERROR', '到期日期不能早于生产日期');
    }
}
function resolveExpiryDate(input) {
    if (!isBlank(input.expiryDate)) {
        const expiryDate = String(input.expiryDate).trim();
        assertDateOrder(input.productionDate, expiryDate);
        return expiryDate;
    }
    if (isBlank(input.productionDate) || input.shelfLifeValue == null || !input.shelfLifeUnit) {
        throw new errors_1.InventoryError('VALIDATION_ERROR', '请填写到期日期，或填写生产日期和保质期');
    }
    const date = new Date(`${input.productionDate}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()))
        throw new errors_1.InventoryError('VALIDATION_ERROR', '生产日期格式不正确');
    if (input.shelfLifeUnit === 'DAY')
        date.setUTCDate(date.getUTCDate() + input.shelfLifeValue);
    if (input.shelfLifeUnit === 'MONTH')
        date.setUTCMonth(date.getUTCMonth() + input.shelfLifeValue);
    if (input.shelfLifeUnit === 'YEAR')
        date.setUTCFullYear(date.getUTCFullYear() + input.shelfLifeValue);
    const expiryDate = date.toISOString().slice(0, 10);
    assertDateOrder(input.productionDate, expiryDate);
    return expiryDate;
}
function createUiOperationId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function mapUserError(error) {
    const anyError = error;
    if (anyError.code === 'INSUFFICIENT_STOCK' || /exceeds available stock|INSUFFICIENT_STOCK/i.test(anyError.message ?? '')) {
        return '库存不足，无法完成本次消耗。';
    }
    if (anyError.code === 'NOT_FOUND')
        return '没有找到对应数据，请刷新后重试。';
    if (anyError.code === 'DUPLICATE_OPERATION')
        return '该操作已提交，请不要重复点击。';
    if (anyError.code === 'VALIDATION_ERROR')
        return anyError.message || '请检查填写内容。';
    if (/network|timeout|fail/i.test(anyError.message ?? ''))
        return '网络或云服务暂时不可用，请稍后重试。';
    return anyError.message || '操作失败，请稍后重试。';
}
