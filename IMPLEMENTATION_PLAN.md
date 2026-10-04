# Implementation Plan - V0.1

Source of truth: `docs/INVENTORY_APP_V0.1_DESIGN_FREEZE.md`.

This plan is split by independently runnable user capability, not by frontend/backend ownership.

## Phase 0: Engineering Initialization and CloudBase Infrastructure

Status: Accepted for Phase 0 continuation. Real CloudBase initialization, `getOpenId`, `inventoryWrite`, collections, and diagnostic page verification passed; two-account user isolation is deferred until a second authorized WeChat developer account is available.

Goal:

- Convert the current template into a TypeScript-ready WeChat Mini Program project with CloudBase wiring and test scaffolding.
- Keep the app openable from the repository root in WeChat DevTools.

Files:

- `project.config.json`
- `miniprogram/app.ts`, `miniprogram/app.json`, `miniprogram/config/*`
- `cloudfunctions/dbInit/*`
- `cloudfunctions/_shared/*`
- `tests/domain/*`, `tests/services/*`, `tests/acceptance/*`
- `package.json`, `tsconfig.json`, test config if needed

Data changes:

- Define collection names.
- Add initial schemaVersion constant.
- Add default Settings seed path.

Core functions:

- `initCloud()`
- `getCurrentUserContext()`
- `ensureDefaultSettings()`

UI:

- Existing template pages can remain temporary.
- Add only minimal app boot diagnostics if necessary.

Tests:

- Project compiles.
- Cloud env config can be loaded without secrets.
- Default settings creation is idempotent.

Acceptance:

- WeChat DevTools can open repository root.
- Mini Program starts without runtime errors.
- CloudBase environment is configurable.

Not handled yet:

- Real inventory business flows.
- Final page design.

## Phase 1: Data Layer and Core Inventory Domain

Status: Accepted for Phase 1 continuation. Automated domain tests pass, and real CloudBase diagnostics verified addStock/consumeStock/adjustStock, Batch/Transaction consistency, idempotency, over-consume failure, FEFO, and batch merge rules. Two-account user isolation is deferred until test conditions are available.

Goal:

- Implement TypeScript models, repositories, pure domain functions, and core service contracts for Item / Batch / Transaction.

Files:

- `miniprogram/models/*`
- `miniprogram/repositories/*`
- `miniprogram/services/inventory-service.ts`
- `miniprogram/services/reminder-service.ts`
- `miniprogram/utils/date.ts`
- `tests/domain/*`
- `tests/services/*`

Data changes:

- Collections: `categories`, `items`, `batches`, `transactions`, `locations`, `settings`.
- Apply `_openid`, `schemaVersion`, `createdAt`, `updatedAt` conventions.

Core functions:

- `createItem`
- `calculateExpiryStatus`
- `calculateStockStatus`
- `getItemDetail`
- `getInventory`
- Batch merge matcher
- Effective expiry date calculation

UI:

- No full product UI required.
- Optional developer-only smoke page can be temporary and removed before release.

Tests:

- Status calculation for NORMAL / EXPIRING / EXPIRED.
- Stock calculation for NORMAL / LOW / ZERO.
- Batch merge only when itemId, locationId, purchaseDate, expiryDate all match.
- Derived fields are not persisted.

Acceptance:

- Item and Batch are separate.
- Transaction model exists and is queryable.
- Inventory list view model can be computed from cloud data.

Not handled yet:

- Full add / consume / edit user loop.
- Reminder persistence.

## Phase 2: Add / Consume / Edit Complete Loop

Status: Code complete for Phase 2 implementation, UI/UX closeout, and cloud read/taxonomy fix. Automated tests pass. Manual UI acceptance TC-P2-001 through TC-P2-008 and TC-P2-010 through TC-P2-022 needs retest in WeChat DevTools after deploying `inventoryRead` and `taxonomyManage`; TC-P2-009 Undo is BLOCKED by unresolved product scope.

Goal:

- Deliver the core operational loop: add stock, consume stock by FEFO, edit item/batch properties, adjust quantity through ADJUST transaction.

Files:

- `miniprogram/pages/stock-add/*`
- `miniprogram/pages/stock-consume/*`
- `miniprogram/pages/stock-edit/*`
- `miniprogram/pages/index/*`
- `miniprogram/services/phase2-ui-service.ts`
- `miniprogram/utils/phase2-form.ts`
- `miniprogram/services/inventory-service.ts`
- `cloudfunctions/inventoryWrite/*`
- `cloudfunctions/inventoryRead/*`
- `cloudfunctions/taxonomyManage/*`
- `tests/services/inventory-service.test.ts`
- `tests/acceptance/scenario-a-to-d.md`

Data changes:

- Create / update `items`.
- Create / merge `batches`.
- Create `transactions` for ADD, CONSUME, ADJUST.

Core functions:

- `createItem`
- `addStock`
- `consumeStock`
- `adjustStock`
- `updateItem`
- `updateBatch`
- `deleteItem`

UI:

- Add stock form.
- Consume stock form.
- Edit item and batch form.
- Temporary clean home with Add / Consume / Edit entries.
- Add stock form for new and existing items.
- Consume stock form with current stock context and user-facing errors.
- Edit page with Item properties, Batch properties, and explicit stock adjustment.

Tests:

- Scenario A新增物品.
- Scenario B再次购买 with merge/new batch rules.
- Scenario C FEFO consumes earliest expiry first and creates one transaction per affected batch.
- Scenario D inventory correction creates ADJUST rather than silent overwrite.
- Insufficient stock consume fails without partial writes.

Acceptance:

- User can add a new item and stock.
- User can add more stock to an existing item.
- User can consume stock correctly by FEFO.
- User can correct quantity through ADJUST.
- Transaction history remains persisted by the existing service/cloud-function layer; a full transaction-history UI is deferred to later detail/browse work.

Not handled yet:

- Full reminder center UI.
- Analytics.
- Import/export.

## Phase 3: Home and Inventory Browsing

Goal:

- Make the product usable for everyday lookup: Home summary, background inventory flow, inventory list, filters, sorting, list/table mode.

Files:

- `miniprogram/pages/home/*`
- `miniprogram/pages/inventory/*`
- `miniprogram/components/inventory-card/*`
- `miniprogram/components/stock-status-tag/*`
- `miniprogram/components/expiry-status-tag/*`
- `miniprogram/services/inventory-service.ts`
- `miniprogram/utils/storage-cache.ts`

Data changes:

- No new master collections.
- Local storage for recent searches, filters, and simple cache only.

Core functions:

- `getInventory`
- `getItemDetail`
- `getHomeSummary`
- `getBackgroundInventoryFacts`

UI:

- Home important reminder summary.
- Three fixed high-frequency entries: add, consume, edit.
- Background inventory flow, not a primary card.
- Inventory search, category/location/status filters.
- Sorting by nearest expiry, remaining days, quantity, recent add, recent consume, name.
- List mode and horizontally scrollable table mode.

Tests:

- Filtering combines category / location / expiry status / stock status.
- Sorting uses derived expiry and transaction data correctly.
- Background flow never replaces the three primary operations.

Acceptance:

- User can find inventory by search/filter/sort.
- Home stays focused on alerts and add/consume/edit.
- Inventory page is the complete browsing surface.

Not handled yet:

- Complete reminder interaction.
- Analytics charts.

## Phase 4: Reminder System and Restock

Goal:

- Implement Reminder lifecycle and separate RestockItem lifecycle.

Files:

- `miniprogram/pages/reminders/*`
- `miniprogram/components/reminder-card/*`
- `miniprogram/services/reminder-service.ts`
- `miniprogram/repositories/reminder-repo.ts`
- `miniprogram/repositories/restock-repo.ts`
- `cloudfunctions/reminderRecompute/*`
- `tests/domain/reminder-state.test.ts`
- `tests/acceptance/scenario-e-to-g.md`

Data changes:

- Collections: `reminders`, `restock_items`.
- Reminder cycle keys for duplicate prevention.

Core functions:

- `recomputeReminders`
- `calculateExpiryStatus`
- `calculateStockStatus`
- `addToRestock`
- `resolveRestock`
- `markReminderRead`
- `dismissReminder`

UI:

- Reminder page grouped by needs attention, low-stock, restock.
- View / ignore actions.
- Zero-stock prompt to add to restock.
- Restock completion after new stock purchase.

Tests:

- Expiring dismissed reminders do not repeat in same cycle.
- Expiring resolves when batch is consumed or moved safe.
- Expired does not delete or zero inventory.
- Low-stock resolves when quantity rises.
- Zero-stock can create RestockItem; new stock marks it PURCHASED.

Acceptance:

- Scenarios E, F, G pass.
- Reminder and RestockItem remain separate entities.

Not handled yet:

- Analytics charts.
- Import/export.

## Phase 5: Analytics Page

Goal:

- Add V0.1 analytics without expanding into complex BI.

Files:

- `miniprogram/pages/analytics/*`
- `miniprogram/charts/echarts-adapter/*`
- `miniprogram/services/statistics-service.ts`
- `tests/services/statistics-service.test.ts`

Data changes:

- No new master collections.
- Read from existing items, batches, transactions, categories.

Core functions:

- `getCategorySkuShare`
- `getExpiryDistribution`
- `getInventoryTrend`
- `getCurrentInventoryValue`

UI:

- Current counts: item count, batch count, optional inventory value.
- Category SKU ratio chart.
- Last 30 days inventory change trend.
- Expiry distribution.

Tests:

- Category share counts SKU/items, not incompatible unit quantities.
- Inventory value only appears when purchase price exists.
- Trend uses transactions, not direct quantity guesses.

Acceptance:

- Analytics page answers only the V0.1 fixed statistics.

Not handled yet:

- Advanced prediction or personalized analysis.

## Phase 6: Excel / JSON Data Management

Goal:

- Provide user-controlled export, standard Excel import, and full JSON backup/restore.

Files:

- `miniprogram/pages/data-management/*`
- `miniprogram/services/import-export-service.ts`
- `cloudfunctions/importBackup/*`
- `tests/services/import-export-service.test.ts`
- `tests/acceptance/scenario-h-to-i.md`

Data changes:

- Full backup covers categories, items, batches, transactions, locations, reminders, restockItems, settings.
- Restore validates schemaVersion and references before writing.

Core functions:

- `exportBackupJson`
- `validateBackupJson`
- `restoreBackupJson`
- `exportExcel`
- `importStandardExcel`

UI:

- Settings / Data Management entries.
- Import preview with data summary.
- Confirmation before overwrite or merge.
- Export result handling.

Tests:

- Backup contains all required collections.
- Restore rejects wrong schemaVersion or missing required fields.
- Restore can recover data under same user identity.
- Standard Excel import creates auditable transactions.

Acceptance:

- Scenario H same WeChat identity reloads cloud data on another device.
- Scenario I JSON backup restores all listed entities.

Not handled yet:

- Arbitrary intelligent Excel field mapping.
- Cloud backup as a separate service.

## Phase 7: Testing, Error Handling, and Release Preparation

Goal:

- Stabilize V0.1 against Design Freeze acceptance scenarios.

Files:

- `tests/acceptance/*`
- `docs/release-checklist.md`
- `miniprogram/utils/error.ts`
- all service and cloud function tests

Data changes:

- Add migration notes if schemaVersion changes during development.

Core functions:

- Error mapping and user-safe messages.
- Idempotency handling for cloud write operations.
- Basic rollback/compensation strategy where database transactions are unavailable.

UI:

- Empty states.
- Loading states.
- Retry affordances.
- Confirmation dialogs for high-risk actions.

Tests:

- Acceptance scenarios A-I.
- Failure cases: insufficient stock, invalid backup, missing references, cloud write failure.
- No page bypasses Service for multi-collection writes.

Acceptance:

- All V0.1 required scenarios pass.
- No V0.1 excluded feature has been introduced as a core path.
- WeChat DevTools can build and preview.

Not handled yet:

- V0.2 feature planning.

