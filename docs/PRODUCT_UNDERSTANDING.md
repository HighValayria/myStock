# Product Understanding - V0.1

Source of truth: `docs/INVENTORY_APP_V0.1_DESIGN_FREEZE.md`.

## Core Goal

The product is a personal / household inventory ledger. Its core promise is to help the user know what they have, where it is, how much remains, and what needs attention soon. Cloud database is the primary source of truth. Local storage is limited to cache, drafts, UI state, and performance hints.

## Top-Level Pages

The fixed tab bar has five first-level pages:

- Home: shows the most important inventory alerts, exposes add / consume / edit, and keeps lightweight background inventory flow as ambient awareness rather than a primary card.
- Inventory: complete search, filter, sort, list/table browsing, and item detail entry.
- Analytics: V0.1 statistics only: category SKU ratio, expiry distribution, inventory change trend, and optional total inventory value when purchase price exists.
- Reminders: actionable center for expiring, expired, low-stock, zero-stock, plus a separate restock list.
- Settings: category, location, unit, reminder rules, data import/export/backup/restore, and advanced settings such as FEFO.

## Item / Batch / Transaction Relationship

- Item describes stable identity: name, category, brand, specification, unit, default location, low stock threshold, default expiry warning, barcode, note.
- Batch describes a concrete stock lot: item reference, current quantity snapshot, location, purchase / production / expiry / opened dates, shelf life, price, channel, note.
- Transaction is the inventory ledger: every add, consume, adjust, discard, delete-like business change must leave a trace explaining why quantity changed.

`Transaction` is the account book. `Batch.quantity` is the current snapshot derived and maintained by controlled business actions.

## Supporting Entities

- Category: logical grouping and default expiry / low-stock settings. It is not a physical table split by category.
- Location: hierarchical storage location, such as home / kitchen / fridge / freezer. Users do not need to fill the deepest level.
- Reminder: lifecycle-managed prompt for expiring, expired, low-stock, and zero-stock conditions.
- RestockItem: separate sustained buying intent / state. It is related to zero-stock but must not be merged into Reminder.
- Settings: user-level defaults such as default expiry warning days, consume strategy, reminder switches, auto restock behavior, theme, schemaVersion.

## Core State Flows

Add stock:

- Select existing item or create a new Item.
- Fill stock information for the current purchase / batch.
- Merge with an existing Batch only when itemId, locationId, purchaseDate, and expiryDate all match.
- Create or update Batch.
- Create ADD Transaction.
- Recompute stock / expiry reminders.
- If a RestockItem exists, mark it PURCHASED.

Consume stock:

- Select item and input consume quantity.
- Load all positive-quantity batches for the item.
- Sort by effective expiry date, nearest first.
- Deduct by FEFO.
- For each affected batch, update Batch and create CONSUME Transaction.
- Recompute low-stock, zero-stock, reminder, and restock state.

Edit:

- Item and Batch descriptive fields can be edited directly.
- Quantity edits are not direct overwrites. They calculate diff and generate ADJUST Transaction with MANUAL_CORRECTION, then update Batch snapshot and recompute reminders.

## FEFO Rule

FEFO means First Expired, First Out. Consume actions must deduct from batches by `effectiveExpiryDate` ascending. `effectiveExpiryDate = min(expiryDate, openedExpiryDate)` when opened expiry exists; otherwise `expiryDate`. If a user consumes more than one batch, each batch receives its own Transaction.

## Reminder State Machines

Expiry status and stock status are independent dimensions and must not be merged.

Expiry status:

- `remainingDays < 0`: EXPIRED.
- `0 <= remainingDays <= warningDays`: EXPIRING.
- `remainingDays > warningDays`: NORMAL.

Stock status:

- `totalQuantity == 0`: ZERO.
- `0 < totalQuantity <= lowStockThreshold`: LOW.
- `totalQuantity > lowStockThreshold`: NORMAL.
- If no lowStockThreshold is configured, LOW does not trigger.

Unified reminder lifecycle:

- Condition first satisfied creates ACTIVE.
- User view can mark READ.
- User ignore can mark DISMISSED for the current condition cycle.
- Condition removed marks RESOLVED.

Expiring reminders do not repeat within the same dismissed cycle as days decrease. Expired stock remains in inventory and is never auto-deleted or auto-zeroed. Low-stock dismissal is not permanent. Zero-stock can create a separate RestockItem, and new stock resolves zero-stock and marks restock purchased.

## Cloud Database and Cloud Functions

Cloud database is the only master data source. Every private record must be scoped to current user identity, normally by `_openid` or equivalent user ownership field. Pages must not scatter direct database writes. Access flows through Service and Repository layers.

High-risk multi-collection operations should live in controlled Service / cloud functions: add stock, consume stock, adjust stock, delete item, batch merge, reminder recompute, Excel import, and full backup restore. Transactions should be preferred when CloudBase capability allows; otherwise use idempotency keys, compensation, or rollback.

## V0.1 Includes

Cloud database initialization and user isolation; basic cloud functions / Service layer; Home with background inventory flow; add / consume / edit; category and location management; Item / Batch / Transaction; FEFO; inventory list with search/filter/list/table/detail; expiry, expired, low-stock, zero-stock calculations; reminder center; restock; basic analytics; settings; JSON backup/restore; Excel export; standard Excel import; basic undo / correction.

## V0.1 Excludes

LLM text import; arbitrary Excel intelligent field mapping; OCR / receipt recognition; voice input; personalized reminder learning; consumption speed prediction; storage capacity inference; multi-device sync beyond same-account cloud reload; cloud backup as a separate product feature; family sharing; automatic shopping suggestions; product barcode database matching.
