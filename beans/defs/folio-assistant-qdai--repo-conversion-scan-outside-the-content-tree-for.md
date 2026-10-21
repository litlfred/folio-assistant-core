---
# folio-assistant-qdai
title: 'repo-conversion: scan OUTSIDE the content tree for math (docs/, .lean/.py under docs/audits, .tex-only tables and macros)'
status: completed
type: feature
priority: normal
created_at: 2026-10-04T15:52:14Z
updated_at: 2026-10-10T15:45:55Z
parent: folio-assistant-slw1
---

Recorded from the qou orphaned-content census, 2026-10-04 (ORPH report; session https://claude.ai/code/session_01NdDGeP1SyShmoUssLuRZ91, issue #2106). qou: 30 docs/audits/*.lean (several are refutations of paper claims, e.g. skein-mass-relation-is-false), 68 docs/audits/*.py computations and 272 derivation notes live outside folio/ and are linked by no block. A conversion that carries only the content tree drops the evidence that some claims are false. The repo-conversion skill should classify these as candidates, read-only, like the rest of its scan.


## Summary of Changes

Closed 2026-10-10 by the bean-backlog drain (lane C) on evidence. The scan
ships in `litlfred/cat-harness-tools`, where the repo-conversion scanner lives
after the separation (checked at `80e46e7`). Nothing was changed in this
repository.

- `scripts/scan-repo-content.ts` (module doc § "Outside-content mathematical
  evidence & refutations (folio-assistant-qdai)"): `scanMathCandidates`
  classifies files outside the content tree as read-only candidates:
  - formal proofs (`.lean/.v/.thy`)
  - computations (`.py/.sage/.ipynb`)
  - derivation notes
  - audit refutations (e.g. `docs/audits/skein-mass-relation-is-false.lean`)
  
  Each candidate carries a link status. `scanRepo` returns them as
  `mathCandidates`, and `formatScan` reports them with an unlinked count.
- `scripts/tests/repo-conversion-math-scan.test.ts` covers the classification
  with unit tests and runs a git-fixture scan.

Not re-run here: the qou census itself (qou is a separate private repo).
