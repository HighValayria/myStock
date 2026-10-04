# Phase 2 Test Report - Add / Consume / Edit Loop

Date: 2026-10-04

## Scope

Implemented Phase 2 only:

- Temporary home entries for Add / Consume / Edit.
- Add stock flow for new Item and existing Item.
- Consume stock flow that calls existing `consumeStock` and relies on server-side FEFO.
- Edit flow for Item attributes, Batch attributes, and explicit stock adjustment through `adjustStock`.
- Recent-use ordering based on latest Transaction timestamp.
- User-facing success / error feedback.
- Form validation for required fields, numeric values, date conflicts, loading / disabled submit states.

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
- Phase 2 form helper validation for expiry date, shelf life, positive quantities, and non-negative stock correction.

## Phase 1 Regression

Status: PASS by automated tests.

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

- TC-P2-001 首页进入新增物品: PENDING
- TC-P2-002 首页增加已有物品: PENDING
- TC-P2-003 最近使用快速增加: PENDING
- TC-P2-004 首页消耗: PENDING
- TC-P2-005 消耗失败提示: PENDING
- TC-P2-006 编辑 Item 属性: PENDING
- TC-P2-007 编辑 Batch 属性: PENDING
- TC-P2-008 编辑数量产生 ADJUST: PENDING
- TC-P2-009 撤销最近操作: BLOCKED by unresolved product rule

## Simulator / Real Device

- Simulator: pending developer execution in WeChat DevTools.
- Real device: not executed.

## Known Bugs

None found by automated tests.

## Deferred Tests

- TC-P2-001 through TC-P2-008 manual UI acceptance.
- TC-P2-009 undo behavior, pending Design Freeze clarification.
- Two-account `_openid` isolation, pending second authorized WeChat developer account.

## Phase 3 Readiness

Recommendation: do not start Phase 3 until TC-P2-001 through TC-P2-008 pass in WeChat DevTools. TC-P2-009 is blocked by product definition and should remain tracked in `OPEN_QUESTIONS.md`.

## Manual Acceptance Steps

1. Open the repository root in WeChat DevTools.
2. Confirm `miniprogram/config/env.ts` points to the intended CloudBase environment, or leave it empty and select the environment in DevTools.
3. Confirm cloud functions `getOpenId` and `inventoryWrite` are deployed.
4. Compile and open the home page.
5. Run TC-P2-001 through TC-P2-008 from `docs/MANUAL_TEST_CASES.md`.
6. After each write, optionally inspect Cloud Database collections:
   - `items`
   - `batches`
   - `transactions`
   - `reminders`
7. Confirm pages show user-visible success or error messages, not only console output.
