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
- Core write operations use Repository transaction boundary when available.
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
15 tests passed
```

## Pending Manual Verification

Phase 0 / Phase 1 are not finally accepted against real CloudBase until these are run in WeChat DevTools:

- CloudBase initialization.
- `getOpenId` deployment and invocation.
- Required collections exist.
- Cloud Repository CRUD against real Cloud Database.
- addStock cloud persistence.
- consumeStock cloud persistence.
- Batch / Transaction consistency.
- `db.runTransaction` runtime availability.
- Two-account user isolation.

See:

- `docs/CLOUDBASE_SETUP.md`
- `docs/MANUAL_TEST_CASES.md`
- `docs/TEST_REPORTS/phase_0_1_cloudbase.md`

## Phase 2 Status

Not started.

Do not start Phase 2 until CloudBase transaction support and user isolation are manually verified, or a cloud-function transaction fallback is implemented.
