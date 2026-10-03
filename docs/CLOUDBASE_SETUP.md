# CloudBase Setup - Phase 0 / Phase 1

Source of truth: `docs/INVENTORY_APP_V0.1_DESIGN_FREEZE.md`.

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

`cloudfunctions/getOpenId` returns the trusted platform OpenID for current user. `cloudfunctions/dbInit` documents the expected collections for bootstrap and can later be expanded to seed defaults.

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

Each user-owned document is scoped by `_openid`. Repository reads and writes also include `_openid` filters, including known `_id` lookups and updates.

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
- A user can create documents scoped to their own identity.
- A user cannot read or update documents owned by another `_openid`.

The Repository layer still applies `_openid` filters; database rules are the second line of defense.

## Transaction Requirement

Core write operations are wrapped through `InventoryRepositories.runInTransaction` when available:

- `addStock`
- `consumeStock`
- `adjustStock`
- `updateBatch`
- `deleteItem`

Cloud Repository uses `db.runTransaction`. If the current WeChat runtime does not support this API from the miniprogram side, the diagnostic page will fail with `TRANSACTION_UNAVAILABLE`. In that case Phase 0 / Phase 1 cloud acceptance remains pending until these writes are moved behind cloud functions that support transactions.

## Development Diagnostic

Use the temporary development-only page:

```text
pages/dev-cloud-check/index
```

It verifies:

- Cloud initialization.
- Current OpenID via `getOpenId`.
- `InventoryService.addStock` using Cloud Repository.
- `InventoryService.getItemDetail` using Cloud Repository.
- `InventoryService.consumeStock` using Cloud Repository.
