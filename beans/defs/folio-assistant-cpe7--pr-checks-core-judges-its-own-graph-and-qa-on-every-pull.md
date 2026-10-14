---
# folio-assistant-cpe7
title: 'PR CHECKS: core judges its own graph and QA on every pull request'
status: in-progress
type: feature
priority: high
created_at: 2026-10-14T16:35:00Z
updated_at: 2026-10-14T16:35:00Z
---

Owner, 2026-10-14: core "should at least be checking the consistency of its own graph using the cat harness tools, if not also adding its own specific QA". Measured that day: `.github/workflows/` held `release-npm.yml` only, so folio-assistant-core#80 (260 imports rewritten) merged on local evidence alone, with no check on the pull request. cat-harness has the same gap (`post-merge-regen.yml`, `release-npm.yml` only).

## Done when
- [ ] `pr-checks.yml` runs on every pull request: typecheck; the test suite on main and on the PR, failing only on new failures; and the gates, likewise
- [ ] the gates are the harness's graph checks over this instance (kg-audit, check-tools, kg-export, import-direction, declaration-resolution) and core's own QA (every `check:*` / `*:check` in `checkoutScripts`), derived in `.github/scripts/run-gates.py`
- [ ] one green run on a pull request, with the step summary listing what is red on main
- [ ] the same for cat-harness (its own bean or this one's follow-up)
