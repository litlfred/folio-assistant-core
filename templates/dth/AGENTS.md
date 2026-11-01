# AGENTS.md — {{title}}

This is a **folio**: the content repository for the WHO handbook *{{title}}*
(ISBN {{isbn}}), on its way from an L1 document (smart-base document kind
`dth`) to an **L2 DTH on smart-ra**. It was set up by `dth init`
(`folio-assistant-core/scripts/dth-init.ts`).

The authoring platform (skills, schemas, MCP tools, the publication pipeline)
is **remote-mounted** at the repository root from the SHAs pinned in
`index.lock.json`, all gitignored. The session-start hook mounts them; by hand:
`bun run cat-harness-tools/scripts/remote-mount.ts`.

This file is the **agent-generic** source of truth. `CLAUDE.md` and
`GEMINI.md` are thin stubs pointing here.

> **Content lives here; formalism lives in the platform.** A schema, a
> validator, a QA criterion or a skill belongs in folio-assistant, not in this
> repo. A chapter, a recommendation or a table belongs here.

## Where things are

| What | Where |
|---|---|
| the source, frozen | `who-iris/library/{{l1}}` (mounted), never edited here |
| the working document | `folio/{{name}}/` |
| the glossary | `glossary/{{name}}.glossary.json` (folio-glossary/v1) |
| L1 coverage | `folio/{{name}}/l1-coverage.json`, with `l1-coverage.exclusions.json` and `l1-coverage.quotes.json` beside it |

## Checks

These are core's, shared by every DTH. Do not copy them into this repo.

- `bun run check:l1-coverage`: every normative sentence of the L1 entry is in
  the folio or excluded. Only a person signs an exclusion (`signedOffBy`); an
  agent may only propose one.
- `bun run check:dth-glossary`: the glossary parses, and its links and the
  blocks' `meta.glossary` and `meta.archimate` links resolve in the mounts.
- `bun run check:review-anchors`: the review anchors match the folio.

## Work plan

Beans live on the branch `cat/{{name}}/beans`, mounted at `beans/` by the
session-start hook and never committed to `main`.
