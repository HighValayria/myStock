# Excel Template - V0.1

Phase 6 uses a fixed standard template. Excel-compatible TSV/CSV text is accepted by the app.

Headers:

```text
物品名称	类别	品牌	规格	数量	单位	存放位置	购买日期	生产日期	保质期数值	保质期单位	到期日期	单位购买价格	购买渠道	低库存阈值	临期阈值	备注
```

Required fields:

- `物品名称`
- `数量`

Rules:

- Empty `单位` defaults to `个`.
- `单位购买价格` maps to `Batch.purchasePrice` and means unit purchase price.
- Item matching uses `name + specification + brand + unit`.
- Batch merge uses `itemId + locationId + purchaseDate + expiryDate`.
- Import creates ADD Transactions.
- Repeated import uses `importOperationId + rowNumber` idempotency.
- Deterministic aliases are allowed: `名称`, `库存数量`, `单价`, `购买价格`, `位置`.
- Arbitrary intelligent field mapping is out of V0.1 scope.

Excel export may include derived display columns such as `剩余天数`, `保质期状态`, and `库存状态`. These are not primary facts and must not be stored as source data.
