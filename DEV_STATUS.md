# Dev Status

## Current Phase

Phase 0 / Phase 1 CloudBase integration hardening.

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

## Pending Manual Verification

Phase 0 / Phase 1 are not finally accepted against real CloudBase until these are run in WeChat DevTools:

- CloudBase initialization.
- `getOpenId` deployment and invocation.
- `inventoryWrite` deployment and invocation.
- Required collections exist.
- Cloud Repository CRUD against real Cloud Database.
- addStock cloud persistence through cloud function transaction.
- consumeStock FEFO cloud persistence through cloud function transaction.
- adjustStock cloud persistence through cloud function transaction.
- Batch / Transaction consistency.
- Duplicate `operationId` idempotency in the cloud function.
- Two-account user isolation.

See:

- `docs/CLOUDBASE_SETUP.md`
- `docs/MANUAL_TEST_CASES.md`
- `docs/TEST_REPORTS/phase_0_1_cloudbase.md`

## Phase 2 Status

Not started.

Do not start Phase 2 until the `inventoryWrite` cloud function path and user isolation are manually verified in WeChat DevTools.
