# Open Questions

Source of truth: `docs/INVENTORY_APP_V0.1_DESIGN_FREEZE.md`.

Questions are grouped by when they must be resolved. These notes do not override the Design Freeze.

## A. Must Resolve Before Phase 2

### Q1: Units Management Data Shape

The Settings page includes Unit Management, and Item has a free-form `unit` field. The Design Freeze does not define a `units` collection.

Current engineering stance: Phase 1 keeps `Item.unit` as a string. Before Phase 2 UI work starts, decide whether add/edit forms use a free-text unit field or a managed unit list.

### Q2: Undo / Correction Basic Capability

V0.1 includes “撤销 / 修正基本能力”, while delete rules prefer undo / reverse transaction for correcting mistakes. The exact undo scope is not defined: last operation only, transaction-level reversal, or guided quantity correction.

Current engineering stance: Phase 1 supports ADJUST correction and preserves Transaction history. Before Phase 2 interaction design, clarify whether UI exposes explicit undo or only inventory correction.

## B. Can Defer To Later Phase

### Q3: Zero-Stock “Do Not Ask This Cycle” Persistence

The Design Freeze says if the user declines restock after zero stock, this cycle should not ask again. It does not define whether this is represented by a dismissed ZERO_STOCK Reminder, a RestockItem with DISMISSED, or a separate flag.

Can defer to Phase 4. Current proposed implementation remains: use ZERO_STOCK Reminder status DISMISSED for the cycle and create RestockItem only when user chooses yes.

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
