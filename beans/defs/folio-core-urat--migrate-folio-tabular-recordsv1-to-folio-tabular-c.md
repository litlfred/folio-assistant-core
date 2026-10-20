---
# folio-core-urat
title: Migrate folio-tabular-records/v1 to folio-tabular-csvw/v1, measured on real tabular sources
status: todo
type: task
created_at: 2026-10-10T16:33:03Z
updated_at: 2026-10-20T15:07:01Z
parent: folio-assistant-slw1
---

Follow-up (b) of `eief`, split out on the owner's ruling of 2026-10-10 (option 1 of eief's decision).

Both tabular models exist side by side. The CSVW one has extractors now: `scripts/tabular-csv.ts` and `scripts/tabular-xlsx.ts` (PRs #33, #34). Migrate every `folio-tabular-records/v1` record to `folio-tabular-csvw/v1` (`tabular.csvw.json`), then retire the old schema.

Measure against real sources, per the owner on 2026-10-06:
- the smart-ra public-comment CSV/XLSX export (bean `v26p`, `schemas/public-comment.ts`);
- a DAK workbook from a smart-* IG, which has several tables per sheet.

Neither is in a folio-assistant-core checkout yet, so the first step is fetching one into `uploads/`.

## Done when
- [x] every `folio-tabular-records/v1` record is migrated, or listed with a reason (one record, listed below)
- [x] both extractors are run on one real CSV and one real DAK workbook, with the records committed
- [ ] `folio-tabular-records/v1` is retired from the schema graph

## Progress 2026-10-11 (lane C): measured on real sources; retirement needs a ruling

**Records committed** in `test/results/tabular-real-sources/`, with
`sources.json` pinning each source by commit and SHA-256. The WHO workbooks are
CC BY-NC-SA 3.0 IGO, so only the derived records are committed, not the bytes.

| source | extractor | tables | with header | columns typed / string / undetermined |
|---|---|---|---|---|
| `datasets/country-codes` CSV (ODC-PDDL), 249 x 56 | tabular-csv | 1 | 1 | 8 / 44 / 4 |
| WHO IMMZ DAK core data dictionary (smart-immunizations bd7fa72) | tabular-xlsx | 13 on 7 sheets | 6 | 1 / 116 / 39 |
| WHO IMMZ DAK decision-support logic (same commit) | tabular-xlsx | 162 on 29 sheets | 3 | 1 / 1469 / 1 |

The smart-ra public-comment export is in no checkout (smart-ra holds no
CSV or XLSX), so a public, real, wide CSV stood in for it.

**Two extractor bugs found and fixed in this PR**:
- `tabular-xlsx` left numeric character references undecoded. The data
  dictionary's title `ICD-11&#10;code` came through verbatim. The fix turns on
  `htmlEntities` in the parser; `XMLValidator` still refuses undeclared named
  entities.
- A zero-padded digit string now reads as a code (`string`), never as
  `integer`. ISO 4217 numeric codes (`008`, `012`) would otherwise read as 8
  and 12. In this file that column is undetermined anyway, because of its
  multi-valued cells (`222,840`). The rule closes the case for a clean column.

**Read correctly, and noted:**
- The four SNOMED/ICD columns mixing codes with "Not classifiable" are
  `undetermined`. That is the skill's `1, 2, 3, N/A` rule.
- 35 of the 39 undetermined columns are all-empty.
- A pure SNOMED column with no padding would still read as `integer`. Values
  alone cannot tell a code from a count, so that call is the column's, not the
  classifier's.

**The DAK decision tables read as headerless.** Their preamble and two-row
header are a DAK shape, not a generic one. Follow-up bean `folio-core-scn4`.

**The one `folio-tabular-records/v1` record:**
`folio-assistant-sci/library/codata-2022/tabular.jsonld`, CODATA 2022 (NIST
`allascii.txt`). It is **fixed-width**, which neither CSVW extractor reads.
CSVW's dialect has no fixed-width layout, so the record cannot migrate as is.

## Owner decision

Retiring `folio-tabular-records/v1` (Done-when 3) is blocked by that one
fixed-width record. The retirement itself is cat-harness and tools work:
`schemas/tabular-records.ts`, `scripts/tabular-records.py` and
`content/pipeline/tabular-nodes.ts`.

1. **(Recommended) Keep v1 for fixed-width sources only.** Mark it retired for
   delimited files and workbooks, which are now CSVW. One record keeps it
   alive, and nothing new is written to it except a fixed-width source.
2. Add a `fac:` fixed-width dialect (column offsets) to `folio-tabular-csvw/v1`,
   write a third extractor, migrate CODATA, then retire v1 entirely.
3. Re-derive CODATA as a CSV from its existing `values.json`, then extract it
   with `tabular-csv`. The record then describes a derivative, not the
   source NIST publishes.
4. Retire v1 now and drop CODATA's tabular record. The entry keeps
   `values.json`.

**Default if no answer: 1.**


## 2026-10-20 (lane C): the ruling is option 1, and retiring v1 for delimited sources is not a schema edit

The owner ruled option 1 (keep v1 for fixed-width only). What that leaves,
measured on tools main `8408cbc` and core main:

- **v1 is still the live writer for every CSV and workbook.** tools
  `scripts/ingest-document.ts:790,816` runs `scripts/tabular-records.py`, which
  writes `folio-tabular-records/v1` with `format: csv|xlsx|ods`.
  `check-l1-complete.ts:869` asks for exactly that file.
- **The CSVW extractors that replace it are core's** (`scripts/tabular-csv.ts`,
  `scripts/tabular-xlsx.ts`, `scripts/tabular-dak.ts`). tools may not import
  core, because core sits above tools (C1, epic `7x5n`). So tools' ingest cannot
  simply call them.

Either way it is a cross-layer move, not a leaf. The schema half (refusing
`format: csv|xlsx|ods` in v1) has to wait for the move, or it would refuse
what ingest writes today.

## Owner decision (2026-10-20): where the CSVW tabular rung lives

1. **(Recommended) Move the tabular rung of ingest up into core.** Core's
   ingest step writes `folio-tabular-csvw/v1` with the extractors already
   there. `check:l1-complete` then accepts csvw for delimited and workbook
   files, and v1 only for fixed-width. This fits "core owns content
   vocabulary": what a table holds is content.
2. **Move the CSVW extractors down into tools**, beside `tabular-records.py`.
   Ingest stays in tools, and core loses three scripts it owns today.
3. **Leave both writers.** v1 stays live for delimited sources too, and v1 is
   never retired. This is option 1 of the earlier ruling, frozen as it is now.

**Default if no answer: 1.**
