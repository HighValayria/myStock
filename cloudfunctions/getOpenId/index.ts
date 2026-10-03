export interface GetOpenIdResult {
  openid: string;
  appid?: string;
  unionid?: string;
}

export async function main(_event: unknown, context: { OPENID?: string; APPID?: string; UNIONID?: string }): Promise<GetOpenIdResult> {
  return {
    openid: context.OPENID ?? '',
    appid: context.APPID,
    unionid: context.UNIONID,
  };
}
