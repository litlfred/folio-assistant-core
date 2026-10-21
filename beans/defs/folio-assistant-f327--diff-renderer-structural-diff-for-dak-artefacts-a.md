---
# folio-assistant-f327
title: 'DIFF RENDERER: structural diff for DAK artefacts — a decision-table row, data element, indicator or FHIR profile element compared as fields, not text'
status: todo
type: task
priority: normal
tags:
    - rehomed
created_at: 2026-09-23T10:00:13Z
updated_at: 2026-10-10T16:34:20Z
parent: folio-assistant-q4jm
---

Child of d903 (renderer 4 of the five it listed). A text diff of a decision table is unreadable, which is the case that proved a single 'the diff' wrong.

Needs, before it can be built:
- the structured shape of each DAK artefact on BOTH sides. The ChangeSet reads manifests as text and never executes them; a field diff needs the parsed artefact (FHIR JSON, a DMN table, a data dictionary row);
- a registry entry in cat-harness/schemas/diff-renderers.ts with a new `needs` input (say `structure`), and defaults for the DAK block kinds, once those kinds exist in BLOCK_KINDS (today there are none).

## Done when
- [ ] the DAK artefact kinds it applies to are real block kinds
- [ ] the structured sides are published beside changeset-text.json
- [ ] a field-level renderer is registered and tested in the browser


## Owner decision

Asked 2026-10-10 by the bean-backlog drain (lane C). The diff renderers are cat-harness `schemas/diff-renderers.ts`, and the DAK block kinds live in smart-base. It is also blocked: no `structure` input exists yet. None of it lives in
folio-assistant-core, and AGENTS.md's one rule ("core owns content vocabulary;
the harness owns the harness") puts it outside this store's reach.

1. **(Recommended) Rehome to `litlfred/cat-harness`'s bean store.** The bean is re-created
   there with this body, and this copy is scrapped with a pointer to the new id.
2. Keep it here as a pointer, and do the work from this store against `litlfred/cat-harness`.
3. Scrap it. The finding no longer matters after the separation.

**Default if no answer:** option 1.


## Rehomed 2026-10-10: this copy is now a pointer

By the owner's ruling of 2026-10-10 (move to the code's repo, and keep a
pointer here). The code this bean changes is in cat-harness. Its owning copy is
therefore the **same id in the cat-harness store**
(`litlfred/folio-assistant`, branch `cat/cat-harness/beans`,
`beans/defs/folio-assistant-f327--*.md`), which is open there. Work it there.
This copy stays open as a pointer, and closes when that one does.

## Built 2026-10-15 (session_0147GQWs8akum21vSh5XYURR)

Worked from this pointer, on the owner's choice to build it now. Recorded here because the owning copy's store is not in this session's reach; copy it across when that copy is next touched.

- **The DAK kinds were real, but the ChangeSet could not see them.** `snapshot` walked without the contributed builders, so a `persona({ … })` was not a block at all: dth-hrh's personas, scenarios and requirements were missing from every ChangeSet, and an edit to one read as nothing changed. `snapshot(root, builders)` and the CLI now load them as `gen-block-jsonld` does (dth-hrh: 270 → 321 blocks).
- **The structured sides are published** as `changeset-structure.json` (`--structure-out`): a contributed kind's manifest fields on each side, read from the TEXT of its builder literal (`manifest-fields.ts`; nothing executed; a value it cannot read is kept as source).
- **The renderer** `fields` (input `structure`, default `@structured`) is registered in cat-harness `diff-renderers.ts`; the review page draws it and stage-local publishes the file.
- **Checked in Chromium** on dth-hrh's review page with a persona edit (title and personaType): the block opens on "Fields, before and after", two rows named "changed", five unchanged folded.

All three Done-when boxes are met.
