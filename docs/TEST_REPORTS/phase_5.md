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
- Inventory value was unavailable during initial Phase 5 acceptance. Phase 6 later froze `Batch.purchasePrice` as unit purchase price and enabled value calculation.

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
- T-P5-A09 inventory value uses purchasePrice as unit price after Phase 6 rule freeze.
- T-P5-A10 summary separates low stock, zero stock, and restock counts.

## Manual Verification

Executed in WeChat DevTools and reported passed by the user on 2026-10-10.

Passed:

- TC-P5-001 through TC-P5-010.
- Updated `cloudfunctions/inventoryRead` deployed successfully before testing the analysis tab.

## Blocked / Deferred

- Inventory value is no longer blocked after Phase 6: `Batch.purchasePrice` means unit purchase price.
- TC-P2-009 Undo remains blocked by product definition and is unrelated to Phase 5.
- Two-account `_openid` isolation remains deferred until a second authorized WeChat developer account is available.

## Regression Notes

- No new master collection was introduced.
- No page-level database write was introduced.
- Phase 5 reads are routed through `inventoryRead.getAnalysisOverview`.
- Existing add / consume / adjust / reminder automated tests remain passing.

## Next Step

Phase 5 is accepted. Phase 6 has since been completed and accepted; see `docs/TEST_REPORTS/phase_6.md`.
