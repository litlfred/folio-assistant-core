---
# folio-assistant-hf2q
title: 'PROGRAMME PROGRESS: an epic burn-down and a math-progress heat map as a board feed'
status: todo
type: feature
priority: normal
tags:
    - rehomed
created_at: 2026-10-04T15:10:08Z
updated_at: 2026-10-10T16:34:20Z
parent: folio-assistant-6lb8
---

Recorded from the qou work-plan analysis, 2026-10-04 (session https://claude.ai/code/session_01NdDGeP1SyShmoUssLuRZ91). Not started: recorded so the gap has an owner. milestone-status.ts rolls up milestones; nothing draws an epic over time or chapter x {proved, sorry, axiom, conjecture open, active bean, verdict}. Depends on WORK TRACEABILITY and CONJECTURE REGISTER. Must follow board-diagram-interchange (folio -> board, never back) and say 'no data is not zero'.


## Owner decision

Asked 2026-10-10 by the bean-backlog drain (lane C). The burn-down and heat-map feed belong to `scripts/milestone-status.ts` and the board generators in cat-harness-tools. It also depends on `ckej`. None of it lives in
folio-assistant-core, and AGENTS.md's one rule ("core owns content vocabulary;
the harness owns the harness") puts it outside this store's reach.

1. **(Recommended) Rehome to `litlfred/cat-harness-tools`'s bean store.** The bean is re-created
   there with this body, and this copy is scrapped with a pointer to the new id.
2. Keep it here as a pointer, and do the work from this store against `litlfred/cat-harness-tools`.
3. Scrap it. The finding no longer matters after the separation.

**Default if no answer:** option 1.


## Rehomed 2026-10-10: this copy is now a pointer

By the owner's ruling of 2026-10-10 (move to the code's repo, and keep a
pointer here), this bean is re-filed in the store of the repository whose code
it changes: **`litlfred/cat-harness-tools` bean `cat-tools-tk99`** (cat-harness-tools
PR #68). Work it there. This copy stays open as a pointer, and closes when
`cat-tools-tk99` does.
