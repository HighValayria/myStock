# Engineering Architecture - V0.1

Source of truth: `docs/INVENTORY_APP_V0.1_DESIGN_FREEZE.md`.

## Current Project Status

The repository is a minimal WeChat Mini Program template. `project.config.json` points `miniprogramRoot` to `miniprogram/` and `cloudfunctionRoot` to `cloudfunctions/`. There is no TypeScript, CloudBase initialization, repository layer, service layer, or test setup yet.

## Target Stack

- WeChat Mini Program.
- TypeScript for frontend and cloud function source.
- WeChat CloudBase cloud database as master data source.
- Cloud functions for high-risk multi-collection writes.
- Local Storage only for cache, UI state, recent searches, recent items, and drafts.
- ECharts Mini Program adapter for V0.1 analytics charts.

## Recommended Directory Structure

```text
inventory-miniapp/
├─ miniprogram/
│  ├─ app.ts
│  ├─ app.json
│  ├─ app.wxss
│  ├─ sitemap.json
│  ├─ assets/
│  ├─ charts/
│  │  └─ echarts-adapter/
│  ├─ components/
│  │  ├─ empty-state/
│  │  ├─ inventory-card/
│  │  ├─ reminder-card/
│  │  ├─ stock-status-tag/
│  │  └─ expiry-status-tag/
│  ├─ config/
│  │  ├─ collections.ts
│  │  └─ env.ts
│  ├─ models/
│  ├─ repositories/
│  ├─ services/
│  ├─ utils/
│  └─ pages/
│     ├─ home/
│     ├─ inventory/
│     ├─ analytics/
│     ├─ reminders/
│     ├─ settings/
│     ├─ item-detail/
│     ├─ batch-detail/
│     ├─ stock-add/
│     ├─ stock-consume/
│     ├─ stock-edit/
│     ├─ category-manage/
│     ├─ location-manage/
│     └─ data-management/
├─ cloudfunctions/
│  ├─ _shared/
│  │  ├─ models/
│  │  ├─ repositories/
│  │  ├─ domain/
│  │  └─ guards/
│  ├─ inventoryWrite/
│  ├─ reminderRecompute/
│  ├─ importBackup/
│  └─ dbInit/
├─ docs/
├─ tests/
│  ├─ domain/
│  ├─ services/
│  ├─ repositories/
│  ├─ cloudfunctions/
│  └─ acceptance/
├─ IMPLEMENTATION_PLAN.md
├─ OPEN_QUESTIONS.md
├─ README.md
└─ AGENTS.md
```

## Frontend Directories

- `pages/`: five tab pages plus second-level add / consume / edit / detail / management pages.
- `components/`: reusable UI with no cross-collection database writes.
- `models/`: TypeScript domain types and enums.
- `repositories/`: CloudBase data access wrappers.
- `services/`: business workflows and page-facing APIs.
- `utils/`: date, id, quantity, validation, and local cache helpers.
- `config/`: collection names and environment configuration.
- `charts/`: ECharts Mini Program adapter and chart wrappers.

## Page and Component Responsibilities

Pages own lifecycle, rendering state, form state, navigation, and user confirmation. Pages call Services and do not coordinate multi-collection writes.

Components render reusable UI: cards, status tags, filters, reminder rows, empty states. Components do not perform product-level data mutations.

## Service Layer

Services own product workflows:

- `InventoryService`: createItem, addStock, consumeStock, adjustStock, updateItem, updateBatch, deleteItem, getInventory, getItemDetail.
- `ReminderService`: calculateExpiryStatus, calculateStockStatus, recomputeReminders, addToRestock, resolveRestock, read/dismiss reminders.
- `StatisticsService`: category SKU share, expiry distribution, transaction-based inventory trend, optional inventory value.
- `ImportExportService`: JSON backup/restore, Excel export, standard Excel import.
- `SettingsService`: settings load/update and inheritance of default thresholds.

## Repository Layer

Repositories encapsulate CloudBase collection calls:

- `categoryRepo`
- `itemRepo`
- `batchRepo`
- `transactionRepo`
- `locationRepo`
- `reminderRepo`
- `restockRepo`
- `settingsRepo`

Repository methods always apply user scope and collection names. Repositories expose CRUD/list/query primitives, not product decisions.

## Cloud Functions

- `dbInit`: initialize defaults and optionally create supported indexes.
- `inventoryWrite`: add stock, consume stock, adjust stock, delete item, conservative batch merge, transaction creation, restock resolution.
- `reminderRecompute`: recompute reminders for an item, batch, or current user.
- `importBackup`: validate schemaVersion, references, data summary, and perform restore after confirmation.

High-risk actions should prefer database transactions where available. If unavailable, cloud functions must use `operationId` idempotency, validation before writes, and compensating behavior for partial failures.

## Models and Types

Types live under `miniprogram/models/*` and should be mirrored or shared into `cloudfunctions/_shared/models/*`. The core entities are Category, Item, Batch, Transaction, Location, Reminder, RestockItem, and Settings. See `docs/DATA_SCHEMA_V0.1.md`.

## Utilities

- `date.ts`: local date parsing, effective expiry date, remaining days.
- `id.ts`: domain ID or operation ID generation.
- `quantity.ts`: numeric validation and sum helpers.
- `validation.ts`: input guards for service and cloud function requests.
- `storage-cache.ts`: recent searches, filters, drafts, and hotspot cache only.

## Testing Layout

- `tests/domain/`: pure FEFO, status, merge, and reminder-cycle tests.
- `tests/services/`: service orchestration with mocked repositories.
- `tests/repositories/`: CloudBase adapter behavior where practical.
- `tests/cloudfunctions/`: cloud function request validation and idempotency.
- `tests/acceptance/`: Design Freeze scenarios A-I.

## Configuration and Environment Management

- `project.config.json` remains the root WeChat project config.
- Cloud environment ID should be configured in `miniprogram/config/env.ts` or generated from a local ignored file.
- Collection names live in `miniprogram/config/collections.ts` and cloud `_shared` equivalent.
- Do not commit secrets or model API keys.
- AI APIs are outside V0.1 and must never be placed in frontend code.
- `project.private.config.json` remains local developer preference only.

## Core Service Interfaces

```ts
export interface InventoryService {
  createItem(input: CreateItemInput): Promise<Item>;
  addStock(input: AddStockInput): Promise<AddStockResult>;
  consumeStock(input: ConsumeStockInput): Promise<ConsumeStockResult>;
  adjustStock(input: AdjustStockInput): Promise<AdjustStockResult>;
  updateItem(itemId: string, patch: UpdateItemInput): Promise<Item>;
  updateBatch(batchId: string, patch: UpdateBatchInput): Promise<Batch>;
  deleteItem(itemId: string, options: DeleteItemOptions): Promise<void>;
  getInventory(query: InventoryQuery): Promise<InventoryListResult>;
  getItemDetail(itemId: string): Promise<ItemDetail>;
}

export interface ReminderService {
  calculateExpiryStatus(batch: Batch, warningDays: number, now: Date): ExpiryStatus;
  calculateStockStatus(totalQuantity: number, threshold?: number | null): StockStatus;
  recomputeReminders(scope: ReminderRecomputeScope): Promise<ReminderRecomputeResult>;
  addToRestock(input: AddToRestockInput): Promise<RestockItem>;
  resolveRestock(itemId: string, reason: 'PURCHASED' | 'DISMISSED'): Promise<RestockItem | null>;
}
```

## Business Action Boundaries

- Add stock: create/update Item, merge/create Batch, create ADD Transaction, recompute reminders, resolve RestockItem if needed.
- Consume stock: FEFO batch update, one CONSUME Transaction per affected batch, recompute reminders, optionally create zero-stock restock prompt.
- Adjust stock: diff calculation, Batch update, ADJUST Transaction, recompute reminders.
- Delete item: validate all batches are zero or require discard/correction first; ordinary users cannot delete Transaction history directly.
- Backup restore / Excel import: validate schemaVersion, required fields, references, and user confirmation.
