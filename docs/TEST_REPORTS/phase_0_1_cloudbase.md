# Phase 0 / Phase 1 CloudBase Integration Test Report

Date: 2026-10-03
Scope: Phase 0 / Phase 1 cloud repository, repository switching, transaction boundary, idempotency, user isolation contract, and development diagnostic path.

## Automated Tests

Command:

```bash
npm test
```

Result:

```text
15 tests passed
```

Covered automatically:

- Single batch add.
- Same batch merge.
- Different expiry date does not merge.
- Single batch consume.
- Multi-batch FEFO consume.
- Consume over stock fails before writes.
- Quantity correction creates ADJUST.
- Low-stock reminder creation.
- Zero-stock reminder creation.
- Expiring reminder creation.
- Expired reminder creation without auto-zero or delete.
- Dismissed reminder does not duplicate in same cycle.
- Condition clearing resolves reminder.
- Duplicate operationId does not double write.
- Repository user isolation contract rejects known-id read/update for another user in the shared interface.

## Compile Verification

`npm test` includes:

```bash
npm run build
```

This verifies TypeScript compilation for:

- miniprogram models
- Memory Repository
- Cloud Repository
- services
- cloud function TypeScript sources
- tests

## Manual CloudBase Tests Required

These require WeChat DevTools and a real CloudBase environment:

- CloudBase initialization validation.
- Cloud Repository basic CRUD against real collections.
- addStock cloud persistence.
- consumeStock cloud persistence.
- Batch / Transaction consistency in real Cloud Database.
- `db.runTransaction` runtime availability.
- two-account `_openid` isolation.

Manual test cases are documented in `docs/MANUAL_TEST_CASES.md` under `Phase 0 / Phase 1 CloudBase Integration Addendum`.

## Current Acceptance Status

Phase 0 / Phase 1 implementation is code-complete for Cloud Repository integration, but final cloud acceptance is pending manual execution in WeChat DevTools. If `db.runTransaction` is unavailable in the miniprogram runtime, the next required task is moving high-risk writes to transaction-capable cloud functions before Phase 2 begins.
