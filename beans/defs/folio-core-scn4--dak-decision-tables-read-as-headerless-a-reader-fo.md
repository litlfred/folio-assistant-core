---
# folio-core-scn4
title: 'DAK decision tables read as headerless: a reader for the preamble + two-row header shape'
status: todo
type: task
created_at: 2026-10-11T06:13:34Z
updated_at: 2026-10-11T06:13:34Z
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
