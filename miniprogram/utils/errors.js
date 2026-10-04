"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryError = void 0;
exports.isInventoryError = isInventoryError;
class InventoryError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'InventoryError';
    }
}
exports.InventoryError = InventoryError;
function isInventoryError(error) {
    return error instanceof InventoryError;
}
