# Phase 6B Smart Import Architecture

Authorized on 2026-10-10. Phase 6A standard import/export and schemaVersion 1 JSON backup/restore remain available. Phase 6C OCR/receipt/image/audio is not implemented.

## Boundaries

Input -> Parse -> IR -> Inspect/Detect -> Map -> ImportPlan -> Candidate -> Validator -> Preview -> Confirm -> Execute.

- Parse reads actual file structure, not inventory meaning. SheetJS CE 0.20.3 reads all Sheet names, values, shared/inline strings, sparse cells, numbers, dates and cached formula values. It does not execute formulas/macros. CSV uses csv-parse 7.0.3 including quoted multiline fields. Old xlsx.js is compatibility-test-only.
- IR preserves original coordinates, null cells and workbook date1904. Text IR preserves original text. Spreadsheet dependencies never enter the miniapp package.
- Inspection samples first six populated rows, two middle rows and two final rows, preserving row indices; 20 columns and 120 characters per cell. Full large workbooks are not sent to AI.
- Rules scan name/quantity headers and populated regions; multiple vertical headers produce multiple tables. Optional AI suggests bounded regions; manual row/column edits provide fallback. Selected regions cannot overlap.
- Mapping uses exact labels/aliases (confidence 1), heuristics (0.8), then optional AI. Known rule mappings cannot be overridden by AI. UNKNOWN/IGNORE are valid outcomes. USER mappings preserve human provenance.
- ImportPlan describes selected sheets/tables/mappings, never database writes. Candidates apply explicit row fields before category/location hints. Hints are visible warnings; stable source IDs identify file/sheet/row or text quote.
- Existing previewRows validates names, positive quantities, dates, price and expiry conflicts; shows new category/location names; preserves Item identity name + specification + brand + unit. Phase 6A defaults 个/其他/默认位置 and unknown expiry remain intact.
- Users select Sheets/Tables, edit ranges, mappings/hints and candidate fields. Revalidation uses stored IR without uploading or calling AI. Confidence <0.85 or any warnings require explicit candidate review. Text candidates always require review.
- Execution resolves taxonomy deterministically and invokes canonical inventoryWrite.addStock, including Batch merge, ADD Transaction, Reminder and Restock behavior. Build bundles compiled inventoryWrite source into dataManage/import/inventory-engine.js; never hand-edit the generated bundle.

## Provider and Privacy

Cloud-only IMPORT_AI_BASE_URL (HTTPS API base e.g. ending /v1), IMPORT_AI_KEY, IMPORT_AI_MODEL. No key in miniapp; no OPENID/account data in model inputs. File AI switch defaults off; text extraction uses AI with on-screen data-sharing notice.

AIProvider.structured uses OpenAI-compatible chat completions JSON Schema strict output. Ajv revalidates all outputs, including mock outputs. Roles and canonical targets are enums. Invalid JSON/schema, refusal, timeout or unsupported provider degrade to rule/manual workflows. No free agent or database tools exist.

Limits per recognition: eight calls, 18000 characters per model input, 3500 output tokens/call, 15-second request timeout. Only workbook summaries and selected-table first-four-row samples are sent. Obvious 工资/身份证/通讯录 samples are excluded. Text UI limit is 12000 characters. Metrics include model, call count (array length), input/output sizes, latency and API token usage. Full user data is not logged.

An explicit Asia/Shanghai referenceDate anchors dates. Today/yesterday/day-before-yesterday purchase phrases resolve deterministically. Dates without supporting source evidence are removed and warned; purchase date never becomes production date. Vague dates stay missing. Model source quotes must exist verbatim in the original text. Human review remains essential for semantic errors.

## Jobs and Execution

Private import_jobs stores OPENID-owned IR, plan, edits, revision, validated preview, metrics, locked flag and expiry. Execution expires after 24 hours; physical cleanup policy pending. Jobs are excluded from inventory backups.

Preview updates transactionally compare unlocked revision. Confirm checks revision, validations and candidate confirmations, then atomically locks it. It never reruns AI. Candidate IDs derive from original sheet/header/column/row or sentence; operation IDs are jobId:row:candidateId. Network retry uses the same locked snapshot. Execution uses 20-row chunks and existing per-row transactions; partial failures are reported. Reconfirming skips successful rows. Whole-workbook atomicity is not claimed.

Input bounds: 2MB, 5000 rows/100 columns per Sheet, 100000 rectangular cells, 450KB serialized workbook rows, 900KB serialized job preview. Oversized input asks for splitting. Decompression hardening remains a release consideration.

Measured SheetJS installed package: 8,076,339 bytes (~7.7 MiB), cloud-only. Local runtime Node v24.14.0; actual CloudBase Node >=16 runtime and CDN dependency installation require deployment verification.

## Sources

- [SheetJS installation](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)
- [SheetJS array-of-arrays import](https://docs.sheetjs.com/docs/getting-started/examples/import/)
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
