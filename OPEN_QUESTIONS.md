# Open Questions

Source of truth: `docs/INVENTORY_APP_V0.1_DESIGN_FREEZE.md`.

Questions are grouped by when they must be resolved. These notes do not override the Design Freeze.

## A. Must Resolve Before The Related UI Is Completed

### Q2: Undo / Correction Basic Capability

V0.1 includes “撤销 / 修正基本能力”, while delete rules prefer undo / reverse transaction for correcting mistakes. The exact undo scope is not defined: last operation only, transaction-level reversal, guided quantity correction, or some combination.

Current engineering stance: Phase 2 implements explicit inventory correction through `adjustStock`, which creates ADJUST Transaction history. TC-P2-009 “撤销最近操作” is BLOCKED until the product rule defines undo scope. Do not invent an undo UI or reverse-transaction semantics without updating the Design Freeze.

## B. Can Defer To Later Phase

### Q1: Units Management Data Shape

The Settings page includes Unit Management, and Item has a free-form `unit` field. The Design Freeze does not define a `units` collection.

Current engineering stance: Phase 2 add/edit forms use the existing free-text `Item.unit` string so the core loop is usable. A managed unit list can be revisited with Settings work or a future schema decision, but Phase 2 does not introduce a new units collection.

### Q7: Unknown Expiry Date Compatibility

Phase 2 UX requires the quick path “name + quantity” to save without forcing production date or expiry date. The current V0.1 schema requires `Batch.expiryDate`.

Current engineering stance: Phase 2 stores `9999-12-31` as a temporary compatibility value when the user leaves expiry information blank. Phase 3 hides this compatibility value in Home, Inventory, and Detail UI and sorts it after real expiry dates. This keeps existing schema and FEFO machinery running, but the product should later explicitly define an “unknown / not applicable expiry” representation.

## C. Engineering-Resolved Or No Longer A Product Question

### Q8: Purchase Price Semantics For Inventory Value

Resolved for Phase 6: `Batch.purchasePrice` means unit purchase price. Inventory value may be calculated as positive Batch quantity × unit purchase price for batches where price is present. UI labels and docs should use “单位购买价格”.

### Q4: Standard Excel Template

Resolved for Phase 6: the standard import template uses fixed Chinese headers documented in `docs/EXCEL_TEMPLATE.md`. Required fields are `物品名称` and `数量`; empty `单位` defaults to `个`. Deterministic aliases are allowed, but arbitrary intelligent Excel field mapping remains out of V0.1 scope.

### Q5: “Multi-device Sync” Exclusion Wording

Resolved interpretation: V0.1 supports cloud reload under the same WeChat identity, but not real-time sync, conflict resolution, family sharing, or independent account synchronization.

### Q6: CloudBase Transaction / Consistency Strategy

Resolved engineering conclusion: core inventory transactions are executed by server-side Cloud Function + CloudBase Node SDK. The mini program client must not depend on `wx.cloud.database().runTransaction`.

Final Phase 0 / Phase 1 write path:

```text
Page -> Service -> wx.cloud.callFunction -> inventoryWrite -> server-side runTransaction -> Cloud Database
```

Memory Repository keeps the local mutation path for automated domain tests only. Cloud Repository remains available for ordinary scoped reads and simple repository operations.

### Q3: Zero-Stock “Do Not Ask This Cycle” Persistence

Resolved engineering interpretation for Phase 4: use the ZERO_STOCK Reminder lifecycle for the prompt cycle. If the user ignores the zero-stock prompt, the ZERO_STOCK Reminder becomes DISMISSED and no RestockItem is created. If the user chooses to join restock, a separate RestockItem with status NEEDED is created idempotently. When stock is added again, ZERO_STOCK resolves and any NEEDED RestockItem becomes PURCHASED.

This keeps Reminder and RestockItem separate and does not change the Design Freeze semantics.
