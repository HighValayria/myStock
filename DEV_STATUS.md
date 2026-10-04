# Dev Status

## Current Phase

Phase 2 implementation is code-complete for the Add / Consume / Edit user loop, including the follow-up fix for cloud read/taxonomy `_openid` errors and Edit page UX alignment. Automated verification passes. WeChat DevTools manual UI acceptance needs retest after uploading `inventoryRead` and `taxonomyManage` before starting Phase 3.

Phase 0 / Phase 1 CloudBase integration remains accepted for continuation, with two-account isolation deferred until a second authorized WeChat developer account is available.

## Completed In Code

- TypeScript miniapp skeleton.
- CloudBase initialization wrapper.
- `getOpenId` cloud function for trusted user identity lookup.
- Cloud Repository implementation for Category, Item, Batch, Transaction, Location, Reminder, RestockItem, and Settings.
- Memory Repository retained for automated domain tests.
- Repository factory with `cloud` and `memory` modes.
- Service layer remains storage-agnostic.
- Core inventory mutations `addStock`, `consumeStock`, and `adjustStock` are routed through the `inventoryWrite` cloud function in cloud mode.
- `inventoryWrite` uses CloudBase Node SDK server-side `runTransaction` for Batch, Transaction, Reminder, and RestockItem consistency.
- `operationId` duplicate detection prevents repeated submit double-writes.
- Development-only CloudBase diagnostic page at `pages/dev-cloud-check/index`.
- Phase 2 temporary home with three real entries: Add, Consume, Edit.
- Add stock page for new Item and existing Item flows.
- Consume stock page using service-backed FEFO consume.
- Edit stock page for Item properties, Batch properties, and explicit ADJUST quantity correction.
- Phase 2 UI service that routes mutation pages through InventoryService/cloud functions and routes Phase 2 reads through `inventoryRead`, avoiding client-side `_openid` query failures.
- Phase 2 form validation and user-facing error mapping.
- Phase 2 UI/UX收尾：增加页分组、更多信息折叠、默认单位、分类/位置选择与新建、日期选择、成功后继续添加/回首页。
- 消耗页支持类别筛选、最近使用和仅展示可用库存。
- 首页三个核心操作按钮使用响应式三等分布局，避免窄屏溢出。
- 新增 `inventoryRead` 云函数用于 Phase 2 库存列表/详情读取。
- 新增 `taxonomyManage` 云函数用于类别/位置默认值、选择和新建。
- `inventoryWrite` 增加 `updateItem` / `updateBatch`，编辑保存走服务端 OPENID 与事务边界。
- 编辑页改为类别/位置选择、日期选择和中文业务字段，不再直出 `categoryId` / `locationId`。

## Automated Verification

Latest command:

```bash
npm test
```

Latest result:

```text
17 tests passed
```

Coverage includes Phase 1 regression plus Phase 2 form validation boundaries.

## Manual Verification

Verified previously in WeChat DevTools against real CloudBase:

- CloudBase initialization.
- `getOpenId` deployment and invocation.
- `inventoryWrite` deployment and invocation.
- Required collections exist.
- Main addStock / consumeStock / adjustStock chain through `inventoryWrite`.
- Batch / Transaction consistency in Cloud Database.
- Duplicate `operationId` idempotency in the cloud function.
- Over-consume failure without Batch / Transaction half writes.
- Multi-batch FEFO consume.
- Same-batch merge and different-expiry no-merge rules.
- Dev data cleanup.

Pending Phase 2 manual UI acceptance in WeChat DevTools:

- TC-P2-001 through TC-P2-008 and TC-P2-010 through TC-P2-022.

Deferred manual verification:

- TC-P2-009 Undo: blocked because undo scope is not frozen.
- Two-account user isolation: no second authorized WeChat developer account is currently available.

See:

- `docs/CLOUDBASE_SETUP.md`
- `docs/MANUAL_TEST_CASES.md`
- `docs/TEST_REPORTS/phase_0_1_cloudbase.md`
- `docs/TEST_REPORTS/phase_2.md`

## Phase 3 Readiness

Do not start Phase 3 until TC-P2-001 through TC-P2-008 pass in WeChat DevTools. TC-P2-009 remains blocked by product definition and does not count as a code failure.
