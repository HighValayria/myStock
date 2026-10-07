# Phase 5 Test Report - Analytics Page

Date: 2026-10-07

## Scope

Phase 5 implements the V0.1 Analytics page only. It does not start Phase 6 import/export, AI suggestions, prediction, advanced BI, or arbitrary report building.

## Implemented

- `miniprogram/pages/analysis/*` replaces the placeholder tab with a real analytics page.
- `miniprogram/services/statistics-service.ts` provides pure StatisticsService aggregation for automated verification.
- `cloudfunctions/inventoryRead` now supports `getAnalysisOverview`.
- `phase2-ui-service` exposes `getAnalysisOverview`.
- Analysis page supports 7-day, 30-day, 90-day, and all-time range switching.
- Summary cards show SKU, Batch, expiry risk, and stock risk counts.
- Category distribution counts Items / SKUs, not mixed quantities.
- Expiry distribution counts positive Batches, not Items or quantity sums.
- Stock trend uses positive SKU count.
- ADD / CONSUME trend counts unique operations, deduplicating multi-batch consume by `operationId`.
- Inventory value is deliberately unavailable because `Batch.purchasePrice` semantics are not frozen.

## Automated Verification

Command:

```bash
npm test
```

Result:

```text
44 tests passed
```

Phase 5 automated coverage:

- T-P5-A01 category share counts SKUs instead of quantities.
- T-P5-A02 expiry distribution counts positive batches only.
- T-P5-A03 stock trend uses positive SKU count, not mixed quantity sum.
- T-P5-A04 transaction trend counts operations and deduplicates multi-batch consume.
- T-P5-A05 time range excludes operations outside selected window.
- T-P5-A06 empty analysis has stable zero values and no NaN percent.
- T-P5-A07 no-expiry batches are grouped separately.
- T-P5-A08 single category share renders as 100 percent.
- T-P5-A09 inventory value remains blocked when purchasePrice semantics are undefined.
- T-P5-A10 summary separates low stock, zero stock, and restock counts.

## Manual Verification

Not executed in WeChat DevTools during this report.

Pending:

- TC-P5-001 through TC-P5-010.
- Deploy updated `cloudfunctions/inventoryRead` before testing the analysis tab.

## Blocked / Deferred

- Inventory value total is BLOCKED by Q8 in `OPEN_QUESTIONS.md`: `Batch.purchasePrice` does not define whether it is unit price, batch total, discounted paid amount, or another price basis.
- TC-P2-009 Undo remains blocked by product definition and is unrelated to Phase 5.
- Two-account `_openid` isolation remains deferred until a second authorized WeChat developer account is available.

## Regression Notes

- No new master collection was introduced.
- No page-level database write was introduced.
- Phase 5 reads are routed through `inventoryRead.getAnalysisOverview`.
- Existing add / consume / adjust / reminder automated tests remain passing.

## Next Step

Run Phase 5 manual acceptance in WeChat DevTools after deploying `inventoryRead`. Do not start Phase 6 until Phase 5 manual acceptance and required Phase 2/3/4 regression checks pass.
