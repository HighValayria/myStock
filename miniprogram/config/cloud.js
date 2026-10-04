"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initCloud = initCloud;
const env_1 = require("./env");
let initialized = false;
function initCloud() {
    if (initialized)
        return;
    if (typeof wx !== 'undefined' && wx.cloud) {
        wx.cloud.init({
            env: (0, env_1.getCloudEnvId)(),
            traceUser: true,
        });
    }
    initialized = true;
}
