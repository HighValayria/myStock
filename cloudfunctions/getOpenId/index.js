"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
async function main() {
    const context = cloud.getWXContext();
    return {
        openid: context.OPENID ?? '',
        appid: context.APPID,
        unionid: context.UNIONID,
    };
}
