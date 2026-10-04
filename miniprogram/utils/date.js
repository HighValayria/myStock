"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertDateOnly = assertDateOnly;
exports.dateOnlyToUtcMs = dateOnlyToUtcMs;
exports.toDateOnly = toDateOnly;
exports.getEffectiveExpiryDate = getEffectiveExpiryDate;
exports.getRemainingDays = getRemainingDays;
exports.compareByEffectiveExpiryDate = compareByEffectiveExpiryDate;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function assertDateOnly(value, fieldName) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(`${fieldName} must be YYYY-MM-DD`);
    }
}
function dateOnlyToUtcMs(value) {
    assertDateOnly(value, 'date');
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
}
function toDateOnly(value) {
    if (typeof value === 'string') {
        assertDateOnly(value, 'date');
        return value;
    }
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function getEffectiveExpiryDate(batch) {
    if (!batch.openedExpiryDate)
        return batch.expiryDate;
    return dateOnlyToUtcMs(batch.openedExpiryDate) < dateOnlyToUtcMs(batch.expiryDate)
        ? batch.openedExpiryDate
        : batch.expiryDate;
}
function getRemainingDays(expiryDate, today) {
    const todayDate = toDateOnly(today);
    return Math.floor((dateOnlyToUtcMs(expiryDate) - dateOnlyToUtcMs(todayDate)) / MS_PER_DAY);
}
function compareByEffectiveExpiryDate(a, b) {
    const expiryDiff = dateOnlyToUtcMs(getEffectiveExpiryDate(a)) - dateOnlyToUtcMs(getEffectiveExpiryDate(b));
    if (expiryDiff !== 0)
        return expiryDiff;
    return a.createdAt - b.createdAt;
}
