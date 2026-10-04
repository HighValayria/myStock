"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLOUD_ENV_ID = void 0;
exports.getCloudEnvId = getCloudEnvId;
exports.CLOUD_ENV_ID = '';
function getCloudEnvId() {
    return exports.CLOUD_ENV_ID || undefined;
}