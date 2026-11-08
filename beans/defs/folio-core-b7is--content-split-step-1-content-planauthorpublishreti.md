---
# folio-core-b7is
title: 'Content split step 1: content-plan/author/publish/retire move up from cat-harness'
status: in-progress
type: task
created_at: 2026-11-08T07:10:54Z
updated_at: 2026-11-08T07:10:54Z
---

Content split step 1 (folio-assistant bean `0r7u`, step 1; owner ruling 2026-10-06 "split method from operation", cut chosen 2026-11-08: option 1, split by caller).

The four lifecycle skills no cat-harness process calls move up from `cat-harness/skills/authoring/content-lifecycle/` into this layer's `content-lifecycle-ext` package: `content-plan`, `content-author`, `content-publish`, `content-retire`, with the input/output contracts of the first three. The harness keeps `content-review`, `-validate`, `-test` and `-feedback`, which its own SDLC processes (adjudication, narrative-code-review, qa-report-signing, upstream-version-adoption, review-task, review-narrative) call.

- [x] core: the four skill bodies and three contracts added; package manifest lists them
- [x] core: harness roles.json bindings re-expressed as role extensions (author, qc-reviewer, programme-manager, publication-manager, authoring-agent, build-pipeline)
- [x] cat-harness: the four bodies, contracts and role bindings removed; staying prose reworded so it names none of them
- [ ] core PR green and merged
- [ ] cat-harness PR green and merged (after core)
- [ ] folio-assistant index re-pinned to both
