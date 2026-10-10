---
# folio-assistant-kx6i
title: 'PAPER SITE in the harness rendering (yj32): math, Lean links and notation macros, blocking qou''s legacy-render retirement'
status: todo
type: feature
priority: normal
tags:
    - rehomed
created_at: 2026-10-04T15:10:09Z
updated_at: 2026-10-10T16:34:20Z
parent: folio-assistant-yj32
---

Recorded from the qou work-plan analysis, 2026-10-04 (session https://claude.ai/code/session_01NdDGeP1SyShmoUssLuRZ91). Not started: recorded so the gap has an owner. qou cannot retire its legacy renderer until the harness-as-interface rendering handles a paper: KaTeX/MathJax with the folio's notation macros, block -> Lean declaration links, and the paper's block kinds.


## Owner decision

Asked 2026-10-10 by the bean-backlog drain (lane C). The paper site is rendered by the harness's rendering in cat-harness-tools; folio-assistant-sci consumes it. Nothing cites this bean yet. None of it lives in
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
it changes: **`litlfred/cat-harness-tools` bean `cat-tools-og5t`** (cat-harness-tools
PR #68). Work it there. This copy stays open as a pointer, and closes when
`cat-tools-og5t` does.
