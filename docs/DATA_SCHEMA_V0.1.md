# Data Schema V0.1

Source of truth: `docs/INVENTORY_APP_V0.1_DESIGN_FREEZE.md`.

## Shared Rules

- Cloud database is the master data source.
- Every user-owned document must be scoped by `_openid` or an equivalent trusted user field.
- Every persisted domain document uses `schemaVersion` for migration readiness.
- `createdAt` and `updatedAt` are Unix epoch milliseconds unless a field is explicitly a date string.
- Date-only product fields use `YYYY-MM-DD` local date strings.
- Derived values such as `remainingDays`, `expiryStatus`, `stockStatus`, and `effectiveExpiryDate` are calculated on read and are not persisted as master facts.
- Item and Batch must remain separate.
- Transaction must remain as the immutable inventory ledger.
- Quantity changes must go through Transaction-backed business actions.
- Reminder and RestockItem must remain separate.

## Enums

```ts
export type ShelfLifeUnit = 'DAY' | 'MONTH' | 'YEAR';
export type TransactionType = 'ADD' | 'CONSUME' | 'ADJUST' | 'DISCARD' | 'DELETE';
export type TransactionReason = 'PURCHASE' | 'USED' | 'EXPIRED' | 'DAMAGED' | 'GIFT' | 'MANUAL_CORRECTION' | 'OTHER';
export type ReminderType = 'EXPIRING' | 'EXPIRED' | 'LOW_STOCK' | 'ZERO_STOCK';
export type ReminderStatus = 'ACTIVE' | 'READ' | 'DISMISSED' | 'RESOLVED';
export type RestockStatus = 'NEEDED' | 'PURCHASED' | 'DISMISSED';
export type ExpiryStatus = 'NORMAL' | 'EXPIRING' | 'EXPIRED';
export type StockStatus = 'NORMAL' | 'LOW' | 'ZERO';
export type ConsumeStrategy = 'FEFO';
export type ThemeMode = 'system' | 'light' | 'dark';
```

## Base Document

```ts
export interface BaseDoc {
  _id: string;
  _openid: string;
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
}
```

CloudBase may inject `_openid`, but repositories and cloud functions must still enforce user isolation explicitly.

## Category - `categories`

```ts
export interface Category extends BaseDoc {
  name: string;
  icon?: string | null;
  expiryWarningDays?: number | null;
  defaultLowStock?: number | null;
}
```

Required fields: `_id`, `_openid`, `schemaVersion`, `name`, `createdAt`, `updatedAt`.

Optional fields: `icon`, `expiryWarningDays`, `defaultLowStock`.

Indexes:

- `_openid + name` unique per user if supported.
- `_openid + updatedAt` for management list ordering.

References: referenced by `items.categoryId`.

## Item - `items`

```ts
export interface Item extends BaseDoc {
  name: string;
  categoryId: string;
  brand?: string | null;
  specification?: string | null;
  unit: string;
  defaultLocationId?: string | null;
  lowStockThreshold?: number | null;
  expiryWarningDays?: number | null;
  barcode?: string | null;
  note?: string;
}
```

Required fields: `_id`, `_openid`, `schemaVersion`, `name`, `categoryId`, `unit`, `createdAt`, `updatedAt`.

Optional fields: `brand`, `specification`, `defaultLocationId`, `lowStockThreshold`, `expiryWarningDays`, `barcode`, `note`.

Indexes:

- `_openid + name` for search.
- `_openid + categoryId` for filters.
- `_openid + defaultLocationId` for filters.
- `_openid + updatedAt` for recent items.
- `_openid + barcode` optional sparse index.

References:

- `categoryId -> categories._id`.
- `defaultLocationId -> locations._id`.
- Referenced by `batches.itemId`, `transactions.itemId`, `reminders.itemId`, `restock_items.itemId`.

## Batch - `batches`

```ts
export interface Batch extends BaseDoc {
  itemId: string;
  quantity: number;
  locationId: string;
  purchaseDate?: string | null;
  productionDate?: string | null;
  shelfLifeValue?: number | null;
  shelfLifeUnit?: ShelfLifeUnit | null;
  expiryDate: string;
  purchasePrice?: number | null;
  purchaseChannel?: string | null;
  openedDate?: string | null;
  openedExpiryDate?: string | null;
  note?: string;
}
```

Required fields: `_id`, `_openid`, `schemaVersion`, `itemId`, `quantity`, `locationId`, `expiryDate`, `createdAt`, `updatedAt`.

Optional fields: `purchaseDate`, `productionDate`, `shelfLifeValue`, `shelfLifeUnit`, `purchasePrice`, `purchaseChannel`, `openedDate`, `openedExpiryDate`, `note`.

Indexes:

- `_openid + itemId` for item detail.
- `_openid + itemId + quantity` for positive batch lookup.
- `_openid + expiryDate` for expiry sorting and reminders.
- `_openid + locationId` for inventory filters.
- `_openid + purchaseDate` for recent additions.
- `_openid + itemId + locationId + purchaseDate + expiryDate` for conservative merge lookup.

References:

- `itemId -> items._id`.
- `locationId -> locations._id`.
- Referenced by `transactions.batchId` and batch-scoped `reminders.batchId`.

Derived fields not stored: `effectiveExpiryDate`, `remainingDays`, `expiryStatus`.

## Transaction - `transactions`

```ts
export interface Transaction extends Omit<BaseDoc, 'updatedAt'> {
  itemId: string;
  batchId: string;
  type: TransactionType;
  quantity: number;
  reason: TransactionReason;
  note?: string;
  operationId?: string;
}
```

Required fields: `_id`, `_openid`, `schemaVersion`, `itemId`, `batchId`, `type`, `quantity`, `reason`, `createdAt`.

Optional fields: `note`, `operationId`.

Indexes:

- `_openid + itemId + createdAt` for item detail history.
- `_openid + batchId + createdAt` for batch history.
- `_openid + type + createdAt` for analytics.
- `_openid + operationId` unique when supplied for idempotency.

References:

- `itemId -> items._id`.
- `batchId -> batches._id`.

Quantity convention:

- ADD: positive quantity.
- CONSUME / DISCARD: negative quantity.
- ADJUST: positive or negative diff.
- DELETE: reserved for auditable delete-like operations if needed; ordinary users do not delete transaction history.

## Location - `locations`

```ts
export interface Location extends BaseDoc {
  name: string;
  parentId?: string | null;
}
```

Required fields: `_id`, `_openid`, `schemaVersion`, `name`, `createdAt`, `updatedAt`.

Optional fields: `parentId`.

Indexes:

- `_openid + parentId` for tree loading.
- `_openid + name` for management search.

References:

- `parentId -> locations._id`.
- Referenced by `items.defaultLocationId` and `batches.locationId`.

## Reminder - `reminders`

```ts
export interface Reminder extends BaseDoc {
  type: ReminderType;
  itemId: string;
  batchId?: string | null;
  status: ReminderStatus;
  cycleKey: string;
  readAt?: number | null;
  dismissedAt?: number | null;
  resolvedAt?: number | null;
}
```

Required fields: `_id`, `_openid`, `schemaVersion`, `type`, `itemId`, `status`, `cycleKey`, `createdAt`, `updatedAt`.

Optional fields: `batchId`, `readAt`, `dismissedAt`, `resolvedAt`.

Indexes:

- `_openid + status + type` for reminder center.
- `_openid + itemId + status` for item detail.
- `_openid + batchId + status` for batch-scoped expiry reminders.
- `_openid + cycleKey` unique per user if supported, to avoid duplicate reminder cycles.

References:

- `itemId -> items._id`.
- `batchId -> batches._id` for EXPIRING / EXPIRED when applicable.

## RestockItem - `restock_items`

```ts
export interface RestockItem extends BaseDoc {
  itemId: string;
  status: RestockStatus;
  resolvedAt?: number | null;
  note?: string;
}
```

Required fields: `_id`, `_openid`, `schemaVersion`, `itemId`, `status`, `createdAt`, `updatedAt`.

Optional fields: `resolvedAt`, `note`.

Indexes:

- `_openid + status + createdAt` for restock list.
- `_openid + itemId + status` to find active needed record.

References:

- `itemId -> items._id`.

Reminder relationship: ZERO_STOCK may prompt creation of RestockItem, but RestockItem is a separate persistent state and not a Reminder subtype.

## Settings - `settings`

```ts
export interface Settings extends BaseDoc {
  defaultExpiryWarningDays: number;
  defaultConsumeStrategy: ConsumeStrategy;
  lowStockReminder: boolean;
  expiryReminder: boolean;
  zeroStockReminder: boolean;
  autoAddRestock: boolean;
  theme: ThemeMode;
}
```

Required fields: `_id`, `_openid`, `schemaVersion`, `defaultExpiryWarningDays`, `defaultConsumeStrategy`, `lowStockReminder`, `expiryReminder`, `zeroStockReminder`, `autoAddRestock`, `theme`, `createdAt`, `updatedAt`.

Indexes:

- `_openid` unique per user if supported.

## Derived View Models

```ts
export interface InventoryListItem {
  item: Item;
  totalQuantity: number;
  nearestExpiryDate?: string | null;
  nearestRemainingDays?: number | null;
  expiryStatus: ExpiryStatus;
  stockStatus: StockStatus;
}

export interface ItemDetail {
  item: Item;
  batches: Array<Batch & { remainingDays: number; expiryStatus: ExpiryStatus }>;
  recentTransactions: Transaction[];
  totalQuantity: number;
  stockStatus: StockStatus;
  reminders: Reminder[];
  restockItem?: RestockItem | null;
}
```

These view models are computed responses and should not be treated as persisted master schema.

## Core Input Types

```ts
export interface CreateItemInput {
  name: string;
  categoryId: string;
  unit: string;
  brand?: string | null;
  specification?: string | null;
  defaultLocationId?: string | null;
  lowStockThreshold?: number | null;
  expiryWarningDays?: number | null;
  barcode?: string | null;
  note?: string;
}

export interface AddStockInput {
  itemId?: string;
  item?: CreateItemInput;
  quantity: number;
  locationId: string;
  purchaseDate?: string | null;
  productionDate?: string | null;
  shelfLifeValue?: number | null;
  shelfLifeUnit?: ShelfLifeUnit | null;
  expiryDate: string;
  purchasePrice?: number | null;
  purchaseChannel?: string | null;
  note?: string;
  operationId: string;
}

export interface ConsumeStockInput {
  itemId: string;
  quantity: number;
  reason?: Extract<TransactionReason, 'USED' | 'EXPIRED' | 'DAMAGED' | 'GIFT' | 'OTHER'>;
  note?: string;
  operationId: string;
}

export interface AdjustStockInput {
  batchId: string;
  actualQuantity: number;
  reason: 'MANUAL_CORRECTION';
  note?: string;
  operationId: string;
}
```

## FEFO Pseudocode

```ts
async function consumeStock(input: ConsumeStockInput) {
  const batches = await batchRepo.listPositiveByItem(input.itemId);
  const sorted = batches.sort(byEffectiveExpiryDateAsc);
  const total = sum(sorted.map(batch => batch.quantity));
  if (total < input.quantity) throw new Error('INSUFFICIENT_STOCK');

  let remaining = input.quantity;
  for (const batch of sorted) {
    if (remaining === 0) break;
    const deduct = Math.min(batch.quantity, remaining);
    await batchRepo.updateQuantity(batch._id, batch.quantity - deduct);
    await transactionRepo.create({
      itemId: input.itemId,
      batchId: batch._id,
      type: 'CONSUME',
      quantity: -deduct,
      reason: input.reason ?? 'USED',
      operationId: input.operationId,
    });
    remaining -= deduct;
  }

  await reminderService.recomputeReminders({ itemId: input.itemId });
}
```

Actual implementation should execute inside a cloud function transaction when available.
