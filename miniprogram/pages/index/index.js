"use strict";
/// <reference path="../../types/wechat.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const phase2_form_1 = require("../../utils/phase2-form");
function getPhase2Service() {
    return require('../../services/phase2-ui-service');
}
Page({
    data: {
        loading: false,
        itemCount: 0,
        batchHint: '打开后可增加、消耗、编辑库存',
        error: '',
        recentRows: [],
    },
    onShow() {
        void this.loadSummary();
    },
    async loadSummary() {
        this.setData({ loading: true, error: '' });
        try {
            const { listInventoryRows } = getPhase2Service();
            const rows = await listInventoryRows();
            const recentRows = rows.slice(0, 5).map((row) => ({
                id: row.item._id,
                name: `${row.item.name}${row.item.specification ? ` ${row.item.specification}` : ''}`,
                summary: `${row.totalQuantity}${row.item.unit}${row.nearestExpiryDate && row.nearestExpiryDate !== phase2_form_1.UNKNOWN_EXPIRY_DATE ? ` · 最近到期 ${row.nearestExpiryDate}` : ''}`,
            }));
            this.setData({
                loading: false,
                itemCount: rows.length,
                batchHint: rows.length ? '最近操作物品会优先出现在选择列表' : '还没有库存，先增加一个物品',
                recentRows,
            });
        }
        catch (error) {
            this.setData({ loading: false, error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    goAdd() { wx.navigateTo({ url: '/pages/stock-add/index' }); },
    goConsume() { wx.navigateTo({ url: '/pages/stock-consume/index' }); },
    goEdit() { wx.navigateTo({ url: '/pages/stock-edit/index' }); },
});
