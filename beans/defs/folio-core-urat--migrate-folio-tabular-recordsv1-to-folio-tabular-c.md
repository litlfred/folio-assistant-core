---
# folio-core-urat
title: Migrate folio-tabular-records/v1 to folio-tabular-csvw/v1, measured on real tabular sources
status: todo
type: task
created_at: 2026-10-10T16:33:03Z
updated_at: 2026-10-10T16:33:03Z
parent: folio-assistant-slw1
---

Follow-up (b) of `eief`, split out on the owner's ruling of 2026-10-10 (option 1 of eief's decision).

Both tabular models exist side by side. The CSVW one has extractors now: `scripts/tabular-csv.ts` and `scripts/tabular-xlsx.ts` (PRs #33, #34). Migrate every `folio-tabular-records/v1` record to `folio-tabular-csvw/v1` (`tabular.csvw.json`), then retire the old schema.

Measure against real sources, per the owner on 2026-10-06:
- the smart-ra public-comment CSV/XLSX export (bean `v26p`, `schemas/public-comment.ts`);
- a DAK workbook from a smart-* IG, which has several tables per sheet.

Neither is in a folio-assistant-core checkout yet, so the first step is fetching one into `uploads/`.

## Done when
- [ ] every `folio-tabular-records/v1` record is migrated, or listed with a reason
- [ ] both extractors are run on one real CSV and one real DAK workbook, with the records committed
- [ ] `folio-tabular-records/v1` is retired from the schema graph
