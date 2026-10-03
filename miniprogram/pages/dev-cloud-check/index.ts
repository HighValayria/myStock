import { initCloud } from '../../config/cloud';
import { createRepositories } from '../../repositories';
import { InventoryService } from '../../services';

interface OpenIdResult {
  openid: string;
}

interface DevCloudCheckData {
  running: boolean;
  output: string;
}

interface DevCloudCheckPage {
  setData(data: Partial<DevCloudCheckData>): void;
}

function append(lines: string[], line: string): void {
  lines.push(line);
}

Page({
  data: {
    running: false,
    output: 'Tap Run Cloud Check to verify CloudBase integration.',
  } as DevCloudCheckData,

  async runCloudCheck(this: DevCloudCheckPage) {
    const lines: string[] = [];
    this.setData({ running: true, output: 'Running...' });
    try {
      initCloud();
      append(lines, 'Cloud initialized');

      const openIdRes = await wx.cloud!.callFunction<OpenIdResult>({ name: 'getOpenId' });
      const openid = openIdRes.result?.openid;
      if (!openid) throw new Error('getOpenId returned empty openid');
      append(lines, `Current openid: ${openid}`);

      const repos = createRepositories('cloud');
      const service = new InventoryService(repos, { userId: openid, defaultExpiryWarningDays: 7 });
      const suffix = Date.now().toString(36);
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
        operationId: `dev-add-${suffix}`,
      });
      append(lines, `Created item: ${addResult.item._id}`);
      append(lines, `Created batch: ${addResult.batch._id}, quantity=${addResult.batch.quantity}`);
      append(lines, `ADD transaction: ${addResult.transaction._id}`);

      const detailBefore = await service.getItemDetail(addResult.item._id);
      append(lines, `Queried total before consume: ${detailBefore.totalQuantity}`);

      const consumeResult = await service.consumeStock({
        itemId: addResult.item._id,
        quantity: 1,
        operationId: `dev-consume-${suffix}`,
      });
      append(lines, `CONSUME transactions: ${consumeResult.transactions.length}`);

      const detailAfter = await service.getItemDetail(addResult.item._id);
      append(lines, `Queried total after consume: ${detailAfter.totalQuantity}`);
      append(lines, 'Cloud Service -> Repository -> CloudBase check passed');
      this.setData({ running: false, output: lines.join('\n') });
    } catch (error) {
      append(lines, `FAILED: ${error instanceof Error ? error.message : String(error)}`);
      this.setData({ running: false, output: lines.join('\n') });
    }
  },
});

