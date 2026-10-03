# CloudBase Setup - Phase 0 / Phase 1

Source of truth: `docs/INVENTORY_APP_V0.1_DESIGN_FREEZE.md`.

## Final Transaction Architecture

CloudBase database transactions are treated as a server-side capability. The mini program client must not rely on `wx.cloud.database().runTransaction`.

Read path:

```text
Page -> Service -> Cloud Repository -> Cloud Database
```

Write path for core inventory mutations:

```text
Page -> Service -> wx.cloud.callFunction -> inventoryWrite Cloud Function -> CloudBase Node SDK -> server-side runTransaction -> Cloud Database
```

Core mutation actions handled by `cloudfunctions/inventoryWrite`:

- `addStock`
- `consumeStock`
- `adjustStock`
- `cleanupDevItem` for development diagnostics only

## Environment ID

Configure CloudBase environment in `miniprogram/config/env.ts`:

```ts
export const CLOUD_ENV_ID = '';
```

Leave empty only when WeChat DevTools is already bound to the intended cloud environment. Do not commit secrets. The CloudBase environment ID is not a secret, but production-specific configuration should still be reviewed before release.

## Initialization

`miniprogram/config/cloud.ts` calls:

```ts
wx.cloud.init({ env: getCloudEnvId(), traceUser: true })
```

Required cloud functions:

- `getOpenId`: returns the trusted platform OpenID for current user.
- `inventoryWrite`: performs core inventory mutations in server-side transactions.
- `dbInit`: documents expected collections and recommended indexes; it is intentionally non-destructive.

## Required Collections

Create these collections in CloudBase:

```text
categories
items
batches
transactions
locations
reminders
restock_items
settings
```

Each user-owned document is scoped by `_openid`. Repository reads include `_openid` filters, including known `_id` lookups. Core writes are scoped by server-side `OPENID` inside cloud functions.

## Recommended Indexes

Create indexes according to CloudBase capabilities:

```text
categories:      _openid + name, _openid + updatedAt
items:           _openid + name, _openid + categoryId, _openid + defaultLocationId, _openid + updatedAt, _openid + barcode
batches:         _openid + itemId, _openid + itemId + quantity, _openid + expiryDate, _openid + locationId, _openid + purchaseDate, _openid + itemId + locationId + purchaseDate + expiryDate
transactions:    _openid + itemId + createdAt, _openid + batchId + createdAt, _openid + type + createdAt, _openid + operationId
locations:       _openid + parentId, _openid + name
reminders:       _openid + status + type, _openid + itemId + status, _openid + batchId + status, _openid + cycleKey
restock_items:   _openid + status + createdAt, _openid + itemId + status
settings:        _openid
```

If unique indexes are available, prefer `_openid + operationId` for `transactions` and `_openid + cycleKey` for `reminders`.

## Permissions

Cloud Database permissions must prevent cross-user access. Minimum expectation:

- A user can read their own documents.
- A user can create documents scoped to their own identity only through trusted code paths.
- A user cannot read or update documents owned by another `_openid`.

The Repository layer applies `_openid` filters for reads. The `inventoryWrite` cloud function uses server-side `OPENID` and ignores client-provided user identity.

## Consistency Guarantees

`inventoryWrite` wraps core mutation work in server-side transactions:

- Batch changes and Transaction creation are committed together.
- If Transaction creation fails, Batch changes roll back.
- Reminder recompute and RestockItem updates caused by the same mutation are performed inside the same transaction.
- `operationId` is checked inside the transaction so retries do not double-add, double-consume, or create duplicate Transactions.

FEFO consume flow:

1. Outside transaction, query positive batches and sort by `effectiveExpiryDate`.
2. Inside transaction, reread candidate Batch IDs.
3. Revalidate item ownership, quantity, and effective expiry snapshot.
4. If changed, fail with `STALE_STOCK_RETRY_REQUIRED` and retry from a fresh read.
5. Deduct by FEFO and create one Transaction per affected Batch.

## Development Diagnostic

Use the temporary development-only page:

```text
pages/dev-cloud-check/index
```

It verifies:

- Cloud initialization.
- Current OpenID via `getOpenId`.
- `InventoryService.addStock` -> `inventoryWrite` -> server transaction.
- `InventoryService.consumeStock` -> `inventoryWrite` -> server transaction.
- `InventoryService.adjustStock` -> `inventoryWrite` -> server transaction.
- Cloud Repository readback for Batch and Transaction state.
- Safe cleanup of the dev-created `dev-cloud-item-*` record.
