# JSON Backup Format - V0.1

Complete backup uses JSON.

Top-level fields:

```json
{
  "schemaVersion": 1,
  "appVersion": "0.1",
  "exportedAt": "2026-10-10T00:00:00.000Z",
  "categories": [],
  "items": [],
  "batches": [],
  "transactions": [],
  "locations": [],
  "reminders": [],
  "restockItems": [],
  "settings": null
}
```

Restore rules:

- Validate `schemaVersion` before writing.
- Reject backups from newer schema versions.
- Validate references before writing.
- Restore is a full replacement for the current user data.
- Backup `_openid` values are not trusted; restored rows are rebound to the current WeChat OPENID.
- Restore must avoid half writes. The cloud implementation uses server-side transaction support for replacement.
