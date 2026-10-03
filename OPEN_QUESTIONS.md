# Open Questions

Source of truth: `docs/INVENTORY_APP_V0.1_DESIGN_FREEZE.md`.

These questions are implementation boundaries or product details that should be clarified before or during the relevant Phase. They do not override the Design Freeze.

## Q1: Units Management Data Shape

The Settings page includes Unit Management, and Item has a free-form `unit` field. The Design Freeze does not define a `units` collection. Proposed implementation for V0.1: keep `unit` as a string on Item and manage a user-level list only if explicitly approved.

Affected phases: Phase 0, Phase 2, Settings.

## Q2: Undo / Correction Basic Capability

V0.1 includes “撤销 / 修正基本能力”, while delete rules prefer undo / reverse transaction for correcting mistakes. The exact undo scope is not defined: last operation only, transaction-level reversal, or guided quantity correction. Proposed implementation for V0.1: prioritize ADJUST-based correction and record reverse transactions only after scope is confirmed.

Affected phases: Phase 2, Phase 7.

## Q3: Zero-Stock “Do Not Ask This Cycle” Persistence

The Design Freeze says if the user declines restock after zero stock, this cycle should not ask again. It does not define whether this is represented by a dismissed ZERO_STOCK Reminder, a RestockItem with DISMISSED, or a separate flag. Proposed implementation: use ZERO_STOCK Reminder status DISMISSED for the cycle and create RestockItem only when user chooses yes.

Affected phase: Phase 4.

## Q4: Standard Excel Template

V0.1 requires standard Excel import and Excel export, but the exact column template is not frozen. This should be specified before Phase 6 to avoid accidental arbitrary field mapping.

Affected phase: Phase 6.

## Q5: “Multi-device Sync” Exclusion Wording

The Design Freeze excludes “多设备同步” but requires same WeChat identity on another device to reload cloud database data. Interpreted as: V0.1 supports cloud reload under same identity, but not real-time sync, conflict resolution, family sharing, or independent account synchronization.

Affected phases: Phase 0, Phase 6, Phase 7.

## Q6: Cloud Database Transaction Availability

The Design Freeze prefers transactions when the platform allows; otherwise idempotency, compensation, or rollback is required. The final approach depends on the CloudBase environment and SDK capabilities selected during implementation.

Affected phases: Phase 0, Phase 2, Phase 4, Phase 6.
