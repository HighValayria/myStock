import { getCloudEnvId } from './env';

let initialized = false;

export function initCloud(): void {
  if (initialized) return;
  if (typeof wx !== 'undefined' && wx.cloud) {
    wx.cloud.init({
      env: getCloudEnvId(),
      traceUser: true,
    });
  }
  initialized = true;
}
