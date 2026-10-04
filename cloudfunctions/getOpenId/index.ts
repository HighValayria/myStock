declare const require: any;

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

export interface GetOpenIdResult {
  openid: string;
  appid?: string;
  unionid?: string;
}

export async function main(): Promise<GetOpenIdResult> {
  const context = cloud.getWXContext();
  return {
    openid: context.OPENID ?? '',
    appid: context.APPID,
    unionid: context.UNIONID,
  };
}