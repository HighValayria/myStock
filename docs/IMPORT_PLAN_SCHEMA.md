# ImportPlan and Candidate Contracts

IR and plan coordinates are zero-based; candidate source.row and UI labels are one-based. Table identity remains stable on manual range correction.

```ts
type ImportSource =
  | { sourceType: 'spreadsheet' | 'delimited'; fileName: string;
      sheets: { index: number; name: string; rowCount: number; columnCount: number;
        date1904?: boolean; rows: (string | number | boolean | null)[][] }[] }
  | { sourceType: 'text'; fileName: string; text: string };

type ImportPlan = {
  version: 1; sourceType: string; sourceFileName: string; referenceDate: string;
  sheets: { index: number; name: string; role: SheetRole; selected: boolean;
    confidence: number; reason: string }[];
  tables: { id: string; sheetIndex: number; sheet: string;
    headerRow: number; endRow: number; startColumn: number; endColumn: number;
    selected: boolean; role: SheetRole; confidence: number; reason: string;
    categoryHint: string | null; locationHint: string | null;
    mapping: { column: number; sourceColumn: string; targetField: CanonicalField;
      confidence: number; method: 'RULE' | 'HEURISTIC' | 'AI' | 'USER' | 'UNRESOLVED'; reason: string }[] }[];
  textCandidates: InventoryCandidate[]; warnings: string[];
};

type InventoryCandidate = {
  id: string; values: Partial<Record<CanonicalField, string | null>>;
  source: { file: string; sheet?: string; row?: number; table?: string;
    sourceText: string; sentence?: number };
  confidence: number; warnings: string[]; confirmed: boolean;
};
```

SheetRole: CURRENT_INVENTORY / HISTORICAL_DATA / REFERENCE / INSTRUCTIONS / ANALYTICS / UNKNOWN / IGNORE. Only current inventory is selected by default; uncertain AI suggestions require selection.

Canonical fields live in import/fields.js: Item name/category/brand/specification/unit/lowStockThreshold/expiryWarningDays; Batch quantity/location/purchaseDate/productionDate/shelfLifeValue/shelfLifeUnit/expiryDate/purchasePrice/purchaseChannel/note; IGNORE/UNKNOWN.

Executable AI schemas in ai/schemas.js constrain classification, regions, mappings and text extraction. All properties required; additionalProperties false; nullable values preserve missing fields. Region bounds/overlap, duplicate mapping targets, source quote and business data are independently validated after Ajv.

previewSmartImport accepts source for new jobs, or jobId + revision + changes + candidateEdits. Client cannot replace saved IR or provide arbitrary database objects. Changes are limited to existing sheets/tables/columns and candidate values; text can add manual:<id> candidates. Coordinates are bounded against original source.

commitSmartImport accepts jobId, revision, confirmed and chunk offset. Server loads its owned validated snapshot; rejects error rows, unconfirmed warnings/low confidence, empty or stale plans. Returned nextOffset controls 20-row chunks. Models have no access to this execution boundary.

Future OCR adapters may produce the same text/table IR; Phase 6B has no image input.
