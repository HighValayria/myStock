"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertNonEmptyString = assertNonEmptyString;
exports.assertPositiveNumber = assertPositiveNumber;
exports.assertNonNegativeNumber = assertNonNegativeNumber;
const errors_1 = require("./errors");
function assertNonEmptyString(value, fieldName) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new errors_1.InventoryError('VALIDATION_ERROR', `${fieldName} is required`);
    }
}
function assertPositiveNumber(value, fieldName) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new errors_1.InventoryError('VALIDATION_ERROR', `${fieldName} must be a positive number`);
    }
}
function assertNonNegativeNumber(value, fieldName) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new errors_1.InventoryError('VALIDATION_ERROR', `${fieldName} must be a non-negative number`);
    }
}
