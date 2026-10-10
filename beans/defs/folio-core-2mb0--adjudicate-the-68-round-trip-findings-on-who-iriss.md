---
# folio-core-2mb0
title: Adjudicate the 68 round-trip findings on who-iris's catalogues (66 warn, 2 fail)
status: todo
type: task
created_at: 2026-10-10T17:25:53Z
updated_at: 2026-10-10T17:25:53Z
parent: folio-assistant-slw1
---

Follow-up of `ktt2`. The untainted round trip (who-iris PR #35, `test/results/translation-roundtrip/iris-catalogues.qa-results.json`) flagged 68 of 600 strings. Each entry carries the msgid, msgstr, back-translation and the adjudicator's findings, tagged terminology or semantic. Deciding which reading is right is a reviewer's step (`Task_FlagDrift`, outcomes real / spurious / source-wrong), not an agent's.

## Patterns to rule on first (each covers many entries)
- **'bean' → 'task'** in all five locales (indexes 15, 17). Is the project term to be kept as a loanword, glossed, or translated?
- **'CDN edge' → 'CDN node'** (es, fr, ru): 'node' already means a catalogue node on these pages.
- **ru: DSpace 'item' → 'record'**, which collides with 'metadata record'. This is most of ru's 28 warnings.
- **'ingested' → 'imported' (ru) / 'included' (zh)**: ingest is a term of art.
- **'Bundle' → 'Package'** (ru fail, fr major): a different DSpace term.
- **ru #12 (fail)**: the banner attributes 'its own catalogue' to WHO IRIS, undermining the provenance disclaimer.
- **zh 'size' → 'capacity'** (indexes 5, 6, 7, 100).

## Done when
- [ ] each flagged entry has a recorded outcome (real / spurious / source-wrong)
- [ ] the 'real' ones are fixed in the PO files, and the round trip is re-run on the changed strings only, so the report goes current again
- [ ] lffo's 580/580 is annotated as superseded by this independent run
