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

### Q3: Zero-Stock “Do Not Ask This Cycle” Persistence

The Design Freeze says if the user declines restock after zero stock, this cycle should not ask again. It does not define whether this is represented by a dismissed ZERO_STOCK Reminder, a RestockItem with DISMISSED, or a separate flag.

Can defer to Phase 4. Current proposed implementation remains: use ZERO_STOCK Reminder status DISMISSED for the cycle and create RestockItem only when user chooses yes.

### Q7: Unknown Expiry Date Compatibility

Phase 2 UX requires the quick path “name + quantity” to save without forcing production date or expiry date. The current V0.1 schema requires `Batch.expiryDate`.

Current engineering stance: Phase 2 stores `9999-12-31` as a temporary compatibility value when the user leaves expiry information blank. Phase 3 hides this compatibility value in Home, Inventory, and Detail UI and sorts it after real expiry dates. This keeps existing schema and FEFO machinery running, but the product should later explicitly define an “unknown / not applicable expiry” representation.

### Q4: Standard Excel Template

V0.1 requires standard Excel import and Excel export, but the exact column template is not frozen.

Can defer to Phase 6. Do not implement arbitrary intelligent Excel mapping before this is defined.

## C. Engineering-Resolved Or No Longer A Product Question

### Q5: “Multi-device Sync” Exclusion Wording

Resolved interpretation: V0.1 supports cloud reload under the same WeChat identity, but not real-time sync, conflict resolution, family sharing, or independent account synchronization.

### Q6: CloudBase Transaction / Consistency Strategy

Resolved engineering conclusion: core inventory transactions are executed by server-side Cloud Function + CloudBase Node SDK. The mini program client must not depend on `wx.cloud.database().runTransaction`.

Final Phase 0 / Phase 1 write path:

```text
Page -> Service -> wx.cloud.callFunction -> inventoryWrite -> server-side runTransaction -> Cloud Database
```

Memory Repository keeps the local mutation path for automated domain tests only. Cloud Repository remains available for ordinary scoped reads and simple repository operations.
