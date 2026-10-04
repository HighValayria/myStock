# Phase 2 Test Report - Add / Consume / Edit Loop

Date: 2026-10-04
Updated: 2026-10-04 Phase 2 cloud read/taxonomy/edit UX fix

## Scope

Implemented Phase 2 only:

- Temporary home entries for Add / Consume / Edit.
- Add stock flow for new Item and existing Item.
- Consume stock flow that calls existing `consumeStock` and relies on server-side FEFO.
- Edit flow for Item attributes, Batch attributes, and explicit stock adjustment through `adjustStock`.
- Recent-use ordering based on latest Transaction timestamp.
- User-facing success / error feedback.
- Form validation for required fields, numeric values, date conflicts, loading / disabled submit states.
- UI/UX closeout for Add page: grouped sections, common fields first, more info collapsed by default, default unit, category/location selection and creation, date picker plus manual date input, success modal.
- Consume page category filter, recent-use strip, and positive-stock-only list.
- Home action buttons use responsive three-column layout to keep Add / Consume / Edit visible on narrow screens.
- Phase 2 read paths now use `inventoryRead` cloud function to avoid mini program client `_openid` query errors.
- Category and Location options/creation now use `taxonomyManage` cloud function, so selection and new category/location are real cloud data.
- Edit page now uses the same user-facing category/location/date form口径 as Add instead of exposing raw database IDs.
- `inventoryWrite` now also handles `updateItem` and `updateBatch`; Batch metadata edits recompute reminders server-side.

Not implemented in this phase:

- Phase 3 final home/inventory browsing information architecture.
- Phase 4 reminder center UI.
- Phase 5 charts.
- Phase 6 Excel / JSON data management.
- AI features.
- Undo UI, because product scope is unresolved.

## Automated Tests

Command executed:

```bash
npm test
```

Result:

```text
17 tests passed
```

Covered by automation:

- Phase 1 addStock regression.
- Same-batch merge.
- Different expiry does not merge.
- Single-batch consume.
- Multi-batch FEFO consume.
- Over-consume fails without partial writes.
- ADJUST transaction creation.
- Low-stock, zero-stock, expiring, expired reminder basics.
- Dismissed reminder duplicate prevention.
- Reminder resolution.
- operationId duplicate prevention.
- Cloud-mode mutation delegation contract.
- Repository user isolation at repository level.
- Phase 2 form helper validation for expiry date, shelf life, positive quantities, non-negative stock correction, default unit, unknown expiry compatibility, month-based expiry calculation, and invalid date rejection.

## Phase 1 Regression

Status: PASS by automated tests. Additional Phase 2 service/cloud-function integration checks passed by TypeScript build and cloud function syntax checks.

Previously accepted real CloudBase diagnostics remain the latest manual cloud acceptance baseline:

- CloudBase init.
- getOpenId.
- inventoryWrite.
- add / consume / adjust main chain.
- Batch / Transaction consistency.
- operationId idempotency.
- over-consume failure without half writes.
- FEFO.
- batch merge / no-merge.

## Phase 2 Manual UI Test Status

Not executed by Codex in WeChat DevTools during this run. These must be executed by the developer in the simulator or a real device:

- TC-P2-001 首页进入新增物品: NEEDS RETEST after uploading `inventoryRead` and `taxonomyManage`
- TC-P2-002 首页增加已有物品: NEEDS RETEST
- TC-P2-003 最近使用快速增加: PENDING
- TC-P2-004 首页消耗: NEEDS RETEST
- TC-P2-005 消耗失败提示: PENDING
- TC-P2-006 编辑 Item 属性: NEEDS RETEST
- TC-P2-007 编辑 Batch 属性: NEEDS RETEST
- TC-P2-008 编辑数量产生 ADJUST: NEEDS RETEST
- TC-P2-009 撤销最近操作: BLOCKED by unresolved product rule
- TC-P2-010 增加页字段分组: PENDING
- TC-P2-011 单位默认值: PENDING
- TC-P2-012 类别已有选择: PENDING
- TC-P2-013 新建类别: PENDING
- TC-P2-014 位置已有选择 / 新建: PENDING
- TC-P2-015 日期选择器: PENDING
- TC-P2-016 自动计算到期日: PENDING
- TC-P2-017 直接填写到期日: PENDING
- TC-P2-018 阈值不阻塞新增: PENDING
- TC-P2-019 新增成功弹窗: PENDING
- TC-P2-020 连续添加: PENDING
- TC-P2-021 消耗类别筛选: PENDING
- TC-P2-022 三个首页操作按钮布局: PENDING

## Simulator / Real Device

- Simulator: pending developer execution in WeChat DevTools.
- Real device: not executed.

## Known Bugs

None found by automated tests. User-reported `_openid` invalid key error was addressed by moving Phase 2 inventory reads and taxonomy management to server-side cloud functions.

## Deferred Tests

- TC-P2-001 through TC-P2-008 and TC-P2-010 through TC-P2-022 manual UI acceptance.
- TC-P2-009 undo behavior, pending Design Freeze clarification.
- Two-account `_openid` isolation, pending second authorized WeChat developer account.

## Open Questions

- Unknown / not-applicable expiry needs a formal product representation. Phase 2 currently uses `9999-12-31` as a schema-compatible value when users omit expiry information.
- Undo remains blocked by product definition.

## Phase 3 Readiness

Recommendation: do not start Phase 3 until TC-P2-001 through TC-P2-008 and TC-P2-010 through TC-P2-022 pass in WeChat DevTools. TC-P2-009 is blocked by product definition and should remain tracked in `OPEN_QUESTIONS.md`.

## Manual Acceptance Steps

1. Open the repository root in WeChat DevTools.
2. Confirm `miniprogram/config/env.ts` points to the intended CloudBase environment, or leave it empty and select the environment in DevTools.
3. Confirm cloud functions `getOpenId`, `inventoryWrite`, `inventoryRead`, and `taxonomyManage` are deployed.
4. Compile and open the home page.
5. Run TC-P2-001 through TC-P2-008 and TC-P2-010 through TC-P2-022 from `docs/MANUAL_TEST_CASES.md`.
6. After each write, optionally inspect Cloud Database collections:
   - `categories`
   - `locations`
   - `items`
   - `batches`
   - `transactions`
   - `reminders`
7. Confirm pages show user-visible success or error messages, not only console output.