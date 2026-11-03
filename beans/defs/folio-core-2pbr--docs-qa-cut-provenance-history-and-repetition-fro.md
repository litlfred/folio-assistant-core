---
# folio-core-2pbr
$schema: bean/1.0.0
title: 'Docs QA: cut provenance, history and repetition from reader docs'
status: in-progress
type: task
priority: normal
tags:
    - docs
    - docs-qa
created_at: 2026-11-03T00:00:00Z
updated_at: 2026-11-03T00:00:00Z
---

Review every reader-facing text in folio-assistant-core (the Markdown sources
under `docs/` and `skills/`, the BPMN documentation text under `processes/`,
the Tool node text under `tools/`, and `README.md` / `AGENTS.md`) for a
reader who wants to understand, use, change or render the knowledge graph.

Each finding is classed `bean-ref`, `owner-decision`, `proposal-ref`,
`history`, `wordy` or `stale-or-wrong`. Every fact a reader or agent needs
stays, said once; only its provenance goes.

Generated pages (`docs/concepts`, `docs/guides`, `docs/process`, the
translations, every `README.md` written by `subgraph-readmes.ts`) are fixed at
their sources.

## Done when

- [ ] findings recorded as JSON and published as the QA report
- [ ] findings applied, wrong facts first
- [ ] the repository's fast checks run on what changed
- [ ] one pull request opened, linking the report, with the word totals
