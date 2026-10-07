# Dev Status

## Current Phase

Phase 5 implementation is code-complete for the V0.1 Analytics page. Automated verification passes. WeChat DevTools manual UI acceptance for TC-P5-001 through TC-P5-010 is pending after deploying the updated `inventoryRead` cloud function.

Phase 4 implementation remains code-complete for Reminder System and Restock. WeChat DevTools manual UI acceptance for TC-P4-001 through TC-P4-020 is pending after deploying the updated `inventoryRead` and `inventoryWrite` cloud functions.

Phase 3 implementation remains code-complete for the formal Home and Inventory Browsing surface. WeChat DevTools manual UI acceptance for TC-P3-001 through TC-P3-018 is still pending after deploying the updated `inventoryRead` cloud function.

Phase 0 / Phase 1 CloudBase integration remains accepted for continuation, with two-account isolation deferred until a second authorized WeChat developer account is available.

Phase 2 remains code-complete for the Add / Consume / Edit loop. TC-P2-009 Undo remains blocked by unresolved product scope; other Phase 2 UI acceptance should be regression-tested in WeChat DevTools alongside Phase 3.

## Completed In Code

- TypeScript miniapp skeleton and CloudBase initialization wrapper.
- `getOpenId` cloud function for trusted user identity lookup.
- Cloud Repository implementation for Category, Item, Batch, Transaction, Location, Reminder, RestockItem, and Settings.
- Memory Repository retained for automated domain tests.
- Core inventory mutations `addStock`, `consumeStock`, and `adjustStock` are routed through the `inventoryWrite` cloud function in cloud mode.
- `inventoryWrite` uses CloudBase Node SDK server-side `runTransaction` for Batch, Transaction, Reminder, and RestockItem consistency.
- `operationId` duplicate detection prevents repeated submit double-writes.
- Phase 2 Add / Consume / Edit pages, including category/location selection, new category/location creation, Item/Batch edits, and ADJUST quantity correction.
- `taxonomyManage` cloud function for category/location defaults, selection data, and user-created category/location records.
- Phase 3 formal Home page with important reminder summary, background inventory flow, high-frequency Add / Consume / Edit entries, and SKU / expiring / restock / batch summary.
- Phase 3 inventory browse page with search, category filter, location filter using Batch.locationId, expiry status filter, stock status filter, sorting, list mode, and horizontal table mode.
- Phase 3 item detail page with total stock aggregation, per-batch display, recent transaction display, and Add / Consume / Edit entry points carrying current Item context.
- Updated `inventoryRead` cloud function aggregates Phase 3 read models server-side using current OPENID and avoids page-level N+1 reads.
- Phase 4 reminder center replaces the Reminders placeholder tab with real Reminder and RestockItem views.
- `inventoryRead.listReminderCenter` aggregates Reminder rows, RestockItem rows, Item, Batch, and Location labels server-side.
- `inventoryWrite` supports `markReminderRead`, `dismissReminder`, `addToRestock`, and `dismissRestock`.
- Reminder viewing keeps lifecycle semantics: ACTIVE becomes READ; READ, DISMISSED, and RESOLVED are not revived by viewing.
- Reminder ignoring changes ACTIVE/READ to DISMISSED for the current cycle only.
- RestockItem remains separate from Reminder: ZERO_STOCK does not automatically create NEEDED unless the user chooses to join restock.
- Item detail now has a manual Join Restock entry. Restock “record purchase” reuses the Phase 2 Add Stock page with current Item context.
- Home important reminder panel links to the real reminder center.
- Phase 5 analysis tab replaces the Analysis placeholder with real V0.1 statistics.
- `StatisticsService` computes category SKU distribution, expiry Batch distribution, positive-SKU stock trend, ADD / CONSUME operation trend, summary cards, and inventory value availability.
- `inventoryRead.getAnalysisOverview` aggregates Phase 5 read models server-side using current OPENID.
- Inventory value total is intentionally unavailable because `Batch.purchasePrice` semantics are not frozen.
- Lightweight placeholder remains for Settings only; no Phase 6 functionality implemented.

## Automated Verification

Latest command:

```bash
npm test
```

Latest result:

```text
44 tests passed
```

Coverage includes Phase 1/2/3 regression, Phase 4 Reminder and Restock lifecycle tests T-P4-A01 through T-P4-A16, and Phase 5 Analytics tests T-P5-A01 through T-P5-A10.

Additional static verification:

```bash
node --check cloudfunctions/inventoryRead/index.js
node --check cloudfunctions/inventoryWrite/index.js
node --check miniprogram/pages/analysis/index.js
node --check miniprogram/pages/reminders/index.js
node --check miniprogram/pages/item-detail/index.js
node --check miniprogram/services/phase2-ui-service.js
node --check miniprogram/services/statistics-service.js
```

## Manual Verification

Previously verified in WeChat DevTools against real CloudBase:

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

Pending Phase 4 manual UI acceptance in WeChat DevTools:

- TC-P4-001 through TC-P4-020.

Pending Phase 5 manual UI acceptance in WeChat DevTools:

- TC-P5-001 through TC-P5-010.

Pending Phase 3 manual UI acceptance in WeChat DevTools:

- TC-P3-001 through TC-P3-018.

Pending Phase 2 regression in WeChat DevTools:

- New Item add.
- Existing Item add.
- Continuous add.
- Consume.
- Consume category filter.
- Edit Item.
- Edit Batch.
- ADJUST.
- FEFO.
- operationId idempotency.

Deferred manual verification:

- TC-P2-009 Undo: blocked because undo scope is not frozen.
- Two-account user isolation: no second authorized WeChat developer account is currently available.
- Phase 5 inventory value total: blocked because purchase price semantics are not frozen.

## Phase 5 Readiness

Phase 5 has been started and code-completed per explicit user direction, even though Phase 3/4 manual acceptance remains pending. Do not start Phase 6 until Phase 5 manual acceptance and the listed Phase 2/3/4 regression checks pass in WeChat DevTools. TC-P2-009 remains blocked by product definition and does not count as a code failure.
