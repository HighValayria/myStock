# Dev Status

## Current Phase

Phase 0 / Phase 1 CloudBase integration accepted for continuation to Phase 2, with two-account isolation deferred until a second authorized WeChat developer account is available.

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
- Manual CloudBase setup and test documentation.

## Automated Verification

Latest command:

```bash
npm test
```

Latest result:

```text
16 tests passed
```

## Manual Verification

Verified in WeChat DevTools against real CloudBase:

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

Deferred manual verification:

- Two-account user isolation. Reason: no second authorized WeChat developer account is currently available. Repository-level isolation remains covered by automated tests; platform-authenticated `_openid` isolation must be confirmed later with two accounts.

See:

- `docs/CLOUDBASE_SETUP.md`
- `docs/MANUAL_TEST_CASES.md`
- `docs/TEST_REPORTS/phase_0_1_cloudbase.md`

## Phase 2 Status

Not started.

Phase 2 may start after this checkpoint. Two-account isolation remains a tracked deferred manual test and should be completed before release or before any sharing-related scope is considered.