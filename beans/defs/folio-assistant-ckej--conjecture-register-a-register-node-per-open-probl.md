---
# folio-assistant-ckej
title: 'CONJECTURE REGISTER: a register node per open problem, and a formal|identification field on conjecture() (folio-assistant-sci)'
status: todo
type: feature
priority: normal
created_at: 2026-10-04T15:10:08Z
updated_at: 2026-10-04T15:10:08Z
parent: folio-assistant-0lmb
---

Recorded from the qou work-plan analysis, 2026-10-04 (session https://claude.ai/code/session_01NdDGeP1SyShmoUssLuRZ91). Not started: recorded so the gap has an owner. ConjectureBlock carries only an optional lean field. Proposed: a conjectures graph kind (holds: state) under the paper adapter, status lifecycle as DMN, source block, Lean stub, critical-path theorems that assume it (lean-formal-graph reverse edges), attempts from work-traceability; and a field distinguishing a formal conjecture from an identification (a numerical/structural match awaiting proof).


## Owner decision

Asked 2026-10-10 by the bean-backlog drain (lane C). The conjecture register is math content: `ConjectureBlock` (cat-harness `schemas/types.ts`) is used only by the sci instance. folio-assistant-sci has no bean store yet, so option 1 means creating one or using cat-harness-tools'. None of it lives in
folio-assistant-core, and AGENTS.md's one rule ("core owns content vocabulary;
the harness owns the harness") puts it outside this store's reach.

1. **(Recommended) Rehome to `litlfred/folio-assistant-sci`'s bean store.** The bean is re-created
   there with this body, and this copy is scrapped with a pointer to the new id.
2. Keep it here as a pointer, and do the work from this store against `litlfred/folio-assistant-sci`.
3. Scrap it. The finding no longer matters after the separation.

**Default if no answer:** option 1.
