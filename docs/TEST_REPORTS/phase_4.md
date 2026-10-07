# Phase 4 Test Report - Reminder System and Restock

Date: 2026-10-07

Scope: Reminder center, Reminder lifecycle actions, EXPIRING / EXPIRED / LOW_STOCK / ZERO_STOCK reminders, separate RestockItem list, manual join restock, restock dismiss, addStock auto-completes restock, Home reminder link, and Item Detail restock entry.

## Implementation Summary

Implemented Phase 4 only:

- Reminder Tab now loads real reminder-center data.
- Reminder filters support type and lifecycle status views.
- Reminder rows display localized type/status, item context, and actions.
- View action changes ACTIVE to READ and navigates to Item Detail.
- Ignore action changes ACTIVE/READ to DISMISSED.
- ZERO_STOCK reminders can create a separate RestockItem.
- Restock list is separate from Reminder rows.
- Restock record purchase reuses Phase 2 Add Stock with `itemId`.
- Restock dismiss changes NEEDED to DISMISSED.
- Add Stock still resolves ZERO_STOCK through reminder recompute and marks NEEDED RestockItem as PURCHASED.
- Home important reminder summary links to the Reminder Tab.
- Item Detail can manually join restock idempotently.

No Phase 5 charts, Phase 6 import/export, AI reminders, prediction, subscription push, or family sharing was implemented.

## Backend / Service Changes

- `inventoryRead.listReminderCenter` aggregates Reminder, RestockItem, Item, Batch, and Location labels under current OPENID.
- `inventoryWrite.markReminderRead` changes ACTIVE to READ only.
- `inventoryWrite.dismissReminder` changes ACTIVE/READ to DISMISSED.
- `inventoryWrite.addToRestock` creates NEEDED idempotently.
- `inventoryWrite.dismissRestock` changes NEEDED to DISMISSED.
- Existing inventory mutations continue to recompute reminders after add / consume / adjust / update item / update batch.

## Automated Tests

Command:

```bash
npm test
```

Result:

```text
34 tests passed
```

New Phase 4 automated coverage:

- T-P4-A01 first EXPIRING reminder.
- T-P4-A02 no duplicate EXPIRING reminder in same cycle.
- T-P4-A03 DISMISSED EXPIRING remains dismissed in same cycle.
- T-P4-A04 EXPIRING resolves when safe.
- T-P4-A05 EXPIRING can enter a new cycle after resolved.
- T-P4-A06 EXPIRING transitions to EXPIRED.
- T-P4-A07 EXPIRED does not delete or zero inventory.
- T-P4-A08 first LOW_STOCK reminder.
- T-P4-A09 dismissed LOW_STOCK does not duplicate while still low.
- T-P4-A10 LOW_STOCK resolves after recovery.
- T-P4-A11 LOW_STOCK creates a new reminder after recovery and later drop.
- T-P4-A12 ZERO_STOCK reminder is separate from RestockItem.
- T-P4-A13 manual RestockItem creates NEEDED.
- T-P4-A14 addToRestock is idempotent.
- T-P4-A15 addStock resolves ZERO_STOCK and marks RestockItem PURCHASED.
- T-P4-A16 dismissRestock removes item from NEEDED list.

Additional static checks:

```bash
node --check cloudfunctions/inventoryRead/index.js
node --check cloudfunctions/inventoryWrite/index.js
node --check miniprogram/pages/reminders/index.js
node --check miniprogram/pages/item-detail/index.js
node --check miniprogram/services/phase2-ui-service.js
```

Result: PASS.

## Manual Tests

Not executed by Codex in WeChat DevTools during this run.

Pending Phase 4 UI acceptance:

- TC-P4-001 through TC-P4-020.

Pending regression:

- Phase 2 manual regression listed in `DEV_STATUS.md`.
- Phase 3 manual acceptance TC-P3-001 through TC-P3-018.

## Known Bugs

None found by automated tests or static checks in this run.

## Open Questions

- TC-P2-009 Undo remains BLOCKED by unresolved product scope.
- Unknown / not-applicable expiry representation remains an open product question.
- Zero-stock restock prompt persistence is resolved for Phase 4 as ZERO_STOCK Reminder DISMISSED for the cycle, with RestockItem created only when the user chooses to join restock.

## Deployment Notes

Upload and deploy with cloud install dependencies:

- `cloudfunctions/inventoryRead`
- `cloudfunctions/inventoryWrite`

Mini Program page changes require recompiling the Mini Program.

## Phase 5 Readiness

Do not start Phase 5 yet. Phase 4 code and automated tests are complete, but TC-P4-001 through TC-P4-020 and Phase 2/3 manual regression remain pending in WeChat DevTools.
