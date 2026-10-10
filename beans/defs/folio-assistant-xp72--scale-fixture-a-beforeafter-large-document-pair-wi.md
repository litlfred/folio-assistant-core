---
# folio-assistant-xp72
title: 'SCALE FIXTURE: a before/after large-document pair with a golden ChangeSet and a measured performance budget'
status: todo
type: task
priority: normal
created_at: 2026-09-22T21:02:55Z
updated_at: 2026-10-10T16:01:16Z
parent: folio-assistant-q4jm
blocked_by:
    - folio-assistant-jwox
---

**Why.** Every child can pass on a ten-block fixture and fall over on a real
handbook. Performance, the heat map's legibility at 2,000 cells and the
navigation's usefulness can only be judged at scale.

**Candidates, measured 2026-09-22:**
- `smart-immunizations/`: 748 artefacts indexed, 200 materialised. It is
  **provisional** (nsbb may remove it) and deliberately renders no HTML, so it
  can only feed the structural renderer (child 05, case 4).
- An L1 handbook ingested through child 03. This is the real target, and it
  depends on that child.
- lx2s's "immunization-schedule before/after committee" scenario is the
  end-to-end story to walk.

**What.** One committed fixture pair (a before and an after with a known
ChangeSet: an insert, a move, a rename, an edit and a removal), plus a
performance budget. Proposed budget: the review page is interactive in under
2 s for 2,000 blocks on the CI runner. That number is a proposal to be
measured, not a fact.

## Done when
- [ ] the fixture is committed, with its expected ChangeSet as a golden file
- [ ] the budget is measured and recorded, then enforced in the browser gate
- [ ] the lx2s committee scenario has been walked through the review page, with screenshots on the PR


## Roast correction 2026-09-22 (epic q4jm, R7)

There is no in-repo folio to borrow: `folio-assistant-core/folios/` is a README, and smart-immunizations renders no HTML. The fixture is **synthetic**, or comes from xtpc's ingest.


## 2026-10-10: fixture and golden ChangeSet committed; budget and walk still open (bean-backlog drain, lane C)

**Done-when 1 is done.**
- `scripts/test-fixtures/scale-pair.ts` is a deterministic generator for a
  synthetic folio of 10 chapters × 10 sections × 20 blocks = **2,000 blocks**,
  with no clock and no randomness. It writes the folio before and after an
  edit script, run once or twice per chapter, covering every ChangeSet
  reading: insert (moves nothing), remove, cross-section move, declared
  rename, reword, manifest edit, and one block that is renamed + reworded +
  moved at once. The generator is committed instead of 8,000 output files.
- `scripts/test-fixtures/scale-pair.changeset.json` is the golden ChangeSet.
- `schemas/changeset-scale.test.ts` checks the ChangeSet twice: against
  `EXPECTED`, counted by hand from the edit script (so the golden file cannot
  merely confirm itself), and against the golden file. Use
  `UPDATE_GOLDEN=1` to regenerate it.

Counts: 20 added, 20 removed, 60 changed, 1,920 unchanged; aspects renamed
20, prose 30, manifest 10, moved 20. They matched the hand count on the first
run.

**Measured:** `computeChangeSet` over the 2,000-block pair takes **550–713 ms**
in this container (3 runs). It is logged, not gated. It is the one number
below the page budget, and it leaves most of the proposed 2 s for the page.

**Still open, so the bean stays `todo`:**
- Done-when 2: measure the review page's time-to-interactive at 2,000 blocks
  and enforce it in the browser gate. The page and the gate are harness code
  (cat-harness-tools `gen-review-page`, Playwright). The fixture is ready to
  feed them.
- Done-when 3: walk the lx2s committee scenario through the review page, with
  screenshots on the PR.
