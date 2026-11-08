---
# folio-core-knsj
title: 'Content split: re-add diff in core after cat-harness drops it'
status: todo
type: task
created_at: 2026-11-08T09:15:25Z
updated_at: 2026-11-08T09:15:25Z
---

Content split step 3, the `diff` half. cat-harness#1136 removes `diff` (and its `/diff` command and the session-coordinator binding) from cat-harness. This bean re-adds them in core's `content-lifecycle-ext` once that PR is merged and re-pinned.

Why a follow-up: adding `diff` here while cat-harness still declared it made the composed checkout declare it twice, and `skill:commands`, `uml:overview` and `skills:docs` failed on folio-assistant-core#676. The content is `skills/content/content-lifecycle-ext/diff.md` and `.claude/commands/diff.md` as committed in core `8917d63`.

- [ ] cat-harness#1136 merged and re-pinned
- [ ] core: `diff.md`, `.claude/commands/diff.md`, manifest entry, session-coordinator extension
- [ ] `skill:commands:check` green
