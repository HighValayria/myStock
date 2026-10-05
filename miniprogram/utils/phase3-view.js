"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expiryStatusLabel = expiryStatusLabel;
exports.stockStatusLabel = stockStatusLabel;
exports.formatDate = formatDate;
exports.formatRemainingDays = formatRemainingDays;
exports.transactionTypeLabel = transactionTypeLabel;
exports.transactionQuantityText = transactionQuantityText;
exports.formatTransactionDate = formatTransactionDate;
exports.visibleExpiryDate = visibleExpiryDate;
const phase2_form_1 = require("./phase2-form");
function expiryStatusLabel(status) {
    if (status === 'EXPIRED')
        return '已过期';
    if (status === 'EXPIRING')
        return '临期';
    return '正常';
}
function stockStatusLabel(status) {
    if (status === 'ZERO')
        return '零库存';
    if (status === 'LOW')
        return '低库存';
    return '正常';
}
function formatDate(value) {
    if (!value || value === phase2_form_1.UNKNOWN_EXPIRY_DATE)
        return '未知';
    return value.slice(5).replace('-', '/');
}
function formatRemainingDays(value) {
    if (value == null)
        return '未知';
    if (value < 0)
        return `已过期 ${Math.abs(value)} 天`;
    if (value === 0)
        return '今天到期';
    return `剩余 ${value} 天`;
}
function transactionTypeLabel(type) {
    if (type === 'ADD')
        return '增加';
    if (type === 'CONSUME')
        return '消耗';
    if (type === 'ADJUST')
        return '库存修正';
    if (type === 'DISCARD')
        return '丢弃';
    if (type === 'DELETE')
        return '删除';
    return '库存变化';
}
function transactionQuantityText(transaction, unit) {
    const quantity = transaction.quantity;
    const sign = quantity > 0 ? '+' : '';
    return `${sign}${quantity}${unit}`;
}
function formatTransactionDate(createdAt) {
    const date = new Date(createdAt);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
}
function visibleExpiryDate(value) {
    return !value || value === phase2_form_1.UNKNOWN_EXPIRY_DATE ? '无到期日' : value;
}
