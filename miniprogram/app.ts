import { initCloud } from './config/cloud';

App({
  onLaunch() {
    initCloud();

    const logs = (wx.getStorageSync('logs') as number[] | undefined) || [];
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
