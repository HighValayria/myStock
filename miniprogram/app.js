"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cloud_1 = require("./config/cloud");
App({
    onLaunch() {
        (0, cloud_1.initCloud)();
        const logs = wx.getStorageSync('logs') || [];
        logs.unshift(Date.now());
        wx.setStorageSync('logs', logs);
        wx.login({
            success: () => {
                // CloudBase user identity is resolved by the platform; do not store inventory identity in local storage.
            },
        });
    },
    globalData: {
        userInfo: null,
    },
});
