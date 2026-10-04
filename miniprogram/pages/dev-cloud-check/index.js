"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference path="../../types/wechat.d.ts" />
const cloud_1 = require("../../config/cloud");
const repositories_1 = require("../../repositories");
const services_1 = require("../../services");
function append(lines, line) {
    lines.push(line);
}
async function cleanupDevItem(itemId) {
    const response = await wx.cloud.callFunction({
        name: 'inventoryWrite',
        data: { action: 'cleanupDevItem', payload: { itemId } },
    });
    const result = response.result;
    if (!result?.ok) {
        return `cleanup failed: ${result?.error?.message ?? 'unknown error'}`;
    }
    return `cleanup ok: ${JSON.stringify(result.data?.removed)}`;
}
Page({
    data: {
        running: false,
        output: 'Tap Run Cloud Check to verify Cloud Function transaction integration.',
    },
    async runCloudCheck() {
        const lines = [];
        this.setData({ running: true, output: 'Running...' });
        let itemIdForCleanup = null;
        try {
            (0, cloud_1.initCloud)();
            append(lines, 'Cloud initialized');
            const openIdRes = await wx.cloud.callFunction({ name: 'getOpenId' });
            const openid = openIdRes.result?.openid;
            if (!openid)
                throw new Error('getOpenId returned empty openid');
            append(lines, `Current openid: ${openid}`);
            const repos = (0, repositories_1.createRepositories)('cloud');
            const service = new services_1.InventoryService(repos, {
                userId: openid,
                defaultExpiryWarningDays: 7,
                mutationClient: new services_1.CloudFunctionInventoryMutationClient(),
                requireMutationClientForWrites: true,
            });
            const suffix = Date.now().toString(36);
            const addOperationId = `dev-add-${suffix}`;
            const consumeOperationId = `dev-consume-${suffix}`;
            const adjustOperationId = `dev-adjust-${suffix}`;
            append(lines, `addStock operationId: ${addOperationId}`);
            const addResult = await service.addStock({
                item: {
                    name: `dev-cloud-item-${suffix}`,
                    categoryId: 'dev_category',
                    unit: 'piece',
                    lowStockThreshold: 1,
                    expiryWarningDays: 7,
                },
                quantity: 3,
                locationId: 'dev_location',
                purchaseDate: '2026-10-03',
                expiryDate: '2026-10-20',
                operationId: addOperationId,
            });
            itemIdForCleanup = addResult.item._id;
            append(lines, `Item ID: ${addResult.item._id}`);
            append(lines, `Batch after add: ${addResult.batch._id}, quantity=${addResult.batch.quantity}`);
            append(lines, `ADD Transaction: ${addResult.transaction._id}`);
            append(lines, `consumeStock operationId: ${consumeOperationId}`);
            const consumeResult = await service.consumeStock({
                itemId: addResult.item._id,
                quantity: 1,
                operationId: consumeOperationId,
            });
            append(lines, `Batch after consume: ${consumeResult.affectedBatches.map((batch) => `${batch._id}:${batch.quantity}`).join(', ')}`);
            append(lines, `CONSUME Transactions: ${consumeResult.transactions.map((tx) => tx._id).join(', ')}`);
            const detailAfterConsume = await service.getItemDetail(addResult.item._id);
            const targetBatch = detailAfterConsume.batches[0];
            append(lines, `Queried total after consume: ${detailAfterConsume.totalQuantity}`);
            append(lines, `adjustStock operationId: ${adjustOperationId}`);
            const adjustResult = await service.adjustStock({
                batchId: targetBatch._id,
                actualQuantity: 1,
                operationId: adjustOperationId,
            });
            append(lines, `Batch after adjust: ${adjustResult.batch._id}, quantity=${adjustResult.batch.quantity}, diff=${adjustResult.diff}`);
            append(lines, `ADJUST Transaction: ${adjustResult.transaction?._id ?? 'none'}`);
            const finalDetail = await service.getItemDetail(addResult.item._id);
            append(lines, `Final total: ${finalDetail.totalQuantity}`);
            append(lines, `Recent transactions: ${finalDetail.recentTransactions.map((tx) => `${tx.type}:${tx.quantity}:${tx.operationId}`).join(' | ')}`);
            append(lines, 'Cloud Service -> Cloud Function -> server transaction -> Cloud Database check passed');
            append(lines, await cleanupDevItem(addResult.item._id));
            this.setData({ running: false, output: lines.join('\n') });
        }
        catch (error) {
            append(lines, `FAILED: ${error instanceof Error ? error.message : String(error)}`);
            if (itemIdForCleanup)
                append(lines, await cleanupDevItem(itemIdForCleanup));
            this.setData({ running: false, output: lines.join('\n') });
        }
    },
});
