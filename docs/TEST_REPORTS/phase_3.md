# Phase 3 Test Report - Home and Inventory Browsing

Date: 2026-10-05
Scope: Formal Home, background inventory flow, inventory summary, important reminder summary, inventory browse, search/filter/sort, list/table modes, item detail, batch display, recent transactions, and detail-to-Phase-2 operation entry points.

## Implementation Summary

Implemented Phase 3 only:

- Formal Home page at `pages/index/index`.
- Home important reminder summary based on active Reminder-derived counts from inventory read aggregation.
- Home background inventory flow sourced from real positive-stock inventory rows, loaded once per page show and animated on the client.
- Home summary for Item count, expiring count, restock-needed count, and batch count. It does not sum incompatible inventory units.
- Inventory browse page at `pages/inventory/index`.
- Search by item label and brand.
- Category filter from real user Category data.
- Location filter based on positive Batch.locationId, not only Item.defaultLocationId.
- Expiry status and stock status filters kept as separate dimensions.
- Sorting by nearest expiry / remaining days, current quantity, recent add, recent consume, and name.
- List mode and horizontally scrollable table mode.
- Item detail page at `pages/item-detail/index` with total quantity aggregation, per-batch display, recent 10 transactions, and Add / Consume / Edit entries.
- Detail-to-Phase-2 Add / Consume / Edit pages now preselect the current Item through query `itemId`.
- Lightweight placeholder tabs for Analysis / Reminders / Settings only. No Phase 4 reminder center, Phase 5 charts, or Phase 6 data management was implemented.

## Query Strategy

Phase 3 pages call `inventoryRead` cloud function actions instead of reading multiple collections directly from pages:

- `getHomeDashboard`: aggregates Items, Batches, active Reminders, NEEDED RestockItems, Locations, and recent limited Transactions for Home.
- `listInventoryRows`: aggregates browse rows server-side and applies search/filter/sort in one cloud call.
- `getItemDetail`: loads one Item, all its Batches, active metadata, and only the latest 10 Transactions for that Item.

The list path batches collection reads and avoids page-level N+1 requests. Transaction reads are limited to recent records for list sorting and detail display; the page does not default-load the whole Transaction collection.

## Automated Tests

Command:

```bash
npm test
```

Result:

```text
18 tests passed
```

Covered automatically:

- Phase 1 add / merge / no-merge / consume / FEFO / over-consume / ADJUST regression.
- Reminder basics from existing service tests.
- operationId duplicate prevention.
- Cloud-mode mutation delegation contract.
- Repository user isolation contract.
- Phase 2 form validation.
- Phase 3 view helper localization and unknown-expiry display hiding.

Additional static checks:

```bash
node --check cloudfunctions/inventoryRead/index.js
node JSON parse check for app/page configs
```

Result: PASS.

## Manual Tests

Not executed by Codex in WeChat DevTools during this run.

Pending Phase 3 UI acceptance:

- TC-P3-001 首页重要提醒
- TC-P3-002 背景流水展示
- TC-P3-003 背景流水点击跳转
- TC-P3-004 库存搜索
- TC-P3-005 分类筛选
- TC-P3-006 位置筛选
- TC-P3-007 保质期状态筛选
- TC-P3-008 库存状态筛选
- TC-P3-009 最近到期排序
- TC-P3-010 表格模式
- TC-P3-011 物品详情聚合
- TC-P3-012 搜索 + 分类组合
- TC-P3-013 搜索 + 位置组合
- TC-P3-014 多 Batch 多位置
- TC-P3-015 无到期日 Item
- TC-P3-016 空库存首页
- TC-P3-017 长文本
- TC-P3-018 详情页 Phase 2 入口

## Phase 2 Regression

Automated core regression passed through `npm test`.

Pending manual regression in WeChat DevTools:

- 新增新 Item
- 已有 Item 增加
- 连续增加
- 消耗
- 类别筛选消耗
- 编辑 Item
- 编辑 Batch
- ADJUST
- FEFO
- operationId 幂等

## Simulator / Device Coverage

- WeChat DevTools simulator: pending developer execution.
- Real device: not executed.
- Responsive checks for narrow iPhone / common iPhone / common Android: pending manual execution.

## Known Bugs

None found by automated tests or static checks in this run.

## Deferred Tests

- Full manual Phase 3 acceptance listed above.
- Phase 2 manual regression listed above.
- Two-account `_openid` isolation remains deferred until a second authorized WeChat developer account is available.
- TC-P2-009 Undo remains BLOCKED by unresolved product scope.

## Open Questions

No new product question was introduced by Phase 3.

Existing relevant open questions remain:

- Unknown / not-applicable expiry needs a formal product representation. Phase 3 hides the temporary `9999-12-31` compatibility value in user-facing pages and sorts it after real dates.
- Undo scope remains undefined.

## Phase 4 Readiness

Recommendation: do not start Phase 4 until TC-P3-001 through TC-P3-018 and the Phase 2 manual regression checks pass in WeChat DevTools. TC-P2-009 remains blocked by product definition and should remain tracked in `OPEN_QUESTIONS.md`.
