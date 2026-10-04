# Phase 0 / Phase 1 CloudBase Integration Test Report

Date: 2026-10-04
Scope: Phase 0 / Phase 1 cloud repository, repository switching, server-side mutation transaction boundary, idempotency, user isolation contract, and development diagnostic path.

## Automated Tests

Command:

```bash
npm test
```

Result:

```text
16 tests passed
```

Covered automatically; the original 15 domain and repository tests are retained:

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
- Cloud-mode `InventoryService` write operations delegate to the mutation client instead of using local Repository writes.

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

## Cloud Function Mutation Contract

Implemented contract:

- `addStock`, `consumeStock`, and `adjustStock` are invoked from the mini program Service through `wx.cloud.callFunction`.
- The cloud function `inventoryWrite` uses the CloudBase Node SDK and server-side `db.runTransaction`.
- Batch mutation, Transaction creation, Reminder recompute, and RestockItem update are inside the same transaction boundary when they belong to one business operation.
- `operationId` is checked inside the transaction so retrying the same operation does not double-write.
- FEFO candidate batches are selected before the transaction, then re-read and validated inside the transaction before deduction.
- If Transaction creation fails, the transaction aborts and Batch changes roll back.

## Manual CloudBase Verification

Verified in WeChat DevTools against a real CloudBase environment:

- CloudBase initialization validation.
- `getOpenId` returned the current WeChat user's OpenID.
- `inventoryWrite` deployment and invocation.
- addStock cloud persistence through server-side transaction.
- consumeStock cloud persistence through server-side transaction.
- adjustStock cloud persistence through server-side transaction.
- Batch / Transaction consistency in real Cloud Database.
- Duplicate `operationId` idempotency in the real cloud function.
- Over-consume failure without Batch / Transaction half writes.
- Multi-batch FEFO consume.
- Same-batch merge.
- Different-expiry no-merge.
- Dev-created data cleanup.

Deferred:

- Two-account `_openid` isolation. Not executed because a second authorized WeChat developer account is not currently available.

Manual test cases are documented in `docs/MANUAL_TEST_CASES.md` under `Phase 0 / Phase 1 CloudBase Integration Addendum`.

## Current Acceptance Status

Phase 0 / Phase 1 are accepted for continuing to Phase 2, with one deferred manual verification item: two-account `_openid` isolation. The deferred item is caused by missing test conditions, not by a known implementation failure.

The final consistency decision is no longer open: core inventory transactions are executed by `inventoryWrite` with CloudBase Node SDK server-side transactions, not by mini program client-side `wx.cloud.database().runTransaction`.