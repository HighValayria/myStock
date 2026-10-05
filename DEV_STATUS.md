# Dev Status

## Current Phase

Phase 3 implementation is code-complete for the formal Home and Inventory Browsing surface. Automated verification passes. WeChat DevTools manual UI acceptance for TC-P3-001 through TC-P3-018 is pending after deploying the updated `inventoryRead` cloud function.

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
- Lightweight placeholder tabs for Analysis, Reminders, and Settings; no Phase 4/5/6 functionality implemented.

## Automated Verification

Latest command:

```bash
npm test
```

Latest result:

```text
18 tests passed
```

Coverage includes Phase 1/2 regression plus Phase 3 display helper assertions for localized derived states, hidden unknown-expiry compatibility values, and transaction labels.

Additional static verification:

```bash
node --check cloudfunctions/inventoryRead/index.js
node JSON parse check for app/page configs
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

## Phase 4 Readiness

Do not start Phase 4 until TC-P3-001 through TC-P3-018 and the listed Phase 2 regression checks pass in WeChat DevTools. TC-P2-009 remains blocked by product definition and does not count as a code failure.