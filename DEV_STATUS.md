# Dev Status

## Current Phase

Phase 2 implementation is code-complete for the Add / Consume / Edit user loop. Automated verification passes. WeChat DevTools manual UI acceptance is pending for TC-P2-001 through TC-P2-008 before starting Phase 3.

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
- Phase 2 UI service that routes pages through InventoryService instead of direct database writes.
- Phase 2 form validation and user-facing error mapping.

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

- TC-P2-001 through TC-P2-008.

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
