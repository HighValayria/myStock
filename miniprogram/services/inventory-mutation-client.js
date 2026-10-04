"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudFunctionInventoryMutationClient = void 0;
const errors_1 = require("../utils/errors");
async function callInventoryWrite(action, payload) {
    if (typeof wx === 'undefined' || !wx.cloud) {
        throw new errors_1.InventoryError('VALIDATION_ERROR', 'wx.cloud is not initialized');
    }
    const response = await wx.cloud.callFunction({
        name: 'inventoryWrite',
        data: { action, payload },
    });
    const result = response.result;
    if (!result || !result.ok) {
        const code = result?.error?.code ?? 'VALIDATION_ERROR';
        throw new errors_1.InventoryError(code, result?.error?.message ?? `inventoryWrite failed: ${action}`);
    }
    return result.data;
}
class CloudFunctionInventoryMutationClient {
    addStock(input) {
        return callInventoryWrite('addStock', input);
    }
    consumeStock(input) {
        return callInventoryWrite('consumeStock', input);
    }
    adjustStock(input) {
        return callInventoryWrite('adjustStock', input);
    }
}
exports.CloudFunctionInventoryMutationClient = CloudFunctionInventoryMutationClient;
