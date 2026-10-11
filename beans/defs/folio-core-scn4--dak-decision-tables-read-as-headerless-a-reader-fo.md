---
# folio-core-scn4
title: 'DAK decision tables read as headerless: a reader for the preamble + two-row header shape'
status: todo
type: task
created_at: 2026-10-11T06:13:34Z
updated_at: 2026-10-11T06:35:00Z
parent: folio-assistant-slw1
---

Found by urat on 2026-10-11, measured on the WHO IMMZ DAK decision-support workbook (smart-immunizations bd7fa72; record in test/results/tabular-real-sources/).

tabular-xlsx finds 162 tables on 29 sheets, and only 3 of them get a header. The reason is the DAK decision-table shape, which the generic 'is row 1 a header?' rule cannot see, and should not guess at:
- a key/value preamble: 'Decision ID', 'Business rule', 'Trigger' in column B, the value in C;
- a two-row header: 'Inputs' … 'Output' | 'Guidance displayed…' | 'Annotations' | 'Reference(s)' on one row, then a section row (merged B:K), then the input column titles;
- merged cells inside the body (e.g. K8:K25), and '–' as the don't-care value.

The generic reading is correct by the skill's rules. It is just not useful: every DT reads as 10 untitled string columns.

## What
A DAK-specific reader, routed by content (a 'Decision ID' cell heading a block), that emits each decision table with its preamble as table notes, inputs and outputs as typed column groups, and '–' recorded as don't-care, not as a value. It also needs the merged-cell ranges, which tabular-xlsx does not read yet.

## Done when
- [ ] the IMMZ decision-support workbook's DTs read with titled input and output columns
- [ ] merged ranges are read, not lost
- [ ] the generic reader's verdict on non-DAK sheets is unchanged

## Survey 2026-10-11 (lane C): the shape is regular; the record schema is the gate

Measured over every `Decision ID` cell in the IMMZ decision-support workbook:
- **90 decision tables.** 87 share one shape: the preamble rows `Decision ID`,
  `Business rule`, `Trigger`, then a group row
  `Inputs … Output | Guidance displayed to health worker | Annotations | Reference(s)`.
- **The other 3** carry an extra `Potential contraindications` block inside
  the preamble (BCG, Hepatitis B), or have no group row.
- **Schedule tables share bands with the DTs.** The titles
  `The name of the service for which the schedule is relevant` and
  `What event signals the start of the service schedule?` are a SECOND table
  family (the M-column blocks beside the DTs). It needs its own routing, by
  its own heading cell.

**What blocks a faithful record:** `CsvwTableSchema`
(cat-harness `schemas/tabular-csvw.ts`) is a plain `z.object`, so a parse
strips any key it does not name. Recording the preamble needs CSVW's own
`notes`. Recording each column's role (input or output) and the merged
ranges needs `fac:` keys. All of these are a cat-harness schema change,
followed by the usual index repin. Without them, the best possible is titled
columns (Done-when 1). The preamble, the roles and the don't-care marker
would be lost on parse.

**So, in order:**
1. cat-harness: add an optional `notes` (CSVW §5.8) and an optional
   `fac:role` per column to `CsvwTableSchema`/`CsvwColumnSchema`, and have
   `toCsvw` keep `notes` and drop `fac:role`;
2. core: route DT and schedule blocks by heading cell in `tabular-xlsx.ts`;
3. repin.

Depends on folio-core-urat's PR (core#53), which committed the real record
this survey reads.
