---
# folio-core-2mb0
title: Adjudicate the 68 round-trip findings on who-iris's catalogues (66 warn, 2 fail)
status: todo
type: task
created_at: 2026-10-10T17:25:53Z
updated_at: 2026-10-11T07:25:00Z
parent: folio-assistant-slw1
---

Follow-up of `ktt2`. The untainted round trip (who-iris PR #35, `test/results/translation-roundtrip/iris-catalogues.qa-results.json`) flagged 68 of 600 strings. Each entry carries the msgid, msgstr, back-translation and the adjudicator's findings, tagged terminology or semantic. Deciding which reading is right is a reviewer's step (`Task_FlagDrift`, outcomes real / spurious / source-wrong), not an agent's.

## Patterns to rule on first (each covers many entries)
- ~~**'bean' → 'task'** in all five locales (indexes 15, 17).~~ **Ruled 2026-10-11, see below.**
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

## Owner ruling 2026-10-11: 'bean' is never 'task'

> "bean becoming task NO.... there is already a Task. a bean is a note/rmk on
> work needed of an agent (its state) for a Task for particular instance of a
> Process flow. translate it as bean or kernel for now"

**Applied in who-iris#39 (merged).**
- **Outcome for these 10 entries (indexes 15 and 17 × ar, es, fr, ru, zh):**
  `real`. The term was mistranslated.
- **Fix:** "bean" is kept as an untranslated Latin-script loanword. The
  translator note in `gen-iris-pages.ts` used to say "a 'bean' is a work
  item", which caused the error. It now carries the owner's definition and
  the rule. `.pot`, `.po` and the 10 replica pages are regenerated.
- **Round trip, re-run on those 10 strings only, same protocol:**
  - index 15: pass ×5;
  - index 17: "bean" is right, but it now **warns ×5 on a different term**:
    "held copies" comes back as saved, preserved or stored, and "held" is
    the project term for copies actually present.
- **Totals:** 532/66/2 → **537/61/2** of 600. 61 warn and 2 fail still await a
  ruling.

**Pattern to add to the list above:** 'held' (copies actually present)
rendered generically, index 17 in all five locales.

For the record, the owner allowed "kernel" as an alternative. The loanword
was chosen because the strings name a bean by its ID (`jbx2`, `yl5w`), and
the tracker's own word keeps that link.
