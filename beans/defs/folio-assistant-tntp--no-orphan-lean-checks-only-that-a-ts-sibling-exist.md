---
# folio-assistant-tntp
title: no-orphan-lean checks only that a .ts sibling exists; it should check each lean.ref lands in a Lake target CI builds (folio-assistant-sci)
status: completed
type: feature
priority: normal
created_at: 2026-10-04T15:52:14Z
updated_at: 2026-10-10T15:52:42Z
parent: folio-assistant-0lmb
---

Recorded from the qou orphaned-content census, 2026-10-04 (ORPH report; session https://claude.ai/code/session_01NdDGeP1SyShmoUssLuRZ91, issue #2106). qou: 654 of 1,309 lean.refs (50%) resolve into the compiled library; 833 chapter-dir .lean siblings declare names absent from any lake target; 582 blocks' lean.ref resolves only to an uncompiled sibling. The paper adapter's no-orphan-lean is satisfied by all of them. Proposed: resolve each lean.ref against the declarations of the lake targets CI builds; report built / sibling-only / dangling.


## Summary of Changes

Closed 2026-10-10 by the bean-backlog drain (lane C) on evidence, checked against `litlfred/cat-harness-tools` @ `80e46e7` and `litlfred/cat-harness` (shallow main clones). Nothing was changed in this repository.

The proposal ships as a QA criterion. A lean.ref is resolved against the Lake
targets that CI builds, not only against a sibling file:
- `lake-target-lean-resolution` is declared at `cat-harness/schemas/kg-qa.ts:1658`.
- `cat-harness-tools/scripts/check-lake-targets.ts` classifies each lean.ref as
  `built`, `sibling_only`, `dangling` or `unknown`. `unknown` follows the
  third-state rule: missing or unreadable Lake config is never a false built.
- `kg-audit.ts:2474` runs it.
- `scripts/tests/lake-target-lean-resolution.test.ts` tests it.
